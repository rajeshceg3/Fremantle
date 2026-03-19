# Fremantle

Immersive single-page web experience inspired by the product brief in `PRD.md`.

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.


## Validate experience contract

```bash
python3 -m unittest -q tests/test_immersion_contract.py
```

This smoke suite verifies key PRD-aligned behaviors (timing gates, narrative spaces, whisper-card word budgets, and horizon resistance constraints).
