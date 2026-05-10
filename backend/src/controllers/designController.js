const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const Anthropic = require('@anthropic-ai/sdk');
const prisma = require('../utils/prismaClient');
const { getUserFromToken } = require('../middleware/auth');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SIZES = {
  a4:       { width: 794,  height: 1123, name: 'A4' },
  a5:       { width: 559,  height: 794,  name: 'A5' },
  dl:       { width: 374,  height: 794,  name: 'DL Flyer' },
  business: { width: 323,  height: 209,  name: 'Business Card' },
  square:   { width: 559,  height: 559,  name: 'Square' },
  pos:      { width: 378,  height: 567,  name: 'POS Tent' },
};

async function handleGenerateDesign(req, res) {
  try {
    const userId = await getUserFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'Unauthorized.' });

    const { qrId, prompt, size = 'a4', format = 'pdf' } = req.body;
    if (!qrId || !prompt) return res.status(400).json({ error: 'qrId and prompt required.' });

    const qr = await prisma.qR.findUnique({ where: { id: qrId } });
    if (!qr || qr.userId !== userId) return res.status(404).json({ error: 'QR not found.' });

    const dimensions = SIZES[size] || SIZES.a4;
    const qrUrl = qr.redirectUrl;
    const businessName = qr.businessName || 'Your Business';

    const systemPrompt = `You are a professional print designer. Generate a complete, self-contained HTML file for a print-ready marketing card. 
Rules:
- Output ONLY raw HTML, no markdown, no backticks, no explanation
- Use inline CSS only, no external stylesheets
- Canvas size: ${dimensions.width}px × ${dimensions.height}px
- Include a QR code placeholder: <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}" style="width:200px;height:200px">
- Business name: "${businessName}"
- Make it print-ready, high quality, professional
- Use Google Fonts via @import in a <style> tag
- No JavaScript
- The design must fill exactly ${dimensions.width}px × ${dimensions.height}px`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Design a ${dimensions.name} print card for: ${prompt}. Business: ${businessName}. QR code links to: ${qrUrl}`
      }],
      system: systemPrompt
    });

    const html = message.content[0].text;

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: dimensions.width, height: dimensions.height },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.setViewport({ width: dimensions.width, height: dimensions.height });

    if (format === 'pdf') {
      const pdf = await page.pdf({
        width: dimensions.width + 'px',
        height: dimensions.height + 'px',
        printBackground: true,
      });
      await browser.close();
      res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="qraivy-design.pdf"` });
      return res.send(pdf);
    } else {
      const screenshot = await page.screenshot({ type: 'png', fullPage: false });
      await browser.close();
      res.set({ 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="qraivy-design.png"` });
      return res.send(screenshot);
    }
  } catch (err) {
    console.error('handleGenerateDesign error:', err);
    return res.status(500).json({ error: 'Design generation failed: ' + err.message });
  }
}

module.exports = { handleGenerateDesign };