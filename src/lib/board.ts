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
        .select("strike, gex_cr, gamma_call, gamma_put, oi_call, oi_put")
        .eq("run_id", (top as any).run_id).order("strike", { ascending: true }).limit(1000);
      if (error) throw error;
      const rows = ((data ?? []) as any[]).map((r) => {
        const has = r.gamma_call != null || r.gamma_put != null;
        return { strike: Number(r.strike), gex: has && r.gex_cr != null ? Number(r.gex_cr) : null };
      });
      return { ts: (top as any).ts as string, rows };
    },
  });
}

export function usePinBand(s: Symbol) {
  return useQuery({ queryKey: ["board", "pinband", s], ...opts, queryFn: latestBySymbol("v_gex_strike_pin_zone", s) });
}
