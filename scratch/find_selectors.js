const puppeteer = require('puppeteer');

async function findSelectors(champion) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 2000 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    console.log(`Navigating to https://dpm.lol/champions/${champion}/build...`);
    await page.goto(`https://dpm.lol/champions/${champion}/build`, { waitUntil: 'networkidle2' });
    
    const selectors = await page.evaluate(() => {
        const results = [];
        // Look for sections or divs that might contain runes/items
        document.querySelectorAll('div').forEach(div => {
            const text = div.innerText.toLowerCase();
            if (text.includes('runes') && div.children.length > 3 && div.children.length < 20) {
                results.push({ type: 'possible_runes', className: div.className, id: div.id, text: div.innerText.substring(0, 20) });
            }
            if (text.includes('build') && div.children.length > 3) {
                results.push({ type: 'possible_build', className: div.className, id: div.id, text: div.innerText.substring(0, 20) });
            }
        });
        return results;
    });
    
    console.log('Detected Selectors:', JSON.stringify(selectors, null, 2));
    
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await browser.close();
  }
}

findSelectors('yasuo');
