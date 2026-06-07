const fs = require('fs');
const c = fs.readFileSync('backend/src/controllers/lpController.js', 'utf8');
const marker = '// \u2500\u2500 GET /lp/wallet/apple/:slug \u2014 generate .pkpass for Smart QR LP \u2500\u2500';
const newFunc = `
// \u2500\u2500 GET /lp/card/:slug \u2014 loyalty card download page \u2500\u2500
async function handleLoyaltyCardPage(req, res) {
  try {
    const { slug } = req.params;
    const page = await prisma.landingPage.findUnique({ where: { slug } });
    if (!page) return res.status(404).send('Not found');
    const sections = page.sections ? JSON.parse(page.sections) : {};
    const accent = (sections.theme && sections.theme.accent) || '#FF4E00';
    const bizName = (page.businessName || slug).replace(/\s+[a-z0-9]{3}$/, '').trim();
    const logoUrl = page.logoUrl || '';
    const settings = await prisma.stampSettings.findUnique({ where: { slug } });
    const goal = settings ? settings.goal : 10;
    const rewardName = settings ? settings.rewardName : 'Free item';
    const logoHtml = logoUrl ? '<div class="logo"><img src="' + logoUrl + '" alt="logo"></div>' : '<div class="logo">' + bizName.charAt(0) + '</div>';
    const dots = Array.from({length: goal}, () => '<div class="dot"></div>').join('');
    const html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + bizName + ' Loyalty Card</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0a0a0a;color:#f0ece0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center}.card{background:' + accent + ';border-radius:20px;padding:32px 24px;max-width:340px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.5)}.logo{width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,0.2);margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:800;color:#fff;overflow:hidden}.logo img{width:100%;height:100%;object-fit:cover;border-radius:50%}.biz-name{font-size:1.4rem;font-weight:800;color:#fff;margin-bottom:4px}.reward-sub{font-size:.85rem;color:rgba(255,255,255,0.75);margin-bottom:24px}.dots{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-bottom:24px}.dot{width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.2);border:2px solid rgba(255,255,255,0.4)}.wallet-btn{display:block;background:#000;color:#fff;border-radius:12px;padding:16px 28px;font-size:1rem;font-weight:700;text-decoration:none;width:100%;margin-bottom:12px}.powered{margin-top:20px;font-size:.7rem;color:rgba(255,255,255,0.3)}.powered a{color:rgba(255,255,255,0.4);text-decoration:none}</style></head><body><div class="card">' + logoHtml + '<div class="biz-name">' + bizName + '</div><div class="reward-sub">Collect ' + goal + ' stamps \u2014 get ' + rewardName + '</div><div class="dots">' + dots + '</div><a class="wallet-btn" id="walletBtn" href="/lp/wallet/apple/' + slug + '">\u002B Add to Apple Wallet</a></div><div class="powered">Powered by <a href="https://qraivy.com">Qraivy</a></div><script>document.getElementById("walletBtn").addEventListener("click",function(){setTimeout(function(){window.location.href="/lp/' + slug + '";},3500);});</script></body></html>';
    return res.send(html);
  } catch(e) { console.error('[LoyaltyCard] Error:', e.message); return res.status(500).send('Error'); }
}

`;
const result = c.replace(marker, newFunc + marker);
fs.writeFileSync('backend/src/controllers/lpController.js', result);
console.log('Done - added handleLoyaltyCardPage');
