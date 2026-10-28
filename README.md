# Instagram Interactive Food Gallery — Phase 2

@hyeoki_foodie의 음식 사진 아카이브를 위한 2D 인터랙티브 갤러리입니다.
기본 모드는 **로컬 예시 이미지 12장을 조합한 Mock 게시물 48개**입니다.
Phase 2의 Instagram 인증·게시물 어댑터를 구현했습니다. 실제 계정 인증과 실데이터 검증은 별도로 필요합니다.
Mock은 실제 Instagram 사진·캡션·작성일이 아니며 식당명·가격·위치를 생성하지 않습니다.

## 실행

Node.js 20.9 이상과 npm이 필요합니다.

```sh
npm ci
npm run dev
```

http://localhost:3000 에서 확인합니다. Phase 1에는 환경변수가 필요 없습니다.

```sh
npm run typecheck
npm run build
npm run start
```

## 구조와 구현

```text
src/app/                  페이지, 메타데이터, 로딩·오류 화면, 공통 스타일
src/components/gallery/   Gallery, Photo, Detail, useCamera
src/lib/gallery/          타일 배치, 카메라 경계·줌·가시성 계산
src/lib/data/             Mock 게시물과 서버 전용 데이터 접근 계층
src/types/gallery.ts      게시물·미디어·저장소 인터페이스
public/images/            로컬 음식 예시 사진
tests/                    배치 및 브라우저 동작 검증
```

- Next.js App Router, TypeScript, Tailwind CSS, GSAP을 사용합니다. Three.js나 별도 백엔드·DB는 사용하지 않습니다.
- 가상의 큰 2D 공간에 다양한 크기의 타일을 겹치지 않게 배치합니다. 사진은 `object-fit: contain`으로 원본 비율을 유지합니다.
- 드래그·관성 이동, 커서 중심 휠 줌, 모바일 드래그·핀치 줌, 이동·배율 제한을 지원합니다.
- GSAP ticker에서 CSS `translate3d`와 `scale`을 갱신합니다. React에는 가시 영역 변경에 필요한 상태만 전달하고, 사진 컴포넌트는 메모이제이션합니다.
- 화면 밖 타일은 여유 영역을 제외하고 마운트하지 않습니다. Next Image의 크기별 최적화·지연 로딩을 사용하며 상세 사진만 우선 로드합니다.
- 사진 선택 시 GSAP 확대 애니메이션과 함께 예시 캡션·날짜가 나타납니다. 캐러셀은 버튼 또는 좌우 방향키로 탐색합니다.
- 닫기·ESC·배경 클릭으로 복귀하며 카메라 위치·줌과 키보드 포커스를 복원합니다.
- 갤러리에 포커스를 둔 상태에서 방향키로 이동, `+`/`-`로 줌, `Home`으로 초기화합니다. Tab·Enter로 사진을 열 수 있습니다.
- `prefers-reduced-motion`에서는 관성과 전환 애니메이션을 생략합니다. 이벤트·ResizeObserver·GSAP 효과는 해제 시 정리합니다.

## 브라우저 검증

### Instagram 이미지 다운로드 캐시

Instagram 모드에서는 계정과 미디어 ID로 고정된 이미지 주소를 만들고, 원본을 `.gallery-image-cache/`에 저장합니다. 서명된 CDN 주소가 바뀌어도 같은 사진의 미리보기와 상세 이미지는 저장된 원본을 공유합니다. 크기별 변환·캐시는 Next Image가 처리하며 브라우저 캐시는 1일입니다. 원본 캐시는 최대 30일, 약 512MiB로 관리하고 동시 원본 다운로드는 서버당 4개로 제한합니다. 다운로드가 실패하면 실패 결과를 저장하지 않습니다.

캐시는 첫 다운로드 시간을 없애지는 않습니다. 처음 보는 원본은 Instagram에서 한 번 받아야 하며, 이후 요청과 서버 재시작에서 재사용합니다. `GALLERY_IMAGE_CACHE_DIR`로 저장 위치를 지정할 수 있습니다. 지속적인 효과를 내려면 배포 서버의 영속 디스크를 사용하세요. Vercel에서는 임시 디스크를 사용하므로 인스턴스 교체 시 캐시가 초기화될 수 있습니다. 저장소가 쓰기 불가능한 경우에는 기존 CDN 경로로 돌아갑니다.

로컬 Chrome을 사용하는 Playwright 테스트입니다. 먼저 프로덕션 빌드를 실행하세요.

```sh
npm run build
npm test
```

테스트가 3100 포트에 별도 서버를 실행하고 종료합니다. 이 포트는 비워 두세요.
테스트 서버는 Mock 모드와 가짜 OAuth 설정을 사용합니다. 실제 Meta 요청이나 계정 변경은 하지 않습니다.
테스트는 한 작업씩 실행하며 실패한 경우에만 trace를 보존합니다.
화면 캡처는 Git에서 제외된 `qa-artifacts/`에 저장합니다.
검증 범위: 500개 타일 겹침, 줌 중심·경계, 데스크톱 탐색과 상세·캐러셀,
카메라·포커스 복원, 모바일 터치·핀치, reduced-motion, 가로 넘침.

## Phase 2 설정

메인 갤러리는 `hyeoki`와 사진만 표시합니다. 계정 연결은 별도 `/api/instagram/connect` 경로에서 진행합니다.
Instagram API with Instagram Login을 사용하며, 소유자의 프로페셔널 계정(비즈니스 또는 크리에이터)과 Meta 개발자 앱이 필요합니다.
요청하는 권한은 게시물 조회용 `instagram_business_basic` 하나입니다. 게시·메시지·댓글 작성 권한은 요청하지 않습니다.

1. `.env.example`을 `.env.local`로 복사합니다. 비밀 키를 채팅이나 Git에 올리지 마세요.
2. Meta 앱의 **Instagram → API setup with Instagram login**에서 계정을 추가하고 필요한 테스트 역할/초대를 승인합니다.
3. `INSTAGRAM_USERNAME=hyeoki_foodie`, `INSTAGRAM_API_VERSION`을 앱에서 지원하는 버전으로 설정합니다. 예시 값은 `v25.0`이며 최신 버전을 자동으로 선택하지 않습니다.
4. 아래 A 또는 B 방식으로 인증 정보를 설정합니다.
5. `GALLERY_SOURCE=instagram`으로 바꾸고 개발 서버를 재시작합니다. 인증이 준비될 때까지 `mock`으로 두면 기존 화면을 볼 수 있습니다.

### A. 앱 대시보드에서 발급한 토큰 사용

`INSTAGRAM_ACCESS_TOKEN`에 해당 계정용 Instagram User Access Token을 넣습니다.
이 경로는 App Secret과 로컬 OAuth 설정 없이도 갤러리를 확인할 수 있습니다.
환경변수 토큰은 로컬 OAuth 토큰보다 우선합니다. OAuth로 전환할 때는 이 값을 비우세요.

### B. Instagram Login으로 직접 연결

- `INSTAGRAM_LOCAL_OAUTH=true`로 설정합니다.
- `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`에 Instagram Login 설정의 앱 정보를 입력합니다.
- Meta에 등록한 리디렉션 주소와 `INSTAGRAM_REDIRECT_URI`를 정확히 맞춥니다. 경로는 `/api/instagram/callback`입니다.
- Meta가 허용하는 HTTPS 개발 주소를 사용하고, 같은 주소에서 `/api/instagram/connect`를 여세요. 터널/HTTPS 인증서 설정은 자동으로 만들지 않습니다.
- `INSTAGRAM_CONNECT_KEY`는 32자 이상의 무작위 관리자 연결 키입니다.
- `INSTAGRAM_SESSION_KEY`는 무작위 32바이트의 64자리 hex 키입니다. 각 키는 로컬 터미널에서 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`를 별도로 실행해 생성할 수 있습니다.
- 연결 화면에서 관리자 연결 키를 입력하고 Instagram 동의를 완료합니다. 로그인 계정이 `INSTAGRAM_USERNAME`과 일치할 때만 저장합니다.
- 인증 완료 후 `/`를 새로고침합니다. 토큰 값은 화면에 표시하지 않습니다.

OAuth state는 10분 유효한 암호화 HttpOnly 쿠키이며, 콜백 처리 후 삭제합니다.
장기 토큰은 AES-256-GCM으로 암호화해 Git에서 제외된 `.instagram/session.enc`에 저장합니다.
이 파일과 암호화 키는 함께 보관해야 하며, 암호화 키가 바뀌거나 토큰이 만료되면 다시 연결해야 합니다.
연결 해제 시 로컬 토큰 파일을 삭제하고 환경변수 토큰도 비우세요. Meta 측 권한 철회는 Instagram 설정에서 별도로 수행합니다.
이 저장소는 단일 로컬 서버용입니다. Vercel에서는 로컬 OAuth를 비활성화하며, 서버리스 영속 저장소와 자동 갱신은 Phase 3 범위입니다.

### 데이터 처리와 오류

- 서버가 프로필 계정을 확인한 후 최근 게시물 25개를 먼저 반환합니다. 나머지는 브라우저에서 커서 방식으로 순차 로드하며 최대 40페이지까지 읽습니다. 실패 시 이미 표시한 사진을 유지하고 재시도를 제공합니다.
- 캐러셀은 목록의 `children.limit(100)` 필드 확장으로 함께 조회합니다. 자식 목록이 빠졌거나 다음 페이지가 있으면 별도 children 경로를 최대 4페이지까지 읽습니다. 보완 요청 동시성은 최대 4개입니다.
- 게시물 ID 중복을 제거하고 최신순으로 정렬합니다. 이미지·영상·캐러셀, 원문 캡션·날짜·원문 링크를 기존 UI 모델로 변환합니다.
- 미디어 URL이 없는 항목과 지원하지 않는 형식은 제외합니다. 썸네일이 없는 영상은 `영상 보기`를 표시하며 상세 화면에서 재생합니다.
- API가 제공하지 않는 이미지 치수는 1080×1080 자리표시 값이며, 화면은 `object-fit: contain`으로 실제 비율을 보존합니다.
- Instagram/Facebook CDN의 HTTPS 이미지 주소만 허용하고, API의 next URL은 직접 따라가지 않고 커서로 재구성합니다.
- `GET /api/instagram/posts?after=커서`는 `{ posts, nextCursor }` 형태의 한 페이지를 반환합니다. 첫 요청에서는 after를 생략합니다. 토큰·원시 API 오류·Meta 페이징 URL을 반환하지 않습니다.
- 오류 코드는 `configuration`(503), `authentication`(401), `rate_limit`(429), `upstream`/`pagination`(502)입니다. 갤러리는 오류 화면과 재시도를 제공합니다. 실제 모드가 실패해도 Mock으로 자동 전환하지 않습니다.
- 페이지별 서버 메모리 캐시는 5분간 유지되며 최대 80개입니다. 같은 페이지의 동시 요청은 공유하고 실패는 저장하지 않습니다. 토큰·계정·API 버전 변경 시 다른 캐시 키를 사용합니다. 브라우저 응답은 `no-store`이고 프로세스 재시작 시 서버 캐시도 초기화됩니다. 새 게시물은 최대 5분 후 새로고침에 반영됩니다.
- 첫 페이지의 카메라 위치를 유지한 채 뒤쪽에 사진을 추가합니다. Home도 처음 보였던 위치로 돌아갑니다.

### 검증과 남은 단계

`npm run typecheck`, `npm run build`, `npm test`로 검사합니다.
모의 API 테스트는 미디어 변환, 커서·캐러셀 처리, 잘못된 계정, 만료·호출 제한, 비밀 정보가 오류에 섞이지 않는지 검증합니다.
Route Handler 테스트는 소유자 키·Origin 검사, OAuth state 발급·변조 거부, 안전한 게시물 응답을 확인합니다.
실제 Meta 계정의 승인·토큰 교환·사진 CDN·영상 재생은 자격 증명 설정 후 반드시 확인해야 합니다.

Phase 3 잔여 범위: 운영용 공유 캐시, 새 게시물 자동 동기화, 토큰 자동 갱신·운영 영속 저장소, 실데이터 대량 성능 검증, Vercel 배포.

공식 참고: [Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/), [Business Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login), [Meta Instagram API 컬렉션](https://www.postman.com/meta/instagram/overview).
구현 시 Meta 문서 직접 조회가 429로 제한되어 실제 앱에서 OAuth 교환과 API 버전 호환 확인이 남아 있습니다.

디자인은 제공된 로컬 영상 `img_docs/IMG_8216.mp4`의 검은 공간·분산된 사진·선택 확대를 참고했습니다.
커서만 움직여도 공간이 이동하는 자동 패닝 대신, 탐색 위치를 유지하는 드래그와 관성 이동을 적용했습니다.
