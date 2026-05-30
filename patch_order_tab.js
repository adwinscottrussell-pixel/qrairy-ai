const fs=require('fs');
let fe=fs.readFileSync('frontend/public/smart-qr-detail.html','utf8').replace(/\r\n/g,'\n');
const OLD=`      <div class="sqd-tab-panel" data-panel="order" style="display:none;">
        <div style="font-size:.82rem;font-weight:700;color:#f0f4f8;margin-bottom:4px;">↕ Section Order</div>
        <div style="font-size:.65rem;color:rgba(240,244,248,0.76);margin-bottom:14px;">Drag to reorder sections on your live page.</div>
        <div id="sqd-order-list" style="display:flex;flex-direction:column;gap:6px;"></div>
        <div style="margin-top:12px;font-size:.6rem;color:rgba(240,244,248,0.4);text-align:center;">Changes apply after Publish</div>
      </div>`;
const NEW=`      <div class="sqd-tab-panel" data-panel="order" style="display:none;">
        <div style="font-size:.82rem;font-weight:700;color:#f0f4f8;margin-bottom:4px;">↕ Section Order</div>
        <div style="font-size:.65rem;color:rgba(240,244,248,0.55);margin-bottom:18px;">Qraivy automatically arranges sections for the best customer experience.</div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${['Hero','Voice','AI','Buttons','Loop','Featured','Info','Footer'].map(s=>`<div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.07);border-radius:8px;padding:10px 14px;"><span style="font-size:.75rem;color:rgba(240,244,248,0.7);font-family:'Inter',sans-serif;">${s}</span><span style="font-size:.6rem;color:rgba(240,244,248,0.3);letter-spacing:.06em;">🔒</span></div>`).join('\n          ')}
        </div>
      </div>`;
if(fe.includes(OLD)){fe=fe.replace(OLD,NEW);console.log('order tab: done');}
else console.log('FAIL');
fs.writeFileSync('frontend/public/smart-qr-detail.html',fe,'utf8');
