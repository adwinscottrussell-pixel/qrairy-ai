// ============================================================
// QRAIVY — URL CONFIGURATION
// Single source of truth for customer-facing frontend and API origins.
// Do not hardcode https://www.qraivy.com or https://api.qraivy.com
// anywhere else in backend code — require this module instead.
// ============================================================

const PUBLIC_APP_ORIGIN = process.env.PUBLIC_APP_ORIGIN || 'https://www.qraivy.com';
const API_ORIGIN = process.env.API_ORIGIN || 'https://api.qraivy.com';

module.exports = { PUBLIC_APP_ORIGIN, API_ORIGIN };
