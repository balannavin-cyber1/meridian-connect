import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  symbol: string;
  expiry: string;
  state: {
    regime?: string | null;
    netDealerGamma?: number | null;
    maxGammaStrike?: number | null;
    maxPainStrike?: number | null;
    pinScore?: number | null;
    vix?: number | null;
  };
};

const fmt = (v: any, suffix = "") =>
  v == null || (typeof v === "number" && !Number.isFinite(v)) ? "—" : `${typeof v === "number" ? v.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : v}${suffix}`;

function headline(s: Props["state"]) {
  if (s.regime === "POSITIVE_γ" || s.regime === "LONG_GAMMA") {
    if ((s.pinScore ?? 0) >= 75) return "Gamma pinning, theta harvest setup";
    return "Long-gamma regime, mean-reverting tape";
  }
  if (s.regime === "NEGATIVE_γ" || s.regime === "SHORT_GAMMA") return "Short-gamma regime, amplified moves";
  return "Mixed regime, range trading";
}

export function NarrativeModal({ open, onClose, symbol, expiry, state }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const rows: Array<[string, string]> = [
    ["Regime", fmt(state.regime)],
    ["Net dealer γ", fmt(state.netDealerGamma, " Cr")],
    ["Max γ strike", fmt(state.maxGammaStrike)],
    ["Max pain strike", fmt(state.maxPainStrike)],
    ["Pin risk score", state.pinScore != null ? `${Math.round(state.pinScore)} / 100` : "—"],
    ["India VIX", fmt(state.vix)],
  ];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[80vh] w-[640px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-lg border bg-white p-6 shadow-2xl"
        style={{ borderColor: "var(--mv-border)" }}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-3 text-lg text-gray-400 hover:text-gray-700"
          aria-label="close"
        >
          ×
        </button>
        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">
          Narrative · {symbol} · {expiry}
        </div>
        <h2 className="mt-1 text-[20px] font-semibold" style={{ color: "var(--mv-text-strong)" }}>
          {headline(state)}
        </h2>

        <div className="mt-4 grid gap-2">
          {rows.map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between rounded px-3 py-2 text-[12px]"
              style={{ background: "var(--mv-bg)" }}
            >
              <span className="text-gray-500">{k}</span>
              <span style={{ fontFamily: "var(--mv-font-mono)" }} className="font-medium">{v}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-3 text-[13px] leading-relaxed" style={{ color: "var(--mv-text-mid)" }}>
          <p>
            Max γ strike {fmt(state.maxGammaStrike)} sits {state.maxPainStrike != null && state.maxGammaStrike != null
              ? `${Math.abs(state.maxGammaStrike - state.maxPainStrike)} pts from max pain ${fmt(state.maxPainStrike)}`
              : "with no max-pain reference"}.
            Net dealer γ of {fmt(state.netDealerGamma, " Cr")} indicates {((state.netDealerGamma ?? 0) > 0) ? "dampening flows" : "amplifying flows"}.
          </p>
          <p>
            {state.regime === "POSITIVE_γ" || state.regime === "LONG_GAMMA"
              ? "Long-γ dealers buy dips and sell rips, compressing realized vol."
              : "Short-γ dealers chase price, amplifying directional moves."}
            Pin risk score of {state.pinScore != null ? Math.round(state.pinScore) : "—"} suggests {(state.pinScore ?? 0) >= 75 ? "strong magnetism near max γ" : "limited pin pressure"}.
          </p>
          <p className="text-[11px] text-gray-400">
            Generated from live parameter state · {new Date().toLocaleString("en-IN")}
          </p>
        </div>
      </div>
    </div>
  );
}
