// Shared strike ladder (Phase 1b). Every Board tab draws its data layer on this.
import { useMemo } from "react";

export type LevelStyle = "spot" | "solid" | "dashed" | "dotted";
export type Level = { id: string; name: string; at: number; style: LevelStyle };
export type LadderRow = { strike: number; value: number | null; readout: string; tint?: number | null; full?: string };

const fmt = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 1 });
const mix = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const rank: Record<LevelStyle, number> = { spot: 0, solid: 1, dashed: 2, dotted: 3 };

type Props = {
  rows: LadderRow[];            // full chain, ascending
  lo: number; hi: number; step: number;
  spot: number | null;
  levels: Level[];
  priced: { lo: number; hi: number } | null;
  pin: { lo: number; hi: number } | null;
  corridor: { lo: number; hi: number } | null;
  signed: boolean;
  selected: string | null;      // selection id
  selLevelIds: string[];        // level ids lit by the selection
  selPriced: boolean;
  hover: number | null;
  onHover: (strike: number | null) => void;
  onSelectLevel: (id: string) => void;
  onInclude: (at: number) => void;
  onRecentre: (strike: number) => void;
  phone: boolean;
  silhouette?: Map<number, number> | null; // running Σ gex_cr from the highest strike down
};

function rule(style: LevelStyle, sel: boolean) {
  const c = sel ? "var(--sel)" : style === "spot" ? "var(--ink-1)" : "var(--rule)";
  const w = style === "spot" ? 2 : 1;
  const s = style === "dashed" ? "dashed" : style === "dotted" ? "dotted" : "solid";
  return { borderTop: `${w}px ${s} ${c}`, boxShadow: style === "spot" && !sel ? "0 0 6px rgba(236,238,241,0.55)" : undefined };
}

export function StrikeLadder(p: Props) {
  const win = useMemo(() => p.rows.filter((r) => r.strike >= p.lo && r.strike <= p.hi).slice().reverse(), [p.rows, p.lo, p.hi]);
  const rowH = p.phone ? 22 : Math.max(8, Math.min(26, Math.floor(560 / Math.max(1, win.length))));
  const dense = rowH < 14;
  const maxAbs = Math.max(1e-9, ...win.map((r) => Math.abs(r.value ?? 0)));
  const barH = Math.max(6, rowH - 8);
  // The cumulative silhouette owns a stable full-series scale. Strike bars above
  // remain scaled only to their largest visible per-strike magnitude.
  const silMax = p.silhouette ? Math.max(1e-9, ...Array.from(p.silhouette.values(), Math.abs)) : 1;
  const silhouettePoints = p.silhouette ? win.flatMap((r, i) => {
    const value = p.silhouette?.get(r.strike);
    return value == null ? [] : [{ strike: r.strike, x: 50 + (value / silMax) * 48, y: i * rowH + rowH / 2 }];
  }) : [];

  // group levels: on-strike (coincidence joins) vs between strikes
  const strikeSet = new Set(p.rows.map((r) => r.strike));
  const inWin = p.levels.filter((l) => l.at >= p.lo - p.step / 2 && l.at <= p.hi + p.step / 2);
  const onStrike = new Map<number, Level[]>();
  const between: Level[] = [];
  for (const l of inWin) {
    if (strikeSet.has(l.at)) onStrike.set(l.at, [...(onStrike.get(l.at) ?? []), l]);
    else between.push(l);
  }
  const above = p.levels.filter((l) => l.at > p.hi + p.step / 2).sort((a, b) => b.at - a.at);
  const below = p.levels.filter((l) => l.at < p.lo - p.step / 2).sort((a, b) => b.at - a.at);
  const levelStrikes = new Set([...onStrike.keys()]);

  const Chip = ({ l, dir }: { l: Level; dir: "▲" | "▼" }) => (
    <button onClick={() => p.onInclude(l.at)}
      className="rounded border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] hover:bg-[var(--s2)]"
      style={{ borderColor: "var(--line-2)", color: "var(--ink-2)" }}>
      {dir} {l.name} {fmt(l.at)}{p.spot ? ` · ${((l.at - p.spot) / p.spot * 100 >= 0 ? "+" : "−")}${Math.abs((l.at - p.spot) / p.spot * 100).toFixed(2)} %` : ""}
    </button>
  );

  const Pill = ({ ls, sel }: { ls: Level[]; sel: boolean }) => (
    <button onClick={(e) => { e.stopPropagation(); p.onSelectLevel(ls[0].id); }}
      className="absolute right-1 top-1/2 z-10 -translate-y-1/2 whitespace-nowrap rounded px-1.5 text-[9px] font-semibold uppercase leading-[14px] tracking-[0.06em]"
      style={{ background: "var(--s2)", color: sel ? "var(--sel)" : "var(--ink-2)", border: `1px solid ${sel ? "var(--sel)" : "var(--line-2)"}` }}>
      {ls.map((l) => l.name).join(" ≡ ")}
    </button>
  );

  // build the item list, inserting between-strike markers
  const items: ({ kind: "row"; r: LadderRow } | { kind: "mark"; ls: Level[] })[] = [];
  for (let i = 0; i < win.length; i++) {
    const r = win[i];
    if (i === 0) {
      const top = between.filter((l) => l.at > r.strike);
      if (top.length) items.push({ kind: "mark", ls: top });
    }
    items.push({ kind: "row", r });
    const next = win[i + 1];
    const ls = between.filter((l) => l.at < r.strike && (next ? l.at > next.strike : true));
    if (ls.length) items.push({ kind: "mark", ls });
  }

  // minimap
  const chainMax = Math.max(1e-9, ...p.rows.map((r) => Math.abs(r.value ?? 0)));
  const chain = p.rows.slice().reverse();
  const winTop = chain.findIndex((r) => r.strike <= p.hi);
  const winBot = chain.length - 1 - chain.slice().reverse().findIndex((r) => r.strike >= p.lo);
  const spotIdx = p.spot != null ? chain.findIndex((r) => r.strike <= p.spot!) : -1;

  return (
    <div className="min-w-0">
      <div className="mb-1 flex min-h-[22px] flex-wrap gap-1">{above.map((l) => <Chip key={l.id} l={l} dir="▲" />)}</div>
      <div className="flex gap-3">
        <div className="relative min-w-0 flex-1">
          {silhouettePoints.length > 0 && (
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-[70px] right-[74px] z-[5]"
              height={win.length * rowH}
              viewBox={`0 0 100 ${win.length * rowH}`}
              preserveAspectRatio="none"
            >
              {silhouettePoints.length > 1 && (
                <polyline
                  points={silhouettePoints.map((point) => `${point.x},${point.y}`).join(" ")}
                  fill="none"
                  stroke="var(--ink-1)"
                  strokeOpacity={0.42}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
          )}
          {items.map((it, idx) => {
            if (it.kind === "mark") {
              const ls = it.ls.sort((a, b) => rank[a.style] - rank[b.style]);
              const sel = ls.some((l) => p.selLevelIds.includes(l.id));
              return (
                <div key={`m${idx}`} className="relative grid h-0 grid-cols-[60px_10px_1fr_10px_64px]">
                  <div className="absolute left-0 top-0 z-10 -translate-y-1/2 rounded px-1 text-[10px] font-semibold"
                    style={{ background: ls[0].style === "spot" ? "var(--ink-1)" : "var(--s2)", color: ls[0].style === "spot" ? "var(--bg)" : "var(--ink-2)" }}>
                    {fmt(ls[0].at)}
                  </div>
                  <div /><div />
                  <div className="relative">
                    <div className="absolute inset-x-0 top-0 z-[6]" style={rule(ls[0].style, sel)} />
                    <div className="absolute inset-x-0 top-0"><Pill ls={ls} sel={sel} /></div>
                  </div>
                </div>
              );
            }
            const r = it.r;
            const lv = (onStrike.get(r.strike) ?? []).sort((a, b) => rank[a.style] - rank[b.style]);
            const lvSel = lv.some((l) => p.selLevelIds.includes(l.id));
            const isLevel = lv.length > 0;
            const showLabel = !dense || r.strike % (p.step * 4) === 0 || isLevel;
            const inCorr = p.corridor && r.strike >= p.corridor.lo && r.strike <= p.corridor.hi;
            const tint = r.tint == null || r.tint === 0 ? undefined : mix(r.tint > 0 ? "var(--cool)" : "var(--warm)", inCorr ? 11 : 7);
            const inPriced = p.priced && r.strike >= p.priced.lo && r.strike <= p.priced.hi;
            const inPin = p.pin && r.strike >= p.pin.lo && r.strike <= p.pin.hi;
            const w = r.value != null ? (Math.abs(r.value) / maxAbs) * 50 : 0;
            return (
              <div key={r.strike} onMouseEnter={() => p.onHover(r.strike)} onMouseLeave={() => p.onHover(null)}
                className="grid grid-cols-[60px_10px_1fr_10px_64px] items-center"
                style={{ height: rowH, background: p.hover === r.strike ? "var(--s2)" : tint }}>
                <div className="truncate pr-2 text-right text-[10px]" style={{ color: isLevel ? "var(--ink-1)" : "var(--ink-3)" }}>{showLabel ? fmt(r.strike) : ""}</div>
                <div className="h-full" style={{ background: inPriced ? (p.selPriced ? "var(--sel)" : mix("var(--ink-1)", 30)) : undefined }} />
                <div className="relative h-full">
                  {p.signed && <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: "var(--axis)" }} />}
                  {r.value != null && w > 0 && (
                    <div className="absolute top-1/2 -translate-y-1/2" style={{
                      height: barH, width: `${w}%`,
                      left: r.value >= 0 ? "50%" : `${50 - w}%`,
                      background: r.value >= 0 ? "var(--cool)" : "var(--warm)",
                    }} />
                  )}
                  {p.silhouette?.has(r.strike) && (
                    <div className="pointer-events-none absolute top-1/2 z-[7] h-[2px] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={{ left: `${50 + ((p.silhouette.get(r.strike) ?? 0) / silMax) * 48}%`, background: "var(--ink-1)" }} />
                  )}
                  {isLevel && <>
                    <div className="absolute inset-x-0 top-1/2 z-[6]" style={rule(lv[0].style, lvSel)} />
                    <Pill ls={lv} sel={lvSel} />
                  </>}
                </div>
                <div className="h-full" style={{ background: inPin ? mix("var(--cool)", 55) : undefined }} />
                <div className="truncate pl-2 text-right text-[10px]" style={{ color: "var(--ink-2)" }}>{!dense || isLevel ? r.readout : ""}</div>
              </div>
            );
          })}
        </div>
        {!p.phone && (
          <div className="relative w-[30px] shrink-0 cursor-pointer" style={{ height: chain.length * 5 }}>
            {chain.map((r, i) => (
              <div key={r.strike} onClick={() => p.onRecentre(r.strike)} className="absolute left-0 w-full" style={{ top: i * 5, height: 5 }}>
                {r.value != null && <div className="absolute top-1/2 h-[3px] -translate-y-1/2" style={{
                  left: r.value >= 0 ? "50%" : `${50 - (Math.abs(r.value) / chainMax) * 50}%`,
                  width: `${(Math.abs(r.value) / chainMax) * 50}%`,
                  background: r.value >= 0 ? "var(--cool)" : "var(--warm)" }} />}
              </div>
            ))}
            {spotIdx >= 0 && <div className="pointer-events-none absolute left-0 h-px w-full" style={{ top: spotIdx * 5, background: "#fff" }} />}
            {winTop >= 0 && <div className="pointer-events-none absolute left-0 w-full" style={{ top: winTop * 5, height: (winBot - winTop + 1) * 5, border: "1px solid var(--sel)" }} />}
          </div>
        )}
      </div>
      <div className="mt-1 flex min-h-[22px] flex-wrap gap-1">{below.map((l) => <Chip key={l.id} l={l} dir="▼" />)}</div>
      {dense && levelStrikes.size === 0 ? null : null}
    </div>
  );
}
