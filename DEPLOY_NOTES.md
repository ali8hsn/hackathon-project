# Siren — Deploy Notes

**Deployed:** Sunday April 19, 2026 (MLH Hackathon demo day)  
**Live URL:** https://3-225-183-122.sslip.io  
**Status:** ✅ Running

---

## Infrastructure

| Resource | Value |
|---|---|
| **Instance ID** | `i-08573aec0c93b69a6` |
| **Region / AZ** | `us-east-1` / `us-east-1a` |
| **Instance type** | `t3.small` |
| **AMI** | `ami-05e86b3611c60b0b4` (Ubuntu 22.04 LTS) |
| **Elastic IP** | `3.225.183.122` |
| **EIP Allocation ID** | `eipalloc-0d92bdea7e0536a75` |
| **Security Group** | `sg-0afefd751b50b5539` (siren-sg) — ports 22, 80, 443 |
| **VPC** | `vpc-0d6a224fa34c9ab5b` (default) |
| **Disk** | 20 GB gp3 |
| **SSH key** | `~/.ssh/siren-deploy.pem` (keypair: `siren-deploy`) |

## Domain

- **DNS:** `3-225-183-122.sslip.io` via [sslip.io](https://sslip.io) — free wildcard DNS, no purchase needed
- **TLS:** Let's Encrypt certificate (expires 2026-07-18, auto-renews via certbot systemd timer)
- **HTTP → HTTPS redirect:** enabled

## Application

| | |
|---|---|
| **App path** | `/opt/siren/app` |
| **Process manager** | PM2 (process name: `siren`) |
| **Process user** | `siren` (system user, no login shell) |
| **Port** | `3000` (internal, proxied by Nginx) |
| **WebSocket path** | `wss://3-225-183-122.sslip.io/ws-aria` |
| **Voice intake** | `https://3-225-183-122.sslip.io/intake` |
| **PM2 startup** | `pm2-siren.service` (systemd) |

## Secrets

All secrets live in `/etc/siren/siren.env` on the instance.  
Permissions: `root:siren` / mode `640`. Symlinked to `/opt/siren/app/.env`.

| Variable | Owner | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Ali Hussain | Claude AI for incident triage |
| `MONGODB_URI` | Haashir (Atlas cluster: `haashcluster`) | Free M0 Atlas cluster |
| `MONGODB_DB_NAME` | — | `sentinel` |
| `ELEVENLABS_API_KEY` | Ali Hussain | Voice synthesis for intake |
| `TWILIO_ACCOUNT_SID` | — | Not configured — Twilio webhooks are manual (see below) |
| `TWILIO_AUTH_TOKEN` | — | Not configured |
| `PORT` | — | `3000` |
| `NODE_ENV` | — | `production` |

## PM2 Logs (at deploy time)

```
0|siren | ╔══════════════════════════════════════════════════════╗
0|siren | ║  Siren — voice intake + dispatch intelligence        ║
0|siren | ║  http://localhost:3000                               ║
0|siren | ║    • Situations & tools: /                           ║
0|siren | ║    • Voice intake:       /intake                     ║
0|siren | ║  Whisper (optional): no                              ║
0|siren | ╚══════════════════════════════════════════════════════╝
0|siren | [WS] Client connected
0|siren | [WS] Client disconnected
```

## Smoke Test Results

| Test | Result |
|---|---|
| `GET https://3-225-183-122.sslip.io` | ✅ HTTP 200 |
| `GET https://3-225-183-122.sslip.io/api/incidents` | ✅ JSON array of incidents |
| `GET http://3-225-183-122.sslip.io` | ✅ HTTP 301 → HTTPS |
| WebSocket `wss://3-225-183-122.sslip.io/ws-aria` | ✅ Connected (PM2 log confirmed) |

## Still Manual

1. **Twilio webhooks** — `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are empty. To enable phone intake:
   - Add keys to `/etc/siren/siren.env` on the instance
   - Set Twilio voice webhook URL to `https://3-225-183-122.sslip.io/api/twilio/voice`
   - Set Twilio status callback to `https://3-225-183-122.sslip.io/api/twilio/status`
   - Restart: `pm2 restart siren`

2. **MongoDB Atlas IP whitelist** — EC2 Elastic IP `3.225.183.122` must be in Atlas → Network Access allowlist. (Already working at deploy time — incidents API returns data.)

3. **PM2 startup service** — `pm2-siren.service` is configured but had a minor issue starting via systemd on first boot. PM2 is running and process is saved (`pm2 save`). If instance reboots, run:
   ```bash
   ssh -i ~/.ssh/siren-deploy.pem ubuntu@3.225.183.122
   sudo -u siren pm2 resurrect
   ```

## SSH Access

```bash
ssh -i ~/.ssh/siren-deploy.pem ubuntu@3.225.183.122
```

## Hackathon Note

This account (`WSParticipantRole`, account `167693545309`) will be torn down after the event. The Elastic IP, instance, and all resources will be deleted. Export any data from MongoDB Atlas before then.
