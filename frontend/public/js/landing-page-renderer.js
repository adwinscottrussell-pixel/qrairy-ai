/**
 * QRAIVY LANDING PAGE SECTION RENDERER — SMART BLOCK EDITOR FOUNDATION
 * ======================================================================
 * Hybrid section renderer — progressively migrates sections to structured
 * data-driven rendering while preserving existing live LP visuals.
 *
 * Architecture:
 *   landing-section-registry.js  → defines section types + fields
 *   smart-qr-categories.js       → defines category presets
 *   landing-page-renderer.js     → THIS FILE — renders sections to HTML
 *   landing-generator.js         → existing generator (untouched for core sections)
 *
 * Migration strategy (HYBRID):
 *   Migrated sections (renderer-driven): primary_cta, social_links, info_cards, featured_video
 *   Preserved sections (existing hardcoded): hero, voice_welcome, ai_assistant, wallet_pass
 *
 * Renderer output matches existing LP aesthetic:
 *   - DM Mono / Syne fonts
 *   - max-width 560px
 *   - dark background (#0a0a0a)
 *   - accent color via CSS var or inline style
 *   - mobile-first
 *
 * Usage:
 *   var html = window.QRAIVY_RENDER_SECTION({ type: 'primary_cta', data: { text: 'Get Tickets', url: '#' } });
 *   var pageHtml = window.QRAIVY_RENDER_PAGE(sections, { accent: '#ff5a1f', bizName: 'My Biz' });
 *
 * Fallback: if renderer fails, returns '' — existing LP continues to work.
 */

(function () {
  'use strict';

  // ── Shared styles (matches existing LP aesthetic) ─────────────────────────

  var BASE_STYLES = [
    '*{box-sizing:border-box;margin:0;padding:0}',
    'body{background:#0a0a0a;color:#f0ece0;font-family:\'DM Mono\',monospace;max-width:560px;width:100%;margin:0 auto;overflow-x:hidden;-webkit-font-smoothing:antialiased}',
    'a{color:inherit;text-decoration:none}',
    '.qr-section{padding:24px;margin-bottom:2px}',
    '.qr-section-title{font-family:\'Syne\',sans-serif;font-size:0.85rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;opacity:0.5;margin-bottom:14px}',
    '.qr-btn{display:block;width:100%;padding:15px 20px;border-radius:12px;border:none;font-family:\'DM Mono\',monospace;font-size:0.85rem;font-weight:600;cursor:pointer;text-align:center;text-decoration:none;transition:opacity 0.15s,transform 0.1s;letter-spacing:0.02em}',
    '.qr-btn:active{transform:scale(0.98)}',
    '.qr-btn-primary{background:var(--accent,#ff5a1f);color:#fff}',
    '.qr-btn-secondary{background:rgba(255,255,255,0.06);color:#f0ece0;border:0.5px solid rgba(255,255,255,0.12)}',
    '.qr-btn-outline{background:transparent;color:var(--accent,#ff5a1f);border:1px solid var(--accent,#ff5a1f)}',
    '.qr-card{background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.08);border-radius:14px;padding:18px;margin-bottom:10px}',
    '.qr-social-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
    '.qr-social-btn{display:flex;align-items:center;gap:10px;padding:12px 14px;background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.08);border-radius:10px;font-size:0.75rem;text-decoration:none;color:#f0ece0;transition:background 0.14s}',
    '.qr-social-btn:hover{background:rgba(255,255,255,0.08)}',
    '.qr-video-wrap{position:relative;width:100%;padding-bottom:56.25%;border-radius:12px;overflow:hidden;background:#111}',
    '.qr-video-wrap iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:none}',
    '.qr-info-grid{display:grid;grid-template-columns:1fr;gap:10px}',
    '.qr-info-card{background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px}',
    '.qr-info-card-icon{font-size:1.4rem;margin-bottom:8px}',
    '.qr-info-card-title{font-family:\'Syne\',sans-serif;font-size:0.8rem;font-weight:700;margin-bottom:4px}',
    '.qr-info-card-desc{font-size:0.7rem;opacity:0.6;line-height:1.5}'
  ].join('\n');

  // ── Helper: escape HTML ───────────────────────────────────────────────────

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Helper: convert YouTube/Vimeo URL to embed URL ────────────────────────

  function toEmbedUrl(url) {
    if (!url) return '';
    // YouTube
    var yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (yt) return 'https://www.youtube.com/embed/' + yt[1] + '?rel=0';
    // Vimeo
    var vm = url.match(/vimeo\.com\/(\d+)/);
    if (vm) return 'https://player.vimeo.com/video/' + vm[1];
    // Already an embed URL
    if (url.indexOf('embed') !== -1) return url;
    return url;
  }

  // ── Section Renderers ─────────────────────────────────────────────────────

  function renderPrimaryCTA(section) {
    var d = section.data || {};
    var text    = esc(d.text || 'Learn More');
    var url     = esc(d.url  || '#');
    var subtext = d.subtext ? '<p style="text-align:center;font-size:0.68rem;opacity:0.5;margin-top:8px;">' + esc(d.subtext) + '</p>' : '';
    var style   = d.style || 'primary';
    var cls     = style === 'secondary' ? 'qr-btn qr-btn-secondary'
                : style === 'outline'   ? 'qr-btn qr-btn-outline'
                : 'qr-btn qr-btn-primary';
    return [
      '<div class="qr-section" data-section-type="primary_cta">',
      '  <a href="' + url + '" class="' + cls + '">' + text + '</a>',
      subtext,
      '</div>'
    ].join('\n');
  }

  function renderSocialLinks(section) {
    var d = section.data || {};
    var links = Array.isArray(d.links) ? d.links : [];
    if (!links.length) return '';

    var PLATFORM_ICONS = {
      instagram: '📸', tiktok: '🎵', youtube: '▶️', spotify: '🎧',
      twitter: '𝕏', x: '𝕏', facebook: '👥', linkedin: '💼',
      twitch: '🎮', pinterest: '📌', snapchat: '👻', website: '🌐',
      email: '✉️', whatsapp: '💬', telegram: '✈️', discord: '🎮'
    };

    var cards = links.map(function (link) {
      var platform = (link.platform || 'website').toLowerCase();
      var icon  = PLATFORM_ICONS[platform] || '🔗';
      var label = esc(link.label || link.platform || 'Link');
      var href  = esc(link.url || '#');
      return '<a href="' + href + '" class="qr-social-btn" target="_blank" rel="noopener">' +
        '<span style="font-size:1.1rem;">' + icon + '</span>' +
        '<span>' + label + '</span>' +
        '</a>';
    }).join('\n');

    return [
      '<div class="qr-section" data-section-type="social_links">',
      '  <div class="qr-section-title">Links</div>',
      '  <div class="qr-social-grid">',
      cards,
      '  </div>',
      '</div>'
    ].join('\n');
  }

  function renderInfoCards(section) {
    var d = section.data || {};
    var cards = Array.isArray(d.cards) ? d.cards : [];
    if (!cards.length) return '';

    var cardHTML = cards.map(function (card) {
      return [
        '<div class="qr-info-card">',
        card.icon ? '  <div class="qr-info-card-icon">' + esc(card.icon) + '</div>' : '',
        '  <div class="qr-info-card-title">' + esc(card.title || '') + '</div>',
        card.description ? '  <div class="qr-info-card-desc">' + esc(card.description) + '</div>' : '',
        '</div>'
      ].filter(Boolean).join('\n');
    }).join('\n');

    var headline = d.headline ? '<div class="qr-section-title">' + esc(d.headline) + '</div>' : '';

    return [
      '<div class="qr-section" data-section-type="info_cards">',
      headline,
      '  <div class="qr-info-grid">',
      cardHTML,
      '  </div>',
      '</div>'
    ].join('\n');
  }

  function renderFeaturedVideo(section) {
    var d = section.data || {};
    var url     = d.url || '';
    var caption = d.caption || '';
    if (!url) return '';

    var embedUrl = toEmbedUrl(url);
    var cap = caption ? '<p style="font-size:0.68rem;opacity:0.5;margin-top:10px;text-align:center;">' + esc(caption) + '</p>' : '';

    return [
      '<div class="qr-section" data-section-type="featured_video">',
      '  <div class="qr-video-wrap">',
      '    <iframe src="' + esc(embedUrl) + '" allowfullscreen loading="lazy" title="' + esc(caption || 'Video') + '"></iframe>',
      '  </div>',
      cap,
      '</div>'
    ].join('\n');
  }

  // ── Stub renderers for future migration ──────────────────────────────────
  // These return '' for now — existing hardcoded sections handle them.
  // As the editor matures, replace stubs with full renderers.

  function renderStub(section) {
    // Intentionally returns empty — preserved by existing renderer
    return '';
  }

  // ── Main section dispatcher ───────────────────────────────────────────────

  function renderSection(section) {
    if (!section || !section.type) return '';
    try {
      switch (section.type) {
        // Migrated sections (renderer-driven)
        case 'primary_cta':     return renderPrimaryCTA(section);
        case 'social_links':    return renderSocialLinks(section);
        case 'info_cards':      return renderInfoCards(section);
        case 'featured_video':  return renderFeaturedVideo(section);

        // Preserved sections — handled by existing LP renderer, return '' here
        case 'hero':            return renderStub(section);
        case 'voice_welcome':   return renderStub(section);
        case 'ai_assistant':    return renderStub(section);
        case 'wallet_pass':     return renderStub(section);
        case 'subscribe':       return renderStub(section);

        // Unknown — safe fallback
        default:
          return '';
      }
    } catch (e) {
      console.warn('[QRAIVY Renderer] Section render failed:', section.type, e);
      return '';
    }
  }

  // ── Page renderer ─────────────────────────────────────────────────────────

  function renderPage(sections, options) {
    if (!Array.isArray(sections)) return '';
    options = options || {};

    try {
      // Validate section list using registry if available
      var validatedSections = sections;
      if (window.QRAIVY_LANDING_SECTION_UTIL && window.QRAIVY_LANDING_SECTION_UTIL.validateSectionList) {
        var sectionTypes = sections.map(function (s) { return s.type || s; });
        var result = window.QRAIVY_LANDING_SECTION_UTIL.validateSectionList(sectionTypes);
        if (result.warnings && result.warnings.length) {
          result.warnings.forEach(function (w) { console.warn('[QRAIVY Renderer]', w); });
        }
        // Re-map validated types back to full section objects
        validatedSections = result.sections.map(function (type) {
          return sections.find(function (s) { return (s.type || s) === type; }) || { type: type, data: {} };
        });
      }

      var accent = options.accent || '#ff5a1f';
      var html = validatedSections
        .map(function (section) { return renderSection(section); })
        .filter(Boolean)
        .join('\n');

      // Wrap with accent CSS var if rendering standalone
      if (options.standalone) {
        return [
          '<style>',
          ':root { --accent: ' + accent + '; }',
          BASE_STYLES,
          '</style>',
          html
        ].join('\n');
      }

      return html;

    } catch (e) {
      console.warn('[QRAIVY Renderer] Page render failed:', e);
      return '';
    }
  }

  // ── Expose globally ───────────────────────────────────────────────────────

  window.QRAIVY_RENDER_SECTION = renderSection;
  window.QRAIVY_RENDER_PAGE    = renderPage;

  // Also expose styles for use by editor/preview
  window.QRAIVY_RENDERER_BASE_STYLES = BASE_STYLES;

})();
