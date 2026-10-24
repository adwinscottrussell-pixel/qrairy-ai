/*
 * studio-demo.js — the design the Studio shell shows in local mode: the
 * approved Local Business layout (Bäckerei Staib reference) with
 * placeholder content only. No customer branding, no photos (the preview
 * shows image placeholders). Becomes the Local Business template in 2A-4.
 */
(function () {
  window.QRAIVY_STUDIO_DEMO = {
    businessName: 'Musterbäckerei',
    design: {
      schemaVersion: 1,
      // QRAIVY default colours (near-black navy, white, orange accent).
      theme: { palette: { brand: '#ff5a1f' }, fontPair: 'serif-display', radius: 'md' },
      settings: { language: 'de', seo: { title: 'Musterbäckerei – Tradition trifft Genuss', description: 'Frische Backwaren aus der Region.' } },
      header: { showBusinessName: true, nav: [
        { label: 'Start', target: '/' }, { label: 'Angebote', target: '/angebote' }, { label: 'Stempelkarte', target: '/stempelkarte' },
        { label: 'Produkte', target: '/produkte' }, { label: 'Kontakt', target: '/kontakt' }] },
      footer: { text: 'Musterbäckerei · Musterstraße 1 · 89073 Ulm', links: [] },
      pages: [{ id: 'start', title: 'Start', sections: [
        { id: 's_hero01', type: 'hero', variant: 'split', data: {
          eyebrow: 'Frisch · Regional · Mit Herz', headline: 'Tradition trifft Genuss', subheadline: 'Unsere Backwaren – täglich frisch\nin Ulm und Umgebung.',
          primary: { text: 'Unsere Angebote', target: '/angebote', icon: 'tag' }, secondary: { text: 'Standorte', target: '/kontakt', icon: 'pin' } } },
        { id: 's_quick01', type: 'buttons', variant: 'cards', data: { items: [
          { label: 'Stempelkarte', subtitle: 'Punkte sammeln', kind: 'link', target: '/stempelkarte', icon: 'gift' },
          { label: 'Angebote', subtitle: 'Aktuelle Aktionen', kind: 'link', target: '/angebote', icon: 'tag' },
          { label: 'Unsere Produkte', subtitle: 'Jetzt entdecken', kind: 'link', target: '/produkte', icon: 'cart' },
          { label: 'Kontakt', subtitle: 'So erreichen Sie uns', kind: 'link', target: '/kontakt', icon: 'phone' }] } },
        { id: 's_deals01', type: 'dealsOffers', anchor: 'angebote', data: { title: 'Aktuelle Angebote', subtitle: 'Unsere Highlights', maxItems: 3, showAllText: 'Alle Angebote anzeigen', showAllTarget: '/angebote' } },
        { id: 's_loyal01', type: 'loyalty', anchor: 'stempelkarte', style: { background: 'alt' }, data: { title: 'Unsere Stempelkarte', subtitle: 'Jeder 10. Kaffee geht aufs Haus.' } },
        { id: 's_prod01', type: 'products', anchor: 'produkte', data: { title: 'Unsere Produkte', items: [
          { name: 'Bauernbrot', description: 'Sauerteig, 1 kg', price: '4,20 €' }, { name: 'Butter-Croissant', price: '1,40 €' }, { name: 'Laugenbrezel', price: '0,95 €' }] } },
        { id: 's_text01', type: 'text', variant: 'plain', anchor: 'ueber-uns', data: { heading: 'Über uns',
          body: 'Seit drei Generationen backen wir in Ulm nach überlieferten Rezepten – mit Mehl aus der Region und viel Zeit für den Teig.\nJeden Morgen ab 6:30 Uhr frisch aus dem Ofen.' } },
        { id: 's_hours01', type: 'openingHours', style: { background: 'alt' }, data: { title: 'Öffnungszeiten', days: [
          { day: 'mon', ranges: [{ open: '06:30', close: '18:00' }] }, { day: 'tue', ranges: [{ open: '06:30', close: '18:00' }] },
          { day: 'wed', ranges: [{ open: '06:30', close: '18:00' }] }, { day: 'thu', ranges: [{ open: '06:30', close: '18:00' }] },
          { day: 'fri', ranges: [{ open: '06:30', close: '18:00' }] }, { day: 'sat', ranges: [{ open: '07:00', close: '13:00' }] }, { day: 'sun', closed: true }] } },
        { id: 's_contact1', type: 'contact', anchor: 'kontakt', data: { title: 'Kontakt', address: { line1: 'Musterstraße 1', postalCode: '89073', city: 'Ulm' }, phone: '+49 731 000 00', email: 'hallo@example.com' } },
        { id: 's_social01', type: 'socialMedia', data: { title: 'Folgen Sie uns', links: [{ platform: 'instagram', url: 'https://www.instagram.com/example' }, { platform: 'facebook', url: 'https://www.facebook.com/example' }] } },
      ] }],
    },
  };
})();
