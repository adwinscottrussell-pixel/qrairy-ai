// loyaltyAdminRoutes.js
// All endpoints owner-scoped via requireAuth (Clerk JWT).

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  listPrograms,
  getProgram,
  createProgram,
  updateProgram,
  toggleStatus,
  adminStamp,
  getStats,
  getCustomers
} = require('../controllers/loyaltyAdminController');

router.get('/programs',                requireAuth, listPrograms);
router.post('/programs',               requireAuth, createProgram);
router.get('/programs/:id',            requireAuth, getProgram);
router.put('/programs/:id',            requireAuth, updateProgram);
router.patch('/programs/:id/status',   requireAuth, toggleStatus);
router.post('/programs/:id/stamp',     requireAuth, adminStamp);
router.get('/programs/:id/stats',      requireAuth, getStats);

router.get('/programs/:id/customers',    requireAuth, getCustomers);
module.exports = router;
