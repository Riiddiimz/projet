const { chromium } = require('playwright');
const fs = require('fs');

const SITE_URL = process.env.SITE_URL || 'http://127.0.0.1:3000';
const OUT = process.env.QA_OUTPUT || 'qa-results/visual-guardian';
fs.mkdirSync(OUT, { recursive: true });
const results = [];

function record(name, status, details = {}) {
  results.push({ name, status, details, at: new Date().toISOString() });
  console.log(`[${status}] ${name}${Object.keys(details).length ? ` ${JSON.stringify(details)}` : ''}`);
}

async function auditViewport(page, label) {
  const data = await page.evaluate(() => {
    const vw = innerWidth;
    const vh = innerHeight;
    const isVisible = e => {
      const s = getComputedStyle(e), r = e.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity || '1') > 0 && r.width > 0 && r.height > 0;
    };

    const raw = [...document.querySelectorAll('button,a,input,textarea,select,[role="button"]')].filter(isVisible);

    // Ignore controls visually covered by another element (for example the lobby behind
    // the full-screen authentication modal). This makes overlap checks describe what the
    // user can actually interact with rather than invisible/blocked controls underneath.
    const interactive = raw.filter(e => {
      const r = e.getBoundingClientRect();
      const points = [
        [r.left + r.width / 2, r.top + r.height / 2],
        [r.left + Math.min(12, r.width / 2), r.top + Math.min(12, r.height / 2)],
        [r.right - Math.min(12, r.width / 2), r.bottom - Math.min(12, r.height / 2)]
      ];
      return points.some(([x, y]) => {
        const top = document.elementFromPoint(x, y);
        return top === e || e.contains(top);
      });
    }).map(e => {
      const r = e.getBoundingClientRect();
      return { tag:e.tagName, id:e.id, text:(e.innerText || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '').trim().slice(0,80), x:r.x,y:r.y,w:r.width,h:r.height, fixed:['fixed','sticky'].includes(getComputedStyle(e).position) };
    });

    const clipped = interactive.filter(e => e.x < -2 || e.y < -2 || e.x + e.w > vw + 2 || e.y + e.h > vh + 2);
    const tiny = interactive.filter(e => e.w < 32 || e.h < 32);
    const fixedClipped = interactive.filter(e => e.fixed && (e.x < 0 || e.y < 0 || e.x + e.w > vw || e.y + e.h > vh));
    const overlaps = [];
    for (let i=0;i<interactive.length;i++) for (let j=i+1;j<interactive.length;j++) {
      const a=interactive[i], b=interactive[j];
      const area=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
      const minArea=Math.min(a.w*a.h,b.w*b.h);
      if (area > 12 && area / minArea > 0.20) overlaps.push({a:a.id||a.text,b:b.id||b.text,ratio:+(area/minArea).toFixed(2)});
    }
    const scrollWidth=document.documentElement.scrollWidth;
    const horizontalOverflow=scrollWidth > vw + 2;
    return { viewport:[vw,vh], interactiveCount:interactive.length, clipped, tiny, fixedClipped, overlaps:overlaps.slice(0,20), horizontalOverflow, scrollWidth };
  });

  await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: false });
  const bad = data.clipped.length || data.fixedClipped.length || data.overlaps.length || data.horizontalOverflow;
  record(`Visual Guardian / ${label}`, bad ? 'FAIL' : 'PASS', data);
  return data;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width,height,label] of [[1440,900,'desktop'],[1024,768,'tablet'],[390,844,'mobile'],[360,800,'mobile-small']]) {
      const page = await browser.newPage({ viewport:{width,height} });
      const errors=[];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
      await page.goto(SITE_URL, { waitUntil:'networkidle', timeout:60000 });
      await page.waitForTimeout(1200);
      await auditViewport(page,label);
      record(`Visual Guardian / JS ${label}`, errors.length ? 'FAIL' : 'PASS', { errors:errors.slice(0,10) });
      await page.close();
    }
  } catch (error) {
    record('Visual Guardian / runner','FAIL',{ error:error.stack || error.message });
  } finally {
    fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ site:SITE_URL, generatedAt:new Date().toISOString(), results }, null, 2));
    await browser.close();
  }
  process.exitCode = results.some(r => r.status === 'FAIL') ? 1 : 0;
})();
