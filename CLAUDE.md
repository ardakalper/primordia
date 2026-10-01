# Primordia — notes for future sessions

- Owner: Arda. Commits are authored by Arda only: never add Co-Authored-By or session trailers.
- Style: plain HTML/CSS/ES modules, no build step, no runtime dependencies, offline-first PWA, GitHub Pages deploy from `app/`.
- `js/sim.js` is the pure, deterministic simulation (seeded PRNG, fixed ticks, no DOM). Everything random must go through `world.rng`; same seed + same settings ⇒ identical world. Tests rely on this.
- Brains are tiny MLPs whose weights are genes (neuroevolution). Ancestors start with a crude food-seeking reflex; README says so.
- Charts follow the dataviz rules: species colours are the validated dark categorical palette in fixed slot order, top 7 + "Other", colour follows the species (slots are sticky), one axis per chart, hover crosshair + tooltip, legend for ≥2 series.
- UI strings EN/TR in `js/i18n.js` (parity test). Unit tests with node --test; e2e with Playwright on port 4178.
