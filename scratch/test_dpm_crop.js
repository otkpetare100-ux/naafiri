const puppeteer = require('puppeteer');
const fs = require('fs');

async function testCrop() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1200, height: 1080, deviceScaleFactor: 2 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  console.log('Navigating to dpm.lol...');
  await page.goto('https://dpm.lol/champions/aatrox/build', { waitUntil: 'networkidle0', timeout: 30000 });
  
  // Wait a bit just in case
  await new Promise(r => setTimeout(r, 2000));
  
  // Try to find the main container (e.g. main tag or a specific div)
  const rect = await page.evaluate(() => {
    // Let's find the first element that looks like a main column
    // The page likely has a grid or flex.
    const mainArea = document.querySelector('main') || document.querySelector('.container') || document.body;
    const box = mainArea.getBoundingClientRect();
    
    // We can also just crop the center of the screen
    return {
      x: box.x, y: box.y, width: box.width, height: box.height
    };
  });

  console.log('Main area:', rect);
  
  // Just capture a specific portion where the build usually is
  await page.screenshot({ 
      path: 'dpm_crop.png', 
      clip: { x: 0, y: 100, width: 800, height: 1000 }
  });
  
  await browser.close();
}

testCrop().catch(console.error);
