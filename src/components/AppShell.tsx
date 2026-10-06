import { useEffect, useState } from "react";
import { NavLink, Outlet, Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { onlineManager } from "@tanstack/react-query";
import { useSymbol } from "@/contexts/SymbolContext";
import { useRefetchMarketview } from "@/lib/queries";
import type { Symbol as MSymbol } from "@/lib/queries";
import { useIvFront, useWalls, useSessions, istToday } from "@/lib/board";

const primary = [
  { to: "/home", label: "Home" },
  { to: "/board", label: "Board" },
  { to: "/context", label: "Context" },
  { to: "/structure", label: "Structure" },
];
const ops = [
  { to: "/health", label: "Health" },
  { to: "/settings", label: "Settings" },
];
const symbols: MSymbol[] = ["NIFTY", "SENSEX"];
const STALE_MIN = 10;

function SymbolToggle() {
  const { symbol, setSymbol } = useSymbol();
  return (
    <div className="flex rounded-md p-0.5" style={{ background: "var(--strip)", border: "1px solid var(--line-2)" }}>
      {symbols.map((s) => {
        const on = symbol === s;
        return (
          <button key={s} onClick={() => setSymbol(s)} aria-pressed={on}
            className="rounded px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em]"
            style={{ background: on ? "var(--s2)" : "transparent", color: on ? "var(--ink-1)" : "var(--ink-3)" }}>
            {s}
          </button>
        );
      })}
    </div>
  );
}

const navCls = (ops = false) => ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap ${isActive ? "bg-[var(--s2)] text-[var(--ink-1)]" : ops ? "text-[var(--ink-3)] hover:text-[var(--ink-2)]" : "text-[var(--ink-2)] hover:text-[var(--ink-1)]"}`;

function StaleStrip() {
  const { symbol } = useSymbol();
  const chain = useIvFront(symbol);
  const walls = useWalls(symbol);
  const sess = useSessions();
  const [, setT] = useState(0);
  useEffect(() => { const id = setInterval(() => setT((t) => t + 1), 30_000); return () => clearInterval(id); }, []);
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const inSession = sess.data?.session === istToday() && mins >= 9 * 60 + 25 && mins <= 15 * 60 + 30;
  if (!inSession) return null;
  const age = (ts?: string) => (ts ? Math.floor((now.getTime() - new Date(ts).getTime()) / 60000) : null);
  const items = [
    { name: "chain data", a: age((chain.data as any)?.ts) },
    { name: "gamma run", a: age((walls.data as any)?.ts) },
  ].filter((x) => x.a != null && x.a > STALE_MIN);
  if (!items.length) return null;
  return (
    <div className="w-full px-4 py-1.5 text-[12px]" style={{ background: "var(--alert-bg)", color: "var(--alert-fg)" }}>
      {items.map((x) => `${x.name} ${x.a} min old`).join(" · ")} · <Link to="/health" className="underline-offset-2 hover:underline">Health ›</Link>
    </div>
  );
}

export default function AppShell() {
  const refetchAll = useRefetchMarketview();
  const [frozen, setFrozen] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    onlineManager.setOnline(!frozen);
    if (!frozen) refetchAll();
  }, [frozen, refetchAll]);

  useEffect(() => {
    const id = window.setInterval(() => { if (!frozen) refetchAll(); }, 60_000);
    return () => window.clearInterval(id);
  }, [refetchAll, frozen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space") { e.preventDefault(); setFrozen((f) => !f); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const Wordmark = (
    <Link to="/home" className="text-[15px] font-bold uppercase tracking-[0.18em]"
      style={{ fontFamily: "var(--font-plex-cond)", color: "var(--ink-1)" }}>MERIDIAN</Link>
  );
  const Frozen = frozen && (
    <button onClick={() => setFrozen(false)} title="Space to resume"
      className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]"
      style={{ border: "1px solid var(--sel)", color: "var(--sel)" }}>frozen</button>
  );

  return (
    <div className="flex min-h-screen w-full flex-col overflow-x-hidden" style={{ background: "var(--bg)", color: "var(--ink-1)" }}>
      <header className="sticky top-0 z-30 w-full border-b" style={{ background: "var(--bg)", borderColor: "var(--line)" }}>
        {/* ≥1024 */}
        <div className="hidden h-14 items-center gap-4 px-5 lg:flex">
          {Wordmark}
          <nav className="ml-4 flex items-center gap-1">
            {primary.map((n) => <NavLink key={n.to} to={n.to} className={navCls()}>{n.label}</NavLink>)}
            <span className="mx-2 h-5 w-px" style={{ background: "var(--line-2)" }} />
            {ops.map((n) => <NavLink key={n.to} to={n.to} className={navCls(true)}>{n.label}</NavLink>)}
          </nav>
          <div className="flex-1" />
          {Frozen}
          <SymbolToggle />
        </div>
        {/* <1024 */}
        <div className="flex h-[52px] items-center gap-3 px-3 lg:hidden">
          {Wordmark}
          <div className="flex-1" />
          {Frozen}
          <SymbolToggle />
          <button aria-label="Menu" onClick={() => setMenu(true)}
            className="flex h-11 w-11 items-center justify-center rounded-md" style={{ color: "var(--ink-2)" }}>
            <Menu size={20} />
          </button>
        </div>
      </header>
      <StaleStrip />

      {menu && (
        <div className="fixed inset-0 z-40 lg:hidden" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setMenu(false)}>
          <div className="absolute inset-x-0 top-0 border-b p-3" style={{ background: "var(--s1)", borderColor: "var(--line)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              {Wordmark}
              <button aria-label="Close" onClick={() => setMenu(false)} className="flex h-11 w-11 items-center justify-center" style={{ color: "var(--ink-2)" }}><X size={20} /></button>
            </div>
            {[...primary, ...ops].map((n, i) => (
              <NavLink key={n.to} to={n.to} onClick={() => setMenu(false)}
                className={({ isActive }) => `block rounded-md px-3 py-3 text-[15px] ${i === primary.length ? "mt-2 border-t pt-4" : ""} ${isActive ? "bg-[var(--s2)] text-[var(--ink-1)]" : i >= primary.length ? "text-[var(--ink-3)]" : "text-[var(--ink-2)]"}`}
                style={{ borderColor: "var(--line)" }}>
                {n.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}

      <main className="relative min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
