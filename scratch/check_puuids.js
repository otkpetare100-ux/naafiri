const { MongoClient } = require('mongodb');
const dns = require('dns');
dns.setServers(['8.8.8.8']);
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const db = client.db('lan-tracker');
    
    const puuids = [
      "CEZUg2RbFbXteZiCK1STInqiIXXsR8UDRY4Zy8teKpTXrfs2wHpxLymJXupm-iuckgHno0sGHwpbyw",
      "TzgQuNTkZJrgrLTsC8S5lNYTKl5ebijXopvwxzbKyOn_lBzj_fxn-XDkpdP4b12i3FWakptUSDzYFA",
      "WUojXvbPM92g4DWoPdLLZjQHkcDri2FdGppj_F-bfoXQanz6JFZJvO5xM0z52Kv-gkVnvoESrOP-gQ"
    ];
    
    const accounts = await db.collection('accounts').find({ puuid: { $in: puuids } }).toArray();
    console.log('--- Account Mapping ---');
    accounts.forEach(acc => {
      console.log(`PUUID: ${acc.puuid} -> ${acc.gameName}#${acc.tagLine}`);
    });
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

run();
