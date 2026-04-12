# 2026-04-12 005 - Rework Memory Note Exports and Remove Print Page

## Summary

- Replaced the browser print-oriented flow with downloadable `PDF` and `XLS` exports.
- Reworked the practice sheet layout into a monochrome A4-friendly table format.
- Added original-order numbering, repeating headers, and an answer-key section for export review.
- Added per-mode practice round controls so users can generate multiple full practice passes.
- Removed the separate `/print` page after export-based workflow became the primary path.

## Details

- Added server-side export routes for `PDF` and `XLS` generation and wired the home screen to download them directly.
- Implemented Korean-capable PDF text rendering with font fallback handling so mixed Korean/English content remains legible.
- Iterated the PDF worksheet layout to use:
  - white background and black-only print styling
  - table-style row grouping instead of per-item rounded boxes
  - `30` rows per page
  - split header cells for `번호 | 문항 | 답안`
  - blank answer area without per-row labels/underlines
- Changed problem numbering to follow the original extracted vocabulary order so it matches the answer key.
- Appended answer-key pages to the end of the PDF using the original vocabulary order.
- Updated the XLS export to mirror the PDF structure:
  - `번호 | 문항 | 답안` sheets for practice pages
  - blank answer column
  - final `정답지` sheet with `번호 | 단어 | 뜻`
  - A4-oriented print settings, fit-to-page options, and repeated header rows
- Added UI controls to choose how many full rounds to generate for:
  - `단어를 보고 뜻 쓰기`
  - `뜻을 보고 단어 쓰기`
- Allowed `0` rounds so a practice mode can be excluded entirely from export.
- Removed the legacy print-only route and its dedicated styles.

## Files

- `app/page.tsx`
- `app/globals.css`
- `app/api/export/pdf/route.ts`
- `app/api/export/xls/route.ts`
- `lib/memory-note.ts`
- `lib/memory-note-export.ts`
- `lib/types.ts`
- `app/print/page.tsx` (removed)
- `package.json`
- `package-lock.json`

## Verification

- `npm run build`

## Notes

- Export behavior now follows the on-screen preview structure so the generated files match the configured rounds and ordering.
- The answer key remains based on original extraction order even when practice sections are reshuffled by round.

## Next

- Consider surfacing answer-key inclusion as an explicit export option if users want worksheet-only output.
- Consider adding clearer labels such as `1차`, `2차`, `3차` in XLS sheet names if multi-round exports grow larger.
