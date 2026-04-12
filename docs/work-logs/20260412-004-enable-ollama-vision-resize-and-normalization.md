# 2026-04-12 004 - Enable Ollama Vision Resize and Normalization

## Summary

- Added a vision-only extraction path that skips OCR and calls Ollama vision directly.
- Implemented Ollama vision request resizing to avoid timeouts, with env-configurable width/quality.
- Introduced request timeouts for Ollama calls and exposed the timeout via env.
- Improved JSON parsing resilience and comparison normalization to handle OCR/vision formatting variance.
- Added debug helper for single-image vision calls to diagnose model/config issues.

## Details

- Vision-only pipeline now bypasses OCR and operates on image inputs directly when `OLLAMA_VISION_ONLY=true`.
- Images are downscaled (default max width 1024, JPEG quality 4) before sending to Ollama vision.
- Ollama requests use a configurable timeout (`OLLAMA_TIMEOUT_MS`), defaulted to 120s and set to 300s for testing.
- Vision responses that embed JSON as escaped strings are now parsed robustly.
- Comparison normalization now tolerates parentheses/whitespace/punctuation differences, including adjective suffix variants.
- The comparison script skips missing images while recording a warning instead of failing.

## Files

- `lib/ollama.ts`
- `scripts/verify-ocr-sample-case.ts`
- `.env.local`
- `samples/01-basic-inline/expected/ocr-comparison-report.md`
- `samples/01-basic-inline/expected/ocr-comparison-report.json`

## Verification

- `OLLAMA_VISION_ONLY=true npm run test:ocr:basic-inline`
- Single-image vision debug: `node --experimental-strip-types -e "import { debugOllamaVision } from './lib/ollama.ts'; ..."`

## Notes

- Ollama vision responses were timing out on full-size images; resizing resolved the issue.
- Some per-file mismatches remain due to punctuation/bracket formatting and one image abort; test refinement is deferred.

## Next

- Revisit image 04 timeout (increase timeout or further reduce resolution).
- Expand normalization for bracket/semicolon variations if needed.
- Re-run full vision-only suite after final image set is stable.
