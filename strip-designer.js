const fs = require('fs'), path = require('path');
const file = path.join(__dirname, 'frontend/public/designer.html');
let d = fs.readFileSync(file, 'utf8');

// Count inline style blocks
const styleMatches = d.match(/<style[\s\S]*?<\/style>/g) || [];
console.log('Inline style blocks:', styleMatches.length);
styleMatches.forEach((s,i) => console.log('Block',i+1,'length:',s.length));

// Remove ALL inline style blocks - shell handles everything
d = d.replace(/<style[\s\S]*?<\/style>/g, '');

// Remove sidebar.js if still present
d = d.replace(/<script src="sidebar\.js[^"]*"><\/script>/g, '');

// Add sidebar collapse JS inline since sidebar.js is gone
const hasSbToggle = d.includes("getElementById('sb-toggle')");
if (!hasSbToggle) {
  const initJs = `
<script>
window.addEventListener('DOMContentLoaded', function() {
  var sb = document.getElementById('sidebar');
  var tog = document.getElementById('sb-toggle');
  if (sb && tog) {
    if (localStorage.getItem('sb-collapsed') === 'true') { sb.classList.add('collapsed'); document.body.classList.add('sb-collapsed'); }
    tog.addEventListener('click', function() { var c = sb.classList.toggle('collapsed'); document.body.classList.toggle('sb-collapsed',c); localStorage.setItem('sb-collapsed',c); });
  }
  var mob = document.getElementById('mob-btn');
  var ov = document.getElementById('sb-overlay');
  if (mob) mob.addEventListener('click', function(){ sb.classList.add('mob-open'); if(ov)ov.classList.add('on'); });
  if (ov) ov.addEventListener('click', function(){ sb.classList.remove('mob-open'); ov.classList.remove('on'); });
});
</script>`;
  d = d.replace('</body>', initJs + '\n</body>');
  console.log('Sidebar init JS added');
}

fs.writeFileSync(file, d, 'utf8');
console.log('Done. Size:', d.length);
console.log('Inline styles remaining:', (d.match(/<style/g)||[]).length);
console.log('sidebar.js remaining:', d.includes('sidebar.js'));