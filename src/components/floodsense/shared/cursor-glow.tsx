"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
/**
 * Layered cursor: soft violet aura (slow), precision ring (fast).
 * Ring expands over interactive elements marked with [data-cursor].
 */
export function CursorGlow() {
  // client-only component (rendered post-mount), so lazy init is safe
  const [enabled] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches
  );
  const [variant, setVariant] = useState<"default" | "hover" | "hotspot">("default");
  const [visible, setVisible] = useState(false);

  const mx = useMotionValue(-200);
  const my = useMotionValue(-200);
  const auraX = useSpring(mx, { stiffness: 40, damping: 18, mass: 0.6 });
  const auraY = useSpring(my, { stiffness: 40, damping: 18, mass: 0.6 });
  const ringX = useSpring(mx, { stiffness: 380, damping: 32 });
  const ringY = useSpring(my, { stiffness: 380, damping: 32 });

  useEffect(() => {
    if (!enabled) return;

    const move = (e: MouseEvent) => {
      mx.set(e.clientX);
      my.set(e.clientY);
      setVisible(true);
      const target = (e.target as HTMLElement)?.closest?.("[data-cursor]");
      if (target) {
        setVariant(target.getAttribute("data-cursor") === "hotspot" ? "hotspot" : "hover");
      } else {
        setVariant("default");
      }
    };
    const leave = () => setVisible(false);

    window.addEventListener("mousemove", move, { passive: true });
    document.documentElement.addEventListener("mouseleave", leave);
    return () => {
      window.removeEventListener("mousemove", move);
      document.documentElement.removeEventListener("mouseleave", leave);
    };
  }, [mx, my, enabled]);

  if (!enabled) return null;

  const ringSize = variant === "default" ? 26 : variant === "hover" ? 42 : 54;
  const ringColor = variant === "hotspot" ? "#22d3ee" : "#9d6bff";

  return (
    <div className="cursor-glow-layer" aria-hidden>
      {/* soft aura */}
      <motion.div
        className="pointer-events-none fixed h-[340px] w-[340px] rounded-full"
        style={{
          x: auraX,
          y: auraY,
          translateX: "-50%",
          translateY: "-50%",
          background:
            "radial-gradient(circle, rgba(113,56,204,0.14) 0%, rgba(34,211,238,0.05) 38%, transparent 65%)",
          opacity: visible ? 1 : 0,
        }}
      />
      {/* precision ring */}
      <motion.div
        className="pointer-events-none fixed rounded-full"
        style={{
          x: ringX,
          y: ringY,
          translateX: "-50%",
          translateY: "-50%",
          border: `1.5px solid ${ringColor}`,
          boxShadow: `0 0 18px ${ringColor}55, inset 0 0 10px ${ringColor}22`,
        }}
        animate={{
          width: ringSize,
          height: ringSize,
          opacity: visible ? (variant === "default" ? 0.55 : 0.95) : 0,
        }}
        transition={{ type: "spring", stiffness: 320, damping: 24 }}
      />
      {variant === "hotspot" && (
        <motion.div
          className="pointer-events-none fixed font-mono text-[9px] uppercase tracking-[0.2em]"
          style={{
            x: ringX,
            y: ringY,
            translateX: "-50%",
            translateY: "38px",
            color: "#22d3ee",
          }}
          animate={{ opacity: visible ? 1 : 0 }}
        >
          view hotspot
        </motion.div>
      )}
    </div>
  );
}
