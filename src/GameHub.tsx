import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, Trophy, Target, Star, Lock, Zap, Gift, Shield, Plus,
  ChevronRight, Flame, Award, TrendingUp, Crown, Eye, EyeOff, Check, AlertTriangle,
  Lightbulb, HelpCircle
} from "lucide-react";
import { cn } from "./lib/utils";
import { ActivitySuggestion, UserProfile, WishlistItem, MysteryQuest, BattlePassMilestone, BattlePassClaim } from "./types";
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
  { id: "first_idea", name: "První jiskra", desc: "Zadej svůj první nápad", icon: "⚡", bonusZB: 5, check: (stats: UserStats) => stats.totalIdeas >= 1 },
  { id: "five_ideas", name: "Generátor nápadů", desc: "Zadej 5 nápadů", icon: "💡", bonusZB: 10, check: (stats: UserStats) => stats.totalIdeas >= 5 },
  { id: "detail_master", name: "Detailista", desc: "Dodej detaily u 3 aktivit", icon: "📋", bonusZB: 10, check: (stats: UserStats) => stats.withDetails >= 3 },
  { id: "streak_3", name: "Série 3", desc: "3 schválené aktivity v řadě", icon: "🔥", bonusZB: 10, check: (stats: UserStats) => stats.realized >= 3 },
  { id: "culture", name: "Kulturní maniak", desc: "3 realizované kulturní akce", icon: "🎭", bonusZB: 15, check: (stats: UserStats) => stats.realized >= 3 },
  { id: "mountain", name: "Horský kamzík", desc: "Realizuj outdoorovou aktivitu", icon: "🏔️", bonusZB: 15, check: (stats: UserStats) => stats.realized >= 2 },
  { id: "discount_hunter", name: "Lovec slev", desc: "Najdi 3 akce zcela zdarma", icon: "💰", bonusZB: 15, check: (stats: UserStats) => stats.freeActivities >= 3 },
  { id: "ten_realized", name: "Dekáda výletů", desc: "10 realizovaných aktivit", icon: "🏆", bonusZB: 20, check: (stats: UserStats) => stats.realized >= 10 },
];

// ─── Sprint odměny ───────────────────────────────────────
const SPRINT_REWARDS = [
  { icon: "🍽️", title: "Žolík na mytí nádobí", desc: "Celý týden bez nádobí" },
  { icon: "🎮", title: "Vládce ovladače", desc: "Spotify/TV na celý víkend" },
  { icon: "🍕", title: "Kulinářský diktátor", desc: "Výběr oběda na celý den" },
  { icon: "🌙", title: "Late Night Pass", desc: "Večerka o hodinu později" },
];

export const DEFAULT_BATTLE_PASS_MILESTONES: BattlePassMilestone[] = [
  { id: "bp_1", pointsRequired: 20, title: "Popcorn", icon: "🍿", description: "Křupavý popcorn k večernímu rodinnému promítání.", order: 1 },
  { id: "bp_2", pointsRequired: 40, title: "Kofola / Sladkost", icon: "🥤", description: "Sladká odměna nebo vychlazená Kofola za dobře odvedenou práci.", order: 2 },
  { id: "bp_3", pointsRequired: 60, title: "Prodloužená večerka", icon: "🌙", description: "Jednorázová možnost jít o víkendu spát o něco později.", order: 3 },
  { id: "bp_4", pointsRequired: 90, title: "Nedělní menu / Fast Food", icon: "🍽️", description: "Rozhodneš o tom, co dobrého se uvaří, nebo si dáte oblíbený Fast Food.", order: 4 },
  { id: "bp_5", pointsRequired: 120, title: "Návštěva kina / Lístek do kina", icon: "🎬", description: "Společný filmový večer nebo výlet do kina na film podle výběru.", order: 5 },
  { id: "bp_6", pointsRequired: 150, title: "Herní čas / Mega Odměna", icon: "🎮", description: "Získáš herní čas na PC/konzoli nebo jinou super mega odměnu!", order: 6 },
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
  onOpenAdminPanel?: () => void;
}

interface ActiveQuestBannerProps {
  currentQuest: MysteryQuest;
  localView: string;
  isUnderdog: boolean;
  currentBonusXP: number;
  setShowBonusInfo: (show: boolean) => void;
  handleDeactivateQuest: (id: string) => Promise<void>;
  handleApproveQuest: (id: string) => Promise<void>;
  handleRejectQuest: (id: string) => Promise<void>;
  handleCompleteQuest: (id: string) => Promise<void>;
}

const ActiveQuestBanner: React.FC<ActiveQuestBannerProps> = ({
  currentQuest,
  localView,
  isUnderdog,
  currentBonusXP,
  setShowBonusInfo,
  handleDeactivateQuest,
  handleApproveQuest,
  handleRejectQuest,
  handleCompleteQuest,
}) => {
  const calculateTimeLeft = () => {
    let start = currentQuest.startedAt;
    if (!start && currentQuest.createdAt) {
      if (typeof currentQuest.createdAt === 'object' && 'seconds' in currentQuest.createdAt) {
        start = (currentQuest.createdAt as any).seconds * 1000;
      } else {
        start = Number(currentQuest.createdAt);
      }
    }
    if (!start) start = Date.now();

    const duration = currentQuest.durationHours || currentQuest.deadlineHours || 48;
    const durationMs = duration * 3600 * 1000;
    const endTime = start + durationMs;
    return Math.max(0, endTime - Date.now());
  };

  const [timeLeft, setTimeLeft] = useState<number>(() => calculateTimeLeft());

  useEffect(() => {
    if (currentQuest.status === 'expired') {
      setTimeLeft(0);
      return;
    }

    const initialLeft = calculateTimeLeft();
    setTimeLeft(initialLeft);

    if (initialLeft <= 0) {
      if (currentQuest.status !== 'pending_approval' && currentQuest.status !== 'approved') {
        updateDoc(doc(db, 'quests', currentQuest.id), { status: 'expired' }).catch(err => 
          console.error("Error setting quest to expired:", err)
        );
      }
      return;
    }

    const timer = setInterval(() => {
      const left = calculateTimeLeft();
      setTimeLeft(left);
      if (left <= 0) {
        clearInterval(timer);
        if (currentQuest.status !== 'pending_approval' && currentQuest.status !== 'approved') {
          updateDoc(doc(db, 'quests', currentQuest.id), { status: 'expired' }).catch(err => 
            console.error("Error setting quest to expired on interval:", err)
          );
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [
    currentQuest.id, 
    currentQuest.status, 
    currentQuest.startedAt, 
    currentQuest.createdAt, 
    currentQuest.durationHours, 
    currentQuest.deadlineHours
  ]);

  const formatQuestTime = (ms: number): string => {
    if (ms <= 0) return "00:00:00";
    
    const totalSeconds = Math.floor(ms / 1000);
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const totalHours = Math.floor(totalMinutes / 60);
    const hours = totalHours % 24;
    const days = Math.floor(totalHours / 24);

    const pad = (num: number) => String(num).padStart(2, '0');
    const timeString = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

    if (days > 0) {
      let dayWord = "dní";
      if (days === 1) dayWord = "den";
      else if (days >= 2 && days <= 4) dayWord = "dny";
      return `${days} ${dayWord}, ${timeString}`;
    }

    return timeString;
  };

  const isPending = currentQuest.status === 'pending_approval';
  const isExpired = currentQuest.status === 'expired' || (timeLeft <= 0 && !isPending && currentQuest.status !== 'approved');
  const isUrgent = timeLeft > 0 && timeLeft < 3600 * 1000; // méně než 1 hodina

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-rose-500/10 border border-amber-500/20 p-4"
    >
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={16} className="text-amber-400" />
          <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Tajná mise</span>
          {localView === "parent" && (
            <button onClick={() => handleDeactivateQuest(currentQuest.id)} className="ml-auto text-[10px] text-zinc-500 hover:text-red-400">Ukončit</button>
          )}
        </div>
        <h4 className="text-sm font-black text-white mb-1">{currentQuest.title}</h4>
        <p className="text-xs text-zinc-400 mb-2">{currentQuest.description}</p>
        
        <div className="flex flex-wrap gap-2 text-[10px] mb-1">
          {/* Živý odpočítávač času */}
          <span className={cn(
            "px-2 py-0.5 rounded-full font-bold transition-all duration-300 flex items-center gap-1",
            isExpired 
              ? "bg-red-500/20 text-red-400 border border-red-500/30"
              : isUrgent
                ? "bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse"
                : "bg-amber-500/20 text-amber-300"
          )}>
            ⏱️ Zbývá: {formatQuestTime(timeLeft)}
          </span>

          {isUnderdog ? (
            <span 
              onClick={() => setShowBonusInfo(true)}
              className="bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 cursor-pointer transition-colors"
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
        ) : isExpired ? (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-center text-xs text-red-400 font-bold">
            ❌ Limity pro splnění této mise vypršel.
          </div>
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
};

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
  const [wishError, setWishError] = useState<string | null>(null);
  const [approvingWish, setApprovingWish] = useState<WishlistItem | null>(null);
  const [approveZB, setApproveZB] = useState("500");
  const [approveKč, setApproveKč] = useState("2500");
  const [lockRatio, setLockRatio] = useState(true);
  const [tempMaxLimit, setTempMaxLimit] = useState("2500");

  const maxWishLimitCZK = useMemo(() => leagueConfig?.maxWishLimitCZK || 2500, [leagueConfig]);
  const [showRulesModal, setShowRulesModal] = useState(false);

  useEffect(() => {
    if (leagueConfig && leagueConfig.maxWishLimitCZK !== undefined) {
      setTempMaxLimit(leagueConfig.maxWishLimitCZK.toString());
    }
  }, [leagueConfig]);
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
  const normalizedCurrentUserName = ((currentUserName || "").toLowerCase() === "zefran3" || (currentUserName || "").toLowerCase() === "táta" ? "Táta" : currentUserName) || "";
  const currentUserRole = useMemo(() => userProfiles[currentUserId]?.role || 'viewer', [userProfiles, currentUserId]);
  const canApproveActivities = useMemo(() => currentUserRole === 'admin' || currentUserRole === 'parent', [currentUserRole]);
  const canManageSystem = useMemo(() => currentUserRole === 'admin', [currentUserRole]);

  // Battle Pass stavy
  const [milestones, setMilestones] = useState<BattlePassMilestone[]>(DEFAULT_BATTLE_PASS_MILESTONES);
  const [claims, setClaims] = useState<BattlePassClaim[]>([]);
  const [claimingMilestone, setClaimingMilestone] = useState<BattlePassMilestone | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);

  // ─── Správa modal stav
  const [showSpravModal, setShowSpravModal] = useState(false);
  const [spravMilestones, setSpravMilestones] = useState<BattlePassMilestone[]>(DEFAULT_BATTLE_PASS_MILESTONES);
  const [spravUnsaved, setSpravUnsaved] = useState(false);
  const [spravSaving, setSpravSaving] = useState(false);

  // Stavy pro formulář správy milníků v modalu
  const [spravMilestoneTitle, setSpravMilestoneTitle] = useState("");
  const [spravMilestoneDesc, setSpravMilestoneDesc] = useState("");
  const [spravMilestonePoints, setSpravMilestonePoints] = useState(20);
  const [spravMilestoneIcon, setSpravMilestoneIcon] = useState("🍿");
  const [spravEditingMilestoneId, setSpravEditingMilestoneId] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Helper pro automatické přemapování bodů (pointsRequired) podle pořadí
  const remapSpravMilestonePoints = (milestonesList: BattlePassMilestone[]): BattlePassMilestone[] => {
    const FIXED_XP_VALUES = [20, 40, 60, 90, 120, 150];
    return milestonesList.map((m, index) => ({
      ...m,
      order: index + 1,
      pointsRequired: FIXED_XP_VALUES[index] !== undefined ? FIXED_XP_VALUES[index] : m.pointsRequired
    }));
  };

  // Handlery pro správu milníků v modalu
  const handleSaveSpravMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!spravMilestoneTitle.trim()) return;

    if (spravEditingMilestoneId) {
      setSpravMilestones(prev => {
        const mapped = prev.map(m => m.id === spravEditingMilestoneId 
          ? { ...m, title: spravMilestoneTitle.trim(), description: spravMilestoneDesc.trim(), icon: spravMilestoneIcon }
          : m
        );
        return remapSpravMilestonePoints(mapped.sort((a, b) => a.order - b.order));
      });
      setSpravEditingMilestoneId(null);
    } else {
      const newMilestone: BattlePassMilestone = {
        id: `bp_${Date.now()}`,
        title: spravMilestoneTitle.trim(),
        description: spravMilestoneDesc.trim(),
        pointsRequired: spravMilestonePoints,
        icon: spravMilestoneIcon,
        order: spravMilestones.length + 1
      };
      setSpravMilestones(prev => {
        const sorted = [...prev, newMilestone].sort((a, b) => a.order - b.order);
        return remapSpravMilestonePoints(sorted);
      });
    }

    setSpravMilestoneTitle("");
    setSpravMilestoneDesc("");
    setSpravMilestonePoints(20);
    setSpravMilestoneIcon("🎁");
    setShowEmojiPicker(false);
    setSpravUnsaved(true);
  };

  const handleEditSpravMilestone = (m: BattlePassMilestone) => {
    setSpravEditingMilestoneId(m.id);
    setSpravMilestoneTitle(m.title);
    setSpravMilestoneDesc(m.description);
    setSpravMilestonePoints(m.pointsRequired);
    setSpravMilestoneIcon(m.icon);
    setShowEmojiPicker(false);
  };

  const handleDeleteSpravMilestone = (id: string) => {
    setSpravMilestones(prev => {
      const filtered = prev.filter(m => m.id !== id);
      return remapSpravMilestonePoints(filtered);
    });
    setSpravUnsaved(true);
    if (spravEditingMilestoneId === id) {
      setSpravEditingMilestoneId(null);
      setSpravMilestoneTitle("");
      setSpravMilestoneDesc("");
      setSpravMilestonePoints(20);
      setSpravMilestoneIcon("🎁");
      setShowEmojiPicker(false);
    }
  };

  const handleMoveSpravMilestone = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= spravMilestones.length) return;

    const list = [...spravMilestones];
    const temp = list[idx];
    list[idx] = list[targetIdx];
    list[targetIdx] = temp;

    setSpravMilestones(remapSpravMilestonePoints(list));
    setSpravUnsaved(true);
  };

  // Interní confirm sub-modal
  type SpravConfirmType = 'pause' | 'resume' | 'start' | 'reset_sprint' | 'reset_league';
  const SPRAV_CONFIRM_CFG: Record<SpravConfirmType, { icon: string; title: string; desc: string; btnLabel: string; danger: boolean }> = {
    pause:   { icon: '⏸️', title: 'Pozastavit Ligu?',    desc: 'Sprint i Maraton budou pozastaveny. Při obnovení se startovní datum automaticky posune o dobu pauzy.',                                                             btnLabel: 'Pozastavit',       danger: false },
    resume:  { icon: '▶️', title: 'Obnovit Ligu?',       desc: 'Liga bude obnovena. Start Sprintu i Maratonu se posune o dobu, po kterou byla Liga pozastavena.',                                                                   btnLabel: 'Obnovit Ligu',     danger: false },
    start:   { icon: '🚀', title: 'Spustit novou Ligu?', desc: 'Nastaví nový start Maratonu i Sprintu na dnešní datum.',                                                                                                              btnLabel: 'Spustit Ligu',    danger: false },
    reset_sprint:  { icon: '🏁', title: 'Resetovat Sprint?',    desc: 'Aktuální Sprint bude ukončen a začne nový 60denní cyklus. Děti začínají Battle Pass od nuly. Maratonské body zůstávají nedotčené.',         btnLabel: 'Resetovat Sprint', danger: true  },
    reset_league:  { icon: '⚠️', title: 'Resetovat celou Ligu?', desc: 'VAROVÁNÍ: Vymaže veškeré body – Sprintové i Maratonské. Všechno začíná od nuly. Tuto akci nelze vrátit!', btnLabel: 'Resetovat vše',   danger: true  },
  };
  const [spravConfirm, setSpravConfirm] = useState<{ open: boolean; type: SpravConfirmType | null }>({ open: false, type: null });

  const openSpravConfirm = (type: SpravConfirmType) => setSpravConfirm({ open: true, type });
  const closeSpravConfirm = () => setSpravConfirm({ open: false, type: null });

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

    const unsubBP = onSnapshot(
      doc(db, 'settings', 'battle_pass'),
      docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const list = (data.milestones || []) as BattlePassMilestone[];
          if (list.length === 0) {
            if (canApproveActivities) {
              setDoc(doc(db, 'settings', 'battle_pass'), { milestones: DEFAULT_BATTLE_PASS_MILESTONES }, { merge: true })
                .catch(err => console.error("Error initializing milestones in Firestore:", err));
            }
            setMilestones(DEFAULT_BATTLE_PASS_MILESTONES);
          } else {
            setMilestones([...list].sort((a, b) => a.order - b.order));
          }
        } else {
          if (canApproveActivities) {
            setDoc(doc(db, 'settings', 'battle_pass'), { milestones: DEFAULT_BATTLE_PASS_MILESTONES }, { merge: true })
              .catch(err => console.error("Error initializing milestones in Firestore:", err));
          }
          setMilestones(DEFAULT_BATTLE_PASS_MILESTONES);
        }
      },
      err => console.error("Battle pass listen error:", err)
    );

    const unsubClaims = onSnapshot(
      collection(db, 'battlePassClaims'),
      snap => setClaims(snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]),
      err => console.error("Claims listen error:", err)
    );
    return () => { unsubW(); unsubQ(); unsubL(); unsubBP(); unsubClaims(); };
  }, []);

  // ─── Handlers ────────────────────────────────────────
  const handleConfirmClaimBattlePass = async () => {
    if (!claimingMilestone || isClaiming) return;
    setIsClaiming(true);
    try {
      const docRef = doc(db, "battlePassClaims", `${currentUserId}_${currentSprintId}`);
      await setDoc(docRef, {
        userId: currentUserId,
        userName: normalizedCurrentUserName,
        sprintId: currentSprintId,
        rewardId: claimingMilestone.id,
        rewardTitle: claimingMilestone.title,
        claimedAt: serverTimestamp()
      });
      setClaimingMilestone(null);
    } catch (err) {
      console.error("Failed to claim Battle Pass reward:", err);
    } finally {
      setIsClaiming(false);
    }
  };

  const handleAddWish = async () => {
    if (!wishName.trim() || !wishUrl.trim()) return;
    setWishError(null);
    const cleanName = wishName.trim().toLowerCase();
    const forbiddenWords = ["penize", "peníze", "hotovost", "cash", "na ruku"];
    const isCashAmount = /^\d+\s*(kč|czk|kc)?$/i.test(cleanName);
    const containsForbidden = forbiddenWords.some(word => cleanName.includes(word)) || isCashAmount;
    if (containsForbidden) {
      setWishError("⚠️ Přání ve formě peněz nebo hotovosti není povoleno (máš přece kapesné!). Zadej prosím konkrétní hračku, věc nebo zážitek.");
      return;
    }

    await addDoc(collection(db, 'wishlists'), {
      childName: normalizedCurrentUserName,
      authorId: currentUserId,
      name: wishName.trim(),
      url: wishUrl.trim(),
      targetZB: 0,
      status: 'pending',
      createdAt: serverTimestamp()
    });
    setWishName(""); setWishUrl(""); setShowWishForm(false); setWishError(null);
  };

  const handleApproveWish = async () => {
    if (!approvingWish) return;
    await updateDoc(doc(db, 'wishlists', approvingWish.id), {
      status: 'approved',
      targetZB: parseInt(approveZB) || 500,
      valueKč: parseFloat(approveKč) || 0
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
    const hours = parseInt(questHours) || 48;
    await addDoc(collection(db, 'quests'), {
      title: questTitle.trim(),
      description: questDesc.trim(),
      bonusMultiplier: parseFloat(questMultiplier) || 2,
      deadlineHours: hours,
      durationHours: hours,
      startedAt: Date.now(),
      active: true,
      status: 'active',
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
    const sprint: Record<string, UserStats> = {};
    const maraton: Record<string, UserStats> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const getDynamicName = (childName: string): string => {
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

    const getCreatedTime = (item: any) => {
      if (!item.createdAt) return 0;
      if (typeof item.createdAt === 'number') return item.createdAt;
      if (item.createdAt.toMillis) return item.createdAt.toMillis();
      return new Date(item.createdAt).getTime();
    };

    suggestions.forEach(s => {
      if (s.type === "ride") return;
      let rawName = s.childName || "Neznámý";
      let name = getDynamicName(rawName);
      
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
        let name = getDynamicName(rawName);
        
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
  }, [suggestions, quests, userProfiles, leagueConfig]);

  const playerNameToIdMap = useMemo(() => {
    const mapping: Record<string, string> = {};
    Object.entries(userProfiles || {}).forEach(([uid, p]) => {
      let name = p.adminAlias || p.displayName || p.email?.split('@')[0];
      if (name) {
        if (name.toLowerCase() === "zefran3" || name.toLowerCase() === "táta") {
          name = "Táta";
        }
        mapping[name] = uid;
      }
    });
    return mapping;
  }, [userProfiles]);

  // ─── Žebříček (Vyloučení rodiče/admina podle rolí) ───────────────
  const leaderboardData = useMemo(() => {
    const statsSource = leaderboardMode === 'sprint' ? playerStats.sprint : playerStats.maraton;
    return (Object.entries(statsSource) as [string, UserStats][])
      .map(([name, stats]) => {
        const badgeBonus = BADGES.filter(b => b.check(stats)).reduce((s, b) => s + b.bonusZB, 0);
        return { name: name || "", ...stats, totalZB: stats.totalZB + badgeBonus, avatar: getAvatarForChild(name || "") };
      })
      .filter(p => {
        const uid = playerNameToIdMap[p.name];
        const role = userProfiles[uid]?.role || 'viewer';
        return role === 'child';
      })
      .sort((a, b) => b.totalZB - a.totalZB);
  }, [playerStats, leaderboardMode, getAvatarForChild, playerNameToIdMap, userProfiles]);

  const kidsCount = useMemo(() => {
    return Math.max(1, leaderboardData.length);
  }, [leaderboardData]);

  const maxWishXP = useMemo(() => {
    return Math.max(1, Math.round(500 / kidsCount));
  }, [kidsCount]);

  const ratio = useMemo(() => {
    return maxWishLimitCZK / maxWishXP;
  }, [maxWishLimitCZK, maxWishXP]);

  const activePlayer = useMemo(() => {
    if (currentUserRole !== "admin" && currentUserRole !== "parent") {
      return normalizedCurrentUserName || "";
    }
    if (selectedPlayer) return selectedPlayer;
    return leaderboardData[0]?.name || "";
  }, [selectedPlayer, normalizedCurrentUserName, leaderboardData, currentUserRole]);

  const activePlayerId = useMemo(() => {
    return playerNameToIdMap[activePlayer || ""] || "";
  }, [playerNameToIdMap, activePlayer]);

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

      // Anti-spam ochrana: body se přičtou pouze pokud má aktivita status "pending", "approved" nebo "cancelled"
      if (s.status === "pending" || s.status === "approved" || s.status === "cancelled") {
        stats[name].totalIdeas += 1;
        stats[name].totalZB += ZB_RULES.BASIC;

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
        } else if (s.status === "cancelled") {
          // Zrušená aktivita - bonus za plánování a přípravu bez realizace
          if (s.approvedDetails || (s.location && s.url)) {
            stats[name].withDetails += 1;
            stats[name].totalZB += ZB_RULES.LOGISTICS;
          }

          if (s.approvedFree) {
            stats[name].freeActivities += 1;
            stats[name].totalZB += ZB_RULES.FREE_DISCOUNT;
          }
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
    const pStats = sprintStats?.[normalizedCurrentUserName || ""] || { totalIdeas: 0, realized: 0, freeActivities: 0, withDetails: 0, totalZB: 0 };
    const badgeBonus = BADGES.filter(b => b.check(pStats)).reduce((s, b) => s + b.bonusZB, 0);
    return (pStats.totalZB || 0) + badgeBonus;
  }, [sprintStats, normalizedCurrentUserName]);

  const activeSprintXP = useMemo(() => {
    const pStats = sprintStats?.[activePlayer || ""] || { totalIdeas: 0, realized: 0, freeActivities: 0, withDetails: 0, totalZB: 0 };
    const badgeBonus = BADGES.filter(b => b.check(pStats)).reduce((s, b) => s + b.bonusZB, 0);
    return (pStats.totalZB || 0) + badgeBonus;
  }, [sprintStats, activePlayer]);

  const claimedRewardInCurrentSprint = useMemo(() => {
    const idToFind = activePlayerId || currentUserId || "";
    return (claims || []).find(c => c.userId === idToFind && c.sprintId === currentSprintId);
  }, [claims, activePlayerId, currentUserId, currentSprintId]);

  const hasClaimed = !!claimedRewardInCurrentSprint;
  const selectedReward = claimedRewardInCurrentSprint?.rewardTitle || "";

  const renderWishUrl = (url?: string) => {
    if (!url) return null;
    const cleanUrl = url.trim();
    const isLink = cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://") || cleanUrl.startsWith("www.");
    const hrefUrl = cleanUrl.startsWith("www.") ? `https://${cleanUrl}` : cleanUrl;
    if (isLink) {
      return (
        <a href={hrefUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors inline-flex items-center gap-1 mt-1 font-semibold hover:underline">
          🔗 Odkaz na produkt
        </a>
      );
    }
    return (
      <span className="text-[11px] text-zinc-400 block mt-1">
        💰 Cena / Odkaz: <strong className="text-zinc-300">{cleanUrl}</strong>
      </span>
    );
  };

  // 1. Bezpečné seřazení a výpočet milníků:
  const sortedMilestones = milestones ? [...milestones].sort((a, b) => a.order - b.order) : [];

  const eligibleMilestones = sortedMilestones.filter(m => (activeSprintXP || 0) >= m.pointsRequired);

  const highestEligibleMilestone = eligibleMilestones.length > 0 
    ? eligibleMilestones[eligibleMilestones.length - 1] 
    : null;

  // 2. Přidej globální komponentovou pojistku (Záchranná brzda):
  if (!milestones) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-zinc-500 text-xs italic">
        ⏳ Načítám data herního Battle Passu...
      </div>
    );
  }

  const activeStats = (leaderboardMode === 'sprint' ? playerStats.sprint : playerStats.maraton)[activePlayer || ""] || { totalIdeas: 0, realized: 0, freeActivities: 0, withDetails: 0, totalZB: 0 };
  const unlockedBadges = BADGES.filter(b => b.check(activeStats));
  const activeBadgeBonus = unlockedBadges.reduce((sum, b) => sum + b.bonusZB, 0);
  const activeTotalXP = activeStats.totalZB + activeBadgeBonus; // Skutečné celkové XP

  const activeMaratonStats = playerStats.maraton[activePlayer || ""] || { totalIdeas: 0, realized: 0, freeActivities: 0, withDetails: 0, totalZB: 0 };
  const activeMaratonBadgeBonus = BADGES.filter(b => b.check(activeMaratonStats)).reduce((sum, b) => sum + b.bonusZB, 0);
  const activeMaratonTotalXP = activeMaratonStats.totalZB + activeMaratonBadgeBonus;



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
  
  const kidsProfiles = leaderboardData; // leaderboardData už má odfiltrovaného Tátu, takže kidsProfiles je totožné
  const avgKidsXP = kidsProfiles.length > 0
    ? kidsProfiles.reduce((sum, p) => sum + p.totalZB, 0) / kidsProfiles.length
    : 0;
  const calculatedXP = Math.round((400 - avgKidsXP) / 25);
  const suggestedXP = Math.max(5, Math.min(15, calculatedXP));
  const activeWishlist = wishlists.filter(w => {
    const wName = (w.childName || "").toLowerCase() === "zefran3" || (w.childName || "").toLowerCase() === "táta" ? "Táta" : w.childName || "";
    return (wName || "").toLowerCase() === (activePlayer || "").toLowerCase();
  });

  const pendingCount = useMemo(() => {
    return activeWishlist.filter(w => w.status === 'pending').length;
  }, [activeWishlist]);

  const approvedCount = useMemo(() => {
    return activeWishlist.filter(w => w.status === 'approved').length;
  }, [activeWishlist]);

  const totalApprovedKč = useMemo(() => {
    return activeWishlist
      .filter(w => w.status === 'approved')
      .reduce((sum, w) => sum + (w.valueKč || Math.round((w.targetZB || 0) * ratio)), 0);
  }, [activeWishlist, ratio]);

  const remainingLimit = useMemo(() => {
    return Math.max(0, maxWishLimitCZK - totalApprovedKč);
  }, [maxWishLimitCZK, totalApprovedKč]);
  const activeQuests = quests.filter(q => q.active);

  const handleSpravSave = async () => {
    setSpravSaving(true);
    await setDoc(doc(db, 'settings', 'battle_pass'), { milestones: spravMilestones }, { merge: true }).catch(console.error);
    setSpravSaving(false);
    setSpravUnsaved(false);
  };

  const executeSpravAction = async () => {
    if (!spravConfirm.type) return;
    const type = spravConfirm.type;
    closeSpravConfirm();
    try {
      if (type === 'pause') {
        await handlePauseLeague();
      } else if (type === 'resume') {
        await handleResumeLeague();
      } else if (type === 'start') {
        await handleStartLeague();
      } else if (type === 'reset_sprint') {
        await updateDoc(doc(db, 'settings', 'league_config'), {
          status: 'running',
          sprintStartDate: serverTimestamp()
        });
      } else if (type === 'reset_league') {
        await setDoc(doc(db, 'settings', 'league_config'), {
          status: 'running',
          leagueStartDate: serverTimestamp(),
          sprintStartDate: serverTimestamp(),
          pausedAt: null
        });
      }
    } catch (err) {
      console.error("Sprav action failed:", err);
    }
  };

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
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">Správa Maratonu (Velitelský můstek)</h3>
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
                        <span>Začátek maratonu:</span>
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

                  {/* Grid 2 sloupce: Zadat tajnou misi + Správa Ligy */}
                  <div className="grid grid-cols-2 gap-3 w-full">
                    <button
                      onClick={() => setShowCreateQuest(!showCreateQuest)}
                      className="py-4 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-black text-xs rounded-xl shadow-lg shadow-amber-500/5 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                    >
                      ➕ Zadat tajnou misi
                    </button>
                    {canApproveActivities && (
                      <button
                        onClick={() => { setSpravMilestones([...milestones]); setShowSpravModal(true); }}
                        className="py-4 border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 font-black text-xs rounded-xl shadow-lg shadow-indigo-500/5 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                      >
                        🛡️ Správa Ligy
                      </button>
                    )}
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
                    const stats = (leaderboardMode === 'sprint' ? playerStats.sprint : playerStats.maraton)[name] || { totalIdeas: 0, realized: 0, freeActivities: 0, withDetails: 0, totalZB: 0 };
                    
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
          {activeQuests.length > 0 && (
            <ActiveQuestBanner
              currentQuest={activeQuests[0]}
              localView={localView}
              isUnderdog={isUnderdog}
              currentBonusXP={currentBonusXP}
              setShowBonusInfo={setShowBonusInfo}
              handleDeactivateQuest={handleDeactivateQuest}
              handleApproveQuest={handleApproveQuest}
              handleRejectQuest={handleRejectQuest}
              handleCompleteQuest={handleCompleteQuest}
            />
          )}



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
                  <h3 className="text-base font-black text-red-400 uppercase tracking-wider">Maraton (6 měs.) momentálně neběží</h3>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto">
                    Aktuální půlroční sezóna Víkendovníku nebyla zahájena nebo byla ukončena. Přihlaste se jako Administrátor a odstartujte nový maraton na Velitelském můstku!
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
                      Maraton (6 měs.)
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {leaderboardData.map((player, idx) => (
                    <button
                      key={player.name}
                      onClick={() => {
                        if (currentUserRole === 'admin' || currentUserRole === 'parent') {
                          setSelectedPlayer(player.name === selectedPlayer ? null : player.name);
                        }
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left relative overflow-hidden",
                        player.name === activePlayer
                          ? "bg-gradient-to-r from-violet-500/20 to-cyan-500/20 border-violet-500/50 shadow-lg shadow-violet-500/5 scale-[1.01] ring-1 ring-violet-500/30"
                          : "bg-zinc-800/30 border-white/5",
                        (currentUserRole === 'admin' || currentUserRole === 'parent')
                          ? "hover:bg-zinc-800/60 cursor-pointer"
                          : "cursor-default"
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

          {/* ═══ BATTLE PASS MAPA ODMĚN ═══ */}
          {localView !== "parent" && leaderboardMode === "sprint" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-zinc-900/40 border border-white/5 rounded-2xl p-5 space-y-4 shadow-xl relative overflow-hidden"
            >
              <div className="absolute -top-10 -right-10 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />
              <button
                type="button"
                onClick={() => setShowRewards(!showRewards)}
                className="flex items-center justify-between w-full relative z-10 text-left"
              >
                <div className="flex items-center gap-2.5">
                  <Award size={18} className={activeSprintXP < (sortedMilestones[0]?.pointsRequired ?? 20) ? "text-zinc-500" : "text-emerald-400"} />
                  <div className="text-left">
                    <h3 className="text-sm font-black text-zinc-200 tracking-wider uppercase">Battle Pass</h3>
                    <p className="text-[10px] text-zinc-500 font-medium">Sprintová mapa odměn • Hráč: <span className="text-zinc-300 font-bold">{activePlayer}</span></p>
                  </div>
                  {hasClaimed ? (
                    <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                      Uplatněno
                    </span>
                  ) : activeSprintXP >= (sortedMilestones[0]?.pointsRequired ?? 20) ? (
                    <span className="text-[9px] bg-amber-500/15 border border-amber-500/30 text-amber-400 px-2 py-0.5 rounded-full font-black uppercase tracking-wider flex items-center gap-1 animate-pulse">
                      Aktivní
                    </span>
                  ) : null}
                </div>
                <ChevronRight size={18} className={cn("text-zinc-500 transition-transform duration-300", showRewards && "rotate-90")} />
              </button>

              <AnimatePresence>
                {showRewards && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden space-y-4 relative z-10"
                  >
                    {/* Status Info pro rodiče nebo info zprávu */}
                    {currentUserRole === 'admin' || currentUserRole === 'parent' ? (
                      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 text-xs text-indigo-300 flex items-center gap-2 font-bold">
                        <span>ℹ️</span>
                        <span>Jako rodič prohlížíš Battle Pass pro: <strong className="text-white">{activePlayer}</strong> ({activeSprintXP} XP).</span>
                      </div>
                    ) : (
                      activePlayer !== normalizedCurrentUserName ? (
                        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 text-xs text-indigo-300 flex items-center gap-2 font-bold">
                          <span>ℹ️</span>
                          <span>Prohlížíš Battle Pass hráče <strong className="text-white">{activePlayer}</strong>. Nemůžeš mu vybírat odměny.</span>
                        </div>
                      ) : null
                    )}

                    {hasClaimed && (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-400 flex items-center gap-2.5 font-bold shadow-inner">
                        <span className="text-lg">🎉</span>
                        <div>
                          Uplatněná odměna pro tento Sprint: <span className="underline font-extrabold text-white">{selectedReward}</span>
                          <p className="text-[10px] text-zinc-500 font-normal mt-0.5">Výběr pro tento Sprint byl tímto úspěšně uzavřen.</p>
                        </div>
                      </div>
                    )}

                    {/* Vertikální časová osa (Battle Pass) */}
                    <div className="relative pl-12 pr-2 py-4 space-y-6">
                      {/* Čára na pozadí osy */}
                      <div className="absolute left-[23px] top-0 bottom-0 w-[2px] bg-gradient-to-b from-emerald-500/10 via-zinc-800 to-zinc-900" />
                      
                      {/* Dynamická čára pokroku */}
                      <div 
                        className="absolute left-[23px] top-0 w-[2px] bg-gradient-to-b from-emerald-500 to-teal-400 transition-all duration-1000"
                        style={{
                          height: (() => {
                            if (!sortedMilestones || sortedMilestones.length === 0) return '0%';
                            const maxVal = sortedMilestones[sortedMilestones.length - 1]?.pointsRequired || 1;
                            const pct = Math.min(100, (activeSprintXP / maxVal) * 100);
                            return `${pct}%`;
                          })()
                        }}
                      />

                      {(() => {
                        if (sortedMilestones.length === 0) {
                          return (
                            <div className="text-zinc-500 text-center py-4 text-xs italic">
                              Zatím nebyly nastaveny žádné milníky Battle Passu.
                            </div>
                          );
                        }
                        return sortedMilestones.map((m) => {
                          const isUnlocked = activeSprintXP >= m.pointsRequired;
                          const isHighestUnlocked = highestEligibleMilestone?.id === m.id;
                          const isClaimedThis = claimedRewardInCurrentSprint?.rewardId === m.id;
                          
                          // Může aktuálně přihlášený uživatel vybrat tento milník?
                          const isClaimable = isHighestUnlocked && !hasClaimed && activePlayer === normalizedCurrentUserName && currentUserRole !== 'admin' && currentUserRole !== 'parent';
                          
                          // Stav milníku
                          let statusBg = "bg-zinc-950 border-zinc-800 text-zinc-600";
                          let ringColor = "";
                          if (isClaimedThis) {
                            statusBg = "bg-emerald-500 border-emerald-400 text-zinc-950 scale-110 shadow-lg shadow-emerald-500/20";
                          } else if (hasClaimed) {
                            statusBg = "bg-zinc-950/40 border-zinc-900 text-zinc-700 opacity-40";
                          } else if (isUnlocked) {
                            statusBg = "bg-zinc-800 border-emerald-500/50 text-emerald-400";
                            if (isHighestUnlocked) {
                              ringColor = "ring-4 ring-emerald-500/20 animate-pulse";
                            }
                          }

                          return (
                            <div key={m.id} className={cn("relative flex items-start gap-4 transition-all duration-300", hasClaimed && !isClaimedThis && "opacity-65")}>
                              {/* Kolečko na časové ose */}
                              <div className={cn("absolute -left-10 w-8 h-8 rounded-full border flex items-center justify-center z-10 transition-all font-bold text-sm", statusBg, ringColor)}>
                                {isClaimedThis ? (
                                  "✓"
                                ) : (
                                  <span className="text-xs">{m.pointsRequired}</span>
                                )}
                              </div>

                              {/* Box s milníkem */}
                              <div className={cn(
                                "flex-1 p-3.5 rounded-xl border transition-all relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-3",
                                isClaimedThis 
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                  : isClaimable
                                    ? "bg-zinc-800/80 border-emerald-500/30 hover:border-emerald-500/50 hover:bg-zinc-800 shadow-md shadow-emerald-500/5"
                                    : isUnlocked
                                      ? "bg-zinc-800/40 border-white/5"
                                      : "bg-zinc-950/20 border-white/5 opacity-50"
                              )}>
                                <div className="flex items-center gap-3">
                                  <span className="text-3xl filter drop-shadow select-none">{m.icon || "🎁"}</span>
                                  <div>
                                    <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                                      {m.title}
                                      {isClaimedThis && (
                                        <span className="text-[8px] bg-emerald-500 text-zinc-950 px-1 rounded uppercase font-black">
                                          Vybráno
                                        </span>
                                      )}
                                      {!hasClaimed && isUnlocked && !isHighestUnlocked && (
                                        <span className="text-[8px] bg-zinc-700 text-zinc-300 px-1 rounded font-bold">
                                          Splněno
                                        </span>
                                      )}
                                    </h4>
                                    <p className="text-[10px] text-zinc-400 font-medium mt-0.5 leading-relaxed">
                                      {m.description || "Tajuplná odměna."}
                                    </p>
                                  </div>
                                </div>

                                {/* Akční tlačítko pro výběr */}
                                {isClaimable && (
                                  <button
                                    type="button"
                                    onClick={() => setClaimingMilestone(m)}
                                    className="shrink-0 w-full sm:w-auto px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-[11px] font-black uppercase tracking-wider shadow-md hover:shadow-emerald-500/20 hover:scale-[1.03] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                  >
                                    <span>Zvolit odměnu</span>
                                    <span className="text-xs">➔</span>
                                  </button>
                                )}

                                {!isUnlocked && (
                                  <div className="shrink-0 flex items-center gap-1 text-[10px] text-zinc-600 font-bold uppercase tracking-wider">
                                    <Lock size={10} />
                                    <span>Zamčeno</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        });
                      })()}
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
                <h3 className="text-sm font-bold text-rose-300 uppercase tracking-wider">Přání (Maraton (6 měs.))</h3>
              </div>
              {localView === "child" && currentUserRole !== "parent" && currentUserRole !== "admin" && leaderboardMode === "liga" && pendingCount === 0 && approvedCount < 2 && (approvedCount !== 1 || totalApprovedKč < maxWishLimitCZK) && (
                <button onClick={() => { setShowWishForm(!showWishForm); setWishError(null); }}
                  className="flex items-center gap-1 text-xs font-bold text-rose-400 hover:text-rose-300 transition-colors bg-rose-500/10 px-3 py-1.5 rounded-lg border border-rose-500/20"
                >
                  <Plus size={12} /> Přidat přání
                </button>
              )}
            </div>

            {/* Notices for child when they cannot add a wish */}
            {localView === "child" && currentUserRole !== "parent" && currentUserRole !== "admin" && leaderboardMode === "liga" && (
              <div className="mb-3">
                {pendingCount > 0 && (
                  <div className="text-xs text-amber-400 bg-amber-500/5 border border-amber-500/10 px-3 py-2.5 rounded-xl">
                    ⏳ Máš jedno přání čekající na schválení. Jakmile ho rodič schválí, uvidíš, zda ti zbývá limit na případné druhé přání.
                  </div>
                )}
                {approvedCount >= 2 && (
                  <div className="text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-3 py-2.5 rounded-xl">
                    🎉 Dosáhl(a) jsi maximálního počtu 2 schválených přání pro tento maraton.
                  </div>
                )}
                {approvedCount === 1 && totalApprovedKč >= maxWishLimitCZK && (
                  <div className="text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-3 py-2.5 rounded-xl">
                    🎉 Tvoje schválené přání vyčerpalo celý limit {maxWishLimitCZK} Kč.
                  </div>
                )}
              </div>
            )}

            {/* Wish form */}
            <AnimatePresence>
              {showWishForm && localView === "child" && currentUserRole !== "parent" && currentUserRole !== "admin" && leaderboardMode === "liga" && pendingCount === 0 && approvedCount < 2 && (approvedCount !== 1 || totalApprovedKč < maxWishLimitCZK) && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-3">
                  <div className="bg-zinc-800/50 border border-rose-500/10 rounded-xl p-4 space-y-3">
                    <div className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">Přání od: {normalizedCurrentUserName}</div>
                    
                    <div className="flex flex-col gap-2 bg-zinc-900/40 p-3 rounded-lg border border-white/5 text-xs text-zinc-400">
                      <div className="flex items-center justify-between w-full">
                        <span className="font-semibold text-zinc-300">💡 Přání mají svá pravidla.</span>
                        <button
                          type="button"
                          onClick={() => setShowRulesModal(true)}
                          className="text-xs font-bold text-rose-400 hover:text-rose-300 transition-colors bg-rose-500/10 px-2.5 py-1 rounded-md border border-rose-500/20 cursor-pointer"
                        >
                          Jak to funguje?
                        </button>
                      </div>
                      
                      {approvedCount === 1 ? (
                        <div className="text-[11px] text-amber-400 border-t border-white/5 pt-2 mt-1">
                          ℹ️ Tvoje první přání mělo hodnotu <strong>{totalApprovedKč} Kč</strong>. Na druhé přání ti zbývá limit <strong>{remainingLimit} Kč</strong>.
                        </div>
                      ) : (
                        <div className="text-[11px] text-zinc-500 border-t border-white/5 pt-2 mt-1">
                          ℹ️ Maximální povolená celková hodnota přání je <strong>{maxWishLimitCZK} Kč</strong>.
                        </div>
                      )}
                    </div>

                    <input value={wishName} onChange={e => { setWishName(e.target.value); setWishError(null); }} placeholder="Co si přeješ? (např. Steam kredit)" className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-rose-500/30" />
                    <input value={wishUrl} onChange={e => { setWishUrl(e.target.value); setWishError(null); }} placeholder="Odkaz na produkt nebo cena v Kč (povinné)" className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-rose-500/30" />
                    
                    {wishError && (
                      <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg font-medium leading-relaxed">
                        {wishError}
                      </div>
                    )}
                    
                    <button onClick={handleAddWish} disabled={!wishName.trim() || !wishUrl.trim()} className="w-full bg-rose-500 text-white font-bold text-xs py-2.5 rounded-lg hover:bg-rose-400 transition-colors disabled:opacity-30">Odeslat ke schválení</button>
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
                      <button onClick={() => { setApprovingWish(w); setApproveZB(maxWishXP.toString()); setApproveKč(Math.round(maxWishXP * ratio).toString()); setLockRatio(true); }} className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"><Check size={14} /></button>
                      <button onClick={() => { setRejectingWish(w); setRejectReason(""); }} className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30"><X size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Admin View: Children goals overview instead of personal Admin wishlist */}
            {localView === "parent" ? (
              <div className="space-y-4">
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">Admin: Přehled cílů – {activePlayer}</div>
                <div className="grid gap-3">
                  {wishlists
                    .filter(w => w.status === 'approved' && w.targetZB > 0 && w.childName === activePlayer)
                    .map(wish => {
                      const childName = wish.childName || "Neznámý";
                      const childStats = playerStats.maraton[childName] || { totalIdeas: 0, realized: 0, freeActivities: 0, withDetails: 0, totalZB: 0 };
                      const childBadgeBonus = BADGES.filter(b => b.check(childStats)).reduce((s, b) => s + b.bonusZB, 0);
                      const childTotalXP = childStats.totalZB + childBadgeBonus;
                      
                      const progress = Math.min(100, (childTotalXP / wish.targetZB) * 100);
                      const completed = childTotalXP >= wish.targetZB;
                      
                      return (
                        <div key={wish.id} className={cn("rounded-xl border p-4 transition-all relative overflow-hidden", completed ? "bg-emerald-500/10 border-emerald-500/20" : "bg-zinc-800/50 border-white/5")}>
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className="text-sm font-bold text-white block">{wish.name}</span>
                              {renderWishUrl(wish.url)}
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
                  {wishlists.filter(w => w.status === 'approved' && w.targetZB > 0 && w.childName === activePlayer).length === 0 && (
                    <div className="text-center py-4 text-zinc-600 text-xs">Zatím žádná schválená přání pro vybrané dítě.</div>
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
                    const progress = Math.min(100, (activeMaratonTotalXP / wish.targetZB) * 100);
                    const completed = activeMaratonTotalXP >= wish.targetZB;
                    return (
                      <div key={wish.id} className={cn("rounded-xl border p-4 transition-all", completed ? "bg-emerald-500/10 border-emerald-500/20" : "bg-zinc-800/50 border-white/5")}>
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="text-sm font-bold text-white block">{wish.name}</span>
                            {renderWishUrl(wish.url)}
                          </div>
                          <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", completed ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-700 text-zinc-400")}>
                            {completed ? "✓ Splněno!" : `${activeMaratonTotalXP} / ${wish.targetZB} XP`}
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
              <div className="flex flex-col sm:grid sm:grid-cols-2 sm:gap-2.5 text-xs">
                {[
                  { label: "Nový nápad", zb: `+${ZB_RULES.BASIC} XP`, color: "text-zinc-300" },
                  { label: "Realizovaná akce", zb: `+${ZB_RULES.REALIZED} XP`, color: "text-emerald-400" },
                  { label: "Dodané detaily", zb: `+${ZB_RULES.LOGISTICS} XP`, color: "text-cyan-400" },
                  { label: "Akce zdarma / sleva", zb: `+${ZB_RULES.FREE_DISCOUNT} XP`, color: "text-amber-400" },
                  { label: "🎯 Tajné mise", zb: "Dle zadání", subtext: "Sleduj Nástěnku", color: "text-violet-400" },
                  { label: "🚀 Dorovnávací bonus", zb: "+5 XP", subtext: "Získáš k misi, pokud ztrácíš na první místo", color: "text-rose-400" }
                ].map((rule, i) => (
                  <div key={i} className="flex flex-col justify-between bg-zinc-950 rounded-2xl border border-white/5 p-4 mb-3 sm:mb-0 hover:bg-zinc-900/80 hover:scale-[1.01] transition-all duration-200">
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Hodnota v Kč</label>
                  <input
                    value={approveKč}
                    onChange={e => {
                      const val = e.target.value;
                      setApproveKč(val);
                      if (lockRatio) {
                        const num = parseFloat(val);
                        if (!isNaN(num)) {
                          setApproveZB(Math.round(num / ratio).toString());
                        } else {
                          setApproveZB("");
                        }
                      }
                    }}
                    type="number"
                    placeholder="Např. 2500"
                    className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-emerald-500/30 bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Cena v XP</label>
                  <input
                    value={approveZB}
                    onChange={e => {
                      const val = e.target.value;
                      setApproveZB(val);
                      if (lockRatio) {
                        const num = parseInt(val, 10);
                        if (!isNaN(num)) {
                          setApproveKč(Math.round(num * ratio).toString());
                        } else {
                          setApproveKč("");
                        }
                      }
                    }}
                    type="number"
                    placeholder="Např. 500"
                    className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-emerald-500/30 bg-zinc-800"
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="checkbox"
                  id="lock-ratio-checkbox"
                  checked={lockRatio}
                  onChange={e => {
                    const checked = e.target.checked;
                    setLockRatio(checked);
                    if (checked) {
                      const num = parseFloat(approveKč);
                      if (!isNaN(num)) {
                        setApproveZB(Math.round(num / ratio).toString());
                      }
                    }
                  }}
                  className="w-4 h-4 rounded bg-zinc-800 border-white/10 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                />
                <label htmlFor="lock-ratio-checkbox" className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider cursor-pointer select-none">
                  🔒 Uzamknout poměr (přepočítávat)
                </label>
              </div>

              {parseFloat(approveKč) > maxWishLimitCZK && (
                <div className="text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-1.5 rounded-lg">
                  ⚠️ Hodnota přesahuje maximální limit {maxWishLimitCZK} Kč!
                </div>
              )}
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

      {/* ═══ RULES MODAL ═══ */}
      <AnimatePresence>
        {showRulesModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRulesModal(false)}
              className="fixed inset-0 bg-black/60 z-[110]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md bg-zinc-900 border border-white/10 rounded-2xl p-6 z-[110] space-y-4 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <span>🎁 Jak fungují přání v Maratonu?</span>
                </h3>
                <button
                  onClick={() => setShowRulesModal(false)}
                  className="text-zinc-500 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="text-xs text-zinc-300 space-y-3.5 leading-relaxed">
                <p>
                  Marathon trvá 6 měsíců a tvým hlavním cílem je získat zvolené přání. Aby to bylo spravedlivé, platí následující pravidla:
                </p>

                <div className="space-y-3 bg-zinc-950/40 p-3.5 rounded-xl border border-white/5">
                  <div>
                    <span className="font-bold text-rose-400 block mb-0.5">Celkový limit:</span>
                    <span>Můžeš si přát věci v celkové hodnotě až <strong>{maxWishLimitCZK} Kč</strong> (hodnota se automaticky převede na XP).</span>
                  </div>

                  <div>
                    <span className="font-bold text-rose-400 block mb-0.5">Maximálně 2 přání:</span>
                    <span>V rámci jednoho maratonu můžeš mít nejvýše 2 schválená přání, jejichž společná hodnota nepřekročí celkový limit.</span>
                    <span className="block text-zinc-400 text-[11px] mt-1 bg-zinc-900/50 p-2 rounded border border-white/5">
                      💡 <strong>Příklad:</strong> Pokud si přeješ hru za 1500 Kč, zbývá ti limit 1000 Kč, za který si můžeš přidat jedno další přání. Pokud tvé první přání vyčerpá celý limit (např. 2500 Kč), druhé přání už přidat nemůžeš.
                    </span>
                  </div>

                  <div>
                    <span className="font-bold text-rose-400 block mb-0.5">Povinná cena nebo odkaz:</span>
                    <span>Vždy musíš uvést buď webový odkaz na vyhlédnutou věc, nebo napsat její cenu, aby rodič věděl, kolik stojí.</span>
                  </div>

                  <div>
                    <span className="font-bold text-rose-400 block mb-0.5">Žádné peníze na ruku:</span>
                    <span>Přej si konkrétní věc (Lego, knihu, hru) nebo zážitek. Přání ve formě samotné hotovosti nejsou povolená (máš kapesné).</span>
                  </div>

                  <div>
                    <span className="font-bold text-rose-400 block mb-0.5">Schválení rodičem:</span>
                    <span>Každé přání musí nejprve schválit rodič. Kolik XP bude pro splnění určí systém na základě spravedlivého algoritmu.</span>
                  </div>
                </div>

                <p className="text-center font-bold text-amber-400 text-sm pt-1 border-t border-white/5">
                  ✨ A to nejdůležitější na závěr. Svého cíle může dosáhnout každý.
                </p>
              </div>

              <button
                onClick={() => setShowRulesModal(false)}
                className="w-full py-2.5 rounded-lg bg-zinc-800 text-white font-bold text-xs hover:bg-zinc-700 transition-colors"
              >
                Rozumím
              </button>
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

      {/* ═══ CLAIM BATTLE PASS REWARD MODAL ═══ */}
      <AnimatePresence>
        {claimingMilestone && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setClaimingMilestone(null)} className="fixed inset-0 bg-black/60 z-[110]" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] max-w-sm bg-zinc-900 border border-emerald-500/20 rounded-2xl p-5 z-[110] space-y-4"
            >
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                {claimingMilestone.icon || "🎁"} Zvolit odměnu z Battle Passu
              </h3>
              <p className="text-xs text-zinc-400">
                Opravdu si chceš vybrat odměnu: <span className="font-extrabold text-white">„{claimingMilestone.title}“</span>?
              </p>
              <p className="text-[10px] text-zinc-500 italic leading-normal">
                Důležité upozornění: Výběrem této odměny se tvůj Battle Pass pro tento Sprint uzavře a již nebudeš moci čerpat další ani vyšší odměny. Tuto akci nelze vzít zpět!
              </p>
              <div className="flex gap-2">
                <button disabled={isClaiming} onClick={() => setClaimingMilestone(null)} className="flex-1 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-xs font-bold hover:bg-zinc-700 disabled:opacity-50 transition-colors cursor-pointer">
                  Zrušit
                </button>
                <button disabled={isClaiming} onClick={handleConfirmClaimBattlePass} className="flex-1 py-2 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-400 disabled:opacity-50 transition-colors cursor-pointer">
                  {isClaiming ? "Ukládám..." : "Potvrdit výběr"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ HERNÍ MODAL: SPRÁVA LIGY (tmavý GameHub design) ═══ */}
      <AnimatePresence>
        {showSpravModal && (
          <motion.div
            key="sprav-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-3 md:p-6"
            onClick={() => !spravConfirm.open && setShowSpravModal(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />

            {/* Modal box */}
            <motion.div
              key="sprav-box"
              initial={{ opacity: 0, scale: 0.92, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }}
              transition={{ type: 'spring', damping: 22, stiffness: 280 }}
              onClick={e => e.stopPropagation()}
              className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto bg-gradient-to-b from-zinc-900 to-zinc-950 rounded-2xl border border-white/10 shadow-2xl flex flex-col hide-scrollbar p-5 space-y-5"
            >
              <style>{`
                .hide-scrollbar::-webkit-scrollbar {
                  display: none !important;
                }
                .hide-scrollbar {
                  -ms-overflow-style: none !important;
                  scrollbar-width: none !important;
                }
              `}</style>

              {/* Header modalu */}
              <div className="relative flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-base shadow-lg shadow-indigo-500/30">
                    🛡️
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-white tracking-tight">Správa Ligy</h2>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Velitelský můstek</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSpravModal(false)}
                  className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Obsah modalu: Editor milníků */}
              <div className="space-y-4">
                {/* Nadpis a formulář */}
                <form onSubmit={handleSaveSpravMilestone} className="bg-zinc-950/60 p-4 rounded-xl border border-white/5 space-y-3">
                  <h4 className="font-bold text-zinc-200 text-xs uppercase tracking-wider">
                    {spravEditingMilestoneId ? "✏️ Upravit milník Battle Passu" : "➕ Přidat nový milník Battle Passu"}
                  </h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        value={spravMilestoneTitle}
                        onChange={(e) => setSpravMilestoneTitle(e.target.value)}
                        placeholder="Název milníku (např. Popcorn k filmu)..."
                        className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500"
                        required
                      />
                    </div>
                    <div className="flex gap-2">
                      <div className="relative">
                        <input
                          type="text"
                          value={spravMilestoneIcon}
                          onChange={(e) => setSpravMilestoneIcon(e.target.value)}
                          onFocus={() => {
                            if (window.innerWidth >= 1024) {
                              setShowEmojiPicker(true);
                            }
                          }}
                          placeholder="Ikona (např. 🍿)..."
                          className="w-14 text-center bg-zinc-900 border border-white/10 rounded-lg px-2 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500"
                          required
                        />
                        {showEmojiPicker && (
                          <>
                            {/* Backdrop overlay to dismiss popover when clicking outside */}
                            <div 
                              className="fixed inset-0 z-40 cursor-default" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowEmojiPicker(false);
                              }} 
                            />
                            {/* Absolutely positioned popover container */}
                            <div className="absolute left-0 mt-1.5 z-50 p-2 bg-zinc-950 border border-white/10 rounded-xl shadow-2xl shadow-black/80 w-[164px]">
                              <div className="grid grid-cols-4 gap-1.5">
                                {['🍿', '🥤', '🌙', '🍽️', '🎬', '🎮', '🎟️', '🎡', '🍬', '🍕', '🍦', '⛺', '🧸', '🎁', '🚀', '👑'].map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSpravMilestoneIcon(emoji);
                                      setShowEmojiPicker(false);
                                    }}
                                    className={cn(
                                      "w-8 h-8 flex items-center justify-center text-sm rounded-lg transition-all active:scale-[0.85] cursor-pointer hover:bg-zinc-800 hover:scale-110",
                                      spravMilestoneIcon === emoji
                                        ? "bg-indigo-500/20 border border-indigo-500/50 text-white shadow-lg shadow-indigo-500/10"
                                        : "border border-zinc-800 text-zinc-400 hover:text-white"
                                    )}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex-1 flex items-center gap-1.5 bg-zinc-900 border border-white/10 rounded-lg px-2 py-1">
                        <input
                          type="number"
                          value={spravMilestonePoints}
                          onChange={(e) => setSpravMilestonePoints(parseInt(e.target.value) || 0)}
                          placeholder="XP"
                          className="w-full text-center font-bold text-xs bg-transparent border-none text-white outline-none focus:ring-0"
                          min="0"
                          required
                        />
                        <span className="text-[10px] font-bold text-zinc-500 pr-1">XP</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <textarea
                      value={spravMilestoneDesc}
                      onChange={(e) => setSpravMilestoneDesc(e.target.value)}
                      placeholder="Stručný popis milníku pro dítě..."
                      className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500 h-14 resize-none"
                    />
                  </div>

                  <div className="flex gap-2 justify-end">
                    {spravEditingMilestoneId && (
                      <button
                        type="button"
                        onClick={() => {
                          setSpravEditingMilestoneId(null);
                          setSpravMilestoneTitle("");
                          setSpravMilestoneDesc("");
                          setSpravMilestonePoints(20);
                          setSpravMilestoneIcon("🎁");
                        }}
                        className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 bg-zinc-800 rounded-lg hover:bg-zinc-700 cursor-pointer transition-colors"
                      >
                        Zrušit
                      </button>
                    )}
                    <button
                      type="submit"
                      className="px-4 py-1.5 text-[10px] font-black text-white bg-indigo-500 rounded-lg hover:bg-indigo-400 shadow-md shadow-indigo-500/10 cursor-pointer transition-all active:scale-[0.98]"
                    >
                      {spravEditingMilestoneId ? "Aktualizovat" : "Přidat milník"}
                    </button>
                  </div>
                </form>

                {/* Seznam milníků */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <h4 className="font-bold text-zinc-400 text-[10px] uppercase tracking-wider">
                      Milníky v paměti ({spravMilestones.length})
                    </h4>
                    {spravUnsaved && (
                      <button
                        type="button"
                        onClick={handleSpravSave}
                        disabled={spravSaving}
                        className="px-2.5 py-1 text-[9px] font-black text-white bg-emerald-500 hover:bg-emerald-400 rounded-md shadow-lg shadow-emerald-500/10 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                      >
                        {spravSaving ? "Uklám..." : "💾 Uložit do Firestore"}
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5 max-h-40 overflow-y-auto hide-scrollbar">
                    {spravMilestones.map((m, idx) => (
                      <div key={m.id} className="bg-zinc-950/40 p-2.5 rounded-xl border border-white/5 flex justify-between items-center gap-3">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="text-xl shrink-0 filter drop-shadow select-none">{m.icon}</span>
                          <div className="min-w-0 flex-1 text-left">
                            <div className="font-bold text-xs text-white flex items-center gap-2">
                              <span className="truncate">{m.title}</span>
                              <span className="text-[9px] font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded shrink-0">
                                {m.pointsRequired} XP
                              </span>
                            </div>
                            <p className="text-[9px] text-zinc-500 truncate">{m.description || "Bez popisu."}</p>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleMoveSpravMilestone(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1 text-xs text-zinc-500 hover:text-white disabled:opacity-20 cursor-pointer"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveSpravMilestone(idx, 'down')}
                            disabled={idx === spravMilestones.length - 1}
                            className="p-1 text-xs text-zinc-500 hover:text-white disabled:opacity-20 cursor-pointer"
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditSpravMilestone(m)}
                            className="p-1 text-xs text-zinc-500 hover:text-indigo-400 cursor-pointer"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSpravMilestone(m.id)}
                            className="p-1 text-xs text-zinc-500 hover:text-rose-400 cursor-pointer"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Ovládací panel ligy (Dlaždice) */}
              <div className="border-t border-white/5 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-zinc-400 text-[10px] uppercase tracking-wider">🏆 Řízení ligy a reset cyklů</h4>
                  <div className="flex items-center gap-2">
                    {leagueConfig.status === 'running' && (
                      <span className="text-[9px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold px-2.5 py-0.5 rounded-full animate-pulse">🟢 Běží</span>
                    )}
                    {leagueConfig.status === 'paused' && (
                      <span className="text-[9px] bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold px-2.5 py-0.5 rounded-full">🟡 Pozastaveno</span>
                    )}
                    {leagueConfig.status === 'stopped' && (
                      <span className="text-[9px] bg-rose-500/15 border border-rose-500/30 text-rose-400 font-bold px-2.5 py-0.5 rounded-full">🔴 Zastaveno</span>
                    )}
                  </div>
                </div>

                {/* 3 velké dlaždice */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full mt-2">
                  {/* Tlačítko 1: Stav */}
                  {leagueConfig.status === 'running' ? (
                    <button
                      type="button"
                      onClick={() => openSpravConfirm('pause')}
                      className="h-24 rounded-2xl bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 hover:border-amber-500/30 text-amber-300 transition-all flex flex-col items-center justify-center gap-1.5 p-3 text-center cursor-pointer hover:scale-[1.02] active:scale-95"
                    >
                      <span className="text-2xl">⏸️</span>
                      <span className="font-black text-[11px] leading-tight uppercase tracking-wider">Pozastavit Ligu</span>
                      <span className="text-[8px] text-zinc-500 leading-normal">Pauza Maratonu i Sprintu</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openSpravConfirm(leagueConfig.status === 'paused' ? 'resume' : 'start')}
                      className="h-24 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 hover:border-emerald-500/30 text-emerald-300 transition-all flex flex-col items-center justify-center gap-1.5 p-3 text-center cursor-pointer hover:scale-[1.02] active:scale-95"
                    >
                      <span className="text-2xl">▶️</span>
                      <span className="font-black text-[11px] leading-tight uppercase tracking-wider">
                        {leagueConfig.status === 'paused' ? 'Obnovit Ligu' : 'Spustit Ligu'}
                      </span>
                      <span className="text-[8px] text-zinc-500 leading-normal">Pokračovat v hraní</span>
                    </button>
                  )}

                  {/* Tlačítko 2: Reset Sprintu */}
                  <button
                    type="button"
                    onClick={() => openSpravConfirm('reset_sprint')}
                    className="h-24 rounded-2xl bg-indigo-500/10 hover:bg-indigo-500/15 border border-indigo-500/20 hover:border-indigo-500/30 text-indigo-300 transition-all flex flex-col items-center justify-center gap-1.5 p-3 text-center cursor-pointer hover:scale-[1.02] active:scale-95"
                  >
                    <span className="text-2xl">🏁</span>
                    <span className="font-black text-[11px] leading-tight uppercase tracking-wider">Resetovat Sprint</span>
                    <span className="text-[8px] text-zinc-500 leading-normal">Vymaže pouze BP odměny</span>
                  </button>

                  {/* Tlačítko 3: Reset celého maratonu */}
                  <button
                    type="button"
                    onClick={() => openSpravConfirm('reset_league')}
                    className="h-24 rounded-2xl bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 hover:border-rose-500/30 text-rose-300 transition-all flex flex-col items-center justify-center gap-1.5 p-3 text-center cursor-pointer hover:scale-[1.02] active:scale-95"
                  >
                    <span className="text-2xl">⚠️</span>
                    <span className="font-black text-[11px] leading-tight uppercase tracking-wider">Resetovat Ligu</span>
                    <span className="text-[8px] text-zinc-500 leading-normal">Úplný start od nuly</span>
                  </button>
                </div>

                {/* Nastavení limitu maratonského přání */}
                <div className="border-t border-white/5 pt-4 space-y-2.5">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                      Limit maratonského přání (max Kč)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={tempMaxLimit}
                        onChange={e => setTempMaxLimit(e.target.value)}
                        className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500 w-full bg-zinc-900 text-white"
                        placeholder="Výchozí: 2500"
                        min="1"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const val = parseFloat(tempMaxLimit);
                          if (!isNaN(val) && val > 0) {
                            await setDoc(doc(db, 'settings', 'league_config'), {
                              maxWishLimitCZK: val
                            }, { merge: true }).catch(console.error);
                          }
                        }}
                        className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shrink-0"
                      >
                        Uložit limit
                      </button>
                    </div>
                    <p className="text-[9px] text-zinc-500 mt-1 leading-normal">
                      Při limitu {tempMaxLimit || 2500} Kč má 1 XP hodnotu {((parseFloat(tempMaxLimit) || 2500) / 500).toFixed(2)} Kč. Maximální hodnota přání (500 XP) odpovídá nastavené částce.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ INTERNÍ CONFIRM MODAL (Správa) ═══ */}
      <AnimatePresence>
        {spravConfirm.open && spravConfirm.type && (() => {
          const cfg = SPRAV_CONFIRM_CFG[spravConfirm.type];
          return (
            <motion.div
              key="sprav-confirm-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] flex items-center justify-center p-4"
              onClick={closeSpravConfirm}
            >
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
              <motion.div
                key="sprav-confirm-box"
                initial={{ opacity: 0, scale: 0.9, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 15 }}
                onClick={e => e.stopPropagation()}
                className="relative w-full max-w-sm bg-zinc-900 border border-white/10 rounded-2xl p-5 flex flex-col gap-4 text-center shadow-2xl"
              >
                <div className={`w-12 h-12 mx-auto rounded-xl flex items-center justify-center text-xl shadow-lg ${cfg.danger ? 'bg-rose-500/20 border border-rose-500/30 text-rose-400' : 'bg-indigo-500/20 border border-indigo-500/30 text-indigo-400'}`}>
                  {cfg.icon}
                </div>
                <div className="space-y-1.5">
                  <h4 className={`text-sm font-black uppercase tracking-wider ${cfg.danger ? 'text-rose-400' : 'text-zinc-200'}`}>{cfg.title}</h4>
                  <p className="text-xs text-zinc-400 leading-relaxed font-medium">{cfg.desc}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={closeSpravConfirm} className="flex-1 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-bold text-xs transition-all cursor-pointer">
                    Zrušit
                  </button>
                  <button onClick={executeSpravAction} className={`flex-1 py-2 rounded-xl font-black text-xs text-white transition-all cursor-pointer active:scale-[0.97] ${cfg.danger ? 'bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 shadow-lg shadow-rose-600/10' : 'bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-500 hover:to-violet-600 shadow-lg shadow-indigo-600/10'}`}>
                    {cfg.btnLabel}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </motion.div>
  );
}
