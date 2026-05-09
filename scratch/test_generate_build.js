const puppeteer = require('puppeteer');
const fs = require('fs');

async function testGenerateBuildImage(champion) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1080, deviceScaleFactor: 2 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log(`Navigating to https://dpm.lol/champions/${champion}/build...`);
    const response = await page.goto(`https://dpm.lol/champions/${champion}/build`, { waitUntil: 'networkidle0', timeout: 20000 });
    
    if (response && response.status() === 404) {
      console.log('404 Not Found');
      return null;
    }
    
    await page.addStyleTag({
      content: `
        header, nav, footer, iframe, [class*="Ad"], [id*="ad"], .advertisement { display: none !important; }
        body { background: #0a0a0c !important; color: #fff !important; }
        main, .container { 
          border: 2px solid #d4af37 !important; 
          box-shadow: 0 0 30px rgba(212, 175, 55, 0.3) !important;
          border-radius: 24px !important;
          background: rgba(15, 15, 20, 0.95) !important;
          margin: 20px auto !important;
          padding: 20px !important;
        }
      `
    });
    
    await new Promise(r => setTimeout(r, 1500));
    
    const mainEl = await page.$('main') || await page.$('.container') || await page.$('body');
    if (mainEl) {
      console.log('Taking mainEl screenshot...');
      const buffer = await mainEl.screenshot({ type: 'png' });
      fs.writeFileSync('scratch/test_build.png', buffer);
      console.log('Screenshot saved to test_build.png');
      return buffer;
    }
    console.log('Taking fullpage screenshot...');
    return await page.screenshot({ type: 'png', fullPage: true });
  } catch (e) {
    console.error('[Generate Build Image Error]', e);
    return null;
  } finally {
    await browser.close().catch(() => {});
  }
}

testGenerateBuildImage('aatrox').then(() => console.log('Done')).catch(console.error);
