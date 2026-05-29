import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LineChart as LineChartIcon, RefreshCw, Plus } from "lucide-react";
import {
  useSpotMarker,
  useGammaLatest,
  useGammaSeries,
  useGammaToday,
  useLatestSignal,
  useTodaysSignals,
  useGexStrikes,
  usePinZone,
  useAccelZone,
  useIctZones,
  useRefetchMarketview,
  useStraddleIntraday,
  useMaxPainByStrike,
  useBreadthIntraday,
  useIvSmile,
  type Symbol as MSymbol,
  type StraddleBucket,
} from "@/lib/queries";
import { Sparkline } from "@/components/primitives/Sparkline";
import { Gauge } from "@/components/primitives/Gauge";
import { IVSmile } from "@/components/primitives/IVSmile";
import { NarrativeModal } from "@/components/NarrativeModal";

// ============================================================
// Helpers
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
  greenLine: "var(--mv-green-line)",
  red: "var(--mv-red)",
  redBg: "var(--mv-red-bg)",
  redLine: "var(--mv-red-line)",
  pink: "var(--mv-pink)",
  blue: "var(--mv-blue)",
  blueBg: "var(--mv-blue-bg)",
  blueLine: "var(--mv-blue-line)",
  amber: "var(--mv-amber)",
  amberBg: "var(--mv-amber-bg)",
  purple: "var(--mv-purple)",
  purpleBg: "var(--mv-purple-bg)",
  indigo: "var(--mv-indigo)",
  mono: "var(--mv-font-mono)",
};

const fmtNum = (n: number | null | undefined, opts?: Intl.NumberFormatOptions) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: 2, ...opts });

const fmtSigned = (n: number | null | undefined, opts?: Intl.NumberFormatOptions) => {
  if (n == null || !Number.isFinite(n)) return "—";
  const s = n.toLocaleString("en-IN", { maximumFractionDigits: 2, ...opts });
  return n > 0 ? `+${s}` : s;
};

const fmtPct = (n: number | null | undefined, digits = 2) =>
  n == null || !Number.isFinite(n) ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;

const fmtBillion = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(0)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return `${n.toFixed(0)}`;
};

function spotFromMarker(m: any): number | null {
  if (!m) return null;
  return (
    m.postmarket_ref_spot ??
    m.close_1530_spot ??
    m.open_0915_spot ??
    m.premarket_ref_spot ??
    m.prev_close_spot ??
    null
  );
}

function formatDTE(expiryISO: string | null | undefined, dteDays?: number | null): string {
  if (!expiryISO) return "—";
  const totalHours = (new Date(expiryISO).getTime() - Date.now()) / 3.6e6;
  if (!Number.isFinite(totalHours)) return "—";
  const d = dteDays != null && Number.isFinite(dteDays)
    ? Math.max(0, Math.floor(dteDays))
    : Math.max(0, Math.floor(totalHours / 24));
  let h = Math.round(totalHours - d * 24);
  if (h >= 24) return `${d + 1}d 0h`;
  if (h < 0) h = 0;
  return `${d}d ${h}h`;
}

const REGIME_DISPLAY: Record<string, { label: string; bg: string; fg: string; desc: string }> = {
  LONG_GAMMA: { label: "POSITIVE_γ", bg: "var(--mv-green-bg)", fg: "var(--mv-green)", desc: "long dealer γ · mean-reverting" },
  SHORT_GAMMA: { label: "NEGATIVE_γ", bg: "var(--mv-red-bg)", fg: "var(--mv-red)", desc: "short dealer γ · trend-amplifying" },
  NO_FLIP: { label: "NO_FLIP", bg: "var(--mv-blue-bg)", fg: "var(--mv-blue)", desc: "no flip in window" },
};

const qualityTone = (q?: string | null) => {
  switch ((q ?? "").toUpperCase()) {
    case "A": return { bg: MV.greenBg, fg: MV.green };
    case "B": return { bg: MV.blueBg, fg: MV.blue };
    case "C": return { bg: MV.amberBg, fg: MV.amber };
    case "D": return { bg: MV.redBg, fg: MV.red };
    default: return { bg: "#f3f4f6", fg: "#6b7280" };
  }
};

// ============================================================
// Small UI atoms
// ============================================================
function Card({
  children,
  title,
  subtitle,
  className = "",
  bodyClass = "",
}: {
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <div
      className={`rounded-lg ${className}`}
      style={{ background: MV.card, border: `1px solid ${MV.border}`, padding: "20px 22px" }}
    >
      {(title || subtitle) && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          {title && (
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: MV.weak }}
            >
              {title}
            </div>
          )}
          {subtitle && (
            <div className="text-[11px]" style={{ color: MV.weak }}>{subtitle}</div>
          )}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  valueColor,
  pill,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueColor?: string;
  pill?: { text: string; bg: string; fg: string } | null;
}) {
  return (
    <div
      className="flex-1 rounded-lg"
      style={{
        background: MV.card,
        border: `1px solid ${MV.border}`,
        padding: "12px 14px",
        minWidth: 160,
      }}
    >
      <div
        className="text-[9px] font-semibold uppercase tracking-[0.1em]"
        style={{ color: MV.weak }}
      >
        {label}
      </div>
      <div className="mt-1.5">
        {pill ? (
          <span
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold"
            style={{ background: pill.bg, color: pill.fg, fontFamily: MV.mono }}
          >
            {pill.text}
          </span>
        ) : (
          <div
            className="text-[19px] font-bold leading-tight tabular-nums"
            style={{ color: valueColor ?? MV.strong, fontFamily: MV.mono }}
          >
            {value}
          </div>
        )}
      </div>
      {sub != null && (
        <div className="mt-1 text-[10px]" style={{ color: MV.weak, fontFamily: MV.mono }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em]"
      style={{ color: MV.weak }}
    >
      {children}
    </div>
  );
}

function Unavailable({ label = "data unavailable" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-6 text-[11px]" style={{ color: MV.weak }}>
      {label}
    </div>
  );
}

// ============================================================
// Hero (Positioning Landscape) chart — preserved from earlier
// ============================================================
function HeroChart({
  spot,
  bars: rawBars,
  pin,
  accel,
  step,
  resetKey,
  sigmaPct,
  maxGammaStrike,
  flipLevel,
}: {
  spot: number;
  bars: { strike: number; gex_cr: number }[];
  pin: { pin_lower: number; pin_upper: number } | null;
  accel: { accel_lower: number; accel_upper: number } | null;
  step: number;
  resetKey: number;
  sigmaPct: number | null;
  maxGammaStrike: number | null;
  flipLevel: number | null;
}) {
  const W = 1200;
  const H = 320;
  const padL = 30;
  const padR = 30;
  const padT = 36;
  const padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const midY = padT + chartH / 2;

  const defaultView = useMemo(() => {
    if (!rawBars.length) {
      if (spot > 0) return { min: spot * 0.96, max: spot * 1.04 };
      return null;
    }
    if (spot > 0) {
      const within = (pct: number) => {
        const lo = spot * (1 - pct);
        const hi = spot * (1 + pct);
        const inRange = rawBars.filter((b) => b.strike >= lo && b.strike <= hi);
        return { lo, hi, count: inRange.length };
      };
      let r = within(0.02);
      if (r.count < 5) r = within(0.05);
      if (r.count < 3) {
        const ss = rawBars.map((b) => b.strike);
        return { min: Math.min(...ss), max: Math.max(...ss) };
      }
      return { min: r.lo, max: r.hi };
    }
    const ss = rawBars.map((b) => b.strike);
    return { min: Math.min(...ss), max: Math.max(...ss) };
  }, [rawBars, spot]);

  const [view, setView] = useState<{ min: number; max: number } | null>(null);
  useEffect(() => {
    setView(null);
  }, [resetKey, defaultView?.min, defaultView?.max]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ startX: number; startMin: number; startMax: number } | null>(null);

  if (!defaultView) {
    return <Unavailable label="no GEX strike data" />;
  }

  const activeView = view ?? defaultView;
  const sMin = activeView.min;
  const sMax = activeView.max;
  const sRange = sMax - sMin || 1;
  const x = (s: number) => padL + ((s - sMin) / sRange) * chartW;

  const bars = rawBars.filter((b) => b.strike >= sMin && b.strike <= sMax);
  const maxAbs = Math.max(...(bars.length ? bars.map((b) => Math.abs(b.gex_cr)) : [1])) || 1;
  const barH = (v: number) => (Math.abs(v) / maxAbs) * (chartH / 2);

  // Snapped strike ticks
  const tickStart = Math.ceil(sMin / step) * step;
  const tickEnd = Math.floor(sMax / step) * step;
  const rawTickCount = Math.max(0, Math.floor((tickEnd - tickStart) / step) + 1);
  const thin = rawTickCount > 12 ? Math.ceil(rawTickCount / 10) : 1;
  const ticks: number[] = [];
  for (let t = tickStart, i = 0; t <= tickEnd; t += step, i++) {
    if (i % thin === 0) ticks.push(t);
  }

  // Sigma bands
  const sigma = sigmaPct != null && spot ? spot * (sigmaPct / 100) : null;

  const clientToStrike = (clientX: number) => {
    const el = svgRef.current;
    if (!el) return spot;
    const rect = el.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * W;
    const t = (svgX - padL) / chartW;
    return sMin + Math.max(0, Math.min(1, t)) * sRange;
  };
  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const anchor = clientToStrike(e.clientX);
    const zoom = Math.exp(e.deltaY * 0.0015);
    let newMin = anchor - (anchor - sMin) * zoom;
    let newMax = anchor + (sMax - anchor) * zoom;
    const minWidth = step * 4;
    if (newMax - newMin < minWidth) {
      const mid = (newMin + newMax) / 2;
      newMin = mid - minWidth / 2;
      newMax = mid + minWidth / 2;
    }
    setView({ min: newMin, max: newMax });
  };
  const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    dragRef.current = { startX: e.clientX, startMin: sMin, startMax: sMax };
  };
  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dxStrike = ((e.clientX - d.startX) / rect.width) * W * (sRange / chartW);
    setView({ min: d.startMin - dxStrike, max: d.startMax - dxStrike });
  };
  const endDrag = () => { dragRef.current = null; };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full select-none"
      style={{ cursor: dragRef.current ? "grabbing" : "grab", touchAction: "none" }}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
    >
      {/* sigma bands */}
      {sigma && spot > 0 && (
        <>
          {[2, 1].map((mult) => {
            const lo = spot - mult * sigma;
            const hi = spot + mult * sigma;
            return (
              <rect
                key={mult}
                x={x(lo)}
                y={padT}
                width={Math.max(0, x(hi) - x(lo))}
                height={chartH}
                fill={MV.blueBg}
                opacity={mult === 1 ? 0.7 : 0.35}
              />
            );
          })}
          {[-2, -1, 1, 2].map((m) => {
            const v = spot + m * sigma;
            if (v < sMin || v > sMax) return null;
            return (
              <g key={m}>
                <line x1={x(v)} x2={x(v)} y1={padT} y2={H - padB} stroke={MV.borderStrong} strokeDasharray="2,3" strokeWidth="0.5" />
                <text x={x(v)} y={padT - 4} textAnchor="middle" fontSize="9" fill={MV.weak}>
                  {m > 0 ? `+${m}σ` : `${m}σ`}
                </text>
              </g>
            );
          })}
        </>
      )}

      {/* pin */}
      {pin && (
        <rect x={x(pin.pin_lower)} y={padT} width={Math.max(2, x(pin.pin_upper) - x(pin.pin_lower))} height={chartH} fill={MV.greenLine} opacity={0.07} />
      )}
      {/* accel */}
      {accel && (
        <rect x={x(accel.accel_lower)} y={padT} width={Math.max(2, x(accel.accel_upper) - x(accel.accel_lower))} height={chartH} fill={MV.redLine} opacity={0.07} />
      )}

      <line x1={padL} x2={W - padR} y1={midY} y2={midY} stroke={MV.border} strokeWidth="0.5" />

      {bars.map((b) => {
        const bw = Math.max(3, (chartW / Math.max(bars.length, 1)) * 0.7);
        const bx = x(b.strike) - bw / 2;
        const h = barH(b.gex_cr);
        const pos = b.gex_cr >= 0;
        return (
          <rect key={b.strike} x={bx} y={pos ? midY - h : midY} width={bw} height={h} fill={pos ? MV.greenLine : MV.redLine} opacity={0.85} />
        );
      })}

      {maxGammaStrike != null && maxGammaStrike >= sMin && maxGammaStrike <= sMax && (
        <>
          <line x1={x(maxGammaStrike)} x2={x(maxGammaStrike)} y1={padT} y2={H - padB} stroke={MV.purple} strokeWidth="1" strokeDasharray="3,2" />
          <text x={x(maxGammaStrike) + 4} y={padT + 22} fontSize="10" fontWeight="600" fill={MV.purple}>
            max γ {fmtNum(maxGammaStrike)}
          </text>
        </>
      )}

      {flipLevel != null && flipLevel >= sMin && flipLevel <= sMax && (
        <>
          <line x1={x(flipLevel)} x2={x(flipLevel)} y1={padT} y2={H - padB} stroke={MV.amber} strokeWidth="1" strokeDasharray="3,2" />
          <text x={x(flipLevel) + 4} y={padT + 36} fontSize="10" fontWeight="600" fill={MV.amber}>
            flip {fmtNum(flipLevel)}
          </text>
        </>
      )}

      {spot >= sMin && spot <= sMax && (
        <>
          <line x1={x(spot)} x2={x(spot)} y1={padT - 8} y2={H - padB} stroke={MV.blue} strokeWidth="1.5" />
          <text x={x(spot)} y={padT - 12} textAnchor="middle" fontSize="11" fontWeight="700" fill={MV.blue} style={{ fontFamily: MV.mono }}>
            ▼ SPOT {fmtNum(spot)}
          </text>
        </>
      )}

      {ticks.map((s) => (
        <g key={s}>
          <line x1={x(s)} x2={x(s)} y1={H - padB} y2={H - padB + 3} stroke={MV.weak} strokeWidth="0.5" />
          <text x={x(s)} y={H - 6} textAnchor="middle" fontSize="9" fill={MV.weak} style={{ fontFamily: MV.mono }}>
            {fmtNum(s, { maximumFractionDigits: 0 })}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ============================================================
// Max Pain chart
// ============================================================
function MaxPainChart({
  rows,
  spot,
  step,
}: {
  rows: Array<{ candidate_strike: number; total_pain: number; max_pain_strike: number; side: string }>;
  spot: number;
  step: number;
}) {
  if (!rows?.length) return <Unavailable label="max pain view not available" />;
  const W = 1200;
  const H = 280;
  const padL = 40;
  const padR = 30;
  const padT = 24;
  const padB = 28;
  const cw = W - padL - padR;
  const ch = H - padT - padB;
  const maxPain = rows[0].max_pain_strike;

  const sMin = Math.min(...rows.map((r) => r.candidate_strike));
  const sMax = Math.max(...rows.map((r) => r.candidate_strike));
  const sRange = sMax - sMin || 1;
  const x = (s: number) => padL + ((s - sMin) / sRange) * cw;
  const yMax = Math.max(...rows.map((r) => r.total_pain)) || 1;
  const y = (v: number) => padT + ch - (v / yMax) * ch;
  const bw = Math.max(2, (cw / rows.length) * 0.75);

  const tickStart = Math.ceil(sMin / step) * step;
  const tickEnd = Math.floor(sMax / step) * step;
  const rawTickCount = Math.max(0, Math.floor((tickEnd - tickStart) / step) + 1);
  const thin = rawTickCount > 12 ? Math.ceil(rawTickCount / 10) : 1;
  const ticks: number[] = [];
  for (let t = tickStart, i = 0; t <= tickEnd; t += step, i++) {
    if (i % thin === 0) ticks.push(t);
  }
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((p) => p * yMax);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={MV.border} strokeWidth="0.5" />
          <text x={padL - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill={MV.weak} style={{ fontFamily: MV.mono }}>
            {fmtBillion(v)}
          </text>
        </g>
      ))}
      {rows.map((r) => {
        const color = r.side === "MAX_PAIN" ? MV.amber : r.side === "PE_SIDE" ? MV.pink : MV.blueLine;
        return (
          <rect
            key={r.candidate_strike}
            x={x(r.candidate_strike) - bw / 2}
            y={y(r.total_pain)}
            width={bw}
            height={Math.max(1, padT + ch - y(r.total_pain))}
            fill={color}
            opacity={0.85}
          />
        );
      })}
      {spot >= sMin && spot <= sMax && (
        <>
          <line x1={x(spot)} x2={x(spot)} y1={padT - 8} y2={H - padB} stroke={MV.blue} strokeWidth="1.5" />
          <text x={x(spot)} y={padT - 12} textAnchor="middle" fontSize="11" fontWeight="700" fill={MV.blue} style={{ fontFamily: MV.mono }}>
            ▼ SPOT {fmtNum(spot)}
          </text>
        </>
      )}
      {maxPain >= sMin && maxPain <= sMax && (
        <>
          <line x1={x(maxPain)} x2={x(maxPain)} y1={padT} y2={H - padB} stroke={MV.amber} strokeWidth="1" strokeDasharray="3,2" />
          <text x={x(maxPain) + 4} y={padT + 12} fontSize="10" fontWeight="600" fill={MV.amber}>
            max pain {fmtNum(maxPain)}
          </text>
        </>
      )}
      {ticks.map((s) => (
        <g key={s}>
          <line x1={x(s)} x2={x(s)} y1={H - padB} y2={H - padB + 3} stroke={MV.weak} strokeWidth="0.5" />
          <text x={x(s)} y={H - 8} textAnchor="middle" fontSize="9" fill={MV.weak} style={{ fontFamily: MV.mono }}>
            {fmtNum(s, { maximumFractionDigits: 0 })}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ============================================================
// Pin Risk Timeline (twin axis)
// ============================================================
function PinRiskTimeline({ rows }: { rows: Array<{ ts: string; spot: number | null; pin_risk_score: number | null }> }) {
  if (!rows?.length) return <Unavailable label="no intraday pin-risk data yet" />;
  const W = 1200;
  const H = 220;
  const padL = 40;
  const padR = 50;
  const padT = 18;
  const padB = 28;
  const cw = W - padL - padR;
  const ch = H - padT - padB;

  const ist = (iso: string) => {
    const t = new Date(iso).getTime() + 5.5 * 3600 * 1000;
    const d = new Date(t);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  };
  const X_MIN = 555, X_MAX = 930;
  const x = (m: number) => padL + ((m - X_MIN) / (X_MAX - X_MIN)) * cw;

  const yLeft = (v: number) => padT + ch - (v / 100) * ch;

  const spots = rows.map((r) => r.spot).filter((v): v is number => v != null);
  const sLo = spots.length ? Math.min(...spots) : 0;
  const sHi = spots.length ? Math.max(...spots) : 1;
  const sPad = (sHi - sLo) * 0.1 || 1;
  const sLo2 = sLo - sPad, sHi2 = sHi + sPad;
  const yRight = (v: number) => padT + ch - ((v - sLo2) / (sHi2 - sLo2)) * ch;

  const scorePath = rows
    .filter((r) => r.pin_risk_score != null)
    .map((r, i) => `${i === 0 ? "M" : "L"}${x(ist(r.ts)).toFixed(1)},${yLeft(r.pin_risk_score!).toFixed(1)}`)
    .join(" ");
  const spotPath = rows
    .filter((r) => r.spot != null)
    .map((r, i) => `${i === 0 ? "M" : "L"}${x(ist(r.ts)).toFixed(1)},${yRight(r.spot!).toFixed(1)}`)
    .join(" ");
  const scoreArea = scorePath
    ? `${scorePath} L${x(ist(rows[rows.length - 1].ts)).toFixed(1)},${(padT + ch).toFixed(1)} L${x(ist(rows[0].ts)).toFixed(1)},${(padT + ch).toFixed(1)} Z`
    : "";

  const xTicks = [555, 615, 675, 735, 795, 855, 915];
  const fmtTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
      {[
        { v: 75, c: MV.green, l: "75 strong" },
        { v: 50, c: MV.amber, l: "50 moderate" },
        { v: 25, c: MV.weak, l: "25 weak" },
      ].map((t) => (
        <g key={t.v}>
          <line x1={padL} x2={W - padR} y1={yLeft(t.v)} y2={yLeft(t.v)} stroke={t.c} strokeDasharray="3,4" strokeWidth="0.6" opacity={0.6} />
          <text x={padL + 4} y={yLeft(t.v) - 3} fontSize="9" fill={t.c}>{t.l}</text>
        </g>
      ))}
      {scoreArea && <path d={scoreArea} fill={MV.purple} opacity={0.12} />}
      {scorePath && <path d={scorePath} fill="none" stroke={MV.purple} strokeWidth="1.6" />}
      {spotPath && <path d={spotPath} fill="none" stroke={MV.blueLine} strokeWidth="1.5" opacity={0.85} />}
      {xTicks.map((m) => (
        <g key={m}>
          <line x1={x(m)} x2={x(m)} y1={H - padB} y2={H - padB + 3} stroke={MV.weak} strokeWidth="0.5" />
          <text x={x(m)} y={H - 8} textAnchor="middle" fontSize="9" fill={MV.weak} style={{ fontFamily: MV.mono }}>
            {fmtTime(m)}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ============================================================
// Straddle intraday (preserved)
// ============================================================
function StraddleIntradayChart({ buckets, daysUsed }: { buckets: StraddleBucket[]; daysUsed: number }) {
  const W = 560, H = 60;
  const padL = 4, padR = 4, padT = 4, padB = 14;
  const cw = W - padL - padR;
  const ch = H - padT - padB;
  const X_MIN = 555, X_MAX = 930;
  const x = (m: number) => padL + ((m - X_MIN) / (X_MAX - X_MIN)) * cw;
  const vals: number[] = [];
  buckets.forEach((b) => {
    if (b.today != null) vals.push(b.today);
    if (b.avg != null) vals.push(b.avg);
  });
  const hasData = vals.length > 0;
  const yMin = hasData ? Math.min(...vals) : 0;
  const yMax = hasData ? Math.max(...vals) : 1;
  const pad = (yMax - yMin) * 0.1 || 1;
  const yLo = Math.max(0, yMin - pad);
  const yHi = yMax + pad;
  const y = (v: number) => padT + (1 - (v - yLo) / (yHi - yLo)) * ch;
  const toPath = (sel: (b: StraddleBucket) => number | null) => {
    let d = "";
    let pen = false;
    buckets.forEach((b) => {
      const v = sel(b);
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(b.bucket).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full" style={{ height: 56 }}>
      {hasData && (
        <>
          <path d={toPath((b) => b.avg)} fill="none" stroke={MV.amber} strokeWidth="1" strokeDasharray="3,3" />
          <path d={toPath((b) => b.today)} fill="none" stroke={MV.blueLine} strokeWidth="1.6" />
        </>
      )}
      {!hasData && <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="10" fill={MV.weak}>no straddle data</text>}
    </svg>
  );
}

// ============================================================
// Page
// ============================================================
export default function Marketview() {
  const [symbol, setSymbol] = useState<MSymbol>("NIFTY");
  const [narrativeOpen, setNarrativeOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [chartResetKey, setChartResetKey] = useState(0);
  const nav = useNavigate();
  const refetchAll = useRefetchMarketview();

  // Live clock
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const marker = useSpotMarker(symbol);
  const gamma = useGammaLatest(symbol);
  const gammaSeries = useGammaSeries(symbol);
  const gammaToday = useGammaToday(symbol);
  const signal = useLatestSignal(symbol);
  const signals = useTodaysSignals(symbol);
  const expiry = (gamma.data?.expiry_date ?? gamma.data?.expiry) as string | undefined;
  const strikes = useGexStrikes(symbol, expiry);
  const pin = usePinZone(symbol, expiry);
  const accel = useAccelZone(symbol, expiry);
  const zones = useIctZones(symbol);
  const straddle = useStraddleIntraday(symbol);
  const maxPain = useMaxPainByStrike(symbol);
  const breadth = useBreadthIntraday(symbol);

  const strikeStep = symbol === "NIFTY" ? 50 : 100;
  const g = gamma.data ?? ({} as any);
  const spot = (g.spot ?? spotFromMarker(marker.data) ?? 0) as number;
  const prevClose = (marker.data?.prev_close_spot ?? null) as number | null;
  const changeAbs = prevClose && spot ? spot - prevClose : 0;
  const changePct = prevClose && spot ? ((spot - prevClose) / prevClose) * 100 : 0;

  const regime = (g.regime ?? null) as string | null;
  const gammaZone = (g.gamma_zone ?? null) as string | null;
  // net_gex is already in Cr units
  const netDealerGamma = (g.net_gex ?? null) as number | null;
  // flip_distance_pct used as σ proxy until sigma_pct_to_expiry is shipped
  const sigmaPct = (g.flip_distance_pct ?? null) as number | null;
  const flipLevel = (g.flip_level ?? null) as number | null;
  // pin_risk_score not yet exposed by writer
  const pinRiskScore = (g.pin_risk_score ?? null) as number | null;
  const expansionProb = (g.expansion_probability ?? null) as number | null;
  const pinProbability = expansionProb != null ? Math.max(0, Math.min(100, 100 - expansionProb)) : null;
  // straddle_atm is the ATM straddle premium
  const atmStraddle = (g.straddle_atm ?? null) as number | null;
  const vix = (g.vix ?? null) as number | null;
  const dteDays = (g.dte ?? null) as number | null;
  const breadthRegime = (g.breadth_regime ?? null) as string | null;

  // Max γ strike / peak γ / dampen-amplify totals derived from gex_strike_snapshots
  const strikeAgg = useMemo(() => {
    const rows = (strikes.data ?? []) as any[];
    if (!rows.length) {
      return { maxGammaStrike: null as number | null, peakGammaCr: null as number | null, strongestAmplifyStrike: null as number | null, dampenTotal: null as number | null, amplifyTotal: null as number | null };
    }
    const pos = rows.filter((s) => (s.gex_cr ?? 0) > 0);
    const neg = rows.filter((s) => (s.gex_cr ?? 0) < 0);
    const maxRow = pos.length ? pos.reduce((m, s) => (s.gex_cr > m.gex_cr ? s : m)) : null;
    const minRow = neg.length ? neg.reduce((m, s) => (s.gex_cr < m.gex_cr ? s : m)) : null;
    const dampenTotal = pos.reduce((a, s) => a + (s.gex_cr ?? 0), 0);
    const amplifyTotal = neg.reduce((a, s) => a + (s.gex_cr ?? 0), 0);
    return {
      maxGammaStrike: maxRow?.strike ?? null,
      peakGammaCr: maxRow?.gex_cr ?? null,
      strongestAmplifyStrike: minRow?.strike ?? null,
      dampenTotal: pos.length ? dampenTotal : null,
      amplifyTotal: neg.length ? amplifyTotal : null,
    };
  }, [strikes.data]);
  const { maxGammaStrike, peakGammaCr, strongestAmplifyStrike, dampenTotal, amplifyTotal } = strikeAgg;

  // IV Smile from option_chain_snapshots
  const ivSmile = useIvSmile(symbol, spot, strikeStep);
  const ivSkewPct = ivSmile.data && ivSmile.data.atmCe && ivSmile.data.atmPe
    ? (ivSmile.data.atmPe / ivSmile.data.atmCe - 1) * 100
    : null;

  // Live stale
  const signalTs = signal.data?.ts ? new Date(signal.data.ts).getTime() : (g.ts ? new Date(g.ts).getTime() : null);
  const staleSeconds = signalTs ? Math.max(0, Math.floor((Date.now() - signalTs) / 1000)) : null;
  const dotColor = staleSeconds == null
    ? MV.weak
    : staleSeconds < 60 ? MV.green : staleSeconds < 300 ? MV.amber : MV.red;

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "n" || e.key === "N") setSymbol("NIFTY");
      else if (e.key === "s" || e.key === "S") setSymbol("SENSEX");
      else if (e.key === "r" || e.key === "R") { refetchAll(); setChartResetKey((k) => k + 1); }
      else if (e.key === "Escape") setNarrativeOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refetchAll]);

  // Regime pill (mapped from LONG_GAMMA / SHORT_GAMMA / NO_FLIP)
  const regimeMapped = regime ? REGIME_DISPLAY[regime] : null;
  const regimePill = regimeMapped
    ? { text: regimeMapped.label, bg: regimeMapped.bg, fg: regimeMapped.fg, sub: gammaZone ? `${regimeMapped.desc} · ${gammaZone}` : regimeMapped.desc }
    : regime
      ? { text: regime, bg: MV.blueBg, fg: MV.blue, sub: gammaZone ?? "" }
      : null;

  const dte = formatDTE(expiry, dteDays);

  // ICT zones near spot
  const zonesNearSpot = useMemo(() => {
    if (!spot) return [];
    return (zones.data ?? [])
      .map((z: any) => {
        const lo = z.zone_low ?? z.range_low;
        const hi = z.zone_high ?? z.range_high;
        return { z, lo, hi, mid: lo != null && hi != null ? (lo + hi) / 2 : null };
      })
      .filter((r) => r.mid != null)
      .sort((a, b) => Math.abs((a.mid as number) - spot) - Math.abs((b.mid as number) - spot))
      .slice(0, 10);
  }, [zones.data, spot]);

  // Pain insights
  const maxPainStrike = maxPain.data?.[0]?.max_pain_strike ?? null;
  const painSpotDistPct = maxPainStrike && spot ? ((spot - maxPainStrike) / maxPainStrike) * 100 : null;
  const gammaPainGap = maxPainStrike && maxGammaStrike ? Math.abs(maxGammaStrike - maxPainStrike) : null;
  const pinBias =
    gammaPainGap == null ? null :
    gammaPainGap < 200 ? { text: "CONVERGENT", color: MV.green } :
    gammaPainGap <= 500 ? { text: "DIVERGENT", color: MV.amber } :
    { text: "WIDE", color: MV.red };

  const istNow = useMemo(() => {
    void tick;
    const d = new Date(Date.now() + 5.5 * 3600 * 1000);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
  }, [tick]);

  return (
    <div className="min-h-full" style={{ background: MV.bg, color: MV.strong, fontFamily: "var(--mv-font-sans)" }}>
      {/* ============== HEADER ============== */}
      <div
        className="sticky top-0 z-20 flex items-center gap-6 px-7 py-3"
        style={{ background: MV.card, borderBottom: `1px solid ${MV.border}` }}
      >
        {/* Tabs */}
        <div className="flex items-center gap-1">
          {(["NIFTY", "SENSEX", "BANKNIFTY"] as const).map((s) => {
            const active = (symbol as string) === s;
            const disabled = s === "BANKNIFTY";
            return (
              <button
                key={s}
                onClick={() => !disabled && setSymbol(s as MSymbol)}
                disabled={disabled}
                className="rounded px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors"
                style={{
                  background: active ? MV.strong : "transparent",
                  color: active ? "white" : disabled ? MV.vweak : MV.mid,
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
              >
                {s}
              </button>
            );
          })}
        </div>


        <div className="flex-1" />

        {/* SPOT */}
        <div className="text-center">
          <div className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>SPOT</div>
          <div className="flex items-baseline gap-2">
            <span className="text-[22px] font-bold tabular-nums" style={{ fontFamily: MV.mono }}>{spot ? fmtNum(spot) : "—"}</span>
            <span className="text-[13px] font-semibold tabular-nums" style={{ color: changePct >= 0 ? MV.green : MV.red, fontFamily: MV.mono }}>
              {fmtSigned(changeAbs)} ({fmtPct(changePct)})
            </span>
          </div>
        </div>

        {/* EXPIRY */}
        <div className="text-center">
          <div className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>EXPIRY</div>
          <div className="text-[14px] font-bold" style={{ fontFamily: MV.mono }}>
            {expiry ? new Date(expiry).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
          </div>
          <div className="text-[11px]" style={{ color: MV.weak, fontFamily: MV.mono }}>
            {dte} to expiry
          </div>
        </div>

        <div className="flex-1" />

        {/* LIVE + Narrative */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[11px]" style={{ color: MV.mid, fontFamily: MV.mono }}>
            <span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ background: dotColor }} />
            LIVE · {istNow}
          </div>
          <button
            onClick={() => refetchAll()}
            title="Refetch (R)"
            className="rounded p-1 hover:bg-gray-100"
            style={{ color: MV.weak }}
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={() => setNarrativeOpen(true)}
            className="rounded border px-3 py-1.5 text-[11px] font-semibold tracking-wide transition-colors hover:bg-gray-900 hover:text-white"
            style={{ borderColor: MV.border, color: MV.strong }}
          >
            Narrative →
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-[1440px] px-7 py-5 space-y-5">

        {/* ============== SECTION 1: Key Parameters ============== */}
        <div>
          <SectionLabel>Key Parameters</SectionLabel>
          <div className="flex flex-wrap gap-3">
            <Tile
              label="Regime"
              value=""
              pill={regimePill}
              sub={regimePill?.sub}
            />
            <Tile
              label="Net Dealer γ"
              value={netDealerGamma != null ? `${fmtSigned(netDealerGamma)} Cr` : "—"}
              valueColor={(netDealerGamma ?? 0) >= 0 ? MV.green : MV.red}
              sub={dampenTotal != null || amplifyTotal != null
                ? `Σdmp ${fmtNum(dampenTotal)}k · Σamp ${fmtNum(amplifyTotal)}`
                : "no flow breakdown"}
            />
            <Tile
              label="Spot Context"
              value={sigmaPct != null ? `±${sigmaPct.toFixed(2)}%` : "—"}
              sub={sigmaPct != null && spot ? `σ ${fmtNum(spot * (1 - sigmaPct / 100), { maximumFractionDigits: 0 })}–${fmtNum(spot * (1 + sigmaPct / 100), { maximumFractionDigits: 0 })} · ${dte}` : dte}
            />
            <Tile
              label="Flip Level"
              value={flipLevel != null ? fmtNum(flipLevel) : "—"}
              sub={flipLevel != null && spot ? `${fmtPct(((flipLevel - spot) / spot) * 100)} from spot` : "no flip in window"}
            />
            <Tile
              label="Max γ Strike"
              value={maxGammaStrike != null ? fmtNum(maxGammaStrike) : "—"}
              sub={maxGammaStrike && spot
                ? `${fmtPct(((maxGammaStrike - spot) / spot) * 100)} from spot${peakGammaCr != null ? ` · pk ${fmtSigned(peakGammaCr)} Cr` : ""}`
                : "—"}
            />
            <Tile
              label="Pin Zone"
              value={pin.data ? `${fmtNum(pin.data.pin_lower, { maximumFractionDigits: 0 })}–${fmtNum(pin.data.pin_upper, { maximumFractionDigits: 0 })}` : "—"}
              sub={pin.data ? `pk ${fmtNum(pin.data.peak_pin_strike ?? pin.data.pin_strike, { maximumFractionDigits: 0 })}${pin.data.n_strikes != null ? ` · n=${pin.data.n_strikes}` : ""}${pin.data.tau_used != null ? ` · τ${pin.data.tau_used}` : ""}` : "—"}
            />
            <Tile
              label="Accel Zone"
              value={accel.data ? `${fmtNum(accel.data.accel_lower, { maximumFractionDigits: 0 })}–${fmtNum(accel.data.accel_upper, { maximumFractionDigits: 0 })}` : "—"}
              sub={accel.data ? "active in window" : "none in window"}
            />
          </div>
        </div>

        {/* ============== SECTION 2: Positioning Landscape ============== */}
        <div>
          <SectionLabel>Positioning Landscape — Dealer γ by Strike</SectionLabel>
          <Card
            title="Dealer γ by Strike"
            subtitle={`dampening (long γ) vs amplifying (short γ) · σ-band to expiry · ${strikes.data?.length ?? 0} strikes`}
          >
            <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px]" style={{ fontFamily: MV.mono }}>
              <Scalar label="net γ in window" value={netDealerGamma != null ? `${fmtSigned(netDealerGamma)} Cr` : "—"} color={(netDealerGamma ?? 0) >= 0 ? MV.green : MV.red} />
              <Scalar label="Σ dampen" value={dampenTotal != null ? `${fmtSigned(dampenTotal)} Cr` : "—"} color={MV.green} />
              <Scalar label="Σ amplify" value={amplifyTotal != null ? `${fmtSigned(amplifyTotal)} Cr` : "—"} color={MV.red} />
              <Scalar label="strongest dampen" value={fmtNum(maxGammaStrike, { maximumFractionDigits: 0 })} />
              <Scalar label="strongest amplify" value={flipLevel != null ? fmtNum(flipLevel, { maximumFractionDigits: 0 }) : "—"} />
              <Scalar label="Σ to expiry" value={sigmaPct != null ? fmtPct(sigmaPct) : "—"} color={MV.blue} />
            </div>
            <HeroChart
              spot={spot}
              bars={(strikes.data ?? []) as any}
              pin={pin.data as any}
              accel={accel.data as any}
              step={strikeStep}
              resetKey={chartResetKey}
              sigmaPct={sigmaPct}
              maxGammaStrike={maxGammaStrike}
              flipLevel={flipLevel}
            />
            <div className="mt-1 text-[9px]" style={{ color: MV.weak }}>scroll to zoom · drag to pan · r to reset</div>
          </Card>
        </div>

        {/* ============== SECTION 3: Max Pain ============== */}
        <div>
          <SectionLabel>Max Pain — Total Option Pain by Strike</SectionLabel>
          <Card
            title="Max Pain by Strike"
            subtitle="CE+PE writer pain · trough = max-pain magnet · pink PE-side / blue CE-side"
          >
            <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px]" style={{ fontFamily: MV.mono }}>
              <Scalar label="max pain" value={fmtNum(maxPainStrike, { maximumFractionDigits: 0 })} color={MV.amber} />
              <Scalar label="dist from spot" value={fmtPct(painSpotDistPct)} color={(painSpotDistPct ?? 0) >= 0 ? MV.green : MV.red} />
              <Scalar label="max γ" value={fmtNum(maxGammaStrike, { maximumFractionDigits: 0 })} color={MV.purple} />
              <Scalar label="γ vs pain gap" value={gammaPainGap != null ? `${gammaPainGap} pts` : "—"} />
              <Scalar label="pin bias" value={pinBias?.text ?? "—"} color={pinBias?.color} />
            </div>
            <MaxPainChart rows={(maxPain.data ?? []) as any} spot={spot} step={strikeStep} />
            {maxPainStrike != null && (
              <p className="mt-2 text-[11px] leading-relaxed" style={{ color: MV.mid }}>
                Spot near max-pain magnet ({fmtNum(maxPainStrike, { maximumFractionDigits: 0 })}, {fmtPct(painSpotDistPct)}).
                {maxGammaStrike != null && gammaPainGap != null && (
                  <> Max γ ({fmtNum(maxGammaStrike, { maximumFractionDigits: 0 })}) and max pain only {gammaPainGap} pts apart — <span style={{ color: pinBias?.color, fontWeight: 600 }}>{pinBias?.text.toLowerCase()} pin pressure</span>.</>
                )}
              </p>
            )}
          </Card>
        </div>

        {/* ============== SECTION 4: Pin Risk Row ============== */}
        <div>
          <SectionLabel>Pin Risk & ATM</SectionLabel>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>Pin Risk Score</div>
              <div className="mt-1 text-[30px] font-bold leading-none" style={{ color: MV.purple, fontFamily: MV.mono }}>
                {pinRiskScore != null ? Math.round(pinRiskScore) : "—"}
                <span className="text-[14px]" style={{ color: MV.weak }}>{pinRiskScore != null ? " /100" : ""}</span>
              </div>
              <div className="mt-2 text-[11px]" style={{ color: MV.weak, fontFamily: MV.mono }}>
                {pinRiskScore != null
                  ? pinRiskScore >= 75 ? "strong pin · 75 threshold exceeded"
                    : pinRiskScore >= 50 ? "moderate pin"
                    : "weak pin"
                  : "no pin-risk data"}
              </div>
              <div className="mt-3"><Gauge value={pinRiskScore ?? 0} color={MV.purple} /></div>
              <div className="mt-1.5 flex justify-between text-[9px]" style={{ color: MV.weak, fontFamily: MV.mono }}>
                <span>0</span><span>25 weak</span><span>50</span><span>75 strong</span><span>100</span>
              </div>
            </Card>

            <Card>
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>Pin Probability</div>
              {pinProb && typeof pinProb === "number" ? (
                <>
                  <div className="mt-1 text-[30px] font-bold leading-none" style={{ color: MV.purple, fontFamily: MV.mono }}>
                    {pinProb.toFixed(1)}%
                  </div>
                  <div className="mt-2 text-[11px]" style={{ color: MV.weak, fontFamily: MV.mono }}>
                    expiry within ±100pt of {fmtNum(maxGammaStrike, { maximumFractionDigits: 0 })}
                  </div>
                  <div className="mt-3"><Gauge value={pinProb} color={MV.purple} /></div>
                </>
              ) : Array.isArray(pinProb) && pinProb.length ? (
                <>
                  <div className="mt-1 text-[30px] font-bold leading-none" style={{ color: MV.purple, fontFamily: MV.mono }}>
                    {(pinProb[0].prob * 100).toFixed(1)}%
                  </div>
                  <div className="mt-2 text-[11px]" style={{ color: MV.weak, fontFamily: MV.mono }}>
                    expiry within ±100pt of {fmtNum(pinProb[0].strike, { maximumFractionDigits: 0 })}
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {pinProb.slice(0, 3).map((p: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-[10px]" style={{ fontFamily: MV.mono }}>
                        <span className="w-14 text-right" style={{ color: MV.mid }}>{fmtNum(p.strike, { maximumFractionDigits: 0 })}</span>
                        <Gauge value={p.prob * 100} color={i === 0 ? MV.purple : MV.vweak} />
                        <span className="w-10" style={{ color: MV.weak }}>{(p.prob * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <Unavailable label="pin_probability not exposed" />
              )}
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>ATM Straddle</div>
                  <div className="mt-1 text-[30px] font-bold leading-none" style={{ fontFamily: MV.mono }}>
                    ₹{atmStraddle != null ? Math.round(atmStraddle) : "—"}
                    <span className="ml-1 text-[12px] font-normal" style={{ color: MV.weak }}>today</span>
                  </div>
                </div>
                {(() => {
                  const last = [...(straddle.data?.buckets ?? [])].reverse().find((b) => b.today != null);
                  const avg = last ? straddle.data!.buckets.find((b) => b.bucket === last.bucket)?.avg ?? null : null;
                  if (last?.today == null || avg == null) return null;
                  const diffPct = ((last.today - avg) / avg) * 100;
                  return (
                    <div className="text-[11px] font-medium" style={{ color: diffPct >= 0 ? MV.green : MV.red, fontFamily: MV.mono }}>
                      {fmtPct(diffPct, 1)} vs avg
                    </div>
                  );
                })()}
              </div>
              <div className="mt-3">
                <StraddleIntradayChart
                  buckets={straddle.data?.buckets ?? []}
                  daysUsed={straddle.data?.daysUsed ?? 0}
                />
              </div>
              <div className="mt-1 flex justify-between text-[9px]" style={{ color: MV.weak, fontFamily: MV.mono }}>
                <span>09:15 intraday</span>
                <span>{straddle.data?.daysUsed ?? 5}d avg</span>
              </div>
            </Card>
          </div>
        </div>

        {/* ============== SECTION 5: Pin Risk Timeline ============== */}
        <div>
          <SectionLabel>Pin Risk Timeline</SectionLabel>
          <Card
            title="Pin Risk Timeline"
            subtitle="intraday pin-score (purple, L axis) vs spot (blue, R axis) · today's session"
          >
            <PinRiskTimeline rows={(gammaToday.data ?? []) as any} />
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[10px]" style={{ color: MV.weak, fontFamily: MV.mono }}>
              <span><span style={{ color: MV.purple }}>●</span> pin score {pinRiskScore != null ? Math.round(pinRiskScore) : "—"} / 100</span>
              <span><span style={{ color: MV.blueLine }}>—</span> spot {fmtNum(spot, { maximumFractionDigits: 0 })}</span>
              <span>{(gammaToday.data ?? []).length} samples</span>
            </div>
          </Card>
        </div>

        {/* ============== SECTION 6: Breadth & Volatility ============== */}
        <div>
          <SectionLabel>Breadth & Volatility</SectionLabel>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* WCB */}
            <Card>
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>WCB</div>
              {breadth.data?.wcb != null ? (
                <>
                  <div className="mt-1 text-[30px] font-bold leading-none" style={{ color: breadth.data.wcb >= 0 ? MV.green : MV.red, fontFamily: MV.mono }}>
                    {fmtSigned(breadth.data.wcb)}
                  </div>
                  <div className="mt-3">
                    <Sparkline data={[breadth.data.wcb]} color={breadth.data.wcb >= 0 ? MV.greenLine : MV.redLine} />
                  </div>
                </>
              ) : <Unavailable />}
            </Card>

            {/* Market Breadth split bar */}
            <Card>
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>Market Breadth</div>
              {breadth.data?.advances != null && breadth.data?.declines != null ? (() => {
                const a = breadth.data.advances, d = breadth.data.declines;
                const tot = a + d || 1;
                const adv = (a / tot) * 100;
                return (
                  <>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-[30px] font-bold leading-none" style={{ fontFamily: MV.mono }}>{adv.toFixed(0)}%</span>
                      <span className="text-[11px]" style={{ color: MV.weak, fontFamily: MV.mono }}>adv</span>
                      <span className="ml-auto text-[11px]" style={{ color: MV.weak, fontFamily: MV.mono }}>A/D {(a / Math.max(d, 1)).toFixed(2)}</span>
                    </div>
                    <div className="mt-4 flex h-7 w-full overflow-hidden rounded">
                      <div className="flex items-center justify-start pl-2 text-[10px] font-semibold text-white" style={{ width: `${adv}%`, background: MV.greenLine, fontFamily: MV.mono }}>
                        ↑ {a}
                      </div>
                      <div className="flex items-center justify-end pr-2 text-[10px] font-semibold text-white" style={{ width: `${100 - adv}%`, background: MV.redLine, fontFamily: MV.mono }}>
                        {d} ↓
                      </div>
                    </div>
                    <div className="mt-1 flex justify-between text-[9px]" style={{ color: MV.weak }}>
                      <span>advancing</span><span>declining</span>
                    </div>
                  </>
                );
              })() : <Unavailable />}
            </Card>

            {/* VIX */}
            <Card>
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>India VIX</div>
              {vix != null ? (
                <>
                  <div className="mt-1 text-[30px] font-bold leading-none" style={{ fontFamily: MV.mono }}>{vix.toFixed(2)}</div>
                  <div className="mt-3">
                    <Sparkline data={[vix]} color={MV.amber} />
                  </div>
                </>
              ) : <Unavailable label="VIX not exposed" />}
            </Card>

            {/* IV Skew */}
            <Card>
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>IV Skew</div>
              <Unavailable label="coming soon · needs ce_iv/pe_iv" />
            </Card>
          </div>
        </div>

        {/* ============== SECTION 7: ICT Zones ============== */}
        <div>
          <SectionLabel>ICT Zones — Nearest to Spot</SectionLabel>
          <Card title="Active Zones" subtitle={`${zonesNearSpot.length} of ${zones.data?.length ?? 0} · sorted by distance to spot`}>
            {zonesNearSpot.length === 0 ? (
              <Unavailable label="no zones near spot" />
            ) : (
              <ul className="divide-y" style={{ borderColor: MV.border }}>
                {zonesNearSpot.map((row: any, i: number) => {
                  const { z, lo, hi, mid } = row;
                  const tier = z.ict_tier ?? z.tier ?? "";
                  const pat = z.pattern_type ?? z.type ?? "";
                  const tf = z.tf ?? z.timeframe ?? "";
                  const distPct = mid != null && spot ? ((mid - spot) / spot) * 100 : 0;
                  const above = distPct >= 0;
                  const tierColor = String(tier).includes("1") ? { bg: MV.greenBg, fg: MV.green }
                    : String(tier).includes("2") ? { bg: MV.amberBg, fg: MV.amber }
                    : { bg: "#f3f4f6", fg: MV.weak };
                  return (
                    <li key={i} className="flex items-center justify-between py-2 text-[11px]">
                      <div className="flex items-center gap-2" style={{ fontFamily: MV.mono }}>
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: tierColor.bg, color: tierColor.fg }}>
                          {tier || "—"}
                        </span>
                        <span className="font-semibold" style={{ color: MV.strong }}>{pat}</span>
                        <span style={{ color: MV.weak }}>· {tf}</span>
                        {z.detected_at_ts && <span style={{ color: MV.weak }}>· src {new Date(z.detected_at_ts).toISOString().slice(0, 10)}</span>}
                      </div>
                      <div className="flex items-center gap-2" style={{ fontFamily: MV.mono }}>
                        <span style={{ color: MV.mid }}>{fmtNum(lo, { maximumFractionDigits: 0 })} — {fmtNum(hi, { maximumFractionDigits: 0 })}</span>
                        <span style={{ color: above ? MV.red : MV.green, fontWeight: 600 }}>
                          {fmtPct(distPct)} {above ? "above" : "below"}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        {/* ============== SECTION 8: Signals stream ============== */}
        <div>
          <SectionLabel>Today's Signals — Stream</SectionLabel>
          <Card title="Live Signal Stream" subtitle="most recent first">
            {(signals.data ?? []).length === 0 ? (
              <Unavailable label="no signals yet today" />
            ) : (
              <ul className="divide-y" style={{ borderColor: MV.border }}>
                {(signals.data ?? []).slice(0, 15).map((s: any, i: number) => {
                  const tone = qualityTone(s.entry_quality);
                  const time = new Date(s.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
                  const action = (s.action ?? "").toUpperCase();
                  return (
                    <li key={i} className="flex items-center justify-between py-2 text-[11px]" style={{ fontFamily: MV.mono }}>
                      <div className="flex items-center gap-3">
                        <span style={{ color: MV.weak }}>{time}</span>
                        <span className="font-semibold" style={{ color: MV.strong }}>{s.atm_strike ? fmtNum(s.atm_strike, { maximumFractionDigits: 0 }) : "—"}</span>
                        {s.entry_quality === "SKIP" && <span style={{ color: MV.weak }}>· gate</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: tone.bg, color: tone.fg }}>
                          {(s.entry_quality ?? "—").toUpperCase()}
                        </span>
                        <span className="font-semibold tracking-wider" style={{ color: action.includes("CE") ? MV.green : action.includes("PE") ? MV.red : MV.weak }}>
                          {action || "DO_NOTHING"}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* Floating annotate */}
      <button
        onClick={() => alert("Journal capture modal (Phase 2)")}
        className="fixed bottom-5 right-5 flex h-10 w-10 items-center justify-center rounded-full shadow-lg"
        style={{ background: MV.blue, color: "white" }}
        title="Annotate"
      >
        <Plus size={18} />
      </button>

      <NarrativeModal
        open={narrativeOpen}
        onClose={() => setNarrativeOpen(false)}
        symbol={symbol}
        expiry={expiry ? new Date(expiry).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
        state={{
          regime,
          netDealerGamma,
          maxGammaStrike,
          maxPainStrike,
          pinScore: pinRiskScore,
          vix,
        }}
      />
    </div>
  );
}

function Scalar({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>{label}</span>
      <span className="text-[13px] font-bold tabular-nums" style={{ color: color ?? MV.strong, fontFamily: MV.mono }}>{value}</span>
    </div>
  );
}
