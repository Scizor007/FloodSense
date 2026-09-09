"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Radar, Users, Camera, Route, CloudRain, Satellite, ShieldCheck, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFloodStore } from "@/lib/flood/store";
import { project } from "@/lib/flood/geo";
import { HOTSPOTS } from "@/lib/flood/geo";
import { severityFromScore } from "@/lib/flood/risk";
import { RISK_META } from "@/lib/flood/types";
import { Magnetic, CountUp } from "../shared/magnetic";
import { HyderabadMap } from "../map/hyderabad-map";

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

/** Decorative mini-city with pulsing hotspot dots (hero backdrop). */
function HeroBackdrop() {
  const dots = HOTSPOTS.slice(0, 12).map((h) => ({
    ...project(h.lat, h.lng),
    color: RISK_META[severityFromScore(h.baseRisk)].color,
    size: 5 + (h.baseRisk / 100) * 7,
    delay: (h.lat * 40) % 3,
  }));
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* grid + vignette */}
      <div className="panel-grid-bg absolute inset-0 opacity-90" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 60% at 50% 38%, rgba(113,56,204,0.16), transparent 65%)" }} />

      {/* radar sweep */}
      <div
        className="absolute left-1/2 top-[38%] h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: "conic-gradient(from 0deg, rgba(122,74,255,0.26), transparent 22%, transparent 100%)",
          animation: "radar-sweep 7s linear infinite",
          maskImage: "radial-gradient(circle, black 0%, transparent 68%)",
          WebkitMaskImage: "radial-gradient(circle, black 0%, transparent 68%)",
        }}
      />

      {/* rain streaks */}
      {Array.from({ length: 34 }, (_, i) => (
        <span
          key={i}
          className="absolute w-[1.5px]"
          style={{
            left: `${(i * 29.7) % 100}%`,
            top: 0,
            height: `${18 + (i % 5) * 7}px`,
            background: "linear-gradient(180deg, transparent, rgba(64,101,191,0.6))",
            animation: `rain-fall-page ${1.5 + (i % 7) * 0.18}s linear ${(i % 9) * 0.33}s infinite`,
          }}
        />
      ))}

      {/* mini-city dots */}
      <svg viewBox="0 0 1000 780" className="absolute inset-0 h-full w-full opacity-70">
        {dots.map((d, i) => (
          <g key={i} transform={`translate(${(d.x / 1000) * 1000}, ${(d.y / 780) * 780})`}>
            <circle r={d.size} fill={d.color} opacity={0.85} />
            <circle r={d.size} fill="none" stroke={d.color} strokeWidth={1.6} opacity={0.5}
              style={{ animation: `ping-ring 2.6s ease-out ${d.delay}s infinite`, transformBox: "fill-box", transformOrigin: "center" }} />
          </g>
        ))}
      </svg>
    </div>
  );
}

const FEATURES = [
  {
    icon: Radar,
    title: "Predictive risk engine",
    desc: "Fuses IMD radar nowcasts, drain-network graphs and terrain flow to score 25 hotspots 1–3 hours before water arrives.",
    accent: "#7138cc",
  },
  {
    icon: Users,
    title: "Community ground truth",
    desc: "Residents report waterlogging with photos. Vision AI auto-verifies depth and location within seconds.",
    accent: "#0891b2",
  },
  {
    icon: Route,
    title: "Alternate route guidance",
    desc: "Avoid-polygon routing re-plans commutes around flooded corridors and pushes SMS / WhatsApp advisories.",
    accent: "#ca8a04",
  },
  {
    icon: ShieldCheck,
    title: "Authority response desk",
    desc: "GHMC flood cells triage verified reports, dispatch dewatering crews and close the loop with citizens.",
    accent: "#ea580c",
  },
];

const STEPS = [
  {
    icon: Satellite,
    step: "01",
    title: "Sense",
    desc: "Doppler radar cells, rain gauges and nala sensors feed a live city model every 10 minutes.",
  },
  {
    icon: CloudRain,
    step: "02",
    title: "Predict",
    desc: "The engine converts rainfall scenarios into street-level risk scores with a 1–3 hour lead window.",
  },
  {
    icon: Camera,
    step: "03",
    title: "Verify & respond",
    desc: "Community photos confirm predictions. Alerts and alternate routes reach citizens before the jam.",
  },
];

export function LandingScreen() {
  const setView = useFloodStore((s) => s.setView);
  const hotspots = useFloodStore((s) => s.hotspots);
  const peak = [...hotspots].sort((a, b) => b.riskScore - a.riskScore)[0];
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const bgY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const bgOpacity = useTransform(scrollYProgress, [0, 0.85], [1, 0.15]);
  const heroTextY = useTransform(scrollYProgress, [0, 1], [0, -60]);

  return (
    <div className="noise-overlay relative">
      {/* ================= HERO ================= */}
      <section ref={heroRef} className="relative flex min-h-[calc(100vh-64px)] flex-col overflow-hidden">
        <motion.div style={{ y: bgY, opacity: bgOpacity }} className="absolute inset-0">
          <HeroBackdrop />
        </motion.div>

        <motion.div style={{ y: heroTextY }} className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 items-center gap-12 px-6 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div>
            {/* eyebrow — numbered label, reference format */}
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
              className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
              <span>01</span>
              <span className="h-px w-12 bg-muted-foreground/45" />
              <span>Early-warning system</span>
            </motion.div>

            <motion.h1 variants={fadeUp} initial="hidden" animate="show" custom={1}
              className="mt-5 font-display text-[42px] font-extrabold leading-[1.04] tracking-[-0.03em] text-foreground md:text-7xl lg:text-[78px]">
              FloodSense
              <br />
              <span className="text-gradient-ombre">Hyderabad</span>
              <span className="text-[1.12em]">.</span>
            </motion.h1>

            <motion.p variants={fadeUp} initial="hidden" animate="show" custom={2}
              className="mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
              Predicting waterlogged streets before the water arrives.
            </motion.p>

            {/* stat row */}
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3}
              className="mt-8 grid w-full grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-card/80 backdrop-blur">
            {[
              { v: 25, suf: "", label: "monitored hotspots", sub: "Musi, nala & underpass corridors" },
              { v: 3, suf: " hr", label: "prediction window", sub: "1–3 hr lead time on risk alerts" },
              { v: 4800, suf: "+", label: "community reports", sub: "photo-verified since June" },
            ].map((s) => (
              <div key={s.label} className="px-4 py-5 md:px-8">
                <p className="font-display text-3xl font-bold text-foreground md:text-4xl">
                  <CountUp to={s.v} suffix={s.suf} />
                </p>
                <p className="mt-1 text-xs font-medium uppercase tracking-wider text-primary/90">{s.label}</p>
                <p className="mt-0.5 hidden text-[11px] text-muted-foreground md:block">{s.sub}</p>
              </div>
            ))}
          </motion.div>

          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={4}
            className="mt-8 flex flex-col items-start gap-4 sm:flex-row">
            <Magnetic>
              <Button size="lg" className="h-12 gap-2 rounded-xl px-8 text-base shadow-[0_10px_28px_-8px_rgba(113,56,204,0.55)]"
                onClick={() => setView("map")} data-cursor="hover">
                View Live Map
                <ArrowRight className="h-4.5 w-4.5" />
              </Button>
            </Magnetic>
            <Button size="lg" variant="outline" className="h-12 rounded-xl px-6 text-base"
              onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>
              See how it works
            </Button>
          </motion.div>
          </div>

          {/* live map snapshot — fills the right side */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={5}
            className="relative mt-2 lg:mt-0">
            <div className="glass-card group relative cursor-pointer overflow-hidden rounded-3xl transition-shadow duration-300 hover:shadow-[0_24px_60px_-24px_rgba(66,32,130,0.45)]"
              data-cursor="hover" onClick={() => setView("map")}>
              <div className="flex items-center justify-between border-b border-border/70 bg-card/60 px-5 py-3.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">City risk map</span>
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-risk-low" />
                  {hotspots.length} zones monitored
                </span>
              </div>
              <HyderabadMap
                hotspots={hotspots}
                className="h-[300px] sm:h-[360px] lg:h-[430px]"
                onSelect={(id) => id && setView("map")}
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-background/80 via-background/30 to-transparent pb-4 pt-12 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <span className="rounded-full border border-border bg-card px-4 py-1.5 font-mono text-[11px] font-medium text-foreground shadow-lg">
                  Open live map →
                </span>
              </div>
            </div>

            {peak && (
              <motion.div variants={fadeUp} initial="hidden" animate="show" custom={6}
                className="glass-card absolute -bottom-5 -left-4 hidden items-center gap-3 rounded-2xl px-4 py-3 md:flex">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-risk-severe" style={{ boxShadow: "0 0 10px rgba(220,38,38,0.55)" }} />
                <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">peak right now</span>
                <span className="font-display text-sm font-bold text-foreground">{peak.name.split(",")[0]} · {peak.riskScore}%</span>
              </motion.div>
            )}
          </motion.div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}
          className="relative z-10 flex justify-center pb-6 text-muted-foreground">
          <ChevronDown className="h-5 w-5 animate-bounce" />
        </motion.div>
      </section>

      {/* ================= FEATURES ================= */}
      <section className="relative mx-auto max-w-6xl px-6 py-20">
        <motion.p variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }}
          className="font-mono text-xs uppercase tracking-[0.25em] text-primary/90">
          The system
        </motion.p>
        <motion.h2 variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} custom={1}
          className="font-display mt-2 max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl">
          One model of the city&apos;s water. Four ways to act on it.
        </motion.h2>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} custom={i}
              whileHover={{ y: -6, transition: { duration: 0.25 } }}
              className="glass-card group relative overflow-hidden rounded-2xl p-5">
              <div className="absolute right-0 top-0 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-20"
                style={{ background: f.accent }} />
              <div className="mb-4 inline-flex rounded-xl border border-border bg-secondary/80 p-2.5"
                style={{ boxShadow: `inset 0 0 0 1px ${f.accent}22` }}>
                <f.icon className="h-5 w-5" style={{ color: f.accent }} />
              </div>
              <h3 className="font-display text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section id="how-it-works" className="relative border-t border-border/60 bg-white/45">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <motion.p variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }}
            className="font-mono text-xs uppercase tracking-[0.25em] text-primary/90">Pipeline</motion.p>
          <motion.h2 variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} custom={1}
            className="font-display mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Sense → Predict → Protect</motion.h2>

          <div className="relative mt-12 grid gap-6 md:grid-cols-3">
            <div className="absolute left-[16%] right-[16%] top-10 hidden h-px bg-gradient-to-r from-primary/10 via-primary/60 to-primary/10 md:block" />
            {STEPS.map((s, i) => (
              <motion.div key={s.step} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} custom={i}
                className="relative">
                <div className="mb-4 flex items-center gap-3">
                  <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-card shadow-[0_10px_24px_-10px_rgba(113,56,204,0.45)]">
                    <s.icon className="h-6 w-6 text-primary" />
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{s.step}</span>
                </div>
                <h3 className="font-display text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </motion.div>
            ))}
          </div>

          <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
            className="mt-14 flex flex-col items-center gap-5 rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/15 to-transparent p-8 text-center">
            <p className="font-display text-xl font-semibold">The next spell shouldn&apos;t surprise anyone.</p>
            <p className="max-w-xl text-sm text-muted-foreground">
              Explore the live city model — simulate a cloudburst, watch hotspots escalate, and route around them.
            </p>
            <Magnetic>
              <Button size="lg" className="h-12 gap-2 rounded-xl px-8 text-base shadow-[0_10px_28px_-8px_rgba(113,56,204,0.55)]"
                onClick={() => setView("map")} data-cursor="hover">
                View Live Map <ArrowRight className="h-4 w-4" />
              </Button>
            </Magnetic>
          </motion.div>
        </div>
      </section>

      {/* ================= FOOTER STRIP ================= */}
      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 text-xs text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">FloodSense</span> · urban waterlogging early-warning ·
            Hyderabad, India
          </p>
          <p className="font-mono">© 2025</p>
        </div>
      </footer>
    </div>
  );
}
