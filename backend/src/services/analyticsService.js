const prisma = require('../utils/prismaClient');

async function logPassScan({ passId, userAgent, ip }) {
  try {
    await prisma.scanAnalytic.create({
      data: { passId, userAgent, ip },
    });
  } catch (err) {
    console.error('logPassScan error:', err);
  }
}

module.exports = { logPassScan };