/**
 * QRAIVY SMART BLOCK EDITOR
 * ==========================
 * Inline editing for renderer-driven landing page sections.
 *
 * Editable section types: primary_cta, social_links, info_cards, featured_video
 * Preserved (no edit): hero, voice_welcome, ai_assistant, wallet_pass, subscribe
 *
 * Editor mode: only active when page has data-editor="true" or URL has ?edit=true
 * Public /lp/{slug} pages remain clean — no edit controls shown.
 *
 * Data flow:
 *   1. User clicks edit on a block
 *   2. Mini panel opens with fields from section.data
 *   3. User saves → section.data updated → section re-rendered in DOM
 *   4. Draft saved to localStorage: qraivy_editor_draft_{slug}
 */

(function () {
  'use strict';

  // ── Editor state ──────────────────────────────────────────────────────────

  var _sections = [];   // array of { type, data } objects managed by editor
  var _slug     = '';   // current page slug
  var _accent   = '#ff5a1f';
  var _container = null; // DOM element containing rendered sections
  var _activePanel = null; // currently open mini panel

  // ── Editor mode detection ─────────────────────────────────────────────────

  function isEditorMode() {
    if (typeof window === 'undefined') return false;
    if (document.body && document.body.getAttribute('data-editor') === 'true') return true;
    if (window.location && window.location.search.indexOf('edit=true') !== -1) return true;
    // Also active when called explicitly from smart-qr-detail page
    if (window._QRAIVY_EDITOR_MODE === true) return true;
    return false;
  }

  // ── localStorage draft ────────────────────────────────────────────────────

  function saveDraft() {
    if (!_slug) return;
    try {
      localStorage.setItem(
        'qraivy_editor_draft_' + _slug,
        JSON.stringify({ sections: _sections, savedAt: new Date().toISOString() })
      );
    } catch (e) {
      console.warn('[SmartBlockEditor] Draft save failed:', e);
    }
  }

  function loadDraft(slug) {
    try {
      var raw = localStorage.getItem('qraivy_editor_draft_' + slug);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  // ── Mini panel helpers ────────────────────────────────────────────────────

  function closePanels() {
    document.querySelectorAll('.qrbe-panel').forEach(function (el) {
      el.remove();
    });
    _activePanel = null;
  }

  function field(key, label, value, type) {
    type = type || 'text';
    var inputEl = type === 'textarea'
      ? '<textarea class="qrbe-input" data-key="' + key + '" rows="2">' + esc(value || '') + '</textarea>'
      : '<input class="qrbe-input" type="text" data-key="' + key + '" value="' + esc(value || '') + '" />';
    return '<div class="qrbe-field"><label class="qrbe-label">' + esc(label) + '</label>' + inputEl + '</div>';
  }

  function selectField(key, label, value, options) {
    var opts = options.map(function (o) {
      return '<option value="' + o + '"' + (o === value ? ' selected' : '') + '>' + o + '</option>';
    }).join('');
    return '<div class="qrbe-field"><label class="qrbe-label">' + esc(label) + '</label>' +
      '<select class="qrbe-input qrbe-select" data-key="' + key + '">' + opts + '</select></div>';
  }

  function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function collectFields(panel) {
    var data = {};
    panel.querySelectorAll('[data-key]').forEach(function (el) {
      data[el.getAttribute('data-key')] = el.value;
    });
    return data;
  }

  function showPanel(anchorEl, sectionEl, sectionIdx) {
    closePanels();
    var section = _sections[sectionIdx];
    if (!section) return;

    var panel = document.createElement('div');
    panel.className = 'qrbe-panel';
    panel.setAttribute('data-section-idx', sectionIdx);

    var content = buildPanelContent(section);
    panel.innerHTML = [
      '<div class="qrbe-panel-header">',
      '  <span class="qrbe-panel-title">Edit Block</span>',
      '  <button class="qrbe-close" onclick="this.closest(\'.qrbe-panel\').remove()">✕</button>',
      '</div>',
      '<div class="qrbe-panel-body">',
      content,
      '</div>',
      '<div class="qrbe-panel-footer">',
      '  <button class="qrbe-btn-save" data-idx="' + sectionIdx + '">Save</button>',
      '  <button class="qrbe-btn-cancel" onclick="this.closest(\'.qrbe-panel\').remove()">Cancel</button>',
      '</div>'
    ].join('');

    // Position panel below the anchor
    sectionEl.style.position = 'relative';
    sectionEl.appendChild(panel);
    _activePanel = panel;

    // Save handler
    panel.querySelector('.qrbe-btn-save').addEventListener('click', function () {
      var idx = parseInt(this.getAttribute('data-idx'));
      saveSection(idx, panel);
    });
  }

  // ── Panel content builders ────────────────────────────────────────────────

  function buildPanelContent(section) {
    var d = section.data || {};
    switch (section.type) {
      case 'primary_cta':
        return [
          field('text',  'Button Text', d.text  || 'Learn More'),
          field('url',   'Link URL',    d.url   || ''),
          field('subtext','Subtext',    d.subtext || ''),
          selectField('style', 'Style', d.style || 'primary', ['primary', 'secondary', 'outline'])
        ].join('');

      case 'social_links':
        var links = Array.isArray(d.links) ? d.links : [];
        if (!links.length) return '<p class="qrbe-empty">No links yet. Add links via the API or editor.</p>';
        return links.map(function (link, i) {
          return '<div class="qrbe-link-row">' +
            '<span class="qrbe-link-num">' + (i + 1) + '</span>' +
            '<div class="qrbe-link-fields">' +
            '<input class="qrbe-input qrbe-link-label" data-link-idx="' + i + '" data-link-field="label" type="text" placeholder="Label" value="' + esc(link.label || '') + '" />' +
            '<input class="qrbe-input qrbe-link-url" data-link-idx="' + i + '" data-link-field="url" type="text" placeholder="URL" value="' + esc(link.url || '') + '" />' +
            '</div></div>';
        }).join('');

      case 'info_cards':
        var cards = Array.isArray(d.cards) ? d.cards : [];
        if (!cards.length) return '<p class="qrbe-empty">No cards yet.</p>';
        return cards.map(function (card, i) {
          return '<div class="qrbe-card-row">' +
            '<div class="qrbe-card-num">' + (i + 1) + '</div>' +
            '<div class="qrbe-card-fields">' +
            '<input class="qrbe-input" data-card-idx="' + i + '" data-card-field="icon" type="text" placeholder="Icon (emoji)" value="' + esc(card.icon || '') + '" style="width:60px;" />' +
            '<input class="qrbe-input" data-card-idx="' + i + '" data-card-field="title" type="text" placeholder="Title" value="' + esc(card.title || '') + '" />' +
            '<input class="qrbe-input" data-card-idx="' + i + '" data-card-field="description" type="text" placeholder="Description" value="' + esc(card.description || '') + '" />' +
            '</div></div>';
        }).join('');

      case 'featured_video':
        return [
          field('url',     'Video URL (YouTube/Vimeo)', d.url     || ''),
          field('caption', 'Caption',                   d.caption || '')
        ].join('');

      default:
        return '<p class="qrbe-empty">No editable fields for this block.</p>';
    }
  }

  // ── Save section ──────────────────────────────────────────────────────────

  function saveSection(idx, panel) {
    var section = _sections[idx];
    if (!section) return;

    switch (section.type) {
      case 'primary_cta':
      case 'featured_video':
        var newData = collectFields(panel);
        Object.assign(section.data, newData);
        break;

      case 'social_links':
        var links = section.data.links || [];
        panel.querySelectorAll('[data-link-idx]').forEach(function (el) {
          var i = parseInt(el.getAttribute('data-link-idx'));
          var f = el.getAttribute('data-link-field');
          if (!links[i]) links[i] = {};
          links[i][f] = el.value;
        });
        section.data.links = links;
        break;

      case 'info_cards':
        var cards = section.data.cards || [];
        panel.querySelectorAll('[data-card-idx]').forEach(function (el) {
          var i = parseInt(el.getAttribute('data-card-idx'));
          var f = el.getAttribute('data-card-field');
          if (!cards[i]) cards[i] = {};
          cards[i][f] = el.value;
        });
        section.data.cards = cards;
        break;
    }

    // Re-render the section in DOM
    rerenderSection(idx);
    saveDraft();
    closePanels();

    // Visual confirmation
    var sectionEl = _container && _container.querySelector('[data-section-idx="' + idx + '"]');
    if (sectionEl) {
      sectionEl.style.transition = 'box-shadow 0.3s';
      sectionEl.style.boxShadow = '0 0 0 2px ' + _accent;
      setTimeout(function () { sectionEl.style.boxShadow = ''; }, 1200);
    }
  }

  // ── Re-render a single section ────────────────────────────────────────────

  function rerenderSection(idx) {
    if (!window.QRAIVY_RENDER_SECTION) return;
    var section = _sections[idx];
    if (!section) return;
    var sectionEl = _container && _container.querySelector('[data-section-idx="' + idx + '"]');
    if (!sectionEl) return;

    var newHTML = window.QRAIVY_RENDER_SECTION(section);
    var wrapper = document.createElement('div');
    wrapper.innerHTML = newHTML;
    var newEl = wrapper.firstElementChild;
    if (!newEl) return;

    // Preserve editor attributes
    newEl.setAttribute('data-section-idx', idx);
    newEl.setAttribute('data-section-type', section.type);
    addEditAffordance(newEl, idx);

    sectionEl.replaceWith(newEl);
  }

  // ── Edit affordance (hover pencil) ────────────────────────────────────────

  var EDITABLE_TYPES = ['primary_cta', 'social_links', 'info_cards', 'featured_video'];

  function addEditAffordance(el, idx) {
    var section = _sections[idx];
    if (!section || EDITABLE_TYPES.indexOf(section.type) === -1) return;

    el.setAttribute('data-section-idx', idx);
    el.style.position = 'relative';
    el.style.cursor = 'default';

    // Create edit button
    var btn = document.createElement('button');
    btn.className = 'qrbe-edit-btn';
    btn.innerHTML = '✏️ Edit';
    btn.setAttribute('aria-label', 'Edit this block');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      showPanel(btn, el, idx);
    });
    el.appendChild(btn);

    // Hover glow
    el.addEventListener('mouseenter', function () {
      el.style.outline = '1.5px solid rgba(255,90,31,0.35)';
      el.style.borderRadius = '12px';
    });
    el.addEventListener('mouseleave', function () {
      el.style.outline = '';
    });
  }

  // ── Render all sections into container ────────────────────────────────────

  function renderAll() {
    if (!_container || !window.QRAIVY_RENDER_SECTION) return;
    _container.innerHTML = '';

    _sections.forEach(function (section, idx) {
      var html = window.QRAIVY_RENDER_SECTION(section);
      if (!html) return;

      var wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      var el = wrapper.firstElementChild;
      if (!el) return;

      el.setAttribute('data-section-idx', idx);
      el.setAttribute('data-section-type', section.type);

      if (isEditorMode()) {
        addEditAffordance(el, idx);
      }

      _container.appendChild(el);
    });
  }

  // ── Inject editor CSS ─────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('qrbe-styles')) return;
    var style = document.createElement('style');
    style.id = 'qrbe-styles';
    style.textContent = [
      /* Edit button */
      '.qrbe-edit-btn{position:absolute;top:8px;right:8px;background:rgba(255,90,31,0.12);border:1px solid rgba(255,90,31,0.3);color:#ff5a1f;border-radius:8px;padding:4px 10px;font-size:0.65rem;font-family:\'Inter\',sans-serif;font-weight:600;cursor:pointer;opacity:0;transition:opacity 0.15s;z-index:10;letter-spacing:0.04em;}',
      '[data-section-idx]:hover .qrbe-edit-btn{opacity:1;}',
      /* Panel */
      '.qrbe-panel{position:absolute;bottom:calc(100% + 8px);right:0;left:0;background:#141820;border:1px solid rgba(255,90,31,0.2);border-radius:12px;padding:0;z-index:1000;box-shadow:0 8px 32px rgba(0,0,0,0.6);min-width:260px;max-width:360px;font-family:\'Inter\',sans-serif;}',
      '.qrbe-panel-header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px 10px;border-bottom:1px solid rgba(255,255,255,0.06);}',
      '.qrbe-panel-title{font-size:0.75rem;font-weight:600;color:#f0ece0;letter-spacing:0.04em;}',
      '.qrbe-close{background:none;border:none;color:rgba(240,236,224,0.4);font-size:0.8rem;cursor:pointer;padding:2px 4px;line-height:1;}',
      '.qrbe-close:hover{color:#f0ece0;}',
      '.qrbe-panel-body{padding:12px 14px;display:flex;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto;}',
      '.qrbe-panel-footer{display:flex;gap:8px;padding:10px 14px;border-top:1px solid rgba(255,255,255,0.06);}',
      /* Fields */
      '.qrbe-field{display:flex;flex-direction:column;gap:3px;}',
      '.qrbe-label{font-size:0.62rem;color:rgba(240,236,224,0.5);letter-spacing:0.06em;text-transform:uppercase;}',
      '.qrbe-input{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 9px;color:#f0ece0;font-size:0.75rem;font-family:\'DM Mono\',monospace;width:100%;outline:none;}',
      '.qrbe-input:focus{border-color:rgba(255,90,31,0.5);}',
      '.qrbe-select{cursor:pointer;}',
      /* Buttons */
      '.qrbe-btn-save{flex:1;background:#ff5a1f;border:none;border-radius:7px;color:#fff;font-size:0.72rem;font-weight:600;padding:8px;cursor:pointer;font-family:\'Inter\',sans-serif;letter-spacing:0.04em;}',
      '.qrbe-btn-save:hover{background:#e04a18;}',
      '.qrbe-btn-cancel{padding:8px 12px;background:transparent;border:1px solid rgba(255,255,255,0.1);border-radius:7px;color:rgba(240,236,224,0.5);font-size:0.72rem;cursor:pointer;font-family:\'Inter\',sans-serif;}',
      /* Link/card rows */
      '.qrbe-link-row,.qrbe-card-row{display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);}',
      '.qrbe-link-num,.qrbe-card-num{min-width:18px;height:18px;background:rgba(255,90,31,0.12);border-radius:4px;color:#ff5a1f;font-size:0.6rem;display:flex;align-items:center;justify-content:center;margin-top:4px;flex-shrink:0;}',
      '.qrbe-link-fields,.qrbe-card-fields{display:flex;flex-direction:column;gap:4px;flex:1;}',
      '.qrbe-empty{font-size:0.72rem;color:rgba(240,236,224,0.35);text-align:center;padding:8px 0;}'
    ].join('\n');
    document.head.appendChild(style);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  window.QRAIVY_SMART_BLOCK_EDITOR = {

    /**
     * Initialise the editor on a container element.
     * @param {Object} options
     *   container  {HTMLElement} — where to render sections
     *   sections   {Array}       — array of { type, data } section objects
     *   slug       {string}      — page slug for draft key
     *   accent     {string}      — accent colour
     *   editorMode {boolean}     — force editor mode on
     */
    init: function (options) {
      options = options || {};

      try {
        _container = options.container || null;
        _sections  = options.sections  || [];
        _slug      = options.slug      || '';
        _accent    = options.accent    || '#ff5a1f';

        if (options.editorMode) {
          window._QRAIVY_EDITOR_MODE = true;
        }

        // Load draft if available
        if (_slug) {
          var draft = loadDraft(_slug);
          if (draft && draft.sections && draft.sections.length) {
            _sections = draft.sections;
            console.log('[SmartBlockEditor] Draft loaded for:', _slug);
          }
        }

        injectStyles();
        renderAll();

        // Close panels on outside click
        document.addEventListener('click', function (e) {
          if (_activePanel && !_activePanel.contains(e.target) &&
              !e.target.classList.contains('qrbe-edit-btn')) {
            closePanels();
          }
        });

        console.log('[SmartBlockEditor] Initialised —', _sections.length, 'sections,', isEditorMode() ? 'EDITOR MODE' : 'view mode');
      } catch (e) {
        console.warn('[SmartBlockEditor] Init failed:', e);
      }
    },

    /** Get current sections (for saving to backend) */
    getSections: function () { return _sections; },

    /** Get current draft */
    getDraft: function () { return loadDraft(_slug); },

    /** Clear draft */
    clearDraft: function () {
      try { localStorage.removeItem('qraivy_editor_draft_' + _slug); } catch (e) {}
    },

    /** Programmatically update a section */
    updateSection: function (idx, data) {
      if (!_sections[idx]) return;
      Object.assign(_sections[idx].data, data);
      rerenderSection(idx);
      saveDraft();
    },

    /** Re-render all sections */
    refresh: function () { renderAll(); },

    /** Check if currently in editor mode */
    isEditorMode: isEditorMode
  };

})();
