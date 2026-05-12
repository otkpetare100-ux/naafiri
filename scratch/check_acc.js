const { MongoClient } = require('mongodb');
const dns = require('dns');
dns.setServers(['8.8.8.8']);
require('dotenv').config();

async function checkAccount() {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const db = client.db('lan-tracker');
    const acc = await db.collection('accounts').findOne({ 
      gameName: { $regex: /^BODKIN ARROW$/i },
      tagLine: { $regex: /^BHR$/i }
    });
    
    if (acc) {
      console.log('Account Found:');
      console.log(JSON.stringify(acc, null, 2));
    } else {
      console.log('Account NOT found for BODKIN ARROW#BHR');
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

checkAccount();
