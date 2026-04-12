# 작업 기록

- 일시: 2026-04-11
- 작업자: Codex
- 작업 내용: OCR 샘플 이미지와 기대 결과를 유형별로 정리할 수 있는 테스트 케이스 디렉토리 구조를 생성함

## 생성한 디렉토리

- `samples/01-basic-inline`
- `samples/02-basic-multiline`
- `samples/03-mixed-layout`
- `samples/04-low-quality`
- `samples/05-handwritten-notes`
- `samples/06-edge-cases`

각 디렉토리에는 다음 구조를 포함함

- `images/`
- `expected/`
- `README.md`

## 목적

- OCR 품질을 입력 유형별로 비교하기 쉽게 하기 위함
- 파싱 규칙 수정 전후 결과를 케이스별로 반복 검증하기 위함
- 실제 샘플 파일과 기대 결과를 함께 관리하기 위함

## 다음 할 일

- 사용자가 각 유형에 맞는 샘플 이미지를 추가
- 케이스별 기대 결과를 `expected/`에 기록
- OCR 결과와 기대 결과를 비교하는 검증 흐름 설계
