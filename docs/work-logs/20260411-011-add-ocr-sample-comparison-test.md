# 2026-04-11 011 - Add OCR Sample Comparison Test

## Summary

- Added a repeatable OCR comparison script for the `01-basic-inline` sample case.
- Wired a package script to run `tesseract.js` against the sample images and compare the structured output with `samples/01-basic-inline/expected/result.json`.
- Generated comparison reports to inspect missing entries, unexpected entries, and OCR raw text previews per image.

## Files

- `lib/ocr.ts`
- `package.json`
- `scripts/verify-ocr-sample-case.ts`
- `samples/01-basic-inline/expected/ocr-comparison-report.json`
- `samples/01-basic-inline/expected/ocr-comparison-report.md`

## Notes

- The current OCR comparison showed a large gap from the expected result set.
- Summary at the time of execution:
  - Files: 6
  - Expected entries: 60
  - Actual entries: 30
  - Matched entries: 0
  - Missing entries: 60
  - Unexpected entries: 30
- This indicates the current parser still needs refinement for noisy inline vocabulary images.
