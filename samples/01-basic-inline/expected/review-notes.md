# 01-basic-inline Expected Draft Review Notes

이 문서는 `samples/01-basic-inline/images/`에 있는 샘플을 실제 OCR로 읽은 뒤, `expected/result.draft.json`에 넣은 초안 데이터를 리뷰하기 위한 메모입니다.

## 작업 기준

- OCR 원문에서 비교적 명확하게 읽힌 항목만 우선 반영했습니다.
- OCR이 흔들린 줄이나 뜻이 깨진 줄은 무리하게 넣지 않았습니다.
- 사용자가 원하는 기준에 맞춰 표제어 중심으로 정리합니다.
- 품사와 뜻은 `senses[]` 안에서 함께 관리합니다.
- 예:

```json
{
  "word": "comfort",
  "senses": [
    { "partOfSpeech": "명사", "meaning": "편안함; 위로, 위안" },
    { "partOfSpeech": "동사", "meaning": "위로하다" }
  ]
}
```

- 유사어, 파생어, 숙어, 예문은 기본적으로 제외합니다.

## 검토가 필요한 항목

### KakaoTalk_20260331_230102798.jpg

- 이 파일은 사용자 피드백을 반영해 `표제어 + 품사 + 뜻` 형식으로 다시 정리했습니다.
- 품사별 뜻 분리를 위해 `partOfSpeech`/`meaning` 단일 필드 대신 `senses[]` 구조로 바꿨습니다.
- `angry`, `in anger`, `a little`, `a little bit`, `comfortable`, `comfort food`, `delighted`, `hungry`, `shocked`, `cool`, `quiet`, `appearance`, `disappointment`, `embarrassed` 등은 파생어, 숙어, 유사어, 관련어로 보고 제외했습니다.

### KakaoTalk_20260331_230102798_01.jpg

- 사용자 기준에 맞춰 표제어 `regret`, `scare`, `cheerful`, `confused`, `crazy`, `curious`, `pleasant`, `silly`, `sincere`, `satisfied`만 남겼습니다.
- `regrettable`, `scared`, `frighten`, `cheer`, `confuse`, `mad`, `go crazy`, `curiosity`, `nice`, `enjoyable`, `friendly`, `sincerely`, `satisfy` 등은 파생어 또는 유사어로 제외했습니다.

### KakaoTalk_20260331_230102798_02.jpg

- 표제어 `barber`, `behavior`, `boss`, `director`, `engineer`, `expert`, `personality`, `option`, `position`, `reporter`만 남겼습니다.
- `barber's`, `behave`, `employer`, `manager`, `direct`, `specialist`, `personal`, `journalist` 등은 관련어로 제외했습니다.

### KakaoTalk_20260331_230102798_03.jpg

- 표제어 `sailor`, `university`, `worker`, `offer`, `remain`, `familiar`, `active`, `principal`, `responsible`, `silent`만 남겼습니다.
- `sail`, `college`, `work`, `propose`, `provide`, `stay`, `continue`, `act`, `responsibility`, `silence` 등은 관련어로 제외했습니다.

### KakaoTalk_20260331_230102798_04.jpg

- 표제어 `ability`, `aim`, `decision`, `difficulty`, `effort`, `experience`, `passion`, `risk`, `vision`, `youth`만 남겼습니다.
- `able`, `decide`, `attempt`, `passionate`, `risky`, `young` 등은 파생어 또는 관련어로 제외했습니다.

### KakaoTalk_20260331_230102798_05.jpg

- 표제어 `achieve`, `encourage`, `focus`, `overcome`, `require`, `succeed`, `challenging`, `impossible`, `positive`, `talented`만 남겼습니다.
- `achievement`, `encouragement`, `focus on`, `requirement`, `successful`, `challenge`, `negative`, `talent` 등은 관련어 또는 파생어로 제외했습니다.

## 다음 리뷰 포인트

- 나머지 이미지들도 같은 기준인 `표제어 + 품사 + 뜻` 형식으로 맞출지 확인 필요
- 나머지 이미지도 같은 기준으로 정리 완료
- 필요하면 다음 단계에서 이 정답셋을 기준으로 OCR 파서 출력 형식도 맞출 수 있습니다.
