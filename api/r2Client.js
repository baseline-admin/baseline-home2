/* ============================================================
   BASELINE — api/r2Client.js
   Server-only Cloudflare R2 client (S3-compatible API), used to
   presign uploads/views for Pro-tier training videos. Never
   import this from anything served to the browser.
   ============================================================ */
const { S3Client } = require('@aws-sdk/client-s3');

let client = null;

function getR2Client() {
  if (client) return client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId) throw new Error('R2_ACCOUNT_ID is not set');
  if (!accessKeyId) throw new Error('R2_ACCESS_KEY_ID is not set');
  if (!secretAccessKey) throw new Error('R2_SECRET_ACCESS_KEY is not set');
  client = new S3Client({
    region: 'auto', // required literal value for R2, not a real AWS region
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

module.exports = { getR2Client };
