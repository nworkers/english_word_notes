# 2026-06-02 Gemini URL Error Diagnostics

## 변경 사항

- Gemini Vision 호출 직전에 API Key를 마스킹한 실제 호출 URL, 모델명, timeout, 파일 수, 총 바이트 수를 작업 로그에 남기도록 했다.
- Gemini HTTP 실패 메시지에 마스킹된 URL, 상태 코드, 응답 본문 요약을 포함하도록 했다.
- 503 응답에는 Gemini 서비스 과부하/다운 가능성과 큰 이미지 요청 가능성을 원인 후보로 함께 기록한다.
- Gemini timeout 또는 네트워크 연결 실패에도 마스킹된 URL이 포함되도록 했다.
- README, 프로젝트 사양, 설계 문서에 Gemini 실패 진단 로그 동작을 반영했다.

## 검증

- `npm run build`
