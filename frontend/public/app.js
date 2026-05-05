const API_BASE = 'https://api.qraivy.com';

const urlInput = document.getElementById('urlInput');
const generateBtn = document.getElementById('generateBtn');
const errorMsg = document.getElementById('errorMsg');
const result = document.getElementById('result');
const qrImage = document.getElementById('qrImage');
const redirectLink = document.getElementById('redirectLink');
const copyBtn = document.getElementById('copyBtn');
const copyConfirm = document.getElementById('copyConfirm');
const downloadBtn = document.getElementById('downloadBtn');

function showError(msg) {
  errorMsg.textContent = msg;
}

function clearError() {
  errorMsg.textContent = '';
}

function setLoading(loading) {
  generateBtn.disabled = loading;
  generateBtn.textContent = loading ? 'Generating…' : 'Generate';
}

async function generateQR() {
  const url = urlInput.value.trim();
  clearError();
  if (!url) {
    showError('Please enter a URL.');
    return;
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    showError('URL must start with http:// or https://');
    return;
  }
  setLoading(true);
  result.classList.add('hidden');
  try {
    const response = await fetch(`${API_BASE}/qr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await response.json();
    if (!response.ok) {
      showError(data.error || 'Something went wrong.');
      return;
    }
    const { redirectUrl } = data;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(redirectUrl)}&size=300x300`;
    qrImage.src = qrSrc;
    qrImage.crossOrigin = 'anonymous';
    redirectLink.href = redirectUrl;
    redirectLink.textContent = redirectUrl;
    downloadBtn.onclick = () => {
      const link = document.createElement('a');
      link.href = qrSrc;
      link.download = 'qraivy-qrcode.png';
      link.click();
    };
    result.classList.remove('hidden');
  } catch (err) {
    showError('Could not reach the server. Is the backend running?');
    console.error(err);
  } finally {
    setLoading(false);
  }
}

generateBtn.addEventListener('click', generateQR);

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') generateQR();
});

copyBtn.addEventListener('click', async () => {
  const url = redirectLink.textContent;
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    copyConfirm.classList.remove('hidden');
    setTimeout(() => copyConfirm.classList.add('hidden'), 2000);
  } catch {
    copyBtn.textContent = 'Copy failed';
  }
});