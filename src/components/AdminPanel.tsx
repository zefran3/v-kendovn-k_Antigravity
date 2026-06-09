import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Bot, Shield, AlertCircle, CheckCircle, Database, Bike } from "lucide-react";
import { db } from "../firebase";
import { collection, query, orderBy, limit, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc } from "firebase/firestore";
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
  updateUserTargetGroup: (userId: string, targetGroup: 'pro_dceru' | 'pro_syna' | 'pro_vsechny') => void;
  updateUserBirthYear: (userId: string, birthYear: number) => void;
  toggleUserBlocked: (userId: string, currentBlocked: boolean) => void;
  handleGenerateInspirations: () => void;
  isGeneratingInspiration: boolean;
  handleApproveBikeRoute: (id: string) => void;
  currentUserRole?: string;
  isDemoMode?: boolean;
  onToggleDemoMode?: () => void;
  onCleanupSandbox?: () => void;
}

export default function AdminPanel({
  onClose,
  userProfiles,
  updateUserRole,
  updateUserAdminAlias,
  updateUserTargetGroup,
  updateUserBirthYear,
  toggleUserBlocked,
  handleGenerateInspirations,
  isGeneratingInspiration,
  handleApproveBikeRoute,
  currentUserRole,
  isDemoMode = false,
  onToggleDemoMode,
  onCleanupSandbox
}: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<"logs" | "users" | "actions">("users");
  const [logs, setLogs] = useState<AdminLog[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'admin_logs'), orderBy('timestamp', 'desc'), limit(15));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AdminLog[];
      setLogs(data);
    });

    return () => {
      unsubscribe();
    };
  }, []);



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
            onClick={() => setActiveTab("users")}
            className={cn("px-4 py-2 font-bold text-sm rounded-lg transition-colors", activeTab === "users" ? "bg-indigo-50 text-indigo-600" : "text-stone-500 hover:bg-stone-50")}
          >
            Správa Uživatelů
          </button>
          <button 
            onClick={() => setActiveTab("logs")}
            className={cn("px-4 py-2 font-bold text-sm rounded-lg transition-colors", activeTab === "logs" ? "bg-indigo-50 text-indigo-600" : "text-stone-500 hover:bg-stone-50")}
          >
            Logy
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
              {/* AI Agent Section */}
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

              {/* Testovací Sandbox Section */}
              <div className="bg-violet-50 p-6 rounded-2xl border border-violet-100 flex flex-col gap-3">
                <div className="font-bold text-violet-800 flex items-center gap-2">
                  <Bot size={20} className="text-violet-500" /> Testovací Sandbox (Demo Dítě)
                </div>
                <p className="text-sm text-violet-600">
                  Přepne aplikaci do testovacího režimu. Budete moci testovat rozhraní pro děti, GameHub, Wishlist a sbírání bodů pod virtuálním profilem <strong>Demo Dítě</strong>.
                </p>
                <div className="flex flex-wrap gap-3 mt-2">
                  <button 
                    onClick={() => {
                      onToggleDemoMode?.();
                      onClose();
                    }}
                    className={cn(
                      "px-6 py-3 rounded-xl font-bold text-sm shadow-sm transition-all cursor-pointer",
                      isDemoMode 
                        ? "bg-stone-600 text-white hover:bg-stone-700" 
                        : "bg-violet-600 text-white hover:bg-violet-700 hover:shadow-md"
                    )}
                  >
                    {isDemoMode ? "Ukončit Sandbox" : "Vstoupit do Sandboxu"}
                  </button>

                  <button 
                    onClick={() => {
                      if (window.confirm("Opravdu chcete trvale smazat všechny testovací stopy (návrhy a přání) po Demo Dítěti?")) {
                        onCleanupSandbox?.();
                        onClose();
                      }
                    }}
                    className="px-6 py-3 rounded-xl bg-rose-500 text-white font-bold text-sm shadow-sm hover:bg-rose-600 hover:shadow-md transition-all cursor-pointer"
                  >
                    🧹 Uklidit sandbox
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
                      </div>
                    </div>

                    {/* 2. Volba Role + TargetGroup + BirthYear */}
                    {!profile.isBlocked ? (
                      <div className="flex flex-col gap-2 md:items-start w-full md:w-[140px]">
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
                        {/* Dropdown targetGroup + input rok narození — pouze pro roli child */}
                        {profile.role === 'child' && (
                          <>
                            <select
                              value={profile.targetGroup || 'pro_vsechny'}
                              onChange={(e) => updateUserTargetGroup(profile.id!, e.target.value as 'pro_dceru' | 'pro_syna' | 'pro_vsechny')}
                              className="w-full text-xs font-bold bg-pink-50 text-pink-700 border border-pink-100 rounded-xl px-3 py-1.5 focus:ring-2 focus:ring-pink-100 cursor-pointer"
                              title="Které AI tipy toto dítě uvidí"
                            >
                              <option value="pro_vsechny">👨‍👩‍👧‍👦 Vše</option>
                              <option value="pro_dceru">👧 Jen pro dceru</option>
                              <option value="pro_syna">👦 Jen pro syna</option>
                            </select>
                            <div className="flex items-center gap-1 w-full">
                              <span className="text-[9px] text-stone-400 whitespace-nowrap">🎂 nar.</span>
                              <input
                                type="number"
                                min={1990}
                                max={new Date().getFullYear()}
                                defaultValue={profile.birthYear || ''}
                                placeholder="rok"
                                onBlur={(e) => {
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val !== profile.birthYear) {
                                    updateUserBirthYear(profile.id!, val);
                                  }
                                }}
                                className="w-full text-xs bg-amber-50 text-amber-700 border border-amber-100 rounded-xl px-2 py-1.5 focus:ring-2 focus:ring-amber-100 focus:outline-none"
                                title="Rok narození — věk se počítá automaticky"
                              />
                            </div>
                            {!profile.birthYear && (
                              <div className="text-[9px] text-red-500 font-bold leading-tight mt-1 select-none">
                                ⚠️ Chybí rok narození (AI použije výchozí věk)
                              </div>
                            )}
                          </>
                        )}
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
        </div>
      </motion.div>


    </>
  );
}
