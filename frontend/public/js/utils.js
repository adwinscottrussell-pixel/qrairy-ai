/* ─────────────────────────────────────────────────
   QRAIVY Editor — Utilities
   ───────────────────────────────────────────────── */


function showToast(msg) {
  let t = document.getElementById('_toast');
  if (!t) { t = document.createElement('div'); t.id='_toast'; t.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#222;border:1px solid rgba(255,255,255,0.15);color:#f0ece0;font-family:\'DM Mono\',monospace;font-size:0.72rem;padding:8px 16px;border-radius:20px;z-index:9999;transition:opacity 0.3s;pointer-events:none;white-space:nowrap'; document.body.appendChild(t); }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._t); t._t = setTimeout(() => t.style.opacity = '0', 2500);
}
