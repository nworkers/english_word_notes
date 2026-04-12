# 2026-04-12 017 - Improve Ollama Vision Error Logging

## 변경 내용

- `Ollama Vision` 시작 시 처리 로그에 `baseUrl`, 모델명, 타임아웃 값을 함께 남기도록 보강했다.
- `this operation was aborted`처럼 모호하게 보이던 오류를 `타임아웃/중단`, `서버 연결 실패`, `HTTP 응답 실패`로 구분해 더 자세한 메시지로 변환했다.
- `HTTP` 실패 시 응답 본문 일부를 함께 기록해 원인 파악이 쉽도록 조정했다.

## 영향 범위

- `app/api/extract/route.ts`
- `lib/ollama.ts`

## 검증

- `npm run build`
