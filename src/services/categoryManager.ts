import {
  CategoryItem,
  PaymentMethodItem,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_PAYMENT_METHODS,
  TransactionType,
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
      if (name && !DEFAULT_EXPENSE_CATEGORIES.includes(name) && !DEFAULT_INCOME_CATEGORIES.includes(name)) {
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
