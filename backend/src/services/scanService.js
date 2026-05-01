const prisma = require('../utils/prismaClient');

async function logScan(qrId, userAgent) {
  const scan = await prisma.scan.create({
    data: {
      qrId,
      userAgent: userAgent || 'unknown',
    },
  });
  return scan;
}

module.exports = { logScan };
