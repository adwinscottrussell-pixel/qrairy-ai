const prisma = require('../utils/prismaClient');

async function createQR(originalUrl) {
  const qr = await prisma.qR.create({
    data: { originalUrl },
  });
  return qr;
}

async function getQRById(id) {
  const qr = await prisma.qR.findUnique({
    where: { id },
  });
  return qr;
}

module.exports = { createQR, getQRById };
