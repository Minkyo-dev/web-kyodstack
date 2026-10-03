# 0026 — Visual refresh: tinted neutrals, one indigo accent, native select styling

- Status: accepted; §3 accent superseded by ADR 0045 (brand colors)
- Date: 2026-10-01

## Context
Native `<select>` options were unreadable: the app forces `.dark` but never set `color-scheme`, so the browser drew a
light popup and the options inherited the light foreground. The user also asked for a more modern, still restrained,
easy-to-use look.

## Decisions
1. **`color-scheme`** is set on `:root` (light) and `.dark` (dark), so native popups, date/time pickers and scrollbars
   follow the theme. `option`/`optgroup` also get popover colors explicitly.
2. **One shared native select style**: `src/components/ui/native-select.ts` (`nativeSelectClass`,
   `nativeSelectSmClass`) plus the `native-select` utility in `globals.css` (appearance-none, theme chevron). Feature
   code imports it instead of defining its own `selectClass` string.
3. **Tokens** (`globals.css`): neutrals carry a faint cool tint (hue 265); one indigo accent for `primary`, `ring`
   and `sidebar-primary` (spec §14.4 "neutral / blue accent"). White on `primary` is ≥ 5:1 (WCAG AA). State colors are
   unchanged.
4. **Primitives follow spec §14.2 radii**: buttons/inputs/selects `rounded-md` (≈6px), small controls/badges
   `rounded-sm`, cards/dialogs/popovers `rounded-lg` (8px). Controls get `shadow-xs`, a hover border and a softer
   focus ring; primary buttons now have a hover state. Dialog/sheet overlays are a plain dim (no blur).
5. **Shell**: sidebar uses the `sidebar` surface, is sticky on desktop, and marks the active item with background,
   an accent bar and an accent icon (not color alone). `--font-sans` now points at the `next/font` Geist variable with
   Korean fallbacks (it previously named a family that `next/font` never registers).

## Consequences
- New native selects should use `nativeSelectClass`; the Base UI `Select` remains for non-form pickers.
