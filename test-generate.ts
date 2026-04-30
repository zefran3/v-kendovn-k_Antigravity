import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

async function testModels() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("❌ Klíč nenalezen.");
    return;
  }

  const genAI = new GoogleGenerativeAI(key);
  const modelsToTest = [
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.0-flash-lite",
    "gemini-3.1-flash-lite-preview"
  ];

  for (const modelName of modelsToTest) {
    console.log(`\n⏳ Testuji model: ${modelName}`);
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent("Napiš jen slovo OK.");
      const response = await result.response;
      console.log(`✅ ÚSPĚCH! Model ${modelName} funguje a má kvótu. Odpověď: ${response.text().trim()}`);
      
      // Zkusíme rovnou i Search Grounding, jestli není zakázán
      try {
        const searchModel = genAI.getGenerativeModel({ 
          model: modelName,
          tools: [{ googleSearch: {} }] 
        });
        await searchModel.generateContent("Napiš OK.");
        console.log(`✅ ÚSPĚCH! Model ${modelName} podporuje i Search Grounding!`);
      } catch (searchError: any) {
        console.log(`⚠️ Upozornění: Model ${modelName} sice funguje, ale nepodporuje Search Grounding (${searchError.message}).`);
      }

    } catch (error: any) {
      if (error.message.includes("429") && error.message.includes("limit: 0")) {
        console.error(`❌ ZAMÍTNUTO (Kvóta 0 - nedostupné pro Free Tier)`);
      } else if (error.message.includes("503")) {
        console.error(`❌ NEDOSTUPNÉ (Přetížené servery Googlu, ale kvóta by mohla být v pořádku)`);
      } else if (error.message.includes("404")) {
        console.error(`❌ NENALEZENO (Model neexistuje)`);
      } else {
        console.error(`❌ CHYBA: ${error.message}`);
      }
    }
  }
}

testModels();
