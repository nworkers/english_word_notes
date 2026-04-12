# 01-basic-inline Verification Report

이 문서는 `samples/01-basic-inline/images/` 원본 이미지와 `expected/result.json`을 직접 대조해 검수한 결과입니다.

## 검수 기준

- 표제어만 포함되어 있는지 확인
- 품사와 뜻이 `senses[]` 안에서 올바르게 분리되어 있는지 확인
- 유사어, 파생어, 숙어, 예문이 정답셋에서 제외되어 있는지 확인
- 이미지에 보이는 표제어 수와 `result.json`의 항목 수가 일치하는지 확인

## 검수 결과

### KakaoTalk_20260331_230102798.jpg

- 상태: 일치
- 확인 내용:
  - 표제어 10개가 모두 반영됨
  - `comfort`, `delight`, `shock`, `calm`의 다품사 뜻 분리가 이미지와 일치함
  - `angry`, `in anger`, `a little`, `comfortable`, `comfort food`, `appearance`, `disappointment` 등 관련 표현은 제외되어 있음

### KakaoTalk_20260331_230102798_01.jpg

- 상태: 일치
- 확인 내용:
  - 표제어 10개가 모두 반영됨
  - `regret`, `scare`는 동사/명사 뜻 분리가 이미지와 일치함
  - `regrettable`, `scared`, `frighten`, `mad`, `go crazy`, `curiosity`, `nice`, `satisfy` 등 관련 표현은 제외되어 있음

### KakaoTalk_20260331_230102798_02.jpg

- 상태: 일치
- 확인 내용:
  - 표제어 10개가 모두 반영됨
  - `expert`는 명사/형용사 뜻 분리가 이미지와 일치함
  - `barber's`, `behave`, `employer`, `manager`, `direct`, `specialist`, `journalist` 등 관련 표현은 제외되어 있음

### KakaoTalk_20260331_230102798_03.jpg

- 상태: 일치
- 확인 내용:
  - 표제어 10개가 모두 반영됨
  - `offer`, `principal`의 다품사 뜻 분리가 이미지와 일치함
  - `sail`, `college`, `work`, `propose`, `provide`, `stay`, `continue`, `responsibility`, `quiet` 등 관련 표현은 제외되어 있음

### KakaoTalk_20260331_230102798_04.jpg

- 상태: 일치
- 확인 내용:
  - 표제어 10개가 모두 반영됨
  - `aim`, `experience`, `risk`의 다품사 뜻 분리가 이미지와 일치함
  - `able`, `goal`, `target`, `take aim at`, `attempt`, `passionate`, `risky`, `young` 등 관련 표현은 제외되어 있음

### KakaoTalk_20260331_230102798_05.jpg

- 상태: 일치
- 확인 내용:
  - 표제어 10개가 모두 반영됨
  - `focus`는 동사/명사 뜻 분리가 이미지와 일치함
  - `achievement`, `encouragement`, `concentrate`, `focus on`, `requirement`, `successful`, `negative`, `talent` 등 관련 표현은 제외되어 있음

## 종합 판단

- 현재 `result.json`은 `01-basic-inline` 샘플 이미지와 비교했을 때 의도한 정답셋 기준에 맞게 정리되어 있음
- 눈으로 확인한 범위에서 수정이 필요한 불일치는 발견하지 못함
- 따라서 이 케이스의 확정 기대 결과로 사용 가능함
