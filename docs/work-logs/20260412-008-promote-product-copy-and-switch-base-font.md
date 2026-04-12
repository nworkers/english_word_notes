# 2026-04-12 008 - Promote Product Copy and Switch Base Font

## Summary

- Removed remaining current-state `초안` wording from the active UI and primary docs.
- Switched the app base font to `Noto Sans KR`.
- Kept historical references in older work logs intact, while aligning current product-facing copy to the formal service state.

## Details

- Updated the home hero title so it no longer describes the service as a draft.
- Updated `README.md` and core docs to remove current-state `초안` wording where the product is now considered active/current.
- Kept older work-log entries unchanged because they describe historical implementation stages.
- Added `@fontsource/noto-sans-kr` CSS imports in the app layout.
- Changed the global body font family from serif to `Noto Sans KR` / `Noto Sans` / sans-serif.

## Files

- `app/layout.tsx`
- `app/page.tsx`
- `app/globals.css`
- `README.md`
- `docs/PROJECT_SPEC.md`
- `docs/DESIGN.md`

## Verification

- `npm run build`

## Notes

- Downloaded file names remain unchanged.
- Product-facing wording is now aligned with the formal service name and current implementation level.

## Next

- Consider reviewing smaller UI labels and helper text for the same tone alignment if more branding refinement is needed.
