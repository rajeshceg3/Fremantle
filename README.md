# Fremantle

Immersive single-page web experience inspired by the product brief in `PRD.md`.

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

For manual atmosphere QA on real devices, append `?qa=1` to enable a small diagnostics panel:

`http://localhost:4173/?qa=1`


## Validate experience contract

```bash
python3 -m unittest -q tests/test_immersion_contract.py
```

This smoke suite verifies key PRD-aligned behaviors (timing gates, narrative spaces, whisper-card word budgets, and horizon resistance constraints).

## Experience enrichment approach (without clutter)

To keep immersion high while avoiding UI noise, enhancements should follow three constraints:

1. **Invisible intelligence over visible controls**  
   Prefer systems that react to pace, stillness, and revisits (instead of adding toggles or panels).
2. **Rare, non-looping atmospheric moments**  
   Use occasional sensory events to preserve surprise and prevent mechanical repetition.
3. **Narrative continuity through memory**  
   Let later moments subtly acknowledge earlier zones so the journey feels authored, not segmented.

Current implementation now reflects this by:

- adapting HUD guidance based on scroll pace (encouraging slower movement when users rush),
- introducing low-frequency ambient narrative moments that surface only after genuine exploration,
- adding a soft sky-glow “swell” reaction tied to those moments for a richer sense of presence.
