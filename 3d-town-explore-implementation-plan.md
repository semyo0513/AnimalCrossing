# 3D 타운 탐험 게임 구현 계획서
**창순기획 | 2026년 6월**

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [전체 아키텍처](#2-전체-아키텍처)
3. [기술 스택](#3-기술-스택)
4. [Google Sheets 데이터베이스 설계](#4-google-sheets-데이터베이스-설계)
5. [GAS 백엔드 구현 계획](#5-gas-백엔드-구현-계획)
6. [프론트엔드 구현 계획](#6-프론트엔드-구현-계획)
7. [경제 시스템 설계](#7-경제-시스템-설계)
8. [단계별 구현 로드맵](#8-단계별-구현-로드맵)
9. [배포 파이프라인](#9-배포-파이프라인)
10. [핵심 주의사항 & 트레이드오프](#10-핵심-주의사항--트레이드오프)

---

## 1. 프로젝트 개요

### 목표

브라우저 기반 3D 마을 탐험 게임으로, 학생들이 **NPC(역사 인물 등)를 직접 제작·등록**하고, 다른 사용자의 NPC와 상호작용하며 골드를 획득하는 교육용 멀티유저 경험을 제공한다.

### 핵심 기능 요약

| 기능 | 설명 |
|------|------|
| 회원 가입 / 로그인 | SHA-256 해시 기반 인증, Google Sheets 저장 |
| NPC 제작 | 얼굴색·복장색·대화 스크립트 등록 → 즉시 골드 보상 |
| 3D 월드 탐험 | Three.js 기반 WASD/화살표 이동, 3인칭 시점 |
| NPC 상호작용 | 접근 시 대화 팝업 + 1~5G 랜덤 보상 |
| 경제 시스템 | 골드 원장(Logs 시트)으로 모든 거래 기록 |

---

## 2. 전체 아키텍처

```
[브라우저 클라이언트 - GitHub Pages]
        │  fetch POST (URL encoded)
        ▼
[Google Apps Script - Web App URL]
        │  SpreadsheetApp API
        ▼
[Google Sheets - 4개 시트]
  Users / NPCs / Interactions / Logs
```

### 데이터 흐름 원칙

- 클라이언트는 **GAS Web App URL** 단일 엔드포인트와만 통신한다.
- 모든 비즈니스 로직(골드 계산, 난수 생성, 인증)은 **서버(GAS)** 에서 처리한다.
- 프론트엔드는 렌더링·입력 처리만 담당하며, 민감 연산을 클라이언트에 노출하지 않는다.
- GAS는 `ContentService`로 JSON을 반환하고, 클라이언트는 `{ success, data }` 규약으로 파싱한다.

---

## 3. 기술 스택

| 역할 | 기술 | 선택 이유 |
|------|------|-----------|
| 3D 렌더링 | Three.js r128 (CDN) | 설치 불필요, 브라우저 즉시 실행 |
| UI 스타일링 | Tailwind CSS (CDN) | 별도 빌드 없이 반응형 적용 |
| 백엔드 / API | Google Apps Script | Google Sheets 직접 연동, 서버리스 무료 |
| 데이터베이스 | Google Sheets | 교육 환경에서 관리 쉽고 가시성 높음 |
| 프론트엔드 호스팅 | GitHub Pages (Antigravity 배포) | 정적 파일 무료 호스팅, HTTPS 자동 |
| 인증 암호화 | SHA-256 (GAS Utilities) | 추가 라이브러리 불필요 |

---

## 4. Google Sheets 데이터베이스 설계

`Code.gs`의 `setup()` 함수 최초 1회 실행으로 아래 4개 시트가 자동 생성된다.

### 4-1. Users 시트

| 열 | 컬럼명 | 타입 | 설명 |
|----|--------|------|------|
| A | UserID | String | 로그인 아이디 (PK) |
| B | PasswordHash | String | SHA-256 해시값 |
| C | Gold | Integer | 현재 보유 골드 |
| D | CreatedAt | ISO String | 가입 일시 |

### 4-2. NPCs 시트

| 열 | 컬럼명 | 타입 | 설명 |
|----|--------|------|------|
| A | NpcID | UUID | NPC 고유 식별자 (PK) |
| B | CreatorID | String | 제작자 UserID (FK) |
| C | FaceColor | Hex String | 얼굴 색상 (#rrggbb) |
| D | OutfitColor | Hex String | 복장 색상 (#rrggbb) |
| E | Dialogues | JSON Array | 대화 스크립트 배열 (문자열) |
| F | PosX | Float | 월드 X 좌표 |
| G | PosZ | Float | 월드 Z 좌표 |
| H | CreatedAt | ISO String | 생성 일시 |

### 4-3. Interactions 시트

| 열 | 컬럼명 | 타입 | 설명 |
|----|--------|------|------|
| A | InteractionID | UUID | 상호작용 ID (PK) |
| B | UserID | String | 상호작용한 사용자 |
| C | NpcID | UUID | 대상 NPC |
| D | InteractionCount | Integer | 누적 상호작용 수 |
| E | LastInteractTime | ISO String | 마지막 상호작용 시각 |

### 4-4. Logs 시트 (원장)

| 열 | 컬럼명 | 타입 | 설명 |
|----|--------|------|------|
| A | LogID | UUID | 로그 ID (PK) |
| B | Timestamp | ISO String | 발생 일시 |
| C | UserID | String | 대상 사용자 |
| D | Action | String | 액션 코드 |
| E | Details | JSON Object | 상세 내용 |

**Action 코드 목록:**

| 코드 | 발생 시점 |
|------|-----------|
| `REGISTER` | 회원 가입 |
| `LOGIN` | 로그인 |
| `CREATE_NPC_REWARD` | NPC 제작 보상 지급 |
| `INTERACT_REWARD` | NPC 상호작용 보상 지급 |

---

## 5. GAS 백엔드 구현 계획

### 5-1. 파일 구조

```
Code.gs          ← 단일 파일로 전체 백엔드 구현
```

### 5-2. 함수 목록

| 함수 | 역할 |
|------|------|
| `setup()` | 최초 1회 실행 - 시트 생성 및 헤더 초기화 |
| `doPost(e)` | 모든 POST 요청 수신 및 `action` 파라미터로 라우팅 |
| `registerUser(data)` | 신규 사용자 등록 (중복 검사 포함) |
| `loginUser(data)` | 해시 비교 인증 및 골드 반환 |
| `createNPC(data)` | NPC 등록 + 보상 골드 지급 |
| `getNPCs()` | 전체 NPC 목록 반환 (대화 내용 제외) |
| `interactNPC(data)` | 랜덤 대화 반환 + 1~5G 보상 지급 |
| `updateUserGold(userId, amount)` | Users 시트 골드 갱신 |
| `hashPassword(password)` | SHA-256 해시 생성 |
| `logAction(userId, action, details)` | Logs 시트에 원장 기록 |

### 5-3. doPost 라우팅 규약

```
POST ?action=register  → registerUser()
POST ?action=login     → loginUser()
POST ?action=createNPC → createNPC()
POST ?action=getNPCs   → getNPCs()
POST ?action=interact  → interactNPC()
```

모든 응답 형식:
```json
// 성공
{ "success": true, "data": { ... } }

// 실패
{ "success": false, "error": "오류 메시지" }
```

### 5-4. 보안 고려사항

- 비밀번호는 GAS 서버에서만 해싱되며, 클라이언트에 평문이 잠시 존재하는 문제는 HTTPS 통신으로 보완한다.
- `getNPCs()` 응답에는 `Dialogues` 필드를 포함하지 않아 불필요한 데이터 노출을 최소화한다 (대화는 `interact` 호출 시에만 반환).
- LockService를 통한 동시성 제어는 이 규모에서 생략하되, 추후 사용자 수 증가 시 `updateUserGold` 함수에 적용 가능하다.

---

## 6. 프론트엔드 구현 계획

### 6-1. 파일 구조

```
index.html       ← 단일 파일 (CSS + JS + Three.js 인라인)
```

### 6-2. UI 레이어 구성

| 레이어 ID | 표시 조건 | 내용 |
|-----------|-----------|------|
| `#login-ui` | 초기 진입 시 | 로그인 / 회원가입 폼 |
| `#hud-ui` | 로그인 후 | 플레이어명, 골드, NPC 제작 버튼 |
| `#npc-modal` | NPC 제작 버튼 클릭 시 | 얼굴색, 복장색, 대화 입력 폼 |
| `#interaction-prompt` | NPC 반경 3.0 이내 | "Space 키를 눌러 대화하기" 안내 |
| `#dialog-ui` | 상호작용 성공 시 | 대화 내용 + 보상 골드 표시 |
| `#game-canvas` | 로그인 후 | Three.js 렌더러 마운트 대상 |

### 6-3. Three.js 월드 구성 요소

| 요소 | 구현 방법 | 비고 |
|------|-----------|------|
| 지면 | `PlaneGeometry(200, 200)` + 잔디색 | `rotation.x = -Math.PI/2` |
| 플레이어 | `BoxGeometry(1, 2, 1)` + 흰색 | 직접 조작 대상 |
| NPC | `Group` (상체 + 하체 BoxGeometry) | faceColor / outfitColor 적용 |
| 조명 | `DirectionalLight` + `AmbientLight` | 그림자 없는 단순 조명 |
| 카메라 | `PerspectiveCamera` 3인칭 추적 | 플레이어 위 후방 고정 + lerp 추적 |

### 6-4. 입력 처리

```
WASD / 화살표 키  → 플레이어 이동 (speed = 0.15)
Space 키          → NPC 상호작용 (반경 3.0 이내에서만)
X 버튼 (클릭)    → 대화창 닫기
```

대화 중(`isDialogActive = true`)에는 이동 입력을 비활성화한다.

### 6-5. API 통신 규약

```javascript
// 모든 API 호출은 이 함수를 통해 단일화
async function apiCall(action, data) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ action, data: JSON.stringify(data) })
  });
  const res = await response.json();
  if (!res.success) throw new Error(res.error);
  return res.data;
}
```

**GAS는 CORS 헤더를 자동 처리하므로** 별도 프록시 없이 `fetch`가 작동한다.

---

## 7. 경제 시스템 설계

### 7-1. 골드 지급 규칙

| 이벤트 | 지급량 | 공식 |
|--------|--------|------|
| NPC 제작 보상 | 가변 | `100 + (대화 수 × 50)` G |
| NPC 상호작용 보상 | 랜덤 | `Math.floor(Math.random() * 5) + 1` G (1~5G) |

### 7-2. 골드 흐름도

```
[NPC 제작]
  사용자 입력 → GAS createNPC()
    → NPCs 시트 저장
    → 보상 계산 (100 + 대화수×50)
    → Users 시트 Gold 갱신
    → Logs 시트 기록 (CREATE_NPC_REWARD)
    → 클라이언트에 currentGold 반환

[NPC 상호작용]
  Space 키 → GAS interactNPC()
    → NPCs 시트에서 Dialogues 로드
    → 랜덤 대화 선택
    → 랜덤 보상(1~5G) 계산
    → Users 시트 Gold 갱신
    → Interactions 시트 기록
    → Logs 시트 기록 (INTERACT_REWARD)
    → 클라이언트에 { text, reward, currentGold } 반환
```

### 7-3. 원장 시스템의 의미

Logs 시트는 **삭제되지 않는 불변 원장**으로, 모든 골드 변동 이력을 추적 가능하다. 추후 부정 거래 감지, 집계 통계, 교사 대시보드 구현의 기반이 된다.

---

## 8. 단계별 구현 로드맵

### Phase 1 — GAS 백엔드 구축 (약 30분)

1. Google Drive에서 **새 Apps Script 프로젝트** 생성
2. `Code.gs`에 전체 백엔드 코드 붙여넣기
3. 편집기 상단에서 `setup` 함수 선택 후 **실행** (권한 승인 포함)
4. Google Sheets에서 4개 시트 생성 확인
5. **[배포] → [새 배포]** → 유형: 웹 앱 → 액세스: 모든 사용자 → 배포
6. 생성된 **Web App URL** 복사 및 보관

### Phase 2 — 프론트엔드 로컬 작성 (약 20분)

1. `index.html` 파일 생성
2. 상단 `API_URL` 상수에 Phase 1에서 복사한 URL 붙여넣기
3. 로컬 브라우저에서 `index.html` 열어 기본 동작 확인
   - 회원가입 → 로그인 → 3D 월드 진입 → NPC 생성 → 상호작용

### Phase 3 — Antigravity를 통한 GitHub Pages 배포 (약 10분)

Antigravity 에이전트에 아래 프롬프트 입력:

```
아래 index.html 파일을 내 GitHub 계정에 새 저장소로 푸시하고
GitHub Pages로 배포해줘. 저장소 이름은 '3d-town-explore'로 해줘.

[index.html 전체 코드 붙여넣기]
```

에이전트가 자동으로 처리하는 작업:
- GitHub 저장소 생성
- `index.html` 커밋 및 푸시
- GitHub Pages 활성화 (`gh-pages` 브랜치 또는 `main` 루트)
- 라이브 URL 반환

### Phase 4 — 검증 및 배포 후 확인

| 확인 항목 | 방법 |
|-----------|------|
| 회원가입 / 로그인 | Users 시트에서 행 추가 확인 |
| NPC 제작 | NPCs 시트 + Users Gold 갱신 확인 |
| NPC 상호작용 | Interactions/Logs 시트 기록 확인 |
| 모바일 접속 | 스마트폰 브라우저에서 라이브 URL 접속 |
| CORS 오류 | 없으면 정상 (GAS가 자동 처리) |

---

## 9. 배포 파이프라인

```
[로컬 index.html]
      │
      │ Antigravity 에이전트 명령
      ▼
[GitHub 저장소 생성]
  github.com/[계정]/3d-town-explore
      │
      │ GitHub Pages 자동 빌드
      ▼
[라이브 URL]
  https://[계정].github.io/3d-town-explore/
      │
      │ fetch POST
      ▼
[GAS Web App URL]
  script.google.com/macros/s/[ID]/exec
      │
      ▼
[Google Sheets]
  시트 4개 (Users/NPCs/Interactions/Logs)
```

### GAS 재배포 시 주의사항

GAS 코드 수정 후에는 반드시 **[배포] → [배포 관리] → 편집 → 새 버전**으로 업데이트해야 한다. URL은 동일하게 유지된다.

---

## 10. 핵심 주의사항 & 트레이드오프

### 알려진 제약

| 항목 | 내용 | 해결 방향 |
|------|------|-----------|
| GAS 응답 속도 | 콜드 스타트 시 1~3초 지연 | "대화를 불러오는 중..." 로딩 메시지로 UX 보완 |
| GAS 동시 접속 한계 | 동시 30요청 초과 시 오류 가능 | 소규모 학급(30명 이하) 내에서 안전 |
| Google Sheets 행 수 | 500만 셀 제한 | Logs 시트가 가장 빠르게 증가 → 주기적 아카이빙 권장 |
| 클라이언트 보안 | API_URL이 소스 코드에 노출 | 교육용 환경에서 허용 가능, 운영 서비스라면 환경변수 처리 필요 |
| Three.js 버전 | r128 CDN 사용 | `OrbitControls` 미사용으로 버전 호환 문제 없음 |

### 향후 확장 가능 기능

- **교사 대시보드:** Logs 시트 집계로 학생별 참여도 시각화
- **NPC 인물 정보 필드 추가:** NPCs 시트에 `Subject`, `Era`, `Description` 컬럼 추가
- **XP / 레벨 시스템:** Users 시트에 `XP`, `Level` 컬럼 추가
- **자기 NPC 편집 / 삭제:** `updateNPC`, `deleteNPC` 액션 추가
- **모바일 터치 조이스틱:** Three.js 이동 입력을 터치 이벤트로 확장

---

*문서 작성: 창순기획 | 참고 코드: 첨부된 마스터 계획 문서 기반*
