# 2026-04-12 015 - Add Ollama Cloud Support

## 변경 내용

- `Ollama` 설정에 `API Key`를 추가해 로컬 서버뿐 아니라 `Ollama Cloud`도 사용할 수 있도록 확장했다.
- `Ollama` 요청의 `chat`, `generate`, `vision` 경로에 공통 인증 헤더를 적용했다.
- 설정 팝업에 `Ollama Cloud` 사용 방법 안내를 추가했다.

## 영향 범위

- `app/page.tsx`
- `lib/ollama.ts`
- `lib/types.ts`
- `README.md`
- `docs/PROJECT_SPEC.md`
- `docs/DESIGN.md`

## 검증

- `npm run build`
