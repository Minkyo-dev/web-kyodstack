# 0030 — Korean webfont (Pretendard)

- Status: accepted
- Date: 2026-10-01

## Context
The UI is Korean, but Geist has no Hangul glyphs. Hangul therefore fell back to whatever the OS had (Malgun Gothic,
Apple SD Gothic Neo, Noto Sans KR or another font), so it looked different on each device, and its weights did not
match the design. The font stack already named "Pretendard", but only a locally installed copy could match it.

## Decisions
1. Pretendard comes from the `pretendard` npm package (1.3.9, exact pin, OFL-1.1) and is self-hosted. No CDN is
   involved.
2. We use its **variable dynamic-subset** build (`pretendardvariable-dynamic-subset.css`), imported in the root
   layout before `globals.css`.
   - Hangul is split into about 92 `unicode-range` chunks, and the browser downloads only the chunks for characters
     a page renders. The login page loads 8.
   - One variable font covers every weight (45–920).
   - The full single-file font (~2 MB) would be preloaded on every page, so we do not use it.
3. **Geist stays first** in `--font-sans`, so Latin letters and digits (including `tabular-nums` amounts) keep the
   current look. Pretendard Variable handles Hangul, and the OS fonts remain as the last fallback.

## Consequences
- The build copies the subset woff2 files to `.next/static/media` (~100 files). They are served from our own origin.
- `font-display: swap`: until a chunk arrives, Hangul shows briefly in an OS font.
- The package is about 97 MB unpacked in `node_modules`. This affects only install and build time, not what is
  shipped to users.
