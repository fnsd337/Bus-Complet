import { AVATARS } from "./game";

export type PlayerProfile = {
  id: string;
  name: string;
  avatar: string;
  wins: number;
  winStreak: number;
  bestStreak: number;
  matchesPlayed: number;
  totalScore: number;
  createdAt: string;
};

const PROFILE_STATS_KEY = "bus-profile-stats";
const NAME_KEY = "bus-name";
const AVATAR_KEY = "bus-avatar";
const ID_KEY = "bus-player-id";

export function generatePlayerId(): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "BUS-";
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function getPlayerProfile(): PlayerProfile {
  if (typeof window === "undefined") {
    return {
      id: "BUS-PLAYER",
      name: "اللاعب",
      avatar: AVATARS[0],
      wins: 0,
      winStreak: 0,
      bestStreak: 0,
      matchesPlayed: 0,
      totalScore: 0,
      createdAt: new Date().toISOString()
    };
  }

  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = generatePlayerId();
    localStorage.setItem(ID_KEY, id);
  }

  const name = localStorage.getItem(NAME_KEY)?.trim() || "اللاعب";
  const avatar = localStorage.getItem(AVATAR_KEY) || AVATARS[0];

  let stats = {
    wins: 0,
    winStreak: 0,
    bestStreak: 0,
    matchesPlayed: 0,
    totalScore: 0,
    createdAt: new Date().toISOString()
  };

  try {
    const raw = localStorage.getItem(PROFILE_STATS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      stats = { ...stats, ...parsed };
    }
  } catch {
    // fallback to defaults
  }

  return {
    id,
    name,
    avatar,
    ...stats
  };
}

export function savePlayerProfile(update: Partial<PlayerProfile>): PlayerProfile {
  if (typeof window === "undefined") {
    return getPlayerProfile();
  }

  const current = getPlayerProfile();
  const next: PlayerProfile = {
    ...current,
    ...update
  };

  if (update.name !== undefined) {
    localStorage.setItem(NAME_KEY, next.name);
  }
  if (update.avatar !== undefined) {
    localStorage.setItem(AVATAR_KEY, next.avatar);
  }
  if (update.id !== undefined) {
    localStorage.setItem(ID_KEY, next.id);
  }

  const statsToSave = {
    wins: next.wins,
    winStreak: next.winStreak,
    bestStreak: next.bestStreak,
    matchesPlayed: next.matchesPlayed,
    totalScore: next.totalScore,
    createdAt: next.createdAt
  };
  localStorage.setItem(PROFILE_STATS_KEY, JSON.stringify(statsToSave));

  window.dispatchEvent(new CustomEvent("bus-profile-updated", { detail: next }));
  return next;
}

export function recordMatchOutcome({
  won,
  tied = false,
  score = 0
}: {
  won: boolean;
  tied?: boolean;
  score?: number;
}): { profile: PlayerProfile; isNewRecord: boolean } {
  const current = getPlayerProfile();
  const nextMatches = current.matchesPlayed + 1;
  const nextScore = current.totalScore + score;
  let nextWins = current.wins;
  let nextStreak = current.winStreak;
  let nextBestStreak = current.bestStreak;
  let isNewRecord = false;

  if (won) {
    nextWins += 1;
    nextStreak += 1;
    if (nextStreak > nextBestStreak) {
      nextBestStreak = nextStreak;
      isNewRecord = true;
    }
  } else if (!tied) {
    nextStreak = 0;
  }

  const updated = savePlayerProfile({
    wins: nextWins,
    winStreak: nextStreak,
    bestStreak: nextBestStreak,
    matchesPlayed: nextMatches,
    totalScore: nextScore
  });

  return { profile: updated, isNewRecord };
}

export type PlayerRank = {
  title: string;
  badge: string;
  color: string;
};

export function getPlayerRank(wins: number, streak: number): PlayerRank {
  if (streak >= 7 || wins >= 30) {
    return { title: "أسطورة الأتوبيس", badge: "👑", color: "#f59e0b" };
  }
  if (streak >= 4 || wins >= 15) {
    return { title: "زعيم الحروف", badge: "⚡", color: "#ec4899" };
  }
  if (wins >= 8) {
    return { title: "قناص الكلمات", badge: "🎯", color: "#8b5cf6" };
  }
  if (wins >= 3) {
    return { title: "راكب محترف", badge: "🚌", color: "#10b981" };
  }
  if (wins >= 1) {
    return { title: "مسافر نشيط", badge: "🌟", color: "#3b82f6" };
  }
  return { title: "راكب جديد", badge: "🎫", color: "#6b7280" };
}


// ==================== Secret Funny Badges (الألقاب والإنجازات السرية) ====================
export type SecretBadge = {
  id: string;
  title: string;
  icon: string;
  description: string;
  hint: string;
  howToUnlock: string;
  color: string;
};

export const SECRET_BADGES: SecretBadge[] = [
  {
    id: "microbus_driver",
    title: "سواق ميكروباص محترف",
    icon: "🚐",
    description: "أعلنت أتوبيس كومبليت في أقل من 30 ثانية وطرت قبل الكل!",
    hint: "أنهِ الجولة بسرعة البرق في أقل من 30 ثانية.",
    howToUnlock: "ادخل جولة فردية أو جماعية، واكتب كل الإجابات ودوس 'أتوبيس كومبليت' قبل ما يعدي 30 ثانية من بداية الجولة.",
    color: "#f59e0b"
  },
  {
    id: "ester_ya_dawly",
    title: "استر يا دولي!",
    icon: "🛡️",
    description: "كسبت مباراة بفارق ضئيل جداً في آخر لحظة.. وربنا ستر!",
    hint: "حقق فوزاً حماسياً على الحافة بفارق ضئيل.",
    howToUnlock: "اكسب جولة ضد منافس الذكاء الاصطناعي أو لاعبين أونلاين بفارق نقاط بسيط جداً (أقل من 15 نقطة).",
    color: "#10b981"
  },
  {
    id: "dictionary_author",
    title: "مؤلف قواميس عربي",
    icon: "✍️",
    description: "كتبت إجابات عجيبة الـ AI احتار فيها ورفضها في جولة كاملة!",
    hint: "جرّب كلمات خيالية غير مناسبة للفئات.",
    howToUnlock: "اكتب كلمات غريبة أو خيالية لا تطابق الفئات بحيث يقوم الـ AI برفض كل كلماتك في الجولة (0 إجابات مقبولة).",
    color: "#8b5cf6"
  },
  {
    id: "full_mark_sniper",
    title: "قناص الدرجة النهائية",
    icon: "🎯",
    description: "جبت 10/10 في كل الفئات بنقاط كاملة بدون أي تكرار أو خطأ!",
    hint: "اجمع نقاطاً فريدة وصحيحة في كل الخانات.",
    howToUnlock: "جاوب على كل الفئات بإجابات صحيحة ومقبولة تماماً بحيث تاخد الدرجة الكاملة (10 نقاط أو أكتر لكل فئة) بدون ولا خطأ.",
    color: "#ec4899"
  },
  {
    id: "streak_beast",
    title: "قطر الصعيد السريع",
    icon: "🔥",
    description: "حققت Streak فوز متتالي 3 مرات أو أكثر بدون أي خسارة!",
    hint: "حافظ على سلسلة فوز متتالية من 3 مباريات.",
    howToUnlock: "اكسب 3 مباريات متتالية ورا بعض بدون أي هزيمة ضد الذكاء الاصطناعي أو في الغرف الجماعية.",
    color: "#ea580c"
  },
  {
    id: "secret_agent",
    title: "عميل سري متنكر",
    icon: "🕶️",
    description: "غيّرت اسمك وصورتك في البروفايل أكتر من مرة وبتتنكر في كل ماتش!",
    hint: "عدّل شخصيتك واسمك في صفحة البروفايل.",
    howToUnlock: "افتح صفحة البروفايل، وغيّر اسمك أو صورتك الرمزية مرتين أو أكتر عشان تتنكر في كل ماتش!",
    color: "#64748b"
  },
  {
    id: "night_shift",
    title: "سواق السهرة والليل",
    icon: "🌙",
    description: "بتلعب أتوبيس كومبليت بعد نص الليل مع السهارى!",
    hint: "العب جولة في وقت متأخر بعد منتصف الليل.",
    howToUnlock: "العب أي جولة (سواء تدريب أو مع أصحابك) في وقت متأخر بالليل بين الساعة 12:00 منتصف الليل و 5:00 فجراً.",
    color: "#6366f1"
  },
  {
    id: "peaceful_rider",
    title: "راكب رايق ومروّق",
    icon: "☕",
    description: "جمعت أكتر من 200 نقطة ولعبت بروقان وهدوء أعصاب!",
    hint: "اجمع 200 نقطة إجمالية في حسابك.",
    howToUnlock: "اجمع ما مجموعه 200 نقطة أو أكثر في حسابك من خلال لعب الجولات والمباريات السابقة.",
    color: "#06b6d4"
  }
];

// ==================== Bus Garage & Vehicles System (جراج الأتوبيسات) ====================
export type GarageVehicle = {
  id: string;
  name: string;
  category: string;
  price: number;
  icon: string;
  description: string;
  hornType: "air" | "classic" | "toktok" | "train" | "cyber";
  primaryColor: string;
  accentColor: string;
  roofSign: string;
  speedRating: number;
  funRating: number;
};

export const GARAGE_VEHICLES: GarageVehicle[] = [
  {
    id: "classic_bus",
    name: "أتوبيس النصر الكلاسيكي",
    category: "أتوبيس هيئة نقل عام",
    price: 0,
    icon: "🚌",
    description: "أتوبيس النصر الأخضر الأصيل. فخر المواصلات الشعبية وخفيف في الزحمة والمطبات.",
    hornType: "air",
    primaryColor: "#10b981",
    accentColor: "#fbbf24",
    roofSign: "★ أتوبيس كومبليت السريع ★",
    speedRating: 75,
    funRating: 90
  },
  {
    id: "cairo_microbus",
    name: "ميكروباص الدائري الطاير",
    category: "ميكروباص 14 راكب",
    price: 100,
    icon: "🚐",
    description: "أسرع من الصاروخ على الدائري، مزود بستيكرات 'عين حسود' وعفشة هيدروليك مروقة.",
    hornType: "air",
    primaryColor: "#f8fafc",
    accentColor: "#0284c7",
    roofSign: "⚡ مشوار السريع - دائرى ⚡",
    speedRating: 95,
    funRating: 96
  },
  {
    id: "fire_toktok",
    name: "التوك توك الشبح الناري",
    category: "توك توك معدل 200cc",
    price: 250,
    icon: "🛺",
    description: "شكمان صواريخ ناري، وسماعات بازوكا دي جي، ويلف في أضيق حارة في ثانية.",
    hornType: "toktok",
    primaryColor: "#ef4444",
    accentColor: "#f59e0b",
    roofSign: "🔥 الوحش الكاسر 🔥",
    speedRating: 88,
    funRating: 100
  },
  {
    id: "london_red",
    name: "الأتوبيس الأحمر الإنجليزي",
    category: "أتوبيس طابقين VIP",
    price: 450,
    icon: "🚍",
    description: "أتوبيس فخم طابقين مكيّف ومريح للملوك وأصحاب الروقان، مفيش حد بيقف فيه.",
    hornType: "classic",
    primaryColor: "#dc2626",
    accentColor: "#ffffff",
    roofSign: "★ ROYAL EXPRESS VIP ★",
    speedRating: 80,
    funRating: 92
  },
  {
    id: "cyber_gold",
    name: "أتوبيس المستقبل الذهبي 2077",
    category: "مركبة فضاء هايبر",
    price: 800,
    icon: "✨",
    description: "مطلي بذهب عيار 24 حقيقي، نيون متوهج، ومحركات طيران نفاثة تتحدى الجاذبية!",
    hornType: "cyber",
    primaryColor: "#eab308",
    accentColor: "#8b5cf6",
    roofSign: "⭐ CYBERPUNK 2077 ⭐",
    speedRating: 100,
    funRating: 100
  }
];

export const CUSTOM_PAINT_PALETTE = [
  { id: "emerald", name: "أخضر زمرّدي", hex: "#10b981" },
  { id: "ocean", name: "أزرق نيلي", hex: "#0284c7" },
  { id: "fire", name: "برتقالي ناري", hex: "#f97316" },
  { id: "crimson", name: "أحمر كرزي", hex: "#dc2626" },
  { id: "purple", name: "بنفسجي ملكي", hex: "#7c3aed" },
  { id: "gold", name: "ذهبي فخم", hex: "#eab308" },
  { id: "carbon", name: "أسود كربوني", hex: "#1e293b" },
  { id: "white", name: "أبيض لؤلؤي", hex: "#f1f5f9" }
];

const OWNED_VEHICLES_KEY = "bus-owned-vehicles";
const EQUIPPED_VEHICLE_KEY = "bus-equipped-vehicle";
const VEHICLE_CUSTOM_COLOR_KEY = "bus-vehicle-colors";

export function getOwnedVehicles(): string[] {
  if (typeof window === "undefined") return ["classic_bus"];
  try {
    const raw = localStorage.getItem(OWNED_VEHICLES_KEY);
    const parsed: string[] = raw ? JSON.parse(raw) : ["classic_bus"];
    if (!parsed.includes("classic_bus")) parsed.push("classic_bus");
    return parsed;
  } catch {
    return ["classic_bus"];
  }
}

export function getEquippedVehicleId(): string {
  if (typeof window === "undefined") return "classic_bus";
  return localStorage.getItem(EQUIPPED_VEHICLE_KEY) || "classic_bus";
}

export function getAffordableNewVehiclesCount(totalScore: number): number {
  if (typeof window === "undefined") return 0;
  const owned = getOwnedVehicles();
  return GARAGE_VEHICLES.filter((v) => !owned.includes(v.id) && totalScore >= v.price).length;
}

export function setEquippedVehicleId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(EQUIPPED_VEHICLE_KEY, id);
  window.dispatchEvent(new CustomEvent("bus-vehicle-changed", { detail: id }));
}

export function buyVehicle(vehicleId: string): { success: boolean; error?: string } {
  const profile = getPlayerProfile();
  const vehicle = GARAGE_VEHICLES.find((v) => v.id === vehicleId);
  if (!vehicle) return { success: false, error: "المركبة غير موجودة" };

  const owned = getOwnedVehicles();
  if (owned.includes(vehicleId)) return { success: true };

  if (profile.totalScore < vehicle.price) {
    return {
      success: false,
      error: `نقاطك (${profile.totalScore}) مش كافية! محتاج ${vehicle.price} نقطة لشراء ${vehicle.name}.`
    };
  }

  // Deduct points from totalScore
  const nextScore = profile.totalScore - vehicle.price;
  savePlayerProfile({ totalScore: nextScore });

  owned.push(vehicleId);
  localStorage.setItem(OWNED_VEHICLES_KEY, JSON.stringify(owned));
  setEquippedVehicleId(vehicleId);

  window.dispatchEvent(new CustomEvent("bus-vehicle-bought", { detail: vehicleId }));
  return { success: true };
}

export function getCustomVehicleColors(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(VEHICLE_CUSTOM_COLOR_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setCustomVehicleColor(vehicleId: string, colorHex: string): void {
  if (typeof window === "undefined") return;
  const current = getCustomVehicleColors();
  current[vehicleId] = colorHex;
  localStorage.setItem(VEHICLE_CUSTOM_COLOR_KEY, JSON.stringify(current));
  window.dispatchEvent(new CustomEvent("bus-vehicle-changed", { detail: vehicleId }));
}

const UNLOCKED_BADGES_KEY = "bus-unlocked-badges";
const PROFILE_EDIT_COUNT_KEY = "bus-profile-edit-count";

export function getUnlockedBadges(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(UNLOCKED_BADGES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getAllBadgesWithStatus(): Array<SecretBadge & { isUnlocked: boolean; unlockedAt: string | null }> {
  const unlockedMap = getUnlockedBadges();
  return SECRET_BADGES.map((b) => ({
    ...b,
    isUnlocked: Boolean(unlockedMap[b.id]),
    unlockedAt: unlockedMap[b.id] || null
  }));
}

export function unlockBadge(badgeId: string): SecretBadge | null {
  if (typeof window === "undefined") return null;
  const badge = SECRET_BADGES.find((b) => b.id === badgeId);
  if (!badge) return null;

  const unlocked = getUnlockedBadges();
  if (unlocked[badgeId]) return null; // already unlocked

  unlocked[badgeId] = new Date().toISOString();
  localStorage.setItem(UNLOCKED_BADGES_KEY, JSON.stringify(unlocked));

  window.dispatchEvent(new CustomEvent("bus-badge-unlocked", { detail: badge }));
  return badge;
}

export function trackProfileEdit(): SecretBadge | null {
  if (typeof window === "undefined") return null;
  const count = parseInt(localStorage.getItem(PROFILE_EDIT_COUNT_KEY) || "0", 10) + 1;
  localStorage.setItem(PROFILE_EDIT_COUNT_KEY, String(count));
  if (count >= 2) {
    return unlockBadge("secret_agent");
  }
  return null;
}

export function checkAndUnlockBadges(context: {
  durationMs?: number;
  streak?: number;
  fullMarks?: boolean;
  allRejected?: boolean;
  closeWin?: boolean;
  totalScore?: number;
}): SecretBadge[] {
  const unlockedBadges: SecretBadge[] = [];

  // 1. microbus_driver (< 30s)
  if (context.durationMs && context.durationMs < 30_000) {
    const b = unlockBadge("microbus_driver");
    if (b) unlockedBadges.push(b);
  }

  // 2. ester_ya_dawly (close win)
  if (context.closeWin) {
    const b = unlockBadge("ester_ya_dawly");
    if (b) unlockedBadges.push(b);
  }

  // 3. dictionary_author (all words rejected by AI)
  if (context.allRejected) {
    const b = unlockBadge("dictionary_author");
    if (b) unlockedBadges.push(b);
  }

  // 4. full_mark_sniper (all full marks)
  if (context.fullMarks) {
    const b = unlockBadge("full_mark_sniper");
    if (b) unlockedBadges.push(b);
  }

  // 5. streak_beast (streak >= 3)
  if (context.streak && context.streak >= 3) {
    const b = unlockBadge("streak_beast");
    if (b) unlockedBadges.push(b);
  }

  // 6. night_shift (played between midnight and 5 AM)
  const hour = new Date().getHours();
  if (hour >= 0 && hour < 5) {
    const b = unlockBadge("night_shift");
    if (b) unlockedBadges.push(b);
  }

  // 7. peaceful_rider (total score >= 200)
  const profile = getPlayerProfile();
  if (profile.totalScore >= 200) {
    const b = unlockBadge("peaceful_rider");
    if (b) unlockedBadges.push(b);
  }

  return unlockedBadges;
}
