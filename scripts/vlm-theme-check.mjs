import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

async function analyze(path, prompt) {
  try {
    const zai = await ZAI.create();
    const b64 = fs.readFileSync(path).toString('base64');
    const res = await zai.chat.completions.create({
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
        ],
      }],
    });
    console.log(`=== ${path} ===`);
    console.log(res.choices[0]?.message?.content ?? 'no content');
  } catch (e) {
    console.error(`VLM failed for ${path}:`, e.message);
  }
}

const q = `Review this web app screenshot as a UI designer. Answer briefly:
1) Is the overall background very light purple (lavender)?
2) Any elements that still look DARK (dark backgrounds, dark panels, unreadable dark-on-dark text)?
3) Does the big headline have a gradient (ombre) effect on its second word?
4) Any text with poor contrast or visual glitches?
Keep it under 120 words.`;

const which = process.argv[2] || 'all';
const shots = {
  landing: '/home/z/my-project/download/theme-check-landing.png',
  map: '/home/z/my-project/download/theme-check-map.png',
  around: '/home/z/my-project/download/theme-check-around.png',
  report: '/home/z/my-project/download/theme-check-report.png',
  feed: '/home/z/my-project/download/theme-check-feed.png',
  alerts: '/home/z/my-project/download/theme-check-alerts.png',
};

(async () => {
  if (which === 'all') {
    for (const [k, p] of Object.entries(shots)) await analyze(p, q);
  } else {
    await analyze(shots[which], q);
  }
})();
