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
  if (!cell) return <Card title={`${side} wall`}><div className="text-[12px]" style={{ color: "var(--ink-3)" }}>no cycle yet</div></Card>;
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
    <Card title={`${side} wall`}>
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

function PinChip({ text }: { text: string }) {
  return <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ border: "1px solid var(--line-2)", color: "var(--ink-2)" }}>{text}</span>;
}

function LegDetail({ cycles, K, leg, T, flags, out, readout }: {
  cycles: Row[]; K: number; leg: "CE" | "PE"; T: number; flags: Flags; out: LabelOut; readout: string;
}) {
  const at = cycles.filter((r) => r.strike === K && r.leg === leg);
  const row = at.find((r) => ms(String(r.ts_ist)) === T) ?? null;
  const win = at.filter((r) => { const t = ms(String(r.ts_ist)); return t > T - 15 * MIN && t <= T; });
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
    <div className="mt-2 rounded px-2 py-1.5" style={{ border: "1px solid var(--line)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip label={out.label} />
        <span className="text-[11px]" style={{ color: "var(--ink-2)" }}>{leg}</span>
      </div>
      {out.reason && <div className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>{out.partial ? "partial · " : ""}{out.reason}</div>}
      <div className="mt-2 flex flex-wrap gap-1.5">{flag(flags.C, "T1 flow burst")}{flag(flags.N, "T3 offers thinning")}</div>
      <div className="mt-2 grid gap-0.5">
        {val("oi_last", n(row?.oi_last, 0, " contracts"))}
        {val("OI build (15 min)", build == null ? "no value" : n(build, 0, " contracts"))}
        {val("resting_imb", n(row?.resting_imb, 2))}
        {val("balance_5", n(row?.balance_5, 0, " contracts"))}
        {val("classified_share_5", share == null ? "no value" : n(share, 1, " %"))}
        {val("buy_5", n(row?.buy_5, 0, " contracts"))}
        {val("sell_5", n(row?.sell_5, 0, " contracts"))}
      </div>
      {readout ? <div className="mt-1.5 text-[11px]" style={{ color: "var(--ink-2)" }}>{readout}</div> : null}
    </div>
  );
}

function PinCard({ cell, cycles, resolved }: { cell: PinCell | null; cycles: Row[]; resolved: boolean }) {
  if (!cell || !resolved)
    return <Card title="PIN"><div className="text-[12px]" style={{ color: "var(--ink-3)" }}>no cycle yet</div></Card>;
  const p = cell.pin;
  if (!p || !cell.gate) {
    return (
      <Card title="PIN">
        <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>{cell.expiryDiffers ? "pin expiry differs" : "no pin on this run"}</div>
        {cell.tapeDiffers != null && <div className="mt-1"><PinChip text={`pin differs from tape record (${n(cell.tapeDiffers)})`} /></div>}
      </Card>
    );
  }
  const g = cell.gate;
  const K = num(p.pin_leader_strike);
  const held = num(p.held_for_cycles);
  const dte = num(p.dte);
  const reconciled = p.reconciled_at != null;
  const approach = g.primary === "CE" ? "CE faces price" : g.primary === "PE" ? "PE faces price" : g.primary === "BOTH" ? "at the pin" : "approach unknown";
  const gatedText =
    g.mode === "NO_PIN" ? "no pin on this run"
    : g.mode === "SUPPRESSED_DTE0" ? "pin label suppressed at 0 DTE"
    : g.mode === "CONTESTED" ? `pin contested · ${p.pin_state == null ? "state n/a" : String(p.pin_state)} · held ${held ?? "n/a"} cycles`
    : null;
  return (
    <Card title="PIN">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-semibold" style={{ ...mono, color: "var(--ink-1)" }}>{K == null ? "no pin" : n(K)}</span>
        <span className="text-[11px]" style={{ color: "var(--ink-2)" }}>{signWord(cell.sign)}</span>
        <span className="text-[11px]" style={{ ...mono, color: "var(--ink-3)" }}>{hhmm(cell.T)} IST</span>
      </div>
      <div className="mt-1 text-[11px]" style={{ color: "var(--ink-2)" }}>
        {p.pin_state == null ? "state n/a" : String(p.pin_state)} · held {held ?? "n/a"} cycles · {reconciled ? "reconciled" : "live"} · DTE {dte ?? "n/a"}
      </div>
      {cell.movedFrom != null && K != null && (
        <div className="mt-1 text-[11px]" style={{ color: "var(--ink-2)" }}>pin moved from {n(cell.movedFrom)}</div>
      )}
      <div className="mt-1 flex flex-wrap gap-1.5">
        {cell.tapeDiffers != null && <PinChip text={`pin differs from tape record (${n(cell.tapeDiffers)})`} />}
        {(g.mode === "OWNED_BY_CALL" || g.mode === "OWNED_BOTH") && <PinChip text="≡ CALL OI WALL" />}
        {(g.mode === "OWNED_BY_PUT" || g.mode === "OWNED_BOTH") && <PinChip text="≡ PUT OI WALL" />}
      </div>
      {gatedText
        ? <div className="mt-2 text-[12px]" style={{ color: "var(--ink-2)" }}>{gatedText}</div>
        : (
          <>
            <div className="mt-1 text-[11px]" style={{ color: "var(--ink-2)" }}>{approach}</div>
            {cell.legs.map((l) => (
              <LegDetail key={l.leg} cycles={cycles} K={K!} leg={l.leg} T={cell.T} flags={l.flags} out={l.out}
                readout={pinReadout(cell.sign, l.out.label, l.out.partial)} />
            ))}
          </>
        )}
    </Card>
  );
}

function PinStrip({ cells, resolved }: { cells: PinCell[]; resolved: boolean }) {
  const [hover, setHover] = useState<PinCell | null>(null);
  const tone = (l: Label) => (l === "NO_READ" ? "transparent" : TONE[l as Exclude<Label, "NO_READ">]);
  const tickStyle = (c: PinCell): React.CSSProperties => {
    if (!resolved) return { background: "transparent" };
    const g = c.gate;
    if (!c.pin || !g) return { background: GATED_HATCH };
    if (g.mode === "NO_PIN" || g.mode === "SUPPRESSED_DTE0" || g.mode === "CONTESTED" || g.mode === "OWNED_BOTH")
      return { background: GATED_HATCH };
    const lab = (leg: "CE" | "PE"): Label => c.legs.find((l) => l.leg === leg)?.out.label ?? "NO_READ";
    if (g.primary === "BOTH")
      return { background: `linear-gradient(to bottom, ${tone(lab("CE"))} 0 50%, ${tone(lab("PE"))} 50% 100%)` };
    const prim = g.primary === "CE" || g.primary === "PE" ? g.primary : c.legs[0]?.leg;
    return { background: prim ? tone(lab(prim)) : "transparent" };
  };
  const hoverText = (c: PinCell): string => {
    if (!resolved) return `${hhmm(c.T)} IST · pin source not yet loaded`;
    const p = c.pin;
    if (!p || !c.gate) return `${hhmm(c.T)} IST · ${c.expiryDiffers ? "pin expiry differs" : "no pin on this run"}`;
    const g = c.gate;
    const K = num(p.pin_leader_strike);
    const legTxt = c.legs.map((l) => `${l.leg} ${l.out.label}${l.out.partial ? " (partial)" : ""}`).join(" · ");
    const prim = c.legs.find((l) => l.leg === g.primary) ?? c.legs[0];
    const ro = prim ? pinReadout(c.sign, prim.out.label, prim.out.partial) : "";
    return `${hhmm(c.T)} IST · pin ${K ?? "none"} · ${g.mode} · ${signWord(c.sign)} · ${p.pin_state == null ? "state n/a" : String(p.pin_state)}${legTxt ? ` · ${legTxt}` : ""}${ro ? ` · ${ro}` : ""}${c.tapeDiffers != null ? ` · pin differs from tape record (${n(c.tapeDiffers)})` : ""}`;
  };
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>
        <span>PIN</span>
        <span className="normal-case tracking-normal" style={mono}>09:20 – 15:30 IST · 5 min</span>
      </div>
      <div className="flex h-6 gap-px">
        {cells.map((c) => (
          <div key={c.T} className="relative flex-1" onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)}
            style={tickStyle(c)} title={hoverText(c)} />
        ))}
      </div>
      <div className="mt-1 min-h-[16px] text-[11px]" style={{ ...mono, color: "var(--ink-2)" }}>
        {hover && hoverText(hover)}
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
  const wls = useSource(live ? "tape_live_wall" : "tape_chain_runs", symbol, day, live ? WALL_NEED : WALL_NEED_REPLAY, tick);
  const lbl = useSource("tape_live_label", symbol, day, LABEL_NEED, tick);
  const pin = usePinSource(symbol, day, tick);

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
    // step = smallest positive difference between distinct strikes (front expiry)
    const strikes = [...new Set(cycles.map((r) => r.strike).filter((x): x is number => typeof x === "number"))].sort((a, b) => a - b);
    let step: number | null = null;
    for (let i = 1; i < strikes.length; i++) {
      const d = strikes[i] - strikes[i - 1];
      if (d > 0 && (step == null || d < step)) step = d;
    }
    const pinRows = pin.rows ?? [];
    const pinCells: PinCell[] = g.map((T, i) => {
      const p = pinAt(pinRows, T);
      const expiryDiffers = p != null && front != null && String(p.expiry_date ?? "") !== front;
      const usable = p != null && !expiryDiffers;
      let tapeDiffers: number | null = null;
      if (usable && !live) {
        const run = wls.rows!.find((r) => r.chain_run_id != null && r.chain_run_id === p!.run_id);
        const ls = num(run?.leader_strike);
        if (ls != null && ls !== p!.pin_leader_strike) tapeDiffers = ls;
      }
      const gate = usable
        ? pinGate({
            K: num(p!.pin_leader_strike),
            dte: num(p!.dte),
            pin_state: p!.pin_state == null ? null : String(p!.pin_state),
            call_wall: num(p!.call_wall_strike),
            put_wall: num(p!.put_wall_strike),
            spot: num(p!.spot),
            step,
          })
        : null;
      const sign = usable ? pinSign(num(p!.gamma_at_pin)) : null;
      const K = usable ? num(p!.pin_leader_strike) : null;
      const legs: PinLeg[] =
        gate && K != null
          ? gate.legs.map((leg) => {
              const f = flagsAt({ cycles, events, walls }, K, leg, T);
              return { leg, flags: f, out: labelWall(f) };
            })
          : [];
      const prev = i > 0 ? pinAt(pinRows, g[i - 1]) : null;
      const movedFrom =
        usable && prev && num(prev.pin_leader_strike) != null && prev.pin_leader_strike !== p!.pin_leader_strike
          ? num(prev.pin_leader_strike)
          : null;
      return { T, pin: usable ? p : null, expiryDiffers, tapeDiffers, gate, sign, legs, movedFrom };
    });
    return { cycles: cycles as unknown as Row[], walls, lastCycle, CALL: build("CALL"), PUT: build("PUT"), PIN: pinCells };
  }, [cyc.rows, evs.rows, wls.rows, pin.rows, day, live, now]);

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
  const pinCardCell = (() => {
    if (!model) return null;
    const i = Math.max(lastIdx(model.CALL), lastIdx(model.PUT));
    return i < 0 ? null : (model.PIN[i] ?? null);
  })();

  const errs = [
    [live ? "tape_live_cycle" : "tape_strike_cycle", cyc],
    [live ? "tape_live_events" : "tape_events", evs],
    [live ? "tape_live_wall" : "tape_chain_runs", wls],
  ] as const;
  const missing = [...cyc.missing, ...evs.missing, ...wls.missing, ...lbl.missing, ...pin.missing, ...(asOfMissing ? ["as_of"] : [])];
  const pinResolved = pin.rows != null || pin.err != null;

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
        {pin.err && <span className="rounded px-2 py-0.5" style={{ border: "1px solid var(--line-2)", color: "var(--ink-2)" }}>pin source unavailable · {pin.err}</span>}
        {!pin.err && pin.rows && pin.rows.length === 0 && <span style={{ color: "var(--ink-3)" }}>no pin rows for this day</span>}
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
          <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(["CALL", "PUT"] as const).map((s) => { const c = cardFor(s); return <WallCard key={s} side={s} cell={c.cell} prevK={c.prevK} cycles={model!.cycles} />; })}
            <PinCard cell={pinCardCell} cycles={model!.cycles} resolved={pinResolved} />
          </div>
          <div className="rounded-md p-2" style={{ background: "var(--s1)", border: "1px solid var(--line)" }}>
            <Strip side="CALL" cells={model!.CALL} stored={stored.CALL} hasStored={hasStored} />
            <Strip side="PUT" cells={model!.PUT} stored={stored.PUT} hasStored={hasStored} />
            <PinStrip cells={model!.PIN} resolved={pinResolved} />
            <div className="flex flex-wrap gap-3 text-[10px]" style={{ color: "var(--ink-3)" }}>
              {(["HIT", "ABSORBED", "THINNING", "QUIET", "NO_READ"] as const).map((l) => (
                <span key={l} className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-3" style={{ background: l === "NO_READ" ? HATCH : TONE[l] }} />
                  {l === "NO_READ" ? "NO_READ (gap)" : l}
                </span>
              ))}
              {hasStored && <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--sel)" }} />stored differs from recomputed</span>}
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-3" style={{ background: GATED_HATCH }} />pin gated (no label)</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
