# 2026-04-12 014 - Add OpenAI Provider Support

## 변경 내용

- `OpenAI API`를 `Gemini` / `Ollama`와 함께 선택 가능한 추출 공급자로 추가했다.
- `OCR + OpenAI`, `OpenAI Vision only` 모드를 추가했다.
- 설정 팝업에 `OpenAI API Key`, Base URL, 텍스트 모델, Vision 모델, Timeout 입력을 추가했다.
- 설정값은 기존과 동일하게 브라우저 로컬 저장소에 저장되며 추출 요청 시 함께 전달된다.

## 영향 범위

- `app/page.tsx`
- `app/api/extract/route.ts`
- `lib/openai.ts`
- `lib/types.ts`
- `README.md`
- `docs/PROJECT_SPEC.md`
- `docs/DESIGN.md`

## 검증

- `npm run build`
