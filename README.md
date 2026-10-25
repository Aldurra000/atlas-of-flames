# Atlas Of Flames

# FIRECHRONICLE — NASA Space Apps Challenge
## Complete Interactive Wildfire Intelligence Platform

Act as a senior full-stack engineer, geospatial data scientist, satellite remote-sensing specialist, 3D visualization developer, and award-level product designer.

Build a complete, polished, interactive web application called **FIRECHRONICLE** for the NASA Space Apps Challenge.

This must be a working scientific application, not merely a beautiful landing page, static dashboard, or collection of mockups.

The mission is to create a consistent picture of when and where burning activity occurs, including wildfires and agricultural burning, using satellite observations over time. The platform should help users explore active-fire hotspots, understand historical patterns, identify unusual and potentially critical periods, prioritize monitoring, and support emergency-response situational awareness.

Build the application in working stages. Prioritize a functional core, then implement the advanced analytics. Do not claim features are operational until they work.

# 1. DESIGN DIRECTION

Create an exceptional, modern Earth-observation intelligence interface suitable for a scientific conference, competition presentation, and live demonstration.

Visual identity:
- Product name: FIRECHRONICLE.
- Subtitle: Global Fire Intelligence & Historical Analysis.
- Tagline: Understand the Past. Monitor the Present. Prepare for What Comes Next.
- Dark scientific interface inspired by satellite operations centers and geospatial intelligence platforms.
- Deep midnight navy background, near-black panels, subtle borders, white typography, and restrained orange, amber, and red accents.
- Use clear typography, generous spacing, consistent alignment, readable charts, and purposeful animations.
- Avoid excessive cards, clutter, overlapping text, giant empty sections, and generic AI-generated dashboard styling.
- Use subtle glows only where they communicate fire activity.
- Make the interface responsive and usable on desktop, tablet, and mobile.

Create a compact navigation system with:
1. Global Overview
2. Fire Explorer
3. Historical Analysis
4. Early Warning
5. Country Intelligence
6. Methodology

The default page must open directly into the interactive global fire intelligence dashboard, not a marketing-only landing page.

# 2. HERO VISUALIZATION: AN INTERACTIVE 3D EARTH

The 3D Earth is the centerpiece of FIRECHRONICLE.

Use Three.js with React Three Fiber and Drei, or an appropriate compatible 3D globe library.

Requirements:
- A realistic spherical Earth with detailed land, oceans, country boundaries, and a subtle atmospheric glow.
- Smooth rotation, zooming, panning, and a reset-camera control.
- Accurate conversion between latitude/longitude and positions on the globe.
- Country highlighting and geographic selection.
- Smooth transitions when a country or hotspot is selected.
- Clearly visible active-fire detections.
- Geographic clustering at low zoom levels and individual detections at higher zoom levels.
- Responsive rendering and performance optimization.

The globe must be functional, not a static image.

## 3. SHOW REALISTIC 3D FLAMES, NOT JUST DOTS

The current concept must go beyond ordinary red points.

Design a recognizable 3D fire visualization:
- Individual active-fire detections should appear as small, recognizable, stylized 3D flames anchored to their exact geographic coordinates on the globe.
- Use layered flame shapes, animated orange and amber cores, red outer edges, subtle glow, and optional lightweight ember or smoke effects.
- The fire effect should be visually convincing from normal viewing distance without obscuring the Earth.
- Keep flames appropriately scaled and reduce overlap at global zoom levels.
- When zooming in, reveal individual flame markers and precise detection locations.
- When zooming out, group nearby detections into clusters or 3D activity columns.
- Add a clear legend and controls to switch between:
  A. 3D Flames
  B. Activity Columns
  C. Heat Density
  D. Clusters

Clicking a flame must open a detail panel containing the corresponding real satellite observation.

Clicking an activity column must open the aggregated geographic cell details.

Important scientific distinction: flames and their animations are visualization symbols. Their rendered height, color, glow, and smoke must not be presented as actual flame height, actual fire size, or a measured physical fire characteristic. Scientific values must come from source records.

# 4. NASA FIRMS REAL DATA INTEGRATION

Integrate NASA FIRMS active-fire observations through a secure backend or server-side function.

Support relevant available MODIS and VIIRS active-fire products, subject to the actual API capabilities, access permissions, and historical availability.

Use a server-side secret named FIRMS_MAP_KEY.

Security requirements:
- Never put the API key in frontend code or public environment variables.
- Never expose the secret in browser requests, public files, logs, or error messages.
- Use a secure server-side proxy or backend function to retrieve data.
- Validate parameters and restrict date ranges and request sizes.
- Handle rate limits, failed requests, and unavailable data gracefully.

Display the actual source and relevant available fields:
- Latitude and longitude.
- Acquisition date and time.
- Satellite and instrument/product.
- Confidence where available.
- Brightness temperature where available.
- Fire Radiative Power (FRP) where available.
- Day/night flag where available.
- Scan and track values where available.
- Original source attributes when appropriate.

Preserve the original source fields and normalize records into a documented common schema.

Distinguish clearly between:
- A satellite active-fire detection.
- A unique physical fire, which cannot necessarily be inferred from one detection.
- A cluster of observations.
- Burned area, which requires different data.

Never invent NASA observations or replace failed API requests with fake real-world data.

If live API access is not yet configured, build a clearly labeled demonstration mode using synthetic sample records. Display a persistent “DEMO DATA — NOT LIVE NASA OBSERVATIONS” label. Keep demonstration data isolated from real observations and never mix the two silently.

Show the selected source, loaded date range, last successful refresh, and data status.

# 5. A FULLY FUNCTIONAL TIME SLIDER

Implement a prominent horizontal timeline directly below the 3D globe.

The timeline is a core feature, not an optional decoration.

Include:
- A draggable date slider.
- Selected date and time.
- Available earliest and latest dates.
- Play and pause buttons.
- Previous day and next day controls.
- Playback speeds of 1×, 2×, and 5×.
- Time-window options of 1 day, 7 days, and 30 days when supported by the data.
- A timeline activity histogram showing the number of available detections per day.
- Clear indication of dates with no available observations.

When the user changes the date or window, synchronize:
- The globe and 3D flames.
- Activity columns and clusters.
- Statistics.
- Hotspot details.
- Historical charts.
- Country summaries.
- Monitoring priorities.

Playback must use actual records for each selected date. Never create artificial future observations or interpolate invented fires.

If historical data is insufficient, explain the limitation and provide only the controls supported by the available dataset.

# 6. GLOBAL INTELLIGENCE DASHBOARD

Below or beside the globe, create a clean analytical overview with meaningful metrics:
- Active-fire detections in the selected time window.
- Countries or geographic regions with available detections.
- Highest-activity region based on the selected data.
- Areas flagged for unusual historical activity, when sufficient baseline data exists.
- Data coverage and freshness.

Every metric must respond to the active filters and selected period.

Do not hardcode live statistics or show fabricated counters.

Each metric should have a tooltip explaining its definition.

Add a compact activity ranking showing geographic regions with the highest observed detection counts during the selected period.

Explain that detection counts are not equivalent to unique fire counts.

# 7. HISTORICAL FIRE ANALYSIS

Create a dedicated Historical Analysis workspace.

It must provide:
- Daily, weekly, monthly, and seasonal activity views when supported by the data.
- Historical fire activity trends.
- Geographic comparisons.
- Country-level comparisons.
- Repeated periods of elevated activity.
- Historical baselines.
- Anomaly detection.
- Time-series charts connected to the selected country, region, and time window.

Use actual available observations.

Where the historical record is sufficient, implement a transparent statistical method for detecting unusual activity, such as comparing current counts with a suitable historical baseline for the same geographic region and seasonal period.

Account for missing dates, changes in satellite products, and inconsistent data coverage.

For every anomaly, show:
- Geographic location.
- Time period.
- Observed detection count.
- Historical baseline.
- Absolute or relative deviation.
- Data coverage and limitations.
- A plain-language explanation of why it was flagged.

Do not label a period “critical” solely because its raw count is high. Use a documented, configurable method and explain its thresholds.

If the available historical data is inadequate, show “Insufficient historical data” instead of generating misleading conclusions.

# 8. EARLY WARNING AND MONITORING PRIORITIES

Build a dedicated Early Warning workspace that supports monitoring decisions.

Identify areas that may deserve additional attention based on available evidence:
- Recent active-fire detections.
- Persistent or clustered observed activity.
- Unusual increases relative to historical baselines.
- Seasonal patterns.
- Weather, drought, vegetation, or other environmental indicators only when reliable external datasets have actually been integrated.

For each monitoring priority, display:
- Country and region.
- Time period.
- Relevant observed detections.
- Historical comparison.
- Priority level and transparent calculation method.
- Reason for prioritization.
- Source data and coverage.
- Suggested monitoring action, clearly marked as an informational recommendation.

Separate four categories:
1. Confirmed satellite observations.
2. Statistically unusual historical activity.
3. Estimated potential risk.
4. Official warnings issued by authorized agencies.

Do not pretend that historical satellite detections alone can accurately predict future fires.

Do not claim to forecast the next fire unless a valid predictive model and relevant input data have been implemented and evaluated.

Where forecasting is not supported, provide a transparent “Monitoring Priority Assessment” rather than a fake prediction.

# 9. COUNTRY INTELLIGENCE

Create an interactive country selector and a dedicated country intelligence page.

Users must be able to search by country name and select a country from a list or directly from the globe.

For the selected country, show:
- Active-fire detections for the selected time window.
- A geographic distribution of available hotspots.
- Historical and seasonal activity.
- Unusual activity compared with the historical baseline.
- Monitoring priorities.
- Data availability and observation coverage.
- Satellite products contributing observations.
- A country activity timeline.
- Relevant official wildfire, forestry, civil-protection, and emergency-management organizations when verified information is available.

Use reliable country boundaries and geographic data.

Support all countries that can be reliably represented, and show a clear unavailable-data state when a country lacks sufficient observations.

For emergency agencies, use verified official websites and public information. Do not fabricate agency names, phone numbers, contact information, warning messages, or response-team locations.

Do not imply the platform is connected to an actual emergency dispatch system unless such an integration genuinely exists.

# 10. ACTIVE HOTSPOT DETAILS

When the user clicks a flame, open a polished detail drawer.

Display the actual available source fields:
- Coordinates.
- Acquisition date and time.
- Satellite/product.
- Confidence.
- Brightness and FRP where available.
- Source record identifier or stable documented identifier.
- Source attribution.
- Link to the relevant official data source where possible.

Provide a “Locate on Globe” action that centers the camera on the selected observation.

For aggregated activity columns, show:
- Geographic cell boundaries or coordinates.
- Detection count.
- Selected date range.
- Contributing products.
- Data coverage.
- Aggregation method.

All details must correspond to the selected real record or actual aggregate.

# 11. PROFESSIONAL CALENDAR AND ACTIVITY EXPLORER

Add a historical calendar or activity matrix that lets users explore when burning activity was observed.

Use clear activity intensity scales and legends.

Allow users to select a day or period and update the globe, analytics, and country view.

Do not use empty cells to imply zero fires if observations were unavailable. Distinguish no detections from missing data.

# 12. METHODOLOGY AND DATA TRANSPARENCY

Add a methodology page that explains:
- What satellite active-fire detections represent.
- The differences between active-fire detections, unique fires, and burned area.
- How MODIS and VIIRS records are normalized and compared.
- How spatial aggregation and temporal grouping work.
- How historical baselines are calculated.
- How anomalies and monitoring priorities are generated.
- The meaning and limitations of every risk indicator.
- Data freshness, missing observations, uncertainty, and coverage.

Use the actual NASA FIRMS product documentation and the sources genuinely integrated into the application.

Do not claim to use datasets, validation procedures, or predictive models that have not been implemented.

# 13. TECHNICAL ARCHITECTURE

Use an architecture compatible with Lovable's development environment, preferably:
- React and TypeScript.
- A consistent reusable component system.
- Tailwind CSS or the existing supported styling system.
- Three.js / React Three Fiber for the globe and 3D fire visualization.
- Secure server-side functions for API requests.
- A documented normalized data schema.
- A database only when it provides a real benefit, such as caching or preserving analysis history.

If using Supabase or another external backend, explain which features require configuration and implement the available integration rather than leaving disconnected placeholders.

Keep API secrets server-side.

Use robust date handling, geospatial coordinate conversion, loading indicators, error states, empty states, and responsive layouts.

# 14. REQUIRED TESTS

Verify the following:
- The application launches and the primary dashboard renders.
- The globe rotates and zooms.
- Fire markers stay attached to their correct geographic positions.
- Marker selection displays the correct observation.
- The time slider changes the selected date.
- Playback updates the date and visualization.
- Country selection updates all dependent components.
- Date and source filters work.
- Historical analysis uses actual available data.
- Anomaly calculations handle insufficient data appropriately.
- API failures do not generate fake observations.
- No API secrets are exposed to the frontend.
- The interface remains usable at desktop and mobile widths.

Fix implementation errors and build failures before declaring the project complete.

# 15. FINAL DELIVERY

Build the working application, not just a proposal.

Start by establishing the page structure, design system, and functional 3D globe. Then implement the real data integration, timeline, analytics, country intelligence, and monitoring-priority workflows.

Do not stop after producing a static preview. Connect the controls and views to shared application state and real data.

If a feature depends on credentials or an external source that is not configured, implement the appropriate integration point and clearly identify the remaining setup. Do not pretend it is operational.

At completion, provide:
- A summary of implemented features.
- Which features have been tested.
- Which data sources are connected.
- Which configuration steps remain.
- Any known limitations.

The final result should feel like a coherent, credible satellite fire intelligence system built for a scientific competition, with a stunning interactive 3D Earth and genuinely useful temporal and geographic analysis.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://atlas-of-flames.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1831ffb5-432c-4896-b226-992e1e019a8c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
