# 2026-04-12 013 - Add Editable Export Title

## 변경 내용

- OCR 결과를 바탕으로 자동 생성된 제목을 결과 화면에서 직접 수정할 수 있도록 입력 필드를 추가했다.
- 사용자가 수정한 제목은 `PDF`와 `XLS` 내보내기 제목에 그대로 반영된다.
- 자동 제목이 기본값으로 들어가므로 사용자는 필요할 때만 손쉽게 덮어쓸 수 있다.

## 영향 범위

- `app/page.tsx`
- `app/globals.css`
- `README.md`
- `docs/PROJECT_SPEC.md`
- `docs/DESIGN.md`

## 검증

- `npm run build`
