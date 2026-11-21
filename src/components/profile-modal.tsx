"use client";

import { motion } from "framer-motion";
import { Award, Camera, Check, Copy, Flame, Play, Sparkles, Trophy, User, X, Zap } from "lucide-react";
import { useState } from "react";
import PlayerAvatar from "@/components/player-avatar";
import { AVATARS } from "@/lib/game";
import { getPlayerProfile, getPlayerRank, savePlayerProfile, type PlayerProfile } from "@/lib/profile";
import type { SfxCue } from "@/lib/sfx";

type ProfileModalProps = {
  profile: PlayerProfile;
  motionEnabled: boolean;
  sound: boolean;
  onSound: (cue?: SfxCue) => void;
  onClose: () => void;
  onUpdate: (updated: PlayerProfile) => void;
};

export default function ProfileModal({
  profile,
  motionEnabled,
  sound,
  onSound,
  onClose,
  onUpdate
}: ProfileModalProps) {
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"stats" | "edit">("stats");
  const [savedToast, setSavedToast] = useState(false);

  const rank = getPlayerRank(profile.wins, profile.winStreak);
  const hasSavedPhoto = /^https?:\/\//i.test(avatar);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(profile.id);
      setCopied(true);
      onSound("tap");
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // ignore
    }
  };

  const handleSaveName = () => {
    if (!name.trim()) return;
    const updated = savePlayerProfile({ name: name.trim(), avatar });
    onUpdate(updated);
    setSavedToast(true);
    onSound("badge");
    setTimeout(() => setSavedToast(false), 2000);
  };

  const handleSelectAvatar = (chosen: string) => {
    setAvatar(chosen);
    setAvatarFile(null);
    const updated = savePlayerProfile({ avatar: chosen });
    onUpdate(updated);
    onSound("tap");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return;
    const url = URL.createObjectURL(file);
    setAvatar(url);
    setAvatarFile(file);
    const updated = savePlayerProfile({ avatar: url });
    onUpdate(updated);
    onSound("badge");
  };

  return (
    <motion.div
      className="modal-backdrop"
      initial={motionEnabled ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: motionEnabled ? 0.2 : 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.section
        className="modal profile-modal"
        role="dialog"
        aria-modal="true"
        initial={motionEnabled ? { opacity: 0, scale: 0.94, y: 16 } : false}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
      >
        <div className="profile-banner">
          <div className="profile-banner-art" />
          <button className="close-btn profile-close" onClick={onClose} aria-label="إغلاق">
            <X size={17} />
          </button>

          <div className="profile-avatar-wrapper">
            <motion.div
              className="profile-avatar-ring"
              whileHover={motionEnabled ? { scale: 1.05, rotate: 2 } : undefined}
              whileTap={{ scale: 0.96 }}
            >
              <PlayerAvatar value={avatar} className="profile-avatar-large" />
            </motion.div>
            <span className="profile-rank-badge" style={{ borderColor: rank.color }}>
              <span>{rank.badge}</span> {rank.title}
            </span>
          </div>
        </div>

        <div className="profile-header-info">
          <div className="profile-name-row">
            <h2>{profile.name}</h2>
            <button
              className="profile-id-chip"
              onClick={() => void copyId()}
              title="اضغط لنسخ معرّف الحساب"
            >
              <small>ID: {profile.id}</small>
              {copied ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
            </button>
          </div>
          {copied && <div className="profile-toast">تم نسخ الآيدي للحافظة! ✓</div>}
          {savedToast && <div className="profile-toast">تم حفظ التعديلات بنجاح! ✓</div>}
        </div>

        <div className="profile-tabs">
          <button
            className={`profile-tab ${activeTab === "stats" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("stats");
              onSound("tap");
            }}
          >
            <Trophy size={15} /> الإحصائيات والأرقام
          </button>
          <button
            className={`profile-tab ${activeTab === "edit" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("edit");
              onSound("tap");
            }}
          >
            <User size={15} /> تعديل الحساب والصورة
          </button>
        </div>

        {activeTab === "stats" && (
          <motion.div
            className="profile-tab-content"
            initial={motionEnabled ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="profile-stats-grid">
              <motion.div
                className="profile-stat-box stat-streak"
                whileHover={motionEnabled ? { y: -3, scale: 1.02 } : undefined}
              >
                <div className="stat-icon-wrap streak-icon">
                  <Flame className="streak-flame-anim" size={22} />
                </div>
                <div className="stat-text">
                  <small>الـ Streak الحالي</small>
                  <strong>{profile.winStreak} فوز متتالي</strong>
                </div>
              </motion.div>

              <motion.div
                className="profile-stat-box stat-best"
                whileHover={motionEnabled ? { y: -3, scale: 1.02 } : undefined}
              >
                <div className="stat-icon-wrap best-icon">
                  <Zap size={22} />
                </div>
                <div className="stat-text">
                  <small>أعلى Streak قياسي</small>
                  <strong>{profile.bestStreak} فوز</strong>
                </div>
              </motion.div>

              <motion.div
                className="profile-stat-box stat-wins"
                whileHover={motionEnabled ? { y: -3, scale: 1.02 } : undefined}
              >
                <div className="stat-icon-wrap wins-icon">
                  <Trophy size={22} />
                </div>
                <div className="stat-text">
                  <small>إجمالي الفوز</small>
                  <strong>{profile.wins} مباراة</strong>
                </div>
              </motion.div>

              <motion.div
                className="profile-stat-box stat-matches"
                whileHover={motionEnabled ? { y: -3, scale: 1.02 } : undefined}
              >
                <div className="stat-icon-wrap matches-icon">
                  <Play size={20} />
                </div>
                <div className="stat-text">
                  <small>المباريات الملعوبة</small>
                  <strong>{profile.matchesPlayed} جولة</strong>
                </div>
              </motion.div>
            </div>

            <div className="profile-score-banner">
              <div className="score-summary-left">
                <Sparkles size={20} color="var(--forest)" />
                <div>
                  <strong>إجمالي النقاط المجمعة</strong>
                  <small>نقاطك من كل الجولات السابقة</small>
                </div>
              </div>
              <span className="profile-total-points">{profile.totalScore} ⭐</span>
            </div>
          </motion.div>
        )}

        {activeTab === "edit" && (
          <motion.div
            className="profile-tab-content"
            initial={motionEnabled ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="form-group">
              <label className="field-label" htmlFor="edit-name">
                اسم اللاعب
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  id="edit-name"
                  className="text-field"
                  maxLength={24}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="اسمك المستعار..."
                />
                <button
                  className="btn btn-primary btn-quiet"
                  style={{ whiteSpace: "nowrap" }}
                  onClick={handleSaveName}
                  disabled={!name.trim() || name.trim() === profile.name}
                >
                  حفظ الاسم
                </button>
              </div>
            </div>

            <div className="form-group">
              <span className="field-label">اختر شخصيتك أو ارفع صورة</span>
              <label className={`avatar-upload ${avatarFile || hasSavedPhoto ? "active" : ""}`} htmlFor="profile-avatar-upload">
                <Camera size={17} />
                <span>{avatarFile || hasSavedPhoto ? "صورة مخصصة من جهازك" : "رفع صورة من جهازك"}</span>
                {(avatarFile || hasSavedPhoto) && <PlayerAvatar value={avatar} className="avatar-option-preview" />}
              </label>
              <input
                id="profile-avatar-upload"
                className="avatar-file-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileUpload}
              />

              <div className="avatar-picker profile-avatar-grid">
                {AVATARS.map((item) => (
                  <motion.button
                    type="button"
                    key={item}
                    className={`avatar-option ${!avatarFile && avatar === item ? "active" : ""}`}
                    onClick={() => handleSelectAvatar(item)}
                    whileHover={motionEnabled ? { scale: 1.15 } : undefined}
                    whileTap={{ scale: 0.9 }}
                    aria-label={`شخصية ${item}`}
                  >
                    <PlayerAvatar value={item} />
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </motion.section>
    </motion.div>
  );
}
