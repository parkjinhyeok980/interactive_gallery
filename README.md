# Instagram Interactive Food Gallery — Phase 1

@hyeoki_foodie의 음식 사진 아카이브를 위한 2D 인터랙티브 갤러리입니다.
현재는 **로컬 예시 이미지 12장을 조합한 Mock 게시물 48개**를 사용합니다.
실제 Instagram 사진·캡션·작성일이 아니며 식당명·가격·위치를 생성하지 않습니다.

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

로컬 Chrome을 사용하는 Playwright 테스트입니다. 먼저 프로덕션 빌드를 실행하세요.

```sh
npm run build
npm test
```

테스트가 3100 포트에 서버를 실행하고 종료합니다. 실행 중인 동일 서버가 있으면 재사용합니다.
테스트는 한 작업씩 실행하며 실패한 경우에만 trace를 보존합니다.
화면 캡처는 Git에서 제외된 `qa-artifacts/`에 저장합니다.
검증 범위: 500개 타일 겹침, 줌 중심·경계, 데스크톱 탐색과 상세·캐러셀,
카메라·포커스 복원, 모바일 터치·핀치, reduced-motion, 가로 넘침.

## 다음 단계 — 아직 구현하지 않음

- Phase 2: Meta Instagram Login 인증, 서버 Route Handler, 실제 게시물·페이지네이션·미디어 변환, API 오류 처리.
- Phase 3: 캐싱, 새 게시물 동기화, 토큰 갱신·영속 저장 전략, 실데이터 대량 성능 검증, Vercel 배포.
- `src/lib/data/gallery.ts`의 `GalleryRepository` 구현을 서버 Instagram 어댑터로 교체하면 UI 계약을 유지할 수 있습니다.
- 실제 게시물 URL은 `permalink`로 표시할 준비가 되어 있으나 Mock 데이터에서는 가짜 링크를 만들지 않습니다.
- `VIDEO` 표시 구조는 있으나 Phase 1 Mock에는 이미지·캐러셀만 포함됩니다. 실영상·API 미디어 처리는 다음 단계에서 검증합니다.
- 토큰이나 App Secret은 아직 없으며 `.env.local` 등 환경변수 파일은 Git에서 제외됩니다.
- Vercel 배포 및 Meta 연동은 다음 지시 후 진행합니다.

디자인은 제공된 로컬 영상 `img_docs/IMG_8216.mp4`의 검은 공간·분산된 사진·선택 확대를 참고했습니다.
커서만 움직여도 공간이 이동하는 자동 패닝 대신, 탐색 위치를 유지하는 드래그와 관성 이동을 적용했습니다.
