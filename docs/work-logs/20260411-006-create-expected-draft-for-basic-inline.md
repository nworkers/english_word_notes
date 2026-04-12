# 작업 기록

- 일시: 2026-04-11
- 작업자: Codex
- 작업 내용: `samples/01-basic-inline` 샘플 이미지에 대해 OCR을 실행하고 `expected` 초안 데이터를 작성함

## 이번 작업에서 한 일

- `samples/01-basic-inline/images/`에 있는 이미지 6장을 대상으로 OCR 실행
- OCR 원문을 바탕으로 고신뢰 단어-뜻 쌍을 정리
- `expected/result.draft.json`에 리뷰용 초안 데이터 작성
- 애매한 줄과 제외한 항목을 `expected/review-notes.md`에 정리

## 결과물

- `samples/01-basic-inline/expected/result.draft.json`
- `samples/01-basic-inline/expected/review-notes.md`

## 메모

- OCR 언어 데이터 다운로드가 필요해 외부 접근이 한 번 필요했음
- 일부 줄은 OCR 인식 품질 때문에 의미가 불안정했음
- 현재 결과는 검토 전 단계의 초안이며, 사용자 리뷰 후 보정이 필요함
