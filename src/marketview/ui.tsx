// Marketview shared UI atoms, helpers, and design tokens.
import { useEffect, useMemo, useRef, useState } from "react";
import type { StraddleBucket } from "@/lib/queries";

export const MV = {
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

export const fmtNum = (n: number | null | undefined, opts?: Intl.NumberFormatOptions) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: 2, ...opts });

export const fmtSigned = (n: number | null | undefined, opts?: Intl.NumberFormatOptions) => {
  if (n == null || !Number.isFinite(n)) return "—";
  const s = n.toLocaleString("en-IN", { maximumFractionDigits: 2, ...opts });
  return n > 0 ? `+${s}` : s;
};

export const fmtPct = (n: number | null | undefined, digits = 2) =>
  n == null || !Number.isFinite(n) ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;

export const fmtBillion = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(0)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return `${n.toFixed(0)}`;
};

export function spotFromMarker(m: any): number | null {
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

export function formatDTE(expiryISO: string | null | undefined, dteDays?: number | null): string {
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

export const REGIME_DISPLAY: Record<string, { label: string; bg: string; fg: string; desc: string }> = {
  LONG_GAMMA: { label: "POSITIVE_γ", bg: MV.greenBg, fg: MV.green, desc: "long dealer γ · mean-reverting" },
  SHORT_GAMMA: { label: "NEGATIVE_γ", bg: MV.redBg, fg: MV.red, desc: "short dealer γ · trend-amplifying" },
  NO_FLIP: { label: "NO_FLIP", bg: MV.blueBg, fg: MV.blue, desc: "no flip in window" },
};

export const qualityTone = (q?: string | null) => {
  switch ((q ?? "").toUpperCase()) {
    case "A": return { bg: MV.greenBg, fg: MV.green };
    case "B": return { bg: MV.blueBg, fg: MV.blue };
    case "C": return { bg: MV.amberBg, fg: MV.amber };
    case "D": return { bg: MV.redBg, fg: MV.red };
    default: return { bg: "#f3f4f6", fg: "#6b7280" };
  }
};

// ============================================================
// Atoms
// ============================================================
export function Card({
  children, title, subtitle, className = "", bodyClass = "",
}: {
  children: React.ReactNode; title?: React.ReactNode; subtitle?: React.ReactNode;
  className?: string; bodyClass?: string;
}) {
  return (
    <div
      className={`rounded-lg ${className}`}
      style={{ background: MV.card, border: `1px solid ${MV.border}`, padding: "20px 22px" }}
    >
      {(title || subtitle) && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          {title && (
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>
              {title}
            </div>
          )}
          {subtitle && <div className="text-[11px]" style={{ color: MV.weak }}>{subtitle}</div>}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </div>
  );
}

export function Tile({
  label, value, sub, valueColor, pill, badge,
}: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; valueColor?: string;
  pill?: { text: string; bg: string; fg: string } | null;
  badge?: React.ReactNode;
}) {
  return (
    <div
      className="flex-1 rounded-lg"
      style={{ background: MV.card, border: `1px solid ${MV.border}`, padding: "12px 14px", minWidth: 160 }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>{label}</div>
        {badge}
      </div>
      <div className="mt-1.5">
        {pill ? (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold"
            style={{ background: pill.bg, color: pill.fg, fontFamily: MV.mono }}>
            {pill.text}
          </span>
        ) : (
          <div className="text-[19px] font-bold leading-tight tabular-nums"
            style={{ color: valueColor ?? MV.strong, fontFamily: MV.mono }}>
            {value}
          </div>
        )}
      </div>
      {sub != null && (
        <div className="mt-1 text-[10px]" style={{ color: MV.weak, fontFamily: MV.mono }}>{sub}</div>
      )}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: MV.weak }}>
      {children}
    </div>
  );
}

export function PageTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: MV.weak }}>MERDIAN</div>
        <h1 className="mt-0.5 text-[22px] font-bold leading-tight" style={{ color: MV.strong }}>{title}</h1>
        {subtitle && <div className="text-[12px]" style={{ color: MV.weak }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

export function Scalar({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>{label}</span>
      <span className="text-[13px] font-bold tabular-nums" style={{ color: color ?? MV.strong, fontFamily: MV.mono }}>{value}</span>
    </div>
  );
}

export function Unavailable({ label = "data unavailable" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-6 text-[11px]" style={{ color: MV.weak }}>{label}</div>
  );
}

// ============================================================
// Charts
// ============================================================
export function HeroChart({
  spot, bars: rawBars, pin, accel, step, resetKey, sigmaPct, maxGammaStrike, flipLevel,
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
  const W = 1200, H = 320, padL = 30, padR = 30, padT = 36, padB = 28;
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
        const lo = spot * (1 - pct), hi = spot * (1 + pct);
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
  useEffect(() => { setView(null); }, [resetKey, defaultView?.min, defaultView?.max]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ startX: number; startMin: number; startMax: number } | null>(null);

  if (!defaultView) return <Unavailable label="no GEX strike data" />;

  const activeView = view ?? defaultView;
  const sMin = activeView.min, sMax = activeView.max;
  const sRange = sMax - sMin || 1;
  const x = (s: number) => padL + ((s - sMin) / sRange) * chartW;

  const bars = rawBars.filter((b) => b.strike >= sMin && b.strike <= sMax);
  const maxAbs = Math.max(...(bars.length ? bars.map((b) => Math.abs(b.gex_cr)) : [1])) || 1;
  const barH = (v: number) => (Math.abs(v) / maxAbs) * (chartH / 2);

  const tickStart = Math.ceil(sMin / step) * step;
  const tickEnd = Math.floor(sMax / step) * step;
  const rawTickCount = Math.max(0, Math.floor((tickEnd - tickStart) / step) + 1);
  const thin = rawTickCount > 12 ? Math.ceil(rawTickCount / 10) : 1;
  const ticks: number[] = [];
  for (let t = tickStart, i = 0; t <= tickEnd; t += step, i++) if (i % thin === 0) ticks.push(t);

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
      newMin = mid - minWidth / 2; newMax = mid + minWidth / 2;
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
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none"
      style={{ cursor: dragRef.current ? "grabbing" : "grab", touchAction: "none" }}
      onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove}
      onMouseUp={endDrag} onMouseLeave={endDrag}>
      {sigma && spot > 0 && (
        <>
          {[2, 1].map((mult) => {
            const lo = spot - mult * sigma, hi = spot + mult * sigma;
            return (<rect key={mult} x={x(lo)} y={padT} width={Math.max(0, x(hi) - x(lo))} height={chartH} fill={MV.blueBg} opacity={mult === 1 ? 0.7 : 0.35} />);
          })}
          {[-2, -1, 1, 2].map((m) => {
            const v = spot + m * sigma;
            if (v < sMin || v > sMax) return null;
            return (
              <g key={m}>
                <line x1={x(v)} x2={x(v)} y1={padT} y2={H - padB} stroke={MV.borderStrong} strokeDasharray="2,3" strokeWidth="0.5" />
                <text x={x(v)} y={padT - 4} textAnchor="middle" fontSize="9" fill={MV.weak}>{m > 0 ? `+${m}σ` : `${m}σ`}</text>
              </g>
            );
          })}
        </>
      )}
      {pin && <rect x={x(pin.pin_lower)} y={padT} width={Math.max(2, x(pin.pin_upper) - x(pin.pin_lower))} height={chartH} fill={MV.greenLine} opacity={0.07} />}
      {accel && <rect x={x(accel.accel_lower)} y={padT} width={Math.max(2, x(accel.accel_upper) - x(accel.accel_lower))} height={chartH} fill={MV.redLine} opacity={0.07} />}
      <line x1={padL} x2={W - padR} y1={midY} y2={midY} stroke={MV.border} strokeWidth="0.5" />
      {bars.map((b) => {
        const bw = Math.max(3, (chartW / Math.max(bars.length, 1)) * 0.7);
        const bx = x(b.strike) - bw / 2;
        const h = barH(b.gex_cr);
        const pos = b.gex_cr >= 0;
        return (<rect key={b.strike} x={bx} y={pos ? midY - h : midY} width={bw} height={h} fill={pos ? MV.greenLine : MV.redLine} opacity={0.85} />);
      })}
      {maxGammaStrike != null && maxGammaStrike >= sMin && maxGammaStrike <= sMax && (
        <>
          <line x1={x(maxGammaStrike)} x2={x(maxGammaStrike)} y1={padT} y2={H - padB} stroke={MV.purple} strokeWidth="1" strokeDasharray="3,2" />
          <text x={x(maxGammaStrike) + 4} y={padT + 22} fontSize="10" fontWeight="600" fill={MV.purple}>max γ {fmtNum(maxGammaStrike)}</text>
        </>
      )}
      {flipLevel != null && flipLevel >= sMin && flipLevel <= sMax && (
        <>
          <line x1={x(flipLevel)} x2={x(flipLevel)} y1={padT} y2={H - padB} stroke={MV.amber} strokeWidth="1" strokeDasharray="3,2" />
          <text x={x(flipLevel) + 4} y={padT + 36} fontSize="10" fontWeight="600" fill={MV.amber}>flip {fmtNum(flipLevel)}</text>
        </>
      )}
      {spot >= sMin && spot <= sMax && (
        <>
          <line x1={x(spot)} x2={x(spot)} y1={padT - 8} y2={H - padB} stroke={MV.blue} strokeWidth="1.5" />
          <text x={x(spot)} y={padT - 12} textAnchor="middle" fontSize="11" fontWeight="700" fill={MV.blue} style={{ fontFamily: MV.mono }}>▼ SPOT {fmtNum(spot)}</text>
        </>
      )}
      {ticks.map((s) => (
        <g key={s}>
          <line x1={x(s)} x2={x(s)} y1={H - padB} y2={H - padB + 3} stroke={MV.weak} strokeWidth="0.5" />
          <text x={x(s)} y={H - 6} textAnchor="middle" fontSize="9" fill={MV.weak} style={{ fontFamily: MV.mono }}>{fmtNum(s, { maximumFractionDigits: 0 })}</text>
        </g>
      ))}
    </svg>
  );
}

export function MaxPainChart({
  rows, spot, step,
}: {
  rows: Array<{ candidate_strike: number; total_pain: number; max_pain_strike: number; side: string }>;
  spot: number; step: number;
}) {
  if (!rows?.length) return <Unavailable label="max pain view not available" />;
  const W = 1200, H = 280, padL = 40, padR = 30, padT = 24, padB = 28;
  const cw = W - padL - padR, ch = H - padT - padB;
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
  for (let t = tickStart, i = 0; t <= tickEnd; t += step, i++) if (i % thin === 0) ticks.push(t);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((p) => p * yMax);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={MV.border} strokeWidth="0.5" />
          <text x={padL - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill={MV.weak} style={{ fontFamily: MV.mono }}>{fmtBillion(v)}</text>
        </g>
      ))}
      {rows.map((r) => {
        const color = r.side === "MAX_PAIN" ? MV.amber : r.side === "PE_SIDE" ? MV.pink : MV.blueLine;
        return (<rect key={r.candidate_strike} x={x(r.candidate_strike) - bw / 2} y={y(r.total_pain)} width={bw} height={Math.max(1, padT + ch - y(r.total_pain))} fill={color} opacity={0.85} />);
      })}
      {spot >= sMin && spot <= sMax && (
        <>
          <line x1={x(spot)} x2={x(spot)} y1={padT - 8} y2={H - padB} stroke={MV.blue} strokeWidth="1.5" />
          <text x={x(spot)} y={padT - 12} textAnchor="middle" fontSize="11" fontWeight="700" fill={MV.blue} style={{ fontFamily: MV.mono }}>▼ SPOT {fmtNum(spot)}</text>
        </>
      )}
      {maxPain >= sMin && maxPain <= sMax && (
        <>
          <line x1={x(maxPain)} x2={x(maxPain)} y1={padT} y2={H - padB} stroke={MV.amber} strokeWidth="1" strokeDasharray="3,2" />
          <text x={x(maxPain) + 4} y={padT + 12} fontSize="10" fontWeight="600" fill={MV.amber}>max pain {fmtNum(maxPain)}</text>
        </>
      )}
      {ticks.map((s) => (
        <g key={s}>
          <line x1={x(s)} x2={x(s)} y1={H - padB} y2={H - padB + 3} stroke={MV.weak} strokeWidth="0.5" />
          <text x={x(s)} y={H - 8} textAnchor="middle" fontSize="9" fill={MV.weak} style={{ fontFamily: MV.mono }}>{fmtNum(s, { maximumFractionDigits: 0 })}</text>
        </g>
      ))}
    </svg>
  );
}

export function PinRiskTimeline({ rows }: { rows: Array<{ ts: string; spot: number | null; pin_risk_score: number | null }> }) {
  if (!rows?.length) return <Unavailable label="no intraday pin-risk data yet" />;
  const W = 1200, H = 220, padL = 40, padR = 50, padT = 18, padB = 28;
  const cw = W - padL - padR, ch = H - padT - padB;
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
  const scorePath = rows.filter((r) => r.pin_risk_score != null)
    .map((r, i) => `${i === 0 ? "M" : "L"}${x(ist(r.ts)).toFixed(1)},${yLeft(r.pin_risk_score!).toFixed(1)}`).join(" ");
  const spotPath = rows.filter((r) => r.spot != null)
    .map((r, i) => `${i === 0 ? "M" : "L"}${x(ist(r.ts)).toFixed(1)},${yRight(r.spot!).toFixed(1)}`).join(" ");
  const scoreArea = scorePath
    ? `${scorePath} L${x(ist(rows[rows.length - 1].ts)).toFixed(1)},${(padT + ch).toFixed(1)} L${x(ist(rows[0].ts)).toFixed(1)},${(padT + ch).toFixed(1)} Z`
    : "";
  const xTicks = [555, 615, 675, 735, 795, 855, 915];
  const fmtTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
      {[{ v: 75, c: MV.green, l: "75 strong" }, { v: 50, c: MV.amber, l: "50 moderate" }, { v: 25, c: MV.weak, l: "25 weak" }].map((t) => (
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
          <text x={x(m)} y={H - 8} textAnchor="middle" fontSize="9" fill={MV.weak} style={{ fontFamily: MV.mono }}>{fmtTime(m)}</text>
        </g>
      ))}
    </svg>
  );
}

export function StraddleIntradayChart({ buckets }: { buckets: StraddleBucket[] }) {
  const W = 560, H = 60, padL = 4, padR = 4, padT = 4, padB = 14;
  const cw = W - padL - padR, ch = H - padT - padB;
  const X_MIN = 555, X_MAX = 930;
  const x = (m: number) => padL + ((m - X_MIN) / (X_MAX - X_MIN)) * cw;
  const vals: number[] = [];
  buckets.forEach((b) => { if (b.today != null) vals.push(b.today); if (b.avg != null) vals.push(b.avg); });
  const hasData = vals.length > 0;
  const yMin = hasData ? Math.min(...vals) : 0;
  const yMax = hasData ? Math.max(...vals) : 1;
  const pad = (yMax - yMin) * 0.1 || 1;
  const yLo = Math.max(0, yMin - pad), yHi = yMax + pad;
  const y = (v: number) => padT + (1 - (v - yLo) / (yHi - yLo)) * ch;
  const toPath = (sel: (b: StraddleBucket) => number | null) => {
    let d = "", pen = false;
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
      {hasData && (<>
        <path d={toPath((b) => b.avg)} fill="none" stroke={MV.amber} strokeWidth="1" strokeDasharray="3,3" />
        <path d={toPath((b) => b.today)} fill="none" stroke={MV.blueLine} strokeWidth="1.6" />
      </>)}
      {!hasData && <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="10" fill={MV.weak}>no straddle data</text>}
    </svg>
  );
}

// Net dealer γ intraday: line + zero baseline + area fill green above / red below
export function NetGammaIntraday({ rows }: { rows: Array<{ ts: string; net_gex: number | null }> }) {
  const pts = rows.filter((r) => r.net_gex != null) as Array<{ ts: string; net_gex: number }>;
  if (!pts.length) return <Unavailable label="no intraday net-γ data" />;
  const W = 720, H = 160, padL = 34, padR = 12, padT = 12, padB = 22;
  const cw = W - padL - padR, ch = H - padT - padB;
  const ist = (iso: string) => {
    const t = new Date(iso).getTime() + 5.5 * 3600 * 1000;
    const d = new Date(t);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  };
  const X_MIN = 555, X_MAX = 930;
  const x = (m: number) => padL + ((m - X_MIN) / (X_MAX - X_MIN)) * cw;
  const vals = pts.map((p) => p.net_gex);
  const yMin = Math.min(...vals, 0), yMax = Math.max(...vals, 0);
  const pad = (yMax - yMin) * 0.1 || 1;
  const yLo = yMin - pad, yHi = yMax + pad;
  const y = (v: number) => padT + (1 - (v - yLo) / (yHi - yLo)) * ch;
  const yZero = y(0);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(ist(p.ts)).toFixed(1)},${y(p.net_gex).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1].net_gex;
  const areaColor = last >= 0 ? MV.green : MV.red;
  const strokeColor = last >= 0 ? MV.greenLine : MV.redLine;
  const area = path
    ? `${path} L${x(ist(pts[pts.length - 1].ts)).toFixed(1)},${yZero.toFixed(1)} L${x(ist(pts[0].ts)).toFixed(1)},${yZero.toFixed(1)} Z`
    : "";
  const xTicks = [555, 615, 675, 735, 795, 855, 915];
  const fmtTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
      <line x1={padL} x2={W - padR} y1={yZero} y2={yZero} stroke={MV.borderStrong} strokeDasharray="2,3" strokeWidth="0.5" />
      <text x={padL - 4} y={yZero + 3} textAnchor="end" fontSize="9" fill={MV.weak} style={{ fontFamily: MV.mono }}>0</text>
      <text x={padL - 4} y={y(yMax) + 3} textAnchor="end" fontSize="9" fill={MV.weak} style={{ fontFamily: MV.mono }}>{fmtSigned(yMax)}</text>
      <text x={padL - 4} y={y(yMin) + 3} textAnchor="end" fontSize="9" fill={MV.weak} style={{ fontFamily: MV.mono }}>{fmtSigned(yMin)}</text>
      <path d={area} fill={areaColor} opacity={0.12} />
      <path d={path} fill="none" stroke={strokeColor} strokeWidth="1.6" />
      {xTicks.map((m) => (
        <g key={m}>
          <line x1={x(m)} x2={x(m)} y1={H - padB} y2={H - padB + 3} stroke={MV.weak} strokeWidth="0.5" />
          <text x={x(m)} y={H - 8} textAnchor="middle" fontSize="9" fill={MV.weak} style={{ fontFamily: MV.mono }}>{fmtTime(m)}</text>
        </g>
      ))}
    </svg>
  );
}

// Direction (Rising / Falling / Flat) based on recent slope
export function netGammaDirection(rows: Array<{ ts: string; net_gex: number | null }>): "Rising" | "Falling" | "Flat" {
  const pts = rows.filter((r) => r.net_gex != null) as Array<{ ts: string; net_gex: number }>;
  if (pts.length < 3) return "Flat";
  const n = pts.length;
  const recent = pts.slice(Math.max(0, n - 6));
  const first = recent[0].net_gex, last = recent[recent.length - 1].net_gex;
  const range = Math.max(1, Math.max(...pts.map((p) => Math.abs(p.net_gex))));
  const delta = (last - first) / range;
  if (delta > 0.05) return "Rising";
  if (delta < -0.05) return "Falling";
  return "Flat";
}
