const puppeteer = require('puppeteer');

async function testNextData() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  console.log('Navigating to dpm.lol...');
  await page.goto('https://dpm.lol/champions/aatrox/build', { waitUntil: 'networkidle2', timeout: 30000 });
  
  const data = await page.evaluate(() => {
    const nextDataElement = document.getElementById('__NEXT_DATA__');
    if (nextDataElement) {
        try {
            const json = JSON.parse(nextDataElement.textContent);
            return json.props.pageProps;
        } catch (e) {
            return { error: 'Failed to parse JSON' };
        }
    }
    return { error: 'No __NEXT_DATA__ found' };
  });

  console.log(JSON.stringify(data, null, 2).substring(0, 2000) + '...');
  
  await browser.close();
}

testNextData().catch(console.error);
