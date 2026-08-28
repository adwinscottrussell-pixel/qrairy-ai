// stadtPocketContext.js
// Phase 3C.5 — smallest safe server-side resolution of whether a wallet pass
// belongs to a StadtPocket-linked business, and which city it's in. Used only
// to pick wallet-card presentation (Business Wallet Card vs Loyalty Pass);
// never accepts businessId/city from the client — always re-derives from the
// businessId already loaded server-side off the LandingPage row.
const prisma = require('../utils/prismaClient');

// Multi-location businesses: takes the first BusinessLocation found. Not a
// design decision — Stadt Pocket has no per-pass location selection yet, so
// this is a placeholder until that model exists. Out of scope for 3C.5.
async function resolveStadtPocketContext(businessId) {
  if (!businessId) return { isStadtPocketLinked: false, businessId: null, city: null };

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return { isStadtPocketLinked: false, businessId: null, city: null };

  const businessLocation = await prisma.businessLocation.findFirst({
    where: { businessId },
    include: { location: true },
  });
  const city = (businessLocation && businessLocation.location && businessLocation.location.name) || null;

  return { isStadtPocketLinked: true, businessId, city };
}

module.exports = { resolveStadtPocketContext };
