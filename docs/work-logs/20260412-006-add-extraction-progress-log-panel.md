# 2026-04-12 006 - Add Extraction Progress and Log Panel

## Summary

- Added a progress bar and activity log panel so users can observe extraction flow end-to-end.
- Reworked `/api/extract` into a tracked background job flow with polling-based status updates.
- Connected OCR and Ollama stages to emit progress and log messages during processing.

## Details

- Added an in-memory extraction job store with:
  - job id generation
  - status tracking
  - progress percentage
  - current stage label
  - rolling activity logs
- Changed `POST /api/extract` to create a background job and return a `jobId`.
- Added `GET /api/extract?jobId=...` so the client can poll current job state.
- Updated OCR flow to report:
  - file preparation
  - OCR worker initialization
  - image preprocessing
  - per-variant OCR recognition
  - result merge/finalization
- Updated Ollama post-processing and vision-only paths to report stage changes and parsing progress.
- Added a dedicated progress/log panel on the home screen with:
  - current stage text
  - progress bar
  - rolling log output
  - processed file count
  - remaining step count

## Files

- `app/api/extract/route.ts`
- `app/page.tsx`
- `app/globals.css`
- `lib/extraction-jobs.ts`
- `lib/ocr.ts`
- `lib/ollama.ts`
- `README.md`
- `docs/PROJECT_SPEC.md`
- `docs/DESIGN.md`

## Verification

- `npm run build`

## Notes

- The current implementation uses polling plus an in-memory server store, which is sufficient for local/single-process use.
- If the app is later deployed across multiple instances, job state storage will need a shared backing store.

## Next

- Consider adding a visible completion summary in the log panel after export-ready results are prepared.
- Consider adding per-file progress counts for multi-image OCR batches if users want even more granular feedback.
