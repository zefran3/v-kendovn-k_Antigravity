import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Bot, Shield, AlertCircle, CheckCircle, Database, Bike, AlertTriangle, Trash2 } from "lucide-react";
import { db, auth } from "../firebase";
import { collection, query, orderBy, limit, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc } from "firebase/firestore";
import { cn } from "../lib/utils";
import { UserProfile, UserRole, ActivitySuggestion } from "../types";



interface AdminLog {
  id: string;
  timestamp: any;
  type: 'SUCCESS' | 'ERROR' | 'LIMIT' | 'SCRAPER';
  message: string;
  details?: any;
}

interface KnownLocation {
  id: string;
  name: string;
  keywords: string[];
  exactLocation: string;
  exactUrl: string;
  isVyskov?: boolean;
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
  canManageSystem?: boolean;
  suggestions?: ActivitySuggestion[];
  onResetApplication?: () => Promise<void>;
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
  onCleanupSandbox,
  canManageSystem = false,
  suggestions = [],
  onResetApplication
}: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<"logs" | "users" | "actions" | "locations">("users");
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [locations, setLocations] = useState<KnownLocation[]>([]);
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);

  // Form states
  const [locName, setLocName] = useState("");
  const [locKeywords, setLocKeywords] = useState("");
  const [locExactLocation, setLocExactLocation] = useState("");
  const [locExactUrl, setLocExactUrl] = useState("");
  const [locIsVyskov, setLocIsVyskov] = useState(false);
  const [locError, setLocError] = useState("");

  const fetchLocations = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      const response = await fetch(`/api/locations?uid=${uid}`);
      if (response.ok) {
        const data = await response.json();
        data.sort((a: any, b: any) => a.name.localeCompare(b.name));
        setLocations(data);
      } else {
        console.error("Chyba při načítání lokací přes API:", response.statusText);
      }
    } catch (err) {
      console.error("Chyba při načítání lokací:", err);
    }
  };

  useEffect(() => {
    fetchLocations();
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        fetchLocations();
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locName.trim() || !locExactLocation.trim()) {
      setLocError("Název a Adresa jsou povinné.");
      return;
    }

    const keywordsArray = locKeywords
      .split(",")
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 0);

    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLocError("Uživatel není přihlášen.");
      return;
    }

    const locData = {
      uid,
      name: locName.trim(),
      keywords: keywordsArray,
      exactLocation: locExactLocation.trim(),
      exactUrl: locExactUrl.trim(),
      isVyskov: locIsVyskov
    };

    try {
      if (editingLocationId) {
        const res = await fetch(`/api/locations/${editingLocationId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(locData)
        });
        if (!res.ok) throw new Error(await res.text());
      } else {
        const res = await fetch(`/api/locations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(locData)
        });
        if (!res.ok) throw new Error(await res.text());
      }
      resetLocForm();
      await fetchLocations();
    } catch (err: any) {
      console.error("Chyba při ukládání známého místa:", err);
      setLocError("Chyba při ukládání: " + err.message);
    }
  };

  const handleEditLocation = (loc: KnownLocation) => {
    setEditingLocationId(loc.id);
    setLocName(loc.name);
    setLocKeywords(loc.keywords.join(", "));
    setLocExactLocation(loc.exactLocation);
    setLocExactUrl(loc.exactUrl);
    setLocIsVyskov(!!loc.isVyskov);
    setIsAddingLocation(true);
    setLocError("");

    // Smooth scroll back to the top where the edit form is
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleDeleteLocation = async (id: string) => {
    if (window.confirm("Opravdu chcete toto známé místo smazat?")) {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      try {
        const res = await fetch(`/api/locations/${id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid })
        });
        if (!res.ok) throw new Error(await res.text());
        await fetchLocations();
      } catch (err) {
        console.error("Chyba při mazání:", err);
      }
    }
  };

  const resetLocForm = () => {
    setLocName("");
    setLocKeywords("");
    setLocExactLocation("");
    setLocExactUrl("");
    setLocIsVyskov(false);
    setIsAddingLocation(false);
    setEditingLocationId(null);
    setLocError("");
  };

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
          <button 
            onClick={() => setActiveTab("locations")}
            className={cn("px-4 py-2 font-bold text-sm rounded-lg transition-colors", activeTab === "locations" ? "bg-indigo-50 text-indigo-600" : "text-stone-500 hover:bg-stone-50")}
          >
            Správa Míst
          </button>
        </div>

        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-2 min-h-[300px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
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

              {/* Reset Aplikace Section */}
              {canManageSystem && (
                <div className="bg-rose-50 p-6 rounded-2xl border border-rose-100 flex flex-col gap-3">
                  <div className="font-bold text-rose-800 flex items-center gap-2">
                    <AlertTriangle className="text-rose-500" size={20} /> Reset Aplikace pro nové použití
                  </div>
                  <p className="text-sm text-rose-600">
                    Tato akce vymaže všechny aktivní návrhy a plánované aktivity na nástěnce (celkem <strong>{
                      (suggestions || []).filter(s => {
                        if (s.status === "cancelled") return false;
                        if (s.status === "approved" && s.eventDate) {
                          const eventStart = s.eventTime ? new Date(`${s.eventDate}T${s.eventTime}`) : new Date(`${s.eventDate}T00:00`);
                          if (!isNaN(eventStart.getTime()) && eventStart <= new Date()) return false;
                        }
                        return true;
                      }).length
                    }</strong>). Tato operace se <strong>netýká</strong> Historie a archivu (minulé dokončené akce a zrušené akce zůstanou zachovány).
                  </p>
                  <div className="flex flex-wrap gap-3 mt-2">
                    <button 
                      onClick={() => setIsResetConfirmOpen(true)}
                      className="px-6 py-3 rounded-xl bg-rose-500 text-white font-bold text-sm shadow-sm hover:bg-rose-600 hover:shadow-md transition-all cursor-pointer flex items-center gap-2"
                    >
                      <Trash2 size={16} /> Resetovat aplikaci...
                    </button>
                  </div>
                </div>
              )}
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

          {activeTab === "locations" && (
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center bg-stone-50 p-4 rounded-2xl border border-stone-100">
                <div className="pr-2">
                  <div className="font-bold text-stone-800 text-sm">Správa známých míst a ověřených URL</div>
                  <p className="text-[11px] text-stone-500 mt-1 leading-relaxed">
                    Zde spravujete adresy a weby pro opakující se akce. Server při generování AI tipů automaticky nahradí vygenerovanou adresu a URL podle klíčových slov.
                  </p>
                </div>
                {!isAddingLocation && (
                  <button
                    onClick={() => {
                      resetLocForm();
                      setIsAddingLocation(true);
                      if (scrollContainerRef.current) {
                        scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
                      }
                    }}
                    className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs rounded-xl shadow-sm cursor-pointer whitespace-nowrap animate-none"
                  >
                    Přidat místo
                  </button>
                )}
              </div>

              {isAddingLocation ? (
                <form onSubmit={handleSaveLocation} className="bg-stone-50 p-5 rounded-2xl border border-stone-100 flex flex-col gap-3 text-sm">
                  <div className="font-bold text-stone-700">{editingLocationId ? "Upravit místo" : "Nové známé místo"}</div>
                  
                  {locError && <div className="text-xs text-rose-500 font-bold">{locError}</div>}
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-stone-500 uppercase">Název místa</label>
                      <input 
                        type="text" 
                        value={locName} 
                        onChange={e => setLocName(e.target.value)} 
                        placeholder="ZOO Zlín - Lešná"
                        className="bg-white border border-stone-200 rounded-xl px-3 py-2 text-stone-700 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
                      />
                    </div>
                    
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-stone-500 uppercase">Klíčová slova (oddělená čárkou)</label>
                      <input 
                        type="text" 
                        value={locKeywords} 
                        onChange={e => setLocKeywords(e.target.value)} 
                        placeholder="zoo zlin, zoo lesna, lesna"
                        className="bg-white border border-stone-200 rounded-xl px-3 py-2 text-stone-700 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-stone-500 uppercase">Přesná adresa</label>
                    <input 
                      type="text" 
                      value={locExactLocation} 
                      onChange={e => setLocExactLocation(e.target.value)} 
                      placeholder="ZOO Zlín - Lešná, Lukovská 112, Zlín"
                      className="bg-white border border-stone-200 rounded-xl px-3 py-2 text-stone-700 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-stone-500 uppercase">Oficiální webová URL</label>
                      <input 
                        type="text" 
                        value={locExactUrl} 
                        onChange={e => setLocExactUrl(e.target.value)} 
                        placeholder="https://www.zoozlin.eu"
                        className="bg-white border border-stone-200 rounded-xl px-3 py-2 text-stone-700 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1 justify-end">
                      <label className="flex items-center gap-2 cursor-pointer py-2 text-xs font-bold text-stone-600 select-none">
                        <input 
                          type="checkbox" 
                          checked={locIsVyskov} 
                          onChange={e => setLocIsVyskov(e.target.checked)}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-stone-300"
                        />
                        <span>Přímo ve Vyškově</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end mt-2">
                    <button 
                      type="button" 
                      onClick={resetLocForm}
                      className="px-4 py-2 border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 font-bold text-xs rounded-xl shadow-sm cursor-pointer"
                    >
                      Zrušit
                    </button>
                    <button 
                      type="submit" 
                      className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs rounded-xl shadow-sm cursor-pointer"
                    >
                      {editingLocationId ? "Uložit změny" : "Vytvořit lokaci"}
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="flex flex-col mt-2 gap-3 pb-8">
                {locations.length === 0 ? (
                  <div className="text-stone-400 text-center py-8">Zatím žádné uložené lokace.</div>
                ) : (
                  locations.map(loc => (
                    <div key={loc.id} className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm hover:shadow transition-shadow flex flex-col gap-2 text-left">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-extrabold text-stone-800 text-sm flex items-center gap-2">
                            {loc.name} {loc.isVyskov && <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded font-bold">🏰 Vyškov</span>}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {loc.keywords.map((kw, i) => (
                              <span key={i} className="text-[9px] bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded border border-stone-200/50">
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleEditLocation(loc)}
                            className="text-xs font-bold text-indigo-500 hover:text-indigo-600 bg-indigo-50/50 hover:bg-indigo-50 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                          >
                            Upravit
                          </button>
                          <button 
                            onClick={() => handleDeleteLocation(loc.id)}
                            className="text-xs font-bold text-rose-500 hover:text-rose-600 bg-rose-50/50 hover:bg-rose-50 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                          >
                            Smazat
                          </button>
                        </div>
                      </div>
                      
                      <div className="text-xs text-stone-600 flex flex-col gap-1 border-t border-stone-50 pt-2 mt-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-stone-400 w-16">Adresa:</span>
                          <span className="font-medium text-stone-700 truncate" title={loc.exactLocation}>{loc.exactLocation}</span>
                        </div>
                        {loc.exactUrl && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-stone-400 w-16">Web:</span>
                            <a href={loc.exactUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-500 hover:underline truncate" title={loc.exactUrl}>
                              {loc.exactUrl}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {isResetConfirmOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsResetConfirmOpen(false);
                setResetConfirmText("");
              }}
              className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-[80] transition-opacity"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md bg-white rounded-2xl p-6 shadow-2xl z-[80] border border-stone-100 flex flex-col gap-4 text-left"
            >
              <div className="flex items-center gap-2 text-rose-600 font-extrabold text-lg">
                <AlertTriangle size={24} /> Varování: Reset Aplikace
              </div>
              
              <p className="text-sm text-stone-600 leading-relaxed">
                Opravdu chcete vymazat všechny aktivní aktivity a AI tipy z aplikace a připravit ji na nové použití? 
                Tato akce je <strong>nevratná</strong> a smaže celkem <strong>{
                  (suggestions || []).filter(s => {
                    if (s.status === "cancelled") return false;
                    if (s.status === "approved" && s.eventDate) {
                      const eventStart = s.eventTime ? new Date(`${s.eventDate}T${s.eventTime}`) : new Date(`${s.eventDate}T00:00`);
                      if (!isNaN(eventStart.getTime()) && eventStart <= new Date()) return false;
                    }
                    return true;
                  }).length
                }</strong> aktivních návrhů.
              </p>
              
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 text-xs text-rose-700 flex flex-col gap-1">
                <span className="font-bold">Co bude smazáno:</span>
                <span className="pl-2">• Všechny nepřezkoumané návrhy (pending)</span>
                <span className="pl-2">• Schválené budoucí akce (approved bez data nebo v budoucnu)</span>
                <span className="pl-2">• Rozpracované návrhy (draft) a cyklotrasy</span>
                <span className="pl-2">• Odmítnuté návrhy (rejected)</span>
                <span className="pl-2">• Všechny vygenerované AI tipy (inspirace)</span>
                <span className="font-bold mt-1">Co BUDE zachováno:</span>
                <span className="pl-2">• Historie (schválené a dokončené akce v minulosti)</span>
                <span className="pl-2">• Archiv zrušených akcí (cancelled)</span>
                <span className="pl-2">• Rozpracované cyklotrasy a návrhy uživatelů (status draft/proposed)</span>
              </div>

              <div className="flex flex-col gap-2 mt-2">
                <label className="text-xs font-bold text-stone-500 uppercase">
                  Pro potvrzení napište slovo <span className="text-rose-600 select-all font-extrabold">RESET</span>:
                </label>
                <input 
                  type="text" 
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder="Napište RESET"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-700 focus:ring-2 focus:ring-rose-200 focus:outline-none font-bold text-center uppercase tracking-widest"
                />
              </div>

              <div className="flex gap-3 justify-end mt-2">
                <button 
                  onClick={() => {
                    setIsResetConfirmOpen(false);
                    setResetConfirmText("");
                  }}
                  className="px-4 py-2 border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 font-bold text-xs rounded-xl shadow-sm cursor-pointer"
                >
                  Storno
                </button>
                <button 
                  onClick={async () => {
                    if (resetConfirmText.trim().toUpperCase() === "RESET") {
                      setIsResetConfirmOpen(false);
                      setResetConfirmText("");
                      onClose(); // Zavřít admin panel
                      await onResetApplication?.();
                    }
                  }}
                  disabled={resetConfirmText.trim().toUpperCase() !== "RESET"}
                  className="px-4 py-2 bg-rose-600 text-white font-bold text-xs rounded-xl shadow-sm hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 size={14} /> Potvrdit reset
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </>
  );
}
