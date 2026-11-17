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
import {
  STANDARD_9_HEADERS,
  PERPETUAL_SUMMARY_TAB_TITLE,
  buildPerpetualSummarySheetRows,
  formatYearSheetTab,
  syncPerpetualSummaryTabInGoogleSheet,
  setStoredLayoutMode,
} from './googleSheets';

function aoaToSheetWithFormulas(rows: any[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  rows.forEach((row, rIdx) => {
    row.forEach((val, cIdx) => {
      if (typeof val === 'string' && val.startsWith('=')) {
        const addr = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
        ws[addr] = { t: 'n', f: val.slice(1) };
      }
    });
  });
  return ws;
}

function buildPerpetualTemplateSheetsData(
  year: number = new Date().getFullYear(),
  customCategories?: CategoryItem[],
  customPaymentMethods?: PaymentMethodItem[]
): Array<{ title: string; rows: any[][]; cols: { wch: number }[] }> {
  const yearTabTitle = String(year);

  // 1. Tab 1: 📊 연도별 요약 (Perpetual live formula dashboard)
  const summaryRows = buildPerpetualSummarySheetRows([{ year, title: yearTabTitle }]);

  // 2. Tab 2: [YYYY] Unified Year Transaction Sheet
  const yearSampleRows: any[][] = [
    STANDARD_9_HEADERS,
    [`${year}-01-01`, '수입', '급여', '1월 정기 급여', 3500000, '계좌이체', '', '', '월급 입금'],
    [`${year}-01-05`, '지출', '관리비_기타', '아파트 관리비', 245000, '자동이체', '정', '', '자동납부'],
    [`${year}-01-07`, '지출', '통신비', '휴대폰 통신비', 65000, '자동이체', '정', '', ''],
    [
      `${year}-01-10`,
      '지출',
      '식비',
      '이마트 장보기',
      58400,
      '신용카드',
      '',
      '계란 (식비) 8,900원 | 우유 (식비) 4,500원 | 삼겹살 (식비) 25,000원 | 채소 (식비) 20,000원',
      '',
    ],
    [`${year}-01-12`, '지출', '외식', '주말 가족 외식', 48000, '네이버페이', '', '', ''],
    [`${year}-01-15`, '지출', '생활용품', '침대 매트리스 교체', 1200000, '신용카드', '특', '', '안방 침대 교체'],
    [`${year}-01-18`, '이체', '저축', '청약저축', 200000, '자동이체', '', '', '주택청약'],
    [`${year}-02-01`, '수입', '급여', '2월 정기 급여', 3500000, '계좌이체', '', '', '월급 입금'],
    [`${year}-02-05`, '지출', '관리비_기타', '아파트 관리비', 248000, '자동이체', '정', '', '자동납부'],
    [`${year}-02-14`, '지출', '간식', '스타벅스 커피', 9500, '현대카드', '', '', ''],
  ];

  // 3. Tab 3: ⚙️ 분류설정
  let settingsRows: string[][];
  if (
    customCategories &&
    customCategories.length > 0 &&
    customPaymentMethods &&
    customPaymentMethods.length > 0
  ) {
    settingsRows = serializeCategoriesToSheetRows(customCategories, customPaymentMethods);
  } else {
    const maxLen = Math.max(
      DEFAULT_EXPENSE_CATEGORIES.length,
      DEFAULT_INCOME_CATEGORIES.length,
      DEFAULT_TRANSFER_CATEGORIES.length,
      DEFAULT_PAYMENT_METHODS.length
    );
    settingsRows = [['지출 카테고리', '수입 카테고리', '이체 카테고리', '결제 수단']];
    for (let i = 0; i < maxLen; i++) {
      settingsRows.push([
        DEFAULT_EXPENSE_CATEGORIES[i] || '',
        DEFAULT_INCOME_CATEGORIES[i] || '',
        DEFAULT_TRANSFER_CATEGORIES[i] || '',
        DEFAULT_PAYMENT_METHODS[i] || '',
      ]);
    }
  }

  // 4. Tab 4: 📖 사용설명서
  const manualRows: string[][] = [
    ['📖 스마트 만년 가계부 사용자 가이드 (연도별 단일 파일 구조)', '', '', '', ''],
    ['', '', '', '', ''],
    ['1. 만년 가계부 시트 구조 안내', '', '', '', ''],
    [
      `• [${PERPETUAL_SUMMARY_TAB_TITLE}]`,
      '각 연도 탭(2025, 2026, 2027...)의 수입·지출·고정/특별지출 및 1~12월 추이를 자동 합산하는 대시보드',
      '',
      '',
      '',
    ],
    [
      `• [${year}], [${year + 1}] ...`,
      '해당 연도의 1월~12월 모든 거래를 날짜순으로 관리하는 연도별 통합 시트 (새 해가 오면 연도 탭만 추가)',
      '',
      '',
      '',
    ],
    [
      '• [⚙️ 분류설정]',
      '지출·수입·이체 카테고리 및 결제수단 목록을 관리하는 탭 (수정 시 앱 자동 반영)',
      '',
      '',
      '',
    ],
    ['• [📖 사용설명서]', '가계부 입력 규칙 및 표준 열 구조 안내 탭', '', '', ''],
    ['', '', '', '', ''],
    ['2. 주요 속성 및 열 작성 규칙 (중요)', '', '', '', ''],
    ['구분', '입력 위치', '작성 양식', '앱 동작 및 기능 설명', '실제 작성 예시'],
    [
      '📌 고정 지출 (정기 예산)',
      'G열 (지출유형)',
      '정',
      '보라색 굵은 폰트로 자동 강조되며, 상단 고정 예산 통계로 분리 집계됩니다.',
      '내용: 아파트 관리비 / 금액: 245,000 / 지출유형: 정',
    ],
    [
      '🛋️ 특별 지출 (비정기)',
      'G열 (지출유형)',
      '특',
      '호박색(Amber) 폰트로 강조되며, 앱의 [특별지출 제외] 토글로 일상 생활비와 분리 가능합니다.',
      '내용: 침대 매트리스 / 금액: 1,200,000 / 지출유형: 특',
    ],
    [
      '🛒 복합 품목 (묶음 결제)',
      'H열 (세부품목)',
      '품목 (분류) 금액원 | ...',
      '앱에서 묶음 상자로 표시되며 총액이 1번 계산되고 세부 품목별 카테고리 통계에 합산됩니다.',
      '계란 (식비) 8,900원 | 샴푸 (생활용품) 15,000원',
    ],
    ['', '', '', '', ''],
    ['3. 연도별 통합 탭 표준 열 구조 (A열 ~ I열)', '', '', '', ''],
    ['A열: 날짜', 'YYYY-MM-DD 형식 권장 (예: 2026-01-15)', '', '', ''],
    ['B열: 구분', '지출 / 수입 / 이체', '', '', ''],
    ['C열: 분류', '식비, 외식, 생활용품, 관리비_기타, 급여, 저축 등', '', '', ''],
    ['D열: 내용/사용처', '마트, 스타벅스, 쿠팡, 급여 등 구체적인 사용처', '', '', ''],
    ['E열: 금액', '숫자 금액 (콤마 유무 상관없이 자동 인식)', '', '', ''],
    ['F열: 결제수단', '신용카드, 체크카드, 자동이체, 네이버페이, 현금 등', '', '', ''],
    ['G열: 지출유형', '정 (고정지출) / 특 (특별지출) / 빈칸 (일반지출)', '', '', ''],
    ['H열: 세부품목', '품목명 (카테고리) 금액원 | ...', '', '', ''],
    ['I열: 비고', '순수 메모 및 특이사항', '', '', ''],
  ];

  return [
    {
      title: PERPETUAL_SUMMARY_TAB_TITLE,
      rows: summaryRows,
      cols: [{ wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 14 }],
    },
    {
      title: yearTabTitle,
      rows: yearSampleRows,
      cols: [
        { wch: 14 },
        { wch: 10 },
        { wch: 16 },
        { wch: 28 },
        { wch: 14 },
        { wch: 16 },
        { wch: 12 },
        { wch: 45 },
        { wch: 30 },
      ],
    },
    {
      title: '⚙️ 분류설정',
      rows: settingsRows,
      cols: [{ wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 20 }],
    },
    {
      title: '📖 사용설명서',
      rows: manualRows,
      cols: [{ wch: 26 }, { wch: 20 }, { wch: 30 }, { wch: 52 }, { wch: 48 }],
    },
  ];
}

/**
 * Generate perpetual multi-year Ledger Template Workbook
 */
export function buildLedgerTemplateWorkbook(
  year: number = new Date().getFullYear(),
  customCategories?: CategoryItem[],
  customPaymentMethods?: PaymentMethodItem[]
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const sheetsData = buildPerpetualTemplateSheetsData(year, customCategories, customPaymentMethods);

  sheetsData.forEach((s) => {
    const ws = aoaToSheetWithFormulas(s.rows);
    ws['!cols'] = s.cols;
    XLSX.utils.book_append_sheet(wb, ws, s.title);
  });

  return wb;
}

/**
 * Trigger immediate browser download of the perpetual Excel template (.xlsx)
 */
export function downloadLedgerExcelTemplate(
  year: number = new Date().getFullYear(),
  customCategories?: CategoryItem[],
  customPaymentMethods?: PaymentMethodItem[]
): void {
  const wb = buildLedgerTemplateWorkbook(year, customCategories, customPaymentMethods);
  const fileName = `${year}_스마트_만년가계부_표준양식.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Create a brand new Perpetual Multi-Year Google Spreadsheet ("스마트 만년 가계부") in the user's Google Drive
 */
export async function createGoogleSheetWithTemplate(
  accessToken: string,
  year: number = new Date().getFullYear(),
  customCategories?: CategoryItem[],
  customPaymentMethods?: PaymentMethodItem[],
  customTitle: string = '스마트 만년 가계부'
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const title = customTitle.trim() || '스마트 만년 가계부';
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
  const spreadsheetUrl =
    created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  const sheetsData = buildPerpetualTemplateSheetsData(year, customCategories, customPaymentMethods);

  const addSheetRequests: any[] = [];
  const initialSheetId = created.sheets?.[0]?.properties?.sheetId ?? 0;

  sheetsData.forEach((sheet, index) => {
    const isYearTab = sheet.title === String(year);
    const isSummaryTab = sheet.title === PERPETUAL_SUMMARY_TAB_TITLE;
    if (index === 0) {
      addSheetRequests.push({
        updateSheetProperties: {
          properties: {
            sheetId: initialSheetId,
            title: sheet.title,
            gridProperties: {
              rowCount: isYearTab ? 1000 : 120,
              columnCount: 12,
              frozenRowCount: isSummaryTab ? 3 : 1,
            },
          },
          fields: 'title,gridProperties(rowCount,columnCount,frozenRowCount)',
        },
      });
    } else {
      addSheetRequests.push({
        addSheet: {
          properties: {
            title: sheet.title,
            gridProperties: {
              rowCount: isYearTab ? 1000 : 120,
              columnCount: 12,
              frozenRowCount: sheet.title === '📖 사용설명서' ? 0 : isSummaryTab ? 3 : 1,
            },
          },
        },
      });
    }
  });

  const batchRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests: addSheetRequests }),
    }
  );
  const batchJson = await batchRes.json().catch(() => null);

  // Fill values for each sheet (formulas evaluated via USER_ENTERED)
  const valueData = sheetsData.map((s) => ({
    range: `'${s.title}'!A1:Z${Math.max(s.rows.length, 1)}`,
    values: s.rows,
  }));

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

  // Format unified year tab and summary tab
  const yearTabReply = batchJson?.replies?.[1]?.addSheet?.properties?.sheetId;
  if (yearTabReply !== undefined) {
    await formatYearSheetTab(spreadsheetId, yearTabReply, accessToken);
  }
  await syncPerpetualSummaryTabInGoogleSheet(spreadsheetId, accessToken);
  setStoredLayoutMode(spreadsheetId, 'yearly');

  return { spreadsheetId, spreadsheetUrl };
}

