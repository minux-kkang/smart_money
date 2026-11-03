import {
  CategoryItem,
  PaymentMethodItem,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_TRANSFER_CATEGORIES,
  DEFAULT_PAYMENT_METHODS,
  TransactionType,
  Transaction,
} from '../types/ledger';

const STORAGE_KEY_CATEGORIES = 'smart_money_custom_categories_v1';
const STORAGE_KEY_PAYMENTS = 'smart_money_custom_payments_v1';

const DEFAULT_CATEGORY_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#6366F1', '#F97316',
  '#14B8A6', '#64748B', '#D97706', '#9333EA', '#059669',
];

/**
 * Initialize default categories with smart initial visibility
 */
export function getDefaultCategories(detectedList?: string[]): CategoryItem[] {
  const result: CategoryItem[] = [];
  const detectedSet = new Set(detectedList || []);

  // Expense
  DEFAULT_EXPENSE_CATEGORIES.forEach((name, idx) => {
    result.push({
      id: `exp_${idx}_${name}`,
      name,
      type: 'expense',
      isVisible: true,
      color: DEFAULT_CATEGORY_COLORS[idx % DEFAULT_CATEGORY_COLORS.length],
      isCustom: false,
    });
  });

  // If there are categories found in the sheet that aren't in defaults, add them
  if (detectedList) {
    detectedList.forEach((name, idx) => {
      if (
        name &&
        !DEFAULT_EXPENSE_CATEGORIES.includes(name) &&
        !DEFAULT_INCOME_CATEGORIES.includes(name) &&
        !DEFAULT_TRANSFER_CATEGORIES.includes(name)
      ) {
        result.push({
          id: `det_exp_${idx}_${name}`,
          name,
          type: 'expense',
          isVisible: true,
          color: DEFAULT_CATEGORY_COLORS[(idx + 10) % DEFAULT_CATEGORY_COLORS.length],
          isCustom: true,
        });
      }
    });
  }

  // Income
  DEFAULT_INCOME_CATEGORIES.forEach((name, idx) => {
    result.push({
      id: `inc_${idx}_${name}`,
      name,
      type: 'income',
      isVisible: true,
      color: '#10B981',
      isCustom: false,
    });
  });

  // Transfer
  DEFAULT_TRANSFER_CATEGORIES.forEach((name, idx) => {
    result.push({
      id: `tr_${idx}_${name}`,
      name,
      type: 'transfer',
      isVisible: true,
      color: '#0284C7',
      isCustom: false,
    });
  });

  return result;
}

/**
 * Unify and normalize similar/overlapping payment method names
 * e.g., '국민은행', '국민카드', 'KB국민', 'KB카드' -> 'KB국민카드'
 * '신한' -> '신한카드', '현대' -> '현대카드', '삼성' -> '삼성카드'
 * '카카오' -> '카카오페이', '네이버' -> '네이버페이', '토스' -> '토스페이'
 * '쿠팡페이', '쿠팡' -> '쿠페이', '교통카드' -> '티머니'
 */
export function canonicalizePaymentMethod(rawName?: string): string {
  if (!rawName) return '';
  const trimmed = rawName.trim();
  const lower = trimmed.toLowerCase();

  // KB / 국민
  if (
    lower === '국민은행' ||
    lower === '국민카드' ||
    lower === 'kb국민' ||
    lower === 'kb국민카드' ||
    lower === 'kb' ||
    lower === 'kb카드'
  ) {
    return 'KB국민카드';
  }
  // 신한
  if (lower === '신한' || lower === '신한카드' || lower === '신한은행') {
    return '신한카드';
  }
  // 현대
  if (lower === '현대' || lower === '현대카드') {
    return '현대카드';
  }
  // 삼성
  if (lower === '삼성' || lower === '삼성카드') {
    return '삼성카드';
  }
  // 롯데
  if (lower === '롯데' || lower === '롯데카드') {
    return '롯데카드';
  }
  // 하나
  if (lower === '하나' || lower === '하나카드' || lower === '하나은행' || lower === '외환카드') {
    return '하나카드';
  }
  // 우리
  if (lower === '우리' || lower === '우리카드' || lower === '우리은행') {
    return '우리카드';
  }
  // 농협
  if (
    lower === '농협' ||
    lower === '농협카드' ||
    lower === 'nh농협카드' ||
    lower === 'nh카드' ||
    lower === 'nh농협' ||
    lower === '농협은행'
  ) {
    return 'NH농협카드';
  }
  // 카카오페이 / 카카오
  if (lower === '카카오' || lower === '카카오페이' || lower === '카카오뱅크') {
    return '카카오페이';
  }
  // 네이버페이 / 네이버
  if (lower === '네이버' || lower === '네이버페이' || lower === 'npay') {
    return '네이버페이';
  }
  // 토스페이 / 토스
  if (lower === '토스' || lower === '토스페이' || lower === '토스뱅크') {
    return '토스페이';
  }
  // 쿠페이 / 쿠팡
  if (lower === '쿠페이' || lower === '쿠팡페이' || lower === '쿠팡') {
    return '쿠페이';
  }
  // 티머니 / 교통카드 / 캐시비
  if (lower === '티머니' || lower === '교통카드' || lower === '캐시비') {
    return '티머니';
  }
  // 현금 / 현금영수증
  if (lower === '현금' || lower === '현금영수증') {
    return '현금';
  }
  // 자동이체
  if (lower === '자동이체' || lower === '자동납부') {
    return '자동이체';
  }
  // 계좌이체
  if (lower === '계좌이체' || lower === '무통장입금' || lower === '이체') {
    return '계좌이체';
  }

  return trimmed;
}

/**
 * Initialize default payment methods with deduplication and canonicalization
 */
export function getDefaultPaymentMethods(detectedList?: string[]): PaymentMethodItem[] {
  const seen = new Set<string>();
  const result: PaymentMethodItem[] = [];

  DEFAULT_PAYMENT_METHODS.forEach((name, idx) => {
    const canonical = canonicalizePaymentMethod(name);
    if (!seen.has(canonical)) {
      seen.add(canonical);
      result.push({
        id: `pm_${idx}_${canonical}`,
        name: canonical,
        isVisible: true,
        isCustom: false,
      });
    }
  });

  if (detectedList) {
    detectedList.forEach((p, idx) => {
      const canonical = canonicalizePaymentMethod(p);
      if (canonical && !seen.has(canonical)) {
        seen.add(canonical);
        result.push({
          id: `pm_det_${idx}_${canonical}`,
          name: canonical,
          isVisible: true,
          isCustom: true,
        });
      }
    });
  }

  return result;
}

/**
 * Load payment methods from localStorage with deduplication of overlapping names
 */
export function loadPaymentMethods(detectedMethods?: string[]): PaymentMethodItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PAYMENTS);
    let list: PaymentMethodItem[] = [];
    if (raw) {
      const parsed: PaymentMethodItem[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        list = parsed;
      }
    }

    if (list.length === 0) {
      list = getDefaultPaymentMethods(detectedMethods);
    }

    // Canonicalize all names and deduplicate overlapping payment methods
    const seen = new Set<string>();
    const unified: PaymentMethodItem[] = [];

    list.forEach((item) => {
      const canonical = canonicalizePaymentMethod(item.name);
      if (canonical && !seen.has(canonical)) {
        seen.add(canonical);
        unified.push({
          ...item,
          name: canonical,
          isCustom: !DEFAULT_PAYMENT_METHODS.includes(canonical),
        });
      }
    });

    // Ensure all DEFAULT_PAYMENT_METHODS are included
    DEFAULT_PAYMENT_METHODS.forEach((defName, idx) => {
      const canonical = canonicalizePaymentMethod(defName);
      if (!seen.has(canonical)) {
        seen.add(canonical);
        unified.push({
          id: `pm_def_${idx}_${canonical}`,
          name: canonical,
          isVisible: true,
          isCustom: false,
        });
      }
    });

    // Merge detectedMethods
    if (detectedMethods && detectedMethods.length > 0) {
      detectedMethods.forEach((name, idx) => {
        const canonical = canonicalizePaymentMethod(name);
        if (canonical && !seen.has(canonical)) {
          seen.add(canonical);
          unified.push({
            id: `pm_new_${Date.now()}_${idx}`,
            name: canonical,
            isVisible: true,
            isCustom: true,
          });
        }
      });
    }

    savePaymentMethods(unified);
    return unified;
  } catch (e) {
    console.warn('Failed to load payments from localStorage:', e);
  }

  const initial = getDefaultPaymentMethods(detectedMethods);
  savePaymentMethods(initial);
  return initial;
}

/**
 * Load categories from localStorage, merging with sheet detected categories
 */
export function loadCategories(detectedExpenseNames?: string[]): CategoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CATEGORIES);
    if (raw) {
      const parsed: CategoryItem[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // If sheet has new categories not in user list, append them
        if (detectedExpenseNames && detectedExpenseNames.length > 0) {
          const existingNames = new Set(parsed.map((c) => c.name));
          let changed = false;
          detectedExpenseNames.forEach((name, idx) => {
            if (name && !existingNames.has(name)) {
              parsed.push({
                id: `det_exp_new_${Date.now()}_${idx}`,
                name,
                type: 'expense',
                isVisible: true,
                color: DEFAULT_CATEGORY_COLORS[idx % DEFAULT_CATEGORY_COLORS.length],
                isCustom: true,
              });
              changed = true;
            }
          });
          if (changed) {
            saveCategories(parsed);
          }
        }

        // Ensure default transfer categories exist if parsed array only had expense/income
        const hasTransfer = parsed.some((c) => c.type === 'transfer');
        if (!hasTransfer) {
          DEFAULT_TRANSFER_CATEGORIES.forEach((name, idx) => {
            parsed.push({
              id: `tr_${idx}_${name}`,
              name,
              type: 'transfer',
              isVisible: true,
              color: '#0284C7',
              isCustom: false,
            });
          });
          saveCategories(parsed);
        }

        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load categories from localStorage:', e);
  }

  const initial = getDefaultCategories(detectedExpenseNames);
  saveCategories(initial);
  return initial;
}

/**
 * Save categories to localStorage
 */
export function saveCategories(categories: CategoryItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(categories));
  } catch (e) {
    console.warn('Failed to save categories to localStorage:', e);
  }
}

/**
 * Save payment methods to localStorage
 */
export function savePaymentMethods(methods: PaymentMethodItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_PAYMENTS, JSON.stringify(methods));
  } catch (e) {
    console.warn('Failed to save payments to localStorage:', e);
  }
}


export interface UsageFrequencyStats {
  score: number;
  currentMonthCount: number;
  lastMonthCount: number;
  priorCount: number;
  totalCount: number;
  displayCount: number;
  displayLabel: string;
}

/**
 * Calculates smart frequency statistics for categories or payment methods.
 * Rules:
 * 1. "월 시작땐 지난달 많이쓴 순서" (At the start of the month, prioritized by previous month's usage)
 * 2. "점점점 해당월에 많이쓴 순서로" (As the month progresses, items used in the current month rapidly gain priority)
 */
export function getSmartUsageFrequencyMap(
  transactions: Transaction[],
  targetDateOrMonth?: string,
  field: 'category' | 'paymentMethod' = 'category'
): Map<string, UsageFrequencyStats> {
  const statsMap = new Map<string, UsageFrequencyStats>();
  if (!transactions || transactions.length === 0) return statsMap;

  // Determine target year and month
  const now = new Date();
  let targetYear = now.getFullYear();
  let targetMonth = now.getMonth() + 1; // 1-12

  if (targetDateOrMonth) {
    const ymd = targetDateOrMonth.match(/^(\d{4})[-.\/](\d{1,2})/);
    if (ymd) {
      targetYear = parseInt(ymd[1], 10);
      targetMonth = parseInt(ymd[2], 10);
    } else {
      const mMatch = targetDateOrMonth.match(/(\d{1,2})월?/);
      if (mMatch) {
        targetMonth = parseInt(mMatch[1], 10);
      }
    }
  }

  // Determine previous month
  let prevYear = targetYear;
  let prevMonth = targetMonth - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }

  transactions.forEach((tx) => {
    const rawVal = field === 'category' ? tx.category : tx.paymentMethod;
    if (!rawVal || !rawVal.trim()) return;
    const key = rawVal.trim();

    let txMonth: number | null = null;
    let txYear: number | null = null;

    if (tx.date) {
      const ym = tx.date.match(/^(\d{4})[-.\/](\d{1,2})/);
      if (ym) {
        txYear = parseInt(ym[1], 10);
        txMonth = parseInt(ym[2], 10);
      } else {
        const m = tx.date.match(/(\d{1,2})월/);
        if (m) {
          txMonth = parseInt(m[1], 10);
          txYear = targetYear;
        }
      }
    }
    if (txMonth === null && tx.sheetTitle) {
      const sm = tx.sheetTitle.match(/(\d{1,2})월/);
      if (sm) {
        txMonth = parseInt(sm[1], 10);
        txYear = targetYear;
      }
    }

    if (!statsMap.has(key)) {
      statsMap.set(key, {
        score: 0,
        currentMonthCount: 0,
        lastMonthCount: 0,
        priorCount: 0,
        totalCount: 0,
        displayCount: 0,
        displayLabel: '',
      });
    }

    const stat = statsMap.get(key)!;
    stat.totalCount += 1;

    if (txYear !== null && txMonth !== null) {
      if (txYear === targetYear && txMonth === targetMonth) {
        stat.currentMonthCount += 1;
      } else if (txYear === prevYear && txMonth === prevMonth) {
        stat.lastMonthCount += 1;
      } else if (txYear < targetYear || (txYear === targetYear && txMonth < targetMonth)) {
        stat.priorCount += 1;
      }
    } else if (txMonth !== null) {
      if (txMonth === targetMonth) {
        stat.currentMonthCount += 1;
      } else if (txMonth === prevMonth) {
        stat.lastMonthCount += 1;
      } else if (txMonth < targetMonth) {
        stat.priorCount += 1;
      }
    } else {
      stat.priorCount += 1;
    }
  });

  // Calculate scores and labels
  let hasRecentActivity = false;
  statsMap.forEach((stat) => {
    if (stat.currentMonthCount > 0 || stat.lastMonthCount > 0) {
      hasRecentActivity = true;
    }
  });

  statsMap.forEach((stat) => {
    if (hasRecentActivity) {
      // Current month count has high weight (x15), previous month provides strong base order (x1),
      // and overall historical activity breaks ties (x0.01)
      stat.score = stat.currentMonthCount * 15 + stat.lastMonthCount * 1 + stat.priorCount * 0.01;
    } else {
      stat.score = stat.totalCount;
    }

    if (stat.currentMonthCount > 0) {
      stat.displayCount = stat.currentMonthCount;
      stat.displayLabel = `이번달 ${stat.currentMonthCount}회 사용 (전월 ${stat.lastMonthCount}회 / 총 ${stat.totalCount}회)`;
    } else if (stat.lastMonthCount > 0) {
      stat.displayCount = stat.lastMonthCount;
      stat.displayLabel = `전월 ${stat.lastMonthCount}회 사용 (총 ${stat.totalCount}회)`;
    } else if (stat.totalCount > 0) {
      stat.displayCount = stat.totalCount;
      stat.displayLabel = `총 ${stat.totalCount}회 사용`;
    } else {
      stat.displayCount = 0;
      stat.displayLabel = '신규 / 미사용';
    }
  });

  return statsMap;
}

/**
 * Returns score map for categories using the smart recency weighting
 */
export function getCategoryFrequencyUpToLastMonth(
  transactions: Transaction[],
  targetDateOrMonth?: string
): Map<string, number> {
  const statsMap = getSmartUsageFrequencyMap(transactions, targetDateOrMonth, 'category');
  const scoreMap = new Map<string, number>();
  statsMap.forEach((stat, key) => {
    scoreMap.set(key, stat.score);
  });
  return scoreMap;
}

/**
 * Returns score map for payment methods using the smart recency weighting
 */
export function getPaymentMethodSmartFrequency(
  transactions: Transaction[],
  targetDateOrMonth?: string
): Map<string, number> {
  const statsMap = getSmartUsageFrequencyMap(transactions, targetDateOrMonth, 'paymentMethod');
  const scoreMap = new Map<string, number>();
  statsMap.forEach((stat, key) => {
    scoreMap.set(key, stat.score);
  });
  return scoreMap;
}

/**
 * Sorts category names based on usage frequency up to last month (descending).
 */
export function sortCategoriesByPastFrequency(
  categoryNames: string[],
  frequencyMap: Map<string, number>
): string[] {
  return [...categoryNames].sort((a, b) => {
    const countA = frequencyMap.get(a) || 0;
    const countB = frequencyMap.get(b) || 0;
    if (countB !== countA) {
      return countB - countA;
    }
    return a.localeCompare(b);
  });
}

/**
 * Tab name patterns recognized as category/settings tab in Google Sheets
 */
export const SETTINGS_TAB_NAMES = [
  '분류설정',
  '⚙️ 분류설정',
  '분류관리',
  '기준목록',
  '항목관리',
  '코드관리',
  '카테고리설정',
  '카테고리',
  '설정',
  '기준',
  '분류',
  'Settings',
  'Categories',
];

export function findSettingsTab(
  sheetTabs: Array<{ id: number; title: string }>
): { id: number; title: string } | undefined {
  if (!sheetTabs || sheetTabs.length === 0) return undefined;

  // 1. Exact case-insensitive match by priority
  for (const name of SETTINGS_TAB_NAMES) {
    const found = sheetTabs.find(
      (t) => t.title.toLowerCase().trim() === name.toLowerCase().trim()
    );
    if (found) return found;
  }

  // 2. Loose regex match for tab titles containing any settings keyword
  return sheetTabs.find((t) =>
    /^(?:⚙️\s*)?(?:분류설정|카테고리설정|분류관리|기준목록|항목관리|코드관리|카테고리|분류|설정|기준|settings|categories)$/i.test(
      t.title.trim()
    )
  );
}

/**
 * Parse categories and payment methods from raw sheet rows of a settings tab
 */
export function parseCategoriesFromSheetRows(rows: string[][]): {
  categories: CategoryItem[];
  paymentMethods: PaymentMethodItem[];
} | null {
  if (!rows || rows.length < 2) return null;

  // Find header row (usually row 0)
  let headerRowIdx = 0;
  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const rowStr = rows[r].join(' ');
    if (
      rowStr.includes('지출') ||
      rowStr.includes('수입') ||
      rowStr.includes('카테고리') ||
      rowStr.includes('결제수단') ||
      rowStr.includes('결제')
    ) {
      headerRowIdx = r;
      break;
    }
  }

  const headers = rows[headerRowIdx].map((h) => String(h || '').trim());
  let expCol = -1;
  let incCol = -1;
  let trCol = -1;
  let payCol = -1;

  headers.forEach((h, idx) => {
    const lower = h.toLowerCase();
    if (lower.includes('지출')) expCol = idx;
    else if (lower.includes('수입')) incCol = idx;
    else if (lower.includes('이체') || lower.includes('저축')) trCol = idx;
    else if (
      lower.includes('결제') ||
      lower.includes('카드') ||
      lower.includes('수단') ||
      lower.includes('payment')
    )
      payCol = idx;
  });

  // Fallbacks if headers were vague
  if (expCol === -1) expCol = 0;
  if (incCol === -1 && headers.length > 1) incCol = 1;
  if (trCol === -1 && headers.length > 2) trCol = 2;
  if (payCol === -1 && headers.length > 3) payCol = 3;

  const expSet = new Set<string>();
  const incSet = new Set<string>();
  const trSet = new Set<string>();
  const paySet = new Set<string>();

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    if (expCol !== -1 && row[expCol]) {
      const v = String(row[expCol]).trim();
      if (v && !v.startsWith('//') && !v.startsWith('#')) expSet.add(v);
    }
    if (incCol !== -1 && row[incCol]) {
      const v = String(row[incCol]).trim();
      if (v && !v.startsWith('//') && !v.startsWith('#')) incSet.add(v);
    }
    if (trCol !== -1 && row[trCol]) {
      const v = String(row[trCol]).trim();
      if (v && !v.startsWith('//') && !v.startsWith('#')) trSet.add(v);
    }
    if (payCol !== -1 && row[payCol]) {
      const v = String(row[payCol]).trim();
      if (v && !v.startsWith('//') && !v.startsWith('#')) {
        const canonical = canonicalizePaymentMethod(v);
        if (canonical) paySet.add(canonical);
      }
    }
  }

  if (expSet.size === 0 && incSet.size === 0 && paySet.size === 0) {
    return null;
  }

  const categories: CategoryItem[] = [];
  let colorIdx = 0;

  Array.from(expSet).forEach((name) => {
    categories.push({
      id: `sheet_exp_${name}`,
      name,
      type: 'expense',
      isVisible: true,
      color: DEFAULT_CATEGORY_COLORS[colorIdx++ % DEFAULT_CATEGORY_COLORS.length],
      isCustom: !DEFAULT_EXPENSE_CATEGORIES.includes(name),
    });
  });

  Array.from(incSet).forEach((name) => {
    categories.push({
      id: `sheet_inc_${name}`,
      name,
      type: 'income',
      isVisible: true,
      color: '#10B981',
      isCustom: !DEFAULT_INCOME_CATEGORIES.includes(name),
    });
  });

  Array.from(trSet).forEach((name) => {
    categories.push({
      id: `sheet_tr_${name}`,
      name,
      type: 'transfer',
      isVisible: true,
      color: '#0284C7',
      isCustom: !DEFAULT_TRANSFER_CATEGORIES.includes(name),
    });
  });

  const paymentMethods: PaymentMethodItem[] = [];
  Array.from(paySet).forEach((name) => {
    paymentMethods.push({
      id: `sheet_pm_${name}`,
      name,
      isVisible: true,
      isCustom: !DEFAULT_PAYMENT_METHODS.includes(name),
    });
  });

  return { categories, paymentMethods };
}

/**
 * Format categories and payment methods into a 2D array for writing to Google Sheets
 */
export function serializeCategoriesToSheetRows(
  categories: CategoryItem[],
  paymentMethods: PaymentMethodItem[]
): string[][] {
  const expList = categories.filter((c) => c.type === 'expense').map((c) => c.name);
  const incList = categories.filter((c) => c.type === 'income').map((c) => c.name);
  const trList = categories.filter((c) => c.type === 'transfer').map((c) => c.name);
  const payList = paymentMethods.map((p) => p.name);

  const maxRows = Math.max(expList.length, incList.length, trList.length, payList.length);
  const rows: string[][] = [
    ['지출 카테고리', '수입 카테고리', '이체 카테고리', '결제 수단'],
  ];

  for (let i = 0; i < maxRows; i++) {
    rows.push([
      expList[i] || '',
      incList[i] || '',
      trList[i] || '',
      payList[i] || '',
    ]);
  }

  return rows;
}

/**
 * Synchronize categories and payment methods directly to a Google Sheets '분류설정' tab
 */
export async function syncCategoriesToGoogleSheet(
  spreadsheetId: string,
  accessToken: string,
  categories: CategoryItem[],
  paymentMethods: PaymentMethodItem[],
  existingTabs: Array<{ id: number; title: string }>
): Promise<{ tabTitle: string; created: boolean }> {
  const existingTab = findSettingsTab(existingTabs);
  let tabTitle = existingTab ? existingTab.title : '분류설정';
  let created = false;

  if (!existingTab) {
    // create the sheet tab via batchUpdate
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
                  title: '분류설정',
                  gridProperties: {
                    rowCount: 100,
                    columnCount: 6,
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
      tabTitle = '분류설정';
      created = true;
    } else {
      const err = await addSheetRes.json().catch(() => null);
      const errMsg = err?.error?.message || '';
      if (addSheetRes.status === 401 || errMsg.includes('invalid authentication credentials') || errMsg.includes('OAuth 2')) {
        throw new Error('AUTH_EXPIRED: Google 인증 세션이 만료되었습니다. 다시 로그인하여 인증을 갱신해 주세요.');
      }
      throw new Error(errMsg || '시트에 분류설정 탭을 생성하지 못했습니다.');
    }
  }

  // Format 2D rows
  const rows = serializeCategoriesToSheetRows(categories, paymentMethods);

  // Overwrite tab range
  const encodedRange = encodeURIComponent(`'${tabTitle}'!A1:D${rows.length}`);
  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: rows,
      }),
    }
  );

  if (!updateRes.ok) {
    const err = await updateRes.json().catch(() => null);
    const errMsg = err?.error?.message || '';
    if (updateRes.status === 401 || errMsg.includes('invalid authentication credentials') || errMsg.includes('OAuth 2')) {
      throw new Error('AUTH_EXPIRED: Google 인증 세션이 만료되었습니다. 다시 로그인하여 인증을 갱신해 주세요.');
    }
    throw new Error(errMsg || '분류 데이터를 시트에 저장하지 못했습니다.');
  }

  return { tabTitle, created };
}

/**
 * Load categories and payment methods from Google Sheets '분류설정' tab
 */
export async function loadCategoriesFromGoogleSheet(
  spreadsheetId: string,
  accessToken: string | null | undefined,
  existingTabs: Array<{ id: number; title: string }>
): Promise<{ categories: CategoryItem[]; paymentMethods: PaymentMethodItem[]; tabTitle: string } | null> {
  const targetTab = findSettingsTab(existingTabs);
  if (!targetTab) return null;

  let rows: string[][] = [];
  if (accessToken) {
    try {
      const encodedRange = encodeURIComponent(`'${targetTab.title}'!A1:D150`);
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
      }
    } catch (e) {
      console.warn('OAuth load categories failed:', e);
    }
  }

  if (rows.length === 0) {
    // Try public GViz endpoint
    try {
      const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(targetTab.title)}`;
      const gvizRes = await fetch(url);
      if (gvizRes.ok) {
        const rawText = await gvizRes.text();
        const match = rawText.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?/);
        if (match && match[1]) {
          const json = JSON.parse(match[1]);
          const table = json.table;
          if (table && table.rows) {
            const tableRows: string[][] = [];
            const headers = (table.cols || []).map((col: any) => col?.label || '');
            if (headers.some((h: string) => h.trim().length > 0)) {
              tableRows.push(headers);
            }
            for (const rowObj of table.rows) {
              const rowCells: string[] = [];
              for (const cell of rowObj.c || []) {
                rowCells.push(cell ? String(cell.v ?? cell.f ?? '') : '');
              }
              tableRows.push(rowCells);
            }
            rows = tableRows;
          }
        }
      }
    } catch (gvizErr) {
      console.warn('GViz load categories failed:', gvizErr);
    }
  }

  if (rows.length > 0) {
    const parsed = parseCategoriesFromSheetRows(rows);
    if (parsed && (parsed.categories.length > 0 || parsed.paymentMethods.length > 0)) {
      return {
        categories: parsed.categories,
        paymentMethods: parsed.paymentMethods,
        tabTitle: targetTab.title,
      };
    }
  }

  return null;
}

