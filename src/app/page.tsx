"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ArrowLeft, BusFront, Camera, Clock3, DoorOpen, Moon, Play, Sparkles, Sun, UsersRound, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import GameRoom from "@/components/game-room";
import SoloPractice from "@/components/solo-practice";
import PlayerAvatar from "@/components/player-avatar";
import { AVATARS } from "@/lib/game";
import { ensureUser, getSupabase } from "@/lib/supabase";
import { playGameSfx } from "@/lib/sfx";

type RoomEntry = { id: string; code: string };
type ModalKind = "create" | "join" | null;

async function compressAvatar(file: File): Promise<Blob> {
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const scale = Math.min(1, 384 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", .82));
    if (!blob) throw new Error("تعذر تجهيز الصورة. جرّب صورة تانية.");
    return blob;
  } finally { URL.revokeObjectURL(source); }
}

export default function HomePage() {
  const [room, setRoom] = useState<RoomEntry | null>(null);
  const [soloOpen, setSoloOpen] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [prefillCode, setPrefillCode] = useState("");
  const [dark, setDark] = useState(false);
  const [sound, setSound] = useState(true);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const ready = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
  const supabase = getSupabase();

  useEffect(() => {
    const storedDark = localStorage.getItem("bus-dark") === "true";
    const storedSound = localStorage.getItem("bus-sound") !== "false";
    const storedMotion = localStorage.getItem("bus-motion") !== "false";
    setDark(storedDark); setSound(storedSound);
    setMotionEnabled(storedMotion);
    document.documentElement.dataset.theme = storedDark ? "dark" : "light";
    document.documentElement.dataset.motion = storedMotion ? "on" : "off";
    const queryCode = new URLSearchParams(window.location.search).get("room");
    const code = queryCode ?? localStorage.getItem("bus-last-room");
    if (!code) return;
    setPrefillCode(code.toUpperCase());
    if (!supabase) { setModal("join"); return; }
    let active = true;
    void (async () => {
      try {
        const user = await ensureUser();
        const { data: foundRoom } = await supabase.from("rooms").select("id,code").eq("code", code.toUpperCase()).maybeSingle();
        if (!active) return;
        if (foundRoom) {
          const { data: member } = await supabase.from("players").select("id").eq("room_id", foundRoom.id).eq("user_id", user.id).maybeSingle();
          if (member) {
            await supabase.rpc("heartbeat_room", { p_room_id: foundRoom.id });
            localStorage.setItem("bus-last-room", foundRoom.code);
            if (active) setRoom({ id: foundRoom.id, code: foundRoom.code });
            return;
          }
        }
        if (queryCode) setModal("join");
        else localStorage.removeItem("bus-last-room");
      } catch { if (active && queryCode) setModal("join"); }
    })();
    return () => { active = false; };
  }, [supabase]);

  const toggleTheme = useCallback(() => {
    setDark((current) => {
      const next = !current; localStorage.setItem("bus-dark", String(next));
      document.documentElement.dataset.theme = next ? "dark" : "light"; return next;
    });
  }, []);
  const toggleSound = useCallback(() => setSound((current) => {
    const next = !current; localStorage.setItem("bus-sound", String(next)); playGameSfx(next, "tap"); return next;
  }), []);
  const toggleMotion = useCallback(() => setMotionEnabled((current) => {
    const next = !current; localStorage.setItem("bus-motion", String(next));
    document.documentElement.dataset.motion = next ? "on" : "off"; return next;
  }), []);
  const enterRoom = (entry: RoomEntry) => {
    setRoom(entry); setModal(null); setPrefillCode(entry.code);
    localStorage.setItem("bus-last-room", entry.code);
    window.history.pushState({}, "", `/?room=${entry.code}`);
    playGameSfx(sound, "join");
  };
  const exitRoom = () => {
    if (room && supabase) void supabase.rpc("leave_room", { p_room_id: room.id });
    setRoom(null); localStorage.removeItem("bus-last-room"); window.history.pushState({}, "", "/");
  };

  return <main className="app-shell" data-theme={dark ? "dark" : "light"}><MotionConfig reducedMotion={motionEnabled ? "user" : "always"}>
    <header className="wrap topbar">
      <a className="brand" href="#home" aria-label="أتوبيس كومبليت، الرئيسية">
        <span className="brand-mark"><BusFront /></span>
        <span className="brand-type">أتوبيس كومبليت<small>الحرف عليك، والمرح علينا</small></span>
      </a>
      <nav className="nav-links"><a href="#how">طريقة اللعب</a><a href="#points">النقاط</a><a href="#friends">اللعب مع أصحابك</a></nav>
      <div className="top-actions">
        <span className="tiny-label">{ready ? "اللعب أونلاين جاهز" : "بانتظار إعداد الاتصال"}</span>
        <button className="icon-btn" onClick={toggleSound} aria-label={sound ? "إيقاف الصوت" : "تشغيل الصوت"}>{sound ? <Volume2 /> : <VolumeX />}</button>
        <button className="icon-btn" onClick={toggleMotion} aria-label={motionEnabled ? "إيقاف الحركة" : "تشغيل الحركة"}><Sparkles /></button>
        <button className="icon-btn" onClick={toggleTheme} aria-label={dark ? "الوضع الفاتح" : "الوضع الداكن"}>{dark ? <Sun /> : <Moon />}</button>
      </div>
    </header>

    {room ? <GameRoom roomId={room.id} roomCode={room.code} sound={sound} motionEnabled={motionEnabled} onSound={(cue) => playGameSfx(sound, cue)} onToggleSound={toggleSound} onExit={exitRoom} /> : soloOpen ? <SoloPractice motionEnabled={motionEnabled} onSound={(cue) => playGameSfx(sound, cue)} onExit={() => setSoloOpen(false)} /> : <>
      <section className="wrap hero" id="home">
        <motion.div className="hero-copy" initial={false} animate={{ opacity: 1, x: 0 }} transition={{ duration: motionEnabled ? .3 : 0, ease: "easeOut" }}>
          <div className="eyebrow"><span className="eyebrow-dot" /> لعبة الحروف اللي بتجمعنا</div>
          <h1>فاكر اللعبة؟<span>أتوبيس كومبليت</span></h1>
          <p>حرف واحد، وفئات تختاروها، وتحدّي ممتع. ادعُ أصحابك إلى غرفة والعبوا أونلاين من أي مكان.</p>
          <div className="button-row">
            <button className="btn btn-primary" onClick={() => setModal("create")}><Play fill="currentColor" /> ابدأ اللعب <ArrowLeft /></button>
            <button className="btn btn-light" onClick={() => { setPrefillCode(""); setModal("join"); }}><DoorOpen /> انضم لغرفة</button>
            <button className="btn btn-light solo-hero-button" onClick={() => { setModal(null); setSoloOpen(true); }}><Sparkles /> اتدرب لوحدك</button>
          </div>
          <div className="button-note"><span className="player-stack"><span>🦊</span><span>🐼</span><span>🐯</span><span>🐧</span></span><span>من ٢ لـ ١٠ لاعبين · وكل واحد من جهازه</span></div>
        </motion.div>
        <motion.div className="hero-art" initial={false} animate={{ opacity: 1, scale: 1 }} transition={{ duration: motionEnabled ? .35 : 0 }} aria-label="معاينة مرحة للعبة">
          <div className="art-orbit" />
          <div className="floating-note note-fun"><Sparkles /><span>التحدّي أحلى أونلاين</span></div>
          <div className="game-card">
            <div className="game-card-top"><span className="round-pill"><span /> مثال الجولة</span><span>من غير وقت</span></div>
            <div className="letter-stage"><div className="big-letter">م</div><div className="letter-caption">اكتب إجابات تبدأ بحرف</div></div>
            <div className="sample-fields">
              <div className="sample-field">👦 <b>محمد</b></div><div className="sample-field">👧 <b>مريم</b></div><div className="sample-field">🐾 <b>مهر</b></div>
              <div className="sample-field">🌿 <b>موز</b></div><div className="sample-field">🧸 <b>مفتاح</b></div><div className="sample-field">🌍 <b>مصر</b></div>
            </div>
            <div className="progress-line"><i /></div>
          </div>
          <div className="floating-note note-score"><span className="score-bubble">+١٠</span><span>إجابة فريدة!</span></div>
          <div className="bus-illustration"><BusFront /><span className="bus-trail" /></div>
        </motion.div>
      </section>

      <section className="wrap section" id="how">
        <div className="section-heading"><div><div className="section-kicker">تبدأ في ثواني</div><h2>ثلاث خطوات وتلاقوا نفسكم بتتنافسوا</h2></div><p>اللعبة بسيطة من أول مرة، وكل جولة بتطلع إجابات وحكايات ما كانتش على البال.</p></div>
        <div className="steps-grid">
          <motion.article className="step-card" whileHover={motionEnabled ? { y: -4 } : undefined}><div className="step-number">٠١</div><h3>افتحوا غرفة</h3><p>أنشئ غرفة وشارك كودها أو رابط الدعوة مع أصحابك.</p></motion.article>
          <motion.article className="step-card" whileHover={motionEnabled ? { y: -4 } : undefined}><div className="step-number">٠٢</div><h3>اختاروا الحرف</h3><p>اختاروا فئات الجولة من الفئات الجاهزة أو أضيفوا فئاتكم. كل لاعب يكتب إجاباته من جهازه.</p></motion.article>
          <motion.article className="step-card" whileHover={motionEnabled ? { y: -4 } : undefined}><div className="step-number">٠٣</div><h3>راجعوا واكسبوا</h3><p>شوفوا إجابات بعض، صوّتوا على المختلف عليه، واجمعوا النقاط.</p></motion.article>
        </div>
        <div className="score-strip" id="points">
          <strong>كل إجابة صحّ بتقرّبك من الفوز</strong>
          <div className="score-examples"><span className="score-chip"><b>١٠</b> إجابة صحيحة وفريدة</span><span className="score-chip"><b>٥</b> إجابة صحيحة مكررة</span><span className="score-chip"><b>٠</b> فارغة أو غير مطابقة</span></div>
        </div>
      </section>
      <section className="wrap section" id="friends" style={{ paddingTop: 0 }}>
        <div className="section-heading"><div><div className="section-kicker">كل صحابك على نفس الحرف</div><h2>مش لازم تكونوا في نفس المكان</h2></div><p>غرفة واحدة تجمعكم، والتغييرات والنتائج بتظهر لحظيًا عند كل لاعب.</p></div>
        <div className="score-strip" style={{ background: "var(--mint)", color: "var(--ink)" }}>
          <strong>كل ما تحتاجونه اسم مستعار ورابط الغرفة</strong>
          <button className="btn btn-primary btn-quiet" onClick={() => setModal("create")}>جهّزوا الغرفة <ArrowLeft /></button>
        </div>
      </section>
      <footer className="wrap footer"><div className="footer-brand"><span className="brand-mark"><BusFront /></span><span>أتوبيس كومبليت</span></div><span>لعبة الحروف والتحدّي بين الأصدقاء.</span></footer>
    </>}

    <AnimatePresence>{modal && !room && !soloOpen && <EntryDialog kind={modal} code={prefillCode} onClose={() => setModal(null)} onEnter={enterRoom} ready={ready} sound={sound} motionEnabled={motionEnabled} />}</AnimatePresence>
  </MotionConfig></main>;
}

function EntryDialog({ kind, code, onClose, onEnter, ready, sound, motionEnabled }: { kind: Exclude<ModalKind, null>; code: string; onClose: () => void; onEnter: (entry: RoomEntry) => void; ready: boolean; sound: boolean; motionEnabled: boolean }) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [roomCode, setRoomCode] = useState(code);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const supabase = getSupabase();
  const hasSavedPhoto = /^https?:\/\//i.test(avatar);

  useEffect(() => () => { if (avatar.startsWith("blob:")) URL.revokeObjectURL(avatar); }, [avatar]);

  useEffect(() => { setRoomCode(code); }, [code]);
  useEffect(() => {
    setName(localStorage.getItem("bus-name") ?? "");
    const savedAvatar = localStorage.getItem("bus-avatar");
    if (savedAvatar) setAvatar(savedAvatar);
  }, []);
  const submit = async () => {
    setError("");
    if (!name.trim()) { setError("اكتب اسمك الأول عشان أصحابك يعرفوك."); return; }
    if (kind === "join" && !roomCode.trim()) { setError("اكتب كود الغرفة."); return; }
    if (!supabase || !ready) { setError("الاتصال أونلاين غير مُعد بعد. أضف مفاتيح Supabase في ملف .env.local واتبع خطوات الإعداد في README."); return; }
    setBusy(true);
    try {
      const user = await ensureUser();
      let selectedAvatar = avatar;
      if (avatarFile) {
        const photo = await compressAvatar(avatarFile);
        const path = `${user.id}/${crypto.randomUUID()}.webp`;
        const { error: uploadError } = await supabase.storage.from("player-avatars").upload(path, photo, { contentType: "image/webp", upsert: false });
        if (uploadError) throw new Error("تعذر رفع صورة الحساب. تأكد من تشغيل تحديث Supabase الأخير.");
        selectedAvatar = supabase.storage.from("player-avatars").getPublicUrl(path).data.publicUrl;
      }
      const { data, error: rpcError } = kind === "create"
        ? await supabase.rpc("create_room", { p_name: name.trim(), p_avatar: selectedAvatar })
        : await supabase.rpc("join_room", { p_code: roomCode.trim().toUpperCase(), p_name: name.trim(), p_avatar: selectedAvatar });
      if (rpcError) throw new Error(rpcError.message);
      const result = data as { id?: string; room_id?: string; code: string };
      const resultId = result.id ?? result.room_id;
      if (!resultId) throw new Error("لم يرجع الخادم بيانات الغرفة.");
      localStorage.setItem("bus-name", name.trim());
      localStorage.setItem("bus-avatar", selectedAvatar);
      playGameSfx(sound, "join");
      onEnter({ id: resultId, code: result.code });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "حصل خطأ غير متوقع. جرّب مرة تانية.";
      setError(message.includes("Anonymous") || message.includes("anonymous") ? "فعّل Anonymous Sign-Ins في إعدادات Supabase ثم جرّب تاني." : message);
    } finally { setBusy(false); }
  };

  return <motion.div className="modal-backdrop" initial={motionEnabled ? { opacity: 0 } : false} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: motionEnabled ? .18 : 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.section className="modal" role="dialog" aria-modal="true" aria-labelledby="entry-title" initial={motionEnabled ? { opacity: 0, y: 17, scale: .98 } : false} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: motionEnabled ? .2 : 0 }}>
      <div className="modal-head"><div><h2 id="entry-title">{kind === "create" ? "يلا نفتح غرفة" : "انضم للّمة"}</h2><p>{kind === "create" ? "اختار اسمك وصورتك، وخلي الباقي علينا." : "اكتب كود الدعوة وخش على أصحابك."}</p></div><button className="close-btn" onClick={onClose} aria-label="إغلاق"><X size={17} /></button></div>
      {!ready && <div className="connection-note"><Clock3 /> <span>اللعب أونلاين يحتاج إعداد Supabase مرة واحدة. الواجهة جاهزة، ولن ننشئ غرفة محلية وهمية.</span></div>}
      <div className="form-group"><label className="field-label" htmlFor="player-name">اسمك المستعار</label><input id="player-name" className="text-field" maxLength={24} placeholder="مثال: مريم" value={name} onChange={(event) => setName(event.target.value)} autoFocus /></div>
      {kind === "join" && <div className="form-group"><label className="field-label" htmlFor="room-code">كود الغرفة</label><input id="room-code" className="text-field" dir="ltr" style={{ letterSpacing: ".18em", fontWeight: 900 }} maxLength={6} placeholder="ABC123" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} /></div>}
      <div className="form-group"><span className="field-label">اختار صورتك</span>
        <label className={`avatar-upload ${avatarFile || hasSavedPhoto ? "active" : ""}`} htmlFor="avatar-photo"><Camera size={17} /><span>{avatarFile || hasSavedPhoto ? "صورتك الحالية" : "اختار صورة من جهازك"}</span>{(avatarFile || hasSavedPhoto) && <PlayerAvatar value={avatar} className="avatar-option-preview" />}</label>
        <input className="avatar-file-input" id="avatar-photo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) { setError("اختار صورة حجمها أقل من ٥ ميجابايت."); event.target.value = ""; return; }
          setError(""); setAvatarFile(file); setAvatar(URL.createObjectURL(file));
        }} />
        <div className="avatar-picker">{AVATARS.map((item) => <button type="button" className={`avatar-option ${!avatarFile && avatar === item ? "active" : ""}`} key={item} onClick={() => { setAvatarFile(null); setAvatar(item); }} aria-label={`الصورة ${item}`}><PlayerAvatar value={item} /></button>)}</div>
      </div>
      {error && <div className="modal-error">{error}</div>}
      <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>{busy ? "لحظة واحدة..." : kind === "create" ? <><UsersRound /> إنشاء الغرفة <ArrowLeft /></> : <><DoorOpen /> انضم للغرفة <ArrowLeft /></>}</button>
    </motion.section>
  </motion.div>;
}
