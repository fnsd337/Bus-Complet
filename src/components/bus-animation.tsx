"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { GARAGE_VEHICLES, getCustomVehicleColors, getEquippedVehicleId } from "@/lib/profile";

type BusAnimationProps = {
  playerName?: string;
  onComplete?: () => void;
};

export default function BusAnimation({ playerName, onComplete }: BusAnimationProps) {
  const [equippedId, setEquippedId] = useState("classic_bus");
  const [customColors, setCustomColors] = useState<Record<string, string>>({});

  useEffect(() => {
    const currentId = getEquippedVehicleId();
    setEquippedId(currentId);
    setCustomColors(getCustomVehicleColors());

    // 2.8s total duration: smooth, exciting, and vanishes right as the bus exits
    const timer = setTimeout(() => {
      onComplete?.();
    }, 2800);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const vehicle =
    GARAGE_VEHICLES.find((v) => v.id === equippedId) || GARAGE_VEHICLES[0];
  const activeColor = customColors[vehicle.id] || vehicle.primaryColor;

  return (
    <motion.div
      className="bus-screen-overlay"
      aria-hidden="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: 2.8, times: [0, 0.08, 0.76, 1], ease: "linear" }}
    >
      {/* Background speed lines */}
      <motion.div
        className="bus-speed-lines"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.6, 0.6, 0] }}
        transition={{ duration: 2.8, times: [0, 0.15, 0.75, 1] }}
      />

      {/* Main Bus Container: Enters from right, cruises in the middle with heavy suspension bounce, then exits left */}
      <motion.div
        className="bus-mover"
        initial={{ x: "115vw" }}
        animate={{
          x: ["115vw", "10vw", "-10vw", "-135vw"],
        }}
        transition={{
          duration: 2.8,
          times: [0, 0.32, 0.65, 1],
          ease: [0.25, 0.1, 0.25, 1],
        }}
      >
        {/* Floating Celebratory Comic Banner */}
        <motion.div
          className="bus-callout-banner"
          initial={{ scale: 0.6, y: 15, opacity: 0 }}
          animate={{
            scale: [0.8, 1.08, 0.96, 1.04, 1],
            y: [0, -8, 0, -5, 0],
            opacity: [0, 1, 1, 1, 0.9],
          }}
          transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="bus-banner-horn-icon">📢</div>
          <div className="bus-banner-text-group">
            <span className="bus-callout-title">{vehicle.icon}💨 أتوبيس كومبليت!</span>
            {playerName && <span className="bus-callout-player">{playerName} قفل الجولة!</span>}
          </div>
        </motion.div>

        {/* The Bus Vehicle with Chassis Suspension Rocking */}
        <motion.div
          className="bus-vehicle-container"
          animate={{
            y: [0, -6, 2, -5, 1, -4, 0],
            rotate: [0, -1.8, 1.2, -1.5, 0.8, -1, 0],
          }}
          transition={{
            duration: 1.1,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <div className="bus-vehicle">
            {/* Horn Soundwave Rings emitting from front grill */}
            <motion.div
              className="bus-horn-waves"
              animate={{
                scale: [0.7, 1.4, 2.1],
                opacity: [0.9, 0.5, 0],
              }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                ease: "easeOut",
              }}
            >
              <div className="horn-ring r1" />
              <div className="horn-ring r2" />
            </motion.div>

            {/* Headlights Light Beam pulsing */}
            <motion.div
              className="bus-headlight-beam"
              animate={{ opacity: [0.65, 0.95, 0.65] }}
              transition={{ duration: 0.6, repeat: Infinity }}
            />

            {/* Bus Body */}
            <div
              className="bus-body-shell"
              style={{
                background: `linear-gradient(180deg, ${activeColor} 0%, color-mix(in srgb, ${activeColor} 75%, #0f172a) 100%)`,
              }}
            >
              {/* Top Roof Signal & Warning Beacons */}
              <div className="bus-roof-rack">
                <motion.div
                  className="roof-beacon beacon-left"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 0.4, repeat: Infinity }}
                />
                <div className="bus-destination-sign">
                  <span className="destination-text">{vehicle.roofSign}</span>
                </div>
                <motion.div
                  className="roof-beacon beacon-right"
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 0.4, repeat: Infinity }}
                />
              </div>

              {/* Tinted Clean Modern Windows (No Animals) with Sleek Glass Glare Reflection */}
              <div className="bus-windows-row">
                <div className="bus-window driver-window">
                  <div className="window-glare" />
                  <div className="steering-wheel-silhouette" />
                </div>
                <div className="bus-window">
                  <div className="window-glare" />
                  <div className="window-curtain" />
                </div>
                <div className="bus-window">
                  <div className="window-glare" />
                </div>
                <div className="bus-window">
                  <div className="window-glare" />
                  <div className="window-curtain" />
                </div>
                <div className="bus-window rear-window">
                  <div className="window-glare" />
                </div>
              </div>

              {/* Bus Exterior Decals & Speed Stripes */}
              <div className="bus-stripe stripe-white" />
              <div
                className="bus-stripe stripe-gold"
                style={{ background: vehicle.accentColor }}
              />
              <div className="bus-door-crease" />

              {/* Front Grill & Bumper */}
              <div className="bus-front-grill">
                <span className="grill-line" />
                <span className="grill-line" />
              </div>

              {/* Headlights & Taillights with Glow */}
              <div className="bus-front-light" />
              <div className="bus-tail-light" />
            </div>

            {/* Wheels with Realistic Spinning and Hubcaps */}
            <div className="bus-wheels-wrapper">
              <motion.div
                className="bus-wheel wheel-front"
                animate={{ rotate: -1440 }}
                transition={{ duration: 2.8, ease: "linear" }}
              >
                <div className="wheel-tread" />
                <div className="wheel-rim">
                  <div className="wheel-spoke s1" />
                  <div className="wheel-spoke s2" />
                  <div className="wheel-center-bolt" />
                </div>
              </motion.div>

              <motion.div
                className="bus-wheel wheel-back"
                animate={{ rotate: -1440 }}
                transition={{ duration: 2.8, ease: "linear" }}
              >
                <div className="wheel-tread" />
                <div className="wheel-rim">
                  <div className="wheel-spoke s1" />
                  <div className="wheel-spoke s2" />
                  <div className="wheel-center-bolt" />
                </div>
              </motion.div>
            </div>

            {/* Animated Multi-Puff Exhaust Smoke Trail */}
            <div className="bus-smoke-trail">
              <motion.span
                className="smoke-puff puff-1"
                animate={{
                  x: [0, 24, 48],
                  y: [0, -12, -24],
                  scale: [0.7, 1.2, 1.7],
                  opacity: [0.9, 0.5, 0],
                }}
                transition={{ duration: 0.65, repeat: Infinity, ease: "easeOut" }}
              >
                💨
              </motion.span>
              <motion.span
                className="smoke-puff puff-2"
                animate={{
                  x: [0, 30, 60],
                  y: [0, -6, -18],
                  scale: [0.5, 1.1, 1.6],
                  opacity: [0.8, 0.4, 0],
                }}
                transition={{ duration: 0.65, delay: 0.3, repeat: Infinity, ease: "easeOut" }}
              >
                💨
              </motion.span>
            </div>
          </div>
        </motion.div>

        {/* Animated Asphalt Road Line with Moving Stripes and Dust */}
        <div className="bus-road-container">
          <motion.div
            className="bus-road-line-moving"
            animate={{ backgroundPosition: ["0px 0px", "-240px 0px"] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

