# Sample Test Cases

이 디렉토리는 OCR 및 단어-뜻 파싱 품질을 확인하기 위한 샘플 이미지 테스트 케이스를 저장하는 공간입니다.

## 기본 구조

각 케이스 디렉토리는 아래 구조를 따릅니다.

```text
samples/<case-name>/
├─ images/
├─ expected/
└─ README.md
```

## 사용 원칙

- `images/`에는 실제 테스트할 `jpg`, `jpeg`, `png` 이미지를 넣습니다.
- `expected/`에는 이미지에서 기대하는 추출 결과를 MD 또는 JSON으로 기록합니다.
- 각 케이스의 `README.md`에는 테스트 의도와 확인 포인트를 남깁니다.

## 케이스 분류

- `01-basic-inline`
  한 줄 안에 `word : meaning` 형태로 정리된 쉬운 케이스
- `02-basic-multiline`
  단어와 뜻이 줄바꿈으로 나뉘어 있는 기본 케이스
- `03-mixed-layout`
  이미지 안에 여러 배치 형식이 섞여 있는 케이스
- `04-low-quality`
  흐림, 그림자, 낮은 해상도 등 OCR이 어려운 케이스
- `05-handwritten-notes`
  손글씨 또는 손글씨가 일부 섞인 케이스
- `06-edge-cases`
  특수문자, 중복 단어, 여러 뜻, 불규칙 배치 등 예외 케이스

## 기대 결과 파일 예시

`expected/result.json`

```json
[
  { "word": "apple", "meaning": "사과" },
  { "word": "bridge", "meaning": "다리" }
]
```

또는 `expected/notes.md`

```md
# 기대 결과

- apple -> 사과
- bridge -> 다리
```
