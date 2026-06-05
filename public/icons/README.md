# Cogherence icons

Luminous neon-glass icon set, generated with nano-banana (Gemini 2.5 Flash Image)
and post-processed by [`scripts/process-icons.py`](../../scripts/process-icons.py)
(trim → square → 256px → alpha key). Designed to sit on the game's near-black
background (`#07070c`).

Two variants per icon:

- `icons/<name>.png` — 256px, **black background**. Drops straight onto the dark UI.
- `icons/transparent/<name>.png` — 256px, **RGBA** (black keyed to alpha) for use on
  any background, hover states, etc.

| File | Meaning | Glow |
|------|---------|------|
| `mineral-c`  | Carbon mineral (C)      | cyan-white |
| `mineral-o`  | Oxygen mineral (O)      | electric blue |
| `mineral-ge` | Germanium mineral (Ge)  | violet-magenta |
| `mineral-s`  | Sulfur mineral (S)      | amber-gold |
| `heart`      | Heart — victory point   | rose-magenta |
| `energy`     | Energy — currency       | electric cyan |
| `coherence`  | Coherence — order/commons | teal-green |
| `align`      | Align — build/claim verb  | emerald green |
| `exploit`    | Exploit — scorched-earth verb | red-orange |
| `deal`       | Deal — trade/negotiate verb   | amber + cyan |
| `logo`       | Cogherence emblem (favicon source) | cyan→magenta |

Derived from `logo`: `public/favicon.png` (64px) and `public/apple-touch-icon.png`
(180px), wired into `index.html`.

`_contact-sheet.png` is a labeled preview of the whole set.

The raw 1024px masters live in `generated_imgs/` (git-ignored); re-run the script to
regenerate the committed assets.
