const fs = require('fs');
let f = fs.readFileSync('frontend/public/dashboard.html', 'utf8');
f = f.replace("onclick=\"window.copyLoyaltyUrl(''+slug+'')\"", "onclick=\"window.copyLoyaltyUrl('\" + slug + \"')\"");
f = f.replace("onclick=\"window.redeemLoyaltyDash(''+slug+'')\"", "onclick=\"window.redeemLoyaltyDash('\" + slug + \"')\"");
fs.writeFileSync('frontend/public/dashboard.html', f);
console.log('Done:', f.includes("copyLoyaltyUrl('\" + slug"));
