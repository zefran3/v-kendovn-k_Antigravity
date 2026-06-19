async function test() {
  const uid = "1cOaNhnPQ4NSvXMGu5dyfkc33fx1"; // Admin/parent UID
  const baseUrl = "http://localhost:3000/api/locations";

  console.log("1. Testing GET /api/locations...");
  const getRes = await fetch(`${baseUrl}?uid=${uid}`);
  if (!getRes.ok) throw new Error(`GET failed: ${getRes.status} ${await getRes.text()}`);
  const locations = await getRes.json();
  console.log(`✅ GET success! Total locations found: ${locations.length}`);
  
  console.log("2. Testing POST /api/locations...");
  const newLoc = {
    uid,
    name: "Testovací Lokace",
    keywords: ["testik", "zkouska"],
    exactLocation: "Brněnská 12, Vyškov",
    exactUrl: "https://www.test-lokace.cz",
    isVyskov: true
  };
  const postRes = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newLoc)
  });
  if (!postRes.ok) throw new Error(`POST failed: ${postRes.status} ${await postRes.text()}`);
  const postData = await postRes.json();
  const createdId = postData.id;
  console.log(`✅ POST success! Created location with ID: ${createdId}`);

  console.log("3. Testing PUT /api/locations/:id...");
  const updatedLoc = {
    ...newLoc,
    name: "Testovací Lokace - Upravená"
  };
  const putRes = await fetch(`${baseUrl}/${createdId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updatedLoc)
  });
  if (!putRes.ok) throw new Error(`PUT failed: ${putRes.status} ${await putRes.text()}`);
  console.log("✅ PUT success!");

  console.log("4. Testing DELETE /api/locations/:id...");
  const delRes = await fetch(`${baseUrl}/${createdId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid })
  });
  if (!delRes.ok) throw new Error(`DELETE failed: ${delRes.status} ${await delRes.text()}`);
  console.log("✅ DELETE success!");
  
  console.log("🎉 All locations API tests completed successfully!");
}

test().catch(console.error).finally(() => process.exit(0));
