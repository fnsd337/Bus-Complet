"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Bot, Brain, BusFront, Check, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { answerStartsWithLetter, ARABIC_LETTERS, CATEGORIES, scoreAnswers, type CategoryId } from "@/lib/game";
import { requestGameAi } from "@/lib/game-ai-client";
import type { SfxCue } from "@/lib/sfx";

type Difficulty = "casual" | "clever" | "playful";
type SoloStage = "setup" | "playing" | "results";
type SoloPracticeProps = { motionEnabled: boolean; onSound: (cue?: SfxCue) => void; onExit: () => void };

const difficultyOptions: Array<{ id: Difficulty; label: string; note: string }> = [
  { id: "casual", label: "هادي", note: "إجابات بسيطة ومألوفة" },
  { id: "clever", label: "ذكي", note: "إجابات صعبة، ذكية، وأقل شيوعًا" },
  { id: "playful", label: "مرح", note: "منافس خفيف الظل" }
];

export default function SoloPractice({ motionEnabled, onSound, onExit }: SoloPracticeProps) {
  const [stage, setStage] = useState<SoloStage>("setup");
  const [name, setName] = useState("اللاعب");
  const [letter, setLetter] = useState("م");
  const [categories, setCategories] = useState<CategoryId[]>(CATEGORIES.map((category) => category.id));
  const [difficulty, setDifficulty] = useState<Difficulty>("clever");
  const [values, setValues] = useState<Partial<Record<CategoryId, string>>>({});
  const [opponentAnswers, setOpponentAnswers] = useState<Partial<Record<CategoryId, string>>>({});
  const [withOpponent, setWithOpponent] = useState(false);
  const [opponentReady, setOpponentReady] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const aiRequestId = useRef(0);

  useEffect(() => { setName(localStorage.getItem("bus-name")?.trim() || "اللاعب"); }, []);

  const answersForScore = useMemo(() => withOpponent
    ? [{ playerId: "you", values }, { playerId: "rival", values: opponentAnswers }]
    : [{ playerId: "you", values }], [opponentAnswers, values, withOpponent]);
  const scores = useMemo(() => scoreAnswers(answersForScore, letter, categories), [answersForScore, categories, letter]);
  const playerPoints = Object.values(scores.you ?? {}).reduce<number>((sum, score) => sum + (score ?? 0), 0);
  const opponentPoints = Object.values(scores.rival ?? {}).reduce<number>((sum, score) => sum + (score ?? 0), 0);
  const allFilled = categories.length > 0 && categories.every((category) => Boolean(values[category]?.trim()));
  const allValid = categories.length > 0 && categories.every((category) => answerStartsWithLetter(values[category] ?? "", letter));

  const toggleCategory = (categoryId: CategoryId) => {
    if (!categories.includes(categoryId) && categories.length >= 10) { setError("تقدر تختار ١٠ فئات بحد أقصى."); return; }
    setError("");
    setCategories((current) => current.includes(categoryId)
      ? current.length > 1 ? current.filter((item) => item !== categoryId) : current
      : [...current, categoryId]);
  };

  const startRound = async (againstAi: boolean, chosenLetter = letter) => {
    setError("");
    if (againstAi) {
      const requestId = ++aiRequestId.current;
      setBusy(true);
      setOpponentAnswers({});
      setWithOpponent(true);
      setOpponentReady(false);
      setLetter(chosenLetter);
      setValues({});
      setStage("playing");
      onSound("join");

      void requestGameAi<{ answers?: Partial<Record<CategoryId, string>> }>({
          mode: "opponent", letter: chosenLetter, difficulty,
          categories: categories.map((id) => ({ id, label: CATEGORIES.find((category) => category.id === id)?.label ?? id }))
      }).then((data) => {
        if (requestId !== aiRequestId.current) return;
        if (!data.answers) throw new Error("تعذّر تجهيز المنافس. جرّب مرة أخرى.");
        setOpponentAnswers(data.answers);
        setOpponentReady(true);
      }).catch((cause) => {
        if (requestId !== aiRequestId.current) return;
        setError(cause instanceof Error ? cause.message : "تعذّر تشغيل المنافس الذكي.");
        setOpponentAnswers({});
        setWithOpponent(false);
        setOpponentReady(true);
      }).finally(() => {
        if (requestId === aiRequestId.current) setBusy(false);
      });
      return;
    }
    aiRequestId.current += 1;
    setBusy(false);
    setOpponentAnswers({});
    setWithOpponent(false);
    setOpponentReady(true);
    setLetter(chosenLetter);
    setValues({});
    setStage("playing");
    onSound("join");
  };

  const finishRound = () => {
    if (withOpponent && !opponentReady) {
      setError("المنافس لسه بيجهّز إجاباته؛ اكتب إجاباتك وخد ثواني لحد ما يخلص.");
      return;
    }
    if (!allFilled || !allValid) {
      setError(!allFilled ? "كمّل كل الخانات الأول." : `اكتب كلمة كاملة من حرفين على الأقل، وتبدأ بحرف ${letter}.`);
      return;
    }
    setError("");
    setStage("results");
    onSound(withOpponent && playerPoints > opponentPoints ? "combo" : withOpponent && playerPoints === opponentPoints ? "tie" : "bus");
  };

  const newLetter = () => {
    const choices = ARABIC_LETTERS.filter((candidate) => candidate !== letter);
    return choices[Math.floor(Math.random() * choices.length)];
  };

  return <section className="solo-page wrap">
    <header className="solo-header"><div><span className="brand-mark"><Brain /></span><div><h1>تدريب أتوبيس كومبليت</h1><p>جرّب حظك لوحدك، أو تحدّى منافس الذكاء الاصطناعي.</p></div></div><button className="btn btn-light btn-quiet" onClick={onExit}><ArrowRight /> الرئيسية</button></header>

    <AnimatePresence mode="wait">
      {stage === "setup" && <motion.section className="room-card solo-card" key="solo-setup" initial={motionEnabled ? { opacity: 0, y: 12 } : false} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
        <div className="solo-intro"><span className="solo-icon"><Bot /></span><div><span className="section-kicker">تدريب من غير مؤقّت</span><h2>جاهز لتحدّي حرف جديد؟</h2><p>اختر الحرف والفئات ومستوى المنافس، وبعدها اكتب إجاباتك براحتك.</p></div></div>
        <div className="solo-section"><div className="subhead"><h3>اختر الحرف</h3><button className="choice-chip" onClick={() => { const next = newLetter(); setLetter(next); onSound("letter"); }}>حرف عشوائي <Sparkles size={14} /></button></div><div className="solo-letter-grid">{ARABIC_LETTERS.map((item) => <button key={item} className={`choice-chip ${letter === item ? "selected" : ""}`} onClick={() => { setLetter(item); onSound("tap"); }}>{item}</button>)}</div></div>
        <div className="solo-section"><div className="subhead"><h3>اختر الفئات</h3><small>{categories.length} فئة · بحد أقصى ١٠</small></div><div className="setting-options">{CATEGORIES.map((category) => <button key={category.id} className={`choice-chip category-option ${categories.includes(category.id) ? "selected" : ""}`} onClick={() => toggleCategory(category.id)}><b>{category.icon}</b>{category.label}</button>)}</div></div>
        <div className="solo-section"><div className="subhead"><h3>مستوى المنافس</h3><small>النتيجة للتدريب فقط</small></div><div className="solo-difficulty-grid">{difficultyOptions.map((option) => <button key={option.id} className={`solo-difficulty ${difficulty === option.id ? "selected" : ""}`} onClick={() => { setDifficulty(option.id); onSound("tap"); }}><strong>{option.label}</strong><small>{option.note}</small></button>)}</div></div>
        {error && <div className="solo-error" role="alert">{error}</div>}
        <div className="solo-start-actions"><button className="btn btn-primary" disabled={busy} onClick={() => void startRound(true)}>{busy ? <><span className="spinner solo-spinner" /> بنجهّز المنافس...</> : <><Sparkles /> ابدأ ضد منافس ذكي <ArrowLeft /></>}</button><button className="btn btn-light" disabled={busy} onClick={() => void startRound(false)}>تدرّب من غير منافس</button></div>
        <p className="solo-footnote">منافس التدريب للتسلية والاسترشاد؛ نقاطه منفصلة عن غرف الأصحاب. عند اختياره، نرسل الحرف والفئات فقط لتجهيز إجاباته.</p>
      </motion.section>}

      {stage === "playing" && <motion.section className="room-card solo-card" key={`solo-playing-${letter}`} initial={motionEnabled ? { opacity: 0, y: 12 } : false} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
        <div className="solo-game-top"><div><span className="section-kicker">{withOpponent ? difficultyOptions.find((option) => option.id === difficulty)?.label : "تدريب فردي"}</span><h2>اكتب إجابات تبدأ بالحرف</h2><p>خد وقتك؛ الجولة من غير مؤقّت.</p></div><div className="solo-letter-card"><small>الحرف</small><strong>{letter}</strong></div></div>
        {withOpponent && <div className="solo-rival-note">{opponentReady ? <><Bot size={18} /> المنافس جهّز إجاباته، ابدأ التحدّي!</> : <><span className="spinner solo-spinner" /> المنافس بيفكّر في إجاباته؛ اكتب إجاباتك لحد ما يخلص.</>}</div>}
        <div className="solo-answer-grid">{categories.map((categoryId) => {
          const category = CATEGORIES.find((item) => item.id === categoryId)!;
          const value = values[categoryId] ?? "";
          const invalid = Boolean(value.trim() && !answerStartsWithLetter(value, letter));
          return <label className={`answer-field ${value.trim() ? "filled" : ""} ${invalid ? "invalid" : ""}`} key={categoryId}><span><i className="category-icon">{category.icon}</i>{category.label}</span><input value={value} maxLength={80} placeholder={`اكتب ${category.label}...`} onChange={(event) => setValues((current) => ({ ...current, [categoryId]: event.target.value }))} /></label>;
        })}</div>
        {error && <div className="solo-error" role="alert">{error}</div>}
        <div className="solo-game-footer"><button className="btn btn-light" onClick={() => { aiRequestId.current += 1; setBusy(false); setError(""); setStage("setup"); }}><ArrowRight /> إعدادات التدريب</button><button className="btn btn-primary" disabled={withOpponent && !opponentReady} onClick={finishRound}><BusFront /> أتوبيس كومبليت!</button></div>
      </motion.section>}

      {stage === "results" && <motion.section className="room-card solo-card" key={`solo-results-${letter}`} initial={motionEnabled ? { opacity: 0, y: 12 } : false} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
        <div className="solo-results-head"><span className="solo-icon"><Trophy /></span><div><span className="section-kicker">خلصت الجولة · الحرف {letter}</span><h2>{withOpponent ? playerPoints > opponentPoints ? "كسبت الجولة!" : playerPoints < opponentPoints ? "المنافس كسب الجولة" : "تعادل جميل!" : "أحسنت، خلصت تدريبك!"}</h2><p>{withOpponent ? `${name}: ${playerPoints} نقطة · المنافس الذكي: ${opponentPoints} نقطة` : `${playerPoints} نقطة في تدريبك`}</p></div></div>
        <div className="solo-result-table"><div className="solo-result-row solo-result-heading"><span>الفئة</span><span>{name}</span>{withOpponent && <span>المنافس</span>}</div>{categories.map((categoryId) => {
          const category = CATEGORIES.find((item) => item.id === categoryId)!;
          return <div className="solo-result-row" key={categoryId}><span><b>{category.icon}</b>{category.label}</span><span><strong>{values[categoryId] || "—"}</strong><small>{scores.you?.[categoryId] ?? 0} نقطة</small></span>{withOpponent && <span><strong>{opponentAnswers[categoryId] || "—"}</strong><small>{scores.rival?.[categoryId] ?? 0} نقطة</small></span>}</div>;
        })}</div>
        <div className="solo-game-footer"><button className="btn btn-light" onClick={() => { setStage("setup"); setError(""); }}><ArrowRight /> إعدادات التدريب</button><button className="btn btn-primary" onClick={() => void startRound(withOpponent, newLetter())}><RotateCcw /> جولة جديدة</button></div>
      </motion.section>}
    </AnimatePresence>
  </section>;
}
