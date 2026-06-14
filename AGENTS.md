# AGENTS.md

Guidance for AI assistants working in the Cogherence repo.

## Branding & art assets (nano-banana / Gemini image)

Cogherence's game art — the neon-glass icon set in [`public/icons/`](public/icons/) and the
gear-as-**O** **COGHERENCE** wordmark — is generated with the **`nano-banana`** MCP server
(Google Gemini image generation), then post-processed with Python (Pillow + numpy + scipy via
`uv run --with`). Raw generations land in `generated_imgs/` (git-ignored, 1024px masters);
only the cleaned, committed PNGs ship.

This recipe originated in the sibling **Agricogla** game (its `AGRIC⚙GLA` wordmark and dark
broadcast-HUD asset pack were the first cut); Cogherence reuses the same pipeline, recolored to
the cyan→magenta observatory theme.

### Setup (once per session)

The `nano-banana` server needs a Gemini API key. It is **not** in the shell env — fetch it
from AWS Secrets Manager and hand it to the server:

```bash
aws secretsmanager get-secret-value --secret-id polis/shared/gemini-api-key \
  --profile softmax-org --query SecretString --output text
```

Then call `mcp__nano-banana__configure_gemini_token` with that value (check first with
`mcp__nano-banana__get_configuration_status`).

### Pipeline

1. **Generate** raws with `mcp__nano-banana__generate_image` (one call per asset). Outputs are
   written to `generated_imgs/`.
2. **Refine** an existing PNG in place with `mcp__nano-banana__edit_image` /
   `continue_editing` when a generation is close but needs a tweak (e.g. "move the gear closer
   to the C and G so it reads as one tight wordmark").
3. **Process** the chosen raws into committed assets:
   - Icons → [`scripts/process-icons.py`](scripts/process-icons.py): trim any near-white frame
     the generator adds, pad to a centered 256px square on pure black, emit both the black-bg
     `public/icons/<name>.png` and the alpha-keyed `public/icons/transparent/<name>.png`, plus
     the favicon / apple-touch-icon (from the `logo` raw) and a labeled contact sheet. The
     `SRC` map at the top pins each `<name>` to its raw filename — update it when regenerating.
   - To background-knock a one-off (like a wordmark): edge-seeded flood-fill from the corners
     (preserves the glow falloff + interior detail, unlike a global luma threshold), then
     autocrop + pad. **Avoid white backgrounds** — they leave a pale halo; dark `#07070c` or a
     transparent generation both key cleanly.

### The gear-as-O wordmark

Prompt template (the one that produced a usable lockup — keep it tight and spell the word out
letter-by-letter, because Gemini *loves* to double a letter, e.g. `COGHERENNCE`):

> A horizontal logo wordmark of the single word "COGHERENCE" in bold all-capital letters,
> spelled exactly C-O-G-H-E-R-E-N-C-E, where the single letter **O** is drawn as a mechanical
> gear / cog (a round toothed gear with a hole in the middle) in place of the O.
>
> Style: heavy geometric sans-serif letters with a luminous **cyan→magenta** neon-glass
> gradient (cyan `#3ce0c0` flowing to magenta `#ff4d9d`), a soft outer glow, dark
> observatory / HUD aesthetic. Crisp, modern, high contrast.
>
> Centered horizontal lockup, generous margin. Background: solid near-black charcoal
> (`#07070c`). Correct spelling COGHERENCE, no extra words, no other letters. Flat vector,
> not photorealistic.

Practical notes from the runs that made it:

- **Generate ~10 and cull.** Most outputs misspell or warp a letter; keep only the
  correctly-spelled ones. Dropping them all into a quick HTML contact sheet (each on the dark
  header bg) makes picking a winner fast.
- **Iterate the gear first.** It helps to generate the gear-as-"O" *glyph* on its own (8–12
  trapezoidal teeth, large hollow center "so it reads as a circular letter O") across a few
  styles before asking for the full wordmark.
- **Then tighten with `edit_image`** rather than re-rolling the whole wordmark.

### The live wordmark

The header wordmark is the generated raster: [`public/art/logo-wordmark.png`](public/art/),
produced by the process above and rendered as an `<img>` by [`Brand` / `Wordmark` in
`src/client/cg/atoms.tsx`](src/client/cg/atoms.tsx). To change it, regenerate via nano-banana,
re-run the luma-key/crop, and overwrite that file (raw masters stay in git-ignored
`generated_imgs/`).

> History: the mark first shipped as an inline-SVG cog (a parametric path + CSS gradient),
> ported from Agricogla before this repo had its own generation. It was replaced by the
> nano-banana raster above — see git history for the SVG version if you ever want a
> resolution-independent fallback.
