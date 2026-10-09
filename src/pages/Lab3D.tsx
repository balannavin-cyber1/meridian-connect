// 3D drill-downs — reached from the Gamma river, IV smile and OI legend; never a default view.
// Rules: height carries magnitude only; hue carries sign only (cool/warm); positional data stays grey;
// unlit materials (no lighting-driven colour shifts); the 2D twin is one key away (Esc).
import { Suspense, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useSymbol } from "@/contexts/SymbolContext";
import { useStrikeHistory, type TerrainSession } from "@/lib/terrain";
import { useIvTab, istTime } from "@/lib/board";

type View = "gamma" | "iv" | "pain";
const VIEWS: { id: View; key: string; label: string; back: string }[] = [
  { id: "gamma", key: "1", label: "γ terrain", back: "/board" },
  { id: "iv", key: "2", label: "IV fence", back: "/board" },
  { id: "pain", key: "3", label: "Pain bowl", back: "/board" },
];

type Pal = Record<"bg" | "s2" | "line" | "axis" | "ink1" | "ink2" | "ink3" | "cool" | "warm", THREE.Color>;
function usePalette(): Pal | null {
  const [p, setP] = useState<Pal | null>(null);
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const c = (v: string, f: string) => new THREE.Color((cs.getPropertyValue(v).trim() || f));
    setP({ bg: c("--bg", "#0D0F12"), s2: c("--s2", "#1C2127"), line: c("--line-2", "#2A3038"), axis: c("--axis", "#2F363F"),
      ink1: c("--ink-1", "#ECEEF1"), ink2: c("--ink-2", "#A0A8B3"), ink3: c("--ink-3", "#7F8893"), cool: c("--cool", "#5DB4F5"), warm: c("--warm", "#FF8A4C") });
  }, []);
  return p;
}

const num = (v: number, d = 0) => v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const dShort = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
const W = 10, D = 7, H = 3; // scene extents: strike, session/leg, height

/** Grid → unlit vertex-coloured surface; quads with any missing corner are left as holes (never zero). */
function GridSurface({ z, colors, opacity = 0.62 }: { z: (number | null)[][]; colors: (THREE.Color | null)[][]; opacity?: number }) {
  const geo = useMemo(() => {
    const nx = z.length, ny = z[0]?.length ?? 0;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const x = nx > 1 ? -W / 2 + (i / (nx - 1)) * W : 0, y = ny > 1 ? -D / 2 + (j / (ny - 1)) * D : 0;
      pos.push(x, z[i][j] ?? 0, y);
      const c = colors[i][j]; col.push(c?.r ?? 0, c?.g ?? 0, c?.b ?? 0);
    }
    const at = (i: number, j: number) => i * ny + j;
    for (let i = 0; i < nx - 1; i++) for (let j = 0; j < ny - 1; j++) {
      if ([z[i][j], z[i + 1][j], z[i][j + 1], z[i + 1][j + 1]].some((v) => v == null)) continue;
      idx.push(at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  }, [z, colors]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial vertexColors side={THREE.DoubleSide} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

type Align = "center" | "left" | "right";
const useSmallLabel = () => {
  const [small, setSmall] = useState(() => typeof window !== "undefined" && window.innerWidth < 480);
  useEffect(() => {
    const f = () => setSmall(window.innerWidth < 480);
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return small;
};
/** Projected label anchor, clamped to a small margin inside the canvas so aligned text never spills off the edges. */
const clampPos = (obj: THREE.Object3D, camera: THREE.Camera, size: { width: number; height: number }): [number, number] => {
  const v = obj.getWorldPosition(new THREE.Vector3()).project(camera);
  const x = (v.x * 0.5 + 0.5) * size.width, y = (-v.y * 0.5 + 0.5) * size.height;
  return [Math.min(Math.max(x, 6), size.width - 6), Math.min(Math.max(y, 12), size.height - 16)];
};
const Tag = ({ p, children, c = "var(--ink-3)", strong, align = "center" }: { p: [number, number, number]; children: React.ReactNode; c?: string; strong?: boolean; align?: Align }) => {
  const small = useSmallLabel();
  // drei's Html keeps its DOM in a side root; under StrictMode the StrictMode double-invoke can
  // unmount that root mid-commit and leave the label empty. One extra commit re-renders every root.
  const [tick, bump] = useState(0);
  useEffect(() => { const t = setTimeout(() => bump((n) => n + 1), 60); return () => clearTimeout(t); }, []);
  return (
    <Html key={tick} position={p} center={align === "center"} calculatePosition={clampPos} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <span className="whitespace-nowrap font-[family-name:var(--font-plex)] tabular-nums"
        style={{ display: "inline-block", fontSize: small ? 8 : 10, color: c, fontWeight: strong ? 600 : 400, letterSpacing: ".04em",
          transform: align === "right" ? "translate(-100%, -50%)" : align === "left" ? "translate(0, -50%)" : undefined }}>{children}</span>
    </Html>
  );
};

function Floor({ pal, nx, labelsX, labelsY }: { pal: Pal; nx: number; labelsX: { i: number; t: string }[]; labelsY: { j: number; n: number; t: string; strong?: boolean }[] }) {
  const xi = (i: number) => (nx > 1 ? -W / 2 + (i / (nx - 1)) * W : 0);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]}>
        <planeGeometry args={[W + 0.6, D + 0.6]} />
        <meshBasicMaterial color={pal.bg} />
      </mesh>
      <Line points={[[-W / 2, 0, D / 2 + 0.3], [W / 2, 0, D / 2 + 0.3]]} color={pal.axis} lineWidth={1} />
      {labelsX.map((l) => <Tag key={l.i} p={[xi(l.i), 0, D / 2 + 0.75]} align={l.i <= 0 ? "left" : l.i >= nx - 1 ? "right" : "center"}>{l.t}</Tag>)}
      {labelsY.map((l) => <Tag key={l.j} p={[-W / 2 - 0.9, 0, l.n > 1 ? -D / 2 + (l.j / (l.n - 1)) * D : 0]} align="left" c={l.strong ? "var(--ink-1)" : undefined} strong={l.strong}>{l.t}</Tag>)}
    </group>
  );
}

// ---------- 1 · Gamma terrain ----------
function strikeAxis(hist: TerrainSession[]) {
  return [...new Set(hist.flatMap((s) => s.rows.map((r) => r.strike)))].sort((x, y) => x - y);
}
const xLabels = (ks: number[], every: number) => ks.map((k, i) => ({ i, k })).filter(({ i }) => i % every === 0).map(({ i, k }) => ({ i, t: num(k) }));

function GammaTerrain({ hist, pal, step }: { hist: TerrainSession[]; pal: Pal; step: number }) {
  const ks = useMemo(() => strikeAxis(hist), [hist, step]);
  const { z, colors, max } = useMemo(() => {
    let max = 0;
    const maps = hist.map((s) => new Map(s.rows.map((r) => [r.strike, r.gex])));
    for (const m of maps) for (const k of ks) { const v = m.get(k); if (v != null) max = Math.max(max, Math.abs(v)); }
    const z = ks.map((k) => maps.map((m) => { const v = m.get(k); return v == null ? null : (Math.abs(v) / (max || 1)) * H; }));
    const colors = ks.map((k) => maps.map((m) => {
      const v = m.get(k); if (v == null) return null;
      const t = 0.3 + 0.7 * Math.sqrt(Math.abs(v) / (max || 1));
      return pal.s2.clone().lerp(v >= 0 ? pal.cool : pal.warm, t);
    }));
    return { z, colors, max };
  }, [hist, ks, pal]);
  const ny = hist.length;
  const xOf = (k: number) => -W / 2 + ((k - ks[0]) / (ks[ks.length - 1] - ks[0] || 1)) * W;
  const yOf = (j: number) => (ny > 1 ? -D / 2 + (j / (ny - 1)) * D : 0);
  const spotPath = hist.map((s, j) => (s.spot != null ? [xOf(Math.min(Math.max(s.spot, ks[0]), ks[ks.length - 1])), 0.02, yOf(j)] : null)).filter(Boolean) as [number, number, number][];
  return (
    <group>
      <Floor pal={pal} nx={ks.length} labelsX={xLabels(ks, Math.ceil(ks.length / 6))}
        labelsY={hist.map((s, j) => ({ j, n: ny, t: `${dShort(s.date)}${s.dte === 0 ? " · 0" : ""}${s.complete ? "" : " · partial"}`, strong: j === ny - 1 })).filter((l) => l.j % 2 === (ny - 1) % 2)} />
      <GridSurface z={z} colors={colors} />
      {hist.map((_, j) => (
        <Line key={j} points={ks.map((k, i) => [xOf(k), z[i][j] ?? 0, yOf(j)] as [number, number, number])}
          color={j === ny - 1 ? pal.ink1 : pal.ink3} lineWidth={j === ny - 1 ? 1.6 : 0.6} transparent opacity={j === ny - 1 ? 0.95 : 0.45} />
      ))}
      {spotPath.length > 1 && <Line points={spotPath} color={pal.ink1} lineWidth={1.4} dashed dashSize={0.12} gapSize={0.08} />}
      {spotPath.map((p, j) => <mesh key={j} position={p}><sphereGeometry args={[0.05, 10, 10]} /><meshBasicMaterial color={pal.ink1} /></mesh>)}
      <Tag p={[W / 2 + 0.2, H + 0.2, -D / 2]} align="right">peak |γ| {num(max / 1e5, 1)}L · unit pending</Tag>
    </group>
  );
}

// ---------- 3 · Pain bowl ----------
function PainBowl({ hist, pal, step }: { hist: TerrainSession[]; pal: Pal; step: number }) {
  const ks = useMemo(() => strikeAxis(hist), [hist, step]);
  const { z, colors, mins } = useMemo(() => {
    const norm = hist.map((s) => {
      const m = new Map(s.rows.map((r) => [r.strike, r.pain]));
      const vals = ks.map((k) => m.get(k) ?? null);
      const pres = vals.filter((v): v is number => v != null);
      if (!pres.length) return null;
      const lo = Math.min(...pres), hi = Math.max(...pres);
      return vals.map((v) => (v == null ? null : (v - lo) / (hi - lo || 1)));
    });
    const z = ks.map((_, i) => norm.map((r) => (r && r[i] != null ? r[i]! * H : null)));
    const colors = ks.map((_, i) => norm.map((r) => (r && r[i] != null ? pal.s2.clone().lerp(pal.ink3, 0.25 + 0.6 * r[i]!) : null)));
    const mins = hist.map((s) => { const r = s.rows.find((x) => x.isMaxPain); return r ? ks.indexOf(r.strike) : -1; });
    return { z, colors, mins };
  }, [hist, ks, pal]);
  const ny = hist.length;
  const xi = (i: number) => -W / 2 + (i / (ks.length - 1 || 1)) * W;
  const yOf = (j: number) => (ny > 1 ? -D / 2 + (j / (ny - 1)) * D : 0);
  const path = mins.map((i, j) => (i >= 0 ? [xi(i), 0.03, yOf(j)] : null)).filter(Boolean) as [number, number, number][];
  const last = mins[ny - 1];
  return (
    <group>
      <Floor pal={pal} nx={ks.length} labelsX={xLabels(ks, Math.ceil(ks.length / 6))}
        labelsY={hist.map((s, j) => ({ j, n: ny, t: `${dShort(s.date)}${s.dte === 0 ? " · 0" : ""}${s.complete ? "" : " · partial"}`, strong: j === ny - 1 })).filter((l) => l.j % 2 === (ny - 1) % 2)} />
      <GridSurface z={z} colors={colors} opacity={0.7} />
      {hist.map((_, j) => (
        <Line key={j} points={ks.map((_, i) => [xi(i), z[i][j] ?? 0, yOf(j)] as [number, number, number])}
          color={j === ny - 1 ? pal.ink1 : pal.ink3} lineWidth={j === ny - 1 ? 1.6 : 0.6} transparent opacity={j === ny - 1 ? 0.95 : 0.4} />
      ))}
      {path.length > 1 && <Line points={path} color={pal.ink1} lineWidth={2} />}
      {path.map((p, j) => <mesh key={j} position={p}><sphereGeometry args={[0.06, 10, 10]} /><meshBasicMaterial color={pal.ink1} /></mesh>)}
      {last >= 0 && <Tag p={[xi(last), 0.45, yOf(ny - 1)]} c="var(--ink-1)" strong>MAX PAIN {num(ks[last])}</Tag>}
      {hist.map((s, j) => mins[j] < 0 && s.maxPainStrike != null ? <Tag key={`o${j}`} p={[W / 2 + 1.4, 0, yOf(j)]} align="right">max pain {num(s.maxPainStrike)} · outside window</Tag> : null)}
    </group>
  );
}

// ---------- 2 · IV fence ----------
function IvFence({ surface, pal, mWin }: { surface: any[]; pal: Pal; mWin: number }) {
  const legs = useMemo(() => [1, 2].map((leg) => surface
    .filter((r) => r.leg === leg && Number(r.oi_otm) > 0 && r.iv != null && r.moneyness_pct != null && Math.abs(Number(r.moneyness_pct)) <= mWin)
    .map((r) => ({ m: Number(r.moneyness_pct), iv: Number(r.iv), row: r }))
    .sort((a, b) => a.m - b.m)), [surface, mWin]);
  const all = legs.flat();
  if (!all.length) return <Tag p={[0, 0.5, 0]}>pending measurement · no liquid strikes</Tag>;
  const lo = Math.min(...all.map((p) => p.iv)), hi = Math.max(...all.map((p) => p.iv));
  const zOf = (iv: number) => 0.25 + ((iv - lo) / (hi - lo || 1)) * H;
  const xOf = (m: number) => (m / mWin) * (W / 2);
  const yLeg = [-D / 4, D / 4];
  const interp = (pts: { m: number; iv: number }[], m: number) => {
    for (let i = 0; i < pts.length - 1; i++) if (pts[i].m <= m && pts[i + 1].m >= m) {
      const t = (m - pts[i].m) / (pts[i + 1].m - pts[i].m || 1); return pts[i].iv + t * (pts[i + 1].iv - pts[i].iv);
    }
    return null;
  };
  const rungs = [-6, -3, 0, 3, 6].filter((m) => Math.abs(m) <= mWin);
  return (
    <group>
      <Floor pal={pal} nx={2} labelsX={[]} labelsY={[]} />
      {[-mWin, -mWin / 2, 0, mWin / 2, mWin].map((m) => <Tag key={`mx${m}`} p={[xOf(m), 0, D / 2 + 0.75]} align={m === -mWin ? "left" : m === mWin ? "right" : "center"}>{m > 0 ? "+" : m < 0 ? "−" : ""}{num(Math.abs(m), 1)} %</Tag>)}
      {legs.map((pts, li) => {
        if (!pts.length) return <Tag key={li} p={[0, 0.4, yLeg[li]]}>{li === 0 ? "W1" : "W2"} · pending measurement</Tag>;
        const leg = pts[0].row;
        const c = li === 0 ? pal.ink1 : pal.ink2;
        const ribbon = new THREE.BufferGeometry();
        const pos: number[] = [];
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1], y = yLeg[li];
          pos.push(xOf(a.m), 0, y, xOf(b.m), 0, y, xOf(a.m), zOf(a.iv), y, xOf(b.m), 0, y, xOf(b.m), zOf(b.iv), y, xOf(a.m), zOf(a.iv), y);
        }
        ribbon.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        const atmIv = leg.leg_atm_iv != null ? Number(leg.leg_atm_iv) : null;
        return (
          <group key={li}>
            <mesh geometry={ribbon}><meshBasicMaterial color={pal.ink3} transparent opacity={li === 0 ? 0.16 : 0.1} side={THREE.DoubleSide} depthWrite={false} /></mesh>
            <Line points={pts.map((p) => [xOf(p.m), zOf(p.iv), yLeg[li]] as [number, number, number])} color={c} lineWidth={li === 0 ? 2 : 1.4} />
            {atmIv != null && <mesh position={[0, zOf(atmIv), yLeg[li]]}><torusGeometry args={[0.1, 0.022, 8, 24]} /><meshBasicMaterial color={c} /></mesh>}
            <Tag p={[-W / 2 - 0.9, zOf(pts[0].iv), yLeg[li]]} c={li === 0 ? "var(--ink-1)" : "var(--ink-2)"} strong={li === 0} align="left">
              {li === 0 ? "W1 front" : "W2 back"} · {dShort(leg.expiry_date)}
            </Tag>
            {atmIv != null && <Tag p={[0.1, zOf(atmIv) + 0.35, yLeg[li]]} c={li === 0 ? "var(--ink-1)" : "var(--ink-2)"}>ATM {num(atmIv, 2)} %</Tag>}
            {leg.leg_skew_98 != null && <Tag p={[W / 2 + 0.6, zOf(pts[pts.length - 1].iv), yLeg[li]]} align="right">skew98 {Number(leg.leg_skew_98) >= 0 ? "+" : "−"}{num(Math.abs(Number(leg.leg_skew_98)), 2)}</Tag>}
          </group>
        );
      })}
      {legs[0].length > 1 && legs[1].length > 1 && rungs.map((m) => {
        const a = interp(legs[0], m), b = interp(legs[1], m);
        if (a == null || b == null) return null;
        return <Line key={`r${m}`} points={[[xOf(m), zOf(a), yLeg[0]], [xOf(m), zOf(b), yLeg[1]]]} color={pal.ink3} lineWidth={0.8} dashed dashSize={0.08} gapSize={0.06} />;
      })}
      <Tag p={[W / 2 + 0.2, H + 0.5, -D / 2]} align="right">IV {num(lo, 1)}–{num(hi, 1)} % · own scale</Tag>
    </group>
  );
}

// ---------- page ----------
const NOTES: Record<View, string> = {
  gamma: "Height = |net γ| per strike at each session's settled run (≤ 15:15 IST, v_gex_strike_terrain); hue = sign (cool dampening · warm amplifying). Dashed white = spot. Holes are missing strikes, never zero. Front expiry rolls between rows.",
  iv: "Two legs only (W1 + W2) — a two-rail fence, not a surface. Zero-OI strikes excluded; ±9 % moneyness. Rings = server ATM; dashed rungs join equal moneyness so the front→back smile rotation shows. Grey: IV is unsigned.",
  pain: "Writer pain per strike from v_gex_strike_terrain at each session's settled run. Each row on its own scale; white path = the view's max-pain strike. Grey: positional.",
};

export default function Lab3D() {
  const [params, setParams] = useSearchParams();
  const view = (VIEWS.find((v) => v.id === params.get("v"))?.id ?? "gamma") as View;
  const { symbol } = useSymbol();
  const step = symbol === "SENSEX" ? 100 : 50;
  const pal = usePalette();
  const hist = useStrikeHistory(symbol);
  const iv = useIvTab(symbol);
  const nav = useNavigate();
  const [camKey, setCamKey] = useState(0);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => { const f = () => setNarrow(window.innerWidth < 768); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const v = VIEWS.find((x) => x.key === e.key);
      if (v) setParams({ v: v.id }, { replace: true });
      else if (e.key === "Escape") nav(VIEWS.find((x) => x.id === view)!.back);
      else if (e.key === "r" || e.key === "R") setCamKey((k) => k + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, nav, setParams]);

  const h = hist.data ?? [];
  const ivd: any = iv.data;
  const ready = pal && (view === "iv" ? ivd !== undefined : hist.data !== undefined);
  const stamp = view === "iv"
    ? ivd ? `chain ${istTime(ivd.ts)}${ivd.awaiting ? " · market closed · last chain, not live" : ""}` : ""
    : h.length ? `${h.length} sessions · ${dShort(h[0].date)} → ${dShort(h[h.length - 1].date)}` : "";

  return (
    <div className="mx-auto max-w-[1440px] px-3 py-4 md:px-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--ink-3)" }}>{symbol} · 3D drill-down</span>
        <div className="flex gap-1">
          {VIEWS.map((v) => (
            <button key={v.id} onClick={() => setParams({ v: v.id }, { replace: true })}
              className="rounded border px-2.5 py-1 text-[12px]"
              style={{ borderColor: view === v.id ? "var(--ink-1)" : "var(--line-2)", color: view === v.id ? "var(--ink-1)" : "var(--ink-3)", background: view === v.id ? "var(--s2)" : "transparent" }}>
              <span className="mr-1.5 tabular-nums" style={{ color: "var(--ink-3)" }}>{v.key}</span>{v.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <span className="text-[11px] tabular-nums" style={{ color: "var(--ink-3)" }}>{stamp}</span>
        <button onClick={() => setCamKey((k) => k + 1)} className="rounded border px-2 py-1 text-[11px]" style={{ borderColor: "var(--line-2)", color: "var(--ink-2)" }}>reset view · R</button>
        <Link to={VIEWS.find((v) => v.id === view)!.back} className="rounded border px-2 py-1 text-[11px]" style={{ borderColor: "var(--line-2)", color: "var(--ink-1)" }}>2D twin · Esc</Link>
      </div>

      <div className="relative overflow-hidden rounded-lg" style={{ background: "var(--s1)", border: "1px solid var(--line)", height: narrow ? 440 : "min(68vh, 640px)" }}>
        {!ready ? (
          <div className="flex h-full items-center justify-center text-[12px]" style={{ color: "var(--ink-3)" }}>loading…</div>
        ) : view !== "iv" && !h.length ? (
          <div className="flex h-full items-center justify-center"><span className="rounded border border-dashed px-2 py-1 text-[11px] uppercase tracking-[0.08em]" style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}>pending measurement · no settled runs</span></div>
        ) : (
          <Canvas key={camKey + view + symbol} dpr={[1, 2]} camera={{ position: narrow ? [0, 9, 14] : [7, 7, 10], fov: 42 }} gl={{ antialias: true }}>
            <color attach="background" args={[pal!.bg.getStyle()]} />
            <Suspense fallback={null}>
              {view === "gamma" && <GammaTerrain hist={h} pal={pal!} step={step} />}
              {view === "pain" && <PainBowl hist={h} pal={pal!} step={step} />}
              {view === "iv" && <IvFence surface={ivd?.surface ?? []} pal={pal!} mWin={9} />}
            </Suspense>
            <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={6} maxDistance={26} maxPolarAngle={Math.PI / 2.05} target={[0, 0.8, 0]} />
          </Canvas>
        )}
        <div className="pointer-events-none absolute bottom-2 left-3 text-[10px]" style={{ color: "var(--ink-3)" }}>drag to orbit · scroll / pinch to zoom</div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
        {view === "gamma" && <><Sw c="var(--cool)" l="dampening · long γ" /><Sw c="var(--warm)" l="amplifying" /><Sw c="var(--ink-1)" l="latest session · spot" /></>}
        {view === "iv" && <><Sw c="var(--ink-1)" l="W1 front" /><Sw c="var(--ink-2)" l="W2 back" /><Sw c="var(--ink-3)" l="equal-moneyness rung" /></>}
        {view === "pain" && <><Sw c="var(--ink-3)" l="pain (own scale per row)" /><Sw c="var(--ink-1)" l="max-pain path" /></>}
        <span className="text-[10px] uppercase tracking-[0.08em]">optional view</span>
      </div>
      <p className="mt-1 max-w-[900px] text-[12px] leading-relaxed" style={{ color: "var(--ink-2)" }}>{NOTES[view]}</p>
    </div>
  );
}

const Sw = ({ c, l }: { c: string; l: string }) => (
  <span className="inline-flex items-center gap-1.5"><span className="inline-block h-[3px] w-4 rounded" style={{ background: c }} />{l}</span>
);
