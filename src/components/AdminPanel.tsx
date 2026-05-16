import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Bot, Shield, AlertCircle, CheckCircle, Database, Bike } from "lucide-react";
import { db } from "../firebase";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
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
  const [activeTab, setActiveTab] = useState<"logs" | "users" | "actions" | "approval">("logs");
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [proposedRoutes, setProposedRoutes] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'inspirations'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((item: any) => item.status === 'proposed');
      setProposedRoutes(data);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'admin_logs'), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AdminLog[];
      setLogs(data);
    });
    return () => unsubscribe();
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
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-4xl bg-white rounded-[24px] p-6 shadow-2xl z-[70] flex flex-col gap-6 border-2 border-stone-100 max-h-[85vh]"
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
            onClick={() => setActiveTab("actions")}
            className={cn("px-4 py-2 font-bold text-sm rounded-lg transition-colors", activeTab === "actions" ? "bg-indigo-50 text-indigo-600" : "text-stone-500 hover:bg-stone-50")}
          >
            Akce
          </button>
          <button 
            onClick={() => setActiveTab("approval")}
            className={cn("px-4 py-2 font-bold text-sm rounded-lg transition-colors", activeTab === "approval" ? "bg-amber-50 text-amber-600" : "text-stone-500 hover:bg-stone-50")}
          >
            Schvalování {proposedRoutes.length > 0 && <span className="ml-1 bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{proposedRoutes.length}</span>}
          </button>
        </div>

        <div className="overflow-y-auto pr-1 flex-1 min-h-[300px]">
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
                    onClick={handleGenerateInspirations}
                    disabled={isGeneratingInspiration || isGeneratingBike}
                    className="mt-2 px-6 py-3 rounded-xl bg-indigo-500 text-white font-bold text-sm shadow-sm hover:bg-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
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

          {activeTab === "approval" && (
            <div className="flex flex-col gap-3">
              {(proposedRoutes || []).length === 0 ? (
                <div className="text-stone-400 text-center py-12 flex flex-col items-center gap-3">
                  <div className="bg-stone-50 p-4 rounded-full">
                    <CheckCircle className="text-stone-200" size={32} />
                  </div>
                  <span>Žádné trasy k schválení.</span>
                </div>
              ) : (
                (proposedRoutes || []).map(route => (
                  <div key={route.id} className="bg-white border border-stone-100 p-5 rounded-2xl shadow-sm flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-stone-800">{route.title}</h4>
                        <p className="text-xs text-stone-500">{route.location}</p>
                      </div>
                      <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md uppercase">
                        🚴 Cyklotrasa
                      </span>
                    </div>
                    <p className="text-sm text-stone-600 line-clamp-2">{route.description}</p>
                    <div className="flex gap-2 mt-2">
                      <button 
                        onClick={() => handleApproveBikeRoute(route.id)}
                        className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs transition-colors"
                      >
                        ✅ Schválit pro všechny
                      </button>
                      <a 
                        href={route.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl font-bold text-xs transition-colors"
                      >
                        🔍 Zobrazit mapu
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "users" && (
            <div className="w-full text-left">
              <div className="grid grid-cols-[1fr_100px_180px] gap-4 border-b border-stone-100 pb-3 px-3 text-[11px] uppercase tracking-wider text-stone-400 font-bold">
                <div>Uživatel</div>
                <div className="text-center">Role</div>
                <div>Oprávnění</div>
              </div>
              <div className="flex flex-col mt-2 gap-1.5">
                {Object.values(userProfiles || {}).map((profile) => (
                  <div key={profile.id} className={cn(
                    "grid gap-4 items-center px-3 py-3 transition-colors",
                    profile.isBlocked 
                      ? "grid-cols-[1fr_auto] bg-stone-100 rounded-2xl border border-stone-200 grayscale-[0.2]" 
                      : "grid-cols-[1fr_100px_180px] border-b border-stone-50 hover:bg-stone-50"
                  )}>
                    <div>
                      <div className="flex items-center gap-3">
                        <div className={cn("w-8 h-8 rounded-full overflow-hidden bg-white flex items-center justify-center flex-shrink-0", profile.isBlocked ? "border-stone-300 opacity-70" : "border border-stone-200")}>
                          {profile.avatar?.startsWith('http') || profile.avatar?.startsWith('data:') ? (
                            <img src={profile.avatar} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-base leading-none">{profile.avatar || "👤"}</span>
                          )}
                        </div>
                        <div className="flex flex-col w-full">
                          <input 
                            type="text"
                            defaultValue={profile.adminAlias || profile.displayName || profile.email?.split('@')[0]}
                            onBlur={(e) => {
                              if (e.target.value !== (profile.adminAlias || profile.displayName || profile.email?.split('@')[0])) {
                                updateUserAdminAlias(profile.id!, e.target.value);
                              }
                            }}
                            className={cn("font-bold text-sm bg-transparent border-b border-transparent focus:outline-none transition-colors w-full", profile.isBlocked ? "text-stone-500" : "text-stone-700 hover:border-stone-300 focus:border-indigo-400")}
                            title="Soukromé jméno pro admina"
                            disabled={profile.isBlocked}
                          />
                          <div className={cn("text-[10px] truncate max-w-[150px]", profile.isBlocked ? "text-stone-400" : "text-stone-400")}>
                            {profile.email}
                          </div>
                        </div>
                      </div>
                    </div>

                    {!profile.isBlocked ? (
                      <>
                        <div className="flex justify-center">
                          <select
                            value={profile.role || 'viewer'}
                            onChange={(e) => updateUserRole(profile.id!, e.target.value as UserRole)}
                            className="text-xs font-bold bg-stone-100 text-stone-700 border-none rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-indigo-100 cursor-pointer"
                          >
                            <option value="admin">Admin</option>
                            <option value="parent">Rodič</option>
                            <option value="child">Dítě</option>
                            <option value="viewer">Divák</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <div className="flex gap-1 flex-wrap">
                            {profile.permissions?.canSuggest && <span className="text-[9px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded font-bold">Tvořit</span>}
                            {profile.permissions?.canComment && <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold">Komentáře</span>}
                            {profile.permissions?.canApprove && <span className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-bold">Schvalovat</span>}
                          </div>
                          <button 
                            onClick={() => toggleUserBlocked(profile.id!, !!profile.isBlocked)}
                            className="text-[10px] font-bold text-rose-500 hover:text-rose-600 self-start px-1 border border-transparent hover:border-rose-200 rounded transition-colors"
                          >
                            Zablokovat přístup
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-end gap-3 pr-2">
                        <span className="text-xs font-bold text-rose-500 bg-rose-50 px-2 py-1 rounded-md">
                          Zablokováno
                        </span>
                        <button 
                          onClick={() => toggleUserBlocked(profile.id!, !!profile.isBlocked)}
                          className="text-xs font-bold text-indigo-500 hover:text-indigo-600 bg-white border border-stone-200 px-3 py-1.5 rounded-lg shadow-sm hover:shadow transition-all"
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
