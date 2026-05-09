// ============================================================
// QRAIVY — TIER CONFIGURATION
// Single source of truth for all plan limits
// ============================================================

const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    basicQRLimit: Infinity,   // free forever
    aiQRLimit: 0,             // blocked
    dynamicQR: false,
    pushNotifications: false,
    walletPasses: false,
    apiAccess: false,
    passLimit: 0,
  },
  starter: {
    name: 'Starter',
    price: 9,
    basicQRLimit: Infinity,
    aiQRLimit: 10,
    dynamicQR: false,
    pushNotifications: true,
    walletPasses: false,
    apiAccess: false,
    passLimit: 0,
  },
  pro: {
    name: 'Pro',
    price: 29,
    basicQRLimit: Infinity,
    aiQRLimit: Infinity,
    dynamicQR: true,
    pushNotifications: true,
    walletPasses: false,
    apiAccess: false,
    passLimit: 0,
  },
  business: {
    name: 'Business',
    price: 49,
    basicQRLimit: Infinity,
    aiQRLimit: Infinity,
    dynamicQR: true,
    pushNotifications: true,
    walletPasses: true,
    apiAccess: false,
    passLimit: Infinity,      // unlimited wallet passes
  },
};

// API add-on tiers (for GHL and third-party integrations)
const API_PLANS = {
  api_starter: {
    name: 'API Starter',
    price: 49,
    qrLimit: 500,
    walletPasses: true,
    whiteLabel: false,
  },
  api_pro: {
    name: 'API Pro',
    price: 99,
    qrLimit: 2000,
    walletPasses: true,
    whiteLabel: false,
  },
  api_agency: {
    name: 'API Agency',
    price: 299,
    qrLimit: Infinity,
    walletPasses: true,
    whiteLabel: true,
  },
};

const WALLET_CONFIG = {
  passTypeId:    process.env.APPLE_PASS_TYPE_ID    || 'pass.com.qraivy.wallet',
  teamId:        process.env.APPLE_TEAM_ID         || '',
  webServiceUrl: process.env.API_BASE_URL          || 'https://api.qraivy.com',
  logoText:      'QRaivy',
};

module.exports = { PLANS, API_PLANS, WALLET_CONFIG };
