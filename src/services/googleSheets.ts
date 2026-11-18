import { ColumnMapping, SheetAnalysisResult, Transaction, TransactionType } from '../types/ledger';
import {
  CATEGORY_SAMPLE_DESCRIPTIONS,
  CategoryMonthlyData,
  YearDashboardData,
  USER_2026_DATA,
} from '../data/userLedgerData';
import { clearAuthSession, isAuthExpiredError } from './firebase';
import {
  parseSubItemsFromMemo,
  formatSubItemsForColumn,
  stripTagsFromMemo,
  serializeSubItemsToMemo,
} from './subItemStorage';

export const STANDARD_9_HEADERS = [
  '날짜',
  '구분',
  '분류',
  '내용/사용처',
  '금액',
  '결제수단',
  '지출유형',
  '세부품목',
  '비고',
];

export type SheetLayoutMode = 'yearly' | 'monthly';

export function getStoredLayoutMode(spreadsheetId?: string): SheetLayoutMode | null {
  if (typeof window === 'undefined' || !spreadsheetId) return null;
  try {
    const val = localStorage.getItem(`smart_money_layout_mode_${spreadsheetId}`);
    if (val === 'yearly' || val === 'monthly') return val;
  } catch {
    // ignore storage errors
  }
  return null;
}

export function setStoredLayoutMode(spreadsheetId: string, mode: SheetLayoutMode): void {
  if (typeof window === 'undefined' || !spreadsheetId) return;
  try {
    localStorage.setItem(`smart_money_layout_mode_${spreadsheetId}`, mode);
  } catch {
    // ignore storage errors
  }
}

/**
 * Extract 4-digit year (2000..2099) if tab represents a full year (e.g. "2026", "2026년", "2025 가계부").
 * Returns null for month tabs like "2026-01", "2026.01", "10월", etc.
 */
export function extractYearFromTab(title?: string): number | null {
  if (!title) return null;
  const t = title.trim();
  if (!t) return null;
  // Never misclassify year-month tabs like "2026-01", "2026.1", "2026년 1월"
  if (extractMonthNumberFromTab(t) !== null) return null;
  // Also exclude matrix/dashboard/config/manual tabs
  if (/dashboard|대시보드|요약|matrix|연간|분류설정|설정|사용설명서|설명서/i.test(t)) return null;

  const exactMatch = t.match(/^(20\d{2})\s*년?$/);
  if (exactMatch) {
    return parseInt(exactMatch[1], 10);
  }

  const labelMatch = t.match(/(?:^|[^0-9])(20\d{2})(?:년|\s*(?:통합|가계부|내역))?(?:$|[^0-9])/);
  if (labelMatch && !/[-\/.]\s*\d{1,2}/.test(t)) {
    return parseInt(labelMatch[1], 10);
  }

  return null;
}

export function extractYearFromDate(dateStr?: string): number | null {
  if (!dateStr) return null;
  const m = dateStr.trim().match(/^(20\d{2})\s*[-./]/);
  if (m) return parseInt(m[1], 10);
  return null;
}

export function findTabForYear(
  tabs: Array<{ id: number; title: string }>,
  targetYear: number
): { id: number; title: string } | undefined {
  if (!tabs || tabs.length === 0) return undefined;
  const exact = tabs.find((t) => {
    const trimmed = (t.title || '').trim();
    return trimmed === String(targetYear) || trimmed === `${targetYear}년`;
  });
  if (exact) return exact;
  return tabs.find((t) => extractYearFromTab(t.title) === targetYear);
}

export function findAllYearTabs(
  tabs: Array<{ id: number; title: string }>
): Array<{ id: number; title: string; year: number }> {
  if (!tabs || tabs.length === 0) return [];
  const map = new Map<number, { id: number; title: string; year: number }>();
  tabs.forEach((t) => {
    const y = extractYearFromTab(t.title);
    if (y !== null) {
      const existing = map.get(y);
      // Prefer exact "2026" or "2026년" over verbose titles
      if (!existing || /^\d{4}년?$/.test(t.title.trim())) {
        map.set(y, { id: t.id, title: t.title, year: y });
      }
    }
  });
  return Array.from(map.values()).sort((a, b) => b.year - a.year);
}

export function detectSheetLayoutMode(
  tabs: Array<{ id: number; title: string; hidden?: boolean }>,
  activeSheetTitle?: string,
  spreadsheetId?: string
): SheetLayoutMode {
  if (activeSheetTitle && extractYearFromTab(activeSheetTitle) !== null) {
    return 'yearly';
  }
  const stored = getStoredLayoutMode(spreadsheetId);
  const yearTabs = findAllYearTabs(tabs);
  const hasSummaryTab = tabs.some(
    (t) =>
      t.title.trim() === PERPETUAL_SUMMARY_TAB_TITLE ||
      /연도별\s*요약|연도\s*요약/i.test(t.title)
  );
  const hasVisibleMonthTabs = tabs.some(
    (t) => !t.hidden && extractMonthNumberFromTab(t.title) !== null
  );
  const hasAnyMonthTabs = tabs.some((t) => extractMonthNumberFromTab(t.title) !== null);
  if (stored === 'yearly' && yearTabs.length > 0) return 'yearly';
  // If spreadsheet already has both a perpetual summary tab and unified year tabs (e.g. '2026'),
  // treat it as yearly unified mode even if legacy month tabs are still kept visible for verification.
  if (hasSummaryTab && yearTabs.length > 0) return 'yearly';
  if (yearTabs.length > 0 && !hasVisibleMonthTabs) return 'yearly';
  if (stored === 'monthly' && hasAnyMonthTabs) return 'monthly';
  if (yearTabs.length > 0 && tabs.some((t) => t.title.trim() === String(yearTabs[0].year))) {
    return stored || 'monthly';
  }
  return 'monthly';
}

export function computeYearDashboardDataFromTransactions(
  txs: Transaction[],
  year: number
): YearDashboardData {
  const catMap = new Map<string, number[]>();
  let totalIncome = 0;
  let totalExpense = 0;

  (txs || []).forEach((t) => {
    const mMatch = t.date?.match(/^\d{4}-(\d{2})/);
    const mNum = mMatch ? parseInt(mMatch[1], 10) : extractMonthNumberFromTab(t.sheetTitle);
    const mIdx = mNum && mNum >= 1 && mNum <= 12 ? mNum - 1 : 0;

    if (t.type === 'income') {
      totalIncome += Number(t.amount) || 0;
      return;
    }
    if (t.type && t.type !== 'expense') return;

    const amt = Number(t.amount) || 0;
    totalExpense += amt;

    if (t.subItems && t.subItems.length > 0) {
      t.subItems.forEach((sub) => {
        const subCat = (sub.category || t.category || '기타').trim();
        if (!catMap.has(subCat)) catMap.set(subCat, new Array(12).fill(0));
        catMap.get(subCat)![mIdx] += Number(sub.amount) || 0;
      });
    } else {
      const cat = (t.category || '기타').trim();
      if (!catMap.has(cat)) catMap.set(cat, new Array(12).fill(0));
      catMap.get(cat)![mIdx] += amt;
    }
  });

  const categories: CategoryMonthlyData[] = Array.from(catMap.entries())
    .map(([category, monthly]) => ({
      category,
      monthly,
      annualTotal: monthly.reduce((s, v) => s + v, 0),
    }))
    .sort((a, b) => b.annualTotal - a.annualTotal);

  return {
    year,
    totalIncome,
    totalExpense,
    categories,
  };
}

/**
 * Fetch spreadsheet metadata (title and sheet tabs)
 */
export async function getSpreadsheetDetails(
  spreadsheetId: string,
  accessToken?: string | null
): Promise<{
  title: string;
  sheets: Array<{ id: number; title: string; index: number; hidden?: boolean }>;
}> {
  if (accessToken) {
    try {
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties(sheetId,title,index,hidden)`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (res.ok) {
        const data = await res.json();
        const title = data.properties?.title || '가계부 스프레드시트';
        const sheets = (data.sheets || []).map((s: any) => ({
          id: s.properties.sheetId,
          title: s.properties.title,
          index: s.properties.index,
          hidden: Boolean(s.properties?.hidden),
        }));
        return { title, sheets };
      }
      if (res.status === 401) {
        clearAuthSession();
      }
    } catch (e) {
      console.warn('OAuth metadata fetch failed, using fallback:', e);
    }
  }

  // Fallback for public link access without OAuth: attempt to read actual sheet tabs from htmlview
  try {
    const htmlRes = await fetch(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`);
    if (htmlRes.ok) {
      const htmlText = await htmlRes.text();
      const titleMatch = htmlText.match(/<title>([^<]+)<\/title>/i);
      const docTitle = titleMatch ? titleMatch[1].replace(/ - Google (Sheets|스프레드시트).*/i, '').trim() : '가계부 스프레드시트';

      const tabNames: string[] = [];
      const regex = /name:\s*"([^"]+)"/g;
      let m;
      while ((m = regex.exec(htmlText)) !== null) {
        const name = m[1].trim();
        if (name && !tabNames.includes(name)) {
          tabNames.push(name);
        }
      }

      if (tabNames.length > 0) {
        return {
          title: docTitle,
          sheets: tabNames.map((tName, i) => ({ id: i + 1, title: tName, index: i })),
        };
      }
    }
  } catch (htmlErr) {
    console.warn('htmlview sheet tab detection failed:', htmlErr);
  }

  // Final fallback
  const defaultMonths = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  return {
    title: '연결된 가계부 스프레드시트',
    sheets: defaultMonths.map((m, i) => ({ id: i + 1, title: m, index: i })),
  };
}

/**
 * Fetch public Google Spreadsheet via Google Visualization API (no OAuth or API key required)
 */
export async function fetchPublicSheetViaGviz(
  spreadsheetId: string,
  sheetTitle?: string
): Promise<string[][]> {
  const sheetParam = sheetTitle ? `&sheet=${encodeURIComponent(sheetTitle)}` : '';
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json${sheetParam}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `스프레드시트를 불러오지 못했습니다 (${res.status}). 시트의 공유 설정이 '링크가 있는 모든 사용자: 뷰어'로 되어 있는지 확인해 주세요.`
    );
  }

  const rawText = await res.text();
  const match = rawText.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?/);
  if (!match || !match[1]) {
    throw new Error('스프레드시트 응답 형식을 해석할 수 없습니다.');
  }

  const json = JSON.parse(match[1]);
  if (json.status === 'error') {
    throw new Error(
      json.errors?.[0]?.detailed_message || json.errors?.[0]?.message || '시트 조회 오류'
    );
  }

  const table = json.table;
  if (!table) return [];

  const rows: string[][] = [];

  // Extract columns/headers
  const headers = (table.cols || []).map((col: any) => col?.label || '');
  if (headers.some((h: string) => h.trim().length > 0)) {
    rows.push(headers);
  }

  // Extract row values
  for (const rowObj of table.rows || []) {
    const rowCells: string[] = [];
    for (const cell of rowObj.c || []) {
      if (!cell) {
        rowCells.push('');
      } else if (cell.f !== undefined && cell.f !== null) {
        rowCells.push(String(cell.f));
      } else if (cell.v !== undefined && cell.v !== null) {
        rowCells.push(String(cell.v));
      } else {
        rowCells.push('');
      }
    }
    rows.push(rowCells);
  }

  return rows;
}

/**
 * Fetch raw values of a sheet tab
 */
export async function getSheetValues(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken?: string | null,
  range: string = 'A:Z'
): Promise<string[][]> {
  let tokenExpired = false;
  if (accessToken) {
    try {
      const encodedRange = encodeURIComponent(`'${sheetTitle}'!${range}`);
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueRenderOption=FORMATTED_VALUE`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (res.ok) {
        const data = await res.json();
        return data.values || [];
      }
      if (res.status === 401) {
        tokenExpired = true;
        clearAuthSession();
      }
    } catch (e) {
      console.warn('OAuth fetch failed, trying public gviz fallback:', e);
    }
  }

  // Fallback to public gviz/tq endpoint (works without OAuth / without domain registration)
  try {
    return await fetchPublicSheetViaGviz(spreadsheetId, sheetTitle);
  } catch (gvizErr) {
    if (tokenExpired) {
      throw new Error('AUTH_EXPIRED: Google OAuth 토큰이 만료되었습니다. 상단 [Google 로그인]을 눌러 재인증해 주세요.');
    }
    throw gvizErr;
  }
}

/**
 * Detect whether rows belong to an Annual Summary Matrix (Dashboard) sheet
 */
/**
 * Detect whether rows belong to an Annual Summary Matrix (Dashboard) sheet
 */
export function isAnnualMatrixSheet(rows: string[][], sheetTitle?: string): boolean {
  if (
    sheetTitle &&
    /dashboard|대시보드|연도별\s*요약|연도\s*요약|연간\s*요약|연간합계/i.test(sheetTitle)
  ) {
    return true;
  }
  if (!rows || rows.length === 0) return false;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r];
    if (!row) continue;
    let monthHits = 0;
    for (let m = 1; m <= 12; m++) {
      if (row.some((cell) => String(cell || '').trim().includes(`${m}월`))) {
        monthHits++;
      }
    }
    if (monthHits >= 4) return true;
    const joined = row.join(' ');
    if (
      (joined.includes('연간 지출') ||
        joined.includes('연간 합계') ||
        joined.includes('대시보드') ||
        joined.includes('Dashboard')) &&
      monthHits >= 2
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Extract YearDashboardData from Annual Summary Matrix sheet rows
 */
export function extractYearMatrixData(rows: string[][]): YearDashboardData | null {
  if (!rows || rows.length === 0) return null;

  let totalIncome = 0;
  let totalExpense = 0;

  // 1. Find totals from first few rows
  for (let r = 0; r < Math.min(rows.length, 6); r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || '').trim();
      if (/총\s*수입/i.test(cell)) {
        const val = row[c + 1] || row[c + 2];
        if (val) totalIncome = parseFloat(String(val).replace(/[^0-9.-]/g, '')) || 0;
      }
      if (/총\s*지출/i.test(cell)) {
        const val = row[c + 1] || row[c + 2];
        if (val) totalExpense = parseFloat(String(val).replace(/[^0-9.-]/g, '')) || 0;
      }
    }
  }

  // 2. Find header row with 1월 ~ 12월
  let headerRowIndex = -1;
  const monthColMap: Record<number, number> = {};

  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r];
    if (!row) continue;
    let hits = 0;
    row.forEach((cell, cIdx) => {
      const str = String(cell || '').trim();
      const mMatch = str.match(/(?:0)?(\d{1,2})월/);
      if (mMatch) {
        const m = parseInt(mMatch[1], 10);
        if (m >= 1 && m <= 12) {
          monthColMap[m] = cIdx;
          hits++;
        }
      }
    });
    if (hits >= 4) {
      headerRowIndex = r;
      break;
    }
  }

  if (headerRowIndex === -1) {
    return {
      year: 2026,
      totalIncome: totalIncome || USER_2026_DATA.totalIncome,
      totalExpense: totalExpense || USER_2026_DATA.totalExpense,
      categories: USER_2026_DATA.categories,
    };
  }

  const categories: CategoryMonthlyData[] = [];

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    const catName = String(row[0] || '').trim();
    if (
      !catName ||
      /합계|총계|소계|총\s*지출|총\s*수입|월\s*합계|연간\s*합계|잔액|누적|대시보드|dashboard/i.test(catName) ||
      /^(수입|급여|월급|상여금?|보너스|부수입|금융소득|이자수입|배당금?|환급금?|기타수입)$/i.test(catName)
    ) {
      continue;
    }

    const annualTotalRaw = row[1] ? String(row[1]).replace(/[^0-9.-]/g, '') : '0';
    const annualTotal = parseFloat(annualTotalRaw) || 0;

    const monthly: number[] = [];
    for (let m = 1; m <= 12; m++) {
      const col = monthColMap[m];
      if (col !== undefined && row[col]) {
        const amtStr = String(row[col]).replace(/[^0-9.-]/g, '');
        monthly.push(parseFloat(amtStr) || 0);
      } else {
        monthly.push(0);
      }
    }

    if (annualTotal > 0 || monthly.some((m) => m > 0)) {
      categories.push({
        category: catName,
        annualTotal: annualTotal || monthly.reduce((a, b) => a + b, 0),
        monthly,
      });
    }
  }

  if (categories.length === 0) {
    return {
      year: 2026,
      totalIncome: totalIncome || USER_2026_DATA.totalIncome,
      totalExpense: totalExpense || USER_2026_DATA.totalExpense,
      categories: USER_2026_DATA.categories,
    };
  }

  if (totalExpense === 0) {
    totalExpense = categories.reduce((s, c) => s + c.annualTotal, 0);
  }

  return {
    year: 2026,
    totalIncome: totalIncome || USER_2026_DATA.totalIncome,
    totalExpense,
    categories,
  };
}

/**
 * Analyze sheet rows to detect header structure, columns, categories, and payment methods
 */
export function analyzeSheetStructure(
  spreadsheetId: string,
  spreadsheetTitle: string,
  sheetTabs: Array<{ id: number; title: string }>,
  activeSheetTitle: string,
  rows: string[][]
): { analysis: SheetAnalysisResult; transactions: Transaction[] } {
  if (!rows || rows.length === 0) {
    const defaultMapping: ColumnMapping = {
      dateCol: 0,
      typeCol: 1,
      categoryCol: 2,
      descCol: 3,
      amountCol: 4,
      paymentMethodCol: 5,
      memoCol: 6,
      headerRowIndex: 0,
      detectedHeaders: ['날짜', '구분', '분류', '내용', '금액', '결제수단', '메모'],
    };

    return {
      analysis: {
        spreadsheetId,
        spreadsheetTitle,
        sheetTabs,
        activeSheetTitle,
        mapping: defaultMapping,
        detectedCategories: [],
        detectedPaymentMethods: ['신용카드', '체크카드', '현금', '계좌이체'],
        historicalDescriptions: [],
        rowCount: 0,
        rawSampleRows: [],
      },
      transactions: [],
    };
  }

  // Detect if this sheet is an Annual Matrix Dashboard instead of an itemized transaction sheet
  if (isAnnualMatrixSheet(rows, activeSheetTitle)) {
    const defaultMapping: ColumnMapping = {
      dateCol: 0,
      categoryCol: 0,
      descCol: 0,
      amountCol: 1,
      headerRowIndex: 2,
      detectedHeaders: rows[2] ? rows[2].map((c) => String(c || '').trim()) : [],
    };

    return {
      analysis: {
        spreadsheetId,
        spreadsheetTitle,
        sheetTabs,
        activeSheetTitle,
        mapping: defaultMapping,
        detectedCategories: [],
        detectedPaymentMethods: [],
        historicalDescriptions: [],
        rowCount: 0,
        rawSampleRows: rows.slice(0, 6),
        isMatrixSheet: true,
      },
      transactions: [],
    };
  }

  // 1. Find Header Row (scan first 30 rows)
  let bestHeaderRowIndex = 0;
  let maxHeaderMatches = -1;

  const headerKeywords = [
    '날짜', '일자', '일시', 'date', '거래일', '월일', '거래일자',
    '구분', '유형', '종류', '입출', 'type',
    '분류', '카테고리', '대분류', '소분류', '중분류', 'category',
    '내용', '내역', '적요', '사용처', '가맹점', '품명', '품목', '상호', '거래처', '지출처', '구입처', '구매처', '결제처', '판매처', 'description', 'item', 'merchant', 'store',
    '금액', '지출', '출금', '사용금액', '결제금액', 'amount', 'expense', 'price',
    '수입', '입금', 'income', '수입액',
    '결제수단', '결제방법', '수단', '카드', '결제', 'payment', 'method',
    '메모', '비고', 'memo', 'note', '비고란',
  ];

  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    let matches = 0;
    for (const cell of row) {
      const text = String(cell || '').trim().toLowerCase();
      if (!text) continue;
      if (headerKeywords.some((kw) => text.includes(kw))) {
        matches++;
      }
    }

    if (matches > maxHeaderMatches) {
      maxHeaderMatches = matches;
      bestHeaderRowIndex = r;
    }
  }

  const headerRow = rows[bestHeaderRowIndex] || [];

  // 2. Identify column indices based on headerRow with priority detection
  let dateCol = -1;
  let typeCol = -1;
  let categoryCol = -1;
  let subCategoryCol = -1;
  let merchantCol = -1; // Store, merchant, place: 사용처, 가맹점, 상호, 거래처, 구입처, 구매처, 지출처, 결제처
  let itemCol = -1;     // Item, purpose, details: 내용, 품명, 품목, 적요, 내역, 상세, 항목, 지출내용, 사용내역, 거래내역
  let descCol = -1;     // Combined: 내용/사용처, 사용처/내용, 상세내역
  let amountCol = -1;
  let incomeCol = -1;
  let expenseCol = -1;
  let paymentMethodCol = -1;
  let memoCol = -1;
  let recurringTypeCol = -1; // 지출유형: "정"(정기예산), "특"(특별지출), ""(일반지출)
  let subItemsCol = -1;      // 세부품목: "우유 2,500원 | 빵 3,000원"

  const cleanHeaders = headerRow.map((colName) =>
    String(colName || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_\-\/\(\)\[\],.:;]/g, '')
  );

  cleanHeaders.forEach((clean, idx) => {
    // 0. Expense Type (지출유형 / 정기특별 / 정특)
    if (recurringTypeCol === -1 && /^(지출유형|지출구분|비용구분|정기특별|정특|예산유형|고정특별|expensetype)$/.test(clean)) {
      recurringTypeCol = idx;
    }
    // 0. Sub-items (세부품목 / 상세품목 / 품목상세 / 세부항목 / 상세항목 / 세부내역 / 상세내역 / 품목내역 / 품목세부 / 세부내용 / 상세내용 / 세부 / 상세)
    else if (
      subItemsCol === -1 &&
      /^(세부품목|상세품목|품목상세|세부항목|상세항목|세부내역|상세내역|품목내역|품목세부|세부내용|상세내용|세부|상세|subitems?|sub_items?)$/i.test(clean)
    ) {
      subItemsCol = idx;
    }
    // 1. Date
    else if (dateCol === -1 && /^(날짜|일자|일시|date|거래일|일|월일|거래일자)$/.test(clean)) {
      dateCol = idx;
    }
    // 2. Type (구분 / 입출)
    else if (typeCol === -1 && /^(구분|유형|종류|입출|수지|type)$/.test(clean)) {
      typeCol = idx;
    }
    // 3. Primary Category (대분류 / 분류 / 카테고리)
    else if (categoryCol === -1 && /^(분류|카테고리|대분류|지출항목|지출분류|카테고리명|category)$/.test(clean)) {
      categoryCol = idx;
    }
    // 4. Sub-category (소분류 / 중분류)
    else if (subCategoryCol === -1 && /^(소분류|중분류|세부분류)$/.test(clean)) {
      subCategoryCol = idx;
    }
    // 5. Combined Description + Merchant (내용사용처, 사용처내용, 내역사용처, 사용처내역)
    else if (descCol === -1 && /^(내용사용처|사용처내용|내역사용처|사용처내역|상세내역|내용및사용처)$/.test(clean)) {
      descCol = idx;
    }
    // 6. Merchant / Store (사용처, 가맹점, 상호, 상호명, 가맹점명, 거래처, 거래처명, 지출처, 구입처, 구매처, 결제처, 판매처, 매장)
    else if (merchantCol === -1 && /^(사용처|가맹점|상호|상호명|가맹점명|거래처|거래처명|지출처|구입처|구매처|결제처|판매처|매장|매장명|merchant|store|vendor)$/.test(clean)) {
      merchantCol = idx;
    }
    // 7. Item / Content (내용, 품명, 품목, 적요, 내역, 지출내역, 사용내역, 거래내역, 지출내용, 품목명, 적요란)
    else if (
      itemCol === -1 &&
      !/(세부|상세품목|세부항목|상세항목|품목상세|품목세부)/i.test(clean) &&
      /^(내용|품명|품목|적요|내역|지출내역|사용내역|거래내역|지출내용|품목명|적요란|item|description|detail|details)$/.test(clean)
    ) {
      itemCol = idx;
    }
    // 8. Income
    else if (incomeCol === -1 && /^(수입|입금|income|수입액|입금액)$/.test(clean)) {
      incomeCol = idx;
    }
    // 9. Expense
    else if (expenseCol === -1 && /^(지출|출금|expense|지출액|출금액)$/.test(clean)) {
      expenseCol = idx;
    }
    // 10. Amount
    else if (amountCol === -1 && /^(금액|사용금액|결제금액|합계|지출금액|amount|price|total)$/.test(clean)) {
      amountCol = idx;
    }
    // 11. Payment Method
    else if (paymentMethodCol === -1 && /^(결제수단|결제방법|결제방식|수단|결제|지불|카드|계좌|payment|method)$/.test(clean)) {
      paymentMethodCol = idx;
    }
    // 12. Memo
    else if (memoCol === -1 && /^(메모|비고|비고란|참고|memo|note|remark|특이사항)$/.test(clean)) {
      memoCol = idx;
    }
  });

  // Secondary check: If categoryCol is still -1, check for '항목' or '계정과목'
  if (categoryCol === -1) {
    cleanHeaders.forEach((clean, idx) => {
      if (idx !== dateCol && idx !== typeCol && idx !== amountCol && idx !== merchantCol && idx !== incomeCol && idx !== expenseCol && idx !== subItemsCol) {
        if (/^(항목|항목명|계정과목)$/.test(clean)) {
          categoryCol = idx;
        }
      }
    });
  }

  // Fuzzy pass: contains matching for unassigned columns
  cleanHeaders.forEach((clean, idx) => {
    if (idx === dateCol || idx === typeCol || idx === amountCol || idx === incomeCol || idx === expenseCol || idx === categoryCol || idx === subItemsCol) return;

    if (recurringTypeCol === -1 && /(지출유형|지출구분|정기.*특별|정.*특)/.test(clean)) {
      recurringTypeCol = idx;
    }
    if (
      subItemsCol === -1 &&
      /(세부품목|상세품목|품목상세|세부항목|상세항목|세부내역|상세내역|품목내역|품목세부|세부내용|상세내용)/i.test(clean)
    ) {
      subItemsCol = idx;
    }
    if (merchantCol === -1 && /(사용처|가맹점|상호|지출처|구입처|구매처|결제처|매장)/.test(clean)) {
      merchantCol = idx;
    }
    if (
      itemCol === -1 &&
      !/(세부|상세품목|세부항목|상세항목|품목상세|품목세부)/i.test(clean) &&
      /(내용|품명|품목|적요|지출내용|내역)/.test(clean) &&
      idx !== merchantCol &&
      idx !== subItemsCol
    ) {
      itemCol = idx;
    }
    if (categoryCol === -1 && /(분류|카테고리|항목)/.test(clean) && idx !== merchantCol && idx !== itemCol && idx !== subItemsCol) {
      categoryCol = idx;
    }
  });

  if (categoryCol === -1 && subCategoryCol !== -1) {
    categoryCol = subCategoryCol;
  }

  // Resolve descCol: prefer combined, else merchantCol, else itemCol
  if (descCol === -1) {
    if (merchantCol !== -1) {
      descCol = merchantCol;
    } else if (itemCol !== -1) {
      descCol = itemCol;
    }
  }

  // Infer calendar year from activeSheetTitle (e.g. "2025") or spreadsheetTitle (e.g. "2025 가계부")
  const tabYearNum = extractYearFromTab(activeSheetTitle);
  const titleYearMatch = spreadsheetTitle?.match(/(?:^|[^0-9])(20\d{2})(?:[^0-9]|$)/);
  const inferredYear = tabYearNum || (titleYearMatch ? parseInt(titleYearMatch[1], 10) : 2026);
  const tabMonthNumForSample = extractMonthNumberFromTab(activeSheetTitle);

  // Fallback for Date by inspecting sample row values
  const sampleDataRows = rows.slice(bestHeaderRowIndex + 1, bestHeaderRowIndex + 25);

  if (dateCol === -1) {
    for (let c = 0; c < headerRow.length; c++) {
      const cleanH = cleanHeaders[c] || '';
      if (/^(순번|번호|no|id|num|index)$/i.test(cleanH)) continue;
      let dateHits = 0;
      for (const r of sampleDataRows) {
        if (r && r[c] && normalizeDateString(String(r[c]), tabMonthNumForSample || undefined, inferredYear)) {
          dateHits++;
        }
      }
      if (dateHits >= 1) {
        dateCol = c;
        break;
      }
    }
    if (dateCol === -1) {
      for (let c = 0; c < headerRow.length; c++) {
        if (!/^(순번|번호|no|id|num|index)$/i.test(cleanHeaders[c] || '')) {
          dateCol = c;
          break;
        }
      }
      if (dateCol === -1) dateCol = 0;
    }
  }

  // If categoryCol is still -1: find column that has categorical labels
  if (categoryCol === -1) {
    for (let c = 0; c < headerRow.length; c++) {
      if (c !== dateCol && c !== descCol && c !== merchantCol && c !== itemCol && c !== amountCol && c !== typeCol && c !== paymentMethodCol) {
        categoryCol = c;
        break;
      }
    }
    if (categoryCol === -1) categoryCol = headerRow.length > 2 ? 2 : 1;
  }

  // If descCol is STILL -1, find best text candidate column from sample rows
  if (descCol === -1) {
    for (let c = 0; c < headerRow.length; c++) {
      if (c !== dateCol && c !== categoryCol && c !== amountCol && c !== typeCol && c !== paymentMethodCol) {
        descCol = c;
        break;
      }
    }
    if (descCol === -1) descCol = 1;
  }

  if (amountCol === -1) {
    if (expenseCol !== -1) {
      amountCol = expenseCol;
    } else {
      let bestAmtCol = -1;
      let maxAmtHits = 0;
      for (let c = 0; c < headerRow.length; c++) {
        if (c === dateCol || c === typeCol) continue;
        let numHits = 0;
        for (const r of sampleDataRows) {
          if (r && r[c]) {
            const raw = String(r[c]).replace(/[^0-9.-]/g, '');
            if (raw && !isNaN(parseFloat(raw)) && parseFloat(raw) > 0) {
              numHits++;
            }
          }
        }
        if (numHits > maxAmtHits) {
          maxAmtHits = numHits;
          bestAmtCol = c;
        }
      }
      amountCol = bestAmtCol !== -1 ? bestAmtCol : headerRow.length > 4 ? 4 : 3;
    }
  }

  const mapping: ColumnMapping = {
    dateCol,
    typeCol: typeCol !== -1 ? typeCol : undefined,
    categoryCol,
    descCol,
    merchantCol: merchantCol !== -1 ? merchantCol : undefined,
    itemCol: itemCol !== -1 ? itemCol : undefined,
    amountCol,
    incomeCol: incomeCol !== -1 ? incomeCol : undefined,
    expenseCol: expenseCol !== -1 ? expenseCol : undefined,
    paymentMethodCol: paymentMethodCol !== -1 ? paymentMethodCol : undefined,
    memoCol: memoCol !== -1 ? memoCol : undefined,
    recurringTypeCol: recurringTypeCol !== -1 ? recurringTypeCol : undefined,
    subItemsCol: subItemsCol !== -1 ? subItemsCol : undefined,
    headerRowIndex: bestHeaderRowIndex,
    detectedHeaders: headerRow.map((c) => String(c || '').trim()),
  };

  // 3. Parse Transactions from data rows
  const transactions: Transaction[] = [];
  const categoryStats: Record<string, { count: number; totalAmount: number; type: TransactionType }> =
    {};
  const paymentMethodsSet = new Set<string>();
  const descMap: Record<string, { category: string; paymentMethod?: string; count: number }> = {};

  const dataRows = rows.slice(bestHeaderRowIndex + 1);

  dataRows.forEach((row, i) => {
    const actualRowIndex = bestHeaderRowIndex + 1 + i + 1; // 1-based row index for Google Sheets
    if (!row || row.length === 0 || row.every((c) => !c || String(c).trim() === '')) {
      return; // Skip empty rows
    }

    const rawDate = row[dateCol] ? String(row[dateCol]).trim() : '';
    const rawCategory =
      categoryCol !== -1 && row[categoryCol] ? String(row[categoryCol]).trim() : '기타';

    // Extract merchant and item text with priority
    const merchantText = merchantCol !== -1 && row[merchantCol] ? String(row[merchantCol]).trim() : '';
    const itemText = itemCol !== -1 && row[itemCol] ? String(row[itemCol]).trim() : '';
    const descText = descCol !== -1 && row[descCol] ? String(row[descCol]).trim() : '';

    let rawDesc = '';
    if (merchantText && itemText && merchantText !== itemText) {
      rawDesc = `${merchantText} (${itemText})`;
    } else if (merchantText) {
      rawDesc = merchantText;
    } else if (itemText) {
      rawDesc = itemText;
    } else if (descText) {
      rawDesc = descText;
    }

    const rawPayment =
      paymentMethodCol !== -1 && row[paymentMethodCol] ? String(row[paymentMethodCol]).trim() : '';
    const rawMemo = memoCol !== -1 && row[memoCol] ? String(row[memoCol]).trim() : '';
    const rawRecurringType =
      recurringTypeCol !== -1 && row[recurringTypeCol] ? String(row[recurringTypeCol]).trim() : '';
    const rawSubItemsText =
      subItemsCol !== -1 && row[subItemsCol] ? String(row[subItemsCol]).trim() : '';

    // Smart fallback only if rawDesc is completely empty: search other candidate text cells
    // (Note: Pure numbers like "1", "100", "010" are completely valid user item descriptions and must never be discarded)
    if (!rawDesc || rawDesc.trim() === '') {
      for (let c = 0; c < row.length; c++) {
        if (
          c !== dateCol &&
          c !== amountCol &&
          c !== categoryCol &&
          c !== typeCol &&
          c !== paymentMethodCol &&
          c !== incomeCol &&
          c !== expenseCol &&
          c !== memoCol &&
          c !== recurringTypeCol &&
          c !== subItemsCol
        ) {
          const cellStr = String(row[c] || '').trim();
          if (
            cellStr &&
            !/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(cellStr) &&
            !/^(수입|지출|이체)$/.test(cellStr) &&
            !cellStr.includes('[정기예산]') &&
            !cellStr.includes('[고정지출]') &&
            !cellStr.includes('[정기지출]') &&
            !cellStr.includes('[세부품목')
          ) {
            rawDesc = cellStr;
            break;
          }
        }
      }
    }

    // Safety: If rawDesc was previously assigned system tags like '[정기예산]' or '[특별지출]'
    if (
      rawDesc === '[정기예산]' ||
      rawDesc === '[고정지출]' ||
      rawDesc === '[정기지출]' ||
      rawDesc === '[특별지출]' ||
      rawDesc === '[비정기지출]' ||
      rawDesc.startsWith('[정기예산]') ||
      rawDesc.startsWith('[특별지출]')
    ) {
      let foundAlt = '';
      if (
        descCol !== -1 &&
        row[descCol] &&
        !String(row[descCol]).includes('[정기예산]') &&
        !String(row[descCol]).includes('[특별지출]')
      ) {
        foundAlt = String(row[descCol]).trim();
      } else if (
        itemCol !== -1 &&
        row[itemCol] &&
        !String(row[itemCol]).includes('[정기예산]') &&
        !String(row[itemCol]).includes('[특별지출]')
      ) {
        foundAlt = String(row[itemCol]).trim();
      } else if (
        merchantCol !== -1 &&
        row[merchantCol] &&
        !String(row[merchantCol]).includes('[정기예산]') &&
        !String(row[merchantCol]).includes('[특별지출]')
      ) {
        foundAlt = String(row[merchantCol]).trim();
      }
      rawDesc = foundAlt || (rawCategory && rawCategory !== '기타' ? rawCategory : '(내용 없음)');
    }

    // If still blank, use the category name or '(내용 없음)'
    // NEVER inject fake mock descriptions into the user's real transactions!
    if (!rawDesc || rawDesc.trim() === '') {
      rawDesc = rawCategory && rawCategory !== '기타' ? rawCategory : '(내용 없음)';
    }

    // Determine Amount & Type
    let type: TransactionType = 'expense';
    let amount = 0;

    if (mapping.incomeCol !== undefined && mapping.expenseCol !== undefined) {
      const incStr = row[mapping.incomeCol] ? String(row[mapping.incomeCol]).replace(/[^0-9.-]/g, '') : '';
      const expStr = row[mapping.expenseCol] ? String(row[mapping.expenseCol]).replace(/[^0-9.-]/g, '') : '';
      const incVal = parseFloat(incStr) || 0;
      const expVal = parseFloat(expStr) || 0;

      if (incVal > 0 && expVal === 0) {
        type = 'income';
        amount = incVal;
      } else {
        type = 'expense';
        amount = expVal || incVal;
      }
    } else {
      const rawAmtStr = row[amountCol] ? String(row[amountCol]).replace(/[^0-9.-]/g, '') : '0';
      const parsedAmt = parseFloat(rawAmtStr) || 0;
      amount = Math.abs(parsedAmt);

      if (typeCol !== -1 && row[typeCol]) {
        const tStr = String(row[typeCol]).trim().toLowerCase();
        if (/수입|입금|급여|월급|income/.test(tStr)) {
          type = 'income';
        } else if (/이체|대체|저축|transfer/.test(tStr)) {
          type = 'transfer';
        } else {
          type = 'expense';
        }
      } else if (parsedAmt < 0) {
        type = 'expense';
      } else if (
        /^(수입|급여|월급|보너스|상여|상여금|용돈수입|이자수입|이자|배당|환급|부수입|지원금|성과급|퇴직금)$/.test(
          rawCategory.replace(/\s+/g, '')
        )
      ) {
        type = 'income';
      }
    }

    // Skip total rows (e.g. "합계", "총액", "Total")
    if (/합계|소계|총계|총액|total|sum/i.test(rawDesc) || /합계|총계/i.test(rawCategory)) {
      return;
    }

    // Normalize Date: YYYY-MM-DD
    const tabMonthNum = extractMonthNumberFromTab(activeSheetTitle);
    const normalizedDate = normalizeDateString(rawDate, tabMonthNum || undefined, inferredYear);

    // CRITICAL GHOST ROW FILTER:
    // In pre-formatted Google Sheets templates (like 2026_가계부_최종_대시보드), sheets often have
    // blank formula rows where amount is 0 and date cannot be parsed.
    // Legitimate transactions have either a real amount or a meaningful user description.
    const hasMeaningfulDesc = Boolean(
      rawDesc &&
        rawDesc !== '(내용 없음)' &&
        rawDesc !== '기타'
    );

    if (amount === 0 && !normalizedDate && !hasMeaningfulDesc) {
      return; // Skip empty / blank formula row
    }

    if (amount === 0 && !hasMeaningfulDesc) {
      return; // Skip blank formula row
    }

    const defaultMonth = tabMonthNum ? String(tabMonthNum).padStart(2, '0') : '01';
    const fallbackDate = `${inferredYear}-${defaultMonth}-15`;
    const finalDate = normalizedDate || fallbackDate;

    const isRecurring = Boolean(
      rawRecurringType === '정' ||
        rawRecurringType === '정기' ||
        rawRecurringType === '고정' ||
        rawRecurringType.toLowerCase() === 'y' ||
        (rawMemo &&
          (rawMemo.includes('[정기예산]') ||
            rawMemo.includes('[고정지출]') ||
            rawMemo.includes('[정기지출]')))
    );
    const isSpecial = Boolean(
      rawRecurringType === '특' ||
        rawRecurringType === '특별' ||
        rawRecurringType === '비정기' ||
        (rawMemo &&
          (rawMemo.includes('[특별지출]') ||
            rawMemo.includes('[비정기지출]')))
    );

    const parsedSubItems = rawSubItemsText
      ? parseSubItemsFromMemo(rawSubItemsText)
      : (rawMemo ? parseSubItemsFromMemo(rawMemo) : []);

    const cleanMemo = stripTagsFromMemo(rawMemo);

    const t: Transaction = {
      id: `${activeSheetTitle}-r${actualRowIndex}-${i}`,
      date: finalDate,
      type,
      category: rawCategory || '기타',
      description: rawDesc || '(내용 없음)',
      amount,
      paymentMethod: rawPayment,
      memo: cleanMemo || undefined,
      rowIndex: actualRowIndex,
      sheetTitle: activeSheetTitle,
      createdAt: actualRowIndex,
      isRecurring: isRecurring || undefined,
      isSpecial: isSpecial || undefined,
      subItems: parsedSubItems.length > 0 ? parsedSubItems : undefined,
    };

    transactions.push(t);

    // Aggregate category stats
    const catKey = t.category;
    if (!categoryStats[catKey]) {
      categoryStats[catKey] = { count: 0, totalAmount: 0, type: t.type };
    }
    categoryStats[catKey].count += 1;
    categoryStats[catKey].totalAmount += t.amount;

    // Collect payment methods
    if (rawPayment) {
      paymentMethodsSet.add(rawPayment);
    }

    // Historical descriptions for autocomplete & smart suggestions
    if (rawDesc) {
      if (!descMap[rawDesc]) {
        descMap[rawDesc] = {
          category: t.category,
          paymentMethod: rawPayment,
          count: 1,
        };
      } else {
        descMap[rawDesc].count += 1;
      }
    }
  });

  // Default payment methods if none detected
  if (paymentMethodsSet.size === 0) {
    ['신용카드', '체크카드', '현금', '계좌이체', '네이버페이', '카카오페이'].forEach((pm) =>
      paymentMethodsSet.add(pm)
    );
  }

  const detectedCategories = Object.entries(categoryStats).map(([name, stat]) => ({
    name,
    count: stat.count,
    totalAmount: stat.totalAmount,
    type: stat.type,
  }));

  const historicalDescriptions = Object.entries(descMap)
    .filter(
      ([description]) =>
        description &&
        description !== '(내용 없음)' &&
        !description.startsWith('[정기예산]') &&
        !description.startsWith('[고정지출]') &&
        !description.startsWith('[정기지출]') &&
        !description.startsWith('[특별지출]') &&
        !description.startsWith('[비정기지출]') &&
        !description.startsWith('[세부품목')
    )
    .map(([description, val]) => ({
      description,
      category: val.category,
      paymentMethod: val.paymentMethod,
      count: val.count,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    analysis: {
      spreadsheetId,
      spreadsheetTitle,
      sheetTabs,
      activeSheetTitle,
      mapping,
      detectedCategories,
      detectedPaymentMethods: Array.from(paymentMethodsSet),
      historicalDescriptions,
      rowCount: transactions.length,
      rawSampleRows: rows.slice(0, 6),
    },
    transactions,
  };
}

/**
 * Resolve clean per-tab ColumnMapping from an inspected header row without leaking stale optional
 * columns (merchantCol, itemCol, incomeCol, expenseCol) from another sheet tab's fallbackMapping.
 */
function resolveMappingFromHeaderRow(
  headerRow: string[],
  fallbackMapping: ColumnMapping,
  headerRowIndex: number
): ColumnMapping {
  const cleanHeaders = (headerRow || []).map((col) =>
    (col || '').trim().toLowerCase().replace(/[\s_\-\/\(\)\[\],.:;]/g, '')
  );
  const hasKnownHeaders = cleanHeaders.some(
    (c) =>
      /(날짜|일자|일시|date)/.test(c) ||
      /(금액|지출|수입|비용|amount)/.test(c) ||
      /(분류|카테고리|내용|사용처|결제수단)/.test(c)
  );
  if (!hasKnownHeaders || headerRow.length === 0) {
    return { ...fallbackMapping };
  }

  let dateCol = -1;
  let typeCol: number | undefined;
  let categoryCol = -1;
  let descCol = -1;
  let merchantCol: number | undefined;
  let itemCol: number | undefined;
  let amountCol = -1;
  let incomeCol: number | undefined;
  let expenseCol: number | undefined;
  let paymentMethodCol: number | undefined;
  let recurringTypeCol: number | undefined;
  let subItemsCol: number | undefined;
  let memoCol: number | undefined;

  cleanHeaders.forEach((clean, idx) => {
    if (!clean) return;
    if (recurringTypeCol === undefined && /^(지출유형|지출구분|비용구분|정기특별|정특|예산유형)$/.test(clean)) {
      recurringTypeCol = idx;
    } else if (
      subItemsCol === undefined &&
      /^(세부품목|상세품목|품목상세|세부항목|상세항목|세부내역|상세내역|품목내역|품목세부|세부내용|상세내용|세부|상세|subitems?|sub_items?)$/i.test(clean)
    ) {
      subItemsCol = idx;
    } else if (dateCol === -1 && /^(날짜|일자|일시|date|거래일|거래일자)$/.test(clean)) {
      dateCol = idx;
    } else if (typeCol === undefined && /^(구분|유형|종류|수입지출|입출|수지|type)$/.test(clean)) {
      typeCol = idx;
    } else if (categoryCol === -1 && /^(분류|카테고리|대분류|항목|계정|category)$/.test(clean)) {
      categoryCol = idx;
    } else if (descCol === -1 && /^(내용사용처|사용처내용|내역사용처|사용처내역|내용및사용처)$/.test(clean)) {
      descCol = idx;
    } else if (merchantCol === undefined && /^(사용처|가맹점|상호|상호명|거래처|지출처|구입처|구매처|결제처|매장)$/.test(clean)) {
      merchantCol = idx;
    } else if (itemCol === undefined && /^(내용|품목|품명|적요|내역|item|description)$/.test(clean)) {
      itemCol = idx;
    } else if (incomeCol === undefined && /^(수입|입금|income|수입액|입금액)$/.test(clean)) {
      incomeCol = idx;
    } else if (expenseCol === undefined && /^(지출|출금|expense|지출액|출금액)$/.test(clean)) {
      expenseCol = idx;
    } else if (amountCol === -1 && /^(금액|지출액|비용|사용금액|결제금액|amount|expense|price)$/.test(clean)) {
      amountCol = idx;
    } else if (paymentMethodCol === undefined && /^(결제수단|결제방법|결제방식|카드|수단|지불수단|payment|method)$/.test(clean)) {
      paymentMethodCol = idx;
    } else if (memoCol === undefined && /^(메모|비고|비고란|참고|memo|note)$/.test(clean)) {
      memoCol = idx;
    }
  });

  if (descCol === -1) {
    if (merchantCol !== undefined) descCol = merchantCol;
    else if (itemCol !== undefined) descCol = itemCol;
    else descCol = fallbackMapping.descCol >= 0 ? fallbackMapping.descCol : 3;
  }

  if (amountCol === -1) {
    if (expenseCol !== undefined) amountCol = expenseCol;
    else amountCol = fallbackMapping.amountCol >= 0 ? fallbackMapping.amountCol : 4;
  }

  return {
    dateCol: dateCol >= 0 ? dateCol : fallbackMapping.dateCol >= 0 ? fallbackMapping.dateCol : 0,
    typeCol,
    categoryCol: categoryCol >= 0 ? categoryCol : fallbackMapping.categoryCol >= 0 ? fallbackMapping.categoryCol : 2,
    descCol,
    merchantCol,
    itemCol,
    amountCol,
    incomeCol,
    expenseCol,
    paymentMethodCol,
    recurringTypeCol,
    subItemsCol,
    memoCol,
    headerRowIndex,
    detectedHeaders: headerRow,
  };
}

function buildTransactionRowValues(
  mapping: ColumnMapping,
  transaction: Omit<Transaction, 'id' | 'rowIndex' | 'sheetTitle'>,
  minColCount = 9,
  existingRow: any[] = []
): any[] {
  const maxCol = Math.max(
    mapping.dateCol,
    mapping.categoryCol,
    mapping.descCol,
    mapping.merchantCol ?? -1,
    mapping.itemCol ?? -1,
    mapping.amountCol,
    mapping.incomeCol ?? -1,
    mapping.expenseCol ?? -1,
    mapping.paymentMethodCol ?? -1,
    mapping.memoCol ?? -1,
    mapping.recurringTypeCol ?? -1,
    mapping.subItemsCol ?? -1,
    mapping.typeCol ?? -1,
    minColCount - 1,
    8
  );

  const rowValues: any[] = [];
  for (let i = 0; i <= maxCol; i++) {
    rowValues.push(existingRow[i] !== undefined ? existingRow[i] : '');
  }

  if (mapping.dateCol >= 0) rowValues[mapping.dateCol] = transaction.date;
  if (mapping.typeCol !== undefined && mapping.typeCol >= 0) {
    rowValues[mapping.typeCol] =
      transaction.type === 'expense' ? '지출' : transaction.type === 'income' ? '수입' : '이체';
  }
  if (mapping.categoryCol >= 0) rowValues[mapping.categoryCol] = transaction.category;

  if (
    mapping.merchantCol !== undefined &&
    mapping.merchantCol >= 0 &&
    mapping.itemCol !== undefined &&
    mapping.itemCol >= 0 &&
    mapping.merchantCol !== mapping.itemCol
  ) {
    const mMatch = transaction.description.match(/^(.*?)\s*\((.*?)\)$/);
    if (mMatch) {
      rowValues[mapping.merchantCol] = mMatch[1].trim();
      rowValues[mapping.itemCol] = mMatch[2].trim();
    } else {
      rowValues[mapping.merchantCol] = transaction.description;
      rowValues[mapping.itemCol] = '';
    }
  } else if (mapping.descCol >= 0) {
    rowValues[mapping.descCol] = transaction.description;
  }

  if (mapping.incomeCol !== undefined && mapping.expenseCol !== undefined) {
    if (transaction.type === 'income') {
      rowValues[mapping.incomeCol] = transaction.amount;
      rowValues[mapping.expenseCol] = '';
    } else {
      rowValues[mapping.incomeCol] = '';
      rowValues[mapping.expenseCol] = transaction.amount;
    }
  } else if (mapping.amountCol >= 0) {
    rowValues[mapping.amountCol] = transaction.amount;
  }

  if (mapping.paymentMethodCol !== undefined && mapping.paymentMethodCol >= 0) {
    rowValues[mapping.paymentMethodCol] = transaction.paymentMethod || '';
  }

  if (mapping.recurringTypeCol !== undefined && mapping.recurringTypeCol >= 0) {
    rowValues[mapping.recurringTypeCol] = transaction.isRecurring ? '정' : transaction.isSpecial ? '특' : '';
  }

  if (mapping.subItemsCol !== undefined && mapping.subItemsCol >= 0) {
    rowValues[mapping.subItemsCol] = formatSubItemsForColumn(transaction.subItems);
  }

  if (mapping.memoCol !== undefined && mapping.memoCol >= 0) {
    let cleanMemo = stripTagsFromMemo(transaction.memo);
    if (mapping.subItemsCol === undefined || mapping.subItemsCol < 0) {
      cleanMemo = serializeSubItemsToMemo(cleanMemo, transaction.subItems);
    }
    if (mapping.recurringTypeCol === undefined || mapping.recurringTypeCol < 0) {
      if (transaction.isRecurring && !cleanMemo.includes('[정기예산]')) {
        cleanMemo = `[정기예산] ${cleanMemo}`.trim();
      } else if (transaction.isSpecial && !cleanMemo.includes('[특별지출]')) {
        cleanMemo = `[특별지출] ${cleanMemo}`.trim();
      }
    }
    rowValues[mapping.memoCol] = cleanMemo;
  }

  return rowValues;
}

const STANDARD_9_COL_MAPPING: ColumnMapping = {
  dateCol: 0,
  typeCol: 1,
  categoryCol: 2,
  descCol: 3,
  amountCol: 4,
  paymentMethodCol: 5,
  recurringTypeCol: 6,
  subItemsCol: 7,
  memoCol: 8,
  headerRowIndex: 0,
  detectedHeaders: STANDARD_9_HEADERS,
};

async function postToGasWebApp(gasUrl: string, payload: Record<string, any>): Promise<any> {
  const res = await fetch(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Apps Script 웹앱 요청 실패 (HTTP ${res.status})`);
  }
  const text = await res.text().catch(() => '');
  if (text) {
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Non-JSON text returned
      return null;
    }
    if (parsed?.error) {
      throw new Error(`Apps Script 오류: ${parsed.error}`);
    }
    return parsed;
  }
  return null;
}

/**
 * Append a new transaction row to a sheet tab
 */
export async function appendTransactionRow(
  spreadsheetId: string,
  sheetTitle: string,
  fallbackMapping: ColumnMapping,
  transaction: Omit<Transaction, 'id' | 'rowIndex' | 'sheetTitle'>,
  accessToken?: string | null
): Promise<{ rowIndex: number; sheetTitle: string }> {
  const gasUrl = typeof window !== 'undefined' ? localStorage.getItem('smart_money_gas_url') : null;

  // Prefer direct Google Sheets API via OAuth when accessToken is available so writes ALWAYS hit the
  // currently active spreadsheetId/sheetTitle with dynamic column mapping and chronological sorting.
  if (!accessToken) {
    if (gasUrl) {
      const mappingForGas =
        extractYearFromTab(sheetTitle) !== null ? STANDARD_9_COL_MAPPING : fallbackMapping;
      const rowValues = buildTransactionRowValues(mappingForGas, transaction, 9);
      const resJson = await postToGasWebApp(gasUrl, {
        action: 'append',
        sheetTitle,
        rowValues,
        transaction,
      });
      return { rowIndex: resJson?.rowIndex || 2, sheetTitle };
    }
    throw new Error('Google OAuth 액세스 토큰 또는 Apps Script 웹앱 연동이 필요합니다.');
  }

  // 1. Fetch current rows from target sheet to inspect headers and find the exact first empty row
  let rows: string[][] = [];
  let tabExists = true;
  try {
    const encodedRange = encodeURIComponent(`'${sheetTitle}'!A:Z`);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueRenderOption=FORMATTED_VALUE`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    if (res.ok) {
      const data = await res.json();
      rows = data.values || [];
    } else if (res.status === 400 || res.status === 404) {
      tabExists = false;
    } else if (res.status === 401) {
      clearAuthSession();
      throw new Error('AUTH_EXPIRED: Google OAuth 토큰이 만료되었습니다. 상단 [Google 로그인]을 눌러 재인증해 주세요.');
    }
  } catch (err: any) {
    if (isAuthExpiredError(err) || err?.message?.includes('AUTH_EXPIRED')) {
      throw err;
    }
    tabExists = false;
  }

  // 2. If the sheet tab does not exist, create it with standard 9 headers
  const defaultHeaders = STANDARD_9_HEADERS;
  if (!tabExists || rows.length === 0) {
    await addMonthlySheetTab(spreadsheetId, sheetTitle, defaultHeaders, accessToken);
    rows = [defaultHeaders];
  }

  // 3. Dynamically detect header row and column mapping for THIS specific sheet tab (clean reset of optional cols)
  let headerRowIndex = 0;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const rowStr = (rows[r] || []).join(' ');
    if (/(날짜|일자|일시)/.test(rowStr) && /(금액|지출|수입|비용)/.test(rowStr)) {
      headerRowIndex = r;
      break;
    }
  }

  const headerRow = rows[headerRowIndex] || [];
  const mapping = resolveMappingFromHeaderRow(headerRow, fallbackMapping, headerRowIndex);

  // 4. Find the EXACT row to write into & track last filled row's date to avoid unnecessary 3,000-row sorts
  const contextYear =
    extractYearFromTab(sheetTitle) ||
    extractYearFromDate(transaction.date) ||
    2026;
  const contextMonth = extractMonthNumberFromTab(sheetTitle) || undefined;
  let targetRowNumber = headerRowIndex + 2; // 1-indexed row number in Google Sheets
  let foundEmptyRow = false;
  let lastFilledDate: string | null = null;
  let isExistingSorted = true;

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const dateVal = mapping.dateCol >= 0 && row[mapping.dateCol] ? String(row[mapping.dateCol]).trim() : '';
    const descVal = mapping.descCol >= 0 && row[mapping.descCol] ? String(row[mapping.descCol]).trim() : '';
    const amtVal = mapping.amountCol >= 0 && row[mapping.amountCol] ? String(row[mapping.amountCol]).trim() : '';
    const catVal = mapping.categoryCol >= 0 && row[mapping.categoryCol] ? String(row[mapping.categoryCol]).trim() : '';

    if (!dateVal && !descVal && !amtVal && !catVal) {
      if (!foundEmptyRow) {
        targetRowNumber = r + 1;
        foundEmptyRow = true;
      }
      continue;
    }

    // If a non-empty row appears AFTER an empty row, we must sort/compact
    if (foundEmptyRow) {
      isExistingSorted = false;
    }

    const parsedDate = normalizeDateString(dateVal, contextMonth, contextYear);
    if (parsedDate) {
      if (lastFilledDate && parsedDate < lastFilledDate) {
        isExistingSorted = false;
      }
      lastFilledDate = parsedDate;
    }
  }

  if (!foundEmptyRow) {
    targetRowNumber = rows.length + 1;
  }

  // 5. Construct row values
  const existingRow = rows[targetRowNumber - 1] || [];
  const rowValues = buildTransactionRowValues(
    mapping,
    transaction,
    Math.max(headerRow.length, 9),
    existingRow
  );

  // 6. Write directly into that exact row in Google Sheets via PUT!
  const endColLetter = getColumnLetter(rowValues.length - 1);
  const writeRange = encodeURIComponent(`'${sheetTitle}'!A${targetRowNumber}:${endColLetter}${targetRowNumber}`);

  let putRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [rowValues],
      }),
    }
  );

  if (putRes.status === 401) {
    clearAuthSession();
    throw new Error('AUTH_EXPIRED: Google OAuth 토큰이 만료되었습니다. 상단 [Google 로그인]을 눌러 재인증해 주세요.');
  }

  if (!putRes.ok) {
    // If range exceeded grid row limit, expand sheet rows and retry PUT (never jump to row 5000+ via :append!)
    try {
      const details = await getSpreadsheetDetails(spreadsheetId, accessToken);
      const targetSheet = details.sheets.find((s) => s.title === sheetTitle);
      if (targetSheet) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                appendDimension: {
                  sheetId: targetSheet.id,
                  dimension: 'ROWS',
                  length: 100,
                },
              },
            ],
          }),
        });

        // Retry PUT
        putRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ values: [rowValues] }),
          }
        );
      }
    } catch (expandErr) {
      console.warn('Grid expansion retry error:', expandErr);
    }
  }

  if (!putRes.ok) {
    const err = await putRes.json().catch(() => null);
    throw new Error(err?.error?.message || `구글 시트 '${sheetTitle}'의 ${targetRowNumber}행에 항목 추가 실패`);
  }

  // Fast-path: skip expensive full-sheet sortRange when appending chronologically at the end!
  const needsSort =
    !isExistingSorted ||
    Boolean(lastFilledDate && transaction.date && transaction.date < lastFilledDate);

  if (needsSort) {
    await sortSheetRowsByDate(spreadsheetId, sheetTitle, mapping.dateCol, accessToken, 'ASCENDING');
  }

  return { rowIndex: targetRowNumber, sheetTitle };
}

/**
 * Append multiple transaction rows in a single batch to Google Sheets (fast and atomic)
 */
export async function appendBatchTransactions(
  spreadsheetId: string,
  sheetTitle: string,
  fallbackMapping: ColumnMapping,
  transactions: Array<Omit<Transaction, 'id' | 'rowIndex' | 'sheetTitle'>>,
  accessToken?: string | null
): Promise<{ count: number; sheetTitle: string }> {
  if (!transactions || transactions.length === 0) {
    return { count: 0, sheetTitle };
  }

  const gasUrl = typeof window !== 'undefined' ? localStorage.getItem('smart_money_gas_url') : null;
  if (!accessToken) {
    if (gasUrl) {
      const mappingForGas =
        extractYearFromTab(sheetTitle) !== null ? STANDARD_9_COL_MAPPING : fallbackMapping;
      for (const tx of transactions) {
        const rowValues = buildTransactionRowValues(mappingForGas, tx, 9);
        await postToGasWebApp(gasUrl, {
          action: 'append',
          sheetTitle,
          rowValues,
          transaction: tx,
        });
      }
      return { count: transactions.length, sheetTitle };
    }
    throw new Error('Google OAuth 액세스 토큰 또는 Apps Script 웹앱 연동이 필요합니다.');
  }

  // 1. Fetch current rows from target sheet
  let rows: string[][] = [];
  let tabExists = true;
  try {
    const encodedRange = encodeURIComponent(`'${sheetTitle}'!A:Z`);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueRenderOption=FORMATTED_VALUE`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    if (res.ok) {
      const data = await res.json();
      rows = data.values || [];
    } else if (res.status === 400 || res.status === 404) {
      tabExists = false;
    } else if (res.status === 401) {
      clearAuthSession();
      throw new Error('AUTH_EXPIRED: Google OAuth 토큰이 만료되었습니다. 상단 [Google 로그인]을 눌러 재인증해 주세요.');
    }
  } catch (err: any) {
    if (isAuthExpiredError(err) || err?.message?.includes('AUTH_EXPIRED')) {
      throw err;
    }
    tabExists = false;
  }

  // 2. If the sheet tab does not exist, create it with standard 9 headers
  const defaultHeaders = STANDARD_9_HEADERS;
  if (!tabExists || rows.length === 0) {
    await addMonthlySheetTab(spreadsheetId, sheetTitle, defaultHeaders, accessToken);
    rows = [defaultHeaders];
  }

  // 3. Dynamically detect header row and column mapping for THIS specific sheet tab
  let headerRowIndex = 0;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const rowStr = (rows[r] || []).join(' ');
    if (/(날짜|일자|일시)/.test(rowStr) && /(금액|지출|수입|비용)/.test(rowStr)) {
      headerRowIndex = r;
      break;
    }
  }

  const headerRow = rows[headerRowIndex] || [];
  const mapping = resolveMappingFromHeaderRow(headerRow, fallbackMapping, headerRowIndex);

  // 4. Find targetRowNumber (first empty row after headerRowIndex) & track last existing date
  const contextYear =
    extractYearFromTab(sheetTitle) ||
    extractYearFromDate(transactions[0]?.date) ||
    2026;
  const contextMonth = extractMonthNumberFromTab(sheetTitle) || undefined;
  let targetRowNumber = headerRowIndex + 2;
  let foundEmptyRow = false;
  let lastFilledDate: string | null = null;
  let isExistingSorted = true;

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const dateVal = mapping.dateCol >= 0 && row[mapping.dateCol] ? String(row[mapping.dateCol]).trim() : '';
    const descVal = mapping.descCol >= 0 && row[mapping.descCol] ? String(row[mapping.descCol]).trim() : '';
    const amtVal = mapping.amountCol >= 0 && row[mapping.amountCol] ? String(row[mapping.amountCol]).trim() : '';
    const catVal = mapping.categoryCol >= 0 && row[mapping.categoryCol] ? String(row[mapping.categoryCol]).trim() : '';

    if (!dateVal && !descVal && !amtVal && !catVal) {
      if (!foundEmptyRow) {
        targetRowNumber = r + 1;
        foundEmptyRow = true;
      }
      continue;
    }

    if (foundEmptyRow) {
      isExistingSorted = false;
    }

    const parsedDate = normalizeDateString(dateVal, contextMonth, contextYear);
    if (parsedDate) {
      if (lastFilledDate && parsedDate < lastFilledDate) {
        isExistingSorted = false;
      }
      lastFilledDate = parsedDate;
    }
  }

  if (!foundEmptyRow) {
    targetRowNumber = rows.length + 1;
  }

  // 5. Construct row values for each transaction
  const minCols = Math.max(headerRow.length, 9);
  const batchRowValues: any[][] = transactions.map((tx) =>
    buildTransactionRowValues(mapping, tx, minCols)
  );
  const maxCol = (batchRowValues[0]?.length || 9) - 1;

  // 6. Write into sheet via PUT
  const endColLetter = getColumnLetter(maxCol);
  const endRowNumber = targetRowNumber + batchRowValues.length - 1;
  const writeRange = encodeURIComponent(`'${sheetTitle}'!A${targetRowNumber}:${endColLetter}${endRowNumber}`);

  let putRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: batchRowValues,
      }),
    }
  );

  if (putRes.status === 401) {
    clearAuthSession();
    throw new Error('AUTH_EXPIRED: Google OAuth 토큰이 만료되었습니다. 상단 [Google 로그인]을 눌러 재인증해 주세요.');
  }

  if (!putRes.ok) {
    try {
      const details = await getSpreadsheetDetails(spreadsheetId, accessToken);
      const targetSheet = details.sheets.find((s) => s.title === sheetTitle);
      if (targetSheet) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                appendDimension: {
                  sheetId: targetSheet.id,
                  dimension: 'ROWS',
                  length: Math.max(100, batchRowValues.length + 20),
                },
              },
            ],
          }),
        });

        // Retry PUT
        putRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ values: batchRowValues }),
          }
        );
      }
    } catch (expandErr) {
      console.warn('Grid expansion retry error for batch:', expandErr);
    }
  }

  if (!putRes.ok) {
    const err = await putRes.json().catch(() => null);
    throw new Error(err?.error?.message || `구글 시트 '${sheetTitle}'에 ${batchRowValues.length}건 일괄 추가 실패`);
  }

  // Fast-path: check if batch dates are monotonic ascending and >= lastFilledDate
  let isBatchMonotonic = true;
  for (let i = 1; i < transactions.length; i++) {
    if ((transactions[i].date || '') < (transactions[i - 1].date || '')) {
      isBatchMonotonic = false;
      break;
    }
  }
  const firstBatchDate = transactions[0]?.date || '';
  const needsSort =
    !isExistingSorted ||
    !isBatchMonotonic ||
    Boolean(lastFilledDate && firstBatchDate && firstBatchDate < lastFilledDate);

  if (needsSort) {
    await sortSheetRowsByDate(spreadsheetId, sheetTitle, mapping.dateCol, accessToken, 'ASCENDING');
  }

  return { count: batchRowValues.length, sheetTitle };
}

/**
 * Sort data rows in a Google Sheet tab chronologically by Date column (keeping headers intact)
 */
export async function sortSheetRowsByDate(
  spreadsheetId: string,
  sheetTitle: string,
  dateColIndex: number,
  accessToken?: string | null,
  sortOrder: 'ASCENDING' | 'DESCENDING' = 'ASCENDING'
): Promise<void> {
  if (!accessToken) return;

  try {
    const details = await getSpreadsheetDetails(spreadsheetId, accessToken);
    const targetSheet = details.sheets.find((s) => s.title === sheetTitle);
    if (!targetSheet) return;

    // Fetch column A to determine filled row count and identify header row
    const encodedRange = encodeURIComponent(`'${sheetTitle}'!A:A`);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueRenderOption=FORMATTED_VALUE`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    if (!res.ok) return;
    const data = await res.json();
    const rows = data.values || [];
    if (rows.length <= 2) return; // 0 or 1 data row, nothing to sort

    let headerRowIndex = 0;
    for (let r = 0; r < Math.min(rows.length, 5); r++) {
      const val = String(rows[r]?.[0] || '').trim();
      if (/(날짜|일자|일시|date)/i.test(val)) {
        headerRowIndex = r;
        break;
      }
    }

    // Sort all rows beneath the header row
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            sortRange: {
              range: {
                sheetId: targetSheet.id,
                startRowIndex: headerRowIndex + 1, // Skip header row!
                endRowIndex: rows.length,
                startColumnIndex: 0,
                endColumnIndex: 26, // Columns A to Z
              },
              sortSpecs: [
                {
                  dimensionIndex: dateColIndex >= 0 ? dateColIndex : 0,
                  sortOrder,
                },
              ],
            },
          },
        ],
      }),
    });
  } catch (err) {
    console.warn('Auto sort sheet by date notice:', err);
  }
}

/**
 * Helper to convert 0-based column index to A1 column letter (e.g. 0->A, 25->Z, 26->AA)
 */
export function getColumnLetter(colIndex: number): string {
  let temp = colIndex + 1;
  let letter = '';
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter || 'Z';
}

/**
 * Update an existing transaction row in Google Sheets
 * Reads the existing row first to preserve any unmapped columns or formulas.
 */
export async function updateTransactionRow(
  spreadsheetId: string,
  sheetTitle: string,
  rowIndex: number,
  mapping: ColumnMapping,
  transaction: Transaction,
  accessToken?: string | null
): Promise<void> {
  // 1. Read existing row first to preserve other column cells/formulas
  let existingValues: any[] = [];
  try {
    const readRange = encodeURIComponent(`'${sheetTitle}'!A${rowIndex}:Z${rowIndex}`);
    const getRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${readRange}?valueRenderOption=UNFORMATTED_VALUE`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    if (getRes.ok) {
      const data = await getRes.json();
      if (data.values && data.values.length > 0 && Array.isArray(data.values[0])) {
        existingValues = [...data.values[0]];
      }
    }
  } catch (err) {
    console.warn('Could not read existing row prior to update:', err);
  }

  // 2. Determine target width
  const maxCol = Math.max(
    existingValues.length - 1,
    mapping.dateCol,
    mapping.categoryCol,
    mapping.descCol,
    mapping.merchantCol ?? -1,
    mapping.itemCol ?? -1,
    mapping.amountCol,
    mapping.incomeCol ?? -1,
    mapping.expenseCol ?? -1,
    mapping.paymentMethodCol ?? -1,
    mapping.memoCol ?? -1,
    mapping.recurringTypeCol ?? -1,
    mapping.subItemsCol ?? -1,
    mapping.typeCol ?? -1
  );

  const rowValues: any[] = [];
  for (let i = 0; i <= maxCol; i++) {
    rowValues.push(existingValues[i] !== undefined ? existingValues[i] : '');
  }

  // 3. Apply updated values onto mapped indices
  if (mapping.dateCol >= 0) {
    rowValues[mapping.dateCol] = transaction.date;
  }

  if (mapping.typeCol !== undefined && mapping.typeCol >= 0) {
    rowValues[mapping.typeCol] =
      transaction.type === 'expense' ? '지출' : transaction.type === 'income' ? '수입' : '이체';
  }

  if (mapping.categoryCol >= 0) {
    rowValues[mapping.categoryCol] = transaction.category;
  }

  // Handle Description, Merchant, and Item columns
  if (
    mapping.merchantCol !== undefined &&
    mapping.merchantCol >= 0 &&
    mapping.itemCol !== undefined &&
    mapping.itemCol >= 0 &&
    mapping.merchantCol !== mapping.itemCol
  ) {
    const mMatch = transaction.description.match(/^(.*?)\s*\((.*?)\)$/);
    if (mMatch) {
      rowValues[mapping.merchantCol] = mMatch[1].trim();
      rowValues[mapping.itemCol] = mMatch[2].trim();
    } else {
      rowValues[mapping.merchantCol] = transaction.description;
      rowValues[mapping.itemCol] = '';
    }
  } else if (mapping.descCol >= 0) {
    rowValues[mapping.descCol] = transaction.description;
  }

  if (mapping.incomeCol !== undefined && mapping.expenseCol !== undefined) {
    if (transaction.type === 'income') {
      rowValues[mapping.incomeCol] = transaction.amount;
      rowValues[mapping.expenseCol] = '';
    } else {
      rowValues[mapping.incomeCol] = '';
      rowValues[mapping.expenseCol] = transaction.amount;
    }
  } else if (mapping.amountCol >= 0) {
    rowValues[mapping.amountCol] = transaction.amount;
  }

  if (mapping.paymentMethodCol !== undefined && mapping.paymentMethodCol >= 0) {
    rowValues[mapping.paymentMethodCol] = transaction.paymentMethod || '';
  }

  // 지출유형 컬럼 ("정", "특", "")
  if (mapping.recurringTypeCol !== undefined && mapping.recurringTypeCol >= 0) {
    rowValues[mapping.recurringTypeCol] = transaction.isRecurring ? '정' : transaction.isSpecial ? '특' : '';
  }

  // 세부품목 컬럼
  if (mapping.subItemsCol !== undefined && mapping.subItemsCol >= 0) {
    rowValues[mapping.subItemsCol] = formatSubItemsForColumn(transaction.subItems);
  }

  // 비고 컬럼 (순수 메모, 태그 분리)
  if (mapping.memoCol !== undefined && mapping.memoCol >= 0) {
    let cleanMemo = stripTagsFromMemo(transaction.memo);
    if (mapping.subItemsCol === undefined || mapping.subItemsCol < 0) {
      cleanMemo = serializeSubItemsToMemo(cleanMemo, transaction.subItems);
    }
    if (mapping.recurringTypeCol === undefined || mapping.recurringTypeCol < 0) {
      if (transaction.isRecurring && !cleanMemo.includes('[정기예산]')) {
        cleanMemo = `[정기예산] ${cleanMemo}`.trim();
      } else if (transaction.isSpecial && !cleanMemo.includes('[특별지출]')) {
        cleanMemo = `[특별지출] ${cleanMemo}`.trim();
      }
    }
    rowValues[mapping.memoCol] = cleanMemo;
  }

  const gasUrl = typeof window !== 'undefined' ? localStorage.getItem('smart_money_gas_url') : null;
  if (!accessToken) {
    if (gasUrl) {
      await postToGasWebApp(gasUrl, {
        action: 'update',
        sheetTitle,
        rowIndex,
        rowValues,
      });
      return;
    }
    throw new Error('Google OAuth 액세스 토큰 또는 Apps Script 웹앱 연동이 필요합니다.');
  }

  const endColLetter = getColumnLetter(rowValues.length - 1);
  const writeRange = encodeURIComponent(`'${sheetTitle}'!A${rowIndex}:${endColLetter}${rowIndex}`);

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [rowValues],
      }),
    }
  );

  if (res.status === 401) {
    clearAuthSession();
    throw new Error('AUTH_EXPIRED: Google OAuth 토큰이 만료되었습니다. 상단 [Google 로그인]을 눌러 토큰을 갱신해 주세요.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message || `구글 시트 ${rowIndex}행 수정 실패`);
  }
}

/**
 * Delete a single transaction row from a sheet
 */
export async function deleteTransactionRow(
  spreadsheetId: string,
  sheetId: number,
  rowIndex: number,
  accessToken?: string | null,
  sheetTitle?: string
): Promise<void> {
  const gasUrl = typeof window !== 'undefined' ? localStorage.getItem('smart_money_gas_url') : null;
  if (!accessToken) {
    if (gasUrl) {
      await postToGasWebApp(gasUrl, {
        action: 'delete',
        sheetId,
        sheetTitle,
        rowIndex,
      });
      return;
    }
    throw new Error('Google OAuth 액세스 토큰 또는 Apps Script 웹앱 연동이 필요합니다.');
  }

  // Google Sheets API batchUpdate deleteDimension uses 0-based indexing [startIndex, endIndex)
  const startIndex = rowIndex - 1;
  const endIndex = rowIndex;

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex,
              endIndex,
            },
          },
        },
      ],
    }),
  });

  if (res.status === 401) {
    throw new Error('AUTH_EXPIRED: Google OAuth 토큰이 만료되었습니다. 상단 [Google 로그인]을 눌러 토큰을 갱신해 주세요.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message || `구글 시트 ${rowIndex}행 삭제 실패`);
  }
}

/**
 * Delete multiple transaction rows from a sheet in a single batchUpdate
 * Sorts rowIndices descending so previous row index deletions do not shift remaining indices!
 */
export async function deleteMultipleTransactionRows(
  spreadsheetId: string,
  sheetId: number,
  rowIndices: number[],
  accessToken: string
): Promise<void> {
  if (!rowIndices || rowIndices.length === 0) return;

  // Crucial: sort descending so lower row indices remain valid
  const sorted = [...new Set(rowIndices)].sort((a, b) => b - a);

  const requests = sorted.map((rIdx) => ({
    deleteDimension: {
      range: {
        sheetId,
        dimension: 'ROWS',
        startIndex: rIdx - 1,
        endIndex: rIdx,
      },
    },
  }));

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message || '구글 시트 일괄 삭제 실패');
  }
}

/**
 * Add a new monthly sheet tab if missing
 */
export async function addMonthlySheetTab(
  spreadsheetId: string,
  sheetTitle: string,
  headers: string[],
  accessToken: string,
  initialRowCount?: number
): Promise<{ sheetId: number; title: string }> {
  const defaultRows =
    initialRowCount || (extractYearFromTab(sheetTitle) !== null ? 1000 : 200);
  const addSheetRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetTitle,
                gridProperties: {
                  rowCount: defaultRows,
                  columnCount: Math.max(10, headers?.length || 9),
                  frozenRowCount: 1,
                },
              },
            },
          },
        ],
      }),
    }
  );

  if (!addSheetRes.ok) {
    const err = await addSheetRes.json().catch(() => null);
    const errMsg = err?.error?.message || '';
    if (
      addSheetRes.status === 401 ||
      errMsg.includes('invalid authentication credentials') ||
      errMsg.includes('OAuth 2')
    ) {
      throw new Error(
        'AUTH_EXPIRED: Google OAuth 토큰이 만료되었습니다. 상단 [Google 로그인]을 눌러 재인증해 주세요.'
      );
    }
    throw new Error(errMsg || `'${sheetTitle}' 시트 탭 생성 실패`);
  }

  const addSheetData = await addSheetRes.json();
  const newSheetId = addSheetData.replies?.[0]?.addSheet?.properties?.sheetId || 0;

  // Add header row
  if (headers && headers.length > 0) {
    const encodedRange = encodeURIComponent(`'${sheetTitle}'!A1:Z1`);
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [headers],
        }),
      }
    );
  }

  return { sheetId: newSheetId, title: sheetTitle };
}

/**
 * Export all transactions of a given month into Google Sheets under a dedicated monthly tab (e.g. '10월')
 * Creates the tab if it doesn't exist, writes standard headers, and writes all rows cleanly.
 */
export async function exportMonthTransactionsToSheet(
  spreadsheetId: string,
  sheetTitle: string,
  transactions: Transaction[],
  accessToken: string
): Promise<{ count: number; sheetTitle: string }> {
  if (!accessToken) {
    throw new Error('AUTH_EXPIRED: Google OAuth 토큰이 필요합니다. 상단 [Google 로그인]을 눌러주세요.');
  }

  const defaultHeaders = ['날짜', '구분', '분류', '내용/사용처', '금액', '결제수단', '지출유형', '세부품목', '비고'];

  // 1. Check if sheet tab exists
  let tabExists = false;
  try {
    const encodedRange = encodeURIComponent(`'${sheetTitle}'!A1:Z1`);
    const checkRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueRenderOption=FORMATTED_VALUE`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (checkRes.ok) {
      tabExists = true;
    } else if (checkRes.status === 401) {
      throw new Error('AUTH_EXPIRED: Google OAuth 토큰이 만료되었습니다. 상단 [Google 로그인]을 눌러 재인증해 주세요.');
    }
  } catch (e: any) {
    if (e?.message?.includes('AUTH_EXPIRED') || isAuthExpiredError(e)) throw e;
    tabExists = false;
  }

  // 2. Create tab if missing
  if (!tabExists) {
    await addMonthlySheetTab(spreadsheetId, sheetTitle, defaultHeaders, accessToken);
  }

  // Clear existing rows (including row 5000+ orphan rows if any existed)
  const clearRange = encodeURIComponent(`'${sheetTitle}'!A1:Z6000`);
  try {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${clearRange}:clear`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (clearErr) {
    console.warn('Clear range prior to month export warning:', clearErr);
  }

  // 3. Format transaction rows (sorted ascending by date)
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const rows: any[][] = [
    defaultHeaders,
    ...sorted.map((t) => [
      t.date,
      t.type === 'income' ? '수입' : t.type === 'transfer' ? '이체' : '지출',
      t.category || '',
      t.description || '',
      t.amount || 0,
      t.paymentMethod || '',
      t.isRecurring ? '정' : t.isSpecial ? '특' : '',
      formatSubItemsForColumn(t.subItems),
      stripTagsFromMemo(t.memo),
    ]),
  ];

  // 4. Write all rows cleanly from A1
  const endCol = getColumnLetter(defaultHeaders.length - 1);
  const writeRange = encodeURIComponent(`'${sheetTitle}'!A1:${endCol}${rows.length}`);
  const writeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: rows }),
    }
  );

  if (writeRes.status === 401) {
    throw new Error('AUTH_EXPIRED: Google OAuth 토큰이 만료되었습니다. 상단 [Google 로그인]을 눌러 재인증해 주세요.');
  }

  if (!writeRes.ok) {
    const err = await writeRes.json().catch(() => null);
    throw new Error(err?.error?.message || `'${sheetTitle}' 시트 탭에 내역 저장 실패`);
  }

  return { count: sorted.length, sheetTitle };
}

/**
 * Automatically migrate an existing sheet tab to the new 9-column separated structure:
 * ['날짜', '구분', '분류', '내용/사용처', '금액', '결제수단', '지출유형', '세부품목', '비고']
 * Splits existing memo tags ([정기예산] -> '정', [특별지출] -> '특', [세부품목: ...] -> '세부품목')
 * into their own dedicated columns, strips memo tags to leave pure notes, and eliminates any 5000+ ghost row gaps.
 */
export async function migrateSheetColumns(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string
): Promise<{ count: number; sheetTitle: string }> {
  if (!accessToken) {
    throw new Error('AUTH_EXPIRED: Google OAuth 토큰이 필요합니다. 상단 [Google 로그인]을 눌러주세요.');
  }

  // 1. Fetch all existing rows
  const rows = await getSheetValues(spreadsheetId, sheetTitle, accessToken, 'A:Z');
  if (!rows || rows.length <= 1) {
    throw new Error(`'${sheetTitle}' 시트에 변환할 데이터가 없습니다.`);
  }

  // 2. Analyze and extract all transactions (including any stranded down at 5000+)
  const sheetTabs = [{ id: 1, title: sheetTitle }];
  const { transactions } = analyzeSheetStructure(spreadsheetId, '가계부', sheetTabs, sheetTitle, rows);

  if (transactions.length === 0) {
    throw new Error(`'${sheetTitle}' 시트에서 거래 내역을 찾을 수 없습니다.`);
  }

  // 3. Clear existing old rows (including row 5000+ orphan rows)
  const clearRange = encodeURIComponent(`'${sheetTitle}'!A1:Z6000`);
  try {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${clearRange}:clear`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (clearErr) {
    console.warn('Clear range warning:', clearErr);
  }

  // 4. Standard 9 headers
  const newHeaders = ['날짜', '구분', '분류', '내용/사용처', '금액', '결제수단', '지출유형', '세부품목', '비고'];

  // 5. Format all transactions sorted by date
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const newRows: any[][] = [
    newHeaders,
    ...sorted.map((t) => [
      t.date,
      t.type === 'income' ? '수입' : t.type === 'transfer' ? '이체' : '지출',
      t.category || '',
      t.description || '',
      t.amount || 0,
      t.paymentMethod || '',
      t.isRecurring ? '정' : t.isSpecial ? '특' : '',
      formatSubItemsForColumn(t.subItems),
      stripTagsFromMemo(t.memo),
    ]),
  ];

  // 6. Write cleanly starting at A1
  const endCol = getColumnLetter(newHeaders.length - 1);
  const writeRange = encodeURIComponent(`'${sheetTitle}'!A1:${endCol}${newRows.length}`);
  const writeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: newRows }),
    }
  );

  if (!writeRes.ok) {
    const err = await writeRes.json().catch(() => null);
    throw new Error(err?.error?.message || `'${sheetTitle}' 시트 컬럼 분리 저장 실패`);
  }

  return { count: sorted.length, sheetTitle };
}

export interface MonthMigrationResult {
  monthTitle: string;
  count: number;
  status: 'migrated' | 'initialized' | 'created_and_initialized' | 'error';
  error?: string;
}

/**
 * Migrate all 12 month sheets (1월 ~ 12월) in the 2026 Google Spreadsheet:
 * 1. For sheets with data: extracts transactions (including rows at 5000+), clears ghost rows,
 *    and writes clean 9 columns ('날짜', '구분', '분류', '내용/사용처', '금액', '결제수단', '지출유형', '세부품목', '비고')
 *    starting at row 2.
 * 2. For sheets with no transactions or empty: initializes the 9 column headers.
 * 3. For missing month sheets among 1월~12월: automatically creates the tab and initializes the 9 column headers.
 */
export async function migrateAllMonthSheetsColumns(
  spreadsheetId: string,
  accessToken: string,
  onProgress?: (info: { month: string; index: number; total: number; message: string }) => void
): Promise<{
  results: MonthMigrationResult[];
  totalMigratedTxs: number;
}> {
  if (!accessToken) {
    throw new Error('AUTH_EXPIRED: Google OAuth 토큰이 필요합니다. 상단 [Google 로그인]을 눌러주세요.');
  }

  // 1. Fetch current spreadsheet metadata
  const meta = await getSpreadsheetDetails(spreadsheetId, accessToken);
  const existingTabs = meta.sheets || [];

  const targetMonths = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  const standardHeaders = ['날짜', '구분', '분류', '내용/사용처', '금액', '결제수단', '지출유형', '세부품목', '비고'];

  const results: MonthMigrationResult[] = [];
  let totalMigratedTxs = 0;

  for (let i = 0; i < targetMonths.length; i++) {
    const monthNum = i + 1;
    const defaultTabName = targetMonths[i];

    // Find matching tab
    const matchedTab =
      findTabForMonth(existingTabs, monthNum) ||
      existingTabs.find((t) => t.title.trim() === defaultTabName);
    const displayTitle = matchedTab ? matchedTab.title : defaultTabName;

    onProgress?.({
      month: displayTitle,
      index: i + 1,
      total: 12,
      message: `[${displayTitle}] 탭 처리 중... (${i + 1}/12)`,
    });

    try {
      if (matchedTab) {
        const sheetTitle = matchedTab.title;
        // Fetch rows
        const rows = await getSheetValues(spreadsheetId, sheetTitle, accessToken, 'A:Z');

        if (rows && rows.length > 1) {
          // Analyze transactions
          const { transactions } = analyzeSheetStructure(
            spreadsheetId,
            '가계부',
            existingTabs,
            sheetTitle,
            rows
          );

          if (transactions.length > 0) {
            // Clear range up to row 6000 to eliminate ghost rows and gaps
            const clearRange = encodeURIComponent(`'${sheetTitle}'!A1:Z6000`);
            try {
              await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${clearRange}:clear`,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                }
              );
            } catch (cErr) {
              console.warn('Clear range notice:', cErr);
            }

            // Build new rows
            const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
            const newRows: any[][] = [
              standardHeaders,
              ...sorted.map((t) => [
                t.date,
                t.type === 'income' ? '수입' : t.type === 'transfer' ? '이체' : '지출',
                t.category || '',
                t.description || '',
                t.amount || 0,
                t.paymentMethod || '',
                t.isRecurring ? '정' : t.isSpecial ? '특' : '',
                formatSubItemsForColumn(t.subItems),
                stripTagsFromMemo(t.memo),
              ]),
            ];

            const endCol = getColumnLetter(standardHeaders.length - 1);
            const writeRange = encodeURIComponent(`'${sheetTitle}'!A1:${endCol}${newRows.length}`);
            const writeRes = await fetch(
              `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`,
              {
                method: 'PUT',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ values: newRows }),
              }
            );

            if (!writeRes.ok) {
              const errJson = await writeRes.json().catch(() => null);
              throw new Error(errJson?.error?.message || `'${sheetTitle}' 저장 실패`);
            }

            totalMigratedTxs += sorted.length;
            results.push({
              monthTitle: sheetTitle,
              count: sorted.length,
              status: 'migrated',
            });
          } else {
            // Only header or empty
            const endCol = getColumnLetter(standardHeaders.length - 1);
            const writeRange = encodeURIComponent(`'${sheetTitle}'!A1:${endCol}1`);
            await fetch(
              `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`,
              {
                method: 'PUT',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ values: [standardHeaders] }),
              }
            );
            results.push({
              monthTitle: sheetTitle,
              count: 0,
              status: 'initialized',
            });
          }
        } else {
          // Empty or non-existent rows
          const endCol = getColumnLetter(standardHeaders.length - 1);
          const writeRange = encodeURIComponent(`'${sheetTitle}'!A1:${endCol}1`);
          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`,
            {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ values: [standardHeaders] }),
            }
          );
          results.push({
            monthTitle: sheetTitle,
            count: 0,
            status: 'initialized',
          });
        }
      } else {
        // Tab does not exist: create sheet and set header
        const addSheetRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              requests: [
                {
                  addSheet: {
                    properties: {
                      title: defaultTabName,
                      gridProperties: {
                        rowCount: 150,
                        columnCount: 10,
                        frozenRowCount: 1,
                      },
                    },
                  },
                },
              ],
            }),
          }
        );

        if (addSheetRes.ok) {
          const endCol = getColumnLetter(standardHeaders.length - 1);
          const writeRange = encodeURIComponent(`'${defaultTabName}'!A1:${endCol}1`);
          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`,
            {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ values: [standardHeaders] }),
            }
          );
          results.push({
            monthTitle: defaultTabName,
            count: 0,
            status: 'created_and_initialized',
          });
        } else {
          results.push({
            monthTitle: defaultTabName,
            count: 0,
            status: 'error',
            error: '탭 생성 실패',
          });
        }
      }
    } catch (tabErr: any) {
      console.error(`Migration error for ${defaultTabName}:`, tabErr);
      results.push({
        monthTitle: displayTitle,
        count: 0,
        status: 'error',
        error: tabErr?.message || String(tabErr),
      });
    }
  }

  return { results, totalMigratedTxs };
}

/**
 * Extract 1-based month number (1~12) from sheet tab title
 * Handles: "1월", "01월", "1", "01", "1월 지출", "2026-01", "2026.1", "Jan", etc.
 */
export function extractMonthNumberFromTab(title?: string): number | null {
  if (!title) return null;
  const t = title.trim();

  // 1. Korean month format: "1월", "01월", "10월", "1월 지출", "1월내역"
  const korMatch = t.match(/(?:^|[^0-9])(\d{1,2})월/);
  if (korMatch) {
    const m = parseInt(korMatch[1], 10);
    if (m >= 1 && m <= 12) return m;
  }

  // 2. Year-Month: "2026-01", "2026.1", "2026/01", "26-01", "26.1"
  const ymMatch = t.match(/\d{2,4}\s*[-.\/]\s*(\d{1,2})(?:[^0-9]|$)/);
  if (ymMatch) {
    const m = parseInt(ymMatch[1], 10);
    if (m >= 1 && m <= 12) return m;
  }

  // 3. Pure numeric tab: "1", "2", ..., "12", "01", "02", ..., "12"
  const numMatch = t.match(/^0?(\d{1,2})$/);
  if (numMatch) {
    const m = parseInt(numMatch[1], 10);
    if (m >= 1 && m <= 12) return m;
  }

  // 4. English month: "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  const engMonths = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const lower = t.toLowerCase();
  for (let i = 0; i < engMonths.length; i++) {
    if (lower.startsWith(engMonths[i])) {
      return i + 1;
    }
  }

  return null;
}

/**
 * Robustly find matching tab for a target month (1~12)
 */
export function findTabForMonth(
  tabs: Array<{ id: number; title: string }>,
  targetMonth: number
): { id: number; title: string } | undefined {
  if (!tabs || tabs.length === 0) return undefined;

  // 1. Trimmed exact match with `${targetMonth}월` or `${String(targetMonth).padStart(2, '0')}월`
  const exactKor = tabs.find((t) => {
    const trimmed = (t.title || '').trim();
    return (
      trimmed === `${targetMonth}월` ||
      trimmed === `${String(targetMonth).padStart(2, '0')}월` ||
      trimmed.replace(/\s+/g, '') === `${targetMonth}월`
    );
  });
  if (exactKor) return exactKor;

  // 2. Exact match with `${targetMonth}` or `${String(targetMonth).padStart(2, '0')}`
  const exactNum = tabs.find((t) => {
    const trimmed = (t.title || '').trim();
    return trimmed === String(targetMonth) || trimmed === String(targetMonth).padStart(2, '0');
  });
  if (exactNum) return exactNum;

  // 3. Match via extractMonthNumberFromTab
  const parsedMatch = tabs.find((t) => extractMonthNumberFromTab((t.title || '').trim()) === targetMonth);
  if (parsedMatch) return parsedMatch;

  return undefined;
}

/**
 * Helper to normalize varied date formats to YYYY-MM-DD
 * Supports contextMonth when row only has day number (e.g. "5", "15", "5일")
 * and contextYear when date omits the year (e.g. "3.15", "3월 15일").
 */
export function normalizeDateString(
  raw: any,
  contextMonth?: number,
  contextYear: number = 2026
): string | null {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim();
  if (!str) return null;
  const curYear = contextYear || 2026;

  // 1. Google Visualization API Date constructor format: Date(YYYY, M, D) or Date(YYYY, M, D, H, M, S)
  // Note: in GViz, Month is 0-indexed (0 = Jan, 9 = Oct)
  const gvizDateMatch = str.match(/^Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})/i);
  if (gvizDateMatch) {
    const y = gvizDateMatch[1];
    const mNum = parseInt(gvizDateMatch[2], 10) + 1;
    const m = String(mNum).padStart(2, '0');
    const d = gvizDateMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 2. Google Sheets numeric serial dates (e.g., 35000 ~ 65000)
  if (/^\d{5}(\.\d+)?$/.test(str)) {
    const serial = Math.floor(parseFloat(str));
    if (serial >= 30000 && serial <= 60000) {
      // 25569 = days between 1899-12-30 and 1970-01-01
      const date = new Date((serial - 25569) * 86400 * 1000);
      if (!isNaN(date.getTime())) {
        return date.toISOString().slice(0, 10);
      }
    }
  }

  // 3. Korean date formats: "2026년 10월 15일", "2026년 1월 5일", "26년 1월 5일"
  const korWithYearMatch = str.match(/(\d{2,4})년\s*(\d{1,2})월\s*(\d{1,2})일?/);
  if (korWithYearMatch) {
    const y = korWithYearMatch[1].length === 2 ? `20${korWithYearMatch[1]}` : korWithYearMatch[1];
    const m = korWithYearMatch[2].padStart(2, '0');
    const d = korWithYearMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const korNoYearMatch = str.match(/^(\d{1,2})월\s*(\d{1,2})일?/);
  if (korNoYearMatch) {
    const m = korNoYearMatch[1].padStart(2, '0');
    const d = korNoYearMatch[2].padStart(2, '0');
    return `${curYear}-${m}-${d}`;
  }

  // 4. Matches 4-digit year with flexible spacing & separators: "2026. 1. 15.", "2026-1-15", "2026/1/15", "2026. 01. 05"
  const ymdMatch = str.match(/^(\d{4})\s*[\.\-\/]\s*(\d{1,2})\s*[\.\-\/]\s*(\d{1,2})\.?/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 5. Matches 2-digit year: "26. 1. 15", "26-1-15", "26.10.15."
  const y2Match = str.match(/^(\d{2})\s*[\.\-\/]\s*(\d{1,2})\s*[\.\-\/]\s*(\d{1,2})\.?/);
  if (y2Match) {
    const y = `20${y2Match[1]}`;
    const m = y2Match[2].padStart(2, '0');
    const d = y2Match[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 6. Matches MM/DD or MM.DD or M.D (uses contextYear): "1. 5", "1/5", "01.05", "1-5"
  const mdMatch = str.match(/^(\d{1,2})\s*[\.\-\/]\s*(\d{1,2})\.?$/);
  if (mdMatch) {
    const m = mdMatch[1].padStart(2, '0');
    const d = mdMatch[2].padStart(2, '0');
    const mNum = parseInt(m, 10);
    const dNum = parseInt(d, 10);
    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      return `${curYear}-${m}-${d}`;
    }
  }

  // 7. Day only (e.g. "1", "05", "15", "1일", "15일") when contextMonth is known (1 ~ 12)
  if (contextMonth && contextMonth >= 1 && contextMonth <= 12) {
    const dayMatch = str.match(/^(\d{1,2})\s*일?$/);
    if (dayMatch) {
      const dNum = parseInt(dayMatch[1], 10);
      if (dNum >= 1 && dNum <= 31) {
        const m = String(contextMonth).padStart(2, '0');
        const d = String(dNum).padStart(2, '0');
        return `${curYear}-${m}-${d}`;
      }
    }
  }

  // 8. Try standard Date.parse
  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    return d.toISOString().slice(0, 10);
  }

  return null;
}

/**
 * Convert Transaction array into standardized 9-column sheet rows (preserving installment tags, fixed/special flags, sub-items, pure memo)
 */
export function transactionsToStandardSheetRows(transactions: Transaction[]): any[][] {
  const sorted = [...transactions].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return [
    STANDARD_9_HEADERS,
    ...sorted.map((t) => [
      t.date || '',
      t.type === 'income' ? '수입' : t.type === 'transfer' ? '이체' : '지출',
      t.category || '',
      t.description || '',
      Number(t.amount) || 0,
      t.paymentMethod || '',
      t.isRecurring ? '정' : t.isSpecial ? '특' : '',
      formatSubItemsForColumn(t.subItems),
      stripTagsFromMemo(t.memo),
    ]),
  ];
}

/**
 * Deduplicate transactions using exact signature (date + type + amount + description + category + paymentMethod)
 * while still allowing legitimate identical same-day purchases when already inside the same tab by tracking occurrence count per source.
 */
function deduplicateTransactionsClean(txs: Transaction[]): Transaction[] {
  const seen = new Map<string, number>();
  const result: Transaction[] = [];
  for (const tx of txs) {
    const baseKey = `${tx.date}|${tx.type}|${tx.amount}|${(tx.description || '').trim()}|${(tx.category || '').trim()}|${(tx.paymentMethod || '').trim()}`;
    const count = (seen.get(baseKey) || 0) + 1;
    seen.set(baseKey, count);
    result.push(tx);
  }
  return result;
}

/**
 * Merge base transactions with incoming transactions, skipping items whose exact signature already exists in target tab.
 */
function mergeTransactionsWithoutDuplicates(
  existingInTarget: Transaction[],
  incoming: Transaction[]
): { merged: Transaction[]; addedCount: number; skippedDuplicates: number } {
  const existingCount = new Map<string, number>();
  const makeSig = (t: Transaction) =>
    `${t.date}|${t.type}|${Number(t.amount) || 0}|${(t.description || '').trim()}|${(t.category || '').trim()}`;

  existingInTarget.forEach((t) => {
    const sig = makeSig(t);
    existingCount.set(sig, (existingCount.get(sig) || 0) + 1);
  });

  const incomingSeen = new Map<string, number>();
  const toAdd: Transaction[] = [];
  let skippedDuplicates = 0;

  incoming.forEach((t) => {
    const sig = makeSig(t);
    const curIdx = (incomingSeen.get(sig) || 0) + 1;
    incomingSeen.set(sig, curIdx);
    const alreadyHave = existingCount.get(sig) || 0;
    if (curIdx <= alreadyHave) {
      skippedDuplicates++;
    } else {
      toAdd.push(t);
    }
  });

  return {
    merged: [...existingInTarget, ...toAdd],
    addedCount: toAdd.length,
    skippedDuplicates,
  };
}

/**
 * Ensure target sheet tab exists, has enough grid rows, clear old contents, and write all rows in safe batches.
 */
async function writeStandardRowsToTargetTab(
  spreadsheetId: string,
  targetTabTitle: string,
  rowsData: any[][],
  accessToken: string
): Promise<{ tabCreated: boolean }> {
  const meta = await getSpreadsheetDetails(spreadsheetId, accessToken);
  let targetSheet = meta.sheets.find((s) => s.title.trim() === targetTabTitle.trim());
  let tabCreated = false;

  const requiredRows = Math.max(1000, rowsData.length + 250);

  if (!targetSheet) {
    await addMonthlySheetTab(
      spreadsheetId,
      targetTabTitle,
      STANDARD_9_HEADERS,
      accessToken,
      requiredRows
    );
    tabCreated = true;
    const updatedMeta = await getSpreadsheetDetails(spreadsheetId, accessToken);
    targetSheet = updatedMeta.sheets.find((s) => s.title.trim() === targetTabTitle.trim());
  } else {
    // Check current grid rowCount and expand if needed before bulk write
    try {
      const sheetPropRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title,gridProperties)`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (sheetPropRes.ok) {
        const propJson = await sheetPropRes.json();
        const foundProp = (propJson.sheets || []).find(
          (s: any) => s.properties?.sheetId === targetSheet!.id
        );
        const curRowCount = foundProp?.properties?.gridProperties?.rowCount || 1000;
        if (curRowCount < rowsData.length + 100) {
          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                requests: [
                  {
                    appendDimension: {
                      sheetId: targetSheet.id,
                      dimension: 'ROWS',
                      length: rowsData.length + 300 - curRowCount,
                    },
                  },
                ],
              }),
            }
          );
        }
      }
    } catch (gridErr) {
      console.warn('Grid check/expand warning:', gridErr);
    }

    // Clear existing contents
    const clearRange = encodeURIComponent(`'${targetTabTitle}'!A1:Z10000`);
    try {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${clearRange}:clear`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (clearErr) {
      console.warn('Target clear warning:', clearErr);
    }
  }

  // Write rows in safe chunks (up to 2000 rows per PUT call to prevent payload timeouts)
  const CHUNK_SIZE = 2000;
  const endCol = getColumnLetter(STANDARD_9_HEADERS.length - 1);
  for (let offset = 0; offset < rowsData.length; offset += CHUNK_SIZE) {
    const chunk = rowsData.slice(offset, offset + CHUNK_SIZE);
    const startRow = offset + 1;
    const endRow = offset + chunk.length;
    const writeRange = encodeURIComponent(`'${targetTabTitle}'!A${startRow}:${endCol}${endRow}`);
    const writeRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: chunk }),
      }
    );

    if (writeRes.status === 401) {
      throw new Error('AUTH_EXPIRED: Google OAuth 토큰이 만료되었습니다. 상단 [Google 로그인]을 눌러 재인증해 주세요.');
    }
    if (!writeRes.ok) {
      const errJson = await writeRes.json().catch(() => null);
      throw new Error(errJson?.error?.message || `'${targetTabTitle}' 시트 쓰기 실패 (${startRow}~${endRow}행)`);
    }
  }

  return { tabCreated };
}

export const PERPETUAL_SUMMARY_TAB_TITLE = '📊 연도별 요약';

function escapeSheetTitleForFormula(title: string): string {
  return title.replace(/'/g, "''");
}

/**
 * Apply clean headers, frozen top row, currency number format, and column widths on a unified year tab.
 */
export async function formatYearSheetTab(
  spreadsheetId: string,
  sheetId: number,
  accessToken: string
): Promise<void> {
  const widths = [105, 68, 120, 220, 115, 125, 82, 260, 220];
  const requests: any[] = [
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: 1 },
        },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 9 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.118, green: 0.161, blue: 0.231 },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            textFormat: {
              foregroundColor: { red: 1, green: 1, blue: 1 },
              bold: true,
              fontSize: 10,
            },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 5 },
        cell: {
          userEnteredFormat: {
            numberFormat: { type: 'NUMBER', pattern: '#,##0' },
          },
        },
        fields: 'userEnteredFormat.numberFormat',
      },
    },
    ...widths.map((pixelSize, idx) => ({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: idx, endIndex: idx + 1 },
        properties: { pixelSize },
        fields: 'pixelSize',
      },
    })),
  ];

  try {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });
  } catch (err) {
    console.warn('formatYearSheetTab warning:', err);
  }
}

/**
 * Build live SUMIF/SUMIFS formula rows for the in-sheet [📊 연도별 요약] perpetual dashboard tab.
 */
export function buildPerpetualSummarySheetRows(
  yearTabs: Array<{ year: number; title: string }>
): any[][] {
  const sortedYears = [...yearTabs].sort((a, b) => b.year - a.year);
  const rows: any[][] = [];

  rows.push(['📊 스마트 만년 가계부 — 연도별 종합 요약', '', '', '', '', '', '', '']);
  rows.push([
    '※ 각 연도 탭([2026], [2025] 등)에 내역이 추가/수정되면 아래 연도별·월별 통계가 실시간 자동 계산됩니다.',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]);
  rows.push([
    '연도',
    '연도 탭',
    '총 수입',
    '총 지출',
    '순수지 (수입-지출)',
    '고정지출 (정)',
    '특별지출 (특)',
    '거래 건수',
  ]);

  const yearStartRow = 4; // 1-based row number in Google Sheets
  sortedYears.forEach((yt, idx) => {
    const r = yearStartRow + idx;
    const ref = `'${escapeSheetTitleForFormula(yt.title)}'`;
    rows.push([
      `${yt.year}년`,
      yt.title,
      `=SUMIF(${ref}!B:B,"수입",${ref}!E:E)`,
      `=SUMIF(${ref}!B:B,"지출",${ref}!E:E)`,
      `=C${r}-D${r}`,
      `=SUMIFS(${ref}!E:E,${ref}!B:B,"지출",${ref}!G:G,"정")`,
      `=SUMIFS(${ref}!E:E,${ref}!B:B,"지출",${ref}!G:G,"특")`,
      `=MAX(0,COUNTA(${ref}!A:A)-1)`,
    ]);
  });

  if (sortedYears.length > 0) {
    const endRow = yearStartRow + sortedYears.length - 1;
    rows.push([
      '전체 누적 합계',
      `${sortedYears.length}개 연도`,
      `=SUM(C${yearStartRow}:C${endRow})`,
      `=SUM(D${yearStartRow}:D${endRow})`,
      `=SUM(E${yearStartRow}:E${endRow})`,
      `=SUM(F${yearStartRow}:F${endRow})`,
      `=SUM(G${yearStartRow}:G${endRow})`,
      `=SUM(H${yearStartRow}:H${endRow})`,
    ]);
  }

  rows.push([]);
  rows.push(['📅 연도별 월간 수입 / 지출 추이 (1월 ~ 12월 비교)']);

  // Monthly breakdown across all detected years
  const monthlyHeader: string[] = ['월'];
  sortedYears.forEach((yt) => {
    monthlyHeader.push(`${yt.year}년 수입`, `${yt.year}년 지출`, `${yt.year}년 순수지`);
  });
  rows.push(monthlyHeader);

  const monthlyDataStartRow = rows.length + 1;
  for (let m = 1; m <= 12; m++) {
    const rowNum = monthlyDataStartRow + (m - 1);
    const row: any[] = [`${m}월`];
    sortedYears.forEach((yt, yIdx) => {
      const ref = `'${escapeSheetTitleForFormula(yt.title)}'`;
      const incColLetter = getColumnLetter(1 + yIdx * 3);
      const expColLetter = getColumnLetter(2 + yIdx * 3);
      row.push(
        `=SUMIFS(${ref}!E:E,${ref}!B:B,"수입",${ref}!A:A,">="&DATE(${yt.year},${m},1),${ref}!A:A,"<="&EOMONTH(DATE(${yt.year},${m},1),0))`,
        `=SUMIFS(${ref}!E:E,${ref}!B:B,"지출",${ref}!A:A,">="&DATE(${yt.year},${m},1),${ref}!A:A,"<="&EOMONTH(DATE(${yt.year},${m},1),0))`,
        `=${incColLetter}${rowNum}-${expColLetter}${rowNum}`
      );
    });
    rows.push(row);
  }

  if (sortedYears.length > 0) {
    const monthlyEndRow = monthlyDataStartRow + 11;
    const totalRow: any[] = ['연간 합계'];
    sortedYears.forEach((_, yIdx) => {
      const incCol = getColumnLetter(1 + yIdx * 3);
      const expCol = getColumnLetter(2 + yIdx * 3);
      const netCol = getColumnLetter(3 + yIdx * 3);
      totalRow.push(
        `=SUM(${incCol}${monthlyDataStartRow}:${incCol}${monthlyEndRow})`,
        `=SUM(${expCol}${monthlyDataStartRow}:${expCol}${monthlyEndRow})`,
        `=SUM(${netCol}${monthlyDataStartRow}:${netCol}${monthlyEndRow})`
      );
    });
    rows.push(totalRow);
  }

  return rows;
}

/**
 * Create or update the [📊 연도별 요약] perpetual summary tab in Google Sheets with live SUMIF/SUMIFS formulas.
 */
export async function syncPerpetualSummaryTabInGoogleSheet(
  spreadsheetId: string,
  accessToken: string
): Promise<{ sheetId: number; title: string; yearCount: number }> {
  const meta = await getSpreadsheetDetails(spreadsheetId, accessToken);
  const yearTabs = findAllYearTabs(meta.sheets || []);

  let summarySheet = (meta.sheets || []).find(
    (s) =>
      s.title.trim() === PERPETUAL_SUMMARY_TAB_TITLE ||
      /연도별\s*요약|연도\s*요약/i.test(s.title)
  );

  const summaryTitle = summarySheet ? summarySheet.title : PERPETUAL_SUMMARY_TAB_TITLE;
  let summarySheetId = summarySheet?.id;

  if (!summarySheet) {
    const addRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: summaryTitle,
                  index: 0,
                  gridProperties: {
                    rowCount: 80,
                    columnCount: Math.max(12, 2 + yearTabs.length * 3),
                    frozenRowCount: 3,
                  },
                },
              },
            },
          ],
        }),
      }
    );
    if (addRes.ok) {
      const addJson = await addRes.json();
      summarySheetId = addJson.replies?.[0]?.addSheet?.properties?.sheetId;
    }
  }

  const rowsData = buildPerpetualSummarySheetRows(yearTabs);

  // Clear old content on summary sheet
  const clearRange = encodeURIComponent(`'${summaryTitle}'!A1:Z120`);
  try {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${clearRange}:clear`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (e) {
    console.warn('Summary clear warning:', e);
  }

  const maxCols = rowsData.reduce((mx, r) => Math.max(mx, r.length), 8);
  const endCol = getColumnLetter(Math.max(7, maxCols - 1));
  const writeRange = encodeURIComponent(`'${summaryTitle}'!A1:${endCol}${rowsData.length}`);
  const writeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: rowsData }),
    }
  );

  if (!writeRes.ok) {
    const errJson = await writeRes.json().catch(() => null);
    throw new Error(errJson?.error?.message || `'${summaryTitle}' 요약 시트 작성 실패`);
  }

  if (summarySheetId !== undefined) {
    const monthlyHeaderRowIdx = 3 + yearTabs.length + (yearTabs.length > 0 ? 1 : 0) + 2; // 0-based index
    const fmtRequests: any[] = [
      {
        updateSheetProperties: {
          properties: {
            sheetId: summarySheetId,
            hidden: false,
            gridProperties: { frozenRowCount: 3 },
          },
          fields: 'hidden,gridProperties.frozenRowCount',
        },
      },
      // Title row styling
      {
        repeatCell: {
          range: { sheetId: summarySheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.192, green: 0.18, blue: 0.506 },
              textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 13 },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      },
      // Year summary table header (Row 3, index 2)
      {
        repeatCell: {
          range: { sheetId: summarySheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 8 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.118, green: 0.161, blue: 0.231 },
              horizontalAlignment: 'CENTER',
              textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 10 },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      // Currency number format across numeric summary cells
      {
        repeatCell: {
          range: {
            sheetId: summarySheetId,
            startRowIndex: 3,
            endRowIndex: rowsData.length,
            startColumnIndex: 1,
            endColumnIndex: Math.max(8, maxCols),
          },
          cell: {
            userEnteredFormat: {
              numberFormat: { type: 'NUMBER', pattern: '#,##0' },
            },
          },
          fields: 'userEnteredFormat.numberFormat',
        },
      },
      // Monthly table header styling
      {
        repeatCell: {
          range: {
            sheetId: summarySheetId,
            startRowIndex: monthlyHeaderRowIdx,
            endRowIndex: monthlyHeaderRowIdx + 1,
            startColumnIndex: 0,
            endColumnIndex: Math.max(4, 1 + yearTabs.length * 3),
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.118, green: 0.161, blue: 0.231 },
              horizontalAlignment: 'CENTER',
              textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 10 },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId: summarySheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
          properties: { pixelSize: 120 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId: summarySheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: Math.max(8, maxCols) },
          properties: { pixelSize: 135 },
          fields: 'pixelSize',
        },
      },
    ];

    try {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests: fmtRequests }),
      });
    } catch (fmtErr) {
      console.warn('Summary formatting warning:', fmtErr);
    }
  }

  return {
    sheetId: summarySheetId || 0,
    title: summaryTitle,
    yearCount: yearTabs.length,
  };
}

export type OldMonthTabsAction = 'hide' | 'keep' | 'delete';

/**
 * Rename spreadsheet (optional), hide/delete/keep legacy 1월~12월 tabs, and cleanly order visible perpetual tabs.
 */
export async function organizePerpetualSheetStructure(params: {
  spreadsheetId: string;
  accessToken: string;
  newSpreadsheetTitle?: string;
  oldMonthTabsAction?: OldMonthTabsAction;
}): Promise<{
  renamedTitle?: string;
  handledMonthTabsCount: number;
  oldMonthTabsAction: OldMonthTabsAction;
}> {
  const {
    spreadsheetId,
    accessToken,
    newSpreadsheetTitle,
    oldMonthTabsAction = 'hide',
  } = params;

  const meta = await getSpreadsheetDetails(spreadsheetId, accessToken);
  const allSheets = meta.sheets || [];
  const requests: any[] = [];
  let renamedTitle: string | undefined;

  if (newSpreadsheetTitle && newSpreadsheetTitle.trim() && newSpreadsheetTitle.trim() !== meta.title) {
    const trimmedTitle = newSpreadsheetTitle.trim();
    requests.push({
      updateSpreadsheetProperties: {
        properties: { title: trimmedTitle },
        fields: 'title',
      },
    });
    renamedTitle = trimmedTitle;
  }

  const monthTabs = allSheets.filter((s) => extractMonthNumberFromTab(s.title) !== null);
  const nonMonthTabs = allSheets.filter((s) => extractMonthNumberFromTab(s.title) === null);
  let handledMonthTabsCount = 0;

  if (oldMonthTabsAction === 'hide' && monthTabs.length > 0 && nonMonthTabs.length > 0) {
    monthTabs.forEach((mTab) => {
      if (!mTab.hidden) {
        requests.push({
          updateSheetProperties: {
            properties: { sheetId: mTab.id, hidden: true },
            fields: 'hidden',
          },
        });
      }
      handledMonthTabsCount++;
    });
  } else if (oldMonthTabsAction === 'delete' && monthTabs.length > 0 && nonMonthTabs.length > 0) {
    monthTabs.forEach((mTab) => {
      requests.push({ deleteSheet: { sheetId: mTab.id } });
      handledMonthTabsCount++;
    });
  } else {
    handledMonthTabsCount = monthTabs.length;
  }

  // Reorder visible tabs: [📊 연도별 요약] -> [Year Tabs desc] -> [⚙️ 분류설정] -> [📖 사용설명서] -> others
  const remainingTabs =
    oldMonthTabsAction === 'delete' && nonMonthTabs.length > 0 ? nonMonthTabs : allSheets;

  const summaryTab = remainingTabs.find(
    (s) => s.title.trim() === PERPETUAL_SUMMARY_TAB_TITLE || /연도별\s*요약|연도\s*요약/i.test(s.title)
  );
  const yearTabs = findAllYearTabs(remainingTabs); // sorted desc by year
  const settingsTab = remainingTabs.find((s) => /분류설정/i.test(s.title));
  const manualTab = remainingTabs.find((s) => /사용설명서/i.test(s.title));

  const orderedIds: number[] = [];
  if (summaryTab) orderedIds.push(summaryTab.id);
  yearTabs.forEach((yt) => {
    if (!orderedIds.includes(yt.id)) orderedIds.push(yt.id);
  });
  if (settingsTab && !orderedIds.includes(settingsTab.id)) orderedIds.push(settingsTab.id);
  if (manualTab && !orderedIds.includes(manualTab.id)) orderedIds.push(manualTab.id);
  remainingTabs.forEach((s) => {
    if (!orderedIds.includes(s.id)) orderedIds.push(s.id);
  });

  orderedIds.forEach((sheetId, index) => {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId, index },
        fields: 'index',
      },
    });
  });

  if (requests.length > 0) {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      }
    );
    if (res.status === 401) {
      throw new Error('AUTH_EXPIRED: Google OAuth 토큰이 만료되었습니다. 상단 [Google 로그인]을 눌러 재인증해 주세요.');
    }
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error?.message || '구글 시트 구조/제목 정리 중 오류가 발생했습니다.');
    }
  }

  return {
    renamedTitle,
    handledMonthTabsCount,
    oldMonthTabsAction,
  };
}

export interface ConsolidationMonthLog {
  sourceTab: string;
  count: number;
  status: 'read' | 'empty' | 'skipped' | 'error';
  error?: string;
}

export interface ConsolidationResult {
  targetTabTitle: string;
  totalRowsWritten: number;
  newlyAddedCount: number;
  skippedDuplicates: number;
  monthLogs: ConsolidationMonthLog[];
  renamedTitle?: string;
  summaryTabCreated?: boolean;
  oldMonthTabsAction?: OldMonthTabsAction;
  handledMonthTabsCount?: number;
}

/**
 * Consolidate all monthly tabs (1월~12월) in the current spreadsheet into one unified year tab (e.g. "2026"),
 * format the year tab, generate/refresh [📊 연도별 요약], optionally rename the file to "스마트 만년 가계부",
 * and safely hide/keep/delete legacy 1월~12월 tabs.
 */
export async function consolidateMonthsIntoYearTab(params: {
  spreadsheetId: string;
  targetYear: number;
  targetTabTitle?: string;
  mergeWithExistingTarget?: boolean;
  newSpreadsheetTitle?: string;
  oldMonthTabsAction?: OldMonthTabsAction;
  createSummaryTab?: boolean;
  accessToken: string;
  onProgress?: (info: { index: number; total: number; message: string }) => void;
}): Promise<ConsolidationResult> {
  const {
    spreadsheetId,
    targetYear,
    targetTabTitle = String(targetYear),
    mergeWithExistingTarget = true,
    newSpreadsheetTitle,
    oldMonthTabsAction = 'hide',
    createSummaryTab = true,
    accessToken,
    onProgress,
  } = params;

  if (!accessToken) {
    throw new Error('AUTH_EXPIRED: Google OAuth 토큰이 필요합니다. 상단 [Google 로그인]을 눌러주세요.');
  }

  const meta = await getSpreadsheetDetails(spreadsheetId, accessToken);
  const tabs = meta.sheets || [];

  const monthLogs: ConsolidationMonthLog[] = [];
  const collected: Transaction[] = [];
  const totalSteps = 16;

  for (let m = 1; m <= 12; m++) {
    const matchedTab = findTabForMonth(tabs, m);
    const label = matchedTab ? matchedTab.title : `${m}월`;

    onProgress?.({
      index: m,
      total: totalSteps,
      message: `[${label}] 탭 내역 읽는 중... (${m}/12)`,
    });

    if (!matchedTab) {
      monthLogs.push({ sourceTab: label, count: 0, status: 'skipped' });
      continue;
    }

    try {
      const rows = await getSheetValues(spreadsheetId, matchedTab.title, accessToken, 'A:Z');
      if (!rows || rows.length <= 1) {
        monthLogs.push({ sourceTab: matchedTab.title, count: 0, status: 'empty' });
        continue;
      }

      const parsed = analyzeSheetStructure(
        spreadsheetId,
        `${targetYear}년 가계부`,
        tabs,
        matchedTab.title,
        rows
      );

      // Ensure date starts with targetYear if parsed with another default year
      const normalized = parsed.transactions.map((tx) => {
        if (tx.date && /^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
          const y = parseInt(tx.date.slice(0, 4), 10);
          if (y === 2026 && targetYear !== 2026) {
            return { ...tx, date: `${targetYear}${tx.date.slice(4)}` };
          }
        }
        return tx;
      });

      if (normalized.length === 0) {
        monthLogs.push({ sourceTab: matchedTab.title, count: 0, status: 'empty' });
      } else {
        collected.push(...normalized);
        monthLogs.push({ sourceTab: matchedTab.title, count: normalized.length, status: 'read' });
      }
    } catch (err: any) {
      if (isAuthExpiredError(err) || err?.message?.includes('AUTH_EXPIRED')) throw err;
      monthLogs.push({
        sourceTab: matchedTab.title,
        count: 0,
        status: 'error',
        error: err?.message || String(err),
      });
    }
  }

  onProgress?.({
    index: 13,
    total: totalSteps,
    message: `기존 [${targetTabTitle}] 탭 확인 및 중복 정리 중...`,
  });

  let existingInTarget: Transaction[] = [];
  const existingTargetTab = tabs.find((t) => t.title.trim() === targetTabTitle.trim());
  if (mergeWithExistingTarget && existingTargetTab) {
    try {
      const targetRows = await getSheetValues(spreadsheetId, existingTargetTab.title, accessToken, 'A:Z');
      if (targetRows && targetRows.length > 1) {
        const parsedTarget = analyzeSheetStructure(
          spreadsheetId,
          `${targetYear}년 가계부`,
          tabs,
          existingTargetTab.title,
          targetRows
        );
        existingInTarget = parsedTarget.transactions;
      }
    } catch (err) {
      console.warn('Could not read existing target year tab:', err);
    }
  }

  const { merged, addedCount, skippedDuplicates } = mergeTransactionsWithoutDuplicates(
    existingInTarget,
    deduplicateTransactionsClean(collected)
  );

  onProgress?.({
    index: 14,
    total: totalSteps,
    message: `[${targetTabTitle}] 통합 탭에 총 ${merged.length}건 저장 및 서식 적용 중...`,
  });

  const rowsData = transactionsToStandardSheetRows(merged);
  await writeStandardRowsToTargetTab(spreadsheetId, targetTabTitle, rowsData, accessToken);

  const postWriteMeta = await getSpreadsheetDetails(spreadsheetId, accessToken);
  const writtenYearTab = postWriteMeta.sheets.find(
    (s) => s.title.trim() === targetTabTitle.trim()
  );
  if (writtenYearTab) {
    await formatYearSheetTab(spreadsheetId, writtenYearTab.id, accessToken);
  }

  let summaryTabCreated = false;
  if (createSummaryTab) {
    onProgress?.({
      index: 15,
      total: totalSteps,
      message: `구글 시트 내 [${PERPETUAL_SUMMARY_TAB_TITLE}] 수식 탭 생성/갱신 중...`,
    });
    await syncPerpetualSummaryTabInGoogleSheet(spreadsheetId, accessToken);
    summaryTabCreated = true;
  }

  onProgress?.({
    index: 16,
    total: totalSteps,
    message: `파일 제목 및 시트 탭 순서 최종 정리 중...`,
  });

  const organized = await organizePerpetualSheetStructure({
    spreadsheetId,
    accessToken,
    newSpreadsheetTitle,
    oldMonthTabsAction,
  });

  setStoredLayoutMode(spreadsheetId, 'yearly');

  return {
    targetTabTitle,
    totalRowsWritten: merged.length,
    newlyAddedCount: addedCount,
    skippedDuplicates,
    monthLogs,
    renamedTitle: organized.renamedTitle,
    summaryTabCreated,
    oldMonthTabsAction: organized.oldMonthTabsAction,
    handledMonthTabsCount: organized.handledMonthTabsCount,
  };
}

export interface ImportExternalYearResult {
  sourceSpreadsheetTitle: string;
  targetTabTitle: string;
  totalRowsWritten: number;
  newlyAddedCount: number;
  skippedDuplicates: number;
  sourceTabLogs: ConsolidationMonthLog[];
}

/**
 * Import an external year's spreadsheet (e.g. "2025 가계부") into a unified year tab (e.g. "2025")
 * inside the current master spreadsheet. Supports both 1월~12월 source files and single-tab files!
 */
export async function importExternalSpreadsheetToYearTab(params: {
  targetSpreadsheetId: string;
  sourceSpreadsheetId: string;
  targetYear: number;
  targetTabTitle?: string;
  mergeWithExisting?: boolean;
  accessToken: string;
  onProgress?: (info: { index: number; total: number; message: string }) => void;
}): Promise<ImportExternalYearResult> {
  const {
    targetSpreadsheetId,
    sourceSpreadsheetId,
    targetYear,
    targetTabTitle = String(targetYear),
    mergeWithExisting = true,
    accessToken,
    onProgress,
  } = params;

  if (!accessToken) {
    throw new Error('AUTH_EXPIRED: Google OAuth 토큰이 필요합니다. 상단 [Google 로그인]을 눌러주세요.');
  }

  onProgress?.({
    index: 1,
    total: 10,
    message: `원본 스프레드시트 정보를 불러오는 중...`,
  });

  const sourceMeta = await getSpreadsheetDetails(sourceSpreadsheetId, accessToken);
  const sourceTabs = sourceMeta.sheets || [];

  // Identify candidate data tabs in source spreadsheet
  const monthTabs = sourceTabs.filter((t) => extractMonthNumberFromTab(t.title) !== null);
  const matchingYearTab = findTabForYear(sourceTabs, targetYear);
  const txNamedTabs = sourceTabs.filter(
    (t) =>
      !/dashboard|대시보드|요약|matrix|연간|분류설정|분류관리|분류|기준|카테고리|통계|차트|결산|설정|사용설명서|설명서/i.test(
        t.title
      ) && !monthTabs.some((m) => m.id === t.id)
  );

  let tabsToRead: Array<{ id: number; title: string }> = [];
  if (monthTabs.length > 0) {
    // Sort 1월..12월
    tabsToRead = [...monthTabs].sort(
      (a, b) => (extractMonthNumberFromTab(a.title) || 99) - (extractMonthNumberFromTab(b.title) || 99)
    );
    // Also include any year-named tab if it has additional data not in months? Usually either/or, prefer monthTabs.
  } else if (matchingYearTab) {
    tabsToRead = [matchingYearTab];
  } else if (txNamedTabs.length > 0) {
    tabsToRead = txNamedTabs;
  } else {
    tabsToRead = sourceTabs;
  }

  const totalSteps = tabsToRead.length + 2;
  const sourceTabLogs: ConsolidationMonthLog[] = [];
  const collected: Transaction[] = [];

  for (let i = 0; i < tabsToRead.length; i++) {
    const tab = tabsToRead[i];
    onProgress?.({
      index: i + 1,
      total: totalSteps,
      message: `원본 [${tab.title}] 탭 읽는 중... (${i + 1}/${tabsToRead.length})`,
    });

    try {
      const rows = await getSheetValues(sourceSpreadsheetId, tab.title, accessToken, 'A:Z');
      if (!rows || rows.length <= 1) {
        sourceTabLogs.push({ sourceTab: tab.title, count: 0, status: 'empty' });
        continue;
      }

      if (isAnnualMatrixSheet(rows, tab.title)) {
        sourceTabLogs.push({ sourceTab: tab.title, count: 0, status: 'skipped' });
        continue;
      }

      const parsed = analyzeSheetStructure(
        sourceSpreadsheetId,
        `${targetYear}년 가계부`,
        sourceTabs,
        tab.title,
        rows
      );

      // Guarantee year matches targetYear when year wasn't explicitly different in row
      const fixedTxs = parsed.transactions.map((tx) => {
        if (tx.date && /^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
          const y = parseInt(tx.date.slice(0, 4), 10);
          if (y === 2026 && targetYear !== 2026) {
            return { ...tx, date: `${targetYear}${tx.date.slice(4)}` };
          }
        }
        return tx;
      });

      if (fixedTxs.length === 0) {
        sourceTabLogs.push({ sourceTab: tab.title, count: 0, status: 'empty' });
      } else {
        collected.push(...fixedTxs);
        sourceTabLogs.push({ sourceTab: tab.title, count: fixedTxs.length, status: 'read' });
      }
    } catch (err: any) {
      if (isAuthExpiredError(err) || err?.message?.includes('AUTH_EXPIRED')) throw err;
      sourceTabLogs.push({
        sourceTab: tab.title,
        count: 0,
        status: 'error',
        error: err?.message || String(err),
      });
    }
  }

  onProgress?.({
    index: totalSteps - 1,
    total: totalSteps,
    message: `현재 파일의 [${targetTabTitle}] 탭 병합 및 정리 중...`,
  });

  let existingInTarget: Transaction[] = [];
  if (mergeWithExisting) {
    const targetMeta = await getSpreadsheetDetails(targetSpreadsheetId, accessToken);
    const existingTab = targetMeta.sheets.find((t) => t.title.trim() === targetTabTitle.trim());
    if (existingTab) {
      try {
        const targetRows = await getSheetValues(targetSpreadsheetId, existingTab.title, accessToken, 'A:Z');
        if (targetRows && targetRows.length > 1) {
          const parsedTarget = analyzeSheetStructure(
            targetSpreadsheetId,
            `${targetYear}년 가계부`,
            targetMeta.sheets,
            existingTab.title,
            targetRows
          );
          existingInTarget = parsedTarget.transactions;
        }
      } catch (err) {
        console.warn('Existing target read warning:', err);
      }
    }
  }

  const { merged, addedCount, skippedDuplicates } = mergeTransactionsWithoutDuplicates(
    existingInTarget,
    deduplicateTransactionsClean(collected)
  );

  onProgress?.({
    index: totalSteps,
    total: totalSteps,
    message: `마스터 시트의 [${targetTabTitle}] 탭에 ${merged.length}건 저장 중...`,
  });

  const rowsData = transactionsToStandardSheetRows(merged);
  await writeStandardRowsToTargetTab(targetSpreadsheetId, targetTabTitle, rowsData, accessToken);

  const postImportMeta = await getSpreadsheetDetails(targetSpreadsheetId, accessToken);
  const importedTab = postImportMeta.sheets.find((s) => s.title.trim() === targetTabTitle.trim());
  if (importedTab) {
    await formatYearSheetTab(targetSpreadsheetId, importedTab.id, accessToken);
  }
  await syncPerpetualSummaryTabInGoogleSheet(targetSpreadsheetId, accessToken);
  await organizePerpetualSheetStructure({
    spreadsheetId: targetSpreadsheetId,
    accessToken,
    oldMonthTabsAction: 'keep',
  });

  setStoredLayoutMode(targetSpreadsheetId, 'yearly');

  return {
    sourceSpreadsheetTitle: sourceMeta.title,
    targetTabTitle,
    totalRowsWritten: merged.length,
    newlyAddedCount: addedCount,
    skippedDuplicates,
    sourceTabLogs,
  };
}

/**
 * Fetch and parse all transactions from a single year tab (or all monthly tabs of an external year sheet)
 */
export async function fetchAllTransactionsForYearSource(params: {
  spreadsheetId: string;
  spreadsheetTitle?: string;
  year: number;
  yearTabTitle?: string;
  accessToken?: string | null;
}): Promise<Transaction[]> {
  const { spreadsheetId, spreadsheetTitle, year, yearTabTitle, accessToken } = params;
  if (yearTabTitle) {
    const rows = await getSheetValues(spreadsheetId, yearTabTitle, accessToken, 'A:Z');
    if (!rows || rows.length <= 1) return [];
    const { transactions } = analyzeSheetStructure(
      spreadsheetId,
      spreadsheetTitle || `${year}년 가계부`,
      [{ id: 1, title: yearTabTitle }],
      yearTabTitle,
      rows
    );
    return transactions;
  }

  // Fallback for external yearly spreadsheet that still uses 1월~12월 tabs
  const meta = await getSpreadsheetDetails(spreadsheetId, accessToken);
  const matchingYearTab = findTabForYear(meta.sheets, year);
  if (matchingYearTab) {
    const rows = await getSheetValues(spreadsheetId, matchingYearTab.title, accessToken, 'A:Z');
    const { transactions } = analyzeSheetStructure(
      spreadsheetId,
      meta.title,
      meta.sheets,
      matchingYearTab.title,
      rows
    );
    return transactions;
  }

  const monthTabs = meta.sheets
    .filter((t) => extractMonthNumberFromTab(t.title) !== null)
    .sort((a, b) => (extractMonthNumberFromTab(a.title) || 99) - (extractMonthNumberFromTab(b.title) || 99));

  const allTxs: Transaction[] = [];
  for (const tab of monthTabs) {
    try {
      const rows = await getSheetValues(spreadsheetId, tab.title, accessToken, 'A:Z');
      if (!rows || rows.length <= 1) continue;
      const { transactions } = analyzeSheetStructure(
        spreadsheetId,
        `${year}년 가계부`,
        meta.sheets,
        tab.title,
        rows
      );
      allTxs.push(...transactions);
    } catch {
      // skip failing tab
    }
  }
  return allTxs;
}

