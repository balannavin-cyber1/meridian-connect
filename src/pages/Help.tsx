import { useEffect, useState } from "react";

type Shot = { file: string; caption: string; symbol: string; date: string; time_ist: string; board_bundle: string };
type Section = { id: string; title: string; html: string; shots: Shot[] };
type Part = { id: string; title: string; intro_html: string; shots: Shot[]; sections: Section[] };
type Manual = { title: string; manual_version: string; board_bundle: string; source_sha256: string; preface_html: string; parts: Part[] };

const BASE = import.meta.env.BASE_URL;

const css = `
.hp-doc{color:var(--ink-2);font-size:14px;line-height:1.6;font-variant-numeric:tabular-nums}
.hp-doc p{margin:0 0 .75em}
.hp-doc ul,.hp-doc ol{margin:0 0 .75em;padding-left:1.4em}
.hp-doc ul{list-style:disc}.hp-doc ol{list-style:decimal}
.hp-doc li{margin:.2em 0}
.hp-doc li>ul,.hp-doc li>ol{margin:.2em 0}
.hp-doc strong{color:var(--ink-1);font-weight:600}
.hp-doc code{font-family:var(--font-plex-cond);font-size:.92em;background:var(--s2);border:1px solid var(--line);border-radius:3px;padding:0 .3em;color:var(--ink-1);overflow-wrap:anywhere}
.hp-doc blockquote{margin:0 0 .75em;padding:.4em .9em;border-left:2px solid var(--line-2);background:var(--s1);color:var(--ink-2)}
.hp-doc .hp-tw{overflow-x:auto;margin:0 0 .9em;border:1px solid var(--line);border-radius:4px}
.hp-doc table{border-collapse:collapse;width:100%;font-size:13px}
.hp-doc th,.hp-doc td{padding:.35em .6em;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.hp-doc th{color:var(--ink-3);font-weight:500;background:var(--s1)}
.hp-doc tr:last-child td{border-bottom:0}
`;

/** Wraps each table in a scroll box without altering the HTML text. */
function Html({ html }: { html: string }) {
  const wrapped = html.replace(/<table>/g, '<div class="hp-tw"><table>').replace(/<\/table>/g, "</table></div>");
  return <div className="hp-doc" dangerouslySetInnerHTML={{ __html: wrapped }} />;
}

function Figure({ s, open }: { s: Shot; open: (src: string) => void }) {
  const src = `${BASE}${s.file}`;
  return (
    <figure className="my-4">
      <button onClick={() => open(src)} className="block w-full cursor-zoom-in">
        <img src={src} loading="lazy" alt={s.caption} className="block h-auto w-full rounded" style={{ border: "1px solid var(--line)" }} />
      </button>
      <figcaption className="mt-1.5 text-[13px]" style={{ color: "var(--ink-2)" }}>{s.caption}</figcaption>
      <div className="text-[11px] tabular-nums" style={{ color: "var(--ink-3)", fontFamily: "var(--font-plex-cond)" }}>
        {`${s.symbol} · ${s.date} ${s.time_ist} IST · board ${s.board_bundle}`}
      </div>
    </figure>
  );
}

function Toc({ m }: { m: Manual }) {
  return (
    <ul className="space-y-2 text-[12px]">
      {m.parts.map((p) => (
        <li key={p.id}>
          <a href={`#${p.id}`} className="font-medium hover:underline" style={{ color: "var(--ink-1)" }}>{p.title}</a>
          {p.sections.length > 0 && (
            <ul className="mt-1 space-y-0.5 pl-3">
              {p.sections.map((s) => (
                <li key={s.id}><a href={`#${s.id}`} className="hover:underline" style={{ color: "var(--ink-3)" }}>{s.title}</a></li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function Help() {
  const [m, setM] = useState<Manual | null>(null);
  const [err, setErr] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`${BASE}help/manual.json`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j: Manual) => { if (!live) return; if (!j || !Array.isArray(j.parts)) throw new Error(); setM(j); })
      .catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, []);

  // Deep link: scroll to the hash anchor once the content is in the DOM.
  useEffect(() => {
    if (!m) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const go = () => document.getElementById(id)?.scrollIntoView();
    requestAnimationFrame(go);
    // Re-anchor while lazy screenshots above the target settle their height.
    const ts = [300, 900, 1800].map((d) => window.setTimeout(go, d));
    return () => ts.forEach(clearTimeout);
  }, [m]);

  useEffect(() => {
    if (!zoom) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [zoom]);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 lg:px-6">
      <style>{css}</style>
      <h1 className="text-[22px] font-semibold" style={{ fontFamily: "var(--font-plex-cond)", color: "var(--ink-1)" }}>Marketview manual</h1>
      {m && <div className="mt-0.5 text-[12px] tabular-nums" style={{ color: "var(--ink-3)" }}>{`manual ${m.manual_version} · board ${m.board_bundle}`}</div>}
      {!m && !err && <div className="mt-4 text-[13px]" style={{ color: "var(--ink-3)" }}>help · loading</div>}
      {err && <div className="mt-4 text-[13px]" style={{ color: "var(--ink-3)" }}>help content not found — public/help/manual.json</div>}

      {m && (
        <div className="mt-5 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
          <aside className="hidden lg:block">
            <div className="sticky top-[72px] max-h-[calc(100vh-88px)] overflow-y-auto pr-2"><Toc m={m} /></div>
          </aside>
          <details className="mb-5 rounded-md p-3 lg:hidden" style={{ border: "1px solid var(--line)", background: "var(--s1)" }}>
            <summary className="cursor-pointer text-[13px]" style={{ color: "var(--ink-2)" }}>{m.title}</summary>
            <div className="mt-3"><Toc m={m} /></div>
          </details>

          <article className="min-w-0">
            <Html html={m.preface_html} />
            {m.parts.map((p) => (
              <section key={p.id} id={p.id} className="mt-10 scroll-mt-[72px]">
                <h2 className="mb-3 border-b pb-1.5 text-[19px] font-semibold" style={{ fontFamily: "var(--font-plex-cond)", color: "var(--ink-1)", borderColor: "var(--line)" }}>{p.title}</h2>
                <Html html={p.intro_html} />
                {p.shots.map((s) => <Figure key={s.file} s={s} open={setZoom} />)}
                {p.sections.map((s) => (
                  <section key={s.id} id={s.id} className="mt-7 scroll-mt-[72px]">
                    <h3 className="mb-2 text-[16px] font-semibold" style={{ fontFamily: "var(--font-plex-cond)", color: "var(--ink-1)" }}>{s.title}</h3>
                    <Html html={s.html} />
                    {s.shots.map((sh) => <Figure key={sh.file} s={sh} open={setZoom} />)}
                  </section>
                ))}
              </section>
            ))}
          </article>
        </div>
      )}

      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto p-4" style={{ background: "rgba(0,0,0,0.85)" }} onClick={() => setZoom(null)}>
          <img src={zoom} className="max-w-none" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
