const fs = require('fs');
let f = fs.readFileSync('backend/src/services/passService.js', 'utf8');

f = f.replace(/storeCard: \{[\s\S]*?return bf;\r?\n      \}\)\(\)\r?\n    \}/, `storeCard: {
      primaryFields: [{ key: 'brand', label: 'LOYALTY CARD', value: brandName.replace(/^Welcome to /i, '').replace(/\\s+[a-z0-9]{3}$/, '').trim() }],
      secondaryFields: [{ key: 'stamps', label: rewardReady ? '🎁 REWARD READY' : 'STAMPS', value: Array.from({length: stampGoal}, (_, i) => i < stampCount ? (rewardReady ? '🟢' : '●') : '○').join(' '), changeMessage: 'New stamp added! %@' }],
      auxiliaryFields: [{ key: 'progress', label: rewardReady ? 'CLAIM YOUR REWARD' : 'PROGRESS', value: rewardReady ? 'Show this to staff for your ' + rewardName : stampCount + ' of ' + stampGoal + ' stamps', changeMessage: '%@' }],
      backFields: [
        { key: 'reward', label: 'YOUR REWARD', value: rewardName + ' after ' + stampGoal + ' stamps' },
        { key: 'url', label: 'VISIT PAGE', value: lpUrl, attributedValue: '<a href="' + lpUrl + '">Open loyalty page</a>' },
        { key: 'howto', label: 'HOW TO STAMP', value: 'Tap the staff NFC tag or scan the QR code to collect your stamps.' }
      ]
    }`);

console.log('Done:', f.includes('LOYALTY CARD'));
fs.writeFileSync('backend/src/services/passService.js', f);
