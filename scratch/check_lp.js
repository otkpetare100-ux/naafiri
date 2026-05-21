const { MongoClient } = require('mongodb');

async function main() {
  const uri = 'mongodb+srv://admin:admin@cluster0.9dzr0ko.mongodb.net/?appName=Cluster0';
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('lan-tracker');
    const accounts = await db.collection('accounts').find({}).toArray();
    for (const acc of accounts) {
      if (acc.matchStatsHistory) {
        for (const match of acc.matchStatsHistory) {
          if (match.championName === 'Anivia' || (match.kills === 5 && match.deaths === 10)) {
            console.log(`Player: ${acc.gameName}#${acc.tagLine}`);
            console.log(`Match ID: ${match.matchId}`);
            console.log(`Win: ${match.win}`);
            console.log(`lpChange: ${match.lpChange}`);
            console.log(`lpHistory value:`, acc.lpHistory ? acc.lpHistory[match.matchId] : 'no lpHistory');
            console.log(`lastLpChanges:`, acc.lastLpChanges);
            console.log(`-----------------------------------`);
          }
        }
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

main();
