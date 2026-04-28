# Plán implementace: AI Agent pro inspiraci

Tento dokument slouží ke sledování postupu při vývoji AI Agenta, který bude automaticky vyhledávat tipy na víkend.

## Fáze 1: Zdroje a Backend
- [x] Specifikovat lokalitu: Jihomoravský kraj (primárně Brno, Vyškov, Olomouc, do cca 1-1.5h dojezdu).
- [x] Vybrat zdroje: gotobrno.cz, kudyznudy.cz, jizni-morava.cz, mksvyskov.cz, CineStar Olomouc.
- [x] Zvolit technologii pro získání dat: Gemini 2.5 Pro s Google Search Grounding.
- [x] Vytvořit novou kolekci `inspirations` ve Firestore pro ukládání tipů (nastavena pravidla pro čtení).

## Fáze 2: AI a logika (Právě řešíme ⏳)
- [x] Vygenerovat API klíč pro Google Gemini.
- [x] Naprogramovat systémový prompt s přísnými rodinnými pravidly:
  - **Zvýhodnit:** Kino, ZOO, food festivaly, hudební festivaly.
  - **ZAKÁZAT:** Hrady, zámky, historie (pro dceru), povalování u vody (pro syna).
- [x] Zahrnout do promptu kontrolu počasí (mokro = pod střechou, hezky = venku).
- [x] Nastavit CRON job na serveru (automatické spouštění každou středu v noci).

## Fáze 3: Frontend a UI (Hotovo ✅)
- [x] Přidat sekci "✨ Inspirace na víkend" na hlavní nástěnku v aplikaci.
- [x] Načítat aktuální tipy z kolekce `inspirations`.
- [x] Přidat tlačítko "Tohle chci podniknout!", které předvyplní formulář pro vytvoření nové aktivity.
