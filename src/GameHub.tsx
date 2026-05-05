import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, Trophy, Target, Star, Lock, Zap, Gift, Shield, Plus,
  ChevronRight, Flame, Award, TrendingUp, Crown, Eye, EyeOff, Check, AlertTriangle
} from "lucide-react";
import { cn } from "./lib/utils";
import { ActivitySuggestion, UserProfile, WishlistItem, MysteryQuest } from "./types";
import { db } from "./firebase";
import { collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";

// ─── ZB Bodovací systém ──────────────────────────────────
const ZB_RULES = {
  BASIC: 10,        // Zapsání nápadu
  REALIZED: 50,     // Schválená + absolvovaná akce
  LOGISTICS: 20,    // Dodány detaily (lokace + url)
  FREE_DISCOUNT: 20 // Akce zdarma
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
  const [showWishForm, setShowWishForm] = useState(false);
  const [wishName, setWishName] = useState("");
  const [wishUrl, setWishUrl] = useState("");
  const [approvingWish, setApprovingWish] = useState<WishlistItem | null>(null);
  const [approveZB, setApproveZB] = useState("500");
  const [showQuestForm, setShowQuestForm] = useState(false);
  const [questTitle, setQuestTitle] = useState("");
  const [questDesc, setQuestDesc] = useState("");
  const [questHours, setQuestHours] = useState("48");
  const [questMultiplier, setQuestMultiplier] = useState("2");
  const [showPointBreakdown, setShowPointBreakdown] = useState(false);
  const [rejectingWish, setRejectingWish] = useState<WishlistItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [localView, setLocalView] = useState(view);

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
    return () => { unsubW(); unsubQ(); };
  }, []);

  // ─── Handlers ────────────────────────────────────────
  const handleAddWish = async () => {
    if (!wishName.trim()) return;
    await addDoc(collection(db, 'wishlists'), {
      childName: currentUserName,
      authorId: currentUserId,
      name: wishName.trim(),
      url: wishUrl.trim() || null,
      targetZB: 0,
      status: 'pending',
      createdAt: Date.now()
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
      createdAt: Date.now()
    });
    setQuestTitle(""); setQuestDesc(""); setShowQuestForm(false);
  };

  const handleDeactivateQuest = async (id: string) => {
    await updateDoc(doc(db, 'quests', id), { active: false });
  };

  // ─── Výpočet ZB bodů z reálných dat ─────────────────
  const playerStats = useMemo(() => {
    const stats: Record<string, UserStats> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const twoMonthsAgo = new Date(today);
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const sixMonthsAgo = new Date(today);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const getFamilyNameFromEmail = (email?: string): string | undefined => {
      if (!email) return undefined;
      const lower = email.toLowerCase();
      if (lower === "zefran3@gmail.com") return "Táta";
      if (lower === "eva.kubartova@gmail.com") return "Eva";
      if (lower === "emasterba@gmail.com") return "Emma";
      if (lower === "frantisek.sterba2010@gmail.com") return "František";
      return undefined;
    };

    const activeNames = new Set<string>();
    Object.values(userProfiles).forEach(profile => {
      if (!profile.isBlocked) {
        const name = profile.adminAlias || profile.displayName || getFamilyNameFromEmail(profile.email) || profile.email?.split('@')[0] || "Neznámý";
        activeNames.add(name);
        if (!stats[name]) {
          stats[name] = { totalIdeas: 0, realized: 0, freeActivities: 0, withDetails: 0, totalZB: 0 };
        }
      }
    });

    suggestions.forEach(s => {
      if (s.type === "ride") return;
      const name = s.childName || "Neznámý";
      
      // Do žebříčku započítáváme jen aktivní uživatele přihlášené do aplikace
      if (!activeNames.has(name)) return;

      // Základní body za nápad
      if (s.status !== "cancelled") {
        stats[name].totalIdeas += 1;
        stats[name].totalZB += ZB_RULES.BASIC;
      }

      // Body za realizaci
      if (s.status === "approved" && s.eventDate && new Date(s.eventDate) < today) {
        stats[name].realized += 1;
        stats[name].totalZB += ZB_RULES.REALIZED;

        // Logistický bonus (má lokaci A url)
        if (s.location && s.url) {
          stats[name].withDetails += 1;
          stats[name].totalZB += ZB_RULES.LOGISTICS;
        }

        // Finanční bonus (placeholder - v budoucnu z dat)
        // stats[name].totalZB += ZB_RULES.FREE_DISCOUNT;
      }
    });

    return stats;
  }, [suggestions]);

  // ─── Žebříček ────────────────────────────────────────
  const leaderboardData = useMemo(() => {
    return Object.entries(playerStats)
      .map(([name, stats]) => {
        const badgeBonus = BADGES.filter(b => b.check(stats)).reduce((s, b) => s + b.bonusZB, 0);
        return { name, ...stats, totalZB: stats.totalZB + badgeBonus, avatar: getAvatarForChild(name) };
      })
      .sort((a, b) => b.totalZB - a.totalZB);
  }, [playerStats, getAvatarForChild]);

  const activePlayer = selectedPlayer || currentUserName;
  const activeStats = playerStats[activePlayer] || { totalIdeas: 0, realized: 0, freeActivities: 0, withDetails: 0, totalZB: 0 };
  const activeTitle = getTitle(activeStats.totalZB);
  const nextTitle = getNextTitle(activeStats.totalZB);
  const activeWishlist = wishlists.filter(w => w.childName === activePlayer);
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
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Zážitkové body</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <button onClick={() => setLocalView(localView === 'parent' ? 'child' : 'parent')}
              className={cn("px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
                localView === 'parent' ? "bg-rose-500/20 text-rose-400 border-rose-500/20" : "bg-cyan-500/20 text-cyan-400 border-cyan-500/20"
              )}>
              {localView === 'parent' ? '👑 Admin' : '🎮 Hráč'}
            </button>
            {/* Víkendovník logo → back */}
            <button onClick={onClose} className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600/20 to-teal-600/20 border border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400 font-black text-xs tracking-tight transition-all hover:scale-105">
              🌿 Víkendovník
            </button>
          </div>
        </header>

        <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full space-y-5">

          {/* ═══ PROFIL KARTY ═══ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800/80 to-zinc-800/60 border border-white/5 p-5"
          >
            {/* Glow effect */}
            <div className="absolute -top-20 -right-20 w-60 h-60 bg-violet-500/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl" />

            <div className="relative flex items-center gap-4">
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
                <div className={cn("text-sm font-bold", activeTitle.color)}>{activeTitle.title}</div>
                <div className="flex items-center gap-2 mt-1">
                  <Zap size={14} className="text-amber-400" />
                  <span className="text-lg font-black text-amber-400">{activeStats.totalZB + BADGES.filter(b => b.check(activeStats)).reduce((s, b) => s + b.bonusZB, 0)}</span>
                  <span className="text-xs text-zinc-500">ZB</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Statistiky</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-zinc-400">Nápady:</span><span className="text-white font-bold">{activeStats.totalIdeas}</span>
                  <span className="text-zinc-400">Realizace:</span><span className="text-emerald-400 font-bold">{activeStats.realized}</span>
                </div>
              </div>
            </div>

            {/* Progress k dalšímu titulu */}
            {nextTitle && (
              <div className="mt-4 relative">
                <div className="flex justify-between text-[10px] text-zinc-500 mb-1.5">
                  <span>{activeTitle.title}</span>
                  <span className={nextTitle.color}>{nextTitle.title} ({nextTitle.min} ZB)</span>
                </div>
                <div className="h-2 bg-zinc-700/50 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, ((activeStats.totalZB - activeTitle.min) / (nextTitle.min - activeTitle.min)) * 100)}%` }}
                    transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                    className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 rounded-full shadow-sm shadow-violet-500/50"
                  />
                </div>
              </div>
            )}
          </motion.div>

          {/* ═══ POINT BREAKDOWN (klik na avatar) ═══ */}
          <AnimatePresence>
            {showPointBreakdown && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="bg-zinc-800/50 border border-violet-500/10 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-violet-400 uppercase tracking-wider">Rozpis bodů – {activePlayer}</h4>
                    <span className="text-xs font-black text-amber-400">{activeStats.totalZB + BADGES.filter(b => b.check(activeStats)).reduce((s, b) => s + b.bonusZB, 0)} ZB celkem</span>
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {suggestions
                      .filter(s => s.type !== "ride" && (s.childName || "Neznámý") === activePlayer && s.status !== "cancelled")
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

          {/* ═══ TAJNÁ MISE (QUEST BANNER) ═══ */}
          {activeQuests.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-rose-500/10 border border-amber-500/20 p-4"
            >
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} className="text-amber-400" />
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Tajná mise</span>
                  {localView === "parent" && <button onClick={() => handleDeactivateQuest(activeQuests[0].id)} className="ml-auto text-[10px] text-zinc-500 hover:text-red-400">Ukončit</button>}
                </div>
                <h4 className="text-sm font-black text-white mb-1">{activeQuests[0].title}</h4>
                <p className="text-xs text-zinc-400 mb-2">{activeQuests[0].description}</p>
                <div className="flex gap-3 text-[10px]">
                  <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">⏱ {activeQuests[0].deadlineHours}h limit</span>
                  <span className="bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full font-bold">⚡ {activeQuests[0].bonusMultiplier}× body</span>
                </div>
              </div>
            </motion.div>
          )}
          {localView === "parent" && (
            <div className="flex gap-2">
              <button onClick={() => setShowQuestForm(!showQuestForm)}
                className="text-xs text-amber-400/60 hover:text-amber-400 transition-colors flex items-center gap-1"
              >
                <Plus size={12} /> Zadat tajnou misi
              </button>
            </div>
          )}
          <AnimatePresence>
            {showQuestForm && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="bg-zinc-800/50 border border-amber-500/10 rounded-xl p-4 space-y-3">
                  <input value={questTitle} onChange={e => setQuestTitle(e.target.value)} placeholder="Název mise..." className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-amber-500/30" />
                  <textarea value={questDesc} onChange={e => setQuestDesc(e.target.value)} placeholder="Popis výzvy..." className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-amber-500/30 h-16 resize-none" />
                  <div className="flex gap-2">
                    <input value={questHours} onChange={e => setQuestHours(e.target.value)} placeholder="Hodin" type="number" className="w-20 bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none" />
                    <input value={questMultiplier} onChange={e => setQuestMultiplier(e.target.value)} placeholder="Násobič" type="number" step="0.5" className="w-20 bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none" />
                    <button onClick={handleAddQuest} className="flex-1 bg-amber-500 text-black font-bold text-xs rounded-lg hover:bg-amber-400 transition-colors">Aktivovat misi</button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══ WISHLIST (only in Liga mode) ═══ */}
          {leaderboardMode === "liga" && (
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
                    <div className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">Přání od: {currentUserName}</div>
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
                      <span className="text-xs text-zinc-500 ml-2">od {w.childName}</span>
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
                const progress = Math.min(100, (activeStats.totalZB / wish.targetZB) * 100);
                const completed = activeStats.totalZB >= wish.targetZB;
                return (
                  <div key={wish.id} className={cn("rounded-xl border p-4 transition-all", completed ? "bg-emerald-500/10 border-emerald-500/20" : "bg-zinc-800/50 border-white/5")}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-white">{wish.name}</span>
                      <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", completed ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-700 text-zinc-400")}>
                        {completed ? "✓ Splněno!" : `${activeStats.totalZB} / ${wish.targetZB} ZB`}
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
          </motion.div>
          )}

          {/* ═══ ŽEBŘÍČEK ═══ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
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
          </motion.div>

          {/* ═══ SPRINT ODMĚNY ═══ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <button
              onClick={() => setShowRewards(!showRewards)}
              className="flex items-center justify-between w-full mb-3"
            >
              <div className="flex items-center gap-2">
                <Award size={16} className="text-emerald-400" />
                <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">Odměny pro vítěze Sprintu</h3>
              </div>
              <ChevronRight size={16} className={cn("text-zinc-500 transition-transform", showRewards && "rotate-90")} />
            </button>
            <AnimatePresence>
              {showRewards && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-2 gap-2">
                    {SPRINT_REWARDS.map((r, i) => (
                      <div key={i} className="bg-zinc-800/50 border border-white/5 rounded-xl p-3 flex flex-col items-center text-center gap-1.5 hover:border-emerald-500/20 transition-colors">
                        <span className="text-2xl">{r.icon}</span>
                        <span className="text-xs font-bold text-white">{r.title}</span>
                        <span className="text-[10px] text-zinc-500">{r.desc}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* ═══ ODZNAKY ═══ */}
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
            <div className="grid grid-cols-4 gap-2">
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
                    <span className="text-xl">{badge.icon}</span>
                    <span className="text-[10px] font-bold text-white leading-tight">{badge.name}</span>
                    <span className={cn("text-[9px] font-black", unlocked ? "text-amber-400" : "text-zinc-600")}>+{badge.bonusZB} ZB</span>
                    <span className="text-[9px] text-zinc-500 leading-tight">{badge.desc}</span>
                    {!unlocked && <Lock size={10} className="text-zinc-600 mt-0.5" />}
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* ═══ BODOVÁNÍ PRAVIDLA ═══ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-zinc-800/30 border border-white/5 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={16} className="text-violet-400" />
              <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">Jak získat ZB</h3>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: "Nový nápad", zb: `+${ZB_RULES.BASIC}`, color: "text-zinc-300" },
                { label: "Realizovaná akce", zb: `+${ZB_RULES.REALIZED}`, color: "text-emerald-400" },
                { label: "Dodané detaily", zb: `+${ZB_RULES.LOGISTICS}`, color: "text-cyan-400" },
                { label: "Akce zdarma / sleva", zb: `+${ZB_RULES.FREE_DISCOUNT}`, color: "text-amber-400" },
              ].map((rule, i) => (
                <div key={i} className="flex items-center justify-between bg-zinc-900/50 rounded-lg px-3 py-2">
                  <span className="text-zinc-400">{rule.label}</span>
                  <span className={cn("font-black", rule.color)}>{rule.zb} ZB</span>
                </div>
              ))}
            </div>
          </motion.div>

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
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Cena v Zážitkových bodech (ZB)</label>
                <input value={approveZB} onChange={e => setApproveZB(e.target.value)} type="number" className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-emerald-500/30" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setApprovingWish(null)} className="flex-1 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-xs font-bold hover:bg-zinc-700">Zrušit</button>
                <button onClick={handleApproveWish} className="flex-1 py-2 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-400">Schválit za {approveZB} ZB</button>
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
    </motion.div>
  );
}
