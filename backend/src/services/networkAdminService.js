// networkAdminService.js — Stadt Pocket Phase 1B, platform-admin service.
//
// The only place that writes Network/Location/Business/BusinessLocation/
// NetworkMember on behalf of the Operations Center. Every function is
// called only from requireAdmin-protected routes (see adminRoutes.js) —
// this file assumes the caller is already an authenticated platform admin
// and does no auth of its own.
//
// Does not touch Customer/CustomerIdentity, and does not change how
// LandingPage.userId/ownerUserId scoping works anywhere else in the app
// (see docs/architecture/NETWORK_LOCATION_FOUNDATION.md).

const prisma = require('../utils/prismaClient');

const NETWORK_STATUSES = ['active', 'paused', 'archived'];
const LOCATION_STATUSES = ['active', 'paused'];
const LOCATION_TYPES = ['city', 'mall', 'district', 'generic'];
const BUSINESS_STATUSES = ['active', 'paused', 'archived'];
const BUSINESS_LOCATION_STATUSES = ['active', 'paused'];
const MANAGER_ROLES = ['network_admin', 'location_manager'];

class AdminServiceError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

function notFound(what) {
  return new AdminServiceError('NOT_FOUND', `${what} not found.`);
}
function invalid(message) {
  return new AdminServiceError('INVALID', message);
}
function duplicate(message) {
  return new AdminServiceError('DUPLICATE', message);
}

// ── Networks ─────────────────────────────────────────────────────────

async function listNetworks() {
  const networks = await prisma.network.findMany({ orderBy: { createdAt: 'desc' } });
  const ids = networks.map((n) => n.id);
  if (!ids.length) return [];

  const [locationCounts, memberCounts, businessCounts] = await Promise.all([
    prisma.location.groupBy({ by: ['networkId'], where: { networkId: { in: ids } }, _count: { _all: true } }),
    prisma.networkMember.groupBy({ by: ['networkId'], where: { networkId: { in: ids } }, _count: { _all: true } }),
    prisma.businessLocation.findMany({
      where: { location: { networkId: { in: ids } } },
      select: { businessId: true, location: { select: { networkId: true } } },
    }),
  ]);

  const locCountByNetwork = new Map(locationCounts.map((r) => [r.networkId, r._count._all]));
  const memberCountByNetwork = new Map(memberCounts.map((r) => [r.networkId, r._count._all]));
  const distinctBusinessByNetwork = new Map();
  for (const bl of businessCounts) {
    const nId = bl.location.networkId;
    if (!distinctBusinessByNetwork.has(nId)) distinctBusinessByNetwork.set(nId, new Set());
    distinctBusinessByNetwork.get(nId).add(bl.businessId);
  }

  return networks.map((n) => ({
    ...n,
    locationsCount: locCountByNetwork.get(n.id) || 0,
    businessesCount: distinctBusinessByNetwork.get(n.id)?.size || 0,
    managersCount: memberCountByNetwork.get(n.id) || 0,
  }));
}

async function getNetwork(id) {
  const network = await prisma.network.findUnique({ where: { id } });
  if (!network) throw notFound('Network');

  const locations = await prisma.location.findMany({ where: { networkId: id }, orderBy: { name: 'asc' } });
  const locationIds = locations.map((l) => l.id);

  const businessLocations = locationIds.length
    ? await prisma.businessLocation.findMany({
        where: { locationId: { in: locationIds } },
        include: { business: true, location: true },
      })
    : [];

  const businessesById = new Map();
  for (const bl of businessLocations) businessesById.set(bl.business.id, bl.business);

  const managers = await prisma.networkMember.findMany({ where: { networkId: id }, orderBy: { createdAt: 'desc' } });
  const managerUsers = await resolveUsers(managers.map((m) => m.userId));

  return {
    ...network,
    locations: locations.map((l) => ({
      ...l,
      businessesCount: businessLocations.filter((bl) => bl.locationId === l.id).length,
    })),
    businesses: [...businessesById.values()],
    managers: managers.map((m) => ({ ...m, user: managerUsers.get(m.userId) || null })),
  };
}

async function createNetwork({ name, slug, type, status }) {
  if (!name || !String(name).trim()) throw invalid('Network name is required.');
  if (!slug || !String(slug).trim()) throw invalid('Network slug is required.');
  if (status && !NETWORK_STATUSES.includes(status)) throw invalid(`Invalid status. Must be one of: ${NETWORK_STATUSES.join(', ')}.`);

  try {
    return await prisma.network.create({
      data: { name: String(name).trim(), slug: String(slug).trim(), type: type ? String(type).trim() : undefined, status },
    });
  } catch (e) {
    if (e.code === 'P2002') throw duplicate('A Network with this slug already exists.');
    throw e;
  }
}

async function updateNetwork(id, { name, slug, type, status }) {
  const existing = await prisma.network.findUnique({ where: { id } });
  if (!existing) throw notFound('Network');
  if (status && !NETWORK_STATUSES.includes(status)) throw invalid(`Invalid status. Must be one of: ${NETWORK_STATUSES.join(', ')}.`);

  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (slug !== undefined) data.slug = String(slug).trim();
  if (type !== undefined) data.type = String(type).trim();
  if (status !== undefined) data.status = status;

  try {
    return await prisma.network.update({ where: { id }, data });
  } catch (e) {
    if (e.code === 'P2002') throw duplicate('A Network with this slug already exists.');
    throw e;
  }
}

// ── Locations ────────────────────────────────────────────────────────

async function listLocations({ networkId, type, status } = {}) {
  const where = {};
  if (networkId) where.networkId = networkId;
  if (type) where.type = type;
  if (status) where.status = status;

  const locations = await prisma.location.findMany({ where, include: { network: true }, orderBy: { name: 'asc' } });
  const ids = locations.map((l) => l.id);
  if (!ids.length) return [];

  const [businessCounts, managerCounts] = await Promise.all([
    prisma.businessLocation.groupBy({ by: ['locationId'], where: { locationId: { in: ids } }, _count: { _all: true } }),
    prisma.networkMember.groupBy({ by: ['locationId'], where: { locationId: { in: ids } }, _count: { _all: true } }),
  ]);
  const bizByLoc = new Map(businessCounts.map((r) => [r.locationId, r._count._all]));
  const mgrByLoc = new Map(managerCounts.map((r) => [r.locationId, r._count._all]));

  return locations.map((l) => ({
    ...l,
    businessesCount: bizByLoc.get(l.id) || 0,
    managersCount: mgrByLoc.get(l.id) || 0,
  }));
}

async function getLocation(id) {
  const location = await prisma.location.findUnique({ where: { id }, include: { network: true } });
  if (!location) throw notFound('Location');

  const businessLocations = await prisma.businessLocation.findMany({ where: { locationId: id }, include: { business: true } });
  const managers = await prisma.networkMember.findMany({ where: { locationId: id }, orderBy: { createdAt: 'desc' } });
  const managerUsers = await resolveUsers(managers.map((m) => m.userId));

  return {
    ...location,
    businessLocations,
    managers: managers.map((m) => ({ ...m, user: managerUsers.get(m.userId) || null })),
  };
}

async function createLocation({ networkId, name, slug, type, status }) {
  if (!networkId) throw invalid('networkId is required.');
  if (!name || !String(name).trim()) throw invalid('Location name is required.');
  if (!slug || !String(slug).trim()) throw invalid('Location slug is required.');
  if (type && !LOCATION_TYPES.includes(type)) throw invalid(`Invalid type. Must be one of: ${LOCATION_TYPES.join(', ')}.`);
  if (status && !LOCATION_STATUSES.includes(status)) throw invalid(`Invalid status. Must be one of: ${LOCATION_STATUSES.join(', ')}.`);

  const network = await prisma.network.findUnique({ where: { id: networkId } });
  if (!network) throw notFound('Network');

  try {
    return await prisma.location.create({
      data: { networkId, name: String(name).trim(), slug: String(slug).trim(), type, status },
    });
  } catch (e) {
    if (e.code === 'P2002') throw duplicate('A Location with this slug already exists.');
    throw e;
  }
}

async function updateLocation(id, { name, slug, type, status }) {
  const existing = await prisma.location.findUnique({ where: { id } });
  if (!existing) throw notFound('Location');
  if (type && !LOCATION_TYPES.includes(type)) throw invalid(`Invalid type. Must be one of: ${LOCATION_TYPES.join(', ')}.`);
  if (status && !LOCATION_STATUSES.includes(status)) throw invalid(`Invalid status. Must be one of: ${LOCATION_STATUSES.join(', ')}.`);

  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (slug !== undefined) data.slug = String(slug).trim();
  if (type !== undefined) data.type = type;
  if (status !== undefined) data.status = status;

  try {
    return await prisma.location.update({ where: { id }, data });
  } catch (e) {
    if (e.code === 'P2002') throw duplicate('A Location with this slug already exists.');
    throw e;
  }
}

// ── Businesses (platform read/manage, no creation this phase) ─────────

async function listBusinesses({ networkId, locationId, status } = {}) {
  const where = {};
  if (status) where.status = status;
  if (networkId || locationId) {
    where.businessLocations = {
      some: {
        ...(locationId ? { locationId } : {}),
        ...(networkId ? { location: { networkId } } : {}),
      },
    };
  }

  const businesses = await prisma.business.findMany({
    where,
    include: {
      businessLocations: { include: { location: { include: { network: true } } } },
      _count: { select: { landingPages: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const owners = await resolveUsers(businesses.map((b) => b.primaryOwnerUserId));

  return businesses.map((b) => ({
    ...b,
    owner: owners.get(b.primaryOwnerUserId) || null,
    landingPagesCount: b._count.landingPages,
    standalone: b.businessLocations.length === 0,
    _count: undefined,
  }));
}

async function getBusiness(id) {
  const business = await prisma.business.findUnique({
    where: { id },
    include: {
      businessLocations: { include: { location: { include: { network: true } } } },
      landingPages: { select: { id: true, slug: true, businessName: true, status: true } },
      members: true,
    },
  });
  if (!business) throw notFound('Business');

  const owners = await resolveUsers([business.primaryOwnerUserId]);
  return { ...business, owner: owners.get(business.primaryOwnerUserId) || null, standalone: business.businessLocations.length === 0 };
}

async function updateBusiness(id, { name, slug, status }) {
  const existing = await prisma.business.findUnique({ where: { id } });
  if (!existing) throw notFound('Business');
  if (status && !BUSINESS_STATUSES.includes(status)) throw invalid(`Invalid status. Must be one of: ${BUSINESS_STATUSES.join(', ')}.`);

  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (slug !== undefined) data.slug = slug === null || slug === '' ? null : String(slug).trim();
  if (status !== undefined) data.status = status;

  try {
    return await prisma.business.update({ where: { id }, data });
  } catch (e) {
    if (e.code === 'P2002') throw duplicate('A Business with this slug already exists.');
    throw e;
  }
}

// ── Business ↔ Location assignment ─────────────────────────────────────

async function assignBusinessToLocation({ businessId, locationId }) {
  if (!businessId || !locationId) throw invalid('businessId and locationId are required.');

  const [business, location] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId } }),
    prisma.location.findUnique({ where: { id: locationId } }),
  ]);
  if (!business) throw notFound('Business');
  if (!location) throw notFound('Location');

  const existing = await prisma.businessLocation.findUnique({ where: { businessId_locationId: { businessId, locationId } } });
  if (existing) throw duplicate('This Business is already assigned to this Location.');

  return prisma.businessLocation.create({ data: { businessId, locationId }, include: { location: true, business: true } });
}

async function setBusinessLocationStatus(id, status) {
  if (!BUSINESS_LOCATION_STATUSES.includes(status)) throw invalid(`Invalid status. Must be one of: ${BUSINESS_LOCATION_STATUSES.join(', ')}.`);
  const existing = await prisma.businessLocation.findUnique({ where: { id } });
  if (!existing) throw notFound('BusinessLocation');
  return prisma.businessLocation.update({ where: { id }, data: { status } });
}

// ── Managers (NetworkMember) ────────────────────────────────────────────

async function listManagers({ networkId, locationId } = {}) {
  const where = {};
  if (networkId) where.networkId = networkId;
  if (locationId) where.locationId = locationId;

  const managers = await prisma.networkMember.findMany({
    where,
    include: { network: true, location: true },
    orderBy: { createdAt: 'desc' },
  });
  const users = await resolveUsers(managers.map((m) => m.userId));
  return managers.map((m) => ({ ...m, user: users.get(m.userId) || null }));
}

async function assignManager({ userId, networkId, locationId, role }) {
  if (!userId) throw invalid('userId is required.');
  if (!networkId) throw invalid('networkId is required.');
  if (!MANAGER_ROLES.includes(role)) throw invalid(`Invalid role. Must be one of: ${MANAGER_ROLES.join(', ')}.`);

  const network = await prisma.network.findUnique({ where: { id: networkId } });
  if (!network) throw notFound('Network');

  let resolvedLocationId = null;
  if (locationId) {
    const location = await prisma.location.findUnique({ where: { id: locationId } });
    if (!location) throw notFound('Location');
    if (location.networkId !== networkId) {
      throw invalid('This Location does not belong to the given Network.');
    }
    resolvedLocationId = locationId;
  }

  const existing = await prisma.networkMember.findFirst({ where: { userId, networkId, locationId: resolvedLocationId } });
  if (existing) throw duplicate('This user already has this exact manager assignment.');

  try {
    return await prisma.networkMember.create({ data: { userId, networkId, locationId: resolvedLocationId, role } });
  } catch (e) {
    if (e.code === 'P2002') throw duplicate('This user already has this exact manager assignment.');
    throw e;
  }
}

async function removeManager(id) {
  const existing = await prisma.networkMember.findUnique({ where: { id } });
  if (!existing) throw notFound('Manager assignment');
  await prisma.networkMember.delete({ where: { id } });
  return { removed: true };
}

// ── Shared: resolve Clerk userIds to local User rows (email/plan) ──────
// Never calls out to Clerk directly — uses the same local `User` table
// the rest of the Operations Center (`/admin/users`) already treats as
// the resolved account list. A manager/owner userId with no matching
// User row resolves to null, never a fabricated user.
async function resolveUsers(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, plan: true } });
  return new Map(users.map((u) => [u.id, u]));
}

module.exports = {
  AdminServiceError,
  NETWORK_STATUSES,
  LOCATION_STATUSES,
  LOCATION_TYPES,
  BUSINESS_STATUSES,
  BUSINESS_LOCATION_STATUSES,
  MANAGER_ROLES,
  listNetworks,
  getNetwork,
  createNetwork,
  updateNetwork,
  listLocations,
  getLocation,
  createLocation,
  updateLocation,
  listBusinesses,
  getBusiness,
  updateBusiness,
  assignBusinessToLocation,
  setBusinessLocationStatus,
  listManagers,
  assignManager,
  removeManager,
};
