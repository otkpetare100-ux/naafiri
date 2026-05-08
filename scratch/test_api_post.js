async function test() {
  const res = await fetch('http://localhost:3010/api/summoners', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameName: "Raven", tagLine: "Aisha", region: "la1" })
  });
  const data = await res.json();
  console.log(data);
}
test();
