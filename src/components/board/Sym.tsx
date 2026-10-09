// Ruled names (∂Δ/∂t, ∂Γ/∂σ, γ-CONC, |γ|) must render exactly as written.
// Uppercase containers would turn ∂Δ/∂t into ∂Δ/∂T, ∂Δ/∂σ into ∂Δ/∂Σ and γ into Γ.
// Wrap every math run in normal-case so only the surrounding Latin words capitalise.
const MATH = /(∂[^\s·]*|[αβγδεζηθικλμνξοπρστυφχψω][A-Za-z0-9-]*)/g;

export function Sym({ text }: { text: string }) {
  const parts = text.split(MATH);
  return <>{parts.map((s, i) => (i % 2 ? <span key={i} className="normal-case">{s}</span> : s))}</>;
}
