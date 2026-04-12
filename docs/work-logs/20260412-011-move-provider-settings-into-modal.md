# 2026-04-12 011 - Move Provider Settings Into Modal

## 변경 내용

- 홈 화면에 직접 노출되던 `Ollama` / `Gemini` 설정 폼을 별도 팝업으로 이동했다.
- 메인 업로드 영역에는 설정 요약과 `설정 열기` 버튼만 남겨 화면 복잡도를 줄였다.
- 설정값은 기존과 동일하게 브라우저 로컬 저장소에 유지되며, 추출 요청 시 그대로 서버에 전달된다.
- `Esc`, 배경 클릭, 닫기 버튼으로 팝업을 닫을 수 있도록 기본 상호작용을 정리했다.

## 영향 범위

- `app/page.tsx`
- `app/globals.css`
- `README.md`
- `docs/PROJECT_SPEC.md`
- `docs/DESIGN.md`

## 검증

- `npm run build`
