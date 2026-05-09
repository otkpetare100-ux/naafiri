const puppeteer = require('puppeteer');

async function listHeaders(champion) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.goto(`https://dpm.lol/champions/${champion}/build`, { waitUntil: 'networkidle2' });
    
    const headers = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(h => ({
            tag: h.tagName,
            text: h.innerText,
            parentClass: h.parentElement.className
        }));
    });
    
    console.log('Headers:', JSON.stringify(headers, null, 2));
    
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await browser.close();
  }
}

listHeaders('yasuo');
