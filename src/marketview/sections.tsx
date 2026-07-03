// Composable section components. Each takes MvState and can be rendered on any page.
import { useMemo, useState } from "react";
import {
  MV, Card, Tile, Scalar, SectionLabel, Unavailable,
  fmtNum, fmtSigned, fmtPct, REGIME_DISPLAY, qualityTone,
  HeroChart, MaxPainChart, PinRiskTimeline, StraddleIntradayChart,
  NetGammaIntraday, netGammaDirection,
} from "./ui";
import { Sparkline } from "@/components/primitives/Sparkline";
import { Gauge } from "@/components/primitives/Gauge";
import { IVSmile } from "@/components/primitives/IVSmile";
import type { MvState } from "./state";

/* --------------------------------------------------------- */
/* Snapshot strip: compact facts row for every page header. */
/* --------------------------------------------------------- */
export function SnapshotStrip({ s }: { s: MvState }) {
  const cells: Array<{ label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }> = [
    { label: "SPOT", value: s.spot ? fmtNum(s.spot) : "—",
      sub: <span style={{ color: s.changePct >= 0 ? MV.green : MV.red }}>{fmtSigned(s.changeAbs)} ({fmtPct(s.changePct)})</span> },
    { label: "NET γ", value: s.netDealerGamma != null ? `${fmtSigned(s.netDealerGamma)} Cr` : "—",
      color: (s.netDealerGamma ?? 0) >= 0 ? MV.green : MV.red },
    { label: "MAX γ", value: s.maxGammaStrike != null ? fmtNum(s.maxGammaStrike, { maximumFractionDigits: 0 }) : "—",
      sub: s.maxGammaStrike && s.spot ? `${fmtPct(((s.maxGammaStrike - s.spot) / s.spot) * 100, 1)}` : undefined },
    { label: "MAX PAIN", value: s.maxPainStrike != null ? fmtNum(s.maxPainStrike, { maximumFractionDigits: 0 }) : "—",
      sub: s.painSpotDistPct != null ? fmtPct(s.painSpotDistPct, 1) : undefined },
    { label: "PIN SCORE", value: s.pinRiskScore != null ? `${Math.round(s.pinRiskScore)}/100` : "—",
      color: (s.pinRiskScore ?? 0) >= 75 ? MV.purple : MV.mid },
    { label: "VIX", value: s.vix != null ? s.vix.toFixed(2) : "—" },
    { label: "EXPIRY", value: s.expiry ? new Date(s.expiry).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—",
      sub: s.dte },
  ];
  return (
    <div className="flex flex-wrap items-stretch gap-x-6 gap-y-2 rounded-lg px-4 py-2.5"
      style={{ background: MV.card, border: `1px solid ${MV.border}` }}>
      {cells.map((c) => (
        <div key={c.label} className="flex flex-col">
          <span className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>{c.label}</span>
          <span className="text-[14px] font-bold tabular-nums leading-tight" style={{ color: c.color ?? MV.strong, fontFamily: MV.mono }}>{c.value}</span>
          {c.sub != null && <span className="text-[10px]" style={{ color: MV.weak, fontFamily: MV.mono }}>{c.sub}</span>}
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------- */
/* Key parameters strip (positioning summary tiles).         */
/* --------------------------------------------------------- */
export function KeyParametersSection({ s }: { s: MvState }) {
  const regimeMapped = s.regime ? REGIME_DISPLAY[s.regime] : null;
  const regimePill = regimeMapped
    ? { text: regimeMapped.label, bg: regimeMapped.bg, fg: regimeMapped.fg, sub: s.gammaZone ? `${regimeMapped.desc} · ${s.gammaZone}` : regimeMapped.desc }
    : s.regime ? { text: s.regime, bg: MV.blueBg, fg: MV.blue, sub: s.gammaZone ?? "" } : null;

  return (
    <div>
      <SectionLabel>Key Parameters</SectionLabel>
      <div className="flex flex-wrap gap-3">
        <Tile label="Regime" value="" pill={regimePill} sub={regimePill?.sub} />
        <Tile label="Net Dealer γ"
          value={s.netDealerGamma != null ? `${fmtSigned(s.netDealerGamma)} Cr` : "—"}
          valueColor={(s.netDealerGamma ?? 0) >= 0 ? MV.green : MV.red}
          sub={s.dampenTotal != null || s.amplifyTotal != null
            ? `Σdmp ${fmtNum(s.dampenTotal)}k · Σamp ${fmtNum(s.amplifyTotal)}` : "no flow breakdown"} />
        <Tile label="Spot Context"
          value={s.sigmaPct != null ? `±${s.sigmaPct.toFixed(2)}%` : "—"}
          sub={s.sigmaPct != null && s.spot ? `σ ${fmtNum(s.spot * (1 - s.sigmaPct / 100), { maximumFractionDigits: 0 })}–${fmtNum(s.spot * (1 + s.sigmaPct / 100), { maximumFractionDigits: 0 })} · ${s.dte}` : s.dte} />
        <Tile label="Flip Level" value={s.flipLevel != null ? fmtNum(s.flipLevel) : "—"}
          sub={s.flipLevel != null && s.spot ? `${fmtPct(((s.flipLevel - s.spot) / s.spot) * 100)} from spot` : "no flip in window"} />
        <Tile label="Max γ Strike" value={s.maxGammaStrike != null ? fmtNum(s.maxGammaStrike) : "—"}
          sub={s.maxGammaStrike && s.spot
            ? `${fmtPct(((s.maxGammaStrike - s.spot) / s.spot) * 100)} from spot${s.peakGammaCr != null ? ` · pk ${fmtSigned(s.peakGammaCr)} Cr` : ""}` : "—"} />
        <Tile label="Pin Zone"
          value={s.pin.data ? `${fmtNum(s.pin.data.pin_lower, { maximumFractionDigits: 0 })}–${fmtNum(s.pin.data.pin_upper, { maximumFractionDigits: 0 })}` : "—"}
          sub={s.pin.data ? `pk ${fmtNum(s.pin.data.peak_pin_strike ?? s.pin.data.pin_strike, { maximumFractionDigits: 0 })}${s.pin.data.n_strikes != null ? ` · n=${s.pin.data.n_strikes}` : ""}${s.pin.data.tau_used != null ? ` · τ${s.pin.data.tau_used}` : ""}` : "—"} />
        <Tile label="Accel Zone"
          value={s.accel.data ? `${fmtNum(s.accel.data.accel_lower, { maximumFractionDigits: 0 })}–${fmtNum(s.accel.data.accel_upper, { maximumFractionDigits: 0 })}` : "—"}
          sub={s.accel.data ? "active in window" : "none in window"} />
      </div>
    </div>
  );
}

/* --------------------------------------------------------- */
/* Positioning landscape hero chart.                          */
/* --------------------------------------------------------- */
export function PositioningSection({ s }: { s: MvState }) {
  const [resetKey, setResetKey] = useState(0);
  return (
    <div>
      <SectionLabel>Positioning Landscape — Dealer γ by Strike</SectionLabel>
      <Card title="Dealer γ by Strike"
        subtitle={`dampening (long γ) vs amplifying (short γ) · σ-band to expiry · ${s.strikes.data?.length ?? 0} strikes`}>
        <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px]" style={{ fontFamily: MV.mono }}>
          <Scalar label="net γ in window" value={s.netDealerGamma != null ? `${fmtSigned(s.netDealerGamma)} Cr` : "—"} color={(s.netDealerGamma ?? 0) >= 0 ? MV.green : MV.red} />
          <Scalar label="Σ dampen" value={s.dampenTotal != null ? `${fmtSigned(s.dampenTotal)} Cr` : "—"} color={MV.green} />
          <Scalar label="Σ amplify" value={s.amplifyTotal != null ? `${fmtSigned(s.amplifyTotal)} Cr` : "—"} color={MV.red} />
          <Scalar label="strongest dampen" value={fmtNum(s.maxGammaStrike, { maximumFractionDigits: 0 })} />
          <Scalar label="strongest amplify" value={s.strongestAmplifyStrike != null ? fmtNum(s.strongestAmplifyStrike, { maximumFractionDigits: 0 }) : "—"} color={MV.red} />
          <Scalar label="Σ to expiry" value={s.sigmaPct != null ? fmtPct(s.sigmaPct) : "—"} color={MV.blue} />
        </div>
        <HeroChart spot={s.spot} bars={(s.strikes.data ?? []) as any} pin={s.pin.data as any} accel={s.accel.data as any}
          step={s.strikeStep} resetKey={resetKey} sigmaPct={s.sigmaPct} maxGammaStrike={s.maxGammaStrike} flipLevel={s.flipLevel} />
        <div className="mt-1 flex items-center justify-between">
          <div className="text-[9px]" style={{ color: MV.weak }}>scroll to zoom · drag to pan</div>
          <button onClick={() => setResetKey((k) => k + 1)} className="text-[10px] underline" style={{ color: MV.weak }}>reset view</button>
        </div>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------- */
/* Net dealer γ — direction + intraday line.                  */
/* --------------------------------------------------------- */
export function NetDealerGammaSection({ s }: { s: MvState }) {
  const rows = (s.gammaToday.data ?? []) as Array<{ ts: string; net_gex: number | null }>;
  const dir = useMemo(() => netGammaDirection(rows), [rows]);
  const dirColor = dir === "Rising" ? MV.green : dir === "Falling" ? MV.red : MV.weak;
  const dirIcon = dir === "Rising" ? "↑" : dir === "Falling" ? "↓" : "→";
  return (
    <Card title="Net Dealer γ · Intraday"
      subtitle={`Cr · positive = dampening flows · negative = amplifying flows`}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1" style={{ fontFamily: MV.mono }}>
        <div className="flex flex-col">
          <span className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>current</span>
          <span className="text-[22px] font-bold tabular-nums" style={{ color: (s.netDealerGamma ?? 0) >= 0 ? MV.green : MV.red }}>
            {s.netDealerGamma != null ? `${fmtSigned(s.netDealerGamma)} Cr` : "—"}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>direction</span>
          <span className="text-[14px] font-bold" style={{ color: dirColor }}>{dirIcon} {dir}</span>
        </div>
        <Scalar label="Σ dampen" value={s.dampenTotal != null ? `${fmtSigned(s.dampenTotal)} Cr` : "—"} color={MV.green} />
        <Scalar label="Σ amplify" value={s.amplifyTotal != null ? `${fmtSigned(s.amplifyTotal)} Cr` : "—"} color={MV.red} />
      </div>
      <NetGammaIntraday rows={rows} />
    </Card>
  );
}

/* --------------------------------------------------------- */
/* Max Pain — windowed ±20 strikes around ATM.               */
/* --------------------------------------------------------- */
export function MaxPainSection({ s, windowStrikes = 20 }: { s: MvState; windowStrikes?: number }) {
  const rawRows = ((s.maxPain.data ?? []) as any[]);
  const winRows = useMemo(() => {
    if (!rawRows.length || !s.spot) return rawRows;
    const atm = Math.round(s.spot / s.strikeStep) * s.strikeStep;
    const lo = atm - windowStrikes * s.strikeStep;
    const hi = atm + windowStrikes * s.strikeStep;
    return rawRows.filter((r) => r.candidate_strike >= lo && r.candidate_strike <= hi);
  }, [rawRows, s.spot, s.strikeStep, windowStrikes]);

  const pinBias =
    s.gammaPainGap == null ? null :
    s.gammaPainGap < 200 ? { text: "CONVERGENT", color: MV.green } :
    s.gammaPainGap <= 500 ? { text: "DIVERGENT", color: MV.amber } :
    { text: "WIDE", color: MV.red };

  return (
    <div>
      <SectionLabel>Max Pain — Total Option Pain by Strike</SectionLabel>
      <Card title={`Max Pain by Strike · ±${windowStrikes} strikes around ATM`}
        subtitle="CE+PE writer pain · trough = max-pain magnet · pink PE-side / blue CE-side">
        <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px]" style={{ fontFamily: MV.mono }}>
          <Scalar label="max pain" value={fmtNum(s.maxPainStrike, { maximumFractionDigits: 0 })} color={MV.amber} />
          <Scalar label="dist from spot" value={fmtPct(s.painSpotDistPct)} color={(s.painSpotDistPct ?? 0) >= 0 ? MV.green : MV.red} />
          <Scalar label="max γ" value={fmtNum(s.maxGammaStrike, { maximumFractionDigits: 0 })} color={MV.purple} />
          <Scalar label="γ vs pain gap" value={s.gammaPainGap != null ? `${s.gammaPainGap} pts` : "—"} />
          <Scalar label="pin bias" value={pinBias?.text ?? "—"} color={pinBias?.color} />
          <Scalar label="window" value={`${winRows.length}/${rawRows.length} strikes`} />
        </div>
        <MaxPainChart rows={winRows as any} spot={s.spot} step={s.strikeStep} />
        {s.maxPainStrike != null && (
          <p className="mt-2 text-[11px] leading-relaxed" style={{ color: MV.mid }}>
            Spot near max-pain magnet ({fmtNum(s.maxPainStrike, { maximumFractionDigits: 0 })}, {fmtPct(s.painSpotDistPct)}).
            {s.maxGammaStrike != null && s.gammaPainGap != null && (
              <> Max γ ({fmtNum(s.maxGammaStrike, { maximumFractionDigits: 0 })}) and max pain only {s.gammaPainGap} pts apart — <span style={{ color: pinBias?.color, fontWeight: 600 }}>{pinBias?.text.toLowerCase()} pin pressure</span>.</>
            )}
          </p>
        )}
      </Card>
    </div>
  );
}

/* --------------------------------------------------------- */
/* Pin risk row: score / probability / ATM straddle          */
/* --------------------------------------------------------- */
export function PinRiskRowSection({ s }: { s: MvState }) {
  return (
    <div>
      <SectionLabel>Pin Risk & ATM</SectionLabel>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>Pin Risk Score</div>
          <div className="mt-1 text-[30px] font-bold leading-none" style={{ color: MV.purple, fontFamily: MV.mono }}>
            {s.pinRiskScore != null ? Math.round(s.pinRiskScore) : "—"}
            <span className="text-[14px]" style={{ color: MV.weak }}>{s.pinRiskScore != null ? " /100" : ""}</span>
          </div>
          <div className="mt-2 text-[11px]" style={{ color: MV.weak, fontFamily: MV.mono }}>
            {s.pinRiskScore != null
              ? s.pinRiskScore >= 75 ? "strong pin · 75 threshold exceeded"
                : s.pinRiskScore >= 50 ? "moderate pin" : "weak pin"
              : "no pin-risk data"}
          </div>
          <div className="mt-3"><Gauge value={s.pinRiskScore ?? 0} color={MV.purple} /></div>
          <div className="mt-1.5 flex justify-between text-[9px]" style={{ color: MV.weak, fontFamily: MV.mono }}>
            <span>0</span><span>25 weak</span><span>50</span><span>75 strong</span><span>100</span>
          </div>
        </Card>
        <Card>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>Pin Probability</div>
          {s.pinProbability != null ? (<>
            <div className="mt-1 text-[30px] font-bold leading-none" style={{ color: MV.purple, fontFamily: MV.mono }}>
              {s.pinProbability.toFixed(1)}%
            </div>
            <div className="mt-2 text-[11px]" style={{ color: MV.weak, fontFamily: MV.mono }}>
              complement of expansion ({s.expansionProb != null ? s.expansionProb.toFixed(1) + "%" : "—"})
              {s.maxGammaStrike != null ? ` · near ${fmtNum(s.maxGammaStrike, { maximumFractionDigits: 0 })}` : ""}
            </div>
            <div className="mt-3"><Gauge value={s.pinProbability} color={MV.purple} /></div>
          </>) : <Unavailable label="expansion_probability not exposed" />}
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>ATM Straddle</div>
              <div className="mt-1 text-[30px] font-bold leading-none" style={{ fontFamily: MV.mono }}>
                ₹{s.atmStraddle != null ? Math.round(s.atmStraddle) : "—"}
                <span className="ml-1 text-[12px] font-normal" style={{ color: MV.weak }}>today</span>
              </div>
            </div>
            {(() => {
              const last = [...(s.straddle.data?.buckets ?? [])].reverse().find((b) => b.today != null);
              const avg = last ? s.straddle.data!.buckets.find((b) => b.bucket === last.bucket)?.avg ?? null : null;
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
            <StraddleIntradayChart buckets={s.straddle.data?.buckets ?? []} />
          </div>
          <div className="mt-1 flex justify-between text-[9px]" style={{ color: MV.weak, fontFamily: MV.mono }}>
            <span>09:15 intraday</span>
            <span>{s.straddle.data?.daysUsed ?? 5}d avg</span>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- */
export function PinRiskTimelineSection({ s }: { s: MvState }) {
  return (
    <div>
      <SectionLabel>Pin Risk Timeline</SectionLabel>
      <Card title="Pin Risk Timeline"
        subtitle="intraday pin-score (purple, L axis) vs spot (blue, R axis) · today's session">
        <PinRiskTimeline rows={(s.gammaToday.data ?? []) as any} />
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[10px]" style={{ color: MV.weak, fontFamily: MV.mono }}>
          <span><span style={{ color: MV.purple }}>●</span> pin score {s.pinRiskScore != null ? Math.round(s.pinRiskScore) : "—"} / 100</span>
          <span><span style={{ color: MV.blueLine }}>—</span> spot {fmtNum(s.spot, { maximumFractionDigits: 0 })}</span>
          <span>{(s.gammaToday.data ?? []).length} samples</span>
        </div>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------- */
export function BreadthVolSection({ s }: { s: MvState }) {
  return (
    <div>
      <SectionLabel>Breadth & Volatility</SectionLabel>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>WCB</div>
          {s.wcb.data ? (() => {
            const w: any = s.wcb.data;
            const score = w.wcb_score;
            const regime = w.wcb_regime as string | null;
            const regimeColor = regime === "BULLISH" ? MV.green : regime === "BEARISH" ? MV.red : MV.weak;
            const Row = ({ label, value, suffix = "%" }: { label: string; value: any; suffix?: string }) =>
              value == null ? null : (
                <div className="flex items-baseline justify-between text-[11px]" style={{ fontFamily: MV.mono }}>
                  <span style={{ color: MV.weak }}>{label}</span>
                  <span>{Number(value).toFixed(1)}{suffix}</span>
                </div>
              );
            return (
              <>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-[30px] font-bold leading-none" style={{ fontFamily: MV.mono }}>
                    {score != null ? Number(score).toFixed(1) : "—"}
                  </span>
                  <span className="text-[11px]" style={{ color: MV.weak, fontFamily: MV.mono }}>/100</span>
                </div>
                {regime && (
                  <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: regimeColor }}>{regime}</div>
                )}
                <div className="mt-3 space-y-1">
                  <Row label="adv" value={w.weighted_advances_pct} />
                  <Row label=">10DMA" value={w.weighted_pct_above_10dma} />
                  <Row label=">20DMA" value={w.weighted_pct_above_20dma} />
                  <Row label=">40DMA" value={w.weighted_pct_above_40dma} />
                </div>
                {w.active_weight_pct != null && (
                  <div className="mt-3 text-[10px]" style={{ color: MV.weak, fontFamily: MV.mono }}>coverage {Number(w.active_weight_pct).toFixed(1)}%</div>
                )}
              </>
            );
          })() : <Unavailable />}
        </Card>
        <Card>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>Market Breadth</div>
          {s.breadth.data?.advances != null && s.breadth.data?.declines != null ? (() => {
            const a = s.breadth.data.advances, d = s.breadth.data.declines;
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
                  <div className="flex items-center justify-start pl-2 text-[10px] font-semibold text-white"
                    style={{ width: `${adv}%`, background: MV.greenLine, fontFamily: MV.mono }}>↑ {a}</div>
                  <div className="flex items-center justify-end pr-2 text-[10px] font-semibold text-white"
                    style={{ width: `${100 - adv}%`, background: MV.redLine, fontFamily: MV.mono }}>{d} ↓</div>
                </div>
                <div className="mt-1 flex justify-between text-[9px]" style={{ color: MV.weak }}>
                  <span>advancing</span><span>declining</span>
                </div>
              </>
            );
          })() : <Unavailable />}
        </Card>
        <Card>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>India VIX</div>
          {s.vix != null ? (<>
            <div className="mt-1 text-[30px] font-bold leading-none" style={{ fontFamily: MV.mono }}>{s.vix.toFixed(2)}</div>
            <div className="mt-3"><Sparkline data={[s.vix]} color={MV.amber} /></div>
          </>) : <Unavailable label="VIX not exposed" />}
        </Card>
        <Card>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>IV Skew</div>
          {s.ivSmile.data && s.ivSkewPct != null ? (<>
            <div className="mt-1 text-[26px] font-bold leading-none" style={{ fontFamily: MV.mono, color: Math.abs(s.ivSkewPct) < 1 ? MV.mid : s.ivSkewPct > 0 ? MV.red : MV.green }}>
              {Math.abs(s.ivSkewPct) < 1 ? "flat" : `${s.ivSkewPct > 0 ? "+" : ""}${s.ivSkewPct.toFixed(1)}% ${s.ivSkewPct > 0 ? "PE" : "CE"}`}
            </div>
            <div className="mt-1 text-[11px]" style={{ color: MV.weak, fontFamily: MV.mono }}>
              ATM {fmtNum(s.ivSmile.data.atm, { maximumFractionDigits: 0 })} · CE {s.ivSmile.data.atmCe?.toFixed(1)} / PE {s.ivSmile.data.atmPe?.toFixed(1)}
            </div>
            <div className="mt-2"><IVSmile points={s.ivSmile.data.points} atm={s.ivSmile.data.atm} /></div>
          </>) : <Unavailable label="iv not populated" />}
        </Card>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- */
export function IctSection({ s }: { s: MvState }) {
  return (
    <div>
      <SectionLabel>ICT Zones — Nearest to Spot</SectionLabel>
      <Card title="Active Zones" subtitle={`${s.zonesNearSpot.length} of ${s.zones.data?.length ?? 0} · sorted by distance to spot`}>
        {s.zonesNearSpot.length === 0 ? (
          <Unavailable label="no zones near spot" />
        ) : (
          <ul className="divide-y" style={{ borderColor: MV.border }}>
            {s.zonesNearSpot.map((row: any, i: number) => {
              const { z, lo, hi, mid } = row;
              const tier = z.ict_tier ?? z.tier ?? "";
              const pat = z.pattern_type ?? z.type ?? "";
              const tf = z.tf ?? z.timeframe ?? "";
              const distPct = mid != null && s.spot ? ((mid - s.spot) / s.spot) * 100 : 0;
              const above = distPct >= 0;
              const tierColor = String(tier).includes("1") ? { bg: MV.greenBg, fg: MV.green }
                : String(tier).includes("2") ? { bg: MV.amberBg, fg: MV.amber }
                : { bg: "#f3f4f6", fg: MV.weak };
              return (
                <li key={i} className="flex items-center justify-between py-2 text-[11px]">
                  <div className="flex items-center gap-2" style={{ fontFamily: MV.mono }}>
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: tierColor.bg, color: tierColor.fg }}>{tier || "—"}</span>
                    <span className="font-semibold" style={{ color: MV.strong }}>{pat}</span>
                    <span style={{ color: MV.weak }}>· {tf}</span>
                    {z.detected_at_ts && <span style={{ color: MV.weak }}>· src {new Date(z.detected_at_ts).toISOString().slice(0, 10)}</span>}
                  </div>
                  <div className="flex items-center gap-2" style={{ fontFamily: MV.mono }}>
                    <span style={{ color: MV.mid }}>{fmtNum(lo, { maximumFractionDigits: 0 })} — {fmtNum(hi, { maximumFractionDigits: 0 })}</span>
                    <span style={{ color: above ? MV.red : MV.green, fontWeight: 600 }}>{fmtPct(distPct)} {above ? "above" : "below"}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* --------------------------------------------------------- */
export function SignalsSection({ s }: { s: MvState }) {
  return (
    <div>
      <SectionLabel>Today's Signals — Stream</SectionLabel>
      <Card title="Live Signal Stream" subtitle="most recent first">
        {(s.signals.data ?? []).length === 0 ? (
          <Unavailable label="no signals yet today" />
        ) : (
          <ul className="divide-y" style={{ borderColor: MV.border }}>
            {(s.signals.data ?? []).slice(0, 15).map((sg: any, i: number) => {
              const tone = qualityTone(sg.entry_quality);
              const time = new Date(sg.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
              const action = (sg.action ?? "").toUpperCase();
              return (
                <li key={i} className="flex items-center justify-between py-2 text-[11px]" style={{ fontFamily: MV.mono }}>
                  <div className="flex items-center gap-3">
                    <span style={{ color: MV.weak }}>{time}</span>
                    <span className="font-semibold" style={{ color: MV.strong }}>{sg.atm_strike ? fmtNum(sg.atm_strike, { maximumFractionDigits: 0 }) : "—"}</span>
                    {sg.entry_quality === "SKIP" && <span style={{ color: MV.weak }}>· gate</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: tone.bg, color: tone.fg }}>{(sg.entry_quality ?? "—").toUpperCase()}</span>
                    <span className="font-semibold tracking-wider" style={{ color: action.includes("CE") ? MV.green : action.includes("PE") ? MV.red : MV.weak }}>{action || "DO_NOTHING"}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
