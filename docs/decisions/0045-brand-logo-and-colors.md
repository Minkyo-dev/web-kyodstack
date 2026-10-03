# 0045 — Brand: the Kyodstack logo and its colors

- Status: accepted
- Date: 2026-10-02
- Supersedes: ADR 0026 §3 (the indigo accent). Its other decisions still hold.
- Brand guide (the meaning of the symbol, the palette, usage): `docs/brand.md`

## Context
The owner made a logo, `public/web-kyodstack-logo.png`: a 1254² RGBA mark on a transparent background. It is to be
the favicon, the logo everywhere, and the source of the project's main colors. Until now the site used a "K" letter
tile and an indigo accent (ADR 0026).

## Decisions
1. **The master file is `public/web-kyodstack-logo.png`.**
   - Every derived asset comes from `node scripts/brand-assets.mjs` (sharp). Never hand-edit a generated file.
     Re-run the script whenever the master changes.
2. **The palette** is the logo's three colors, as tokens in `globals.css` that are the same in both themes:

   | token | hex | oklch | role |
   |---|---|---|---|
   | `--brand-ink` | `#1b2029` | `0.243 0.019 262` | the dark mass of the mark; the light-theme accent |
   | `--brand` | `#75b2c7` | `0.73 0.07 222` | the blue spine; the **main color**, and the accent in the dark theme (the app's default) |
   | `--brand-soft` | `#dee8f2` | `0.926 0.017 248` | the pale band; soft surfaces |

   Tailwind exposes them as `bg-brand`, `text-brand-ink`, `bg-brand-soft` and so on.
3. **The semantic tokens map onto the palette.**
   - **Dark theme (the default):**
     - `primary` and `sidebar-primary` are `--brand`, with `--brand-ink` text on them (contrast 7:1).
     - `ring` is `--brand`.
   - **Light theme:**
     - `primary` and `sidebar-primary` are `--brand-ink`, with white text on them (16:1).
     - `ring` is a deeper `--brand`, `oklch(0.563 0.074 223)`, which is 4.5:1 on white. `--brand` itself is only
       2.3:1 on white, so it is never used for text or controls on light surfaces.
   - **Accent surfaces** use the soft hue (248). **Neutrals** keep a faint tint, now on the ink's hue (262 instead
     of 265).
   - **State colors are unchanged** (success, warning, planned, ai, income, expense). The brand is not a status
     color (spec §14.4).
4. **Logo usage:** the `LogoMark` component (`src/components/brand/logo.tsx`), always next to the visible name, and
   decorative (`aria-hidden`).
   - On light surfaces it shows `public/brand/logo-mark.png` (the original colors).
   - On dark surfaces it shows `public/brand/logo-mark-on-dark.png`, where the ink parts become `#f4f7fa` so the
     shape stays readable. The two blues stay.
   - It is used in the private sidebar, the public header and the login card.
5. **Icons:**
   - **Favicon:** `src/app/favicon.ico` (16/32/48) and `src/app/icon.png` (512). Both show the original colors on a
     white rounded tile, which reads on light and on dark tab strips.
   - **Installed app** (ADR 0043): `public/icons/{apple-touch-icon,icon-192,icon-512}.png` use an opaque white
     square. The maskable icon keeps the mark inside the 80% safe zone.
   - **Notification badge:** `badge-72.png` is a white silhouette.
   - **Manifest:** `theme_color` and `background_color` are `--brand-ink`.

## Consequences
- Buttons, focus rings, active tabs and the selection highlight change from indigo to brand blue (dark) or ink
  (light).
- A future logo change is one file plus one script run. Any color change goes through the three brand tokens.
