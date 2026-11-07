// Rules v1 — pure flow-vs-book labelling for the /tape page.
// No I/O, no clock, no randomness: every input is passed in.

export type Leg = "CE" | "PE";
export type WallSide = "CALL" | "PUT";
export type Label = "HIT" | "ABSORBED" | "THINNING" | "QUIET" | "NO_READ";

export type CycleRow = {
  strike: number | null;
  leg: string | null;
  ts_ist: string;
  trades_5?: number | null;
  minutes_present_5?: number | null;
};
export type EventRow = { strike: number | null; leg: string | null; kind: string | null; side: string | null; ts_ist: string };
export type WallRow = { ts_ist: string; call_wall: number | null; put_wall: number | null };

export type Flags = {
  wall_known: boolean;
  in_window: boolean;
  untraded: boolean;
  conc_evaluable: boolean;
  thin_evaluable: boolean;
  C: boolean;
  N: boolean;
};
export type LabelOut = { label: Label; partial: boolean; reason: string };

const MIN = 60_000;
const BIN = 5 * MIN;
const IST_OFFSET = 330 * MIN;

export const ms = (ts: string) => new Date(ts).getTime();
export const floor5 = (t: number) => Math.floor(t / BIN) * BIN;
const istMinutes = (t: number) => {
  const d = new Date(t + IST_OFFSET);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

export const legOf = (w: WallSide): Leg => (w === "CALL" ? "CE" : "PE");

/** Latest wall row whose ts_ist floored to the 5-minute grid is at or before T. */
export function wallAt(walls: WallRow[], w: WallSide, T: number): { strike: number; ts: number } | null {
  let best: { strike: number; ts: number } | null = null;
  for (const r of walls) {
    const t = floor5(ms(r.ts_ist));
    const k = w === "CALL" ? r.call_wall : r.put_wall;
    if (t > T || k == null) continue;
    if (!best || t >= best.ts) best = { strike: k, ts: t };
  }
  return best;
}

export function deriveFlags(
  rows: { cycles: CycleRow[]; events: EventRow[]; walls: WallRow[] },
  wall: WallSide,
  T: number,
): Flags & { K: number | null; leg: Leg } {
  const leg = legOf(wall);
  const w = wallAt(rows.walls, wall, T);
  const K = w ? w.strike : null;
  const at = rows.cycles.filter((r) => r.strike === K && r.leg === leg);
  const inWin = (t: number) => t > T - 15 * MIN && t <= T;

  const in_window = K != null && at.some((r) => ms(r.ts_ist) === T);
  const tradesSince = at.filter((r) => ms(r.ts_ist) <= T).reduce((s, r) => s + (r.trades_5 ?? 0), 0);
  const untraded = K != null && tradesSince === 0 && istMinutes(T) >= 600;
  const conc_evaluable = at.filter((r) => ms(r.ts_ist) < T).length >= 12;
  const thin_evaluable =
    at.filter((r) => { const t = ms(r.ts_ist); return t >= T - 25 * MIN && t <= T; })
      .reduce((s, r) => s + (r.minutes_present_5 ?? 0), 0) >= 20;
  const ev = rows.events.filter((e) => e.strike === K && e.leg === leg && inWin(ms(e.ts_ist)));
  const C = ev.some((e) => e.kind === "CONC");
  const N = ev.some((e) => e.kind === "THIN" && e.side === "ask");

  return { wall_known: w != null, in_window, untraded, conc_evaluable, thin_evaluable, C, N, K, leg };
}

export function labelWall(f: Flags): LabelOut {
  const no = (reason: string): LabelOut => ({ label: "NO_READ", partial: false, reason });
  if (!f.wall_known) return no("no chain run");
  if (!f.in_window) return no("wall outside subscribed window");
  if (f.untraded) return no("untraded wall (vendor OI)");
  if (f.conc_evaluable && f.thin_evaluable) {
    const label: Label = f.C && f.N ? "HIT" : f.C ? "ABSORBED" : f.N ? "THINNING" : "QUIET";
    return { label, partial: false, reason: "" };
  }
  if (f.thin_evaluable) return f.N ? { label: "THINNING", partial: true, reason: "flow n/a" } : no("flow not yet evaluable");
  return no("insufficient history");
}
