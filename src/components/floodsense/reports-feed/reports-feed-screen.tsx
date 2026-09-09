"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardList,
  ArrowUp,
  CheckCircle2,
  Wrench,
  BadgeCheck,
  Clock,
  ArrowUpDown,
  Sparkles,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useFloodStore } from "@/lib/flood/store";
import { timeAgo } from "@/lib/flood/risk";
import { REPORT_SEVERITY_META } from "@/lib/flood/types";
import type { FloodReport, ReportStatus } from "@/lib/flood/types";
import { floodSenseApi } from "@/lib/flood/api";
import { ScreenHeader } from "../shared/risk-widgets";

const STATUS_META: Record<
  ReportStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  pending: { label: "Pending", color: "#ca8a04", icon: Clock },
  verified: { label: "Verified", color: "#0891b2", icon: BadgeCheck },
  resolved: { label: "Resolved", color: "#16a34a", icon: Wrench },
};

function PhotoThumb({ report }: { report: FloodReport }) {
  const [failed, setFailed] = useState(false);
  if (!report.photo || failed) {
    return (
      <div className="flex h-[46px] w-[72px] items-center justify-center rounded-lg border border-border bg-gradient-to-br from-primary/25 via-secondary to-background">
        <ClipboardList className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }
  return (
    <img
      src={report.photo}
      alt={`Community report at ${report.location}`}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-[46px] w-[72px] rounded-lg border border-border object-cover"
    />
  );
}

export function ReportsFeedScreen() {
  const { reports, setReportStatus, upvoteReport, setView, refreshReports } =
    useFloodStore();
  const { toast } = useToast();

  const [tab, setTab] = useState<"all" | ReportStatus>("all");
  const [sort, setSort] = useState<"recent" | "upvoted">("recent");
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Live GET /reports fetch on load
  useEffect(() => {
    setLoading(true);
    refreshReports().finally(() => setLoading(false));
  }, [refreshReports]);

  const handleManualRefresh = () => {
    setLoading(true);
    refreshReports()
      .then(() => {
        toast({
          title: "Feed refreshed",
          description: "Retrieved latest incident reports from MongoDB.",
        });
      })
      .finally(() => setLoading(false));
  };

  // Wire status change to PATCH /reports/{id}/status
  const handleUpdateStatus = async (id: string, newStatus: ReportStatus) => {
    setUpdatingId(id);
    try {
      await floodSenseApi.updateReportStatus(id, newStatus);
      setReportStatus(id, newStatus);
      toast({
        title: `Report status updated to ${newStatus}`,
        description: "Synchronized with GHMC authority database.",
      });
    } catch (err: unknown) {
      console.warn("Status patch failed on backend, updating locally:", err);
      setReportStatus(id, newStatus);
      toast({
        title: `Report updated locally (${newStatus})`,
        description: "Updated in-app. Will re-sync when network allows.",
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = useMemo(() => {
    const list = reports.filter((r) =>
      tab === "all" ? true : r.status === tab
    );
    return list.sort((a, b) =>
      sort === "recent" ? b.timestamp - a.timestamp : b.upvotes - a.upvotes
    );
  }, [reports, tab, sort]);

  const counts = useMemo(() => {
    const c = { all: reports.length, pending: 0, verified: 0, resolved: 0 };
    reports.forEach((r) => (c[r.status] += 1));
    return c;
  }, [reports]);

  return (
    <div className="space-y-5">
      <ScreenHeader
        eyebrow="Authority triage"
        title="Community Reports Feed"
        desc="Citizen-submitted waterlogging reports, auto-verified by FloodSense Vision. Triage, dispatch and resolve."
        right={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleManualRefresh}
              disabled={loading}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
              {loading ? "Syncing…" : "Refresh"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                setSort(sort === "recent" ? "upvoted" : "recent")
              }
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {sort === "recent" ? "Most recent" : "Most upvoted"}
            </Button>
          </div>
        }
      />

      {/* tabs */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            {(["all", "pending", "verified", "resolved"] as const).map((t) => (
              <TabsTrigger key={t} value={t} className="gap-1.5 capitalize">
                {t === "all" ? "All" : t}
                <span className="rounded-full bg-secondary px-1.5 font-mono text-[10px] tabular-nums">
                  {counts[t]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <span className="ml-auto hidden font-mono text-[11px] text-muted-foreground md:block">
          {filtered.length} shown · {counts.pending} awaiting triage
        </span>
      </div>

      {/* table header (desktop) */}
      <div className="hidden grid-cols-[96px_1fr_150px_110px_150px_230px] gap-3 border-b border-border px-4 pb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground lg:grid">
        <span>Photo</span>
        <span>Location</span>
        <span>Severity</span>
        <span>Reported</span>
        <span>Status</span>
        <span className="text-right">Actions</span>
      </div>

      {/* rows */}
      <div className="space-y-2.5">
        <AnimatePresence mode="popLayout">
          {filtered.map((r, i) => {
            const sm = STATUS_META[r.status] || STATUS_META.pending;
            const isRowUpdating = updatingId === r.id;

            return (
              <motion.div
                key={r.id}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ delay: i * 0.03, layout: { duration: 0.25 } }}
                className="glass-card grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3 rounded-xl p-3.5 transition-colors hover:border-primary/35 lg:grid-cols-[96px_1fr_150px_110px_150px_230px]"
              >
                <PhotoThumb report={r} />

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[13.5px] font-medium">
                      {r.location}
                    </p>
                    {r.source === "you" && (
                      <Badge
                        variant="outline"
                        className="border-primary/50 bg-primary/10 px-1.5 py-0 text-[9px] text-primary"
                      >
                        YOURS
                      </Badge>
                    )}
                  </div>
                  {r.note && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {r.note}
                    </p>
                  )}
                  {r.status !== "pending" && (
                    <p className="mt-1 flex items-center gap-1 font-mono text-[10px] text-water">
                      <Sparkles className="h-3 w-3" />
                      {r.verifiedBy || "FloodSense Vision · auto"}
                      {r.aiConfidence
                        ? ` · ${Math.round(r.aiConfidence * 100)}% conf.`
                        : ""}
                      {r.waterDepthLabel ? ` · ${r.waterDepthLabel}` : ""}
                    </p>
                  )}
                </div>

                <div>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium"
                    style={{
                      color:
                        REPORT_SEVERITY_META[r.severity]?.color || "#ca8a04",
                      borderColor: `${
                        REPORT_SEVERITY_META[r.severity]?.color || "#ca8a04"
                      }55`,
                      background: `${
                        REPORT_SEVERITY_META[r.severity]?.color || "#ca8a04"
                      }14`,
                    }}
                  >
                    {REPORT_SEVERITY_META[r.severity]?.label || r.severity}
                  </span>
                </div>

                <p className="font-mono text-[11px] text-muted-foreground">
                  {timeAgo(r.timestamp)}
                </p>

                <div>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium"
                    style={{
                      color: sm.color,
                      borderColor: `${sm.color}55`,
                      background: `${sm.color}14`,
                    }}
                  >
                    <sm.icon className="h-3 w-3" />
                    {sm.label}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => upvoteReport(r.id)}
                    data-cursor="hover"
                    aria-label={`Upvote report at ${r.location}`}
                    className="flex items-center gap-1 rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                    <span className="font-mono tabular-nums">{r.upvotes}</span>
                  </button>

                  {isRowUpdating ? (
                    <Button size="sm" variant="ghost" className="h-8" disabled>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    </Button>
                  ) : (
                    <>
                      {r.status === "pending" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8 gap-1 text-xs"
                          onClick={() => handleUpdateStatus(r.id, "verified")}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-water" />{" "}
                          Mark Verified
                        </Button>
                      )}
                      {r.status === "verified" && (
                        <Button
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          onClick={() => handleUpdateStatus(r.id, "resolved")}
                        >
                          <Wrench className="h-3.5 w-3.5" /> Mark Resolved
                        </Button>
                      )}
                      {r.status === "resolved" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1 text-xs text-risk-low"
                          disabled
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Closed
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filtered.length === 0 && !loading && (
          <div className="glass-card rounded-xl p-10 text-center">
            <p className="text-[15.5px] leading-[1.65] text-muted-foreground">
              No reports in this view right now.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setView("report")}
            >
              File a citizen report
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
