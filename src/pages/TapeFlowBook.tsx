import { useEffect, useMemo, useState } from "react";
import { tapeClient } from "@/lib/tapeClient";
import {
  deriveFlags, labelWall, wallAt, floor5, ms,
  type CycleRow, type EventRow, type WallRow, type WallSide, type Label, type Flags, type LabelOut,
} from "@/lib/tapeLabels";
import { pinGate, pinSign, pinReadout, type PinGateOut } from "@/lib/tapePin";

type Row = Record<string, unknown>;
type Src = { rows: Row[] | null; err: string | null; missing: string[] };

const PAGE = 1000;
const MIN = 60_000;
const mono: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

const CYCLE_NEED = ["symbol", "trading_day", "expiry", "strike", "leg", "ts_ist", "buy_5", "sell_5", "balance_5", "resting_imb", "classified_share_5", "oi_last", "oi_delta_5", "minutes_present_5", "trades_5"];
const EVENT_NEED = ["strike", "leg", "kind", "ts_ist", "side"];
const WALL_NEED = ["ts_ist", "call_wall", "put_wall"];
const WALL_NEED_REPLAY = [...WALL_NEED, "chain_run_id", "leader_strike"];
const LABEL_NEED = ["ts_ist", "wall", "label"];
const PIN_NEED = ["run_id", "ts", "expiry_date", "dte", "spot", "pin_leader_strike", "gamma_at_pin", "pin_state", "held_for_cycles", "call_wall_strike", "put_wall_strike", "max_pain_strike", "is_fresh", "reconciled_at"];

export function istToday(now: number): string {
  return new Date(now + 330 * MIN).toISOString().slice(0, 10);
}

async function getAll(table: string, symbol: string, day: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let res;
    try {
      res = await tapeClient.from(table).select("*").eq("symbol", symbol).eq("trading_day", day)
        .order("ts_ist", { ascending: true }).range(from, from + PAGE - 1);
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
    if (res.error) throw new Error(`${res.error.message ?? "request failed"}${res.status ? ` · HTTP ${res.status}` : ""}`);
    if (typeof res.data === "string") throw new Error("unexpected response body");
    const rows = (res.data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

function missingCols(rows: Row[], need: string[]): string[] {
  if (!rows.length) return [];
  return need.filter((c) => !(c in rows[0]));
}

// gex_cycle_history has ts (not ts_ist) and no trading_day: filter by IST day bounds.
async function getAllTs(table: string, symbol: string, day: string): Promise<Row[]> {
  const lo = `${day}T00:00:00+05:30`;
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + 24 * 60 * MIN).toISOString().slice(0, 10);
  const hi = `${next}T00:00:00+05:30`;
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let res;
    try {
      res = await tapeClient.from(table).select("*").eq("symbol", symbol)
        .gte("ts", lo).lt("ts", hi).order("ts", { ascending: true }).range(from, from + PAGE - 1);
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
    if (res.error) throw new Error(`${res.error.message ?? "request failed"}${res.status ? ` · HTTP ${res.status}` : ""}`);
    if (typeof res.data === "string") throw new Error("unexpected response body");
    const rows = (res.data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

function usePinSource(symbol: string, day: string, tick: number): Src {
  const [s, set] = useState<Src>({ rows: null, err: null, missing: [] });
  useEffect(() => { set({ rows: null, err: null, missing: [] }); }, [symbol, day]);
  useEffect(() => {
    let dead = false;
    getAllTs("gex_cycle_history", symbol, day)
      .then((rows) => !dead && set({ rows, err: null, missing: missingCols(rows, PIN_NEED) }))
      .catch((e: Error) => !dead && set((p) => ({ rows: p.rows, err: e.message, missing: p.missing })));
    return () => { dead = true; };
  }, [symbol, day, tick]);
  return s;
}

/** Latest pin row whose ts floored to the 5-minute grid is at or before T (same rule as walls). */
function pinAt(pins: Row[], T: number): Row | null {
  let best: Row | null = null;
  let bestT = -1;
  for (const r of pins) {
    if (typeof r.ts !== "string") continue;
    const t = floor5(ms(r.ts));
    if (t > T) continue;
    if (t >= bestT) { best = r; bestT = t; }
  }
  return best;
}

/**
 * Flags for an arbitrary (K, leg) — the pin strike in place of the wall's strike-leg.
 * Reuses deriveFlags by feeding it synthetic wall rows that pin the wall at K; the
 * label rules themselves are not reimplemented.
 */
function flagsAt(
  rows: { cycles: CycleRow[]; events: EventRow[]; walls: WallRow[] },
  K: number,
  leg: "CE" | "PE",
  T: number,
) {
  const walls = rows.walls.map((r) => ({
    ts_ist: r.ts_ist,
    call_wall: leg === "CE" ? K : null,
    put_wall: leg === "PE" ? K : null,
  }));
  return deriveFlags({ cycles: rows.cycles, events: rows.events, walls }, leg === "CE" ? "CALL" : "PUT", T);
}

function useSource(table: string, symbol: string, day: string, need: string[], tick: number): Src {
  const [s, set] = useState<Src>({ rows: null, err: null, missing: [] });
  useEffect(() => { set({ rows: null, err: null, missing: [] }); }, [table, symbol, day]);
  useEffect(() => {
    let dead = false;
    getAll(table, symbol, day)
      .then((rows) => !dead && set({ rows, err: null, missing: missingCols(rows, need) }))
      .catch((e: Error) => !dead && set((p) => ({ rows: p.rows, err: e.message, missing: p.missing })));
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, symbol, day, tick]);
  return s;
}

// IST clock helpers
function hhmm(t: number): string {
  return new Date(t).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
}
function istMs(day: string, h: number, m: number): number {
  return Date.parse(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+05:30`);
}
function grid(day: string): number[] {
  const out: number[] = [];
  for (let t = istMs(day, 9, 20); t <= istMs(day, 15, 30); t += 5 * MIN) out.push(t);
  return out;
}

const TONE: Record<Exclude<Label, "NO_READ">, string> = {
  HIT: "var(--ink-1)",
  ABSORBED: "var(--call)",
  THINNING: "var(--ink-3)",
  QUIET: "var(--line-2)",
};
const HATCH = "repeating-linear-gradient(45deg, var(--line-2) 0 3px, transparent 3px 6px)";

function Chip({ label }: { label: Label }) {
  const style: React.CSSProperties = label === "NO_READ"
    ? { background: HATCH, color: "var(--ink-2)", border: "1px solid var(--line-2)" }
    : { background: TONE[label], color: label === "QUIET" || label === "THINNING" ? "var(--ink-1)" : "var(--bg)" };
  return <span className="rounded px-2 py-0.5 text-[11px] font-bold tracking-[0.06em]" style={style}>{label}</span>;
}

function MissingChip({ col }: { col: string }) {
  return <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ border: "1px dashed var(--line-2)", color: "var(--ink-2)" }}>column missing · {col}</span>;
}

const n = (v: unknown, d = 0, unit = ""): string => {
  if (typeof v !== "number" || !Number.isFinite(v)) return "no value";
  return `${v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })}${unit}`;
};

type Cell = { T: number; K: number | null; flags: Flags; out: LabelOut };

type PinLeg = { leg: "CE" | "PE"; flags: Flags; out: LabelOut };
type PinCell = {
  T: number;
  pin: Row | null;
  expiryDiffers: boolean;
  tapeDiffers: number | null;
  gate: PinGateOut | null;
  sign: 1 | -1 | 0 | null;
  legs: PinLeg[];
  movedFrom: number | null;
};
const GATED_HATCH = "repeating-linear-gradient(-45deg, var(--line-2) 0 3px, transparent 3px 6px)";
const signWord = (s: 1 | -1 | 0 | null) => (s === 1 ? "dampening" : s === -1 ? "amplifying" : "sign n/a");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function WallCard({ side, cell, prevK, cycles }: { side: WallSide; cell: Cell | null; prevK: number | null; cycles: Row[] }) {
  if (!cell) return <Card side={side}><div className="text-[12px]" style={{ color: "var(--ink-3)" }}>no cycle yet</div></Card>;
  const leg = side === "CALL" ? "CE" : "PE";
  const at = cycles.filter((r) => r.strike === cell.K && r.leg === leg);
  const row = at.find((r) => ms(String(r.ts_ist)) === cell.T) ?? null;
  const win = at.filter((r) => { const t = ms(String(r.ts_ist)); return t > cell.T - 15 * MIN && t <= cell.T; });
  const build = win.length ? win.reduce((s, r) => s + (typeof r.oi_delta_5 === "number" ? r.oi_delta_5 : 0), 0) : null;
  const share = typeof row?.classified_share_5 === "number" ? row.classified_share_5 * 100 : null;
  const flag = (on: boolean, txt: string) => (
    <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ border: "1px solid var(--line-2)", color: on ? "var(--ink-1)" : "var(--ink-3)" }}>
      {txt} · {on ? "present" : "absent"}
    </span>
  );
  const val = (k: string, v: string) => (
    <div className="flex justify-between gap-2 text-[12px]"><span style={{ color: "var(--ink-3)" }}>{k}</span><span style={{ ...mono, color: "var(--ink-1)" }}>{v}</span></div>
  );
  return (
    <Card side={side}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip label={cell.out.label} />
        <span className="text-[15px] font-semibold" style={{ ...mono, color: "var(--ink-1)" }}>{cell.K == null ? "no wall" : n(cell.K)}</span>
        <span className="text-[11px]" style={{ color: "var(--ink-2)" }}>{leg}</span>
        <span className="text-[11px]" style={{ ...mono, color: "var(--ink-3)" }}>{hhmm(cell.T)} IST</span>
      </div>
      {cell.out.reason && <div className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>{cell.out.partial ? "partial · " : ""}{cell.out.reason}</div>}
      {prevK != null && cell.K != null && prevK !== cell.K && (
        <div className="mt-1 text-[11px]" style={{ color: "var(--ink-2)" }}>wall moved from {n(prevK)}</div>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">{flag(cell.flags.C, "T1 flow burst")}{flag(cell.flags.N, "T3 offers thinning")}</div>
      <div className="mt-2 grid gap-0.5">
        {val("oi_last", n(row?.oi_last, 0, " contracts"))}
        {val("OI build (15 min)", build == null ? "no value" : n(build, 0, " contracts"))}
        {val("resting_imb", n(row?.resting_imb, 2))}
        {val("balance_5", n(row?.balance_5, 0, " contracts"))}
        {val("classified_share_5", share == null ? "no value" : n(share, 1, " %"))}
        {val("buy_5", n(row?.buy_5, 0, " contracts"))}
        {val("sell_5", n(row?.sell_5, 0, " contracts"))}
      </div>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md px-3 py-2" style={{ background: "var(--s1)", border: "1px solid var(--line)" }}>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>{title}</div>
      {children}
    </div>
  );
}

function Strip({ side, cells, stored, hasStored }: { side: WallSide; cells: Cell[]; stored: Map<number, string>; hasStored: boolean }) {
  const [hover, setHover] = useState<Cell | null>(null);
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>
        <span>{side}</span>
        <span className="normal-case tracking-normal" style={mono}>09:20 – 15:30 IST · 5 min</span>
      </div>
      <div className="flex h-6 gap-px">
        {cells.map((c) => {
          const st = stored.get(c.T);
          const diff = hasStored && st != null && st !== c.out.label;
          const nr = c.out.label === "NO_READ";
          return (
            <div key={c.T} className="relative flex-1" onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)}
              style={{ background: nr ? "transparent" : TONE[c.out.label as Exclude<Label, "NO_READ">], border: nr ? "none" : undefined }}
              title={`${hhmm(c.T)} IST · ${c.out.label}${c.out.reason ? ` · ${c.out.reason}` : ""}${diff ? ` · stored ${st} / recomputed ${c.out.label}` : ""}`}>
              {diff && <span className="absolute -top-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full" style={{ background: "var(--sel)" }} />}
            </div>
          );
        })}
      </div>
      <div className="mt-1 min-h-[16px] text-[11px]" style={{ ...mono, color: "var(--ink-2)" }}>
        {hover && (() => {
          const st = stored.get(hover.T);
          const f = hover.flags;
          return `${hhmm(hover.T)} IST · ${hover.out.label}${hover.out.partial ? " (partial)" : ""}${hover.out.reason ? ` · ${hover.out.reason}` : ""} · strike ${hover.K ?? "none"} · wall_known ${f.wall_known} · in_window ${f.in_window} · untraded ${f.untraded} · conc_evaluable ${f.conc_evaluable} · thin_evaluable ${f.thin_evaluable} · C ${f.C} · N ${f.N}${hasStored && st != null && st !== hover.out.label ? ` · stored ${st} vs recomputed ${hover.out.label}` : ""}`;
        })()}
      </div>
    </div>
  );
}

export default function FlowVsBook({ symbol, day, now }: { symbol: string; day: string; now: number }) {
  const live = day === istToday(now);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [live]);

  const cyc = useSource(live ? "tape_live_cycle" : "tape_strike_cycle", symbol, day, CYCLE_NEED, tick);
  const evs = useSource(live ? "tape_live_events" : "tape_events", symbol, day, EVENT_NEED, tick);
  const wls = useSource(live ? "tape_live_wall" : "tape_chain_runs", symbol, day, WALL_NEED, tick);
  const lbl = useSource("tape_live_label", symbol, day, LABEL_NEED, tick);

  const ready = cyc.rows && evs.rows && wls.rows;

  const model = useMemo(() => {
    if (!cyc.rows || !evs.rows || !wls.rows) return null;
    // front expiry only, so strikes from several expiries never mix
    const exps = [...new Set(cyc.rows.map((r) => String(r.expiry ?? "")))].filter(Boolean).sort();
    const front = exps[0] ?? null;
    const cycles = (front ? cyc.rows.filter((r) => String(r.expiry) === front) : cyc.rows) as unknown as CycleRow[];
    const events = (front ? evs.rows.filter((r) => r.expiry == null || String(r.expiry) === front) : evs.rows) as unknown as EventRow[];
    const walls = wls.rows as unknown as WallRow[];
    const lastCycle = cycles.reduce((m, r) => Math.max(m, floor5(ms(r.ts_ist))), 0);
    const g = grid(day).filter((T) => !live || T <= now);
    const build = (side: WallSide): Cell[] => g.map((T) => {
      const f = deriveFlags({ cycles, events, walls }, side, T);
      return { T, K: f.K, flags: f, out: labelWall(f) };
    });
    return { cycles: cycles as unknown as Row[], walls, lastCycle, CALL: build("CALL"), PUT: build("PUT") };
  }, [cyc.rows, evs.rows, wls.rows, day, live, now]);

  const stored = useMemo(() => {
    const m: Record<WallSide, Map<number, string>> = { CALL: new Map(), PUT: new Map() };
    for (const r of lbl.rows ?? []) {
      const w = String(r.wall ?? "").toUpperCase();
      const side: WallSide | null = w.startsWith("CALL") || w === "CE" ? "CALL" : w.startsWith("PUT") || w === "PE" ? "PUT" : null;
      if (side && typeof r.ts_ist === "string") m[side].set(floor5(ms(r.ts_ist)), String(r.label));
    }
    return m;
  }, [lbl.rows]);
  const hasStored = (lbl.rows?.length ?? 0) > 0;

  // freshness (today only)
  const asOf = useMemo(() => {
    let best = 0;
    for (const s of [cyc, evs, wls, lbl]) for (const r of s.rows ?? []) {
      const v = typeof r.as_of === "string" ? ms(r.as_of) : 0;
      if (v > best) best = v;
    }
    return best || null;
  }, [cyc, evs, wls, lbl]);
  const asOfMissing = live && (cyc.rows?.length ?? 0) > 0 && !("as_of" in (cyc.rows?.[0] ?? {}));
  const inSession = now >= istMs(day, 9, 15) && now <= istMs(day, 15, 30);
  const fresh = live && asOf != null && now - asOf < 7 * MIN && inSession;

  const lastIdx = (cells: Cell[]) => {
    for (let i = cells.length - 1; i >= 0; i--) if (cells[i].T <= (model?.lastCycle ?? 0)) return i;
    return -1;
  };
  const cardFor = (side: WallSide) => {
    if (!model) return { cell: null, prevK: null };
    const cells = model[side];
    const i = lastIdx(cells);
    if (i < 0) return { cell: null, prevK: null };
    const prev = wallAt(model.walls, side, cells[i].T - 5 * MIN);
    return { cell: cells[i], prevK: prev?.strike ?? null };
  };

  const errs = [
    [live ? "tape_live_cycle" : "tape_strike_cycle", cyc],
    [live ? "tape_live_events" : "tape_events", evs],
    [live ? "tape_live_wall" : "tape_chain_runs", wls],
  ] as const;
  const missing = [...cyc.missing, ...evs.missing, ...wls.missing, ...lbl.missing, ...(asOfMissing ? ["as_of"] : [])];

  return (
    <div>
      <div className="mb-2 rounded-md px-3 py-1.5 text-[12px] font-semibold" style={{ background: "var(--s2)", color: "var(--ink-1)", border: "1px solid var(--line-2)" }}>
        Display only, not evidence.
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
        {live ? (
          fresh ? <span className="rounded px-2 py-0.5 font-bold tracking-[0.08em]" style={{ background: "var(--ink-1)", color: "var(--bg)" }}>LIVE</span>
            : <span className="rounded px-2 py-0.5" style={{ background: "var(--alert-bg)", color: "var(--alert-fg)" }}>
                {asOf != null ? `No new cycle since ${hhmm(asOf)} IST` : "No new cycle since session start"}
              </span>
        ) : <span className="rounded px-2 py-0.5 font-semibold" style={{ border: "1px solid var(--line-2)", color: "var(--ink-2)" }}>Replay</span>}
        {missing.map((c) => <MissingChip key={c} col={c} />)}
        {!hasStored && lbl.rows && <span style={{ color: "var(--ink-3)" }}>no as-seen record for this day</span>}
        {lbl.err && <span style={{ color: "var(--ink-3)" }}>tape_live_label unavailable · {lbl.err}</span>}
      </div>
      {errs.filter(([, s]) => s.err).map(([t, s]) => (
        <div key={t} className="mb-2 rounded-md px-3 py-2 text-[12px]" style={{ background: "var(--alert-bg)", color: "var(--alert-fg)" }}>
          {t} request failed · {s.err}
        </div>
      ))}
      {errs.filter(([, s]) => s.rows && s.rows.length === 0).map(([t]) => (
        <div key={t} className="mb-1 text-[12px]" style={{ color: "var(--ink-3)" }}>{t}: no rows for this symbol and day</div>
      ))}
      {!ready ? (
        errs.some(([, s]) => s.err) ? null : <div className="h-40 w-full rounded-md" style={{ background: "var(--s1)", border: "1px solid var(--line)" }} />
      ) : (
        <>
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            {(["CALL", "PUT"] as const).map((s) => { const c = cardFor(s); return <WallCard key={s} side={s} cell={c.cell} prevK={c.prevK} cycles={model!.cycles} />; })}
          </div>
          <div className="rounded-md p-2" style={{ background: "var(--s1)", border: "1px solid var(--line)" }}>
            <Strip side="CALL" cells={model!.CALL} stored={stored.CALL} hasStored={hasStored} />
            <Strip side="PUT" cells={model!.PUT} stored={stored.PUT} hasStored={hasStored} />
            <div className="flex flex-wrap gap-3 text-[10px]" style={{ color: "var(--ink-3)" }}>
              {(["HIT", "ABSORBED", "THINNING", "QUIET", "NO_READ"] as const).map((l) => (
                <span key={l} className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-3" style={{ background: l === "NO_READ" ? HATCH : TONE[l] }} />
                  {l === "NO_READ" ? "NO_READ (gap)" : l}
                </span>
              ))}
              {hasStored && <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--sel)" }} />stored differs from recomputed</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
