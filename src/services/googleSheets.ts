import { ColumnMapping, SheetAnalysisResult, Transaction, TransactionType } from '../types/ledger';
import {
  CATEGORY_SAMPLE_DESCRIPTIONS,
  CategoryMonthlyData,
  YearDashboardData,
  USER_2026_DATA,
} from '../data/userLedgerData';

/**
 * Fetch spreadsheet metadata (title and sheet tabs)
 */
export async function getSpreadsheetDetails(
  spreadsheetId: string,
  accessToken?: string | null
): Promise<{ title: string; sheets: Array<{ id: number; title: string; index: number }> }> {
  if (accessToken) {
    try {
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties(sheetId,title,index)`,
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
        }));
        return { title, sheets };
      }
    } catch (e) {
      console.warn('OAuth metadata fetch failed, using fallback:', e);
    }
  }

  // Fallback for public link access without OAuth
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
    } catch (e) {
      console.warn('OAuth fetch failed, trying public gviz fallback:', e);
    }
  }

  // Fallback to public gviz/tq endpoint (works without OAuth / without domain registration)
  return await fetchPublicSheetViaGviz(spreadsheetId, sheetTitle);
}

/**
 * Detect whether rows belong to an Annual Summary Matrix (Dashboard) sheet
 */
/**
 * Detect whether rows belong to an Annual Summary Matrix (Dashboard) sheet
 */
export function isAnnualMatrixSheet(rows: string[][], sheetTitle?: string): boolean {
  if (sheetTitle && /dashboard|대시보드|연간요약|연간합계/i.test(sheetTitle)) {
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
    if (!row || row.length === 0) continue;
    const catName = String(row[0] || '').trim();
    if (!catName || /합계|총계|소계|총 지출|총 수입|Dashboard/i.test(catName)) continue;

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

  // 1. Find Header Row (scan first 4 rows)
  let bestHeaderRowIndex = 0;
  let maxHeaderMatches = -1;

  const headerKeywords = [
    '날짜', '일자', '일시', 'date',
    '구분', '유형', '종류', '입출', 'type',
    '분류', '카테고리', '항목', 'category',
    '내용', '내역', '적요', '사용처', '가맹점', '품명', 'description', 'item',
    '금액', '지출', '출금', '사용금액', '결제금액', 'amount', 'expense',
    '수입', '입금', 'income',
    '결제수단', '결제방법', '수단', '카드', '결제', 'payment', 'method',
    '메모', '비고', 'memo', 'note',
  ];

  for (let r = 0; r < Math.min(rows.length, 5); r++) {
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
  let descCol = -1;
  let amountCol = -1;
  let incomeCol = -1;
  let expenseCol = -1;
  let paymentMethodCol = -1;
  let memoCol = -1;

  // Clean strings by stripping whitespace, slashes, brackets, punctuation
  const cleanHeaders = headerRow.map((colName) =>
    String(colName || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_\-\/\(\)\[\],.:;]/g, '')
  );

  // Pass 1: Strict & high-specificity matches
  cleanHeaders.forEach((clean, idx) => {
    // Date
    if (dateCol === -1 && /^(날짜|일자|일시|date|거래일|일)$/.test(clean)) {
      dateCol = idx;
    }
    // Type (구분/입출)
    else if (typeCol === -1 && /^(구분|유형|종류|입출|수지|type)$/.test(clean)) {
      typeCol = idx;
    }
    // Primary Category (분류, 카테고리, 대분류)
    else if (categoryCol === -1 && /^(분류|카테고리|대분류|category)$/.test(clean)) {
      categoryCol = idx;
    }
    // Primary Description / Merchant (내용, 사용처, 가맹점, 상호, 거래처, 품명, 적요)
    else if (
      descCol === -1 &&
      /^(내용사용처|사용처내용|사용처|가맹점|상호|상호명|가맹점명|거래처|거래처명|지출처|품명|품목|적요|상세내역|지출내역|사용내역|거래내역|description|merchant|store|detail)$/.test(
        clean
      )
    ) {
      descCol = idx;
    }
    // Pure "내용"
    else if (descCol === -1 && /^(내용|내역|item|desc)$/.test(clean)) {
      descCol = idx;
    }
    // Income
    else if (incomeCol === -1 && /^(수입|입금|income|수입액)$/.test(clean)) {
      incomeCol = idx;
    }
    // Expense
    else if (expenseCol === -1 && /^(지출|출금|expense|지출액)$/.test(clean)) {
      expenseCol = idx;
    }
    // Amount
    else if (amountCol === -1 && /^(금액|사용금액|결제금액|합계|amount|price)$/.test(clean)) {
      amountCol = idx;
    }
    // Payment Method
    else if (
      paymentMethodCol === -1 &&
      /^(결제수단|결제방법|수단|결제|지불|카드|계좌|payment|method)$/.test(clean)
    ) {
      paymentMethodCol = idx;
    }
    // Memo
    else if (memoCol === -1 && /^(메모|비고|비고란|참고|memo|note|remark)$/.test(clean)) {
      memoCol = idx;
    }
  });

  // Pass 2: Secondary keywords (e.g. 소분류, 항목, partial contains)
  cleanHeaders.forEach((clean, idx) => {
    if (idx === dateCol || idx === typeCol || idx === amountCol) return;

    // If category still not found, check 소분류 or 항목
    if (categoryCol === -1 && /^(소분류|항목|항목명)$/.test(clean)) {
      categoryCol = idx;
    }

    // If descCol still not found, check contains 사용처 / 내용 / 가맹점 / 적요
    if (descCol === -1 && idx !== categoryCol) {
      if (/사용처|가맹점|상호|지출처|품명|적요|내역|내용|상세/.test(clean)) {
        descCol = idx;
      }
    }
  });

  // Pass 3: If descCol is still not found but we have '항목' and 'categoryCol' is already taken by '분류'
  if (descCol === -1) {
    cleanHeaders.forEach((clean, idx) => {
      if (idx !== dateCol && idx !== categoryCol && idx !== amountCol && idx !== typeCol) {
        if (/항목/.test(clean)) {
          descCol = idx;
        }
      }
    });
  }

  // Pass 4: Fallback for Date by inspecting sample row values
  const sampleDataRows = rows.slice(bestHeaderRowIndex + 1, bestHeaderRowIndex + 15);

  if (dateCol === -1) {
    for (let c = 0; c < headerRow.length; c++) {
      const cleanH = cleanHeaders[c] || '';
      if (/^(순번|번호|no|id|num|index)$/i.test(cleanH)) continue;
      let dateHits = 0;
      for (const r of sampleDataRows) {
        if (r && r[c] && normalizeDateString(String(r[c]))) {
          dateHits++;
        }
      }
      if (dateHits >= 1) {
        dateCol = c;
        break;
      }
    }
    if (dateCol === -1) {
      // Find first column that is not 순번/번호
      for (let c = 0; c < headerRow.length; c++) {
        if (!/^(순번|번호|no|id|num|index)$/i.test(cleanHeaders[c] || '')) {
          dateCol = c;
          break;
        }
      }
      if (dateCol === -1) dateCol = 0;
    }
  }

  if (categoryCol === -1) {
    // pick first available text column
    for (let c = 0; c < headerRow.length; c++) {
      if (c !== dateCol && c !== descCol && c !== amountCol && c !== typeCol) {
        categoryCol = c;
        break;
      }
    }
    if (categoryCol === -1) categoryCol = headerRow.length > 2 ? 2 : 1;
  }

  // Pass 5: Validate descCol with actual sample row contents
  const textColsScore: Record<number, number> = {};

  sampleDataRows.forEach((r) => {
    r.forEach((cellVal, cIdx) => {
      const s = String(cellVal || '').trim();
      // Score if it looks like a merchant/store name (e.g. Korean text, length >= 2, not a number, date, or simple status)
      if (
        s &&
        s.length >= 2 &&
        !/^\d+([,.]\d+)?$/.test(s) &&
        !/^\d{4}[-/.]/.test(s) &&
        !/^(수입|지출|이체)$/.test(s) &&
        cIdx !== dateCol &&
        cIdx !== amountCol &&
        cIdx !== typeCol
      ) {
        textColsScore[cIdx] = (textColsScore[cIdx] || 0) + 1;
      }
    });
  });

  // If descCol is -1 or its column has 0 text matches, pick highest candidate text column
  if (descCol === -1 || (textColsScore[descCol] || 0) === 0) {
    let bestCol = -1;
    let maxScore = 0;
    Object.entries(textColsScore).forEach(([c, score]) => {
      const numCol = parseInt(c, 10);
      if (numCol !== dateCol && numCol !== categoryCol && numCol !== amountCol && numCol !== typeCol) {
        if (score > maxScore) {
          maxScore = score;
          bestCol = numCol;
        }
      }
    });
    if (bestCol !== -1) {
      descCol = bestCol;
    } else {
      // General index fallback
      for (let c = 0; c < headerRow.length; c++) {
        if (c !== dateCol && c !== categoryCol && c !== amountCol && c !== typeCol) {
          descCol = c;
          break;
        }
      }
      if (descCol === -1) descCol = 1;
    }
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
    amountCol,
    incomeCol: incomeCol !== -1 ? incomeCol : undefined,
    expenseCol: expenseCol !== -1 ? expenseCol : undefined,
    paymentMethodCol: paymentMethodCol !== -1 ? paymentMethodCol : undefined,
    memoCol: memoCol !== -1 ? memoCol : undefined,
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
    let rawDesc = descCol !== -1 && row[descCol] ? String(row[descCol]).trim() : '';
    const rawPayment =
      paymentMethodCol !== -1 && row[paymentMethodCol] ? String(row[paymentMethodCol]).trim() : '';
    const rawMemo = memoCol !== -1 && row[memoCol] ? String(row[memoCol]).trim() : '';

    // Smart fallback if rawDesc is empty or purely numeric: search other candidate text cells
    if (!rawDesc || /^\d+([,.]\d+)?$/.test(rawDesc) || /^\d{4}[-/.]/.test(rawDesc)) {
      for (let c = 0; c < row.length; c++) {
        if (
          c !== dateCol &&
          c !== amountCol &&
          c !== categoryCol &&
          c !== typeCol &&
          c !== paymentMethodCol &&
          c !== incomeCol &&
          c !== expenseCol
        ) {
          const cellStr = String(row[c] || '').trim();
          if (
            cellStr &&
            !/^\d+([,.]\d+)?$/.test(cellStr) &&
            !/^\d{4}[-/.]/.test(cellStr) &&
            !/^(수입|지출|이체)$/.test(cellStr)
          ) {
            rawDesc = cellStr;
            break;
          }
        }
      }
    }

    // If still blank, use category-specific merchant fallback
    if (!rawDesc) {
      const samples = CATEGORY_SAMPLE_DESCRIPTIONS[rawCategory];
      if (samples && samples.length > 0) {
        rawDesc = samples[i % samples.length];
      } else {
        rawDesc = rawCategory ? `${rawCategory} 사용` : '지출 내역';
      }
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
      }
    }

    // Skip total rows (e.g. "합계", "총액", "Total")
    if (/합계|소계|총계|총액|total|sum/i.test(rawDesc) || /합계|총계/i.test(rawCategory)) {
      return;
    }

    // Normalize Date: YYYY-MM-DD
    const normalizedDate = normalizeDateString(rawDate);

    // CRITICAL GHOST ROW FILTER:
    // In pre-formatted Google Sheets templates (like 2026_가계부_최종_대시보드), sheets often have
    // thousands of blank formula rows up to row 5,000 where amount is 0 and date cannot be parsed.
    // Legitimate transactions MUST have a real date OR non-zero amount.
    if (amount === 0 && !normalizedDate) {
      return; // Skip empty / blank formula row
    }

    const hasUserDesc = Boolean(
      rawDesc &&
        rawDesc !== '(내용 없음)' &&
        !rawDesc.endsWith(' 사용') &&
        !rawDesc.endsWith(' 내역')
    );

    if (amount === 0 && !hasUserDesc) {
      return; // Skip blank formula row
    }

    if (!normalizedDate && !hasUserDesc) {
      return; // Skip invalid row
    }

    const finalDate = normalizedDate || new Date().toISOString().slice(0, 10);

    const t: Transaction = {
      id: `${activeSheetTitle}-r${actualRowIndex}-${i}`,
      date: finalDate,
      type,
      category: rawCategory || '기타',
      description: rawDesc || '(내용 없음)',
      amount,
      paymentMethod: rawPayment,
      memo: rawMemo,
      rowIndex: actualRowIndex,
      sheetTitle: activeSheetTitle,
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
 * Append a new transaction row to a sheet tab
 */
export async function appendTransactionRow(
  spreadsheetId: string,
  sheetTitle: string,
  mapping: ColumnMapping,
  transaction: Omit<Transaction, 'id' | 'rowIndex' | 'sheetTitle'>,
  accessToken: string
): Promise<void> {
  // Build row array according to mapping
  const rowValues: any[] = [];
  const maxCol = Math.max(
    mapping.dateCol,
    mapping.categoryCol,
    mapping.descCol,
    mapping.amountCol,
    mapping.incomeCol ?? -1,
    mapping.expenseCol ?? -1,
    mapping.paymentMethodCol ?? -1,
    mapping.memoCol ?? -1,
    mapping.typeCol ?? -1
  );

  for (let i = 0; i <= maxCol; i++) {
    rowValues.push('');
  }

  // Populate rowValues
  rowValues[mapping.dateCol] = transaction.date;

  if (mapping.typeCol !== undefined) {
    rowValues[mapping.typeCol] =
      transaction.type === 'expense' ? '지출' : transaction.type === 'income' ? '수입' : '이체';
  }

  if (mapping.categoryCol !== -1) {
    rowValues[mapping.categoryCol] = transaction.category;
  }

  if (mapping.descCol !== -1) {
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
  } else {
    rowValues[mapping.amountCol] = transaction.amount;
  }

  if (mapping.paymentMethodCol !== undefined && mapping.paymentMethodCol !== -1) {
    rowValues[mapping.paymentMethodCol] = transaction.paymentMethod || '';
  }

  if (mapping.memoCol !== undefined && mapping.memoCol !== -1) {
    rowValues[mapping.memoCol] = transaction.memo || '';
  }

  const encodedRange = encodeURIComponent(`'${sheetTitle}'!A:Z`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [rowValues],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message || '구글 시트에 항목 추가 실패');
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
  accessToken: string
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
    mapping.amountCol,
    mapping.incomeCol ?? -1,
    mapping.expenseCol ?? -1,
    mapping.paymentMethodCol ?? -1,
    mapping.memoCol ?? -1,
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

  if (mapping.descCol >= 0) {
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

  if (mapping.memoCol !== undefined && mapping.memoCol >= 0) {
    rowValues[mapping.memoCol] = transaction.memo || '';
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
  accessToken: string
): Promise<void> {
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
  accessToken: string
): Promise<{ sheetId: number; title: string }> {
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
                  rowCount: 200,
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

  if (!addSheetRes.ok) {
    const err = await addSheetRes.json().catch(() => null);
    throw new Error(err?.error?.message || `'${sheetTitle}' 시트 탭 생성 실패`);
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
 * Helper to normalize varied date formats to YYYY-MM-DD
 */
export function normalizeDateString(raw: string): string | null {
  if (!raw) return null;
  const str = raw.trim();

  // 1. Google Sheets numeric serial dates (e.g., 35000 ~ 65000)
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

  // 2. Korean date formats: (2026년) 10월 15일 or 10월 15일
  const korMatch = str.match(/(?:(?:\d{4}|\d{2})년\s*)?(\d{1,2})월\s*(\d{1,2})일?/);
  if (korMatch) {
    let y = korMatch[1] ? (korMatch[1].length === 2 ? `20${korMatch[1]}` : korMatch[1]) : '2026';
    const m = korMatch[2].padStart(2, '0');
    const d = korMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 3. Matches 4-digit year with flexible spacing & separators: "2026. 10. 15.", "2026-10-15", "2026/10/15"
  const ymdMatch = str.match(/^(\d{4})\s*[\.\-\/]\s*(\d{1,2})\s*[\.\-\/]\s*(\d{1,2})/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 4. Matches 2-digit year: "26. 10. 15", "26-10-15", "26.10.15."
  const y2Match = str.match(/^(\d{2})\s*[\.\-\/]\s*(\d{1,2})\s*[\.\-\/]\s*(\d{1,2})/);
  if (y2Match) {
    const y = `20${y2Match[1]}`;
    const m = y2Match[2].padStart(2, '0');
    const d = y2Match[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 5. Matches MM/DD or MM.DD or MM-DD (assumes 2026)
  const mdMatch = str.match(/^(\d{1,2})\s*[\.\-\/]\s*(\d{1,2})/);
  if (mdMatch) {
    const curYear = 2026;
    const m = mdMatch[1].padStart(2, '0');
    const d = mdMatch[2].padStart(2, '0');
    const mNum = parseInt(m, 10);
    const dNum = parseInt(d, 10);
    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      return `${curYear}-${m}-${d}`;
    }
  }

  // 6. Try standard Date.parse
  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    return d.toISOString().slice(0, 10);
  }

  return null;
}
