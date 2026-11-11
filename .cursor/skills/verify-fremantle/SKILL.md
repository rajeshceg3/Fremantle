# Verify Fremantle
Fremantle - four places with 360 exploration and verified controls (vite).
## Launch
`npm install`, then `npm run dev` or `npm run build && npm run preview`.
## Doctor
`python3 .cursor/skills/verify-fremantle/verify.py` - a few minutes (real Chromium).
## Drive
Builds with vite, runs node --check on core modules, the python immersion contract (static checks), then the playwright worlds spec: 6 viewport/motion states over the four places with real Chromium.
## Evidence
`.cursor/skills/verify-fremantle/evidence.json`
## Cleanup
Playwright manages its preview server.
## Known boundaries
Chromium only; subjective scene quality unverified.
