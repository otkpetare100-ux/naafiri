const dns = require('dns');
dns.setServers(['8.8.8.8']);

async function run() {
  try {
    const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions = await res.json();
    const latest = versions[0];
    console.log(`Latest Data Dragon version: ${latest}`);
    
    const itemsRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${latest}/data/en_US/item.json`);
    const itemsData = await itemsRes.json();
    
    const item = itemsData.data['2523'];
    if (item) {
      console.log(`Item 2523 Details:`);
      console.log(`- Name: ${item.name}`);
      console.log(`- Description: ${item.description}`);
      console.log(`- Plaintext: ${item.plaintext}`);
      console.log(`- Tags:`, item.tags);
    } else {
      console.log('Item 2523 not found in standard Data Dragon list.');
    }
  } catch (e) {
    console.error(e);
  }
}

run();
