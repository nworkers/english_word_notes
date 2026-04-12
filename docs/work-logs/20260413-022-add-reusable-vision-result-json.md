# 2026-04-13 022 - Add Reusable Vision Result JSON

## 변경 내용

- 결과 화면에서 현재 Vision 추출 결과를 JSON 파일로 저장할 수 있게 했다.
- 저장한 결과 JSON을 다시 업로드해 Vision 추출을 재실행하지 않고 결과를 복원할 수 있게 했다.
- 저장 포맷에는 추출 결과뿐 아니라 반복 회차와 내보내기 제목도 함께 포함되도록 했다.
- 저장된 자체 스냅샷 외에도 `ExtractionResponse` 형태와 샘플 `expected/result.json` 형태를 불러올 수 있게 했다.

## 영향 범위

- `app/page.tsx`
- `app/globals.css`
- `lib/types.ts`
- `README.md`
- `docs/PROJECT_SPEC.md`
- `docs/DESIGN.md`
- `docs/work-logs/20260413-022-add-reusable-vision-result-json.md`

## 검증

- `npm run build`
