# 2026-04-12 016 - Preserve Source Numbering And Limit Exclusion Rules

## 변경 내용

- OCR 및 LLM 추출 결과에 `sourceNumber`를 반영해, 원본 이미지에 보이는 번호를 우선 사용하도록 확장했다.
- 챕터별로 번호가 다시 `1`부터 시작하는 경우 뒤 챕터가 앞 챕터 마지막 번호 다음부터 이어지도록 정규화 로직을 추가했다.
- 문제지와 정답지의 번호 표시는 추출된 원본 번호를 우선 사용하도록 PDF/XLS/미리보기를 맞췄다.
- `Gemini`, `OpenAI`, `Ollama` 프롬프트에서 파생어/유의어/예문 제거 규칙은 뜻 영역에만 적용하고, 단어 영역 표제어는 제거하지 않도록 명시했다.

## 영향 범위

- `app/page.tsx`
- `lib/ocr.ts`
- `lib/gemini.ts`
- `lib/openai.ts`
- `lib/ollama.ts`
- `lib/memory-note-export.ts`
- `lib/types.ts`
- `lib/vocabulary-numbering.ts`
- `README.md`
- `docs/PROJECT_SPEC.md`
- `docs/DESIGN.md`

## 검증

- `npx tsc --noEmit`
- `npm run build`
