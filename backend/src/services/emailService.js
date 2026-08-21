const { Resend } = require('resend');
const { PUBLIC_APP_ORIGIN } = require('../config/urls');
const { signUnsubscribeToken } = require('../utils/unsubscribeToken');
const { signDoubleOptInToken } = require('../utils/doubleOptInToken');
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@mail.qraivy.com';
function getFrom(bizName) { return (bizName ? bizName + ' <' + FROM_EMAIL + '>' : FROM_EMAIL); }

// Double Opt-In Phase B1 (2026-08-12). Sent the moment a Subscriber enters
// 'pending' (new signup, resend-while-pending, or re-subscribe-after-
// unsubscribe) — never sent for an already-active subscriber. EN/DE only,
// matching the existing landing-page language convention (page.sections.
// language), not a query param.
async function sendDoubleOptInEmail(email, { bizName, slug, subscriberId, lang }) {
  const isDE = lang === 'de';
  const { token, expiresAt } = signDoubleOptInToken(subscriberId, slug);
  const confirmUrl = `${PUBLIC_APP_ORIGIN}/lp/confirm-email/${slug}/${subscriberId}?t=${token}&exp=${expiresAt}&lang=${isDE ? 'de' : 'en'}`;
  const subject = isDE ? `Bitte bestätige deine Anmeldung bei ${bizName}` : `Please confirm your subscription to ${bizName}`;
  const heading = isDE ? 'Fast geschafft!' : 'Almost there!';
  const body = isDE
    ? `Bitte bestätige, dass du Marketing-E-Mails von ${bizName} erhalten möchtest.`
    : `Please confirm you'd like to receive marketing emails from ${bizName}.`;
  const cta = isDE ? 'Anmeldung bestätigen' : 'Confirm subscription';
  const ignore = isDE
    ? 'Falls du das nicht warst, kannst du diese E-Mail einfach ignorieren.'
    : "If this wasn't you, you can safely ignore this email.";
  try {
    await resend.emails.send({
      from: getFrom(bizName),
      to: email,
      subject,
      html: `<!DOCTYPE html>
<html lang="${isDE ? 'de' : 'en'}">
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;margin-top:20px;">
    <div style="background:#ff5a1f;padding:24px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:22px;">${bizName}</h1>
    </div>
    <div style="padding:32px;text-align:center;">
      <h2 style="color:#1a1a1a;margin:0 0 16px;">${heading}</h2>
      <p style="color:#444;font-size:16px;line-height:1.6;margin:0 0 24px;">${body}</p>
      <a href="${confirmUrl}" style="display:inline-block;background:#ff5a1f;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;">${cta}</a>
    </div>
    <div style="background:#f9f9f9;padding:16px;text-align:center;font-size:12px;color:#999;">
      ${ignore}
    </div>
  </div>
</body>
</html>`
    });
    return { ok: true };
  } catch(e) {
    console.error('[Email] Double opt-in email failed:', e.message);
    return { ok: false, error: e.message };
  }
}

async function sendWelcomeEmail(email, { bizName, slug }) {
  const lpUrl = PUBLIC_APP_ORIGIN + '/lp/' + slug;
  try {
    await resend.emails.send({
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
  const lpUrl = PUBLIC_APP_ORIGIN + '/lp/' + slug;
  for (const sub of subscribers) {
    if (!sub.email) continue;
    try {
      // Recipient-specific, tamper-resistant unsubscribe link. The token
      // binds sub.id + slug + a dedicated purpose string (see
      // unsubscribeToken.js) — a recipient can only unsubscribe their own
      // record for this exact business, not anyone else's, and the link
      // never carries a plaintext email address.
      const unsubToken = signUnsubscribeToken(sub.id, slug);
      const unsubUrl = `${PUBLIC_APP_ORIGIN}/lp/unsubscribe/${slug}/${sub.id}?t=${unsubToken}`;
      await resend.emails.send({
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
      <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a>
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

module.exports = { sendCampaignEmail, sendWelcomeEmail, sendDoubleOptInEmail };