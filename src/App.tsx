import { useState, useEffect, type FormEvent, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Calendar, 
  Plus, 
  Check, 
  X, 
  Clock, 
  User, 
  Settings, 
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
  Loader2
} from "lucide-react";
import { cn } from "./lib/utils";
import { ActivitySuggestion, WeekendEvent, UserProfile, ActivityComment, Inspiration, CinemaListing } from "./types";
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
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<"parent" | "child">("child");
  const [suggestions, setSuggestions] = useState<ActivitySuggestion[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"activity" | "ride">("activity");
  const [googleTokens, setGoogleTokens] = useState<any>(() => {
    // Načteme klíče z paměti prohlížeče, pokud tam po minulém refreshi zbyly
    const saved = localStorage.getItem('googleCalendarTokens');
    return saved ? JSON.parse(saved) : null;
  });
  const [showArchive, setShowArchive] = useState(false);
  const [archiveTab, setArchiveTab] = useState<"completed" | "cancelled">("completed");
  const [boardFilter, setBoardFilter] = useState<"all" | "pending" | "approved" | "rejected" | "cancelled">("all");
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
  const [weather, setWeather] = useState<{ temp: number; icon: string; city: string } | null>(null);
  const [showWeatherModal, setShowWeatherModal] = useState(false);
  const [commentingOn, setCommentingOn] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentPhoto, setCommentPhoto] = useState<string | null>(null);
  const commentFileInputRef = useRef<HTMLInputElement>(null);
  const inspirationsRef = useRef<HTMLDivElement>(null);
  const [forecast, setForecast] = useState<any[]>([]);
  const [inspirations, setInspirations] = useState<Inspiration[]>([]);
  const [isGeneratingInspiration, setIsGeneratingInspiration] = useState(false);
  const [showInspirationsView, setShowInspirationsView] = useState(false);
  const [expandedInspiration, setExpandedInspiration] = useState<string | null>(null);
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showVyskovOnly, setShowVyskovOnly] = useState(false);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const ROLE_DEFAULTS: Record<UserRole, UserPermissions> = {
    admin: { canSuggest: true, canComment: true, canApprove: true, canManageUsers: true },
    parent: { canSuggest: true, canComment: true, canApprove: true, canManageUsers: false },
    child: { canSuggest: true, canComment: true, canApprove: false, canManageUsers: false },
    viewer: { canSuggest: true, canComment: false, canApprove: false, canManageUsers: false },
  };

  const updateUserRole = async (userId: string, role: UserRole) => {
    if (userId === user?.uid && role !== 'admin') {
      setError("Nemůžete si odebrat vlastní administrátorská práva.");
      return;
    }
    try {
      await updateDoc(doc(db, "users", userId), { 
        role, 
        permissions: ROLE_DEFAULTS[role],
        updatedAt: serverTimestamp() 
      });
    } catch (err) {
      console.error(err);
      setError("Nepodařilo se aktualizovat práva uživatele.");
    }
  };

  const updateUserAdminAlias = async (userId: string, adminAlias: string) => {
    try {
      await updateDoc(doc(db, "users", userId), { 
        adminAlias, 
        updatedAt: serverTimestamp() 
      });
    } catch (err) {
      console.error(err);
      setError("Nepodařilo se aktualizovat poznámku k uživateli.");
    }
  };

  const getAvatarForChild = (childName: string) => {
    if (!childName) return "👶";
    
    // Check for admin custom avatars
    if (childName === "Táta") {
      const tataProfile = Object.values(userProfiles).find(p => p.email?.toLowerCase() === "zefran3@gmail.com");
      if (tataProfile?.avatar) return tataProfile.avatar;
      return "👨";
    }
    if (childName === "Eva") {
      const evaProfile = Object.values(userProfiles).find(p => p.email?.toLowerCase() === "eva.kubartova@gmail.com");
      if (evaProfile?.avatar) return evaProfile.avatar;
      return "👩";
    }

    if (childName === "Emma") return "👧";
    if (childName === "František") return "👦";
    
    let hash = 0;
    for (let i = 0; i < childName.length; i++) {
      hash = childName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_OPTIONS[Math.abs(hash) % AVATAR_OPTIONS.length];
  };

  const getLoggedInFamilyName = (): string => {
    const email = user?.email?.toLowerCase();
    if (email === "zefran3@gmail.com") return "Táta";
    if (email === "eva.kubartova@gmail.com") return "Eva";
    if (email === "emasterba@gmail.com") return "Emma";
    if (email === "frantisek.sterba2010@gmail.com") return "František";
    return "";
  };
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max&timezone=auto`);
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
             const weekendData = [];
             for (let i = 0; i < weatherData.daily.time.length; i++) {
                const dateObj = new Date(weatherData.daily.time[i]);
                const dayOfWeek = dateObj.getDay();
                if (dayOfWeek === 6 || dayOfWeek === 0) {
                   weekendData.push({
                      dayName: dayOfWeek === 6 ? 'Sobota' : 'Neděle',
                      date: weatherData.daily.time[i],
                      maxTemp: Math.round(weatherData.daily.temperature_2m_max[i]),
                      minTemp: Math.round(weatherData.daily.temperature_2m_min[i]),
                      precipProb: weatherData.daily.precipitation_probability_max[i] || 0,
                      windSpeed: Math.round(weatherData.daily.windspeed_10m_max[i]),
                      icon: getWeatherIcon(weatherData.daily.weathercode[i])
                   });
                }
             }
             setForecast(weekendData.slice(0, 2));
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
    const scores: Record<string, { childName: string; score: number; avatar: string }> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    suggestions.forEach(s => {
      if (s.status === 'approved' && s.eventDate && s.type !== 'ride') {
        const eventDateObj = new Date(s.eventDate);
        if (eventDateObj < today) {
          const childNameKey = s.childName || "Neznámý";
          if (!scores[childNameKey]) {
            scores[childNameKey] = {
              childName: childNameKey,
              score: 0,
              avatar: getAvatarForChild(childNameKey)
            };
          }
          scores[childNameKey].score += 1;
        }
      }
    });

    return Object.values(scores).sort((a, b) => b.score - a.score);
  }, [suggestions]);

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
    rideFrom: "",
    rideTo: ""
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
    // AGRESIVNÍ DEBUG v1.4.6
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
        alert("DEBUG CHYBA: " + e.message);
      }
    } else if (urlParams.get('auth_error')) {
      alert("DEBUG: Google vrátil chybu");
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
              console.log('Notification permission granted.');
              getToken(messaging, { vapidKey: 'BKgR9vuJB_M_fGqrzFANmtEA7B0i6gzV7xsN9gv05eEotLpgGD1LeyLGWbEOaE_rsCAsKL6uxRnPn46TljVIROk' }).then((currentToken) => {
                if (currentToken) {
                  setDoc(doc(db, "users", currentUser.uid), { fcmToken: currentToken }, { merge: true }).catch(console.error);
                } else {
                  console.log('No registration token available. Request permission to generate one.');
                }
              }).catch((err) => {
                console.log('An error occurred while retrieving token. ', err);
              });
            } else {
              console.log('Unable to get permission to notify.');
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
        id: doc.id,
        ...doc.data()
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
        id: doc.id,
        ...doc.data()
      })) as Inspiration[];
      setInspirations(data);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeSuggestions();
      unsubscribeInspirations();
    };
  }, [user]);

  const handleGenerateInspirations = async () => {
    setIsGeneratingInspiration(true);
    try {
      const res = await fetch('/api/agent/generate', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: weather?.city })
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        const errorMsg = errorData?.error || "";
        
        if (errorMsg.includes("503") || errorMsg.includes("high demand")) {
          throw new Error("AI servery jsou přetížené. Zkuste to za pár minut.");
        }
        throw new Error("Nepodařilo se spojit s AI agentem. Zkuste to později.");
      }
      setSuccess("Nové tipy byly úspěšně vygenerovány!");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Chyba při generování tipů.");
    } finally {
      setIsGeneratingInspiration(false);
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

      const response = await fetch('/api/calendar/events', {
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
          // setGoogleTokens(null); // Dočasně vypnuto, abychom viděli chybu a nezmizela hned
        }
      }
    } catch (error) {
      console.error("Failed to fetch calendar events:", error);
    }
  };

  const handleConnectGoogle = async () => {
    try {
      const response = await fetch('/api/auth/google/url');
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

      await addDoc(collection(db, path), {
        title: formType === "ride" ? `Odvoz: ${newSuggestion.rideFrom} ➡️ ${newSuggestion.rideTo}` : newSuggestion.title,
        description: formType === "ride" ? `Potřebuji odvézt.\nOdkud: ${newSuggestion.rideFrom}\nKam: ${newSuggestion.rideTo}` : newSuggestion.description,
        childName: finalChildName,
        authorId: user.uid,
        eventDate: newSuggestion.eventDate,
        eventTime: newSuggestion.eventTime,
        location: newSuggestion.location,
        status: "pending",
        type: formType,
        ...(formType === "ride" ? { rideFrom: newSuggestion.rideFrom, rideTo: newSuggestion.rideTo } : {}),
        likes: 0,
        createdAt: serverTimestamp()
      });
      handleCloseForm();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setFormType("activity");
    setNewSuggestion({ title: "", description: "", eventDate: "", eventTime: "", location: "", childName: "", customChildName: "", rideFrom: "", rideTo: "" });
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

  const handleGradeActivity = async (id: string, grade: number) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'suggestions', id), { grade });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `suggestions/${id}`);
    }
  };

  const handleRepeatActivity = (suggestion: ActivitySuggestion) => {
    setFormType(suggestion.type === "ride" ? "ride" : "activity");
    setNewSuggestion({
      title: suggestion.type === "ride" ? "" : suggestion.title, // pro odvoz se title generuje z from/to
      description: suggestion.type === "ride" ? "" : (suggestion.description || ""), // podobne description
      childName: "", // dítě si jméno vždy naklikne/vybere
      customChildName: "",
      eventDate: "",
      eventTime: "",
      rideFrom: suggestion.rideFrom || "",
      rideTo: suggestion.rideTo || ""
    });
    setShowArchive(false);
    setShowForm(true);
  };

  const handleUpdateStatus = async (id: string, status: "approved" | "rejected") => {
    // Ověření kalendáře vynucujeme jen pro Schválení, Zamítnout můžeme kdykoliv
    if (status === "approved" && !googleTokens) {
      setError("Než schválíte aktivitu, musíte se propojit s Google Kalendářem (modré tlačítko výše).");
      return;
    }

    const path = `suggestions/${id}`;
    try {
      await updateDoc(doc(db, 'suggestions', id), { status });
      
      if (status === "approved" && googleTokens) {
        const suggestion = suggestions.find(s => s.id === id);
        if (suggestion) {
          
          let eventParams: any = {};

          if (suggestion.eventTime) {
            // Pokus o extrakci platného času (HH:MM) z eventTime
            const timeMatch = suggestion.eventTime.match(/^(\d{1,2}):(\d{2})$/);
            
            if (timeMatch && suggestion.eventDate) {
              // Standardní čas (např. "14:00") + platné datum
              try {
                let eventDateObj = new Date(`${suggestion.eventDate}T${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}:00`);
                if (isNaN(eventDateObj.getTime())) throw new Error("Invalid date");
                
                const endDateObj = new Date(eventDateObj.getTime() + (suggestion.type === "ride" ? 0.5 : 2) * 60 * 60 * 1000);
                eventParams = {
                  start: { dateTime: eventDateObj.toISOString(), timeZone: 'Europe/Prague' },
                  end: { dateTime: endDateObj.toISOString(), timeZone: 'Europe/Prague' },
                };
              } catch {
                // Fallback na celodenní událost
                eventParams = {
                  start: { date: suggestion.eventDate },
                  end: { date: (() => { const d = new Date(suggestion.eventDate); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })() },
                };
              }
            } else {
              // Nestandartní čas (otevírací doba, "celý den" atd.) → celodenní událost
              let eventDateString = suggestion.eventDate;
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
            let eventDateString = suggestion.eventDate;
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

          const res = await fetch('/api/calendar/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokens: googleTokens, event }),
          });

          if (!res.ok) {
             throw new Error("Nepodařilo se vytvořit událost v kalendáři.");
          }

          const createdEvent = await res.json();
          await updateDoc(doc(db, 'suggestions', id), { calendarEventId: createdEvent.id });

          fetchCalendarEvents(googleTokens);
        }
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

  const handleConfirmCancel = async () => {
    if (!cancellingEvent || !cancelReason.trim()) return;

    try {
      const suggestion = cancellingEvent;
      const path = `suggestions/${suggestion.id}`;

      // Smazání z kalendáře v případě schválené události
      if (suggestion.calendarEventId && googleTokens) {
        try {
          await fetch('/api/calendar/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokens: googleTokens, eventId: suggestion.calendarEventId }),
          });
          fetchCalendarEvents(googleTokens);
        } catch (e) {
          console.error("Nepodařilo se smazat z kalendáře", e);
        }
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
    <div className="min-h-screen text-stone-800 font-sans selection:bg-rose-100" style={{ backgroundImage: "url('/bg.png')", backgroundSize: 'cover', backgroundPosition: 'center bottom', backgroundAttachment: 'fixed' }}>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b-2 border-stone-200 px-4 md:px-8 py-2 md:py-2.5 flex items-center justify-between overflow-hidden relative">
        <div className="flex items-center">
          <img src="/logo.png" alt="Víkendovník" className="h-12 md:h-16 w-auto object-contain scale-[1.3] md:scale-[1.5] origin-left border-none outline-none" />
        </div>

        {weather && (
          <button 
            onClick={() => setShowWeatherModal(true)}
            className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center gap-2 bg-stone-50 hover:bg-stone-100 transition-colors cursor-pointer px-3 py-1.5 rounded-full border border-stone-200 text-sm font-semibold text-stone-600 shadow-sm mx-auto"
          >
            <span className="text-lg leading-none">{weather.icon}</span>
            <span>{weather.temp} °C</span>
            <span className="text-stone-400 font-medium">{weather.city}</span>
          </button>
        )}
        
        <div className="flex items-center gap-3 ml-auto z-10">
          {user ? (
            <>
              {["zefran3@gmail.com"].includes(user.email?.toLowerCase() || "") && (
                <button 
                  onClick={() => {
                    setView(view === "parent" ? "child" : "parent");
                    setShowInspirationsView(false);
                    setShowArchive(false);
                    setShowUserManagement(false);
                    setShowVyskovOnly(false);
                    setExpandedInspiration(null);
                    setExpandedSuggestion(null);
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-stone-500 hover:bg-rose-50 hover:text-rose-500 transition-colors text-sm font-semibold"
                >
                  {view === "parent" ? <User size={16} /> : <Settings size={16} />}
                  {view === "parent" ? "Rodina" : "Administrátor"}
                </button>
              )}
              {leaderboard.find(l => l.authorId === user.uid)?.score ? (
                <div 
                  className="flex items-center gap-1.5 bg-amber-100 text-amber-600 px-3 py-1.5 rounded-full text-xs font-black shadow-sm border border-amber-200" 
                  title="Skóre zrealizovaných nápadů"
                >
                  <span>🏆</span> {leaderboard.find(l => l.authorId === user.uid)?.score}
                </div>
              ) : null}
              <button
                onClick={() => setShowAvatarModal(true)}
                className="w-10 h-10 rounded-full border-2 border-rose-200 bg-white overflow-hidden shadow-sm flex items-center justify-center hover:border-rose-400 transition-all"
                title="Změnit avatara"
              >
                {userProfiles[user.uid]?.avatar ? (
                  userProfiles[user.uid].avatar.startsWith("data:") || userProfiles[user.uid].avatar.startsWith("http") ? (
                    <img src={userProfiles[user.uid].avatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl leading-none">{userProfiles[user.uid].avatar}</span>
                  )
                ) : user.photoURL ? (
                    <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User size={20} className="text-stone-400" />
                )}
              </button>
              <button 
                onClick={handleLogout}
                className="p-2 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Odhlásit se"
              >
                <LogOut size={18} />
              </button>
            </>
          ) : null}
        </div>
      </header>

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
      ) : (
      <motion.main 
        key="dashboard"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
        className="grid grid-cols-1 landscape:grid-cols-[260px_1fr] md:grid-cols-[320px_1fr] gap-6 landscape:p-4 md:p-6 max-w-6xl mx-auto flex-grow box-border pb-32 md:pb-6 relative"
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
        
        <aside className="flex flex-col gap-5 landscape:sticky md:sticky landscape:top-[70px] md:top-[80px] landscape:h-fit md:h-fit landscape:max-h-[calc(100vh-90px)] md:max-h-[calc(100vh-100px)] overflow-y-auto scrollbar-hide landscape:pb-4 md:pb-4 -mx-2 px-2 md:mx-0 md:px-0">
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
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setShowUserManagement(true)}
                  className="px-4 py-2.5 rounded-xl bg-stone-800 text-white font-bold text-xs w-full flex items-center justify-center gap-2 hover:bg-stone-900 transition-colors shadow-sm"
                >
                  <User size={16} /> Správa uživatelů
                </button>
                {userProfiles[user?.uid || '']?.role !== 'viewer' && (
                  <button
                    onClick={() => { 
                      if (showInspirationsView) { 
                        setExpandedInspiration(null); 
                        setShowVyskovOnly(false);
                      } 
                      else { setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100); }
                      setShowInspirationsView(!showInspirationsView); 
                    }}
                    className="px-4 py-2.5 rounded-xl bg-indigo-500 text-white font-bold text-xs w-full flex items-center justify-center gap-2 hover:bg-indigo-600 transition-colors shadow-sm"
                  >
                    {showInspirationsView ? "Zpět na nástěnku" : "✨ Inspirace na víkend"}
                  </button>
                )}
              </div>
            )}
            {view === "child" && (
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => {
                    setFormType("activity");
                    setNewSuggestion(prev => ({ ...prev, childName: getLoggedInFamilyName() }));
                    setShowForm(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-rose-500 text-white font-bold text-xs w-full flex items-center justify-center gap-2 hover:bg-rose-600 transition-colors shadow-sm"
                >
                  <Plus size={16} /> Přidat aktivitu
                </button>
                {userProfiles[user?.uid || '']?.role !== 'viewer' && (
                  <>
                    <button 
                      onClick={() => {
                        setFormType("ride");
                        setNewSuggestion(prev => ({ ...prev, childName: getLoggedInFamilyName() }));
                        setShowForm(true);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-xs w-full flex items-center justify-center gap-2 hover:bg-orange-600 transition-colors shadow-sm"
                    >
                      🚗 Potřebuji odvézt
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
                      className="px-4 py-2.5 rounded-xl bg-indigo-500 text-white font-bold text-xs w-full flex items-center justify-center gap-2 hover:bg-indigo-600 transition-colors shadow-sm"
                    >
                      {showInspirationsView ? "Zpět na nástěnku" : "✨ Inspirace na víkend"}
                    </button>
                    {showInspirationsView && (
                      <button 
                        onClick={() => setShowVyskovOnly(!showVyskovOnly)}
                        className={cn(
                          "px-4 py-2.5 rounded-xl font-bold text-xs w-full flex items-center justify-center gap-2 transition-all shadow-sm border-2",
                          showVyskovOnly 
                            ? "bg-amber-400 border-amber-500 text-amber-950" 
                            : "bg-white border-indigo-100 text-indigo-500 hover:border-indigo-200"
                        )}
                      >
                        🏰 {showVyskovOnly ? "Všechny tipy" : "Akce ve Vyškově"}
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

          {/* Leaderboard Section */}
          {leaderboard.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-b from-amber-50 to-orange-50 border text-center border-amber-200 rounded-2xl p-5 shadow-[inset_0_4px_8px_rgba(255,255,255,0.8),inset_0_-3px_6px_rgba(0,0,0,0.04),0_6px_12px_-2px_rgba(0,0,0,0.07)]"
            >
              <div className="text-[13px] uppercase tracking-widest text-amber-600 mb-4 font-extrabold flex items-center justify-center gap-2">
                <span>🏆</span> Žebříček úspěchů
              </div>
              <div className="flex flex-col gap-2">
                {leaderboard.map((l, idx) => (
                  <button 
                    key={l.childName} 
                    onClick={() => setSelectedLeaderboardUser(l.childName)}
                    className="w-full flex items-center justify-between bg-white p-3 rounded-xl border border-amber-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:bg-orange-50 transition-all cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("font-black w-5 text-left", idx === 0 ? "text-amber-500 text-lg" : idx === 1 ? "text-stone-400" : idx === 2 ? "text-amber-700" : "text-stone-300 text-sm")}>
                        {idx + 1}.
                      </div>
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-white border border-stone-200 flex items-center justify-center flex-shrink-0">
                        {l.avatar.startsWith('http') || l.avatar.startsWith('data:') ? (
                          <img src={l.avatar} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-base leading-none">{l.avatar}</span>
                        )}
                      </div>
                      <span className="font-bold text-stone-700 text-sm">{l.childName}</span>
                    </div>
                    <div className="text-sm font-extrabold text-white bg-amber-400 px-3 py-1 rounded-full">{l.score}</div>
                  </button>
                ))}
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
        <section className="flex flex-col gap-5">
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
              
              {inspirations.length > 0 ? (
                <div className="columns-1 md:columns-2 gap-5 pb-4">
                  {inspirations
                    .filter(insp => {
                      // Pokud je zapnutý filtr na Vyškov, ukaž jen ty s příznakem
                      if (showVyskovOnly && !insp.is_vyskov) return false;

                      if (view === "parent") return true;
                      const userEmail = user?.email?.toLowerCase();
                      if (userEmail === "emasterba@gmail.com") return insp.target === "pro_dceru" || insp.target === "pro_vsechny";
                      if (userEmail === "frantisek.sterba2010@gmail.com" || userEmail === "zefran3@gmail.com") return insp.target === "pro_syna" || insp.target === "pro_vsechny";
                      return insp.target === "pro_vsechny";
                    })
                    .map(insp => (
                    <div key={insp.id} className="break-inside-avoid inline-block w-full mb-5 bg-white p-6 rounded-2xl shadow-sm border border-indigo-50 flex flex-col justify-between hover:shadow-md transition-shadow">
                      <div>
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
                        <h4 className="font-extrabold text-stone-800 text-lg mb-2 leading-tight">{insp.title}</h4>
                        <div className="text-xs text-stone-400 mb-3 font-bold flex items-center justify-between">
                          <div className="flex items-center gap-1">📍 {insp.location}</div>
                          {userProfiles[user?.uid || '']?.role !== 'child' && (
                            <a 
                              href={`https://mapy.cz/zakladni?q=${encodeURIComponent(insp.location)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[10px] text-indigo-500 hover:text-indigo-700 transition-colors bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100"
                            >
                              <Navigation size={12} /> Trasa
                            </a>
                          )}
                        </div>
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
                          {insp.cycling_info && (
                            <>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                                🚲 {insp.cycling_info.distance}
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                                📈 {insp.cycling_info.elevation}
                              </span>
                            </>
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
                              
                              {/* Datum */}
                              <div className="flex items-center gap-2">
                                <Calendar size={14} className="text-indigo-400 flex-shrink-0" />
                                <strong>Datum:</strong> {insp.date ? (() => { try { return format(parseISO(insp.date), "EEEE d. MMMM yyyy", { locale: cs }); } catch { return insp.date; } })() : "Bude upřesněno"}
                              </div>
                              
                              {/* Čas — chytré zobrazení dle time_type */}
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
                              
                              {/* Místo */}
                              <div className="flex items-center gap-2">
                                <MapPin size={14} className="text-indigo-400 flex-shrink-0" />
                                <strong>Místo:</strong> {insp.location}
                              </div>

                              {/* Cena */}
                              {insp.price && (
                                <div className="flex items-center gap-2">
                                  <span className="text-indigo-400 flex-shrink-0 text-xs font-bold">💰</span>
                                  <strong>Cena:</strong> {insp.price}
                                </div>
                              )}

                              {/* Délka */}
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
                                </div>
                              )}

                              {/* Věk */}
                              {insp.age_recommendation && (
                                <div className="flex items-center gap-2">
                                  <Baby size={14} className="text-indigo-400 flex-shrink-0" />
                                  <strong>Vhodné:</strong> {insp.age_recommendation}
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
                              {insp.cinema_listings && insp.cinema_listings.filter(l => l.film && l.film.trim() !== "").length > 0 && (
                                <div className="mt-3 border-t border-indigo-100/50 pt-3">
                                  <div className="font-bold text-indigo-600 text-xs uppercase tracking-wider mb-3 flex items-center gap-1">
                                    <Film size={12} /> Program kina
                                  </div>
                                  <div className="space-y-2">
                                    {insp.cinema_listings
                                      .filter(listing => listing.film && listing.film.trim() !== "")
                                      .map((listing: CinemaListing, idx: number) => (
                                      <div key={idx} className="flex items-center bg-white rounded-lg p-3 border border-indigo-100/50 shadow-sm">
                                        <div>
                                          <div className="font-bold text-stone-800 text-sm">{listing.film}</div>
                                          <div className="text-xs text-stone-500 mt-0.5">🕐 {listing.time || "Dle programu"}</div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
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
                                
                                if (userProfiles[user?.uid || '']?.role === 'child') return null;

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
                                      /* Běžná akce — Navigovat + Web akce */
                                      <>
                                        <a 
                                          href={`https://mapy.cz/zakladni?q=${encodeURIComponent(insp.location.replace(/\s*\(.*?\)\s*/g, '').trim())}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-lg border border-indigo-200 text-indigo-600 font-bold text-xs hover:bg-indigo-50 transition-colors shadow-sm"
                                        >
                                          <Navigation size={14} />
                                          Navigovat
                                        </a>
                                        {insp.url && (
                                          <a 
                                            href={insp.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-lg border border-indigo-200 text-indigo-600 font-bold text-xs hover:bg-indigo-50 transition-colors shadow-sm"
                                          >
                                            <ExternalLink size={14} />
                                            Web akce
                                          </a>
                                        )}
                                      </>
                                    )}
                                {insp.ticket_url && (
                                  <a 
                                    href={insp.ticket_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500 text-white rounded-lg font-bold text-xs hover:bg-indigo-600 transition-colors shadow-sm"
                                  >
                                    <ExternalLink size={14} />
                                    Koupit lístky
                                  </a>
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
                          onClick={() => setExpandedInspiration(expandedInspiration === insp.id ? null : insp.id)}
                          className="flex-1 py-3 bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1"
                        >
                          {expandedInspiration === insp.id ? "Méně info" : "Více info"}
                        </button>
                        <button 
                          onClick={() => {
                            setNewSuggestion(prev => ({
                              ...prev,
                              title: insp.title,
                              description: insp.description,
                              eventDate: insp.date || "",
                              eventTime: insp.time || "",
                              location: insp.location || "",
                              childName: getLoggedInFamilyName()
                            }));
                            setFormType("activity");
                            setShowForm(true);
                            setShowInspirationsView(false);
                          }}
                          className="flex-[2] py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold text-xs rounded-xl transition-colors border border-indigo-200"
                        >
                          Chci tohle navrhnout!
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
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
              <div className="flex flex-col gap-3 sticky top-[60px] md:top-[80px] z-40 bg-white/85 backdrop-blur-xl py-4 -mx-6 px-6 md:-mx-2 md:px-4 md:rounded-2xl shadow-sm border-b md:border border-stone-200/50 mb-2">
                <div className="text-[13px] uppercase tracking-widest text-stone-500 font-bold flex items-center justify-center md:justify-start gap-2 drop-shadow-sm">
                  <span>🌟</span> Nástěnka přání a nápadů
                </div>
                
                <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                  {[
                    { id: "all", label: "Vše" },
                    { id: "pending", label: "Čekající" },
                    { id: "approved", label: "Schválené" },
                    { id: "rejected", label: "Zamítnuté" },
                    { id: "cancelled", label: "Zrušené" },
                    { id: "ride", label: "🚗 Odvoz" }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setBoardFilter(f.id as any)}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm",
                        boardFilter === f.id 
                          ? "bg-stone-700 text-white shadow-md border-transparent" 
                          : "bg-white text-stone-500 border border-stone-200 hover:border-stone-300 hover:text-stone-700"
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

          <div className="columns-1 md:columns-2 gap-4">
            <AnimatePresence mode="popLayout">
                {suggestions
                  .filter(suggestion => {
                    if (suggestion.status === "approved" && suggestion.eventDate) {
                      const eventDate = new Date(suggestion.eventDate);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      if (eventDate < today) {
                        return false;
                      }
                    }
                    return boardFilter === "all" ? true : boardFilter === "ride" ? suggestion.type === "ride" : suggestion.status === boardFilter;
                  })
                  .sort((a, b) => {
                    // Žádosti o přehodnocení primárně nahoru
                    if (a.reconsiderationRequested && !b.reconsiderationRequested) return -1;
                    if (!a.reconsiderationRequested && b.reconsiderationRequested) return 1;

                    // Priorita stavů
                    const getPriority = (status: string) => {
                      if (status === "pending") return 1;
                      if (status === "approved") return 2;
                      return 3;
                    };
                    const pA = getPriority(a.status);
                    const pB = getPriority(b.status);
                    if (pA !== pB) return pA - pB;

                    // Pokud jsou obě schválené, řadit podle nejbližšího data eventDate
                    if (a.status === "approved" && b.status === "approved") {
                      const dateA = a.eventDate ? new Date(a.eventDate).getTime() : Infinity;
                      const dateB = b.eventDate ? new Date(b.eventDate).getTime() : Infinity;
                      if (dateA !== dateB) return dateA - dateB;
                    }

                    // Jinak řadit podle času vytvoření (novější nahoře)
                    return b.createdAt - a.createdAt;
                  })
                  .map((suggestion) => (
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
                            suggestion.status === "rejected" ? "bg-red-500 text-white" :
                            suggestion.status === "cancelled" ? "bg-stone-500 text-white" :
                            "bg-amber-500 text-white"
                          )}>
                            {suggestion.status === "approved" ? "Schváleno" :
                             suggestion.status === "rejected" ? "Zamítnuto" :
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
                          {view === "parent" && (
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
                          <a 
                            href={`https://mapy.cz/zakladni?q=${encodeURIComponent(suggestion.location.replace(/\s*\(.*?\)\s*/g, '').trim())}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 flex items-center gap-2 text-xs text-stone-500 font-medium p-2 rounded-lg hover:bg-rose-50 hover:text-rose-600 transition-colors active:bg-rose-100 cursor-pointer"
                          >
                            <MapPin size={14} className="text-rose-400 flex-shrink-0" />
                            <span className="underline decoration-dotted underline-offset-2">{suggestion.location}</span>
                          </a>
                          
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
                                    <strong>Datum:</strong> {(() => { try { return format(parseISO(suggestion.eventDate), "EEEE d. MMMM yyyy", { locale: cs }); } catch { return suggestion.eventDate; } })()}
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
                                  <a 
                                    href={`https://mapy.cz/zakladni?q=${encodeURIComponent(suggestion.location.replace(/\s*\(.*?\)\s*/g, '').trim())}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-rose-200 text-rose-500 font-bold text-xs hover:bg-rose-50 transition-colors shadow-sm"
                                  >
                                    <Navigation size={14} />
                                    Navigovat
                                  </a>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </>
                      )}
                      
                      {suggestion.rejectReason && (
                        <div className="mt-3 p-3 bg-white/60 rounded-lg text-sm text-stone-700 italic border border-stone-200/50">
                          <strong>{suggestion.status === "cancelled" ? "Důvod zrušení:" : "Důvod zamítnutí:"}</strong> {suggestion.rejectReason}
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
                            Navrhl(a): <strong className="font-bold text-stone-700">{suggestion.childName}</strong> • {
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

                    {view === "parent" && suggestion.status === "pending" && (
                      <div className="mt-4 flex gap-2">
                        <button 
                          onClick={() => handleUpdateStatus(suggestion.id, "approved")}
                          className="px-4 py-2.5 rounded-xl bg-green-500 text-white font-bold text-xs hover:opacity-90 transition-opacity flex-1"
                        >
                          Schválit
                        </button>
                        <button 
                          onClick={() => handleUpdateStatus(suggestion.id, "rejected")}
                          className="px-4 py-2.5 rounded-xl bg-red-500 text-white font-bold text-xs hover:opacity-90 transition-opacity flex-1"
                        >
                          Zamítnout
                        </button>
                      </div>
                    )}

                    {view === "parent" && (suggestion.status === "rejected" || suggestion.status === "cancelled") && (
                      <div className="mt-4 flex flex-col gap-2">
                        {suggestion.reconsiderationRequested && (
                          <div className="text-xs text-amber-600 font-bold bg-amber-100 p-2 rounded-lg text-center flex items-center justify-center gap-1 border border-amber-200">
                            <span>⚠️</span> Dítě žádá o přehodnocení!
                          </div>
                        )}
                        {suggestion.appealReason && (
                          <div className="text-xs text-stone-700 bg-amber-50 p-3 rounded-lg border border-amber-100 italic">
                            <strong>Důvod:</strong> {suggestion.appealReason}
                          </div>
                        )}
                        <button 
                          onClick={() => handleReopen(suggestion.id)}
                          className="px-4 py-2.5 rounded-xl bg-stone-800 text-white font-bold text-xs hover:opacity-90 transition-opacity w-full"
                        >
                          Znovu otevřít k posouzení
                        </button>
                      </div>
                    )}

                    {view === "child" && user && user.uid === suggestion.authorId && (suggestion.status === "rejected" || suggestion.status === "cancelled") && !suggestion.reconsiderationRequested && !suggestion.hasAppealed && (
                       <div className="mt-4">
                        <button 
                          onClick={() => handleOpenAppeal(suggestion)}
                          className="px-4 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-xs hover:opacity-90 transition-opacity w-full"
                        >
                          Požádat o přehodnocení
                        </button>
                      </div>
                    )}

                    {view === "child" && (suggestion.status === "rejected" || suggestion.status === "cancelled") && suggestion.hasAppealed && !suggestion.reconsiderationRequested && (
                       <div className="mt-4 text-xs text-center text-stone-500 font-serif italic bg-stone-50 rounded-lg p-3 border border-stone-200">
                         Tento ortel je vytesán do chladné skály,<br/>a všechny dřívější prosby už podzimní vítr svál.
                       </div>
                    )}

                    {view === "child" && suggestion.reconsiderationRequested && (
                      <div className="mt-4 text-xs text-center text-orange-600 font-bold bg-orange-50 rounded-lg p-2 border border-orange-100">
                        Žádost o přehodnocení odeslána.
                      </div>
                    )}

                    {suggestion.status === "approved" && (
                      <div className="text-[11px] text-green-700 font-semibold mt-3">
                        ✓ Zapsáno do Google kalendáře
                      </div>
                    )}
                  </motion.div>
                ))
              }
              
              {view === "child" && (
                <motion.div
                  onClick={() => {
                    setFormType("activity");
                    setNewSuggestion(prev => ({ ...prev, childName: getLoggedInFamilyName() }));
                    setShowForm(true);
                  }}
                  className="break-inside-avoid inline-block w-full mb-4 rounded-[20px] p-5 border-2 border-dashed border-stone-200 flex flex-col justify-center items-center min-h-[160px] cursor-pointer hover:bg-stone-50 transition-colors"
                >
                  <div className="text-center text-stone-400">
                    <div className="text-3xl font-light mb-1">+</div>
                    <div className="text-sm font-bold">Další nápad</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
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
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[32px] p-8 z-[70] shadow-2xl max-w-2xl mx-auto border-t border-stone-200"
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
                      {FAMILY_MEMBERS.map(name => (
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

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2 block">
                        {formType === "ride" ? "Kdy?" : "Kdy to bude?"}
                      </label>
                      <input 
                        type="date"
                        required
                        value={newSuggestion.eventDate}
                        onChange={e => setNewSuggestion({...newSuggestion, eventDate: e.target.value})}
                        className="w-full p-3 rounded-xl bg-stone-50 border border-stone-200 focus:border-rose-500 outline-none transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2 block flex justify-between items-center">
                        {formType === "ride" ? "V kolik?" : "V kolik hodin?"} <span className="text-[9px] text-stone-400 font-normal normal-case opacity-70">({formType === "ride" ? "nutné" : "volitelné"})</span>
                      </label>
                      <input 
                        type="time"
                        required={formType === "ride"}
                        value={newSuggestion.eventTime}
                        onChange={e => setNewSuggestion({...newSuggestion, eventTime: e.target.value})}
                        className="w-full p-3 rounded-xl bg-stone-50 border border-stone-200 focus:border-rose-500 outline-none transition-all text-sm"
                      />
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
                      // Nehodnocené úplně dole (a.grade || 99)
                      const gradeA = a.grade || 99;
                      const gradeB = b.grade || 99;
                      if (gradeA !== gradeB) return gradeA - gradeB;
                      return b.createdAt - a.createdAt; 
                    } else {
                      return b.createdAt - a.createdAt; // Zrušené řadíme od nejnovějších
                    }
                  })
                  .map(suggestion => (
                  <div id={`archive-${suggestion.id}`} key={suggestion.id} className="bg-white rounded-[24px] p-5 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.05)] border border-stone-100 flex flex-col gap-4 scroll-mt-6 transition-all duration-500">
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
                           {suggestion.childName}
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
                            <div className="text-[9px] text-stone-400 leading-none mt-0.5">(jako ve škole, 1 = nejlepší)</div>
                          </div>
                          <div className="flex gap-1 mt-1">
                            {[1, 2, 3, 4, 5].map(num => (
                              <button
                                key={num}
                                onClick={() => handleGradeActivity(suggestion.id, num)}
                                className={cn(
                                  "w-7 h-7 rounded-full text-xs font-black transition-all flex items-center justify-center",
                                  suggestion.grade === num 
                                    ? "bg-rose-500 text-white shadow-md scale-110" 
                                    : "bg-white text-stone-400 border border-stone-200 hover:border-rose-300 hover:text-rose-500"
                                )}
                              >
                                {num}
                              </button>
                            ))}
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
                  </div>
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
                  <span>🏆</span> Úspěchy: {selectedLeaderboardUser}
                </h2>
                <button onClick={() => setSelectedLeaderboardUser(null)} className="text-stone-400 hover:text-stone-600 bg-stone-100 p-2 rounded-full cursor-pointer">
                  <X size={20} />
                </button>
              </div>

              <div className="overflow-y-auto pr-1 flex flex-col gap-3">
                {suggestions
                  .filter(s => s.status === 'approved' && s.type !== 'ride' && (s.childName === selectedLeaderboardUser || (!s.childName && selectedLeaderboardUser === "Neznámý")) && s.eventDate && new Date(s.eventDate) < new Date(new Date().setHours(0,0,0,0)))
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
                
                {suggestions.filter(s => s.status === 'approved' && s.type !== 'ride' && (s.childName === selectedLeaderboardUser || (!s.childName && selectedLeaderboardUser === "Neznámý")) && s.eventDate && new Date(s.eventDate) < new Date(new Date().setHours(0,0,0,0))).length === 0 && (
                  <div className="text-center p-5 text-stone-400 text-sm italic">Žádné realizované výlety nenalezeny.</div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <input type="file" ref={commentFileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleCommentPhotoChange} />

      {/* User Management Modal */}
      <AnimatePresence>
        {showUserManagement && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowUserManagement(false)}
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-[70] transition-opacity"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-2xl bg-white rounded-[24px] p-6 shadow-2xl z-[70] flex flex-col gap-6 border-2 border-stone-100 max-h-[85vh]"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold text-stone-800 tracking-tight flex items-center gap-2">
                  <span>👥</span> Správa uživatelů a práv
                </h2>
                <button onClick={() => setShowUserManagement(false)} className="text-stone-400 hover:text-stone-600 bg-stone-100 p-2 rounded-full cursor-pointer">
                  <X size={20} />
                </button>
              </div>

              <div className="overflow-y-auto pr-1">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-stone-100 text-[11px] uppercase tracking-wider text-stone-400 font-bold">
                      <th className="pb-3 px-2">Uživatel</th>
                      <th className="pb-3 px-2 text-center">Role</th>
                      <th className="pb-3 px-2">Oprávnění</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(userProfiles).map((profile) => (
                      <tr key={profile.id} className="border-b border-stone-50 hover:bg-stone-50 transition-colors">
                        <td className="py-4 px-2">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-white border border-stone-200 flex items-center justify-center flex-shrink-0">
                              {profile.avatar?.startsWith('http') || profile.avatar?.startsWith('data:') ? (
                                <img src={profile.avatar} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-base leading-none">{profile.avatar || "👤"}</span>
                              )}
                            </div>
                            <div className="flex flex-col">
                              <input 
                                type="text"
                                defaultValue={profile.adminAlias || profile.displayName || profile.email?.split('@')[0]}
                                onBlur={(e) => {
                                  if (e.target.value !== (profile.adminAlias || profile.displayName || profile.email?.split('@')[0])) {
                                    updateUserAdminAlias(profile.id!, e.target.value);
                                  }
                                }}
                                className="font-bold text-stone-700 text-sm bg-transparent border-b border-transparent hover:border-stone-300 focus:border-indigo-400 focus:outline-none transition-colors"
                                title="Soukromé jméno pro admina"
                              />
                              <span className="text-[10px] text-stone-400">{profile.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-2 text-center">
                          <select 
                            value={profile.role || 'viewer'} 
                            onChange={(e) => updateUserRole(profile.id!, e.target.value as UserRole)}
                            className="text-xs font-bold bg-stone-100 border-none rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-rose-200 outline-none cursor-pointer"
                          >
                            <option value="admin">Admin</option>
                            <option value="parent">Rodič</option>
                            <option value="child">Dítě</option>
                            <option value="viewer">Divák</option>
                          </select>
                        </td>
                        <td className="py-4 px-2">
                          <div className="flex flex-wrap gap-1.5">
                            {profile.role === 'admin' && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 border border-stone-200 uppercase tracking-tighter">Administrátor</span>
                            )}
                            {(profile.permissions || ROLE_DEFAULTS[profile.role || 'viewer']).canSuggest && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-500 border border-blue-100">Navrhuje</span>
                            )}
                            {(profile.permissions || ROLE_DEFAULTS[profile.role || 'viewer']).canComment && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-500 border border-emerald-100">Komentuje</span>
                            )}
                            {(profile.permissions || ROLE_DEFAULTS[profile.role || 'viewer']).canApprove && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-500 border border-rose-100">Schvaluje</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3 items-start">
                <AlertCircle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800 leading-relaxed">
                  <strong>Tip:</strong> Role automaticky nastavují balíček oprávnění. 
                  Admin může spravovat uživatele, Rodič schvalovat výlety, Dítě jen navrhovat a Divák pouze sledovat dění.
                </div>
              </div>
            </motion.div>
          </>
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

    </div>
  );
}
