const puppeteer = require('puppeteer');

async function findItemsUgg(champion) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.goto(`https://u.gg/lol/champions/${champion}/build`, { waitUntil: 'networkidle2' });
    
    const items = await page.evaluate(() => {
        // Look for common U.GG items containers
        const possible = [
            '.recommended-build',
            '.item-build',
            '.core-items',
            '.content-section'
        ];
        return possible.map(p => ({
            selector: p,
            exists: !!document.querySelector(p),
            text: document.querySelector(p) ? document.querySelector(p).innerText.substring(0, 50) : null
        }));
    });
    
    console.log('Items info:', JSON.stringify(items, null, 2));
    
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await browser.close();
  }
}

findItemsUgg('ahri');
