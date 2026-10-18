// platformAdmin.js — is an already verified Clerk user a platform admin?
//
// The rule of middleware/adminMiddleware.js requireAdmin (Clerk
// publicMetadata.role === 'admin'), for handlers that hold a verified user id
// and only need the answer. Any failure to look the user up counts as "no".
// The Clerk client is created on first use, so loading this file needs nothing.

const { createClerkClient } = require('@clerk/backend');

let clerk = null;

async function isPlatformAdmin(userId) {
  if (typeof userId !== 'string' || !userId) return false;
  try {
    clerk = clerk || createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const user = await clerk.users.getUser(userId);
    return ((user && user.publicMetadata) || {}).role === 'admin';
  } catch (_) {
    return false;
  }
}

// Same structured format as adminMiddleware's security log, so Railway log
// searches for '[SECURITY]' find these too.
function logSecurityEvent(event, req, extra) {
  console.warn('[SECURITY]', JSON.stringify(Object.assign({
    timestamp: new Date().toISOString(),
    event,
    route: req.method + ' ' + req.originalUrl,
    ip: req.ip || 'unknown',
  }, extra)));
}

module.exports = { isPlatformAdmin, logSecurityEvent };
