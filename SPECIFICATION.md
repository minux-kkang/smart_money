# 스마트 가계부 (Smart Household Ledger) 시스템 구현 명세서

본 문서는 Google Sheets 및 Google Drive와 실시간 2-Way 연동되는 **서버리스(Serverless) 정적 웹 애플리케이션 및 PWA 스마트 가계부**를 다른 환경에서 완전히 동일하게 구현하기 위한 기술 및 아키텍처 명세서입니다.

---

## 1. 시스템 아키텍처 및 핵심 원칙

### 1.1 Zero-Backend 아키텍처
- **서버 비용 0원**: Node.js, Python 등의 별도 백엔드 API 서버를 구축하지 않습니다.
- **클라이언트 직접 통신**: 사용자의 브라우저에서 Google Identity Services(OAuth 2.0 Access Token)를 발급받아, `sheets.googleapis.com` 및 `googleapis.com/drive/v3` API를 직접 호출합니다.
- **개인정보 보호**: 사용자 가계부 데이터가 중계 서버를 거치지 않고 오직 사용자의 Google Drive와 브라우저 로컬 세션 사이에서만 안전하게 암호화되어 오갑니다.

### 1.2 PWA (Progressive Web App)
- 네이티브 앱 스토어 심사나 개발자 등록비 없이, 브라우저의 **"홈 화면에 추가(앱 설치)"**를 통해 모바일 전체화면 네이티브 앱 형태로 동작합니다.
- `base: './'` 상대 경로 빌드를 통해 GitHub Pages의 서브 디렉터리(`https://<user>.github.io/<repo>/`)나 일반 커스텀 도메인 어디서든 정적 호스팅됩니다.

---

## 2. 기술 스택 및 권장 라이브러리

| 계층 | 기술 스택 | 버전 / 패키지 명 |
| :--- | :--- | :--- |
| **Runtime / Build** | Vite + React (TypeScript) | `vite@6+`, `react@19+`, `typescript@5+` |
| **CSS Styling** | Tailwind CSS v4 | `@tailwindcss/vite`, `@import "tailwindcss";` |
| **Icons** | Lucide React | `lucide-react` (지출/수입, 차트, 시트 아이콘) |
| **Auth / SDK** | Firebase Auth or GIS | `firebase@11+` (GoogleAuthProvider) 또는 Google Identity Services |
| **CI / CD** | GitHub Actions | `actions/upload-pages-artifact`, `actions/deploy-pages` |

---

## 3. Google API 및 OAuth 연동 규격

### 3.1 필수 OAuth Scopes
가계부 파일 검색 및 읽기/쓰기를 위해 다음 2가지 스코프가 필수입니다.
```text
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/drive.readonly
```

### 3.2 클라이언트 사이드 인증 흐름
1. `googleSignIn()` 실행 시 팝업(또는 Redirect)으로 Google 계정 로그인 및 상기 2개 스코프 동의 획득.
2. `GoogleAuthProvider.credentialFromResult(result)`로부터 `accessToken` 추출.
3. 세션 스토리지(`sessionStorage`)에 토큰을 캐싱하여 새로고침 시에도 재로그인 방지.
4. 모든 Google REST API 요청 헤더에 `Authorization: Bearer <accessToken>` 첨부.

---

## 4. 핵심 데이터 모델 및 TypeScript 인터페이스

### 4.1 거래 내역 (`Transaction`)
```typescript
export type TransactionType = 'expense' | 'income' | 'transfer';

export interface Transaction {
  id: string;              // 고유 ID (예: "tx_1729600000_12")
  date: string;            // 표준화된 일자 (YYYY-MM-DD)
  type: TransactionType;   // 지출('expense') | 수입('income') | 이체('transfer')
  category: string;        // 분류명 (식비, 카페, 공과금 등)
  description: string;     // 사용처 및 내역 (스타벅스, 마트 등)
  amount: number;          // 금액 (정수 원화 단위)
  paymentMethod?: string;  // 결제수단 (신용카드, 체크카드, 계좌이체, 현금, 네이버페이 등)
  memo?: string;           // 비고 및 메모
  rowIndex?: number;       // Google 시트 내 실제 1-based 행 번호 (수정/삭제 시 필수)
  sheetTitle?: string;     // 원본 시트 탭 이름 (예: "10월", "지출내역")
}
```

### 4.2 시트 컬럼 동적 매핑 규격 (`ColumnMapping`)
구글 시트 템플릿마다 컬럼 위치가 달라도 자동으로 찾아내는 매핑 정보:
```typescript
export interface ColumnMapping {
  dateCol: number;          // 날짜 컬럼 인덱스 (0-based)
  categoryCol: number;      // 분류 컬럼 인덱스
  descCol: number;          // 내용/사용처 컬럼 인덱스
  amountCol: number;        // 금액 컬럼 인덱스
  incomeCol?: number;       // 수입 별도 컬럼 (선택)
  expenseCol?: number;      // 지출 별도 컬럼 (선택)
  paymentMethodCol?: number;// 결제수단 컬럼 인덱스
  memoCol?: number;         // 비고 컬럼 인덱스
  typeCol?: number;         // 구분(수입/지출/이체) 컬럼 인덱스
  headerRowIndex: number;   // 실제 헤더가 위치한 행 번호 (0-based)
  detectedHeaders: string[];// 인식된 헤더 문자열 목록
}
```

### 4.3 연간 요약 매트릭스 데이터 (`YearDashboardData`)
연간 대시보드 탭("2026 가계부 Dashboard" 등) 집계 모델:
```typescript
export interface CategoryMonthlyData {
  category: string;         // 카테고리명 (26개 표준 분류)
  annualTotal: number;      // 연간 총 지출 합계
  monthly: number[];        // [1월, 2월, ..., 12월] 12개 숫자 배열
}

export interface YearDashboardData {
  totalIncome: number;      // 연간 총 수입
  totalExpense: number;     // 연간 총 지출
  categories: CategoryMonthlyData[];
}
```

---

## 5. 시트 분석 및 파싱 엔진 명세 (Parsing Engine)

### 5.1 시트 형태 자동 판별 규칙
- **연간 매트릭스 시트 (Matrix Sheet)**:
  - 탭 이름이 `대시보드`, `Dashboard`, `요약`, `연간`을 포함하거나,
  - 상단 1~10행 내에 `총 수입`, `총 지출` 요약 셀이 있고, `1월`부터 `12월`까지 열 헤더가 가로로 나열된 경우.
  - 처리: 거래 목록 대신 **연간 지출 통계 매트릭스 뷰**로 렌더링.
- **월별/지출 상세 시트 (Transaction Sheet)**:
  - 탭 이름이 `1월`~`12월`이거나 `지출내역`, `가계부`, `거래내역` 등인 경우.
  - 처리: 헤더 행을 찾아 컬럼 매핑 후 **트랜잭션 테이블 뷰**로 렌더링.

### 5.2 스마트 헤더 탐지 알고리즘
상위 15개 행을 순회하면서 점수(Score)를 계산하여 가장 높은 점수를 얻은 행을 헤더로 지정:
- 날짜 키워드(`날짜`, `일자`, `date`, `일시`): +3점
- 금액 키워드(`금액`, `지출`, `수입`, `amount`, `비용`): +3점
- 분류 키워드(`분류`, `카테고리`, `항목`, `category`): +2점
- 내용 키워드(`내용`, `사용처`, `내역`, `적요`, `description`): +2점
- 결제/비고(`결제수단`, `카드`, `메모`, `비고`): +1점

### 5.3 빈 수식 행 및 유령 행(Ghost Row) 필터링 (중요 버그 방지)
스프레드시트에 템플릿 수식(`=IF(...)`)이 미리 걸려 있어 4,999행까지 빈 행이 존재하는 경우의 필터링 규칙:
```typescript
const isValidRow = (row: any[]) => {
  const amountStr = String(row[mapping.amountCol] || '').replace(/[^0-9.-]+/g, '');
  const amount = parseFloat(amountStr) || 0;
  const rawDate = String(row[mapping.dateCol] || '').trim();
  const desc = String(row[mapping.descCol] || '').trim();

  // 금액이 0원이고 유효한 날짜가 없거나 내용이 비어있으면 템플릿 빈 행으로 간주하여 제외
  if (amount === 0 && (!rawDate || !/\d/.test(rawDate) || !desc)) {
    return false;
  }
  return true;
};
```

### 5.4 한국어 날짜 정규화 및 축약 파서
다양한 형태의 날짜 입력을 표준 `YYYY-MM-DD` 및 모바일 축약형 `MM.DD`로 변환:
- `2026. 10. 15.` / `2026-10-15` / `2026/10/15` -> `10.15`
- `10월 15일` / `10.15` -> `10.15`
- 연도 누락 시 현재 연도(2026년 등)를 기본값으로 결합.

---

## 6. Google Sheets API CRUD 명세

### 6.1 내역 추가 (`appendTransactionRow`)
- **API Endpoint**: `POST https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{sheetTitle}!A:Z:append?valueInputOption=USER_ENTERED`
- **동작**:
  1. 현재 시트의 컬럼 매핑(`ColumnMapping`)에 맞게 배열 구성.
  2. 신규 행을 시트의 맨 마지막 행에 추가.
  3. 날짜의 '월'을 인식하여, 대시보드 탭의 해당 월 및 카테고리 셀에도 자동 누적(옵션).

### 6.2 내역 인플레이스 수정 (`updateTransactionRow`)
- **API Endpoint**: `PUT https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{sheetTitle}!A{rowIndex}:Z{rowIndex}?valueInputOption=USER_ENTERED`
- **동작**:
  - `rowIndex`는 1-based 행 번호.
  - 기존 행의 열 배치를 유지하면서 날짜, 분류, 내용, 금액, 결제수단, 메모 컬럼의 값만 갱신.

### 6.3 단일 및 다중 행 삭제 (`deleteTransactionRow`, `deleteMultipleTransactionRows`)
- **API Endpoint**: `POST https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}:batchUpdate`
- **요청 바디**:
```json
{
  "requests": [
    {
      "deleteDimension": {
        "range": {
          "sheetId": 0,
          "dimension": "ROWS",
          "startIndex": 10,
          "endIndex": 11
        }
      }
    }
  ]
}
```
- **다중 행 삭제 시 주의점**:
  - 행을 삭제하면 뒤쪽 행 번호가 앞당겨지므로, **반드시 행 번호가 큰 순서(내림차순, Descending Order)로 정렬하여 삭제 요청**을 실행해야 인덱스 꼬임이 발생하지 않습니다.
- **파괴적 변경 안전장치**:
  - 사용자의 구글 시트 원본이 변경/삭제되므로 작업 실행 전 반드시 대상 내역 목록이 명시된 **확인 모달(Confirmation Modal)**을 표시해야 합니다.

---

## 7. UI / UX 및 모바일 반응형 설계 명세

### 7.1 모바일 가로 잘림(Overflow) 방지 테이블 레이아웃
모바일(360px ~ 430px)에서 우측의 **금액**과 **관리(수정/삭제)** 버튼이 화면 밖으로 밀려나지 않도록 다음 CSS/구조를 엄격히 준수합니다.

```html
<table class="w-full table-fixed text-left text-xs border-collapse">
  <colgroup>
    <!-- 선택 모드일 때만 체크박스 컬럼 노출 -->
    <col class="w-8 sm:w-9" />
    <!-- 날짜: 55px 고정 (MM.DD 5글자) -->
    <col class="w-13 sm:w-16" />
    <!-- 분류: 모바일에서는 숨김, sm 이상에서 표시 -->
    <col class="hidden sm:table-column sm:w-20 md:w-24" />
    <!-- 내용/사용처: 남은 너비를 100% 채움 (가변) -->
    <col class="w-auto" />
    <!-- 금액: 96px~112px 우측 정렬 고정 -->
    <col class="w-24 sm:w-28 md:w-32" />
    <!-- 결제수단: md 이상에서만 표시 -->
    <col class="hidden md:table-column md:w-24" />
    <!-- 관리(수정/삭제 버튼): 56px 고정 -->
    <col class="w-14 sm:w-16" />
  </colgroup>
  ...
```

#### 내용 셀 축약 처리:
```html
<td class="py-2 sm:py-2.5 px-2 sm:px-3 min-w-0 overflow-hidden">
  <div class="flex items-center gap-1.5 min-w-0">
    <!-- truncate 적용으로 아무리 긴 내용도 ...으로 줄여져 금액 열을 밀어내지 않음 -->
    <span class="font-bold text-slate-900 text-xs sm:text-sm truncate min-w-0 flex-1">
      {description}
    </span>
    <!-- 모바일에서는 내용 우측에 초소형 뱃지로 분류 표시 -->
    <span class="sm:hidden text-[9px] font-bold text-slate-500 px-1 rounded bg-slate-100 max-w-[55px] truncate shrink-0">
      {category}
    </span>
  </div>
</td>
```

### 7.2 스마트 월 필터 기본값
- 첫 페이지 진입 시: 연간 요약 매트릭스(대시보드) 제공.
- 월별 상세 내역 탭 진입 시:
  - 수천 행을 전부 렌더링하지 않고, **현재 연도/이번 달 (`String(new Date().getMonth() + 1)`)**을 기본 필터로 설정.
  - 상단에 `[전체] [1월] [2월] ... [12월]` 원터치 칩 버튼 제공.

### 7.3 다중 선택 모드 (Selection Mode) & 롱프레스
- 평상시: 체크박스 열이 숨겨져 공간 확보. 행을 클릭하면 **수정 모달** 오픈.
- 롱프레스 (450ms 터치 지속):
  - 진동 피드백(`navigator.vibrate(40)`).
  - 즉시 **다중 선택 모드**가 활성화되며 체크박스 컬럼이 노출되고 해당 행이 체크됨.
  - 하단에 `N개 선택됨` 및 `일괄 삭제` 플로팅 액션 바가 나타남.

---

## 8. 빌드 및 배포 명세 (PWA & GitHub Pages)

### 8.1 `vite.config.ts` 상대 경로 설정
GitHub Pages의 서브 경로(`https://minux-kkang.github.io/smart_money/`)에서도 에셋이 깨지지 않도록 `base: './'` 설정:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './', // 상대 경로 에셋 로딩 필수
  plugins: [react(), tailwindcss()],
});
```

### 8.2 `public/manifest.json` (PWA 매니페스트)
```json
{
  "short_name": "스마트가계부",
  "name": "스마트 가계부 - 구글 시트 연동",
  "icons": [
    {
      "src": "favicon.ico",
      "sizes": "64x64 32x32 24x24 16x16",
      "type": "image/x-icon"
    }
  ],
  "start_url": "./",
  "display": "standalone",
  "theme_color": "#2563eb",
  "background_color": "#ffffff",
  "orientation": "portrait"
}
```

### 8.3 `.github/workflows/deploy.yml` (CI/CD 자동 배포 파이프라인)
GitHub에 코드가 푸시되면 자동으로 Vite 프로덕션 빌드를 수행하고 GitHub Pages로 배포:
```yaml
name: Build & Deploy Smart Ledger

on:
  push:
    branches: [main, master]
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: 'pages'
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci || npm install
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

---

## 9. 재구현 시 단계별 체크리스트

1. [ ] **프로젝트 셋업**: Vite + React + TypeScript + Tailwind CSS v4 환경 구성.
2. [ ] **PWA & Base 설정**: `vite.config.ts`에 `base: './'`, `manifest.json` 생성 및 `index.html` 메타태그 등록.
3. [ ] **Google Cloud Console**: OAuth 2.0 클라이언트 ID 생성 및 Sheets/Drive Scopes 등록.
4. [ ] **타입 및 데이터 모델**: `types/ledger.ts`의 `Transaction`, `ColumnMapping`, `SheetAnalysisResult` 구현.
5. [ ] **시트 분석기 (`googleSheets.ts`)**: 스마트 헤더 감지, 유령 행(Ghost rows) 필터링, 연간 매트릭스 추출 로직 구현.
6. [ ] **CRUD API 연동**: `append`, `update`, `batchUpdate(deleteDimension)` 메서드 구현.
7. [ ] **UI 구현**:
   - `AnnualMatrixView`: 26개 카테고리 매트릭스 표 및 월별 지출 바 차트.
   - `Dashboard`: `table-fixed` 레이아웃, `truncate` 방어, 현재 월 자동 기본 선택, 450ms 롱프레스 다중 선택.
   - `ExpenseInputForm`: 상단 펼침/팝업 빠른 입력 폼.
8. [ ] **GitHub Actions 설정**: `.github/workflows/deploy.yml` 추가 후 GitHub Pages 연동.
