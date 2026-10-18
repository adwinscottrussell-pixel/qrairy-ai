// QRAIVY Academy (tests/academyPage.test.js pins these exactly): the Academy's
// own frontend files, the one-line sidebar entry on the canonical Admin pages
// and its label in js/admin-shell.js. Older "frontend unchanged" guards
// exclude exactly these paths and keep checking everything else.
const ACADEMY_FRONTEND = ['academy.html', 'academy.css', 'js/academy.js', 'js/academy-catalog.js', 'js/admin-shell.js',
  'analytics.html', 'dashboard.html', 'deals.html', 'designer-saved.html', 'loyalty-setup.html', 'smart-qr-detail.html', 'wallet-pass-studio.html']
  .map((f) => 'frontend/public/' + f);

const ACADEMY_EXCLUDES = ACADEMY_FRONTEND.map((f) => ':(exclude)' + f);

module.exports = { ACADEMY_FRONTEND, ACADEMY_EXCLUDES };
