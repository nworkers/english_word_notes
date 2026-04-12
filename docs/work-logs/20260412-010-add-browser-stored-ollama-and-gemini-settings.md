# 2026-04-12 010 - Add Browser-Stored Ollama and Gemini Settings

## Summary

- Added browser-stored provider settings for both `Ollama` and `Gemini`.
- Added `Gemini` support for both OCR post-processing and vision-only extraction flows.
- Wired the web UI to persist provider settings locally and send them with extraction requests.

## Details

- Added a settings panel on the home page for:
  - Ollama base URL
  - Ollama text model
  - Ollama vision model
  - Ollama timeout
  - Gemini API key
  - Gemini base URL
  - Gemini text model
  - Gemini vision model
  - Gemini timeout
- Stored provider settings in browser `localStorage`.
- Added new extraction modes:
  - `OCR + Gemini`
  - `Gemini Vision only`
- Updated the extract API to accept provider settings from the browser and use them during the job.
- Added a new Gemini integration module using the Gemini REST API with JSON-only responses.
- Updated the Ollama integration so it can use runtime settings from the browser rather than only environment variables.

## Files

- `app/page.tsx`
- `app/globals.css`
- `app/api/extract/route.ts`
- `lib/gemini.ts`
- `lib/ollama.ts`
- `lib/types.ts`
- `README.md`
- `docs/PROJECT_SPEC.md`
- `docs/DESIGN.md`

## Verification

- `npm run build`

## Notes

- Gemini API keys are stored in browser local storage as requested, so this setup is best suited to a trusted local/personal environment.
- Download file names were intentionally left unchanged.

## Next

- Consider adding a provider connection test button in the settings panel.
- Consider masking or optionally clearing stored Gemini credentials from the UI.
