const https = require('https');
const crypto = require('crypto');

function generateJWT() {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyP8 = Buffer.from(process.env.APNS_KEY_P8_BASE64 || '', 'base64').toString('utf8');

  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) })).toString('base64url');

  const sign = crypto.createSign('SHA256');
  sign.update(header + '.' + payload);
  const signature = sign.sign({ key: keyP8, dsaEncoding: 'ieee-p1363' }).toString('base64url');

  return header + '.' + payload + '.' + signature;
}

const http2 = require('http2');

// ============================================================
// APPLE PUSH NOTIFICATION SERVICE (APNs)
// Sends silent push to Wallet to trigger pass update fetch
// Apple docs: https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
// ============================================================

const APNS_HOST_PROD = 'api.push.apple.com';
const APNS_HOST_DEV  = 'api.development.push.apple.com';
const APNS_PORT = 443;

// ─── Push update to multiple devices ─────────────────────────
async function pushUpdateToDevices(devices) {
  const results = { success: 0, failed: 0, errors: [] };

  const promises = devices.map(async (device) => {
    try {
      await sendPushNotification(device.pushToken);
      results.success++;
    } catch (err) {
      results.failed++;
      results.errors.push({ token: device.pushToken, error: err.message });
      console.error(`APNs push failed for token ${device.pushToken}:`, err.message);
    }
  });

  await Promise.allSettled(promises);
  return results;
}

// ─── Send single APNs push ────────────────────────────────────
async function sendPushNotification(pushToken) {
  return new Promise((resolve, reject) => {
    // APNs Wallet push payload is empty — Apple just pings the device
    // to call your /wallet/v1/passes/:passTypeId/:serialNumber endpoint
    const payload = JSON.stringify({});
    const host = process.env.NODE_ENV === 'production' ? APNS_HOST_PROD : APNS_HOST_DEV;

    const jwt = generateJWT();
    const options = {
      hostname: host,
      port: APNS_PORT,
      path: `/3/device/${pushToken}`,
      method: 'POST',
      headers: {
        'apns-topic': process.env.APPLE_PASS_TYPE_ID || 'pass.com.qraivy.wallet',
        'apns-push-type': 'background',
        'apns-priority': '5',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
        'authorization': `bearer ${jwt}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve({ statusCode: 200 });
        } else {
          reject(new Error(`APNs returned ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = { pushUpdateToDevices, sendPushNotification };
