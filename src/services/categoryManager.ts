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
 * Initialize default payment methods
 */
export function getDefaultPaymentMethods(detectedList?: string[]): PaymentMethodItem[] {
  const set = new Set(DEFAULT_PAYMENT_METHODS);
  if (detectedList) {
    detectedList.forEach((p) => {
      if (p && p.trim()) set.add(p.trim());
    });
  }

  return Array.from(set).map((name, idx) => ({
    id: `pm_${idx}_${name}`,
    name,
    isVisible: true,
    isCustom: !DEFAULT_PAYMENT_METHODS.includes(name),
  }));
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
 * Load payment methods from localStorage
 */
export function loadPaymentMethods(detectedMethods?: string[]): PaymentMethodItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PAYMENTS);
    if (raw) {
      const parsed: PaymentMethodItem[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (detectedMethods && detectedMethods.length > 0) {
          const existing = new Set(parsed.map((p) => p.name));
          let changed = false;
          detectedMethods.forEach((name, idx) => {
            if (name && !existing.has(name)) {
              parsed.push({
                id: `pm_new_${Date.now()}_${idx}`,
                name,
                isVisible: true,
                isCustom: true,
              });
              changed = true;
            }
          });
          if (changed) {
            savePaymentMethods(parsed);
          }
        }
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load payments from localStorage:', e);
  }

  const initial = getDefaultPaymentMethods(detectedMethods);
  savePaymentMethods(initial);
  return initial;
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

/**
 * Calculate frequency of each category used in transactions up to last month.
 * If targetDateOrMonth is given (e.g. "2026-10-27" or "10월"), we count transactions strictly prior to that month.
 * If there are no past month transactions, fall back to overall transaction frequency.
 */
export function getCategoryFrequencyUpToLastMonth(
  transactions: Transaction[],
  targetDateOrMonth?: string
): Map<string, number> {
  const frequencyMap = new Map<string, number>();
  if (!transactions || transactions.length === 0) return frequencyMap;

  // Determine the cutoff month and year
  const now = new Date();
  let cutoffYear = now.getFullYear();
  let cutoffMonth = now.getMonth() + 1; // 1-12

  if (targetDateOrMonth) {
    const ymd = targetDateOrMonth.match(/^(\d{4})[-.\/](\d{1,2})/);
    if (ymd) {
      cutoffYear = parseInt(ymd[1], 10);
      cutoffMonth = parseInt(ymd[2], 10);
    } else {
      const mMatch = targetDateOrMonth.match(/(\d{1,2})월?/);
      if (mMatch) {
        cutoffMonth = parseInt(mMatch[1], 10);
      }
    }
  }

  let pastCount = 0;
  transactions.forEach((tx) => {
    if (!tx.category) return;

    let txMonth: number | null = null;
    let txYear: number | null = null;

    if (tx.date) {
      const ym = tx.date.match(/^(\d{4})[-.\/](\d{1,2})/);
      if (ym) {
        txYear = parseInt(ym[1], 10);
        txMonth = parseInt(ym[2], 10);
      } else {
        const m = tx.date.match(/(\d{1,2})월/);
        if (m) txMonth = parseInt(m[1], 10);
      }
    }
    if (txMonth === null && tx.sheetTitle) {
      const sm = tx.sheetTitle.match(/(\d{1,2})월/);
      if (sm) txMonth = parseInt(sm[1], 10);
    }

    let isPrior = false;
    if (txYear && txMonth) {
      if (txYear < cutoffYear || (txYear === cutoffYear && txMonth < cutoffMonth)) {
        isPrior = true;
      }
    } else if (txMonth !== null) {
      if (txMonth < cutoffMonth) {
        isPrior = true;
      }
    }

    if (isPrior) {
      pastCount++;
      frequencyMap.set(tx.category, (frequencyMap.get(tx.category) || 0) + 1);
    }
  });

  // Fallback if no prior month transactions exist
  if (pastCount === 0) {
    transactions.forEach((tx) => {
      if (tx.category) {
        frequencyMap.set(tx.category, (frequencyMap.get(tx.category) || 0) + 1);
      }
    });
  }

  return frequencyMap;
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
    return 0;
  });
}

