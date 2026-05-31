import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";

// ============================================================
// Design tokens (reuse Marketview variables)
// ============================================================
const MV = {
  bg: "var(--mv-bg)",
  card: "var(--mv-card-bg)",
  border: "var(--mv-border)",
  borderStrong: "var(--mv-border-strong)",
  strong: "var(--mv-text-strong)",
  mid: "var(--mv-text-mid)",
  weak: "var(--mv-text-weak)",
  vweak: "var(--mv-text-vweak)",
  green: "var(--mv-green)",
  greenBg: "var(--mv-green-bg)",
  red: "var(--mv-red)",
  redBg: "var(--mv-red-bg)",
  amber: "var(--mv-amber)",
  amberBg: "var(--mv-amber-bg)",
  mono: "var(--mv-font-mono)",
};

const POLL_MS = 30_000;

type WriterDef = { script: string; cadence: number; symbol_scoped: boolean };
const TRACKED_WRITERS: WriterDef[] = [
  { script: "ingest_option_chain_local.py", cadence: 5, symbol_scoped: true },
  { script: "compute_gamma_metrics_local.py", cadence: 5, symbol_scoped: true },
  { script: "capture_spot_1m_v2.py", cadence: 1, symbol_scoped: false },
  { script: "build_wcb_snapshot_local.py", cadence: 5, symbol_scoped: true },
  { script: "detect_ict_patterns_runner.py", cadence: 5, symbol_scoped: false },
  { script: "build_market_state_snapshot_local.py", cadence: 5, symbol_scoped: false },
  { script: "build_momentum_features_local.py", cadence: 5, symbol_scoped: false },
  { script: "compute_volatility_metrics_local.py", cadence: 5, symbol_scoped: false },
  { script: "compute_options_flow_local.py", cadence: 5, symbol_scoped: false },
  { script: "ingest_breadth_from_ticks.py", cadence: 5, symbol_scoped: false },
  { script: "merdian_pipeline_alert_daemon", cadence: 1, symbol_scoped: false },
  { script: "build_ict_htf_zones.py", cadence: 1440, symbol_scoped: false },
];

// ============================================================
// Helpers
// ============================================================
function ageMinutes(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  return (nowMs - new Date(iso).getTime()) / 60_000;
}

function fmtAge(min: number | null): string {
  if (min == null || !Number.isFinite(min)) return "—";
  if (min < 1) return `${Math.max(1, Math.round(min * 60))}s`;
  if (min < 60) return `${Math.round(min)}m`;
  const h = min / 60;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${Math.round(h / 24)}d`;
}

function fmtIst(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
  const hh = String(ist.getUTCHours()).padStart(2, "0");
  const mm = String(ist.getUTCMinutes()).padStart(2, "0");
  const ss = String(ist.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss} IST`;
}

function isWithinTradingHours(nowMs: number): boolean {
  const ist = new Date(nowMs + 5.5 * 3600 * 1000);
  const dow = ist.getUTCDay(); // 0 Sun, 6 Sat
  if (dow === 0 || dow === 6) return false;
  const mod = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mod >= 555 && mod <= 930;
}

type RowStatus = "green" | "amber" | "red" | "gray";
function statusFor(ageMin: number | null, cadence: number): RowStatus {
  if (ageMin == null) return "gray";
  if (ageMin <= cadence * 2) return "green";
  if (ageMin <= cadence * 4) return "amber";
  return "red";
}
const STATUS_COLOR: Record<RowStatus, string> = {
  green: MV.green,
  amber: MV.amber,
  red: MV.red,
  gray: MV.vweak,
};

const ERROR_COLOR: Record<string, string> = {
  TOKEN_EXPIRED: MV.red,
  CRASH: "#7f1d1d",
  TIMEOUT: "#f97316",
  DATA_ERROR: MV.amber,
  DEPENDENCY_MISSING: MV.amber,
  SKIPPED_NO_INPUT: "#9ca3af",
  HOLIDAY_GATE: "#6b7280",
  OFF_HOURS: "#6b7280",
};
const ERROR_ORDER = [
  "TOKEN_EXPIRED",
  "CRASH",
  "TIMEOUT",
  "DATA_ERROR",
  "DEPENDENCY_MISSING",
  "SKIPPED_NO_INPUT",
  "HOLIDAY_GATE",
  "OFF_HOURS",
];

// ============================================================
// Queries
// ============================================================
function useLatestTokenProbe() {
  return useQuery({
    queryKey: ["health", "tokenProbeLatest"],
    refetchInterval: POLL_MS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dhan_token_probe_log")
        .select("ts, http_status, endpoint, event, notes")
        .eq("event", "post_write_probe")
        .order("ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });
}

function useTokenFailures24h() {
  return useQuery({
    queryKey: ["health", "tokenFailures24h"],
    refetchInterval: POLL_MS,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { count, error } = await supabase
        .from("dhan_token_probe_log")
        .select("id", { count: "exact", head: true })
        .eq("event", "post_write_probe")
        .neq("http_status", 200)
        .gte("ts", since);
      if (error) return 0;
      return count ?? 0;
    },
  });
}

function useLatestTokenRefresh() {
  return useQuery({
    queryKey: ["health", "tokenRefreshLatest"],
    refetchInterval: POLL_MS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dhan_token_probe_log")
        .select("ts, event, notes")
        .eq("event", "pull_write")
        .order("ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });
}

function useWriterFreshness() {
  return useQueries({
    queries: TRACKED_WRITERS.map((w) => ({
      queryKey: ["health", "writer", w.script],
      refetchInterval: POLL_MS,
      queryFn: async () => {
        const { data, error } = await supabase
          .from("script_execution_log")
          .select("script_name, started_at, finished_at, exit_reason, host")
          .eq("script_name", w.script)
          .eq("exit_reason", "SUCCESS")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) return null;
        return data;
      },
    })),
  });
}

function useErrors24h() {
  return useQuery({
    queryKey: ["health", "errors24h"],
    refetchInterval: POLL_MS,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from("script_execution_log")
        .select("script_name, started_at, exit_reason")
        .gte("started_at", since)
        .neq("exit_reason", "SUCCESS")
        .order("started_at", { ascending: true })
        .limit(5000);
      if (error) return [];
      return data ?? [];
    },
  });
}

// ============================================================
// UI primitives
// ============================================================
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-lg border ${className}`}
      style={{ background: MV.card, borderColor: MV.border }}
    >
      {children}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-3">
      <h2
        className="text-[10px] font-semibold tracking-[0.14em] uppercase"
        style={{ color: MV.weak }}
      >
        {title}
      </h2>
      {subtitle && (
        <span className="text-[10px]" style={{ color: MV.vweak }}>
          {subtitle}
        </span>
      )}
    </div>
  );
}

function StatusBadge({ status, label }: { status: RowStatus | "unknown"; label: string }) {
  const color =
    status === "unknown" ? MV.vweak : STATUS_COLOR[status as RowStatus];
  const bg =
    status === "green"
      ? MV.greenBg
      : status === "red"
        ? MV.redBg
        : status === "amber"
          ? MV.amberBg
          : "transparent";
  return (
    <div
      className="inline-flex items-center rounded px-2 py-1 text-[13px] font-semibold tracking-wide"
      style={{ color, background: bg, border: `1px solid ${color}` }}
    >
      {label}
    </div>
  );
}

function Dot({ status }: { status: RowStatus }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ background: STATUS_COLOR[status] }}
    />
  );
}

// ============================================================
// Page
// ============================================================
export default function Health() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const tokenProbe = useLatestTokenProbe();
  const tokenFailures = useTokenFailures24h();
  const tokenRefresh = useLatestTokenRefresh();
  const writerResults = useWriterFreshness();
  const errors = useErrors24h();

  const tradingHours = isWithinTradingHours(now);

  // ---- Writer fleet roll-up ----
  type FleetRow = {
    script: string;
    cadence: number;
    started_at: string | null;
    ageMin: number | null;
    status: RowStatus;
    host?: string | null;
  };
  const fleetRows: FleetRow[] = useMemo(() => {
    return TRACKED_WRITERS.map((w, i) => {
      const data = writerResults[i]?.data as any;
      const started = data?.started_at ?? null;
      const ageMin = ageMinutes(started, now);
      return {
        script: w.script,
        cadence: w.cadence,
        started_at: started,
        ageMin,
        status: statusFor(ageMin, w.cadence),
        host: data?.host ?? null,
      };
    });
  }, [writerResults, now]);

  // Token refresh synthetic row
  const tokenRow: FleetRow = useMemo(() => {
    const started = tokenRefresh.data?.ts ?? null;
    const ageMin = ageMinutes(started, now);
    return {
      script: "local_token_refresh",
      cadence: 1440,
      started_at: started,
      ageMin,
      status: statusFor(ageMin, 1440),
      host: "local",
    };
  }, [tokenRefresh.data, now]);

  const allFleetRows: FleetRow[] = [...fleetRows, tokenRow];
  const healthyCount = allFleetRows.filter((r) => r.status === "green").length;
  const staleCount = allFleetRows.filter(
    (r) => r.status === "amber" || r.status === "red",
  ).length;

  const writerFleetStatus: RowStatus =
    allFleetRows.some((r) => r.status === "red")
      ? "red"
      : staleCount >= 3
        ? "red"
        : staleCount >= 1
          ? "amber"
          : "green";

  // ---- Token status ----
  const tokenProbeAge = ageMinutes(tokenProbe.data?.ts, now);
  const tokenProbeHttp = (tokenProbe.data as any)?.http_status;
  let tokenStatus: RowStatus | "unknown" = "unknown";
  if (tokenProbe.isLoading) {
    tokenStatus = "unknown";
  } else if (!tokenProbe.data) {
    tokenStatus = "unknown";
  } else if ((tokenFailures.data ?? 0) > 0) {
    tokenStatus = "red";
  } else if (tokenProbeHttp === 200 && tokenProbeAge != null && tokenProbeAge <= 30) {
    tokenStatus = "green";
  } else if (tokenProbeHttp === 200) {
    tokenStatus = "amber";
  } else {
    tokenStatus = "red";
  }

  // ---- Overall ----
  let overall: RowStatus | "unknown";
  if (
    tokenStatus === "unknown" &&
    (writerResults.every((r) => r.isLoading) || allFleetRows.every((r) => r.started_at == null))
  ) {
    overall = "unknown";
  } else if (tokenStatus === "red" || writerFleetStatus === "red") {
    overall = "red";
  } else if (tokenStatus === "amber" || writerFleetStatus === "amber") {
    overall = "amber";
  } else {
    overall = "green";
  }

  const overallLabel =
    overall === "green"
      ? "HEALTHY"
      : overall === "amber"
        ? "DEGRADED"
        : overall === "red"
          ? "CRITICAL"
          : "UNKNOWN";

  // ---- Errors → hourly buckets ----
  const { buckets, reasons, topErrors, totalErrors } = useMemo(() => {
    const rows = (errors.data ?? []) as { started_at: string; script_name: string; exit_reason: string }[];
    const hourMs = 3600 * 1000;
    const nowHour = Math.floor(now / hourMs) * hourMs;
    const start = nowHour - 23 * hourMs;
    const buckets: { hour: number; counts: Record<string, number> }[] = [];
    for (let h = 0; h < 24; h++) {
      buckets.push({ hour: start + h * hourMs, counts: {} });
    }
    const reasonsSet = new Set<string>();
    const pairCounts = new Map<string, { script: string; reason: string; count: number }>();
    for (const r of rows) {
      const t = new Date(r.started_at).getTime();
      const idx = Math.floor((t - start) / hourMs);
      if (idx < 0 || idx >= 24) continue;
      const reason = r.exit_reason || "UNKNOWN";
      buckets[idx].counts[reason] = (buckets[idx].counts[reason] ?? 0) + 1;
      reasonsSet.add(reason);
      const key = `${r.script_name}::${reason}`;
      const existing = pairCounts.get(key);
      if (existing) existing.count += 1;
      else pairCounts.set(key, { script: r.script_name, reason, count: 1 });
    }
    const reasons = ERROR_ORDER.filter((r) => reasonsSet.has(r)).concat(
      Array.from(reasonsSet).filter((r) => !ERROR_ORDER.includes(r)),
    );
    const topErrors = Array.from(pairCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    return { buckets, reasons, topErrors, totalErrors: rows.length };
  }, [errors.data, now]);

  const maxBucket = Math.max(
    1,
    ...buckets.map((b) => Object.values(b.counts).reduce((a, b) => a + b, 0)),
  );

  const isRefreshing =
    tokenProbe.isFetching ||
    tokenFailures.isFetching ||
    tokenRefresh.isFetching ||
    errors.isFetching ||
    writerResults.some((r) => r.isFetching);

  const istClock = (() => {
    const ist = new Date(now + 5.5 * 3600 * 1000);
    const hh = String(ist.getUTCHours()).padStart(2, "0");
    const mm = String(ist.getUTCMinutes()).padStart(2, "0");
    const ss = String(ist.getUTCSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  })();

  return (
    <div className="min-h-screen p-6" style={{ background: MV.bg, color: MV.strong }}>
      {/* Page header */}
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">Health</h1>
          <p className="text-[11px]" style={{ color: MV.weak }}>
            System status · writer freshness · error rate
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px]" style={{ color: MV.weak }}>
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: MV.green }}
          />
          LIVE · {istClock}
          <RefreshCw
            className={`ml-1 h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`}
            style={{ color: MV.weak }}
          />
        </div>
      </div>

      {/* Section 1: SYSTEM STATUS */}
      <SectionHeader title="System Status" />
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* OVERALL */}
        <Card className="p-4">
          <div
            className="mb-2 text-[10px] font-medium tracking-[0.14em]"
            style={{ color: MV.weak }}
          >
            OVERALL
          </div>
          <StatusBadge
            status={overall}
            label={overallLabel}
          />
          <div className="mt-3 text-[11px]" style={{ color: MV.weak }}>
            {overall === "unknown"
              ? "insufficient data"
              : `last refresh ${fmtAge(0)} ago`}
          </div>
        </Card>

        {/* WRITER FLEET */}
        <Card className="p-4">
          <div
            className="mb-2 text-[10px] font-medium tracking-[0.14em]"
            style={{ color: MV.weak }}
          >
            WRITER FLEET
          </div>
          <div
            className="text-[28px] font-semibold leading-none"
            style={{
              color: STATUS_COLOR[writerFleetStatus],
              fontFamily: MV.mono,
            }}
          >
            {healthyCount}
            <span className="text-[18px]" style={{ color: MV.weak }}>
              /{allFleetRows.length}
            </span>
          </div>
          <div className="mt-3 text-[11px]" style={{ color: MV.weak }}>
            {staleCount === 0 ? "all current" : `${staleCount} stale`}
          </div>
        </Card>

        {/* TOKEN STATUS */}
        <Card className="p-4">
          <div
            className="mb-2 text-[10px] font-medium tracking-[0.14em]"
            style={{ color: MV.weak }}
          >
            TOKEN STATUS
          </div>
          <div
            className="text-[28px] font-semibold leading-none"
            style={{
              color:
                tokenStatus === "unknown"
                  ? MV.vweak
                  : STATUS_COLOR[tokenStatus as RowStatus],
              fontFamily: MV.mono,
            }}
          >
            {tokenProbeAge == null ? "—" : fmtAge(tokenProbeAge)}
            <span className="text-[14px]" style={{ color: MV.weak }}>
              {" "}
              ago
            </span>
          </div>
          <div className="mt-3 text-[11px]" style={{ color: MV.weak }}>
            {tokenProbe.data
              ? `last status: ${tokenProbeHttp} ${tokenProbeHttp === 200 ? "✓" : "✗"}`
              : "no probes recorded"}
          </div>
        </Card>
      </div>

      {/* Section 2: WRITER FRESHNESS */}
      <SectionHeader
        title="Writer Freshness — Last Success Per Script"
        subtitle={
          !tradingHours ? "outside trading hours — staleness expected" : undefined
        }
      />
      <Card className="mb-6 overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr
              className="text-left"
              style={{ color: MV.weak, borderBottom: `1px solid ${MV.border}` }}
            >
              <th className="px-3 py-2 font-medium">Script</th>
              <th className="px-3 py-2 font-medium">Last Success</th>
              <th className="px-3 py-2 font-medium">Age</th>
              <th className="px-3 py-2 font-medium">Cadence</th>
              <th className="px-3 py-2 font-medium">Host</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {allFleetRows.map((r, i) => {
              const displayStatus: RowStatus =
                !tradingHours && r.status !== "gray" ? "gray" : r.status;
              return (
                <tr
                  key={r.script}
                  style={{
                    background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                    borderTop: i === 0 ? "none" : `1px solid ${MV.border}`,
                  }}
                >
                  <td
                    className="px-3 py-2"
                    style={{ fontFamily: MV.mono, color: MV.strong }}
                  >
                    {r.script}
                  </td>
                  <td
                    className="px-3 py-2"
                    style={{ fontFamily: MV.mono, color: MV.mid }}
                  >
                    {r.started_at ? fmtIst(r.started_at) : "—"}
                  </td>
                  <td
                    className="px-3 py-2"
                    style={{ fontFamily: MV.mono, color: MV.mid }}
                  >
                    {r.started_at ? fmtAge(r.ageMin) : "never"}
                  </td>
                  <td
                    className="px-3 py-2"
                    style={{ fontFamily: MV.mono, color: MV.weak }}
                  >
                    {r.cadence >= 60 ? `${r.cadence / 60}h` : `${r.cadence}m`}
                  </td>
                  <td className="px-3 py-2" style={{ color: MV.weak }}>
                    {r.host ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Dot status={displayStatus} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div
          className="px-3 py-2 text-[11px]"
          style={{ color: MV.weak, borderTop: `1px solid ${MV.border}` }}
        >
          {healthyCount} healthy / {allFleetRows.length} tracked
        </div>
      </Card>

      {/* Section 3: ERROR RATE 24H */}
      <SectionHeader
        title="Error Rate — Last 24h"
        subtitle="hourly buckets · SUCCESS excluded · color by exit_reason"
      />
      <Card className="p-4">
        {totalErrors === 0 ? (
          <div className="py-8 text-center text-[12px]" style={{ color: MV.weak }}>
            no non-success exits in last 24h
          </div>
        ) : (
          <>
            {/* Chart */}
            <div className="flex h-44 items-end gap-1">
              {buckets.map((b, i) => {
                const total = Object.values(b.counts).reduce((a, b) => a + b, 0);
                const heightPct = (total / maxBucket) * 100;
                return (
                  <div key={i} className="flex flex-1 flex-col justify-end" title={`${total} errors`}>
                    <div
                      className="flex w-full flex-col-reverse overflow-hidden rounded-sm"
                      style={{ height: `${heightPct}%`, minHeight: total > 0 ? 2 : 0 }}
                    >
                      {reasons.map((reason) => {
                        const c = b.counts[reason] ?? 0;
                        if (!c) return null;
                        const segPct = (c / total) * 100;
                        return (
                          <div
                            key={reason}
                            style={{
                              height: `${segPct}%`,
                              background: ERROR_COLOR[reason] ?? MV.vweak,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* X-axis labels (every 4h) */}
            <div className="mt-1 flex gap-1 text-[9px]" style={{ color: MV.vweak }}>
              {buckets.map((b, i) => {
                const ist = new Date(b.hour + 5.5 * 3600 * 1000);
                const hh = ist.getUTCHours();
                return (
                  <div key={i} className="flex-1 text-center" style={{ fontFamily: MV.mono }}>
                    {i % 4 === 0 ? String(hh).padStart(2, "0") : ""}
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className="mt-3 flex flex-wrap gap-3 text-[10px]" style={{ color: MV.weak }}>
              {reasons.map((r) => (
                <div key={r} className="flex items-center gap-1">
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ background: ERROR_COLOR[r] ?? MV.vweak }}
                  />
                  {r}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Top errors */}
        <div className="mt-5 border-t pt-3" style={{ borderColor: MV.border }}>
          <div
            className="mb-2 text-[10px] font-medium tracking-[0.14em]"
            style={{ color: MV.weak }}
          >
            TOP ERRORS — LAST 24H
          </div>
          {topErrors.length === 0 ? (
            <div className="text-[11px]" style={{ color: MV.weak }}>
              no errors to report
            </div>
          ) : (
            <div className="space-y-1">
              {topErrors.map((e, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-[12px]"
                  style={{ fontFamily: MV.mono }}
                >
                  <div className="flex items-center gap-2">
                    <span style={{ color: MV.mid }}>{e.script}</span>
                    <span style={{ color: MV.vweak }}>·</span>
                    <span style={{ color: ERROR_COLOR[e.reason] ?? MV.amber }}>{e.reason}</span>
                  </div>
                  <span style={{ color: MV.strong }}>{e.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
