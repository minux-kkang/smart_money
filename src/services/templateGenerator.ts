import * as XLSX from 'xlsx';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_TRANSFER_CATEGORIES,
  DEFAULT_PAYMENT_METHODS,
  CategoryItem,
  PaymentMethodItem,
} from '../types/ledger';
import { serializeCategoriesToSheetRows } from './categoryManager';

/**
 * Generate workbook data for 2027 (or any specified year) Ledger Template
 */
export function buildLedgerTemplateWorkbook(
  year: number = 2027,
  customCategories?: CategoryItem[],
  customPaymentMethods?: PaymentMethodItem[]
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // 1. Tab 1: 📖 사용설명서 (Detailed manual & guidelines)
  const manualRows: string[][] = [
    ['📖 스마트 가계부 사용자 가이드 및 시트 작성 매뉴얼', '', '', '', ''],
    ['', '', '', '', ''],
    ['1. 시트 구조 안내', '', '', '', ''],
    ['• [📖 사용설명서]', '가계부 입력 규칙과 태그 작성법 안내 탭', '', '', ''],
    ['• [⚙️ 분류설정]', '지출·수입·이체 카테고리 및 결제수단 목록을 관리하는 탭 (수정 시 앱 자동 반영)', '', '', ''],
    ['• [1월] ~ [12월]', '각 월별 실제 수입/지출 거래 내역을 기록하는 표준 가계부 탭', '', '', ''],
    ['', '', '', '', ''],
    ['2. 주요 속성 및 태그 작성 규칙 (중요)', '', '', '', ''],
    ['구분', '입력 위치', '작성 태그/양식', '앱 동작 및 기능 설명', '실제 작성 예시'],
    [
      '📌 고정 지출 (정기 예산)',
      '메모 열',
      '[고정지출] 또는 [정기예산]',
      '보라색 굵은 폰트로 자동 강조되며, 상단 고정 예산 통계로 분리 집계됩니다.',
      '내용: 아파트 관리비 / 금액: 250,000 / 메모: [고정지출]',
    ],
    [
      '🛋️ 특별 지출 (비정기 대형 지출)',
      '메모 열',
      '[특별지출] 또는 [비정기지출]',
      '호박색(Amber) 굵은 폰트로 자동 강조되며, 앱의 [🛋️ 특별지출 제외] 토글로 일상 생활비와 분리 가능합니다.',
      '내용: 침대 매트리스 / 금액: 1,800,000 / 메모: [특별지출] 안방 침대',
    ],
    [
      '🛒 복합 품목 (쿠팡/마트 묶음 결제)',
      '메모 열',
      '[세부품목: 품목1 금액원 | 품목2 금액원]',
      '앱에서 파란색 묶음 상자(Bundle)로 묶여 총액이 1번 나오고 아래로 세부 품목이 펼쳐집니다.',
      '내용: 쿠팡 / 금액: 45,000 / 메모: [세부품목: 계란 8,900원 | 샴푸 15,000원 | 라면 21,100원]',
    ],
    [
      '분류 (카테고리)',
      '분류 열',
      '[⚙️ 분류설정] 탭의 이름 사용',
      '식비, 외식, 간식, 생활용품 등 분류별 지출 순위 차트에 색상별로 자동 집계됩니다.',
      '분류: 식비, 생활용품, 관리비_기타, 여행비 등',
    ],
    [
      '결제 수단',
      '결제수단 열',
      '[⚙️ 분류설정] 탭의 이름 사용',
      '신용카드, 체크카드, 네이버페이, 카카오페이, 현금, 자동이체 등 자동 분류됩니다.',
      '결제수단: 신용카드, 현대카드, 네이버페이 등',
    ],
    ['', '', '', '', ''],
    ['3. 카테고리 및 결제수단 추가/수정 방법', '', '', '', ''],
    ['• [⚙️ 분류설정] 탭의 각 열 아래에 원하는 카테고리나 결제수단 이름을 타이핑하면 웹앱에서 즉시 선택할 수 있습니다.', '', '', '', ''],
    ['• 웹앱에서 [⚙️ 항목 설정]을 눌러 추가/수정한 카테고리도 구글 시트의 [⚙️ 분류설정] 탭에 원클릭 동기화할 수 있습니다.', '', '', '', ''],
    ['', '', '', '', ''],
    ['4. 월별 거래 내역 표준 열 구조 (A열 ~ I열)', '', '', '', ''],
    ['A열: 날짜', 'YYYY-MM-DD 형식 권장 (예: 2026-01-15, 01.15, 15일 모두 호환)', '', '', ''],
    ['B열: 구분', '지출 / 수입 / 이체', '', '', ''],
    ['C열: 분류', '식비, 외식, 생활용품, 관리비_기타, 급여, 저축 등', '', '', ''],
    ['D열: 내용/사용처', '마트, 스타벅스, 쿠팡, 급여 등 구체적인 품목 또는 사용처', '', '', ''],
    ['E열: 금액', '숫자 금액 (콤마 유무 상관없이 자동 인식)', '', '', ''],
    ['F열: 결제수단', '신용카드, 체크카드, 자동이체, 네이버페이, 현금 등', '', '', ''],
    ['G열: 지출유형', '정 (정기예산/고정지출) / 특 (특별지출/비정기) / 빈칸 (일반지출)', '', '', ''],
    ['H열: 세부품목', '품목명 (카테고리) 수량 금액 (예: 계란 (식비) 8,900원 | 우유 (식비) 4,500원)', '', '', ''],
    ['I열: 비고', '순수 메모 및 특이사항 (시스템 태그 없이 깨끗하게 작성)', '', '', ''],
  ];

  const wsManual = XLSX.utils.aoa_to_sheet(manualRows);
  // Set column widths for manual tab
  wsManual['!cols'] = [
    { wch: 25 },
    { wch: 15 },
    { wch: 40 },
    { wch: 55 },
    { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, wsManual, '📖 사용설명서');

  // 2. Tab 2: ⚙️ 분류설정 (Central Category & Payment Methods Settings)
  let settingsRows: string[][];
  if (customCategories && customCategories.length > 0 && customPaymentMethods && customPaymentMethods.length > 0) {
    settingsRows = serializeCategoriesToSheetRows(customCategories, customPaymentMethods);
  } else {
    const maxLen = Math.max(
      DEFAULT_EXPENSE_CATEGORIES.length,
      DEFAULT_INCOME_CATEGORIES.length,
      DEFAULT_TRANSFER_CATEGORIES.length,
      DEFAULT_PAYMENT_METHODS.length
    );
    settingsRows = [
      ['지출 카테고리', '수입 카테고리', '이체 카테고리', '결제 수단'],
    ];
    for (let i = 0; i < maxLen; i++) {
      settingsRows.push([
        DEFAULT_EXPENSE_CATEGORIES[i] || '',
        DEFAULT_INCOME_CATEGORIES[i] || '',
        DEFAULT_TRANSFER_CATEGORIES[i] || '',
        DEFAULT_PAYMENT_METHODS[i] || '',
      ]);
    }
  }

  const wsSettings = XLSX.utils.aoa_to_sheet(settingsRows);
  wsSettings['!cols'] = [
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSettings, '⚙️ 분류설정');

  // 3. Tabs 3~14: 1월 ~ 12월 Monthly Sheets
  const monthHeaders = ['날짜', '구분', '분류', '내용/사용처', '금액', '결제수단', '지출유형', '세부품목', '비고'];

  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const sampleRows: string[][] = [monthHeaders];

    // Add illustrative initial rows for January
    if (m === 1) {
      sampleRows.push(
        [`${year}-${mm}-01`, '수입', '급여', '1월 정기 급여', '3500000', '계좌이체', '', '', '월급 입금'],
        [`${year}-${mm}-05`, '지출', '관리비_기타', '아파트 관리비', '245000', '자동이체', '정', '', '자동납부'],
        [`${year}-${mm}-07`, '지출', '통신비', '휴대폰 통신비', '65000', '자동이체', '정', '', ''],
        [`${year}-${mm}-10`, '지출', '식비', '이마트 장보기', '58400', '신용카드', '', '계란 (식비) 8,900원 | 우유 (식비) 4,500원 | 삼겹살 (식비) 25,000원 | 채소 (식비) 20,000원', ''],
        [`${year}-${mm}-12`, '지출', '외식', '주말 가족 외식', '48000', '네이버페이', '', '', ''],
        [`${year}-${mm}-15`, '지출', '생활용품', '침대 매트리스 교체', '1200000', '신용카드', '특', '', '안방 침대 교체'],
        [`${year}-${mm}-18`, '이체', '저축', '청약저축', '200000', '자동이체', '', '', '주택청약'],
        [`${year}-${mm}-22`, '지출', '식비', '카페 커피', '4500', '현대카드', '', '', '스타벅스']
      );
    }

    const wsMonth = XLSX.utils.aoa_to_sheet(sampleRows);
    wsMonth['!cols'] = [
      { wch: 14 },
      { wch: 10 },
      { wch: 16 },
      { wch: 28 },
      { wch: 14 },
      { wch: 16 },
      { wch: 12 },
      { wch: 45 },
      { wch: 30 },
    ];
    XLSX.utils.book_append_sheet(wb, wsMonth, `${m}월`);
  }

  return wb;
}

/**
 * Trigger immediate browser download of the standard Excel file (.xlsx)
 */
export function downloadLedgerExcelTemplate(
  year: number = 2027,
  customCategories?: CategoryItem[],
  customPaymentMethods?: PaymentMethodItem[]
): void {
  const wb = buildLedgerTemplateWorkbook(year, customCategories, customPaymentMethods);
  const fileName = `${year}_스마트가계부_표준양식.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Create a brand new Google Spreadsheet in the user's Google Drive via Google Sheets API
 */
export async function createGoogleSheetWithTemplate(
  accessToken: string,
  year: number = 2027,
  customCategories?: CategoryItem[],
  customPaymentMethods?: PaymentMethodItem[]
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  // 1. Create empty spreadsheet with title
  const title = `${year} 스마트가계부`;
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title,
      },
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => null);
    throw new Error(err?.error?.message || 'Google 스프레드시트 생성 실패');
  }

  const created = await createRes.json();
  const spreadsheetId = created.spreadsheetId;
  const spreadsheetUrl = created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // 2. Build template workbook
  const wb = buildLedgerTemplateWorkbook(year, customCategories, customPaymentMethods);

  // 3. Add sheets in batchUpdate
  const addSheetRequests: any[] = [];
  const initialSheetId = created.sheets?.[0]?.properties?.sheetId ?? 0;

  wb.SheetNames.forEach((sheetName, index) => {
    if (index === 0) {
      // Rename first initial sheet
      addSheetRequests.push({
        updateSheetProperties: {
          properties: {
            sheetId: initialSheetId,
            title: sheetName,
          },
          fields: 'title',
        },
      });
    } else {
      addSheetRequests.push({
        addSheet: {
          properties: {
            title: sheetName,
            gridProperties: {
              rowCount: 150,
              columnCount: 10,
              frozenRowCount: sheetName === '📖 사용설명서' ? 0 : 1,
            },
          },
        },
      });
    }
  });

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests: addSheetRequests }),
  });

  // 4. Fill values for each sheet
  const valueData = wb.SheetNames.map((sheetName) => {
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
    return {
      range: `'${sheetName}'!A1:Z${Math.max(data.length, 1)}`,
      values: data,
    };
  });

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: valueData,
    }),
  });

  return { spreadsheetId, spreadsheetUrl };
}
