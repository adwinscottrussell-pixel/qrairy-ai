$root = "C:\Users\adwin\OneDrive\Desktop\qrairy.ai\frontend\public"
$indexPath = "$root\index.html"

Write-Host "Patching index.html pricing section..." -ForegroundColor Cyan

$html = Get-Content $indexPath -Raw -Encoding UTF8

# ── Replace the entire pricing section ───────────────────────
$oldSection = @'
  <section class="pricing-section" id="pricing">
    <div class="section-wrap">
      <div class="section-header">
        <div class="section-badge">Simple pricing</div>
        <h2 class="section-title">Start free, <em>scale when ready</em></h2>
        <p class="section-sub">No credit card required to get started. Upgrade when you need more.</p>
      </div>
      <div class="pricing-grid">
        <div class="pricing-card">
          <div class="pricing-plan">Free</div>
          <div class="pricing-price">$0<span>/mo</span></div>
          <div class="pricing-desc">Perfect for trying out QRAivy with no commitment.</div>
          <ul class="pricing-features">
            <li>2 basic QR codes</li>
            <li>Download & share</li>
            <li>Standard redirect</li>
            <li class="dim">AI landing page</li>
            <li class="dim">Push notifications</li>
            <li class="dim">Analytics</li>
          </ul>
          <a href="login.html" class="pricing-btn outline">Get started free</a>
        </div>
        <div class="pricing-card featured">
          <div class="pricing-popular">Most Popular</div>
          <div class="pricing-plan">Starter</div>
          <div class="pricing-price">$9<span>/mo</span></div>
          <div class="pricing-desc">Everything you need to engage your customers with AI.</div>
          <ul class="pricing-features">
            <li>10 AI QR codes</li>
            <li>AI landing page</li>
            <li>Subscriber capture</li>
            <li>Push notifications</li>
            <li>Basic analytics</li>
            <li class="dim">White label</li>
          </ul>
          <a href="login.html" class="pricing-btn filled">Start for $9/mo</a>
        </div>
        <div class="pricing-card">
          <div class="pricing-plan">Pro</div>
          <div class="pricing-price">$29<span>/mo</span></div>
          <div class="pricing-desc">Unlimited power for growing businesses and agencies.</div>
          <ul class="pricing-features">
            <li>Unlimited AI QR codes</li>
            <li>Full analytics + charts</li>
            <li>AI-generated specials</li>
            <li>White label branding</li>
            <li>Priority support</li>
            <li>API access</li>
          </ul>
          <a href="login.html" class="pricing-btn outline">Start for $29/mo</a>
        </div>
      </div>
    </div>
  </section>
'@

$newSection = @'
  <section class="pricing-section" id="pricing">
    <div class="section-wrap">
      <div class="section-header">
        <div class="section-badge">Simple pricing</div>
        <h2 class="section-title">Start free, <em>scale when ready</em></h2>
        <p class="section-sub">No credit card required to get started. Upgrade when you need more.</p>
      </div>

      <!-- Billing toggle -->
      <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:36px;">
        <span id="label-monthly" style="font-family:var(--font-mono);font-size:0.8rem;color:var(--text-mid);">Monthly</span>
        <label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;">
          <input type="checkbox" id="billing-toggle" style="opacity:0;width:0;height:0;position:absolute;">
          <span id="toggle-track" style="position:absolute;inset:0;background:var(--border2);border-radius:24px;transition:background 0.2s;"></span>
          <span id="toggle-thumb" style="position:absolute;top:3px;left:3px;width:18px;height:18px;background:#fff;border-radius:50%;transition:transform 0.2s;"></span>
        </label>
        <span id="label-annual" style="font-family:var(--font-mono);font-size:0.8rem;color:var(--text-dim);">Annual <span style="background:var(--accent);color:#fff;font-size:0.6rem;padding:2px 7px;border-radius:20px;margin-left:4px;letter-spacing:0.05em;">SAVE 20%</span></span>
      </div>

      <div class="pricing-grid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr));">

        <!-- FREE -->
        <div class="pricing-card">
          <div class="pricing-plan">Free</div>
          <div class="pricing-price" id="price-free">&euro;0<span>/mo</span></div>
          <div class="pricing-desc">The perfect starting point. No credit card required.</div>
          <ul class="pricing-features">
            <li>Unlimited basic QR codes</li>
            <li>Download &amp; share</li>
            <li>Standard redirect</li>
            <li class="dim">AI landing pages</li>
            <li class="dim">Push notifications</li>
            <li class="dim">Apple Wallet passes</li>
          </ul>
          <a href="login.html" class="pricing-btn outline">Get started free</a>
        </div>

        <!-- STARTER -->
        <div class="pricing-card">
          <div class="pricing-plan">Starter</div>
          <div class="pricing-price" id="price-starter">&euro;9<span id="starter-period">/mo</span></div>
          <div class="pricing-desc" id="desc-starter">For businesses ready to engage customers with AI-powered QR pages.</div>
          <ul class="pricing-features">
            <li>Unlimited basic QR codes</li>
            <li>10 AI landing pages</li>
            <li class="dim">Dynamic QR codes</li>
            <li>Push notifications</li>
            <li class="dim">Apple Wallet passes</li>
            <li class="dim">API access</li>
          </ul>
          <a href="pricing.html" class="pricing-btn outline" id="btn-starter">Upgrade to Starter &rarr;</a>
        </div>

        <!-- PRO -->
        <div class="pricing-card featured">
          <div class="pricing-popular">Most Popular</div>
          <div class="pricing-plan">Pro</div>
          <div class="pricing-price" id="price-pro">&euro;29<span id="pro-period">/mo</span></div>
          <div class="pricing-desc" id="desc-pro">Unlimited AI pages and dynamic QR codes that update without reprinting.</div>
          <ul class="pricing-features">
            <li>Unlimited basic QR codes</li>
            <li>Unlimited AI landing pages</li>
            <li>Dynamic QR codes</li>
            <li>Push notifications</li>
            <li class="dim">Apple Wallet passes</li>
            <li class="dim">API access</li>
          </ul>
          <a href="pricing.html" class="pricing-btn filled" id="btn-pro">Upgrade to Pro &rarr;</a>
        </div>

        <!-- BUSINESS -->
        <div class="pricing-card">
          <div class="pricing-popular" style="background:var(--text-mid);color:#fff;">Full Platform</div>
          <div class="pricing-plan">Business</div>
          <div class="pricing-price" id="price-business">&euro;49<span id="business-period">/mo</span></div>
          <div class="pricing-desc" id="desc-business">Apple &amp; Google Wallet passes. The complete digital identity platform.</div>
          <ul class="pricing-features">
            <li>Everything in Pro</li>
            <li>Apple Wallet passes</li>
            <li>Google Wallet passes</li>
            <li>Dynamic pass updates</li>
            <li>APNs push to Wallet</li>
            <li>Priority support</li>
          </ul>
          <a href="pricing.html" class="pricing-btn outline" id="btn-business">Upgrade to Business &rarr;</a>
        </div>

      </div>
    </div>
  </section>

  <script>
  (function(){
    var isAnnual = false;
    var prices = {
      starter: { monthly: 9, annual: 7 },
      pro:     { monthly: 29, annual: 23 },
      business:{ monthly: 49, annual: 39 }
    };
    var toggle = document.getElementById('billing-toggle');
    var track  = document.getElementById('toggle-track');
    var thumb  = document.getElementById('toggle-thumb');
    var lm = document.getElementById('label-monthly');
    var la = document.getElementById('label-annual');

    function update() {
      isAnnual = toggle.checked;
      track.style.background = isAnnual ? 'var(--accent)' : 'var(--border2)';
      thumb.style.transform   = isAnnual ? 'translateX(20px)' : 'translateX(0)';
      lm.style.color = isAnnual ? 'var(--text-dim)' : 'var(--text-mid)';
      la.style.color = isAnnual ? 'var(--text-mid)' : 'var(--text-dim)';

      ['starter','pro','business'].forEach(function(plan){
        var price = isAnnual ? prices[plan].annual : prices[plan].monthly;
        var el = document.getElementById('price-' + plan);
        var period = document.getElementById(plan + '-period');
        if (el) el.childNodes[0].nodeValue = '\u20AC' + price;
        if (period) period.textContent = isAnnual ? '/mo, billed annually' : '/mo';
      });
    }

    toggle.addEventListener('change', update);
    update();
  })();
  </script>
'@

if ($html -notmatch 'billing-toggle') {
    $html = $html.Replace($oldSection, $newSection)
    Write-Host "Pricing section replaced with 4-plan toggle version" -ForegroundColor Green
} else {
    Write-Host "Toggle already present - skipped" -ForegroundColor Yellow
}

# ── Also add demo QR expiry if not already there ─────────────
$oldDownload = '        document.getElementById(''downloadBtn'').onclick = () => {
          const link = document.createElement(''a'');
          link.download = ''qraivy-code.png'';
          link.href = qrSrc;
          link.click();
        };'

$newDownload = '        document.getElementById(''downloadBtn'').onclick = () => {
          const link = document.createElement(''a'');
          link.download = ''qraivy-code.png'';
          link.href = qrSrc;
          link.click();
        };

        // Demo QR expiry — 1 hour countdown
        const _expiresAt = Date.now() + 60 * 60 * 1000;
        let _timerBadge = document.getElementById(''qr-demo-timer'');
        if (!_timerBadge) {
          _timerBadge = document.createElement(''div'');
          _timerBadge.id = ''qr-demo-timer'';
          _timerBadge.style.cssText = ''margin:10px auto 0;display:inline-block;background:rgba(255,90,31,0.1);border:0.5px solid rgba(255,90,31,0.3);border-radius:20px;padding:4px 14px;font-family:monospace;font-size:0.72rem;color:#ff5a1f;letter-spacing:0.04em;text-align:center;'';
          const _result = document.getElementById(''result'');
          if (_result) _result.appendChild(_timerBadge);
        }
        const _countdown = setInterval(() => {
          const _rem = _expiresAt - Date.now();
          if (_rem <= 0) {
            clearInterval(_countdown);
            const _img = document.querySelector(''#result img'');
            if (_img) { _img.style.filter=''blur(8px)''; _img.style.opacity=''0.35''; }
            _timerBadge.textContent = ''DEMO EXPIRED — Sign up free for a permanent QR'';
            _timerBadge.style.cursor = ''pointer'';
            _timerBadge.onclick = () => window.location.href = ''login.html'';
            document.getElementById(''downloadBtn'').disabled = true;
            document.getElementById(''copyBtn'').disabled = true;
            return;
          }
          const _h = Math.floor(_rem/3600000);
          const _m = Math.floor((_rem%3600000)/60000);
          const _s = Math.floor((_rem%60000)/1000);
          _timerBadge.textContent = `DEMO \u2014 expires in ${_h}:${String(_m).padStart(2,''0'')}:${String(_s).padStart(2,''0'')}`;
        }, 1000);'

if ($html -notmatch 'qr-demo-timer') {
    $html = $html.Replace($oldDownload, $newDownload)
    Write-Host "Demo QR 1-hour expiry timer added" -ForegroundColor Green
} else {
    Write-Host "Demo expiry already present - skipped" -ForegroundColor Yellow
}

Set-Content -Path $indexPath -Value $html -Encoding UTF8
Write-Host "index.html saved" -ForegroundColor Green

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Done! Now run:" -ForegroundColor Cyan
Write-Host " git add . && git commit -m 'fix: 4-plan pricing toggle + demo QR expiry' && git push" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
