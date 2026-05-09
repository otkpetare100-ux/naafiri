const puppeteer = require('puppeteer');
const fs = require('fs');

async function testUgg(champion) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 2000, deviceScaleFactor: 2 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    console.log(`Navigating to https://u.gg/lol/champions/${champion}/build...`);
    await page.goto(`https://u.gg/lol/champions/${champion}/build`, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Hide ads and headers
    await page.addStyleTag({
      content: `
        #onesignal-slidedown-container, .ads-container, .nav-container, footer, .header-container { display: none !important; }
        body { background: #0a0a0c !important; color: #fff !important; }
      `
    });

    await new Promise(r => setTimeout(r, 2000));
    
    // Take a screenshot of the main content
    const main = await page.$('.champion-profile-page') || await page.$('main');
    if (main) {
        await main.screenshot({ path: 'scratch/ugg_test.png' });
        console.log('u.gg screenshot saved!');
    } else {
        await page.screenshot({ path: 'scratch/ugg_test.png', fullPage: true });
        console.log('u.gg fullpage screenshot saved!');
    }
    
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await browser.close();
  }
}

testUgg('ahri');
