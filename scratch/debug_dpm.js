const puppeteer = require('puppeteer');
const fs = require('fs');

const champion = process.argv[2] || 'yasuo';

async function debugDpm(champ) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    console.log(`Navigating to https://dpm.lol/champions/${champ}/build...`);
    const response = await page.goto(`https://dpm.lol/champions/${champ}/build`, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    
    console.log('Status:', response.status());
    
    // Wait for images
    try {
        await page.waitForSelector('img[src*="item"], img[src*="rune"]', { timeout: 10000 });
        console.log('Images found!');
    } catch(e) {
        console.log('Images NOT found (timeout)');
    }

    // Identificar secciones
    const sections = await page.evaluate(() => {
        const runeImgs = Array.from(document.querySelectorAll('img[src*="rune"]'));
        const itemImgs = Array.from(document.querySelectorAll('img[src*="item"]'));
        return {
            runeCount: runeImgs.length,
            itemCount: itemImgs.length,
            runeSrcs: runeImgs.slice(0,3).map(i => i.src),
            itemSrcs: itemImgs.slice(0,3).map(i => i.src)
        };
    });
    console.log('DOM Info:', JSON.stringify(sections, null, 2));

    await page.screenshot({ path: `scratch/debug_${champ}_raw.png` });
    console.log(`Raw screenshot saved for ${champ}`);
    
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await browser.close();
  }
}

debugDpm(champion);
