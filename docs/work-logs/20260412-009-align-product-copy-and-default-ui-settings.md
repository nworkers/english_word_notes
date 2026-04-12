# 2026-04-12 009 - Align Product Copy and Default UI Settings

## Summary

- Finalized the current product-facing copy so the app no longer presents itself as a draft.
- Applied `Noto Sans KR` as the base UI font.
- Changed the default extraction mode to `Ollama Vision only`.
- Shortened the main hero title for a cleaner first impression.

## Details

- Updated visible product copy to use the formal service name `영단어 연습노트`.
- Removed current-state `초안` wording from active UI and primary docs.
- Added `@fontsource/noto-sans-kr` imports in the app layout and switched the base body font from serif to `Noto Sans KR`.
- Changed the default selected extraction mode from `OCR only` to `Ollama Vision only`.
- Removed the artificial width cap on the hero headline so it no longer wraps awkwardly.
- Changed the main hero title from the longer descriptive sentence to `암기용 단어장 만들기`.

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

- Downloaded export filenames remain unchanged.
- Historical work logs that reference draft stages were left unchanged because they document past decisions, not the current product state.

## Next

- Consider applying the same shorter, product-ready copy style to smaller helper texts if further branding cleanup is needed.
