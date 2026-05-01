function decideRedirectUrl(qr, context) {
  const userAgent = (context.userAgent || '').toLowerCase();

  const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(userAgent);

  let targetUrl = qr.originalUrl;

  if (isMobile) {
    const separator = targetUrl.includes('?') ? '&' : '?';
    targetUrl = `${targetUrl}${separator}mobile=true`;
  }

  return targetUrl;
}

module.exports = { decideRedirectUrl };
