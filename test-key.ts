import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

async function test() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("❌ CHYBA: API klíč nenalezen v souboru .env!");
    return;
  }

  console.log("Testing key: " + key.substring(0, 8) + "...");
  
  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    console.log("⏳ Posílám dotaz do Gemini...");
    const result = await model.generateContent("Ahoj, jsi tam? Odpověz krátce 'Ano'.");
    const response = await result.response;
    console.log("✅ ÚSPĚCH! Gemini odpovědělo:", response.text());
  } catch (error) {
    console.error("❌ CHYBA PŘI VOLÁNÍ API:");
    console.error(error.message);
    if (error.message.includes("404")) {
      console.log("\n💡 TIP: Chyba 404 většinou znamená, že model neexistuje nebo nemáš v Google Cloudu aktivované 'Generative Language API'.");
    } else if (error.message.includes("403") || error.message.includes("401")) {
      console.log("\n💡 TIP: Chyba 401/403 znamená, že tvůj API klíč je neplatný nebo máš nastavená omezení (např. na IP adresu).");
    }
  }
}

test();
