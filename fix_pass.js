const fs = require('fs');
let f = fs.readFileSync('backend/src/services/passService.js', 'utf8');

const old = `    storeCard: {
      primaryFields:   [{ key:'title',    label:'',        value: walletTitle }],
      secondaryFields: [{ key:'sub', label:'', value: walletSub }],
      auxiliaryFields: (function(){ var af = []; if (stampLabel) af.push({ key:'stamps', label: stampLabel, value: stampValue, changeMessage: '%@' }); if (sections._lastMsg) af.push({ key:'push', label: sections._lastMsgTitle || 'LATEST UPDATE', value: sections._lastMsg, changeMessage: '%@' }); return af; })(),
      backFields:      (function(){
        var bf = [{ key:'url', label:'VISIT PAGE', value: lpUrl, attributedValue: '<a href="'+lpUrl+'">Open Smart QR Page</a>' }];
        if (sections._lastMsg) {
          bf.unshift({ key:'msg', label: sections._lastMsgTitle || 'LATEST UPDATE', value: sections._lastMsg });
          if (sections._lastMsgLink) bf.push({ key:'msglink', label:'TAP TO OPEN', value: sections._lastMsgLink, attributedValue: '<a href="'+sections._lastMsgLink+'">Tap to see the collection →</a>' });
        }
        return bf;
      })()
    }`;

// Build stamp dots: filled = ●  empty = ○
const stampDots = `Array.from({length: stampGoal}, (_, i) => i < stampCount ? (rewardReady ? '🟢' : '●') : '○').join(' ')`;

const neo = `    storeCard: {
      primaryFields: [{ key: 'brand', label: 'LOYALTY CARD', value: brandName.replace(/^Welcome to /i, '').replace(/\\s+[a-z0-9]{3}$/, '').trim() }],
      secondaryFields: [{ key: 'stamps', label: rewardReady ? '🎁 REWARD READY' : 'STAMPS', value: Array.from({length: stampGoal}, (_, i) => i < stampCount ? (rewardReady ? '🟢' : '●') : '○').join(' '), changeMessage: 'New stamp added! %@' }],
      auxiliaryFields: [{ key: 'progress', label: rewardReady ? 'CLAIM YOUR REWARD' : 'PROGRESS', value: rewardReady ? 'Show this to staff for your ' + rewardName : stampCount + ' of ' + stampGoal + ' stamps', changeMessage: '%@' }],
      backFields: [
        { key: 'reward', label: 'YOUR REWARD', value: rewardName + ' after ' + stampGoal + ' stamps' },
        { key: 'url', label: 'VISIT PAGE', value: lpUrl, attributedValue: '<a href="' + lpUrl + '">Open loyalty page</a>' },
        { key: 'howto', label: 'HOW TO STAMP', value: 'Tap the staff NFC tag or scan the QR code to collect your stamps.' }
      ]
    }`;

if (f.includes(old)) { f = f.replace(old, neo); console.log('Fixed'); } else { console.log('NOT FOUND'); }
fs.writeFileSync('backend/src/services/passService.js', f);
