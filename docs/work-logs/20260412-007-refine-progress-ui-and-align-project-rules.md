# 2026-04-12 007 - Refine Progress UI and Align Project Rules

## Summary

- Expanded the extraction progress UI to show processed file counts and remaining steps.
- Renamed the user-facing product name to `영단어 연습노트`.
- Changed the default practice round counts to `3` for both worksheet types.
- Added a repository-level `AGENTS.md` that defines the operating rules for future coding-agent work.

## Details

- Extended extraction job state to track:
  - total files
  - processed files
  - total steps
  - current step
- Updated OCR and Ollama progress callbacks to emit structured step/file progress, not only text logs.
- Updated the home screen progress panel so users can see:
  - current stage
  - percentage progress
  - processed file count
  - remaining step count
  - rolling activity logs
- Renamed visible product labels and metadata from the old English project name to `영단어 연습노트`.
- Kept generated download filenames unchanged as requested.
- Set both default round selectors to `3` after result generation and on initial state.
- Added `AGENTS.md` with project rules covering:
  - PDF/XLS-centered workflow
  - original-order numbering
  - answer-key requirements
  - round-based worksheet generation
  - documentation update expectations

## Files

- `AGENTS.md`
- `app/api/extract/route.ts`
- `app/layout.tsx`
- `app/page.tsx`
- `app/globals.css`
- `lib/extraction-jobs.ts`
- `lib/ocr.ts`
- `lib/ollama.ts`
- `lib/memory-note-export.ts`
- `README.md`
- `docs/PROJECT_SPEC.md`
- `docs/DESIGN.md`

## Verification

- `npm run build`

## Notes

- Progress tracking still uses an in-memory job store, so it is best suited to local or single-instance execution.
- The new `AGENTS.md` should be treated as the primary working rulebook for future repository changes.

## Next

- Consider showing a short completion summary in the progress panel after extraction succeeds.
- Consider persisting job history if the app later needs multi-user or multi-instance robustness.
