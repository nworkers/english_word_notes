# 2026-04-25 001 - Enlarge PDF Table Text With Same Row Count

## 변경 내용

- PDF 문제지와 정답지의 제목, 표 헤더, 본문 글자 크기를 전반적으로 기존 대비 약 2배 수준으로 키웠다.
- 페이지당 행 수는 그대로 유지하기 위해 표 행 높이와 페이지 분할 기준은 유지하고, 텍스트 기준선만 다시 맞췄다.
- 폭이 부족한 긴 문항은 기존과 동일하게 셀 폭 안에서 줄임표 처리되도록 유지했다.

## 영향 범위

- `lib/memory-note-export.ts`
- `README.md`
- `docs/PROJECT_SPEC.md`
- `docs/DESIGN.md`
- `docs/work-logs/20260425-001-enlarge-pdf-table-text-with-same-row-count.md`

## 검증

- `npm run build`
