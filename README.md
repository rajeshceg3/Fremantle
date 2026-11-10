# Fremantle | Working water

Four illustrated 3D places on Whadjuk Noongar Country: Fishing Boat Harbour, the Round House, Fremantle Markets and Bathers Beach. Drag or use arrow keys to orbit through 360 degrees, scroll/pinch to zoom and Reset to return to each place's first view.

## Run

- `npm ci`
- `npm run dev`
- `npm run build`
- `npm test` (Playwright Chromium; `CHROME_PATH` can select an installed browser)
- `python -m unittest discover -s tests`

`src/` and `index.html` are the current app. `app.js`, `styles.css`, the original PRD and prior progress notes describe the retired scroll-only version and are retained as history.

## Controls and access

The scene selector and tools stay visible. UI labels are at least 14px; controls are at least 46px tall. Opaque panels protect text from the scene behind it. Reduced-motion preference starts paused. Water shimmer and optional audio stop on Pause and on a hidden page. Sound is off until explicitly enabled. It combines synthesized water/wind and a quiet pentatonic pad, not a location recording.

The geometry is an illustration, not a surveyed reconstruction or a map. No external photos or audio are embedded. About includes sources and the Round House's incarceration history, not only its architecture.

## Sources

- https://www.wa.gov.au/government/document-collections/fishing-boat-harbour
- https://www.wa.gov.au/government/document-collections/round-house-and-arthur-head-reserve
- https://www.wa.gov.au/government/document-collections/fremantle-markets
- https://inherit.dplh.wa.gov.au/public/inventory/details/1f087a53-56c0-4588-ad6f-ca1a808773d2

## Verification

See `verification/world-quality.md`. Run the browser suite after a build. It executes every place at 320px, 390px and 1440px, with normal and reduced motion, including a real drag, stable Reset, keyboard orbit, audio lifecycle and dialog checks. The workflow uploads screenshots and results. Glyph contrast capture scripts compare actual text cores with their exact rendered backdrop; they do not use median scene brightness.
