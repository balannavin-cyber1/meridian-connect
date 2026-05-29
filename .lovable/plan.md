## Marketview v4 — phased rebuild

Replace the Hero rollup with atomic single-metric cards matching `marketview_v4_render.png`. Wire every value to live Supabase (anon SELECT only). Existing tables/views are untouched; one new view (`v_max_pain_by_strike`) may be added if `option_chain_snapshots` exists.

### Layout (top → bottom)

```text
[Header: tabs · SPOT/change · EXPIRY/DTE · LIVE · Narrative →]
[Sec 1: Key Parameters strip — 7 tiles]
[Sec 2: Positioning Landscape — Dealer γ by Strike (full width)]
[Sec 3: Max Pain by Strike (full width, NEW)]
[Sec 4: Pin Risk Score | Pin Probability | ATM Straddle (3 cards)]
[Sec 5: Pin Risk Timeline (full width, twin-axis)]
[Sec 6: WCB | Market Breadth | India VIX | IV Skew (4 cards)]
[Sec 7: ICT Zones (full width)]
[Sec 8: Today's Signals (full width)]
[Narrative modal — triggered from header]
```

### Phasing

I'll ship in phases so each renders before moving on. Each phase is one Lovable turn.

- **A.** Design tokens (`src/styles.css`), header rebuild, Key Parameters strip (7 tiles wired to `gamma_metrics` + pin/accel views). Delete legacy Hero card composition.
- **B.** Positioning Landscape chart: rebuild `HeroChart` styling to match render (σ-band shading, ±1σ/±2σ dashed lines, blue spot marker, max-γ + flip dashed lines, scalar strip above).
- **C.** Max Pain card. Requires the `v_max_pain_by_strike` view. Since I can't run migrations from the sandbox, I'll output the SQL for you to paste, and code the card defensively (empty state + `data unavailable` if view missing).
- **D.** Pin Risk row (3 cards) + Pin Risk Timeline (twin-axis ComposedChart, today's `gamma_metrics`).
- **E.** Breadth & Volatility row (4 cards) + `Sparkline`/`Gauge`/`IVSmile` primitives in `src/components/primitives/`.
- **F.** ICT Zones list + Signals stream (restyled to render spec).
- **G.** Narrative modal + final cleanup, delete old Hero code.

### Technical notes

- Stack already in place: React Query, `@supabase/supabase-js`, Recharts. No new deps needed (will check; may add `recharts` references — already used).
- Polling intervals per spec applied via React Query `refetchInterval` in `src/lib/queries.ts`. Sparkline 5-day windows = 5min stale.
- New primitives in `src/components/primitives/{Sparkline,Gauge,IVSmile,TwinAxisTimeline}.tsx`.
- Narrative modal in `src/components/NarrativeModal.tsx`, opens via header button + Escape/backdrop close.
- Tokens added as CSS vars on `:root` in `src/styles.css`; cards continue to use semantic Tailwind classes mapped to those vars where existing classes exist, raw CSS vars where not.
- DTE helper `formatDTE` colocated with header.
- Responsive: `grid-cols-12 md:grid-cols-6 sm:grid-cols-1` for card rows.

### Schema unknowns / risks

Several fields in the spec aren't confirmed in the current `queries.ts`:
- `gamma_metrics`: `pin_risk_score`, `pin_probability_top`, `atm_straddle_premium`, `flip_level`, `max_gamma_strike`, `peak_gamma_cr`, `sigma_pct_to_expiry`, `net_dealer_gamma_cr`, `dampen_total`, `amplify_total`, `regime`. The current code already pulls `gamma_metrics.*` so we'll just read these fields; if a column is missing the card shows `—` + `data unavailable`.
- `option_chain_snapshots`, `market_breadth_intraday`, `india_vix_intraday` — existence unverified. Cards depending on these will defer to `Coming soon` / `data unavailable` placeholders rather than break.
- `v_max_pain_by_strike` view: SQL provided in spec; I'll output it for you to apply in Supabase SQL editor.

### Questions before I start phase A

1. Confirm I should delete the legacy Hero block entirely (the current `Marketview.tsx` keeps the dealer flow grid, ICT panel, signals etc. — I'll preserve content but restructure into the new sections).
2. For columns/tables that don't exist yet, OK to render `—` + `data unavailable` placeholder instead of blocking the phase?
3. Apply the `v_max_pain_by_strike` SQL yourself after Phase C, or skip Max Pain entirely until the view is live?

Once you confirm, I'll start with **Phase A** (tokens + header + Key Parameters strip).
