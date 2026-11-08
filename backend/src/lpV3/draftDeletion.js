// lpV3/draftDeletion.js — the records one landing page deletion writes, for
// the Studio V3 "Delete draft" (DELETE /studio/pages/:slug,
// studioDraftDeleteController.js): exactly the three operations of the legacy
// DELETE /lp/:slug (controllers/lpController.js, unchanged; a test keeps the
// two the same), so there is one deletion procedure.
//
// deletionOps(db, { slug, actorId, metadata }) -> the three operations, to run
// in ONE transaction (a batch array, or awaited in order inside an interactive
// transaction):
//   1. stampToken.deleteMany  StampToken has no relation to LandingPage (joined
//      by the slug string only); deleting it closes the physical-tag
//      reactivation gap (a deleted page's old NFC / QR link can no longer pass
//      the token check)
//   2. landingPage.delete     its PageDesign and that design's versions go with
//      it (schema: onDelete Cascade); historical loyalty / Wallet records
//      (Pass, StampEntry, RewardEvent, LoyaltyCustomer, ...) are left as they
//      are, they are never deleted here
//   3. supportAction.create   the deletion record (DELETED_PAGE_MARKER): it
//      keeps the address reserved for good (services/slugReservation.js), so
//      nobody can take over a deleted page's printed QR codes, NFC tags or
//      Wallet links by creating a new page on its slug
// Who may delete what is decided by each caller, never here.
const { DELETED_PAGE_MARKER } = require('../services/slugReservation');

// deletionSteps: the same three, each as a function, for an interactive transaction that runs them strictly one after
// another (nothing starts before the previous one has finished, whatever the client's promise semantics)
function deletionSteps(db, { slug, actorId, metadata }) {
  return [
    () => db.stampToken.deleteMany({ where: { slug } }),
    () => db.landingPage.delete({ where: { slug } }),
    () => db.supportAction.create({ data: Object.assign({}, DELETED_PAGE_MARKER, { targetId: slug, actorId, actorType: 'human', metadata }) }),
  ];
}
function deletionOps(db, args) { return deletionSteps(db, args).map((step) => step()); }

module.exports = { deletionOps, deletionSteps };
