# Sample Test Cases

이 디렉토리는 Vision 기반 단어-뜻 추출 품질을 확인하기 위한 샘플 이미지 테스트 케이스를 저장하는 공간입니다. 현재 샘플 데이터는 웹 미리보기뿐 아니라 `PDF` / `XLS` 내보내기 검증의 입력 데이터로도 사용됩니다.

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
- `expected/result.json`의 항목 순서는 문제지 원본 번호와 정답지 번호의 기준이 됩니다.
- 각 케이스의 `README.md`에는 테스트 의도와 확인 포인트를 남깁니다.

## 케이스 분류

- `01-inline-word-meaning`
  한 줄 안에 `word : meaning` 형태로 정리된 케이스
- `02-multiline-word-meaning`
  단어와 뜻이 줄바꿈으로 나뉘어 있는 케이스

## 기대 결과 파일 예시

`expected/result.json`

```json
{
  "case": "01-inline-word-meaning",
  "status": "final",
  "source": "sample",
  "files": [
    {
      "fileName": "01.jpg",
      "entries": [
        {
          "word": "apple",
          "senses": [{ "partOfSpeech": "n.", "meaning": "사과" }]
        }
      ]
    }
  ]
}
```

또는 `expected/notes.md`

```md
# 기대 결과

- apple -> 사과
- bridge -> 다리
```
