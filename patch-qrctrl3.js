
const fs = require('fs');
const path = require('path');
const ctrl = path.join(__dirname, 'backend/src/controllers/qrController.js');
let c = fs.readFileSync(ctrl, 'utf8');

// Replace the old plan building block with tierSystem.buildPlanInfo
const oldBlock = `    const plan = user.plan || 'free';
    const basicLimit = PLAN_LIMITS[plan] === Infinity ? null : PLAN_LIMITS[plan];
    const aiLimit = PLAN_AI_LIMITS[plan] === Infinity ? null : PLAN_AI_LIMITS[plan];
    const aiQrCount = await prisma.qR.count({
      where: { userId, businessName: { not: null } },
    });
    return res.status(200).json({
      plan,
      qrCount: user.qrs.length,
      limit: basicLimit,
      aiQrCount,
      aiLimit,
      canCreate: basicLimit === null || user.qrs.length < basicLimit,
      canCreateAI: aiLimit === null || aiQrCount < aiLi`;

// Find and show what comes after
const idx = c.indexOf("    const plan = user.plan || 'free';");
const snippet = c.slice(idx, idx + 700);
console.log('Found at:', idx);

// Replace the entire block up to and including the return statement
const returnEnd = c.indexOf('\n    });', idx);
const oldFull = c.slice(idx, returnEnd + 8);
console.log('Old block end:', returnEnd);
console.log('Old block preview:', oldFull.slice(-100));

const newBlock = `    const { buildPlanInfo } = require('./utils/tierSystem');
    const aiQrCount = await prisma.qR.count({ where: { userId, businessName: { not: null } } });
    const planInfo = buildPlanInfo(user, aiQrCount);
    return res.status(200).json(planInfo);`;

c = c.slice(0, idx) + newBlock + c.slice(returnEnd + 8);
fs.writeFileSync(ctrl, c, 'utf8');
console.log('handleGetUserPlan patched to use buildPlanInfo ✓');
