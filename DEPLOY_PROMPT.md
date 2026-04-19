# Claude Code Prompt — Deploy Siren to AWS + GoDaddy

> Paste this entire file into Claude Code (`claude --dangerously-skip-permissions`)
> at the root of the `siren-dispatch` repo. Claude Code will take it from here.

---

## Project

**Siren** — a unified 911 voice intake + AI dispatcher console built with
Next.js 16, a custom Node `server.js` (Express + WebSockets), and MongoDB.
See `README.md` for architecture. The repo you're in is already the
production code. Your job: stand it up on AWS behind a GoDaddy domain with
HTTPS, and hand me back a live URL **before the MLH demo today**.

## Context (IMPORTANT)

- This is a **hackathon workshop AWS account** (role `WSParticipantRole`),
  not a personal account. It has temporary credentials (access key +
  secret + session token), refreshed every 1–4 hours. Account will be
  torn down after the hackathon — that is **acceptable**, Ali only needs
  the site live for demo day (today).
- Ali **cannot** create IAM users or view Billing in this account. Don't
  try. Also skip anything involving Route53 hosted zones — we're using
  GoDaddy DNS.
- You will have `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and
  `AWS_SESSION_TOKEN` exported in the shell before Ali launches you.
  Confirm with `aws sts get-caller-identity` as your first command. If
  the token has expired, tell Ali to grab fresh creds from the AWS
  console ("Command line or programmatic access" in the top-right
  dropdown) and restart you.

## Non-negotiables

- **Hosting model:** single AWS EC2 `t3.small` in `us-east-1`, Ubuntu 22.04 LTS.
  Node 20 + Nginx + PM2 + Certbot. No Amplify. No ECS. No load balancer.
- **Domain:** use `siren.ink` (already purchased).
- **WebSockets must work.** The homepage and intake both rely on WSS.
  Nginx config MUST set `Upgrade` / `Connection: upgrade` and
  `proxy_read_timeout 3600s`.
- **Every secret lives in `/etc/siren/siren.env` on the instance**, owned
  `root:siren`, mode `640`. Never commit secrets.
- **TLS via Let's Encrypt.** HTTP (80) redirects to HTTPS (443).
- **PM2 boots on reboot** via `pm2 startup` + `pm2 save`.

## What you have

- AWS: temp creds already in the environment (see Context above). Region:
  `us-east-1`. SSH keypair: create one named `siren-deploy` if none
  exists — store the .pem in `~/.ssh/siren-deploy.pem` on Ali's Mac.
  **Do not try to create IAM users or attach policies — you don't have
  permission and it's not needed.**
- GoDaddy: Ali will log in himself and run the checkout (we can't automate
  GoDaddy without an API key — their public API is limited and requires
  manual enrollment). You'll give him the exact checkout steps.
- MongoDB: use **MongoDB Atlas free tier** (`M0`). If Ali already has a
  `MONGODB_URI`, use it; otherwise walk him through creating the Atlas
  cluster and whitelist the EC2 Elastic IP.
- Anthropic key: already in Ali's possession. Ask him to paste it when you
  need to write `/etc/siren/siren.env`.
- **Tear-down note:** don't bother with `pm2 startup` systemd enrollment
  past the minimum needed to survive a reboot — account dies after the
  event anyway.

## Step-by-step plan

### 1. Domain availability check (no purchase yet)

```bash
# Install whois if missing (macOS: brew install whois; linux: apt install whois)
for tld in help ai live dev com io; do
  printf "siren.%s: " "$tld"
  whois "siren.$tld" | grep -iE "no match|not found|available|no entries" >/dev/null \
    && echo "✅ AVAILABLE" || echo "❌ taken"
done
```

Print the result, ask Ali which TLD to go with, then stop and wait for his
answer. **Do not** try to buy the domain yourself.

### 2. Give Ali GoDaddy purchase instructions

The domain `siren.ink` is already registered. Ali will set up the DNS records.

### 3. AWS: provision EC2

Use the AWS CLI (`aws configure` if not already set). All commands use
`us-east-1`.

```bash
# 3a. Create keypair (skip if exists)
aws ec2 create-key-pair --key-name siren-deploy \
  --query 'KeyMaterial' --output text > ~/.ssh/siren-deploy.pem
chmod 400 ~/.ssh/siren-deploy.pem

# 3b. Find latest Ubuntu 22.04 AMI
AMI=$(aws ec2 describe-images \
  --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
            "Name=state,Values=available" \
  --query 'reverse(sort_by(Images,&CreationDate))[:1].ImageId' --output text)

# 3c. Default VPC + subnet
VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true \
  --query 'Vpcs[0].VpcId' --output text)
SUBNET=$(aws ec2 describe-subnets --filters Name=vpc-id,Values=$VPC \
  --query 'Subnets[0].SubnetId' --output text)

# 3d. Security group
SG=$(aws ec2 create-security-group --group-name siren-sg \
  --description "Siren public web" --vpc-id $VPC --query GroupId --output text)
for port in 22 80 443; do
  aws ec2 authorize-security-group-ingress --group-id $SG \
    --protocol tcp --port $port --cidr 0.0.0.0/0
done

# 3e. Launch instance with a user-data bootstrap
cat > /tmp/user-data.sh <<'EOF'
#!/bin/bash
set -euxo pipefail
apt-get update
apt-get install -y curl git ufw nginx certbot python3-certbot-nginx jq ffmpeg build-essential
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g pm2
id -u siren &>/dev/null || adduser --system --group --disabled-login --home /opt/siren siren
mkdir -p /etc/siren /var/log/siren /opt/siren
chown -R siren:siren /opt/siren /var/log/siren
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 'Nginx Full'
EOF

INSTANCE=$(aws ec2 run-instances --image-id $AMI --instance-type t3.small \
  --key-name siren-deploy --security-group-ids $SG --subnet-id $SUBNET \
  --associate-public-ip-address \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=20,VolumeType=gp3}' \
  --user-data file:///tmp/user-data.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=siren-prod}]' \
  --query 'Instances[0].InstanceId' --output text)

aws ec2 wait instance-running --instance-ids $INSTANCE

# 3f. Allocate + attach an Elastic IP (we need a stable IP for DNS)
EIP=$(aws ec2 allocate-address --domain vpc --query AllocationId --output text)
aws ec2 associate-address --instance-id $INSTANCE --allocation-id $EIP
PUBLIC_IP=$(aws ec2 describe-addresses --allocation-ids $EIP \
  --query 'Addresses[0].PublicIp' --output text)
echo "Siren is at: $PUBLIC_IP"
```

Print `$PUBLIC_IP` for Ali and hand off to step 4.

### 4. DNS: point GoDaddy at the Elastic IP

Give Ali this instruction:

> Go to **GoDaddy → My Products → siren.ink → DNS**. Add two records and
> remove anything else:
>
> | Type | Host | Value        | TTL   |
> |------|------|--------------|-------|
> | A    | @    | `$PUBLIC_IP` | 600   |
> | A    | www  | `$PUBLIC_IP` | 600   |
>
> Save. Propagation is usually ~5 min. Verify with:
> `dig +short siren.ink @8.8.8.8` until it returns `$PUBLIC_IP`.

Wait for Ali to confirm the dig returns the right IP before moving on.

### 5. Deploy the app on the instance

SSH in and run:

```bash
ssh -i ~/.ssh/siren-deploy.pem ubuntu@$PUBLIC_IP
sudo -i

# Wait for user-data to finish if it hasn't already
cloud-init status --wait

# Check out the repo as the siren user
sudo -u siren bash <<'EOSU'
cd /opt/siren
git clone https://github.com/<Ali's GH org>/siren-dispatch.git app
cd app
npm ci --omit=dev
npm run build
EOSU
```

Ask Ali for the GitHub URL if you don't have it. If the repo is private,
ask him to generate a read-only deploy key and paste it; add it as
`/opt/siren/.ssh/id_ed25519` and tweak the `git clone` to use SSH.

### 6. Secrets

Create `/etc/siren/siren.env` (ask Ali for each value as needed):

```
ANTHROPIC_API_KEY=sk-ant-...
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=siren
PORT=3000
NODE_ENV=production
# optional
ELEVENLABS_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
```

Then:

```bash
chown root:siren /etc/siren/siren.env
chmod 640 /etc/siren/siren.env
ln -sf /etc/siren/siren.env /opt/siren/app/.env
```

### 7. PM2

```bash
sudo -u siren bash <<'EOSU'
cd /opt/siren/app
pm2 start server.js --name siren --env production --log /var/log/siren/app.log
pm2 save
EOSU
# PM2 startup script for the siren user
env PATH=$PATH:/usr/bin pm2 startup systemd -u siren --hp /opt/siren
systemctl enable pm2-siren
systemctl start pm2-siren
```

Verify: `curl -sS http://127.0.0.1:3000/api/incidents` returns JSON
(or a `503 MongoDB not configured` if the DB URI is bad — fix that first).

### 8. Nginx + WebSockets

Write `/etc/nginx/sites-available/siren`:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name siren.ink www.siren.ink;

    # Certbot challenges only; everything else → HTTPS
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name siren.ink www.siren.ink;

    ssl_certificate     /etc/letsencrypt/live/siren.ink/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/siren.ink/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Increase body size for audio uploads from /intake
    client_max_body_size 25m;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # WebSocket upgrade
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection $connection_upgrade;

        # Long-lived WebSocket connections
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

```bash
ln -sf /etc/nginx/sites-available/siren /etc/nginx/sites-enabled/siren
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

### 9. TLS

```bash
certbot --nginx \
  -d siren.ink -d www.siren.ink \
  --agree-tos --email alihsn@utexas.edu --redirect -n
systemctl reload nginx
```

Certbot edits the Nginx config. Re-open it and make sure the WebSocket
`Upgrade`/`Connection` headers are still present in the HTTPS block —
sometimes Certbot overwrites them. Restore from the snippet above if needed.

### 10. Smoke tests

```bash
curl -I https://siren.ink                      # 200 OK
curl -sS https://siren.ink/api/incidents       # JSON or 503
# WebSocket test from another terminal
npx -y wscat -c wss://siren.ink/                # should connect
```

Open the site in a browser, click **Play Demo** on the homepage, confirm:

- Homepage shows the Active Call Queue
- Clicking an incident opens `/situation-sheet/[id]` with the new clean
  report UI
- The WebSocket from `/intake` connects (no mixed-content errors in
  DevTools → Network → WS)

### 11. Report back

Write a `DEPLOY_NOTES.md` in the repo root summarizing:

- Chosen domain + Elastic IP
- Instance ID and region
- `.env` path and who owns each secret
- `pm2 logs siren --lines 50` from the running instance
- Anything that's still manual (e.g., Twilio webhooks)

Commit that file (no secrets) and push.

---

## Guardrails

- Don't run `aws ec2 run-instances` more than once — if the first launch
  fails, check/clean up before retrying. Untagged orphan instances cost
  money.
- Don't open port 27017 (Mongo) publicly. Use Atlas with IP allowlist.
- Don't commit `.env`, `*.pem`, `*.key`, or anything in `.cache/`.
- If Let's Encrypt rate-limits, use `--staging` first to validate the
  Nginx config, then switch to production.
- **Hackathon spend cap:** if deployment exceeds $15 of AWS credits, stop
  and ask Ali.

## If you hit a blocker

Append to `BLOCKERS.md` with:
- what you were trying to do
- the exact command + full error
- what you've already tried
- which human decision you need

Then pause and wait.
