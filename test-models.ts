import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

async function listModels() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("❌ Klíč nenalezen.");
    return;
  }

  const genAI = new GoogleGenerativeAI(key);

  console.log("⏳ Zjišťuji dostupné modely pro tvůj klíč...");
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const data = await response.json();
    
    if (data.error) {
      console.error("❌ CHYBA API:", data.error.message);
      return;
    }

    const models = data.models.filter(m => m.supportedGenerationMethods.includes("generateContent"));
    console.log("✅ DOSTUPNÉ MODELY PRO GENERATE CONTENT:");
    models.forEach(m => console.log(`- ${m.name.replace('models/', '')}`));
    
  } catch (error) {
    console.error("❌ Nepodařilo se připojit:", error);
  }
}

listModels();
