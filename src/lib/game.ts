export const CATEGORIES = [
  { id: "boy", label: "اسم ولد", icon: "♂" },
  { id: "girl", label: "اسم بنت", icon: "♀" },
  { id: "object", label: "جماد", icon: "◈" },
  { id: "animal", label: "حيوان", icon: "♧" },
  { id: "plant", label: "نبات", icon: "❋" },
  { id: "country", label: "دولة", icon: "⌖" }
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];
export type Settings = {
  round_count: number;
  categories: CategoryId[];
  difficult_enabled: boolean;
};
export type Room = { id: string; code: string; host_id: string; status: "lobby" | "playing" | "finished"; closed_at?: string | null; settings: Settings; current_round: number };
export type Player = { id: string; user_id: string; display_name: string; avatar: string; is_ready: boolean; is_connected: boolean; total_score: number; round_score: number; joined_at: string };
export type Round = { id: string; room_id: string; number: number; letter: string; status: "choosing" | "active" | "review" | "completed"; picker_user_id: string | null; started_at: string; ends_at: string; duration_seconds: number };
export type Answer = { id: string; round_id: string; player_id: string; values: Partial<Record<CategoryId, string>>; scores: Partial<Record<CategoryId, number>>; overrides?: Partial<Record<CategoryId, boolean>>; total_points: number; locked_at: string | null };

/** Normalizes Arabic writing differences for matching and first-letter checks. */
export function normalizeArabic(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ى]/g, "ي")
    .toLowerCase()
    .replace(/[^0-9A-Za-z\u0621-\u064A\u0660-\u0669\u06F0-\u06F9]/g, "")
    .trim();
}

export function answerStartsWithLetter(answer: string, letter: string): boolean {
  const a = normalizeArabic(answer);
  const l = normalizeArabic(letter);
  return a.length > 0 && l.length > 0 && a.startsWith(l);
}

export function scoreAnswers(
  answers: Array<{ playerId: string; values: Partial<Record<CategoryId, string>> }>,
  letter: string,
  categories: readonly CategoryId[] = CATEGORIES.map((category) => category.id)
): Record<string, Partial<Record<CategoryId, number>>> {
  const result: Record<string, Partial<Record<CategoryId, number>>> = {};
  for (const answer of answers) result[answer.playerId] = {};
  for (const category of categories) {
    const groups = new Map<string, string[]>();
    for (const answer of answers) {
      const value = answer.values[category] ?? "";
      if (!answerStartsWithLetter(value, letter)) continue;
      const normalized = normalizeArabic(value);
      groups.set(normalized, [...(groups.get(normalized) ?? []), answer.playerId]);
    }
    for (const answer of answers) {
      const value = answer.values[category] ?? "";
      const matchingPlayers = groups.get(normalizeArabic(value)) ?? [];
      result[answer.playerId][category] = answerStartsWithLetter(value, letter)
        ? matchingPlayers.length === 1 ? 10 : 5
        : 0;
    }
  }
  return result;
}

export const AVATARS = ["🦊", "🐼", "🐧", "🐯", "🐸", "🦁", "🐙", "🦄", "🐨", "🐳", "🐱", "🐶", "🐰", "🐻", "🐵", "🐔", "🦉", "🦋", "🐢", "🐬", "🦈", "🐺", "🦌", "🐮", "🐷", "🐤", "🦜", "🐝", "🦔", "🦩", "🦥", "🦦", "🦭", "🦚"];
export const ARABIC_LETTERS = ["ا", "ب", "ت", "ث", "ج", "ح", "خ", "د", "ذ", "ر", "ز", "س", "ش", "ص", "ض", "ط", "ظ", "ع", "غ", "ف", "ق", "ك", "ل", "م", "ن", "ه", "و", "ي"];

export const DEFAULT_SETTINGS: Settings = {
  round_count: 5,
  categories: CATEGORIES.map((category) => category.id),
  difficult_enabled: true
};
