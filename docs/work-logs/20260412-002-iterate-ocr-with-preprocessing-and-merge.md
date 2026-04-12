# 2026-04-12 002 - Iterate OCR With Preprocessing And Merge

## Summary

- Continued optimizing the `01-basic-inline` OCR flow.
- Added image preprocessing with `ffmpeg` and merged OCR results from multiple variants.
- Tightened headword-line detection to reduce synonym and derivative noise.
- Added OCR result scoring and merge logic to prefer cleaner senses per headword.

## Files

- `lib/ocr.ts`
- `samples/01-basic-inline/expected/ocr-comparison-report.json`
- `samples/01-basic-inline/expected/ocr-comparison-report.md`

## Result

- Current comparison summary:
  - Files: 6
  - Expected entries: 60
  - Actual entries: 96
  - Matched entries: 22
  - Missing entries: 38
  - Unexpected entries: 74
- Verification:
  - `npx tsc --noEmit --pretty false` passed
  - `npm run build` passed

## Notes

- The current sample accuracy improved materially from the earlier baseline, but it still does not meet the target.
- The remaining gaps are driven by:
  - OCR text corruption in the source scans
  - synonym/derivative lines leaking into the output
  - near-miss meanings that differ by a few corrupted characters or spacing choices
