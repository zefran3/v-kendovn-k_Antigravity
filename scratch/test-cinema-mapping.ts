import { CineStarListing } from '../src/types';

// Normalization function from server.ts
const normalizeStr = (str: string) =>
  str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, "") // remove special chars and spaces
    .trim();

function testPostProcessing() {
  console.log("--- RUNNING MOCK POST-PROCESSING TEST ---");

  // Mock scraper output
  const mksCinema = [
    {
      date: "2026-06-20",
      cinema_listings: [
        {
          film: "Toy Story 5: Příběh hraček",
          time: "17:00",
          url: "https://www.mksvyskov.cz/filmy/?id=toy-story-5-mks"
        },
        {
          film: "Backrooms",
          time: "19:30",
          url: "https://www.mksvyskov.cz/filmy/?id=backrooms-mks"
        }
      ]
    }
  ];

  const cineStarData = [
    {
      date: "2026-06-20",
      cinema_listings: [
        {
          film: "Toy Story 5: Příběh hraček",
          time: "13:00, 15:20",
          url: "https://websale.cinestar.cz/?eventid=1725582"
        },
        {
          film: "Backrooms",
          time: "16:30, 20:30",
          url: "https://websale.cinestar.cz/?eventid=1725033"
        }
      ]
    }
  ];

  // Mock AI generated suggestions
  const suggestions = [
    {
      title: "Kino Sokolský dům Vyškov",
      location: "Kino Sokolský dům Vyškov, Purkyňova 405/2, Vyškov",
      cinema_listings: [
        { film: "Toy Story 5: Příběh hraček", time: "17:00", url: "zkomolena_url" },
        { film: "Backrooms", time: "19:30", url: "zkomolena_url" }
      ]
    },
    {
      title: "CineStar Olomouc",
      location: "CineStar Olomouc, OC Olomouc City, Pražská 255/41, Olomouc",
      cinema_listings: [
        { film: "Toy Story 5: Příběh hraček", time: "13:00, 15:20", url: "zkomolena_url" },
        { film: "Backrooms", time: "16:30, 20:30", url: "zkomolena_url" }
      ]
    }
  ];

  // Run the post-processing mapping logic we added
  const processed = suggestions.map((s: any) => {
    if (Array.isArray(s.cinema_listings)) {
      const isCineStar = s.location && s.location.includes('CineStar');
      const isMks = s.location && (s.location.includes('Sokolský dům') || s.location.includes('MKS') || s.location.includes('Vyškov'));

      const originalListings: any[] = [];
      if (isMks && Array.isArray(mksCinema)) {
        mksCinema.forEach(c => {
          if (Array.isArray(c.cinema_listings)) originalListings.push(...c.cinema_listings);
        });
      } else if (isCineStar && Array.isArray(cineStarData)) {
        cineStarData.forEach(c => {
          if (Array.isArray(c.cinema_listings)) originalListings.push(...c.cinema_listings);
        });
      }

      s.cinema_listings = s.cinema_listings.map((item: any) => {
        const titleKey = normalizeStr(item.film || item.film_title || '');
        if (titleKey) {
          const match = originalListings.find(orig => {
            const origKey = normalizeStr(orig.film || orig.film_title || '');
            return origKey === titleKey || origKey.includes(titleKey) || titleKey.includes(origKey);
          });
          if (match && match.url) {
            return {
              ...item,
              url: match.url
            };
          }
        }
        return item;
      });
    }
    return s;
  });

  console.log("Processed suggestions output:");
  console.log(JSON.stringify(processed, null, 2));

  // Assertions
  const mksCard = processed.find(p => p.title.includes("Sokolský dům"));
  const cineStarCard = processed.find(p => p.title.includes("CineStar"));

  const mksToyStory = mksCard?.cinema_listings.find(l => l.film.includes("Toy Story"));
  const cineStarToyStory = cineStarCard?.cinema_listings.find(l => l.film.includes("Toy Story"));

  console.log("MKS Toy Story URL:", mksToyStory?.url);
  console.log("CineStar Toy Story URL:", cineStarToyStory?.url);

  if (mksToyStory?.url === "https://www.mksvyskov.cz/filmy/?id=toy-story-5-mks" &&
      cineStarToyStory?.url === "https://websale.cinestar.cz/?eventid=1725582") {
    console.log("✅ SUCCESS: URLs mapped correctly to their respective cinema sources!");
  } else {
    console.error("❌ FAILURE: URLs mapped incorrectly!");
    process.exit(1);
  }
}

testPostProcessing();
