import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, Trophy, Target, Star, Lock, Zap, Gift, Shield, Plus,
  ChevronRight, Flame, Award, TrendingUp, Crown, Eye, EyeOff, Check, AlertTriangle,
  Lightbulb, HelpCircle
} from "lucide-react";
import { cn } from "./lib/utils";
import { ActivitySuggestion, UserProfile, WishlistItem, MysteryQuest } from "./types";
import { db } from "./firebase";
import { collection, addDoc, updateDoc, setDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";

// ─── ZB Bodovací systém ──────────────────────────────────
const ZB_RULES = {
  BASIC: 5,         // Zapsání nápadu
  REALIZED: 20,     // Schválená + absolvovaná akce
  LOGISTICS: 5,     // Dodány detaily (lokace + url)
  FREE_DISCOUNT: 10 // Akce zdarma
};

// ─── Tituly podle celkových ZB ───────────────────────────
const TITLES = [
  { min: 0, title: "Zelenáč", color: "text-zinc-400" },
  { min: 50, title: "Cestovatel", color: "text-emerald-400" },
  { min: 150, title: "Průzkumník", color: "text-cyan-400" },
  { min: 300, title: "Taktický plánovač", color: "text-violet-400" },
  { min: 500, title: "Velitel výprav", color: "text-amber-400" },
  { min: 800, title: "Legendární stratég", color: "text-rose-400" },
];

function getTitle(zb: number) {
  let t = TITLES[0];
  for (const tier of TITLES) {
    if (zb >= tier.min) t = tier;
  }
  return t;
}

function getNextTitle(zb: number) {
  for (const tier of TITLES) {
    if (zb < tier.min) return tier;
  }
  return null;
}

// ─── Odznaky ─────────────────────────────────────────────
const BADGES = [
  { id: "first_idea", name: "První jiskra", desc: "Zadej svůj první nápad", icon: "⚡", bonusZB: 8, check: (stats: UserStats) => stats.totalIdeas >= 1 },
  { id: "five_ideas", name: "Generátor nápadů", desc: "Zadej 5 nápadů", icon: "💡", bonusZB: 16, check: (stats: UserStats) => stats.totalIdeas >= 5 },
  { id: "culture", name: "Kulturní maniak", desc: "3 realizované kulturní akce", icon: "🎭", bonusZB: 26, check: (stats: UserStats) => stats.realized >= 3 },
  { id: "mountain", name: "Horský kamzík", desc: "Realizuj outdoorovou aktivitu", icon: "🏔️", bonusZB: 20, check: (stats: UserStats) => stats.realized >= 2 },
  { id: "discount_hunter", name: "Lovec slev", desc: "Najdi 3 akce zcela zdarma", icon: "💰", bonusZB: 26, check: (stats: UserStats) => stats.freeActivities >= 3 },
  { id: "detail_master", name: "Detailista", desc: "Dodej detaily u 3 aktivit", icon: "📋", bonusZB: 16, check: (stats: UserStats) => stats.withDetails >= 3 },
  { id: "streak_3", name: "Série 3", desc: "3 schválené aktivity v řadě", icon: "🔥", bonusZB: 20, check: (stats: UserStats) => stats.realized >= 3 },
  { id: "ten_realized", name: "Dekáda výletů", desc: "10 realizovaných aktivit", icon: "🏆", bonusZB: 50, check: (stats: UserStats) => stats.realized >= 10 },
];

// ─── Sprint odměny ───────────────────────────────────────
const SPRINT_REWARDS = [
  { icon: "🍽️", title: "Žolík na mytí nádobí", desc: "Celý týden bez nádobí" },
  { icon: "🎮", title: "Vládce ovladače", desc: "Spotify/TV na celý víkend" },
  { icon: "🍕", title: "Kulinářský diktátor", desc: "Výběr oběda na celý den" },
  { icon: "🌙", title: "Late Night Pass", desc: "Večerka o hodinu později" },
];

interface UserStats {
  totalIdeas: number;
  realized: number;
  freeActivities: number;
  withDetails: number;
  totalZB: number;
}

// ─── Props ───────────────────────────────────────────────
interface GameHubProps {
  suggestions: ActivitySuggestion[];
  userProfiles: Record<string, UserProfile>;
  currentUserName: string;
  currentUserId: string;
  view: "parent" | "child";
  onClose: () => void;
  getAvatarForChild: (name: string) => string;
}

export default function GameHub({ suggestions, userProfiles, currentUserName, currentUserId, view, onClose, getAvatarForChild }: GameHubProps) {
  const [leaderboardMode, setLeaderboardMode] = useState<"sprint" | "liga">("sprint");
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [showRewards, setShowRewards] = useState(false);
  const [wishlists, setWishlists] = useState<WishlistItem[]>([]);
  const [quests, setQuests] = useState<MysteryQuest[]>([]);
  const [leagueConfig, setLeagueConfig] = useState<any>({ status: 'stopped', leagueStartDate: null });
  const [showWishForm, setShowWishForm] = useState(false);
  const [wishName, setWishName] = useState("");
  const [wishUrl, setWishUrl] = useState("");
  const [approvingWish, setApprovingWish] = useState<WishlistItem | null>(null);
  const [approveZB, setApproveZB] = useState("500");
  const [showCreateQuest, setShowCreateQuest] = useState(false);
  const [questTitle, setQuestTitle] = useState("");
  const [questDesc, setQuestDesc] = useState("");
  const [questHours, setQuestHours] = useState("48");
  const [questMultiplier, setQuestMultiplier] = useState("2");
  const [showPointBreakdown, setShowPointBreakdown] = useState(false);
  const [rejectingWish, setRejectingWish] = useState<WishlistItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [localView, setLocalView] = useState(view);
  const [showBonusInfo, setShowBonusInfo] = useState(false);
  const normalizedCurrentUserName = (currentUserName || "").toLowerCase() === "zefran3" || (currentUserName || "").toLowerCase() === "táta" ? "Táta" : currentUserName;
  const currentUserRole = useMemo(() => userProfiles[currentUserId]?.role || 'viewer', [userProfiles, currentUserId]);
  const canApproveActivities = useMemo(() => currentUserRole === 'admin' || currentUserRole === 'parent', [currentUserRole]);
  const canManageSystem = useMemo(() => currentUserRole === 'admin', [currentUserRole]);

  // Sprint odměny stavy
  const [rewards, setRewards] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [claimingReward, setClaimingReward] = useState<any | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);

  // ─── Firestore listenery ─────────────────────────────
  useEffect(() => {
    const unsubW = onSnapshot(
      query(collection(db, 'wishlists'), orderBy('createdAt', 'desc')),
      snap => setWishlists(snap.docs.map(d => ({ id: d.id, ...d.data() } as WishlistItem))),
      err => console.error("Wishlist listen error:", err)
    );
    const unsubQ = onSnapshot(
      query(collection(db, 'quests'), orderBy('createdAt', 'desc')),
      snap => setQuests(snap.docs.map(d => ({ id: d.id, ...d.data() } as MysteryQuest))),
      err => console.error("Quest listen error:", err)
    );
    const unsubL = onSnapshot(
      doc(db, 'settings', 'league_config'),
      docSnap => {
        if (docSnap.exists()) {
          setLeagueConfig(docSnap.data());
        } else {
          setLeagueConfig({ status: 'stopped', leagueStartDate: null });
        }
      },
      err => console.error("League config listen error:", err)
    );
    const unsubRewards = onSnapshot(
      collection(db, 'sprintRewards'),
      snap => setRewards(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error("Rewards listen error:", err)
    );
    const unsubClaims = onSnapshot(
      collection(db, 'rewardClaims'),
      snap => setClaims(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error("Claims listen error:", err)
    );
    return () => { unsubW(); unsubQ(); unsubL(); unsubRewards(); unsubClaims(); };
  }, []);

  // ─── Handlers ────────────────────────────────────────
  const handleConfirmClaimReward = async () => {
    if (!claimingReward || isClaiming) return;
    setIsClaiming(true);
    try {
      await addDoc(collection(db, "rewardClaims"), {
        userId: currentUserId,
        userName: normalizedCurrentUserName,
        rewardTitle: claimingReward.title,
        sprintId: currentSprintId,
        claimedAt: serverTimestamp()
      });
      setClaimingReward(null);
    } catch (err) {
      console.error("Failed to claim reward:", err);
    } finally {
      setIsClaiming(false);
    }
  };

  const handleAddWish = async () => {
    if (!wishName.trim()) return;
    await addDoc(collection(db, 'wishlists'), {
      childName: normalizedCurrentUserName,
      authorId: currentUserId,
      name: wishName.trim(),
      url: wishUrl.trim() || null,
      targetZB: 0,
      status: 'pending',
      createdAt: serverTimestamp()
    });
    setWishName(""); setWishUrl(""); setShowWishForm(false);
  };

  const handleApproveWish = async () => {
    if (!approvingWish) return;
    await updateDoc(doc(db, 'wishlists', approvingWish.id), {
      status: 'approved',
      targetZB: parseInt(approveZB) || 500
    });
    setApprovingWish(null);
  };

  const handleRejectWish = async (id: string) => {
    await updateDoc(doc(db, 'wishlists', id), { status: 'rejected' });
    setRejectingWish(null); setRejectReason("");
  };

  const handleRejectWishWithReason = async () => {
    if (!rejectingWish) return;
    await updateDoc(doc(db, 'wishlists', rejectingWish.id), { 
      status: 'rejected',
      rejectReason: rejectReason.trim() || 'Zamítnuto bez uvedení důvodu'
    });
    setRejectingWish(null); setRejectReason("");
  };

  const handleAddQuest = async () => {
    if (!questTitle.trim()) return;
    await addDoc(collection(db, 'quests'), {
      title: questTitle.trim(),
      description: questDesc.trim(),
      bonusMultiplier: parseFloat(questMultiplier) || 2,
      deadlineHours: parseInt(questHours) || 48,
      active: true,
      createdAt: serverTimestamp()
    });
    setQuestTitle(""); setQuestDesc(""); setShowCreateQuest(false);
  };

  const handleDeactivateQuest = async (id: string) => {
    await updateDoc(doc(db, 'quests', id), { active: false });
  };

  const handleCompleteQuest = async (questId: string) => {
    const completedBy = normalizedCurrentUserName || "Táta";
    
    // Dynamický výpočet dorovnávacího bonusu
    const maxXP = leaderboardData.length > 0 ? Math.max(...leaderboardData.map(p => p.totalZB)) : 0;
    const currentPlayerRecord = leaderboardData.find(p => p.name === completedBy);
    const currentPlayerXP = currentPlayerRecord ? currentPlayerRecord.totalZB : 0;
    const xpGap = Math.max(0, maxXP - currentPlayerXP);
    
    let appliedBonusXP = 0;
    if (xpGap >= 100) {
      appliedBonusXP = 15;
    } else if (xpGap >= 50) {
      appliedBonusXP = 10;
    } else if (xpGap >= 20) {
      appliedBonusXP = 5;
    }

    await updateDoc(doc(db, 'quests', questId), {
      status: 'pending_approval',
      completedBy,
      appliedBonusXP
    });
  };

  const handleApproveQuest = async (questId: string) => {
    await updateDoc(doc(db, 'quests', questId), {
      status: 'approved',
      active: false
    });
  };

  const handleRejectQuest = async (questId: string) => {
    await updateDoc(doc(db, 'quests', questId), {
      status: 'active',
      completedBy: null,
      appliedBonusXP: 0
    });
  };

  const handleStartLeague = async () => {
    await setDoc(doc(db, 'settings', 'league_config'), {
      status: 'running',
      leagueStartDate: serverTimestamp(),
      pausedAt: null
    });
  };

  const handlePauseLeague = async () => {
    await setDoc(doc(db, 'settings', 'league_config'), {
      status: 'paused',
      pausedAt: serverTimestamp(),
      leagueStartDate: leagueConfig.leagueStartDate
    });
  };

  const handleResumeLeague = async () => {
    if (!leagueConfig.pausedAt || !leagueConfig.leagueStartDate) return;
    const pauseDurationMs = Date.now() - (leagueConfig.pausedAt.toMillis ? leagueConfig.pausedAt.toMillis() : new Date(leagueConfig.pausedAt).getTime());
    const oldStartMs = leagueConfig.leagueStartDate.toMillis ? leagueConfig.leagueStartDate.toMillis() : new Date(leagueConfig.leagueStartDate).getTime();
    const newStartMs = oldStartMs + pauseDurationMs;
    await setDoc(doc(db, 'settings', 'league_config'), {
      status: 'running',
      leagueStartDate: new Date(newStartMs),
      pausedAt: null
    });
  };

  const handleResetLeague = async () => {
    await setDoc(doc(db, 'settings', 'league_config'), {
      status: 'running',
      leagueStartDate: serverTimestamp(),
      pausedAt: null
    });
  };

  // ─── Výpočet ZB bodů z reálných dat ─────────────────
  const playerStats = useMemo(() => {
    const stats: Record<string, UserStats> = {};
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
        if (!stats[name]) {
          stats[name] = { totalIdeas: 0, realized: 0, freeActivities: 0, withDetails: 0, totalZB: 0 };
        }
      }
    });

    const startTimestamp = leagueConfig?.leagueStartDate
      ? (leagueConfig.leagueStartDate.toMillis ? leagueConfig.leagueStartDate.toMillis() : new Date(leagueConfig.leagueStartDate).getTime())
      : null;

    if (!startTimestamp || leagueConfig?.status === 'stopped') {
      return stats;
    }

    const daysElapsed = (Date.now() - startTimestamp) / (1000 * 60 * 60 * 24);
    const sprintLengthDays = 60;
    const completedSprints = Math.floor(daysElapsed / sprintLengthDays);
    const currentSprintStartDate = startTimestamp + (completedSprints * sprintLengthDays * 24 * 60 * 60 * 1000);

    const getCreatedTime = (item: any) => {
      if (!item.createdAt) return 0;
      if (typeof item.createdAt === 'number') return item.createdAt;
      if (item.createdAt.toMillis) return item.createdAt.toMillis();
      return new Date(item.createdAt).getTime();
    };

    const filterStartDate = leaderboardMode === "sprint" ? currentSprintStartDate : startTimestamp;

    suggestions.forEach(s => {
      if (s.type === "ride") return;
      let name = s.childName || "Neznámý";
      if (name.toLowerCase() === "zefran3" || name.toLowerCase() === "táta") {
        name = "Táta";
      }
      
      // Do žebříčku započítáváme jen aktivní uživatele přihlášené do aplikace
      if (!activeNames.has(name)) return;

      // Filter by dynamic time window
      if (getCreatedTime(s) < filterStartDate) return;

      // Základní body za nápad
      if (s.status !== "cancelled") {
        stats[name].totalIdeas += 1;
        stats[name].totalZB += ZB_RULES.BASIC;
      }

      // Body za realizaci
      if (s.status === "approved" && s.eventDate && new Date(s.eventDate) < today) {
        stats[name].realized += 1;
        stats[name].totalZB += ZB_RULES.REALIZED;

        // Logistický bonus (má lokaci A url NEBO Táta schválil detail)
        if (s.approvedDetails || (s.location && s.url)) {
          stats[name].withDetails += 1;
          stats[name].totalZB += ZB_RULES.LOGISTICS;
        }

        // Bonus za akci zdarma / sleva
        if (s.approvedFree) {
          stats[name].freeActivities += 1;
          stats[name].totalZB += ZB_RULES.FREE_DISCOUNT;
        }
      }
    });

    // Přičtení bodů ze schválených tajných misí (Quests)
    quests.forEach(q => {
      if (q.status === 'approved' && q.completedBy) {
        let name = q.completedBy;
        if (name.toLowerCase() === "zefran3" || name.toLowerCase() === "táta") {
          name = "Táta";
        }
        
        if (activeNames.has(name)) {
          if (!stats[name]) {
            stats[name] = { totalIdeas: 0, realized: 0, freeActivities: 0, withDetails: 0, totalZB: 0 };
          }

          // Filter by dynamic time window
          if (getCreatedTime(q) < filterStartDate) return;

          const baseXP = parseFloat(q.bonusMultiplier as any) || 0;
          const bonusXP = parseFloat(q.appliedBonusXP as any) || 0;
          stats[name].totalZB += (baseXP + bonusXP);
        }
      }
    });

    return stats;
  }, [suggestions, quests, userProfiles, leagueConfig, leaderboardMode]);

  // Sprint odměny výpočty
  const currentSprintId = useMemo(() => {
    const startTimestamp = leagueConfig?.leagueStartDate
      ? (leagueConfig.leagueStartDate.toMillis ? leagueConfig.leagueStartDate.toMillis() : new Date(leagueConfig.leagueStartDate).getTime())
      : null;
    if (!startTimestamp) return "sprint_0";
    const daysElapsed = (Date.now() - startTimestamp) / (1000 * 60 * 60 * 24);
    const sprintLengthDays = 60;
    const completedSprints = Math.floor(daysElapsed / sprintLengthDays);
    return `sprint_${completedSprints}`;
  }, [leagueConfig]);

  const sprintStats = useMemo(() => {
    const stats: Record<string, UserStats> = {};
    const activeNames = new Set(Object.values(userProfiles || {}).map(p => p.adminAlias || p.displayName || p.email?.split('@')[0]));
    
    Object.values(userProfiles || {}).forEach(p => {
      let name = p.adminAlias || p.displayName || p.email?.split('@')[0];
      if (name) {
        if (name.toLowerCase() === "zefran3" || name.toLowerCase() === "táta") {
          name = "Táta";
        }
        activeNames.add(name);
        if (!stats[name]) {
          stats[name] = { totalIdeas: 0, realized: 0, freeActivities: 0, withDetails: 0, totalZB: 0 };
        }
      }
    });

    const startTimestamp = leagueConfig?.leagueStartDate
      ? (leagueConfig.leagueStartDate.toMillis ? leagueConfig.leagueStartDate.toMillis() : new Date(leagueConfig.leagueStartDate).getTime())
      : null;

    if (!startTimestamp || leagueConfig?.status === 'stopped') {
      return stats;
    }

    const daysElapsed = (Date.now() - startTimestamp) / (1000 * 60 * 60 * 24);
    const sprintLengthDays = 60;
    const completedSprints = Math.floor(daysElapsed / sprintLengthDays);
    const currentSprintStartDate = startTimestamp + (completedSprints * sprintLengthDays * 24 * 60 * 60 * 1000);

    const getCreatedTime = (item: any) => {
      if (!item.createdAt) return 0;
      if (typeof item.createdAt === 'number') return item.createdAt;
      if (item.createdAt.toMillis) return item.createdAt.toMillis();
      return new Date(item.createdAt).getTime();
    };

    const today = new Date();

    suggestions.forEach(s => {
      if (s.type === "ride") return;
      let name = s.childName || "Neznámý";
      if (name.toLowerCase() === "zefran3" || name.toLowerCase() === "táta") {
        name = "Táta";
      }
      if (!activeNames.has(name)) return;
      if (getCreatedTime(s) < currentSprintStartDate) return;

      if (s.status !== "cancelled") {
        stats[name].totalIdeas += 1;
        stats[name].totalZB += ZB_RULES.BASIC;
      }

      if (s.status === "approved" && s.eventDate && new Date(s.eventDate) < today) {
        stats[name].realized += 1;
        stats[name].totalZB += ZB_RULES.REALIZED;

        if (s.approvedDetails || (s.location && s.url)) {
          stats[name].withDetails += 1;
          stats[name].totalZB += ZB_RULES.LOGISTICS;
        }

        if (s.approvedFree) {
          stats[name].freeActivities += 1;
          stats[name].totalZB += ZB_RULES.FREE_DISCOUNT;
        }
      }
    });

    quests.forEach(q => {
      if (q.status === 'approved' && q.completedBy) {
        let name = q.completedBy;
        if (name.toLowerCase() === "zefran3" || name.toLowerCase() === "táta") {
          name = "Táta";
        }
        if (activeNames.has(name)) {
          if (!stats[name]) {
            stats[name] = { totalIdeas: 0, realized: 0, freeActivities: 0, withDetails: 0, totalZB: 0 };
          }
          if (getCreatedTime(q) < currentSprintStartDate) return;
          const baseXP = parseFloat(q.bonusMultiplier as any) || 0;
          const bonusXP = parseFloat(q.appliedBonusXP as any) || 0;
          stats[name].totalZB += (baseXP + bonusXP);
        }
      }
    });

    return stats;
  }, [suggestions, quests, userProfiles, leagueConfig]);

  const currentSprintXP = useMemo(() => {
    const pStats = sprintStats?.[normalizedCurrentUserName] || { totalIdeas: 0, realized: 0, freeActivities: 0, withDetails: 0, totalZB: 0 };
    const badgeBonus = BADGES.filter(b => b.check(pStats)).reduce((s, b) => s + b.bonusZB, 0);
    return (pStats.totalZB || 0) + badgeBonus;
  }, [sprintStats, normalizedCurrentUserName]);

  const sprintXPThreshold = leagueConfig?.sprintXPThreshold !== undefined ? leagueConfig.sprintXPThreshold : 80;

  const claimedRewardInCurrentSprint = useMemo(() => {
    return (claims || []).find(c => c.userId === currentUserId && c.sprintId === currentSprintId);
  }, [claims, currentUserId, currentSprintId]);

  const hasClaimed = !!claimedRewardInCurrentSprint;
  const isSprintRewardsLocked = currentUserRole === 'admin' || currentUserRole === 'parent' ? false : currentSprintXP < sprintXPThreshold;

  // ─── Žebříček ────────────────────────────────────────
  const leaderboardData = useMemo(() => {
    return Object.entries(playerStats)
      .map(([name, stats]) => {
        const badgeBonus = BADGES.filter(b => b.check(stats)).reduce((s, b) => s + b.bonusZB, 0);
        return { name, ...stats, totalZB: stats.totalZB + badgeBonus, avatar: getAvatarForChild(name) };
      })
      .sort((a, b) => b.totalZB - a.totalZB);
  }, [playerStats, getAvatarForChild]);

  const activePlayer = selectedPlayer || normalizedCurrentUserName;
  const activeStats = playerStats[activePlayer] || { totalIdeas: 0, realized: 0, freeActivities: 0, withDetails: 0, totalZB: 0 };
  const unlockedBadges = BADGES.filter(b => b.check(activeStats));
  const activeBadgeBonus = unlockedBadges.reduce((sum, b) => sum + b.bonusZB, 0);
  const activeTotalXP = activeStats.totalZB + activeBadgeBonus; // Skutečné celkové XP
  const activeTitle = getTitle(activeTotalXP);
  const nextTitle = getNextTitle(activeTotalXP);
  const maxXP = leaderboardData.length > 0 ? Math.max(...leaderboardData.map(p => p.totalZB)) : 0;
  const xpGap = Math.max(0, maxXP - activeTotalXP);
  let currentBonusXP = 0;
  if (xpGap >= 100) {
    currentBonusXP = 15;
  } else if (xpGap >= 50) {
    currentBonusXP = 10;
  } else if (xpGap >= 20) {
    currentBonusXP = 5;
  }
  const isUnderdog = currentBonusXP > 0;
  
  const kidsProfiles = leaderboardData.filter(p => p.name !== "Táta");
  const avgKidsXP = kidsProfiles.length > 0
    ? kidsProfiles.reduce((sum, p) => sum + p.totalZB, 0) / kidsProfiles.length
    : 0;
  const calculatedXP = Math.round((400 - avgKidsXP) / 25);
  const suggestedXP = Math.max(5, Math.min(15, calculatedXP));
  const activeWishlist = wishlists.filter(w => {
    const wName = (w.childName || "").toLowerCase() === "zefran3" || (w.childName || "").toLowerCase() === "táta" ? "Táta" : w.childName;
    return wName === activePlayer;
  });
  const activeQuests = quests.filter(q => q.active);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col"
    >
      {/* Backdrop */}
      <div className={cn("absolute inset-0 transition-colors duration-700",
        leaderboardMode === 'liga'
          ? "bg-gradient-to-br from-rose-950 via-purple-950 to-slate-950"
          : "bg-gradient-to-br from-slate-950 via-zinc-900 to-slate-950"
      )} />

      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px'
      }} />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full overflow-y-auto">

        {/* ═══ HEADER ═══ */}
        <header className="sticky top-0 z-20 backdrop-blur-xl bg-slate-950/80 border-b border-white/5 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
              <Zap size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-black text-white tracking-tight">GAME HUB</h1>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest">XP Body</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            {canApproveActivities && (
              <button onClick={() => setLocalView(localView === 'parent' ? 'child' : 'parent')}
                className={cn("px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
                  localView === 'parent' ? "bg-rose-500/20 text-rose-400 border-rose-500/20" : "bg-cyan-500/20 text-cyan-400 border-cyan-500/20"
                )}>
                {localView === 'parent' ? "👀 Zobrazit jako Hráč" : "👑 Přepnout na Admina"}
              </button>
            )}
            {/* Víkendovník logo → back */}
            <button onClick={onClose} className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600/20 to-teal-600/20 border border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400 font-black text-xs tracking-tight transition-all hover:scale-105">
              🌿 Víkendovník
            </button>
          </div>
        </header>

        <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full space-y-5">

          {/* ═══ ADMIN PANEL: SPRÁVA LIGY ═══ */}
          {localView === "parent" && canManageSystem && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-800/80 to-zinc-900/60 border border-white/5 p-5 space-y-4 shadow-xl"
            >
              <div className="absolute -top-10 -right-10 w-24 h-24 bg-violet-500/10 rounded-full blur-2xl" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">⚙️</span>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">Správa Ligy (Velitelský můstek)</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-zinc-900/60 border border-white/5 rounded-xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400 font-bold">Stav sezóny:</span>
                      {leagueConfig.status === 'running' && (
                        <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider animate-pulse">
                          🟢 Běží
                        </span>
                      )}
                      {leagueConfig.status === 'paused' && (
                        <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">
                          🟡 Pozastaveno
                        </span>
                      )}
                      {leagueConfig.status === 'stopped' && (
                        <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">
                          🔴 Zastaveno
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-zinc-400 space-y-1">
                      <div className="flex justify-between">
                        <span>Začátek ligy:</span>
                        <span className="text-white font-bold">
                          {leagueConfig.leagueStartDate 
                            ? new Date(leagueConfig.leagueStartDate.toMillis ? leagueConfig.leagueStartDate.toMillis() : leagueConfig.leagueStartDate).toLocaleDateString('cs-CZ') 
                            : 'Nezahájeno'}
                        </span>
                      </div>
                      {leagueConfig.status === 'paused' && leagueConfig.pausedAt && (
                        <div className="flex justify-between text-amber-400">
                          <span>Pozastaveno od:</span>
                          <span className="font-bold">
                            {new Date(leagueConfig.pausedAt.toMillis ? leagueConfig.pausedAt.toMillis() : leagueConfig.pausedAt).toLocaleDateString('cs-CZ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col justify-center gap-2">
                    {leagueConfig.status === 'stopped' && (
                      <button
                        onClick={handleStartLeague}
                        className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs rounded-xl shadow-lg shadow-emerald-500/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                      >
                        🚀 Odstartovat novou ligu
                      </button>
                    )}

                    {leagueConfig.status === 'running' && (
                      <button
                        onClick={handlePauseLeague}
                        className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-black text-xs rounded-xl shadow-lg shadow-amber-500/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                      >
                        ⏸️ Pozastavit ligu
                      </button>
                    )}

                    {leagueConfig.status === 'paused' && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={handleResumeLeague}
                          className="py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs rounded-xl shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                        >
                          ▶️ Pokračovat
                        </button>
                        <button
                          onClick={handleResetLeague}
                          className="py-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-black text-xs rounded-xl shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                        >
                          🔄 Resetovat
                        </button>
                      </div>
                    )}
                    {/* Dedikované tlačítko pro zadání Tajné mise */}
                    <button
                      onClick={() => setShowCreateQuest(!showCreateQuest)}
                      className="w-full py-2.5 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-black text-xs rounded-xl shadow-lg shadow-amber-500/5 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 mt-1"
                    >
                      ➕ Zadat tajnou misi
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══ FORMULÁŘ PRO NOVOU TAJNOU MISI ═══ */}
          <AnimatePresence>
            {localView === "parent" && showCreateQuest && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-zinc-800/50 border border-amber-500/10 rounded-xl p-4 space-y-3">
                  <input value={questTitle} onChange={e => setQuestTitle(e.target.value)} placeholder="Název mise..." className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-amber-500/30" />
                  <textarea value={questDesc} onChange={e => setQuestDesc(e.target.value)} placeholder="Popis výzvy..." className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-amber-500/30 h-16 resize-none" />
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-zinc-400 font-bold">Časový limit (v hodinách)</label>
                      <input value={questHours} onChange={e => setQuestHours(e.target.value)} placeholder="Hodin (např. 48)" type="number" className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/30" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-zinc-400 font-bold">Základní odměna (XP)</label>
                      <input value={questMultiplier} onChange={e => setQuestMultiplier(e.target.value)} placeholder="XP (např. 10)" type="number" step="1" className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/30" />
                      <span 
                        onClick={() => setQuestMultiplier(suggestedXP.toString())} 
                        className="cursor-pointer text-xs text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1 mt-1 font-medium"
                      >
                        <Lightbulb size={12} /> Doporučená odměna: {suggestedXP} XP (Klikni pro vložení)
                      </span>
                    </div>
                  </div>
                  
                  <button onClick={handleAddQuest} className="w-full bg-amber-500 text-black font-bold text-xs py-2.5 rounded-lg hover:bg-amber-400 transition-colors mt-2">Aktivovat misi</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══ ADMIN PANEL: DETAILNÍ ANALYTIKA HRÁČŮ ═══ */}
          {localView === "parent" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-violet-400" />
                <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">📊 Detailní analytika hráčů</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {leaderboardData
                  .filter(p => p.name !== "Táta")
                  .map(player => {
                    const name = player.name;
                    const stats = playerStats[name] || { totalIdeas: 0, realized: 0, freeActivities: 0, withDetails: 0, totalZB: 0 };
                    
                    const unlockedB = BADGES.filter(b => b.check(stats));
                    const badgeBonus = unlockedB.reduce((s, b) => s + b.bonusZB, 0);

                    const childQuests = quests.filter(q => q.status === 'approved' && q.completedBy === name);
                    const questBaseXP = childQuests.reduce((s, q) => s + (parseFloat(q.bonusMultiplier as any) || 0), 0);
                    const questBonusXP = childQuests.reduce((s, q) => s + (parseFloat(q.appliedBonusXP as any) || 0), 0);
                    const totalQuestXP = questBaseXP + questBonusXP;

                    const totalXP = stats.totalZB + badgeBonus;
                    
                    return (
                      <div key={name} className="relative overflow-hidden rounded-2xl bg-zinc-800/50 border border-white/5 p-4 space-y-3 hover:border-violet-500/20 transition-colors">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                          <div className="flex items-center gap-2">
                            {(() => {
                              const av = getAvatarForChild(name);
                              return av.startsWith('http') || av.startsWith('data:')
                                ? <img src={av} className="w-8 h-8 rounded-lg object-cover border border-white/10" />
                                : <span className="text-xl w-8 h-8 bg-zinc-700 rounded-lg flex items-center justify-center">{av}</span>;
                            })()}
                            <span className="text-sm font-black text-white">{name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Zap size={12} className="text-amber-400" />
                            <span className="text-sm font-black text-amber-400">{totalXP}</span>
                            <span className="text-[10px] text-zinc-500 font-bold">XP</span>
                          </div>
                        </div>

                        <div className="space-y-0 text-zinc-400">
                          <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                            <span className="text-xs sm:text-sm text-zinc-400">💡 Zadané nápady ({stats.totalIdeas}x)</span>
                            <span className="text-xs sm:text-sm font-bold text-amber-400">+{stats.totalIdeas * ZB_RULES.BASIC} XP</span>
                          </div>
                          <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                            <span className="text-xs sm:text-sm text-zinc-400">📝 Dodané detaily ({stats.withDetails}x)</span>
                            <span className="text-xs sm:text-sm font-bold text-amber-400">+{stats.withDetails * ZB_RULES.LOGISTICS} XP</span>
                          </div>
                          <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                            <span className="text-xs sm:text-sm text-zinc-400">💰 Akce zdarma/ve slevě ({stats.freeActivities}x)</span>
                            <span className="text-xs sm:text-sm font-bold text-amber-400">+{stats.freeActivities * ZB_RULES.FREE_DISCOUNT} XP</span>
                          </div>
                          <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                            <span className="text-xs sm:text-sm text-zinc-400">🚀 Realizované výlety ({stats.realized}x)</span>
                            <span className="text-xs sm:text-sm font-bold text-amber-400">+{stats.realized * ZB_RULES.REALIZED} XP</span>
                          </div>
                          <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                            <span className="text-xs sm:text-sm text-zinc-400">🛡️ Odznaky ({unlockedB.length}x)</span>
                            <span className="text-xs sm:text-sm font-bold text-amber-400">+{badgeBonus} XP</span>
                          </div>
                          <div className="flex justify-between items-center py-1.5 last:border-0">
                            <span className="text-xs sm:text-sm text-zinc-400">🎯 Tajné mise ({childQuests.length}x)</span>
                            <span className="text-xs sm:text-sm font-bold text-amber-400">+{totalQuestXP} XP</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </motion.div>
          )}

          {/* ═══ PROFIL KARTY ═══ */}
          {localView !== "parent" && (
            <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800/80 to-zinc-800/60 border border-white/5 p-5"
          >
            {/* Glow effect */}
            <div className="absolute -top-20 -right-20 w-60 h-60 bg-violet-500/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl" />

            <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <button onClick={() => setShowPointBreakdown(!showPointBreakdown)} className="w-16 h-16 rounded-2xl overflow-hidden bg-zinc-700 border-2 border-violet-500/30 flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-500/10 hover:border-violet-500/60 transition-all cursor-pointer">
                  {(() => {
                    const av = getAvatarForChild(activePlayer);
                    return av.startsWith('http') || av.startsWith('data:')
                      ? <img src={av} className="w-full h-full object-cover" />
                      : <span className="text-3xl">{av}</span>;
                  })()}
                </button>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-black text-white truncate">{activePlayer}</h2>
                  <div className={cn("text-xl sm:text-2xl md:text-4xl font-black tracking-tight truncate", activeTitle.color)}>{activeTitle.title}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Zap size={14} className="text-amber-400" />
                    <span className="text-lg font-black text-amber-400">{activeTotalXP}</span>
                    <span className="text-xs text-zinc-500">XP</span>
                  </div>
                </div>
              </div>
              <div className="text-left sm:text-right flex-shrink-0 border-t sm:border-t-0 border-white/5 pt-3 sm:pt-0">
                <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Statistiky</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-400">
                  <span>Nápady:</span><span className="text-white font-bold">{activeStats.totalIdeas}</span>
                  <span>Realizace:</span><span className="text-emerald-400 font-bold">{activeStats.realized}</span>
                  <span className="flex items-center gap-1"><Shield size={12} /> Odznaky:</span><span className="text-cyan-400 font-bold">{unlockedBadges.length}</span>
                </div>
              </div>
            </div>

            {/* Progress k dalšímu titulu */}
            {nextTitle && (
              <div className="mt-4 relative">
                <div className="flex justify-between text-xs md:text-sm font-bold text-zinc-500 mb-1.5">
                  <span>{activeTitle.title}</span>
                  <span className={nextTitle.color}>{nextTitle.title} ({nextTitle.min} XP)</span>
                </div>
                <div className="h-2 bg-zinc-700/50 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, ((activeTotalXP - activeTitle.min) / (nextTitle.min - activeTitle.min)) * 100)}%` }}
                    transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                    className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 rounded-full shadow-sm shadow-violet-500/50"
                  />
                </div>
              </div>
            )}
          </motion.div>
          )}

          {/* ═══ POINT BREAKDOWN (klik na avatar) ═══ */}
          {localView !== "parent" && (
            <AnimatePresence>
              {showPointBreakdown && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="bg-zinc-800/50 border border-violet-500/10 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-bold text-violet-400 uppercase tracking-wider">Rozpis bodů – {activePlayer}</h4>
                      <span className="text-xs font-black text-amber-400">{activeTotalXP} XP celkem</span>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {suggestions
                        .filter(s => {
                          const sName = (s.childName || "Neznámý").toLowerCase() === "zefran3" || (s.childName || "Neznámý").toLowerCase() === "táta" ? "Táta" : (s.childName || "Neznámý");
                          return s.type !== "ride" && sName === activePlayer && s.status !== "cancelled";
                        })
                        .map(s => {
                          const today = new Date(); today.setHours(0,0,0,0);
                          const realized = s.status === "approved" && s.eventDate && new Date(s.eventDate) < today;
                          const hasDetails = s.location && s.url;
                          let zb = ZB_RULES.BASIC;
                          if (realized) zb += ZB_RULES.REALIZED;
                          if (realized && hasDetails) zb += ZB_RULES.LOGISTICS;
                          return (
                            <div key={s.id} className="flex items-center justify-between bg-zinc-900/40 rounded-lg px-3 py-1.5">
                              <div className="flex-1 min-w-0">
                                <span className="text-xs text-white font-medium truncate block">{s.title}</span>
                                <span className="text-[9px] text-zinc-500">
                                  +{ZB_RULES.BASIC} nápad{realized ? ` +${ZB_RULES.REALIZED} realizace` : ""}{realized && hasDetails ? ` +${ZB_RULES.LOGISTICS} detaily` : ""}
                                </span>
                              </div>
                              <span className="text-xs font-black text-emerald-400 ml-2">+{zb}</span>
                            </div>
                          );
                        })}
                      {/* Badge bonuses */}
                      {BADGES.filter(b => b.check(activeStats)).map(b => (
                        <div key={b.id} className="flex items-center justify-between bg-cyan-500/5 rounded-lg px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{b.icon}</span>
                            <span className="text-xs text-cyan-300 font-medium">Odznak: {b.name}</span>
                          </div>
                          <span className="text-xs font-black text-cyan-400">+{b.bonusZB}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {/* ═══ TAJNÁ MISE (QUEST BANNER) ═══ */}
          {activeQuests.length > 0 && (() => {
            const currentQuest = activeQuests[0];
            const isPending = currentQuest.status === 'pending_approval';
            
            return (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-rose-500/10 border border-amber-500/20 p-4"
              >
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={16} className="text-amber-400" />
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Tajná mise</span>
                    {localView === "parent" && !isPending && (
                      <button onClick={() => handleDeactivateQuest(currentQuest.id)} className="ml-auto text-[10px] text-zinc-500 hover:text-red-400">Ukončit</button>
                    )}
                  </div>
                  <h4 className="text-sm font-black text-white mb-1">{currentQuest.title}</h4>
                  <p className="text-xs text-zinc-400 mb-2">{currentQuest.description}</p>
                  
                  <div className="flex flex-wrap gap-2 text-[10px] mb-1">
                    <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">⏱ {currentQuest.deadlineHours}h limit</span>
                    {isUnderdog ? (
                      <span 
                        onClick={() => setShowBonusInfo(true)}
                        className="bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 cursor-pointer transition-colors animate-pulse"
                      >
                        ⚡ Odměna: {currentQuest.bonusMultiplier} XP + {currentBonusXP} XP Dorovnávací bonus <HelpCircle size={10} /> 🚀
                      </span>
                    ) : (
                      <span 
                        onClick={() => setShowBonusInfo(true)}
                        className="bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        ⚡ Odměna: {currentQuest.bonusMultiplier} XP <HelpCircle size={10} />
                      </span>
                    )}
                  </div>

                  {/* Interaktivní tlačítka na základě stavu a role */}
                  {isPending ? (
                    localView === "parent" ? (
                      <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
                        <div className="text-xs font-extrabold text-amber-400">
                          ✨ Hráč <span className="underline">{currentQuest.completedBy}</span> hlásí splnění mise!
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApproveQuest(currentQuest.id)}
                            className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-colors shadow-md flex items-center justify-center gap-1"
                          >
                            🏆 Schválit a vyplatit XP
                          </button>
                          <button
                            onClick={() => handleRejectQuest(currentQuest.id)}
                            className="py-1.5 px-3 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition-colors shadow-md flex items-center justify-center gap-1"
                          >
                            ❌ Zamítnout
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 p-2 bg-zinc-800/40 border border-zinc-700/30 rounded-lg text-center text-xs text-cyan-400 font-bold animate-pulse">
                        ⏳ Čeká na schválení odměny administrátorem...
                      </div>
                    )
                  ) : (
                    localView !== "parent" && (
                      <button
                        onClick={() => handleCompleteQuest(currentQuest.id)}
                        className="w-full mt-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs rounded-xl shadow-lg hover:shadow-emerald-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
                      >
                        ✅ Mám hotovo (Požádat o odměnu)
                      </button>
                    )
                  )}
                </div>
              </motion.div>
            );
          })()}



          {/* ═══ ŽEBŘÍČEK ═══ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            {(!leagueConfig.leagueStartDate || leagueConfig.status === 'stopped') ? (
              localView !== "parent" ? (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center space-y-3 relative overflow-hidden">
                  <div className="absolute -top-10 -right-10 w-24 h-24 bg-red-500/5 rounded-full blur-xl" />
                  <div className="text-4xl">🏆</div>
                  <h3 className="text-base font-black text-red-400 uppercase tracking-wider">Liga momentálně neběží</h3>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto">
                    Aktuální půlroční sezóna Víkendovníku nebyla zahájena nebo byla ukončena. Přihlaste se jako Administrátor a odstartujte novou ligu na Velitelském můstku!
                  </p>
                </div>
              ) : null
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Trophy size={16} className="text-amber-400" />
                    <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">Žebříček</h3>
                  </div>
                  <div className="flex bg-zinc-800/80 rounded-lg p-0.5 border border-white/5">
                    <button
                      onClick={() => setLeaderboardMode("sprint")}
                      className={cn("px-3 py-1.5 rounded-md text-xs font-bold transition-all",
                        leaderboardMode === "sprint" ? "bg-violet-500 text-white shadow-lg shadow-violet-500/30" : "text-zinc-400 hover:text-white"
                      )}
                    >
                      Sprint (2 měs.)
                    </button>
                    <button
                      onClick={() => setLeaderboardMode("liga")}
                      className={cn("px-3 py-1.5 rounded-md text-xs font-bold transition-all",
                        leaderboardMode === "liga" ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/30" : "text-zinc-400 hover:text-white"
                      )}
                    >
                      Liga (6 měs.)
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {leaderboardData.map((player, idx) => (
                    <button
                      key={player.name}
                      onClick={() => setSelectedPlayer(player.name === selectedPlayer ? null : player.name)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                        player.name === activePlayer
                          ? "bg-violet-500/10 border-violet-500/20 ring-1 ring-violet-500/20"
                          : "bg-zinc-800/30 border-white/5 hover:bg-zinc-800/60"
                      )}
                    >
                      <div className={cn("w-7 text-center font-black text-sm",
                        idx === 0 ? "text-amber-400" : idx === 1 ? "text-zinc-400" : idx === 2 ? "text-amber-700" : "text-zinc-600"
                      )}>
                        {idx === 0 ? "👑" : `${idx + 1}.`}
                      </div>
                      <div className="w-9 h-9 rounded-xl overflow-hidden bg-zinc-700 border border-white/10 flex items-center justify-center flex-shrink-0">
                        {player.avatar.startsWith('http') || player.avatar.startsWith('data:')
                          ? <img src={player.avatar} className="w-full h-full object-cover" />
                          : <span className="text-lg">{player.avatar}</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-bold text-white truncate block">{player.name}</span>
                        <span className={cn("text-[10px] font-semibold", getTitle(player.totalZB).color)}>
                          {getTitle(player.totalZB).title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Zap size={12} className="text-amber-400" />
                        <span className="text-sm font-black text-amber-400">{player.totalZB}</span>
                      </div>
                    </button>
                  ))}
                  {leaderboardData.length === 0 && (
                    <div className="text-center py-8 text-zinc-500 text-sm">Zatím žádné body. Začni navrhovat aktivity!</div>
                  )}
                </div>
              </>
            )}
          </motion.div>

          {/* ═══ SPRINT ODMĚNY ═══ */}
          {localView !== "parent" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4 space-y-3.5 shadow-xl relative overflow-hidden"
            >
              <div className="absolute -top-10 -right-10 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />
              <button
                type="button"
                onClick={() => setShowRewards(!showRewards)}
                className="flex items-center justify-between w-full relative z-10"
              >
                <div className="flex items-center gap-2">
                  <Award size={16} className={isSprintRewardsLocked ? "text-zinc-500" : "text-emerald-400"} />
                  <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">Odměny za Sprint</h3>
                  {isSprintRewardsLocked ? (
                    <span className="text-[9px] bg-zinc-800/80 border border-white/5 text-zinc-500 px-2 py-0.5 rounded-full font-black uppercase tracking-wider flex items-center gap-1">
                      🔒 Zamčeno
                    </span>
                  ) : (
                    <span className="text-[9px] bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-full font-black uppercase tracking-wider flex items-center gap-1 animate-pulse">
                      🔓 Odemčeno
                    </span>
                  )}
                </div>
                <ChevronRight size={16} className={cn("text-zinc-500 transition-transform", showRewards && "rotate-90")} />
              </button>

              <AnimatePresence>
                {showRewards && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden space-y-3 relative z-10"
                  >
                    {currentUserRole === 'admin' || currentUserRole === 'parent' ? (
                      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 text-xs text-indigo-300 flex items-center gap-2 font-bold relative z-10">
                        ℹ️ Jako administrátor / rodič si odměny nevybíráš. Zde vidíš přehled odměn pro děti.
                      </div>
                    ) : isSprintRewardsLocked ? (
                      <div className="bg-zinc-950/40 border border-white/5 rounded-xl p-3.5 flex items-center gap-3 text-xs text-zinc-400">
                        <Lock className="text-zinc-500 shrink-0" size={16} />
                        <div className="w-full">
                          Pro odemčení této sekce potřebuješ získat alespoň <span className="font-extrabold text-white">{sprintXPThreshold} XP</span> ve Sprintu.
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 bg-zinc-800 h-2 rounded-full overflow-hidden">
                              <div 
                                className="bg-gradient-to-r from-emerald-600 to-teal-500 h-full rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(100, (currentSprintXP / sprintXPThreshold) * 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-black text-zinc-500 shrink-0">
                              {currentSprintXP} / {sprintXPThreshold} XP
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      hasClaimed && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-400 flex items-center gap-2 font-bold">
                          🎉 Již máš vybranou odměnu pro tento Sprint: <span className="underline">{claimedRewardInCurrentSprint?.rewardTitle}</span>.
                        </div>
                      )
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(rewards || []).length === 0 ? (
                        <div className="text-zinc-500 text-center py-4 text-xs italic col-span-2">
                          Zatím nebyly vloženy žádné odměny pro tento Sprint.
                        </div>
                      ) : (
                        (rewards || []).map((r) => {
                          const isChosen = claimedRewardInCurrentSprint?.rewardTitle === r.title;
                          const isDisabled = currentUserRole === 'admin' || currentUserRole === 'parent' || isSprintRewardsLocked || (hasClaimed && !isChosen);

                          return (
                            <button
                              type="button"
                              key={r.id}
                              disabled={isDisabled}
                              onClick={() => !isDisabled && setClaimingReward(r)}
                              className={cn(
                                "p-3.5 rounded-xl flex flex-col items-center text-center gap-1.5 transition-all text-left w-full border relative overflow-hidden",
                                isChosen 
                                  ? "bg-emerald-500/15 border-emerald-500 text-emerald-400 shadow-lg shadow-emerald-500/5 hover:scale-100" 
                                  : isDisabled
                                    ? "bg-zinc-950/20 border-white/5 opacity-40 cursor-not-allowed"
                                    : "bg-zinc-800/40 border-white/5 hover:border-emerald-500/30 hover:bg-zinc-800/80 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                              )}
                            >
                              <span className="text-3xl filter drop-shadow">🎁</span>
                              <span className={cn("text-xs font-black tracking-tight", isChosen ? "text-emerald-400" : "text-white")}>
                                {r.title}
                              </span>
                              <span className="text-[10px] text-zinc-500 font-medium line-clamp-2">
                                {r.description || "Tajuplná odměna."}
                              </span>
                              {isChosen && (
                                <span className="absolute top-2 right-2 bg-emerald-500 text-zinc-950 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md shadow-sm">
                                  Zvoleno
                                </span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ═══ ODZNAKY ═══ */}
          {localView !== "parent" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Shield size={16} className="text-cyan-400" />
                <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">Odznaky</h3>
                <span className="text-[10px] text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded-full">
                  {BADGES.filter(b => b.check(activeStats)).length}/{BADGES.length}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {BADGES.map(badge => {
                  const unlocked = badge.check(activeStats);
                  return (
                    <div
                      key={badge.id}
                      className={cn(
                        "relative rounded-xl border p-3 flex flex-col items-center text-center gap-1 transition-all",
                        unlocked
                          ? "bg-gradient-to-b from-zinc-800/80 to-zinc-800/40 border-cyan-500/20 shadow-lg shadow-cyan-500/5"
                          : "bg-zinc-900/50 border-white/5 opacity-40 grayscale"
                      )}
                    >
                      {unlocked && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                          <span className="text-[8px] text-white font-bold">✓</span>
                        </div>
                      )}
                      <span className="text-3xl">{badge.icon}</span>
                      <span className="text-xs md:text-sm font-bold text-white leading-tight">{badge.name}</span>
                      <span className={cn("text-[11px] md:text-xs font-black", unlocked ? "text-amber-400" : "text-zinc-600")}>+{badge.bonusZB} XP</span>
                      <span className="text-[11px] md:text-xs text-zinc-500 leading-tight mt-1">{badge.desc}</span>
                      {!unlocked && <Lock size={10} className="text-zinc-600 mt-0.5" />}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}


          {/* ═══ WISHLIST (trvale dospod pod žebříček a odznaky) ═══ */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Gift size={16} className="text-rose-400" />
                <h3 className="text-sm font-bold text-rose-300 uppercase tracking-wider">Přání (Půlroční Liga)</h3>
              </div>
              {localView === "child" && (
                <button onClick={() => setShowWishForm(!showWishForm)}
                  className="flex items-center gap-1 text-xs font-bold text-rose-400 hover:text-rose-300 transition-colors bg-rose-500/10 px-3 py-1.5 rounded-lg border border-rose-500/20"
                >
                  <Plus size={12} /> Přidat přání
                </button>
              )}
            </div>

            {/* Wish form */}
            <AnimatePresence>
              {showWishForm && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-3">
                  <div className="bg-zinc-800/50 border border-rose-500/10 rounded-xl p-4 space-y-3">
                    <div className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">Přání od: {normalizedCurrentUserName}</div>
                    <input value={wishName} onChange={e => setWishName(e.target.value)} placeholder="Co si přeješ? (např. Steam kredit 500 Kč)" className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-rose-500/30" />
                    <input value={wishUrl} onChange={e => setWishUrl(e.target.value)} placeholder="Odkaz (volitelné)" className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-rose-500/30" />
                    <button onClick={handleAddWish} disabled={!wishName.trim()} className="w-full bg-rose-500 text-white font-bold text-xs py-2.5 rounded-lg hover:bg-rose-400 transition-colors disabled:opacity-30">Odeslat ke schválení</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Parent: pending wishes to approve */}
            {localView === "parent" && wishlists.filter(w => w.status === 'pending').length > 0 && (
              <div className="mb-3 space-y-2">
                <div className="text-[10px] text-amber-400 uppercase tracking-wider font-bold">Čeká na schválení</div>
                {wishlists.filter(w => w.status === 'pending').map(w => (
                  <div key={w.id} className="flex items-center justify-between bg-amber-500/5 border border-amber-500/10 rounded-xl p-3">
                    <div>
                      <span className="text-sm font-bold text-white">{w.name}</span>
                      <span className="text-xs text-zinc-500 ml-2">od {w.childName?.toLowerCase() === "zefran3" || w.childName?.toLowerCase() === "táta" ? "Táta" : w.childName}</span>
                      {w.url && <a href={w.url} target="_blank" rel="noopener" className="text-[10px] text-cyan-400 ml-2 hover:underline">🔗</a>}
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => { setApprovingWish(w); setApproveZB("500"); }} className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"><Check size={14} /></button>
                      <button onClick={() => { setRejectingWish(w); setRejectReason(""); }} className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30"><X size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Admin View: Children goals overview instead of personal Admin wishlist */}
            {localView === "parent" ? (
              <div className="space-y-4">
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">Admin: Přehled cílů dětí</div>
                <div className="grid gap-3">
                  {wishlists
                    .filter(w => w.status === 'approved' && w.targetZB > 0 && w.childName?.toLowerCase() !== "zefran3" && w.childName?.toLowerCase() !== "táta")
                    .map(wish => {
                      const childName = wish.childName || "Neznámý";
                      const childStats = playerStats[childName] || { totalIdeas: 0, realized: 0, freeActivities: 0, withDetails: 0, totalZB: 0 };
                      const childBadgeBonus = BADGES.filter(b => b.check(childStats)).reduce((s, b) => s + b.bonusZB, 0);
                      const childTotalXP = childStats.totalZB + childBadgeBonus;
                      
                      const progress = Math.min(100, (childTotalXP / wish.targetZB) * 100);
                      const completed = childTotalXP >= wish.targetZB;
                      
                      return (
                        <div key={wish.id} className={cn("rounded-xl border p-4 transition-all relative overflow-hidden", completed ? "bg-emerald-500/10 border-emerald-500/20" : "bg-zinc-800/50 border-white/5")}>
                          <div className="absolute top-0 right-0 bg-zinc-800 text-[9px] text-zinc-400 px-2 py-0.5 rounded-bl font-bold uppercase tracking-wider border-l border-b border-white/5">
                            {childName}
                          </div>
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className="text-sm font-bold text-white block">{wish.name}</span>
                            </div>
                            <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", completed ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-700 text-zinc-400")}>
                              {completed ? "✓ Splněno!" : `${childTotalXP} / ${wish.targetZB} XP`}
                            </span>
                          </div>
                          <div className="h-2 bg-zinc-700/50 rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 1.2, ease: "easeOut", delay: 0.4 }}
                              className={cn("h-full rounded-full", completed ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : "bg-gradient-to-r from-violet-500 to-cyan-400")} />
                          </div>
                        </div>
                      );
                    })}
                  {wishlists.filter(w => w.status === 'approved' && w.targetZB > 0 && w.childName?.toLowerCase() !== "zefran3" && w.childName?.toLowerCase() !== "táta").length === 0 && (
                    <div className="text-center py-4 text-zinc-600 text-xs">Zatím žádná schválená přání dětí.</div>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Rejected wishes */}
                {activeWishlist.filter(w => w.status === 'rejected').length > 0 && (
                  <div className="mb-3 space-y-2">
                    <div className="text-[10px] text-red-400 uppercase tracking-wider font-bold">Zamítnuté</div>
                    {activeWishlist.filter(w => w.status === 'rejected').map(w => (
                      <div key={w.id} className="bg-red-500/5 border border-red-500/10 rounded-xl p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-zinc-400 line-through">{w.name}</span>
                          <span className="text-[10px] text-red-400 font-bold">✕ Zamítnuto</span>
                        </div>
                        {w.rejectReason && (
                          <p className="text-[10px] text-zinc-500 mt-1 italic">Důvod: {w.rejectReason}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Approved wishes with progress */}
                <div className="grid gap-3">
                  {activeWishlist.filter(w => w.status === 'approved' && w.targetZB > 0).map(wish => {
                    const progress = Math.min(100, (activeTotalXP / wish.targetZB) * 100);
                    const completed = activeTotalXP >= wish.targetZB;
                    return (
                      <div key={wish.id} className={cn("rounded-xl border p-4 transition-all", completed ? "bg-emerald-500/10 border-emerald-500/20" : "bg-zinc-800/50 border-white/5")}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-bold text-white">{wish.name}</span>
                          <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", completed ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-700 text-zinc-400")}>
                            {completed ? "✓ Splněno!" : `${activeTotalXP} / ${wish.targetZB} XP`}
                          </span>
                        </div>
                        <div className="h-2 bg-zinc-700/50 rounded-full overflow-hidden">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 1.2, ease: "easeOut", delay: 0.4 }}
                            className={cn("h-full rounded-full", completed ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : "bg-gradient-to-r from-rose-500 to-amber-400")} />
                        </div>
                      </div>
                    );
                  })}
                  {activeWishlist.filter(w => w.status === 'approved' && w.targetZB > 0).length === 0 && (
                    <div className="text-center py-4 text-zinc-600 text-xs">Zatím žádná schválená přání.</div>
                  )}
                </div>
              </>
            )}
          </motion.div>

          {/* ═══ BODOVÁNÍ PRAVIDLA ═══ */}
          {localView !== "parent" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="bg-zinc-800/30 border border-white/5 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={16} className="text-violet-400" />
                <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">Jak získat XP</h3>
              </div>
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                {[
                  { label: "Nový nápad", zb: `+${ZB_RULES.BASIC} XP`, color: "text-zinc-300" },
                  { label: "Realizovaná akce", zb: `+${ZB_RULES.REALIZED} XP`, color: "text-emerald-400" },
                  { label: "Dodané detaily", zb: `+${ZB_RULES.LOGISTICS} XP`, color: "text-cyan-400" },
                  { label: "Akce zdarma / sleva", zb: `+${ZB_RULES.FREE_DISCOUNT} XP`, color: "text-amber-400" },
                  { label: "🎯 Tajné mise", zb: "Dle zadání", subtext: "Sleduj Nástěnku", color: "text-violet-400" },
                  { label: "🚀 Dorovnávací bonus", zb: "+5 XP", subtext: "Získáš k misi, pokud ztrácíš na první místo", color: "text-rose-400" }
                ].map((rule, i) => (
                  <div key={i} className="flex flex-col justify-between bg-zinc-900/50 rounded-xl px-3 py-2.5 hover:bg-zinc-900/80 hover:scale-[1.01] transition-all duration-200 border border-transparent hover:border-white/5">
                    <div className="flex items-center justify-between gap-2 w-full">
                      <span className="text-zinc-300 font-medium">{rule.label}</span>
                      <span className={cn("font-black whitespace-nowrap", rule.color)}>{rule.zb}</span>
                    </div>
                    {rule.subtext && (
                      <span className="text-[10px] text-zinc-500 mt-1 leading-normal font-normal text-left">{rule.subtext}</span>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Spacer pro scroll */}
          <div className="h-6" />
        </div>
      </div>

      {/* ═══ APPROVE MODAL ═══ */}
      <AnimatePresence>
        {approvingWish && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setApprovingWish(null)} className="fixed inset-0 bg-black/60 z-[110]" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] max-w-sm bg-zinc-900 border border-white/10 rounded-2xl p-5 z-[110] space-y-4"
            >
              <h3 className="text-sm font-black text-white">Schválit přání</h3>
              <p className="text-xs text-zinc-400">„{approvingWish.name}" od {approvingWish.childName}</p>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Cena v XP</label>
                <input value={approveZB} onChange={e => setApproveZB(e.target.value)} type="number" className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-emerald-500/30" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setApprovingWish(null)} className="flex-1 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-xs font-bold hover:bg-zinc-700">Zrušit</button>
                <button onClick={handleApproveWish} className="flex-1 py-2 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-400">Schválit za {approveZB} XP</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ REJECT MODAL ═══ */}
      <AnimatePresence>
        {rejectingWish && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setRejectingWish(null)} className="fixed inset-0 bg-black/60 z-[110]" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] max-w-sm bg-zinc-900 border border-red-500/20 rounded-2xl p-5 z-[110] space-y-4"
            >
              <h3 className="text-sm font-black text-red-400">Zamítnout přání</h3>
              <p className="text-xs text-zinc-400">„{rejectingWish.name}“ od {rejectingWish.childName}</p>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Důvod zamítnutí</label>
                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Napiš důvod (volitelné)..." className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-red-500/30 h-20 resize-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setRejectingWish(null)} className="flex-1 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-xs font-bold hover:bg-zinc-700">Zrušit</button>
                <button onClick={handleRejectWishWithReason} className="flex-1 py-2 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-400">Zamítnout</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ DOROVNÁVACÍ BONUS INFO MODAL ═══ */}
      <AnimatePresence>
        {showBonusInfo && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowBonusInfo(false)} className="fixed inset-0 bg-black/60 z-[110]" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm bg-zinc-900 border border-white/10 rounded-2xl p-5 z-[110] space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  🚀 Jak funguje Dorovnávací bonus?
                </h3>
                <button type="button" onClick={() => setShowBonusInfo(false)} className="text-zinc-500 hover:text-white transition-colors">
                  <X size={16} />
                </button>
              </div>
              
              <div className="text-xs text-zinc-400 leading-relaxed space-y-3">
                <p>
                  Dorovnávací bonus pomáhá vyrovnat šance v lize. Pokud ztrácíš na lídra, získáš k úspěšné Tajné misi extra odměnu:
                </p>
                <div className="space-y-2 pt-1">
                  <div className="flex justify-between bg-zinc-800/40 rounded-lg p-2 border border-zinc-800">
                    <span className="font-semibold text-zinc-300">Ztráta pod 20 XP</span>
                    <span className="font-bold text-zinc-500">0 XP</span>
                  </div>
                  <div className="flex justify-between bg-orange-500/10 rounded-lg p-2 border border-orange-500/20">
                    <span className="font-semibold text-orange-300">Ztráta 20–49 XP</span>
                    <span className="font-bold text-orange-400">+5 XP</span>
                  </div>
                  <div className="flex justify-between bg-amber-500/10 rounded-lg p-2 border border-amber-500/20">
                    <span className="font-semibold text-amber-300">Ztráta 50–99 XP</span>
                    <span className="font-bold text-amber-400">+10 XP</span>
                  </div>
                  <div className="flex justify-between bg-rose-500/10 rounded-lg p-2 border border-rose-500/20">
                    <span className="font-semibold text-rose-300">Ztráta 100+ XP</span>
                    <span className="font-bold text-rose-400">+15 XP</span>
                  </div>
                </div>
              </div>
              
              <button onClick={() => setShowBonusInfo(false)} className="w-full py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-bold hover:bg-zinc-700 transition-colors">
                Rozumím
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ CLAIM REWARD MODAL ═══ */}
      <AnimatePresence>
        {claimingReward && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setClaimingReward(null)} className="fixed inset-0 bg-black/60 z-[110]" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] max-w-sm bg-zinc-900 border border-emerald-500/20 rounded-2xl p-5 z-[110] space-y-4"
            >
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                🎁 Vybrat odměnu za Sprint
              </h3>
              <p className="text-xs text-zinc-400">
                Opravdu si chceš vybrat odměnu: <span className="font-extrabold text-white">„{claimingReward.title}“</span>?
              </p>
              <p className="text-[10px] text-zinc-500 italic leading-normal">
                Poznámka: V každém Sprintu si můžeš vybrat pouze jednu odměnu. Tuto volbu již nelze vzít zpět!
              </p>
              <div className="flex gap-2">
                <button disabled={isClaiming} onClick={() => setClaimingReward(null)} className="flex-1 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-xs font-bold hover:bg-zinc-700 disabled:opacity-50 transition-colors cursor-pointer">
                  Zrušit
                </button>
                <button disabled={isClaiming} onClick={handleConfirmClaimReward} className="flex-1 py-2 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-400 disabled:opacity-50 transition-colors cursor-pointer">
                  {isClaiming ? "Ukládám..." : "Ano, vybrat!"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
