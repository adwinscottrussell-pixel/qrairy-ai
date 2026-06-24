// QRaivy Language - Single Source of Truth
// All components read window.QRAIVY_LANGUAGE
(function(){
  var saved = localStorage.getItem('qraivy_lang');
  var browser = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
  var lang = saved || (browser.startsWith('de') ? 'de' : 'en');
  window.QRAIVY_LANGUAGE = lang;
  window._qraivyLang = lang; // dashboard compat
  // Expose setter so any component can update the shared language
  window.setQraivyLang = function(l) {
    window.QRAIVY_LANGUAGE = l;
    window._qraivyLang = l;
    localStorage.setItem('qraivy_lang', l);
    localStorage.setItem('qraivy_wizard_lang', l);
  };
})();
