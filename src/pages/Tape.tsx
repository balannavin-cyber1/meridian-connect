import { useEffect, useMemo, useState } from "react";
import { tapeClient } from "@/lib/tapeClient";

type MSymbol = "NIFTY" | "SENSEX";

type DailyReport = {
  trading_day: string;
  symbol: string;
  completeness_pct: number | null;
  gaps_gt_10s: number | null;
  gaps_gt_60s: number | null;
  packets: number | null;
  segments: number | null;
  uploads_ok: number | null;
  uploads_retried: number | null;
  uploads_failed: number | null;
  skew_median_s: number | null;
  connects: number | null;
  reconnects: number | null;
  disconnects: number | null;
  watchdog_trips: number | null;
  frame_errors: number | null;
  g3_verdict: string | null;
  classified_share_early: number | null;
  classified_share_late: number | null;
  report: unknown;
  g3: unknown;
};

type TapeEvent = {
  ts_ist: string;
  expiry: string | null;
  strike: number | null;
  leg: string | null;
  kind: string | null;
  side: string | null;
  magnitude: number | null;
  detail: unknown;
};

type StrikeCycle = {
  ts_ist: string;
  expiry: string | null;
  strike: number | null;
  leg: string | null;
  balance_5: number | null;
  balance_15: number | null;
  balance_30: number | null;
  resting_imb: number | null;
  classified_share_5: number | null;
  oi_last: number | null;
  oi_delta_5: number | null;
  minutes_present_5: number | null;
};

const REPORT_COLS =
  "trading_day,symbol,completeness_pct,gaps_gt_10s,gaps_gt_60s,packets,segments,uploads_ok,uploads_retried,uploads_failed,skew_median_s,connects,reconnects,disconnects,watchdog_trips,frame_errors,g3_verdict,classified_share_early,classified_share_late,report,g3";
const EVENT_COLS = "ts_ist,expiry,strike,leg,kind,side,magnitude,detail";
const CYCLE_COLS =
  "ts_ist,expiry,strike,leg,balance_5,balance_15,balance_30,resting_imb,classified_share_5,oi_last,oi_delta_5,minutes_present_5";

const PAGE = 1000;

class TapeError extends Error {
  status: number | null;
  denied: boolean;
  constructor(message: string, status: number | null, denied: boolean) {
    super(message);
    this.status = status;
    this.denied = denied;
  }
}

function checkResponse(res: { data: unknown; error: { message?: string; code?: string } | null; status?: number; statusText?: string }) {
  const status = res.status ?? null;
  if (status === 401 || status === 403) {
    throw new TapeError("Operator only", status, true);
  }
  if (res.error) {
    const code = res.error.code ?? "";
    if (code === "401" || code === "403") throw new TapeError("Operator only", Number(code), true);
    throw new TapeError(res.error.message ?? "request failed", status, false);
  }
  if (typeof res.data === "string") {
    // HTML or unexpected body — treat as the proxy refusing us.
    throw new TapeError("Operator only", status, true);
  }
}

// A non-JSON (HTML) body makes supabase-js throw a SyntaxError before we see a
// response — that means the proxy isn't serving us, so treat it as denied.
function asTapeError(e: unknown): TapeError {
  if (e instanceof TapeError) return e;
  if (e instanceof SyntaxError) return new TapeError("Operator only", null, true);
  return new TapeError(e instanceof Error ? e.message : "request failed", null, false);
}

async function fetchAll<T>(table: string, columns: string, symbol: MSymbol, day: string): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    try {
      const res = await tapeClient
        .from(table)
        .select(columns)
        .eq("symbol", symbol)
        .eq("trading_day", day)
        .order("ts_ist", { ascending: true })
        .range(from, from + PAGE - 1);
      checkResponse(res);
      const rows = (res.data ?? []) as T[];
      out.push(...rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    } catch (e) {
      throw asTapeError(e);
    }
  }
  return out;
}

async function fetchDays(symbol: MSymbol): Promise<string[]> {
  try {
    const res = await tapeClient
      .from("tape_daily_report")
      .select("trading_day")
      .eq("symbol", symbol)
      .order("trading_day", { ascending: false })
      .range(0, 999);
    checkResponse(res);
    const rows = (res.data ?? []) as { trading_day: string }[];
    return [...new Set(rows.map((r) => r.trading_day))];
  } catch (e) {
    throw asTapeError(e);
  }
}

async function fetchReport(symbol: MSymbol, day: string): Promise<DailyReport | null> {
  try {
    const res = await tapeClient
      .from("tape_daily_report")
      .select(REPORT_COLS)
      .eq("symbol", symbol)
      .eq("trading_day", day)
      .range(0, 0);
    checkResponse(res);
    const rows = (res.data ?? []) as DailyReport[];
    return rows[0] ?? null;
  } catch (e) {
    throw asTapeError(e);
  }
}

// ---------- shared bits ----------

const mono: React.CSSProperties = { fontFamily: "var(--font-plex, inherit)", fontVariantNumeric: "tabular-nums" };

function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-md px-3 py-2" style={{ background: "var(--s1)", border: "1px solid var(--line)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold" style={{ ...mono, color: color ?? "var(--ink-1)" }}>{value}</div>
      {sub && <div className="text-[10px]" style={{ color: "var(--ink-3)" }}>{sub}</div>}
    </div>
  );
}

function num(v: number | null, d = 0): string {
  if (v == null) return "owed";
  return v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--ink-2)", fontFamily: "var(--font-plex-cond)" }}>
      {children}
    </h2>
  );
}

function Skeleton({ h = 80 }: { h?: number }) {
  return <div className="w-full rounded-md" style={{ height: h, background: "var(--s1)", border: "1px solid var(--line)" }} />;
}

function InlineError({ err }: { err: TapeError }) {
  return (
    <div className="rounded-md px-3 py-2 text-[12px]" style={{ background: "var(--alert-bg)", color: "var(--alert-fg)" }}>
      request failed{err.status != null ? ` · HTTP ${err.status}` : ""} · {err.message}
    </div>
  );
}

// minutes from 09:15 IST for a ts_ist timestamp
function minsOf(ts: string): number {
  const d = new Date(ts);
  const ist = new Date(d.getTime() + 5.5 * 3600_000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes() + ist.getUTCSeconds() / 60;
}
const T0 = 9 * 60 + 15; // 09:15
const T1 = 15 * 60 + 30; // 15:30

function timeLabel(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ---------- Section 1: day health ----------

function VerdictBadge({ v }: { v: string | null }) {
  if (v == null) return <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>owed</span>;
  const pass = v === "PASS";
  const neutral = v === "NOT EVALUATED";
  const bg = pass ? "rgba(61,190,122,0.16)" : neutral ? "var(--s2)" : "rgba(255,138,76,0.16)";
  const fg = pass ? "#3DBE7A" : neutral ? "var(--ink-3)" : "var(--warm)";
  return (
    <span className="rounded px-2 py-0.5 text-[11px] font-bold tracking-[0.06em]" style={{ background: bg, color: fg }}>
      {v}
    </span>
  );
}

function DayHealth({ report }: { report: DailyReport | null }) {
  const [raw, setRaw] = useState(false);
  if (!report) return <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>no daily report row for this day</div>;
  const r = report;
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Tile label="completeness" value={r.completeness_pct == null ? "owed" : `${num(r.completeness_pct, 1)} %`} />
        <Tile label="gaps > 10 s" value={num(r.gaps_gt_10s)} />
        <Tile label="gaps > 60 s" value={num(r.gaps_gt_60s)} />
        <Tile label="packets" value={num(r.packets)} />
        <Tile label="segments" value={num(r.segments)} />
        <Tile label="skew median" value={r.skew_median_s == null ? "owed" : `${num(r.skew_median_s, 2)} s`} />
        <Tile label="uploads ok" value={num(r.uploads_ok)} />
        <Tile label="uploads retried" value={num(r.uploads_retried)} />
        <Tile label="uploads failed" value={num(r.uploads_failed)} color={r.uploads_failed ? "var(--warm)" : undefined} />
        <Tile label="connects" value={num(r.connects)} />
        <Tile label="reconnects" value={num(r.reconnects)} />
        <Tile label="disconnects" value={num(r.disconnects)} />
        <Tile label="watchdog trips" value={num(r.watchdog_trips)} />
        <Tile label="frame errors" value={num(r.frame_errors)} />
        <Tile label="classified early" value={r.classified_share_early == null ? "owed" : `${num(r.classified_share_early * 100, 1)} %`} />
        <Tile label="classified late" value={r.classified_share_late == null ? "owed" : `${num(r.classified_share_late * 100, 1)} %`} />
        <div className="rounded-md px-3 py-2" style={{ background: "var(--s1)", border: "1px solid var(--line)" }}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>g3 verdict</div>
          <div className="mt-1"><VerdictBadge v={r.g3_verdict} /></div>
        </div>
      </div>
      <button
        onClick={() => setRaw((v) => !v)}
        className="mt-2 rounded px-2 py-1 text-[11px] font-semibold"
        style={{ border: "1px solid var(--line-2)", color: "var(--ink-2)" }}
      >
        {raw ? "hide raw report" : "raw report"}
      </button>
      {raw && (
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {(["report", "g3"] as const).map((k) => (
            <pre
              key={k}
              className="max-h-72 overflow-auto rounded-md p-3 text-[11px] leading-relaxed"
              style={{ background: "var(--s1)", border: "1px solid var(--line)", color: "var(--ink-2)", ...mono }}
            >
              {JSON.stringify(r[k] ?? null, null, 2)}
            </pre>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Section 2: event timeline ----------

function sideColor(side: string | null): string {
  const s = (side ?? "").toLowerCase();
  if (s === "buy" || s === "bid" || s === "b") return "var(--cool)";
  if (s === "sell" || s === "ask" || s === "s") return "var(--warm)";
  return "var(--ink-3)";
}

function EventTimeline({ events }: { events: TapeEvent[] }) {
  const [hover, setHover] = useState<TapeEvent | null>(null);
  const kinds = useMemo(() => [...new Set(events.map((e) => e.kind ?? "—"))], [events]);
  const W = 1160;
  const ROW_H = 26;
  const H = kinds.length * ROW_H + 24;
  const x = (ts: string) => ((minsOf(ts) - T0) / (T1 - T0)) * W;
  if (!events.length) return <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>no events for this day</div>;
  return (
    <div className="relative overflow-x-auto rounded-md p-2" style={{ background: "var(--s1)", border: "1px solid var(--line)" }}>
      <svg width={W} height={H} className="block">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const px = f * W;
          const mins = T0 + f * (T1 - T0);
          const lbl = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(Math.floor(mins % 60)).padStart(2, "0")}`;
          return (
            <g key={f}>
              <line x1={px} y1={16} x2={px} y2={H - 6} stroke="var(--axis)" strokeWidth={1} />
              <text x={px} y={10} textAnchor="middle" fontSize={9} fill="var(--ink-3)" style={mono}>{lbl}</text>
            </g>
          );
        })}
        {kinds.map((k, i) => (
          <text key={k} x={-4} y={16 + i * ROW_H + ROW_H / 2 + 3} textAnchor="end" fontSize={9} fill="var(--ink-3)"
            transform={`translate(${0},0)`} style={{ display: "none" }}>{k}</text>
        ))}
        {events.map((e, i) => {
          const row = kinds.indexOf(e.kind ?? "—");
          const cx = x(e.ts_ist);
          const cy = 16 + row * ROW_H + ROW_H / 2;
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={3.5}
              fill={sideColor(e.side)}
              opacity={hover === e ? 1 : 0.75}
              onMouseEnter={() => setHover(e)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {kinds.map((k, i) => (
          <span key={k} className="text-[10px]" style={{ color: "var(--ink-3)" }}>
            row {i + 1}: {k}
          </span>
        ))}
      </div>
      {hover && (
        <div
          className="pointer-events-none absolute left-2 top-2 z-10 max-w-md rounded-md p-2 text-[11px]"
          style={{ background: "var(--s2)", border: "1px solid var(--line-2)", color: "var(--ink-1)", ...mono }}
        >
          <div>{timeLabel(hover.ts_ist)} · {hover.kind ?? "—"} · {hover.side ?? "—"}</div>
          <div style={{ color: "var(--ink-2)" }}>
            {hover.expiry ?? "—"} · {hover.strike ?? "—"} {hover.leg ?? ""} · mag {hover.magnitude ?? "—"}
          </div>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap" style={{ color: "var(--ink-3)" }}>
            {JSON.stringify(hover.detail ?? null, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function EventTable({ events }: { events: TapeEvent[] }) {
  const [kind, setKind] = useState<string>("all");
  const [side, setSide] = useState<string>("all");
  const kinds = useMemo(() => [...new Set(events.map((e) => e.kind ?? "—"))], [events]);
  const sides = useMemo(() => [...new Set(events.map((e) => e.side ?? "—"))], [events]);
  const rows = events.filter((e) => (kind === "all" || (e.kind ?? "—") === kind) && (side === "all" || (e.side ?? "—") === side));
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of rows) m.set(e.kind ?? "—", (m.get(e.kind ?? "—") ?? 0) + 1);
    return [...m.entries()];
  }, [rows]);
  const sel: React.CSSProperties = { background: "var(--s2)", color: "var(--ink-1)", border: "1px solid var(--line-2)" };
  return (
    <div className="mt-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded px-2 py-1 text-[12px]" style={sel}>
          <option value="all">all kinds</option>
          {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={side} onChange={(e) => setSide(e.target.value)} className="rounded px-2 py-1 text-[12px]" style={sel}>
          <option value="all">all sides</option>
          {sides.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
          {counts.map(([k, c]) => `${k} ${c}`).join(" · ") || "no rows"}
        </span>
      </div>
      <div className="max-h-96 overflow-auto rounded-md" style={{ border: "1px solid var(--line)" }}>
        <table className="w-full text-[11px]" style={{ ...mono, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--s2)", color: "var(--ink-3)" }}>
              {["time", "expiry", "strike", "leg", "kind", "side", "magnitude"].map((h) => (
                <th key={h} className="px-2 py-1.5 text-left font-semibold uppercase tracking-[0.06em]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={i} style={{ background: i % 2 ? "var(--s1)" : "transparent", color: "var(--ink-2)" }}>
                <td className="px-2 py-1">{timeLabel(e.ts_ist)}</td>
                <td className="px-2 py-1">{e.expiry ?? "—"}</td>
                <td className="px-2 py-1">{e.strike ?? "—"}</td>
                <td className="px-2 py-1">{e.leg ?? "—"}</td>
                <td className="px-2 py-1" style={{ color: "var(--ink-1)" }}>{e.kind ?? "—"}</td>
                <td className="px-2 py-1" style={{ color: sideColor(e.side) }}>{e.side ?? "—"}</td>
                <td className="px-2 py-1">{e.magnitude ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Section 3: strike-cycle balance ----------

function balanceColor(v: number | null, maxAbs: number, lowClass: boolean): string {
  if (v == null || maxAbs <= 0) return "var(--s2)";
  const t = Math.max(-1, Math.min(1, v / maxAbs));
  // cool (buy-heavy) one hue, warm (sell-heavy) the other; alpha by |t|
  const a = 0.12 + 0.75 * Math.abs(t);
  const base = t >= 0 ? `rgba(93,180,245,${a.toFixed(3)})` : `rgba(255,138,76,${a.toFixed(3)})`;
  return lowClass ? base : base;
}

function CycleHeatmap({ rows, windowSel, onPick, picked }: {
  rows: StrikeCycle[];
  windowSel: 5 | 15 | 30;
  onPick: (strike: number) => void;
  picked: number | null;
}) {
  const [hover, setHover] = useState<StrikeCycle | null>(null);
  const balKey = (`balance_${windowSel}`) as "balance_5" | "balance_15" | "balance_30";
  const strikes = useMemo(() => [...new Set(rows.map((r) => r.strike).filter((s): s is number => s != null))].sort((a, b) => b - a), [rows]);
  const times = useMemo(() => [...new Set(rows.map((r) => r.ts_ist))].sort(), [rows]);
  const maxAbs = useMemo(() => Math.max(1e-9, ...rows.map((r) => Math.abs(r[balKey] ?? 0))), [rows, balKey]);
  const cell = useMemo(() => {
    const m = new Map<string, StrikeCycle>();
    for (const r of rows) if (r.strike != null) m.set(`${r.strike}|${r.ts_ist}`, r);
    return m;
  }, [rows]);
  if (!rows.length) return <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>no strike-cycle rows for this selection</div>;
  const CW = Math.max(6, Math.min(14, Math.floor(1100 / Math.max(1, times.length))));
  const CH = 12;
  const LX = 64;
  const W = LX + times.length * CW + 8;
  const H = strikes.length * CH + 22;
  return (
    <div className="relative overflow-x-auto rounded-md p-2" style={{ background: "var(--s1)", border: "1px solid var(--line)" }}>
      <svg width={W} height={H} className="block">
        <defs>
          <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--ink-3)" strokeWidth="1" opacity="0.55" />
          </pattern>
        </defs>
        {strikes.map((s, yi) => (
          <text key={s} x={LX - 6} y={yi * CH + CH - 3} textAnchor="end" fontSize={9} fill={s === picked ? "var(--sel)" : "var(--ink-3)"} style={mono}>
            {s.toLocaleString("en-IN")}
          </text>
        ))}
        {times.map((t, xi) => {
          const show = times.length <= 40 || xi % Math.ceil(times.length / 40) === 0;
          return show ? (
            <text key={t} x={LX + xi * CW + CW / 2} y={H - 8} textAnchor="middle" fontSize={8} fill="var(--ink-3)" style={mono}>
              {timeLabel(t).slice(0, 5)}
            </text>
          ) : null;
        })}
        {strikes.map((s, yi) =>
          times.map((t, xi) => {
            const r = cell.get(`${s}|${t}`);
            const lowClass = r != null && (r.classified_share_5 ?? 1) < 0.5;
            return (
              <g key={`${s}|${t}`}>
                <rect
                  x={LX + xi * CW}
                  y={yi * CH}
                  width={CW - 1}
                  height={CH - 1}
                  fill={r ? balanceColor(r[balKey], maxAbs, lowClass) : "transparent"}
                  stroke={s === picked ? "var(--sel)" : "none"}
                  strokeWidth={s === picked ? 1 : 0}
                  onMouseEnter={() => r && setHover(r)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => r && onPick(s)}
                  style={{ cursor: r ? "pointer" : "default" }}
                />
                {r && lowClass && (
                  <rect x={LX + xi * CW} y={yi * CH} width={CW - 1} height={CH - 1} fill="url(#hatch)" pointerEvents="none" />
                )}
              </g>
            );
          })
        )}
      </svg>
      <div className="mt-1 flex gap-4 text-[10px]" style={{ color: "var(--ink-3)" }}>
        <span><span style={{ color: "var(--cool)" }}>■</span> buy-heavy</span>
        <span><span style={{ color: "var(--warm)" }}>■</span> sell-heavy</span>
        <span>hatched = low classification (classified share 5 &lt; 0.5)</span>
      </div>
      {hover && (
        <div
          className="pointer-events-none absolute left-2 top-2 z-10 rounded-md p-2 text-[11px]"
          style={{ background: "var(--s2)", border: "1px solid var(--line-2)", color: "var(--ink-1)", ...mono }}
        >
          <div>{timeLabel(hover.ts_ist)} · {hover.strike ?? "—"} {hover.leg ?? ""} · {hover.expiry ?? "—"}</div>
          <div style={{ color: "var(--ink-2)" }}>
            bal 5 {hover.balance_5 ?? "—"} · 15 {hover.balance_15 ?? "—"} · 30 {hover.balance_30 ?? "—"} · resting {hover.resting_imb ?? "—"}
          </div>
          <div style={{ color: "var(--ink-3)" }}>
            class5 {hover.classified_share_5 ?? "—"} · oi {hover.oi_last ?? "—"} · Δoi5 {hover.oi_delta_5 ?? "—"} · min5 {hover.minutes_present_5 ?? "—"}
            {(hover.classified_share_5 ?? 1) < 0.5 ? " · low classification" : ""}
          </div>
        </div>
      )}
    </div>
  );
}

function StrikeDrill({ rows, strike }: { rows: StrikeCycle[]; strike: number }) {
  const series = useMemo(() => rows.filter((r) => r.strike === strike).sort((a, b) => a.ts_ist.localeCompare(b.ts_ist)), [rows, strike]);
  if (!series.length) return null;
  const keys = [
    { k: "balance_5" as const, label: "bal 5", color: "var(--cool)" },
    { k: "balance_15" as const, label: "bal 15", color: "var(--ink-2)" },
    { k: "balance_30" as const, label: "bal 30", color: "var(--warm)" },
    { k: "resting_imb" as const, label: "resting", color: "var(--sel)" },
  ];
  const W = 560, H = 150, P = 8;
  const vals = series.flatMap((r) => keys.map(({ k }) => r[k]).filter((v): v is number => v != null));
  const maxAbs = Math.max(1e-9, ...vals.map((v) => Math.abs(v)));
  const x = (i: number) => P + (i / Math.max(1, series.length - 1)) * (W - 2 * P);
  const y = (v: number) => H / 2 - (v / maxAbs) * (H / 2 - P);
  return (
    <div className="mt-2 rounded-md p-2" style={{ background: "var(--s1)", border: "1px solid var(--line)" }}>
      <div className="mb-1 text-[11px] font-semibold" style={{ color: "var(--ink-2)" }}>
        strike {strike.toLocaleString("en-IN")} over time
      </div>
      <svg width={W} height={H} className="block max-w-full">
        <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="var(--axis)" strokeWidth={1} />
        {keys.map(({ k, color }) => {
          const pts = series.map((r, i) => (r[k] != null ? `${x(i)},${y(r[k]!)}` : null)).filter(Boolean).join(" ");
          return pts ? <polyline key={k} points={pts} fill="none" stroke={color} strokeWidth={1.4} /> : null;
        })}
      </svg>
      <div className="mt-1 flex gap-4 text-[10px]" style={{ color: "var(--ink-3)" }}>
        {keys.map(({ label, color }) => (
          <span key={label}><span style={{ color }}>—</span> {label}</span>
        ))}
      </div>
    </div>
  );
}

function StrikeBalance({ rows }: { rows: StrikeCycle[] }) {
  const expiries = useMemo(
    () => [...new Set(rows.map((r) => r.expiry).filter((e): e is string => e != null))].sort(),
    [rows]
  );
  const [expiry, setExpiry] = useState<string | null>(null);
  const [leg, setLeg] = useState<"CE" | "PE">("CE");
  const [win, setWin] = useState<5 | 15 | 30>(5);
  const [picked, setPicked] = useState<number | null>(null);
  const effExpiry = expiry ?? expiries[0] ?? null;
  const filtered = useMemo(
    () => rows.filter((r) => r.expiry === effExpiry && r.leg === leg),
    [rows, effExpiry, leg]
  );
  const sel: React.CSSProperties = { background: "var(--s2)", color: "var(--ink-1)", border: "1px solid var(--line-2)" };
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select value={effExpiry ?? ""} onChange={(e) => setExpiry(e.target.value)} className="rounded px-2 py-1 text-[12px]" style={sel}>
          {expiries.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <div className="flex rounded-md p-0.5" style={{ background: "var(--strip)", border: "1px solid var(--line-2)" }}>
          {(["CE", "PE"] as const).map((l) => (
            <button key={l} onClick={() => setLeg(l)} aria-pressed={leg === l}
              className="rounded px-2.5 py-1 text-[11px] font-semibold"
              style={{ background: leg === l ? "var(--s2)" : "transparent", color: leg === l ? "var(--ink-1)" : "var(--ink-3)" }}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex rounded-md p-0.5" style={{ background: "var(--strip)", border: "1px solid var(--line-2)" }}>
          {([5, 15, 30] as const).map((w) => (
            <button key={w} onClick={() => setWin(w)} aria-pressed={win === w}
              className="rounded px-2.5 py-1 text-[11px] font-semibold"
              style={{ background: win === w ? "var(--s2)" : "transparent", color: win === w ? "var(--ink-1)" : "var(--ink-3)", ...mono }}>
              {w} min
            </button>
          ))}
        </div>
      </div>
      <CycleHeatmap rows={filtered} windowSel={win} onPick={(s) => setPicked(s)} picked={picked} />
      {picked != null && <StrikeDrill rows={filtered} strike={picked} />}
    </div>
  );
}

// ---------- page ----------

export default function Tape() {
  const [symbol, setSymbol] = useState<MSymbol>("NIFTY");
  const [days, setDays] = useState<string[] | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [daysErr, setDaysErr] = useState<TapeError | null>(null);

  const [report, setReport] = useState<DailyReport | null>(null);
  const [events, setEvents] = useState<TapeEvent[] | null>(null);
  const [cycles, setCycles] = useState<StrikeCycle[] | null>(null);
  const [secErr, setSecErr] = useState<{ report?: TapeError; events?: TapeError; cycles?: TapeError }>({});

  useEffect(() => {
    let dead = false;
    setDays(null); setDay(null); setDaysErr(null);
    fetchDays(symbol)
      .then((d) => { if (!dead) { setDays(d); setDay(d[0] ?? null); } })
      .catch((e: TapeError) => { if (!dead) { if (e.denied) setDenied(true); else setDaysErr(e); } });
    return () => { dead = true; };
  }, [symbol]);

  useEffect(() => {
    if (!day) return;
    let dead = false;
    setReport(null); setEvents(null); setCycles(null); setSecErr({});
    const onErr = (key: "report" | "events" | "cycles") => (e: TapeError) => {
      if (dead) return;
      if (e.denied) setDenied(true);
      else setSecErr((s) => ({ ...s, [key]: e }));
    };
    fetchReport(symbol, day).then((r) => !dead && setReport(r)).catch(onErr("report"));
    fetchAll<TapeEvent>("tape_events", EVENT_COLS, symbol, day).then((r) => !dead && setEvents(r)).catch(onErr("events"));
    fetchAll<StrikeCycle>("tape_strike_cycle", CYCLE_COLS, symbol, day).then((r) => !dead && setCycles(r)).catch(onErr("cycles"));
    return () => { dead = true; };
  }, [symbol, day]);

  if (denied) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="rounded-md px-8 py-10 text-center" style={{ background: "var(--s1)", border: "1px solid var(--line)" }}>
          <div className="text-[15px] font-bold uppercase tracking-[0.18em]" style={{ fontFamily: "var(--font-plex-cond)", color: "var(--ink-1)" }}>
            Operator only
          </div>
          <div className="mt-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
            this view is served only through the operator proxy
          </div>
        </div>
      </div>
    );
  }

  const sel: React.CSSProperties = { background: "var(--s2)", color: "var(--ink-1)", border: "1px solid var(--line-2)" };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-[15px] font-bold uppercase tracking-[0.18em]" style={{ fontFamily: "var(--font-plex-cond)", color: "var(--ink-1)" }}>
          Tape
        </h1>
        <div className="flex rounded-md p-0.5" style={{ background: "var(--strip)", border: "1px solid var(--line-2)" }}>
          {(["NIFTY", "SENSEX"] as const).map((s) => (
            <button key={s} onClick={() => setSymbol(s)} aria-pressed={symbol === s}
              className="rounded px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em]"
              style={{ background: symbol === s ? "var(--s2)" : "transparent", color: symbol === s ? "var(--ink-1)" : "var(--ink-3)" }}>
              {s}
            </button>
          ))}
        </div>
        {days && days.length > 0 && (
          <select value={day ?? ""} onChange={(e) => setDay(e.target.value)} className="rounded px-2 py-1 text-[12px]" style={{ ...sel, ...mono }}>
            {days.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        {days && days.length === 0 && <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>no tape days on record</span>}
      </div>

      {daysErr && <div className="mb-4"><InlineError err={daysErr} /></div>}

      <section className="mb-6">
        <SectionTitle>Day health</SectionTitle>
        {secErr.report ? <InlineError err={secErr.report} /> : report == null ? <Skeleton h={96} /> : <DayHealth report={report} />}
      </section>

      <section className="mb-6">
        <SectionTitle>Event timeline</SectionTitle>
        {secErr.events ? <InlineError err={secErr.events} /> : events == null ? <Skeleton h={140} /> : (
          <>
            <EventTimeline events={events} />
            <EventTable events={events} />
          </>
        )}
      </section>

      <section className="mb-6">
        <SectionTitle>Strike-cycle balance</SectionTitle>
        {secErr.cycles ? <InlineError err={secErr.cycles} /> : cycles == null ? <Skeleton h={220} /> : <StrikeBalance rows={cycles} />}
      </section>
    </div>
  );
}
