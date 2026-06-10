import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Bike, ChevronRight, MapPin, Loader2, CheckCircle2, Info, Dice5 } from "lucide-react";
import { cn } from "../lib/utils";

type Difficulty = "easy" | "medium" | "hard";

interface DifficultyOption {
  value: Difficulty;
  label: string;
  sublabel: string;
  emoji: string;
  color: string;
  border: string;
  activeBg: string;
  activeText: string;
}

const DIFFICULTY_OPTIONS: DifficultyOption[] = [
  {
    value:     "easy",
    label:     "Lehká",
    sublabel:  "Rodinná",
    emoji:     "🌿",
    color:     "text-emerald-700",
    border:    "border-emerald-200",
    activeBg:  "bg-emerald-500",
    activeText:"text-white",
  },
  {
    value:     "medium",
    label:     "Střední",
    sublabel:  "Hobby",
    emoji:     "🚴",
    color:     "text-amber-700",
    border:    "border-amber-200",
    activeBg:  "bg-amber-500",
    activeText:"text-white",
  },
  {
    value:     "hard",
    label:     "Těžká",
    sublabel:  "Sportovní",
    emoji:     "⚡",
    color:     "text-rose-700",
    border:    "border-rose-200",
    activeBg:  "bg-rose-500",
    activeText:"text-white",
  },
];

interface Props {
  userCity?: string;
  userId?: string;
  authorName?: string;
  onGenerated?: (suggestion: any) => void;
}

export default function BikeRouteGenerator({ userCity, userId, authorName, onGenerated }: Props) {
  const [distance, setDistance]     = useState(20);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [isLoading, setIsLoading]   = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [success, setSuccess]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleGenerate = async (isRandom: boolean = false) => {
    if (!userId) {
      setError("Pro generování trasy musíš být přihlášen.");
      return;
    }
    setIsLoading(true);
    setSuccess(false);
    setError(null);
    setLoadingMsg(isRandom ? "🎲 Vybírám náhodný směr..." : "Inicializuji generátor...");

    try {
      // SSE přes POST pomocí fetch + ReadableStream
      const API_BASE_URL = window.location.hostname === 'localhost'
        ? `${window.location.protocol}//${window.location.host}`
        : '';
      const response = await fetch(`${API_BASE_URL}/api/agent/generate-bike/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: userCity || "",
          uid: userId,
          distance,
          difficulty,
          isRandom,
          authorName,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Chyba serveru" }));
        throw new Error(err.error || "Chyba serveru");
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Zpracování SSE událostí
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              const payload = JSON.parse(line.slice(6));
              if (currentEvent === "status" && payload.message) {
                setLoadingMsg(payload.message);
              } else if (currentEvent === "done" && payload.suggestion) {
                setSuccess(true);
                onGenerated?.(payload.suggestion);
              } else if (currentEvent === "error") {
                throw new Error(payload.error || "Neznámá chyba");
              }
            } catch (parseErr) {
              // ignorujeme JSON parse chyby pro neúplné řádky
            }
          }
        }
      }
    } catch (err: any) {
      console.error("[GENERATOR] Chyba:", err);
      setError(err.message || "Generování selhalo.");
      setSuccess(false);
    } finally {
      setIsLoading(false);
      setLoadingMsg("");
    }
  };

  const selectedDiff = DIFFICULTY_OPTIONS.find(d => d.value === difficulty)!;

  // Popis délky
  const distanceLabel =
    distance <= 10  ? "Krátká procházka 🌸"   :
    distance <= 20  ? "Pohodová jízda 🌿"      :
    distance <= 35  ? "Pěkný výlet 🚴"         :
    distance <= 55  ? "Náročnější trasa 💪"    :
                      "Maratonská výzva ⚡";

  return (
    <div 
      className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-teal-50 overflow-y-auto shadow-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarGutter: 'stable' }}
    >
      {/* Hlavička — kliknutím rozbalí/sbalí */}
      <button
        onClick={() => setIsExpanded(v => !v)}
        className="w-full flex items-center justify-between p-4 text-left group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-sm">
            <Bike className="text-white" size={20} />
          </div>
          <div>
            <div className="font-bold text-stone-800 text-sm leading-tight">Generátor cyklotras</div>
            <div className="text-[11px] text-stone-505">Navrhni si trasu přesně na míru</div>
          </div>
        </div>
        <ChevronRight
          size={18}
          className={cn(
            "text-stone-400 transition-transform duration-200",
            isExpanded && "rotate-90"
          )}
        />
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-5 flex flex-col gap-5">
              <div className="border-t border-emerald-100" />

              {/* Lokalita */}
              {userCity && (
                <div className="flex items-center gap-1.5 text-[12px] text-stone-500">
                  <MapPin size={13} className="text-emerald-500 flex-shrink-0" />
                  Trasa bude generována v okolí: <span className="font-bold text-stone-700">{userCity}</span>
                </div>
              )}

              {/* Délka trasy */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-baseline">
                  <label className="text-xs font-bold text-stone-700">Délka trasy</label>
                  <div className="flex items-baseline gap-1">
                    <span className={cn(
                      "text-2xl font-extrabold leading-none transition-colors duration-300",
                      distance <= 30 ? "text-emerald-600" : distance <= 60 ? "text-orange-500" : "text-red-500"
                    )}>{distance}</span>
                    <span className="text-xs text-stone-500">km</span>
                  </div>
                </div>

                {/* Slider */}
                <input
                  type="range"
                  min={5}
                  max={80}
                  step={5}
                  value={distance}
                  onChange={e => setDistance(Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer accent-stone-700"
                  style={{
                    background: `linear-gradient(to right, ${distance <= 30 ? "#10b981" : distance <= 60 ? "#f97316" : "#ef4444"} 0%, ${distance <= 30 ? "#10b981" : distance <= 60 ? "#f97316" : "#ef4444"} ${((distance - 5) / 75) * 100}%, #e7f5f0 ${((distance - 5) / 75) * 100}%, #e7f5f0 100%)`
                  }}
                />

                {/* Popis + krajní hodnoty */}
                <div className="flex justify-between text-[10px] text-stone-400">
                  <span>5 km</span>
                  <span className={cn(
                    "font-bold text-[11px] transition-colors duration-300",
                    distance <= 30 ? "text-emerald-600" : distance <= 60 ? "text-orange-500" : "text-red-500"
                  )}>{distanceLabel}</span>
                  <span>80 km</span>
                </div>
              </div>

              {/* Obtížnost */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-stone-700">Obtížnost</label>
                <div className="grid grid-cols-3 gap-2">
                  {DIFFICULTY_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setDifficulty(opt.value)}
                      className={cn(
                        "relative flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 font-bold text-xs transition-all duration-150",
                        difficulty === opt.value
                          ? `${opt.activeBg} ${opt.activeText} border-transparent shadow-md scale-[1.03]`
                          : `bg-white ${opt.border} ${opt.color} hover:scale-[1.01]`
                      )}
                    >
                      <span className="text-xl leading-none">{opt.emoji}</span>
                      <span className="leading-tight">{opt.label}</span>
                      <span className={cn(
                        "text-[9px] font-normal leading-tight",
                        difficulty === opt.value ? "opacity-80" : "opacity-60"
                      )}>{opt.sublabel}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Info hint */}
              <div className="flex items-start gap-2 bg-stone-50 rounded-xl p-2.5 text-[10.5px] text-stone-500 max-w-sm mx-auto w-full shadow-sm">
                <Info size={13} className="flex-shrink-0 text-stone-400 mt-0.5" />
                <span className="leading-tight">
                  Trasa se uloží jako váš <strong>draft</strong>. Sdílet s rodinou ji můžete jedním kliknutím přímo z její karty.
                </span>
              </div>

              {/* Tlačítka */}
              <div className="flex w-full gap-3 mt-4">
                <motion.button
                  onClick={() => handleGenerate(false)}
                  disabled={isLoading}
                  whileTap={{ scale: 0.97 }}
                  className={cn(
                    "flex-1 min-w-0 py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-center font-semibold transition-all shadow-sm whitespace-nowrap",
                    isLoading
                      ? "bg-stone-200 text-stone-400 cursor-not-allowed"
                      : difficulty === "easy"
                        ? "bg-green-600 hover:bg-green-700 text-white hover:shadow-md"
                        : difficulty === "medium"
                        ? "bg-orange-500 hover:bg-orange-600 text-white hover:shadow-md"
                        : "bg-red-600 hover:bg-red-700 text-white hover:shadow-md"
                  )}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin flex-shrink-0" />
                      <span className="truncate">
                        {loadingMsg.startsWith("Hledám reálné místo: ")
                          ? loadingMsg.replace("Hledám reálné místo: ", "Hledám: ")
                          : loadingMsg || "Generuji..."}
                      </span>
                    </>
                  ) : (
                    <>
                      <Bike size={16} className="flex-shrink-0" />
                      <span>Generovat</span>
                    </>
                  )}
                </motion.button>

                <motion.button
                  onClick={() => handleGenerate(true)}
                  disabled={isLoading}
                  whileTap={{ scale: 0.97 }}
                  className={cn(
                    "flex-1 min-w-0 py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-center font-semibold transition-all shadow-sm whitespace-nowrap",
                    isLoading
                      ? "bg-stone-100 border-2 border-stone-200 text-stone-400 cursor-not-allowed"
                      : difficulty === "easy"
                        ? "border-2 border-green-600 text-green-600 bg-transparent hover:bg-green-50"
                        : difficulty === "medium"
                        ? "border-2 border-orange-500 text-orange-500 bg-transparent hover:bg-orange-50"
                        : "border-2 border-red-600 text-red-600 bg-transparent hover:bg-red-50"
                  )}
                >
                  <Dice5 size={16} className="flex-shrink-0" />
                  <span className="truncate">Překvap mě</span>
                </motion.button>
              </div>

              {/* Výsledkové stavy */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm text-rose-700"
                  >
                    ⚠️ {error}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
