import { Transaction } from '../types/ledger';

export interface InstallmentScheduleItem {
  index: number; // 1-based installment number (e.g. 1..N)
  date: string; // YYYY-MM-DD
  year: number;
  month: number; // 1..12
  sheetTitle: string; // e.g. '11월'
  principal: number;
  interest: number;
  amount: number; // principal + interest
  recordedInSheet: boolean;
}

export interface InstallmentPlan {
  id: string;
  description: string;
  category: string;
  paymentMethod: string;
  startDate: string; // YYYY-MM-DD
  totalPrincipal: number;
  months: number;
  annualInterestRate: number; // e.g. 0 for interest-free, 5.9 for 5.9%
  totalInterest: number;
  totalPayable: number;
  memo?: string;
  isRecurring?: boolean;
  isSpecial?: boolean;
  createdAt: number;
  schedule: InstallmentScheduleItem[];
}

export interface ParsedInstallmentMeta {
  current: number;
  total: number;
  rateLabel?: string;
  isInterestFree: boolean;
  totalPrincipal?: number;
  startDate?: string;
  planKey: string;
}

const STORAGE_KEY_PREFIX = 'smart_money_installments_';

const getStorageKey = (spreadsheetId?: string | null): string =>
  `${STORAGE_KEY_PREFIX}${spreadsheetId || 'default'}`;

/**
 * Add `monthsToAdd` months to a YYYY-MM-DD date string while clamping the day
 * to the target month's last valid day (e.g., Jan 31 + 1 month -> Feb 28/29).
 */
export function addMonthsClamped(baseDateStr: string, monthsToAdd: number): {
  date: string;
  year: number;
  month: number;
} {
  const match = String(baseDateStr || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const now = new Date();
  const baseYear = match ? parseInt(match[1], 10) : now.getFullYear();
  const baseMonth = match ? parseInt(match[2], 10) : now.getMonth() + 1;
  const baseDay = match ? parseInt(match[3], 10) : now.getDate();

  const totalMonths = (baseYear * 12 + (baseMonth - 1)) + monthsToAdd;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  const maxDaysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
  const clampedDay = Math.min(Math.max(1, baseDay), maxDaysInTargetMonth);

  const date = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
  return { date, year: targetYear, month: targetMonth };
}

/**
 * Calculate monthly card installment schedule.
 * - Interest-free (rate <= 0): equal principal with 1-won remainder on 1st installment.
 * - Interest-bearing (rate > 0): standard equal monthly payment (원리금균등) using monthly rate = annualRate / 100 / 12.
 */
export function calculateInstallmentSchedule(params: {
  totalPrincipal: number;
  months: number;
  annualInterestRate: number;
  startDate: string;
  sheetYear?: number;
}): {
  schedule: InstallmentScheduleItem[];
  totalInterest: number;
  totalPayable: number;
  monthlyAverage: number;
} {
  const principalTotal = Math.max(0, Math.round(params.totalPrincipal));
  const months = Math.min(60, Math.max(2, Math.round(params.months)));
  const annualRate = Math.max(0, Number(params.annualInterestRate) || 0);

  const startParts = String(params.startDate || '').match(/^(\d{4})-/);
  const startYear = startParts ? parseInt(startParts[1], 10) : new Date().getFullYear();
  const sheetYear = params.sheetYear || startYear;

  const schedule: InstallmentScheduleItem[] = [];

  if (annualRate <= 0) {
    const base = Math.floor(principalTotal / months);
    const remainder = principalTotal - base * months;

    for (let i = 0; i < months; i++) {
      const { date, year, month } = addMonthsClamped(params.startDate, i);
      const amt = i === 0 ? base + remainder : base;
      schedule.push({
        index: i + 1,
        date,
        year,
        month,
        sheetTitle: `${month}월`,
        principal: amt,
        interest: 0,
        amount: amt,
        recordedInSheet: year === sheetYear,
      });
    }

    return {
      schedule,
      totalInterest: 0,
      totalPayable: principalTotal,
      monthlyAverage: Math.round(principalTotal / months),
    };
  }

  // Interest-bearing (원리금균등 상환 방식)
  const monthlyRate = annualRate / 100 / 12;
  const pow = Math.pow(1 + monthlyRate, months);
  const rawPmt = (principalTotal * monthlyRate * pow) / (pow - 1);
  const fixedPayment = Math.round(rawPmt);

  let remainingPrincipal = principalTotal;
  let totalInterest = 0;
  let totalPayable = 0;

  for (let i = 0; i < months; i++) {
    const { date, year, month } = addMonthsClamped(params.startDate, i);
    const interest = Math.round(remainingPrincipal * monthlyRate);

    let principal = 0;
    let amount = 0;

    if (i === months - 1) {
      principal = remainingPrincipal;
      amount = principal + interest;
    } else {
      principal = Math.min(remainingPrincipal, Math.max(0, fixedPayment - interest));
      amount = principal + interest;
    }

    remainingPrincipal = Math.max(0, remainingPrincipal - principal);
    totalInterest += interest;
    totalPayable += amount;

    schedule.push({
      index: i + 1,
      date,
      year,
      month,
      sheetTitle: `${month}월`,
      principal,
      interest,
      amount,
      recordedInSheet: year === sheetYear,
    });
  }

  return {
    schedule,
    totalInterest,
    totalPayable,
    monthlyAverage: Math.round(totalPayable / months),
  };
}

/**
 * Format structured installment memo tag so sheet rows remain self-describing
 */
export function buildInstallmentMemoTag(params: {
  index: number;
  months: number;
  annualInterestRate: number;
  totalPrincipal: number;
  startDate: string;
}): string {
  const rateText = params.annualInterestRate > 0 ? `연${params.annualInterestRate}%` : '무이자';
  return `[할부:${params.index}/${params.months}|${rateText}|원금:${params.totalPrincipal.toLocaleString('ko-KR')}원|시작:${params.startDate}]`;
}

/**
 * Parse installment metadata from either memo tag or description suffix
 */
export function parseInstallmentMeta(tx: Pick<Transaction, 'description' | 'memo' | 'date'>): ParsedInstallmentMeta | null {
  const memo = tx.memo || '';
  const desc = tx.description || '';

  // Match structured memo tag: [할부:1/6|무이자|원금:1,800,000원|시작:2026-11-13]
  const tagMatch = memo.match(/\[할부:(\d+)\/(\d+)(?:\|([^\]]*))?\]/);
  if (tagMatch) {
    const current = parseInt(tagMatch[1], 10);
    const total = parseInt(tagMatch[2], 10);
    const extra = tagMatch[3] || '';
    const parts = extra.split('|');
    const rateLabel = parts[0] || '무이자';
    const isInterestFree = rateLabel.includes('무이자');

    let totalPrincipal: number | undefined;
    const pMatch = extra.match(/원금:([0-9,]+)/);
    if (pMatch) {
      totalPrincipal = parseInt(pMatch[1].replace(/,/g, ''), 10) || undefined;
    }

    let startDate: string | undefined;
    const sMatch = extra.match(/시작:(\d{4}-\d{2}-\d{2})/);
    if (sMatch) {
      startDate = sMatch[1];
    }

    const baseDesc = desc.replace(/\s*\(할부\s*\d+\/\d+\)\s*$/, '').trim();
    return {
      current,
      total,
      rateLabel,
      isInterestFree,
      totalPrincipal,
      startDate,
      planKey: `${baseDesc}__${total}__${startDate || ''}`,
    };
  }

  // Fallback: match "(할부 1/6)" or "[할부 1/6]" in description/memo
  const descMatch = `${desc} ${memo}`.match(/(?:\(|\[)할부\s*(\d+)\/(\d+)(?:\)|\])/);
  if (descMatch) {
    const current = parseInt(descMatch[1], 10);
    const total = parseInt(descMatch[2], 10);
    const baseDesc = desc.replace(/\s*\(할부\s*\d+\/\d+\)\s*$/, '').trim();
    return {
      current,
      total,
      isInterestFree: true,
      planKey: `${baseDesc}__${total}`,
    };
  }

  return null;
}

export function loadInstallmentPlans(spreadsheetId?: string | null): InstallmentPlan[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(spreadsheetId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveInstallmentPlan(plan: InstallmentPlan, spreadsheetId?: string | null): InstallmentPlan[] {
  const existing = loadInstallmentPlans(spreadsheetId);
  const next = [plan, ...existing.filter((p) => p.id !== plan.id)];
  try {
    localStorage.setItem(getStorageKey(spreadsheetId), JSON.stringify(next));
  } catch (e) {
    console.warn('Failed to save installment plan:', e);
  }
  return next;
}

export function deleteInstallmentPlan(planId: string, spreadsheetId?: string | null): InstallmentPlan[] {
  const existing = loadInstallmentPlans(spreadsheetId);
  const next = existing.filter((p) => p.id !== planId);
  try {
    localStorage.setItem(getStorageKey(spreadsheetId), JSON.stringify(next));
  } catch (e) {
    console.warn('Failed to delete installment plan:', e);
  }
  return next;
}
