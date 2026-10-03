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
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trading_calendar").select("trade_date")
        .eq("is_open", true).lte("trade_date", istToday())
        .order("trade_date", { ascending: false }).limit(2);
      if (error) throw error;
      return { session: (data?.[0]?.trade_date as string) ?? null, prev: (data?.[1]?.trade_date as string) ?? null };
    },
  });
}

const latestBySymbol = (view: string, symbol: Symbol, extra?: (q: any) => any) =>
  async () => {
    let q: any = supabase.from(view).select("*").eq("symbol", symbol);
    if (extra) q = extra(q);
    const { data, error } = await q.order("ts", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data as any;
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
      const { data: top, error: e1 } = await supabase.from("v_gex_strike_rank").select("run_id")
        .eq("symbol", s).order("ts", { ascending: false }).limit(1).maybeSingle();
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
      const { data: top, error: e1 } = await supabase.from("gex_strike_snapshots").select("run_id, spot, ts")
        .eq("symbol", s).order("ts", { ascending: false }).limit(1).maybeSingle();
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
        .eq("symbol", s).gte("ts", istAt(session!, "00:00")).order("ts", { ascending: true }).limit(1000);
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
