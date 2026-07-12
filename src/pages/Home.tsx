import { useMemo, useState } from "react";
import { useSymbol } from "@/contexts/SymbolContext";
import { useMvData } from "@/marketview/state";
import {
  MV, Card, SectionLabel, PageTitle, Unavailable, fmtSigned,
} from "@/marketview/ui";
import {
  SnapshotStrip, KeyParametersSection, NetDealerGammaSection,
} from "@/marketview/sections";
import { useAmbient, useExpiryBaseRates } from "@/lib/queries";
import { NarrativeModal } from "@/components/NarrativeModal";
import { AmbientTrajectory } from "@/components/AmbientTrajectory";


// ---------- Ambient verdict card ----------
const normalizeRegime = (r: string | null | undefined): string | null => {
  if (!r) return null;
  const s = String(r).toUpperCase();
  if (s === "LONG_GAMMA" || s === "POSITIVE_Γ" || s === "POSITIVE_GAMMA" || s.includes("POSITIVE")) return "POSITIVE_γ";
  if (s === "SHORT_GAMMA" || s === "NEGATIVE_Γ" || s === "NEGATIVE_GAMMA" || s.includes("NEGATIVE")) return "NEGATIVE_γ";
  return s;
};

function AmbientVerdict({ symbol }: { symbol: "NIFTY" | "SENSEX" }) {
  const amb = useAmbient(symbol);
  const a: any = amb.data ?? null;
  const regime = a?.ambient_regime ?? null;
  const alignment = a?.lens_alignment ?? null;
  const note = a?.regime_conditional_note ?? null;


  const regimeColor =
    regime === "RISK_ON" ? MV.green :
    regime === "RISK_OFF" ? MV.red :
    regime === "NEUTRAL" || regime === "MIXED" ? MV.amber : MV.mid;
  const alignColor =
    alignment === "ALIGNED" ? MV.green :
    alignment === "MIXED" ? MV.amber :
    alignment === "DIVERGENT" ? MV.red : MV.weak;

  // Parse session_prior for OPEN relate segment
  const sessionPrior: string | null = a?.session_prior ?? null;
  const relate = sessionPrior?.split("  ||  ").find((s) => s.startsWith("OPEN ")) ?? null;
  const isShift = relate?.includes("SHIFTS") ?? false;
  const isConfirm = relate?.includes("CONFIRMS") ?? false;
  const shiftText = relate ? relate.replace(/^OPEN (SHIFTS|CONFIRMS):\s*/, "") : null;

  const subtitle = a?.as_of_date && a?.for_session_date
    ? `AS-OF ${a.as_of_date} close → FOR ${a.for_session_date} session`
    : a?.for_session_date ? `session ${a.for_session_date}` : undefined;

  return (
    <Card title="Ambient Verdict" subtitle={subtitle}>
      {a ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: MV.weak }}>Regime</div>
              <div className="mt-1 text-[36px] font-bold leading-none" style={{ color: regimeColor, fontFamily: MV.mono }}>
                {regime ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: MV.weak }}>Lens Alignment</div>
              <div className="mt-1">
                <span className="inline-flex items-center rounded px-2 py-1 text-[13px] font-bold"
                  style={{ background: alignColor + "22", color: alignColor, fontFamily: MV.mono }}>
                  {alignment ?? "—"}
                </span>
              </div>
            </div>
            {note && (
              <p className="max-w-[560px] flex-1 text-[12px] leading-relaxed" style={{ color: MV.mid }}>
                {note}
              </p>
            )}
          </div>
          {relate && isShift && (
            <div className="rounded-md px-3 py-2 text-[12px] font-medium leading-snug"
              style={{ background: MV.amber + "1f", border: `1px solid ${MV.amber}55`, color: MV.amber, fontFamily: MV.mono }}>
              ⚠ OPEN SHIFT — {shiftText}
            </div>
          )}
          {relate && isConfirm && (
            <div className="rounded-md px-3 py-2 text-[11px] leading-snug"
              style={{ background: MV.card, border: `1px dashed ${MV.border}`, color: MV.weak, fontFamily: MV.mono }}>
              open confirms the prior — {shiftText}
            </div>
          )}


        </div>
      ) : (
        <Unavailable label="ambient snapshot not published" />
      )}
    </Card>
  );
}

// ---------- Four-lens strip ----------
function FourLensStrip({ symbol }: { symbol: "NIFTY" | "SENSEX" }) {
  const amb = useAmbient(symbol);
  const a: any = amb.data ?? null;
  type Kind = "gamma" | "breadth" | "participant" | "macro";
  type Lens = { label: string; value: React.ReactNode; sub?: string; tone?: string; kind: Kind };
  const toneOf = (v: any): string => {
    const s = String(v ?? "").toUpperCase();
    if (["POSITIVE", "LONG", "ALIGNED", "RISK_ON", "BULLISH", "SUPPORT"].some((k) => s.includes(k))) return MV.green;
    if (["NEGATIVE", "SHORT", "DIVERGENT", "RISK_OFF", "BEARISH", "STRESS"].some((k) => s.includes(k))) return MV.red;
    if (s) return MV.amber;
    return MV.weak;
  };
  const lenses: Lens[] = a ? [
    { label: "Net GEX Regime", value: a.net_gex_regime ?? "—", tone: toneOf(a.net_gex_regime), kind: "gamma" },
    { label: "Price vs Breadth", value: a.price_vs_breadth_div ?? "—", tone: toneOf(a.price_vs_breadth_div), kind: "breadth" },
    { label: "OI Cycle Asymmetry", value: a.cycle_oi_call_put_asym ?? "—", tone: toneOf(a.cycle_oi_call_put_asym), kind: "participant" },
    { label: "FII 5D Δ Fut L/S", value: a.fii_index_fut_ls_delta_5d != null ? fmtSigned(Number(a.fii_index_fut_ls_delta_5d)) : "—",
      tone: (a.fii_index_fut_ls_delta_5d ?? 0) >= 0 ? MV.green : MV.red, kind: "macro" },
  ] : [];

  // Alarm color is driven by lens_alignment, not per-cell values.
  // ALIGNED → all muted. DIVERGENT → only breadth+participant lit. Otherwise → all muted.
  const alignment = a?.lens_alignment;
  const isDivergent = alignment === "DIVERGENT";
  const colorFor = (l: Lens): string => {
    if (isDivergent && (l.kind === "breadth" || l.kind === "participant")) return l.tone ?? MV.strong;
    return MV.strong;
  };

  return (
    <div>
      <SectionLabel>Four Lens Strip</SectionLabel>
      {a ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {lenses.map((l) => (
            <div key={l.label} className="rounded-lg p-3"
              style={{ background: MV.card, border: `1px solid ${MV.border}` }}>
              <div className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>{l.label}</div>
              <div className="mt-1 text-[15px] font-bold" style={{ color: colorFor(l), fontFamily: MV.mono }}>{l.value}</div>
              {l.sub && <div className="mt-0.5 text-[10px]" style={{ color: MV.weak, fontFamily: MV.mono }}>{l.sub}</div>}
            </div>
          ))}
          {a.pro_options_imbalance != null && (
            <div className="rounded-lg p-3 md:col-span-2"
              style={{ background: MV.card, border: `1px solid ${MV.border}` }}>
              <div className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>Pro Options Imbalance</div>
              <div className="mt-1 text-[13px]" style={{ color: MV.mid, fontFamily: MV.mono }}>{String(a.pro_options_imbalance)}</div>
            </div>
          )}
          {a.macro_tilt && (
            <div className="rounded-lg p-3 md:col-span-2"
              style={{ background: MV.card, border: `1px solid ${MV.border}` }}>
              <div className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: MV.weak }}>Macro Tilt</div>
              <div className="mt-1 text-[13px]" style={{ color: MV.mid, fontFamily: MV.mono }}>{String(a.macro_tilt)}</div>
            </div>
          )}
        </div>
      ) : (
        <Card><Unavailable label="lens data not published" /></Card>
      )}
    </div>
  );
}

// ---------- Expiry memory (base rate) ----------
function ExpiryMemoryStrip({ symbol }: { symbol: "NIFTY" | "SENSEX" }) {
  const amb = useAmbient(symbol);
  const a: any = amb.data ?? null;
  const rates = useExpiryBaseRates(a?.ambient_regime, a?.lens_alignment);
  const rows = (rates.data ?? []) as any[];
  return (
    <Card title="Expiry Memory · Base Rates"
      subtitle={a?.ambient_regime && a?.lens_alignment ? `${a.ambient_regime} · ${a.lens_alignment}` : undefined}>
      {rows.length === 0 ? <Unavailable label="insufficient historical base rate for this regime × alignment" /> : (
        <div className="space-y-3">
          {rows.map((r, i) => {
            const pin = Number(r.pinned_pct ?? 0);
            const up = Number(r.broke_up_pct ?? 0);
            const dn = Number(r.broke_down_pct ?? 0);
            return (
              <div key={i}>
                <div className="mb-1 flex items-baseline justify-between text-[11px]" style={{ fontFamily: MV.mono }}>
                  <span className="font-semibold" style={{ color: MV.strong }}>{r.expiry_type ?? "—"}</span>
                  <span style={{ color: MV.weak }}>n={r.n} · dom {r.dominant_break ?? "—"}</span>
                </div>
                <div className="flex h-6 w-full overflow-hidden rounded">
                  <div className="flex items-center justify-center text-[10px] font-semibold text-white"
                    style={{ width: `${pin}%`, background: MV.purple, fontFamily: MV.mono }}>
                    {pin >= 8 ? `${pin.toFixed(0)}% pin` : ""}
                  </div>
                  <div className="flex items-center justify-center text-[10px] font-semibold text-white"
                    style={{ width: `${up}%`, background: MV.greenLine, fontFamily: MV.mono }}>
                    {up >= 8 ? `${up.toFixed(0)}% ↑` : ""}
                  </div>
                  <div className="flex items-center justify-center text-[10px] font-semibold text-white"
                    style={{ width: `${dn}%`, background: MV.redLine, fontFamily: MV.mono }}>
                    {dn >= 8 ? `${dn.toFixed(0)}% ↓` : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

const DRILL_TABS = [
  { id: "lens", label: "Four Lenses" },
  { id: "memory", label: "Expiry Memory" },
  { id: "params", label: "Key Parameters" },
  { id: "gamma", label: "Net γ Intraday" },
] as const;
type DrillTab = (typeof DRILL_TABS)[number]["id"];

export default function Home() {
  const { symbol } = useSymbol();
  const s = useMvData(symbol);
  const [narrativeOpen, setNarrativeOpen] = useState(false);
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillTab, setDrillTab] = useState<DrillTab>("lens");
  const expiryLabel = useMemo(() =>
    s.expiry ? new Date(s.expiry).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—",
    [s.expiry]);

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 px-7 py-6">
      <PageTitle
        title="Home — Ambient Trajectory"
        subtitle="three clocks over price · verdict is a snapshot; trajectory is the read"
        right={
          <button onClick={() => setNarrativeOpen(true)}
            className="rounded border px-3 py-1.5 text-[11px] font-semibold tracking-wide transition-colors hover:bg-gray-900 hover:text-white"
            style={{ borderColor: MV.border, color: MV.strong }}>
            Narrative →
          </button>
        }
      />
      <SnapshotStrip s={s} />

      {/* TIER 0 — verdict headline */}
      <AmbientVerdict symbol={symbol} />

      {/* TIER 1 — hero */}
      <AmbientTrajectory
        symbol={symbol}
        live={{
          spot: s.spot || null,
          regime: s.regime,
          flipLevel: s.flipLevel,
          maxGammaStrike: s.maxGammaStrike,
          dte: (s.gamma.data as any)?.dte ?? null,
          pinRiskScore: s.pinRiskScore,
          ts: s.latestActivityTs,
        }}
      />

      {/* TIER 2 — drill-down (collapsed by default) */}
      <div>
        <button
          onClick={() => setDrillOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors"
          style={{ borderColor: MV.border, background: MV.card, color: MV.weak }}
          aria-expanded={drillOpen}
        >
          <span>Drill-down · lenses, expiry memory, parameters, intraday γ</span>
          <span style={{ color: MV.mid, fontFamily: MV.mono }}>{drillOpen ? "▾ hide" : "▸ show"}</span>
        </button>
        {drillOpen && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-1 text-[10px]" style={{ fontFamily: MV.mono }}>
              {DRILL_TABS.map((t) => {
                const active = t.id === drillTab;
                return (
                  <button
                    key={t.id}
                    onClick={() => setDrillTab(t.id)}
                    className="rounded border px-2.5 py-1"
                    style={{
                      borderColor: active ? MV.strong : MV.border,
                      background: active ? MV.border : "transparent",
                      color: active ? MV.strong : MV.weak,
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            {drillTab === "lens" && <FourLensStrip symbol={symbol} />}
            {drillTab === "memory" && <ExpiryMemoryStrip symbol={symbol} />}
            {drillTab === "params" && <KeyParametersSection s={s} />}
            {drillTab === "gamma" && <NetDealerGammaSection s={s} />}
          </div>
        )}
      </div>

      <NarrativeModal
        open={narrativeOpen}
        onClose={() => setNarrativeOpen(false)}
        symbol={symbol}
        expiry={expiryLabel}
        state={{
          regime: s.regime, netDealerGamma: s.netDealerGamma, maxGammaStrike: s.maxGammaStrike,
          maxPainStrike: s.maxPainStrike, pinScore: s.pinRiskScore, vix: s.vix,
        }}
      />
    </div>
  );
}

