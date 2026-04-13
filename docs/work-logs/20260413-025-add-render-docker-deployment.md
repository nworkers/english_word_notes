# 2026-04-13 Render Docker 배포 구성 추가

## 작업 내용

- Render 배포용 `Dockerfile`을 추가했다.
- 컨테이너 이미지에 `ffmpeg`를 설치하도록 구성했다.
- Render Blueprint용 `render.yaml`을 추가했다.
- 빌드 컨텍스트 최소화를 위해 `.dockerignore`를 추가했다.
- `README.md`, `docs/PROJECT_SPEC.md`, `docs/DESIGN.md`에 Render 배포 경로와 운영 제약을 반영했다.

## 판단 근거

- 현재 앱은 `PDF` 생성, 샘플 파일 조회, `ffmpeg` 기반 이미지 리사이즈 때문에 정적 호스팅보다 Docker 기반 `Node.js` 배포가 더 안전하다.
- `Cloudflare Pages`와 달리 Render Web Service는 현재 서버 구조를 크게 바꾸지 않고 배포 경로를 만들 수 있다.

## 후속 확인 항목

- Render 첫 배포 후 `PDF` 생성과 `XLS` 다운로드가 정상 동작하는지 확인
- 외부에서 접근 불가능한 로컬 `Ollama` 기본값 대신 `Gemini`, `OpenAI`, `Ollama Cloud` 안내가 충분한지 확인
- 무료 플랜 sleep 이후 첫 요청 지연이 UX에 미치는 영향 검토
