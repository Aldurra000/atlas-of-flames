<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All fire data flows through the zustand store in `src/lib/fire/store.ts`; views derive from it so date/country/filter changes sync everywhere.
- NASA FIRMS is fetched only via `src/lib/fire/firms.functions.ts` using server secret `FIRMS_MAP_KEY`; never call FIRMS from the browser (keeps the key secret).
- Demo (synthetic) and live datasets are never mixed; demo mode always shows the DEMO banner.
- The 3D globe (`src/components/fire/Globe.tsx`) is lazy-loaded behind ClientOnly because three.js needs the browser.
- Analytics (anomaly, priorities) live as pure functions in `src/lib/fire/analytics.ts` and are covered by `src/test/fire.test.ts`.

- Retrieve complete daily NASA CSV responses through one RPC per day without FRP sampling; transport compact CSV rather than expanded record objects to avoid serialization limits, and track returned rows separately from validated loaded records.
- Historical indices and timeline bars derive from attribute-filtered store records; incomplete samples cannot supply anomaly baselines.
- Start in live mode and only label NASA as live after a successful dataset load; explicit demo selection never silently substitutes for failed live requests.
- Long-term history comes from NASA FIRMS public yearly country archives via `src/lib/fire/archive.functions.ts`, summarized server-side to daily aggregates (files are too large to ship as rows); pure logic lives in `src/lib/fire/archive.ts` with `src/test/archive.test.ts`.
- MODIS and VIIRS archive series are shown per sensor and never spliced; harmonization collapses detections onto a shared daily grid, and long-term trends use a single sensor for consistency.
