const { MongoClient } = require('mongodb');
const dns = require('dns');
dns.setServers(['8.8.8.8']);
require('dotenv').config();

async function clearBuildCache() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('Error: MONGO_URI not found in .env');
    return;
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('lan-tracker'); 
    const collection = db.collection('system_config');

    console.log('Cleaning build cache in lan-tracker...');
    const result = await collection.deleteMany({ key: { $regex: /^build_/ } });
    console.log(`Successfully deleted ${result.deletedCount} cached builds.`);
    
  } catch (e) {
    console.error('Error cleaning cache:', e);
  } finally {
    await client.close();
  }
}

clearBuildCache();
