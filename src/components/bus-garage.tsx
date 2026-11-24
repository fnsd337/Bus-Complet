"use client";

import { motion } from "framer-motion";
import { ArrowRight, BusFront, Check, Lock, Palette, RotateCcw, RotateCw, Sparkles, Volume2, Zap, Hand, Eye } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import AnimatedCounter from "@/components/animated-counter";
import {
  buyVehicle,
  CUSTOM_PAINT_PALETTE,
  GARAGE_VEHICLES,
  getCustomVehicleColors,
  getEquippedVehicleId,
  getOwnedVehicles,
  getPlayerProfile,
  setCustomVehicleColor,
  setEquippedVehicleId,
  type GarageVehicle,
  type PlayerProfile
} from "@/lib/profile";
import { playVehicleHorn, type SfxCue } from "@/lib/sfx";

type BusGarageProps = {
  motionEnabled: boolean;
  onSound: (cue?: SfxCue) => void;
  onExit: () => void;
};

export default function BusGarage({ motionEnabled, onSound, onExit }: BusGarageProps) {
  const [profile, setProfile] = useState<PlayerProfile>(getPlayerProfile());
  const [ownedVehicles, setOwnedVehicles] = useState<string[]>([]);
  const [equippedId, setEquippedId] = useState<string>("classic_bus");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("classic_bus");
  const [customColors, setCustomColors] = useState<Record<string, string>>({});
  const [rotationAngle, setRotationAngle] = useState(28);
  const [tiltAngle, setTiltAngle] = useState(18); // Vertical camera tilt angle in degrees (4° to 42°)
  const [autoRotate, setAutoRotate] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [alertMsg, setAlertMsg] = useState("");
  const [successToast, setSuccessToast] = useState("");

  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startAngleRef = useRef(0);
  const startTiltRef = useRef(18);

  const refreshState = () => {
    setProfile(getPlayerProfile());
    setOwnedVehicles(getOwnedVehicles());
    setEquippedId(getEquippedVehicleId());
    setCustomColors(getCustomVehicleColors());
  };

  useEffect(() => {
    refreshState();
    setSelectedVehicleId(getEquippedVehicleId());
  }, []);

  // 360 turntable auto-rotation timer
  useEffect(() => {
    if (!autoRotate) return;
    const interval = setInterval(() => {
      setRotationAngle((prev) => (prev + 0.75) % 360);
    }, 28);
    return () => clearInterval(interval);
  }, [autoRotate]);

  // Pointer drag controls for smooth 360 rotation & vertical tilt angle
  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    setIsDragging(true);
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    startAngleRef.current = rotationAngle;
    startTiltRef.current = tiltAngle;
    setAutoRotate(false);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - startXRef.current;
    const deltaY = e.clientY - startYRef.current;
    // Horizontal spin
    setRotationAngle((startAngleRef.current + deltaX * 0.9 + 3600) % 360);
    // Vertical camera pitch (dragging down increases tilt, dragging up flattens it)
    const nextTilt = Math.min(42, Math.max(4, startTiltRef.current + deltaY * 0.35));
    setTiltAngle(nextTilt);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  const selectedVehicle =
    GARAGE_VEHICLES.find((v) => v.id === selectedVehicleId) || GARAGE_VEHICLES[0];
  const isOwned = ownedVehicles.includes(selectedVehicle.id);
  const isEquipped = equippedId === selectedVehicle.id;
  const activeColor = customColors[selectedVehicle.id] || selectedVehicle.primaryColor;

  const handleBuy = (vehicle: GarageVehicle) => {
    setAlertMsg("");
    const res = buyVehicle(vehicle.id);
    if (!res.success) {
      setAlertMsg(res.error || "تعذّر الشراء!");
      return;
    }
    refreshState();
    setSuccessToast(`مبروك! اشتريت ${vehicle.name} بنجاح ومجهزة للسباق! 🚀`);
    playVehicleHorn(true, vehicle.id);
    setTimeout(() => setSuccessToast(""), 3500);
  };

  const handleEquip = (vehicleId: string) => {
    setEquippedVehicleId(vehicleId);
    setEquippedId(vehicleId);
    playVehicleHorn(true, vehicleId);
    setSuccessToast("تم تجهيز المركبة للمباريات! 🏁");
    setTimeout(() => setSuccessToast(""), 2500);
  };

  const handleColorPick = (colorHex: string) => {
    setCustomVehicleColor(selectedVehicle.id, colorHex);
    setCustomColors((prev) => ({ ...prev, [selectedVehicle.id]: colorHex }));
    onSound("tap");
  };

  const handleTestHorn = () => {
    playVehicleHorn(true, selectedVehicle.id);
  };

  return (
    <section className="garage-page wrap">
      {/* Header */}
      <header className="garage-header">
        <div className="garage-title-group">
          <span className="brand-mark">
            <BusFront />
          </span>
          <div>
            <h1>جراج الأتوبيسات والورشة 🚐🔧</h1>
            <p>خصّص مركبتك، اشترِ بالنقاط، وعاينها بزاوية 360 درجة حقيقية بصوت كلاكس 3D خاص!</p>
          </div>
        </div>

        <div className="garage-header-actions">
          <div className="garage-points-pill" title="نقاطك المجمعة من كل المباريات">
            <Sparkles size={16} />
            <span>رصيدك:</span>
            <strong>
              <AnimatedCounter value={profile.totalScore} /> ⭐
            </strong>
          </div>
          <button className="btn btn-light btn-quiet" onClick={onExit}>
            <ArrowRight /> الرئيسية
          </button>
        </div>
      </header>

      {/* Main Showcase Layout */}
      <div className="garage-main-grid">
        {/* Left / Top: 360 Showroom Stage */}
        <section className="garage-showroom-card">
          <div className="showroom-spotlight-top" />
          <div className="showroom-ambient-glow" style={{ background: `radial-gradient(circle, ${activeColor}22 0%, transparent 65%)` }} />

          <div className="showroom-header-row">
            <div className="showroom-badge-pill">
              <span className="showroom-tag">{selectedVehicle.category}</span>
              <span className="showroom-name">{selectedVehicle.name}</span>
            </div>
            <div className="showroom-angle-pill">
              <span>{Math.round(rotationAngle % 360)}° دوران · {Math.round(tiltAngle)}° ميل</span>
            </div>
          </div>

          {/* Interactive 3D Turntable Scene Viewport */}
          <div
            className={`showroom-scene-viewport ${isDragging ? "dragging" : ""}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            title="اسحب في أي اتجاه (أفقياً للدوران 360° · رأسياً للميل الرأسي للكاميرا)"
          >
            {/* 3D Turntable Assembly */}
            <div
              className="showroom-pedestal-assembly"
              style={{
                transform: `rotateX(${tiltAngle}deg) rotateY(${rotationAngle}deg)`,
              }}
            >
              {/* Turntable Base Platform with 3D Depth & Glowing Bevel Ring */}
              <div
                className="pedestal-cylinder-base"
                style={{
                  boxShadow: `0 0 35px ${activeColor}44, inset 0 0 25px rgba(0,0,0,0.8)`,
                  borderColor: activeColor,
                }}
              >
                {/* Mechanical Grip Notches */}
                <div className="pedestal-perimeter-ticks" />
                {/* Metallic Circular Radial Grid Plate */}
                <div className="pedestal-metal-plate" />
                {/* Center Medallion */}
                <div className="pedestal-center-medallion">
                  <span>ATOBEES COMPLETE</span>
                </div>
              </div>

              {/* Vehicle 3D Representation Anchor */}
              <div className="pedestal-model-mount">
                {/* Dynamic Ground Shadow */}
                <div className="model-ground-shadow" />

                {/* ═════════ 1. CLASSIC BUS (أتوبيس النصر الكلاسيكي) ═════════ */}
                {selectedVehicle.id === "classic_bus" && (
                  <div
                    className="v-model bus-classic"
                    style={{
                      background: `linear-gradient(180deg, ${activeColor} 0%, color-mix(in srgb, ${activeColor} 70%, #022c22) 100%)`,
                    }}
                  >
                    {/* Roof Sign Roll & Beacons */}
                    <div className="bus-roof-plate" style={{ background: selectedVehicle.accentColor }}>
                      <span className="roof-beacon-dot left" />
                      <span className="roof-plate-text">{selectedVehicle.roofSign}</span>
                      <span className="roof-beacon-dot right" />
                    </div>

                    {/* Window Rows */}
                    <div className="bus-glass-deck">
                      <div className="glass-pane driver-pane">
                        <div className="glass-reflection-streak" />
                        <div className="model-steering-wheel" />
                      </div>
                      <div className="glass-pane"><div className="glass-reflection-streak" /></div>
                      <div className="glass-pane"><div className="glass-reflection-streak" /></div>
                      <div className="glass-pane rear-pane"><div className="glass-reflection-streak" /></div>
                    </div>

                    {/* Exterior Decals & Stripes */}
                    <div className="bus-decal-band white" />
                    <div className="bus-decal-band gold" style={{ background: selectedVehicle.accentColor }} />

                    {/* Front Radiator Grill & Bumper */}
                    <div className="bus-chrome-grill">
                      <span /><span /><span />
                    </div>

                    {/* Headlights & Tail Lights */}
                    <div className="bus-front-optic-light" />
                    <div className="bus-rear-optic-light" />
                    <div className="bus-front-projector-beam" />

                    {/* Wheels */}
                    <div className="bus-undercarriage-wheels">
                      <div className="wheel-assembly front"><div className="rim-hub"><div className="rim-spoke" /></div></div>
                      <div className="wheel-assembly rear"><div className="rim-hub"><div className="rim-spoke" /></div></div>
                    </div>
                  </div>
                )}

                {/* ═════════ 2. CAIRO MICROBUS (ميكروباص الدائري الطاير) ═════════ */}
                {selectedVehicle.id === "cairo_microbus" && (
                  <div
                    className="v-model microbus-cairo"
                    style={{
                      background: `linear-gradient(180deg, ${activeColor} 0%, color-mix(in srgb, ${activeColor} 80%, #0f172a) 100%)`,
                    }}
                  >
                    {/* Toyota HiAce Sloped Roof Rack */}
                    <div className="microbus-roof-rack">
                      <div className="luggage-bars" />
                      <div className="microbus-dest-sign" style={{ color: selectedVehicle.accentColor }}>
                        {selectedVehicle.roofSign}
                      </div>
                    </div>

                    {/* Windshield & Windows */}
                    <div className="microbus-window-row">
                      <div className="m-win sloped-front">
                        <div className="glass-reflection-streak" />
                        {/* Eye Talisman Sticker on Glass */}
                        <span className="talisman-sticker" title="عين الحسود فيها عود">👁️</span>
                        <div className="model-steering-wheel" />
                      </div>
                      <div className="m-win sliding-door-win">
                        <div className="glass-reflection-streak" />
                      </div>
                      <div className="m-win rear-m-win">
                        <div className="glass-reflection-streak" />
                      </div>
                    </div>

                    {/* Sliding Door Groove & Handle */}
                    <div className="sliding-door-seam" />
                    <div className="sliding-door-handle" />

                    {/* Side Racing Speed Stripe */}
                    <div className="microbus-racing-stripe" style={{ background: selectedVehicle.accentColor }} />

                    {/* Front HiAce Bumper & LED Lights */}
                    <div className="microbus-front-bumper" />
                    <div className="bus-front-optic-light micro-light" />
                    <div className="bus-rear-optic-light micro-rear" />
                    <div className="bus-front-projector-beam" />

                    {/* Wheels with Sport Chrome Hubcaps */}
                    <div className="bus-undercarriage-wheels micro-wheels">
                      <div className="wheel-assembly front micro"><div className="rim-hub micro"><div className="rim-star" /></div></div>
                      <div className="wheel-assembly rear micro"><div className="rim-hub micro"><div className="rim-star" /></div></div>
                    </div>
                  </div>
                )}

                {/* ═════════ 3. FIRE TOKTOK (التوك توك الشبح الناري) ═════════ */}
                {selectedVehicle.id === "fire_toktok" && (
                  <div
                    className="v-model toktok-fire"
                    style={{
                      background: `linear-gradient(180deg, ${activeColor} 0%, color-mix(in srgb, ${activeColor} 65%, #450a0a) 100%)`,
                    }}
                  >
                    {/* Curved Canopy Cloth Roof with Tassels */}
                    <div className="toktok-canopy-roof" style={{ background: selectedVehicle.accentColor }}>
                      <span className="canopy-title">{selectedVehicle.roofSign}</span>
                      <div className="canopy-fringe" />
                    </div>

                    {/* Radio Antenna with Pennant Flag */}
                    <div className="toktok-antenna">
                      <span className="antenna-flag">🏁</span>
                    </div>

                    {/* Windshield & Open Cabin with Safety Rollbars */}
                    <div className="toktok-cabin-layout">
                      <div className="toktok-front-screen">
                        <div className="glass-reflection-streak" />
                        <div className="toktok-handlebars" />
                      </div>
                      <div className="toktok-open-entry">
                        <div className="rollbar-metal v1" />
                        <div className="rollbar-metal v2" />
                        <div className="toktok-passenger-seat" />
                      </div>
                    </div>

                    {/* Flame Decals */}
                    <div className="toktok-flame-decal">🔥</div>

                    {/* Single Front Wheel on Fork */}
                    <div className="toktok-front-fork">
                      <div className="wheel-assembly toktok-front-wheel"><div className="rim-hub toktok" /></div>
                    </div>

                    {/* Rear Twin Wheels */}
                    <div className="toktok-rear-wheels">
                      <div className="wheel-assembly toktok-rear-wheel"><div className="rim-hub toktok" /></div>
                    </div>

                    {/* Rocket Exhaust Pipe with Glowing Fire Flame */}
                    <div className="toktok-exhaust-rocket">
                      <span className="exhaust-pipe" />
                      <span className="exhaust-fire-pulse">🔥</span>
                    </div>

                    <div className="bus-front-optic-light toktok-center-light" />
                    <div className="bus-front-projector-beam toktok-beam" />
                  </div>
                )}

                {/* ═════════ 4. LONDON RED DOUBLE DECKER (الأتوبيس الأحمر الإنجليزي) ═════════ */}
                {selectedVehicle.id === "london_red" && (
                  <div
                    className="v-model london-double"
                    style={{
                      background: `linear-gradient(180deg, ${activeColor} 0%, color-mix(in srgb, ${activeColor} 70%, #450a0a) 100%)`,
                    }}
                  >
                    {/* Curved Dome Roof with Gold Route Banner */}
                    <div className="london-roof-dome">
                      <span className="london-crest">👑 ROYAL EXPRESS VIP 👑</span>
                    </div>

                    {/* Upper Deck Window Tier */}
                    <div className="london-window-tier upper">
                      <div className="l-win"><div className="glass-reflection-streak" /></div>
                      <div className="l-win"><div className="glass-reflection-streak" /></div>
                      <div className="l-win"><div className="glass-reflection-streak" /></div>
                      <div className="l-win"><div className="glass-reflection-streak" /></div>
                    </div>

                    {/* Inter-Deck Divider Trim */}
                    <div className="london-deck-divider" />

                    {/* Lower Deck Window Tier */}
                    <div className="london-window-tier lower">
                      <div className="l-win driver"><div className="glass-reflection-streak" /><div className="model-steering-wheel" /></div>
                      <div className="l-win"><div className="glass-reflection-streak" /></div>
                      <div className="l-win"><div className="glass-reflection-streak" /></div>
                      <div className="l-win rear-stairs"><div className="stairs-indicator" /></div>
                    </div>

                    <div className="bus-front-optic-light double-front" />
                    <div className="bus-rear-optic-light double-rear" />
                    <div className="bus-front-projector-beam" />

                    {/* Wheels */}
                    <div className="bus-undercarriage-wheels london-wheels">
                      <div className="wheel-assembly front"><div className="rim-hub"><div className="rim-spoke" /></div></div>
                      <div className="wheel-assembly rear"><div className="rim-hub"><div className="rim-spoke" /></div></div>
                    </div>
                  </div>
                )}

                {/* ═════════ 5. CYBERPUNK GOLD 2077 (أتوبيس المستقبل الذهبي) ═════════ */}
                {selectedVehicle.id === "cyber_gold" && (
                  <div
                    className="v-model cyber-hyper"
                    style={{
                      background: `linear-gradient(180deg, ${activeColor} 0%, #0f172a 100%)`,
                      boxShadow: `0 0 25px ${selectedVehicle.accentColor}88`,
                    }}
                  >
                    {/* Elevated Aerofoil Carbon Wing Spoiler */}
                    <div className="cyber-rear-wing">
                      <div className="wing-fin left" />
                      <div className="wing-main-plane" />
                      <div className="wing-fin right" />
                    </div>

                    {/* Panoramic Holographic Cockpit Canopy */}
                    <div className="cyber-cockpit-canopy">
                      <div className="cyber-hud-glow" />
                      <div className="glass-reflection-streak" />
                    </div>

                    {/* Continuous LED Front Lightbar */}
                    <div className="cyber-front-lightbar" />
                    <div className="bus-front-projector-beam cyber-beam" />

                    {/* Neon Side Accents */}
                    <div className="cyber-neon-strip" style={{ background: selectedVehicle.accentColor }} />

                    {/* Underglow Neon Lightstrip */}
                    <div className="cyber-underglow" style={{ boxShadow: `0 10px 24px ${selectedVehicle.accentColor}` }} />

                    {/* Dual Turbine Vector Jet Exhaust */}
                    <div className="cyber-thrusters">
                      <span className="thruster-core" />
                      <span className="thruster-core" />
                    </div>

                    {/* Turbine Aero Wheels */}
                    <div className="bus-undercarriage-wheels cyber-wheels">
                      <div className="wheel-assembly front cyber"><div className="rim-hub cyber-turbine" /></div>
                      <div className="wheel-assembly rear cyber"><div className="rim-hub cyber-turbine" /></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Interactive Hint & Camera Angle Presets */}
          <div className="showroom-drag-hint">
            <Hand size={14} />
            <span>اسحب أفقياً للدوران 360° · ورأسياً لضبط زاوية الكاميرا والميل</span>
          </div>

          {/* Quick Camera Presets */}
          <div className="camera-presets-bar">
            <span className="presets-label"><Eye size={12} /> زاوية الكاميرا:</span>
            <button
              className={`preset-chip ${Math.abs(tiltAngle - 6) < 3 ? "selected" : ""}`}
              onClick={() => {
                setTiltAngle(6);
                onSound("tap");
              }}
              title="زاوية منخفضة قريبة من الطريق"
            >
              🏎️ منخفضة (6°)
            </button>
            <button
              className={`preset-chip ${Math.abs(tiltAngle - 18) < 3 ? "selected" : ""}`}
              onClick={() => {
                setTiltAngle(18);
                onSound("tap");
              }}
              title="زاوية سينمائية كلاسيكية"
            >
              🎬 سينمائية (18°)
            </button>
            <button
              className={`preset-chip ${Math.abs(tiltAngle - 36) < 3 ? "selected" : ""}`}
              onClick={() => {
                setTiltAngle(36);
                onSound("tap");
              }}
              title="زاوية علوية كاشفة"
            >
              📐 علوية (36°)
            </button>
          </div>

          {/* 360 Turntable Controls Bar */}
          <div className="showroom-controls-bar">
            <button
              className="showroom-tool-btn"
              onClick={() => {
                setRotationAngle((prev) => (prev - 45 + 360) % 360);
                onSound("tap");
              }}
              title="تدوير يمين"
            >
              <RotateCcw size={16} /> تدوير يمين
            </button>

            <button
              className="showroom-tool-btn"
              onClick={() => {
                setRotationAngle((prev) => (prev + 45) % 360);
                onSound("tap");
              }}
              title="تدوير شمال"
            >
              تدوير شمال <RotateCw size={16} />
            </button>

            <button
              className={`showroom-tool-btn ${autoRotate ? "active-spin" : ""}`}
              onClick={() => {
                setAutoRotate((prev) => !prev);
                onSound("tap");
              }}
              title="تشغيل أو إيقاف الدوران التلقائي"
            >
              <RotateCw size={16} /> {autoRotate ? "إيقاف الدوران" : "دوران تلقائي 360°"}
            </button>

            <button
              className="showroom-tool-btn horn-test-btn"
              onClick={handleTestHorn}
              title="تجربة صوت الكلاكس المخصص للمركبة بتقنية 3D"
            >
              <Volume2 size={16} /> كلاكس 3D 📢
            </button>
          </div>

          {/* Vehicle Stats Bar */}
          <div className="garage-specs-row">
            <div className="spec-item">
              <span>السرعة والانطلاق</span>
              <div className="spec-bar-bg">
                <div
                  className="spec-bar-fill"
                  style={{ width: `${selectedVehicle.speedRating}%` }}
                />
              </div>
              <small>{selectedVehicle.speedRating}%</small>
            </div>
            <div className="spec-item">
              <span>البهجة والمرح</span>
              <div className="spec-bar-bg">
                <div
                  className="spec-bar-fill fun"
                  style={{ width: `${selectedVehicle.funRating}%` }}
                />
              </div>
              <small>{selectedVehicle.funRating}%</small>
            </div>
          </div>
        </section>

        {/* Right: Vehicle Selection & Customization Workshop */}
        <section className="garage-sidebar-card">
          <div className="sidebar-section-title">
            <h3>اختر المركبة من الأسطول</h3>
            <small>
              مملوكة: {ownedVehicles.length} من {GARAGE_VEHICLES.length}
            </small>
          </div>

          {/* Vehicle Fleet Cards */}
          <div className="garage-fleet-list">
            {GARAGE_VEHICLES.map((vehicle) => {
              const owned = ownedVehicles.includes(vehicle.id);
              const equipped = equippedId === vehicle.id;
              const isSelected = selectedVehicleId === vehicle.id;

              return (
                <div
                  key={vehicle.id}
                  className={`fleet-item-card ${isSelected ? "selected" : ""} ${
                    equipped ? "equipped" : ""
                  }`}
                  onClick={() => {
                    setSelectedVehicleId(vehicle.id);
                    onSound("tap");
                  }}
                >
                  <div
                    className="fleet-item-icon"
                    style={{
                      background: customColors[vehicle.id] || vehicle.primaryColor,
                    }}
                  >
                    <span>{vehicle.icon}</span>
                  </div>

                  <div className="fleet-item-info">
                    <div className="fleet-item-header">
                      <strong>{vehicle.name}</strong>
                      {equipped ? (
                        <span className="status-badge equipped">مُجهز حالياً ✓</span>
                      ) : owned ? (
                        <span className="status-badge owned">مملوك</span>
                      ) : (
                        <span className="status-badge locked">
                          <Lock size={10} /> {vehicle.price} ⭐
                        </span>
                      )}
                    </div>
                    <p className="fleet-item-desc">{vehicle.description}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Button: Equip or Buy */}
          <div className="garage-action-zone">
            {alertMsg && <div className="garage-alert-box">{alertMsg}</div>}
            {successToast && <div className="garage-success-box">{successToast}</div>}

            {isEquipped ? (
              <div className="equipped-notice-bar">
                <Check size={18} /> هذه المركبة مجهزة حالياً لجميع سباقاتك!
              </div>
            ) : isOwned ? (
              <button
                className="btn btn-primary btn-full-width"
                onClick={() => handleEquip(selectedVehicle.id)}
              >
                <Zap size={16} /> تجهيز هذه المركبة للسباق 🏁
              </button>
            ) : (
              <button
                className="btn btn-primary btn-full-width"
                onClick={() => handleBuy(selectedVehicle)}
                disabled={profile.totalScore < selectedVehicle.price}
              >
                شراء بـ {selectedVehicle.price} نقطة ⭐
              </button>
            )}
          </div>

          {/* Custom Paint Palette Workshop */}
          {isOwned && (
            <div className="garage-paint-workshop">
              <div className="workshop-header">
                <Palette size={16} />
                <strong>ورشة الدهان والتعديل:</strong>
                <small>اختر لون الشاسيه المفضل</small>
              </div>

              <div className="paint-swatches-grid">
                {CUSTOM_PAINT_PALETTE.map((color) => {
                  const isCurrent = activeColor === color.hex;
                  return (
                    <button
                      key={color.id}
                      className={`paint-swatch-btn ${isCurrent ? "active-swatch" : ""}`}
                      style={{ backgroundColor: color.hex }}
                      onClick={() => handleColorPick(color.hex)}
                      title={color.name}
                    >
                      {isCurrent && <Check size={14} color={color.hex === "#f1f5f9" ? "#0f172a" : "#ffffff"} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
