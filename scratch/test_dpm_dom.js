const puppeteer = require('puppeteer');
const fs = require('fs');

async function testDOM() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  console.log('Navigating to dpm.lol...');
  await page.goto('https://dpm.lol/champions/aatrox/build', { waitUntil: 'networkidle0', timeout: 30000 });
  
  const data = await page.evaluate(() => {
    // Try to find the item section and rune section
    // Let's get all texts on the page to see where "Runes" or "Items" are
    const headers = Array.from(document.querySelectorAll('h1, h2, h3, h4, span, p')).map(e => e.innerText);
    
    // Let's find images that look like runes
    const imgs = Array.from(document.querySelectorAll('img')).map(img => img.src).filter(src => src.includes('runes') || src.includes('item'));
    
    return { headers: headers.slice(0, 50), imgs };
  });

  console.log(JSON.stringify(data, null, 2));
  await browser.close();
}

testDOM().catch(console.error);
