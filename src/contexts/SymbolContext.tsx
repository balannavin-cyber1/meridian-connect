import { createContext, useContext, useEffect, useState } from "react";
import type { Symbol as MSymbol } from "@/lib/queries";

type Ctx = { symbol: MSymbol; setSymbol: (s: MSymbol) => void };
const SymbolCtx = createContext<Ctx | null>(null);

const KEY = "mv:symbol";

export function SymbolProvider({ children }: { children: React.ReactNode }) {
  const [symbol, setSymbolState] = useState<MSymbol>(() => {
    if (typeof window === "undefined") return "NIFTY";
    const v = window.localStorage.getItem(KEY);
    return v === "SENSEX" ? "SENSEX" : "NIFTY";
  });
  const setSymbol = (s: MSymbol) => {
    setSymbolState(s);
    try { window.localStorage.setItem(KEY, s); } catch {}
  };
  // Keyboard shortcuts N/S — global
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "n" || e.key === "N") setSymbol("NIFTY");
      else if (e.key === "s" || e.key === "S") setSymbol("SENSEX");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return <SymbolCtx.Provider value={{ symbol, setSymbol }}>{children}</SymbolCtx.Provider>;
}

export function useSymbol(): Ctx {
  const c = useContext(SymbolCtx);
  if (!c) throw new Error("useSymbol must be used within SymbolProvider");
  return c;
}
