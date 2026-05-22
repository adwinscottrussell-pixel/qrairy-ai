/**
 * QRAIVY LANDING PAGE SECTION REGISTRY — SMART BLOCK EDITOR FOUNDATION
 * ======================================================================
 * Single source of truth for all landing page section/block types.
 *
 * Powers (when wired in future steps):
 *   - Category presets (defaultSections validation)
 *   - Generated page structures
 *   - Editor block menu
 *   - Add-section panel
 *   - Inline editing field definitions
 *   - Drag/reorder rules
 *   - AI section generation hints
 *
 * LOCKED CORE SECTIONS: hero, voice_welcome, ai_assistant
 *   These are Qraivy's core product differentiators.
 *   They must remain near the top of every Smart Landing Page.
 *   locked: true — not removable, not reorderable.
 *
 * Load order: landing-section-registry.js → smart-qr-categories.js
 * This file is safe to load independently; fails gracefully if missing.
 */

(function () {
  'use strict';

  // ── Section Definitions ───────────────────────────────────────────────────

  var SECTIONS = [

    // ── CORE LOCKED (Qraivy differentiators — always present, always near top) ──

    {
      type: 'hero',
      label: 'Hero',
      group: 'core',
      description: 'Full-width hero with business name, tagline, and primary CTA.',
      locked: true,
      editable: true,
      reorderable: false,
      removable: false,
      defaultData: {
        headline: 'Welcome to {businessName}',
        tagline: '',
        ctaText: 'Learn More',
        ctaUrl: '',
        backgroundStyle: 'gradient'
      },
      editorFields: [
        { key: 'headline',        label: 'Headline',          type: 'text' },
        { key: 'tagline',         label: 'Tagline',           type: 'text' },
        { key: 'ctaText',         label: 'CTA Button Text',   type: 'text' },
        { key: 'ctaUrl',          label: 'CTA Link',          type: 'url' },
        { key: 'backgroundStyle', label: 'Background Style',  type: 'select', options: ['gradient', 'image', 'solid', 'dark'] }
      ]
    },

    {
      type: 'voice_welcome',
      label: 'Voice Welcome',
      group: 'core',
      description: 'Personal audio greeting from the business owner.',
      locked: true,
      editable: true,
      reorderable: false,
      removable: false,
      defaultData: {
        audioUrl: '',
        speakerName: '',
        label: 'Personal welcome message'
      },
      editorFields: [
        { key: 'audioUrl',    label: 'Audio File URL',  type: 'url' },
        { key: 'speakerName', label: 'Speaker Name',    type: 'text' },
        { key: 'label',       label: 'Player Label',    type: 'text' }
      ]
    },

    {
      type: 'ai_assistant',
      label: 'AI Assistant',
      group: 'core',
      description: 'Live AI chat — answers visitor questions 24/7.',
      locked: true,
      editable: true,
      reorderable: false,
      removable: false,
      defaultData: {
        greeting: 'Hi! How can I help you today?',
        knowledgeHint: '',
        accentColor: '#ff5a1f'
      },
      editorFields: [
        { key: 'greeting',      label: 'Opening Greeting',  type: 'text' },
        { key: 'knowledgeHint', label: 'Knowledge Hint',    type: 'textarea' },
        { key: 'accentColor',   label: 'Accent Colour',     type: 'color' }
      ]
    },

    // ── CONVERSION ────────────────────────────────────────────────────────────

    {
      type: 'primary_cta',
      label: 'Primary CTA',
      group: 'conversion',
      description: 'High-converting action button with optional subtext.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { text: 'Get Started', url: '', subtext: '', style: 'primary' },
      editorFields: [
        { key: 'text',    label: 'Button Text',  type: 'text' },
        { key: 'url',     label: 'Link URL',     type: 'url' },
        { key: 'subtext', label: 'Subtext',      type: 'text' },
        { key: 'style',   label: 'Style',        type: 'select', options: ['primary', 'secondary', 'outline'] }
      ]
    },

    {
      type: 'subscribe',
      label: 'Subscribe / Email Capture',
      group: 'conversion',
      description: 'Email opt-in form for subscriber list growth.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { headline: 'Stay in the loop', placeholder: 'your@email.com', buttonText: 'Subscribe' },
      editorFields: [
        { key: 'headline',    label: 'Headline',          type: 'text' },
        { key: 'placeholder', label: 'Input Placeholder', type: 'text' },
        { key: 'buttonText',  label: 'Button Text',       type: 'text' }
      ]
    },

    {
      type: 'wallet_pass',
      label: 'Wallet Pass',
      group: 'conversion',
      description: 'Apple & Google Wallet pass — loyalty, membership, or ticket.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { label: 'Save to Wallet', passType: 'generic' },
      editorFields: [
        { key: 'label',    label: 'Button Label', type: 'text' },
        { key: 'passType', label: 'Pass Type',    type: 'select', options: ['generic', 'loyalty', 'ticket', 'membership'] }
      ]
    },

    {
      type: 'booking_cta',
      label: 'Booking CTA',
      group: 'conversion',
      description: 'One-tap booking button linking to calendar or booking system.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { text: 'Book Now', url: '', platform: 'generic' },
      editorFields: [
        { key: 'text',     label: 'Button Text',    type: 'text' },
        { key: 'url',      label: 'Booking URL',    type: 'url' },
        { key: 'platform', label: 'Platform',       type: 'select', options: ['generic', 'calendly', 'square', 'booksy', 'opentable'] }
      ]
    },

    {
      type: 'reservation_cta',
      label: 'Reservation CTA',
      group: 'conversion',
      description: 'Restaurant table reservation button.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { text: 'Reserve a Table', url: '' },
      editorFields: [
        { key: 'text', label: 'Button Text',    type: 'text' },
        { key: 'url',  label: 'Reservation URL', type: 'url' }
      ]
    },

    {
      type: 'ticket_cta',
      label: 'Ticket CTA',
      group: 'conversion',
      description: 'Event ticket purchase button.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { text: 'Get Tickets', url: '', urgencyText: '' },
      editorFields: [
        { key: 'text',        label: 'Button Text',   type: 'text' },
        { key: 'url',         label: 'Ticket URL',    type: 'url' },
        { key: 'urgencyText', label: 'Urgency Text',  type: 'text' }
      ]
    },

    // ── CONTENT ───────────────────────────────────────────────────────────────

    {
      type: 'social_links',
      label: 'Social Links',
      group: 'content',
      description: 'All social platform links in one section.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { links: [] },
      editorFields: [
        { key: 'links', label: 'Social Links', type: 'link_list' }
      ]
    },

    {
      type: 'featured_video',
      label: 'Featured Video',
      group: 'content',
      description: 'Embed a YouTube, Vimeo, or hosted video.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { url: '', caption: '' },
      editorFields: [
        { key: 'url',     label: 'Video URL',  type: 'url' },
        { key: 'caption', label: 'Caption',    type: 'text' }
      ]
    },

    {
      type: 'gallery',
      label: 'Photo Gallery',
      group: 'content',
      description: 'Grid or carousel of photos.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { images: [], layout: 'grid' },
      editorFields: [
        { key: 'images', label: 'Images',  type: 'image_list' },
        { key: 'layout', label: 'Layout',  type: 'select', options: ['grid', 'carousel', 'masonry'] }
      ]
    },

    {
      type: 'info_cards',
      label: 'Info Cards',
      group: 'content',
      description: 'Flexible card grid for features, services, or highlights.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { cards: [] },
      editorFields: [
        { key: 'cards', label: 'Cards', type: 'card_list' }
      ]
    },

    {
      type: 'faq',
      label: 'FAQ',
      group: 'content',
      description: 'Frequently asked questions with expandable answers.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { questions: [] },
      editorFields: [
        { key: 'questions', label: 'Questions', type: 'faq_list' }
      ]
    },

    {
      type: 'testimonials',
      label: 'Testimonials',
      group: 'content',
      description: 'Customer reviews and social proof.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { items: [] },
      editorFields: [
        { key: 'items', label: 'Testimonials', type: 'testimonial_list' }
      ]
    },

    // ── COMMERCE ──────────────────────────────────────────────────────────────

    {
      type: 'product_grid',
      label: 'Product Grid',
      group: 'commerce',
      description: 'Showcase products with images, names, and prices.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { products: [], columns: 2 },
      editorFields: [
        { key: 'products', label: 'Products', type: 'product_list' },
        { key: 'columns',  label: 'Columns',  type: 'select', options: ['1', '2', '3'] }
      ]
    },

    {
      type: 'featured_offer',
      label: 'Featured Offer',
      group: 'commerce',
      description: 'Highlighted discount, deal, or promotion.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { headline: 'Limited Offer', description: '', badgeText: 'SALE', ctaText: 'Claim Now', ctaUrl: '' },
      editorFields: [
        { key: 'headline',    label: 'Headline',    type: 'text' },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'badgeText',   label: 'Badge Text',  type: 'text' },
        { key: 'ctaText',     label: 'CTA Text',    type: 'text' },
        { key: 'ctaUrl',      label: 'CTA URL',     type: 'url' }
      ]
    },

    {
      type: 'merch',
      label: 'Merch Store',
      group: 'commerce',
      description: 'Official merchandise links and featured items.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { storeUrl: '', items: [] },
      editorFields: [
        { key: 'storeUrl', label: 'Store URL', type: 'url' },
        { key: 'items',    label: 'Items',     type: 'product_list' }
      ]
    },

    {
      type: 'delivery_info',
      label: 'Delivery Info',
      group: 'commerce',
      description: 'Shipping, delivery, and returns information.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { shippingText: '', returnsText: '', estimateText: '' },
      editorFields: [
        { key: 'shippingText',  label: 'Shipping Info', type: 'textarea' },
        { key: 'returnsText',   label: 'Returns Policy', type: 'textarea' },
        { key: 'estimateText',  label: 'Delivery Estimate', type: 'text' }
      ]
    },

    {
      type: 'reviews',
      label: 'Reviews',
      group: 'commerce',
      description: 'Star ratings and customer reviews widget.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { source: 'google', reviewCount: 0, averageRating: 5 },
      editorFields: [
        { key: 'source',        label: 'Review Source', type: 'select', options: ['google', 'trustpilot', 'yelp', 'manual'] },
        { key: 'reviewCount',   label: 'Review Count',  type: 'number' },
        { key: 'averageRating', label: 'Average Rating', type: 'number' }
      ]
    },

    // ── CATEGORY SPECIFIC ─────────────────────────────────────────────────────

    {
      type: 'menu',
      label: 'Digital Menu',
      group: 'category',
      description: 'Restaurant menu with sections, items, and prices.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { sections: [] },
      editorFields: [{ key: 'sections', label: 'Menu Sections', type: 'menu_list' }]
    },

    {
      type: 'hours_location',
      label: 'Hours & Location',
      group: 'category',
      description: 'Opening hours, address, and map link.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { address: '', hours: [], mapUrl: '' },
      editorFields: [
        { key: 'address', label: 'Address',      type: 'text' },
        { key: 'hours',   label: 'Opening Hours', type: 'hours_list' },
        { key: 'mapUrl',  label: 'Map URL',       type: 'url' }
      ]
    },

    {
      type: 'event_info',
      label: 'Event Info',
      group: 'category',
      description: 'Event date, time, venue, and description.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { date: '', time: '', venue: '', description: '' },
      editorFields: [
        { key: 'date',        label: 'Date',        type: 'date' },
        { key: 'time',        label: 'Time',        type: 'text' },
        { key: 'venue',       label: 'Venue Name',  type: 'text' },
        { key: 'description', label: 'Description', type: 'textarea' }
      ]
    },

    {
      type: 'lineup',
      label: 'Lineup',
      group: 'category',
      description: 'Event lineup or schedule of performers/speakers.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { items: [] },
      editorFields: [{ key: 'items', label: 'Lineup Items', type: 'lineup_list' }]
    },

    {
      type: 'venue',
      label: 'Venue',
      group: 'category',
      description: 'Venue details, map, and directions.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { name: '', address: '', mapUrl: '', directions: '' },
      editorFields: [
        { key: 'name',       label: 'Venue Name',  type: 'text' },
        { key: 'address',    label: 'Address',     type: 'text' },
        { key: 'mapUrl',     label: 'Map URL',     type: 'url' },
        { key: 'directions', label: 'Directions',  type: 'textarea' }
      ]
    },

    {
      type: 'countdown',
      label: 'Countdown Timer',
      group: 'category',
      description: 'Live countdown to event date.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { targetDate: '', label: 'Event starts in' },
      editorFields: [
        { key: 'targetDate', label: 'Target Date', type: 'datetime' },
        { key: 'label',      label: 'Label',       type: 'text' }
      ]
    },

    {
      type: 'music_links',
      label: 'Music Links',
      group: 'category',
      description: 'Streaming platform links — Spotify, Apple Music, etc.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { links: [] },
      editorFields: [{ key: 'links', label: 'Platform Links', type: 'link_list' }]
    },

    {
      type: 'latest_release',
      label: 'Latest Release',
      group: 'category',
      description: 'Featured latest music release or album.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { title: '', coverUrl: '', streamUrl: '', releaseDate: '' },
      editorFields: [
        { key: 'title',       label: 'Release Title',  type: 'text' },
        { key: 'coverUrl',    label: 'Cover Image URL', type: 'url' },
        { key: 'streamUrl',   label: 'Stream URL',     type: 'url' },
        { key: 'releaseDate', label: 'Release Date',   type: 'date' }
      ]
    },

    {
      type: 'tour_dates',
      label: 'Tour Dates',
      group: 'category',
      description: 'Upcoming shows and tour schedule.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { dates: [] },
      editorFields: [{ key: 'dates', label: 'Tour Dates', type: 'tour_list' }]
    },

    {
      type: 'fan_club',
      label: 'Fan Club',
      group: 'category',
      description: 'Exclusive access for fans — perks, giveaways, community.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { headline: 'Join the Fan Club', description: '', ctaText: 'Join Now', ctaUrl: '' },
      editorFields: [
        { key: 'headline',    label: 'Headline',    type: 'text' },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'ctaText',     label: 'CTA Text',    type: 'text' },
        { key: 'ctaUrl',      label: 'CTA URL',     type: 'url' }
      ]
    },

    {
      type: 'services',
      label: 'Services',
      group: 'category',
      description: 'List of services offered with descriptions and pricing.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { items: [] },
      editorFields: [{ key: 'items', label: 'Services', type: 'service_list' }]
    },

    {
      type: 'map_location',
      label: 'Map & Location',
      group: 'category',
      description: 'Embedded map and address for local businesses.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { address: '', mapEmbedUrl: '', lat: null, lng: null },
      editorFields: [
        { key: 'address',      label: 'Address',        type: 'text' },
        { key: 'mapEmbedUrl',  label: 'Map Embed URL',  type: 'url' }
      ]
    },

    {
      type: 'contact_buttons',
      label: 'Contact Buttons',
      group: 'category',
      description: 'Quick contact actions — call, WhatsApp, email.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { phone: '', whatsapp: '', email: '' },
      editorFields: [
        { key: 'phone',    label: 'Phone Number', type: 'tel' },
        { key: 'whatsapp', label: 'WhatsApp',     type: 'tel' },
        { key: 'email',    label: 'Email',        type: 'email' }
      ]
    },

    {
      type: 'coaching_plans',
      label: 'Coaching Plans',
      group: 'category',
      description: 'Fitness or coaching membership tiers and pricing.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { plans: [] },
      editorFields: [{ key: 'plans', label: 'Plans', type: 'plan_list' }]
    },

    {
      type: 'class_schedule',
      label: 'Class Schedule',
      group: 'category',
      description: 'Weekly class timetable.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { classes: [] },
      editorFields: [{ key: 'classes', label: 'Classes', type: 'schedule_list' }]
    },

    {
      type: 'transformation_gallery',
      label: 'Transformation Gallery',
      group: 'category',
      description: 'Before/after results gallery.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { items: [] },
      editorFields: [{ key: 'items', label: 'Transformations', type: 'before_after_list' }]
    },

    {
      type: 'nutrition',
      label: 'Nutrition',
      group: 'category',
      description: 'Nutrition plans, tips, or macro guidance.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { headline: 'Nutrition', content: '' },
      editorFields: [
        { key: 'headline', label: 'Headline', type: 'text' },
        { key: 'content',  label: 'Content',  type: 'textarea' }
      ]
    },

    {
      type: 'custom_links',
      label: 'Custom Links',
      group: 'category',
      description: 'Flexible list of custom links for any use case.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { links: [] },
      editorFields: [{ key: 'links', label: 'Links', type: 'link_list' }]
    },

    {
      type: 'affiliate_links',
      label: 'Affiliate Links',
      group: 'content',
      description: 'Curated affiliate or partner product links.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { links: [] },
      editorFields: [{ key: 'links', label: 'Affiliate Links', type: 'link_list' }]
    },

    {
      type: 'newsletter',
      label: 'Newsletter',
      group: 'content',
      description: 'Newsletter sign-up with platform integration.',
      locked: false, editable: true, reorderable: true, removable: true,
      defaultData: { headline: 'Join the Newsletter', platform: 'generic', ctaText: 'Subscribe' },
      editorFields: [
        { key: 'headline',  label: 'Headline',   type: 'text' },
        { key: 'platform',  label: 'Platform',   type: 'select', options: ['generic', 'mailchimp', 'convertkit', 'beehiiv'] },
        { key: 'ctaText',   label: 'CTA Text',   type: 'text' }
      ]
    }

  ];

  // ── Expose globally ───────────────────────────────────────────────────────

  window.QRAIVY_LANDING_SECTION_REGISTRY = SECTIONS;

  // ── Utility methods ───────────────────────────────────────────────────────

  window.QRAIVY_LANDING_SECTION_UTIL = {

    /** Get a section definition by type */
    get: function (type) {
      return SECTIONS.find(function (s) { return s.type === type; }) || null;
    },

    /** Get all section definitions */
    all: function () {
      return SECTIONS.slice();
    },

    /** Get sections filtered by group */
    byGroup: function (group) {
      return SECTIONS.filter(function (s) { return s.group === group; });
    },

    /** Check if a section type is locked */
    isLocked: function (type) {
      var s = this.get(type);
      return s ? !!s.locked : false;
    },

    /** Get editable fields for a section type */
    editableFields: function (type) {
      var s = this.get(type);
      return (s && s.editable) ? (s.editorFields || []) : [];
    },

    /**
     * Validate and normalise a section type list.
     * - Removes unknown section types (with console warning)
     * - Ensures core locked sections exist
     * - Enforces ordering: hero → voice_welcome → ai_assistant → rest
     * Returns { valid: boolean, sections: string[], warnings: string[] }
     */
    validateSectionList: function (sectionTypes) {
      if (!Array.isArray(sectionTypes)) {
        return { valid: false, sections: [], warnings: ['sectionTypes must be an array'] };
      }

      var warnings = [];
      var knownTypes = SECTIONS.map(function (s) { return s.type; });
      var CORE = ['hero', 'voice_welcome', 'ai_assistant'];

      // Filter out unknown types
      var filtered = sectionTypes.filter(function (t) {
        if (knownTypes.indexOf(t) === -1) {
          warnings.push('Unknown section type ignored: ' + t);
          return false;
        }
        return true;
      });

      // Ensure core sections exist
      CORE.forEach(function (c) {
        if (filtered.indexOf(c) === -1) {
          filtered.unshift(c);
          warnings.push('Required core section added: ' + c);
        }
      });

      // Enforce core ordering at top: hero, voice_welcome, ai_assistant
      var nonCore = filtered.filter(function (t) { return CORE.indexOf(t) === -1; });
      var ordered = CORE.concat(nonCore);

      return {
        valid: warnings.length === 0,
        sections: ordered,
        warnings: warnings
      };
    },

    /** List all available groups */
    groups: function () {
      var groups = [];
      SECTIONS.forEach(function (s) {
        if (groups.indexOf(s.group) === -1) groups.push(s.group);
      });
      return groups;
    }

  };

})();
