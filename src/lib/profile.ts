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
