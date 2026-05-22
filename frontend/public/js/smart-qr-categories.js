/**
 * QRAIVY SMART QR CATEGORIES — SINGLE SOURCE OF TRUTH
 * =====================================================
 * This file is the canonical category configuration for all Smart QR features.
 *
 * Powers (when wired in Step 2+):
 *   - public smart-demo.html wizard
 *   - authenticated dashboard onboarding wizard
 *   - landing page presets
 *   - editor presets
 *   - AI generation prompts
 *   - template intelligence
 *
 * DO NOT duplicate category definitions elsewhere.
 * All category-dependent UI should import from window.QRAIVY_SMART_QR_CATEGORIES.
 *
 * Core locked sections (present in every category):
 *   hero, voice_welcome, ai_assistant
 * These represent Qraivy's core product identity and must not be removed.
 */

(function () {
  'use strict';

  window.QRAIVY_SMART_QR_CATEGORIES = [

    {
      slug: 'restaurant',
      label: 'Restaurant',
      description: 'Menus, reservations & offers',
      icon: '🍽️',
      defaultTheme: 'restaurant-dark',
      defaultCTA: 'View Menu',
      defaultSections: [
        'hero',
        'voice_welcome',
        'ai_assistant',
        'menu',
        'reservation_cta',
        'offers',
        'hours_location',
        'wallet_pass',
        'subscribe'
      ],
      aiPromptHint: 'Generate a restaurant Smart QR landing page focused on menus, reservations, offers, reviews, and local discovery.'
    },

    {
      slug: 'creator',
      label: 'Creator / Influencer',
      description: 'Links, videos & fan engagement',
      icon: '✨',
      defaultTheme: 'creator-dark',
      defaultCTA: 'Follow Now',
      defaultSections: [
        'hero',
        'voice_welcome',
        'ai_assistant',
        'social_links',
        'featured_video',
        'affiliate_links',
        'newsletter',
        'wallet_pass',
        'subscribe'
      ],
      aiPromptHint: 'Generate a creator or influencer Smart QR landing page focused on social links, video content, fan engagement, and newsletter growth.'
    },

    {
      slug: 'artist_music',
      label: 'Artist / Music',
      description: 'Releases, tickets & fan links',
      icon: '🎵',
      defaultTheme: 'music-dark',
      defaultCTA: 'Stream Now',
      defaultSections: [
        'hero',
        'voice_welcome',
        'ai_assistant',
        'music_links',
        'latest_release',
        'tour_dates',
        'merch',
        'fan_club',
        'subscribe'
      ],
      aiPromptHint: 'Generate a music artist Smart QR landing page focused on streaming links, latest releases, tour dates, merch, and fan community.'
    },

    {
      slug: 'event',
      label: 'Event',
      description: 'Tickets, RSVP & live updates',
      icon: '🎟️',
      defaultTheme: 'event-dark',
      defaultCTA: 'Get Tickets',
      defaultSections: [
        'hero',
        'voice_welcome',
        'ai_assistant',
        'ticket_cta',
        'event_info',
        'lineup',
        'venue',
        'countdown',
        'wallet_pass',
        'subscribe'
      ],
      aiPromptHint: 'Generate an event Smart QR landing page focused on ticket sales, RSVP, lineup, venue info, and real-time event updates.'
    },

    {
      slug: 'ecommerce',
      label: 'Ecommerce',
      description: 'Products, offers & sales',
      icon: '🛒',
      defaultTheme: 'ecommerce-dark',
      defaultCTA: 'Shop Now',
      defaultSections: [
        'hero',
        'voice_welcome',
        'ai_assistant',
        'product_grid',
        'featured_offer',
        'delivery_info',
        'reviews',
        'wallet_pass',
        'subscribe'
      ],
      aiPromptHint: 'Generate an ecommerce Smart QR landing page focused on products, featured offers, delivery information, customer reviews, and conversions.'
    },

    {
      slug: 'local_business',
      label: 'Local Business',
      description: 'Reviews, bookings & customer actions',
      icon: '🏪',
      defaultTheme: 'local-dark',
      defaultCTA: 'Contact Us',
      defaultSections: [
        'hero',
        'voice_welcome',
        'ai_assistant',
        'services',
        'booking_cta',
        'reviews',
        'map_location',
        'contact_buttons',
        'subscribe'
      ],
      aiPromptHint: 'Generate a local business Smart QR landing page focused on services, bookings, customer reviews, location, and direct contact actions.'
    },

    {
      slug: 'fitness',
      label: 'Fitness',
      description: 'Coaching, memberships & classes',
      icon: '💪',
      defaultTheme: 'fitness-dark',
      defaultCTA: 'Start Today',
      defaultSections: [
        'hero',
        'voice_welcome',
        'ai_assistant',
        'coaching_plans',
        'class_schedule',
        'transformation_gallery',
        'booking_cta',
        'nutrition',
        'subscribe'
      ],
      aiPromptHint: 'Generate a fitness Smart QR landing page focused on coaching plans, class schedules, transformation results, booking, and community engagement.'
    },

    {
      slug: 'other',
      label: 'Other',
      description: 'Let AI build a custom Smart QR',
      icon: '⚡',
      defaultTheme: 'default-dark',
      defaultCTA: 'Learn More',
      defaultSections: [
        'hero',
        'voice_welcome',
        'ai_assistant',
        'custom_links',
        'primary_cta',
        'info_cards',
        'subscribe'
      ],
      aiPromptHint: 'Generate a custom Smart QR landing page tailored to the business name and context provided. Focus on engagement, information, and conversions.'
    }

  ];

  /**
   * Helper: get category by slug
   * Usage: QRAIVY_SMART_QR_CATEGORIES_UTIL.get('restaurant')
   */
  window.QRAIVY_SMART_QR_CATEGORIES_UTIL = {
    get: function (slug) {
      return window.QRAIVY_SMART_QR_CATEGORIES.find(function (c) {
        return c.slug === slug;
      }) || null;
    },
    slugs: function () {
      return window.QRAIVY_SMART_QR_CATEGORIES.map(function (c) { return c.slug; });
    },
    labels: function () {
      return window.QRAIVY_SMART_QR_CATEGORIES.map(function (c) {
        return { slug: c.slug, label: c.label };
      });
    }
  };

})();
