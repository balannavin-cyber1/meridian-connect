// 3D drill-downs: per-strike history across trading sessions. Browser-side reads only.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { Symbol } from "./queries";
import { getGate, istAt } from "./board";

export type TerrainSession = {
  date: string; ts: string; spot: number | null; expiry: string | null; dte: number | null;
  rows: { strike: number; gex: number | null; oiCall: number | null; oiPut: number | null }[];
};

const dayMs = 86400_000;
const plusDay = (d: string) => new Date(new Date(d + "T00:00:00Z").getTime() + dayMs).toISOString().slice(0, 10);

/** Settled γ run (last run ≤ 15:30 IST) for each of the last N trading sessions. Gated by trading_calendar. */
export function useStrikeHistory(s: Symbol, n = 14) {
  return useQuery({
    queryKey: ["terrain", "history", s, n],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TerrainSession[]> => {
      const g = await getGate();
      if (!g.session) return [];
      const { data: cal, error } = await supabase.from("trading_calendar").select("trade_date")
        .eq("is_open", true).lte("trade_date", g.session).order("trade_date", { ascending: false }).limit(n);
      if (error) throw error;
      const dates = ((cal ?? []) as any[]).map((r) => r.trade_date as string).reverse();
      const out = await Promise.all(dates.map(async (date) => {
        const { data: top } = await supabase.from("gex_strike_snapshots").select("run_id, ts, spot, expiry_date")
          .eq("symbol", s).gte("ts", istAt(date, "09:00")).lte("ts", istAt(date, "15:30"))
          .order("ts", { ascending: false }).limit(1).maybeSingle();
        if (!top) return null;
        const { data: rows } = await supabase.from("gex_strike_snapshots")
          .select("strike, gex_cr, gamma_call, gamma_put, oi_call, oi_put")
          .eq("run_id", (top as any).run_id).order("strike", { ascending: true }).limit(1000);
        const exp = (top as any).expiry_date as string | null;
        return {
          date, ts: (top as any).ts, spot: (top as any).spot != null ? Number((top as any).spot) : null, expiry: exp,
          dte: exp ? Math.round((new Date(exp + "T00:00:00Z").getTime() - new Date(date + "T00:00:00Z").getTime()) / dayMs) : null,
          rows: ((rows ?? []) as any[]).map((r) => ({
            strike: Number(r.strike),
            gex: (r.gamma_call != null || r.gamma_put != null) && r.gex_cr != null ? Number(r.gex_cr) : null,
            oiCall: r.oi_call != null ? Number(r.oi_call) : null,
            oiPut: r.oi_put != null ? Number(r.oi_put) : null,
          })),
        } as TerrainSession;
      }));
      void plusDay;
      return out.filter(Boolean) as TerrainSession[];
    },
  });
}
