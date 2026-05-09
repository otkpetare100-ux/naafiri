async function testSteam() {
    const fetch = (await import('node-fetch')).default;
    try {
        const response = await fetch('https://store.steampowered.com/api/featuredcategories/?l=spanish');
        const data = await response.json();
        const specials = data.specials.items;
        console.log('Steam Specials:', JSON.stringify(specials.slice(0, 3), null, 2));
    } catch (e) {
        console.error(e);
    }
}

testSteam();
