const fs = require('fs');
const path = require('path');
const ctrl = path.join(__dirname, 'backend/src/controllers/qrController.js');
let c = fs.readFileSync(ctrl, 'utf8');

// Check if already using buildPlanInfo
if (c.includes('buildPlanInfo')) {
  // Already imported - find handleGetUserPlan and check if it uses it
  const idx = c.indexOf('handleGetUserPlan');
  const snippet = c.slice(idx, idx + 800);
  console.log('Current handleGetUserPlan snippet:', snippet.slice(0, 400));
  
  // Find the planInfo building section and replace with buildPlanInfo
  // Look for patterns like: const planInfo = { plan:, canCreateAI:
  const oldPattern = /const planInfo\s*=\s*\{[^}]*canCreateAI[^}]*\}/s;
  if (oldPattern.test(snippet)) {
    c = c.replace(oldPattern, 
      `const aiQrCount = await prisma.qR.count({ where: { userId, businessName: { not: null } } });
    const planInfo = buildPlanInfo(user, aiQrCount)`
    );
    fs.writeFileSync(ctrl, c, 'utf8');
    console.log('qrController.handleGetUserPlan patched to use buildPlanInfo ✓');
  } else {
    console.log('Pattern not found - manual check needed');
    // Just make sure buildPlanInfo is used in handleDashboard too
    const dashIdx = c.indexOf('handleDashboard');
    console.log('handleDashboard snippet:', c.slice(dashIdx, dashIdx + 400));
  }
} else {
  console.log('buildPlanInfo not imported in qrController');
}