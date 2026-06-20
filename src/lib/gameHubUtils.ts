import { ActivitySuggestion, UserProfile, MysteryQuest } from "../types";

export interface UserStats {
  totalIdeas: number;
  realized: number;
  freeActivities: number;
  withDetails: number;
  totalZB: number;
}

export const ZB_RULES = {
  BASIC: 5,         // Zapsání nápadu
  REALIZED: 20,     // Schválení + absolvování akce
  LOGISTICS: 5,     // Dodány detaily (lokace + url)
  FREE_DISCOUNT: 10 // Akce zdarma
};

export const BADGES = [
  { id: "first_idea", name: "První jiskra", desc: "Zadej svůj první nápad", icon: "💡", bonusZB: 5, check: (stats: UserStats) => stats.totalIdeas >= 1 },
  { id: "five_ideas", name: "Generátor nápadů", desc: "Zadej 5 nápadů", icon: "🧠", bonusZB: 10, check: (stats: UserStats) => stats.totalIdeas >= 5 },
  { id: "detail_master", name: "Detailista", desc: "Dodej detaily u 3 aktivit", icon: "🗺️", bonusZB: 10, check: (stats: UserStats) => stats.withDetails >= 3 },
  { id: "streak_3", name: "Série 3", desc: "3 schválené aktivity v řadě", icon: "🔥", bonusZB: 10, check: (stats: UserStats) => stats.realized >= 3 },
  { id: "culture", name: "Kulturní maniak", desc: "3 realizované kulturní akce", icon: "🎭", bonusZB: 15, check: (stats: UserStats) => stats.realized >= 3 },
  { id: "mountain", name: "Horský kamzík", desc: "Realizuj outdoorovou aktivitu", icon: "⛰️", bonusZB: 15, check: (stats: UserStats) => stats.realized >= 2 },
  { id: "discount_hunter", name: "Lovec slev", desc: "Najdi 3 akce zcela zdarma", icon: "💰", bonusZB: 15, check: (stats: UserStats) => stats.freeActivities >= 3 },
  { id: "ten_realized", name: "Dekáda výletů", desc: "10 realizovaných aktivit", icon: "🏆", bonusZB: 20, check: (stats: UserStats) => stats.realized >= 10 },
];

export const getDynamicName = (childName: string, userProfiles: Record<string, UserProfile>): string => {
  if (!childName) return "Neznámý";
  
  const removeAccents = (str: string): string => {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  };
  
  const cleanChild = removeAccents(childName.toLowerCase());
  
  // Fáze 1: Přesná shoda bez diakritiky
  let profile = (Object.values(userProfiles) as UserProfile[]).find(p => {
    const alias = removeAccents((p.adminAlias || "").toLowerCase());
    const disp = removeAccents((p.displayName || "").toLowerCase());
    const emailPref = removeAccents((p.email?.split('@')[0] || "").toLowerCase());
    
    return (
      alias === cleanChild ||
      disp === cleanChild ||
      emailPref === cleanChild ||
      (cleanChild === 'tata' && p.email?.toLowerCase() === 'zefran3@gmail.com')
    );
  });
  
  // Fáze 2: Volnější shoda (startsWith) pouze pokud přesná shoda neexistuje
  if (!profile) {
    profile = (Object.values(userProfiles) as UserProfile[]).find(p => {
      const alias = removeAccents((p.adminAlias || "").toLowerCase());
      const disp = removeAccents((p.displayName || "").toLowerCase());
      const emailPref = removeAccents((p.email?.split('@')[0] || "").toLowerCase());
      
      return (
        alias.startsWith(cleanChild) ||
        disp.startsWith(cleanChild) ||
        emailPref.startsWith(cleanChild)
      );
    });
  }
  
  if (profile) {
    const name = profile.adminAlias || profile.displayName || profile.email?.split('@')[0] || '';
    if (name.toLowerCase() === 'zefran3') return 'Táta';
    return name;
  }
  return childName;
};

const getCreatedTime = (item: any) => {
  if (!item.createdAt) return 0;
  if (typeof item.createdAt === 'number') return item.createdAt;
  if (item.createdAt.toMillis) return item.createdAt.toMillis();
  return new Date(item.createdAt).getTime();
};

export const calculateLeagueStats = (
  suggestions: ActivitySuggestion[],
  quests: MysteryQuest[],
  userProfiles: Record<string, UserProfile>,
  leagueConfig: any
) => {
  const sprint: Record<string, UserStats> = {};
  const maraton: Record<string, UserStats> = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeNames = new Set<string>();
  Object.values(userProfiles).forEach(profile => {
    if (!profile.isBlocked) {
      let name = profile.adminAlias || profile.displayName || profile.email?.split('@')[0] || "Neznámý";
      if (name.toLowerCase() === "zefran3" || name.toLowerCase() === "táta") {
        name = "Táta";
      }
      activeNames.add(name);
      if (!sprint[name]) {
        sprint[name] = { totalIdeas: 0, realized: 0, freeActivities: 0, withDetails: 0, totalZB: 0 };
      }
      if (!maraton[name]) {
        maraton[name] = { totalIdeas: 0, realized: 0, freeActivities: 0, withDetails: 0, totalZB: 0 };
      }
    }
  });

  const startTimestamp = leagueConfig?.leagueStartDate
    ? (leagueConfig.leagueStartDate.toMillis ? leagueConfig.leagueStartDate.toMillis() : new Date(leagueConfig.leagueStartDate).getTime())
    : null;

  if (!startTimestamp || leagueConfig?.status === 'stopped') {
    return { sprint, maraton };
  }

  const daysElapsed = (Date.now() - startTimestamp) / (1000 * 60 * 60 * 24);
  const sprintLengthDays = 60;
  const completedSprints = Math.floor(daysElapsed / sprintLengthDays);
  const currentSprintStartDate = startTimestamp + (completedSprints * sprintLengthDays * 24 * 60 * 60 * 1000);

  suggestions.forEach(s => {
    if (s.type === "ride") return;
    let rawName = s.childName || "Neznámý";
    let name = getDynamicName(rawName, userProfiles);
    
    if (!activeNames.has(name)) return;

    const createdTime = getCreatedTime(s);
    
    // Maraton (celá liga)
    if (createdTime >= startTimestamp) {
      if (s.status === "pending" || s.status === "approved" || s.status === "cancelled") {
        maraton[name].totalIdeas += 1;
        maraton[name].totalZB += ZB_RULES.BASIC;

        if (s.status === "approved" && s.eventDate && new Date(s.eventDate) < today) {
          maraton[name].realized += 1;
          maraton[name].totalZB += ZB_RULES.REALIZED;

          if (s.approvedDetails || (s.location && s.url)) {
            maraton[name].withDetails += 1;
            maraton[name].totalZB += ZB_RULES.LOGISTICS;
          }

          if (s.approvedFree) {
            maraton[name].freeActivities += 1;
            maraton[name].totalZB += ZB_RULES.FREE_DISCOUNT;
          }
        } else if (s.status === "cancelled") {
          if (s.approvedDetails || (s.location && s.url)) {
            maraton[name].withDetails += 1;
            maraton[name].totalZB += ZB_RULES.LOGISTICS;
          }

          if (s.approvedFree) {
            maraton[name].freeActivities += 1;
            maraton[name].totalZB += ZB_RULES.FREE_DISCOUNT;
          }
        }
      }
    }

    // Sprint (aktuální období)
    if (createdTime >= currentSprintStartDate) {
      if (s.status === "pending" || s.status === "approved" || s.status === "cancelled") {
        sprint[name].totalIdeas += 1;
        sprint[name].totalZB += ZB_RULES.BASIC;

        if (s.status === "approved" && s.eventDate && new Date(s.eventDate) < today) {
          sprint[name].realized += 1;
          sprint[name].totalZB += ZB_RULES.REALIZED;

          if (s.approvedDetails || (s.location && s.url)) {
            sprint[name].withDetails += 1;
            sprint[name].totalZB += ZB_RULES.LOGISTICS;
          }

          if (s.approvedFree) {
            sprint[name].freeActivities += 1;
            sprint[name].totalZB += ZB_RULES.FREE_DISCOUNT;
          }
        } else if (s.status === "cancelled") {
          if (s.approvedDetails || (s.location && s.url)) {
            sprint[name].withDetails += 1;
            sprint[name].totalZB += ZB_RULES.LOGISTICS;
          }

          if (s.approvedFree) {
            sprint[name].freeActivities += 1;
            sprint[name].totalZB += ZB_RULES.FREE_DISCOUNT;
          }
        }
      }
    }
  });

  quests.forEach(q => {
    if (q.status === 'approved' && q.completedBy) {
      let rawName = q.completedBy;
      let name = getDynamicName(rawName, userProfiles);
      
      if (activeNames.has(name)) {
        const createdTime = getCreatedTime(q);
        const baseXP = parseFloat(q.bonusMultiplier as any) || 0;
        const bonusXP = parseFloat(q.appliedBonusXP as any) || 0;
        const totalQP = baseXP + bonusXP;

        if (createdTime >= startTimestamp) {
          if (!maraton[name]) {
            maraton[name] = { totalIdeas: 0, realized: 0, freeActivities: 0, withDetails: 0, totalZB: 0 };
          }
          maraton[name].totalZB += totalQP;
        }

        if (createdTime >= currentSprintStartDate) {
          if (!sprint[name]) {
            sprint[name] = { totalIdeas: 0, realized: 0, freeActivities: 0, withDetails: 0, totalZB: 0 };
          }
          sprint[name].totalZB += totalQP;
        }
      }
    }
  });

  return { sprint, maraton };
};
