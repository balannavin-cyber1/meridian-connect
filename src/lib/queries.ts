import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

export type Symbol = "NIFTY" | "SENSEX";

const MV_STALE = 30_000;
const SETTINGS_STALE = 5 * 60_000;

// ---------- Marketview ----------

export function useSpotMarker(symbol: Symbol) {
  return useQuery({
    queryKey: ["spotMarker", symbol],
    staleTime: MV_STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_spot_session_markers")
        .select("*")
        .eq("symbol", symbol)
        .order("trade_date_ist", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useGammaLatest(symbol: Symbol) {
  return useQuery({
    queryKey: ["gammaLatest", symbol],
    staleTime: MV_STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gamma_metrics")
        .select("*")
        .eq("symbol", symbol)
        .order("ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useGammaSeries(symbol: Symbol, limit = 60) {
  return useQuery({
    queryKey: ["gammaSeries", symbol, limit],
    staleTime: MV_STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gamma_metrics")
        .select("ts, spot, straddle_atm")
        .eq("symbol", symbol)
        .order("ts", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).slice().reverse();
    },
  });
}

export function useLatestSignal(symbol: Symbol) {
  return useQuery({
    queryKey: ["signalLatest", symbol],
    staleTime: MV_STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signal_snapshots")
        .select("*")
        .eq("symbol", symbol)
        .neq("entry_quality", "SKIP")
        .neq("entry_quality", "NO_TRADE")
        .order("ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useTodaysSignals(symbol: Symbol) {
  return useQuery({
    queryKey: ["signalsToday", symbol],
    staleTime: MV_STALE,
    queryFn: async () => {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("signal_snapshots")
        .select("ts, action, atm_strike, spot, entry_quality, trade_allowed")
        .eq("symbol", symbol)
        .gte("ts", since.toISOString())
        .order("ts", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useGexStrikes(symbol: Symbol, expiry: string | null | undefined) {
  return useQuery({
    queryKey: ["gexStrikes", symbol, expiry],
    staleTime: MV_STALE,
    queryFn: async () => {
      // Find the latest run for this symbol — try expiry filter first, then fall back to symbol-only.
      let latest: { run_id: string } | null = null;
      if (expiry) {
        const { data } = await supabase
          .from("gex_strike_snapshots")
          .select("run_id, ts")
          .eq("symbol", symbol)
          .eq("expiry_date", expiry)
          .order("ts", { ascending: false })
          .limit(1)
          .maybeSingle();
        latest = (data as any) ?? null;
      }
      if (!latest) {
        const { data } = await supabase
          .from("gex_strike_snapshots")
          .select("run_id, ts")
          .eq("symbol", symbol)
          .order("ts", { ascending: false })
          .limit(1)
          .maybeSingle();
        latest = (data as any) ?? null;
      }
      if (!latest) return [];
      const { data, error } = await supabase
        .from("gex_strike_snapshots")
        .select("strike, gex_cr, oi_call, oi_put, spot")
        .eq("run_id", latest.run_id)
        .order("strike", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePinZone(symbol: Symbol, expiry: string | null | undefined) {
  return useQuery({
    queryKey: ["pinZone", symbol, expiry],
    enabled: !!expiry,
    staleTime: MV_STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_gex_strike_pin_zone")
        .select("*")
        .eq("symbol", symbol)
        .eq("expiry_date", expiry!)
        .order("ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useAccelZone(symbol: Symbol, expiry: string | null | undefined) {
  return useQuery({
    queryKey: ["accelZone", symbol, expiry],
    enabled: !!expiry,
    staleTime: MV_STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_gex_strike_accel_zone")
        .select("*")
        .eq("symbol", symbol)
        .eq("expiry_date", expiry!)
        .order("ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useIctZones(symbol: Symbol) {
  return useQuery({
    queryKey: ["ictZones", symbol],
    staleTime: MV_STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ict_zones")
        .select("*")
        .eq("symbol", symbol)
        .order("detected_at_ts", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDealerFlow(symbol: Symbol, expiry: string | null | undefined) {
  return useQuery({
    queryKey: ["dealerFlow", symbol, expiry],
    enabled: !!expiry,
    staleTime: MV_STALE,
    queryFn: async () => {
      const { data: latest } = await supabase
        .from("v_dealer_flow_sim")
        .select("run_id, ts")
        .eq("symbol", symbol)
        .eq("expiry_date", expiry!)
        .order("ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) return [];
      const { data, error } = await supabase
        .from("v_dealer_flow_sim")
        .select("*")
        .eq("run_id", latest.run_id)
        .order("spot_pct", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRefetchMarketview() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey[0];
        return [
          "spotMarker",
          "gammaLatest",
          "gammaSeries",
          "signalLatest",
          "signalsToday",
          "gexStrikes",
          "pinZone",
          "accelZone",
          "ictZones",
          "dealerFlow",
        ].includes(k as string);
      },
    });
  };
}

// ---------- Settings ----------

export type Parameter = {
  id: string;
  key: string;
  value_text: string | null;
  value_num: number | null;
  value_bool: boolean | null;
  value_jsonb: any;
  value_type: "numeric" | "text" | "boolean" | "jsonb";
  category: string;
  description: string | null;
  min_value: number | null;
  max_value: number | null;
  valid_from: string;
  valid_to: string | null;
  changed_by: string | null;
  change_reason: string | null;
};

export function useParameters() {
  return useQuery({
    queryKey: ["parameters"],
    staleTime: SETTINGS_STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merdian_parameters")
        .select("*")
        .is("valid_to", null)
        .order("category", { ascending: true })
        .order("key", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Parameter[];
    },
  });
}

export function useParameterAudit() {
  return useQuery({
    queryKey: ["parameterAudit"],
    staleTime: SETTINGS_STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_merdian_parameter_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export async function updateParameter(
  key: string,
  changeReason: string,
  value: number | string | boolean,
  valueType: Parameter["value_type"],
) {
  const args: Record<string, any> = {
    p_key: key,
    p_change_reason: changeReason,
  };
  if (valueType === "numeric") args.p_value_num = Number(value);
  else if (valueType === "boolean") args.p_value_bool = Boolean(value);
  else args.p_value_text = String(value);
  const { data, error } = await supabase.rpc("update_parameter", args);
  if (error) throw error;
  return data;
}
