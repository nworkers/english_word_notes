# 작업 기록

- 일시: 2026-04-11
- 작업자: Codex
- 작업 내용: 사용자 리뷰를 반영해 `01-basic-inline` 기대 결과 초안의 정리 기준을 수정함

## 반영한 기준

- 정답 데이터는 `표제어 + senses[]` 형식으로 기록
- `senses[]` 안에서 품사별 뜻을 분리해 기록
- 유사어, 파생어, 숙어, 예문은 기본적으로 제외
- 표제어 자체가 여러 품사를 가지는 경우 각 품사를 별도 sense로 분리

## 이번 수정 대상

- `samples/01-basic-inline/expected/result.draft.json`
- `samples/01-basic-inline/expected/review-notes.md`

## 수정 내용

- `KakaoTalk_20260331_230102798.jpg` 항목을 사용자 예시에 맞춰 재정리
- `comfort`, `delight`, `shock`, `calm` 등 다품사 표제어를 품사별 뜻으로 분리
- 파생어와 관련 표현을 정답셋에서 제외
- 전체 JSON 구조를 `senses[]` 기반으로 변경
- 이어서 나머지 이미지들도 같은 기준으로 정리함

## 다음 할 일

- 나머지 이미지도 같은 정리 기준으로 맞출지 사용자 리뷰 후 확정
- 기준이 확정되면 전체 `result.draft.json`을 일괄 재정리
