const fs = require('fs');
const path = require('path');
const ctrl = path.join(__dirname, 'backend/src/controllers/qrController.js');
let c = fs.readFileSync(ctrl, 'utf8');

// Find the old planInfo block in handleGetUserPlan
// It uses PLAN_LIMITS and PLAN_AI_LIMITS
const oldBlock = /const plan = user\.plan \|\| 'free';\s*const basicLimit[\s\S]*?const planInfo = \{[\s\S]*?\};/;
const match = c.match(oldBlock);
if (match) {
  console.log('Found old planInfo block, length:', match[0].length);
  const newBlock = `const { buildPlanInfo: _bpi, resolveEffectivePlan: _rep } = require('./utils/tierSystem');
    const aiQrCount2 = await prisma.qR.count({ where: { userId, businessName: { not: null } } });
    const planInfo = _bpi(user, aiQrCount2);`;
  c = c.replace(oldBlock, newBlock);
  fs.writeFileSync(ctrl, c, 'utf8');
  console.log('handleGetUserPlan patched ✓');
} else {
  // Try simpler replacement - find just the planInfo object literal
  console.log('Trying fallback patch...');
  // Find handleGetUserPlan function body
  const fnIdx = c.indexOf('handleGetUserPlan');
  const fnBody = c.slice(fnIdx, fnIdx + 1500);
  console.log('Full fn body:', fnBody.slice(0, 800));
}