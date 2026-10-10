// Phase 1a — Board summary-strip bindings. Browser-side Supabase reads only.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { Symbol } from "./queries";

const POLL = 60_000;
const opts = { staleTime: 30_000, refetchInterval: POLL } as const;

export const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
/** ISO instant for an IST wall-clock time on a date. */
export const istAt = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`).toISOString();
export const istTime = (ts: string | null | undefined) =>
  ts ? new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—";
export const istDateOf = (ts: string) =>
  new Date(new Date(ts).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

/** [current session, previous session] via trading_calendar — never "yesterday". */
export function useSessions() {
  return useQuery({
    queryKey: ["board", "sessions", istToday()],
    staleTime: 10 * 60_000,
    queryFn: async () => { const g = await getGate(); return { session: g.session, prev: g.prev }; },
  });
}

// ---------- trading-session gate ----------
// Every "latest cycle" read is capped at the end of the last real trading session
// (trading_calendar.is_open), so frozen holiday/weekend rows never render as live.
const nextDay = (d: string) => new Date(new Date(d + "T00:00:00Z").getTime() + 86400_000).toISOString().slice(0, 10);
type Gate = { session: string | null; prev: string | null; end: string | null; next: string | null };
let gateCache: { at: number; p: Promise<Gate> } | null = null;
export function getGate(): Promise<Gate> {
  if (gateCache && Date.now() - gateCache.at < 5 * 60_000) return gateCache.p;
  const p = (async () => {
    const { data, error } = await supabase.from("trading_calendar").select("trade_date")
      .eq("is_open", true).lte("trade_date", istToday())
      .order("trade_date", { ascending: false }).limit(2);
    if (error) throw error;
    const session = (data?.[0]?.trade_date as string) ?? null;
    const { data: nx } = await supabase.from("trading_calendar").select("trade_date")
      .eq("is_open", true).gt("trade_date", istToday()).order("trade_date", { ascending: true }).limit(1).maybeSingle();
    return { session, next: ((nx as any)?.trade_date as string) ?? null, prev: (data?.[1]?.trade_date as string) ?? null, end: session ? istAt(nextDay(session), "00:00") : null };
  })();
  gateCache = { at: Date.now(), p };
  p.catch(() => { gateCache = null; });
  return p;
}
/** Apply the session gate to a query builder on `ts`. */
/** AWAITING_SESSION: the gate excluded the only rows and no trading-session row remains. */
export const AWAIT = { __awaiting: true } as const;
export const isAwaiting = (x: any): boolean => !!x && x.__awaiting === true;
/** Returns AWAIT when an ungated (excluded) row exists for the same filter, else null. */
async function awaitingOrNull(view: string, symbol: Symbol, end: string | null, extra?: (q: any) => any) {
  if (!end) return null;
  let q: any = supabase.from(view).select("ts").eq("symbol", symbol).gte("ts", end);
  if (extra) q = extra(q);
  const { data } = await q.limit(1).maybeSingle();
  return data ? AWAIT : null;
}
export function useNextOpen() {
  return useQuery({ queryKey: ["board", "nextopen", istToday()], staleTime: 10 * 60_000, queryFn: async () => (await getGate()).next });
}

// Sync on purpose: awaiting a query builder would execute it.
export const applyGate = (q: any, end: string | null) => (end ? q.lt("ts", end) : q);

const latestBySymbol = (view: string, symbol: Symbol, extra?: (q: any) => any) =>
  async () => {
    const gate = await getGate();
    let q: any = applyGate(supabase.from(view).select("*").eq("symbol", symbol), gate.end);
    if (extra) q = extra(q);
    const { data, error } = await q.order("ts", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (data) return data as any;
    return (await awaitingOrNull(view, symbol, gate.end, extra)) as any;
  };

export const useGammaNow = (s: Symbol) =>
  useQuery({ queryKey: ["board", "gamma", s], ...opts, queryFn: latestBySymbol("gamma_metrics", s) });
export const useAbsExposure = (s: Symbol) =>
  useQuery({ queryKey: ["board", "abs", s], ...opts, queryFn: latestBySymbol("v_gex_abs_exposure", s) });
export const useRepricedFlip = (s: Symbol) =>
  useQuery({ queryKey: ["board", "flip", s], ...opts, queryFn: latestBySymbol("v_gex_repriced_flip", s) });
export const useWalls = (s: Symbol) =>
  useQuery({ queryKey: ["board", "walls", s], ...opts, queryFn: latestBySymbol("v_gex_strike_walls", s) });
export const useIvFront = (s: Symbol) =>
  useQuery({ queryKey: ["board", "ivterm", s], ...opts, queryFn: latestBySymbol("v_iv_term_structure", s, (q) => q.eq("leg", 1)) });
export const useFutures = (s: Symbol) =>
  useQuery({ queryKey: ["board", "fut", s], ...opts, queryFn: latestBySymbol("index_futures_snapshots", s) });

export function useStrikeRank(s: Symbol) {
  return useQuery({
    queryKey: ["board", "rank", s], ...opts,
    queryFn: async () => {
      const { data: top, error: e1 } = await applyGate(supabase.from("v_gex_strike_rank").select("run_id")
        .eq("symbol", s), (await getGate()).end).order("ts", { ascending: false }).limit(1).maybeSingle();
      if (e1) throw e1;
      if (!top) return [];
      const { data, error } = await supabase.from("v_gex_strike_rank").select("strike, strike_rank, share_of_abs, ts")
        .eq("symbol", s).eq("run_id", (top as any).run_id).lte("strike_rank", 2).order("strike_rank");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

/** S90 live spot: newest 1-minute capture (dhan_charts_intraday), refreshed every 30 s.
 *  The board's figures stay on the γ run's spot (one clock for flip / walls / pin, MV-2); the headline
 *  shows this one, with its time. Older than 10 min (capture stops 15:14, CAS window) => null, and the
 *  caller falls back to the γ spot. */
export function useLiveSpot(s: Symbol) {
  return useQuery({
    queryKey: ["board", "livespot", s], staleTime: 15_000, refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("market_spot_snapshots").select("ts, spot")
        .eq("symbol", s).eq("source_table", "dhan_charts_intraday")
        .order("ts", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      const r: any = data;
      if (!r || r.spot == null) return null;
      if (Date.now() - new Date(r.ts).getTime() > 10 * 60_000) return null;
      return { spot: Number(r.spot), ts: r.ts as string };
    },
  });
}

/** gex_cr at the strike nearest spot, from the latest gex_strike_snapshots run. */
export function useSpotPocket(s: Symbol) {
  return useQuery({
    queryKey: ["board", "pocket", s], ...opts,
    queryFn: async () => {
      const { data: top, error: e1 } = await applyGate(supabase.from("gex_strike_snapshots").select("run_id, spot, ts")
        .eq("symbol", s), (await getGate()).end).order("ts", { ascending: false }).limit(1).maybeSingle();
      if (e1) throw e1;
      if (!top) return null;
      const t: any = top;
      const { data, error } = await supabase.from("gex_strike_snapshots").select("strike, gex_cr")
        .eq("run_id", t.run_id).gte("strike", t.spot * 0.98).lte("strike", t.spot * 1.02);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      if (!rows.length) return null;
      const near = rows.reduce((a, b) => (Math.abs(b.strike - t.spot) < Math.abs(a.strike - t.spot) ? b : a));
      return { strike: Number(near.strike), gex_cr: Number(near.gex_cr), ts: t.ts as string };
    },
  });
}

/** Intraday spot series for the current session (deduped by ts) + previous-session last VIX. */
export function useGammaSession(s: Symbol, session: string | null, prev: string | null) {
  return useQuery({
    queryKey: ["board", "gsess", s, session, prev], ...opts, enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("gamma_metrics").select("ts, spot")
        .eq("symbol", s).gte("ts", istAt(session!, "00:00")).lt("ts", istAt(nextDay(session!), "00:00"))
        .order("ts", { ascending: true }).limit(1000);
      if (error) throw error;
      const seen = new Set<string>();
      const series = ((data ?? []) as any[]).filter((r) => r.spot != null && !seen.has(r.ts) && seen.add(r.ts))
        .map((r) => ({ ts: r.ts as string, spot: Number(r.spot) }));
      let prevVix: number | null = null;
      if (prev) {
        const { data: pv } = await supabase.from("gamma_metrics").select("vix, ts").eq("symbol", s)
          .gte("ts", istAt(prev, "00:00")).lt("ts", istAt(session!, "00:00"))
          .not("vix", "is", null).order("ts", { ascending: false }).limit(1).maybeSingle();
        prevVix = (pv as any)?.vix != null ? Number((pv as any).vix) : null;
      }
      return { series, prevVix };
    },
  });
}

/** Pre-open print, final open, previous settled close (16:00 IST dhan_idx_i). */
export function useOpenGap(s: Symbol, session: string | null, prev: string | null) {
  return useQuery({
    queryKey: ["board", "opengap", s, session, prev], ...opts, enabled: !!session,
    queryFn: async () => {
      const mss = () => supabase.from("market_spot_snapshots").select("ts, spot, raw").eq("symbol", s);
      const { data: pre } = await mss().eq("source_table", "dhan_idx_i")
        .gte("ts", istAt(session!, "09:00")).lt("ts", istAt(session!, "09:15"))
        .order("ts", { ascending: false }).limit(1).maybeSingle();
      const { data: bar } = await mss().eq("source_table", "dhan_charts_intraday")
        .gte("ts", istAt(session!, "09:15")).lt("ts", istAt(session!, "16:30"))
        .order("ts", { ascending: true }).limit(1).maybeSingle();
      let prevClose: number | null = null;
      if (prev) {
        const { data: pc } = await mss().eq("source_table", "dhan_idx_i")
          .gte("ts", istAt(prev, "16:00")).lt("ts", istAt(prev, "16:10"))
          .order("ts", { ascending: true }).limit(1).maybeSingle();
        prevClose = (pc as any)?.spot != null ? Number((pc as any).spot) : null;
      }
      const openRaw = (bar as any)?.raw?.ohlc_open;
      return {
        preOpen: (pre as any)?.spot != null ? Number((pre as any).spot) : null,
        preOpenTs: ((pre as any)?.ts as string) ?? null,
        open: openRaw != null && Number.isFinite(Number(openRaw)) ? Number(openRaw) : null,
        prevClose,
      };
    },
  });
}

/** Previous session's last in-session (≤15:30 IST) futures basis. */
export function usePrevBasis(s: Symbol, prev: string | null) {
  return useQuery({
    queryKey: ["board", "prevbasis", s, prev], staleTime: 10 * 60_000, enabled: !!prev,
    queryFn: async () => {
      const { data, error } = await supabase.from("index_futures_snapshots").select("basis, ts").eq("symbol", s)
        .gte("ts", istAt(prev!, "09:00")).lte("ts", istAt(prev!, "15:30"))
        .order("ts", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return (data as any)?.basis != null ? Number((data as any).basis) : null;
    },
  });
}

/** Max pain strike for the latest gated γ run. */
export function useMaxPain(s: Symbol) {
  return useQuery({
    queryKey: ["board", "maxpain", s], ...opts,
    queryFn: async () => {
      const { data, error } = await applyGate(supabase.from("v_gex_max_pain").select("max_pain_strike, ts, is_fresh")
        .eq("symbol", s), (await getGate()).end).order("ts", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
}

/** Dealer flow simulation rows for the latest gated run. */
export function useFlowSim(s: Symbol) {
  return useQuery({
    queryKey: ["board", "flowsim", s], ...opts,
    queryFn: async () => {
      const { data: top, error: e1 } = await applyGate(supabase.from("v_dealer_flow_sim").select("run_id")
        .eq("symbol", s), (await getGate()).end).order("ts", { ascending: false }).limit(1).maybeSingle();
      if (e1) throw e1;
      if (!top) return [];
      const { data, error } = await supabase.from("v_dealer_flow_sim").select("spot_pct, flow_cr, direction")
        .eq("symbol", s).eq("run_id", (top as any).run_id).order("spot_pct");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

/** Front + back ATM IV from v_iv_term_structure (latest gated ts). */
export function useIvTerm(s: Symbol) {
  return useQuery({
    queryKey: ["board", "ivterm2", s], ...opts,
    queryFn: async () => {
      const { data: top } = await applyGate(supabase.from("v_iv_term_structure").select("ts").eq("symbol", s), (await getGate()).end)
        .order("ts", { ascending: false }).limit(1).maybeSingle();
      if (!top) return (await awaitingOrNull("v_iv_term_structure", s, (await getGate()).end)) ? AWAIT as any : [];
      const { data, error } = await supabase.from("v_iv_term_structure").select("leg, expiry_date, atm_iv, dte_sessions")
        .eq("symbol", s).eq("ts", (top as any).ts).order("leg");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

/** Daily context: latest settled ambient row + latest gated WCB. */
export function useDailyContext(s: Symbol) {
  return useQuery({
    queryKey: ["board", "ctx", s], staleTime: 5 * 60_000, refetchInterval: POLL,
    queryFn: async () => {
      const { data: env } = await supabase.from("market_environment_snapshots")
        .select("as_of_date, ambient_regime, lens_alignment").eq("symbol", s)
        .order("as_of_date", { ascending: false }).limit(1).maybeSingle();
      const { data: wcb } = await applyGate(supabase.from("weighted_constituent_breadth_snapshots")
        .select("ts, wcb_score, wcb_regime, weighted_advances_pct, weighted_declines_pct").eq("index_symbol", s), (await getGate()).end)
        .order("ts", { ascending: false }).limit(1).maybeSingle();
      return { env: env as any, wcb: wcb as any };
    },
  });
}

/** Every strike of the latest gated γ run (gex_strike_snapshots). */
export function useLadderStrikes(s: Symbol) {
  return useQuery({
    queryKey: ["board", "ladder", s], ...opts,
    queryFn: async () => {
      const { data: top, error: e1 } = await applyGate(supabase.from("gex_strike_snapshots").select("run_id, ts, spot")
        .eq("symbol", s), (await getGate()).end).order("ts", { ascending: false }).limit(1).maybeSingle();
      if (e1) throw e1;
      if (!top) return null;
      const { data, error } = await supabase.from("gex_strike_snapshots")
        .select("strike, expiry_date, gex_cr, gamma_call, gamma_put, oi_call, oi_put")
        .eq("run_id", (top as any).run_id).order("strike", { ascending: true }).limit(1000);
      if (error) throw error;
      const current = (data ?? []) as any[];
      const rows = current.map((r) => {
        const has = r.gamma_call != null || r.gamma_put != null;
        return {
          strike: Number(r.strike), gex: has && r.gex_cr != null ? Number(r.gex_cr) : null,
          oiCall: r.oi_call != null ? Number(r.oi_call) : null,
          oiPut: r.oi_put != null ? Number(r.oi_put) : null,
        };
      });
      const expiry = (current[0]?.expiry_date as string | undefined) ?? null;
      return { runId: (top as any).run_id as string, ts: (top as any).ts as string, expiry, rows };
    },
  });
}

/** L13: OI rotation since the 09:15 anchor (chain clock). SENSEX not fetched. */
export function useOiRotation(s: Symbol) {
  return useQuery({
    queryKey: ["board", "rotation", s], ...opts, enabled: s !== "SENSEX",
    queryFn: async () => {
      const { data, error } = await supabase.from("v_oi_rotation_since_open")
        .select("symbol, expiry_date, dte, anchor_ts, latest_ts, strike, ce_oi_anchor_qty, ce_oi_latest_qty, ce_oi_delta_qty, ce_presence, pe_oi_anchor_qty, pe_oi_latest_qty, pe_oi_delta_qty, pe_presence, snapshot_age_min, stale_floor_min_used, is_fresh")
        .eq("symbol", s).order("strike", { ascending: true }).limit(1000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}


/** Max-pain candidate valley at the exact γ-clock run used by the ladder. */
export function useMaxPainRun(s: Symbol, runId: string | null) {
  return useQuery({
    queryKey: ["board", "maxpain-run", s, runId], ...opts, enabled: !!runId,
    queryFn: async () => {
      const { data, error } = await supabase.from("v_gex_max_pain")
        .select("candidate_strike, total_pain, max_pain_strike, max_pain_value, expiry_date, ts")
        .eq("symbol", s).eq("run_id", runId as string).order("candidate_strike", { ascending: true }).limit(1000);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        strike: Number(r.candidate_strike), pain: Number(r.total_pain),
        maxPain: Number(r.max_pain_strike), minPain: Number(r.max_pain_value),
      }));
    },
  });
}

export function usePinBand(s: Symbol) {
  return useQuery({ queryKey: ["board", "pinband", s], ...opts, queryFn: latestBySymbol("v_gex_strike_pin_zone", s) });
}

/** Phase 1c Gamma: concentration (γ clock, gated). */
export const useConcentration = (s: Symbol) =>
  useQuery({ queryKey: ["board", "conc", s], ...opts, queryFn: latestBySymbol("v_gex_concentration", s) });

/** Net Γ per run for the current trading session (deduped by ts). */
export function useNetGammaToday(s: Symbol, session: string | null) {
  return useQuery({
    queryKey: ["board", "netToday", s, session], ...opts, enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("gamma_metrics").select("ts, net_gex")
        .eq("symbol", s).gte("ts", istAt(session!, "00:00")).lt("ts", istAt(nextDay(session!), "00:00"))
        .order("ts", { ascending: true }).limit(1000);
      if (error) throw error;
      const seen = new Set<string>();
      return ((data ?? []) as any[]).filter((r) => r.net_gex != null && !seen.has(r.ts) && seen.add(r.ts))
        .map((r) => ({ ts: r.ts as string, v: Number(r.net_gex) }));
    },
  });
}

export type RiverDay = { date: string; net: number; lo: number; hi: number; complete: boolean; spot: number | null; dte: number | null; gapBefore: boolean };
/** Settled daily net-γ river. Not intraday-gated; drops any session the calendar says is not open. */
export function useGammaRiver(s: Symbol) {
  return useQuery({
    queryKey: ["board", "river", s], staleTime: 5 * 60_000, refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const gate = await getGate();
      const { data, error } = await supabase.from("v_gex_net_gamma_river")
        .select("session_date, net_gex_cr, session_min_net_gex_cr, session_max_net_gex_cr, session_complete, spot, dte")
        .eq("symbol", s).order("session_date", { ascending: true }).limit(2000);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const dates = rows.map((r) => r.session_date as string);
      let open = new Set<string>(dates);
      if (dates.length) {
        const { data: cal } = await supabase.from("trading_calendar").select("trade_date")
          .eq("is_open", true).gte("trade_date", dates[0]).lte("trade_date", dates[dates.length - 1]).limit(5000);
        if (cal?.length) open = new Set((cal as any[]).map((c) => c.trade_date));
      }
      const openSorted = [...open].sort();
      const kept = rows.filter((r) => open.has(r.session_date) && (!gate.session || r.session_date <= gate.session));
      return kept.map((r, i): RiverDay => ({
        gapBefore: i > 0 && openSorted.some((d) => d > kept[i - 1].session_date && d < r.session_date),
        date: r.session_date, net: Number(r.net_gex_cr), lo: Number(r.session_min_net_gex_cr), hi: Number(r.session_max_net_gex_cr),
        complete: r.session_complete !== false, spot: r.spot != null ? Number(r.spot) : null, dte: r.dte != null ? Number(r.dte) : null,
      }));
    },
  });
}

/** Phase 1e IV tab: L9 term structure + L10 surface at one chain-clock ts.
 *  Gated to the last trading session; if the gate excludes every row, returns the
 *  newest (non-session) snapshot flagged awaiting so the UI can label it as not live. */
export function useIvTab(s: Symbol) {
  return useQuery({
    queryKey: ["board", "ivtab", s], ...opts,
    queryFn: async () => {
      const gate = await getGate();
      const pick = async (gated: boolean) => {
        let q: any = supabase.from("v_iv_term_structure").select("ts").eq("symbol", s);
        if (gated) q = applyGate(q, gate.end);
        const { data } = await q.order("ts", { ascending: false }).limit(1).maybeSingle();
        return ((data as any)?.ts as string) ?? null;
      };
      let ts = await pick(true);
      let awaiting = false;
      if (!ts) { ts = await pick(false); awaiting = !!ts; }
      if (!ts) return null;
      const [term, surf] = await Promise.all([
        supabase.from("v_iv_term_structure").select("leg, expiry_date, dte, t_years, atm_strike, ce_iv, pe_iv, atm_iv, parity_gap, spread_vs_front, fwd_vol_from_prev, is_back, term_slope, front_is_0dte")
          .eq("symbol", s).eq("ts", ts).order("leg"),
        supabase.from("v_iv_surface").select("leg, expiry_date, dte, spot, strike, moneyness_pct, side_used, ce_iv, pe_iv, iv, parity_gap, oi_otm, iv_over_atm, quote_state, leg_atm_strike, leg_atm_iv, leg_k98, leg_skew_98, leg_status")
          .eq("symbol", s).eq("ts", ts).order("leg").order("strike").limit(2000),
      ]);
      if (term.error) throw term.error;
      if (surf.error) throw surf.error;
      return { ts, awaiting, next: gate.next, term: (term.data ?? []) as any[], surface: (surf.data ?? []) as any[] };
    },
  });
}

// ---------- S92: Pin tab (L12) and Flows tab (L7/L8) ----------

/** Pin history for the latest OPEN session, front leg (v_pin_board, ruling S92-D).
 *  The view already returns one session; the caller compares session_date_ist with the
 *  trading-calendar session before calling it "today". Rows ascending by ts. */
export function usePinBoard(s: Symbol) {
  return useQuery({
    queryKey: ["board", "pinboard", s], ...opts,
    queryFn: async () => {
      const { data, error } = await supabase.from("v_pin_board")
        .select("symbol, expiry_date, session_date_ist, ts, is_latest, dte, spot, pin_leader_strike, gamma_at_pin, runnerup_share_ratio, top5_share, top5_share_n_ranks, conc_top1_share, conc_hhi, max_pain_strike, pin_state, pin_state_reason, held_for_cycles, conviction, conviction_reason, is_fresh, reconciled_at")
        .eq("symbol", s).order("ts", { ascending: true }).limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

/** Every ranked strike of the latest gated γ run (v_gex_strike_rank, ENH-125). */
export function useStrikeRankAll(s: Symbol) {
  return useQuery({
    queryKey: ["board", "rankall", s], ...opts,
    queryFn: async () => {
      const { data: top, error: e1 } = await applyGate(supabase.from("v_gex_strike_rank").select("run_id")
        .eq("symbol", s), (await getGate()).end).order("ts", { ascending: false }).limit(1).maybeSingle();
      if (e1) throw e1;
      if (!top) return [];
      const { data, error } = await supabase.from("v_gex_strike_rank")
        .select("strike, strike_rank, share_of_abs, cum_share_of_abs, gex_cr, side, ts")
        .eq("symbol", s).eq("run_id", (top as any).run_id).order("strike_rank").limit(1000);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        strike: Number(r.strike), rank: Number(r.strike_rank), share: Number(r.share_of_abs),
        cum: r.cum_share_of_abs != null ? Number(r.cum_share_of_abs) : null,
        gex: Number(r.gex_cr), side: r.side as string | null, ts: r.ts as string,
      }));
    },
  });
}

/** L7/L8 net roll-up, every expiry leg at the latest gated chain ts (v_gex_greeks_l2_net). */
export function useGreeksNet(s: Symbol) {
  return useQuery({
    queryKey: ["board", "l78net", s], ...opts,
    queryFn: async () => {
      const gate = await getGate();
      const { data: top, error: e1 } = await applyGate(supabase.from("v_gex_greeks_l2_net").select("ts")
        .eq("symbol", s), gate.end).order("ts", { ascending: false }).limit(1).maybeSingle();
      if (e1) throw e1;
      if (!top) return (await awaitingOrNull("v_gex_greeks_l2_net", s, gate.end)) ? AWAIT as any : [];
      const { data, error } = await supabase.from("v_gex_greeks_l2_net").select("*")
        .eq("symbol", s).eq("ts", (top as any).ts).order("expiry_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

/** L7/L8 per-strike rows for one leg at one chain ts (v_gex_greeks_l2_strike). */
export function useGreeksStrike(s: Symbol, ts: string | null, expiry: string | null) {
  return useQuery({
    queryKey: ["board", "l78strike", s, ts, expiry], ...opts, enabled: !!ts && !!expiry,
    queryFn: async () => {
      const { data, error } = await supabase.from("v_gex_greeks_l2_strike")
        .select("strike, n_legs, delta_drift_iv_cr_per_volpt, delta_drift_time_cr_per_day, gex_drift_iv_cr_per_volpt, gex_drift_time_cr_per_day, status")
        .eq("symbol", s).eq("ts", ts as string).eq("expiry_date", expiry as string)
        .not("strike", "is", null).order("strike", { ascending: true }).limit(1000);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        strike: Number(r.strike), nLegs: r.n_legs != null ? Number(r.n_legs) : null,
        d_div: r.delta_drift_iv_cr_per_volpt != null ? Number(r.delta_drift_iv_cr_per_volpt) : null,
        d_dt: r.delta_drift_time_cr_per_day != null ? Number(r.delta_drift_time_cr_per_day) : null,
        g_div: r.gex_drift_iv_cr_per_volpt != null ? Number(r.gex_drift_iv_cr_per_volpt) : null,
        g_dt: r.gex_drift_time_cr_per_day != null ? Number(r.gex_drift_time_cr_per_day) : null,
      }));
    },
  });
}

/** P6 / ENH-140: DEX standing book, front leg, settled run. Session decided by the view. */
export function useDexBook(s: Symbol) {
  return useQuery({
    queryKey: ["board", "dex", s], ...opts,
    queryFn: async () => {
      const { data, error } = await supabase.from("v_dex_standing_book")
        .select("symbol, session_date, leg_n, expiry_date, dte, settled_ts, strike, call_dex_cr, put_dex_cr, net_dex_cr, leg_call_dex_cr, leg_put_dex_cr, leg_net_dex_cr, leg_oi_qty, leg_gap_oi_qty, leg_n_gap_strikes")
        .eq("symbol", s).eq("leg_n", 1).order("strike", { ascending: true }).limit(1000);
      if (error) throw error;
      const nz = (v: any) => (v == null ? null : Number(v));
      return ((data ?? []) as any[]).map((r) => ({
        strike: Number(r.strike), expiry: r.expiry_date as string, dte: Number(r.dte), settledTs: r.settled_ts as string,
        call: nz(r.call_dex_cr), put: nz(r.put_dex_cr), net: nz(r.net_dex_cr),
        legCall: nz(r.leg_call_dex_cr), legPut: nz(r.leg_put_dex_cr), legNet: nz(r.leg_net_dex_cr),
        legOi: nz(r.leg_oi_qty), legGap: nz(r.leg_gap_oi_qty),
      }));
    },
  });
}
