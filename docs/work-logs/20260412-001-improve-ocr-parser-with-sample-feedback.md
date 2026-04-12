# 2026-04-12 001 - Improve OCR Parser With Sample Feedback

## Summary

- Refined the OCR parser using the `01-basic-inline` sample comparison report.
- Switched parsing to a block-based approach that groups a headword line with its follow-up lines.
- Added heuristics to reduce false positives from derivative/example lines and infer part of speech from Korean meanings.
- Updated TypeScript configuration so local OCR verification scripts do not break type checking.

## Files

- `lib/ocr.ts`
- `tsconfig.json`
- `samples/01-basic-inline/expected/ocr-comparison-report.json`
- `samples/01-basic-inline/expected/ocr-comparison-report.md`

## Result

- OCR comparison summary after the parser update:
  - Files: 6
  - Expected entries: 60
  - Actual entries: 74
  - Matched entries: 7
  - Missing entries: 53
  - Unexpected entries: 67
- Build verification:
  - `npx tsc --noEmit --pretty false` passed
  - `npm run build` passed

## Notes

- Exact-match quality improved from the prior run, but the result is still far from the target quality for `01-basic-inline`.
- The main remaining issues are:
  - OCR noise inside headword lines
  - Synonym/derivative lines being partially mistaken for target meanings
  - Incomplete or distorted part-of-speech hints in the source images
