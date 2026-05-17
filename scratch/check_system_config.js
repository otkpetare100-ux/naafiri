const { MongoClient } = require('mongodb');
const dns = require('dns');
dns.setServers(['8.8.8.8']);
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const db = client.db('lan-tracker');
    
    console.log('--- System Config (Concise) ---');
    const configs = await db.collection('system_config').find({}).toArray();
    configs.forEach(c => {
      const keys = Object.keys(c);
      console.log(`Config ID: ${c._id || c.key}, Keys: ${keys.join(', ')}`);
      for (const [k, v] of Object.entries(c)) {
        if (k !== '_id') {
          if (typeof v !== 'object') {
            console.log(`  ${k}: ${v}`);
          } else {
            console.log(`  ${k}: [Object/Array] keys: ${Object.keys(v).join(', ')}`);
          }
        }
      }
    });
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

run();
