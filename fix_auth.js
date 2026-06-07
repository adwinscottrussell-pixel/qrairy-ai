const fs = require('fs');
let f = fs.readFileSync('frontend/public/dashboard.html', 'utf8');
const old = `function loadLoyaltyDashboard() {
  var token = localStorage.getItem('sqd_token');
  var headers = token ? { 'Authorization': 'Bearer ' + token } : {};`;
const neo = `function loadLoyaltyDashboard() {
  var headers = {};
  var clerkToken = '';
  try { if(window.Clerk && window.Clerk.session) { window.Clerk.session.getToken().then(function(t){ clerkToken = t || ''; _doLoadLoyalty(t ? { 'Authorization': 'Bearer ' + t } : {}); }); return; } } catch(_){}
  _doLoadLoyalty({});
}
function _doLoadLoyalty(headers) {`;
if (f.includes(old)) { f = f.replace(old, neo); console.log('Fixed'); } else { console.log('NOT FOUND - trying partial'); console.log(f.includes('function loadLoyaltyDashboard')); }
fs.writeFileSync('frontend/public/dashboard.html', f);
