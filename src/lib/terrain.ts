// 3D drill-downs: draws what v_gex_strike_terrain computes; computes nothing itself.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { Symbol } from "./queries";

export type TerrainRow = { strike: number; gex: number | null; oiCall: number | null; oiPut: number | null; pain: number | null; isMaxPain: boolean };
export type TerrainSession = {
  date: string; rank: number; complete: boolean; ts: string; spot: number | null; expiry: string | null; dte: number | null;
  maxPainStrike: number | null; rows: TerrainRow[];
};

const nn = (v: any) => (v == null ? null : Number(v));

/** One slice per session from v_gex_strike_terrain (strike axis chosen by the view), oldest first. */
export function useStrikeHistory(s: Symbol) {
  return useQuery({
    queryKey: ["terrain", "view", s],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TerrainSession[]> => {
      const all: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("v_gex_strike_terrain")
          .select("symbol, session_date, session_rank, session_complete, run_id, ts, spot, expiry_date, dte, strike, gex_cr, oi_call, oi_put, writer_pain, max_pain_strike, is_max_pain")
          .eq("symbol", s).order("session_date", { ascending: true }).order("strike", { ascending: true })
          .range(from, from + 999);
        if (error) throw error;
        const page = (data ?? []) as any[];
        all.push(...page);
        if (page.length < 1000) break;
      }
      const by = new Map<string, TerrainSession>();
      for (const r of all) {
        let ses = by.get(r.session_date);
        if (!ses) {
          ses = { date: r.session_date, rank: Number(r.session_rank), complete: r.session_complete !== false, ts: r.ts,
            spot: nn(r.spot), expiry: r.expiry_date ?? null, dte: nn(r.dte), maxPainStrike: nn(r.max_pain_strike), rows: [] };
          by.set(r.session_date, ses);
        }
        ses.rows.push({ strike: Number(r.strike), gex: nn(r.gex_cr), oiCall: nn(r.oi_call), oiPut: nn(r.oi_put), pain: nn(r.writer_pain), isMaxPain: r.is_max_pain === true });
      }
      return [...by.values()];
    },
  });
}
