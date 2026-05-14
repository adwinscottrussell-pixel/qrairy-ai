/* ─────────────────────────────────────────────────
   QRAIVY Editor — Main Init
   ───────────────────────────────────────────────── */


const S = {
  store: null, zoom: 1, canvasW: 794, canvasH: 1123,
  activePanelId: 'templates', pendingW: 794, pendingH: 1123,
  uploadedImages: [], qrCodes: [], authToken: null,
};

window.addEventListener('load', async () => {
  await initClerk();
  initPolotno();
  renderPanel('templates');
  window.addEventListener('resize', () => editorActions.zoomFit());
  // Init indicator on first active button
  setTimeout(() => {
    const firstActive = document.querySelector('.tool-btn.active');
    if (firstActive) moveIndicator(firstActive);
  }, 100);

  initOnboarding();
  // Ensure topbar always shows A4 on load
  document.getElementById('canvas-size-btn').textContent = 'A4 · 794 × 1123';
  S.canvasW = 794; S.canvasH = 1123; S.pendingW = 794; S.pendingH = 1123;
  const _c = document.getElementById('polotno-container');
  if (_c) { _c.style.width = '794px'; _c.style.height = '1123px'; }
});

async function initClerk() {
  if (!window.Clerk) return;
  await window.Clerk.load();
  if (!window.Clerk.user) { window.location.href = 'login.html'; return; }
  S.authToken = await window.Clerk.session.getToken();
  try {
    const r = await fetch('https://api.qraivy.com/dashboard', { headers: { 'Authorization': 'Bearer ' + S.authToken } });
    const d = await r.json();
    S.qrCodes = d.qrCodes || [];
  } catch(e) {}
}
