
// ── Smart Block Editor init for smart-qr-detail.html ─────────────────────
(function() {
  // Default demo sections for editor preview
  // In production these would come from the LP data stored on backend
  var DEFAULT_SECTIONS = [
    {
      type: 'primary_cta',
      data: { text: 'View Full Page', url: '', style: 'primary' }
    },
    {
      type: 'social_links',
      data: {
        links: [
          { platform: 'instagram', label: 'Instagram', url: '' },
          { platform: 'website',   label: 'Website',   url: '' }
        ]
      }
    },
    {
      type: 'info_cards',
      data: {
        headline: 'About',
        cards: [
          { icon: '✨', title: 'Feature One', description: 'Describe your first key feature or service.' },
          { icon: '🎯', title: 'Feature Two', description: 'Describe your second key feature or service.' }
        ]
      }
    }
  ];

  var editBtn     = document.getElementById('sqd-edit-page-btn');
  var editSection = document.getElementById('sqd-edit-section');
  var exitBtn     = document.getElementById('sqd-exit-edit-btn');
  var saveBtn     = document.getElementById('sqd-save-draft-btn');
  var container   = document.getElementById('sqd-editor-container');
  var initialized = false;

  function getSlug() {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get('slug') || params.get('id') || 'demo';
    } catch(e) { return 'demo'; }
  }

  function getAccent() {
    // Try to get accent from page state if available
    if (window.QRAivySession && window.QRAivySession.accent) return window.QRAivySession.accent;
    return '#ff5a1f';
  }

  function initEditor() {
    if (initialized) return;
    if (!window.QRAIVY_SMART_BLOCK_EDITOR || !window.QRAIVY_RENDER_SECTION) {
      container.innerHTML = '<div style="text-align:center;padding:24px;color:rgba(240,236,224,0.72);font-size:0.75rem;">Editor not available — refresh page.</div>';
      return;
    }

    var slug = getSlug();

    // Try to load sections from existing LP data or use defaults
    var sections = DEFAULT_SECTIONS;

    // Check if there's LP data in window (set by smart-qr-detail init)
    if (window._sqd_lp_sections && window._sqd_lp_sections.length) {
      sections = window._sqd_lp_sections;
    }

    // Inject renderer base styles if not already present
    if (!document.getElementById('qraivy-renderer-styles') && window.QRAIVY_RENDERER_BASE_STYLES) {
      var s = document.createElement('style');
      s.id = 'qraivy-renderer-styles';
      s.textContent = ':root{--accent:' + getAccent() + '}' + window.QRAIVY_RENDERER_BASE_STYLES;
      document.head.appendChild(s);
    }
    window.QRAIVY_SMART_BLOCK_EDITOR.init({
      container:  container,
      sections:   sections,
      slug:       slug,
      accent:     getAccent(),
      editorMode: true
    });

    initialized = true;
  }

  if (editBtn) {
    editBtn.addEventListener('click', function() {
      if (!editSection) return;
      var isVisible = editSection.style.display !== 'none';
      if (isVisible) {
        editSection.style.display = 'none';
        editBtn.textContent = '✏️ Edit Page Sections';
      } else {
        editSection.style.display = 'block';
        editBtn.textContent = '✏️ Close Editor';
        editSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        initEditor();
      }
    });
  }

  if (exitBtn) {
    exitBtn.addEventListener('click', function() {
      if (editSection) editSection.style.display = 'none';
      if (editBtn) editBtn.textContent = '✏️ Edit Page Sections';
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      if (!window.QRAIVY_SMART_BLOCK_EDITOR) return;
      var sections = window.QRAIVY_SMART_BLOCK_EDITOR.getSections();
      console.log('[SmartBlockEditor] Sections to save:', JSON.stringify(sections, null, 2));
      saveBtn.textContent = '✓ Saved!';
      saveBtn.style.background = 'rgba(34,212,126,0.15)';
      saveBtn.style.borderColor = 'rgba(34,212,126,0.4)';
      saveBtn.style.color = '#22d47e';
      setTimeout(function() {
        saveBtn.textContent = 'Save Draft';
        saveBtn.style.background = '';
        saveBtn.style.borderColor = '';
        saveBtn.style.color = '';
      }, 2000);
    });
  }

  // Auto-open editor if URL has ?edit=true
  if (window.location.search.indexOf('edit=true') !== -1) {
    if (editSection) editSection.style.display = 'block';
    if (editBtn) editBtn.textContent = '✏️ Close Editor';
    document.addEventListener('DOMContentLoaded', initEditor);
  }
})();

