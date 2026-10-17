const webpush = require('web-push');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:mail@qraivy.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function sendWebPush(subscription, payload) {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { ok: true };
  } catch(e) {
    console.error('[WebPush] Failed:', e.statusCode || '', e.message);
    // statusCode 404/410: the browser dropped this address (webPushPages marks it expired)
    return { ok: false, error: e.message, statusCode: e.statusCode };
  }
}

module.exports = { sendWebPush };