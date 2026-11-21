"use client";

import { motion } from "framer-motion";
import { useEffect } from "react";

type BusAnimationProps = {
  playerName?: string;
  onComplete?: () => void;
};

export default function BusAnimation({ playerName, onComplete }: BusAnimationProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete?.();
    }, 2400);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="bus-screen-overlay" aria-hidden="true">
      {/* Soundwave / Speed lines in background */}
      <motion.div
        className="bus-speed-lines"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.8, 0.8, 0] }}
        transition={{ duration: 2.2, times: [0, 0.2, 0.8, 1] }}
      />

      {/* Main Bus Container moving across the screen from Right to Left */}
      <motion.div
        className="bus-mover"
        initial={{ x: "115vw" }}
        animate={{ x: "-115vw" }}
        transition={{
          duration: 2.2,
          ease: [0.25, 0.1, 0.25, 1]
        }}
      >
        {/* Floating Comic Banner above the Bus */}
        <motion.div
          className="bus-callout-banner"
          initial={{ scale: 0.8, y: 10 }}
          animate={{ scale: [0.9, 1.08, 0.95], y: [0, -6, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <span className="bus-callout-title">🚌💨 أتوبيس كومبليت!</span>
          {playerName && <span className="bus-callout-player">{playerName} قفل الجولة!</span>}
        </motion.div>

        {/* The Bus Vehicle Illustration */}
        <div className="bus-vehicle">
          {/* Headlights Light Beam */}
          <div className="bus-headlight-beam" />

          {/* Bus Body */}
          <div className="bus-body-shell">
            {/* Top Destination Sign */}
            <div className="bus-destination-sign">
              <span>المحطة الأخيرة</span>
            </div>

            {/* Bus Windows & Passengers */}
            <div className="bus-windows-row">
              <div className="bus-window driver-window">
                <span className="bus-passenger">🦁</span>
              </div>
              <div className="bus-window">
                <span className="bus-passenger">🦊</span>
              </div>
              <div className="bus-window">
                <span className="bus-passenger">🐼</span>
              </div>
              <div className="bus-window">
                <span className="bus-passenger">🐧</span>
              </div>
            </div>

            {/* Bus Side Stripes */}
            <div className="bus-stripe stripe-white" />
            <div className="bus-stripe stripe-gold" />

            {/* Headlights & Taillights */}
            <div className="bus-front-light" />
            <div className="bus-tail-light" />
          </div>

          {/* Bus Wheels */}
          <div className="bus-wheels-wrapper">
            <motion.div
              className="bus-wheel wheel-front"
              animate={{ rotate: -720 }}
              transition={{ duration: 2.2, ease: "linear" }}
            >
              <div className="wheel-rim" />
            </motion.div>
            <motion.div
              className="bus-wheel wheel-back"
              animate={{ rotate: -720 }}
              transition={{ duration: 2.2, ease: "linear" }}
            >
              <div className="wheel-rim" />
            </motion.div>
          </div>

          {/* Smoke / Dust Puffs behind the Bus */}
          <motion.div
            className="bus-smoke-trail"
            animate={{ opacity: [0.4, 0.9, 0.4], scale: [0.9, 1.2, 0.9] }}
            transition={{ duration: 0.4, repeat: Infinity }}
          >
            <span className="smoke-puff p1">💨</span>
            <span className="smoke-puff p2">💨</span>
          </motion.div>
        </div>

        {/* Asphalt road line under the moving bus */}
        <div className="bus-road-line" />
      </motion.div>
    </div>
  );
}
