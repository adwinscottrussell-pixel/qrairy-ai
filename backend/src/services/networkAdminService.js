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

  return businesses.map((b) => {
    const owner = owners.get(b.primaryOwnerUserId) || null;
    return {
      ...b,
      owner,
      landingPagesCount: b._count.landingPages,
      standalone: b.businessLocations.length === 0,
      isLegacyShim: isLegacyShimBusiness(b, owner),
      _count: undefined,
    };
  });
}

// Phase 1A's backfill named every shim Business after its owner's email (or
// raw id if no email) — see backfill-network-location-business-phase1a.js.
// A Business created through the real Phase 1B-B1 creation flow always gets
// an admin-chosen merchant name instead, so this equality is a reliable,
// no-schema-change way to flag "never reviewed by an admin yet" rows for
// the UI, without deleting/archiving anything automatically.
function isLegacyShimBusiness(business, owner) {
  const fallbackName = owner?.email || business.primaryOwnerUserId;
  return business.name === fallbackName;
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
  const owner = owners.get(business.primaryOwnerUserId) || null;
  return { ...business, owner, standalone: business.businessLocations.length === 0, isLegacyShim: isLegacyShimBusiness(business, owner) };
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

// Phase 1B-B1 — Business creation, platform-admin only. A Business
// represents a real merchant/company, deliberately distinct from the Clerk
// User (authenticated principal) that owns it — see
// docs/architecture/NETWORK_LOCATION_FOUNDATION.md. primaryOwnerUserId must
// already be a known QRAIVY User row; this never creates a Clerk user.
async function createBusiness({ name, primaryOwnerUserId, status }) {
  if (!name || !String(name).trim()) throw invalid('Business name is required.');
  if (!primaryOwnerUserId || !String(primaryOwnerUserId).trim()) throw invalid('primaryOwnerUserId is required.');
  if (status && !BUSINESS_STATUSES.includes(status)) throw invalid(`Invalid status. Must be one of: ${BUSINESS_STATUSES.join(', ')}.`);

  const owner = await prisma.user.findUnique({ where: { id: primaryOwnerUserId } });
  if (!owner) throw invalid('primaryOwnerUserId does not match a known QRAIVY user/account.');

  const trimmedName = String(name).trim();

  // Duplicate guard: Business.name has no uniqueness constraint (see the
  // schema comment on Business.slug), and repeated attempts through the
  // Unassigned-Landing-Page "Create Business" shortcut proved this creates
  // true duplicate rows with no recovery path. Scoped narrowly on purpose:
  // same owner + same case-insensitive name + not a legacy shim + active --
  // never blocks two different owners from using the same brand name, and
  // never matches a legacy shim row (whose name is the owner's email/id,
  // not a real merchant name, via the existing isLegacyShimBusiness check).
  // If a match is found, reuse it instead of creating a second row --
  // callers (e.g. the auto-assign flow) don't need to know whether the
  // returned Business is new or reused, since only its id is used.
  const sameOwnerActive = await prisma.business.findMany({ where: { primaryOwnerUserId, status: 'active' } });
  const existingMatch = sameOwnerActive.find((b) =>
    b.name.trim().toLowerCase() === trimmedName.toLowerCase() && !isLegacyShimBusiness(b, owner)
  );
  if (existingMatch) return { business: existingMatch, reused: true };

  // Business + its owner BusinessMember are created atomically so a
  // Business row can never exist with no owner membership.
  const business = await prisma.$transaction(async (tx) => {
    const created = await tx.business.create({
      data: { name: trimmedName, primaryOwnerUserId, status },
    });
    const existingMember = await tx.businessMember.findFirst({ where: { businessId: created.id, userId: primaryOwnerUserId } });
    if (!existingMember) {
      await tx.businessMember.create({ data: { businessId: created.id, userId: primaryOwnerUserId, role: 'owner' } });
    }
    return created;
  });
  return { business, reused: false };
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

// ── LandingPage -> Business mapping (Phase 1B-B1) ───────────────────────
// This is the ONLY write path that touches LandingPage.businessId. It never
// touches LandingPage.userId, Customer.ownerUserId, or CustomerIdentity.
// ownerUserId -- those remain exactly as authoritative as before for every
// existing route (QR, wallet, loyalty, webpush, analytics, Customer
// Foundation). See docs/architecture/NETWORK_LOCATION_FOUNDATION.md.

async function listUnmappedLandingPages(ownerUserId) {
  if (!ownerUserId) throw invalid('ownerUserId is required.');
  return prisma.landingPage.findMany({
    where: { userId: ownerUserId, businessId: null },
    select: { id: true, slug: true, businessName: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

// Global admin-level view (Phase 1B-B2) — every LandingPage with no Business
// yet, across all owners, not scoped to one Business's owner the way
// listUnmappedLandingPages above is. Deliberately a separate function
// rather than an optional-ownerUserId mode on that one: the two have
// different callers (a single Business's detail page vs. a platform-wide
// admin queue) and different meanings ("this owner's leftover pages" vs.
// "everything nobody has triaged yet") that would only get harder to read
// if force-merged into one conditional.
async function listUnassignedLandingPages() {
  const pages = await prisma.landingPage.findMany({
    where: { businessId: null },
    select: { id: true, slug: true, businessName: true, userId: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  const owners = await resolveUsers(pages.map((p) => p.userId));
  return pages.map((p) => ({ ...p, owner: owners.get(p.userId) || null }));
}

// Assign-only ownership repair for an ownerless LandingPage (userId: null —
// nullable in schema.prisma). Never overwrites an existing owner, never
// creates a User. Does not touch businessId -- that stays a separate,
// later step via mapLandingPageToBusiness below.
async function assignLandingPageOwner(landingPageId, userId) {
  if (!userId) throw invalid('userId is required.');

  const landingPage = await prisma.landingPage.findUnique({ where: { id: landingPageId } });
  if (!landingPage) throw notFound('LandingPage');
  if (landingPage.userId) {
    throw duplicate('This LandingPage already has an owner — ownership cannot be reassigned from this endpoint.');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('User');

  return prisma.landingPage.update({
    where: { id: landingPageId },
    data: { userId },
    select: { id: true, slug: true, businessName: true, userId: true, businessId: true, status: true, createdAt: true },
  });
}

async function mapLandingPageToBusiness(landingPageId, businessId) {
  if (!businessId) throw invalid('businessId is required.');

  const [landingPage, business] = await Promise.all([
    prisma.landingPage.findUnique({ where: { id: landingPageId } }),
    prisma.business.findUnique({ where: { id: businessId } }),
  ]);
  if (!landingPage) throw notFound('LandingPage');
  if (!business) throw notFound('Business');

  // Critical tenant-protection rule (Phase 1B-B1): a LandingPage may only
  // be mapped to a Business owned by the same Clerk user that already owns
  // the page. No agency/staff cross-owner mapping exists yet -- reject it
  // outright rather than silently allowing a page to move between tenants.
  if (landingPage.userId !== business.primaryOwnerUserId) {
    throw invalid('This LandingPage is owned by a different user than this Business — cross-owner mapping is not allowed.');
  }

  return prisma.landingPage.update({
    where: { id: landingPageId },
    data: { businessId },
    select: { id: true, slug: true, businessName: true, businessId: true },
  });
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
  createBusiness,
  updateBusiness,
  assignBusinessToLocation,
  setBusinessLocationStatus,
  listManagers,
  assignManager,
  removeManager,
  listUnmappedLandingPages,
  listUnassignedLandingPages,
  assignLandingPageOwner,
  mapLandingPageToBusiness,
};
