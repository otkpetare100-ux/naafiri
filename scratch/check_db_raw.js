const { MongoClient } = require('mongodb');
const dns = require('dns');
dns.setServers(['8.8.8.8']);
require('dotenv').config();

async function check() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db('lan-tracker');
  const accounts = await db.collection('accounts').find({}).toArray();
  console.log(JSON.stringify(accounts, null, 2));
  await client.close();
}
check();
