const puppeteer = require('puppeteer');
const fs = require('fs');

async function testInject() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1200, height: 1080, deviceScaleFactor: 2 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  console.log('Navigating to dpm.lol...');
  await page.goto('https://dpm.lol/champions/aatrox/build', { waitUntil: 'networkidle0', timeout: 30000 });
  
  await new Promise(r => setTimeout(r, 2000));
  
  // Inject CSS to clean up the page and add premium aesthetic
  await page.addStyleTag({
    content: `
      header, nav, footer, iframe, [class*="Ad"], [id*="ad"], .advertisement { display: none !important; }
      body { background: #0a0a0c !important; }
      main { 
        border: 2px solid #d4af37 !important; 
        box-shadow: 0 0 30px rgba(212, 175, 55, 0.3) !important;
        border-radius: 24px !important;
        background: rgba(15, 15, 20, 0.95) !important;
        margin: 20px !important;
        padding: 20px !important;
      }
    `
  });
  
  // Find a good element to screenshot. Usually main or the first large div.
  const mainEl = await page.$('main');
  if (mainEl) {
    await mainEl.screenshot({ path: 'dpm_premium.png' });
    console.log('Saved dpm_premium.png');
  } else {
    await page.screenshot({ path: 'dpm_premium.png', fullPage: true });
    console.log('Saved dpm_premium.png (full page fallback)');
  }
  
  await browser.close();
}

testInject().catch(console.error);
