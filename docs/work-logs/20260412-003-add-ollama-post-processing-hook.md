# 2026-04-12 003 - Add Ollama Post Processing Hook

## Summary

- Added optional `Ollama` post-processing on top of the OCR extraction flow.
- Implemented a local `Ollama` chat client with strict JSON parsing and schema normalization.
- Updated the extraction route so it can fall back to OCR-only results if `Ollama` is unavailable.
- Documented the required environment variables in the project README.

## Files

- `lib/ollama.ts`
- `app/api/extract/route.ts`
- `README.md`

## Verification

- `npx tsc --noEmit --pretty false` passed
- `npm run build` passed

## Notes

- The current WSL shell could not directly reach the Windows-side `Ollama` process during verification.
- The integration is designed to work once a reachable `OLLAMA_BASE_URL` is configured.
