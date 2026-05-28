export interface ShoppingDestination {
  title: string;
  location: string;
  description: string;
  shops: string;
  opening_hours: string;
  url: string;
}

/**
 * Zdroje pro nákupy (oblečení, kosmetika) pro generování tipů pro dceru.
 * Jelikož nákupní centra nemají klasický víkendový program jako kina,
 * poskytujeme AI strukturovaná reálná data o nákupních možnostech v okolí (Brno, Olomouc, Vyškov),
 * ze kterých může sestavit reálný tip na nákupy.
 */
export function getShoppingDestinations(): ShoppingDestination[] {
  return [
    {
      title: "Nákupy v Galerii Vaňkovka Brno",
      location: "Ve Vaňkovce 1, Brno",
      description: "Moderní nákupní centrum v Brně přímo u hlavního nádraží. Skvělé místo pro nákupy nejnovější módy a kosmetiky s přáteli nebo rodinou.",
      shops: "Zara, Mango, H&M, Sephora, Douglas, Peek & Cloppenburg, Pull&Bear, Bershka, Stradivarius, DM drogerie",
      opening_hours: "Po-So: 9:00 - 21:00, Ne: 10:00 - 20:00",
      url: "https://www.galerie-vankovka.cz"
    },
    {
      title: "Nákupní a zábavní centrum Olympia Brno",
      location: "U Dálnice 777, Modřice (Brno-venkov)",
      description: "Největší nákupní centrum na Moravě s obrovským výběrem světových značek oblečení, kosmetiky, multikinem a restauracemi.",
      shops: "Zara, H&M, Sephora, Douglas, Reserved, Marks & Spencer, Lindex, DM drogerie, Rituals, Manufaktura",
      opening_hours: "Po-Pá: 10:00 - 21:00, So-Ne: 9:00 - 21:00",
      url: "https://www.olympia-brno.cz"
    },
    {
      title: "Nákupní galerie Šantovka Olomouc",
      location: "Polská 1, Olomouc",
      description: "Moderní obchodní centrum v srdci Olomouce s pestrou nabídkou obchodů, kaváren a možností zábavy.",
      shops: "H&M, Reserved, Orsay, Lindex, Douglas, DM drogerie, Yves Rocher, Sephora",
      opening_hours: "Denně: 9:00 - 21:00",
      url: "https://www.galerie-santovka.cz"
    },
    {
      title: "Nákupy a drogerie ve Vyškově",
      location: "Cukrovarská / U Nádraží, Vyškov",
      description: "Lokální nákupní zóna ve Vyškově vhodná pro rychlé nákupy oblečení a kosmetiky v drogeriích.",
      shops: "DM drogerie, TETA drogerie, Takko Fashion, Deichmann, Kik, Pepco",
      opening_hours: "obvykle Po-Ne: 9:00 - 20:00",
      url: "https://www.vyskov-mesto.cz"
    }
  ];
}
