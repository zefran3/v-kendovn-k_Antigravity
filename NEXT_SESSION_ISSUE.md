# Problém pro příští relaci (Next Session Issue)

**Popis problému:**
Uživatel spustil generování víkendového plánu. V konzoli serveru/aplikace se zobrazilo, že generování proběhlo v pořádku (MKS Vyškov vrátil 4 filmy, CineStar Olomouc 7 dní s programem atd.), ale v samotné klientské aplikaci se nic nezměnilo (zobrazují se staré nebo nezměněné tipy).

**Diagnostika ze screenshotu:**
Na konci logu v konzoli je vidět zpráva:
`[AI] gemini-2.5-pro selhalo, zkouším fallback na gemini-2.5-flash...`

**Možné příčiny k prověření:**
1. **Fallback selhání**: Je možné, že po chybě `gemini-2.5-pro` (způsobené pravděpodobně překročením kvóty) selhal i fallback na `gemini-2.5-flash`, nebo vrátil prázdný výsledek/chybu parsování JSONu, a pole `suggestions` tak zůstalo prázdné.
2. **Přepsání v DB**: V `server.ts` se ukládají vygenerované návrhy pouze pokud `suggestions.length > 0`:
   ```typescript
   if (admin.apps.length > 0 && suggestions.length > 0) { ... }
   ```
   Pokud fallback vrátil `[]`, staré inspirace v DB nebyly přepsány, čímž aplikace zůstala beze změny, i když scrapery doběhly úspěšně.
3. **Caching / Firebase snapshoting**: Prověřit, zda klientská aplikace správně odebírá změny z kolekce `inspirations` (např. přes `onSnapshot`) nebo zda nenačítá data z cache/staré session.
4. **Zobrazení stavu (Status)**: Ujistit se, že vygenerované tipy mají správný status (např. `approved` vs `proposed` vs `draft`) a že klient filtruje ty správné.

**Kroky pro příště:**
1. Zkontrolovat logy Firestore pro kolekci `inspirations` (zda se v ní objevují nové dokumenty s aktuálním `createdAt` a statusem `approved`).
2. Otestovat chování fallbacku `gemini-2.5-flash` s naším novým promptem napřímo (zda nevrací nevalidní JSON nebo neprodukuje chyby kvůli délce promptu s tolika daty ze scraperů).
3. Prověřit klienty a jejich chování při načítání dat.
