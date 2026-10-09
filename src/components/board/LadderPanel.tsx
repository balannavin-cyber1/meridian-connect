// Board tabs + shared ladder + Overview value list, caption and detail panel (Phase 1b).
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { StrikeLadder, type Level, type LadderRow } from "./StrikeLadder";
import { useIsMobile } from "@/hooks/use-mobile";
import { PinBody, FlowsBody, type Stretch } from "./PinFlowsBody";
import { Sym } from "./Sym";

export const TABS = ["Overview", "Pin", "Gamma", "OI", "Flows", "IV"] as const;
export type Tab = (typeof TABS)[number];
type Mode = "near" | "all" | "full" | "custom";

export type OverviewItem = { id: string; label: string; sub: string; value: React.ReactNode; caption: string; levelIds: string[]; priced?: boolean; extra?: React.ReactNode; ratio?: number | null };

const num = (v: number, d = 0) => v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const sgn = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${num(Math.abs(v), d)}`;

const DETAIL: Record<string, { title: string; unit: string; what: string; how: string; computed: string; scale: string; caveat: string; withIds: string[]; src: string }> = {
  net: { title: "Net Γ", unit: "Cr (unit definition pending)", what: "Sum of signed dealer gamma exposure across every strike of the latest run.", how: "Positive (cool) means dealers are net long gamma and hedge against moves; negative (warm) means they hedge with moves.", computed: "v_gex_abs_exposure.net_gex_cr; net/gross = net_gex_cr ÷ abs_gex_cr.", scale: "band not measured — calibration gap (E-D1)", caveat: "Unit definition still open; compare sign and net/gross, not magnitude across days.", withIds: ["pin", "flip"], src: "sql/ file · COMMENT not live" },
  flip: { title: "Flip", unit: "index points", what: "The spot level where repriced net gamma crosses zero.", how: "Distance from spot says how far price must travel before the hedging regime changes sign.", computed: "v_gex_repriced_flip.flip; % = (flip − displayed spot) ÷ displayed spot. Flip is on the chain clock, spot on the γ clock.", scale: "band not measured — calibration gap", caveat: "Chain clock. Named states: no flip in grid · skipped on expiry day · carry unmeasurable.", withIds: ["corridor", "priced"], src: "sql/ file · COMMENT not live" },
  corridor: { title: "Corridor", unit: "strikes", what: "Put OI wall to call OI wall within the eligible σ band.", how: "Spot inside means both walls are in play; above/below names the wall that has been crossed.", computed: "v_gex_strike_walls.put_wall, call_wall, corridor_state.", scale: "width in % of spot; no measured band", caveat: "IV-stale flag widens uncertainty of the eligible band.", withIds: ["pin", "spot"], src: "sql/ file · COMMENT not live" },
  pin: { title: "Pin (γ-conc)", unit: "strike · share of gross", what: "The strike carrying the largest share of absolute gamma.", how: "A large lead over #2 means one strike dominates the centre.", computed: "v_gex_strike_rank rank 1; lead = (share₁ − share₂) × 100.", scale: "band not measured — calibration gap", caveat: "Concentration is not a forecast of the close.", withIds: ["corridor", "net"], src: "sql/ file · COMMENT not live" },
  priced: { title: "Priced move", unit: "index points", what: "ATM straddle — the move the options market is pricing to expiry.", how: "Lights the left gutter: strikes within ± straddle of spot.", computed: "gamma_metrics.straddle_atm; % = straddle ÷ spot.", scale: "no band", caveat: "Includes time value to expiry, not a one-day range.", withIds: ["flip", "dte"], src: "sql/ file · COMMENT not live" },
  spot: { title: "Spot", unit: "index points", what: "Index level at the latest γ run.", how: "Glowing solid rule on the ladder; the terrain row it sits in is its pocket.", computed: "gamma_metrics.spot.", scale: "—", caveat: "γ clock; may lag the live tick.", withIds: ["corridor", "flip"], src: "sql/ file · COMMENT not live" },
  g_top: { title: "Top-strike share", unit: "share of gross |γ| (max |γ| ÷ Σ|γ|)", what: "How much of the gross gamma book (Σ|γ|) sits on its single largest strike.", how: "High share means one strike carries the book — read single strikes with care; low share means γ is spread out.", computed: "v_gex_concentration.hhi_net (γ clock); call/put splits hhi_call, hhi_put.", scale: "dte bucket matters: 0-DTE concentrates naturally; no measured band", caveat: "This is max/sum, not a Σshare² index — never call it HHI. The call/put split is load-bearing: one side can be concentrated while the other is spread.", withIds: ["g_contrib", "g_gross"], src: "sql/ file · COMMENT not live" },
  g_gross: { title: "Gross |Γ|", unit: "₹ Cr (unit definition pending)", what: "Sum of absolute dealer gamma across every strike.", how: "The size of the book regardless of sign; net/gross says how one-sided it is.", computed: "v_gex_abs_exposure.abs_gex_cr.", scale: "band not measured — calibration gap (E-D1)", caveat: "Unit still open; compare within a day, not magnitudes across days.", withIds: ["g_net", "g_top"], src: "sql/ file · COMMENT not live" },
  g_net: { title: "Net Γ", unit: "₹ Cr (unit definition pending)", what: "Signed sum of dealer gamma — same value as the strip's Net Γ.", how: "Cool = dampening (dealers hedge against moves); warm = amplifying. The white dots on the ladder are its running sum from the top strike down.", computed: "v_gex_abs_exposure.net_gex_cr.", scale: "band not measured — calibration gap (E-D1)", caveat: "Where the dots cross zero the book changes sign; that is not the repriced flip.", withIds: ["g_gross", "g_spark"], src: "sql/ file · COMMENT not live" },
  g_contrib: { title: "Contributing strikes", unit: "strikes", what: "Strikes with non-zero gamma out of all stored strikes in the run.", how: "Few contributors with a high top-strike share = a thin, pointy book.", computed: "v_gex_abs_exposure.n_contributing / n_strikes.", scale: "—", caveat: "Unquoted strikes count as non-contributing.", withIds: ["g_top", "g_gross"], src: "sql/ file · COMMENT not live" },
  g_netlong: { title: "Net-long γ strike", unit: "strike", what: "The strike with the largest positive net gamma.", how: "Dotted rule on the ladder (NET-LONG γ). Where dealers are most long gamma.", computed: "gamma_metrics.max_gamma_strike (matches the positive gex_cr argmax, E-D5).", scale: "—", caveat: "Not \"near spot\" — it can sit far from price (ADR-024 Amendment A).", withIds: ["g_net", "g_top"], src: "sql/ file · COMMENT not live" },
  g_spark: { title: "Net Γ today", unit: "₹ Cr", what: "Net gamma at each run of the current trading session.", how: "Shape of the day: drifting toward zero means the dampening is wearing off.", computed: "gamma_metrics.ts, net_gex for today, deduped by ts; drawn only with ≥3 runs.", scale: "—", caveat: "γ clock.", withIds: ["g_net", "g_gross"], src: "sql/ file · COMMENT not live" },
  oi_max: { title: "Max pain", unit: "strike", what: "The strike where total option-holder pain is lowest at the latest gamma run.", how: "The ink rule marks the minimum; the faint curve shows the full pain valley.", computed: "v_gex_max_pain at the ladder run_id.", scale: "curve owns its min–max scale", caveat: "A positional concentration, not a forecast or pressure sign.", withIds: ["oi_dist", "oi_total"], src: "sql/ file · COMMENT not live" },
  oi_dist: { title: "Distance to max pain", unit: "% of spot", what: "The signed distance from spot to the max-pain strike.", how: "Above means max pain is above spot; below means it is below spot.", computed: "(max_pain_strike − spot) ÷ spot × 100.", scale: "—", caveat: "Uses spot at the same gamma clock.", withIds: ["oi_max", "spot"], src: "sql/ file · COMMENT not live" },
  oi_callwall: { title: "Call OI wall", unit: "strike", what: "The eligible strike carrying the largest call open interest.", how: "Calls extend right from the strike axis in the butterfly.", computed: "v_gex_strike_walls.call_wall.", scale: "raw contracts", caveat: "OI is positional; grey does not encode pressure sign.", withIds: ["oi_putwall", "oi_total"], src: "sql/ file · COMMENT not live" },
  oi_putwall: { title: "Put OI wall", unit: "strike", what: "The eligible strike carrying the largest put open interest.", how: "Puts extend left from the strike axis in the butterfly.", computed: "v_gex_strike_walls.put_wall.", scale: "raw contracts", caveat: "OI is positional; grey does not encode pressure sign.", withIds: ["oi_callwall", "oi_total"], src: "sql/ file · COMMENT not live" },
  oi_total: { title: "Total OI", unit: "contracts", what: "Call plus put open interest across the stored chain.", how: "Use the butterfly to see which strikes and sides carry that stock.", computed: "Σ oi_call + Σ oi_put at the latest gamma run.", scale: "raw, lot-agnostic", caveat: "Do not compare contract counts across products without context.", withIds: ["oi_callwall", "oi_putwall"], src: "sql/ file · COMMENT not live" },
  oi_delta: { title: "ΔOI since 09:15", unit: "quantity since the 09:15 anchor, per side", what: "Open interest at the latest chain snapshot minus open interest at the first chain snapshot at or after 09:15 IST, front expiry, per strike, calls and puts separately.", how: "Cool ticks rose; warm ticks fell. The value sums each side over strikes present at both times. n/c marks a strike present at only one of the two times — not comparable, never zero.", computed: "v_oi_rotation_since_open (ENH-127): ce/pe_oi_latest_qty − ce/pe_oi_anchor_qty. Vendor oi_change is not used.", scale: "raw quantity · no band", caveat: "An OI change cannot tell writing from buying. Chain clock, not γ clock. SENSEX withheld: its 09:15 anchor can come from a stale vendor row (TD-S84-NEW-4).", withIds: ["oi_total", "oi_max"], src: "v_oi_rotation_since_open · COMMENT live" },
  // ---- S92 Pin tab (L12; rulings S92-D, S92-F) ----
  p_pin: { title: "Pin (γ-conc)", unit: "strike · share of gross |γ|", what: "The strike carrying the largest share of absolute gamma at the latest γ run.", how: "Bars show every ranked strike's share of gross |γ| from the left edge, top 10 at full strength. Cool = dampening, warm = amplifying.", computed: "v_gex_strike_rank rank 1 (ENH-125).", scale: "share of gross; no measured band", caveat: "Concentration is not a forecast of the close (S74: the pin renders, it does not predict).", withIds: ["p_runner", "p_state"], src: "v_gex_strike_rank · COMMENT live" },
  p_runner: { title: "Runner-up", unit: "strike · ratio to #1", what: "The strike with the second-largest share of gross |γ|.", how: "#2/#1 near 1 means two strikes share the centre; near 0 means one dominates.", computed: "v_gex_strike_rank rank 2; ratio = share₂ ÷ share₁ (gex_cycle_history.runnerup_share_ratio).", scale: "no measured band", caveat: "The ranked-PRESSURE key is DECLINED-ON-EVIDENCE (D-5a); ranking here is by |γ| only.", withIds: ["p_pin", "p_lead"], src: "v_gex_strike_rank · COMMENT live" },
  p_lead: { title: "Lead", unit: "share points", what: "How far #1's share of gross |γ| sits above #2's.", how: "Selecting it outlines #1 and #2 on the ladder.", computed: "(share₁ − share₂) × 100 from v_gex_strike_rank.", scale: "band not measured — no LOCKED/CONTESTED word (D-6)", caveat: "A number, not a state.", withIds: ["p_runner", "p_conv"], src: "v_gex_strike_rank · COMMENT live" },
  p_state: { title: "Pin state", unit: "NO PIN · SHIFTING · STABLE · LOCKED", what: "Whether the pin leader has held, and with how clear a lead, through today's OPEN cycles.", how: "SHIFTING = leader changed recently; STABLE = held; LOCKED = held long with a clear lead. Held-for counts OPEN 5-minute cycles only.", computed: "core/pin_state.py at write time from held_for_cycles, runnerup_share_ratio, top-1 share; thresholds merdian_parameters pin_state.* (seeded S90). Read via v_pin_board.", scale: "thresholds are seeded parameters, not yet re-measured against outcomes (D-6)", caveat: "Frozen or pre-tick cycles never count (ADR-030). Rows are reconciled at end of day; before that a row can still be revised.", withIds: ["p_conv", "p_today"], src: "v_pin_board · COMMENT live" },
  p_conv: { title: "Conviction", unit: "number (stage 1)", what: "Lead clarity scaled by time to expiry: (1 − #2/#1) × boost(T).", how: "Higher = a clearer leader closer to expiry. Compare within a symbol, not across.", computed: "gex_cycle_history.conviction: (1 − runnerup_share_ratio) × 2.53·T^−0.5, T in trading days, cap 3.70, floor T = 0.47 (D-5b/D-5c). Read via v_pin_board.", scale: "NO MEASURED BAND (D-6) — shown as a number, never a word. Stage 2 (×30-session HHI percentile) needs ~6 weeks of history.", caveat: "An ADR-025 D3 deviation from the parity target, whose formula is undisclosed.", withIds: ["p_state", "p_lead"], src: "v_pin_board · COMMENT live" },
  p_hhi: { title: "Concentration (HHI)", unit: "Σ share² over ranked strikes", what: "The true Herfindahl index of the gamma book: 1/n when perfectly spread, 1 when one strike holds everything.", how: "Read it beside the top-5 share: both rising means the book is gathering onto fewer strikes.", computed: "gex_cycle_history.conc_hhi (true Σ share²) and top5_share. NOT v_gex_concentration.hhi_net, which is a top-1 share.", scale: "no measured band", caveat: "Time of day and DTE change the natural level; no percentile until ENH-133 has ~30 sessions.", withIds: ["p_pin", "p_today"], src: "v_pin_board · COMMENT live" },
  p_band: { title: "Pin band", unit: "strikes", what: "The τ-weighted pin zone.", how: "The right gutter fills on strikes inside it.", computed: "v_gex_strike_pin_zone.pin_lower / pin_upper (ENH-81).", scale: "—", caveat: "Renders, does not predict (S74).", withIds: ["p_pin", "p_dist"], src: "v_gex_strike_pin_zone · COMMENT live" },
  p_dist: { title: "Pin distance", unit: "% of spot", what: "Signed distance from spot to the pin strike.", how: "Positive means the pin is above spot.", computed: "(pin − spot) ÷ spot × 100, both on the γ clock.", scale: "σ not shown until the canonical σ exists (E-2)", caveat: "—", withIds: ["p_pin", "p_band"], src: "derived" },
  p_today: { title: "Leader today", unit: "leader changes", what: "How the pin leader moved through today's OPEN cycles.", how: "Each line is one stretch with the same leader, its time span and cycle count.", computed: "v_pin_board.pin_leader_strike, consecutive equal values grouped.", scale: "—", caveat: "Front leg only (S90-B).", withIds: ["p_state", "p_conv"], src: "v_pin_board · COMMENT live" },
  p_legacy: { title: "Legacy pin-risk score", unit: "/100", what: "The pre-parity pin-risk score from gamma_metrics.", how: "A number only; its 25/50/75 words were never measured.", computed: "gamma_metrics.pin_risk_score.", scale: "no band (E-D4)", caveat: "Kept for continuity; not part of L12.", withIds: ["p_conv", "p_state"], src: "gamma_metrics" },
  // ---- S92 Flows tab (L7/L8; rulings S92-C, S92-E) ----
  f_hedge: { title: "Hedge per 1 %", unit: "₹ Cr (unit definition pending)", what: "What dealers must trade to stay hedged if spot moves, from net Γ at the latest run.", how: "The chart is the hedge line through zero at ±0.5/1/2 %. A long-γ book buys falls and sells rises.", computed: "v_dealer_flow_sim: flow_cr = −net_gex × move (sign fixed S90, MV-1).", scale: "linear by construction — the six points lie on one slope", caveat: "First-order only: ignores the second-order terms below. The dashed line is the L3 repriced flip, not the engine flip_level the view's own crosses_flip column uses (MV-12).", withIds: ["f_ddt", "f_ddiv"], src: "v_dealer_flow_sim" },
  f_ddt: { title: "∂Δ/∂t · delta drift per day", unit: "₹ Cr delta-notional per calendar day", what: "How dealer delta-notional changes as one calendar day passes with spot and IV unchanged.", how: "Net is meaningfully signed for this pair (|net/gross| ≥ 0.957 on 7 of 8 measured arms). Bars show each strike's contribution.", computed: "v_gex_greeks_l2_net.net_delta_drift_time_cr_per_day; analytic Black-Scholes, q = 0, exact/365, PE legs negated (dealer long calls, short puts).", scale: "no measured band", caveat: "PROVISIONAL — flow-vs-book (D-4) not built. dte 0 is skipped, never floored.", withIds: ["f_ddiv", "f_gdt"], src: "v_gex_greeks_l2_net · COMMENT live" },
  f_ddiv: { title: "∂Δ/∂σ · delta drift per vol point", unit: "₹ Cr delta-notional per +1 IV point", what: "How dealer delta-notional changes for a +1 implied-vol point, spot and time fixed.", how: "Net is meaningfully signed for this pair. Bars show each strike's contribution.", computed: "v_gex_greeks_l2_net.net_delta_drift_iv_cr_per_volpt (per +0.01 of σ, not per 1.00).", scale: "no measured band", caveat: "PROVISIONAL — flow-vs-book (D-4) not built.", withIds: ["f_ddt", "f_gdiv"], src: "v_gex_greeks_l2_net · COMMENT live" },
  f_gdt: { title: "∂Γ/∂t · gamma drift per day", unit: "₹ Cr GEX per calendar day", what: "The parity target's ∂gamma construct: how gamma exposure changes as a day passes.", how: "Net is a small residue of large opposing terms — ALWAYS read it with its gross, which is shown beside it.", computed: "v_gex_greeks_l2_net.net_gex_drift_time_cr_per_day with gross_strike_gex_drift_time.", scale: "no measured band", caveat: "PROVISIONAL — flow-vs-book (D-4) not built. Never read the net alone (L7/L8 spec §6).", withIds: ["f_gdiv", "f_ddt"], src: "v_gex_greeks_l2_net · COMMENT live" },
  f_gdiv: { title: "∂Γ/∂σ · gamma drift per vol point", unit: "₹ Cr GEX per +1 IV point", what: "The parity target's ∂gamma construct: how gamma exposure changes for a +1 implied-vol point.", how: "Net is a small residue — ALWAYS read it with its gross, shown beside it.", computed: "v_gex_greeks_l2_net.net_gex_drift_iv_cr_per_volpt with gross_strike_gex_drift_iv.", scale: "no measured band", caveat: "PROVISIONAL — flow-vs-book (D-4) not built. Never read the net alone.", withIds: ["f_gdt", "f_ddiv"], src: "v_gex_greeks_l2_net · COMMENT live" },
  f_leg: { title: "Expiry leg", unit: "expiry · DTE · status", what: "Which captured expiry the second-order figures and bars are for.", how: "The front leg by default; on its expiry day it is skipped and the next leg is shown.", computed: "v_gex_greeks_l2_net, every leg at the latest chain ts.", scale: "—", caveat: "Chain clock (not the γ clock). Status values: OK · SKIPPED_EXPIRY · UNMEASURABLE_R · NO_LEGS.", withIds: ["f_ddt", "f_hedge"], src: "v_gex_greeks_l2_net · COMMENT live" },
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
  gammaItems: OverviewItem[];
  gammaLevels: Level[];
  silhouette: Map<number, number> | null;
  oiRows: LadderRow[];
  oiItems: OverviewItem[];
  oiLevels: Level[];
  painCurve: Map<number, number> | null;
  oiDeltaNote: string;
  river: React.ReactNode;
  ivPanel?: React.ReactNode;
  pinItems: OverviewItem[];
  pinRows: LadderRow[];
  pinLevels: Level[];
  flowItems: OverviewItem[];
  flowRows: LadderRow[];
  flowLevels: Level[];
  flowsBadge: React.ReactNode;
  flowsNote: string;
  pinNote: string;
  pinStretches?: Stretch[];
  flowsTop?: React.ReactNode;
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
  const isOverview = p.tab === "Overview", isGamma = p.tab === "Gamma", isOI = p.tab === "OI";
  const isPin = p.tab === "Pin", isFlows = p.tab === "Flows";
  const layered = isOverview || isGamma || isOI || isPin || isFlows;
  const items = isOverview ? p.items : isGamma ? p.gammaItems : isOI ? p.oiItems : isPin ? p.pinItems : isFlows ? p.flowItems : [];
  const levels = isOverview ? p.levels : isGamma ? p.gammaLevels : isOI ? p.oiLevels : isPin ? p.pinLevels : isFlows ? p.flowLevels : [];
  // Pin and Flows draw their own rows but share the γ-run strike axis; fall back to it while they load.
  const activeRows = isOI ? p.oiRows : isPin && p.pinRows.length ? p.pinRows : isFlows && p.flowRows.length ? p.flowRows : isPin || isFlows ? p.rows.map((r) => ({ ...r, value: null, tint: null, readout: "" })) : p.rows;

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
      else if ((k === "ArrowDown" || k === "ArrowUp") && layered && items.length) {
        e.preventDefault();
        const i = items.findIndex((it) => it.id === p.sel);
        const ni = Math.max(0, Math.min(items.length - 1, (i < 0 ? -1 : i) + (k === "ArrowDown" ? 1 : -1)));
        p.setSel(items[ni].id);
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const selItem = items.find((it) => it.id === p.sel) ?? null;
  const hoverText = useMemo(() => {
    if (hover == null) return null;
    const r = activeRows.find((x) => x.strike === hover);
    if (!r) return null;
    const names = levels.filter((l) => l.at === hover).map((l) => l.name).join(" ≡ ");
    const pct = p.spot ? ` · ${sgn(((hover - p.spot) / p.spot) * 100, 2)} %` : "";
    return `${num(hover)} · ${r.full ?? r.readout}${pct}${names ? ` · ${names}` : ""}`;
  }, [hover, activeRows, levels, p.spot]);

  const detail = selItem ? DETAIL[selItem.id] : null;
  const modeLabel: Record<Mode, string> = { near: "Near spot", all: "All levels", full: "Full chain", custom: "Custom" };

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b" style={{ borderColor: "var(--line)" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => p.setTab(t)}
            className="-mb-px border-b-2 px-3 py-2 text-[12px] font-medium"
            style={{ borderColor: p.tab === t ? "var(--ink-1)" : "transparent", color: p.tab === t ? "var(--ink-1)" : "var(--ink-3)" }}>
            {t}
          </button>
        ))}
      </div>

      <div className="rounded-lg p-3 md:p-4" style={{ background: "var(--s1)", border: "1px solid var(--line)" }}>
        {/* Header controls */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--ink-3)" }}>
          {p.tab !== "IV" && (["near", "all", "full"] as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)} className="rounded px-2 py-1"
              style={{ background: mode === m ? "var(--s2)" : "transparent", color: mode === m ? "var(--ink-1)" : "var(--ink-3)" }}>
              {modeLabel[m]} <span style={{ color: "var(--ink-3)" }}>{m === "near" ? "0" : m === "all" ? "L" : "F"}</span>
            </button>
          ))}
          {p.tab !== "IV" && mode === "custom" && <span className="rounded px-2 py-1" style={{ background: "var(--s2)", color: "var(--ink-1)" }}>Custom</span>}
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
          {isOI && <span>{p.oiDeltaNote}</span>}
          {isPin && <span>{p.pinNote}</span>}
          {isFlows && <span>{p.flowsNote}</span>}
          <label className="flex cursor-not-allowed items-center gap-1 opacity-50" title="pending measurement (E-3)">
            <input type="checkbox" disabled /> γ CEILING / FLOOR · pending measurement
          </label>
        </div>

        {p.tab === "IV" && p.ivPanel}
        {isFlows && p.flowsBadge}
        {isFlows && p.flowsTop}
        <div className={`grid gap-4 ${isPin || isFlows ? "lg:grid-cols-[360px_1fr]" : "lg:grid-cols-[280px_1fr]"} ${p.tab === "IV" ? "hidden" : ""}`}>
          {/* Value list */}
          <div className="order-2 min-w-0 lg:order-1">
            {isPin ? <PinBody items={items} sel={p.sel} setSel={p.setSel} stretches={p.pinStretches ?? []} />
            : isFlows ? <FlowsBody items={items} sel={p.sel} setSel={p.setSel} />
            : layered ? items.map((it) => {
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
              <div className="text-right pr-2">strike</div><div /><div className="text-center"><Sym text={isOI ? "← PUT OI · CALL OI →" : isPin ? "share of gross |γ| →" : isFlows ? "← negative · positive →" : layered ? "← amplifying · dampening →" : ""} /></div><div />
              <div className="pl-2 text-right"><Sym text={isOI ? "TOTAL OI" : isPin ? "rank · share" : isFlows ? "Cr" : layered ? "net γ" : ""} /></div>
            </div>
            {p.rows.length ? (
              <StrikeLadder
                 rows={layered ? activeRows : p.rows.map((r) => ({ ...r, value: null, tint: null, readout: "" }))}
                lo={w.lo} hi={w.hi} step={p.step} spot={p.spot} levels={levels}
                 priced={!isOI && layered && p.spot != null && p.straddle != null ? { lo: p.spot - p.straddle, hi: p.spot + p.straddle } : null}
                 pin={!isOI && !isFlows && layered ? p.pinBand : null} corridor={(isOverview || isGamma) ? p.corridor : null} signed={layered} oneSided={isPin}
                silhouette={isGamma ? p.silhouette : null}
                 curve={isOI ? p.painCurve : null} butterfly={isOI}
                selected={p.sel} selLevelIds={selItem?.levelIds ?? []} selPriced={!!selItem?.priced}
                hover={hover} onHover={setHover} onSelectLevel={(id) => {
                  const it = items.find((x) => x.levelIds.includes(id)); if (it) p.setSel(it.id);
                }}
                onInclude={include} onRecentre={recentre} phone={phone} />
            ) : (
              <span className="inline-block rounded border border-dashed px-1.5 py-0.5 text-[12px]" style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}>no run</span>
            )}
            {/* Legend */}
            {layered && (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]" style={{ color: "var(--ink-3)" }}>
                 {isPin ? <><Sw c="var(--cool)" l="dampening strike" /><Sw c="var(--warm)" l="amplifying strike" /><Sw c="color-mix(in srgb, var(--cool) 25%, transparent)" l="rank > 10 (faint)" /><Sw c="color-mix(in srgb, var(--cool) 55%, transparent)" l="pin band" /><Rl s="2px solid var(--ink-1)" l="spot" /><Rl s="1px dotted var(--rule)" l="γ-conc / #2" /></>
                 : isFlows ? <><Sw c="var(--cool)" l="positive" /><Sw c="var(--warm)" l="negative" /><Rl s="2px solid var(--ink-1)" l="spot" /><Rl s="1px dashed var(--rule)" l="flip (L3)" /></>
                 : isOI ? <><Sw c="var(--put)" l="put OI" /><Sw c="var(--call)" l="call OI" /><Rl s="2px solid var(--ink-1)" l="max pain" />{p.symbol !== "SENSEX" && <><Rl s="2px solid var(--cool)" l="ΔOI rose" /><Rl s="2px solid var(--warm)" l="ΔOI fell" /></>}<Rl s="2px solid color-mix(in srgb, var(--ink-1) 28%, transparent)" l="pain valley" /><Link to="/board/3d?v=pain" className="rounded border px-2 py-0.5 text-[11px]" style={{ borderColor: "var(--line-2)", color: "var(--ink-2)" }} title="3D drill-down">3D ›</Link></> : <>
                   <Sw c="var(--warm)" l="amplifying γ" /><Sw c="var(--cool)" l="dampening γ" />
                   <Sw c="color-mix(in srgb, var(--ink-1) 30%, transparent)" l="priced move" />
                   <Sw c="color-mix(in srgb, var(--cool) 55%, transparent)" l="pin band" />
                   <Rl s="2px solid var(--ink-1)" l="spot" /><Rl s="1px dashed var(--rule)" l="flip" />
                   {isGamma ? <><Rl s="1px dotted var(--rule)" l="net-long γ" /><span className="flex items-center gap-1"><span className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: "var(--ink-1)" }} />cumulative Σγ from top</span></>
                     : <><Rl s="1px solid var(--rule)" l="OI wall" /><Rl s="1px dotted var(--rule)" l="γ-conc" /></>}
                 </>}
              </div>
            )}
            <p className="mt-3 min-h-[20px] text-[13px]" style={{ color: hoverText ? "var(--ink-2)" : "var(--ink-1)" }}>
              {hoverText ?? selItem?.caption ?? ""}
            </p>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {layered && detail && (
        <div className="grid gap-x-8 gap-y-3 rounded-lg p-4 text-[12px] md:grid-cols-2" style={{ background: "var(--s1)", border: "1px solid var(--line)" }}>
          <div className="md:col-span-2 flex flex-wrap items-baseline gap-3">
            <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--ink-3)" }}>{p.tab}</span>
            <span className="text-[16px] font-semibold" style={{ color: "var(--ink-1)" }}>{detail.title}</span>
            <span style={{ color: "var(--ink-3)" }}>{detail.unit}</span>
            <span className="ml-auto text-[10px]" style={{ color: "var(--ink-3)" }}>{detail.src}</span>
          </div>
          <Slot k="What it is" v={detail.what} /><Slot k="How to read it" v={detail.how} />
          <Slot k="Computed" v={detail.computed} /><Slot k="Scale" v={detail.scale} />
          {selItem?.extra && <div className="md:col-span-2">{selItem.extra}</div>}
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
      {isGamma && p.river}
    </div>
  );
}

const Sw = ({ c, l }: { c: string; l: string }) => <span className="flex items-center gap-1"><span className="inline-block h-2 w-3" style={{ background: c }} />{l}</span>;
const Rl = ({ s, l }: { s: string; l: string }) => <span className="flex items-center gap-1"><span className="inline-block w-4" style={{ borderTop: s }} />{l}</span>;
const Slot = ({ k, v }: { k: string; v: string }) => (
  <div><div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--ink-3)" }}>{k}</div><div className="mt-0.5" style={{ color: "var(--ink-2)" }}>{v}</div></div>
);
