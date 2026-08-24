// Constructed lazily, on first real use, not at module load -- so simply
// requiring this file (e.g. transitively, via managerRoutes.js) never
// depends on RESEND_API_KEY being set. The Resend client throws at
// construction time if its key is missing, which previously broke any test
// file that required this module transitively without an API key or a
// mock -- same reasoning as clerkEmailSync.js's lazy getClerkClient().
let resend = null;
function getResendClient() {
  if (!resend) {
    const { Resend } = require('resend');
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@mail.qraivy.com';
function getFrom(bizName) { return (bizName ? bizName + ' <' + FROM_EMAIL + '>' : FROM_EMAIL); }

async function sendWelcomeEmail(email, { bizName, slug }) {
  const lpUrl = 'https://api.qraivy.com/lp/' + slug;
  try {
    await getResendClient().emails.send({
      from: getFrom(bizName),
      to: email,
      subject: `Welcome to ${bizName}!`,
      html: `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;margin-top:20px;">
    <div style="background:#ff5a1f;padding:24px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:22px;">${bizName}</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#1a1a1a;margin:0 0 16px;">You're in! 🎉</h2>
      <p style="color:#444;font-size:16px;line-height:1.6;margin:0 0 24px;">Thanks for subscribing to updates from ${bizName}. You'll be the first to hear about news, offers and updates.</p>
      <a href="${lpUrl}" style="display:inline-block;background:#ff5a1f;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Visit Page →</a>
    </div>
    <div style="background:#f9f9f9;padding:16px;text-align:center;font-size:12px;color:#999;">
      You received this because you subscribed to ${bizName} via Qraivy.
    </div>
  </div>
</body>
</html>`
    });
    return { ok: true };
  } catch(e) {
    console.error('[Email] Welcome email failed:', e.message);
    return { ok: false, error: e.message };
  }
}

async function sendCampaignEmail(subscribers, { title, message, linkUrl, bizName, slug }) {
  const results = { success: 0, failed: 0, errors: [] };
  const lpUrl = 'https://api.qraivy.com/lp/' + slug;
  for (const sub of subscribers) {
    if (!sub.email) continue;
    try {
      await getResendClient().emails.send({
        from: getFrom(bizName),
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

// Phase 3B Step 3B — StadtPocket City Manager business-onboarding invite.
// claimUrl is the ONLY place the raw claim token appears -- it is passed in
// by the caller (cityBusinessInviteService's create/resend already return
// the raw token in-process, never persisted) and is never logged here.
async function sendBusinessInviteEmail(email, { businessName, cityName, claimUrl }) {
  try {
    await getResendClient().emails.send({
      from: getFrom('QRAIVY'),
      to: email,
      subject: `${businessName} has been invited to join StadtPocket ${cityName}`,
      html: `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;margin-top:20px;">
    <div style="background:#ff5a1f;padding:24px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:22px;">QRAIVY</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#1a1a1a;margin:0 0 16px;">${businessName} has been invited to join StadtPocket ${cityName}</h2>
      <p style="color:#444;font-size:16px;line-height:1.6;margin:0 0 24px;">A StadtPocket city manager has invited <strong>${businessName}</strong> to join StadtPocket ${cityName} through QRAIVY. Accept the invitation to create and claim your own QRAIVY Business account — you'll be the owner, with full control.</p>
      <a href="${claimUrl}" style="display:inline-block;background:#ff5a1f;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Accept Invitation</a>
      <p style="color:#999;font-size:12px;line-height:1.6;margin:24px 0 0;">If you weren't expecting this, you can safely ignore this email.</p>
    </div>
    <div style="background:#f9f9f9;padding:16px;text-align:center;font-size:12px;color:#999;">
      Sent by QRAIVY on behalf of StadtPocket ${cityName}.
    </div>
  </div>
</body>
</html>`
    });
    return { ok: true };
  } catch(e) {
    console.error('[Email] Business invite email failed:', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { sendCampaignEmail, sendWelcomeEmail, sendBusinessInviteEmail };