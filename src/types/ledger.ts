export type TransactionType = 'expense' | 'income' | 'transfer';

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  type: TransactionType;
  category: string;
  description: string;
  amount: number;
  paymentMethod?: string;
  memo?: string;
  rowIndex?: number; // 1-based index in the Google Sheet
  sheetTitle?: string;
}

export interface ColumnMapping {
  dateCol: number;
  categoryCol: number;
  descCol: number;
  amountCol: number;
  incomeCol?: number;
  expenseCol?: number;
  paymentMethodCol?: number;
  memoCol?: number;
  typeCol?: number;
  headerRowIndex: number;
  detectedHeaders: string[];
}

export interface SheetAnalysisResult {
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheetTabs: Array<{ id: number; title: string }>;
  activeSheetTitle: string;
  mapping: ColumnMapping;
  detectedCategories: Array<{
    name: string;
    count: number;
    totalAmount: number;
    type: TransactionType;
  }>;
  detectedPaymentMethods: string[];
  historicalDescriptions: Array<{
    description: string;
    category: string;
    paymentMethod?: string;
    count: number;
  }>;
  rowCount: number;
  rawSampleRows: string[][];
  isMatrixSheet?: boolean;
}

export interface SpreadsheetFile {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface MonthlySummary {
  month: string; // e.g. "2026-03" or "3월"
  totalIncome: number;
  totalExpense: number;
  balance: number;
  savingRate: number;
  dailyAverageExpense: number;
  transactionCount: number;
}

/**
 * Format date string to short format (MM.DD) without year
 * e.g. "2026-10-15" -> "10.15", "2026. 10. 15." -> "10.15", "10월 15일" -> "10.15"
 */
export function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const str = String(dateStr).trim();

  // Match Korean date: "2026년 10월 15일" or "10월 15일"
  const korMatch = str.match(/(?:(?:\d{4}|\d{2})년\s*)?(\d{1,2})월\s*(\d{1,2})일?/);
  if (korMatch) {
    const m = korMatch[1].padStart(2, '0');
    const d = korMatch[2].padStart(2, '0');
    return `${m}.${d}`;
  }

  // Match 4-digit year with any separator and optional spaces: "2026. 10. 15", "2026-10-15", "2026/10/15"
  const ymdMatch = str.match(/^\d{4}\s*[\.\-\/]\s*(\d{1,2})\s*[\.\-\/]\s*(\d{1,2})/);
  if (ymdMatch) {
    const m = ymdMatch[1].padStart(2, '0');
    const d = ymdMatch[2].padStart(2, '0');
    return `${m}.${d}`;
  }

  // Match 2-digit year: "26. 10. 15", "26-10-15", "26.10.15."
  const y2Match = str.match(/^\d{2}\s*[\.\-\/]\s*(\d{1,2})\s*[\.\-\/]\s*(\d{1,2})/);
  if (y2Match) {
    const m = y2Match[1].padStart(2, '0');
    const d = y2Match[2].padStart(2, '0');
    return `${m}.${d}`;
  }

  // Match MM.DD or MM-DD or MM/DD (with optional spaces/dots)
  const mdMatch = str.match(/^(\d{1,2})\s*[\.\-\/]\s*(\d{1,2})/);
  if (mdMatch) {
    const m = mdMatch[1].padStart(2, '0');
    const d = mdMatch[2].padStart(2, '0');
    return `${m}.${d}`;
  }
  return str;
}

export interface CategoryItem {
  id: string;
  name: string;
  type: TransactionType;
  isVisible: boolean; // 보이기 / 숨기기 (입력창 노출 여부)
  color?: string;
  isCustom?: boolean;
}

export interface PaymentMethodItem {
  id: string;
  name: string;
  isVisible: boolean; // 보이기 / 숨기기 (입력창 노출 여부)
  isCustom?: boolean;
}

export const DEFAULT_EXPENSE_CATEGORIES: string[] = [
  '식비',
  '외식',
  '간식',
  '생활용품',
  '의류/잡화',
  '교육',
  '용돈',
  '관리비_기타',
  '통신비',
  '보험료',
  '구독',
  '렌탈',
  '교통비',
  '자동차관리',
  '의료비',
  '여행비',
  '취미',
  '골프',
  '경조사',
  '세금/공과금',
  '대출_원금',
  '대출_이자',
  '미용',
];

export const DEFAULT_INCOME_CATEGORIES: string[] = [
  '급여',
  '상여금',
  '부수입',
  '금융소득',
  '용돈',
  '기타수입',
];

export const DEFAULT_PAYMENT_METHODS: string[] = [
  '신용카드',
  '체크카드',
  '현금',
  '계좌이체',
  '네이버페이',
  '카카오페이',
];
