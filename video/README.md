# Philips CC&J 대전 · 광주 사무소 엔지니어 소개 영상

필립스 직원들에게 CC&J 지사의 대전사무소와 광주사무소 엔지니어를 소개하는 약 3분(1920×1080, 30fps) 길이의 영상입니다.

완성본

- 한국어: `output/philips_ccj_engineers.mp4`
- 영어: `output/philips_ccj_engineers_en.mp4`

## 구성 (타임라인)

| 시간 | 장면 |
|---|---|
| 0:00 – 0:10 | 오프닝: "보이지 않는 곳에서, 환자 곁을 지키는 사람들" |
| 0:10 – 0:22 | 위성 지도로 본 한반도, 대전·광주 사무소 위치, 2개 사무소 · 16명 · 4개 모달리티 |
| 0:22 – 0:32 | 이준 팀장 (대전·광주 사무소 총괄 매니저)과 조직도 |
| 0:32 – 0:42 | 하늘에서 내려다보며 대전사무소(홍인타워오피스텔)로 찾아가는 장면 |
| 0:42 – 1:22 | 대전사무소: X-Ray 3명, CT 2명, MR 3명, Ultrasound 1명, 단체 소개 |
| 1:22 – 1:35 | 대전 → 광주 이동 경로, 광주사무소(더워크 공유오피스)로 하강 |
| 1:35 – 2:08 | 광주사무소: X-Ray 2명, CT 2명, MR 2명, Ultrasound 1명, 단체 소개 |
| 2:08 – 2:17 | "병원 장비가 멈추면, 진료도 멈춥니다" |
| 2:17 – 2:30 | 새벽 콜: 시계 타임랩스 → 긴급 장애 콜 → 새벽 출동 (24시간 콜 대기) |
| 2:30 – 2:40 | 공휴일 · 연휴 · 명절(신정, 설날, 어린이날, 추석, 성탄절)에도 출동 |
| 2:40 – 2:44 | 365일 · 24시간 |
| 2:44 – 3:00 | 전체 멤버 소개와 엔딩 |

## 내용 수정하는 법

이름, 팀, 문구, 위치, 장면 시간은 모두 `config.json`에 있습니다.

- 한국어 화면 문구: `text`
- 영어 버전: `en` — `names`(영문 이름), `data`(팀 설명 · 사무소 이름/주소 · 직함), `text`(화면 문구)

- **사진 넣기**: `photos/` 폴더에 사진을 넣고 `config.json`의 `"photos"`에 이름과 파일 경로를 적으면 실루엣 대신 사진이 들어갑니다.
  ```json
  "photos": { "장재훈": "photos/jang-jaehoon.jpg", "이준": "photos/lee-jun.jpg" }
  ```
- **팀 설명 문구**: `data.modalities.*.desc`
- **사무소 위치(지도 핀)**: `data.offices.*.lat`, `lon`
  - 대전: 홍인타워오피스텔을 대전 유성구 대학로 28(봉명동) 홍인호텔/홍인갤러리 블록으로 잡았습니다. 실제 위치와 다르면 좌표만 바꾸면 됩니다.
  - 광주: 더워크 공유오피스 — 광주 서구 상무중앙로78번길 5-6 영효빌딩 9층(치평동).

## 다시 만들기

```bash
./scripts/build.sh      # 한국어
./scripts/build.sh en   # 영어
```

순서대로 다음을 실행합니다.

1. `scripts/render.js --collect` — 카메라 경로에 필요한 위성 지도 타일 목록 생성
2. `scripts/fetch_tiles.sh` — 위성 타일 다운로드 (Esri World Imagery)
3. `scripts/make_audio.py` — 배경음악과 효과음 합성 (numpy로 직접 생성, 저작권 문제 없음)
4. `scripts/render.js` — 헤드리스 Chromium으로 프레임 렌더링 (`index.html` + `main.js`)
5. `scripts/encode.sh` — ffmpeg로 MP4 인코딩

브라우저에서 미리보기: `video/` 폴더를 정적 서버로 띄우고 `index.html?play` (특정 시점부터는 `index.html?play&t=90`, 영어는 `&lang=en` 추가).

## 사용한 자료

- 위성 이미지: Esri World Imagery (화면 우측 하단에 출처 표기)
- 글꼴: Pretendard (SIL Open Font License, `assets/fonts/LICENSE-Pretendard.txt`)
- 음악 · 효과음: 스크립트로 직접 합성
