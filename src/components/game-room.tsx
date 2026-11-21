"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, BusFront, Check, CheckCheck, Copy, LogOut, Moon, Plus, RotateCcw, Share2, Sparkles, Sun, Trophy, Volume2, VolumeX, WifiOff, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ARABIC_LETTERS, answerStartsWithLetter, CATEGORIES, getCategory, type Answer, type AnswerVote, type CategoryId, type Player,
  type Room, type Round, type Settings
} from "@/lib/game";
import PlayerAvatar from "@/components/player-avatar";
import BusAnimation from "@/components/bus-animation";
import { ensureUser, getSupabase } from "@/lib/supabase";
import { requestGameAi } from "@/lib/game-ai-client";
import { recordMatchOutcome } from "@/lib/profile";
import type { SfxCue } from "@/lib/sfx";

type RoomState = { room: Room; players: Player[]; rounds: Round[]; answers: Answer[]; votes: AnswerVote[] };
type GameRoomProps = { roomId: string; roomCode: string; sound: boolean; motionEnabled: boolean; onSound: (cue?: SfxCue) => void; onToggleSound: () => void; onExit: () => void };
type Reaction = { id: number; emoji: string; name: string };
type AiJudgment = { verdict: "valid" | "invalid" | "uncertain"; confidence: number; reason: string };
const EMOJIS = ["😂", "🔥", "👏", "😎", "❤️"];

function getError(cause: unknown) {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === "object" && "message" in cause) return String((cause as { message: unknown }).message);
  return "حصل خطأ أثناء الاتصال. جرّب مرة أخرى.";
}

export default function GameRoom({ roomId, roomCode, sound, motionEnabled, onSound, onToggleSound, onExit }: GameRoomProps) {
  const supabase = getSupabase();
  const [userId, setUserId] = useState("");
  const [state, setState] = useState<RoomState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [dark, setDark] = useState(false);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [reviewPlayerIndex, setReviewPlayerIndex] = useState(0);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [aiJudgments, setAiJudgments] = useState<Record<string, AiJudgment>>({});
  const [aiBusyKey, setAiBusyKey] = useState("");
  const [showBusAnim, setShowBusAnim] = useState(false);
  const [busCompleterName, setBusCompleterName] = useState("");
  const [values, setValues] = useState<Partial<Record<CategoryId, string>>>({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const winSoundPlayedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!supabase) throw new Error("إعداد Supabase غير مكتمل.");
    const [roomResult, playersResult, roundsResult] = await Promise.all([
      supabase.from("rooms").select("*").eq("id", roomId).single(),
      supabase.from("players").select("*").eq("room_id", roomId).order("joined_at", { ascending: true }),
      supabase.from("rounds").select("*").eq("room_id", roomId).order("number", { ascending: true })
    ]);
    if (roomResult.error) throw roomResult.error;
    if (playersResult.error) throw playersResult.error;
    if (roundsResult.error) throw roundsResult.error;
    const rounds = (roundsResult.data ?? []) as Round[];
    const answerResult = rounds.length
      ? await supabase.from("answers").select("*").in("round_id", rounds.map((round) => round.id))
      : { data: [] as Answer[], error: null };
    if (answerResult.error) throw answerResult.error;
    const voteResult = rounds.length
      ? await supabase.from("answer_votes").select("*").in("round_id", rounds.map((round) => round.id))
      : { data: [] as AnswerVote[], error: null };
    if (voteResult.error) throw voteResult.error;
    const mappedAnswers = ((answerResult.data ?? []) as Array<Record<string, unknown>>).map((answer) => ({ ...answer, values: answer.answer_values ?? {} })) as unknown as Answer[];
    setState({ room: roomResult.data as Room, players: (playersResult.data ?? []) as Player[], rounds, answers: mappedAnswers, votes: (voteResult.data ?? []) as AnswerVote[] });
  }, [roomId, supabase]);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!supabase) { setLoading(false); setError("Supabase غير مُعد بعد."); return; }
    let active = true;
    void (async () => {
      try {
        const user = await ensureUser();
        if (!active) return;
        setUserId(user.id);
        await refresh();
      } catch (cause) { if (active) setError(getError(cause)); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [refresh, supabase]);

  const currentRound = useMemo(() => state?.rounds.find((round) => round.number === state.room.current_round) ?? null, [state]);
  const shownRound = useMemo(() => state?.rounds.find((round) => round.number === (selectedRound ?? state.room.current_round)) ?? currentRound, [currentRound, selectedRound, state]);
  const me = state?.players.find((player) => player.user_id === userId) ?? null;
  const isHost = Boolean(state && state.room.host_id === userId);
  const shownAnswers = state?.answers.filter((answer) => answer.round_id === shownRound?.id) ?? [];
  const finishedPlayersCount = currentRound && state
    ? state.players.filter((player) => state.answers.some((answer) => answer.round_id === currentRound.id && answer.player_id === player.id && Boolean(answer.locked_at))).length
    : 0;
  const reviewPlayer = state?.players[reviewPlayerIndex] ?? null;
  const reviewAnswer = shownAnswers.find((answer) => answer.player_id === reviewPlayer?.id);
  const myAnswer = shownAnswers.find((answer) => answer.player_id === me?.id);
  const locked = Boolean(myAnswer?.locked_at) || shownRound?.status !== "active" || shownRound?.number !== state?.room.current_round;
  const everyoneReady = Boolean(state?.players.length && state.players.every((player) => player.is_ready));
  const allCategoriesFilled = Boolean(state && state.room.settings.categories.length && state.room.settings.categories.every((category) => Boolean(values[category]?.trim())));
  const allAnswersStartWithLetter = Boolean(currentRound && state && state.room.settings.categories.every((category) => answerStartsWithLetter(values[category] ?? "", currentRound.letter)));
  const rankedPlayers = [...(state?.players ?? [])].sort((a, b) => b.total_score - a.total_score || a.joined_at.localeCompare(b.joined_at));
  const categoryOptions = [...CATEGORIES, ...(settings?.custom_categories ?? [])];
  const roomWinsLeader = [...(state?.players ?? [])].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0))[0];
  const streakLeader = [...(state?.players ?? [])].sort((a, b) => (b.best_win_streak ?? 0) - (a.best_win_streak ?? 0))[0];
  const fastestLeader = [...(state?.players ?? [])].filter((player) => player.fastest_bus_ms != null).sort((a, b) => (a.fastest_bus_ms ?? Infinity) - (b.fastest_bus_ms ?? Infinity))[0];
  const currentMatchUniqueAnswers = (playerId: string) => (state?.answers ?? [])
    .filter((answer) => answer.player_id === playerId)
    .reduce((total, answer) => total + Object.values(answer.scores ?? {}).filter((score) => score === 10).length, 0);
  const uniqueAnswerLeader = [...(state?.players ?? [])].sort((a, b) => currentMatchUniqueAnswers(b.id) - currentMatchUniqueAnswers(a.id))[0];
  const matchChampions = rankedPlayers.filter((player) => player.total_score === rankedPlayers[0]?.total_score);
  const formatRecordTime = (milliseconds: number | null | undefined) => {
    if (milliseconds == null) return "لسه مفيش رقم";
    const seconds = milliseconds / 1000;
    return seconds < 60 ? `${seconds.toFixed(1)} ثانية` : `${Math.floor(seconds / 60)} د ${Math.round(seconds % 60)} ث`;
  };

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => current === message ? "" : current), 2600);
  }, []);

  useEffect(() => { setDark(document.documentElement.dataset.theme === "dark"); }, []);
  useEffect(() => { if (state?.room.settings) setSettings((current) => current ?? state.room.settings); }, [state?.room.settings]);
  useEffect(() => { setSelectedRound(null); }, [currentRound?.number]);
  useEffect(() => { setReviewPlayerIndex(0); }, [shownRound?.id]);
  useEffect(() => {
    if (state?.room.status === "finished" && !winSoundPlayedRef.current) {
      winSoundPlayedRef.current = true;
      const amIWinner = rankedPlayers[0]?.user_id === userId;
      const isTie = matchChampions.some((p) => p.user_id === userId) && matchChampions.length > 1;
      const outcome = recordMatchOutcome({
        won: amIWinner && !isTie,
        tied: isTie,
        score: me?.total_score ?? 0
      });

      if (amIWinner && outcome.profile.winStreak >= 2) {
        onSound("streak");
      } else if (amIWinner) {
        onSound("win");
      } else if (isTie) {
        onSound("tie");
      } else {
        onSound("bus");
      }
    } else if (state?.room.status !== "finished") {
      winSoundPlayedRef.current = false;
    }
  }, [matchChampions, me?.total_score, onSound, rankedPlayers, state?.room.status, userId]);
  useEffect(() => {
    if (!state?.room.id) return;
    const heartbeat = () => { void supabase?.rpc("heartbeat_room", { p_room_id: roomId }); };
    heartbeat();
    const timer = window.setInterval(heartbeat, 10000);
    const onPageHide = () => { void supabase?.rpc("leave_room", { p_room_id: roomId }); };
    window.addEventListener("pagehide", onPageHide);
    return () => { window.clearInterval(timer); window.removeEventListener("pagehide", onPageHide); };
  }, [roomId, state?.room.id, supabase]);

  useEffect(() => {
    if (!supabase || !state?.room.id) return;
    const channel = supabase.channel(`room-${roomId}`, { config: { broadcast: { self: false } } });
    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, () => void refreshRef.current())
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` }, () => void refreshRef.current())
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds", filter: `room_id=eq.${roomId}` }, () => void refreshRef.current())
      .on("postgres_changes", { event: "*", schema: "public", table: "answers", filter: shownRound?.id ? `round_id=eq.${shownRound.id}` : `round_id=eq.00000000-0000-0000-0000-000000000000`, }, () => void refreshRef.current())
      .on("postgres_changes", { event: "*", schema: "public", table: "answer_votes", filter: shownRound?.id ? `round_id=eq.${shownRound.id}` : `round_id=eq.00000000-0000-0000-0000-000000000000`, }, () => void refreshRef.current())
      .on("broadcast", { event: "reaction" }, ({ payload }) => {
        const item = payload as { emoji: string; name: string };
        const id = Date.now() + Math.random();
        setReactions((current) => [...current, { id, emoji: item.emoji, name: item.name }]);
        window.setTimeout(() => setReactions((current) => current.filter((reaction) => reaction.id !== id)), 2400);
      })
      .on("broadcast", { event: "bus_complete" }, ({ payload }) => {
        const item = payload as { name: string };
        setShowBusAnim(true);
        setBusCompleterName(item.name || "لاعب");
        onSound("bus");
      })
      .subscribe();
    channelRef.current = channel;
    return () => { channelRef.current = null; void supabase.removeChannel(channel); };
  }, [roomId, shownRound?.id, state?.room.id, supabase]);

  useEffect(() => {
    if (currentRound?.id !== shownRound?.id) return;
    setValues((myAnswer?.values ?? {}) as Partial<Record<CategoryId, string>>);
    setSaved(false);
  // Load a draft once per round; realtime refreshes must not replace active typing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRound?.id, me?.id]);

  useEffect(() => {
    if (!supabase || !currentRound || currentRound.status !== "active" || locked || !me) return;
    setSaved(false);
    const timer = window.setTimeout(async () => {
      setSaving(true);
      const { error: saveError } = await supabase.rpc("save_answers", { p_room_id: roomId, p_values: values });
      setSaving(false);
      if (!saveError) { setSaved(true); void refreshRef.current(); }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [currentRound?.id, currentRound?.status, locked, me?.id, roomId, supabase, values]);

  const rpc = async (name: string, args: Record<string, unknown>, success?: string, cue: SfxCue = "tap") => {
    if (!supabase) return;
    const { error: rpcError } = await supabase.rpc(name, args);
    if (rpcError) throw rpcError;
    if (success) notify(success);
    onSound(cue);
    await refresh();
  };

  const startGame = async () => {
    if (!supabase || !settings) return;
    try {
      const { error: settingsError } = await supabase.rpc("update_room_settings", { p_room_id: roomId, p_settings: settings });
      if (settingsError) throw settingsError;
      const { error: startError } = await supabase.rpc("start_match", { p_room_id: roomId });
      if (startError) throw startError;
      onSound("join"); await refresh();
    } catch (cause) { notify(getError(cause)); }
  };

  const copyInvite = async () => {
    const url = `${window.location.origin}/?room=${roomCode}`;
    try { await navigator.clipboard.writeText(url); notify("تم نسخ رابط الدعوة."); onSound("tap"); }
    catch { notify(url); }
  };

  const shareInvite = async () => {
    const url = `${window.location.origin}/?room=${roomCode}`;
    if (navigator.share) {
      try { await navigator.share({ title: "أتوبيس كومبليت", text: "تعالى العب أتوبيس كومبليت معايا!", url }); onSound("tap"); }
      catch (cause) { if (cause instanceof Error && cause.name !== "AbortError") notify("تعذرت مشاركة الرابط. استخدم زر نسخ الدعوة."); }
      return;
    }
    await copyInvite();
  };

  const updateSetting = (change: Partial<Settings>) => setSettings((current) => current ? { ...current, ...change } : current);
  const toggleCategory = (category: CategoryId) => setSettings((current) => {
    if (!current) return current;
    const categories = current.categories.includes(category) ? current.categories.filter((item) => item !== category) : [...current.categories, category];
    if (categories.length > 10) { notify("اختر ١٠ فئات بحد أقصى."); return current; }
    return categories.length ? { ...current, categories } : current;
  });

  const addCustomCategory = () => {
    const label = newCategory.trim();
    if (!settings) return;
    if (label.length < 2 || label.length > 20) { notify("اسم الفئة يكون من حرفين إلى ٢٠ حرفًا."); return; }
    if (settings.custom_categories?.some((category) => category.label.toLocaleLowerCase() === label.toLocaleLowerCase()) || CATEGORIES.some((category) => category.label === label)) {
      notify("الفئة دي موجودة بالفعل."); return;
    }
    if (settings.categories.length >= 10) { notify("وصلت للحد الأقصى: ١٠ فئات في الجولة."); return; }
    const id = `custom_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const category = { id, label, icon: "✦" };
    setSettings((current) => current ? { ...current, categories: [...current.categories, id], custom_categories: [...(current.custom_categories ?? []), category] } : current);
    setNewCategory("");
  };

  const askAiJudge = async (roundId: string, playerId: string, categoryId: CategoryId, letter: string, categoryLabel: string, answer: string) => {
    const judgeKey = `${roundId}:${playerId}:${categoryId}`;
    if (!supabase) { notify("الحكم الذكي محتاج إعداد Supabase."); return; }
    setAiBusyKey(judgeKey);
    try {
      const result = await requestGameAi<AiJudgment>({
        mode: "judge", letter, category: categoryLabel, answer
      });
      setAiJudgments((current) => ({ ...current, [judgeKey]: result }));
      onSound(result.verdict === "invalid" ? "reject" : "approve");
    } catch (cause) { notify(getError(cause)); }
    finally { setAiBusyKey(""); }
  };

  const finishMyRound = async () => {
    if (!supabase || !currentRound) return;
    setSubmitting(true);
    try {
      const saveResult = await supabase.rpc("save_answers", { p_room_id: roomId, p_values: values });
      if (saveResult.error && !myAnswer?.locked_at) throw saveResult.error;
      const { error: finishError } = await supabase.rpc("finish_round", { p_room_id: roomId });
      if (finishError) throw finishError;
      if (channelRef.current && me) {
        void channelRef.current.send({
          type: "broadcast",
          event: "bus_complete",
          payload: { name: me.display_name }
        });
      }
      setShowBusAnim(true);
      setBusCompleterName(me?.display_name || "أنت");
      notify("أتوبيس كومبليت! اتقفلت الجولة على الكل.");
      onSound("bus");
      await refresh();
    } catch (cause) { notify(getError(cause)); }
    finally { setSubmitting(false); }
  };

  const sendReaction = async (emoji: string) => {
    if (!channelRef.current || !me) return;
    await channelRef.current.send({ type: "broadcast", event: "reaction", payload: { emoji, name: me.display_name } });
    onSound("tap");
  };

  if (loading) return <div className="wrap"><div className="loading-panel"><div><div className="spinner" /> بنجهّز الغرفة...</div></div></div>;
  if (error || !state || !me) return <div className="wrap"><section className="room-card error-card"><div className="brand-mark" style={{ margin: "0 auto 16px" }}><WifiOff /></div><h2>مش قادرين نوصل للغرفة</h2><p>{error || "الغرفة غير موجودة، أو إنك مش عضو فيها."}</p><div className="button-row" style={{ justifyContent: "center" }}><button className="btn btn-light" onClick={onExit}><ArrowRight /> العودة للرئيسية</button><button className="btn btn-primary" onClick={() => { setError(""); setLoading(true); void refresh().catch((cause) => setError(getError(cause))).finally(() => setLoading(false)); }}>حاول مرة أخرى</button></div></section></div>;

  const viewingOtherRound = selectedRound !== null && selectedRound !== state.room.current_round;
  const mainState = state.room.closed_at && selectedRound === null ? "closed"
    : state.room.status === "lobby" ? "lobby"
    : state.room.status === "finished" ? selectedRound === null ? "finished" : "results"
      : viewingOtherRound ? "results"
        : currentRound?.status === "choosing" ? "choosing"
          : currentRound?.status === "active" ? "playing" : "results";

  return <section className="room-page">
    <div className="wrap">
      <header className="room-top">
        <div className="room-headline"><span className="brand-mark"><BusFront /></span><div><h1>{mainState === "closed" ? "الغرفة مقفولة" : mainState === "lobby" ? "غرفة الانتظار" : mainState === "choosing" ? `اختيار حرف الجولة ${state.room.current_round}` : mainState === "playing" ? `الجولة ${state.room.current_round} من ${state.room.settings.round_count}` : mainState === "finished" ? "النتيجة النهائية" : "مراجعة الإجابات"}</h1><p>{mainState === "closed" ? "خرج كل اللاعبين من الغرفة، واحتفظنا بنتائج المباراة." : mainState === "lobby" ? "بعد ما الكل يبقى جاهز، المضيف يبدأ اللعبة." : mainState === "choosing" ? "يتناوب اللاعبون على اختيار الحرف، ويبدأ منشئ الغرفة." : mainState === "playing" ? "كمّلوا الخانات؛ أول لاعب يعلن أتوبيس كومبليت يقفل الجولة عند الكل." : "النتائج بتتحدّث عند كل اللاعبين."}</p></div></div>
        <div className="top-actions">
          <button className="icon-btn" onClick={async () => { if (dark) { document.documentElement.dataset.theme = "light"; localStorage.setItem("bus-dark", "false"); } else { document.documentElement.dataset.theme = "dark"; localStorage.setItem("bus-dark", "true"); } setDark(!dark); }} aria-label="تغيير المظهر">{dark ? <Sun /> : <Moon />}</button>
          <button className="icon-btn" onClick={onToggleSound} aria-label={sound ? "إيقاف الصوت" : "تشغيل الصوت"}>{sound ? <Volume2 /> : <VolumeX />}</button>
          <button className="icon-btn" onClick={onExit} aria-label="مغادرة الغرفة"><LogOut /></button>
          <div className="room-code">{roomCode}<button onClick={() => void copyInvite()} title="نسخ رابط الدعوة"><Copy /></button></div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {mainState === "closed" && <motion.section className="room-card error-card" key="closed" initial={false} animate={{ opacity: 1, y: 0 }}><div className="brand-mark" style={{ margin: "0 auto 16px" }}><LogOut /></div><h2>خرج كل اللاعبين من الغرفة</h2><p>الغرفة اتقفلت، وسجل المباراة محفوظ. تقدر تراجعه أو ترجع للرئيسية.</p><div className="button-row" style={{ justifyContent: "center" }}>{state.rounds.length > 0 && <button className="btn btn-light" onClick={() => setSelectedRound(state.room.current_round)}>عرض نتائج المباراة</button>}<button className="btn btn-primary" onClick={onExit}>العودة للرئيسية <ArrowLeft /></button></div></motion.section>}
        {mainState === "lobby" && state && settings && <motion.div key="lobby" initial={false} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -7 }} transition={{ duration: motionEnabled ? .2 : 0 }}>
          <div className="lobby-grid">
            <section className="room-card">
              <div className="subhead"><h2>اللاعبون في الغرفة</h2><small>{state.players.length} / 10 لاعبين</small></div>
              <div className="player-list">{state.players.map((player) => <div className="player-row" key={player.id}>
                <PlayerAvatar className="avatar-large" value={player.avatar} /><div className="player-meta"><strong>{player.display_name}{player.user_id === state.room.host_id ? " · المضيف" : ""}</strong><small>{player.is_connected ? <><i className="online-dot" />متصل الآن</> : <><WifiOff size={11} style={{ verticalAlign: "-2px", marginInlineEnd: 4 }} />غير متصل · يحتفظ بنقاطه</>}</small></div>
                <span className={`status-badge ${player.is_ready ? "status-ready" : "status-wait"}`}>{player.is_ready ? "جاهز" : "بانتظار الاستعداد"}</span>
              </div>)}</div>
              <div className="ready-row"><div className="ready-copy"><strong>{everyoneReady ? "كلكم جاهزين!" : "مستنيين بقية الفريق"}</strong><small>شارك رابط الغرفة عشان تلعبوا مع بعض.</small></div><div className="button-row"><button className="btn btn-light btn-quiet" onClick={() => void shareInvite()}><Share2 /> مشاركة الدعوة</button><button className={`btn ${me.is_ready ? "btn-light" : "btn-primary"} btn-quiet`} onClick={() => void rpc("toggle_ready", { p_room_id: roomId }, undefined, me.is_ready ? "tap" : "ready").catch((cause) => notify(getError(cause)))}><Check /> {me.is_ready ? "إلغاء الاستعداد" : "أنا جاهز"}</button></div></div>
            </section>

            <section className="room-card">
              <div className="subhead"><h2>إعدادات المباراة</h2><small>{isHost ? "للمضيف" : "يعدّلها المضيف"}</small></div>
              <div className="setting-block"><span className="setting-title">عدد الجولات</span><div className="setting-options">{[1,2,3,5,7,10].map((count) => <button key={count} disabled={!isHost} className={`choice-chip ${settings.round_count === count ? "selected" : ""}`} onClick={() => updateSetting({ round_count: count })}>{count === 1 ? "جولة واحدة" : count === 2 ? "جولتان" : `${count} جولات`}</button>)}</div></div>
              <div className="letter-turn-note">في كل جولة، يختار لاعب مختلف الحرف. يبدأ منشئ الغرفة، ثم يأتي دور اللاعب التالي.</div>
              <div className="setting-block"><label className="category-option setting-title"><input type="checkbox" checked={settings.difficult_enabled} disabled={!isHost} onChange={(event) => updateSetting({ difficult_enabled: event.target.checked })} /> السماح بالحروف الصعبة</label></div>
              <div className="setting-block"><span className="setting-title">الفئات · {settings.categories.length} من ١٠</span><div className="setting-options">{categoryOptions.map((category) => <button key={category.id} disabled={!isHost} className={`choice-chip category-option ${settings.categories.includes(category.id) ? "selected" : ""}`} onClick={() => toggleCategory(category.id)}><b>{category.icon}</b>{category.label}</button>)}</div>
                {isHost && <div className="custom-category-entry"><input className="text-field" maxLength={20} value={newCategory} onChange={(event) => setNewCategory(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomCategory(); } }} placeholder="أضف فئة من اختيارك، مثل: أكلة" aria-label="اسم الفئة الجديدة" /><button className="btn btn-light btn-quiet" disabled={settings.categories.length >= 10 || newCategory.trim().length < 2} onClick={addCustomCategory}><Plus /> إضافة فئة</button></div>}
              </div>
              {isHost && <button className="btn btn-light btn-quiet" style={{ width: "100%", marginTop: 5 }} onClick={() => void rpc("update_room_settings", { p_room_id: roomId, p_settings: settings }, "تم حفظ إعدادات المباراة.").catch((cause) => notify(getError(cause)))}><CheckCheck /> حفظ الإعدادات</button>}
              {isHost && <button className="btn btn-primary" style={{ width: "100%", marginTop: 10 }} disabled={state.players.length < 2 || !everyoneReady} onClick={() => void startGame()}><BusFront /> ابدأ المباراة <ArrowLeft /></button>}
              {isHost && state.players.length < 2 && <div className="tiny-label" style={{ textAlign: "center", marginTop: 9 }}>تحتاج لاعبًا آخر على الأقل قبل البدء.</div>}
              {!isHost && <div className="tiny-label" style={{ textAlign: "center", marginTop: 9 }}>المضيف يبدأ المباراة بعد استعداد الجميع.</div>}
            </section>
          </div>
        </motion.div>}

        {mainState === "choosing" && state && currentRound && <motion.div key={`choose-${currentRound.id}`} className="room-card letter-turn-card" initial={false} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -7 }} transition={{ duration: motionEnabled ? .2 : 0 }}>
          {(() => {
            const picker = state.players.find((player) => player.user_id === currentRound.picker_user_id);
            const myTurn = currentRound.picker_user_id === userId || (isHost && !picker?.is_connected);
            return <>
              <div className="letter-picker-person">
                <motion.div className="letter-picker-avatar" animate={motionEnabled ? { y: [0, -8, 0], rotate: [-2, 2, -2] } : undefined} transition={{ duration: 2.4, repeat: Infinity }}><PlayerAvatar value={picker?.avatar ?? "🦊"} /></motion.div>
                <div><span className="section-kicker">دور اختيار الحرف</span><h2>{myTurn ? "اختر حرف الجولة!" : `${picker?.display_name ?? "اللاعب"} يختار الحرف`}</h2><p>{myTurn ? "بعد اختيارك، ستبدأ الجولة عند جميع اللاعبين." : "لحظات وتبدأ الجولة الجديدة."}</p></div>
              </div>
              {myTurn ? <div className="letter-choice-grid">{ARABIC_LETTERS.map((letter) => <motion.button key={letter} className="letter-choice" whileHover={motionEnabled ? { y: -3, scale: 1.06 } : undefined} whileTap={{ scale: .92 }} onClick={() => void rpc("pick_round_letter", { p_room_id: roomId, p_letter: letter }, `اخترت حرف ${letter}.`, "letter").catch((cause) => notify(getError(cause)))}>{letter}</motion.button>)}</div>
                : <div className="letter-waiting"><span className="spinner" /> {picker?.display_name ?? "اللاعب التالي"} يختار الحرف الآن</div>}
            </>;
          })()}
        </motion.div>}

        {mainState === "playing" && state && currentRound && <motion.div key={`play-${currentRound.id}`} initial={false} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -7 }} transition={{ duration: motionEnabled ? .2 : 0 }}>
          <div className="game-topline"><span className="round-count-label">جولة {currentRound.number} <span style={{ color: "var(--muted)", fontWeight: 500 }}>من {state.room.settings.round_count}</span></span><div className="letter-hero"><small>الحرف المطلوب</small><motion.strong key={currentRound.letter} initial={motionEnabled ? { scale: .7, rotate: -11 } : false} animate={{ scale: 1, rotate: 0 }} transition={motionEnabled ? { type: "spring", stiffness: 210, damping: 13 } : { duration: 0 }}>{currentRound.letter}</motion.strong></div><span className="round-status"><CheckCheck size={15} /> {finishedPlayersCount} من {state.players.length} أكملوا</span></div>
          <div className="game-body">
            <div className="room-card">
              <div className="answer-grid">{state.room.settings.categories.map((categoryId) => { const category = getCategory(categoryId, state.room.settings.custom_categories); if (!category) return null; const value = values[categoryId] ?? ""; const invalid = Boolean(value.trim() && !answerStartsWithLetter(value, currentRound.letter)); return <div className={`answer-field ${value.trim() ? "filled" : ""} ${invalid ? "invalid" : ""}`} key={categoryId}>
                <label><span className="category-icon">{category.icon}</span>{category.label}</label>{values[categoryId]?.trim() && <span className="answer-check"><Check /></span>}
                <input disabled={locked || submitting} aria-label={category.label} value={values[categoryId] ?? ""} maxLength={80} placeholder={`اكتب ${category.label}...`} onChange={(event) => setValues((current) => ({ ...current, [categoryId]: event.target.value }))} />
              </div>; })}</div>
              <div className="game-actions"><span className="save-state">{locked ? "الجولة اتقفلت" : saving ? "بيحفظ إجاباتك..." : !allCategoriesFilled ? "املأ كل الخانات لإعلان أتوبيس كومبليت" : !allAnswersStartWithLetter ? `كل إجابة لازم تكون كلمة كاملة وتبدأ بحرف ${currentRound.letter}` : saved ? "✓ إجاباتك محفوظة" : "إجاباتك جاهزة! أعلن أتوبيس كومبليت"}</span><button className="btn btn-primary" disabled={locked || submitting || !allCategoriesFilled || !allAnswersStartWithLetter} onClick={() => void finishMyRound()}>{submitting ? "بيقفل الجولة..." : <><BusFront /> أتوبيس كومبليت!</>}</button></div>
            </div>
            <aside className="game-sidebar">
              <div className="players-mini"><h3>اللاعبون · {state.players.length}</h3>{state.players.map((player) => { const completed = state.answers.some((answer) => answer.round_id === currentRound.id && answer.player_id === player.id && Boolean(answer.locked_at)); return <div className="mini-player" key={player.id}><PlayerAvatar className="mini-avatar" value={player.avatar} /><span>{player.display_name}</span><small className={`mini-status ${completed ? "complete" : player.is_connected ? "playing" : "offline"}`}>{completed ? "أكمل" : player.is_connected ? "يلعب" : "غير متصل"}</small></div>; })}</div>
              <div className="reaction-card"><h3>شجّعهم بإيموجي</h3><div className="reaction-list">{EMOJIS.map((emoji) => <button className="reaction-button" key={emoji} onClick={() => void sendReaction(emoji)}>{emoji}</button>)}</div></div>
            </aside>
          </div>
        </motion.div>}

        {mainState === "results" && state && shownRound && reviewPlayer && <motion.div key={`results-${shownRound.id}`} initial={false} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -7 }} transition={{ duration: motionEnabled ? .2 : 0 }}>
          <div className="results-header"><div className="results-letter"><strong>{shownRound.letter}</strong><div><b>{selectedRound && selectedRound !== state.room.current_round ? `نتائج الجولة ${selectedRound}` : `الجولة ${shownRound.number} خلصت!`}</b><small>راجعوا إجابات كل لاعب وصوّتوا عليها.</small></div></div><div className="tiny-label">{shownRound.status === "review" ? "المراجعة مفتوحة" : "نتائج محفوظة"}</div></div>
          <div className="review-player-nav">
            <button className="btn btn-light btn-quiet" disabled={reviewPlayerIndex <= 0} onClick={() => { setReviewPlayerIndex((index) => Math.max(0, index - 1)); onSound("reveal"); }}><ArrowRight /> السابق</button>
            <span>{reviewPlayerIndex + 1} من {state.players.length}</span>
            <button className="btn btn-primary btn-quiet" disabled={reviewPlayerIndex >= state.players.length - 1} onClick={() => { setReviewPlayerIndex((index) => Math.min(state.players.length - 1, index + 1)); onSound("reveal"); }}>اللاعب التالي <ArrowLeft /></button>
          </div>
          <AnimatePresence mode="wait">
            <motion.section key={reviewPlayer.id} className="room-card review-player-card" initial={motionEnabled ? { opacity: 0, y: 18, scale: .98 } : false} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -14, scale: .98 }} transition={{ duration: motionEnabled ? .22 : 0 }}>
              <div className="review-profile">
                <motion.div className="review-avatar-ring" initial={motionEnabled ? { scale: .6, rotate: -14 } : false} animate={{ scale: 1, rotate: 0 }} transition={motionEnabled ? { type: "spring", stiffness: 190, damping: 14 } : { duration: 0 }}><PlayerAvatar value={reviewPlayer.avatar} /></motion.div>
                <div className="review-player-name"><span className="section-kicker">إجابات اللاعب</span><h2>{reviewPlayer.display_name}</h2><p>{reviewAnswer?.total_points ?? 0} نقطة في الجولة · {reviewPlayer.total_score} نقطة إجمالًا</p></div>
              </div>
              <div className="review-answer-list">
                {state.room.settings.categories.map((categoryId, index) => {
                  const category = getCategory(categoryId, state.room.settings.custom_categories);
                  if (!category) return null;
                  const value = reviewAnswer?.values?.[categoryId]?.trim() ?? "";
                  const points = reviewAnswer?.scores?.[categoryId] ?? 0;
                  const canVote = shownRound.status === "review" && Boolean(value) && reviewPlayer.id !== me.id;
                  const categoryVotes = state.votes.filter((vote) => vote.round_id === shownRound.id && vote.answer_player_id === reviewPlayer.id && vote.category === categoryId);
                  const myVote = categoryVotes.find((vote) => vote.voter_id === me.id);
                  const voteThreshold = Math.max(1, Math.ceil((state.players.length - 1) * .6));
                  const resultOverride = reviewAnswer?.overrides?.[categoryId];
                  const disputed = categoryVotes.some((vote) => vote.accepted) && categoryVotes.some((vote) => !vote.accepted);
                  const judgeKey = `${shownRound.id}:${reviewPlayer.id}:${categoryId}`;
                  const judgment = aiJudgments[judgeKey];
                  const reviewStatus = resultOverride === true ? "review-accepted" : resultOverride === false ? "review-rejected" : disputed ? "review-disputed" : "";
                  return <motion.div className={`review-answer-row ${reviewStatus}`} key={categoryId} initial={motionEnabled ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0 }} transition={{ delay: motionEnabled ? index * .045 : 0 }}>
                    <span className="category-icon">{category.icon}</span><strong className="review-category-name">{category.label}</strong>
                    <span className={`review-answer-text ${value ? "" : "blank-answer"}`}>{value || "لم يكتب إجابة"}</span>
                    <span className="review-points">{points} نقطة</span>
                    {canVote && <div className="answer-review-tools">
                      <div className="ai-judge-panel">
                        <button className="ai-judge-button" disabled={Boolean(aiBusyKey) || Boolean(judgment)} onClick={() => void askAiJudge(shownRound.id, reviewPlayer.id, categoryId, shownRound.letter, category.label, value)}><Sparkles size={15} />{aiBusyKey === judgeKey ? "الحكم بيفكر..." : judgment ? "تم سؤال الحكم" : "اسأل الحكم الذكي"}</button>
                        <small className="ai-judge-privacy">عند السؤال، نرسل الإجابة والفئة والحرف للحكم الذكي.</small>
                        {judgment && <div className={`ai-judge-result ai-${judgment.verdict}`}><strong>{judgment.verdict === "valid" ? "الإجابة مرجّحة الصحة" : judgment.verdict === "invalid" ? "الإجابة مرجّحة الخطأ" : "الحكم مش متأكد"} · ثقة {Math.round(judgment.confidence * 100)}٪</strong><span>{judgment.reason}</span><small>اقتراح استرشادي؛ قرار التصويت النهائي لكم.</small></div>}
                      </div>
                      <div className="review-vote-actions">{isHost ? <>
                        <motion.button className="vote-yes" whileHover={motionEnabled ? { y: -2, scale: 1.04 } : undefined} whileTap={{ scale: .9 }} aria-label="اعتماد الإجابة" onClick={() => void rpc("host_set_answer_valid", { p_round_id: shownRound.id, p_answer_player_id: reviewPlayer.id, p_category: categoryId, p_valid: true }, "تم اعتماد الإجابة وتحديث النقاط.", "approve").catch((cause) => notify(getError(cause)))}><Check /> صحيح</motion.button>
                        <motion.button className="vote-no" whileHover={motionEnabled ? { y: -2, scale: 1.04 } : undefined} whileTap={{ scale: .9 }} aria-label="رفض الإجابة" onClick={() => void rpc("host_set_answer_valid", { p_round_id: shownRound.id, p_answer_player_id: reviewPlayer.id, p_category: categoryId, p_valid: false }, "تم رفض الإجابة وتحديث النقاط.", "reject").catch((cause) => notify(getError(cause)))}><X /> خطأ</motion.button>
                      </> : <div className="review-vote-box">
                        <div className="vote-progress"><strong>{resultOverride === undefined ? `${categoryVotes.length} / ${voteThreshold} أصوات` : resultOverride ? "الإجابة مقبولة" : "الإجابة مرفوضة"}</strong><small>{myVote ? myVote.accepted ? "صوّتَّ بالموافقة" : "صوّتَّ بالرفض" : "صوّت على الإجابة"}</small></div>
                        <motion.button className={`vote-yes ${myVote?.accepted ? "voted" : ""}`} whileHover={motionEnabled ? { y: -2, scale: 1.04 } : undefined} whileTap={{ scale: .9 }} aria-label="أوافق على الإجابة" onClick={() => void rpc("cast_answer_vote", { p_round_id: shownRound.id, p_answer_player_id: reviewPlayer.id, p_category: categoryId, p_accepted: true }, "وصل تصويتك.", "approve").catch((cause) => notify(getError(cause)))}><Check /> أوافق</motion.button>
                        <motion.button className={`vote-no ${myVote?.accepted === false ? "voted" : ""}`} whileHover={motionEnabled ? { y: -2, scale: 1.04 } : undefined} whileTap={{ scale: .9 }} aria-label="لا أوافق على الإجابة" onClick={() => void rpc("cast_answer_vote", { p_round_id: shownRound.id, p_answer_player_id: reviewPlayer.id, p_category: categoryId, p_accepted: false }, "وصل تصويتك.", "reject").catch((cause) => notify(getError(cause)))}><X /> لا أوافق</motion.button>
                      </div>}</div>
                    </div>}
                  </motion.div>;
                })}
              </div>
              {reviewPlayer.id === me.id && shownRound.status === "review" && <div className="letter-turn-note">دي إجاباتك؛ أصحابك يراجعوها ويصوّتوا عليها.</div>}
            </motion.section>
          </AnimatePresence>
          <div className="results-footer"><div className="setting-options">{state.rounds.map((round) => <button className={`choice-chip ${shownRound.number === round.number ? "selected" : ""}`} key={round.id} onClick={() => setSelectedRound(round.number)}>جولة {round.number}</button>)}</div>
            {state.room.status === "finished" && <button className="btn btn-light" onClick={() => setSelectedRound(null)}>الترتيب النهائي <Trophy /></button>}
            {isHost && shownRound.number === state.room.current_round && shownRound.status === "review" && <button className="btn btn-primary" onClick={() => void rpc("start_next_round", { p_room_id: roomId }, undefined, "letter").catch((cause) => notify(getError(cause)))}>{shownRound.number >= state.room.settings.round_count ? "النتيجة النهائية" : "الجولة التالية"} <ArrowLeft /></button>}
          </div>
        </motion.div>}

        {mainState === "finished" && state && <motion.div key="finished" className="room-card" initial={false} animate={{ opacity: 1, scale: 1 }} transition={{ duration: motionEnabled ? .2 : 0 }}>
          <div className="confetti-layer" aria-hidden="true">{Array.from({ length: 48 }, (_, index) => <i className="confetti" key={index} style={{ left: `${(index * 37) % 100}%`, animationDelay: `${(index % 9) * -.42}s`, animationDuration: `${3 + index % 4}s` }} />)}</div>
          <div className="champion"><motion.div className="champion-crown" initial={motionEnabled ? { opacity: 0, y: -25, scale: .45, rotate: -18 } : false} animate={motionEnabled ? { opacity: 1, y: [0, -7, 0], scale: 1, rotate: 0 } : { opacity: 1, scale: 1, rotate: 0 }} transition={{ duration: .8, delay: .12 }}>🏆</motion.div><div className="section-kicker">انتهت المباراة</div><motion.h1 initial={motionEnabled ? { opacity: 0, y: 15, scale: .94 } : false} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 180, damping: 16, delay: motionEnabled ? .22 : 0 }}>{matchChampions.length > 1 ? "تعادل الأبطال!" : `${rankedPlayers[0]?.display_name} هو الفائز!`}</motion.h1><p>إليك الترتيب النهائي ونقاط كل لاعب.</p>
            <div className="podium">{rankedPlayers.slice(0,3).map((player,index) => <motion.div className={`podium-place ${index===0?"first":index===1?"second":"third"}`} key={player.id} initial={motionEnabled ? { opacity: 0, y: 28, scale: .9 } : false} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 170, damping: 16, delay: motionEnabled ? .32 + index * .13 : 0 }}><PlayerAvatar className="podium-avatar" value={player.avatar} /><b>{player.display_name}</b><small>{player.total_score} نقطة</small></motion.div>)}</div>
            <p className="champion-chant">استر يا دولي!</p>
          </div>
          <section className="achievement-panel"><div className="subhead"><h2>إنجازاتكم في الغرفة</h2><small>تتراكم مع كل مباراة جديدة</small></div><div className="achievement-grid">
            <article className="achievement-card"><span>🏆 أكثر فوزًا</span><strong>{(roomWinsLeader?.wins ?? 0) > 0 ? roomWinsLeader?.display_name : "لسه مفيش فائز"}</strong><small>{roomWinsLeader?.wins ?? 0} فوز · {roomWinsLeader?.matches_played ?? 0} مباراة</small></article>
            <article className="achievement-card"><span>🔥 أطول سلسلة انتصارات</span><strong>{(streakLeader?.best_win_streak ?? 0) > 0 ? streakLeader?.display_name : "ابدأوا أول مباراة"}</strong><small>أفضل سلسلة: {streakLeader?.best_win_streak ?? 0}</small></article>
            <article className="achievement-card"><span>✍️ إجابات فريدة في المباراة</span><strong>{uniqueAnswerLeader ? uniqueAnswerLeader.display_name : "—"}</strong><small>{uniqueAnswerLeader ? currentMatchUniqueAnswers(uniqueAnswerLeader.id) : 0} إجابة فريدة</small></article>
            <article className="achievement-card"><span>🚌 أسرع أتوبيس مكتمل</span><strong>{fastestLeader?.display_name ?? "لسه مفيش رقم"}</strong><small>{formatRecordTime(fastestLeader?.fastest_bus_ms)}</small></article>
          </div></section>
          <div className="room-card" style={{ padding: 0, boxShadow: "none" }}>{rankedPlayers.map((player,index) => <div className="rank-row" key={player.id}><b>{index+1}</b><PlayerAvatar className="avatar-large" value={player.avatar} /><div className="rank-player-details"><span>{player.display_name}</span><small>{player.wins ?? 0} فوز · {player.bus_completes ?? 0} أتوبيس مكتمل</small></div><strong>{player.total_score} نقطة</strong></div>)}</div>
          <div className="button-row" style={{ justifyContent: "center", marginTop: 20 }}><button className="btn btn-primary" disabled={!isHost} onClick={() => void rpc("restart_match", { p_room_id: roomId }, "جهزنا غرفة جديدة بنفس اللاعبين.", "join").then(() => setSelectedRound(null)).catch((cause) => notify(getError(cause)))}><RotateCcw /> العبوا مرة تانية</button><button className="btn btn-light" onClick={onExit}>العودة للرئيسية</button></div>
          {!isHost && <div className="tiny-label" style={{ textAlign: "center", marginTop: 10 }}>المضيف يقدر يعيد المباراة بنفس اللاعبين.</div>}
        </motion.div>}
      </AnimatePresence>
      {mainState !== "lobby" && mainState !== "closed" && <div className="setting-options" style={{ marginTop: 14, justifyContent: "center" }}>{state.rounds.map((round) => (state.room.status === "finished" || round.number < state.room.current_round) && <button key={round.id} className={`choice-chip ${selectedRound === round.number ? "selected" : ""}`} onClick={() => setSelectedRound(round.number)}>سجل الجولة {round.number}</button>)}</div>}
    </div>
    <AnimatePresence>{toast && <motion.div className="toast" initial={motionEnabled ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: motionEnabled ? .18 : 0 }}>{toast}</motion.div>}</AnimatePresence>
    {reactions.map((reaction,index) => <div className="reaction-float" key={reaction.id} title={reaction.name} style={{ left: `${20 + (index * 17) % 65}%`, bottom: "28px" }}>{reaction.emoji}</div>)}
    {showBusAnim && <BusAnimation playerName={busCompleterName} onComplete={() => setShowBusAnim(false)} />}
  </section>;
}

