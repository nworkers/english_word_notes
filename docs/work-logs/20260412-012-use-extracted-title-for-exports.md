# 2026-04-12 012 - Use Extracted Title For Exports

## 변경 내용

- `PDF` 상단 보조 문구에서 추출 모드 표기를 제거했다.
- OCR 원문과 추출 결과를 바탕으로 문서 제목을 자동 생성하는 규칙을 추가했다.
- 적절한 제목을 찾지 못하면 추출 단어 목록이나 파일명 기준으로 자연스럽게 폴백한다.
- `XLS` 문서 메타데이터 제목도 동일한 자동 제목을 사용하도록 맞췄다.

## 영향 범위

- `app/page.tsx`
- `lib/memory-note.ts`
- `lib/memory-note-export.ts`
- `lib/types.ts`
- `README.md`
- `docs/PROJECT_SPEC.md`
- `docs/DESIGN.md`

## 검증

- `npm run build`
