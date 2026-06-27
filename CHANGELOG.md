# Changelog

## 2026-06-27 — `47e54ab` fix: consolidate loyalty welcome flow and improve wallet UX

- Removed dead/duplicate `handleLoyaltyWelcome` implementation in `lpController.js` (two functions of the same name existed; only the second was actually live due to JS hoisting).
- Removed the "G" prefix from the Google Wallet button on the welcome page; replaced with a 📱 icon (EN + DE).
- Fixed `isAndroid` `ReferenceError` on the stamp card page (`/lp/card/:slug`) that crashed the OS-detection script and left both wallet buttons visible on Android/desktop.
- Fixed "Copy NFC URL" button in the loyalty dashboard to respect the English/German language toggle.

**Production-validated on api.qraivy.com:**
- Apple Wallet (`/lp/wallet/apple/:slug`) — returns valid `.pkpass`, no 500s
- Google Wallet (`/lp/wallet/google/:slug`) — returns valid Save-to-Wallet URL, no 500s
- Welcome page OS detection — correct button visibility on iPhone Safari, Android Chrome, and desktop
- Welcome flow — "Continue without Wallet" and redirect to the Smart Landing Page work, no re-prompt loop for returning visitors
- NFC stamping — live-tested end to end, stamp count increments correctly
- Dashboard "Copy NFC URL" — correct translation in English and German

Note: live validation issued one real NFC stamp against `getraenke-goebel-amn` (stamp count incremented 1 → 2). No other data affected.
