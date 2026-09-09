"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, MapPin, ChevronDown, Upload, CheckCircle2, Sparkles,
  ArrowRight, RefreshCw, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useFloodStore, uid } from "@/lib/flood/store";
import { REPORT_SEVERITY_META } from "@/lib/flood/types";
import type { ReportSeverity } from "@/lib/flood/types";
import { ScreenHeader } from "../shared/risk-widgets";

type Phase = "form" | "submitting" | "verifying" | "verified";

const GEO_SUGGESTIONS = [
  "Tolichowki Flyover underpass, Shaikpet",
  "Moosarambagh Bridge, NH-65 · Amberpet",
  "Malakpet Subway",
  "LB Nagar Circle",
  "Alwal nala crossing, Bollarum Rd",
  "Attapur Main Rd, Rajendra Nagar",
  "Uppal IDL junction",
  "Kothi Bank Street",
];

export function ReportScreen() {
  const { addReport, setView } = useFloodStore();
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>("form");
  const [photo, setPhoto] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [location, setLocation] = useState(GEO_SUGGESTIONS[0]);
  const [customLocation, setCustomLocation] = useState(false);
  const [severity, setSeverity] = useState<ReportSeverity>("knee");
  const [note, setNote] = useState("");
  const [verifyProgress, setVerifyProgress] = useState(0);
  const [aiResult, setAiResult] = useState<{ confidence: number; depth: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reportIdRef = useRef<string | null>(null);

  const readFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Unsupported file", description: "Please attach a photo (JPG / PNG / WEBP)." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
  }, [toast]);

  const handleSubmit = () => {
    if (phase !== "form") return;
    setPhase("submitting");

    const id = uid("rep");
    reportIdRef.current = id;

    setTimeout(() => setPhase("verifying"), 900);

    // simulated Gemini Vision verification
    setTimeout(() => {
      const confidence = 0.78 + Math.random() * 0.19;
      const depth = REPORT_SEVERITY_META[severity].label === "Impassable" ? "≈ 70+ cm"
        : severity === "knee" ? "≈ 45–55 cm" : "≈ 15–25 cm";
      setAiResult({ confidence, depth });
      setVerifyProgress(100);

      setTimeout(() => {
        setPhase("verified");
        addReport({
          id,
          location: customLocation ? location || "Unnamed location, Hyderabad" : location,
          lat: 17.397, lng: 78.4075,
          severity,
          note: note || undefined,
          photo: photo ?? undefined,
          timestamp: Date.now(),
          status: "verified",
          upvotes: 1,
          source: "you",
          aiConfidence: Math.round(confidence * 100) / 100,
          waterDepthLabel: depth,
          verifiedBy: "FloodSense Vision · auto",
        });
        toast({
          title: "Report verified & live",
          description: "Dispatched to the GHMC authority feed and your neighbours within 5 km.",
        });
      }, 600);
    }, 2600);
  };

  const reset = () => {
    setPhase("form");
    setPhoto(null);
    setNote("");
    setSeverity("knee");
    setCustomLocation(false);
    setLocation(GEO_SUGGESTIONS[0]);
    setVerifyProgress(0);
    setAiResult(null);
  };

  return (
    <div className="space-y-5">
      <ScreenHeader
        eyebrow="Community reporting · 30 seconds"
        title="Report Waterlogging"
        desc="A photo and a tap. FloodSense Vision estimates water depth and pins your report for neighbours and GHMC."
      />

      <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[1.15fr_1fr]">
        {/* ============ left: form ============ */}
        <div className="glass-card rounded-xl p-5">
          <AnimatePresence mode="wait">
            {phase === "form" || phase === "submitting" ? (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -12 }} className="space-y-5">
                {/* photo dropzone */}
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <Camera className="h-3.5 w-3.5" /> Photo evidence
                  </p>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) readFile(f); }}
                    className={`relative flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-all ${
                      dragOver ? "border-primary bg-primary/10 scale-[1.01]" : "border-border bg-secondary/30 hover:border-primary/50"
                    }`}
                    data-cursor="hover"
                    aria-label="Upload photo"
                  >
                    {photo ? (
                      <div className="relative w-full">
                        <img src={photo} alt="Waterlogging report preview" className="h-44 w-full rounded-lg object-cover" />
                        <span className="absolute right-2 top-2 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-medium backdrop-blur">
                          tap to replace
                        </span>
                      </div>
                    ) : (
                      <>
                        <span className="rounded-full border border-border bg-card p-3">
                          <Upload className="h-5 w-5 text-primary" />
                        </span>
                        <p className="text-sm font-medium">Drag & drop a photo, or tap to upload</p>
                        <p className="text-xs text-muted-foreground">JPG / PNG · geotag & depth estimated automatically</p>
                      </>
                    )}
                  </button>
                  <input
                    ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }}
                  />
                </div>

                {/* location */}
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" /> Location
                  </p>
                  {customLocation ? (
                    <input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Where is the waterlogging?"
                      className="w-full rounded-lg border border-input bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-primary"
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCustomLocation(true)}
                      className="flex w-full items-center gap-2 rounded-lg border border-water/30 bg-water/5 px-3 py-2.5 text-left text-sm"
                      data-cursor="hover"
                    >
                      <MapPin className="h-4 w-4 shrink-0 text-water" />
                      <span className="flex-1 truncate">
                        <span className="text-muted-foreground">Auto-detected: </span>
                        <span className="font-medium">{location}</span>
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                  {!customLocation && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {GEO_SUGGESTIONS.slice(1, 5).map((g) => (
                        <button key={g} onClick={() => setLocation(g)}
                          className="rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
                          {g.split(",")[0]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* severity */}
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Water depth</p>
                  <Select value={severity} onValueChange={(v) => setSeverity(v as ReportSeverity)}>
                    <SelectTrigger className="w-full" aria-label="Water depth">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(REPORT_SEVERITY_META) as ReportSeverity[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ background: REPORT_SEVERITY_META[s].color }} />
                            {REPORT_SEVERITY_META[s].label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* note */}
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Note <span className="normal-case text-muted-foreground/60">(optional)</span>
                  </p>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. autos turning back, drain overflowing from the nala side…"
                    className="min-h-[80px] resize-none"
                  />
                </div>

                <Button className="w-full gap-2" size="lg" onClick={handleSubmit} disabled={phase === "submitting"} data-cursor="hover">
                  {phase === "submitting" ? (
                    <><RefreshCw className="h-4 w-4 animate-spin" /> Submitting…</>
                  ) : (
                    <>Submit report <ArrowRight className="h-4 w-4" /></>
                  )}
                </Button>
                <p className="text-center text-[10.5px] text-muted-foreground">
                  Verified by FloodSense Vision before it reaches the authority feed.
                </p>
              </motion.div>
            ) : phase === "verifying" ? (
              /* ============ AI verifying state ============ */
              <motion.div key="verifying" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                className="flex min-h-[420px] flex-col items-center justify-center text-center">
                <div className="relative mb-6">
                  <div className="absolute inset-0 rounded-full bg-primary/30 blur-2xl" />
                  <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-primary/50 bg-card">
                    <Sparkles className="h-9 w-9 text-primary" />
                    <div className="absolute left-0 right-0 h-8"
                      style={{ background: "linear-gradient(180deg, transparent, rgba(157,107,255,0.35), transparent)", animation: "scan-line 1.6s ease-in-out infinite" }} />
                  </div>
                </div>
                <h3 className="font-display text-lg font-semibold">Report submitted — AI is verifying your photo…</h3>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  FloodSense Vision (Gemini) is estimating water depth, matching the location and checking for duplicates.
                </p>
                <div className="mt-6 w-64">
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <motion.div className="h-full rounded-full bg-gradient-to-r from-primary to-water"
                      animate={{ width: ["8%", "88%"] }} transition={{ duration: 2.4, ease: "easeInOut" }} />
                  </div>
                  <div className="mt-3 space-y-1.5 text-left font-mono text-[10px] text-muted-foreground">
                    <p>› depth estimation <span className="text-water">running</span></p>
                    <p>› landmark cross-match <span className="text-water">running</span></p>
                    <p>› duplicate check <span className="text-water">queued</span></p>
                  </div>
                </div>
              </motion.div>
            ) : (
              /* ============ verified state ============ */
              <motion.div key="verified" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                className="flex min-h-[420px] flex-col items-center justify-center text-center">
                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
                  className="mb-5 flex h-20 w-20 items-center justify-center rounded-full border-2 border-risk-low/60 bg-risk-low/10"
                >
                  <CheckCircle2 className="h-10 w-10 text-risk-low" />
                </motion.div>
                <h3 className="font-display text-xl font-semibold">
                  Verified <span className="text-risk-low">✓</span>
                </h3>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  Your report is live on the authority feed and visible to neighbours within 5 km.
                </p>

                <div className="mt-6 grid w-full max-w-sm grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border bg-secondary/40 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">AI confidence</p>
                    <p className="font-mono text-lg font-semibold text-water">{aiResult ? `${Math.round(aiResult.confidence * 100)}%` : "—"}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/40 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Est. depth</p>
                    <p className="font-mono text-lg font-semibold" style={{ color: REPORT_SEVERITY_META[severity].color }}>
                      {aiResult?.depth ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-7 flex gap-2.5">
                  <Button className="gap-2" onClick={() => setView("feed")} data-cursor="hover">
                    View in authority feed <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" onClick={reset}>Report another</Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ============ right: guidance ============ */}
        <div className="space-y-4">
          <div className="glass-card rounded-xl p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" /> What happens next
            </p>
            <ol className="space-y-3.5">
              {[
                { t: "AI verification", d: "Photo → water-depth estimate + landmark match (≈ 10 s).", c: "#22d3ee" },
                { t: "Neighbourhood alert", d: "Residents within 5 km get the report on their Around Me feed.", c: "#7138cc" },
                { t: "Authority triage", d: "GHMC flood cell sees it instantly; dewatering crew dispatch.", c: "#eab308" },
                { t: "Loop closed", d: "You get an SMS when the spot is cleared.", c: "#22c55e" },
              ].map((s, i) => (
                <li key={s.t} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold"
                    style={{ background: `${s.c}1a`, color: s.c, border: `1px solid ${s.c}44` }}>
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-[13px] font-medium">{s.t}</p>
                    <p className="text-xs text-muted-foreground">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="glass-card rounded-xl p-4">
            <p className="mb-2 text-sm font-semibold">Stay safe while reporting</p>
            <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              <li>· Never step into moving water to take a photo — 15 cm can sweep you off your feet.</li>
              <li>· Avoid downed poles and cables; assume they are live.</li>
              <li>· Report from a safe distance — the AI fills in the details.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
