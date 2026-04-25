# 2026-04-25 002 - Stabilize PDF Header Layout And Fit Table Text

## 변경 내용

- PDF 상단 제목, 페이지 정보, 하단 요약 글자 크기를 기존 안정적인 크기로 되돌려 레이아웃 겹침을 해소했다.
- 테이블 내부 글자 크기는 유지하되, 칸 폭을 넘길 때는 말줄임표 대신 폰트 크기를 단계적으로 줄여 셀 안에 맞추도록 변경했다.

## 영향 범위

- `lib/memory-note-export.ts`
- `docs/work-logs/20260425-002-stabilize-pdf-header-layout-and-fit-table-text.md`

## 검증

- `npm run build`
