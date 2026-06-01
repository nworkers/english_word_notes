# 2026-06-02 Persist Selected Extraction Mode

## 변경 사항

- 마지막으로 선택한 추출 모드를 `localStorage`에 저장하고 새로고침 후 복원하도록 했다.
- 저장된 추출 모드 값이 지원하지 않는 값이면 제거하고 기본값을 사용하도록 했다.
- 초기 로컬 저장값을 읽기 전 기본 설정이 다시 저장되지 않도록 provider 설정과 추출 모드 저장 effect를 hydration 이후로 제한했다.
- README, 프로젝트 사양, 설계 문서에 추출 모드 유지 동작을 반영했다.

## 검증

- `npm run build`
