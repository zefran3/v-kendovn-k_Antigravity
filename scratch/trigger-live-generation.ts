import dotenv from "dotenv";
dotenv.config();

async function run() {
  console.log("Triggering generation on http://localhost:3000/api/agent/generate...");
  const response = await fetch("http://localhost:3000/api/agent/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      uid: "1cOaNhnPQ4NSvXMGu5dyfkc33fx1",
      location: "Vyškov, Jihomoravský kraj"
    })
  });

  console.log("Response Status:", response.status);
  const data = await response.json();
  if (response.ok) {
    console.log("✅ Success! Generated tips count:", data.suggestions?.length);
    console.log("First tip sample:", JSON.stringify(data.suggestions?.[0], null, 2));
  } else {
    console.error("❌ Failed:", data);
  }
}

run().catch(console.error);
