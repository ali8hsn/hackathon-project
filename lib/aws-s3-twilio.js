/**
 * Optional: upload Twilio <Play> MP3 to S3 and return a presigned HTTPS URL.
 * Uses default AWS credential chain: env (AWS_ACCESS_KEY_ID, etc.), ECS/EC2 role, etc.
 */
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

function region() {
  return (process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1').trim();
}

function bucket() {
  return (process.env.AWS_S3_TWILIO_BUCKET || process.env.SIREN_AWS_S3_BUCKET || '').trim();
}

function keyPrefix() {
  return (process.env.AWS_S3_PREFIX || 'twilio-audio').replace(/^\/+|\/+$/g, '');
}

function s3Client() {
  return new S3Client({ region: region() });
}

/**
 * @param {Buffer} body
 * @param {string} objectKey e.g. twilio-audio/uuid.mp3
 * @returns {Promise<string>} presigned GET URL (Twilio can fetch this)
 */
async function uploadMp3PresignedUrl(body, objectKey) {
  const Bucket = bucket();
  if (!Bucket) return null;

  const client = s3Client();
  await client.send(
    new PutObjectCommand({
      Bucket,
      Key: objectKey,
      Body: body,
      ContentType: 'audio/mpeg',
      CacheControl: 'max-age=3600'
    })
  );

  const cmd = new GetObjectCommand({ Bucket, Key: objectKey });
  return getSignedUrl(client, cmd, { expiresIn: Number(process.env.AWS_S3_PRESIGN_SECONDS || 3600) });
}

function isS3Configured() {
  return !!bucket();
}

module.exports = { uploadMp3PresignedUrl, isS3Configured, keyPrefix, region, bucket };
