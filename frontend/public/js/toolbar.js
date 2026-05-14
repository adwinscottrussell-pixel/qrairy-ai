/* ─────────────────────────────────────────────────
   QRAIVY Editor — Toolbar & Command Palette
   ───────────────────────────────────────────────── */


// ── COMMAND PALETTE ───────────────────────────────────────────
const CP_COMMANDS = [
  { id:'ai-generate',  icon:'✦',  label:'Generate with AI',       hint:'AI',  action: () => showAIModal(),                         category:'AI' },
  { id:'ai-template',  icon:'⊞',  label:'AI Smart Template',      hint:'AI',  action: () => showAIModal(),                         category:'AI' },
  { id:'tmpl',         icon:'⊞',  label:'Browse Templates',       hint:'T',   action: () => { togglePanel('templates', document.querySelector('[data-panel=templates]')); }, category:'Add' },
  { id:'text',         icon:'T',  label:'Add Text Block',         hint:'X',   action: () => { togglePanel('text', document.querySelector('[data-panel=text]')); },          category:'Add' },
  { id:'qr',           icon:'⬡',  label:'Insert QR Code',         hint:'Q',   action: () => { togglePanel('qrcodes', document.querySelector('[data-panel=qrcodes]')); },    category:'Add' },
  { id:'image',        icon:'🖼', label:'Upload Image',           hint:'I',   action: () => { togglePanel('images', document.querySelector('[data-panel=images]')); },      category:'Add' },
  { id:'bg',           icon:'🎨', label:'Change Background',      hint:'B',   action: () => { togglePanel('background', document.querySelector('[data-panel=background]')); }, category:'Add' },
  { id:'promo-block',  icon:'🎯', label:'Add Promo Block',        hint:'',    action: () => { loadTemplate('promo-flyer-dark'); closeCp(); },  category:'Blocks' },
  { id:'menu-block',   icon:'🍽', label:'Add Restaurant Menu',    hint:'',    action: () => { loadTemplate('restaurant-menu'); closeCp(); },   category:'Blocks' },
  { id:'event-block',  icon:'🎵', label:'Add Event Poster',       hint:'',    action: () => { loadTemplate('event-poster'); closeCp(); },      category:'Blocks' },
  { id:'biz-block',    icon:'💼', label:'Add Business Card',      hint:'',    action: () => { loadTemplate('business-card'); closeCp(); },     category:'Blocks' },
  { id:'ig-block',     icon:'📱', label:'Add Instagram Post',     hint:'',    action: () => { loadTemplate('instagram-promo'); closeCp(); },   category:'Blocks' },
  { id:'png',          icon:'⬇', label:'Export PNG',             hint:'',    action: () => editorActions.exportPNG(),              category:'Export' },
  { id:'pdf',          icon:'⬇', label:'Export PDF',             hint:'',    action: () => editorActions.exportPDF(),              category:'Export' },
  { id:'save',         icon:'💾', label:'Save Design',            hint:'⌘S',  action: () => editorActions.save(),                   category:'File' },
  { id:'undo',         icon:'↩', label:'Undo',                   hint:'⌘Z',  action: () => editorActions.undo(),                   category:'File' },
  { id:'redo',         icon:'↪', label:'Redo',                   hint:'⌘Y',  action: () => editorActions.redo(),                   category:'File' },
];

let cpSelectedIdx = 0;
let cpFiltered = [...CP_COMMANDS];

function openCp() {
  const cp = document.getElementById('command-palette');
  cp.classList.add('open');
  cpFiltered = [...CP_COMMANDS];
  renderCpResults('');
  setTimeout(() => document.getElementById('cp-input').focus(), 50);
}

function closeCp() {
  document.getElementById('command-palette').classList.remove('open');
  document.getElementById('cp-input').value = '';
}

function filterCommands(q) {
  const query = q.toLowerCase().trim();
  cpFiltered = query
    ? CP_COMMANDS.filter(c => c.label.toLowerCase().includes(query) || c.category.toLowerCase().includes(query))
    : CP_COMMANDS;
  cpSelectedIdx = 0;
  renderCpResults(query);
}

function renderCpResults(query) {
  const container = document.getElementById('cp-results');
  if (!cpFiltered.length) {
    container.innerHTML = '<div style="text-align:center;padding:24px;font-family:var(--mono);font-size:0.68rem;color:rgba(255,255,255,0.2)">No commands found</div>';
    return;
  }

  // Group by category
  const grouped = {};
  cpFiltered.forEach(c => {
    if (!grouped[c.category]) grouped[c.category] = [];
    grouped[c.category].push(c);
  });

  let html = '';
  let globalIdx = 0;
  Object.entries(grouped).forEach(([cat, items]) => {
    if (!query) html += '<div class="cp-section-label">' + cat + '</div>';
    items.forEach(item => {
      const isAI = cat === 'AI';
      const selected = globalIdx === cpSelectedIdx;
      html += '<div class="cp-item' + (selected ? ' cp-selected' : '') + '" data-idx="' + globalIdx + '" onclick="executeCpItem(' + globalIdx + ')">';
      html += '<div class="cp-item-icon' + (isAI ? ' ai' : '') + '">' + item.icon + '</div>';
      html += '<div class="cp-item-name">' + item.label + '</div>';
      if (item.hint) html += '<div class="cp-item-hint">' + item.hint + '</div>';
      html += '</div>';
      globalIdx++;
    });
  });

  container.innerHTML = html;
}

function executeCpItem(idx) {
  const flat = [];
  const grouped = {};
  cpFiltered.forEach(c => {
    if (!grouped[c.category]) grouped[c.category] = [];
    grouped[c.category].push(c);
  });
  Object.values(grouped).forEach(items => items.forEach(i => flat.push(i)));
  if (flat[idx]) {
    closeCp();
    flat[idx].action();
  }
}

function cpKeyNav(e) {
  const flat = cpFiltered;
  if (e.key === 'ArrowDown') { e.preventDefault(); cpSelectedIdx = Math.min(cpSelectedIdx+1, flat.length-1); renderCpResults(document.getElementById('cp-input').value); }
  if (e.key === 'ArrowUp')   { e.preventDefault(); cpSelectedIdx = Math.max(cpSelectedIdx-1, 0); renderCpResults(document.getElementById('cp-input').value); }
  if (e.key === 'Enter')     { e.preventDefault(); executeCpItem(cpSelectedIdx); }
  if (e.key === 'Escape')    { closeCp(); }
}

document.getElementById('command-palette').addEventListener('click', e => {
  if (e.target === document.getElementById('command-palette')) closeCp();
});

// ── AI THINKING STATE SYSTEM ──────────────────────────────────
const AI_MESSAGES = [
  'Analysing your prompt...',
  'Generating layout structure...',
  'Building QR experience...',
  'Creating campaign visuals...',
  'Applying brand colours...',
  'Finalising your design...'
];

function showAIThinking(durationMs, onComplete) {
  const overlay = document.getElementById('ai-thinking');
  overlay.classList.add('active');

  const textEl = document.getElementById('ai-thinking-text');
  const steps = [1,2,3,4,5].map(i => document.getElementById('ai-step-'+i));
  steps.forEach(s => { s.classList.remove('active','done'); });

  let msgIdx = 0;
  let stepIdx = 0;

  textEl.textContent = AI_MESSAGES[0];

  const msgInterval = setInterval(() => {
    msgIdx = (msgIdx + 1) % AI_MESSAGES.length;
    textEl.style.animation = 'none';
    setTimeout(() => {
      textEl.textContent = AI_MESSAGES[msgIdx];
      textEl.style.animation = 'textFade 0.5s ease';
    }, 50);
  }, Math.floor(durationMs / AI_MESSAGES.length));

  const stepInterval = setInterval(() => {
    if (stepIdx < steps.length) {
      if (stepIdx > 0) steps[stepIdx-1].classList.replace('active','done');
      steps[stepIdx].classList.add('active');
      stepIdx++;
    }
  }, Math.floor(durationMs / (steps.length + 1)));

  setTimeout(() => {
    clearInterval(msgInterval);
    clearInterval(stepInterval);
    steps.forEach(s => s.classList.remove('active'));
    overlay.classList.remove('active');
    if (onComplete) onComplete();
  }, durationMs);
}

// ── SMART MARKETING BLOCKS PANEL ─────────────────────────────
function renderBlocksPanel() {
  return '<div class="section-label">Quick Blocks</div>' +
    '<div class="block-grid">' +
    [
      { icon:'🎯', name:'Promo Block', desc:'Sale offer + QR', tid:'promo-flyer-dark' },
      { icon:'🍽', name:'Menu Card', desc:'Restaurant layout', tid:'restaurant-menu' },
      { icon:'🎵', name:'Event Poster', desc:'Ticket promo', tid:'event-poster' },
      { icon:'💼', name:'Biz Card', desc:'Professional', tid:'business-card' },
      { icon:'📱', name:'Instagram', desc:'Social post', tid:'instagram-promo' },
      { icon:'⬡', name:'QR Promo', desc:'Scan-first design', tid:'qr-landing-promo' },
    ].map(b =>
      '<div class="block-card" onclick="loadTemplate(\'' + b.tid + '\')">' +
        '<div class="block-icon">' + b.icon + '</div>' +
        '<div class="block-name">' + b.name + '</div>' +
        '<div class="block-desc">' + b.desc + '</div>' +
      '</div>'
    ).join('') +
  '</div>';
}
