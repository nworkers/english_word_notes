# 2026-04-13 023 - Expand Answer Space In Exports

## 변경 내용

- 화면 미리보기의 문제지 표에서 `답안` 칸 비율을 더 넓혔다.
- PDF 문제지 표에서 번호 칸과 문항 칸 폭을 조금 줄이고, 답안 칸 폭을 가능한 크게 늘렸다.
- XLS 문제 시트에서도 `답안` 열 폭을 가장 넓게 조정해 A4 인쇄 시 쓰기 공간을 더 확보했다.

## 영향 범위

- `app/globals.css`
- `lib/memory-note-export.ts`
- `README.md`
- `docs/PROJECT_SPEC.md`
- `docs/DESIGN.md`
- `docs/work-logs/20260413-023-expand-answer-space-in-exports.md`

## 검증

- `npm run build`
