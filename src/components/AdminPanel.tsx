import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Bot, Shield, AlertCircle, CheckCircle, Database, Bike } from "lucide-react";
import { db } from "../firebase";
import { collection, query, orderBy, limit, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { cn } from "../lib/utils";
import { UserProfile, UserRole } from "../types";

interface AdminLog {
  id: string;
  timestamp: any;
  type: 'SUCCESS' | 'ERROR' | 'LIMIT' | 'SCRAPER';
  message: string;
  details?: any;
}

interface AdminPanelProps {
  onClose: () => void;
  userProfiles: Record<string, UserProfile>;
  updateUserRole: (userId: string, role: UserRole) => void;
  updateUserAdminAlias: (userId: string, alias: string) => void;
  toggleUserBlocked: (userId: string, currentBlocked: boolean) => void;
  handleGenerateInspirations: () => void;
  isGeneratingInspiration: boolean;
  handleApproveBikeRoute: (id: string) => void;
}

export default function AdminPanel({
  onClose,
  userProfiles,
  updateUserRole,
  updateUserAdminAlias,
  toggleUserBlocked,
  handleGenerateInspirations,
  isGeneratingInspiration,
  handleApproveBikeRoute
}: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<"logs" | "users" | "actions" | "rewards">("logs");
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [rewards, setRewards] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [sprintXPThreshold, setSprintXPThreshold] = useState<number>(80);
  const [rewardTitle, setRewardTitle] = useState("");
  const [rewardDesc, setRewardDesc] = useState("");
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'admin_logs'), orderBy('timestamp', 'desc'), limit(15));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AdminLog[];
      setLogs(data);
    });

    const unsubRewards = onSnapshot(
      collection(db, 'sprintRewards'),
      (snap) => {
        setRewards(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    const unsubClaims = onSnapshot(
      query(collection(db, 'rewardClaims'), orderBy('claimedAt', 'desc')),
      (snap) => {
        setClaims(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    const unsubConfig = onSnapshot(
      doc(db, 'settings', 'league_config'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSprintXPThreshold(data.sprintXPThreshold !== undefined ? data.sprintXPThreshold : 80);
        }
      }
    );

    return () => {
      unsubscribe();
      unsubRewards();
      unsubClaims();
      unsubConfig();
    };
  }, []);

  const handleSaveThreshold = async (val: number) => {
    setSprintXPThreshold(val);
    try {
      await setDoc(doc(db, 'settings', 'league_config'), { sprintXPThreshold: val }, { merge: true });
    } catch (err) {
      console.error("Failed to save threshold:", err);
    }
  };

  const handleSaveReward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rewardTitle.trim()) return;

    try {
      if (editingRewardId) {
        await updateDoc(doc(db, 'sprintRewards', editingRewardId), {
          title: rewardTitle.trim(),
          description: rewardDesc.trim()
        });
        setEditingRewardId(null);
      } else {
        await addDoc(collection(db, 'sprintRewards'), {
          title: rewardTitle.trim(),
          description: rewardDesc.trim(),
          createdAt: serverTimestamp()
        });
      }
      setRewardTitle("");
      setRewardDesc("");
    } catch (err) {
      console.error("Failed to save reward:", err);
    }
  };

  const handleEditReward = (reward: any) => {
    setEditingRewardId(reward.id);
    setRewardTitle(reward.title);
    setRewardDesc(reward.description || "");
  };

  const handleDeleteReward = async (id: string) => {
    if (!window.confirm("Opravdu chceš smazat tuto odměnu?")) return;
    try {
      await deleteDoc(doc(db, 'sprintRewards', id));
    } catch (err) {
      console.error("Failed to delete reward:", err);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "";
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return d.toLocaleString("cs-CZ");
  };

  const getLogIcon = (type: string) => {
    switch(type) {
      case 'SUCCESS': return <CheckCircle className="text-emerald-500" size={16} />;
      case 'ERROR': return <AlertCircle className="text-rose-500" size={16} />;
      case 'LIMIT': return <AlertCircle className="text-amber-500" size={16} />;
      case 'SCRAPER': return <Database className="text-indigo-500" size={16} />;
      default: return <AlertCircle className="text-stone-500" size={16} />;
    }
  };

  return (
    <>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-[70] transition-opacity"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[95%] max-w-2xl h-[600px] bg-white rounded-[24px] p-6 shadow-2xl z-[70] flex flex-col gap-4 border-2 border-stone-100"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-stone-800 tracking-tight flex items-center gap-2">
            <Shield className="text-indigo-500" /> Admin Hub
          </h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 bg-stone-100 p-2 rounded-full cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-4 border-b border-stone-100 pb-2">
          <button 
            onClick={() => setActiveTab("logs")}
            className={cn("px-4 py-2 font-bold text-sm rounded-lg transition-colors", activeTab === "logs" ? "bg-indigo-50 text-indigo-600" : "text-stone-500 hover:bg-stone-50")}
          >
            Logy (Firestore)
          </button>
          <button 
            onClick={() => setActiveTab("users")}
            className={cn("px-4 py-2 font-bold text-sm rounded-lg transition-colors", activeTab === "users" ? "bg-indigo-50 text-indigo-600" : "text-stone-500 hover:bg-stone-50")}
          >
            Správa Uživatelů
          </button>
          <button 
            onClick={() => setActiveTab("rewards")}
            className={cn("px-4 py-2 font-bold text-sm rounded-lg transition-colors", activeTab === "rewards" ? "bg-indigo-50 text-indigo-600" : "text-stone-500 hover:bg-stone-50")}
          >
            Sprint Odměny
          </button>
          <button 
            onClick={() => setActiveTab("actions")}
            className={cn("px-4 py-2 font-bold text-sm rounded-lg transition-colors", activeTab === "actions" ? "bg-indigo-50 text-indigo-600" : "text-stone-500 hover:bg-stone-50")}
          >
            Akce
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 min-h-[300px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {activeTab === "logs" && (
            <div className="flex flex-col gap-2">
              {(logs || []).length === 0 ? (
                <div className="text-stone-400 text-center py-8">Zatím žádné logy.</div>
              ) : (
                (logs || []).map(log => (
                  <div key={log.id} className="bg-stone-50 p-3 rounded-xl border border-stone-100 flex flex-col gap-1 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-stone-700">
                        {getLogIcon(log.type)} {log.type}
                      </div>
                      <div className="text-xs text-stone-400">{formatDate(log.timestamp)}</div>
                    </div>
                    <div className="text-stone-600">{log.message}</div>
                    {log.details && (
                      <pre className="mt-2 text-xs bg-stone-800 text-stone-200 p-2 rounded-lg overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "actions" && (
            <div className="flex flex-col gap-4">
              <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 flex flex-col gap-3">
                <div className="font-bold text-indigo-800 flex items-center gap-2">
                  <Bot size={20} /> Manuální spuštění AI Agent
                </div>
                <p className="text-sm text-indigo-600">
                  Vygeneruje nové víkendové tipy. Původní tipy budou přepsány. Provede se scraping a následné volání Gemini API.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button 
                    onClick={() => {
                      try {
                        handleGenerateInspirations();
                      } catch (err) {
                        console.error("Chyba při spouštění AI generátoru:", err);
                      }
                    }}
                    disabled={!!isGeneratingInspiration}
                    className="mt-2 px-6 py-3 rounded-xl bg-indigo-500 text-white font-bold text-sm shadow-sm hover:bg-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 transition-all cursor-pointer"
                  >
                    {isGeneratingInspiration ? (
                      <>
                        <svg className="animate-spin w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Generuji tipy...
                      </>
                    ) : 'Vygenerovat tipy NYNÍ'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "users" && (
            <div className="w-full text-left">
              <div className="hidden md:grid grid-cols-[1fr_120px_180px] gap-4 border-b border-stone-100 pb-3 px-3 text-[11px] uppercase tracking-wider text-stone-400 font-bold">
                <div>Uživatel</div>
                <div className="text-center">Role</div>
                <div>Oprávnění a akce</div>
              </div>
              
              <div className="flex flex-col mt-2 gap-3">
                {Object.values(userProfiles || {}).map((profile) => (
                  <div 
                    key={profile.id} 
                    className={cn(
                      "flex flex-col gap-3 p-4 border border-stone-100 rounded-2xl transition-all shadow-sm bg-white hover:shadow-md",
                      "md:flex-row md:items-center md:justify-between md:py-3 md:px-3 md:gap-4 md:border-b md:border-t-0 md:border-x-0 md:rounded-none md:shadow-none md:hover:bg-stone-50/50",
                      profile.isBlocked && "bg-stone-50 border-stone-200 grayscale-[0.2]"
                    )}
                  >
                    {/* 1. Profilová vizitka (Avatar + Jméno + Email) */}
                    <div className="flex items-center gap-3 min-w-[200px] flex-1">
                      <div className={cn(
                        "w-10 h-10 rounded-full overflow-hidden bg-stone-100 flex items-center justify-center flex-shrink-0 border",
                        profile.isBlocked ? "border-stone-300 opacity-70" : "border-stone-200"
                      )}>
                        {profile.avatar?.startsWith('http') || profile.avatar?.startsWith('data:') ? (
                          <img src={profile.avatar} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-lg leading-none">{profile.avatar || "👤"}</span>
                        )}
                      </div>
                      <div className="flex flex-col w-full min-w-0">
                        <input 
                          type="text"
                          defaultValue={profile.adminAlias || profile.displayName || profile.email?.split('@')[0]}
                          onBlur={(e) => {
                            if (e.target.value !== (profile.adminAlias || profile.displayName || profile.email?.split('@')[0])) {
                              updateUserAdminAlias(profile.id!, e.target.value);
                            }
                          }}
                          className={cn(
                            "font-bold text-sm bg-transparent border-b border-transparent focus:outline-none transition-colors w-full focus:border-indigo-400 focus:bg-stone-50 px-1 rounded",
                            profile.isBlocked ? "text-stone-500" : "text-stone-700 hover:border-stone-200"
                          )}
                          title="Soukromé jméno pro admina"
                          disabled={profile.isBlocked}
                        />
                        <div className="text-[10px] text-stone-400 truncate px-1">
                          {profile.email}
                        </div>
                        {/* Zobrazení uplatněných odměn */}
                        {claims.filter(c => c.userId === profile.id).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1 px-1">
                            {claims.filter(c => c.userId === profile.id).map(c => (
                              <span key={c.id} className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-black border border-amber-100" title={formatDate(c.claimedAt)}>
                                🎁 {c.rewardTitle} ({c.sprintId?.replace('sprint_', 'S')})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 2. Volba Role */}
                    {!profile.isBlocked ? (
                      <div className="flex flex-col md:items-center w-full md:w-[120px]">
                        <span className="text-[9px] uppercase font-black text-stone-400 tracking-wider mb-1 md:hidden">Role</span>
                        <select
                          value={profile.role || 'viewer'}
                          onChange={(e) => updateUserRole(profile.id!, e.target.value as UserRole)}
                          className="w-full text-xs font-bold bg-stone-100 text-stone-700 border-none rounded-xl px-3 py-2.5 md:py-1.5 focus:ring-2 focus:ring-indigo-100 cursor-pointer"
                        >
                          <option value="admin">Admin</option>
                          <option value="parent">Rodič</option>
                          <option value="child">Dítě</option>
                          <option value="viewer">Divák</option>
                        </select>
                      </div>
                    ) : null}

                    {/* 3. Oprávnění & Akce */}
                    {!profile.isBlocked ? (
                      <div className="flex flex-col gap-2 w-full md:w-[180px]">
                        <span className="text-[9px] uppercase font-black text-stone-400 tracking-wider md:hidden">Oprávnění</span>
                        <div className="flex gap-1 flex-wrap">
                          {profile.permissions?.canSuggest && <span className="text-[9px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded font-bold border border-green-100">Tvořit</span>}
                          {profile.permissions?.canComment && <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold border border-blue-100">Komentovat</span>}
                          {profile.permissions?.canApprove && <span className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-bold border border-purple-100">Schvalovat</span>}
                        </div>
                        {profile.role !== 'admin' && (
                          <button 
                            onClick={() => toggleUserBlocked(profile.id!, !!profile.isBlocked)}
                            className="text-[10px] font-bold text-rose-500 hover:text-rose-600 self-start px-2 py-1 border border-rose-100 hover:bg-rose-50 rounded-lg transition-colors mt-1 md:mt-0 cursor-pointer"
                          >
                            Zablokovat přístup
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-[316px] border-t border-stone-100 pt-2.5 md:border-none md:pt-0">
                        <span className="text-xs font-bold text-rose-500 bg-rose-50 px-2 py-1 rounded-md border border-rose-100">
                          Zablokováno
                        </span>
                        <button 
                          onClick={() => toggleUserBlocked(profile.id!, !!profile.isBlocked)}
                          className="text-xs font-bold text-indigo-500 hover:text-indigo-600 bg-white border border-stone-200 px-3 py-1.5 rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
                        >
                          Odblokovat
                        </button>
                      </div>
                    )}

                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "rewards" && (
            <div className="space-y-6">
              {/* Nastavení Hranice XP */}
              <div className="bg-zinc-50 p-4 rounded-xl border border-stone-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h4 className="font-bold text-stone-800 text-sm">Hranice XP pro Sprint</h4>
                  <p className="text-xs text-stone-500">Kolik XP musí dítě v aktuálním Sprintu získat, aby si mohlo vybrat odměnu.</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={sprintXPThreshold}
                    onChange={(e) => handleSaveThreshold(parseInt(e.target.value) || 0)}
                    className="w-20 px-3 py-1.5 text-center font-bold text-sm bg-white border border-stone-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 focus:bg-stone-50"
                  />
                  <span className="text-xs font-black text-stone-500">XP</span>
                </div>
              </div>

              {/* Formulář pro Přidání / Úpravu */}
              <form onSubmit={handleSaveReward} className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100/50 space-y-3">
                <h4 className="font-bold text-indigo-900 text-xs uppercase tracking-wider">
                  {editingRewardId ? "✏️ Upravit odměnu" : "➕ Přidat novou odměnu"}
                </h4>
                <div className="grid grid-cols-1 gap-2.5">
                  <input
                    type="text"
                    value={rewardTitle}
                    onChange={(e) => setRewardTitle(e.target.value)}
                    placeholder="Název odměny (např. Týden bez mytí nádobí)..."
                    className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-xs text-stone-800 outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-stone-50"
                    required
                  />
                  <textarea
                    value={rewardDesc}
                    onChange={(e) => setRewardDesc(e.target.value)}
                    placeholder="Stručný popis nebo pravidla odměny..."
                    className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-xs text-stone-800 outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-stone-50 h-16 resize-none"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  {editingRewardId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRewardId(null);
                        setRewardTitle("");
                        setRewardDesc("");
                      }}
                      className="px-3 py-1.5 text-xs font-bold text-stone-500 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 cursor-pointer"
                    >
                      Zrušit
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 shadow-sm cursor-pointer"
                  >
                    {editingRewardId ? "Uložit změny" : "Přidat odměnu"}
                  </button>
                </div>
              </form>

              {/* Seznam Odměn */}
              <div className="space-y-2">
                <h4 className="font-bold text-stone-700 text-xs uppercase tracking-wider">Seznam vytvořených odměn ({rewards.length})</h4>
                {rewards.length === 0 ? (
                  <div className="text-stone-400 text-center py-4 text-xs italic">Zatím nebyly vytvořeny žádné sprint odměny.</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {rewards.map((r) => (
                      <div key={r.id} className="bg-white p-3 rounded-xl border border-stone-200 flex justify-between items-start gap-2 shadow-sm">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-xs text-stone-800 truncate flex items-center gap-1.5">
                            <span>🎁</span> {r.title}
                          </div>
                          <p className="text-[10px] text-stone-500 mt-0.5 line-clamp-2">{r.description || "Bez popisu."}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleEditReward(r)}
                            className="p-1 text-stone-400 hover:text-indigo-600 hover:bg-stone-50 rounded cursor-pointer"
                            title="Upravit"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteReward(r.id)}
                            className="p-1 text-stone-400 hover:text-rose-600 hover:bg-stone-50 rounded cursor-pointer"
                            title="Smazat"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Log uplatněných odměn */}
              <div className="space-y-2 pt-4 border-t border-stone-100">
                <h4 className="font-bold text-stone-700 text-xs uppercase tracking-wider">Uplatněné odměny dětí</h4>
                {claims.length === 0 ? (
                  <div className="text-stone-400 text-center py-4 text-xs italic">Zatím nikdo neuplatnil žádnou odměnu.</div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
                    {claims.map((c) => (
                      <div key={c.id} className="bg-stone-50/50 p-2.5 rounded-xl border border-stone-100 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-stone-800">{c.userName}</span>
                          <span className="text-stone-500"> si vybral(a) </span>
                          <span className="font-bold text-indigo-600">{c.rewardTitle}</span>
                        </div>
                        <div className="text-[10px] text-stone-400 flex flex-col items-end shrink-0">
                          <span>{c.sprintId?.replace('sprint_', 'Sprint ')}</span>
                          <span>{formatDate(c.claimedAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
