import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Target,
  History,
  LineChart as LineChartIcon,
  TargetIcon as TargetArrow,
  Plus,
  RefreshCw,
} from "lucide-react";
import {
  useSpotMarker,
  useGammaLatest,
  useGammaSeries,
  useLatestSignal,
  useTodaysSignals,
  useGexStrikes,
  usePinZone,
  useAccelZone,
  useIctZones,
  useDealerFlow,
  useRefetchMarketview,
  type Symbol as MSymbol,
} from "@/lib/queries";

function Sparkline({ data, color = "currentColor", w = 42, h = 14 }: { data: number[]; color?: string; w?: number; h?: number }) {
  if (!data || data.length < 2) return <svg width={w} height={h} />;
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

// ---------- Hero spatial chart ----------
function HeroChart({
  spot,
  bars: rawBars,
  pin,
  accel,
  ictZones,
}: {
  spot: number;
  bars: { strike: number; gex_cr: number }[];
  pin: { pin_lower: number; pin_upper: number } | null;
  accel: { accel_lower: number; accel_upper: number } | null;
  ictZones: any[];
}) {
  const W = 660;
  const H = 320;
  const padL = 40;
  const padR = 14;
  const padT = 42;
  const padB = 36;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const midY = padT + chartH / 2;

  if (!rawBars.length) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-md border border-dashed border-border-secondary bg-bg-secondary text-[11px] text-text-tertiary">
        no GEX strike data
      </div>
    );
  }

  // Clip strike range to spot ±2% (fallback ±5% if too few bars)
  let bars = rawBars;
  if (spot > 0) {
    const within = (pct: number) =>
      rawBars.filter((b) => Math.abs(b.strike - spot) / spot <= pct);
    bars = within(0.02);
    if (bars.length < 5) bars = within(0.05);
    if (bars.length < 3) bars = rawBars;
  }

  const strikes = bars.map((b) => b.strike);
  const sMin = Math.min(...strikes, spot * 0.98);
  const sMax = Math.max(...strikes, spot * 1.02);
  const sRange = sMax - sMin || 1;
  const x = (s: number) => padL + ((s - sMin) / sRange) * chartW;

  const maxAbs = Math.max(...bars.map((b) => Math.abs(b.gex_cr))) || 1;
  const barH = (v: number) => (Math.abs(v) / maxAbs) * (chartH / 2);
  const maxGamma = bars.reduce((m, b) => (Math.abs(b.gex_cr) > Math.abs(m.gex_cr) ? b : m)).strike;

  const xAxisStrikes = [sMin, sMin + sRange * 0.25, sMin + sRange * 0.5, sMin + sRange * 0.75, sMax];

  // ICT zones: nearest to spot, max 5, within strike range
  const visibleZones = (ictZones ?? [])
    .map((z) => {
      const lo = z.zone_low ?? z.range_low;
      const hi = z.zone_high ?? z.range_high;
      return { z, lo, hi, mid: lo != null && hi != null ? (lo + hi) / 2 : null };
    })
    .filter((r) => r.lo != null && r.hi != null && r.hi >= sMin && r.lo <= sMax)
    .sort((a, b) => Math.abs((a.mid as number) - spot) - Math.abs((b.mid as number) - spot))
    .slice(0, 5);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="GEX-by-strike spatial chart">
      <title>GEX-by-strike spatial chart</title>

      {/* PIN band + label inside band, top */}
      {pin && (
        <>
          <rect x={x(pin.pin_lower)} y={padT} width={x(pin.pin_upper) - x(pin.pin_lower)} height={chartH} fill="#639922" opacity="0.08" />
          <text x={(x(pin.pin_lower) + x(pin.pin_upper)) / 2} y={padT + 12} textAnchor="middle" fontSize="10" fontWeight="500" fill="var(--color-success-text)">
            PIN {fmtNum(pin.pin_lower)}-{fmtNum(pin.pin_upper)}
          </text>
        </>
      )}

      {/* ACCEL band + label staggered 16px below PIN */}
      {accel && (
        <>
          <rect x={x(accel.accel_lower)} y={padT} width={x(accel.accel_upper) - x(accel.accel_lower)} height={chartH} fill="#e24b4a" opacity="0.08" />
          <text x={(x(accel.accel_lower) + x(accel.accel_upper)) / 2} y={padT + 28} textAnchor="middle" fontSize="10" fontWeight="500" fill="var(--color-danger-text)">
            ACCEL {fmtNum(accel.accel_lower)}-{fmtNum(accel.accel_upper)}
          </text>
        </>
      )}

      {/* ICT zones — bear above, bull below, staggered with 12px rows */}
      {visibleZones.map((r, i) => {
        const { z, lo, hi } = r;
        const ptype: string = z.pattern_type ?? z.type ?? "";
        const isBear = ptype.startsWith("BEAR");
        const fill = isBear ? "#7a1f1d" : "#1f4d10";
        const bearIdx = visibleZones.filter((v, j) => j <= i && (v.z.pattern_type ?? v.z.type ?? "").startsWith("BEAR")).length - 1;
        const bullIdx = visibleZones.filter((v, j) => j <= i && !(v.z.pattern_type ?? v.z.type ?? "").startsWith("BEAR")).length - 1;
        const top = isBear ? padT + 46 + bearIdx * 14 : padT + chartH - 28 - bullIdx * 14;
        return (
          <g key={i}>
            <rect x={x(lo)} y={top} width={Math.max(2, x(hi) - x(lo))} height={11} fill={fill} fillOpacity="0.55" stroke={fill} strokeWidth="0.5" />
            <text x={x(lo) + 4} y={top + 8.5} fontSize="9" fill="rgba(245,245,245,0.9)">
              {(z.ict_tier ?? z.tf ?? "")} {ptype}
            </text>
          </g>
        );
      })}

      <line x1={padL} x2={W - padR} y1={midY} y2={midY} stroke="var(--color-border-secondary)" strokeWidth="0.5" />

      {bars.map((b) => {
        const bw = Math.max(3, (chartW / bars.length) * 0.6);
        const bx = x(b.strike) - bw / 2;
        const h = barH(b.gex_cr);
        const pos = b.gex_cr >= 0;
        const op = 0.35 + 0.6 * (Math.abs(b.gex_cr) / maxAbs);
        return (
          <rect key={b.strike} x={bx} y={pos ? midY - h : midY} width={bw} height={h} fill={pos ? "#639922" : "#e24b4a"} opacity={op} />
        );
      })}

      {/* max γ line + label staggered to midY */}
      <line x1={x(maxGamma)} x2={x(maxGamma)} y1={padT} y2={H - padB} stroke="#7f77dd" strokeWidth="1" strokeDasharray="3,2" />
      <text x={x(maxGamma) + 4} y={midY - 4} fontSize="9" fontWeight="500" fill="#7f77dd">
        max γ {fmtNum(maxGamma)}
      </text>

      {spot >= sMin && spot <= sMax && (
        <>
          <line x1={x(spot)} x2={x(spot)} y1={padT} y2={H - padB} stroke="#185fa5" strokeWidth="1.5" />
          <g>
            <rect x={x(spot) - 28} y={H - padB + 4} width="56" height="16" rx="2" fill="#185fa5" />
            <text x={x(spot)} y={H - padB + 15} textAnchor="middle" fontSize="10" fontWeight="500" fill="#fff" fontFamily="ui-monospace, monospace">
              {fmtNum(spot)}
            </text>
          </g>
        </>
      )}

      {xAxisStrikes.map((s) => (
        <text key={s} x={x(s)} y={H - 4} textAnchor="middle" fontSize="9" fill="var(--color-text-tertiary)">
          {fmtNum(Math.round(s))}
        </text>
      ))}
      <text x={padL - 4} y={padT + 6} textAnchor="end" fontSize="9" fill="var(--color-text-tertiary)">long γ</text>
      <text x={padL - 4} y={H - padB} textAnchor="end" fontSize="9" fill="var(--color-text-tertiary)">short γ</text>
    </svg>
  );
}

const qualityTone = (q?: string | null): "success" | "info" | "warning" | "danger" | "muted" => {
  switch ((q ?? "").toUpperCase()) {
    case "A": return "success";
    case "B": return "info";
    case "C": return "warning";
    case "D": return "danger";
    case "SKIP":
    case "NO_TRADE": return "muted";
    default: return "muted";
  }
};

// ---------- Page ----------
export default function Marketview() {
  const [symbol, setSymbol] = useState<MSymbol>("NIFTY");
  const [frozen, setFrozen] = useState(false);
  const [activeSignalIdx, setActiveSignalIdx] = useState(0);
  const nav = useNavigate();
  const refetchAll = useRefetchMarketview();

  const marker = useSpotMarker(symbol);
  const gamma = useGammaLatest(symbol);
  const gammaSeries = useGammaSeries(symbol);
  const signal = useLatestSignal(symbol);
  const signals = useTodaysSignals(symbol);
  const expiry = gamma.data?.expiry_date as string | undefined;
  const strikes = useGexStrikes(symbol, expiry);
  const pin = usePinZone(symbol, expiry);
  const accel = useAccelZone(symbol, expiry);
  const zones = useIctZones(symbol);
  const dealer = useDealerFlow(symbol, expiry);

  const spot = (gamma.data?.spot ?? spotFromMarker(marker.data) ?? 0) as number;
  const spotSpark = useMemo(
    () => (gammaSeries.data ?? []).map((r: any) => r.spot).filter((v) => v != null) as number[],
    [gammaSeries.data],
  );
  const straddleSpark = useMemo(
    () => (gammaSeries.data ?? []).map((r: any) => r.straddle_atm).filter((v) => v != null) as number[],
    [gammaSeries.data],
  );
  const straddleNow = straddleSpark.length ? straddleSpark[straddleSpark.length - 1] : null;
  const straddleAvg = straddleSpark.length
    ? Math.round(straddleSpark.reduce((s, v) => s + v, 0) / straddleSpark.length)
    : null;

  const prevClose = (marker.data?.prev_close_spot ?? null) as number | null;
  const changePct = prevClose && spot ? ((spot - prevClose) / prevClose) * 100 : 0;
  const gapPct = (marker.data?.gap_open_pct ?? marker.data?.premarket_move_pct ?? 0) as number;
  const vix = (gamma.data?.vix ?? signal.data?.india_vix ?? null) as number | null;
  const breadthScore = (signal.data?.breadth_score ?? null) as number | null;
  const regime = (gamma.data?.regime ?? signal.data?.gamma_regime ?? "—") as string;
  const breadthRegime = (gamma.data?.breadth_regime ?? signal.data?.breadth_regime ?? null) as string | null;

  // dte from gamma_metrics.dte
  const dteHours = (gamma.data?.dte ?? 0) * 24;

  // session phase heuristic: morning/mid/afternoon based on IST hour
  const sessionPhase = useMemo(() => {
    const h = new Date().getUTCHours() + 5.5;
    const hr = ((h % 24) + 24) % 24;
    if (hr < 9.25) return "premarket";
    if (hr < 11) return "morning";
    if (hr < 13.5) return "midday";
    if (hr < 15.5) return "afternoon";
    return "postmarket";
  }, [gamma.dataUpdatedAt]);

  // stale seconds — canonical clock is signal_snapshots.ts, threshold 5min
  const signalTs = signal.data?.ts ? new Date(signal.data.ts).getTime() : null;
  const staleSeconds = signalTs ? Math.max(0, Math.floor((Date.now() - signalTs) / 1000)) : null;
  const STALE_THRESHOLD = 300;

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "n" || e.key === "N") setSymbol("NIFTY");
      else if (e.key === "s" || e.key === "S") setSymbol("SENSEX");
      else if (e.key === "r" || e.key === "R") refetchAll();
      else if (e.key === " ") {
        e.preventDefault();
        setFrozen((f) => !f);
      } else if (e.key === "e" || e.key === "E") nav("/order");
      else if (e.key === "j" || e.key === "J")
        setActiveSignalIdx((i) => Math.min(i + 1, (signals.data?.length ?? 1) - 1));
      else if (e.key === "k" || e.key === "K") setActiveSignalIdx((i) => Math.max(i - 1, 0));
      else if (e.key === "a" || e.key === "A") alert("Journal annotation modal (Phase 2)");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav, refetchAll, signals.data?.length]);

  const dteTone = dteHours === 0 ? "danger" : dteHours < 24 ? "warning" : "muted";
  const regimeTone =
    regime === "LONG_GAMMA" ? "success" : regime === "SHORT_GAMMA" ? "danger" : "warning";
  const changeColor = changePct >= 0 ? "var(--color-success)" : "var(--color-danger)";

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
      .slice(0, 10)
      .map((r) => r.z);
  }, [zones.data, spot]);

  const activeSignal = signal.data;
  const isLoading = marker.isLoading || gamma.isLoading;

  return (
    <div className="relative min-h-full bg-bg-primary text-text-primary">
      {/* Header strip */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border-tertiary px-4 py-2.5">
        <div className="inline-flex items-center gap-1 rounded bg-bg-secondary p-0.5">
          {(["NIFTY", "SENSEX"] as MSymbol[]).map((s) => (
            <button
              key={s}
              onClick={() => setSymbol(s)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium leading-none transition-colors ${
                symbol === s ? "bg-bg-primary border border-border-tertiary text-text-primary" : "text-text-secondary"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <span className="mono text-[18px] font-medium tabular-nums">{spot ? fmtNum(spot) : "—"}</span>
        <span className="text-[11px] font-medium" style={{ color: changeColor }}>
          {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
        </span>
        <Sparkline data={spotSpark} color={changeColor} />

        <span className="text-[11px] font-medium" style={{ color: gapPct >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
          gap {gapPct >= 0 ? "+" : ""}{gapPct.toFixed(2)}%
        </span>

        <Chip tone={dteTone as any} title={`${dteHours}h to expiry`}>dte {dteHours}h</Chip>
        <Chip tone={regimeTone as any}>{regime.toLowerCase().replace("_", " ")}</Chip>
        {breadthRegime && <Chip tone="muted">{breadthRegime.toLowerCase()}</Chip>}
        <Chip tone="info">{sessionPhase}</Chip>
        {vix != null && (
          <span className="text-[11px]">
            <span className="text-text-tertiary">vix </span>
            <span className="text-text-primary">{vix.toFixed(1)}</span>
          </span>
        )}

        <div className="flex-1" />

        <button
          onClick={() => refetchAll()}
          title="Refetch all (R)"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-text-secondary hover:bg-bg-secondary"
        >
          <RefreshCw size={12} /> r
        </button>

        {breadthScore != null && (
          <span className="text-[11px]" style={{ color: breadthScore >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
            breadth {breadthScore >= 0 ? "+" : ""}{breadthScore.toFixed(0)}
          </span>
        )}
        {frozen && <Chip tone="warning">frozen</Chip>}
        {staleSeconds != null && staleSeconds > STALE_THRESHOLD && (
          <Chip tone="danger" onClick={() => nav("/health")}>
            stale {staleSeconds}s
          </Chip>
        )}
        {isLoading && <Chip tone="muted">loading…</Chip>}
      </div>

      {/* Signal row */}
      {activeSignal && (
        <div className="flex items-center gap-2.5 border-b border-border-tertiary bg-bg-secondary px-4 py-2.5">
          <Target size={14} className="text-text-secondary" />
          <span className="text-[13px] font-medium">
            {(activeSignal.action ?? "").replace("_", " ")} {activeSignal.atm_strike ? fmtNum(activeSignal.atm_strike) : ""}
          </span>
          <span className="text-[11px] text-text-secondary">conf {activeSignal.confidence_score?.toFixed?.(0) ?? "—"}</span>
          <Chip tone={activeSignal.trade_allowed ? "success" : "danger"}>
            {activeSignal.trade_allowed ? "allowed" : "blocked"}
          </Chip>
          <Chip tone={qualityTone(activeSignal.entry_quality)} title="entry quality">
            quality {activeSignal.entry_quality ?? "—"}
          </Chip>
          <div className="flex-1" />
          <button
            onClick={() => nav(`/order?strike=${activeSignal.atm_strike}&action=${activeSignal.action}`)}
            className="text-[11px] font-medium text-info-text hover:underline"
          >
            place order →
          </button>
        </div>
      )}

      {/* Hero chart */}
      <div className="px-4 pb-3 pt-4">
        <HeroChart
          spot={spot}
          bars={(strikes.data ?? []) as any}
          pin={pin.data as any}
          accel={accel.data as any}
          ictZones={zones.data ?? []}
        />
      </div>

      {/* Dealer flow */}
      <div className="border-y border-border-tertiary px-4 py-3">
        <div className="mb-1.5 text-[10px] uppercase tracking-[1px] text-text-tertiary">
          dealer flow · {dealer.data?.length ?? 0} scenarios
        </div>
        <div className="grid grid-cols-6 gap-1">
          {(dealer.data ?? []).slice(0, 6).map((c: any) => {
            const pct = (c.spot_pct ?? 0) * 100;
            const cr = c.flow_cr ?? 0;
            const big = Math.abs(cr) > 100;
            return (
              <div key={c.scenario ?? pct} className="rounded bg-bg-secondary px-1 py-1.5 text-center">
                <div className="text-[9px] text-text-tertiary">
                  {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
                </div>
                <div className="mono text-[11px] font-medium" style={{ color: big ? "var(--color-danger-text)" : "var(--color-warning-text)" }}>
                  {cr >= 0 ? "+" : ""}{cr.toFixed(0)} Cr
                </div>
              </div>
            );
          })}
          {!dealer.data?.length && (
            <div className="col-span-6 text-center text-[10px] text-text-tertiary">no dealer flow data</div>
          )}
        </div>
      </div>

      {/* Secondary row */}
      <div className="border-b border-border-tertiary px-4 py-3">
        <div className="mb-1.5 text-[10px] uppercase tracking-[1px] text-text-tertiary">
          secondary · context panels
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="rounded-md border border-border-tertiary bg-bg-primary p-2.5">
            <div className="mb-1 flex items-center gap-1.5">
              <TargetArrow size={13} className="text-text-secondary" />
              <span className="text-[11px] font-medium">ICT zones · nearest 10</span>
            </div>
            <ul className="space-y-0.5 text-[10px] leading-snug text-text-secondary">
              {zonesNearSpot.length === 0 ? (
                <li className="text-text-tertiary">— none near spot —</li>
              ) : (
                zonesNearSpot.map((z: any, i: number) => (
                  <li key={i} className="cursor-pointer hover:text-text-primary">
                    {(z.ict_tier ?? z.tf ?? "")} {z.pattern_type ?? z.type} · {fmtNum(z.zone_low ?? z.range_low)}-{fmtNum(z.zone_high ?? z.range_high)}
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-md border border-border-tertiary bg-bg-primary p-2.5">
            <div className="mb-1 flex items-center gap-1.5">
              <History size={13} className="text-text-secondary" />
              <span className="text-[11px] font-medium">today's signals</span>
            </div>
            <ul className="space-y-0.5 text-[10px] leading-snug text-text-secondary">
              {(signals.data ?? []).length === 0 ? (
                <li className="text-text-tertiary">— no actionables yet —</li>
              ) : (
                (signals.data ?? []).slice(0, 8).map((s: any, i: number) => (
                  <li
                    key={i}
                    onClick={() => setActiveSignalIdx(i)}
                    className={`flex cursor-pointer items-center gap-1.5 hover:text-text-primary ${i === activeSignalIdx ? "text-text-primary" : ""}`}
                  >
                    <span>
                      {new Date(s.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} {s.action} {s.atm_strike ? fmtNum(s.atm_strike) : ""}
                    </span>
                    <Chip tone={qualityTone(s.entry_quality)} className="ml-auto">{s.entry_quality ?? "—"}</Chip>
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
            <StraddleSparkline data={straddleSpark} avg={straddleAvg ?? 0} />
            <div className="mt-1 text-[10px] text-text-secondary">
              {straddleNow != null ? <>₹{straddleNow.toFixed(0)}</> : "—"} · <span className="text-text-tertiary">avg ₹{straddleAvg ?? "—"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* IV Skew placeholder */}
      <div className="px-4 py-3" style={{ opacity: 0.55 }}>
        <div className="mb-1.5 text-[10px] uppercase tracking-[1px] text-text-tertiary">
          iv skew · phase 2 (enh-84)
        </div>
        <div className="rounded-md border border-dashed border-border-secondary bg-bg-secondary px-3 py-3.5 text-center text-[10px] text-text-tertiary">
          smile from gamma_call/gamma_put across strike grid · ships with enh-84
        </div>
      </div>

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

function StraddleSparkline({ data, avg }: { data: number[]; avg: number }) {
  const w = 180;
  const h = 42;
  if (!data || data.length < 2) {
    return <svg viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full" />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  const avgY = h - ((avg - min) / range) * h;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full">
      <line x1={0} x2={w} y1={avgY} y2={avgY} stroke="var(--color-text-tertiary)" strokeWidth="0.5" strokeDasharray="2,2" />
      <polyline points={pts} fill="none" stroke="var(--color-info-text)" strokeWidth="1.5" />
    </svg>
  );
}
