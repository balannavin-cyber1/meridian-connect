import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Target,
  History,
  LineChart as LineChartIcon,
  TargetIcon as TargetArrow,
  Plus,
} from "lucide-react";
import {
  niftySnap,
  sensexSnap,
  todaysSignals,
  activeSignal,
  niftyGex,
  niftyPin,
  niftyAccel,
  niftyMaxGammaStrike,
  ictZones,
  dealerFlow,
  straddleSpark,
  straddleNow,
  straddleAvg,
  type Symbol as MSymbol,
} from "@/lib/mockData";

function Sparkline({ data, color = "currentColor", w = 42, h = 14 }: { data: number[]; color?: string; w?: number; h?: number }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.25} />
    </svg>
  );
}

function Chip({
  children,
  tone = "default",
  className = "",
  onClick,
  title,
}: {
  children: React.ReactNode;
  tone?: "default" | "success" | "danger" | "warning" | "info" | "muted";
  className?: string;
  onClick?: () => void;
  title?: string;
}) {
  const tones: Record<string, string> = {
    default: "bg-bg-tertiary text-text-secondary",
    success: "bg-success-bg text-success-text",
    danger: "bg-danger-bg text-danger-text",
    warning: "bg-warning-bg text-warning-text",
    info: "bg-info-bg text-info-text",
    muted: "bg-bg-secondary text-text-tertiary",
  };
  return (
    <span
      onClick={onClick}
      title={title}
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium leading-none ${tones[tone]} ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      {children}
    </span>
  );
}

const fmtNum = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

// ---------- Hero spatial chart ----------
function HeroChart({ symbol }: { symbol: MSymbol }) {
  const snap = symbol === "NIFTY" ? niftySnap : sensexSnap;
  const bars = niftyGex; // mock: same for both
  const pin = niftyPin;
  const accel = niftyAccel;
  const maxGamma = niftyMaxGammaStrike;

  const W = 660;
  const H = 320;
  const padL = 40;
  const padR = 14;
  const padT = 42;
  const padB = 36;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const midY = padT + chartH / 2;

  const strikes = bars.map((b) => b.strike);
  const sMin = Math.min(...strikes);
  const sMax = Math.max(...strikes);
  const sRange = sMax - sMin || 1;
  const x = (s: number) => padL + ((s - sMin) / sRange) * chartW;

  const maxAbs = Math.max(...bars.map((b) => Math.abs(b.gex_cr))) || 1;
  const barH = (v: number) => (Math.abs(v) / maxAbs) * (chartH / 2);

  const xAxisStrikes = [sMin, sMin + sRange * 0.25, sMin + sRange * 0.5, sMin + sRange * 0.75, sMax];

  // confluence detection: PIN overlaps W BEAR_FVG?
  const confluence = ictZones.find(
    (z) => !(z.range_high < pin.range_low || z.range_low > pin.range_high)
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="img"
      aria-label="GEX-by-strike spatial chart"
    >
      <title>GEX-by-strike spatial chart</title>

      {/* PIN band */}
      <rect
        x={x(pin.range_low)}
        y={padT}
        width={x(pin.range_high) - x(pin.range_low)}
        height={chartH}
        fill="#639922"
        opacity="0.08"
      />
      <text
        x={(x(pin.range_low) + x(pin.range_high)) / 2}
        y={padT + 10}
        textAnchor="middle"
        fontSize="10"
        fontWeight="500"
        fill="var(--color-success-text)"
      >
        PIN {fmtNum(pin.range_low)}-{fmtNum(pin.range_high)}
      </text>

      {/* ACCEL band */}
      <rect
        x={x(accel.range_low)}
        y={padT}
        width={x(accel.range_high) - x(accel.range_low)}
        height={chartH}
        fill="#e24b4a"
        opacity="0.08"
      />
      <text
        x={(x(accel.range_low) + x(accel.range_high)) / 2}
        y={padT + 10}
        textAnchor="middle"
        fontSize="10"
        fontWeight="500"
        fill="var(--color-danger-text)"
      >
        ACCEL {fmtNum(accel.range_low)}-{fmtNum(accel.range_high)}
      </text>

      {/* ICT zone overlays */}
      {ictZones.slice(0, 4).map((z, i) => {
        const isBear = z.type.startsWith("BEAR");
        const fill = isBear ? "#7a1f1d" : "#1f4d10";
        const top = isBear ? padT + 14 + i * 12 : padT + chartH - 26 - i * 12;
        return (
          <g key={i}>
            <rect
              x={x(z.range_low)}
              y={top}
              width={x(z.range_high) - x(z.range_low)}
              height={10}
              fill={fill}
              fillOpacity="0.55"
              stroke={fill}
              strokeWidth="0.5"
            />
            <text
              x={x(z.range_low) + 4}
              y={top + 7.5}
              fontSize="9"
              fill="rgba(245,245,245,0.85)"
            >
              {z.tf} {z.type}
            </text>
          </g>
        );
      })}

      {/* Baseline */}
      <line x1={padL} x2={W - padR} y1={midY} y2={midY} stroke="var(--color-border-secondary)" strokeWidth="0.5" />

      {/* GEX bars */}
      {bars.map((b) => {
        const bw = 8;
        const bx = x(b.strike) - bw / 2;
        const h = barH(b.gex_cr);
        const pos = b.gex_cr >= 0;
        const op = 0.35 + 0.6 * (Math.abs(b.gex_cr) / maxAbs);
        return (
          <rect
            key={b.strike}
            x={bx}
            y={pos ? midY - h : midY}
            width={bw}
            height={h}
            fill={pos ? "#639922" : "#e24b4a"}
            opacity={op}
          />
        );
      })}

      {/* Confluence ring */}
      {confluence && (
        <g>
          <rect
            x={x(Math.max(pin.range_low, confluence.range_low)) - 6}
            y={padT + 22}
            width={
              x(Math.min(pin.range_high, confluence.range_high)) -
              x(Math.max(pin.range_low, confluence.range_low)) +
              12
            }
            height={chartH - 32}
            fill="none"
            stroke="#ef9f27"
            strokeWidth="1.5"
            strokeDasharray="3,2"
            rx="3"
          />
          <text
            x={(x(Math.max(pin.range_low, confluence.range_low)) + x(Math.min(pin.range_high, confluence.range_high))) / 2}
            y={padT + 22}
            textAnchor="middle"
            fontSize="9"
            fontWeight="500"
            fill="#ef9f27"
          >
            ★ confluence: PIN ∩ {confluence.type}
          </text>
        </g>
      )}

      {/* Max γ vertical */}
      <line
        x1={x(maxGamma)}
        x2={x(maxGamma)}
        y1={padT}
        y2={H - padB}
        stroke="#7f77dd"
        strokeWidth="1"
        strokeDasharray="3,2"
      />
      <text x={x(maxGamma) + 4} y={padT + 24} fontSize="9" fontWeight="500" fill="#7f77dd">
        max γ {fmtNum(maxGamma)}
      </text>

      {/* Spot vertical */}
      <line x1={x(snap.spot)} x2={x(snap.spot)} y1={padT} y2={H - padB} stroke="#185fa5" strokeWidth="1.5" />
      <g>
        <rect x={x(snap.spot) - 28} y={H - padB + 4} width="56" height="16" rx="2" fill="#185fa5" />
        <text
          x={x(snap.spot)}
          y={H - padB + 15}
          textAnchor="middle"
          fontSize="10"
          fontWeight="500"
          fill="#fff"
          fontFamily="ui-monospace, monospace"
        >
          {fmtNum(snap.spot)}
        </text>
      </g>

      {/* X labels */}
      {xAxisStrikes.map((s) => (
        <text
          key={s}
          x={x(s)}
          y={H - 4}
          textAnchor="middle"
          fontSize="9"
          fill="var(--color-text-tertiary)"
        >
          {fmtNum(Math.round(s))}
        </text>
      ))}

      {/* Y labels */}
      <text x={padL - 4} y={padT + 6} textAnchor="end" fontSize="9" fill="var(--color-text-tertiary)">
        long γ
      </text>
      <text x={padL - 4} y={H - padB} textAnchor="end" fontSize="9" fill="var(--color-text-tertiary)">
        short γ
      </text>
    </svg>
  );
}

// ---------- Page ----------
export default function Marketview() {
  const [symbol, setSymbol] = useState<MSymbol>("NIFTY");
  const [frozen, setFrozen] = useState(false);
  const [activeSignalIdx, setActiveSignalIdx] = useState(0);
  const nav = useNavigate();

  const snap = symbol === "NIFTY" ? niftySnap : sensexSnap;

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "n" || e.key === "N") setSymbol("NIFTY");
      else if (e.key === "s" || e.key === "S") setSymbol("SENSEX");
      else if (e.key === " ") {
        e.preventDefault();
        setFrozen((f) => !f);
      } else if (e.key === "e" || e.key === "E") nav("/order");
      else if (e.key === "j" || e.key === "J")
        setActiveSignalIdx((i) => Math.min(i + 1, todaysSignals.length - 1));
      else if (e.key === "k" || e.key === "K") setActiveSignalIdx((i) => Math.max(i - 1, 0));
      else if (e.key === "a" || e.key === "A") alert("Journal annotation modal (Phase 2)");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);

  const dteTone = snap.dte_hours === 0 ? "danger" : snap.dte_hours < 24 ? "warning" : "muted";
  const regimeTone =
    snap.regime === "long_gamma" ? "success" : snap.regime === "short_gamma" ? "danger" : "warning";
  const po3Tone =
    snap.po3 === "PO3_BULLISH" ? "success" : snap.po3 === "PO3_BEARISH" ? "danger" : "muted";
  const changeColor = snap.change_pct >= 0 ? "var(--color-success)" : "var(--color-danger)";

  const zonesNearSpot = useMemo(
    () => ictZones.filter((z) => Math.abs((z.range_low + z.range_high) / 2 - snap.spot) / snap.spot < 0.02),
    [snap.spot]
  );

  return (
    <div className="relative min-h-full bg-bg-primary text-text-primary">
      {/* (1) Header strip */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border-tertiary px-4 py-2.5">
        <div className="inline-flex items-center gap-1 rounded bg-bg-secondary p-0.5">
          {(["NIFTY", "SENSEX"] as MSymbol[]).map((s) => (
            <button
              key={s}
              onClick={() => setSymbol(s)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium leading-none transition-colors ${
                symbol === s
                  ? "bg-bg-primary border border-border-tertiary text-text-primary"
                  : "text-text-secondary"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <span className="mono text-[18px] font-medium tabular-nums">{fmtNum(snap.spot)}</span>
        <span
          className="text-[11px] font-medium"
          style={{ color: changeColor }}
        >
          {snap.change_pct >= 0 ? "+" : ""}
          {snap.change_pct.toFixed(2)}%
        </span>
        <Sparkline data={snap.spark} color={changeColor} />

        <span
          className="text-[11px] font-medium"
          style={{ color: snap.gap_pct >= 0 ? "var(--color-success)" : "var(--color-danger)" }}
        >
          gap {snap.gap_pct >= 0 ? "+" : ""}
          {snap.gap_pct.toFixed(2)}%
        </span>

        <Chip
          tone={dteTone as any}
          title={snap.dte_hours === 0 ? "Expiring today" : `${snap.dte_hours}h to expiry`}
        >
          dte {snap.dte_hours}h
        </Chip>
        <Chip tone={regimeTone as any}>{snap.regime.replace("_", " ")}</Chip>
        <Chip tone={po3Tone as any}>
          po3 {snap.po3 === "PO3_BULLISH" ? "↑" : snap.po3 === "PO3_BEARISH" ? "↓" : "—"}
        </Chip>
        <Chip tone="info">{snap.session_phase}</Chip>
        <span className="text-[11px]">
          <span className="text-text-tertiary">vix </span>
          <span className="text-text-primary">{snap.vix.toFixed(1)}</span>
        </span>

        <div className="flex-1" />

        <span
          className="text-[11px]"
          style={{ color: snap.breadth >= 0 ? "var(--color-success)" : "var(--color-danger)" }}
        >
          breadth {snap.breadth >= 0 ? "+" : ""}
          {snap.breadth}
        </span>
        {frozen && <Chip tone="warning">frozen</Chip>}
        {snap.stale_seconds && snap.stale_seconds > 60 && (
          <Chip tone="danger" onClick={() => nav("/health")}>
            stale {snap.stale_seconds}s
          </Chip>
        )}
      </div>

      {/* (2) Signal row — conditional */}
      {activeSignal && (
        <div className="flex items-center gap-2.5 border-b border-border-tertiary bg-bg-secondary px-4 py-2.5">
          <Target size={14} className="text-text-secondary" />
          <span className="text-[13px] font-medium">
            {activeSignal.action.replace("_", " ")} {fmtNum(activeSignal.strike)}{" "}
            {activeSignal.action.endsWith("PE") ? "PE" : "CE"}
          </span>
          <span className="text-[11px] text-text-secondary">conf {activeSignal.conf}</span>
          <Chip tone={activeSignal.status === "blocked" ? "danger" : "success"}>
            {activeSignal.status} · {activeSignal.status_reason}
          </Chip>
          <div className="flex-1" />
          <span className="text-[11px] text-text-tertiary">click → expand</span>
          <button
            onClick={() => nav(`/order?strike=${activeSignal!.strike}&action=${activeSignal!.action}`)}
            className="text-[11px] font-medium text-info-text hover:underline"
          >
            place order →
          </button>
        </div>
      )}

      {/* (3) Hero chart */}
      <div className="px-4 pb-3 pt-4">
        <HeroChart symbol={symbol} />
      </div>

      {/* (4) Dealer flow */}
      <div className="border-y border-border-tertiary px-4 py-3">
        <div className="mb-1.5 text-[10px] uppercase tracking-[1px] text-text-tertiary">
          dealer flow · 6 scenarios
        </div>
        <div className="grid grid-cols-6 gap-1">
          {dealerFlow.map((c) => {
            const big = Math.abs(c.dealer_cr) > 100;
            return (
              <div key={c.pct} className="rounded bg-bg-secondary px-1 py-1.5 text-center">
                <div className="text-[9px] text-text-tertiary">
                  {c.pct > 0 ? "+" : ""}
                  {c.pct}%
                </div>
                <div
                  className="mono text-[11px] font-medium"
                  style={{ color: big ? "var(--color-danger-text)" : "var(--color-warning-text)" }}
                >
                  {c.dealer_cr >= 0 ? "+" : ""}
                  {c.dealer_cr} Cr
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* (5) Secondary row */}
      <div className="border-b border-border-tertiary px-4 py-3">
        <div className="mb-1.5 text-[10px] uppercase tracking-[1px] text-text-tertiary">
          secondary · context panels
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {zonesNearSpot.length > 0 && (
            <div className="rounded-md border border-border-tertiary bg-bg-primary p-2.5">
              <div className="mb-1 flex items-center gap-1.5">
                <TargetArrow size={13} className="text-text-secondary" />
                <span className="text-[11px] font-medium">ICT zones ±2%</span>
              </div>
              <ul className="space-y-0.5 text-[10px] leading-snug text-text-secondary">
                {zonesNearSpot.map((z, i) => (
                  <li key={i} className="cursor-pointer hover:text-text-primary">
                    {z.tf} {z.type} · {fmtNum(z.range_low)}-{fmtNum(z.range_high)}
                  </li>
                ))}
              </ul>
              <div className="mt-1.5 text-[9px] text-text-tertiary">click row → TradingView</div>
            </div>
          )}

          <div className="rounded-md border border-border-tertiary bg-bg-primary p-2.5">
            <div className="mb-1 flex items-center gap-1.5">
              <History size={13} className="text-text-secondary" />
              <span className="text-[11px] font-medium">today's signals</span>
            </div>
            <ul className="space-y-0.5 text-[10px] leading-snug text-text-secondary">
              {todaysSignals.length === 0 ? (
                <li className="text-text-tertiary">— no actionables yet —</li>
              ) : (
                todaysSignals.map((s, i) => (
                  <li
                    key={i}
                    onClick={() => setActiveSignalIdx(i)}
                    className={`cursor-pointer hover:text-text-primary ${
                      i === activeSignalIdx ? "text-text-primary" : ""
                    }`}
                  >
                    {s.time} {s.action} {fmtNum(s.strike)} · {s.status}
                  </li>
                ))
              )}
            </ul>
            <div className="mt-1.5 text-[9px] text-text-tertiary">j/k → step</div>
          </div>

          <div className="rounded-md border border-border-tertiary bg-bg-primary p-2.5">
            <div className="mb-1 flex items-center gap-1.5">
              <LineChartIcon size={13} className="text-text-secondary" />
              <span className="text-[11px] font-medium">atm straddle</span>
            </div>
            <StraddleSparkline />
            <div className="mt-1 text-[10px] text-text-secondary">
              ₹{straddleNow} · <span className="text-text-tertiary">avg ₹{straddleAvg}</span>
            </div>
          </div>
        </div>
      </div>

      {/* (6) IV Skew placeholder */}
      <div className="px-4 py-3" style={{ opacity: 0.55 }}>
        <div className="mb-1.5 text-[10px] uppercase tracking-[1px] text-text-tertiary">
          iv skew · phase 2 (enh-84)
        </div>
        <div className="rounded-md border border-dashed border-border-secondary bg-bg-secondary px-3 py-3.5 text-center text-[10px] text-text-tertiary">
          smile from gamma_call/gamma_put across strike grid · ships with enh-84
        </div>
      </div>

      {/* (7) FAB */}
      <button
        onClick={() => alert("Journal capture modal (Phase 2)")}
        className="fixed bottom-5 right-5 flex h-9 w-9 items-center justify-center rounded-full border border-info bg-info-bg text-info-text hover:bg-info hover:text-white"
        title="Annotate (A)"
      >
        <Plus size={18} />
      </button>
    </div>
  );
}

function StraddleSparkline() {
  const data = straddleSpark;
  const w = 180;
  const h = 42;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ");
  const avgY = h - ((straddleAvg - min) / range) * h;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full">
      <line x1={0} x2={w} y1={avgY} y2={avgY} stroke="var(--color-text-tertiary)" strokeWidth="0.5" strokeDasharray="2,2" />
      <polyline points={pts} fill="none" stroke="var(--color-info-text)" strokeWidth="1.5" />
    </svg>
  );
}
