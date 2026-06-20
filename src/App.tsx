import React, { useState, useEffect, type FormEvent, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Calendar, 
  Plus, 
  Check, 
  X, 
  Clock, 
  User, 
  Settings, 
  Edit,
  LogOut, 
  ChevronRight,
  Sparkles,
  Heart,
  Gamepad2,
  Camera,
  Music,
  LogIn,
  AlertCircle,
  Upload,
  Image as ImageIcon,
  MapPin,
  Navigation,
  Map,
  ExternalLink,
  Film,
  Timer,
  Baby,
  Home,
  Bot,
  MessageSquare,
  Send,
  Loader2,
  ArrowUp,
  Trash2,
  ArrowLeft,
  Shield,
  AlertTriangle,
  Bike,
  Zap
} from "lucide-react";
import AdminPanel from "./components/AdminPanel";
import BikeRouteGenerator from "./components/BikeRouteGenerator";
import { cn } from "./lib/utils";
import { ActivitySuggestion, WeekendEvent, UserProfile, UserRole, UserPermissions, ActivityComment, Inspiration, CinemaListing } from "./types";
import { calculateLeagueStats, BADGES } from "./lib/gameHubUtils";
import GameHub from "./GameHub";
import { format, startOfWeek, addDays, isSameDay, parseISO } from "date-fns";
import { cs } from "date-fns/locale";
import { auth, db, messaging } from "./firebase";
import { getToken } from "firebase/messaging";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User as FirebaseUser,
  signOut 
} from "firebase/auth";
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  deleteField,
  doc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp,
  getDocFromServer,
  increment,
  setDoc,
  arrayUnion
} from "firebase/firestore";

const API_BASE_URL = window.location.hostname === 'localhost'
  ? `${window.location.protocol}//${window.location.host}`
  : '';

// Operation types for error handling
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

const FAMILY_MEMBERS = ["Emma", "František", "Eva", "Táta", "Ostatní"];
const AVATAR_OPTIONS = ["🐶", "🐱", "🦊", "🐻", "🐼", "🦁", "🐰", "🐯", "🐨", "🐸", "🐵", "🦄", "⚽", "🎮", "🎨", "🎵", "🚗", "🚀", "👑", "🌟"];


// C) Výchozí oprávnění dle role – mimo komponentu (statická konstanta)
const ROLE_DEFAULTS: Record<UserRole, UserPermissions> = {
  admin:  { canSuggest: true,  canComment: true,  canApprove: true,  canManageUsers: true },
  parent: { canSuggest: true,  canComment: true,  canApprove: true,  canManageUsers: false },
  child:  { canSuggest: true,  canComment: true,  canApprove: false, canManageUsers: false },
  viewer: { canSuggest: true,  canComment: false, canApprove: false, canManageUsers: false },
};



const getWeatherIcon = (wmoCode: number) => {
  let icon = '🌤️';
  if (wmoCode === 0) icon = '☀️';
  else if (wmoCode === 1 || wmoCode === 2 || wmoCode === 3) icon = '⛅';
  else if (wmoCode >= 45 && wmoCode <= 48) icon = '🌫️';
  else if (wmoCode >= 51 && wmoCode <= 67) icon = '🌧️';
  else if (wmoCode >= 71 && wmoCode <= 77) icon = '❄️';
  else if (wmoCode >= 80 && wmoCode <= 82) icon = '🌦️';
  else if (wmoCode >= 85 && wmoCode <= 86) icon = '🌨️';
  else if (wmoCode >= 95 && wmoCode <= 99) icon = '⛈️';
  return icon;
};

const getCityInLocative = (city: string) => {
  if (!city || city === "Neznámé místo") return "ve vaší lokalitě";
  
  const rules: Record<string, string> = {
    "Praha": "v Praze", "Brno": "v Brně", "Ostrava": "v Ostravě", "Plzeň": "v Plzni",
    "Liberec": "v Liberci", "Olomouc": "v Olomouci", "České Budějovice": "v Českých Budějovicích",
    "Hradec Králové": "v Hradci Králové", "Ústí nad Labem": "v Ústí nad Labem",
    "Pardubice": "v Pardubicích", "Zlín": "ve Zlíně", "Havířov": "v Havířově",
    "Kladno": "na Kladně", "Most": "v Mostě", "Opava": "v Opavě",
    "Frýdek-Místek": "ve Frýdku-Místku", "Karviná": "v Karviné", "Jihlava": "v Jihlavě",
    "Teplice": "v Teplicích", "Děčín": "v Děčíně", "Karlovy Vary": "v Karlových Varech",
    "Chomutov": "v Chomutově", "Přerov": "v Přerově", "Jablonec nad Nisou": "v Jablonci nad Nisou",
    "Mladá Boleslav": "v Mladé Boleslavi", "Prostějov": "v Prostějově", "Třebíč": "v Třebíči",
    "Česká Lípa": "v České Lípě", "Třinec": "v Třinci", "Tábor": "v Táboře",
    "Znojmo": "ve Znojmě", "Příbram": "v Příbrami", "Cheb": "v Chebu",
    "Kolín": "v Kolíně", "Trutnov": "v Trutnově", "Písek": "v Písku",
    "Kroměříž": "v Kroměříži", "Šumperk": "v Šumperku", "Vsetín": "ve Vsetíně",
    "Valašské Meziříčí": "ve Valašském Meziříčí", "Litvínov": "v Litvínově",
    "Uherské Hradiště": "v Uherském Hradišti", "Hodonín": "v Hodoníně",
    "Český Těšín": "v Českém Těšíně", "Břeclav": "v Břeclavi", "Krnov": "v Krnově",
    "Litoměřice": "v Litoměřicích", "Sokolov": "v Sokolově", "Nový Jičín": "v Novém Jičíně",
    "Havlíčkův Brod": "v Havlíčkově Brodě", "Chrudim": "v Chrudimi", "Strakonice": "ve Strakonicích",
    "Kopřivnice": "v Kopřivnici", "Klatovy": "v Klatovech", "Žďár nad Sázavou": "ve Žďáru nad Sázavou",
    "Bohumín": "v Bohumíně", "Jindřichův Hradec": "v Jindřichově Hradci", "Vyškov": "ve Vyškově",
    "Kutná Hora": "v Kutné Hoře", "Blansko": "v Blansku", "Jirkov": "v Jirkově",
    "Náchod": "v Náchodě", "Pelhřimov": "v Pelhřimově"
  };

  if (rules[city]) return rules[city];

  const lower = city.toLowerCase();
  const firstChar = lower.charAt(0);
  const prep = (firstChar === 'v' || firstChar === 'f') ? 've' : 'v';

  if (city.endsWith("ov")) return `${prep} ${city}ě`;
  if (city.endsWith("ín")) return `${prep} ${city}ě`;
  if (city.endsWith("ice")) return `${prep} ${city.slice(0, -3)}icích`;
  if (city.endsWith("ava")) return `${prep} ${city.slice(0, -1)}ě`;
  if (city.endsWith("ka")) return `${prep} ${city.slice(0, -2)}ce`;
  if (city.endsWith("no")) return `${prep} ${city.slice(0, -1)}ě`;

  return `${prep} lokalitě ${city}`;
};

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

export default function App() {
  // POŠŤÁK (v1.4.6): Absolutní priorita pro zachycení kódu z URL
  const currentUrlParams = new URLSearchParams(window.location.search);
  const quickCode = currentUrlParams.get('code');
  if (quickCode) {
    const target = '/auth/callback?code=' + quickCode;
    // Zkusíme automatický replace
    setTimeout(() => { window.location.replace(target); }, 500);
    
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'white', color: '#1f2937', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #3498db', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <h2 style={{ marginTop: '20px' }}>Doručuji klíč ke kalendáři...</h2>
        <p style={{ fontSize: '14px', color: '#6b7280' }}>Pokud se nic nestane, klikněte na tlačítko níže:</p>
        <a href={target} style={{ marginTop: '20px', background: '#3b82f6', color: 'white', padding: '12px 24px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' }}>
          RUČNĚ DORUČIT KLÍČ
        </a>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

   const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});
  const [isDemoMode, setIsDemoMode] = useState(false);
  
   const currentUserId = useMemo(() => isDemoMode ? "demo_child_uid" : (user?.uid || ""), [isDemoMode, user]);
  const realUserRole = useMemo(() => userProfiles[user?.uid || '']?.role || 'viewer', [userProfiles, user]);
  const currentUserRole = useMemo(() => isDemoMode ? 'child' : realUserRole, [isDemoMode, realUserRole]);
  const canApproveActivities = useMemo(() => currentUserRole === 'admin' || currentUserRole === 'parent', [currentUserRole]);
  const canManageSystem = useMemo(() => !isDemoMode && realUserRole === 'admin', [realUserRole, isDemoMode]);

  const extendedUserProfiles = useMemo(() => {
    const profiles = { ...userProfiles };
    if (isDemoMode) {
      profiles["demo_child_uid"] = {
        id: "demo_child_uid",
        displayName: "Demo Dítě",
        adminAlias: "Demo Dítě",
        avatar: "🧪",
        role: "child",
        targetGroup: "pro_vsechny",
        birthYear: 2018
      };
    }
    return profiles;
  }, [userProfiles, isDemoMode]);

  const dynamicFamilyMembers = useMemo(() => {
    const members = (Object.values(extendedUserProfiles) as UserProfile[])
      .filter(p => !p.isBlocked)
      .map(p => {
        const name = p.adminAlias || p.displayName || p.email?.split('@')[0] || '';
        if (name.toLowerCase() === 'zefran3') return 'Táta';
        return name;
      })
      .filter(name => name !== '');
      
    const uniqueMembers = Array.from(new Set(members));
    
    // Zobrazíme Demo Dítě pouze v demo režimu
    const filteredMembers = isDemoMode 
      ? uniqueMembers 
      : uniqueMembers.filter(m => m !== "Demo Dítě");

    filteredMembers.sort((a, b) => {
      if (a === 'Táta') return -1;
      if (b === 'Táta') return 1;
      return a.localeCompare(b, 'cs');
    });
    filteredMembers.push('Ostatní');
    return filteredMembers;
  }, [extendedUserProfiles, isDemoMode]);

  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<"parent" | "child">("child");
  const [suggestions, setSuggestions] = useState<ActivitySuggestion[]>([]);
  const [leagueConfig, setLeagueConfig] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"activity" | "ride">("activity");
  const [googleTokens, setGoogleTokens] = useState<any>(() => {
    // Načteme klíče z paměti prohlížeče, pokud tam po minulém refreshi zbyly
    const saved = localStorage.getItem('googleCalendarTokens');
    return saved ? JSON.parse(saved) : null;
  });
  const [showArchive, setShowArchive] = useState(false);
  const [archiveTab, setArchiveTab] = useState<"completed" | "cancelled">("completed");
  const [boardFilter, setBoardFilter] = useState<"all" | "pending" | "approved" | "rejected" | "cancelled" | "ride" | "bike" | "trash">("all");
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [likedSuggestions, setLikedSuggestions] = useState<string[]>(() => {
    const saved = localStorage.getItem('likedSuggestions');
    return saved ? JSON.parse(saved) : [];
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cancellingEvent, setCancellingEvent] = useState<ActivitySuggestion | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [selectedLeaderboardUser, setSelectedLeaderboardUser] = useState<string | null>(null);
  const [appealingEvent, setAppealingEvent] = useState<ActivitySuggestion | null>(null);
  const [appealReason, setAppealReason] = useState("");
  const [isDraftsExpanded, setIsDraftsExpanded] = useState(false);
  const [weather, setWeather] = useState<{ temp: number; icon: string; city: string } | null>(null);
  const [showWeatherModal, setShowWeatherModal] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isHeaderExpandedLandscape, setIsHeaderExpandedLandscape] = useState(false);

  const handleAvatarClickLandscape = () => {
    const nextState = !isHeaderExpandedLandscape;
    setIsHeaderExpandedLandscape(nextState);
    if (nextState) {
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 80);
    }
  };

  useEffect(() => {
    const checkLandscape = () => {
      setIsLandscape(window.innerWidth > window.innerHeight && window.innerHeight < 768);
    };
    checkLandscape();
    window.addEventListener('resize', checkLandscape);
    return () => window.removeEventListener('resize', checkLandscape);
  }, []);
  const [commentingOn, setCommentingOn] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentPhoto, setCommentPhoto] = useState<string | null>(null);
  const commentFileInputRef = useRef<HTMLInputElement>(null);
  const inspirationsRef = useRef<HTMLDivElement>(null);
  const draftsRef = useRef<HTMLDivElement>(null);
  const [forecast, setForecast] = useState<any[]>([]);
  const [inspirations, setInspirations] = useState<Inspiration[]>([]);
  const [isGeneratingInspiration, setIsGeneratingInspiration] = useState(false);
  const [showInspirationsView, setShowInspirationsView] = useState(false);
  const [expandedInspiration, setExpandedInspiration] = useState<string | null>(null);
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showVyskovOnly, setShowVyskovOnly] = useState(false);
  const [approvingEvent, setApprovingEvent] = useState<ActivitySuggestion | null>(null);
  const [approveDate, setApproveDate] = useState("");
  const [approveTime, setApproveTime] = useState("");
  const [confirmDetails, setConfirmDetails] = useState(false);
  const [confirmFree, setConfirmFree] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rejectingActivity, setRejectingActivity] = useState<ActivitySuggestion | null>(null);
  const [rejectReasonText, setRejectReasonText] = useState("");

  // Stavy pro kontrolu časových kolizí
  const [collisionWarning, setCollisionWarning] = useState<{
    type: 'direct' | 'buffer' | 'allday';
    message: string;
    suggestion: ActivitySuggestion;
    targetDate: string;
    targetTime: string;
    confirmDetails?: boolean;
    confirmFree?: boolean;
  } | null>(null);
  const [collisionActionMode, setCollisionActionMode] = useState<'none' | 'edit' | 'reject'>('none');
  const [collisionEditDate, setCollisionEditDate] = useState("");
  const [collisionEditTime, setCollisionEditTime] = useState("");
  const [collisionEditReason, setCollisionEditReason] = useState("");
  const [collisionRejectReason, setCollisionRejectReason] = useState("");

  const [loadingStep, setLoadingStep] = useState('');
  const todayStr = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState<"rejected" | "cancelled" | null>(null);
  const [deleteFilterStatus, setDeleteFilterStatus] = useState<"rejected" | "cancelled" | null>(null);
  const [showNothingToDeleteModal, setShowNothingToDeleteModal] = useState(false);
  const [showGradeLimitModal, setShowGradeLimitModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showGameHub, setShowGameHub] = useState(false);
  const [showBikeGenerator, setShowBikeGenerator] = useState(false);
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollToTop(window.scrollY > 300);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (draftsRef.current && !draftsRef.current.contains(event.target as Node)) {
        setIsDraftsExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!error && !success) return;
    const timer = setTimeout(() => { setError(null); setSuccess(null); }, 5000);
    return () => clearTimeout(timer);
  }, [error, success]);

  // B) Generická helper pro update users kolekce – nahrazuje 5 separátních funkcí
  const updateUserDoc = async (userId: string, fields: Record<string, any>, errorMsg: string) => {
    try {
      await updateDoc(doc(db, "users", userId), { ...fields, updatedAt: serverTimestamp() });
    } catch (err) {
      console.error(err);
      setError(errorMsg);
    }
  };

  const updateUserRole = (userId: string, role: UserRole) => {
    if (userId === user?.uid && role !== 'admin') {
      setError("Nemůžete si odebrat vlastní administrátorská práva.");
      return;
    }
    return updateUserDoc(userId, { role, permissions: ROLE_DEFAULTS[role] }, "Nepodařilo se aktualizovat práva uživatele.");
  };

  const updateUserAdminAlias = (userId: string, adminAlias: string) =>
    updateUserDoc(userId, { adminAlias }, "Nepodařilo se aktualizovat poznámku k uživateli.");

  const updateUserTargetGroup = (userId: string, targetGroup: 'pro_dceru' | 'pro_syna' | 'pro_vsechny') =>
    updateUserDoc(userId, { targetGroup }, "Nepodařilo se aktualizovat skupinu tipů pro uživatele.");

  const updateUserBirthYear = (userId: string, birthYear: number) => {
    if (isNaN(birthYear) || birthYear < 1990 || birthYear > new Date().getFullYear()) {
      setError("Neplatný rok narození."); return;
    }
    return updateUserDoc(userId, { birthYear }, "Nepodařilo se uložit rok narození.");
  };

  const toggleUserBlocked = (userId: string, currentBlocked: boolean) => {
    if (userId === user?.uid) { setError("Nemůžete zablokovat sami sebe."); return; }
    return updateUserDoc(userId, { isBlocked: !currentBlocked }, "Nepodařilo se změnit stav blokování uživatele.");
  };

  // F) Avatar načítaný dynamicky z uživatelských profilů
  const getAvatarForChild = (childName: string) => {
    if (!childName) return "👶";
    
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
    
    if (profile?.avatar) return profile.avatar;
    
    // Výchozí emotikony pro známé členy rodiny
    const defaultAvatars: Record<string, string> = { 
      'tata': '👨', 
      'eva': '👩', 
      'emma': '👧', 
      'frantisek': '👦' 
    };
    if (defaultAvatars[cleanChild]) return defaultAvatars[cleanChild];
    
    let hash = 0;
    for (let i = 0; i < childName.length; i++) hash = childName.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_OPTIONS[Math.abs(hash) % AVATAR_OPTIONS.length];
  };

  const getDynamicNameForChild = (childName: string): string => {
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

   const getLoggedInFamilyName = (): string => {
    if (isDemoMode) return "Demo Dítě";
    if (!user) return '';
    const profile = userProfiles[user.uid];
    if (profile) {
      const name = profile.adminAlias || profile.displayName;
      if (name) return name;
    }
    // Fallback na jméno z Firebase auth nebo část emailu před zavináčem
    const rawName = user.displayName || user.email?.split('@')[0] || '';
    if (rawName.toLowerCase() === 'zefran3') return 'Táta';
    return rawName;
  };
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max&timezone=auto&past_days=1`);
          const weatherData = await weatherRes.json();
          
          const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=cs`);
          const geoData = await geoRes.json();
          
          const wmoCode = weatherData.current_weather.weathercode;
          const temp = Math.round(weatherData.current_weather.temperature);

          setWeather({
            temp,
            icon: getWeatherIcon(wmoCode),
            city: geoData.city || geoData.locality || "Neznámé místo"
          });

          if (weatherData.daily) {
             // Výpočet cílové soboty a neděle dle aktuálního dne v týdnu
             // Sob/Ned → aktuální víkend | Po–Pá → příští víkend
             const today = new Date();
             const dow = today.getDay(); // 0=Ne, 1=Po, ..., 6=So

             // Kolik dní přidat/odečíst, abychom dostali sobotu daného víkendu
             let daysToSat: number;
             if (dow === 6) daysToSat = 0;        // Dnes je sobota
             else if (dow === 0) daysToSat = -1;  // Dnes je neděle → sobota byla včera
             else daysToSat = 6 - dow;            // Po–Pá → příští sobota

             const toISO = (d: Date) => d.toISOString().split('T')[0];
             const satDate = new Date(today);
             satDate.setDate(today.getDate() + daysToSat);
             const sunDate = new Date(satDate);
             sunDate.setDate(satDate.getDate() + 1);

             const targetSat = toISO(satDate);
             const targetSun = toISO(sunDate);

             // Mapuj API data na slovník date→data
             const dayMap: Record<string, any> = {};
             weatherData.daily.time.forEach((date: string, i: number) => {
               dayMap[date] = {
                 date,
                 maxTemp: Math.round(weatherData.daily.temperature_2m_max[i]),
                 minTemp: Math.round(weatherData.daily.temperature_2m_min[i]),
                 precipProb: weatherData.daily.precipitation_probability_max[i] || 0,
                 windSpeed: Math.round(weatherData.daily.windspeed_10m_max[i]),
                 icon: getWeatherIcon(weatherData.daily.weathercode[i])
               };
             });

             const weekend = [
               dayMap[targetSat] ? { ...dayMap[targetSat], dayName: 'Sobota' } : null,
               dayMap[targetSun] ? { ...dayMap[targetSun], dayName: 'Neděle' } : null,
             ].filter(Boolean);

             if (weekend.length > 0) setForecast(weekend as any);
          }


        } catch (e) {
          console.error("Failed to fetch weather", e);
        }
      }, (error) => {
        console.error("Geolocation error", error);
      });
    }
  }, []);

  const leaderboard = useMemo(() => {
    const scores: Record<string, { childName: string; score: number; avatar: string; xp: number; authorId: string; role: string }> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Call shared utility for XP calculation without duplicating logic
    const { maraton } = calculateLeagueStats(suggestions, [], userProfiles, leagueConfig);

    // Initialize all active (non-blocked) users from User Management
    Object.values(extendedUserProfiles).forEach((p: any) => {
      if (p.isBlocked) return;
      let name = p.adminAlias || p.displayName || p.email?.split('@')[0] || '';
      if (name.toLowerCase() === 'zefran3') name = 'Táta';
      if (!name) return;

      // Zobrazujeme Demo Dítě pouze v demo režimu
      if (!isDemoMode && name === "Demo Dítě") return;

      // Include dynamic maraton XP
      const userStats = maraton[name] || { totalIdeas: 0, realized: 0, freeActivities: 0, withDetails: 0, totalZB: 0 };
      const badgeBonus = BADGES.filter(b => b.check(userStats)).reduce((sum, b) => sum + b.bonusZB, 0);

      scores[name] = {
        childName: name,
        score: 0,
        avatar: p.avatar || getAvatarForChild(name),
        xp: userStats.totalZB + badgeBonus,
        authorId: p.id || "",
        role: p.role || "viewer"
      };
    });

    suggestions.forEach(s => {
      if (s.status === 'approved' && s.eventDate && s.type !== 'ride') {
        const eventDateObj = new Date(s.eventDate);
        if (eventDateObj < today) {
          const rawName = s.childName || "Neznámý";
          const childNameKey = getDynamicNameForChild(rawName);
          if (scores[childNameKey]) {
            scores[childNameKey].score += 1;
          }
        }
      }
    });

    return Object.values(scores).sort((a, b) => b.score - a.score);
  }, [suggestions, extendedUserProfiles, userProfiles, isDemoMode, leagueConfig]);

  useEffect(() => {
    localStorage.setItem('likedSuggestions', JSON.stringify(likedSuggestions));
  }, [likedSuggestions]);
  const [newSuggestion, setNewSuggestion] = useState({
    title: "",
    description: "",
    childName: "",
    customChildName: "",
    eventDate: "",
    eventTime: "",
    location: "",
    url: "",
    rideFrom: "",
    rideTo: "",
    claimedDetails: false,
    claimedFree: false,
    cinemaListings: [] as any[]
  });

  const handleImageCompress = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const max_size = 800;
          if (width > height && width > max_size) {
            height *= max_size / width;
            width = max_size;
          } else if (height > max_size) {
            width *= max_size / height;
            height = max_size;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = (e) => reject(e);
      };
      reader.onerror = (e) => reject(e);
    });
  };

  const handlePhotoUploadClick = () => {
    commentFileInputRef.current?.click();
  };

  const handleCommentPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await handleImageCompress(file);
      setCommentPhoto(base64);
    } catch (err) {
      console.error("Failed to compress image", err);
      setError("Nepodařilo se zpracovat fotografii.");
    }
  };

  const submitComment = async (suggestionId: string) => {
    if (!commentText.trim() && !commentPhoto) return;
    if (!user) return;
    
    let authorName = user.displayName || "Neznámý";
    let authorAvatar = user.photoURL || "https://api.dicebear.com/7.x/avataaars/svg?seed=" + user.uid;
    const emailLower = user.email?.toLowerCase() || "";
    if (emailLower === "zefran3@gmail.com") {
      authorName = "Táta";
      authorAvatar = getAvatarForChild("Táta");
    } else if (emailLower === "eva.kubartova@gmail.com") {
      authorName = "Eva";
      authorAvatar = getAvatarForChild("Eva");
    }

    const newComment: ActivityComment = {
      id: Date.now().toString(),
      authorId: user.uid,
      authorName,
      authorAvatar,
      text: commentText.trim(),
      ...(commentPhoto ? { photoBase64: commentPhoto } : {}),
      createdAt: Date.now(),
    };

    try {
      await updateDoc(doc(db, 'suggestions', suggestionId), {
        comments: arrayUnion(newComment)
      });
      setCommentText("");
      setCommentPhoto(null);
      setCommentingOn(null);
    } catch (err) {
      console.error("Comment submit error", err);
      setError("Komentář se nepodařilo odeslat.");
    }
  };

  const handleFirestoreError = (err: unknown, operationType: OperationType, path: string | null) => {
    const errInfo: FirestoreErrorInfo = {
      error: err instanceof Error ? err.message : String(err),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
      },
      operationType,
      path
    };
    const errString = JSON.stringify(errInfo);
    console.error('Firestore Error: ', errString);
    setError(`Chyba databáze: ${errInfo.error}`);
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authTokensBase64 = urlParams.get('auth_tokens');

    if (authTokensBase64) {
      try {
        const tokensStr = atob(authTokensBase64);
        const tokens = JSON.parse(tokensStr);
        setGoogleTokens(tokens);
        localStorage.setItem('googleCalendarTokens', tokensStr);
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) {
        console.error('Chyba při dekódování Google tokenů:', e);
        setError('Nepodařilo se připojit Google kalendář. Zkuste to znovu.');
      }
    } else if (urlParams.get('auth_error')) {
      setError('Google přihlášení selhalo. Zkuste to znovu.');
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Reset navigation states to home screen on login
        setShowInspirationsView(false);
        setShowArchive(false);
        setShowUserManagement(false);
        setShowForm(false);
        setExpandedInspiration(null);
        setExpandedSuggestion(null);
        setBoardFilter("all");
        
        // Test connection
        getDocFromServer(doc(db, 'test', 'connection')).catch(err => {
          if (err instanceof Error && err.message.includes('the client is offline')) {
            console.error("Please check your Firebase configuration.");
          }
        });
        
        // Sync user email for global avatar lookups
        if (currentUser.email) {
          setDoc(doc(db, "users", currentUser.uid), { email: currentUser.email }, { merge: true }).catch(console.error);
        }

        // Request Push Notification permission if supported
        if (messaging) {
          Notification.requestPermission().then((permission) => {
            if (permission === 'granted') {
              getToken(messaging, { vapidKey: 'BKgR9vuJB_M_fGqrzFANmtEA7B0i6gzV7xsN9gv05eEotLpgGD1LeyLGWbEOaE_rsCAsKL6uxRnPn46TljVIROk' }).then((currentToken) => {
                if (currentToken) {
                  setDoc(doc(db, "users", currentUser.uid), { fcmToken: currentToken }, { merge: true }).catch(console.error);
                }
              }).catch((err) => {
                console.error('Chyba při získávání FCM tokenu:', err);
              });
            }
          });
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Load definitions
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const profilesMap: Record<string, UserProfile> = {};
      snapshot.docs.forEach(doc => {
        profilesMap[doc.id] = { id: doc.id, ...doc.data() } as UserProfile;
      });
      setUserProfiles(profilesMap);
    }, (err) => {
      console.warn("Nebylo možné načíst profily uživatelů (možná nemáte nasazené Firebase Rules): ", err);
    });

    const path = 'suggestions';
    const q = query(collection(db, path), orderBy("createdAt", "desc"));
    const unsubscribeSuggestions = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as ActivitySuggestion[];
      
      // Řazení tak, aby žádosti o přehodnocení byly vždy jako první a dále dle datumu
      data.sort((a, b) => {
        if (a.reconsiderationRequested && !b.reconsiderationRequested) return -1;
        if (!a.reconsiderationRequested && b.reconsiderationRequested) return 1;
        return 0;
      });

      setSuggestions(data);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    });

    const unsubscribeInspirations = onSnapshot(query(collection(db, 'inspirations')), (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Inspiration[];
      setInspirations(data);
    });

    const unsubscribeLeagueConfig = onSnapshot(doc(db, 'settings', 'league_config'), (docSnap) => {
      if (docSnap.exists()) {
        setLeagueConfig(docSnap.data());
      } else {
        setLeagueConfig({ status: 'stopped', leagueStartDate: null });
      }
    });

    return () => {
      unsubscribeUsers();
      unsubscribeSuggestions();
      unsubscribeInspirations();
      unsubscribeLeagueConfig();
    };
  }, [user]);

  const handleGenerateInspirations = () => {
    setIsGeneratingInspiration(true);
    setLoadingStep('Inicializuji generování...');
    const location = weather?.city ? `location=${encodeURIComponent(weather.city)}` : '';
    const uidParam = user?.uid ? `&uid=${user.uid}` : '';
    const es = new EventSource(`${API_BASE_URL}/api/agent/generate/stream?${location}${uidParam}`);
    es.addEventListener('status', (e: MessageEvent) => {
      try {
        const { message } = JSON.parse(e.data);
        setLoadingStep(message);
      } catch { /* ignore */ }
    });
    es.addEventListener('done', (e: MessageEvent) => {
      es.close();
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
      setIsGeneratingInspiration(false);
      setLoadingStep('');
    });
    es.addEventListener('error', () => {
      es.close();
      setError('Chyba při generování tipů.');
      setIsGeneratingInspiration(false);
      setLoadingStep('');
    });
  };



  const handleProposeBikeRoute = (id: string) => {
    const draft = suggestions.find(s => s.id === id) || inspirations.find(i => i.id === id);
    if (!draft) return;
    
    setFormType("activity");
    setNewSuggestion({
      title: draft.title,
      description: draft.description,
      childName: (draft as any).childName || getLoggedInFamilyName() || "",
      customChildName: "",
      eventDate: (draft as any).eventDate || "",
      eventTime: (draft as any).eventTime || "",
      location: draft.location || "",
      url: draft.url || "",
      rideFrom: "",
      rideTo: "",
      claimedDetails: false,
      claimedFree: false
    });
    setEditingId(id);
    setShowForm(true);
  };

  const handleApproveBikeRoute = async (id: string) => {
    if (!user) return;
    try {
      const response = await fetch(`/api/inspirations/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid })
      });
      if (response.ok) {
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 3000);
      }
    } catch (err) { console.error(err); }
  };

  const handleDeleteInspiration = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDeleteInspiration = async () => {
    if (!user || !deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    try {
      await deleteDoc(doc(db, 'suggestions', id));
      // Okamžitý update UI pro lepší pocit z aplikace
      setSuggestions(prev => prev.filter(s => s.id !== id));
      setInspirations(prev => prev.filter(i => i.id !== id));
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    } catch (err) {
      console.error("Failed to delete inspiration", err);
      setError("Nepodařilo se smazat návrh.");
    }
  };

  const handleUpdateAvatar = async (avatarValue: string) => {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), {
        avatar: avatarValue,
        email: user.email || "",
        updatedAt: serverTimestamp()
      }, { merge: true });
      setShowAvatarModal(false);
    } catch (err: any) {
      console.error(err);
      setError("Nepodařilo se uložit avatara. Možná ještě chybí aktualizace Firebase Rules.");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 150;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Export to WebP for saving space
        const dataUrl = canvas.toDataURL("image/webp", 0.8);
        handleUpdateAvatar(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    // Uložení klíčů při změně
    if (googleTokens) {
      localStorage.setItem('googleCalendarTokens', JSON.stringify(googleTokens));
    } else {
      localStorage.removeItem('googleCalendarTokens');
    }
  }, [googleTokens]);

  useEffect(() => {
    // Načteme kalendář jakmile máme klíče a uživatel je přihlášený (nebo když se změní počet návrhů)
    if (user && googleTokens) {
      fetchCalendarEvents(googleTokens, suggestions);
    }
  }, [user, googleTokens, suggestions.length]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        setGoogleTokens(event.data.tokens);
        fetchCalendarEvents(event.data.tokens);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Login failed:", err);
      if (err?.message?.includes("unauthorized_domain") || err?.message?.includes("unauthorized-domain")) {
        setError("Chyba: Tato adresa (Render) ještě není povolená ve Firebase! Běžte do Firebase Console -> Authentication -> Settings -> Authorized domains a přidejte tam vikendovnik.onrender.com");
      } else {
        setError(`Přihlášení se nezdařilo: ${err?.message || "Neznámá chyba"}`);
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // setGoogleTokens(null); // Neodstraňujeme klíče z prohlížeče při odhlášení
      setCalendarEvents([]);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const fetchCalendarEvents = async (tokens: any, currentSuggestions?: ActivitySuggestion[]) => {
    try {
      const activeSuggestions = currentSuggestions || suggestions;
      const knownIds = activeSuggestions.map((s: ActivitySuggestion) => s.calendarEventId).filter(Boolean);

      const response = await fetch(`${API_BASE_URL}/api/calendar/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens, knownIds }),
      });
      const data = await response.json();
      if (response.ok) {
        setCalendarEvents(data);
      } else {
        console.error("Failed to fetch calendar events:", data);
        const errorMsg = data.error?.message || data.error || JSON.stringify(data);
        setError(`Chyba Google kalendáře: ${errorMsg}`);
        
        if (response.status === 401 || (data.error && data.error.includes("invalid_grant"))) {
          setGoogleTokens(null); // Odhlásíme, aby si uživatel musel vyžádat nový token
        }
      }
    } catch (error) {
      console.error("Failed to fetch calendar events:", error);
    }
  };

  const handleConnectGoogle = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/google/url`);
      const { url } = await response.json();
      // Vždy použijeme přesměrování aktuálního okna, abychom se vyhnuli blokování popupů a izolaci oken
      window.location.href = url;
    } catch (error) {
      console.error("Failed to get auth URL:", error);
    }
  };

  const handleAddSuggestion = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError("Pro přidání nápadu se musíš přihlásit.");
      return;
    }

    const path = 'suggestions';
    try {
      const finalChildName = newSuggestion.childName === "Ostatní" && newSuggestion.customChildName 
        ? newSuggestion.customChildName 
        : newSuggestion.childName;

      if (!finalChildName) {
        setError("Zadejte jméno, kdo to navrhuje.");
        return;
      }

      if (newSuggestion.eventDate) {
        const selectedDateTimeStr = newSuggestion.eventTime 
          ? `${newSuggestion.eventDate}T${newSuggestion.eventTime}`
          : `${newSuggestion.eventDate}T00:00`;
        const selectedDate = new Date(selectedDateTimeStr);
        const now = new Date();
        
        if (newSuggestion.eventTime) {
          if (selectedDate.getTime() < now.getTime()) {
            setError("❌ Datum a čas aktivity nemůže být v minulosti!");
            return;
          }
        } else {
          const todayMidnight = new Date();
          todayMidnight.setHours(0, 0, 0, 0);
          if (selectedDate.getTime() < todayMidnight.getTime()) {
            setError("❌ Datum a čas aktivity nemůže být v minulosti!");
            return;
          }
        }
      }

      if (editingId) {
        // Aktualizace stávajícího draftu na pending návrh
        await updateDoc(doc(db, 'suggestions', editingId), {
          title: formType === "ride" ? `Odvoz: ${newSuggestion.rideFrom} ➡️ ${newSuggestion.rideTo}` : newSuggestion.title,
          description: formType === "ride" ? `Potřebuji odvézt.\nOdkud: ${newSuggestion.rideFrom}\nKam: ${newSuggestion.rideTo}` : newSuggestion.description,
          childName: finalChildName,
          authorId: user.uid,
          userId: user.uid,
          eventDate: newSuggestion.eventDate || "",
          eventTime: newSuggestion.eventTime || "",
          location: newSuggestion.location || "",
          status: "pending",
          type: formType,
          proposedAt: serverTimestamp(),
          proposedBy: user.uid,
          ...(formType === "ride" ? { rideFrom: newSuggestion.rideFrom || "", rideTo: newSuggestion.rideTo || "" } : {}),
          ...(newSuggestion.url ? { url: newSuggestion.url } : {}),
          updatedAt: serverTimestamp(),
          claimedDetails: !!newSuggestion.claimedDetails,
          claimedFree: !!newSuggestion.claimedFree
        });
      } else {
        // Vytvoření nového návrhu
        await addDoc(collection(db, path), {
          title: formType === "ride" ? `Odvoz: ${newSuggestion.rideFrom} ➡️ ${newSuggestion.rideTo}` : newSuggestion.title,
          description: formType === "ride" ? `Potřebuji odvézt.\nOdkud: ${newSuggestion.rideFrom}\nKam: ${newSuggestion.rideTo}` : newSuggestion.description,
          childName: finalChildName,
          authorId: user.uid,
          eventDate: newSuggestion.eventDate || "",
          eventTime: newSuggestion.eventTime || "",
          location: newSuggestion.location || "",
          status: "pending",
          type: formType,
          ...(formType === "ride" ? { rideFrom: newSuggestion.rideFrom || "", rideTo: newSuggestion.rideTo || "" } : {}),
          ...(newSuggestion.url ? { url: newSuggestion.url } : {}),
          likes: 0,
          createdAt: serverTimestamp(),
          claimedDetails: !!newSuggestion.claimedDetails,
          claimedFree: !!newSuggestion.claimedFree
        });
      }
      handleCloseForm();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const handleCleanupSandbox = async () => {
    try {
      setLoadingStep("Čistím testovací data...");
      
      // 1. Smazání návrhů z Firestore
      const demoSuggestions = suggestions.filter(s => s.childName === "Demo Dítě");
      for (const s of demoSuggestions) {
        await deleteDoc(doc(db, "suggestions", s.id));
      }
      
      // 2. Smazání přání z Wishlistu
      const { getDocs, query, collection, where } = await import("firebase/firestore");
      const q = query(collection(db, "wishlists"), where("childName", "==", "Demo Dítě"));
      const querySnapshot = await getDocs(q);
      for (const d of querySnapshot.docs) {
        await deleteDoc(doc(db, "wishlists", d.id));
      }

      setSuccess("Sandbox byl úspěšně vyčištěn. Všechny stopy po Demo Dítěti byly smazány.");
    } catch (err) {
      console.error("Chyba při úklidu sandboxu:", err);
      setError("Nepodařilo se zcela vyčistit testovací data.");
    } finally {
      setLoadingStep("");
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setFormType("activity");
    setEditingId(null);
    setNewSuggestion({ title: "", description: "", eventDate: "", eventTime: "", location: "", url: "", childName: "", customChildName: "", rideFrom: "", rideTo: "", claimedDetails: false, claimedFree: false });
    setError(null);
  };

  const handleToggleLike = async (id: string) => {
    if (!user) {
      setError("Pro hlasování se musíš přihlásit (stačí kliknout dole na tlačítko).");
      return;
    }

    const isLiked = likedSuggestions.includes(id);
    const path = `suggestions/${id}`;

    // Optimistický lokální update
    if (isLiked) {
      setLikedSuggestions(prev => prev.filter(s => s !== id));
    } else {
      setLikedSuggestions(prev => [...prev, id]);
    }

    try {
      await updateDoc(doc(db, 'suggestions', id), {
        likes: increment(isLiked ? -1 : 1)
      });
    } catch (err) {
      // Revert if failed
      if (isLiked) {
        setLikedSuggestions(prev => [...prev, id]);
      } else {
        setLikedSuggestions(prev => prev.filter(s => s !== id));
      }
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const calcAvgGrade = (suggestion: ActivitySuggestion) => {
    if (!suggestion.userGrades) return suggestion.grade || 0;
    const grades = Object.values(suggestion.userGrades).map(g => g.grade);
    if (grades.length === 0) return suggestion.grade || 0;
    return Number((grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(2));
  };

  const handleGradeActivity = async (id: string, grade: number) => {
    if (!user) return;
    const suggestion = suggestions.find(s => s.id === id);
    if (!suggestion) return;

    const userGrades = suggestion.userGrades || {};
    const currentUserGrade = userGrades[user.uid];

    if (currentUserGrade && currentUserGrade.changesCount >= 1 && currentUserGrade.grade !== grade) {
      setShowGradeLimitModal(true);
      return;
    }

    const newChangesCount = currentUserGrade ? (currentUserGrade.grade === grade ? currentUserGrade.changesCount : currentUserGrade.changesCount + 1) : 0;
    
    const newUserGrades = {
      ...userGrades,
      [user.uid]: { grade, changesCount: newChangesCount }
    };

    const gradesArray = (Object.values(newUserGrades) as { grade: number; changesCount: number }[]).map(g => g.grade);
    const newAverage = Number((gradesArray.reduce((a, b) => a + b, 0) / gradesArray.length).toFixed(2));

    try {
      await updateDoc(doc(db, 'suggestions', id), { 
        userGrades: newUserGrades,
        averageGrade: newAverage,
        grade: newAverage // Fallback pro starší verze
      });
      // Zajistíme, že po zařazení na novou pozici se karta udrží v zorném poli
      setTimeout(() => {
        const el = document.getElementById(`archive-${id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 400); // 400ms čekáme na dokončení animace layoutu
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `suggestions/${id}`);
    }
  };

  const handleRepeatActivity = (suggestion: ActivitySuggestion) => {
    setFormType(suggestion.type === "ride" ? "ride" : "activity");
    setNewSuggestion({
      title: suggestion.type === "ride" ? "" : suggestion.title, // pro odvoz se title generuje z from/to
      description: suggestion.type === "ride" ? "" : (suggestion.description || ""), // podobne description
      childName: getLoggedInFamilyName(), // Automaticky předvyplnit podle aktuálního uživatele
      customChildName: "",
      eventDate: "",
      eventTime: "",
      location: suggestion.location || "",
      url: suggestion.url || "",
      rideFrom: suggestion.rideFrom || "",
      rideTo: suggestion.rideTo || "",
      claimedDetails: false,
      claimedFree: false
    });
    setShowArchive(false);
    setShowForm(true);
  };

  // Pomocné funkce pro kontrolu kolizí v kalendáři a notifikace dětí
  const getEndTimeStr = (timeStr: string, isRide: boolean) => {
    if (!timeStr) return "";
    const parts = timeStr.split(':');
    if (parts.length < 2) return "";
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const totalMinutes = h * 60 + m + (isRide ? 30 : 120);
    const newH = Math.floor(totalMinutes / 60) % 24;
    const newM = totalMinutes % 60;
    return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
  };

  const findChildUserId = (childName: string) => {
    const match = (Object.entries(extendedUserProfiles) as [string, UserProfile][]).find(([uid, profile]) => 
      profile.displayName?.toLowerCase() === childName.toLowerCase() ||
      profile.adminAlias?.toLowerCase() === childName.toLowerCase()
    );
    return match ? match[0] : "";
  };

  const parseGoogleEvent = (e: any) => {
    const title = e.summary || "Bez názvu";
    if (e.start?.date) {
      return { title, isAllDay: true };
    }
    if (e.start?.dateTime && e.end?.dateTime) {
      const start = new Date(e.start.dateTime);
      const end = new Date(e.end.dateTime);
      const startMin = start.getHours() * 60 + start.getMinutes();
      const endMin = end.getHours() * 60 + end.getMinutes();
      const pad = (n: number) => String(n).padStart(2, '0');
      const startStr = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
      const endStr = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
      return {
        title,
        isAllDay: false,
        startMinutes: startMin,
        endMinutes: endMin,
        timeRangeStr: `${startStr} - ${endStr}`
      };
    }
    return { title, isAllDay: true };
  };

  const checkActivityCollisionWithGoogleEvents = (
    id: string,
    checkDate: string,
    checkTime: string,
    isRide: boolean,
    googleEvents: any[]
  ) => {
    if (googleEvents.length === 0) return { type: 'none' as const };

    const currentSuggestion = suggestions.find(s => s.id === id);
    const calendarEventId = currentSuggestion?.calendarEventId;
    const otherEvents = googleEvents.filter(e => e.id !== calendarEventId);
    if (otherEvents.length === 0) return { type: 'none' as const };

    const parsedEvents = otherEvents.map(parseGoogleEvent);

    // Celodenní schvalovaná aktivita (nemá čas) koliduje s jakoukoliv jinou v tento den
    if (!checkTime) {
      return {
        type: 'allday' as const,
        conflictingEvent: parsedEvents[0],
        message: `V tento den je již naplánována jiná aktivita: ${parsedEvents[0].title}. Chceš celodenní aktivitu přesto schválit?`
      };
    }

    const checkTimeParts = checkTime.split(':');
    if (checkTimeParts.length < 2) return { type: 'none' as const };
    const s1 = (parseInt(checkTimeParts[0], 10) || 0) * 60 + (parseInt(checkTimeParts[1], 10) || 0);
    const duration1 = isRide ? 30 : 120;
    const e1 = s1 + duration1;

    let directConflict: any = null;
    let bufferConflict: any = null;

    for (const other of parsedEvents) {
      if (other.isAllDay) continue;

      const s2 = other.startMinutes!;
      const e2 = other.endMinutes!;

      // A. Přímá kolize (překryv)
      if (s1 < e2 && s2 < e1) {
        directConflict = {
          type: 'direct' as const,
          conflictingEvent: other,
          message: `Kolize! V tomto čase je již naplánována aktivita: ${other.title} (${other.timeRangeStr}).`
        };
        break; // Přímá kolize má nejvyšší prioritu
      }

      // B. Ochranné okno (Buffer 60 minut před/po)
      if (s1 - 60 < e2 && s2 < e1 + 60) {
        bufferConflict = {
          type: 'buffer' as const,
          conflictingEvent: other,
          message: `Pozor na logistiku! Této aktivitě předchází/následuje aktivita: ${other.title} (${other.timeRangeStr}).`
        };
      }
    }

    if (directConflict) return directConflict;
    if (bufferConflict) return bufferConflict;

    return { type: 'none' as const };
  };

  const handleApproveAttempt = async (
    suggestion: ActivitySuggestion,
    targetDate: string,
    targetTime: string,
    bypassCollision: boolean = false
  ) => {
    if (!targetDate) {
      setError("❌ Nelze schválit aktivitu bez zadaného data!");
      return;
    }

    if (!googleTokens) {
      setError("Než schválíte aktivitu, musíte se propojit s Google Kalendářem (modré tlačítko výše).");
      return;
    }

    if (!bypassCollision) {
      try {
        setLoadingStep("Ověřuji časové kolize v Google Kalendáři...");
        const timeMin = new Date(`${targetDate}T00:00:00`).toISOString();
        const timeMax = new Date(`${targetDate}T23:59:59`).toISOString();

        const res = await fetch(`${API_BASE_URL}/api/calendar/list-day`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokens: googleTokens,
            timeMin,
            timeMax
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Nepodařilo se načíst události z Google Kalendáře.");
        }

        const events = await res.json();
        const isRide = suggestion.type === "ride";
        const collision = checkActivityCollisionWithGoogleEvents(suggestion.id, targetDate, targetTime, isRide, events);
        setLoadingStep("");

        if (collision.type !== "none") {
          setCollisionWarning({
            type: collision.type,
            message: collision.message || "",
            suggestion,
            targetDate,
            targetTime,
            confirmDetails,
            confirmFree
          });
          setCollisionEditDate(targetDate);
          setCollisionEditTime(targetTime || "");
          setCollisionEditReason("");
          setCollisionRejectReason("");
          setCollisionActionMode('none');
          return;
        }
      } catch (err: any) {
        setLoadingStep("");
        console.error("Collision check failed", err);
        setError(`Nepodařilo se ověřit kolize v Google kalendáři: ${err.message || err}`);
        return;
      }
    }

    // Bez kolize nebo s vynuceným schválením (bypass)
    handleUpdateStatus(
      suggestion.id,
      "approved",
      targetDate,
      targetTime,
      undefined,
      confirmDetails,
      confirmFree
    );
  };

  const handleUpdateStatus = async (
    id: string, 
    status: "approved" | "rejected", 
    overrideDate?: string, 
    overrideTime?: string, 
    reason?: string, 
    approvedDetails?: boolean, 
    approvedFree?: boolean
  ) => {
    // Ověření kalendáře vynucujeme jen pro Schválení, Zamítnout můžeme kdykoliv
    if (status === "approved" && !googleTokens) {
      setError("Než schválíte aktivitu, musíte se propojit s Google Kalendářem (modré tlačítko výše).");
      return;
    }

    const path = `suggestions/${id}`;
    try {
      let calendarEventId: string | undefined = undefined;
      const suggestion = suggestions.find(s => s.id === id);
      if (!suggestion) return;

      const finalDate = overrideDate !== undefined ? overrideDate : suggestion.eventDate;
      const finalTime = overrideTime !== undefined ? overrideTime : suggestion.eventTime;

      if (status === "approved") {
        if (!finalDate) {
          setError("❌ Nelze schválit aktivitu bez zadaného data!");
          return;
        }

        const checkDateTimeStr = finalTime 
          ? `${finalDate}T${finalTime}`
          : `${finalDate}T00:00`;
        const checkDate = new Date(checkDateTimeStr);
        const now = new Date();

        const isPast = finalTime
          ? checkDate.getTime() < now.getTime()
          : checkDate.getTime() < new Date().setHours(0, 0, 0, 0);

        if (isPast) {
          setError("❌ Nelze schválit aktivitu s datem v minulosti! Změňte datum na budoucí.");
          if (suggestion.type === "ride" || !approvingEvent || approvingEvent.id !== id) {
            setApprovingEvent(suggestion);
            setApproveDate(finalDate);
            setApproveTime(finalTime || "");
            setConfirmDetails(!!suggestion.claimedDetails);
            setConfirmFree(!!suggestion.claimedFree);
          }
          return;
        }
      }

      if (status === "approved" && googleTokens) {
        let eventParams: any = {};

        if (finalTime) {
          // Pokus o extrakci platného času (HH:MM) z eventTime
          const timeMatch = finalTime.match(/^(\d{1,2}):(\d{2})$/);
          
          if (timeMatch && finalDate) {
            // Standardní čas (např. "14:00") + platné datum
            try {
              let eventDateObj = new Date(`${finalDate}T${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}:00`);
              if (isNaN(eventDateObj.getTime())) throw new Error("Invalid date");
              
              const endDateObj = new Date(eventDateObj.getTime() + (suggestion.type === "ride" ? 0.5 : 2) * 60 * 60 * 1000);
              eventParams = {
                start: { dateTime: eventDateObj.toISOString(), timeZone: 'Europe/Prague' },
                end: { dateTime: endDateObj.toISOString(), timeZone: 'Europe/Prague' },
              };
            } catch {
              // Fallback na celodenní událost
              eventParams = {
                start: { date: finalDate },
                end: { date: (() => { const d = new Date(finalDate); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })() },
              };
            }
          } else {
            // Nestandartní čas (otevírací doba, "celý den" atd.) → celodenní událost
            let eventDateString = finalDate;
            if (!eventDateString) {
              const dayOffset = suggestion.suggestedTime === "sobota" ? 6 : 0; 
              eventDateString = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), dayOffset + 5).toISOString().split('T')[0];
            }
            try {
              const startDateObj = new Date(eventDateString);
              if (isNaN(startDateObj.getTime())) throw new Error("Invalid date");
              const endDateObj = new Date(startDateObj);
              endDateObj.setDate(endDateObj.getDate() + 1);
              eventParams = {
                start: { date: eventDateString },
                end: { date: endDateObj.toISOString().split('T')[0] },
              };
            } catch {
              // Úplný fallback — příští sobota
              const nextSat = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 5);
              const nextSun = addDays(nextSat, 1);
              eventParams = {
                start: { date: nextSat.toISOString().split('T')[0] },
                end: { date: nextSun.toISOString().split('T')[0] },
              };
            }
          }
        } else {
          // Žádný čas → celodenní událost
          let eventDateString = finalDate;
          if (!eventDateString) {
            const dayOffset = suggestion.suggestedTime === "sobota" ? 6 : 0; 
            eventDateString = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), dayOffset + 5).toISOString().split('T')[0];
          }
          
          try {
            const startDateObj = new Date(eventDateString);
            if (isNaN(startDateObj.getTime())) throw new Error("Invalid date");
            const endDateObj = new Date(startDateObj);
            endDateObj.setDate(endDateObj.getDate() + 1);
            const endDateString = endDateObj.toISOString().split('T')[0];

            eventParams = {
              start: { date: eventDateString },
              end: { date: endDateString },
            };
          } catch {
            const nextSat = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 5);
            const nextSun = addDays(nextSat, 1);
            eventParams = {
              start: { date: nextSat.toISOString().split('T')[0] },
              end: { date: nextSun.toISOString().split('T')[0] },
            };
          }
        }

        const isRide = suggestion.type === "ride";
        const event = {
          summary: isRide ? `🚗 ${suggestion.childName}: ${suggestion.rideFrom} ➡️ ${suggestion.rideTo}` : `${suggestion.childName}: ${suggestion.title}`,
          description: `${suggestion.childName}: ${suggestion.description}`,
          extendedProperties: {
            private: {
              app: 'vikendovnik',
              suggestionId: suggestion.id
            }
          },
          ...(isRide ? {
             transparency: 'transparent', // Neoznačí jako "Mám plno"
             colorId: '11', // Červená barva (Tomato) pro odvozy
             reminders: {
               useDefault: false,
               overrides: [
                 { method: 'popup', minutes: 30 },
               ],
             }
          } : {}),
          ...eventParams
        };

        const res = await fetch(`${API_BASE_URL}/api/calendar/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokens: googleTokens, event }),
        });

        if (!res.ok) {
           const errData = await res.json().catch(() => ({}));
           const errStr = errData.error || errData.message || res.statusText || "Neznámá chyba serveru";
           
           // Uložíme chybovou hlášku do Firebase, ale status necháme 'pending' (čekající)
           await updateDoc(doc(db, 'suggestions', id), { 
             calendarError: errStr 
           });
           
           if (res.status === 401 || errStr.includes("invalid_grant")) {
             setGoogleTokens(null); // Resetujeme klíče
           }
           
           setApprovingEvent(null);
           throw new Error(errStr);
        }

        const createdEvent = await res.json();
        calendarEventId = createdEvent.id;
      }

      // Pokud jsme zde, nedošlo k chybě (nebo se jen zamítá). 
      // Můžeme aktivitu finálně schválit a aktualizovat data.
       const updateData: any = { status };
       
       if (status === "rejected" && reason) {
         if (suggestion.reconsiderationRequested || suggestion.appealReason) {
           updateData.finalRejectReason = reason;
           updateData.reconsiderationRequested = false;
         } else {
           updateData.rejectReason = reason;
         }
       }
      
      if (status === "approved" && (overrideDate !== undefined || overrideTime !== undefined)) {
        if (overrideDate !== undefined) updateData.eventDate = overrideDate;
        if (overrideTime !== undefined) updateData.eventTime = overrideTime;
        updateData.adminModifiedTime = true;
      }

      if (status === "approved") {
        if (approvedDetails !== undefined) updateData.approvedDetails = approvedDetails;
        if (approvedFree !== undefined) updateData.approvedFree = approvedFree;
      }
      
      if (calendarEventId) {
        updateData.calendarEventId = calendarEventId;
      }
      
      // Smazat případnou starou chybu
      updateData.calendarError = null;

      await updateDoc(doc(db, 'suggestions', id), updateData);
      setApprovingEvent(null);

      // --- Zápis notifikace dětem ---
      try {
        const childUserId = suggestion.authorId || findChildUserId(suggestion.childName) || "";
        const activityTitle = suggestion.title || (suggestion.type === 'ride' ? `Odvoz z ${suggestion.rideFrom} do ${suggestion.rideTo}` : "Aktivita");
        
        let notificationText = "";
        if (status === "approved") {
          let dateText = finalDate || "";
          if (finalTime) {
            const endT = getEndTimeStr(finalTime, suggestion.type === "ride");
            dateText = `${finalDate} (${finalTime} - ${endT})`;
          }
          
          if (reason) {
            notificationText = `✏️ Aktivita "${activityTitle}" byla upravena a schválena na ${dateText}. Důvod: ${reason}`;
          } else {
            notificationText = `🎉 Hurá! Aktivita "${activityTitle}" byla schválena na ${dateText}.`;
          }
        } else if (status === "rejected") {
          notificationText = `❌ Aktivita "${activityTitle}" nebyla schválena. Důvod: ${reason || "Bez udání důvodu"}`;
        }

        if (notificationText) {
          await addDoc(collection(db, 'notifications'), {
            userId: childUserId || "",
            childName: suggestion.childName,
            text: notificationText,
            suggestionId: id,
            type: status === "approved" ? (reason ? "modified" : "approved") : "rejected",
            read: false,
            createdAt: Date.now()
          });
        }
      } catch (notifErr) {
        console.error("Failed to write notification to Firestore:", notifErr);
      }

      if (status === "approved" && googleTokens) {
        fetchCalendarEvents(googleTokens);
      }
    } catch (err: any) {
      console.error("Update failed", err);
      if (err instanceof Error && err.message.includes("permission")) {
        setError("Nemáte oprávnění (nejste administrátor) nebo chybí pravidla v databázi Firestore.");
      } else {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingActivity || !rejectReasonText.trim()) return;
    try {
      await handleUpdateStatus(rejectingActivity.id, "rejected", undefined, undefined, rejectReasonText.trim());
      setRejectingActivity(null);
      setRejectReasonText("");
    } catch (err) {
      console.error("Rejection failed", err);
    }
  };

  const handleReopen = async (id: string) => {
    const path = `suggestions/${id}`;
    try {
      await updateDoc(doc(db, 'suggestions', id), { 
        status: "pending",
        reconsiderationRequested: false
      });
    } catch (err: any) {
      console.error("Reopen failed", err);
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleRepeatCancelledActivity = async (id: string) => {
    const path = `suggestions/${id}`;
    try {
      await updateDoc(doc(db, 'suggestions', id), { 
        status: "pending",
        reconsiderationRequested: deleteField(),
        hasAppealed: deleteField(),
        rejectReason: deleteField(),
        appealReason: deleteField(),
        finalRejectReason: deleteField()
      } as any);
    } catch (err: any) {
      console.error("Repeat cancelled activity failed", err);
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleOpenAppeal = (suggestion: ActivitySuggestion) => {
    setAppealingEvent(suggestion);
    setAppealReason("");
  };

  const submitAppeal = async () => {
    if (!appealingEvent) return;
    const path = `suggestions/${appealingEvent.id}`;
    try {
      await updateDoc(doc(db, 'suggestions', appealingEvent.id), { 
        reconsiderationRequested: true,
        hasAppealed: true,
        ...(appealReason.trim() ? { appealReason: appealReason.trim() } : {})
      });
      setAppealingEvent(null);
    } catch (err: any) {
      console.error("Appeal failed", err);
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleDeleteSuggestion = async (suggestion: ActivitySuggestion) => {
    if (suggestion.status === "approved") {
      // Otevřít okno pro zdůvodnění zrušení / smazání
      setCancellingEvent(suggestion);
      setCancelReason("");
      return;
    }

    // Pokud ještě nebyla schválena, prostě smažeme záznam z aplikace
    try {
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'suggestions', suggestion.id));
    } catch (err: any) {
      console.error("Smazání selhalo", err);
      if (err instanceof Error && err.message.includes("permission")) {
        setError("K mazání nemáte oprávnění (pouze administrátor).");
      }
    }
  };

  const handleBulkDeleteConfirmed = async (status: "rejected" | "cancelled") => {
    try {
      const toDelete = suggestions.filter(s => {
        if (s.status !== status || s.hiddenFromBoard) return false;
        if (status === "rejected") {
          // Žádosti o odvoz se mažou vždy
          if (s.type === "ride") return true;
          // Zamítnuté u kterých je stále možnost Znovu otevřít k posouzení smazány nebudou.
          const canBeReopened = !s.hasAppealed || s.reconsiderationRequested;
          if (canBeReopened) return false;
        }
        return true;
      });
      
      if (toDelete.length === 0) {
        const statusLabel = status === 'rejected' ? 'Zamítnuté' : 'Zrušené';
        setError(`Nenalezeny žádné aktivity se statusem "${statusLabel}" ke smazání (nebo je lze ještě přehodnotit).`);
        return;
      }
      
      const { deleteDoc, updateDoc } = await import('firebase/firestore');
      
      for (const s of toDelete) {
        if (status === "cancelled") {
          // Keep in history, hide from board
          await updateDoc(doc(db, 'suggestions', s.id), { hiddenFromBoard: true });
        } else {
          // Delete permanently
          await deleteDoc(doc(db, 'suggestions', s.id));
        }
      }
      setSuccess(`Aktivity (${toDelete.length}) byly úspěšně odstraněny z nástěnky.`);
      setIsDeleteMode(false);
      setDeleteFilterStatus(null);
      setBoardFilter("all");
    } catch (err: any) {
      console.error("Hromadné mazání selhalo", err);
      setError("Chyba při hromadném mazání.");
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancellingEvent || !cancelReason.trim()) return;

    try {
      const suggestion = cancellingEvent;
      const path = `suggestions/${suggestion.id}`;

      // Smazání z kalendáře v případě schválené události
      if (suggestion.calendarEventId && googleTokens) {
        const res = await fetch(`${API_BASE_URL}/api/calendar/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokens: googleTokens, eventId: suggestion.calendarEventId }),
        });
        
        if (!res.ok) {
           const errData = await res.json().catch(() => ({}));
           const errStr = errData.error || errData.message || res.statusText || "Neznámá chyba při mazání z kalendáře.";
           
           if (res.status === 401 || errStr.includes("invalid_grant")) {
             setGoogleTokens(null); // Odhlásit, vyžádat nový token
           }
           
           setError(`Smazání z kalendáře selhalo: ${errStr}`);
           return; // Zastavit mazání, dokud to nepůjde smazat v kalendáři
        }
        
        fetchCalendarEvents(googleTokens);
      }

      // Pouze ji "zrušíme" pro vhled v historii, místo smazání
      await updateDoc(doc(db, 'suggestions', suggestion.id), {
        status: "cancelled",
        rejectReason: cancelReason
      });

      setCancellingEvent(null);
      setCancelReason("");
    } catch (err: any) {
      console.error("Smazání selhalo", err);
      if (err instanceof Error && err.message.includes("permission")) {
        setError("K úpravě nemáte oprávnění (pouze administrátor).");
      }
    }
  };

  return (
    <div className="min-h-screen text-stone-800 font-sans selection:bg-rose-100 w-full max-w-full" style={{ backgroundImage: "url('/bg.png')", backgroundSize: 'cover', backgroundPosition: 'center bottom', backgroundAttachment: 'fixed' }}>
      {/* Header */}
      <header className={cn(
        "z-50 bg-white border-b-2 border-stone-200 px-4 md:px-8 transition-all duration-300 flex items-center justify-between w-full box-border",
        isLandscape 
          ? isHeaderExpandedLandscape 
            ? "sticky top-0 h-12 py-1" 
            : "hidden"
          : "sticky top-0 py-2 md:py-2.5 overflow-hidden"
      )}>
        <div className="flex items-center">
          <img 
            src="/logo.png" 
            alt="Víkendovník" 
            className={cn(
              "w-auto object-contain border-none outline-none origin-left",
              isLandscape 
                ? "h-10 scale-100" 
                : "h-12 md:h-16 scale-[1.3] md:scale-[1.5]"
            )} 
          />
        </div>

        {weather && !(isLandscape && !isHeaderExpandedLandscape) && (
          <button 
            onClick={() => setShowWeatherModal(true)}
            className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center gap-2 bg-stone-50 hover:bg-stone-100 transition-colors cursor-pointer px-3 py-1.5 rounded-full border border-stone-200 text-sm font-semibold text-stone-600 shadow-sm mx-auto"
          >
            <span className="text-lg leading-none">{weather.icon}</span>
            <span>{weather.temp} °C</span>
            <span className="text-stone-400 font-medium">{weather.city}</span>
          </button>
        )}
        
        <div 
          className="flex items-center gap-3 ml-auto z-10 pointer-events-auto"
        >
          {user ? (
            <>
              {canApproveActivities && !(isLandscape && !isHeaderExpandedLandscape) && (
                <button 
                  onClick={() => {
                    setView(view === "parent" ? "child" : "parent");
                    setIsDeleteMode(false);
                    setDeleteFilterStatus(null);
                    setBoardFilter("all");
                    setShowInspirationsView(false);
                    setShowArchive(false);
                    setShowUserManagement(false);
                    setShowVyskovOnly(false);
                    setExpandedInspiration(null);
                    setExpandedSuggestion(null);
                  }}
                  className={cn(
                    "flex items-center gap-2 px-3 rounded-lg text-stone-500 hover:bg-rose-50 hover:text-rose-500 transition-colors text-sm font-semibold",
                    isLandscape ? "py-1" : "py-2"
                  )}
                >
                  {view === "parent" ? <User size={16} /> : <Settings size={16} />}
                  {view === "parent" ? "Rodina" : "Administrátor"}
                </button>
              )}

              {isDemoMode ? (
                <div
                  onClick={() => {
                    if (isLandscape) {
                      handleAvatarClickLandscape();
                    }
                  }}
                  className={cn(
                    "w-10 h-10 rounded-full border-2 border-violet-400 bg-violet-50 overflow-hidden shadow-sm flex items-center justify-center cursor-default select-none",
                    isLandscape && "cursor-pointer"
                  )}
                  title="Demo Dítě"
                >
                  <span className="text-xl leading-none">🧪</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      if (isLandscape) {
                        handleAvatarClickLandscape();
                      } else {
                        setShowAvatarModal(true);
                      }
                    }}
                    className="w-10 h-10 rounded-full border-2 border-rose-200 bg-white overflow-hidden shadow-sm flex items-center justify-center hover:border-rose-400 transition-all cursor-pointer"
                    title={isLandscape ? "Rozbalit/Sbalit lištu" : "Změnit avatara"}
                  >
                    {extendedUserProfiles[currentUserId]?.avatar ? (
                      extendedUserProfiles[currentUserId].avatar.startsWith("data:") || extendedUserProfiles[currentUserId].avatar.startsWith("http") ? (
                        <img src={extendedUserProfiles[currentUserId].avatar} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xl leading-none">{extendedUserProfiles[currentUserId].avatar}</span>
                      )
                    ) : user.photoURL ? (
                        <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <User size={20} className="text-stone-400" />
                    )}
                  </button>
                  {!(isLandscape && !isHeaderExpandedLandscape) && (
                    <button
                      onClick={() => setShowAvatarModal(true)}
                      className="p-1.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 hover:text-stone-700 transition-colors cursor-pointer"
                      title="Změnit avatara"
                    >
                      <Edit size={14} />
                    </button>
                  )}
                </div>
              )}
              {!(isLandscape && !isHeaderExpandedLandscape) && (
                <button 
                  onClick={handleLogout}
                  className="p-2 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Odhlásit se"
                >
                  <LogOut size={18} />
                </button>
              )}
            </>
          ) : null}
        </div>
      </header>

      {/* Floating avatar button — visible only in landscape with collapsed header */}
      {isLandscape && !isHeaderExpandedLandscape && user && (
        <div className="fixed top-2 right-3 z-[60] pointer-events-auto">
          {isDemoMode ? (
            <div
              onClick={handleAvatarClickLandscape}
              className="w-9 h-9 rounded-full border-2 border-violet-400 bg-violet-50 overflow-hidden shadow-lg flex items-center justify-center cursor-pointer select-none"
              title="Rozbalit lištu"
            >
              <span className="text-xl leading-none">🧪</span>
            </div>
          ) : (
            <button
              onClick={handleAvatarClickLandscape}
              className="w-9 h-9 rounded-full border-2 border-rose-300 bg-white overflow-hidden shadow-lg flex items-center justify-center hover:border-rose-500 transition-all cursor-pointer"
              title="Rozbalit lištu"
            >
              {extendedUserProfiles[currentUserId]?.avatar ? (
                extendedUserProfiles[currentUserId].avatar.startsWith("data:") || extendedUserProfiles[currentUserId].avatar.startsWith("http") ? (
                  <img src={extendedUserProfiles[currentUserId].avatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg leading-none">{extendedUserProfiles[currentUserId].avatar}</span>
                )
              ) : user.photoURL ? (
                <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User size={18} className="text-stone-400" />
              )}
            </button>
          )}
        </div>
      )}

      <AnimatePresence mode="wait">
      {!user ? (
        <motion.main 
          key="login"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center justify-center flex-grow p-6 mt-12"
        >
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center text-center max-w-sm w-full bg-white p-10 rounded-3xl shadow-[0_10px_20px_-10px_rgba(0,0,0,0.05)] border border-stone-200"
          >
            <div className="w-48 h-48 mb-6 rounded-3xl overflow-hidden shadow-lg border border-stone-100 flex items-center justify-center bg-stone-50 relative">
              <img 
                src="/hero-image.png" 
                alt="Rodinný výlet" 
                className="w-full h-full object-cover" 
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 400 400"><rect width="400" height="400" fill="%23f8fafc"/><text x="50%" y="50%" font-family="sans-serif" font-size="14" fill="%2394a3b8" text-anchor="middle" dy=".3em">Obrázek hero-image.png nebyl nalezen</text></svg>`
                }}
              />
            </div>
            
            <img src="/logo.png" alt="Víkendovník" className="h-14 md:h-16 w-auto object-contain mx-auto mb-2 scale-[1.3] origin-center shadow-none outline-none" />
            
            <p className="text-stone-500 mb-8 text-[15px] leading-relaxed mt-2">
              Rodinná nástěnka pro ty nejlepší společné nápady, kam vyrazit.
            </p>
            <button 
              onClick={handleLogin}
              className="flex items-center gap-3 px-6 py-3.5 rounded-xl bg-rose-500 text-white hover:bg-rose-600 transition-all hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 text-[15px] font-bold w-full justify-center"
            >
              <LogIn size={18} />
              Přihlásit se googlem
            </button>
          </motion.div>
        </motion.main>
      ) : userProfiles[user.uid]?.isBlocked ? (
        <motion.main 
          key="blocked"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center justify-center flex-grow p-6 mt-12"
        >
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center text-center max-w-sm w-full bg-white p-10 rounded-3xl shadow-[0_10px_20px_-10px_rgba(0,0,0,0.05)] border border-rose-200"
          >
            <AlertTriangle size={64} className="text-rose-500 mb-6" />
            <h1 className="text-2xl font-bold mb-4">Přístup odepřen</h1>
            <p className="text-stone-500 mb-8">Váš účet byl zablokován administrátorem aplikace.</p>
            <button 
              onClick={handleLogout} 
              className="flex items-center gap-3 px-6 py-3.5 rounded-xl bg-stone-100 text-stone-600 hover:bg-stone-200 transition-all text-[15px] font-bold w-full justify-center"
            >
              Odhlásit se
            </button>
          </motion.div>
        </motion.main>
      ) : (
      <motion.main 
        key="dashboard"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
        className={cn(
          "flex-grow relative box-border",
          isLandscape
            ? "grid grid-cols-[220px_1fr] gap-3 p-2 w-full"
            : "grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6 md:p-6 max-w-6xl mx-auto pb-32 md:pb-6 px-4"
        )}
      >
        {/* Error Notification */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: -20, x: "-50%" }}
              className="fixed top-6 left-1/2 z-[100] w-[90%] max-w-md bg-red-100 border border-red-200 p-4 rounded-xl flex items-center justify-between shadow-lg"
            >
              <div className="flex items-center gap-3 text-red-700 text-sm font-medium">
                <AlertCircle size={18} />
                {error}
              </div>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 p-1 transition-colors">
                <X size={16} />
              </button>
            </motion.div>
          )}
          {success && (
            <motion.div 
              initial={{ opacity: 0, y: -20, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: -20, x: "-50%" }}
              className="fixed top-6 left-1/2 z-[100] w-[90%] max-w-md bg-emerald-100 border border-emerald-200 p-4 rounded-xl flex items-center justify-between shadow-lg"
            >
              <div className="flex items-center gap-3 text-emerald-700 text-sm font-medium">
                <Check size={18} />
                {success}
              </div>
              <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-emerald-600 p-1 transition-colors">
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        
        <aside 
          className={cn(
            "flex flex-col gap-5 overflow-y-auto scrollbar-hide [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            isLandscape 
              ? "sticky top-0 h-screen pb-4 mx-0 px-0 pt-1" 
              : "md:sticky md:top-[80px] md:h-fit md:max-h-[calc(100vh-100px)] md:pb-4 md:mx-0 md:px-0 -mx-2 px-2"
          )}
          style={{ 
            maxHeight: isLandscape ? '100vh' : undefined
          }}
        >
          {/* Welcome Section */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-rose-50 border border-rose-200 rounded-2xl p-5 flex flex-col shadow-[inset_0_4px_8px_rgba(255,255,255,0.9),inset_0_-3px_6px_rgba(0,0,0,0.03),0_6px_12px_-2px_rgba(0,0,0,0.06)]"
          >
            <div className="text-[13px] uppercase tracking-widest text-rose-500 mb-2 font-bold flex items-center gap-2">
              <span>💡</span> {view === "parent" ? "Administrace" : "Ahoj všichni!"}
            </div>
            <p className="text-[13px] text-rose-800 mt-0 mb-4">
              {view === "parent" 
                ? "Schvalujte nápady ostatních a plánujte společný čas." 
                : "Napište sem svůj nápad, co bychom mohli společně podniknout!"}
            </p>
            {view === "parent" && !googleTokens && (
              <button 
                onClick={handleConnectGoogle}
                className="px-4 py-2.5 rounded-xl bg-rose-500 text-white font-bold text-xs w-full flex items-center justify-center gap-2 hover:bg-rose-600 transition-colors mb-3"
              >
                <img src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_48dp.png" className="w-4 h-4" referrerPolicy="no-referrer" />
                Propojit s Google Kalendářem
              </button>
            )}
            {view === "parent" && (
              <div className={cn("grid gap-2", (canManageSystem || currentUserRole === 'parent') ? "grid-cols-2" : "grid-cols-1")}>
                {(canManageSystem || currentUserRole === 'parent') && (
                  <button
                    onClick={() => setShowUserManagement(true)}
                    className="flex flex-col items-center justify-center gap-1.5 p-3 text-center leading-tight rounded-xl bg-indigo-600 text-white font-bold text-xs w-full hover:bg-indigo-700 transition-all shadow-lg hover:-translate-y-0.5"
                  >
                    <Shield size={24} />
                    <span>Admin HUB</span>
                  </button>
                )}
                {canApproveActivities && (
                  <button
                    onClick={() => { 
                      if (showInspirationsView) { 
                        setExpandedInspiration(null); 
                        setShowVyskovOnly(false);
                      } 
                      else { setTimeout(() => inspirationsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }
                      setShowInspirationsView(!showInspirationsView); 
                    }}
                    className="flex flex-col items-center justify-center gap-1.5 p-3 text-center leading-tight rounded-xl bg-indigo-500 text-white font-bold text-xs w-full hover:bg-indigo-600 transition-colors shadow-sm"
                  >
                    {showInspirationsView ? (
                      <>
                        <span className="text-xl">🏠</span>
                        <span>Zpět na nástěnku</span>
                      </>
                    ) : (
                      <>
                        <span className="text-xl">✨</span>
                        <span>Inspirace na víkend</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
            {view === "child" && (
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => {
                    setFormType("activity");
                    setNewSuggestion(prev => ({ ...prev, childName: getLoggedInFamilyName() }));
                    setShowForm(true);
                  }}
                  className="flex flex-col items-center justify-center gap-1.5 p-3 text-center leading-tight rounded-xl bg-rose-500 text-white font-bold text-xs w-full hover:bg-rose-600 transition-colors shadow-sm"
                >
                  <Plus size={24} />
                  <span>Přidat aktivitu</span>
                </button>
                {extendedUserProfiles[currentUserId]?.role !== 'viewer' && (
                  <>
                    <button 
                      onClick={() => {
                        setFormType("ride");
                        setNewSuggestion(prev => ({ ...prev, childName: getLoggedInFamilyName() }));
                        setShowForm(true);
                      }}
                      className="flex flex-col items-center justify-center gap-1.5 p-3 text-center leading-tight rounded-xl bg-orange-500 text-white font-bold text-xs w-full hover:bg-orange-600 transition-colors shadow-sm"
                    >
                      <span className="text-xl">🚗</span>
                      <span>Potřebuji odvézt</span>
                    </button>
                    <button
                      onClick={() => { 
                        if (showInspirationsView) { 
                          setExpandedInspiration(null); 
                          setShowVyskovOnly(false);
                        } 
                        else { setTimeout(() => inspirationsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }
                        setShowInspirationsView(!showInspirationsView); 
                      }}
                      className="flex flex-col items-center justify-center gap-1.5 p-3 text-center leading-tight rounded-xl bg-indigo-500 text-white font-bold text-xs w-full hover:bg-indigo-600 transition-colors shadow-sm"
                    >
                      {showInspirationsView ? (
                        <>
                          <span className="text-xl">🏠</span>
                          <span>Zpět na nástěnku</span>
                        </>
                      ) : (
                        <>
                          <span className="text-xl">✨</span>
                          <span>Inspirace na víkend</span>
                        </>
                      )}
                    </button>
                    {showInspirationsView && (
                      <button 
                        onClick={() => setShowVyskovOnly(!showVyskovOnly)}
                        className={cn(
                          "flex flex-col items-center justify-center gap-1.5 p-3 text-center leading-tight rounded-xl font-bold text-xs w-full transition-all shadow-sm border-2",
                          showVyskovOnly 
                            ? "bg-amber-400 border-amber-500 text-amber-950" 
                            : "bg-white border-indigo-100 text-indigo-500 hover:border-indigo-200"
                        )}
                      >
                        <span className="text-xl">🏰</span>
                        <span>{showVyskovOnly ? "Všechny tipy" : "Akce ve Vyškově"}</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </motion.div>

          {/* Archive Panel Button */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-stone-50 border border-stone-200 rounded-2xl p-5 flex flex-col shadow-[inset_0_4px_8px_rgba(255,255,255,1),inset_0_-3px_6px_rgba(0,0,0,0.03),0_6px_12px_-2px_rgba(0,0,0,0.05)]"
          >
            <div className="text-[13px] uppercase tracking-widest text-stone-500 mb-2 font-bold flex items-center gap-2">
              <span>📚</span> Historie a Archív
            </div>
            <p className="text-[13px] text-stone-600 mt-0 mb-4">
              Zavzpomínejte na staré aktivity, ohodnoťte je, nebo je rovnou zopakujte!
            </p>
            <button 
              onClick={() => setShowArchive(true)}
              className="px-4 py-2.5 rounded-xl bg-stone-200 text-stone-700 font-bold text-xs w-full flex items-center justify-center gap-2 hover:bg-stone-300 transition-colors shadow-sm"
            >
              Otevřít archív
            </button>
          </motion.div>

          {/* === GENERÁTOR CYKLOTRAS — dostupný všem přihlášeným uživatelům === */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <BikeRouteGenerator
              userCity={weather?.city}
              userId={user?.uid}
              authorName={getLoggedInFamilyName() || user?.displayName || user?.email || 'Uživatel'}
              onGenerated={() => {
                // Přepnout na Nástěnku, kde se zobrazí nové "pískoviště" s návrhy
                setShowInspirationsView(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </motion.div>

          {/* Game Hub Entry Button */}
          {leaderboard.length > 0 && (
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => setShowGameHub(true)}
              className="w-full bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white rounded-2xl p-4 flex items-center justify-center gap-3 font-bold text-sm shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 transition-all hover:-translate-y-0.5 active:scale-[0.98]"
            >
              <span className="text-lg">⚡</span>
              Game Hub
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">XP</span>
            </motion.button>
          )}

          {leaderboard.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-b from-amber-50 to-orange-50 border text-center border-amber-200 rounded-2xl p-5 shadow-[inset_0_4px_8px_rgba(255,255,255,0.8),inset_0_-3px_6px_rgba(0,0,0,0.04),0_6px_12px_-2px_rgba(0,0,0,0.07)]"
            >
              <div className="text-[13px] uppercase tracking-widest text-amber-600 mb-4 font-extrabold flex items-center justify-center gap-2">
                Souhrn aktivit
              </div>
              <div className="flex flex-col gap-2">
                {leaderboard.map((l) => {
                  const isChild = l.role === 'child';

                  return (
                    <button 
                      key={l.childName} 
                      onClick={() => setSelectedLeaderboardUser(l.childName)}
                      className="w-full flex items-center justify-between bg-white p-3 rounded-xl border border-amber-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:bg-orange-50 transition-all cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-white border border-stone-200 flex items-center justify-center flex-shrink-0">
                          {l.avatar.startsWith('http') || l.avatar.startsWith('data:') ? (
                            <img src={l.avatar} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-base leading-none">{l.avatar}</span>
                          )}
                        </div>
                        <span className="font-bold text-stone-700 text-sm">
                          {l.childName}
                          {isChild && <span className="text-stone-400 font-semibold ml-2">({l.xp} XP)</span>}
                        </span>
                      </div>
                      <div className="text-sm font-extrabold text-white bg-amber-400 px-3 py-1 rounded-full">{l.score}</div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Calendar Events Section */}
          {view === "parent" && googleTokens && (
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-5 flex flex-col">
              <div className="text-[13px] uppercase tracking-widest text-stone-400 mb-4 font-bold flex items-center gap-2">
                <span>📅</span> Plán na nejbližší dny
              </div>
              <div>
                {calendarEvents.length > 0 ? (
                  calendarEvents.map((event, idx) => (
                    <div key={event.id} className="p-3 border-l-4 border-rose-500 bg-stone-50 mb-3 rounded-r-lg">
                      <div className="text-[11px] text-stone-500 font-semibold">
                        {format(parseISO(event.start.dateTime || event.start.date), "EEEE d. MMMM HH:mm", { locale: cs })}
                      </div>
                      <div className="text-sm font-bold my-1 text-stone-900">{event.summary}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-stone-500 text-center py-4 bg-stone-50 rounded-lg border border-stone-100">
                    Zatím nemáte žádné nadcházející aktivity. Až dětem nějaký nápad schválíte, objeví se zde.
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>

        {/* Suggestions List */}
        <section 
          className={cn(
            "flex flex-col gap-5",
            isLandscape ? "overflow-y-auto h-screen" : ""
          )}
        >
          {showInspirationsView ? (
            <div ref={inspirationsRef} className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-[24px] p-5 md:p-8 border border-indigo-100 shadow-[inset_0_4px_8px_rgba(255,255,255,0.8),inset_0_-3px_6px_rgba(0,0,0,0.02),0_6px_12px_-2px_rgba(0,0,0,0.05)] flex flex-col gap-6 min-h-[400px]">
              <div className="flex flex-wrap justify-between items-center gap-3">
                <div className="text-lg md:text-xl uppercase tracking-widest text-indigo-500 font-extrabold flex items-center gap-2 drop-shadow-sm">
                  <span>{showVyskovOnly ? "🏰" : "✨"}</span> {showVyskovOnly ? "Akce ve Vyškově" : "Inspirace na víkend z AI"}
                </div>
                {view === "parent" && (
                  <button 
                    onClick={handleGenerateInspirations}
                    disabled={isGeneratingInspiration}
                    className="px-5 py-2.5 rounded-xl bg-indigo-500 text-white font-bold text-sm shadow-sm hover:bg-indigo-600 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isGeneratingInspiration ? "AI hledá na internetu..." : "Vyhledat nové tipy"}
                  </button>
                )}
              </div>
              
              {inspirations.length > 0 ? (() => {
                const filtered = inspirations
                  .filter(insp => {
                    if (showVyskovOnly && !insp.is_vyskov) return false;
                    // Draft trasy jsou soukromé — vidí je pouze jejich autor
                    if ((insp as any).status === 'draft') {
                      return (insp as any).userId === user?.uid;
                    }
                    // Proposed trasy (čekají na schválení) — vidí autor + admini/parent
                    if ((insp as any).status === 'proposed') {
                      return (insp as any).userId === user?.uid || view === 'parent';
                    }
                    // Schválené trasy — filtrování dle role a targetGroup
                    if (currentUserRole === 'admin' || currentUserRole === 'parent' || view === 'parent') return true;
                    if (currentUserRole === 'child') {
                      const myProfile = extendedUserProfiles[currentUserId];
                      const myTargetGroup = myProfile?.targetGroup;
                      // Pokud child nemá nastavený targetGroup → vidí vše (bezpečný výchozí stav)
                      if (!myTargetGroup || myTargetGroup === 'pro_vsechny') return true;
                      // Vidí tipy pro sebe + tipy pro všechny
                      return insp.target === myTargetGroup || insp.target === 'pro_vsechny';
                    }
                    // viewer a ostatní — pouze pro_vsechny
                    return insp.target === 'pro_vsechny';
                  });
                const makeCard = (insp: any) => {
                      // Zjistíme, zda je tip "nový" – vygenerovaný dnes (source='ai' + generatedAt = dnes)
                      const isNewToday = (() => {
                        const raw = (insp as any).generatedAt;
                        if (!raw || (insp as any).source !== 'ai') return false;
                        const genDate = raw?.toDate ? raw.toDate() : new Date(raw);
                        const today = new Date();
                        return genDate.getFullYear() === today.getFullYear() &&
                               genDate.getMonth() === today.getMonth() &&
                               genDate.getDate() === today.getDate();
                      })();
                      return (
                    <div id={`insp-${insp.id}`} key={insp.id} className={`w-full bg-white p-6 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow self-start ${isNewToday ? 'border-2 border-emerald-300 shadow-emerald-100' : 'border border-indigo-50'}`}>
                      <div>
                        {/* Badge pro draft/proposed cyklotrasy */}
                        {(insp as any).status === 'draft' && (
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-[10px] font-black bg-amber-50 text-amber-600 border border-amber-200 px-2.5 py-1 rounded-full uppercase tracking-wide flex items-center gap-1">
                              🔒 Moje soukromá trasa
                            </span>
                            <span className="text-[10px] text-stone-400">Viditelná jen tobě</span>
                          </div>
                        )}
                        {(insp as any).status === 'proposed' && (
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 border border-indigo-200 px-2.5 py-1 rounded-full uppercase tracking-wide flex items-center gap-1">
                              ⏳ Čeká na schválení
                            </span>
                          </div>
                        )}
                        {/* Badge "Nové" pro tipy vygenerované dnes */}
                        {isNewToday && (
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full uppercase tracking-wide flex items-center gap-1 animate-pulse">
                              ✨ Nové
                            </span>
                            <span className="text-[10px] text-stone-400">Právě vygenerováno</span>
                          </div>
                        )}
                        {view === "parent" && (
                          <div className="flex justify-between items-start mb-4">
                            <span className={cn(
                              "text-xs font-extrabold px-3 py-1.5 rounded-full uppercase tracking-wider",
                              insp.target === 'pro_dceru' ? 'bg-pink-100 text-pink-600' : 
                              insp.target === 'pro_syna' ? 'bg-blue-100 text-blue-600' : 
                              'bg-green-100 text-green-600'
                            )}>
                              {insp.target === 'pro_dceru' ? '👧 Pro dceru' : insp.target === 'pro_syna' ? '👦 Pro syna' : '👨‍👩‍👧‍👦 Pro rodinu'}
                            </span>
                          </div>
                        )}
                        <h4 className="font-extrabold text-stone-800 text-lg mb-1 leading-tight">{insp.title}</h4>
                        {insp.location && (
                          <div className="mb-3">
                            {(() => {
                              const isCycling = (insp.url && insp.url.includes('mapy.cz') && (insp.url.includes('rc=') || insp.url.includes('routeType='))) || 
                                /cykl|kolo|bike|cycling/i.test(insp.title + ' ' + insp.description);
                              const navUrl = (isCycling && insp.url && insp.url.includes('mapy.cz')) 
                                ? insp.url 
                                : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(insp.location.replace(/\s*\(.*?\)\s*/g, '').trim())}`;
                              
                              return (
                                <a 
                                  href={navUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 transition-colors font-bold"
                                >
                                  <MapPin size={12} /> {insp.location}
                                </a>
                              );
                            })()}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {insp.indoor !== undefined && insp.indoor !== null && (
                            <span className={cn(
                              "text-[10px] font-bold px-2 py-0.5 rounded-full",
                              insp.indoor ? "bg-blue-50 text-blue-500 border border-blue-100" : "bg-emerald-50 text-emerald-500 border border-emerald-100"
                            )}>
                              {insp.indoor ? "🏠 Pod střechou" : "🌳 Venku"}
                            </span>
                          )}
                          {insp.price && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">
                              💰 {insp.price}
                            </span>
                          )}
                          {insp.duration && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-500 border border-purple-100">
                              ⏱️ {insp.duration}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-stone-600 leading-relaxed mb-6">{insp.description}</p>
                        
                        <AnimatePresence>
                          {expandedInspiration === insp.id && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="mb-6 p-5 bg-gradient-to-br from-indigo-50/80 to-purple-50/60 rounded-xl border border-indigo-100/50 text-sm text-indigo-900 space-y-3 overflow-hidden"
                            >
                              <div className="font-bold text-indigo-600 text-xs uppercase tracking-wider mb-2">📋 Podrobnosti</div>
                              
                              <div className="flex items-center gap-2">
                                <Calendar size={14} className="text-indigo-400 flex-shrink-0" />
                                <strong>Datum:</strong> {insp.date ? (() => { 
                                  try { 
                                    return insp.date.split(',').map((d: string) => format(parseISO(d.trim()), "dd. MMMM yyyy", { locale: cs })).join(' - '); 
                                  } catch { 
                                    return insp.date; 
                                  } 
                                })() : "Bude upřesněno"}
                              </div>
                              
                              {insp.time_type === 'opening_hours' && insp.opening_hours ? (
                                <div className="flex items-center gap-2">
                                  <Clock size={14} className="text-indigo-400 flex-shrink-0" />
                                  <strong>Otevírací doba:</strong> {insp.opening_hours}
                                </div>
                              ) : insp.time_type === 'all_day' ? (
                                <div className="flex items-center gap-2">
                                  <Clock size={14} className="text-indigo-400 flex-shrink-0" />
                                  <strong>Kdy:</strong> Celý den
                                </div>
                              ) : insp.time_type === 'flexible' ? (
                                <div className="flex items-center gap-2">
                                  <Clock size={14} className="text-indigo-400 flex-shrink-0" />
                                  <strong>Kdy:</strong> Kdykoli
                                </div>
                              ) : insp.time ? (
                                <div className="flex items-center gap-2">
                                  <Clock size={14} className="text-indigo-400 flex-shrink-0" />
                                  <strong>Začátek:</strong> {insp.time}
                                </div>
                              ) : null}
                              
                              <div className="flex items-center gap-2">
                                <MapPin size={14} className="text-indigo-400 flex-shrink-0" />
                                <strong>Místo:</strong> {insp.location}
                              </div>

                              {insp.price && (
                                <div className="flex items-center gap-2">
                                  <span className="text-indigo-400 flex-shrink-0 text-xs font-bold">💰</span>
                                  <strong>Cena:</strong> {insp.price}
                                </div>
                              )}

                              {insp.duration && (
                                <div className="flex items-center gap-2">
                                  <Timer size={14} className="text-indigo-400 flex-shrink-0" />
                                  <strong>Délka:</strong> {insp.duration}
                                </div>
                              )}

                              {/* Cyklo detaily */}
                              {insp.cycling_info && (
                                <div className="bg-indigo-500/5 p-3 rounded-xl border border-indigo-500/10 space-y-2 mt-2">
                                  <div className="text-[10px] uppercase tracking-wider font-extrabold text-indigo-500/60 mb-1">🚴 Parametry trasy</div>
                                  <div className="grid grid-cols-3 gap-2">
                                    <div className="flex flex-col">
                                      <span className="text-[10px] text-stone-400 font-bold uppercase">Vzdálenost</span>
                                      <span className="text-xs font-extrabold text-indigo-600">{insp.cycling_info.distance}</span>
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-[10px] text-stone-400 font-bold uppercase">Převýšení</span>
                                      <span className="text-xs font-extrabold text-indigo-600">{insp.cycling_info.elevation}</span>
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-[10px] text-stone-400 font-bold uppercase">Čas jízdy</span>
                                      <span className="text-xs font-extrabold text-indigo-600">{insp.cycling_info.duration}</span>
                                    </div>
                                  </div>
                                  {insp.cycling_info.difficulty && (
                                    <div className="flex items-center gap-1.5 pt-1 border-t border-indigo-100 mt-1">
                                      <span className="text-[10px] text-stone-400 font-bold uppercase">Obtížnost:</span>
                                      <span className="text-[11px] font-extrabold text-emerald-600">{insp.cycling_info.difficulty}</span>
                                    </div>
                                  )}
                                </div>
                              )}



                              {/* Indoor/Outdoor badge */}
                              {insp.indoor !== undefined && insp.indoor !== null && (
                                <div className="flex items-center gap-2">
                                  <Home size={14} className="text-indigo-400 flex-shrink-0" />
                                  <strong>{insp.indoor ? "Pod střechou 🏠" : "Venku 🌳"}</strong>
                                </div>
                              )}

                              {/* Cinema Listings */}
                              {insp.cinema_listings && insp.cinema_listings.filter((l: any) => (l.film || l.film_title) && (l.film || l.film_title).trim() !== "").length > 0 && (
                                <div className="mt-3 border-t border-indigo-100/50 pt-3">
                                  <div className="font-bold text-indigo-600 text-xs uppercase tracking-wider mb-3 flex items-center gap-1">
                                    <Film size={12} /> Program kina
                                  </div>
                                  <div className="cinema-scroll max-h-72 overflow-y-auto space-y-2 pr-1">
                                    {insp.cinema_listings
                                      .filter((listing: any) => (listing.film || listing.film_title) && (listing.film || listing.film_title).trim() !== "")
                                      .map((listing: any, idx: number) => (
                                      <div key={idx} className="flex items-start gap-3 bg-white rounded-lg p-3 border border-indigo-100/50 shadow-sm">
                                        <span className="text-lg flex-shrink-0">🎬</span>
                                        <div className="min-w-0">
                                          <div className="font-bold text-stone-800 text-sm leading-tight">{listing.film || listing.film_title}</div>
                                          <div className="text-xs text-stone-500 mt-0.5 flex flex-wrap gap-1 items-center">
                                            🕐 
                                            {listing.times && listing.times.length > 0 ? (
                                              listing.times.map((t: any, tidx: number) => (
                                                <a key={tidx} href={t.url} target="_blank" rel="noopener noreferrer" className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-100 hover:bg-indigo-100 transition-colors cursor-pointer">
                                                  {t.time}
                                                </a>
                                              ))
                                            ) : (
                                              <span>{listing.time || listing.showtimes || "Dle programu"}</span>
                                            )}
                                          </div>
                                          {listing.url && (!listing.times || listing.times.length === 0) && (
                                            <a href={listing.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-500 hover:text-indigo-700 font-medium mt-1 inline-block">🎟 Vstupenky →</a>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  <p className="text-[10px] text-indigo-300 mt-1 text-right italic">Scroll pro zobrazení více filmů</p>
                                </div>
                              )}

                              {/* Action buttons */}
                              {(() => {
                                const isCycling = (insp.url && insp.url.includes('mapy.cz') && (insp.url.includes('rc=') || insp.url.includes('routeType='))) || 
                                  /cykl|kolo|bike|cycling/i.test(insp.title + ' ' + insp.description);
                                
                                const getCyclingUrl = () => {
                                  // Přednost má přímo vygenerovaná URL od AI
                                  if (insp.url && insp.url.includes('mapy.cz') && (insp.url.includes('rc=') || insp.url.includes('routeType='))) {
                                    return insp.url;
                                  }

                                  // Fallback na starší extrakci z názvu (pokud chybí url z AI)
                                  const routeMatch = insp.title.match(/\(([^)]+)\)/);
                                  if (routeMatch) {
                                    const points = routeMatch[1].split(/\s*[-–→]\s*/).map(p => p.trim());
                                    if (points.length >= 2) {
                                      const origin = points[0];
                                      const destination = points[points.length - 1];
                                      const waypoints = points.slice(1, -1).join('|');
                                      
                                      let googleUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=bicycling`;
                                      if (waypoints) {
                                        googleUrl += `&waypoints=${encodeURIComponent(waypoints)}`;
                                      }
                                      return googleUrl;
                                    }
                                  }
                                  
                                  // Ultimátní fallback na Google Maps cíl
                                  const cleanLoc = insp.location.replace(/\s*\(.*?\)\s*/g, '').trim();
                                  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cleanLoc)}&travelmode=bicycling`;
                                };
                                
                                if (extendedUserProfiles[currentUserId]?.role === 'child') return null;

                                if (insp.status === 'draft') {
                                  return (
                                    <button 
                                      onClick={() => handleProposeBikeRoute(insp.id)}
                                      className="mt-4 w-full py-3 bg-indigo-500 text-white font-bold rounded-xl hover:bg-indigo-600 transition-colors shadow-sm flex items-center justify-center gap-2 text-xs"
                                    >
                                      🚀 Navrhnout rodině
                                    </button>
                                  );
                                }

                                if (insp.status === 'proposed' && canApproveActivities) {
                                  return (
                                    <button 
                                      onClick={() => handleApproveBikeRoute(insp.id)}
                                      className="mt-4 w-full py-3 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-colors shadow-sm flex items-center justify-center gap-2 text-xs"
                                    >
                                      ✅ Schválit pro všechny
                                    </button>
                                  );
                                }

                                if (extendedUserProfiles[currentUserId]?.role === 'child') return null;

                                return (
                                  <div className="flex flex-wrap gap-2 mt-3 border-t border-indigo-100/50 pt-3">
                                    {isCycling ? (
                                      /* Cyklo trasa — jen tlačítko Trasa s URL */
                                      <a 
                                        href={getCyclingUrl()}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-lg border border-indigo-200 text-indigo-600 font-bold text-xs hover:bg-indigo-50 transition-colors shadow-sm"
                                      >
                                        <Navigation size={14} />
                                        Naplánovat trasu
                                      </a>
                                    ) : (
                                      /* Běžná akce — Pouze web akce, Navigovat bylo odstraněno a přesunuto pod nadpis */
                                      insp.url && (
                                        <a 
                                          href={insp.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-lg border border-indigo-200 text-indigo-600 font-bold text-xs hover:bg-indigo-50 transition-colors shadow-sm"
                                        >
                                          <ExternalLink size={14} />
                                          Web akce
                                        </a>
                                      )
                                    )}
                              </div>
                                );
                              })()}
                              
                              <div className="text-xs text-indigo-400 mt-1 italic">
                                * Informace jsou orientační dle vyhledávání AI agenta.
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            if (expandedInspiration === insp.id) {
                              setExpandedInspiration(null);
                            } else {
                              setExpandedInspiration(insp.id);
                              setTimeout(() => {
                                const el = document.getElementById(`insp-${insp.id}`);
                                if (el) {
                                  const y = el.getBoundingClientRect().top + window.scrollY - 80; // 80px offset pro hlavičku
                                  window.scrollTo({ top: y, behavior: 'smooth' });
                                }
                              }, 100);
                            }
                          }}
                          className="flex-1 py-3 bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1"
                        >
                          {expandedInspiration === insp.id ? "Méně info" : "Více info"}
                        </button>
                        {(() => {
                          const isAlreadyProposed = suggestions.some(s => s.title === insp.title && s.status !== 'rejected');
                          return (
                            <button 
                              disabled={isAlreadyProposed}
                              onClick={() => {
                                if (isAlreadyProposed) return;
                                setNewSuggestion(prev => ({
                                  ...prev,
                                  title: insp.title,
                                  description: insp.description,
                                  eventDate: insp.date || "",
                                  eventTime: insp.time || "",
                                  location: insp.location || "",
                                  url: insp.url || "",
                                  childName: getLoggedInFamilyName(),
                                  cinemaListings: insp.cinema_listings || []
                                }));
                                setFormType("activity");
                                setShowForm(true);
                                setShowInspirationsView(false);
                              }}
                              className={cn(
                                "flex-[2] py-3 font-bold text-xs rounded-xl transition-colors border",
                                isAlreadyProposed 
                                  ? "bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed"
                                  : "bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border-indigo-200 cursor-pointer"
                              )}
                            >
                              {isAlreadyProposed ? "Již navrženo" : "Chci tohle navrhnout!"}
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                    );
                  };
                  return (
                    <>
                      {/* Desktop: 2 skutečně nezávislé flex sloupce.
                          Rozbalení karty v jednom sloupci NEOVLIVNÍ sloupec vedlejší. */}
                      <div className="hidden md:flex gap-5 items-start pb-4">
                        <div className="flex-1 flex flex-col gap-5 min-w-0">
                          {filtered.filter((_, i) => i % 2 === 0).map(makeCard)}
                        </div>
                        <div className="flex-1 flex flex-col gap-5 min-w-0">
                          {filtered.filter((_, i) => i % 2 !== 0).map(makeCard)}
                        </div>
                      </div>
                      {/* Mobil: jeden sloupec */}
                      <div className="md:hidden flex flex-col gap-5 pb-4">
                        {filtered.map(makeCard)}
                      </div>
                    </>
                  );
                })() : (
                <div className="flex-grow flex flex-col items-center justify-center text-center p-8 bg-white/50 rounded-2xl border border-indigo-100/50 border-dashed">
                  <div className="text-4xl mb-4 opacity-50">🤖</div>
                  <p className="text-lg text-indigo-800 font-semibold opacity-80 max-w-md">
                    Zatím tu nejsou žádné AI tipy. Administrátor je musí nejprve vygenerovat.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <>
              <div 
                className={cn(
                  "sticky z-40 bg-white/85 backdrop-blur-xl shadow-sm border-b border-stone-200/50 mb-2",
                  isLandscape 
                    ? "top-0 mx-0 px-2 py-1.5 flex flex-col gap-1.5 rounded-xl" 
                    : "top-[56px] md:top-[80px] -mx-6 px-6 md:-mx-2 md:px-4 md:rounded-2xl py-4 flex flex-col gap-3 md:border"
                )}
              >
                {!isLandscape && (
                  <div className="text-[13px] uppercase tracking-widest text-stone-500 font-bold flex items-center justify-center md:justify-start gap-2 drop-shadow-sm">
                    <span>🌟</span> Nástěnka přání a nápadů
                  </div>
                )}
                
                <div className={cn("flex gap-2 w-full", isLandscape ? "items-center justify-between" : "flex-wrap justify-between")}>
                  <div className={cn(
                    "flex gap-2",
                    isLandscape 
                      ? "overflow-x-auto flex-nowrap whitespace-nowrap pb-1 scrollbar-none flex-1 max-w-[calc(100%-40px)]" 
                      : "flex-wrap justify-center md:justify-start"
                  )}>
                    {(isDeleteMode 
                      ? [
                          { id: "rejected", label: "Zamítnuté" },
                          { id: "cancelled", label: "Zrušené" }
                        ]
                      : [
                          { id: "all", label: "Vše" },
                          { id: "pending", label: "Čekající" },
                          { id: "approved", label: "Schválené" },
                          { id: "rejected", label: "Zamítnuté" },
                          { id: "cancelled", label: "Zrušené" },
                          { id: "ride", label: "🚗 Odvoz" },
                          { id: "bike", label: "🚴 Cyklotrasy" },
                          { id: "trash", label: "Odpad" }
                        ]
                    ).map(f => (
                      <button
                        key={f.id}
                        onClick={() => {
                          if (isDeleteMode) {
                            const status = f.id as "rejected" | "cancelled";
                            if (deleteFilterStatus === status) {
                              // Druhý klik na stejné tlačítko → potvrzovací modal
                              setShowBulkDeleteModal(status);
                            } else {
                              // První klik → filtrovat a zobrazit náhled
                              const deletable = suggestions.filter(s => {
                                if (s.status !== status || s.hiddenFromBoard) return false;
                                if (status === "rejected") {
                                  if (s.type === "ride") return true;
                                  const canBeReopened = !s.hasAppealed || s.reconsiderationRequested;
                                  if (canBeReopened) return false;
                                }
                                return true;
                              });
                              if (deletable.length === 0) {
                                setShowNothingToDeleteModal(true);
                                setDeleteFilterStatus(null);
                                setBoardFilter("all");
                              } else {
                                setDeleteFilterStatus(status);
                                setBoardFilter(status);
                              }
                            }
                          } else {
                            setBoardFilter(f.id as any);
                          }
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex-shrink-0",
                          isDeleteMode 
                            ? deleteFilterStatus === f.id
                              ? "bg-rose-500 text-white border border-rose-500 shadow-md"
                              : "bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 hover:border-rose-300"
                            : boardFilter === f.id 
                              ? "bg-stone-700 text-white shadow-md border-transparent" 
                              : "bg-white text-stone-500 border border-stone-200 hover:border-stone-300 hover:text-stone-700"
                        )}
                      >
                        <span className="flex items-center gap-1">
                          {f.id === "trash" && <Trash2 size={13} />}
                          {deleteFilterStatus === f.id ? `🗑️ ${f.label} — potvrdit smazání` : f.label}
                        </span>
                      </button>
                    ))}
                  </div>
                  
                  {view === "parent" && (
                    <button
                      onClick={() => { setIsDeleteMode(!isDeleteMode); setDeleteFilterStatus(null); if (!isDeleteMode) setBoardFilter("all"); else setBoardFilter("all"); }}
                      className={cn(
                        "p-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ml-auto flex-shrink-0 h-8 w-8 flex items-center justify-center",
                        isDeleteMode
                          ? "bg-green-100 text-green-600 border border-green-200 hover:bg-green-200"
                          : "bg-rose-50 text-rose-500 border border-rose-200 hover:border-rose-300 hover:text-rose-600 hover:bg-rose-100"
                      )}
                      title={isDeleteMode ? "Zrušit mazání" : "Hromadné mazání"}
                    >
                      {isDeleteMode ? <ArrowLeft size={16} /> : <Trash2 size={16} />}
                    </button>
                  )}
              </div>
            </div>

            {/* Moje rozpracované cyklotrasy (Návrhy) — dostupné jen autorovi */}
            {suggestions.some(insp => (insp as any).status === 'draft' && (insp as any).authorId === user?.uid) && (
              <div ref={draftsRef} className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-orange-50 overflow-hidden shadow-sm mb-10">
                {/* Hlavička — kliknutím rozbalí/sbalí */}
                <button
                  onClick={() => setIsDraftsExpanded(v => !v)}
                  className="w-full flex items-center justify-between p-4 text-left group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
                      <Bike className="text-white" size={20} />
                    </div>
                    <div>
                      <div className="font-bold text-stone-800 text-sm leading-tight">Moje rozpracované cyklotrasy (Návrhy)</div>
                      <div className="text-[11px] text-amber-600 font-semibold">Viditelné jen pro tebe</div>
                    </div>
                  </div>
                  <ChevronRight
                    size={18}
                    className={cn(
                      "text-stone-400 transition-transform duration-200",
                      isDraftsExpanded && "rotate-90"
                    )}
                  />
                </button>

                <AnimatePresence>
                  {isDraftsExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-5 flex flex-col gap-5">
                        <div className="border-t border-amber-100" />
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          {suggestions
                            .filter(insp => (insp as any).status === 'draft' && (insp as any).authorId === user?.uid)
                            .map(insp => (
                              <motion.div 
                                key={insp.id}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="bg-white border-2 border-amber-200/50 p-6 rounded-[24px] shadow-sm relative group overflow-hidden hover:shadow-xl hover:shadow-amber-500/5 transition-all duration-300"
                              >
                                {/* Background decoration */}
                                <div className="absolute -top-6 -right-6 p-4 opacity-[0.04] pointer-events-none rotate-12 group-hover:rotate-0 transition-transform duration-700">
                                   <Bike size={140} />
                                </div>

                                <div className="flex justify-between items-start mb-3 relative z-10">
                                  <div className="flex flex-col gap-1 items-start">
                                    <h4 className="font-black text-stone-800 text-lg leading-tight group-hover:text-amber-600 transition-colors">{insp.title}</h4>
                                    <div className="flex gap-2">
                                      {(insp as any).routeType === 'random' ? (
                                        <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg font-bold border border-amber-200">🎲 Náhodný tip</span>
                                      ) : (
                                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg font-bold border border-emerald-200">🎯 Trasa na míru</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <p className="text-sm text-stone-500 mb-5 line-clamp-2 italic leading-relaxed">
                                  {insp.description}
                                </p>

                                {insp.cycling_info && (
                                  <div className="grid grid-cols-3 gap-3 bg-stone-50/80 backdrop-blur-sm p-4 rounded-2xl border border-stone-100 mb-5">
                                    <div className="flex flex-col">
                                      <span className="text-[9px] text-stone-400 font-black uppercase tracking-tighter">Vzdálenost</span>
                                      <span className="text-xs font-black text-amber-600">{(insp as any).actualDistance ? `${(insp as any).actualDistance} km` : insp.cycling_info.distance}</span>
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-[9px] text-stone-400 font-black uppercase tracking-tighter">Převýšení</span>
                                      <span className="text-xs font-black text-amber-600">{insp.cycling_info.elevation}</span>
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-[9px] text-stone-400 font-black uppercase tracking-tighter">Obtížnost</span>
                                      <span className="text-xs font-black text-emerald-600">{insp.cycling_info.difficulty || 'Střední'}</span>
                                    </div>
                                  </div>
                                )}

                                <div className="flex flex-col gap-2.5 relative z-10">
                                  <button 
                                    onClick={() => handleProposeBikeRoute(insp.id)}
                                    className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-xl font-bold text-xs shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 group/btn active:scale-95 cursor-pointer"
                                  >
                                    <Sparkles size={14} className="group-hover/btn:animate-pulse" />
                                    Navrhnout jako rodinnou aktivitu
                                  </button>
                                  <div className="flex gap-2.5">
                                    <a 
                                      href={insp.url} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="flex-1 py-3 bg-white border border-stone-200 hover:border-amber-200 hover:bg-amber-50 text-stone-600 hover:text-amber-700 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm"
                                    >
                                      <MapPin size={14} /> Mapa
                                    </a>
                                    <button 
                                      onClick={() => handleDeleteInspiration(insp.id)}
                                      className="px-4 py-3 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-xl font-bold text-xs transition-all flex items-center justify-center border border-rose-100 shadow-sm active:scale-90 cursor-pointer"
                                      title="Smazat návrh"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

          {(() => {
            const filteredBoardSuggestions = suggestions
                  .filter(suggestion => {
                    if (suggestion.status === "draft") return false;
                    if (suggestion.hiddenFromBoard) return false;
                    if (currentUserRole === 'child') {
                      const childName = getLoggedInFamilyName();
                      if (!suggestion.childName || suggestion.childName.toLowerCase() !== childName.toLowerCase()) {
                        return false;
                      }
                    }
                    if (suggestion.status === "approved" && suggestion.eventDate) {
                      const eventDate = new Date(suggestion.eventDate);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      if (eventDate < today) {
                        return false;
                      }
                    }
                    if (boardFilter === "all") return true;
                    if (boardFilter === "ride") return suggestion.type === "ride";
                    if (boardFilter === "bike") {
                      const isBikeRoute = suggestion.cycling_info !== undefined || 
                        (suggestion.url && suggestion.url.includes("mapy.cz")) ||
                        /cykl|kolo|bike|cycling/i.test(suggestion.title + " " + suggestion.description);
                      const isApprovedOrPending = suggestion.status === "approved" || 
                        suggestion.status === "pending" || 
                        (suggestion.status === "rejected" && suggestion.reconsiderationRequested);
                      return isApprovedOrPending && isBikeRoute;
                    }
                    if (boardFilter === "pending") {
                      return suggestion.status === "pending" || (suggestion.status === "rejected" && suggestion.reconsiderationRequested);
                    }
                    if (boardFilter === "rejected") {
                      return suggestion.status === "rejected" && !suggestion.reconsiderationRequested && !suggestion.hasAppealed;
                    }
                    if (boardFilter === "trash") {
                      return suggestion.status === "rejected" && suggestion.hasAppealed && !suggestion.reconsiderationRequested;
                    }
                    return suggestion.status === boardFilter;
                  })
                  .sort((a, b) => {
                    const reqA = a.status === "pending" || (a.status === "rejected" && a.reconsiderationRequested === true);
                    const reqB = b.status === "pending" || (b.status === "rejected" && b.reconsiderationRequested === true);

                    if (reqA && !reqB) return -1;
                    if (!reqA && reqB) return 1;

                    // Pro obě skupiny řadíme podle času vytvoření (novější nahoře)
                    const getMillis = (ts: any) => {
                      if (!ts) return 0;
                      if (typeof ts === 'number') return ts;
                      if (typeof ts.toMillis === 'function') return ts.toMillis();
                      if (typeof ts.toDate === 'function') return ts.toDate().getTime();
                      return 0;
                    };
                    const timeA = getMillis(a.createdAt);
                    const timeB = getMillis(b.createdAt);
                    return timeB - timeA;
                  });

            const renderBoardCard = (suggestion: any) => (
                  <motion.div
                    key={suggestion.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={cn(
                      "break-inside-avoid inline-block w-full mb-4 bg-white rounded-[20px] p-5 border-2 transition-all shadow-[inset_0_4px_8px_rgba(255,255,255,1),inset_0_-3px_6px_rgba(0,0,0,0.03),0_12px_24px_-6px_rgba(0,0,0,0.08)] flex flex-col justify-between min-h-[160px]",
                      suggestion.reconsiderationRequested ? "bg-orange-50 border-orange-400 ring-4 ring-orange-200/50 shadow-orange-100" :
                      suggestion.status === "approved" ? "bg-green-50 border-green-100" :
                      suggestion.status === "rejected" ? "bg-red-50 border-red-100" :
                      suggestion.status === "cancelled" ? "bg-stone-100 border-stone-200 opacity-80 grayscale-[50%]" :
                      "bg-amber-50 border-amber-100"
                    )}
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex flex-wrap gap-2">
                          <div className={cn(
                            "text-[10px] uppercase px-2 py-1 rounded-full font-extrabold w-fit mb-2",
                            suggestion.status === "approved" ? "bg-green-500 text-white" :
                            (suggestion.status === "rejected" && !suggestion.reconsiderationRequested) ? "bg-red-500 text-white" :
                            suggestion.status === "cancelled" ? "bg-stone-500 text-white" :
                            "bg-amber-500 text-white"
                          )}>
                            {suggestion.status === "approved" ? "Schváleno" :
                             (suggestion.status === "rejected" && !suggestion.reconsiderationRequested) ? "Zamítnuto" :
                             suggestion.status === "cancelled" ? "Zrušeno" : "Čeká na schválení"}
                          </div>
                          {suggestion.type === "ride" && (
                            <div className="text-[10px] uppercase px-2 py-1 rounded-full font-extrabold w-fit mb-2 bg-orange-100 text-orange-600 border border-orange-200">
                              🚗 Potřebuji odvézt
                            </div>
                          )}
                        </div>

                        <div className="flex items-start gap-1">
                          {suggestion.location && (
                            <button 
                              onClick={() => setExpandedSuggestion(expandedSuggestion === suggestion.id ? null : suggestion.id)}
                              className="text-[10px] uppercase px-2 py-1 rounded-full font-extrabold bg-indigo-100 text-indigo-600 border border-indigo-200 hover:bg-indigo-200 transition-colors cursor-pointer"
                            >
                              {expandedSuggestion === suggestion.id ? "Skrýt" : "Detail"}
                            </button>
                          )}
                          {canApproveActivities && (
                            <button
                              onClick={() => handleDeleteSuggestion(suggestion)}
                              className="p-1 text-stone-300 hover:text-red-500 transition-colors"
                              title="Smazat / zrušit nápad"
                            >
                              <X size={20} />
                            </button>
                          )}
                        </div>
                      </div>

                      <h3 className="text-lg font-extrabold my-3 text-stone-900">{suggestion.title}</h3>
                      <p className="text-[13px] text-stone-600 leading-relaxed whitespace-pre-wrap">{suggestion.description}</p>
                      
                      {suggestion.location && (
                        <>
                          {(() => {
                            const isCycling = (suggestion.url && suggestion.url.includes('mapy.cz') && (suggestion.url.includes('rc=') || suggestion.url.includes('routeType='))) || 
                              /cykl|kolo|bike|cycling/i.test(suggestion.title + ' ' + suggestion.description);

                            const navUrl = (isCycling && suggestion.url && suggestion.url.includes('mapy.cz')) 
                              ? suggestion.url 
                              : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(suggestion.location.replace(/\s*\(.*?\)\s*/g, '').trim())}`;

                            return (
                              <a 
                                href={navUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-3 flex items-center gap-2 text-xs text-stone-500 font-medium p-2 rounded-lg hover:bg-rose-50 hover:text-rose-600 transition-colors active:bg-rose-100 cursor-pointer"
                              >
                                <MapPin size={14} className="text-rose-400 flex-shrink-0" />
                                <span className="underline decoration-dotted underline-offset-2">{suggestion.location}</span>
                              </a>
                            );
                          })()}
                          
                          <AnimatePresence>
                            {expandedSuggestion === suggestion.id && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mt-2 p-4 bg-gradient-to-br from-stone-50/80 to-rose-50/40 rounded-xl border border-stone-100 text-sm text-stone-700 space-y-2.5 overflow-hidden"
                              >
                                <div className="font-bold text-stone-500 text-xs uppercase tracking-wider mb-2">📋 Detail aktivity</div>
                                
                                {suggestion.eventDate && (
                                  <div className="flex items-center gap-2">
                                    <Calendar size={14} className="text-rose-400 flex-shrink-0" />
                                    <strong>Datum:</strong> {(() => { try { return format(parseISO(suggestion.eventDate), "dd. MMMM yyyy", { locale: cs }); } catch { return suggestion.eventDate; } })()}
                                    {suggestion.adminModifiedTime && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded ml-2 uppercase tracking-wide font-bold">Změněno administrátorem</span>}
                                  </div>
                                )}
                                
                                {suggestion.eventTime && (
                                  <div className="flex items-center gap-2">
                                    <Clock size={14} className="text-rose-400 flex-shrink-0" />
                                    <strong>Čas:</strong> {suggestion.eventTime}
                                  </div>
                                )}
                                
                                <div className="flex items-center gap-2">
                                  <MapPin size={14} className="text-rose-400 flex-shrink-0" />
                                  <strong>Místo:</strong> {suggestion.location}
                                </div>

                                <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-stone-100">
                                  {(() => {
                                    const isCycling = (suggestion.url && suggestion.url.includes('mapy.cz') && (suggestion.url.includes('rc=') || suggestion.url.includes('routeType='))) || 
                                      /cykl|kolo|bike|cycling/i.test(suggestion.title + ' ' + suggestion.description);

                                    const navUrl = (isCycling && suggestion.url && suggestion.url.includes('mapy.cz')) 
                                      ? suggestion.url 
                                      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(suggestion.location.replace(/\s*\(.*?\)\s*/g, '').trim())}`;

                                    return (
                                      <>
                                        <a 
                                          href={navUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-rose-200 text-rose-500 font-bold text-xs hover:bg-rose-50 transition-colors shadow-sm"
                                        >
                                          <Navigation size={14} />
                                          {isCycling ? "Naplánovat trasu" : "Navigovat"}
                                        </a>
                                        {suggestion.url && (!suggestion.url.includes('mapy.cz') || !isCycling) && (
                                          <a 
                                            href={suggestion.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-indigo-200 text-indigo-600 font-bold text-xs hover:bg-indigo-50 transition-colors shadow-sm"
                                          >
                                            {(suggestion.title.toLowerCase().includes('kino') || suggestion.url.includes('cinestar') || suggestion.url.includes('mksvyskov')) 
                                              ? <><Film size={14} /> Koupit vstupenky</>
                                              : <><ExternalLink size={14} /> Více informací</>
                                            }
                                          </a>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </>
                      )}
                      

                      
                      {suggestion.calendarError && (
                        <div className="mt-3 p-3 bg-red-50 rounded-lg text-sm text-red-700 border border-red-200">
                          <strong>⚠️ Chyba zápisu do kalendáře:</strong><br/>
                          {suggestion.calendarError}
                        </div>
                      )}
                      
                      <div className="flex justify-between items-center mt-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full overflow-hidden bg-white border border-stone-200 flex items-center justify-center flex-shrink-0">
                              {(() => {
                                const av = getAvatarForChild(suggestion.childName);
                                return av.startsWith('http') || av.startsWith('data:') 
                                  ? <img src={av} className="w-full h-full object-cover" /> 
                                  : <span className="text-xs leading-none">{av}</span>;
                              })()}
                          </div>
                          <div className="text-[11px] text-stone-500 font-semibold">
                            Navrhl(a): <strong className="font-bold text-stone-700">{getDynamicNameForChild(suggestion.childName)}</strong> • {
                              suggestion.createdAt ? (
                                (() => {
                                  let d = new Date();
                                  if (typeof suggestion.createdAt === 'number') {
                                    d = new Date(suggestion.createdAt);
                                  } else if (suggestion.createdAt && typeof (suggestion.createdAt as any).toDate === 'function') {
                                    d = (suggestion.createdAt as any).toDate();
                                  } else if (suggestion.createdAt && typeof (suggestion.createdAt as any).toMillis === 'function') {
                                    d = new Date((suggestion.createdAt as any).toMillis());
                                  } else {
                                    return "Neznámé datum";
                                  }
                                  if (isNaN(d.getTime())) return "Neznámé datum";
                                  const options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' };
                                  return d.toLocaleString("cs-CZ", options);
                                })()
                              ) : "Neznámé datum"
                            }
                          </div>
                        </div>
                        
                        <button 
                          onClick={() => handleToggleLike(suggestion.id)}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-sm font-bold",
                            likedSuggestions.includes(suggestion.id) 
                              ? "bg-red-50 text-red-500" 
                              : "bg-stone-50 text-stone-400 hover:bg-stone-100"
                          )}
                        >
                          <Heart 
                            size={16} 
                            className={cn(likedSuggestions.includes(suggestion.id) ? "fill-current" : "")} 
                          />
                          {suggestion.likes || 0}
                        </button>
                      </div>
                    </div>

                    {canApproveActivities && suggestion.status === "pending" && (
                      <div className="mt-4 flex flex-col gap-2">
                        {/* Čistý textový výpis historie posuzování - řazeno od nejstaršího */}
                        {(suggestion.rejectReason || suggestion.appealReason || suggestion.finalRejectReason) && (
                          <div className="mt-2 mb-3 p-4 bg-stone-50 rounded-2xl border border-stone-200 text-left flex flex-col gap-3">
                            <div className="text-xs text-stone-700 space-y-2">
                              {/* 1. Položka: Vždy přítomný původní důvod */}
                              {suggestion.rejectReason && (
                                <div>
                                  <span className="font-bold">Důvod zamítnutí:</span> {suggestion.rejectReason}
                                </div>
                              )}

                              {/* 2. Položka: Zobrazí se, pokud dítě zažádalo o přehodnocení */}
                              {suggestion.appealReason && (
                                <div>
                                  <span className="font-bold">Důvod přehodnocení:</span> {suggestion.appealReason}
                                </div>
                              )}

                              {/* 3. Položka: Zobrazí se až na konci při definitivním zamítnutí */}
                              {suggestion.finalRejectReason && (
                                <div>
                                  <span className="font-bold">Důvod zamítnutí přehodnocení:</span> {suggestion.finalRejectReason}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {approvingEvent?.id === suggestion.id ? (
                          <div className="p-3 bg-green-50 rounded-xl border border-green-200 space-y-3">
                            <div>
                              <div className="text-[11px] font-bold text-green-700 mb-2 uppercase tracking-wider">Úprava data a času před schválením:</div>
                              <div className="flex gap-2">
                                <input 
                                  type="date" 
                                  value={approveDate}
                                  onChange={e => setApproveDate(e.target.value)}
                                  min={todayStr}
                                  className="w-full text-xs p-2 rounded-lg border border-stone-200 outline-none focus:ring-2 focus:ring-green-400 bg-white"
                                />
                                {(() => {
                                  const { hour: approveHour, minute: approveMin } = (() => {
                                    if (!approveTime) return { hour: '', minute: '' };
                                    const [h, m] = approveTime.split(':');
                                    let minVal = m || '00';
                                    const minNum = Math.round(parseInt(minVal, 10) / 5) * 5;
                                    const roundedMin = minNum >= 60 ? 55 : minNum;
                                    const formattedMin = String(roundedMin).padStart(2, '0');
                                    return { hour: h || '', minute: formattedMin };
                                  })();

                                  const handleApproveTimeChange = (newHour: string, newMin: string) => {
                                    if (!newHour && !newMin) {
                                      setApproveTime("");
                                    } else {
                                      const finalHour = newHour || "12";
                                      const finalMin = newMin || "00";
                                      setApproveTime(`${finalHour}:${finalMin}`);
                                    }
                                  };

                                  return (
                                    <div className="flex gap-2 w-full">
                                      <select
                                        value={approveHour}
                                        onChange={e => handleApproveTimeChange(e.target.value, approveMin)}
                                        className="bg-white border border-zinc-200 text-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-emerald-500 w-full"
                                      >
                                        <option value="">-- Hod</option>
                                        {HOURS.map(h => (
                                          <option key={h} value={h}>{h}</option>
                                        ))}
                                      </select>
                                      <select
                                        value={approveMin}
                                        onChange={e => handleApproveTimeChange(approveHour, e.target.value)}
                                        className="bg-white border border-zinc-200 text-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-emerald-500 w-full"
                                      >
                                        <option value="">-- Min</option>
                                        {MINUTES.map(m => (
                                          <option key={m} value={m}>{m}</option>
                                        ))}
                                      </select>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* Zobrazení nároků na bonusy a volba schválení/zamítnutí */}
                            {(suggestion.claimedDetails || suggestion.claimedFree) && (
                              <div className="space-y-2">
                                <div className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">Nárokované XP bonusy:</div>
                                <div className="flex flex-col gap-2">
                                  {suggestion.claimedDetails && (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDetails(!confirmDetails)}
                                      className={cn(
                                        "flex items-center justify-between p-2.5 rounded-xl border text-left text-xs font-bold transition-all w-full cursor-pointer",
                                        confirmDetails 
                                          ? "bg-cyan-50 border-cyan-200 text-cyan-800" 
                                          : "bg-stone-100 border-stone-200 text-stone-400 line-through"
                                      )}
                                    >
                                      <span>📝 Logistické detaily (+5 XP)</span>
                                      <span className={cn(
                                        "text-[9px] uppercase font-black px-1.5 py-0.5 rounded-lg border",
                                        confirmDetails ? "bg-cyan-500 border-cyan-500 text-white" : "bg-white border-stone-300 text-stone-500"
                                      )}>
                                        {confirmDetails ? "Schváleno" : "Odepřeno"}
                                      </span>
                                    </button>
                                  )}
                                  {suggestion.claimedFree && (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmFree(!confirmFree)}
                                      className={cn(
                                        "flex items-center justify-between p-2.5 rounded-xl border text-left text-xs font-bold transition-all w-full cursor-pointer",
                                        confirmFree 
                                          ? "bg-amber-50 border-amber-200 text-amber-800" 
                                          : "bg-stone-100 border-stone-200 text-stone-400 line-through"
                                      )}
                                    >
                                      <span>💰 Akce zdarma / sleva (+10 XP)</span>
                                      <span className={cn(
                                        "text-[9px] uppercase font-black px-1.5 py-0.5 rounded-lg border",
                                        confirmFree ? "bg-amber-500 border-amber-500 text-white" : "bg-white border-stone-300 text-stone-500"
                                      )}>
                                        {confirmFree ? "Schváleno" : "Odepřeno"}
                                      </span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            <div className="flex gap-2">
                              <button 
                                onClick={() => handleApproveAttempt(suggestion, approveDate, approveTime)}
                                className="px-4 py-2.5 rounded-xl bg-green-600 text-white font-bold text-xs hover:bg-green-700 transition-colors flex-1"
                              >
                                Potvrdit schválení
                              </button>
                              <button 
                                onClick={() => setApprovingEvent(null)}
                                className="px-4 py-2.5 rounded-xl bg-stone-200 text-stone-700 font-bold text-xs hover:bg-stone-300 transition-colors"
                              >
                                Zrušit
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button 
                              onClick={() => {
                                if (suggestion.type === "ride") {
                                  handleApproveAttempt(suggestion, suggestion.eventDate || "", suggestion.eventTime || "");
                                } else {
                                  setApprovingEvent(suggestion);
                                  setApproveDate(suggestion.eventDate || "");
                                  setApproveTime(suggestion.eventTime || "");
                                  setConfirmDetails(!!suggestion.claimedDetails);
                                  setConfirmFree(!!suggestion.claimedFree);
                                }
                              }}
                              className="px-4 py-2.5 rounded-xl bg-green-500 text-white font-bold text-xs hover:opacity-90 transition-opacity flex-1"
                            >
                              Schválit
                            </button>
                            <button 
                              onClick={() => {
                                setRejectingActivity(suggestion);
                                setRejectReasonText("");
                              }}
                              className="px-4 py-2.5 rounded-xl bg-red-500 text-white font-bold text-xs hover:opacity-90 transition-opacity flex-1"
                            >
                              Zamítnout
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {suggestion.status === "rejected" && (
                      <div className="mt-4 p-4 bg-stone-50 rounded-2xl border border-stone-200 text-left flex flex-col gap-3">
                        
                        {/* Čistý textový výpis historie posuzování - řazeno od nejstaršího */}
                        <div className="text-xs text-stone-700 space-y-2">
                          
                          {/* 1. Položka: Vždy přítomný původní důvod */}
                          {suggestion.rejectReason && (
                            <div>
                              <span className="font-bold">Důvod zamítnutí:</span> {suggestion.rejectReason}
                            </div>
                          )}

                          {/* 2. Položka: Zobrazí se, pokud dítě zažádalo o přehodnocení */}
                          {suggestion.appealReason && (
                            <div>
                              <span className="font-bold">Důvod přehodnocení:</span> {suggestion.appealReason}
                            </div>
                          )}

                          {/* 3. Položka: Zobrazí se až na konci při definitivním zamítnutí */}
                          {suggestion.finalRejectReason && (
                            <div>
                              <span className="font-bold">Důvod zamítnutí přehodnocení:</span> {suggestion.finalRejectReason}
                            </div>
                          )}
                        </div>

                        {/* Spodní akční část / Definitivní text */}
                        <div className="pt-2 border-t border-stone-200/60">
                          {suggestion.reconsiderationRequested ? (
                            <>
                              {canApproveActivities ? (
                                <div className="space-y-2">
                                  <div className="text-[11px] text-amber-700 font-bold bg-amber-50 rounded-lg p-2 text-center border border-amber-200">
                                    ⚠️ Dítě žádá o přehodnocení
                                  </div>
                                  <button 
                                    onClick={() => handleReopen(suggestion.id)}
                                    className="px-4 py-2.5 rounded-xl bg-stone-950 text-white font-bold text-xs hover:bg-stone-800 transition-colors w-full cursor-pointer"
                                  >
                                    Znovu otevřít k posouzení
                                  </button>
                                </div>
                              ) : (
                                <div className="text-xs text-center text-stone-500 bg-stone-100 rounded-lg p-2">
                                  ⏳ Žádost o přehodnocení odeslána rodičům.
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              {suggestion.hasAppealed ? (
                                <div className="text-[11px] text-center text-stone-400 font-serif italic pt-1 leading-relaxed">
                                  „Tento ortel je vytesán do chladné skály,<br/>
                                  a všechny dřívější prosby už podzimní vítr svál.“
                                </div>
                              ) : (
                                view === "child" && user && user.uid === suggestion.authorId && suggestion.type !== "ride" && (
                                  <button 
                                    onClick={() => handleOpenAppeal(suggestion)}
                                    className="px-4 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-xs hover:bg-orange-600 transition-colors w-full cursor-pointer"
                                  >
                                    Požádat o přehodnocení
                                  </button>
                                )
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {suggestion.status === "cancelled" && (
                      <div className="mt-4 p-4 bg-stone-50 rounded-2xl border border-stone-200 text-left flex flex-col gap-3">
                        <div className="text-xs text-stone-700">
                          <span className="font-bold">Důvod zrušení:</span> {suggestion.rejectReason}
                        </div>
                        {(view === "parent" || (view === "child" && user && user.uid === suggestion.authorId)) && (
                          <div className="pt-2 border-t border-stone-200/60">
                            <button 
                              onClick={() => handleRepeatCancelledActivity(suggestion.id)}
                              className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition-colors w-full cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              🔄 Zopakovat aktivitu
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {suggestion.status === "approved" && (
                      <div className="text-[11px] text-green-700 font-semibold mt-3">
                        ✓ Zapsáno do Google kalendáře
                      </div>
                    )}
                  </motion.div>
                );

            const newIdeaCard = view === "child" ? (
                <motion.div
                  key="new-idea"
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={() => {
                    setFormType("activity");
                    setNewSuggestion(prev => ({ ...prev, childName: getLoggedInFamilyName() }));
                    setShowForm(true);
                  }}
                  className="w-full mb-4 rounded-[20px] p-5 border-2 border-dashed border-stone-200 flex flex-col justify-center items-center min-h-[160px] cursor-pointer hover:bg-stone-50 transition-colors"
                >
                  <div className="text-center text-stone-400">
                    <div className="text-3xl font-light mb-1">+</div>
                    <div className="text-sm font-bold">Další nápad</div>
                  </div>
                </motion.div>
            ) : null;

            return (
              <>
                {/* Desktop: 2 flex sloupce */}
                <div className="hidden md:flex gap-4 items-start pb-4">
                  <div className="flex-1 flex flex-col min-w-0">
                    <AnimatePresence mode="popLayout">
                      {filteredBoardSuggestions.filter((_, i) => i % 2 === 0).map(renderBoardCard)}
                      {filteredBoardSuggestions.length % 2 === 0 && newIdeaCard}
                    </AnimatePresence>
                  </div>
                  <div className="flex-1 flex flex-col min-w-0">
                    <AnimatePresence mode="popLayout">
                      {filteredBoardSuggestions.filter((_, i) => i % 2 !== 0).map(renderBoardCard)}
                      {filteredBoardSuggestions.length % 2 !== 0 && newIdeaCard}
                    </AnimatePresence>
                  </div>
                </div>
                {/* Mobil */}
                <div className="md:hidden flex flex-col pb-4">
                  <AnimatePresence mode="popLayout">
                    {filteredBoardSuggestions.map(renderBoardCard)}
                    {newIdeaCard}
                  </AnimatePresence>
                </div>
              </>
            );
          })()}
          </>
          )}
        </section>
      </motion.main>
      )}
      </AnimatePresence>

      {/* Floating Form Modal */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseForm}
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[32px] p-8 z-[70] shadow-2xl max-w-2xl mx-auto border-t border-stone-200 max-h-[90vh] overflow-y-auto"
            >
              <div className="w-12 h-1.5 bg-stone-200 rounded-full mx-auto mb-8" />
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-extrabold text-stone-900">{formType === "ride" ? "Potřebuji odvézt" : "Nový nápad"}</h3>
                <button type="button" onClick={handleCloseForm} className="bg-stone-100 p-2 rounded-full shadow-sm text-stone-500 hover:text-stone-800 transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={handleAddSuggestion} className="space-y-5">
                <div className="space-y-4">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2 block">Kdo {formType === "ride" ? "potřebuje odvoz" : "to navrhuje"}?</label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {dynamicFamilyMembers.map(name => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setNewSuggestion({...newSuggestion, childName: name})}
                          className={cn(
                            "px-4 py-2 rounded-full border-2 font-bold transition-all text-sm",
                            newSuggestion.childName === name ? "bg-rose-500 border-rose-500 text-white" : "bg-white border-stone-200 text-stone-500 hover:border-rose-300"
                          )}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                    {newSuggestion.childName === "Ostatní" && (
                      <motion.input 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        required
                        value={newSuggestion.customChildName}
                        onChange={e => setNewSuggestion({...newSuggestion, customChildName: e.target.value})}
                        placeholder="Napiš své jméno..."
                        className="w-full p-3 rounded-xl bg-stone-50 border border-stone-200 focus:border-rose-500 outline-none transition-all text-sm mt-2"
                      />
                    )}
                  </div>
                  
                  {formType === "activity" ? (
                    <>
                      {newSuggestion.cinemaListings && newSuggestion.cinemaListings.length > 0 && (
                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2 block">Které představení?</label>
                          <select 
                            className="w-full p-3 rounded-xl bg-stone-50 border border-stone-200 focus:border-rose-500 outline-none transition-all text-sm mb-4"
                            onChange={(e) => {
                              const [filmIdx, timeIdx] = e.target.value.split('-');
                              if (filmIdx === "" || !newSuggestion.cinemaListings[Number(filmIdx)]) return;
                              const listing = newSuggestion.cinemaListings[Number(filmIdx)];
                              const timeObj = listing.times?.[Number(timeIdx)];
                              setNewSuggestion(prev => ({
                                ...prev,
                                title: `Kino: ${listing.film || listing.film_title}`,
                                description: `Návrh na představení v čase ${timeObj?.time || listing.time || listing.showtimes}.`,
                                url: timeObj?.url || listing.url || prev.url
                              }));
                            }}
                          >
                            <option value="">-- Vyberte představení --</option>
                            {newSuggestion.cinemaListings.map((listing: any, fIdx: number) => {
                               if (listing.times && listing.times.length > 0) {
                                  return listing.times.map((t: any, tIdx: number) => (
                                    <option key={`${fIdx}-${tIdx}`} value={`${fIdx}-${tIdx}`}>
                                      {listing.film || listing.film_title} ({t.time})
                                    </option>
                                  ));
                               } else {
                                  return (
                                    <option key={`${fIdx}-0`} value={`${fIdx}-0`}>
                                      {listing.film || listing.film_title} ({listing.time || listing.showtimes})
                                    </option>
                                  );
                               }
                            })}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2 block">Co budeme dělat?</label>
                        <input 
                          required
                          value={newSuggestion.title}
                          onChange={e => setNewSuggestion({...newSuggestion, title: e.target.value})}
                          placeholder="Název aktivity"
                          className="w-full p-3 rounded-xl bg-stone-50 border border-stone-200 focus:border-rose-500 outline-none transition-all text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2 block">Detaily</label>
                        <textarea 
                          value={newSuggestion.description}
                          onChange={e => setNewSuggestion({...newSuggestion, description: e.target.value})}
                          placeholder="Popiš nám to víc..."
                          className="w-full p-3 rounded-xl bg-stone-50 border border-stone-200 focus:border-rose-500 outline-none transition-all h-24 resize-none text-sm"
                        />
                      </div>

                      <div className="space-y-3 pt-1">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 block">XP Bonusy k nárokování</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setNewSuggestion(prev => ({ ...prev, claimedDetails: !prev.claimedDetails }))}
                            className={cn(
                              "flex flex-col gap-1.5 p-4 rounded-xl border text-left transition-all cursor-pointer w-full select-none",
                              newSuggestion.claimedDetails 
                                ? "bg-cyan-500/15 border-cyan-500 text-cyan-800" 
                                : "bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100/50"
                            )}
                          >
                            <div className="text-xs font-bold">Mám k tomu i detaily</div>
                            <div className={cn(
                              "text-[10px] mt-0.5 leading-normal font-medium",
                              newSuggestion.claimedDetails ? "text-cyan-600" : "text-stone-400"
                            )}>+5 XP pokud dodáš odkaz, časový plán a logistiku</div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setNewSuggestion(prev => ({ ...prev, claimedFree: !prev.claimedFree }))}
                            className={cn(
                              "flex flex-col gap-1.5 p-4 rounded-xl border text-left transition-all cursor-pointer w-full select-none",
                              newSuggestion.claimedFree 
                                ? "bg-amber-500/15 border-amber-500 text-amber-800" 
                                : "bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100/50"
                            )}
                          >
                            <div className="text-xs font-bold">Akce je zdarma / se slevou</div>
                            <div className={cn(
                              "text-[10px] mt-0.5 leading-normal font-medium",
                              newSuggestion.claimedFree ? "text-amber-600" : "text-stone-400"
                            )}>+10 XP za super rozpočet</div>
                          </button>
                        </div>

                        {newSuggestion.claimedDetails && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-2 pt-1"
                          >
                            <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 block">Odkaz na stránky (URL)</label>
                            <input 
                              type="url"
                              value={newSuggestion.url || ""}
                              onChange={e => setNewSuggestion({...newSuggestion, url: e.target.value})}
                              placeholder="Sem zadej odkaz na stránky akce..."
                              className="w-full p-3 rounded-xl bg-stone-50 border border-stone-200 focus:border-cyan-400 outline-none transition-all text-sm"
                            />
                          </motion.div>
                        )}
                      </div>
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2 block flex items-center gap-1">
                          <MapPin size={12} /> Kde se to koná?
                        </label>
                        <input 
                          value={newSuggestion.location}
                          onChange={e => setNewSuggestion({...newSuggestion, location: e.target.value})}
                          placeholder="Adresa nebo název místa"
                          className="w-full p-3 rounded-xl bg-stone-50 border border-stone-200 focus:border-rose-500 outline-none transition-all text-sm"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2 block">Odkud pojedu?</label>
                        <input 
                          required
                          value={newSuggestion.rideFrom}
                          onChange={e => setNewSuggestion({...newSuggestion, rideFrom: e.target.value})}
                          placeholder="Např. Škola, Kroužek, Kamarád..."
                          className="w-full p-3 rounded-xl bg-stone-50 border border-stone-200 focus:border-orange-500 outline-none transition-all text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2 block">Kam potřebuji odvézt?</label>
                        <input 
                          required
                          value={newSuggestion.rideTo}
                          onChange={e => setNewSuggestion({...newSuggestion, rideTo: e.target.value})}
                          placeholder="Např. Domů, Na trénink..."
                          className="w-full p-3 rounded-xl bg-stone-50 border border-stone-200 focus:border-orange-500 outline-none transition-all text-sm"
                        />
                      </div>
                    </>
                  )}

                  <div className="flex flex-col sm:flex-row items-end gap-3">
                    <div className="w-full">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2 block">
                        {formType === "ride" ? "Kdy?" : "Kdy to bude?"}
                      </label>
                      <input 
                        type="date"
                        required
                        value={newSuggestion.eventDate}
                        onChange={e => setNewSuggestion({...newSuggestion, eventDate: e.target.value})}
                        min={todayStr}
                        className="w-full p-3 rounded-xl bg-stone-50 border border-stone-200 focus:border-rose-500 outline-none transition-all text-sm"
                      />
                    </div>
                    <div className="w-full">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2 block flex justify-between items-center">
                        {formType === "ride" ? "V kolik?" : "V kolik hodin?"} <span className="text-[9px] text-stone-400 font-normal normal-case opacity-70">({formType === "ride" ? "nutné" : "volitelné"})</span>
                      </label>
                      {(() => {
                        const { hour, minute } = (() => {
                          const timeStr = newSuggestion.eventTime;
                          if (!timeStr) return { hour: '', minute: '' };
                          const [h, m] = timeStr.split(':');
                          let minVal = m || '00';
                          const minNum = Math.round(parseInt(minVal, 10) / 5) * 5;
                          const roundedMin = minNum >= 60 ? 55 : minNum;
                          const formattedMin = String(roundedMin).padStart(2, '0');
                          return { hour: h || '', minute: formattedMin };
                        })();

                        const handleFormTimeChange = (newHour: string, newMin: string) => {
                          if (!newHour && !newMin) {
                            setNewSuggestion(prev => ({ ...prev, eventTime: "" }));
                          } else {
                            const finalHour = newHour || "12";
                            const finalMin = newMin || "00";
                            setNewSuggestion(prev => ({ ...prev, eventTime: `${finalHour}:${finalMin}` }));
                          }
                        };

                        return (
                          <div className="flex gap-2 w-full">
                            <select
                              required={formType === "ride"}
                              value={hour}
                              onChange={e => handleFormTimeChange(e.target.value, minute)}
                              className="bg-white border border-zinc-200 text-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-emerald-500 w-full"
                            >
                              <option value="">-- Hod</option>
                              {HOURS.map(h => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                            <select
                              required={formType === "ride"}
                              value={minute}
                              onChange={e => handleFormTimeChange(hour, e.target.value)}
                              className="bg-white border border-zinc-200 text-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-emerald-500 w-full"
                            >
                              <option value="">-- Min</option>
                              {MINUTES.map(m => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                
                <button 
                  type="submit"
                  className={cn(
                    "w-full py-4 text-white rounded-xl font-bold text-sm shadow-md transition-colors",
                    formType === "ride" ? "bg-orange-500 hover:bg-orange-600" : "bg-rose-500 hover:bg-rose-600"
                  )}
                >
                  {formType === "ride" ? "Odeslat žádost o odvoz" : "Přidat aktivitu"}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {cancellingEvent && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCancellingEvent(null)}
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 pointer-events-auto"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20, x: "-50%" }}
              animate={{ opacity: 1, scale: 1, y: "-50%", x: "-50%" }}
              exit={{ opacity: 0, scale: 0.95, y: 20, x: "-50%" }}
              className="fixed top-1/2 left-1/2 w-full max-w-sm bg-white rounded-[24px] shadow-2xl p-6 z-50 pointer-events-auto flex flex-col gap-4"
            >
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-xl font-bold flex items-center gap-2">🛑 Zrušit aktivitu</h2>
                <button onClick={() => setCancellingEvent(null)} className="p-2 bg-stone-50 hover:bg-stone-100 rounded-full transition-colors">
                  <X size={20} className="text-stone-500" />
                </button>
              </div>
              <p className="text-sm text-stone-600">
                Přejete si událost <strong>{cancellingEvent.title}</strong> zrušit? Pokud uvedete důvod, zobrazí se všem jako "Zrušeno". Zároveň se událost smaže z Google Kalendáře.
              </p>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2 block">Důvod</label>
                <textarea 
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="Proč se aktivita ruší... (např. Prší)"
                  className="w-full p-3 rounded-xl bg-stone-50 border border-stone-200 focus:border-red-500 outline-none transition-all h-24 resize-none text-sm"
                />
              </div>
              <div className="flex gap-3 mt-2">
                <button 
                  onClick={() => setCancellingEvent(null)}
                  className="flex-1 py-3 text-stone-500 bg-stone-100 rounded-xl font-bold text-sm hover:bg-stone-200 transition-colors"
                >
                  Zpět
                </button>
                <button 
                  onClick={handleConfirmCancel}
                  className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold text-sm shadow-md hover:bg-red-600 transition-colors"
                >
                  Zrušit událost
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Reject Reason Modal */}
      <AnimatePresence>
        {rejectingActivity && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRejectingActivity(null)}
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-[80] pointer-events-auto"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20, x: "-50%" }}
              animate={{ opacity: 1, scale: 1, y: "-50%", x: "-50%" }}
              exit={{ opacity: 0, scale: 0.95, y: 20, x: "-50%" }}
              className="fixed top-1/2 left-1/2 w-full max-w-sm bg-white rounded-[24px] shadow-2xl p-6 z-[90] pointer-events-auto flex flex-col gap-4"
            >
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-xl font-bold flex items-center gap-2">❌ Zamítnout aktivitu</h2>
                <button onClick={() => setRejectingActivity(null)} className="p-2 bg-stone-50 hover:bg-stone-100 rounded-full transition-colors">
                  <X size={20} className="text-stone-500" />
                </button>
              </div>
              <p className="text-sm text-stone-600">
                Uveďte prosím důvod zamítnutí pro aktivitu <strong>{rejectingActivity.title}</strong>, aby ostatní věděli, proč se nekoná.
              </p>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2 block">Důvod zamítnutí</label>
                <textarea 
                  value={rejectReasonText}
                  onChange={e => setRejectReasonText(e.target.value)}
                  placeholder="Např. Už tam tento víkend nemají volno..."
                  className="w-full p-3 rounded-xl bg-stone-50 border border-stone-200 focus:border-red-500 outline-none transition-all h-24 resize-none text-sm"
                />
              </div>
              <div className="flex gap-3 mt-2">
                <button 
                  onClick={() => setRejectingActivity(null)}
                  className="flex-1 py-3 text-stone-500 bg-stone-100 rounded-xl font-bold text-sm hover:bg-stone-200 transition-colors"
                >
                  Zpět
                </button>
                <button 
                  disabled={!rejectReasonText.trim()}
                  onClick={handleConfirmReject}
                  className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold text-sm shadow-md hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Zamítnout
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      
      {/* Archive Modal */}
      <AnimatePresence>
        {showArchive && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowArchive(false)}
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 bg-stone-50 rounded-t-[32px] p-6 z-[70] shadow-2xl max-w-3xl mx-auto border-t border-stone-200 flex flex-col h-[85vh]"
            >
              <div className="w-12 h-1.5 bg-stone-200 rounded-full mx-auto mb-6 flex-shrink-0" />
              
              <div className="flex justify-between items-center mb-6 flex-shrink-0">
                <h3 className="text-2xl font-extrabold text-stone-800 tracking-tight flex items-center gap-3">
                  <span>📚</span> Archív aktivit
                </h3>
                <button onClick={() => setShowArchive(false)} className="bg-white p-2 rounded-full shadow-sm text-stone-500 hover:text-stone-800">
                  <X size={20} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 mb-6 bg-stone-200/50 p-1.5 rounded-2xl flex-shrink-0">
                <button
                  onClick={() => setArchiveTab("completed")}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm",
                    archiveTab === "completed" ? "bg-white text-rose-600 shadow-sm" : "text-stone-500 hover:text-stone-700 shadow-none border-transparent"
                  )}
                >
                  Absolvované
                </button>
                <button
                  onClick={() => setArchiveTab("cancelled")}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm",
                    archiveTab === "cancelled" ? "bg-white text-red-600 shadow-sm" : "text-stone-500 hover:text-stone-700 shadow-none border-transparent"
                  )}
                >
                  Zrušené
                </button>
              </div>

              <AnimatePresence>
                {archiveTab === "completed" && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex-shrink-0 overflow-hidden"
                  >
                    <div className="bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 mb-6 shadow-sm">
                      <span>💡</span>
                      <span>Známku dvakrát měř, jednou opravuj.</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* List */}
              <div className="overflow-y-auto flex-1 space-y-4 pr-1 scrollbar-hide pb-10">
                {suggestions
                  .filter(s => {
                    if (s.type === "ride") return false;
                    if (archiveTab === "completed") {
                      if (s.status !== "approved") return false;
                      if (!s.eventDate) return false;
                      return new Date(s.eventDate) < new Date(new Date().setHours(0,0,0,0));
                    } else {
                      return s.status === "cancelled";
                    }
                  })
                  .sort((a, b) => {
                    if (archiveTab === "completed") {
                      // Nehodnocené úplně dole
                      const gradeA = calcAvgGrade(a) || 99;
                      const gradeB = calcAvgGrade(b) || 99;
                      if (gradeA !== gradeB) return gradeA - gradeB;
                      return b.createdAt - a.createdAt; 
                    } else {
                      return b.createdAt - a.createdAt; // Zrušené řadíme od nejnovějších
                    }
                  })
                  .map(suggestion => (
                  <motion.div layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} id={`archive-${suggestion.id}`} key={suggestion.id} className="bg-white rounded-[24px] p-5 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.05)] border border-stone-100 flex flex-col gap-4 scroll-mt-6 transition-all duration-500">
                    <div className="flex flex-col md:flex-row gap-4 justify-between w-full">
                    <div className="flex-1">
                      <div className="flex gap-2 items-center mb-2">
                         <div className="w-5 h-5 rounded-full overflow-hidden bg-stone-100 border border-stone-200 flex items-center justify-center flex-shrink-0">
                              {(() => {
                                const av = getAvatarForChild(suggestion.childName);
                                return av.startsWith('http') || av.startsWith('data:') 
                                  ? <img src={av} className="w-full h-full object-cover" /> 
                                  : <span className="text-[10px] leading-none">{av}</span>;
                              })()}
                         </div>
                         <span className="text-xs font-bold text-stone-500">
                           {getDynamicNameForChild(suggestion.childName)}
                         </span>
                         {suggestion.type === "ride" && (
                           <span className="text-xs font-bold px-2 py-1 bg-orange-100 text-orange-600 rounded-lg">🚗 Odvoz</span>
                         )}
                         {suggestion.eventDate && (
                           <span className="text-xs text-stone-400">{new Date(suggestion.eventDate).toLocaleDateString('cs-CZ')}</span>
                         )}
                      </div>
                      <h4 className="text-lg font-black text-stone-800 mb-1">{suggestion.title}</h4>
                      <p className="text-sm text-stone-500 line-clamp-2">{suggestion.description}</p>
                      
                      {archiveTab === "cancelled" && suggestion.rejectReason && (
                        <div className="mt-3 p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-100">
                          Zrušeno: {suggestion.rejectReason}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex flex-row md:flex-col items-center justify-between md:justify-center gap-4 bg-stone-50 rounded-2xl p-4 md:min-w-[140px]">
                      {archiveTab === "completed" && (
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex flex-col items-center">
                            <div className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Hodnocení</div>
                            <div className="text-xl font-black text-rose-500 my-1">
                               {calcAvgGrade(suggestion) === 0 ? "-" : calcAvgGrade(suggestion).toFixed(2).replace('.', ',')}
                            </div>
                            <div className="text-[9px] text-stone-400 leading-none mb-1">Průměrná známka (1 = nejlepší)</div>
                          </div>
                          <div className="flex gap-1 mt-1">
                            {[1, 2, 3, 4, 5].map(num => {
                              const myGrade = user ? (suggestion.userGrades ? suggestion.userGrades[user.uid]?.grade : suggestion.grade) : suggestion.grade;
                              return (
                                <button
                                  key={num}
                                  onClick={() => handleGradeActivity(suggestion.id, num)}
                                  className={cn(
                                    "w-7 h-7 rounded-full text-xs font-black transition-all flex items-center justify-center",
                                    myGrade === num 
                                      ? "bg-rose-500 text-white shadow-md scale-110" 
                                      : "bg-white text-stone-400 border border-stone-200 hover:border-rose-300 hover:text-rose-500"
                                  )}
                                >
                                  {num}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      <button
                        onClick={() => handleRepeatActivity(suggestion)}
                        className="py-2.5 px-4 bg-amber-400 text-amber-950 text-xs font-black rounded-xl hover:bg-amber-500 transition-colors shadow-sm whitespace-nowrap flex items-center gap-2"
                      >
                        ⏱️ Zopakovat
                      </button>
                    </div>
                    </div>
                    {/* Comments Section */}
                    {archiveTab === "completed" && (
                      <div className="mt-4 pt-4 border-t border-stone-100 flex flex-col gap-3">
                        {suggestion.comments && suggestion.comments.length > 0 && (
                          <div className="flex flex-col gap-3 mb-2">
                            {suggestion.comments.map(comment => (
                              <div key={comment.id} className="flex gap-3 bg-stone-50 p-3 rounded-2xl border border-stone-100">
                                {comment.authorAvatar.startsWith('http') || comment.authorAvatar.startsWith('data:') ? (
                                  <img src={comment.authorAvatar} alt={comment.authorName} className="w-8 h-8 rounded-full bg-white border border-stone-200 flex-shrink-0 object-cover" />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center flex-shrink-0">
                                    <span className="text-[16px] leading-none">{comment.authorAvatar}</span>
                                  </div>
                                )}
                                <div className="flex flex-col">
                                  <div className="flex items-baseline gap-2 mb-1">
                                    <span className="font-bold text-sm text-stone-700">{comment.authorName}</span>
                                    <span className="text-[10px] text-stone-400">{new Date(comment.createdAt).toLocaleString('cs-CZ')}</span>
                                  </div>
                                  {comment.text && <p className="text-sm text-stone-600 mb-2">{comment.text}</p>}
                                  {comment.photoBase64 && (
                                    <img src={comment.photoBase64} alt="Fotka z výletu" className="max-w-full rounded-xl border border-stone-200 max-h-64 object-contain" />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {commentingOn === suggestion.id ? (
                          <div className="flex flex-col gap-2 bg-stone-50 p-3 rounded-2xl border border-rose-200">
                            <textarea 
                              placeholder="Napište vzpomínku..." 
                              value={commentText}
                              onChange={e => setCommentText(e.target.value)}
                              className="w-full p-3 rounded-xl bg-white border border-stone-200 focus:border-rose-400 outline-none transition-all text-sm resize-none min-h-[80px]"
                            />
                            {commentPhoto && (
                              <div className="relative inline-block w-fit">
                                <img src={commentPhoto} alt="Náhled" className="h-20 rounded-lg border border-stone-200 object-cover" />
                                <button onClick={() => setCommentPhoto(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600">
                                  <X size={12} />
                                </button>
                              </div>
                            )}
                            <div className="flex justify-between items-center mt-1">
                              <button onClick={handlePhotoUploadClick} className="text-stone-500 hover:text-rose-500 transition-colors p-2 bg-white rounded-full shadow-sm border border-stone-200">
                                <Camera size={18} />
                              </button>
                              <div className="flex gap-2">
                                <button onClick={() => { setCommentingOn(null); setCommentText(""); setCommentPhoto(null); }} className="px-4 py-2 text-sm font-bold text-stone-500 hover:bg-stone-200 rounded-xl transition-colors">
                                  Zrušit
                                </button>
                                <button onClick={() => submitComment(suggestion.id)} disabled={!commentText.trim() && !commentPhoto} className="px-4 py-2 text-sm font-bold text-white bg-rose-500 hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shadow-sm">
                                  Odeslat
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <button 
                            onClick={() => { setCommentingOn(suggestion.id); setCommentText(""); setCommentPhoto(null); }}
                            className="text-sm font-bold text-rose-500 bg-rose-50 hover:bg-rose-100 py-2.5 px-4 rounded-xl transition-colors self-start flex items-center gap-2"
                          >
                            <Camera size={16} /> Přidat vzpomínku či fotku
                          </button>
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}

                {suggestions.filter(s => s.status === (archiveTab === "completed" ? "approved" : "cancelled") && s.type !== "ride").length === 0 && (
                  <div className="text-center py-12 text-stone-400">
                    <div className="text-4xl mb-3">👻</div>
                    <p className="font-medium text-sm">Zatím tu nic není.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Avatar Modal */}
      <AnimatePresence>
        {showAvatarModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAvatarModal(false)}
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 transition-opacity"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm bg-white rounded-[24px] p-6 shadow-2xl z-50 flex flex-col gap-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold text-stone-800 tracking-tight">Vyberte si avatara</h2>
                <button onClick={() => setShowAvatarModal(false)} className="text-stone-400 hover:text-stone-600 bg-stone-100 p-2 rounded-full cursor-pointer">
                  <X size={20} />
                </button>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-3 block">Základní piktogramy</label>
                <div className="grid grid-cols-5 gap-3">
                  {AVATAR_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleUpdateAvatar(emoji)}
                      className={cn(
                        "text-3xl p-2 rounded-xl border-2 transition-all hover:scale-110 flex items-center justify-center",
                        userProfiles[user?.uid || ""]?.avatar === emoji 
                          ? "border-rose-500 bg-rose-50" 
                          : "border-stone-100 bg-stone-50 hover:border-stone-200"
                      )}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2 block">Nebo vlastní fotka (Nahrát)</label>
                <input 
                  type="file" 
                  accept="image/*" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileUpload}
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-dashed border-stone-300 text-stone-600 font-bold hover:bg-stone-50 hover:border-rose-400 hover:text-rose-500 transition-colors"
                >
                  <Upload size={18} />
                  Nahrát obrázek (max 150x150)
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Appeal Modal */}
      <AnimatePresence>
        {appealingEvent && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAppealingEvent(null)}
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 transition-opacity"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm bg-white rounded-[24px] p-6 shadow-2xl z-50 flex flex-col gap-5 border-2 border-orange-100"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold text-stone-800 tracking-tight">Požádat o přehodnocení</h2>
                <button onClick={() => setAppealingEvent(null)} className="text-stone-400 hover:text-stone-600 bg-stone-100 p-2 rounded-full cursor-pointer">
                  <X size={20} />
                </button>
              </div>

              <div className="text-sm text-stone-600">
                Máš pocit, že tvůj nápad <strong>{appealingEvent.title}</strong> nespravedlivě neprošel? Sem můžeš napsat nový důvod nebo slib, abys tátu přesvědčil.
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2 block">Tvůj argument (nepovinné)</label>
                <textarea
                  value={appealReason}
                  onChange={(e) => setAppealReason(e.target.value)}
                  className="w-full bg-stone-50 text-stone-800 border-[2px] border-stone-200 rounded-xl p-3 text-sm min-h-[100px] resize-none focus:outline-none focus:border-orange-400 focus:bg-white transition-colors"
                  placeholder="Např.: Uklidím si pokoj na měsíc dopředu, slibuju!"
                />
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setAppealingEvent(null)}
                  className="flex-1 py-3 text-stone-500 bg-stone-100 rounded-xl font-bold text-sm hover:bg-stone-200 transition-colors"
                >
                  Zpět
                </button>
                <button 
                  onClick={submitAppeal}
                  className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-bold text-sm shadow-md hover:bg-orange-600 transition-colors"
                >
                  Odeslat
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Grade Limit Modal */}
      <AnimatePresence>
        {showGradeLimitModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowGradeLimitModal(false)}
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-[100] transition-opacity"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] max-w-xs bg-white rounded-[24px] p-5 shadow-2xl z-[100] flex flex-col gap-4 border-2 border-rose-100"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-stone-800 tracking-tight flex items-center gap-2">
                  <span>🚫</span> Limit úprav vyčerpán
                </h2>
              </div>

              <div className="text-sm text-stone-600 leading-relaxed">
                Už jsi své hodnocení jednou změnil. Tato známka už je definitivní.
              </div>

              <div className="flex justify-end mt-1">
                <button 
                  onClick={() => setShowGradeLimitModal(false)}
                  className="px-6 py-2.5 bg-rose-500 text-white rounded-xl font-bold text-sm shadow-md hover:bg-rose-600 transition-colors"
                >
                  Rozumím
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Weather Forecast Modal */}
      <AnimatePresence>
        {showWeatherModal && forecast.length > 0 && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWeatherModal(false)}
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 transition-opacity"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md bg-white rounded-[24px] p-6 shadow-2xl z-50 flex flex-col gap-6 border-2 border-rose-50"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold text-stone-800 tracking-tight flex items-center gap-2">
                  <span>🌦️</span> Víkend {getCityInLocative(weather?.city || "")}
                </h2>
                <button onClick={() => setShowWeatherModal(false)} className="text-stone-400 hover:text-stone-600 bg-stone-100 p-2 rounded-full cursor-pointer">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {forecast.map((day, idx) => (
                  <div key={idx} className="bg-stone-50 border border-stone-200 rounded-xl p-4 flex flex-col items-center text-center">
                    <div className="text-sm font-bold text-stone-500 uppercase tracking-widest leading-tight">{day.dayName}</div>
                    <div className="text-[11px] text-stone-400 font-medium mb-3 hidden md:block">
                      {new Date(day.date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                    <div className="text-[11px] text-stone-400 font-medium mb-3 md:hidden">
                      {new Date(day.date).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </div>
                    <div className="text-5xl mb-2">{day.icon}</div>
                    <div className="text-xl font-extrabold text-stone-800 mb-4">{day.maxTemp}°C <span className="text-sm font-medium text-stone-400">/ {day.minTemp}°C</span></div>
                    
                    <div className="flex flex-col gap-2 w-full text-sm">
                      <div className="flex items-center justify-between bg-rose-50 text-rose-700 px-3 py-1.5 rounded-lg font-semibold">
                        <span>🌧️ Déšť</span>
                        <span>{day.precipProb}%</span>
                      </div>
                      <div className="flex items-center justify-between bg-stone-100 text-stone-600 px-3 py-1.5 rounded-lg font-semibold">
                        <span>💨 Vítr</span>
                        <span>{day.windSpeed} km/h</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Leaderboard User Details Modal */}
      <AnimatePresence>
        {selectedLeaderboardUser && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedLeaderboardUser(null)}
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-[70] transition-opacity"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md bg-white rounded-[24px] p-6 shadow-2xl z-[70] flex flex-col gap-4 border-2 border-amber-100 max-h-[80vh]"
            >
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <h2 className="text-xl font-extrabold text-stone-800 tracking-tight flex items-center gap-2">
                  <span>🏆</span> Úspěchy: {getDynamicNameForChild(selectedLeaderboardUser)}
                </h2>
                <button onClick={() => setSelectedLeaderboardUser(null)} className="text-stone-400 hover:text-stone-600 bg-stone-100 p-2 rounded-full cursor-pointer">
                  <X size={20} />
                </button>
              </div>

              <div className="overflow-y-auto pr-1 flex flex-col gap-3">
                {suggestions
                  .filter(s => s.status === 'approved' && s.type !== 'ride' && (getDynamicNameForChild(s.childName || "Neznámý") === selectedLeaderboardUser) && s.eventDate && new Date(s.eventDate) < new Date(new Date().setHours(0,0,0,0)))
                  .sort((a, b) => new Date(b.eventDate!).getTime() - new Date(a.eventDate!).getTime())
                  .map(s => (
                    <button 
                      key={s.id} 
                      onClick={() => {
                        setSelectedLeaderboardUser(null);
                        setArchiveTab("completed");
                        setShowArchive(true);
                        setTimeout(() => {
                          const el = document.getElementById(`archive-${s.id}`);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el.classList.add('ring-4', 'ring-rose-300', 'scale-[1.02]');
                            setTimeout(() => {
                              el.classList.remove('ring-4', 'ring-rose-300', 'scale-[1.02]');
                            }, 1500);
                          }
                        }, 400);
                      }}
                      className="bg-white hover:bg-rose-50 border border-stone-200 p-3 rounded-xl flex flex-col text-left transition-all cursor-pointer w-full shadow-sm hover:shadow hover:-translate-y-0.5 active:scale-[0.98]"
                    >
                      <div className="font-bold text-stone-700 text-sm mb-1 flex justify-between w-full">
                        <span>{s.title}</span>
                        <span className="text-stone-300 text-xs mt-0.5">🔗 Otevřít</span>
                      </div>
                      <div className="text-xs text-stone-500 font-medium flex items-center gap-1">
                        <span>🗓️</span> {new Date(s.eventDate!).toLocaleDateString('cs-CZ')}
                      </div>
                    </button>
                ))}
                
                {suggestions.filter(s => s.status === 'approved' && s.type !== 'ride' && (getDynamicNameForChild(s.childName || "Neznámý") === selectedLeaderboardUser) && s.eventDate && new Date(s.eventDate) < new Date(new Date().setHours(0,0,0,0))).length === 0 && (
                  <div className="text-center p-5 text-stone-400 text-sm italic">Žádné realizované výlety nenalezeny.</div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <input type="file" ref={commentFileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleCommentPhotoChange} />

      <AnimatePresence>
        {showUserManagement && (canManageSystem || currentUserRole === 'parent') && (
          <AdminPanel 
            onClose={() => setShowUserManagement(false)}
            userProfiles={userProfiles}
            updateUserRole={updateUserRole}
            updateUserAdminAlias={updateUserAdminAlias}
            updateUserTargetGroup={updateUserTargetGroup}
            updateUserBirthYear={updateUserBirthYear}
            toggleUserBlocked={toggleUserBlocked}
            handleGenerateInspirations={handleGenerateInspirations}
            isGeneratingInspiration={isGeneratingInspiration}
            handleApproveBikeRoute={handleApproveBikeRoute}
            currentUserRole={currentUserRole}
            isDemoMode={isDemoMode}
            onToggleDemoMode={() => {
              const next = !isDemoMode;
              setIsDemoMode(next);
              setView(next ? "child" : "parent");
            }}
            onCleanupSandbox={handleCleanupSandbox}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-20 left-4 right-4 bg-red-500/90 text-white p-4 rounded-xl shadow-lg flex items-center gap-3 z-50 backdrop-blur-sm"
          >
            <AlertCircle className="w-6 h-6 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto p-1">
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scroll to Top Mobile Button */}
      <AnimatePresence>
        {showScrollToTop && (
          <>
            {/* Plovoucí tlačítko pro mobil na Game Hub */}
            <motion.button
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              onClick={() => setShowGameHub(true)}
              className="md:hidden fixed bottom-6 left-6 z-40 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all border-2 border-white/20 active:scale-95 bg-gradient-to-r from-violet-600 to-cyan-600"
              title="Game Hub"
            >
              <Zap className="text-white" size={24} />
            </motion.button>

            <motion.button
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              onClick={scrollToTop}
              className="md:hidden fixed bottom-6 right-6 z-40 bg-blue-500 hover:bg-blue-600 text-white w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-colors border-2 border-white/20 active:scale-95"
              title="Nahoru"
            >
              <ArrowUp size={24} />
            </motion.button>
          </>
        )}
      </AnimatePresence>

      {/* Bulk Delete Modal */}
      <AnimatePresence>
        {showBulkDeleteModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowBulkDeleteModal(null)}
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-[80]"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm bg-white rounded-[24px] p-6 shadow-2xl z-[90] flex flex-col gap-5 border border-stone-200"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold text-stone-800 flex items-center gap-2">
                  <Trash2 className="text-rose-500" size={24} /> 
                  Potvrzení smazání
                </h2>
                <button onClick={() => setShowBulkDeleteModal(null)} className="text-stone-400 hover:bg-stone-100 p-2 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="text-sm text-stone-600">
                Opravdu chcete {showBulkDeleteModal === "cancelled" ? "skrýt z nástěnky" : "trvale smazat"} všechny aktivity se statusem <strong>{showBulkDeleteModal === "rejected" ? "Zamítnuté" : "Zrušené"}</strong>?
                {showBulkDeleteModal === "rejected" && (
                  <div className="mt-3 text-xs text-rose-500 font-bold bg-rose-50 p-2 rounded-lg border border-rose-100">
                    Aktivity, u kterých je stále možné přehodnocení, smazány nebudou.
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-2">
                <button 
                  onClick={() => setShowBulkDeleteModal(null)} 
                  className="flex-1 py-3 bg-stone-100 text-stone-600 font-bold rounded-xl hover:bg-stone-200 transition-colors"
                >
                  Zpět
                </button>
                <button 
                  onClick={() => { handleBulkDeleteConfirmed(showBulkDeleteModal); setShowBulkDeleteModal(null); }} 
                  className="flex-1 py-3 bg-rose-500 text-white font-bold rounded-xl hover:bg-rose-600 transition-colors"
                >
                  Smazat
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Nothing to Delete Modal */}
      <AnimatePresence>
        {showNothingToDeleteModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowNothingToDeleteModal(false)}
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-[80]"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm bg-white rounded-[24px] p-6 shadow-2xl z-[90] flex flex-col gap-5 border border-stone-200"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold text-stone-800 flex items-center gap-2">
                  <span>📭</span> Nic ke smazání
                </h2>
                <button onClick={() => setShowNothingToDeleteModal(false)} className="text-stone-400 hover:bg-stone-100 p-2 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="text-sm text-stone-600">
                Nebyly nalezeny žádné aktivity, které by odpovídaly kritériím pro smazání.
              </div>
              <button 
                onClick={() => setShowNothingToDeleteModal(false)} 
                className="w-full py-3 bg-stone-100 text-stone-600 font-bold rounded-xl hover:bg-stone-200 transition-colors"
              >
                Rozumím
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Game Hub */}
      <AnimatePresence>
        {showGameHub && (
          <GameHub
            suggestions={suggestions}
            userProfiles={extendedUserProfiles}
            currentUserName={getLoggedInFamilyName()}
            currentUserId={currentUserId}
            view={isDemoMode ? "child" : view}
            onClose={() => setShowGameHub(false)}
            getAvatarForChild={getAvatarForChild}
            onOpenAdminPanel={() => setShowUserManagement(true)}
          />
        )}
      </AnimatePresence>

      {/* SSE Status Pill */}
      <AnimatePresence>
        {loadingStep && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] bg-stone-900/90 backdrop-blur-md text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-white/10"
          >
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            <span className="text-sm font-bold tracking-tight">{loadingStep}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Toast */}
      <AnimatePresence>
        {showSuccessToast && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, x: '-50%' }}
            animate={{ opacity: 1, scale: 1, x: '-50%' }}
            exit={{ opacity: 0, scale: 0.9, x: '-50%' }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 border border-emerald-400/20"
          >
            <div className="bg-white/20 p-1 rounded-full">
              <Check size={18} strokeWidth={3} />
            </div>
            <span className="font-bold">Hotovo!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Calendar Collision Warning Modal */}
      <AnimatePresence>
        {collisionWarning && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setCollisionWarning(null)}
              className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[80]"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className={cn(
                "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[95%] max-w-md bg-stone-900 border rounded-3xl p-6 shadow-2xl z-[90] flex flex-col gap-4 text-white",
                collisionWarning.type === 'direct' ? "border-rose-500 shadow-rose-500/10" :
                collisionWarning.type === 'buffer' ? "border-amber-500 shadow-amber-500/10" :
                "border-blue-500 shadow-blue-500/10"
              )}
            >
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <h3 className={cn(
                  "text-base font-black flex items-center gap-2",
                  collisionWarning.type === 'direct' ? "text-rose-400" :
                  collisionWarning.type === 'buffer' ? "text-amber-400" :
                  "text-blue-400"
                )}>
                  {collisionWarning.type === 'direct' && <span>🚨 Přímá kolize v kalendáři</span>}
                  {collisionWarning.type === 'buffer' && <span>⚠️ Logistické varování (Buffer)</span>}
                  {collisionWarning.type === 'allday' && <span>ℹ️ Celodenní kolize</span>}
                </h3>
                <button 
                  onClick={() => setCollisionWarning(null)} 
                  className="text-stone-400 hover:text-white p-1 rounded-full transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className={cn(
                "p-4 rounded-xl text-sm border font-medium leading-relaxed",
                collisionWarning.type === 'direct' ? "bg-rose-500/10 border-rose-500/20 text-rose-300" :
                collisionWarning.type === 'buffer' ? "bg-amber-500/10 border-amber-500/20 text-amber-300" :
                "bg-blue-500/10 border-blue-500/20 text-blue-300"
              )}>
                {collisionWarning.message}
              </div>

              {collisionActionMode === 'none' && (
                <div className="space-y-4">
                  <div className="text-xs text-stone-400">
                    Schvalovaná aktivita: <strong className="text-white">"{collisionWarning.suggestion.title || (collisionWarning.suggestion.type === 'ride' ? 'Odvoz' : 'Aktivita')}"</strong> na {collisionWarning.targetDate} {collisionWarning.targetTime ? `v ${collisionWarning.targetTime}` : ''}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => {
                        handleApproveAttempt(collisionWarning.suggestion, collisionWarning.targetDate, collisionWarning.targetTime, true);
                        setCollisionWarning(null);
                      }}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] transition-all rounded-xl font-bold text-xs cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      ✔️ Schválit tak, jak je
                    </button>
                    <button
                      onClick={() => setCollisionActionMode('edit')}
                      className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] transition-all rounded-xl font-bold text-xs cursor-pointer flex items-center justify-center gap-1.5 border border-white/5"
                    >
                      ✏️ Upravit čas a schválit
                    </button>
                    <button
                      onClick={() => setCollisionActionMode('reject')}
                      className="w-full py-3 bg-rose-600/20 text-rose-300 border border-rose-500/30 hover:bg-rose-600/30 active:scale-[0.98] transition-all rounded-xl font-bold text-xs cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      ❌ Zamítnout aktivitu
                    </button>
                  </div>
                  <button
                    onClick={() => setCollisionWarning(null)}
                    className="w-full py-2 text-zinc-400 hover:text-white transition-colors text-xs font-bold cursor-pointer"
                  >
                    Zavřít
                  </button>
                </div>
              )}

              {collisionActionMode === 'edit' && (
                <div className="space-y-4">
                  <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Upravit čas konání:</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-zinc-400 block mb-1">Datum:</label>
                      <input
                        type="date"
                        value={collisionEditDate}
                        onChange={e => setCollisionEditDate(e.target.value)}
                        className="w-full bg-zinc-800 border border-white/10 text-white rounded-lg p-2 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-400 block mb-1">Čas:</label>
                      <input
                        type="time"
                        value={collisionEditTime}
                        onChange={e => setCollisionEditTime(e.target.value)}
                        className="w-full bg-zinc-800 border border-white/10 text-white rounded-lg p-2 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400 block mb-1">Důvod změny (povinné):</label>
                    <textarea
                      value={collisionEditReason}
                      onChange={e => setCollisionEditReason(e.target.value)}
                      placeholder="Zadej důvod změny času pro dítě..."
                      className="w-full bg-zinc-800 border border-white/10 text-white rounded-lg p-2.5 text-xs outline-none focus:ring-1 focus:ring-indigo-500 h-16 resize-none"
                      required
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setCollisionActionMode('none')}
                      className="flex-1 py-2.5 bg-zinc-800 text-zinc-300 font-bold rounded-xl text-xs hover:bg-zinc-700 transition-colors"
                    >
                      Zpět
                    </button>
                    <button
                      onClick={() => {
                        if (collisionEditDate && collisionEditReason.trim()) {
                          handleUpdateStatus(
                            collisionWarning.suggestion.id,
                            "approved",
                            collisionEditDate,
                            collisionEditTime,
                            collisionEditReason.trim(),
                            collisionWarning.confirmDetails,
                            collisionWarning.confirmFree
                          );
                          setCollisionWarning(null);
                          setCollisionActionMode('none');
                        }
                      }}
                      disabled={!collisionEditDate || !collisionEditReason.trim()}
                      className="flex-1 py-2.5 bg-indigo-600 disabled:opacity-50 text-white font-bold rounded-xl text-xs hover:bg-indigo-500 transition-colors"
                    >
                      Uložit a schválit
                    </button>
                  </div>
                </div>
              )}

              {collisionActionMode === 'reject' && (
                <div className="space-y-4">
                  <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Zamítnutí aktivity:</div>
                  <div>
                    <label className="text-[10px] text-zinc-400 block mb-1">Důvod zamítnutí (povinné):</label>
                    <textarea
                      value={collisionRejectReason}
                      onChange={e => setCollisionRejectReason(e.target.value)}
                      placeholder="Zadej důvod zamítnutí pro dítě..."
                      className="w-full bg-zinc-800 border border-white/10 text-white rounded-lg p-2.5 text-xs outline-none focus:ring-1 focus:ring-indigo-500 h-16 resize-none"
                      required
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setCollisionActionMode('none')}
                      className="flex-1 py-2.5 bg-zinc-800 text-zinc-300 font-bold rounded-xl text-xs hover:bg-zinc-700 transition-colors"
                    >
                      Zpět
                    </button>
                    <button
                      onClick={() => {
                        if (collisionRejectReason.trim()) {
                          handleUpdateStatus(
                            collisionWarning.suggestion.id,
                            "rejected",
                            undefined,
                            undefined,
                            collisionRejectReason.trim()
                          );
                          setCollisionWarning(null);
                          setCollisionActionMode('none');
                        }
                      }}
                      disabled={!collisionRejectReason.trim()}
                      className="flex-1 py-2.5 bg-rose-600 disabled:opacity-50 text-white font-bold rounded-xl text-xs hover:bg-rose-500 transition-colors"
                    >
                      Potvrdit zamítnutí
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirmId(null)}
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-[110] transition-opacity"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] max-w-xs bg-white rounded-[24px] p-5 shadow-2xl z-[110] flex flex-col gap-4 border-2 border-indigo-50"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-stone-800 tracking-tight flex items-center gap-2">
                  <span>🗑️</span> Smazat návrh?
                </h2>
              </div>

              <div className="text-sm text-stone-600 leading-relaxed">
                Opravdu chcete tento návrh smazat? Tato akce je nevratná.
              </div>

              <div className="flex justify-end gap-2 mt-1">
                <button 
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-bold text-sm transition-colors"
                >
                  Zrušit
                </button>
                <button 
                  onClick={confirmDeleteInspiration}
                  className="px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-sm shadow-md transition-colors"
                >
                  Smazat
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Sandbox testovací bar */}
      <AnimatePresence>
        {isDemoMode && (
          <motion.div
            initial={{ opacity: 0, y: -50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -50, x: '-50%' }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-xl bg-gradient-to-r from-violet-600/90 to-cyan-600/90 backdrop-blur-md text-white px-6 py-3.5 rounded-2xl shadow-2xl flex items-center justify-between border border-white/20"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl animate-pulse">🧪</span>
              <div className="text-left">
                <div className="text-xs opacity-75 font-bold uppercase tracking-wider">Testovací Sandbox</div>
                <div className="text-sm font-black">Jste přihlášeni jako Demo Dítě</div>
              </div>
            </div>
            <button 
              onClick={() => { setIsDemoMode(false); setView("parent"); }}
              className="bg-white text-violet-700 font-extrabold text-xs px-4 py-2 rounded-xl shadow-md hover:scale-[1.03] transition-all cursor-pointer"
            >
              Zpět na Admina 🔙
            </button>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
