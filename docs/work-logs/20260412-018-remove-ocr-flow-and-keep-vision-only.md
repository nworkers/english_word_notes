# 2026-04-12 018 - Remove OCR Flow And Keep Vision Only

## 변경 내용

- `OCR only`, `OCR + Ollama`, `OCR + Gemini`, `OCR + OpenAI` 모드를 제거하고 Vision 추출 전용 흐름만 남겼다.
- `tesseract.js` 의존성, OCR 스크립트, 학습 데이터 파일, OCR 원문 미리보기 UI를 제거했다.
- 추출 API는 `Ollama Vision`, `Gemini Vision`, `OpenAI Vision`만 처리하도록 단순화했다.
- 문서 전반의 설명을 `OCR` 중심에서 `Vision 추출` 중심으로 정리했다.

## 영향 범위

- `app/api/extract/route.ts`
- `app/page.tsx`
- `lib/types.ts`
- `lib/memory-note.ts`
- `package.json`
- `package-lock.json`
- `README.md`
- `docs/PROJECT_SPEC.md`
- `docs/DESIGN.md`

## 검증

- `npm run build`
