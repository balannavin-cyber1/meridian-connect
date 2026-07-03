import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  Home, Grid3x3, Target, Activity, Layers, History, HeartPulse,
  Settings as SettingsIcon, NotebookText, Banknote, RefreshCw,
} from "lucide-react";
import { useSymbol } from "@/contexts/SymbolContext";
import { useRefetchMarketview } from "@/lib/queries";
import type { Symbol as MSymbol } from "@/lib/queries";

const sections = [
  { header: "Terminal", items: [
    { to: "/home", label: "Home", icon: Home },
    { to: "/positioning", label: "Positioning", icon: Grid3x3 },
    { to: "/max-pain", label: "Max Pain & OI", icon: Target },
    { to: "/breadth", label: "Breadth & Vol", icon: Activity },
    { to: "/structure", label: "Structure & ICT", icon: Layers },
    { to: "/expiry-memory", label: "Expiry Memory", icon: History },
  ] },
  { header: "Ops", items: [
    { to: "/health", label: "Health", icon: HeartPulse },
    { to: "/order", label: "Order", icon: Banknote },
    { to: "/journal", label: "Journal", icon: NotebookText },
    { to: "/settings", label: "Calibration", icon: SettingsIcon },
  ] },
];

const REFRESH_MS = 60_000;

export default function AppShell() {
  const { symbol, setSymbol } = useSymbol();
  const refetchAll = useRefetchMarketview();
  const [lastRefresh, setLastRefresh] = useState<number>(() => Date.now());
  const [tick, setTick] = useState(0);

  // 60s auto-refresh
  useEffect(() => {
    const id = window.setInterval(() => {
      refetchAll();
      setLastRefresh(Date.now());
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refetchAll]);

  // 1s clock for ticker
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  // R = manual refresh
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "r" || e.key === "R") {
        refetchAll();
        setLastRefresh(Date.now());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refetchAll]);

  const secondsAgo = Math.max(0, Math.floor((Date.now() - lastRefresh) / 1000));
  void tick;
  const dotColor = secondsAgo < 30 ? "var(--mv-green)" : secondsAgo < 90 ? "var(--mv-amber)" : "var(--mv-red)";

  const symbols: MSymbol[] = ["NIFTY", "SENSEX"];

  return (
    <div className="flex h-screen w-full" style={{ background: "var(--mv-bg)", color: "var(--mv-text-strong)" }}>
      <aside
        className="flex w-[212px] shrink-0 flex-col border-r"
        style={{ background: "var(--mv-card-bg)", borderColor: "var(--mv-border)" }}
      >
        {/* Brand */}
        <div className="px-4 pb-2 pt-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.3em]" style={{ color: "var(--mv-text-weak)" }}>MERDIAN</div>
          <div className="mt-0.5 text-[13px] font-semibold" style={{ color: "var(--mv-text-strong)" }}>Terminal</div>
        </div>

        {/* Symbol toggle */}
        <div className="px-3 pt-3">
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.15em]" style={{ color: "var(--mv-text-weak)" }}>Symbol</div>
          <div className="flex rounded-md p-0.5" style={{ background: "var(--mv-bg)", border: "1px solid var(--mv-border)" }}>
            {symbols.map((s) => {
              const active = symbol === s;
              return (
                <button
                  key={s}
                  onClick={() => setSymbol(s)}
                  className="flex-1 rounded px-2 py-1 text-[11px] font-semibold tracking-wide transition-colors"
                  style={{
                    background: active ? "var(--mv-text-strong)" : "transparent",
                    color: active ? "white" : "var(--mv-text-mid)",
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>
          <div className="mt-1 text-[9px]" style={{ color: "var(--mv-text-vweak)", fontFamily: "var(--mv-font-mono)" }}>N / S to switch</div>
        </div>

        {/* Nav */}
        <nav className="mt-3 flex-1 overflow-y-auto px-2 pb-3">
          {sections.map((sec) => (
            <div key={sec.header} className="mt-2">
              <div className="px-2 pb-1 pt-1.5 text-[9px] font-semibold uppercase tracking-[0.15em]" style={{ color: "var(--mv-text-weak)" }}>
                {sec.header}
              </div>
              <div className="space-y-0.5">
                {sec.items.map((it) => (
                  <NavLink
                    key={it.to}
                    to={it.to}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors ${
                        isActive
                          ? "bg-[var(--mv-blue-bg)] text-[var(--mv-blue)] font-semibold"
                          : "text-[var(--mv-text-mid)] hover:bg-[var(--mv-bg)] hover:text-[var(--mv-text-strong)]"
                      }`
                    }
                  >
                    <it.icon size={14} strokeWidth={1.6} />
                    <span className="leading-none">{it.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Auto-refresh ticker */}
        <div className="border-t px-3 py-2.5" style={{ borderColor: "var(--mv-border)" }}>
          <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--mv-text-mid)", fontFamily: "var(--mv-font-mono)" }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />
            <span>updated {secondsAgo}s ago</span>
          </div>
          <button
            onClick={() => { refetchAll(); setLastRefresh(Date.now()); }}
            className="mt-1.5 flex w-full items-center justify-center gap-1 rounded border px-2 py-1 text-[10px] font-semibold tracking-wide transition-colors hover:bg-[var(--mv-bg)]"
            style={{ borderColor: "var(--mv-border)", color: "var(--mv-text-mid)" }}
            title="Refresh (R)"
          >
            <RefreshCw size={11} />
            refresh · R
          </button>
          <div className="mt-1 text-[9px]" style={{ color: "var(--mv-text-vweak)", fontFamily: "var(--mv-font-mono)" }}>auto every 60s</div>
        </div>
      </aside>

      <main className="relative flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
