import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Banknote,
  HeartPulse,
  Settings as SettingsIcon,
  NotebookText,
  LogOut,
} from "lucide-react";

const items = [
  { to: "/marketview", label: "Market", icon: LayoutDashboard },
  { to: "/order", label: "Order", icon: Banknote },
  { to: "/health", label: "Health", icon: HeartPulse },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
  { to: "/journal", label: "Journal", icon: NotebookText },
];

export default function AppShell() {
  const nav = useNavigate();
  return (
    <div className="flex h-screen w-full bg-bg-primary text-text-primary">
      <aside className="flex w-[76px] shrink-0 flex-col items-center border-r border-border-tertiary bg-bg-secondary py-3">
        <div
          className="mono mb-4 text-[10px] tracking-[0.3em] text-text-tertiary"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          MERDIAN
        </div>
        <nav className="flex flex-1 flex-col items-center gap-1">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) =>
                `flex w-[60px] flex-col items-center gap-1 rounded-md px-1 py-2 text-[9px] transition-colors ${
                  isActive
                    ? "bg-info-bg text-info-text"
                    : "text-text-tertiary hover:bg-bg-tertiary hover:text-text-secondary"
                }`
              }
            >
              <it.icon size={18} strokeWidth={1.5} />
              <span className="leading-none">{it.label}</span>
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => nav("/")}
          className="flex w-[60px] flex-col items-center gap-1 rounded-md px-1 py-2 text-[9px] text-text-tertiary hover:bg-bg-tertiary hover:text-text-secondary"
        >
          <LogOut size={18} strokeWidth={1.5} />
          <span className="leading-none">Logout</span>
        </button>
      </aside>
      <main className="relative flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
