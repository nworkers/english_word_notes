# 2026-04-13 024 - Maximize Answer Space And Increase Prompt Size

## 변경 내용

- 문제지 표에서 문제 영역을 한 단계 더 압축해 답안 칸을 거의 최대치까지 넓혔다.
- 번호 칸과 셀 내부 여백을 더 줄여 왼쪽 문제 영역의 빈 공간을 최소화했다.
- 대신 문제 글자 크기는 조금 키워서 답안 칸 확대 후에도 읽기성을 유지하도록 조정했다.
- 이 조정을 화면 미리보기, PDF, XLS에 함께 반영했다.

## 영향 범위

- `app/globals.css`
- `lib/memory-note-export.ts`
- `README.md`
- `docs/PROJECT_SPEC.md`
- `docs/DESIGN.md`
- `docs/work-logs/20260413-024-maximize-answer-space-and-increase-prompt-size.md`

## 검증

- `npm run build`
