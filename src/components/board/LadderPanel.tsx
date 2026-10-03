// Board tabs + shared ladder + Overview value list, caption and detail panel (Phase 1b).
import { useEffect, useMemo, useRef, useState } from "react";
import { StrikeLadder, type Level, type LadderRow } from "./StrikeLadder";
import { useIsMobile } from "@/hooks/use-mobile";

export const TABS = ["Overview", "Pin", "Gamma", "OI", "Flows", "IV"] as const;
export type Tab = (typeof TABS)[number];
type Mode = "near" | "all" | "full" | "custom";

export type OverviewItem = { id: string; label: string; sub: string; value: React.ReactNode; caption: string; levelIds: string[]; priced?: boolean };

const num = (v: number, d = 0) => v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const sgn = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${num(Math.abs(v), d)}`;

const DETAIL: Record<string, { title: string; unit: string; what: string; how: string; computed: string; scale: string; caveat: string; withIds: string[]; src: string }> = {
  net: { title: "Net Γ", unit: "Cr (unit definition pending)", what: "Sum of signed dealer gamma exposure across every strike of the latest run.", how: "Positive (cool) means dealers are net long gamma and hedge against moves; negative (warm) means they hedge with moves.", computed: "v_gex_abs_exposure.net_gex_cr; net/gross = net_gex_cr ÷ abs_gex_cr.", scale: "band not measured — calibration gap (E-D1)", caveat: "Unit definition still open; compare sign and net/gross, not magnitude across days.", withIds: ["pin", "flip"], src: "sql/ file · COMMENT not live" },
  flip: { title: "Flip", unit: "index points", what: "The spot level where repriced net gamma crosses zero.", how: "Distance from spot says how far price must travel before the hedging regime changes sign.", computed: "v_gex_repriced_flip.flip; % = flip_minus_spot ÷ spot.", scale: "band not measured — calibration gap", caveat: "Chain clock. Named states: no flip in grid · skipped on expiry day · carry unmeasurable.", withIds: ["corridor", "priced"], src: "sql/ file · COMMENT not live" },
  corridor: { title: "Corridor", unit: "strikes", what: "Put OI wall to call OI wall within the eligible σ band.", how: "Spot inside means both walls are in play; above/below names the wall that has been crossed.", computed: "v_gex_strike_walls.put_wall, call_wall, corridor_state.", scale: "width in % of spot; no measured band", caveat: "IV-stale flag widens uncertainty of the eligible band.", withIds: ["pin", "spot"], src: "sql/ file · COMMENT not live" },
  pin: { title: "Pin (γ-conc)", unit: "strike · share of gross", what: "The strike carrying the largest share of absolute gamma.", how: "A large lead over #2 means one strike dominates the centre.", computed: "v_gex_strike_rank rank 1; lead = (share₁ − share₂) × 100.", scale: "band not measured — calibration gap", caveat: "Concentration is not a forecast of the close.", withIds: ["corridor", "net"], src: "sql/ file · COMMENT not live" },
  priced: { title: "Priced move", unit: "index points", what: "ATM straddle — the move the options market is pricing to expiry.", how: "Lights the left gutter: strikes within ± straddle of spot.", computed: "gamma_metrics.straddle_atm; % = straddle ÷ spot.", scale: "no band", caveat: "Includes time value to expiry, not a one-day range.", withIds: ["flip", "dte"], src: "sql/ file · COMMENT not live" },
  spot: { title: "Spot", unit: "index points", what: "Index level at the latest γ run.", how: "Glowing solid rule on the ladder; the terrain row it sits in is its pocket.", computed: "gamma_metrics.spot.", scale: "—", caveat: "γ clock; may lag the live tick.", withIds: ["corridor", "flip"], src: "sql/ file · COMMENT not live" },
  dte: { title: "Time to expiry", unit: "sessions", what: "Trading sessions left to the front expiry.", how: "Fewer sessions concentrate gamma near spot.", computed: "v_iv_term_structure.dte_sessions where leg = 1.", scale: "—", caveat: "Chain clock.", withIds: ["priced", "pin"], src: "sql/ file · COMMENT not live" },
};

type Props = {
  symbol: string;
  step: number;
  rows: LadderRow[];
  spot: number | null;
  straddle: number | null;
  levels: Level[];
  pinBand: { lo: number; hi: number } | null;
  corridor: { lo: number; hi: number } | null;
  items: OverviewItem[];
  sel: string | null;
  setSel: (id: string) => void;
  tab: Tab;
  setTab: (t: Tab) => void;
};

export function LadderPanel(p: Props) {
  const phone = useIsMobile();
  const chainLo = p.rows[0]?.strike ?? 0, chainHi = p.rows[p.rows.length - 1]?.strike ?? 0;
  const [mode, setMode] = useState<Mode>("near");
  const [win, setWin] = useState<{ lo: number; hi: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [search, setSearch] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const isOverview = p.tab === "Overview";
  const levels = isOverview ? p.levels : [];

  const clamp = (lo: number, hi: number) => ({ lo: Math.max(chainLo, lo), hi: Math.min(chainHi, hi) });
  const snapOut = (lo: number, hi: number) => clamp(Math.floor(lo / p.step) * p.step, Math.ceil(hi / p.step) * p.step);
  const near = () => {
    if (p.spot == null) return { lo: chainLo, hi: chainHi };
    const half = Math.max(2.5 * (p.straddle ?? 0), 0.012 * p.spot);
    return snapOut(p.spot - half, p.spot + half);
  };
  const allLv = () => {
    const xs = [...levels.map((l) => l.at), ...(p.spot != null ? [p.spot] : [])];
    if (!xs.length) return near();
    return snapOut(Math.min(...xs) - 2 * p.step, Math.max(...xs) + 2 * p.step);
  };

  // recompute in near / all modes; reset on symbol switch
  useEffect(() => { setMode("near"); }, [p.symbol]);
  useEffect(() => {
    if (!p.rows.length) return;
    if (mode === "near") setWin(near());
    else if (mode === "all") setWin(allLv());
    else if (mode === "full") setWin({ lo: chainLo, hi: chainHi });
    else if (!win) setWin(near());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, p.rows, p.spot, p.straddle, JSON.stringify(levels.map((l) => l.at)), p.tab]);

  const w = win ?? { lo: chainLo, hi: chainHi };
  const zoom = (k: number) => {
    const c = (w.lo + w.hi) / 2, half = Math.max(2 * p.step, ((w.hi - w.lo) / 2) * k);
    setMode("custom"); setWin(snapOut(c - half, c + half));
  };
  const include = (at: number) => { setMode("custom"); setWin(snapOut(Math.min(w.lo, at - p.step), Math.max(w.hi, at + p.step))); };
  const recentre = (s: number) => {
    const half = (w.hi - w.lo) / 2; let lo = s - half, hi = s + half;
    if (lo < chainLo) { hi += chainLo - lo; lo = chainLo; }
    if (hi > chainHi) { lo -= hi - chainHi; hi = chainHi; }
    setMode("custom"); setWin(snapOut(lo, hi));
  };

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k >= "1" && k <= "6") { p.setTab(TABS[Number(k) - 1]); return; }
      if (k === "+" || k === "=") zoom(0.7);
      else if (k === "-" || k === "_") zoom(1.4);
      else if (k === "0") setMode("near");
      else if (k === "l" || k === "L") setMode("all");
      else if (k === "f" || k === "F") setMode("full");
      else if (k === "/") { e.preventDefault(); setSearch(""); setTimeout(() => searchRef.current?.focus(), 0); }
      else if ((k === "ArrowDown" || k === "ArrowUp") && isOverview) {
        e.preventDefault();
        const i = p.items.findIndex((it) => it.id === p.sel);
        const ni = Math.max(0, Math.min(p.items.length - 1, (i < 0 ? -1 : i) + (k === "ArrowDown" ? 1 : -1)));
        p.setSel(p.items[ni].id);
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const selItem = p.items.find((it) => it.id === p.sel) ?? null;
  const hoverText = useMemo(() => {
    if (hover == null) return null;
    const r = p.rows.find((x) => x.strike === hover);
    if (!r) return null;
    const names = levels.filter((l) => l.at === hover).map((l) => l.name).join(" ≡ ");
    const pct = p.spot ? ` · ${sgn(((hover - p.spot) / p.spot) * 100, 2)} %` : "";
    return `${num(hover)} · ${r.full ?? r.readout}${pct}${names ? ` · ${names}` : ""}`;
  }, [hover, p.rows, levels, p.spot]);

  const detail = selItem ? DETAIL[selItem.id] : null;
  const modeLabel: Record<Mode, string> = { near: "Near spot", all: "All levels", full: "Full chain", custom: "Custom" };

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b" style={{ borderColor: "var(--line)" }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => p.setTab(t)}
            className="-mb-px border-b-2 px-3 py-2 text-[12px] font-medium"
            style={{ borderColor: p.tab === t ? "var(--ink-1)" : "transparent", color: p.tab === t ? "var(--ink-1)" : "var(--ink-3)" }}>
            <span className="mr-1.5" style={{ color: "var(--ink-3)" }}>{i + 1}</span>{t}
          </button>
        ))}
      </div>

      <div className="rounded-lg p-3 md:p-4" style={{ background: "var(--s1)", border: "1px solid var(--line)" }}>
        {/* Header controls */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--ink-3)" }}>
          {(["near", "all", "full"] as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)} className="rounded px-2 py-1"
              style={{ background: mode === m ? "var(--s2)" : "transparent", color: mode === m ? "var(--ink-1)" : "var(--ink-3)" }}>
              {modeLabel[m]} <span style={{ color: "var(--ink-3)" }}>{m === "near" ? "0" : m === "all" ? "L" : "F"}</span>
            </button>
          ))}
          {mode === "custom" && <span className="rounded px-2 py-1" style={{ background: "var(--s2)", color: "var(--ink-1)" }}>Custom</span>}
          <button onClick={() => zoom(0.7)} className="rounded px-2 py-1 hover:bg-[var(--s2)]">+</button>
          <button onClick={() => zoom(1.4)} className="rounded px-2 py-1 hover:bg-[var(--s2)]">−</button>
          {search != null && (
            <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value.replace(/[^\d]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && search) { const s = Math.round(Number(search) / p.step) * p.step; recentre(Math.max(chainLo, Math.min(chainHi, s))); setSearch(null); }
                if (e.key === "Escape") setSearch(null);
              }}
              onBlur={() => setSearch(null)} placeholder="strike…"
              className="w-24 rounded border bg-transparent px-2 py-0.5 text-[11px] outline-none"
              style={{ borderColor: "var(--sel)", color: "var(--ink-1)" }} />
          )}
          <div className="flex-1" />
          <label className="flex cursor-not-allowed items-center gap-1 opacity-50" title="pending measurement (E-3)">
            <input type="checkbox" disabled /> γ CEILING / FLOOR · pending measurement
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          {/* Value list */}
          <div className="order-2 lg:order-1">
            {isOverview ? p.items.map((it) => {
              const on = it.id === p.sel;
              return (
                <button key={it.id} onClick={() => p.setSel(it.id)}
                  className="flex w-full items-center gap-3 border-l-2 px-3 py-2 text-left hover:bg-[var(--s2)]"
                  style={{ borderColor: on ? "var(--sel)" : "transparent", background: on ? "var(--s-sel-row)" : undefined }}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium" style={{ color: "var(--ink-1)" }}>{it.label}</div>
                    <div className="truncate text-[11px]" style={{ color: "var(--ink-3)" }}>{it.sub || "\u00a0"}</div>
                  </div>
                  <div className="shrink-0 text-right text-[15px] font-semibold" style={{ fontFamily: "var(--font-plex-cond)" }}>{it.value}</div>
                </button>
              );
            }) : (
              <div className="rounded border border-dashed px-3 py-4 text-[12px]" style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}>
                {p.tab} layer not built yet — the ladder window stays shared.
              </div>
            )}
          </div>

          {/* Ladder */}
          <div className="order-1 min-w-0 lg:order-2">
            <div className="mb-1 grid grid-cols-[60px_10px_1fr_10px_64px] text-[9px] uppercase tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>
              <div className="text-right pr-2">strike</div><div /><div className="text-center">{isOverview ? "← amplifying · dampening →" : ""}</div><div />
              <div className="pl-2 text-right">{isOverview ? "net γ" : ""}</div>
            </div>
            {p.rows.length ? (
              <StrikeLadder
                rows={isOverview ? p.rows : p.rows.map((r) => ({ ...r, value: null, tint: null, readout: "" }))}
                lo={w.lo} hi={w.hi} step={p.step} spot={p.spot} levels={levels}
                priced={isOverview && p.spot != null && p.straddle != null ? { lo: p.spot - p.straddle, hi: p.spot + p.straddle } : null}
                pin={isOverview ? p.pinBand : null} corridor={isOverview ? p.corridor : null} signed={isOverview}
                selected={p.sel} selLevelIds={selItem?.levelIds ?? []} selPriced={!!selItem?.priced}
                hover={hover} onHover={setHover} onSelectLevel={(id) => {
                  const it = p.items.find((x) => x.levelIds.includes(id)); if (it) p.setSel(it.id);
                }}
                onInclude={include} onRecentre={recentre} phone={phone} />
            ) : (
              <span className="inline-block rounded border border-dashed px-1.5 py-0.5 text-[12px]" style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}>no run</span>
            )}
            {/* Legend */}
            {isOverview && (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]" style={{ color: "var(--ink-3)" }}>
                <Sw c="var(--warm)" l="amplifying γ" /><Sw c="var(--cool)" l="dampening γ" />
                <Sw c="color-mix(in srgb, var(--ink-1) 30%, transparent)" l="priced move" />
                <Sw c="color-mix(in srgb, var(--cool) 55%, transparent)" l="pin band" />
                <Rl s="2px solid var(--ink-1)" l="spot" /><Rl s="1px dashed var(--rule)" l="flip" />
                <Rl s="1px solid var(--rule)" l="OI wall" /><Rl s="1px dotted var(--rule)" l="γ-conc" />
              </div>
            )}
            <p className="mt-3 min-h-[20px] text-[13px]" style={{ color: hoverText ? "var(--ink-2)" : "var(--ink-1)" }}>
              {hoverText ?? selItem?.caption ?? ""}
            </p>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {isOverview && detail && (
        <div className="grid gap-x-8 gap-y-3 rounded-lg p-4 text-[12px] md:grid-cols-2" style={{ background: "var(--s1)", border: "1px solid var(--line)" }}>
          <div className="md:col-span-2 flex flex-wrap items-baseline gap-3">
            <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--ink-3)" }}>{p.tab}</span>
            <span className="text-[16px] font-semibold" style={{ color: "var(--ink-1)" }}>{detail.title}</span>
            <span style={{ color: "var(--ink-3)" }}>{detail.unit}</span>
            <span className="ml-auto text-[10px]" style={{ color: "var(--ink-3)" }}>{detail.src}</span>
          </div>
          <Slot k="What it is" v={detail.what} /><Slot k="How to read it" v={detail.how} />
          <Slot k="Computed" v={detail.computed} /><Slot k="Scale" v={detail.scale} />
          <Slot k="Caveat" v={detail.caveat} />
          <div>
            <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--ink-3)" }}>Read it with</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {detail.withIds.map((id) => (
                <button key={id} onClick={() => p.setSel(id)} className="rounded border px-2 py-0.5 text-[11px] hover:bg-[var(--s2)]"
                  style={{ borderColor: "var(--line-2)", color: "var(--ink-2)" }}>{DETAIL[id].title}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const Sw = ({ c, l }: { c: string; l: string }) => <span className="flex items-center gap-1"><span className="inline-block h-2 w-3" style={{ background: c }} />{l}</span>;
const Rl = ({ s, l }: { s: string; l: string }) => <span className="flex items-center gap-1"><span className="inline-block w-4" style={{ borderTop: s }} />{l}</span>;
const Slot = ({ k, v }: { k: string; v: string }) => (
  <div><div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--ink-3)" }}>{k}</div><div className="mt-0.5" style={{ color: "var(--ink-2)" }}>{v}</div></div>
);
