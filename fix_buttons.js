const fs = require('fs');
let f = fs.readFileSync('frontend/public/dashboard.html', 'utf8');

// Replace the broken button lines with data-attribute approach
const oldCopy = `'<button onclick="window.copyLoyaltyUrl('" + slug + "')" style="flex:1;padding:8px;background:rgba(255,255,255,0.06);border:0.5px solid rgba(255,255,255,0.12);border-radius:8px;color:#f0f4f8;font-size:.7rem;cursor:pointer;">Copy NFC URL</button>'`;
const newCopy = `'<button data-slug="' + slug + '" onclick="window.copyLoyaltyUrl(this.dataset.slug)" style="flex:1;padding:8px;background:rgba(255,255,255,0.06);border:0.5px solid rgba(255,255,255,0.12);border-radius:8px;color:#f0f4f8;font-size:.7rem;cursor:pointer;">Copy NFC URL</button>'`;

const oldRedeem = `'<button id="ly-redeem-'+slug+'" onclick="window.redeemLoyaltyDash('" + slug + "')" style="flex:1;padding:8px;background:rgba(34,197,94,0.15);border:0.5px solid rgba(34,197,94,0.3);border-radius:8px;color:#22c55e;font-size:.7rem;font-weight:700;cursor:pointer;display:none;">🎁 Redeem Reward</button>'`;
const newRedeem = `'<button id="ly-redeem-'+slug+'" data-slug="' + slug + '" onclick="window.redeemLoyaltyDash(this.dataset.slug)" style="flex:1;padding:8px;background:rgba(34,197,94,0.15);border:0.5px solid rgba(34,197,94,0.3);border-radius:8px;color:#22c55e;font-size:.7rem;font-weight:700;cursor:pointer;display:none;">🎁 Redeem Reward</button>'`;

if (f.includes(oldCopy)) { f = f.replace(oldCopy, newCopy); console.log('Copy button fixed'); }
else { console.log('Copy button NOT FOUND'); }
if (f.includes(oldRedeem)) { f = f.replace(oldRedeem, newRedeem); console.log('Redeem button fixed'); }
else { console.log('Redeem button NOT FOUND'); }

fs.writeFileSync('frontend/public/dashboard.html', f);
