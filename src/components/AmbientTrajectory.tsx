// Ambient Trajectory — the Home hero panel (ENH-116 Obj 1, v8).
// Three stacked lanes over a shared x-axis, with a MONTH / CYCLE / WEEK
// timeframe switcher. Every lane reserves a top header strip so labels never
// collide with the plot; every lane autoscales its own range. WEEK floors its
// window to ≥6 sessions when the current cycle is thin, dimming the prior
// cycle so the current one still reads as the subject.
// Settled = solid. Live = dashed / outlined. NULL cycle asym = gap, never 0.
import { useMemo, useState } from "react";
import { MV, fmtNum, Unavailable } from "@/marketview/ui";
import { useAmbientSeries, type AmbientSeriesRow } from "@/lib/queries";

type LiveState = {
  spot: number | null;
  regime: string | null;
  flipLevel: number | null;
  maxGammaStrike: number | null;
  dte: number | null;
  pinRiskScore: number | null;
  ts: string | null;
};

type TF = "MONTH" | "CYCLE" | "WEEK";
type LaneKey = "PRICE" | "CYCLE" | "REGIME";

const normalizeRegime = (r: string | null | undefined): string | null => {
  if (!r) return null;
  const s = String(r).toUpperCase();
  if (s === "LONG_GAMMA" || s.includes("POSITIVE")) return "POSITIVE_γ";
  if (s === "SHORT_GAMMA" || s.includes("NEGATIVE")) return "NEGATIVE_γ";
  if (s === "NO_FLIP") return "MIXED";
  return s;
};

const asNum = (v: any): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—";

// Lane layout per timeframe: order + height (px inside SVG viewBox).
const LANE_CFG: Record<TF, { key: LaneKey; height: number; hint: string }[]> = {
  MONTH: [
    { key: "REGIME", height: 170, hint: "20d γ persistence — positioning cage over weeks" },
    { key: "PRICE",  height: 130, hint: "eod spot · divergence markers on line" },
    { key: "CYCLE",  height: 70,  hint: "cycle OI asymmetry (context)" },
  ],
  CYCLE: [
    { key: "PRICE",  height: 170, hint: "eod spot · settled solid · live NOW dashed" },
    { key: "CYCLE",  height: 100, hint: "cycle OI asymmetry — up = ceiling, down = floor" },
    { key: "REGIME", height: 80,  hint: "20d γ persistence" },
  ],
  WEEK: [
    { key: "PRICE",  height: 230, hint: "flip & max-γ as reference lines" },
    { key: "CYCLE",  height: 90,  hint: "this cycle's OI build" },
  ],
};

const HEADER_H = 22;   // reserved band at top of each lane for label + hint
const LANE_GAP = 10;   // vertical padding between lanes
const AXIS_BAND = 30;  // reserved band below last lane for x-axis date labels
const TOP_PAD = 20;    // room above top lane for cycle-divider labels

export function AmbientTrajectory({
  symbol,
  live,
}: {
  symbol: "NIFTY" | "SENSEX";
  live: LiveState;
}) {
  const series = useAmbientSeries(symbol, 60);
  const raw = (series.data ?? []) as AmbientSeriesRow[];

  const [tf, setTf] = useState<TF>("CYCLE");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // ---- Coerce ------------------------------------------------------------
  const coerced = useMemo(
    () =>
      raw.map((r) => ({
        ...r,
        eod_spot: asNum(r.eod_spot),
        cycle_oi_call_put_asym: asNum(r.cycle_oi_call_put_asym),
        gex_regime_persistence_20d: asNum(r.gex_regime_persistence_20d),
        max_gamma_strike_drift_5d: asNum(r.max_gamma_strike_drift_5d),
      })),
    [raw],
  );

  const allBoundaries = useMemo(() => {
    const b: number[] = [];
    for (let i = 1; i < coerced.length; i++) {
      if (coerced[i].front_expiry !== coerced[i - 1].front_expiry) b.push(i);
    }
    return b;
  }, [coerced]);

  // ---- Window by timeframe ----------------------------------------------
  // dimUntilIdx = number of leading rows in `rows` that belong to the prior
  // cycle (rendered dim). 0 means everything is current-cycle.
  const { rows, dimUntilIdx, weekCurrentCount } = useMemo(() => {
    if (tf === "MONTH" || coerced.length < 3) {
      return { rows: coerced, dimUntilIdx: 0, weekCurrentCount: coerced.length };
    }
    if (tf === "CYCLE") {
      let start = 0;
      if (allBoundaries.length >= 2) start = allBoundaries[allBoundaries.length - 2];
      else if (allBoundaries.length === 1) start = allBoundaries[0];
      return { rows: coerced.slice(start), dimUntilIdx: 0, weekCurrentCount: coerced.length - start };
    }
    // WEEK — current cycle only, floored to ≥ 6 rows if possible
    const curStart = allBoundaries.length ? allBoundaries[allBoundaries.length - 1] : 0;
    const currentCount = coerced.length - curStart;
    if (currentCount >= 4) {
      return { rows: coerced.slice(curStart), dimUntilIdx: 0, weekCurrentCount: currentCount };
    }
    // Extend backwards until we have ≥ 6 rows.
    let start = curStart;
    // Walk boundaries backwards.
    for (let bi = allBoundaries.length - 2; bi >= 0; bi--) {
      start = allBoundaries[bi];
      if (coerced.length - start >= 6) break;
    }
    if (coerced.length - start < 6) start = 0;
    const winRows = coerced.slice(start);
    const dim = curStart - start;
    return { rows: winRows, dimUntilIdx: dim, weekCurrentCount: currentCount };
  }, [coerced, allBoundaries, tf]);

  const rowBoundaries = useMemo(() => {
    const b: number[] = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].front_expiry !== rows[i - 1].front_expiry) b.push(i);
    }
    return b;
  }, [rows]);

  // ---- Degraded ---------------------------------------------------------
  if (rows.length < 2) {
    return (
      <div className="rounded-lg" style={{ background: MV.card, border: `1px solid ${MV.border}`, padding: "20px 22px" }}>
        <HeaderBar symbol={symbol} settledThrough={rows[rows.length - 1]?.as_of_date ?? null} tf={tf} setTf={setTf} />
        <Unavailable label={`trajectory building — ${rows.length} settled session${rows.length === 1 ? "" : "s"} in ${tf.toLowerCase()} window`} />
      </div>
    );
  }

  const last = rows[rows.length - 1];

  // ---- Tail divergence run ---------------------------------------------
  let tailDivergent = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].lens_alignment === "DIVERGENT") tailDivergent++;
    else break;
  }

  // ---- Persistence chip (Clock 1 headline) -----------------------------
  const lastPersistence = last.gex_regime_persistence_20d;
  const lastDrift = last.max_gamma_strike_drift_5d;
  const persistenceChip =
    lastPersistence == null
      ? { text: "PERSISTENCE —", color: MV.weak }
      : lastPersistence >= 0.7
        ? { text: "PERSISTENT LONG-γ (caged)", color: MV.green }
        : lastPersistence <= 0.3
          ? { text: "PERSISTENT SHORT-γ (trending)", color: MV.red }
          : { text: "MIXED-γ", color: MV.amber };
  const driftArrow = lastDrift == null ? "→" : lastDrift > 5 ? "↑" : lastDrift < -5 ? "↓" : "→";
  const driftLabel =
    lastDrift == null
      ? "magnet drift unavailable"
      : `magnet ${driftArrow === "↑" ? "up" : driftArrow === "↓" ? "down" : "flat"} (${lastDrift >= 0 ? "+" : ""}${lastDrift.toFixed(1)} pts/session)`;

  // ---- Live drift banner (WEEK view only per spec) ---------------------
  const liveN = normalizeRegime(live.regime);
  const settledN = normalizeRegime(last.net_gex_regime);
  const intradayDrift = liveN && settledN && liveN !== settledN;

  // ---- Geometry --------------------------------------------------------
  const lanes = LANE_CFG[tf];
  const W = 1200;
  const padL = 60;
  const padR = tf === "MONTH" ? 24 : 100;
  const laneTotal = lanes.reduce((a, l) => a + l.height, 0) + LANE_GAP * (lanes.length - 1);
  const H = TOP_PAD + laneTotal + AXIS_BAND;
  const cw = W - padL - padR;

  // Lane offsets → each lane has a header strip (top) + plot area (below).
  const laneY: Record<LaneKey, { y0: number; h: number; plotY0: number; plotH: number }> = {} as any;
  {
    let y = TOP_PAD;
    for (const l of lanes) {
      const plotY0 = y + HEADER_H;
      const plotH = Math.max(20, l.height - HEADER_H);
      laneY[l.key] = { y0: y, h: l.height, plotY0, plotH };
      y += l.height + LANE_GAP;
    }
  }
  const chartTop = TOP_PAD;
  const chartBottom = TOP_PAD + laneTotal;

  // X axis (settled slots), live rail to the right of cw
  const n = rows.length;
  const xStep = n > 1 ? cw / (n - 1) : cw;
  const x = (i: number) => padL + i * xStep;
  const liveX = padL + cw + 28;
  const showLiveRail = (tf === "CYCLE" || tf === "WEEK") && live.spot != null;

  // Dim overlay covers rows [0, dimUntilIdx) — draw between them and their
  // right-neighbour so the boundary divider lands right at the edge.
  const dimOverlayX2 =
    dimUntilIdx > 0 && dimUntilIdx < rows.length ? x(dimUntilIdx) - xStep / 2 : null;

  // -- PRICE scale
  const spots = rows.map((r) => r.eod_spot).filter((v): v is number => v != null);
  const priceSet: number[] = [...spots];
  if (showLiveRail && live.spot != null) priceSet.push(live.spot);
  if (tf === "WEEK") {
    if (live.flipLevel != null) priceSet.push(live.flipLevel);
    if (live.maxGammaStrike != null) priceSet.push(live.maxGammaStrike);
  }
  const pMin = Math.min(...priceSet);
  const pMax = Math.max(...priceSet);
  const pPad = (pMax - pMin) * 0.08 || Math.max(1, pMax * 0.001);
  const priceLane = laneY.PRICE;
  const yPrice = (v: number) =>
    priceLane.plotY0 + priceLane.plotH - ((v - (pMin - pPad)) / ((pMax + pPad) - (pMin - pPad))) * priceLane.plotH;

  // -- CYCLE scale (autoscale to observed |asym|)
  const asymAbs = rows.map((r) => (r.cycle_oi_call_put_asym != null ? Math.abs(r.cycle_oi_call_put_asym) : 0));
  const asymMax = Math.max(0.02, ...asymAbs) * 1.2;
  const cycleLane = laneY.CYCLE;
  const cycleMid = cycleLane.plotY0 + cycleLane.plotH / 2;
  const yCycle = (v: number) =>
    cycleMid - (Math.max(-asymMax, Math.min(asymMax, v)) / asymMax) * (cycleLane.plotH / 2);
  const cycleHasData = rows.some((r) => r.cycle_oi_call_put_asym != null);

  // -- REGIME scale (autoscale to observed persistence)
  const persistVals = rows.map((r) => r.gex_regime_persistence_20d).filter((v): v is number => v != null);
  const rMin = persistVals.length ? Math.max(0, Math.min(...persistVals) - 0.05) : 0;
  const rMax = persistVals.length ? Math.min(1, Math.max(...persistVals) + 0.05) : 1;
  const regimeLane = laneY.REGIME as { y0: number; h: number; plotY0: number; plotH: number } | undefined;
  const yRegime = regimeLane
    ? (v: number) => regimeLane.plotY0 + regimeLane.plotH - ((v - rMin) / (rMax - rMin || 1)) * regimeLane.plotH
    : null;

  // ---- Paths -----------------------------------------------------------
  const pricePath = (() => {
    const parts: string[] = [];
    let cur: string[] = [];
    rows.forEach((r, i) => {
      if (r.eod_spot != null) cur.push(`${cur.length === 0 ? "M" : "L"}${x(i).toFixed(1)},${yPrice(r.eod_spot).toFixed(1)}`);
      else if (cur.length) { parts.push(cur.join(" ")); cur = []; }
    });
    if (cur.length) parts.push(cur.join(" "));
    return parts;
  })();

  const regimePath = (() => {
    if (!yRegime) return [];
    const parts: string[] = [];
    let cur: string[] = [];
    rows.forEach((r, i) => {
      const v = r.gex_regime_persistence_20d;
      if (v != null) cur.push(`${cur.length === 0 ? "M" : "L"}${x(i).toFixed(1)},${yRegime(v).toFixed(1)}`);
      else if (cur.length) { parts.push(cur.join(" ")); cur = []; }
    });
    if (cur.length) parts.push(cur.join(" "));
    return parts;
  })();

  // Cycle runs (contiguous non-null)
  type Seg = { pts: { i: number; v: number }[] };
  const runs: Seg[] = [];
  {
    let run: Seg | null = null;
    rows.forEach((r, i) => {
      if (r.cycle_oi_call_put_asym != null) {
        if (!run) run = { pts: [] };
        run.pts.push({ i, v: r.cycle_oi_call_put_asym });
      } else if (run) { runs.push(run); run = null; }
    });
    if (run) runs.push(run);
  }

  const laneLabel = (key: LaneKey): string =>
    key === "PRICE" ? "PRICE" : key === "CYCLE" ? "CLOCK 2 · CYCLE" : "CLOCK 1 · REGIME";

  // Helper: place a reference-line label so it never sits inside the lane
  // header band. Default above the line; if that lands in the header, drop
  // it below.
  const refLabelY = (lineY: number) => {
    const headerBottom = priceLane.plotY0;
    if (lineY - 3 < headerBottom + 4) return lineY + 11;
    return lineY - 3;
  };

  // Lane subtitle for WEEK's PRICE lane (window context)
  const priceHintOverride =
    tf === "WEEK"
      ? dimUntilIdx > 0
        ? `this cycle (${weekCurrentCount} session${weekCurrentCount === 1 ? "" : "s"}) · prior cycle shown for context`
        : `this cycle · ${weekCurrentCount} session${weekCurrentCount === 1 ? "" : "s"}`
      : null;

  return (
    <div className="rounded-lg" style={{ background: MV.card, border: `1px solid ${MV.border}`, padding: "20px 22px" }}>
      <HeaderBar symbol={symbol} settledThrough={last.as_of_date} tf={tf} setTf={setTf} />

      {/* Divergence run callout */}
      {tailDivergent >= 2 && (
        <div className="mb-3 rounded-md px-3 py-2 text-[12px] font-semibold leading-snug"
          style={{ background: MV.amber + "1f", border: `1px solid ${MV.amber}55`, color: MV.amber, fontFamily: MV.mono }}>
            ⚠ LENSES DIVERGENT — {tailDivergent} consecutive sessions. Conviction reduced; the room is changing.
        </div>
      )}

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" preserveAspectRatio="none"
          onMouseLeave={() => setHoverIdx(null)}>

          {/* --- Per-lane header strips (top-left labels, separator) --- */}
          {lanes.map((l) => (
            <g key={`lbl${l.key}`}>
              <line x1={padL} x2={padL + cw} y1={laneY[l.key].y0} y2={laneY[l.key].y0}
                stroke={MV.border} strokeWidth="0.4" opacity={0.4} />
              <text x={padL + 4} y={laneY[l.key].y0 + 10} fontSize="9" fontWeight={700}
                fill={MV.mid} style={{ fontFamily: MV.mono }}>{laneLabel(l.key)}</text>
              <text x={padL + 4} y={laneY[l.key].y0 + 19} fontSize="8"
                fill={MV.weak} style={{ fontFamily: MV.mono }}>
                {l.key === "PRICE" && priceHintOverride ? priceHintOverride : l.hint}
              </text>
            </g>
          ))}

          {/* ==================== PRICE LANE ==================== */}
          {/* Y ticks: min & max only, at the plot area edges (not header). */}
          {[pMin - pPad, pMax + pPad].map((v, k) => (
            <g key={`py${k}`}>
              <line x1={padL} x2={padL + cw} y1={yPrice(v)} y2={yPrice(v)}
                stroke={MV.border} strokeWidth="0.4" opacity={0.35} />
              <text x={padL - 6} y={yPrice(v) + (k === 0 ? -2 : 8)} textAnchor="end" fontSize="9" fill={MV.weak}
                style={{ fontFamily: MV.mono }}>{fmtNum(v, { maximumFractionDigits: 0 })}</text>
            </g>
          ))}
          {/* WEEK: flip + max-γ reference lines across price lane */}
          {tf === "WEEK" && live.flipLevel != null && live.flipLevel >= pMin - pPad && live.flipLevel <= pMax + pPad && (() => {
            const ly = yPrice(live.flipLevel);
            return (
              <g>
                <line x1={padL} x2={padL + cw + (showLiveRail ? 30 : 0)} y1={ly} y2={ly}
                  stroke={MV.amber} strokeWidth="1" strokeDasharray="3,3" opacity={0.75} />
                <text x={padL + cw - 4} y={refLabelY(ly)} textAnchor="end" fontSize="9"
                  fill={MV.amber} style={{ fontFamily: MV.mono }}>
                  flip {fmtNum(live.flipLevel, { maximumFractionDigits: 0 })}
                </text>
              </g>
            );
          })()}
          {tf === "WEEK" && live.maxGammaStrike != null && live.maxGammaStrike >= pMin - pPad && live.maxGammaStrike <= pMax + pPad && (() => {
            const ly = yPrice(live.maxGammaStrike);
            return (
              <g>
                <line x1={padL} x2={padL + cw + (showLiveRail ? 30 : 0)} y1={ly} y2={ly}
                  stroke={MV.purple} strokeWidth="1" strokeDasharray="3,3" opacity={0.75} />
                <text x={padL + cw - 4} y={refLabelY(ly)} textAnchor="end" fontSize="9"
                  fill={MV.purple} style={{ fontFamily: MV.mono }}>
                  max γ {fmtNum(live.maxGammaStrike, { maximumFractionDigits: 0 })}
                </text>
              </g>
            );
          })()}
          {pricePath.map((p, k) => (
            <path key={`pp${k}`} d={p} fill="none" stroke={MV.blueLine} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
          ))}
          {/* Divergence markers ON the price line, ONLY here */}
          {rows.map((r, i) =>
            r.lens_alignment === "DIVERGENT" && r.eod_spot != null ? (
              <circle key={`d${i}`} cx={x(i)} cy={yPrice(r.eod_spot)} r={4.5}
                fill={MV.amber} stroke="#fff" strokeWidth={1}>
                <title>{r.session_prior ?? `DIVERGENT · ${r.as_of_date}`}</title>
              </circle>
            ) : null,
          )}
          {/* Live rail (dashed connector from last settled + hollow NOW marker) */}
          {showLiveRail && (() => {
            const lastIdxWithSpotRev = [...rows].reverse().findIndex((r) => r.eod_spot != null);
            if (lastIdxWithSpotRev < 0) return null;
            const idx = rows.length - 1 - lastIdxWithSpotRev;
            const lastSpot = rows[idx].eod_spot!;
            const ly = yPrice(live.spot!);
            return (
              <g>
                <line x1={x(idx)} x2={liveX} y1={yPrice(lastSpot)} y2={ly}
                  stroke={MV.blueLine} strokeWidth="1.5" strokeDasharray="4,3" opacity={0.85} />
                <line x1={padL + cw + 8} x2={padL + cw + 8} y1={priceLane.plotY0} y2={priceLane.plotY0 + priceLane.plotH}
                  stroke={MV.border} strokeWidth="0.5" />
                <circle cx={liveX} cy={ly} r={5} fill={MV.card} stroke={MV.blue} strokeWidth={2} />
                <text x={liveX} y={ly - 10} textAnchor="middle" fontSize="9" fontWeight={700}
                  fill={MV.blue} style={{ fontFamily: MV.mono }}>
                  NOW {fmtNum(live.spot!, { maximumFractionDigits: 0 })}
                </text>
              </g>
            );
          })()}

          {/* ==================== CYCLE LANE ==================== */}
          <line x1={padL} x2={padL + cw} y1={cycleMid} y2={cycleMid}
            stroke={MV.border} strokeWidth="0.5" />
          {/* ceiling / floor axis marks — small icons only, no numeric labels */}
          <text x={padL - 6} y={cycleLane.plotY0 + 10} textAnchor="end" fontSize="10" fill={MV.redLine}
            style={{ fontFamily: MV.mono }}>▲</text>
          <text x={padL - 6} y={cycleLane.plotY0 + cycleLane.plotH - 2} textAnchor="end" fontSize="10" fill={MV.greenLine}
            style={{ fontFamily: MV.mono }}>▼</text>
          {runs.map((seg, k) => {
            if (seg.pts.length < 1) return null;
            const parts: { pts: { i: number; v: number }[]; sign: 1 | -1 | 0 }[] = [];
            let cp: typeof parts[number] | null = null;
            seg.pts.forEach((p) => {
              const s = p.v > 0 ? 1 : p.v < 0 ? -1 : 0;
              if (!cp || cp.sign !== s) { if (cp) parts.push(cp); cp = { pts: [p], sign: s }; }
              else cp.pts.push(p);
            });
            if (cp) parts.push(cp);
            return parts.map((pt, j) => {
              if (pt.pts.length < 2) return null;
              const top = pt.pts.map((p) => `${x(p.i).toFixed(1)},${yCycle(p.v).toFixed(1)}`).join(" ");
              const first = pt.pts[0];
              const last2 = pt.pts[pt.pts.length - 1];
              const poly = `${x(first.i).toFixed(1)},${cycleMid} ${top} ${x(last2.i).toFixed(1)},${cycleMid}`;
              const fill = pt.sign >= 0 ? MV.redLine : MV.greenLine;
              return <polygon key={`f${k}_${j}`} points={poly} fill={fill} opacity={0.4} />;
            });
          })}
          {runs.map((seg, k) => {
            if (seg.pts.length < 2) return null;
            const path = seg.pts.map((p, j) =>
              `${j === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${yCycle(p.v).toFixed(1)}`).join(" ");
            return <path key={`cl${k}`} d={path} fill="none" stroke={MV.mid} strokeWidth={1} opacity={0.85}
              vectorEffect="non-scaling-stroke" />;
          })}
          {!cycleHasData && (
            <text x={padL + cw / 2} y={cycleMid} textAnchor="middle" fontSize="10" fill={MV.weak}
              style={{ fontFamily: MV.mono }}>participant board unavailable</text>
          )}

          {/* ==================== REGIME LANE (optional) ==================== */}
          {regimeLane && yRegime && (
            <g>
              <rect x={padL} y={regimeLane.plotY0} width={cw} height={regimeLane.plotH}
                fill={MV.border} opacity={0.18} />
              {/* min/max ticks — 2 max, at plot edges */}
              {[
                { v: rMin, dy: 8 },
                { v: rMax, dy: -2 },
              ].map((t, k) => (
                <text key={`ry${k}`} x={padL - 6} y={yRegime(t.v) + t.dy} textAnchor="end" fontSize="9" fill={MV.weak}
                  style={{ fontFamily: MV.mono }}>{(t.v * 100).toFixed(0)}%</text>
              ))}
              {regimePath.map((p, k) => (
                <path key={`rp${k}`} d={p} fill="none" stroke={MV.mid} strokeWidth={tf === "MONTH" ? 2 : 1.4}
                  opacity={0.9} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          )}

          {/* --- Dim overlay for WEEK prior-cycle sessions ---
              Drawn AFTER data so the prior cycle desaturates; dividers below
              this render on top so the boundary stays fully visible. */}
          {dimOverlayX2 != null && (
            <rect x={padL} y={chartTop} width={dimOverlayX2 - padL} height={chartBottom - chartTop}
              fill={MV.card} opacity={0.55} pointerEvents="none" />
          )}

          {/* --- Cycle dividers span ALL lanes (rendered LAST so they win) --- */}
          {rowBoundaries.map((bi) => {
            const bx = x(bi) - xStep / 2;
            const isDimBoundary = bi === dimUntilIdx && dimUntilIdx > 0;
            return (
              <g key={`b${bi}`}>
                <line x1={bx} x2={bx} y1={chartTop} y2={chartBottom}
                  stroke={isDimBoundary ? MV.amber : MV.borderStrong}
                  strokeWidth={isDimBoundary ? 1.2 : 1}
                  strokeDasharray={isDimBoundary ? undefined : "2,3"}
                  opacity={isDimBoundary ? 0.9 : tf === "MONTH" ? 0.4 : 0.75} />
                <text x={bx + 4} y={chartTop - 6} fontSize="9" fill={MV.weak} style={{ fontFamily: MV.mono }}>
                  ⟵ exp {fmtDate(rows[bi - 1].front_expiry)}
                </text>
              </g>
            );
          })}
          {last.front_expiry && (
            <text x={padL + cw - 4} y={chartTop - 6} textAnchor="end" fontSize="9" fill={MV.weak}
              style={{ fontFamily: MV.mono }}>
              cycle → {fmtDate(last.front_expiry)}{live.dte != null ? ` · ${live.dte}d live` : ""}
            </text>
          )}

          {/* --- Bottom x-axis (reserved band; no lane draws here) --- */}
          {(() => {
            const ticks = Array.from(new Set([0, ...rowBoundaries, rows.length - 1])).filter((i) => i >= 0 && i < rows.length);
            return ticks.map((i) => (
              <text key={`xt${i}`} x={x(i)} y={chartBottom + 16} textAnchor="middle" fontSize="9" fill={MV.weak}
                style={{ fontFamily: MV.mono }}>
                {fmtDate(rows[i].as_of_date)}
              </text>
            ));
          })()}

          {/* Hover strips over the whole chart */}
          {rows.map((_, i) => (
            <rect key={`h${i}`} x={x(i) - xStep / 2} y={chartTop} width={xStep} height={chartBottom - chartTop}
              fill="transparent" onMouseEnter={() => setHoverIdx(i)} />
          ))}
          {hoverIdx != null && (
            <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={chartTop} y2={chartBottom}
              stroke={MV.borderStrong} strokeWidth="0.5" opacity={0.6} />
          )}
        </svg>

        {/* Live-rail floating chip (CYCLE + WEEK) */}
        {showLiveRail && (
          <div className="absolute right-2 top-2 rounded-md border px-2 py-1 text-right text-[10px]"
            style={{ borderColor: MV.border, background: MV.card, fontFamily: MV.mono }}>
            <div className="text-[8px] uppercase tracking-wider" style={{ color: MV.weak }}>LIVE · Clock 3</div>
            <div className="font-bold" style={{ color: liveN === "POSITIVE_γ" ? MV.green : liveN === "NEGATIVE_γ" ? MV.red : MV.amber }}>
              {liveN ?? "—"}
            </div>
            <div style={{ color: MV.weak }}>
              {live.dte != null ? `${live.dte}d · ` : ""}pin {live.pinRiskScore != null ? Math.round(live.pinRiskScore) : "—"}
            </div>
          </div>
        )}
      </div>

      {/* Intraday drift banner — WEEK view only, per spec */}
      {tf === "WEEK" && intradayDrift && (
        <div className="mt-3 rounded-md px-3 py-2 text-[12px] font-medium leading-snug"
          style={{ background: MV.amber + "1f", border: `1px solid ${MV.amber}55`, color: MV.amber, fontFamily: MV.mono }}>
          ⚠ INTRADAY DRIFT — dealers flipped to {liveN} since the open; the settled verdict ({settledN}) is stale until tonight's recompile.
        </div>
      )}

      {/* Clock-1 chip — always present (in WEEK view this replaces the regime lane) */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]"
        style={{ fontFamily: MV.mono }}>
        <span className="inline-flex items-center rounded px-2 py-0.5 font-semibold"
          style={{ background: persistenceChip.color + "1f", color: persistenceChip.color }}>
          Clock 1 · {persistenceChip.text}{lastPersistence != null ? ` · ${(lastPersistence * 100).toFixed(0)}%` : ""}
        </span>
        <span style={{ color: MV.mid }}>{driftArrow} {driftLabel}</span>
      </div>

      {/* Hover tooltip pane */}
      {hoverIdx != null && rows[hoverIdx] && (
        <div className="mt-3 rounded-md border px-3 py-2 text-[11px]"
          style={{ borderColor: MV.border, background: MV.card, fontFamily: MV.mono, color: MV.mid }}>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            <span style={{ color: MV.strong }}>{fmtDate(rows[hoverIdx].as_of_date)}</span>
            <span>spot {fmtNum(rows[hoverIdx].eod_spot, { maximumFractionDigits: 0 })}</span>
            <span>cycle → {fmtDate(rows[hoverIdx].front_expiry)}</span>
            <span>{rows[hoverIdx].ambient_regime ?? "—"}</span>
            <span style={{ color: rows[hoverIdx].lens_alignment === "DIVERGENT" ? MV.amber : MV.mid }}>
              {rows[hoverIdx].lens_alignment ?? "—"}
            </span>
            <span>
              asym {rows[hoverIdx].cycle_oi_call_put_asym != null
                ? (rows[hoverIdx].cycle_oi_call_put_asym! >= 0 ? "+" : "") + rows[hoverIdx].cycle_oi_call_put_asym!.toFixed(3)
                : "∅"}
            </span>
            <span>
              persist {rows[hoverIdx].gex_regime_persistence_20d != null
                ? (rows[hoverIdx].gex_regime_persistence_20d! * 100).toFixed(0) + "%"
                : "—"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderBar({
  symbol,
  settledThrough,
  tf,
  setTf,
}: {
  symbol: "NIFTY" | "SENSEX";
  settledThrough: string | null;
  tf: TF;
  setTf: (t: TF) => void;
}) {
  const TFS: TF[] = ["MONTH", "CYCLE", "WEEK"];
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: MV.weak }}>
          Ambient Trajectory — three clocks over price
        </div>
        <div className="text-[11px]" style={{ color: MV.weak, fontFamily: MV.mono }}>
          {symbol}{settledThrough ? ` · settled through ${fmtDate(settledThrough)}` : ""}
        </div>
      </div>
      <div className="flex gap-0.5 rounded border p-0.5 text-[10px]"
        style={{ borderColor: MV.border, fontFamily: MV.mono }}>
        {TFS.map((t) => {
          const active = t === tf;
          return (
            <button
              key={t}
              onClick={() => setTf(t)}
              className="rounded px-2.5 py-0.5 font-semibold tracking-wide"
              style={{
                background: active ? MV.strong : "transparent",
                color: active ? MV.card : MV.weak,
              }}
            >
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}
