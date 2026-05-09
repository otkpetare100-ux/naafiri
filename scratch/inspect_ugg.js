const puppeteer = require('puppeteer');

async function inspectUgg(champion) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.goto(`https://u.gg/lol/champions/${champion}/build`, { waitUntil: 'networkidle2' });
    
    const info = await page.evaluate(() => {
        const sections = [];
        // Check for common U.GG classes
        const runes = document.querySelector('.runes-container') || document.querySelector('.rune-trees-container');
        const items = document.querySelector('.recommended-build') || document.querySelector('.item-build');
        const skills = document.querySelector('.skill-order');
        
        return {
            hasRunes: !!runes,
            runesClass: runes ? runes.className : null,
            hasItems: !!items,
            itemsClass: items ? items.className : null,
            hasSkills: !!skills,
            skillsClass: skills ? skills.className : null
        };
    });
    
    console.log('U.GG Info:', JSON.stringify(info, null, 2));
    
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await browser.close();
  }
}

inspectUgg('ahri');
