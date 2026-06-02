const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM || 'onboarding@resend.dev';

async function sendCampaignEmail(subscribers, { title, message, linkUrl, bizName, slug }) {
  const results = { success: 0, failed: 0, errors: [] };
  const lpUrl = 'https://api.qraivy.com/lp/' + slug;

  for (const sub of subscribers) {
    if (!sub.email) continue;
    try {
      await resend.emails.send({
        from: FROM,
        to: sub.email,
        subject: title,
        html: `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;margin-top:20px;">
    <div style="background:#ff5a1f;padding:24px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:22px;">${bizName}</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#1a1a1a;margin:0 0 16px;">${title}</h2>
      <p style="color:#444;font-size:16px;line-height:1.6;margin:0 0 24px;">${message}</p>
      ${linkUrl ? '<a href="'+linkUrl+'" style="display:inline-block;background:#ff5a1f;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Learn More</a>' : ''}
      <div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;">
        <a href="${lpUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Visit Page</a>
      </div>
    </div>
    <div style="background:#f9f9f9;padding:16px;text-align:center;font-size:12px;color:#999;">
      You received this because you subscribed to updates from ${bizName}.<br/>
      <a href="https://api.qraivy.com/lp/unsubscribe/${sub.id}" style="color:#999;">Unsubscribe</a>
    </div>
  </div>
</body>
</html>`
      });
      results.success++;
    } catch(e) {
      results.failed++;
      results.errors.push({ email: sub.email, error: e.message });
      console.error('[Email] Failed to send to', sub.email, e.message);
    }
  }
  return results;
}

module.exports = { sendCampaignEmail };
