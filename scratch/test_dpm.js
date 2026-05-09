const puppeteer = require('puppeteer');
const fs = require('fs');

async function testScrape() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  console.log('Navigating to dpm.lol...');
  await page.goto('https://dpm.lol/champions/aatrox/build', { waitUntil: 'networkidle2', timeout: 30000 });
  
  const data = await page.evaluate(() => {
    // Attempt to extract runes
    // Looking for the main rune trees. The active runes usually don't have grayscale.
    const runeImages = Array.from(document.querySelectorAll('img[src*="/runes/"]'));
    const activeRunes = runeImages
        .filter(img => !img.className.includes('grayscale') && !img.style.filter.includes('grayscale'))
        .map(img => img.src);
        
    // Attempt to extract items
    // Items usually have /items/ in the src or similar.
    const itemImages = Array.from(document.querySelectorAll('img[src*="/item/"]'));
    const items = itemImages.map(img => img.src);
    
    // Maybe dpm.lol uses data attributes or specific classes. Let's just grab all images to see what we get.
    const allImages = Array.from(document.querySelectorAll('img')).map(img => ({
        src: img.src,
        className: img.className,
        alt: img.alt
    }));
    
    return { activeRunes, items, allImagesPreview: allImages.slice(0, 20) };
  });

  console.log(JSON.stringify(data, null, 2));
  
  // Let's also take a screenshot of the whole page just to see
  await page.screenshot({ path: 'dpm_test.png', fullPage: true });
  
  await browser.close();
}

testScrape().catch(console.error);
