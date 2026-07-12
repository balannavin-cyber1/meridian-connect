// Ambient Trajectory — the Home hero panel (ENH-116 Objective 1).
// Three clocks over price: settled positioning-regime persistence (Clock 1),
// cycle-so-far call/put OI asymmetry (Clock 2), and a live session rail (Clock 3).
// Read-only. Settled = solid. Live = dashed / outlined. NULL = gap, never zero.
import { useMemo, useState } from "react";
import { MV, fmtNum, fmtPct, Unavailable } from "@/marketview/ui";
import { useAmbientSeries, type AmbientSeriesRow } from "@/lib/queries";

type LiveState = {
  spot: number | null;
  regime: string | null; // raw gamma_metrics.regime
  flipLevel: number | null;
  maxGammaStrike: number | null;
  dte: number | null;
  pinRiskScore: number | null;
  ts: string | null;
};

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

export function AmbientTrajectory({
  symbol,
  live,
}: {
  symbol: "NIFTY" | "SENSEX";
  live: LiveState;
}) {
  const series = useAmbientSeries(symbol, 40);
  const raw = (series.data ?? []) as AmbientSeriesRow[];

  // Zoom: "recent" (default: last ~2 cycles) or "all".
  const [zoom, setZoom] = useState<"recent" | "all">("recent");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // ---- Coerce + slice ---------------------------------------------------
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

  // Cycle boundaries: index i is a boundary if front_expiry[i] !== front_expiry[i-1].
  const cycleBoundaries = useMemo(() => {
    const b: number[] = [];
    for (let i = 1; i < coerced.length; i++) {
      if (coerced[i].front_expiry !== coerced[i - 1].front_expiry) b.push(i);
    }
    return b;
  }, [coerced]);

  const rows = useMemo(() => {
    if (zoom === "all" || coerced.length < 3) return coerced;
    // last 2 cycles = from the second-to-last boundary onward
    if (cycleBoundaries.length >= 2) {
      const start = cycleBoundaries[cycleBoundaries.length - 2];
      return coerced.slice(start);
    }
    if (cycleBoundaries.length === 1) return coerced.slice(cycleBoundaries[0]);
    return coerced;
  }, [coerced, cycleBoundaries, zoom]);

  const rowBoundaries = useMemo(() => {
    const b: number[] = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].front_expiry !== rows[i - 1].front_expiry) b.push(i);
    }
    return b;
  }, [rows]);

  // ---- Degraded: too little history -------------------------------------
  if (rows.length < 3) {
    return (
      <div
        className="rounded-lg"
        style={{ background: MV.card, border: `1px solid ${MV.border}`, padding: "20px 22px" }}
      >
        <HeaderBar symbol={symbol} settledThrough={rows[rows.length - 1]?.as_of_date ?? null} />
        <Unavailable label={`trajectory building — ${rows.length} settled session${rows.length === 1 ? "" : "s"}`} />
      </div>
    );
  }

  // ---- Divergence run at tail -------------------------------------------
  let tailDivergent = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].lens_alignment === "DIVERGENT") tailDivergent++;
    else break;
  }

  // ---- Latest settled snapshot ------------------------------------------
  const last = rows[rows.length - 1];
  const lastPersistence = last.gex_regime_persistence_20d;
  const lastDrift = last.max_gamma_strike_drift_5d;
  const persistenceChip =
    lastPersistence == null
      ? { text: "PERSISTENCE —", color: MV.weak }
      : lastPersistence >= 0.7
        ? { text: "PERSISTENT LONG-γ (caged / mean-reverting)", color: MV.green }
        : lastPersistence <= 0.3
          ? { text: "PERSISTENT SHORT-γ (trending / amplifying)", color: MV.red }
          : { text: "MIXED-γ", color: MV.amber };
  const driftArrow = lastDrift == null ? "→" : lastDrift > 5 ? "↑" : lastDrift < -5 ? "↓" : "→";
  const driftLabel =
    lastDrift == null
      ? "magnet drift unavailable"
      : `magnet drifting ${driftArrow === "↑" ? "up" : driftArrow === "↓" ? "down" : "flat"} (${lastDrift >= 0 ? "+" : ""}${lastDrift.toFixed(1)} pts/session)`;

  // ---- Live drift banner -------------------------------------------------
  const liveN = normalizeRegime(live.regime);
  const settledN = normalizeRegime(last.net_gex_regime);
  const intradayDrift = liveN && settledN && liveN !== settledN;

  // ---- Cycle-2 availability ---------------------------------------------
  const cycleHasData = rows.some((r) => r.cycle_oi_call_put_asym != null);

  // ---- Chart geometry ---------------------------------------------------
  const W = 1200;
  const H = 440;
  const padL = 56;
  const padR = 96; // reserve for live rail
  const padT = 44;
  const padB = 60;
  const cw = W - padL - padR;
  const ch = H - padT - padB;

  // Split vertical band: top 60% price / clock1 / divergence markers,
  // bottom 40% clock2 fill centered at zero.
  const priceH = ch * 0.6;
  const cycleH = ch * 0.4;
  const priceTop = padT;
  const priceBottom = padT + priceH;
  const cycleMid = padT + priceH + cycleH / 2;

  // X: one slot per settled row; live marker sits at cw+gap on the rail.
  const n = rows.length;
  const xStep = n > 1 ? cw / (n - 1) : cw;
  const x = (i: number) => padL + i * xStep;
  const liveX = padL + cw + 26;

  // Price axis (spans price band)
  const spotsSettled = rows.map((r) => r.eod_spot).filter((v): v is number => v != null);
  const liveSpotIncluded = live.spot ?? null;
  const allSpots = liveSpotIncluded != null ? [...spotsSettled, liveSpotIncluded] : spotsSettled;
  const spotMin = Math.min(...allSpots);
  const spotMax = Math.max(...allSpots);
  const spotPad = (spotMax - spotMin) * 0.08 || Math.max(1, spotMax * 0.001);
  const yLo = spotMin - spotPad;
  const yHi = spotMax + spotPad;
  const yPrice = (v: number) => priceBottom - ((v - yLo) / (yHi - yLo)) * priceH;

  // Cycle asym axis: fixed [-1, 1]
  const yCycle = (v: number) => cycleMid - (v / 1) * (cycleH / 2);

  // Clock-1 persistence ribbon: 0..1 mapped to a thin band at bottom of price band
  const ribbonTop = priceBottom - priceH * 0.18;
  const ribbonBot = priceBottom;
  const yPersist = (v: number) => ribbonBot - v * (ribbonBot - ribbonTop);

  // Price path (settled only, solid)
  const pricePath = rows
    .map((r, i) => (r.eod_spot != null ? `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yPrice(r.eod_spot).toFixed(1)}` : ""))
    .filter(Boolean)
    .join(" ");

  // Persistence path (may have nulls; break on nulls)
  const persistSegs: string[] = [];
  let cur: string[] = [];
  rows.forEach((r, i) => {
    if (r.gex_regime_persistence_20d != null) {
      cur.push(`${cur.length === 0 ? "M" : "L"}${x(i).toFixed(1)},${yPersist(r.gex_regime_persistence_20d).toFixed(1)}`);
    } else if (cur.length) {
      persistSegs.push(cur.join(" "));
      cur = [];
    }
  });
  if (cur.length) persistSegs.push(cur.join(" "));

  // Cycle-2 fill: build one filled polygon per contiguous non-null run,
  // split by sign so up=ceiling, down=floor render as separate hue bands.
  type Seg = { pts: { i: number; v: number }[] };
  const runs: Seg[] = [];
  let run: Seg | null = null;
  rows.forEach((r, i) => {
    if (r.cycle_oi_call_put_asym != null) {
      if (!run) run = { pts: [] };
      run.pts.push({ i, v: Math.max(-1, Math.min(1, r.cycle_oi_call_put_asym)) });
    } else if (run) {
      runs.push(run);
      run = null;
    }
  });
  if (run) runs.push(run);

  // ---- Render ------------------------------------------------------------
  return (
    <div
      className="rounded-lg"
      style={{ background: MV.card, border: `1px solid ${MV.border}`, padding: "20px 22px" }}
    >
      <HeaderBar symbol={symbol} settledThrough={last.as_of_date} zoom={zoom} setZoom={setZoom} />

      {/* Divergence run callout (silence when no run) */}
      {tailDivergent >= 2 && (
        <div
          className="mb-3 rounded-md px-3 py-2 text-[12px] font-semibold leading-snug"
          style={{
            background: MV.amber + "1f",
            border: `1px solid ${MV.amber}55`,
            color: MV.amber,
            fontFamily: MV.mono,
          }}
        >
          ⚠ LENSES DIVERGENT — {tailDivergent} consecutive sessions. Conviction reduced; the room is changing.
        </div>
      )}

      {/* Chart */}
      <div className="relative" style={{ minHeight: 440 }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" preserveAspectRatio="none"
          onMouseLeave={() => setHoverIdx(null)}>
          {/* --- Cycle dividers --- */}
          {rowBoundaries.map((bi) => {
            const bx = x(bi) - xStep / 2;
            return (
              <g key={`b${bi}`}>
                <line
                  x1={bx}
                  x2={bx}
                  y1={padT - 6}
                  y2={H - padB}
                  stroke={MV.borderStrong}
                  strokeWidth="1"
                  strokeDasharray="2,3"
                />
                <text x={bx + 4} y={padT - 8} fontSize="9" fill={MV.weak} style={{ fontFamily: MV.mono }}>
                  ⟵ expiry {fmtDate(rows[bi - 1].front_expiry)}
                </text>
              </g>
            );
          })}
          {/* Current cycle label with live DTE at right edge */}
          {last.front_expiry && (
            <text x={padL + cw - 4} y={padT - 8} textAnchor="end" fontSize="9" fill={MV.weak} style={{ fontFamily: MV.mono }}>
              cycle → {fmtDate(last.front_expiry)}{live.dte != null ? ` · ${live.dte}d live` : ""}
            </text>
          )}

          {/* --- Clock 1 ribbon (persistence 0..1) --- */}
          <rect x={padL} y={ribbonTop} width={cw} height={ribbonBot - ribbonTop}
            fill={MV.border} opacity={0.35} />
          {persistSegs.map((p, k) => (
            <path key={`ps${k}`} d={p} fill="none" stroke={MV.mid} strokeWidth={1} opacity={0.7} vectorEffect="non-scaling-stroke" />
          ))}
          <text x={padL + 4} y={ribbonTop + 10} fontSize="8" fill={MV.weak} style={{ fontFamily: MV.mono }}>
            γ persistence 20d
          </text>

          {/* --- Clock 2 zero baseline --- */}
          <line x1={padL} x2={padL + cw} y1={cycleMid} y2={cycleMid} stroke={MV.border} strokeWidth="0.5" />
          <text x={padL - 6} y={cycleMid + 3} textAnchor="end" fontSize="9" fill={MV.weak} style={{ fontFamily: MV.mono }}>0</text>
          <text x={padL - 6} y={yCycle(1) + 3} textAnchor="end" fontSize="9" fill={MV.redLine} style={{ fontFamily: MV.mono }}>+1 ceiling</text>
          <text x={padL - 6} y={yCycle(-1) + 3} textAnchor="end" fontSize="9" fill={MV.greenLine} style={{ fontFamily: MV.mono }}>−1 floor</text>

          {/* --- Clock 2 fills (NULL = gap, positive = ceiling/red, negative = floor/green) --- */}
          {runs.map((seg, k) => {
            if (seg.pts.length < 1) return null;
            // Split by sign changes across a run so up/down use different hues.
            const parts: { pts: { i: number; v: number }[]; sign: 1 | -1 | 0 }[] = [];
            let cp: typeof parts[number] | null = null;
            seg.pts.forEach((p) => {
              const s = p.v > 0 ? 1 : p.v < 0 ? -1 : 0;
              if (!cp || cp.sign !== s) {
                if (cp) parts.push(cp);
                cp = { pts: [p], sign: s };
              } else {
                cp.pts.push(p);
              }
            });
            if (cp) parts.push(cp);
            return parts.map((pt, j) => {
              if (pt.pts.length < 2) return null;
              const top = pt.pts.map((p) => `${x(p.i).toFixed(1)},${yCycle(p.v).toFixed(1)}`).join(" ");
              const first = pt.pts[0];
              const last2 = pt.pts[pt.pts.length - 1];
              const poly = `${x(first.i).toFixed(1)},${cycleMid} ${top} ${x(last2.i).toFixed(1)},${cycleMid}`;
              const fill = pt.sign >= 0 ? MV.redLine : MV.greenLine;
              return <polygon key={`f${k}_${j}`} points={poly} fill={fill} opacity={0.35} />;
            });
          })}
          {/* Cycle-2 line on top for definition */}
          {runs.map((seg, k) => {
            if (seg.pts.length < 2) return null;
            const path = seg.pts.map((p, j) => `${j === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${yCycle(p.v).toFixed(1)}`).join(" ");
            return <path key={`cl${k}`} d={path} fill="none" stroke={MV.mid} strokeWidth={1} opacity={0.8} vectorEffect="non-scaling-stroke" />;
          })}
          {!cycleHasData && (
            <text x={padL + cw / 2} y={cycleMid} textAnchor="middle" fontSize="10" fill={MV.weak} style={{ fontFamily: MV.mono }}>
              participant board unavailable
            </text>
          )}

          {/* --- Live rail reference lines (dashed, extend left across chart) --- */}
          {live.flipLevel != null && live.flipLevel >= yLo && live.flipLevel <= yHi && (
            <>
              <line x1={padL} x2={liveX} y1={yPrice(live.flipLevel)} y2={yPrice(live.flipLevel)}
                stroke={MV.amber} strokeWidth="1" strokeDasharray="3,3" opacity={0.7} />
              <text x={liveX + 2} y={yPrice(live.flipLevel) - 3} fontSize="9" fill={MV.amber} style={{ fontFamily: MV.mono }}>
                flip {fmtNum(live.flipLevel, { maximumFractionDigits: 0 })}
              </text>
            </>
          )}
          {live.maxGammaStrike != null && live.maxGammaStrike >= yLo && live.maxGammaStrike <= yHi && (
            <>
              <line x1={padL} x2={liveX} y1={yPrice(live.maxGammaStrike)} y2={yPrice(live.maxGammaStrike)}
                stroke={MV.purple} strokeWidth="1" strokeDasharray="3,3" opacity={0.7} />
              <text x={liveX + 2} y={yPrice(live.maxGammaStrike) - 3} fontSize="9" fill={MV.purple} style={{ fontFamily: MV.mono }}>
                max γ {fmtNum(live.maxGammaStrike, { maximumFractionDigits: 0 })}
              </text>
            </>
          )}

          {/* --- Price line (settled, solid) --- */}
          <path d={pricePath} fill="none" stroke={MV.blueLine} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />

          {/* --- Divergence markers on price line --- */}
          {rows.map((r, i) =>
            r.lens_alignment === "DIVERGENT" && r.eod_spot != null ? (
              <circle key={`d${i}`} cx={x(i)} cy={yPrice(r.eod_spot)} r={4.5}
                fill={MV.amber} stroke="#fff" strokeWidth={1}>
                <title>{r.session_prior ?? `DIVERGENT · ${r.as_of_date}`}</title>
              </circle>
            ) : null,
          )}

          {/* --- Live "today" marker: dashed connector from last settled --- */}
          {live.spot != null && (() => {
            const lastIdxWithSpot = [...rows].reverse().findIndex((r) => r.eod_spot != null);
            if (lastIdxWithSpot < 0) return null;
            const idx = rows.length - 1 - lastIdxWithSpot;
            const lastSpot = rows[idx].eod_spot!;
            const ly = yPrice(live.spot);
            return (
              <g>
                <line x1={x(idx)} x2={liveX} y1={yPrice(lastSpot)} y2={ly}
                  stroke={MV.blueLine} strokeWidth="1.5" strokeDasharray="4,3" opacity={0.8} />
                {/* Rail separator */}
                <line x1={padL + cw + 8} x2={padL + cw + 8} y1={padT} y2={H - padB}
                  stroke={MV.border} strokeWidth="0.5" />
                {/* Hollow live marker: outlined, not filled */}
                <circle cx={liveX} cy={ly} r={5} fill={MV.card} stroke={MV.blue} strokeWidth={2} />
                <text x={liveX} y={ly - 10} textAnchor="middle" fontSize="9" fontWeight={700}
                  fill={MV.blue} style={{ fontFamily: MV.mono }}>
                  NOW {fmtNum(live.spot, { maximumFractionDigits: 0 })}
                </text>
              </g>
            );
          })()}

          {/* --- Y ticks (price) --- */}
          {[0, 0.25, 0.5, 0.75, 1].map((p) => {
            const v = yLo + p * (yHi - yLo);
            return (
              <g key={p}>
                <line x1={padL} x2={padL + cw} y1={yPrice(v)} y2={yPrice(v)} stroke={MV.border} strokeWidth="0.4" opacity={0.6} />
                <text x={padL - 6} y={yPrice(v) + 3} textAnchor="end" fontSize="9" fill={MV.weak} style={{ fontFamily: MV.mono }}>
                  {fmtNum(v, { maximumFractionDigits: 0 })}
                </text>
              </g>
            );
          })}

          {/* --- X ticks: first, last, boundaries --- */}
          {[0, ...rowBoundaries, rows.length - 1].map((i, k, arr) => {
            if (arr.indexOf(i) !== k) return null;
            return (
              <text key={`xt${i}`} x={x(i)} y={H - padB + 14} textAnchor="middle" fontSize="9" fill={MV.weak}
                style={{ fontFamily: MV.mono }}>
                {fmtDate(rows[i].as_of_date)}
              </text>
            );
          })}

          {/* --- Hover hit strips --- */}
          {rows.map((_, i) => (
            <rect key={`h${i}`} x={x(i) - xStep / 2} y={padT} width={xStep} height={ch}
              fill="transparent" onMouseEnter={() => setHoverIdx(i)} />
          ))}
          {hoverIdx != null && rows[hoverIdx]?.eod_spot != null && (
            <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={padT} y2={H - padB}
              stroke={MV.borderStrong} strokeWidth="0.5" />
          )}
        </svg>

        {/* Live rail chip overlay (bottom-right) */}
        {live.spot != null && (
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

      {/* Intraday drift banner — under the Clock-3 rail, per spec */}
      {intradayDrift && (
        <div className="mt-3 rounded-md px-3 py-2 text-[12px] font-medium leading-snug"
          style={{
            background: MV.amber + "1f",
            border: `1px solid ${MV.amber}55`,
            color: MV.amber,
            fontFamily: MV.mono,
          }}>
          ⚠ INTRADAY DRIFT — dealers flipped to {liveN} since the open; the settled verdict ({settledN}) is stale until tonight's recompile.
        </div>
      )}

      {/* Clock-1 chip strip */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]"
        style={{ fontFamily: MV.mono }}>
        <span className="inline-flex items-center rounded px-2 py-0.5 font-semibold"
          style={{ background: persistenceChip.color + "1f", color: persistenceChip.color }}>
          Clock 1 · {persistenceChip.text}
          {lastPersistence != null ? ` · ${(lastPersistence * 100).toFixed(0)}%` : ""}
        </span>
        <span style={{ color: MV.mid }}>
          {driftArrow} {driftLabel}
        </span>
        {last.regime_conditional_note && (
          <span style={{ color: MV.weak }}>· {last.regime_conditional_note}</span>
        )}
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
            <span>{rows[hoverIdx].price_vs_breadth_div ?? "—"}</span>
            <span>
              cycle asym {rows[hoverIdx].cycle_oi_call_put_asym != null
                ? (rows[hoverIdx].cycle_oi_call_put_asym! >= 0 ? "+" : "") + rows[hoverIdx].cycle_oi_call_put_asym!.toFixed(2)
                : "∅"}
            </span>
            <span>
              persist {rows[hoverIdx].gex_regime_persistence_20d != null
                ? (rows[hoverIdx].gex_regime_persistence_20d! * 100).toFixed(0) + "%"
                : "—"}
            </span>
          </div>
          {rows[hoverIdx].session_prior && (
            <div className="mt-1" style={{ color: MV.weak }}>{rows[hoverIdx].session_prior}</div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px]"
        style={{ color: MV.weak, fontFamily: MV.mono }}>
        <span><span style={{ color: MV.blueLine }}>—</span> price (settled, solid)</span>
        <span><span style={{ color: MV.blue }}>◦</span> live NOW (dashed connector)</span>
        <span><span style={{ color: MV.redLine }}>▲</span> cycle ceiling (call-heavy)</span>
        <span><span style={{ color: MV.greenLine }}>▼</span> cycle floor (put-heavy)</span>
        <span><span style={{ color: MV.amber }}>●</span> lens divergence</span>
        <span>gap = participant board abstained (NULL ≠ 0)</span>
      </div>
    </div>
  );
}

function HeaderBar({
  symbol,
  settledThrough,
  zoom,
  setZoom,
}: {
  symbol: "NIFTY" | "SENSEX";
  settledThrough: string | null;
  zoom?: "recent" | "all";
  setZoom?: (z: "recent" | "all") => void;
}) {
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
      {setZoom && (
        <div className="flex gap-1 text-[10px]" style={{ fontFamily: MV.mono }}>
          <button
            onClick={() => setZoom("recent")}
            className="rounded border px-2 py-0.5"
            style={{
              borderColor: zoom === "recent" ? MV.strong : MV.border,
              color: zoom === "recent" ? MV.strong : MV.weak,
              background: zoom === "recent" ? MV.border : "transparent",
            }}
          >
            last ~2 cycles
          </button>
          <button
            onClick={() => setZoom("all")}
            className="rounded border px-2 py-0.5"
            style={{
              borderColor: zoom === "all" ? MV.strong : MV.border,
              color: zoom === "all" ? MV.strong : MV.weak,
              background: zoom === "all" ? MV.border : "transparent",
            }}
          >
            all
          </button>
        </div>
      )}
    </div>
  );
}
