# CLAUDE.md

이 파일은 이 저장소에서 작업하는 Claude Code(claude.ai/code)에게 지침을 제공합니다.

## 프로젝트 개요

**실시간 뉴스 TOP10 × 인스타 AI 카드뉴스 스튜디오** — 한국어 뉴스를 자동으로 수집해
표시하고, Gemini AI로 인스타그램용 카드뉴스와 캡션을 생성하는 정적 웹 애플리케이션입니다.

두 개의 독립적인 부분으로 구성됩니다:

1. **뉴스 수집 파이프라인** (백엔드) — GitHub Actions에서 15분마다 실행되어 Google News
   RSS를 카테고리별로 수집하고 `news-data.json`에 저장합니다.
2. **카드뉴스 스튜디오** (프런트엔드) — `index.html` 단일 파일 앱. 수집된 뉴스를 읽어
   표시하고, Gemini API로 카드뉴스 이미지·캡션을 생성합니다.

빌드 단계나 패키지 매니저가 없습니다. 순수 정적 사이트이며 GitHub Pages로 배포됩니다.

## 저장소 구조

| 파일 | 역할 |
|------|------|
| `index.html` | 전체 프런트엔드 앱 (약 224KB, HTML/CSS/JS 인라인 자체 완결). Tailwind·Firebase·html2canvas는 CDN 로드 |
| `fetch-news.js` | 뉴스 수집 스크립트. Node.js 20+ 내장 `fetch` 사용, 외부 의존성 없음 |
| `.github/workflows/fetch-news.yml` | 15분 주기 cron으로 `fetch-news.js`를 실행하고 `news-data.json`을 커밋·푸시 |
| `fetch-news.yml` | 위 워크플로의 루트 사본(참고용). 실제 실행되는 것은 `.github/workflows/` 아래 파일 |
| `news-data.json` | 수집된 뉴스 데이터. GitHub Actions 봇이 자동 갱신하므로 **직접 편집하지 말 것** |
| `upload_to_github.sh` | 새 GitHub 저장소를 만들고 `index.html`을 올린 뒤 Pages를 켜는 일회성 헬퍼 스크립트 |

## 아키텍처

### 뉴스 수집 파이프라인 (`fetch-news.js`)

- `FEEDS` 객체에 카테고리(정치/경제/세계/기술/문화/스포츠/사회)별 Google News RSS URL이 정의됨.
- 정규식 기반 경량 XML 파서(`getTag`, `parseRSS`)로 RSS를 파싱 — DOM 라이브러리를 쓰지 않음.
- 카테고리별 최대 10건 수집, 제목에서 `"제목 - 언론사"` 형태를 분리하고 요약·키워드·상대 시간(예: "3분 전")을 계산.
- 조회수(`views`)와 트렌드(`trending`, `trendPercent`)는 순위·최신성 기반으로 **시뮬레이션**된 값이며 실제 지표가 아님.
- 전체 기사에서 제목 앞부분으로 중복을 제거하고 조회수 순으로 정렬해 `top10`을 만듦.
- 출력 스키마: `{ updatedAt, categories: { [카테고리]: Article[] }, top10: Article[] }`.

### 프런트엔드 (`index.html`)

- `news-data.json?t=<timestamp>`을 캐시 무효화 쿼리와 함께 `fetch`해서 뉴스를 렌더링. 실패 시 RSS 프록시로 폴백하는 경로도 존재.
- **Gemini API**로 카드뉴스/캡션 생성: 텍스트는 `gemini-2.5-flash`(폴백 `gemini-2.0-flash`, `gemini-1.5-*`), 이미지는 `gemini-2.5-flash-image`. 엔드포인트는 `https://generativelanguage.googleapis.com/v1beta/models/...`.
- **Firebase**(app/auth/firestore compat SDK v10.8.0)로 인증·데이터 저장. 설정은 `window.__firebase_config`로 주입됨.
- **html2canvas**로 완성된 카드를 이미지로 내보냄.
- 사용자 상태·API 키는 `localStorage`(+ 쿠키 이중 저장)로 보관해 세션 초기화를 방지.
- CDN 의존: Tailwind CSS, Font Awesome 6.4, Google Fonts.

## 개발 워크플로

로컬에서 확인하려면 정적 서버로 띄웁니다(파일 프로토콜은 `fetch`가 막힘):

```bash
# 저장소 루트에서
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000/ 열기
```

뉴스 수집 스크립트를 수동 실행하려면(Node 20+ 필요):

```bash
node fetch-news.js   # news-data.json을 새로 생성
```

## 규칙 및 주의사항

- **`news-data.json`을 손으로 편집하지 마세요.** GitHub Actions가 15분마다 덮어씁니다. 수집 로직을 바꾸려면 `fetch-news.js`를 수정하세요.
- 워크플로 파일이 두 곳(`.github/workflows/fetch-news.yml`와 루트 `fetch-news.yml`)에 있습니다. 실제 실행되는 것은 `.github/workflows/` 아래 파일이므로 그쪽을 수정하세요.
- 프런트엔드 전체가 `index.html` 한 파일입니다. 변경 시 인라인 스타일·스크립트 구조를 유지하고, 외부 라이브러리는 계속 CDN으로 로드하세요.
- API 키/비밀값을 소스에 새로 하드코딩하지 마세요. 기존에 노출된 자격 증명이 보이면 커밋에 추가하지 말고 사용자에게 알리세요.
- 뉴스 조회수·트렌드 수치는 시뮬레이션 값이라는 점을 유지하세요 — 실제 분석 지표로 다루지 마세요.
- 커밋 메시지는 기존 관례(예: `📰 뉴스 업데이트`)처럼 한국어를 사용합니다.

## 배포

GitHub Pages로 서빙됩니다(main 브랜치 루트). `upload_to_github.sh`는 새 저장소를 만들 때
쓰는 일회성 스크립트로, 일상적인 개발에는 필요하지 않습니다.
