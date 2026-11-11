import React, { useState, useMemo, useEffect } from 'react';
import {
  Table,
  TrendingDown,
  TrendingUp,
  Sparkles,
  Tag,
  Layers,
  X,
  Edit2,
  Calendar,
  CreditCard,
  RotateCcw,
  Plus,
  Check,
  ArrowRight,
  Info,
  CheckCircle2,
  Filter,
  CheckSquare,
  Square,
  Loader2,
  ChevronDown,
  ChevronUp,
  Search,
} from 'lucide-react';
import {
  USER_2026_DATA,
  YearDashboardData,
  CategoryMonthlyData,
} from '../data/userLedgerData';
import {
  Transaction,
  TransactionType,
  SubItem,
  CategoryItem,
  PaymentMethodItem,
  formatShortDate,
} from '../types/ledger';
import { saveSubItemsForTransaction } from '../services/subItemStorage';
import { getPaymentGroupBadge } from '../utils/paymentGroupUtils';
import { extractMonthNumberFromTab } from '../services/googleSheets';

interface AnnualMatrixViewProps {
  yearData?: YearDashboardData;
  onSelectMonth?: (monthTitle: string) => void;
  transactions?: Transaction[];
  activeSheetTitle?: string;
  onEditTransaction?: (tx: Transaction) => Promise<void> | void;
  customCategories?: CategoryItem[];
  customPaymentMethods?: PaymentMethodItem[];
  spreadsheetId?: string;
  accessToken?: string | null;
  sheetTabs?: Array<{ id: number; title: string }>;
  isRealGoogleConnected?: boolean;
  onFetchMonthTransactions?: (monthNum: number) => Promise<Transaction[]>;
}

const CATEGORY_COLOR_PALETTE = [
  '#3B82F6', // blue-500
  '#10B981', // emerald-500
  '#F59E0B', // amber-500
  '#8B5CF6', // purple-500
  '#EC4899', // pink-500
  '#06B6D4', // cyan-500
  '#F97316', // orange-500
  '#14B8A6', // teal-500
  '#84CC16', // lime-500
  '#6366F1', // indigo-500
  '#E11D48', // rose-600
  '#0284C7', // sky-600
  '#D97706', // amber-600
  '#9333EA', // purple-600
  '#059669', // emerald-600
  '#EA580C', // orange-600
  '#4F46E5', // indigo-600
  '#DB2777', // pink-600
  '#0D9488', // teal-600
  '#65A30D', // lime-600
  '#2563EB', // blue-600
  '#CA8A04', // yellow-600
  '#7C3AED', // violet-600
  '#C026D3', // fuchsia-600
  '#0891B2', // cyan-600
  '#64748B', // slate-500
];

const FIXED_BUDGET_CATEGORIES = new Set([
  '관리비_기타',
  '관리비_수도',
  '관리비_전기',
  '관리비_온수',
  '통신비',
  '보험료',
  '구독',
  '렌탈',
  '대출_원금',
  '대출_이자',
  '세금/공과금',
]);

const SPECIAL_EXPENSE_CATEGORIES = new Set([
  '여행비',
  '골프',
  '경조사',
]);

const DEFAULT_PAYMENT_METHODS = [
  '현대카드_신용',
  '신한카드_체크',
  'KB국민카드',
  '삼성카드',
  '계좌이체',
  '자동이체',
  '카카오페이',
  '현금',
];

interface MatchedMatrixItem {
  tx: Transaction;
  matchedAmount: number;
  subItemName?: string;
  isSubItem: boolean;
  subItemId?: string;
  category: string;
  isRecurring: boolean;
  isSpecial: boolean;
}

/**
 * Extract month number (1 ~ 12) from date string or sheet title
 */
function extractMonthNumber(dateStr?: string, sheetTitle?: string): number | null {
  if (sheetTitle) {
    const fromTab = extractMonthNumberFromTab(sheetTitle);
    if (fromTab !== null) return fromTab;
  }
  if (dateStr) {
    const ymd = dateStr.match(/^\d{4}\s*[-.\/]\s*(\d{1,2})/);
    if (ymd) {
      const m = parseInt(ymd[1], 10);
      if (m >= 1 && m <= 12) return m;
    }
    const kor = dateStr.match(/(?:^|[^0-9])(\d{1,2})월/);
    if (kor) {
      const m = parseInt(kor[1], 10);
      if (m >= 1 && m <= 12) return m;
    }
    const md = dateStr.match(/^0?(\d{1,2})[-.\/]/);
    if (md) {
      const m = parseInt(md[1], 10);
      if (m >= 1 && m <= 12) return m;
    }
  }
  return null;
}

/**
 * Validate and sanitize cached monthCache so corrupted/lumped cache from prior bug is repaired!
 */
function sanitizeMonthCache(raw: any): Record<number, Transaction[]> {
  if (!raw || typeof raw !== 'object') return {};
  const clean: Record<number, Transaction[]> = {};
  Object.entries(raw).forEach(([mStr, txs]) => {
    if (!Array.isArray(txs)) return;
    txs.forEach((t: any) => {
      if (!t || t.id?.startsWith('user-2026-') || t.id?.startsWith('sample-')) return;
      const m = extractMonthNumber(t.date, t.sheetTitle) ?? Number(mStr);
      if (m >= 1 && m <= 12) {
        if (!clean[m]) clean[m] = [];
        if (!clean[m].some((existing) => existing.id === t.id)) {
          clean[m].push(t);
        }
      }
    });
  });
  return clean;
}

/**
 * Robust category name equality (ignoring internal/surrounding whitespace and case)
 */
function isSameCategory(catA?: string, catB?: string): boolean {
  if (!catA || !catB) return false;
  const a = catA.trim().replace(/\s+/g, '').toLowerCase();
  const b = catB.trim().replace(/\s+/g, '').toLowerCase();
  return a === b;
}

/**
 * Check if a category name is strictly an EXPENSE category.
 * Excludes summary/total rows ('총 지출', '총 수입', '합계', '소계' etc.)
 * Excludes income categories ('급여', '월급', '상여금', '부수입', '수입' etc.)
 * Respects customCategories type ('expense' vs 'income' vs 'transfer').
 */
function isPureExpenseCategory(catName?: string, customCategories?: CategoryItem[]): boolean {
  if (!catName || typeof catName !== 'string') return false;
  const trimmed = catName.trim();
  if (!trimmed) return false;

  // 1. Exclude summary / total rows
  if (/^(총\s*지출|총\s*수입|합계|총계|소계|월\s*합계|연간\s*합계|잔액|누적\s*잔액|대시보드|dashboard)$/i.test(trimmed)) {
    return false;
  }

  // 2. Exclude pure income terms
  if (/^(총\s*수입|수입|급여|월급|상여금?|보너스|부수입|금융소득|이자수입|배당금?|환급금?|기타수입)$/i.test(trimmed)) {
    return false;
  }

  // 3. Exclude transfer terms
  if (/^(저축|투자|계좌이체|카드대금|청약|기타이체)$/i.test(trimmed)) {
    return false;
  }

  // 4. Custom category metadata
  if (customCategories && customCategories.length > 0) {
    const found = customCategories.find((c) => isSameCategory(c.name, trimmed));
    if (found) {
      return found.type === 'expense';
    }
  }

  return true;
}

export const AnnualMatrixView: React.FC<AnnualMatrixViewProps> = ({
  yearData = USER_2026_DATA,
  onSelectMonth,
  transactions,
  activeSheetTitle,
  onEditTransaction,
  customCategories,
  customPaymentMethods,
  spreadsheetId,
  accessToken,
  sheetTabs,
  isRealGoogleConnected,
  onFetchMonthTransactions,
}) => {
  const [sortField, setSortField] = useState<'total' | 'name'>('total');
  const [filterZero, setFilterZero] = useState<boolean>(true);
  const [searchCat, setSearchCat] = useState<string>('');

  // Local storage key for persistent annual matrix month cache
  const storageKey = useMemo(
    () => `smart_money_annual_month_cache_${spreadsheetId || 'default'}`,
    [spreadsheetId]
  );

  // Multi-month real transactions cache: monthNumber (1..12) -> Transaction[]
  // Persisted in localStorage so synced numbers are NEVER lost on reload or tab switch!
  const [monthCache, setMonthCache] = useState<Record<number, Transaction[]>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem(`smart_money_annual_month_cache_${spreadsheetId || 'default'}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return sanitizeMonthCache(parsed);
        }
      }
    } catch (e) {
      console.warn('Could not read cached monthCache:', e);
    }
    return {};
  });
  const [isLoadingMonthData, setIsLoadingMonthData] = useState<boolean>(false);

  // Automatically save monthCache to localStorage on updates
  useEffect(() => {
    if (typeof window !== 'undefined' && Object.keys(monthCache).length > 0) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(monthCache));
      } catch (e) {
        console.warn('Could not save monthCache to localStorage:', e);
      }
    }
  }, [monthCache, storageKey]);

  // Annual chart view mode: 'category' (stacked colors per category) vs 'spendingType' (고정, 일반, 특별 구분)
  const [chartViewMode, setChartViewMode] = useState<'category' | 'spendingType'>('category');

  // Filter chart by selected categories (Multi-select enabled per user request)
  const [selectedCategoryFilters, setSelectedCategoryFilters] = useState<string[]>([]);

  // User request: "연간매트릭스에서 지출 추이 그래프에 카테고리가 전부 보이는게 아닌데, 필요하면 카테고리 전체보기 할 수 있게 해줘"
  const [showAllCategoriesInLegend, setShowAllCategoriesInLegend] = useState<boolean>(false);
  const [legendCategorySearch, setLegendCategorySearch] = useState<string>('');

  const handleToggleCategoryFilter = (catName: string) => {
    setSelectedCategoryFilters((prev) => {
      if (prev.includes(catName)) {
        return prev.filter((c) => c !== catName);
      } else {
        return [...prev, catName];
      }
    });
  };

  // Matrix cell drill-down modal state (User request: 특정 월 특정 분류 금액 누르면 해당 항목들 리스트업 & 수정)
  const [selectedCellDetail, setSelectedCellDetail] = useState<{
    category: string;
    monthNumber: number;
    monthName: string;
    amount: number;
  } | null>(null);

  // In-place transaction edit modal state
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editForm, setEditForm] = useState<{
    date: string;
    type: TransactionType;
    category: string;
    description: string;
    amount: number;
    paymentMethod?: string;
    memo?: string;
    isRecurring: boolean;
    isSpecial: boolean;
    subItems: SubItem[];
  }>({
    date: '',
    type: 'expense',
    category: '',
    description: '',
    amount: 0,
    paymentMethod: '',
    memo: '',
    isRecurring: false,
    isSpecial: false,
    subItems: [],
  });
  const [editAmountStr, setEditAmountStr] = useState<string>('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState<boolean>(false);
  const [editNoticeToast, setEditNoticeToast] = useState<string | null>(null);

  // Sync all 12 months from Google Sheets
  const [isSyncingAllMonths, setIsSyncingAllMonths] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<string>('');

  const handleSyncAllMonths = async () => {
    if (!onFetchMonthTransactions || isSyncingAllMonths) return;
    setIsSyncingAllMonths(true);
    try {
      const updatedCache: Record<number, Transaction[]> = { ...monthCache };
      for (let m = 1; m <= 12; m++) {
        setSyncProgress(`${m}월 조회 중... (${m}/12)`);
        const txs = await onFetchMonthTransactions(m);
        const clean = (txs || []).filter(
          (t) => !t.id?.startsWith('user-2026-') && !t.id?.startsWith('sample-')
        );
        updatedCache[m] = clean;
        setMonthCache((prev) => ({
          ...prev,
          [m]: clean,
        }));
      }
      try {
        localStorage.setItem(storageKey, JSON.stringify(updatedCache));
      } catch (e) {
        console.warn('Could not persist updatedCache:', e);
      }
      setSyncProgress('전체 12개월 동기화 완료!');
      setTimeout(() => setSyncProgress(''), 3000);
    } catch (e) {
      console.warn('Sync all months error:', e);
      setSyncProgress('일부 월 동기화 실패');
      setTimeout(() => setSyncProgress(''), 3000);
    } finally {
      setIsSyncingAllMonths(false);
    }
  };

  // Auto-sync in background on mount: if monthCache is missing months and onFetchMonthTransactions is ready
  useEffect(() => {
    if (!onFetchMonthTransactions) return;

    // Check months present in sheetTabs or 1..12
    const targetMonths: number[] = [];
    if (sheetTabs && sheetTabs.length > 0) {
      sheetTabs.forEach((tab) => {
        const m = extractMonthNumber(undefined, tab.title);
        if (m !== null && targetMonths.indexOf(m) === -1) {
          targetMonths.push(m);
        }
      });
    }

    const monthsToFetch = (targetMonths.length > 0 ? targetMonths : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
      .filter((m) => !monthCache[m] || monthCache[m].length === 0);

    if (monthsToFetch.length === 0) return;

    let isMounted = true;
    const fetchBackground = async () => {
      for (const m of monthsToFetch) {
        if (!isMounted) break;
        try {
          const list = await onFetchMonthTransactions(m);
          if (isMounted && list) {
            const clean = list.filter(
              (t) => !t.id?.startsWith('user-2026-') && !t.id?.startsWith('sample-')
            );
            setMonthCache((prev) => {
              const next = { ...prev, [m]: clean };
              try {
                localStorage.setItem(storageKey, JSON.stringify(next));
              } catch (e) {}
              return next;
            });
          }
        } catch (err) {
          // Quiet background error handling
          console.warn(`Background sync error for month ${m}:`, err);
        }
      }
    };

    fetchBackground();
    return () => {
      isMounted = false;
    };
  }, [onFetchMonthTransactions, sheetTabs, storageKey]);

  // Local optimistic transaction overrides for immediate UI reflection in matrix view
  const [localTxOverrides, setLocalTxOverrides] = useState<Transaction[]>([]);

  // Seed monthCache whenever props.transactions updates with real data for active sheet
  useEffect(() => {
    if (!transactions || transactions.length === 0) return;
    const realOnly = transactions.filter(
      (t) => !t.id?.startsWith('user-2026-') && !t.id?.startsWith('sample-')
    );
    if (realOnly.length === 0) return;

    // Properly group transactions by each individual item's true month!
    const grouped: Record<number, Transaction[]> = {};
    realOnly.forEach((t) => {
      const m = extractMonthNumber(t.date, t.sheetTitle || activeSheetTitle);
      if (m !== null && m >= 1 && m <= 12) {
        if (!grouped[m]) grouped[m] = [];
        grouped[m].push(t);
      }
    });

    setMonthCache((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.entries(grouped).forEach(([mStr, txList]) => {
        const m = Number(mStr);
        const activeMonth = extractMonthNumber(undefined, activeSheetTitle);
        // Only update if it's the actively viewed sheet month, or if monthCache[m] is empty/unset
        if (m === activeMonth || !next[m] || next[m].length === 0) {
          next[m] = txList;
          changed = true;
        }
      });
      if (changed) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch (e) {}
        return next;
      }
      return prev;
    });
  }, [transactions, activeSheetTitle, storageKey]);

  // When user clicks a matrix cell for a specific month, fetch real Google Sheet tab if not yet loaded
  useEffect(() => {
    if (!selectedCellDetail) return;
    const { monthNumber } = selectedCellDetail;

    if (monthCache[monthNumber] !== undefined) {
      return;
    }

    // Check if props.transactions already has REAL items for this month, AND the active tab matches this month
    const activeMonth = extractMonthNumber(undefined, activeSheetTitle);
    if (activeMonth === monthNumber && transactions && transactions.length > 0) {
      const realExisting = transactions.filter(
        (t) =>
          !t.id?.startsWith('user-2026-') &&
          !t.id?.startsWith('sample-') &&
          extractMonthNumber(t.date, t.sheetTitle) === monthNumber
      );
      if (realExisting.length > 0) {
        setMonthCache((prev) => ({
          ...prev,
          [monthNumber]: realExisting,
        }));
        return;
      }
    }

    // Fetch real Google Sheet tab on demand!
    if (onFetchMonthTransactions) {
      let isCancelled = false;
      setIsLoadingMonthData(true);

      onFetchMonthTransactions(monthNumber)
        .then((fetchedTxs) => {
          if (!isCancelled) {
            const cleanTxs = (fetchedTxs || []).filter(
              (t) => !t.id?.startsWith('user-2026-') && !t.id?.startsWith('sample-')
            );
            setMonthCache((prev) => ({
              ...prev,
              [monthNumber]: cleanTxs,
            }));
          }
        })
        .catch((err) => {
          console.warn(`Failed to fetch transactions for month ${monthNumber}:`, err);
          if (!isCancelled) {
            setMonthCache((prev) => ({
              ...prev,
              [monthNumber]: [],
            }));
          }
        })
        .finally(() => {
          if (!isCancelled) {
            setIsLoadingMonthData(false);
          }
        });

      return () => {
        isCancelled = true;
      };
    } else {
      setMonthCache((prev) => ({
        ...prev,
        [monthNumber]: [],
      }));
    }
  }, [
    selectedCellDetail,
    monthCache,
    transactions,
    activeSheetTitle,
    onFetchMonthTransactions,
  ]);

  const months = useMemo(
    () => ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'],
    []
  );

  // Combined transactions source (base + local overrides)
  const effectiveTransactions = useMemo(() => {
    const list = [...(transactions || [])];
    if (localTxOverrides.length > 0) {
      localTxOverrides.forEach((override) => {
        const idx = list.findIndex((t) => t.id === override.id);
        if (idx >= 0) {
          list[idx] = override;
        } else {
          list.unshift(override);
        }
      });
    }
    return list;
  }, [transactions, localTxOverrides]);

  // Dynamically compute real YearDashboardData merging yearData with actual loaded month transactions
  const effectiveYearData = useMemo<YearDashboardData>(() => {
    const catMap = new Map<string, number[]>(); // category -> 12 monthly amounts

    const hasRealSource = Boolean(
      isRealGoogleConnected ||
      spreadsheetId ||
      (sheetTabs && sheetTabs.length > 0) ||
      Object.keys(monthCache).length > 0 ||
      (transactions && transactions.length > 0)
    );

    // 1. Collect all known categories (Strictly EXPENSE only)
    const allKnownCats = new Set<string>();
    if (customCategories) {
      customCategories.forEach((c) => {
        if (c.type === 'expense' && isPureExpenseCategory(c.name, customCategories)) {
          allKnownCats.add(c.name);
        }
      });
    }
    yearData.categories.forEach((cat) => {
      if (isPureExpenseCategory(cat.category, customCategories)) {
        allKnownCats.add(cat.category);
      }
    });

    // Initialize with 0s for all 12 months
    allKnownCats.forEach((catName) => {
      catMap.set(catName, new Array(12).fill(0));
    });

    // Only if pure offline demo with no real sheet or tabs, populate sample numbers
    if (!hasRealSource) {
      yearData.categories.forEach((cat) => {
        if (isPureExpenseCategory(cat.category, customCategories)) {
          catMap.set(cat.category, [...cat.monthly]);
        }
      });
    }

    // 2. Override months where we have loaded real transactions in monthCache
    // (or where effectiveTransactions belongs to activeSheetTitle)
    for (let m = 1; m <= 12; m++) {
      const monthIdx = m - 1;
      let monthTxs: Transaction[] | undefined = monthCache[m];
      if (!monthTxs || monthTxs.length === 0) {
        const matchingTxs = effectiveTransactions.filter(
          (t) =>
            !t.id?.startsWith('user-2026-') &&
            !t.id?.startsWith('sample-') &&
            extractMonthNumber(t.date, t.sheetTitle || activeSheetTitle) === m
        );
        if (matchingTxs.length > 0) {
          monthTxs = matchingTxs;
        }
      }

      // If this month has been loaded with real data, compute exact category sums!
      if (monthTxs !== undefined) {
        // Reset this month's amounts for all categories in catMap
        catMap.forEach((monthly) => {
          monthly[monthIdx] = 0;
        });

        // Sum actual transactions for this month (Only expense transactions)
        monthTxs.forEach((t) => {
          if (t.type && t.type !== 'expense') return;

          // Check sub-items
          if (t.subItems && t.subItems.length > 0) {
            t.subItems.forEach((sub) => {
              const subCat = (sub.category || t.category || '기타').trim();
              if (!isPureExpenseCategory(subCat, customCategories)) return;
              let matchedKey: string | null = null;
              for (const k of catMap.keys()) {
                if (isSameCategory(k, subCat)) {
                  matchedKey = k;
                  break;
                }
              }
              const keyToUse = matchedKey || subCat;
              if (!catMap.has(keyToUse)) {
                catMap.set(keyToUse, new Array(12).fill(0));
              }
              catMap.get(keyToUse)![monthIdx] += Number(sub.amount) || 0;
            });
            return;
          }

          // Main transaction
          const mainCat = (t.category || '기타').trim();
          if (!isPureExpenseCategory(mainCat, customCategories)) return;
          let matchedKey: string | null = null;
          for (const k of catMap.keys()) {
            if (isSameCategory(k, mainCat)) {
              matchedKey = k;
              break;
            }
          }
          const keyToUse = matchedKey || mainCat;
          if (!catMap.has(keyToUse)) {
            catMap.set(keyToUse, new Array(12).fill(0));
          }
          catMap.get(keyToUse)![monthIdx] += Number(t.amount) || 0;
        });
      }
    }

    // Convert catMap to CategoryMonthlyData[] (Strictly pure expense categories only)
    const categories: CategoryMonthlyData[] = [];
    catMap.forEach((monthly, category) => {
      if (!isPureExpenseCategory(category, customCategories)) return;
      const annualTotal = monthly.reduce((a, b) => a + b, 0);
      categories.push({
        category,
        annualTotal,
        monthly,
      });
    });

    const totalExpense = categories.reduce((sum, c) => sum + c.annualTotal, 0);

    // Compute real total income across loaded month transactions
    let computedIncome = 0;
    for (let m = 1; m <= 12; m++) {
      const txs = monthCache[m];
      if (txs) {
        txs.forEach((t) => {
          if (t.type === 'income') {
            computedIncome += Number(t.amount) || 0;
          }
        });
      }
    }
    const totalIncome = hasRealSource ? computedIncome : (yearData.totalIncome || 0);

    return {
      year: yearData.year || 2026,
      totalIncome,
      totalExpense,
      categories,
    };
  }, [yearData, monthCache, effectiveTransactions, activeSheetTitle, isRealGoogleConnected, spreadsheetId, sheetTabs, customCategories]);

  // Map each category to a distinct color
  const categoryColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    effectiveYearData.categories.forEach((cat, idx) => {
      map[cat.category] = CATEGORY_COLOR_PALETTE[idx % CATEGORY_COLOR_PALETTE.length];
    });
    return map;
  }, [effectiveYearData.categories]);

  // All categories sorted by annual spending descending, then alphabetical (Strictly pure expense only)
  const allCategoriesForLegend = useMemo(() => {
    return effectiveYearData.categories
      .filter((c) => isPureExpenseCategory(c.category, customCategories))
      .sort((a, b) => {
        if (b.annualTotal !== a.annualTotal) {
          return b.annualTotal - a.annualTotal;
        }
        return a.category.localeCompare(b.category, 'ko-KR');
      });
  }, [effectiveYearData.categories, customCategories]);

  // Categories displayed in the chart legend (supports toggle to view all & search)
  const displayedLegendCategories = useMemo(() => {
    let list = allCategoriesForLegend;

    // Search query within legend
    if (legendCategorySearch.trim()) {
      const q = legendCategorySearch.trim().toLowerCase();
      return list.filter((c) => c.category.toLowerCase().includes(q));
    }

    if (showAllCategoriesInLegend) {
      return list;
    }

    // Default collapsed view: top 10 categories with spending > 0, plus any active filter selections
    const top10 = list.filter((c) => c.annualTotal > 0).slice(0, 10);
    const top10Names = new Set(top10.map((c) => c.category));
    const extraSelected = list.filter(
      (c) => selectedCategoryFilters.includes(c.category) && !top10Names.has(c.category)
    );
    return [...top10, ...extraSelected];
  }, [allCategoriesForLegend, showAllCategoriesInLegend, legendCategorySearch, selectedCategoryFilters]);

  // Available categories list (Strictly pure expense only)
  const allCategoryNames = useMemo(() => {
    const names = new Set<string>();
    effectiveYearData.categories.forEach((c) => {
      if (isPureExpenseCategory(c.category, customCategories)) {
        names.add(c.category);
      }
    });
    if (customCategories) {
      customCategories.forEach((c) => {
        if (c.type === 'expense' && isPureExpenseCategory(c.name, customCategories)) {
          names.add(c.name);
        }
      });
    }
    return Array.from(names);
  }, [effectiveYearData.categories, customCategories]);

  // Available payment methods list
  const allPaymentMethodNames = useMemo(() => {
    const methods = new Set<string>(DEFAULT_PAYMENT_METHODS);
    if (customPaymentMethods) {
      customPaymentMethods.forEach((p) => methods.add(p.name));
    }
    effectiveTransactions.forEach((t) => {
      if (t.paymentMethod && t.paymentMethod.trim()) {
        methods.add(t.paymentMethod.trim());
      }
    });
    return Array.from(methods);
  }, [customPaymentMethods, effectiveTransactions]);

  // Monthly breakdown by spending types (고정예산, 일반일상, 특별지출)
  const monthlySpendingTypeData = useMemo(() => {
    return months.map((monthStr, mIdx) => {
      const mNum = mIdx + 1;
      let rec = 0;
      let spec = 0;
      let rout = 0;

      const monthTx = effectiveTransactions.filter((t) => {
        if (t.type && t.type !== 'expense') return false;
        const txMonth = extractMonthNumber(t.date, t.sheetTitle);
        return txMonth === mNum;
      });

      if (monthTx.length > 0) {
        monthTx.forEach((t) => {
          const isRec = Boolean(
            t.isRecurring ||
            t.memo?.includes('[정기예산]') ||
            t.memo?.includes('[고정지출]') ||
            t.memo?.includes('[고정]')
          );
          const isSpec = Boolean(
            t.isSpecial ||
            t.memo?.includes('[특별지출]') ||
            t.memo?.includes('[특별]') ||
            t.memo?.includes('[비정기]')
          );
          if (isRec) rec += t.amount;
          else if (isSpec) spec += t.amount;
          else rout += t.amount;
        });
      } else {
        // Fallback to effectiveYearData.categories monthly numbers
        effectiveYearData.categories.forEach((cat) => {
          const amt = cat.monthly[mIdx] || 0;
          if (FIXED_BUDGET_CATEGORIES.has(cat.category)) {
            rec += amt;
          } else if (SPECIAL_EXPENSE_CATEGORIES.has(cat.category)) {
            spec += amt;
          } else {
            rout += amt;
          }
        });
      }

      const total = rec + spec + rout;
      return {
        month: monthStr,
        total,
        recurring: rec,
        routine: rout,
        special: spec,
      };
    });
  }, [months, effectiveTransactions, effectiveYearData.categories]);

  // Annual sums for spending types
  const annualSpendingTypeTotals = useMemo(() => {
    const recurring = monthlySpendingTypeData.reduce((s, m) => s + m.recurring, 0);
    const routine = monthlySpendingTypeData.reduce((s, m) => s + m.routine, 0);
    const special = monthlySpendingTypeData.reduce((s, m) => s + m.special, 0);
    const total = recurring + routine + special;
    return {
      recurring,
      routine,
      special,
      total,
      recurringRate: total > 0 ? Math.round((recurring / total) * 100) : 0,
      routineRate: total > 0 ? Math.round((routine / total) * 100) : 0,
      specialRate: total > 0 ? Math.round((special / total) * 100) : 0,
    };
  }, [monthlySpendingTypeData]);

  // Calculate monthly total across all categories
  const monthlyTotals = months.map((_, mIdx) => {
    return effectiveYearData.categories.reduce((sum, cat) => sum + (cat.monthly[mIdx] || 0), 0);
  });

  // Filtered categories for the matrix table
  const categories = [...effectiveYearData.categories]
    .filter((cat) => {
      if (filterZero && cat.annualTotal === 0) return false;
      if (searchCat.trim() && !cat.category.toLowerCase().includes(searchCat.trim().toLowerCase())) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortField === 'total') return b.annualTotal - a.annualTotal;
      return a.category.localeCompare(b.category);
    });

  const balance = effectiveYearData.totalIncome - effectiveYearData.totalExpense;
  const savingRate = effectiveYearData.totalIncome > 0 ? Math.round((balance / effectiveYearData.totalIncome) * 100) : 0;

  // Selected Category Data for single or multi-category trend chart
  const selectedCategoriesData = useMemo(() => {
    if (selectedCategoryFilters.length === 0) return null;
    const catList = effectiveYearData.categories.filter((c) =>
      selectedCategoryFilters.includes(c.category)
    );
    const monthlyAmts = months.map((_, idx) =>
      catList.reduce((sum, c) => sum + (c.monthly[idx] || 0), 0)
    );
    const total = monthlyAmts.reduce((sum, a) => sum + a, 0);
    const max = Math.max(...monthlyAmts, 1);
    const activeMonthsCount = monthlyAmts.filter((a) => a > 0).length || 1;
    const avg = Math.round(total / (activeMonthsCount || 1));

    return {
      filters: selectedCategoryFilters,
      categories: catList,
      monthlyAmts,
      total,
      max,
      avg,
      activeMonthsCount,
    };
  }, [selectedCategoryFilters, effectiveYearData.categories, months]);

  // Matching items for the clicked matrix cell (Category + Month)
  const cellDetailItems = useMemo<MatchedMatrixItem[]>(() => {
    if (!selectedCellDetail) return [];

    const { category, monthNumber } = selectedCellDetail;
    const results: MatchedMatrixItem[] = [];

    // Determine candidate transactions for this month:
    let candidateTxs: Transaction[] = [];
    if (monthCache[monthNumber] !== undefined) {
      candidateTxs = monthCache[monthNumber];
    } else {
      const activeMonth = extractMonthNumber(undefined, activeSheetTitle);
      if (activeMonth === monthNumber) {
        candidateTxs = effectiveTransactions.filter(
          (t) =>
            !t.id?.startsWith('user-2026-') &&
            !t.id?.startsWith('sample-') &&
            extractMonthNumber(t.date, t.sheetTitle) === monthNumber
        );
      }
    }

    // Apply local transaction overrides if any
    const finalTxs = candidateTxs.map((t) => {
      const override = localTxOverrides.find((o) => o.id === t.id);
      return override || t;
    });

    finalTxs.forEach((t) => {
      if (t.type && t.type !== 'expense') return;

      const txMonth = extractMonthNumber(t.date, t.sheetTitle);
      if (txMonth !== null && txMonth !== monthNumber) return;

      const isRec = Boolean(
        t.isRecurring ||
        t.memo?.includes('[정기예산]') ||
        t.memo?.includes('[고정지출]') ||
        t.memo?.includes('[정기지출]')
      );
      const isSpec = Boolean(
        t.isSpecial ||
        t.memo?.includes('[특별지출]') ||
        t.memo?.includes('[비정기지출]')
      );

      // Check sub-items
      if (t.subItems && t.subItems.length > 0) {
        let hasMatchedSub = false;
        t.subItems.forEach((sub) => {
          const subCat = sub.category || t.category;
          if (isSameCategory(subCat, category)) {
            hasMatchedSub = true;
            results.push({
              tx: t,
              matchedAmount: Number(sub.amount) || 0,
              subItemName: sub.name,
              isSubItem: true,
              subItemId: sub.id,
              category: subCat,
              isRecurring: isRec,
              isSpecial: isSpec,
            });
          }
        });
        if (hasMatchedSub) return;
      }

      // Check main transaction category
      if (isSameCategory(t.category, category)) {
        results.push({
          tx: t,
          matchedAmount: t.amount,
          isSubItem: false,
          category: t.category,
          isRecurring: isRec,
          isSpecial: isSpec,
        });
      }
    });

    // Sort by date descending
    results.sort((a, b) => (b.tx.date || '').localeCompare(a.tx.date || ''));
    return results;
  }, [
    selectedCellDetail,
    monthCache,
    effectiveTransactions,
    localTxOverrides,
  ]);

  // Keep selectedCellDetail amount in sync with actual loaded items
  useEffect(() => {
    if (selectedCellDetail && cellDetailItems.length > 0) {
      const realSum = cellDetailItems.reduce((s, it) => s + it.matchedAmount, 0);
      if (realSum !== selectedCellDetail.amount) {
        setSelectedCellDetail((prev) => (prev ? { ...prev, amount: realSum } : null));
      }
    }
  }, [selectedCellDetail, cellDetailItems]);

  // Open In-Place Edit Modal
  const handleOpenEdit = (tx: Transaction) => {
    const isRec = Boolean(
      tx.isRecurring ||
      tx.memo?.includes('[정기예산]') ||
      tx.memo?.includes('[고정지출]') ||
      tx.memo?.includes('[정기지출]')
    );
    const isSpec = Boolean(
      tx.isSpecial ||
      tx.memo?.includes('[특별지출]') ||
      tx.memo?.includes('[비정기지출]')
    );

    setEditingTx(tx);
    setEditForm({
      date: tx.date || '',
      type: tx.type || 'expense',
      category: tx.category || '기타',
      description: tx.description || '',
      amount: tx.amount || 0,
      paymentMethod: tx.paymentMethod || '현대카드_신용',
      memo: tx.memo || '',
      isRecurring: isRec,
      isSpecial: isSpec,
      subItems: tx.subItems ? tx.subItems.map((s) => ({ ...s })) : [],
    });
    setEditAmountStr(tx.amount > 0 ? tx.amount.toLocaleString('ko-KR') : '');
  };

  // Save edited transaction
  const handleSaveEdit = async () => {
    if (!editingTx) return;

    const rawNum = parseInt(editAmountStr.replace(/[^0-9]/g, ''), 10) || 0;
    if (rawNum <= 0) {
      alert('금액을 1원 이상 입력해주세요.');
      return;
    }
    if (!editForm.description.trim()) {
      alert('내용/사용처를 입력해주세요.');
      return;
    }

    setIsSubmittingEdit(true);

    try {
      const updatedTx: Transaction = {
        ...editingTx,
        date: editForm.date,
        type: editForm.type,
        category: editForm.category,
        description: editForm.description.trim(),
        amount: rawNum,
        paymentMethod: editForm.paymentMethod,
        memo: editForm.memo?.trim() || undefined,
        isRecurring: editForm.isRecurring,
        isSpecial: editForm.isSpecial,
        subItems: editForm.subItems.length > 0 ? editForm.subItems : undefined,
      };

      // Save sub-items persistence
      saveSubItemsForTransaction(updatedTx, updatedTx.subItems || []);

      // Call parent edit handler if provided
      if (onEditTransaction) {
        await onEditTransaction(updatedTx);
      }

      // Optimistically update local transactions override so this view updates immediately
      setLocalTxOverrides((prev) => {
        const next = [...prev];
        const idx = next.findIndex((t) => t.id === updatedTx.id);
        if (idx >= 0) {
          next[idx] = updatedTx;
        } else {
          next.unshift(updatedTx);
        }
        return next;
      });

      // Also update monthCache so the drill-down list updates immediately
      const mNum = extractMonthNumber(updatedTx.date, updatedTx.sheetTitle);
      if (mNum !== null) {
        setMonthCache((prev) => {
          const list = prev[mNum] || [];
          const idx = list.findIndex((t) => t.id === updatedTx.id);
          const nextList = [...list];
          if (idx >= 0) {
            nextList[idx] = updatedTx;
          } else {
            nextList.unshift(updatedTx);
          }
          return {
            ...prev,
            [mNum]: nextList,
          };
        });
      }

      // Show toast
      setEditNoticeToast(`'${updatedTx.description}' 내역이 성공적으로 수정되었습니다.`);
      setTimeout(() => setEditNoticeToast(null), 3000);

      // Close edit modal (keep drill-down list open so user sees the change)
      setEditingTx(null);
    } catch (err) {
      console.error('Failed to save edited transaction:', err);
      alert('내역 수정 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Toast Notification */}
      {editNoticeToast && (
        <div className="fixed top-5 right-5 z-50 p-3.5 px-4 bg-emerald-600 text-white rounded-xl shadow-xl flex items-center gap-2 text-xs font-bold animate-in slide-in-from-top-3">
          <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
          <span>{editNoticeToast}</span>
        </div>
      )}

      {/* 2026 Annual Overview Summary Card (Consolidated & Zero Waste) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Main Row: Annual Net Balance */}
        <div className="p-3.5 sm:p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-slate-300 font-bold">2026 연간 누적 잔액</span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-500/30 text-blue-200">
                연간 저축률 {savingRate}%
              </span>
            </div>
            <div
              className={`text-xl sm:text-2xl font-black mt-0.5 tracking-tight ${
                balance >= 0 ? 'text-blue-400' : 'text-rose-400'
              }`}
            >
              {balance >= 0 ? '+' : ''}
              {balance.toLocaleString('ko-KR')}
              <span className="text-xs font-normal text-slate-300 ml-1">원</span>
            </div>
          </div>

          <div className="text-right text-xs shrink-0 flex items-center gap-2">
            {onFetchMonthTransactions && (
              <button
                type="button"
                onClick={handleSyncAllMonths}
                disabled={isSyncingAllMonths}
                className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                title="1월부터 12월까지 구글 시트의 전체 월 탭 데이터를 모두 불러와 연간 매트릭스를 실시간 데이터로 최신화합니다."
              >
                {isSyncingAllMonths ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{syncProgress || '동기화 중...'}</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>전체 월 데이터 동기화</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* 2 Pillars: 연간 총 수입 vs 연간 총 지출 */}
        <div className="grid grid-cols-2 divide-x divide-slate-150 bg-slate-50/80 py-2.5 px-1 sm:px-3">
          {/* 총 수입 */}
          <div className="px-2.5 sm:px-4 py-1 flex items-center justify-between min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-[11px] sm:text-xs font-bold text-slate-500 truncate">
                  2026 총 수입
                </span>
              </div>
              <p className="text-sm sm:text-lg font-black text-emerald-600 truncate mt-0.5">
                {effectiveYearData.totalIncome.toLocaleString('ko-KR')}원
              </p>
            </div>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 ml-1.5 shadow-2xs">
              <TrendingUp className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>

          {/* 총 지출 */}
          <div className="px-2.5 sm:px-4 py-1 flex items-center justify-between min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                <span className="text-[11px] sm:text-xs font-bold text-slate-500 truncate">
                  2026 총 지출
                </span>
              </div>
              <p className="text-sm sm:text-lg font-black text-rose-600 truncate mt-0.5">
                {effectiveYearData.totalExpense.toLocaleString('ko-KR')}원
              </p>
            </div>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 ml-1.5 shadow-2xs">
              <TrendingDown className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Expenditure Bar Trends (Stacked Bars, Category Filter & Dual View Modes) */}
      <div className="p-4 sm:p-6 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-1.5 flex-wrap">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="whitespace-nowrap">
                {selectedCategoryFilters.length === 0
                  ? '2026년 월별 총 지출 추이 (1월 ~ 12월)'
                  : selectedCategoryFilters.length === 1
                  ? `2026년 월별 [${selectedCategoryFilters[0]}] 지출 추이`
                  : `2026년 월별 선택 카테고리 지출 추이 (${selectedCategoryFilters.length}개 선택)`}
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {selectedCategoryFilters.length === 0
                ? '하단 카테고리를 클릭하면 여러 카테고리를 동시에 선택하여 비교할 수 있습니다.'
                : selectedCategoryFilters.length === 1
                ? `현재 '${selectedCategoryFilters[0]}' 카테고리를 필터링 중입니다. 다른 카테고리를 추가로 클릭하면 멀티 비교가 가능합니다.`
                : `현재 ${selectedCategoryFilters.join(', ')} (${selectedCategoryFilters.length}개) 카테고리를 멀티 비교 중입니다.`}
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* View Mode Toggle (Active when no category filters selected) */}
            {selectedCategoryFilters.length === 0 ? (
              <>
                <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/80">
                  <button
                    type="button"
                    onClick={() => setChartViewMode('category')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                      chartViewMode === 'category'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Tag className="w-3.5 h-3.5 shrink-0" />
                    <span>카테고리별 보기</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartViewMode('spendingType')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                      chartViewMode === 'spendingType'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 shrink-0" />
                    <span>고정·일반·특별 구분</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAllCategoriesInLegend((prev) => !prev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap shrink-0 border shadow-2xs ${
                    showAllCategoriesInLegend
                      ? 'bg-indigo-600 text-white border-indigo-700'
                      : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                  }`}
                  title="하단 카테고리 전체 목록 펼치기/접기"
                >
                  <Filter className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {showAllCategoriesInLegend
                      ? '카테고리 접기 ▲'
                      : `카테고리 전체보기 (${allCategoriesForLegend.length}개) ▼`}
                  </span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setSelectedCategoryFilters([])}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-300 transition cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
                title="카테고리 필터 해제하고 전체 지출 보기"
              >
                <X className="w-3.5 h-3.5 shrink-0" />
                <span>전체 지출 보기로 복원</span>
              </button>
            )}

            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200/80 shrink-0 whitespace-nowrap">
              {selectedCategoriesData ? (
                <>선택 합계: {selectedCategoriesData.total.toLocaleString('ko-KR')}원</>
              ) : (() => {
                const maxVal = Math.max(...monthlyTotals, 0);
                if (maxVal <= 0) return <>지출 집계 대기 중</>;
                const maxIdx = monthlyTotals.indexOf(maxVal);
                const maxMonthName = maxIdx >= 0 ? months[maxIdx] : '';
                return <>최고 지출: {maxMonthName} ({maxVal.toLocaleString('ko-KR')}원)</>;
              })()}
            </span>
          </div>
        </div>

        {/* Active Multi-Category Filter Highlight Banner */}
        {selectedCategoriesData && (
          <div className="mb-3 p-2.5 px-3 bg-indigo-50/90 border border-indigo-200 rounded-xl flex items-center justify-between gap-3 text-xs animate-in fade-in duration-150 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="font-black text-indigo-950 whitespace-nowrap mr-1">
                선택된 카테고리 ({selectedCategoriesData.filters.length}개):
              </span>
              {selectedCategoriesData.filters.map((catName) => {
                const color = categoryColorMap[catName] || '#6366F1';
                return (
                  <button
                    key={catName}
                    type="button"
                    onClick={() => handleToggleCategoryFilter(catName)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-indigo-200 text-indigo-900 font-bold text-xs shadow-2xs cursor-pointer hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 transition whitespace-nowrap shrink-0 group"
                    title={`클릭하여 '${catName}' 선택 해제`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span>{catName}</span>
                    <X className="w-3 h-3 text-slate-400 group-hover:text-rose-600 shrink-0" />
                  </button>
                );
              })}
              <span className="text-indigo-700 font-semibold text-[11px] hidden sm:inline ml-1 whitespace-nowrap">
                (연간 총 {selectedCategoriesData.total.toLocaleString('ko-KR')}원 • 월평균 {selectedCategoriesData.avg.toLocaleString('ko-KR')}원)
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedCategoryFilters([])}
                className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-indigo-100 text-indigo-800 font-bold rounded-lg border border-indigo-300 shadow-2xs transition cursor-pointer text-xs whitespace-nowrap shrink-0"
              >
                <X className="w-3.5 h-3.5 shrink-0" />
                <span>선택 초기화</span>
              </button>
            </div>
          </div>
        )}

        {/* Visual Monthly Bars */}
        <div className="overflow-x-auto pb-2 pt-2 scrollbar-none">
          <div className="min-w-[520px] sm:min-w-0 grid grid-cols-12 gap-1.5 sm:gap-2.5 items-end h-44 sm:h-48">
            {months.map((m, idx) => {
              // 1. Filtered Categories Mode (Multi or Single Category)
              if (selectedCategoriesData) {
                const monthCats = selectedCategoriesData.categories
                  .filter((c) => (c.monthly[idx] || 0) > 0)
                  .sort((a, b) => (b.monthly[idx] || 0) - (a.monthly[idx] || 0));
                const catAmt = selectedCategoriesData.monthlyAmts[idx] || 0;
                const max = selectedCategoriesData.max || 1;
                const heightPercent = catAmt > 0 ? Math.max(Math.round((catAmt / max) * 100), 8) : 0;
                const isMax = catAmt > 0 && catAmt === Math.max(...selectedCategoriesData.monthlyAmts);

                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      if (monthCats.length === 1) {
                        setSelectedCellDetail({
                          category: monthCats[0].category,
                          monthNumber: idx + 1,
                          monthName: m,
                          amount: monthCats[0].monthly[idx] || 0,
                        });
                      } else if (onSelectMonth) {
                        onSelectMonth(m);
                      }
                    }}
                    className="group flex flex-col items-center h-full justify-end cursor-pointer transition active:scale-95"
                    title={`${m} 선택 항목 합계: ${catAmt.toLocaleString('ko-KR')}원\n클릭하여 상세 내역 확인`}
                  >
                    <span
                      className={`text-[10px] font-bold mb-1 transition truncate max-w-full ${
                        isMax ? 'text-indigo-600 font-black' : 'text-slate-500'
                      }`}
                    >
                      {catAmt > 0
                        ? catAmt >= 10000
                          ? `${(catAmt / 10000).toFixed(0)}만`
                          : `${catAmt.toLocaleString('ko-KR')}원`
                        : '-'}
                    </span>
                    <div className="w-full bg-slate-100 rounded-t-lg overflow-hidden flex flex-col justify-end h-28 sm:h-32 group-hover:bg-slate-200/70 transition p-0.5">
                      {catAmt > 0 ? (
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className="w-full rounded-t-md overflow-hidden flex flex-col-reverse justify-start transition-all duration-300 shadow-2xs"
                        >
                          {monthCats.map((cat) => {
                            const sliceAmt = cat.monthly[idx] || 0;
                            const slicePct = (sliceAmt / catAmt) * 100;
                            const color = categoryColorMap[cat.category] || '#3B82F6';
                            return (
                              <div
                                key={cat.category}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCellDetail({
                                    category: cat.category,
                                    monthNumber: idx + 1,
                                    monthName: m,
                                    amount: sliceAmt,
                                  });
                                }}
                                style={{ height: `${slicePct}%`, backgroundColor: color }}
                                className="w-full transition-opacity hover:opacity-85 cursor-pointer"
                                title={`${m} ${cat.category}: ${sliceAmt.toLocaleString('ko-KR')}원 (${Math.round(slicePct)}%)\n클릭하여 상세 내역 확인 및 수정`}
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <div className="w-full h-1 bg-slate-300 rounded-full" />
                      )}
                    </div>
                    <span
                      className={`text-xs font-black mt-1.5 transition ${
                        isMax ? 'text-indigo-700 font-black' : 'text-slate-700 group-hover:text-blue-600'
                      }`}
                    >
                      {m}
                    </span>
                  </button>
                );
              }

              // 2. Full Month Multi-category or Spending Type Mode
              const amt = monthlyTotals[idx];
              const max = Math.max(...monthlyTotals, 1);
              const heightPercent = amt > 0 ? Math.max(Math.round((amt / max) * 100), 6) : 0;
              const isMax = amt === Math.max(...monthlyTotals);

              const monthCats = effectiveYearData.categories
                .filter((c) => (c.monthly[idx] || 0) > 0)
                .sort((a, b) => (b.monthly[idx] || 0) - (a.monthly[idx] || 0));

              const st = monthlySpendingTypeData[idx];
              const stTotal = st?.total && st.total > 0 ? st.total : amt;

              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => onSelectMonth && onSelectMonth(m)}
                  className="group flex flex-col items-center h-full justify-end cursor-pointer transition active:scale-95"
                  title={`${m}: ${amt.toLocaleString('ko-KR')}원 (클릭하여 ${m} 가계부 보기)`}
                >
                  <span
                    className={`text-[10px] font-bold mb-1 transition truncate max-w-full ${
                      isMax ? 'text-indigo-600 font-extrabold' : 'text-slate-500'
                    }`}
                  >
                    {amt > 0 ? `${(amt / 10000).toFixed(0)}만` : '-'}
                  </span>
                  <div className="w-full bg-slate-100 rounded-t-lg overflow-hidden flex flex-col justify-end h-28 sm:h-32 group-hover:bg-slate-200/70 transition p-0.5">
                    {amt > 0 ? (
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className="w-full rounded-t-md overflow-hidden flex flex-col-reverse justify-start transition-all duration-300 shadow-2xs"
                      >
                        {chartViewMode === 'category' ? (
                          monthCats.map((cat) => {
                            const catAmt = cat.monthly[idx] || 0;
                            const catPct = (catAmt / amt) * 100;
                            const color = categoryColorMap[cat.category] || '#94A3B8';
                            return (
                              <div
                                key={cat.category}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleCategoryFilter(cat.category);
                                }}
                                style={{ height: `${catPct}%`, backgroundColor: color }}
                                className="w-full transition-opacity hover:opacity-85 cursor-pointer"
                                title={`${cat.category}: ${catAmt.toLocaleString('ko-KR')}원 (${Math.round(catPct)}%)\n클릭하여 이 카테고리만 그래프에 보기`}
                              />
                            );
                          })
                        ) : (
                          <>
                            {st && st.recurring > 0 && (
                              <div
                                style={{
                                  height: `${(st.recurring / stTotal) * 100}%`,
                                  backgroundColor: '#9333EA',
                                }}
                                className="w-full transition-opacity hover:opacity-85"
                                title={`📌 고정 예산: ${st.recurring.toLocaleString('ko-KR')}원 (${Math.round((st.recurring / stTotal) * 100)}%)`}
                              />
                            )}
                            {st && st.routine > 0 && (
                              <div
                                style={{
                                  height: `${(st.routine / stTotal) * 100}%`,
                                  backgroundColor: '#FB7185',
                                }}
                                className="w-full transition-opacity hover:opacity-85"
                                title={`🛒 일반 일상 지출: ${st.routine.toLocaleString('ko-KR')}원 (${Math.round((st.routine / stTotal) * 100)}%)`}
                              />
                            )}
                            {st && st.special > 0 && (
                              <div
                                style={{
                                  height: `${(st.special / stTotal) * 100}%`,
                                  backgroundColor: '#F59E0B',
                                }}
                                className="w-full transition-opacity hover:opacity-85"
                                title={`🛋️ 특별(비정기) 지출: ${st.special.toLocaleString('ko-KR')}원 (${Math.round((st.special / stTotal) * 100)}%)`}
                              />
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="w-full h-1 bg-slate-300 rounded-full" />
                    )}
                  </div>
                  <span
                    className={`text-xs font-black mt-1.5 transition ${
                      isMax ? 'text-indigo-700 font-black' : 'text-slate-700 group-hover:text-blue-600'
                    }`}
                  >
                    {m}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Clickable Legend: Clicking any category selects/filters it in the chart */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <span className="font-bold text-slate-700 text-[11px] shrink-0 flex items-center gap-1 mr-1">
                <Filter className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>카테고리 필터:</span>
              </span>

              {/* All categories reset pill */}
              <button
                type="button"
                onClick={() => setSelectedCategoryFilters([])}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer whitespace-nowrap shrink-0 shadow-2xs ${
                  selectedCategoryFilters.length === 0
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                전체 지출 ({effectiveYearData.totalExpense > 0 ? `${(effectiveYearData.totalExpense / 10000).toFixed(0)}만` : '0원'})
              </button>

              {/* Toggle View All Categories Button */}
              <button
                type="button"
                onClick={() => {
                  setShowAllCategoriesInLegend((prev) => !prev);
                  if (showAllCategoriesInLegend) {
                    setLegendCategorySearch('');
                  }
                }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black border transition cursor-pointer whitespace-nowrap shrink-0 shadow-2xs ${
                  showAllCategoriesInLegend
                    ? 'bg-indigo-600 text-white border-indigo-700'
                    : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                }`}
                title={showAllCategoriesInLegend ? '상위 10개만 보기로 접기' : '모든 카테고리 펼쳐서 보기'}
              >
                {showAllCategoriesInLegend ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                    <span>상위 10개만 보기 (접기)</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                    <span>카테고리 전체보기 (총 {allCategoriesForLegend.length}개)</span>
                  </>
                )}
              </button>

              {/* Deselect active filters */}
              {selectedCategoryFilters.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCategoryFilters([])}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  <X className="w-3 h-3 text-rose-600 shrink-0" />
                  <span>선택 해제 ({selectedCategoryFilters.length}개)</span>
                </button>
              )}
            </div>

            {/* Quick search input when expanded */}
            {showAllCategoriesInLegend && (
              <div className="relative min-w-[150px] max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                <input
                  type="text"
                  placeholder="카테고리 검색..."
                  value={legendCategorySearch}
                  onChange={(e) => setLegendCategorySearch(e.target.value)}
                  className="w-full pl-8 pr-7 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:outline-indigo-500"
                />
                {legendCategorySearch && (
                  <button
                    type="button"
                    onClick={() => setLegendCategorySearch('')}
                    className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Category Chips Container */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 pt-0.5">
            {displayedLegendCategories.map((cat) => {
              const isSelected = selectedCategoryFilters.includes(cat.category);
              const color = categoryColorMap[cat.category] || '#94A3B8';

              return (
                <button
                  key={cat.category}
                  type="button"
                  onClick={() => handleToggleCategoryFilter(cat.category)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition cursor-pointer whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'bg-indigo-100 text-indigo-950 font-black border-indigo-400 ring-2 ring-indigo-500/30 shadow-2xs'
                      : 'bg-slate-50 text-slate-700 font-semibold border-slate-200/80 hover:bg-indigo-50 hover:border-indigo-200'
                  }`}
                  title={`클릭하여 '${cat.category}' 멀티 선택/해제`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                    style={{ backgroundColor: color }}
                  />
                  <span className="whitespace-nowrap">{cat.category}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {cat.annualTotal > 0
                      ? `${(cat.annualTotal / 10000).toFixed(0)}만`
                      : '0원'}
                  </span>
                  {isSelected && <Check className="w-3 h-3 text-indigo-600 stroke-[3] shrink-0" />}
                </button>
              );
            })}

            {displayedLegendCategories.length === 0 && (
              <span className="text-xs text-slate-400 py-1">
                검색된 카테고리가 없습니다.
              </span>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
            <span>
              💡 카테고리를 여러 개 클릭하면 멀티 선택하여 함께 비교할 수 있습니다.
              {!showAllCategoriesInLegend && (
                <button
                  type="button"
                  onClick={() => setShowAllCategoriesInLegend(true)}
                  className="text-indigo-600 font-bold ml-1.5 hover:underline cursor-pointer"
                >
                  (전체 {allCategoriesForLegend.length}개 펼치기)
                </button>
              )}
            </span>
            <span className="hidden sm:inline whitespace-nowrap">
              표시 중: {displayedLegendCategories.length}개 / 전체 {allCategoriesForLegend.length}개
            </span>
          </div>
        </div>
      </div>

      {/* 26-Category Matrix Table (Clickable Cells for Itemized Drill-down & In-place Edit) */}
      <div className="p-4 sm:p-6 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Table className="w-4 h-4 text-emerald-600" />
              <span>연간 카테고리별 지출 매트릭스 (2026 가계부 Dashboard)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              특정 월의 카테고리 금액을 클릭하면 해당 항목들의 상세 리스트를 확인하고 바로 수정할 수 있습니다.
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              placeholder="분류 검색..."
              value={searchCat}
              onChange={(e) => setSearchCat(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-600"
            />
            <button
              onClick={() => setFilterZero(!filterZero)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                filterZero
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-slate-300 text-slate-700'
              }`}
            >
              지출 있는 항목만 보기
            </button>
          </div>
        </div>

        {/* Matrix Table */}
        <div className="overflow-x-auto min-h-[350px] mt-2">
          <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-300">
                <th className="py-3 px-3 sticky left-0 bg-slate-100 z-10 border-r border-slate-200">
                  분류 (26개)
                </th>
                <th className="py-3 px-3 text-right bg-slate-200 text-slate-900 font-black">
                  연간 지출 합계
                </th>
                {months.map((m) => (
                  <th key={m} className="py-3 px-2.5 text-right font-bold text-slate-700">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {categories.map((cat) => (
                <tr key={cat.category} className="hover:bg-blue-50/50 transition">
                  {/* Category Name Column: Clickable to filter chart */}
                  <td className="py-2.5 px-3 font-bold text-slate-900 sticky left-0 bg-white hover:bg-blue-50/70 z-10 border-r border-slate-200">
                    <button
                      type="button"
                      onClick={() => handleToggleCategoryFilter(cat.category)}
                      className="flex items-center gap-1.5 text-left hover:text-indigo-600 transition cursor-pointer min-w-0 whitespace-nowrap shrink-0"
                      title={`클릭하여 상단 그래프에서 [${cat.category}] 멀티 선택/해제`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                        style={{ backgroundColor: categoryColorMap[cat.category] || '#3B82F6' }}
                      />
                      <span
                        className={`truncate ${
                          selectedCategoryFilters.includes(cat.category) ? 'text-indigo-700 font-black' : ''
                        }`}
                      >
                        {cat.category}
                      </span>
                      {selectedCategoryFilters.includes(cat.category) && (
                        <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-1.5 py-0.2 rounded shrink-0 whitespace-nowrap">
                          선택됨
                        </span>
                      )}
                    </button>
                  </td>

                  {/* Annual Total Column */}
                  <td className="py-2.5 px-3 text-right font-black text-rose-600 bg-slate-50">
                    {cat.annualTotal.toLocaleString('ko-KR')}원
                  </td>

                  {/* 12 Monthly Amount Cells: Clickable for Itemized Drill-down & In-place Edit */}
                  {cat.monthly.map((amt, mIdx) => {
                    const isSelectedCell =
                      selectedCellDetail?.category === cat.category &&
                      selectedCellDetail?.monthNumber === mIdx + 1;

                    return (
                      <td
                        key={mIdx}
                        onClick={() => {
                          if (amt > 0) {
                            setSelectedCellDetail({
                              category: cat.category,
                              monthNumber: mIdx + 1,
                              monthName: months[mIdx],
                              amount: amt,
                            });
                          }
                        }}
                        className={`py-2 px-2 text-right transition select-none ${
                          amt > 0
                            ? isSelectedCell
                              ? 'bg-indigo-600 text-white font-black shadow-xs ring-2 ring-indigo-400'
                              : 'text-slate-900 font-bold hover:bg-indigo-100 hover:text-indigo-950 cursor-pointer active:scale-95'
                            : 'text-slate-300'
                        }`}
                        title={
                          amt > 0
                            ? `${cat.category} ${months[mIdx]}: ${amt.toLocaleString('ko-KR')}원\n클릭하여 상세 항목 목록 확인 및 수정`
                            : `${cat.category} ${months[mIdx]}: 지출 없음`
                        }
                      >
                        {amt > 0 ? (
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded transition ${
                              isSelectedCell
                                ? 'bg-indigo-700 text-white font-black'
                                : 'hover:bg-indigo-200/80 hover:text-indigo-950 font-bold'
                            }`}
                          >
                            {amt.toLocaleString('ko-KR')}원
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                <td className="py-3 px-3 sticky left-0 bg-slate-100 z-10 border-r border-slate-200">
                  월별 총 지출 합계
                </td>
                <td className="py-3 px-3 text-right text-rose-700 font-black text-sm bg-slate-200">
                  {effectiveYearData.totalExpense.toLocaleString('ko-KR')}원
                </td>
                {monthlyTotals.map((tot, idx) => (
                  <td key={idx} className="py-3 px-2.5 text-right font-black text-slate-900">
                    {tot > 0 ? `${tot.toLocaleString('ko-KR')}원` : '-'}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Drill-down Modal: Listing itemized transactions for clicked Matrix Cell with in-place Edit */}
      {selectedCellDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setSelectedCellDetail(null)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[88vh] overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-4 h-4 rounded-full shrink-0 shadow-xs ring-2 ring-white/30"
                  style={{
                    backgroundColor: categoryColorMap[selectedCellDetail.category] || '#3B82F6',
                  }}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-black truncate">
                      {selectedCellDetail.monthName} [{selectedCellDetail.category}] 상세 내역
                    </h3>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-600/80 text-white">
                      총 {cellDetailItems.length}건
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5 font-medium">
                    매트릭스에서 선택한 월과 분류의 개별 거래 항목 목록입니다. 항목을 눌러 바로 수정할 수 있습니다.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedCellDetail(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition cursor-pointer shrink-0 ml-2"
                title="닫기 (ESC)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions & Total Summary Bar */}
            <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 text-xs flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-bold">집계 금액:</span>
                <span className="text-sm font-black text-rose-600">
                  {selectedCellDetail.amount.toLocaleString('ko-KR')}원
                </span>
                {cellDetailItems.length > 0 && (
                  <span className="text-[11px] text-slate-400 font-medium ml-1">
                    (건당 평균 약 {Math.round(selectedCellDetail.amount / cellDetailItems.length).toLocaleString('ko-KR')}원)
                  </span>
                )}
              </div>

              {onSelectMonth && (
                <button
                  type="button"
                  onClick={() => {
                    const mName = selectedCellDetail.monthName;
                    setSelectedCellDetail(null);
                    onSelectMonth(mName);
                  }}
                  className="flex items-center gap-1 text-xs font-bold text-indigo-700 hover:text-indigo-900 hover:underline cursor-pointer"
                >
                  <span>{selectedCellDetail.monthName} 가계부 전체 보기</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Items List Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-2 flex-1">
              {isLoadingMonthData ? (
                <div className="py-14 text-center text-slate-500 space-y-2.5">
                  <Loader2 className="w-8 h-8 mx-auto text-blue-600 animate-spin" />
                  <p className="text-xs font-bold text-slate-800">
                    구글 시트 '{selectedCellDetail.monthName}' 탭에서 실제 지출 내역을 불러오는 중입니다...
                  </p>
                  <p className="text-[11px] text-slate-400">
                    시트의 '{selectedCellDetail.category}' 항목을 실시간 확인하고 있습니다.
                  </p>
                </div>
              ) : cellDetailItems.length === 0 ? (
                <div className="py-10 text-center text-slate-400 space-y-2">
                  <Tag className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-xs font-bold text-slate-700">
                    {selectedCellDetail.monthName} 시트 탭에 '{selectedCellDetail.category}' 내역이 없습니다.
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    {selectedCellDetail.amount > 0 ? (
                      <>
                        대시보드 합계 셀에는 {selectedCellDetail.amount.toLocaleString('ko-KR')}원이 집계되어 있으나, {selectedCellDetail.monthName} 탭에서 일치하는 행을 찾지 못했습니다. 카테고리 명칭(오탈자나 띄어쓰기)을 확인해 주세요.
                      </>
                    ) : (
                      <>해당 월에는 이 카테고리로 등록된 지출 내역이 없습니다.</>
                    )}
                  </p>
                  {onSelectMonth && (
                    <button
                      type="button"
                      onClick={() => {
                        const mName = selectedCellDetail.monthName;
                        setSelectedCellDetail(null);
                        onSelectMonth(mName);
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 font-bold text-xs rounded-xl border border-blue-200 hover:bg-blue-100 transition cursor-pointer"
                    >
                      <span>{selectedCellDetail.monthName} 탭으로 이동하여 전체 내역 확인</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {cellDetailItems.map((item, idx) => {
                    return (
                      <div
                        key={`${item.tx.id}-${idx}`}
                        onClick={() => handleOpenEdit(item.tx)}
                        className="p-3 bg-white hover:bg-blue-50/60 rounded-xl border border-slate-200 hover:border-blue-300 transition flex items-center justify-between gap-3 text-xs cursor-pointer group shadow-2xs"
                        title="클릭하여 이 내역 수정"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-slate-500 text-[11px] font-bold">
                              {formatShortDate(item.tx.date)}
                            </span>
                            {item.isSubItem ? (
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded font-bold border border-blue-200">
                                  {item.tx.description} 세부품목
                                </span>
                                <span className="font-extrabold text-slate-900 truncate">
                                  {item.subItemName}
                                </span>
                              </div>
                            ) : (
                              <span
                                className={`font-extrabold truncate ${
                                  item.isSpecial
                                    ? 'text-amber-800 font-black'
                                    : item.isRecurring
                                    ? 'text-purple-700 font-black'
                                    : 'text-slate-900'
                                }`}
                              >
                                {item.tx.description}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 flex-wrap">
                            {item.tx.paymentMethod && (() => {
                              const badge = getPaymentGroupBadge(item.tx.paymentMethod);
                              return (
                                <span className="inline-flex items-center gap-1 text-slate-700 font-semibold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                  {badge && (
                                    <span className={`w-3.5 h-3.5 text-[9px] font-black rounded flex items-center justify-center shrink-0 ${badge.colorClass}`}>
                                      {badge.char}
                                    </span>
                                  )}
                                  <span>{item.tx.paymentMethod}</span>
                                  {badge && <span className="text-[10px] text-slate-400">({badge.label})</span>}
                                </span>
                              );
                            })()}
                            {item.tx.memo && (
                              <span className="truncate max-w-[220px] text-slate-500" title={item.tx.memo}>
                                {item.tx.memo}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0 flex items-center gap-2.5">
                          {item.tx.paymentMethod && (() => {
                            const badge = getPaymentGroupBadge(item.tx.paymentMethod);
                            if (!badge) return null;
                            return (
                              <span
                                className={`w-4.5 h-4.5 text-[9px] font-black rounded flex items-center justify-center shrink-0 border ${badge.badgeBg} ${badge.badgeText} ${badge.badgeBorder}`}
                                title={`결제수단: ${item.tx.paymentMethod} (${badge.label})`}
                              >
                                {badge.char}
                              </span>
                            );
                          })()}
                          <span className="text-sm font-black text-rose-600">
                            {item.matchedAmount.toLocaleString('ko-KR')}원
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEdit(item.tx);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 rounded-lg border border-slate-200 hover:border-blue-300 font-bold transition cursor-pointer shadow-2xs"
                            title="이 내역 수정하기"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                            <span>수정</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-center gap-2.5">
              <span className="text-xs text-slate-500 font-medium text-center">
                💡 목록의 항목이나 [수정] 버튼을 누르면 즉시 편집 창이 열립니다.
              </span>
              <button
                type="button"
                onClick={() => setSelectedCellDetail(null)}
                className="px-6 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-xs transition cursor-pointer active:scale-95 shadow-xs"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-Place Transaction Edit Modal */}
      {editingTx && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150 overflow-y-auto"
          onClick={() => setEditingTx(null)}
        >
          <div
            className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border-2 border-slate-300 overflow-hidden my-auto flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shrink-0">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-black tracking-tight whitespace-nowrap">가계부 내역 수정</h2>
                  <p className="text-xs text-slate-300 mt-0.5">
                    연간 매트릭스에서 선택한 항목을 실시간으로 수정합니다.
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isSubmittingEdit}
                onClick={() => setEditingTx(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer shrink-0"
                title="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <div className="p-5 sm:p-6 space-y-4 bg-white overflow-y-auto flex-1">
              {/* 1. Date Selection */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>거래 일자</span>
                </label>
                <input
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, date: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-white border-2 border-slate-300 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                  required
                />
              </div>

              {/* 2. Amount Input */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  금액 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-slate-500 select-none">
                    ₩
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={editAmountStr}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/[^0-9]/g, '');
                      const num = parseInt(digits, 10);
                      setEditAmountStr(isNaN(num) || num === 0 ? '' : num.toLocaleString('ko-KR'));
                      setEditForm((prev) => ({ ...prev, amount: isNaN(num) ? 0 : num }));
                    }}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-slate-300 rounded-xl text-lg sm:text-xl font-black text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-blue-600 transition"
                    required
                  />
                </div>

                {/* Quick Add Buttons */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {[10000, 30000, 50000, 100000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        const cur = parseInt(editAmountStr.replace(/[^0-9]/g, ''), 10) || 0;
                        const next = cur + val;
                        setEditAmountStr(next.toLocaleString('ko-KR'));
                        setEditForm((prev) => ({ ...prev, amount: next }));
                      }}
                      className="px-2.5 py-1 text-xs font-extrabold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg transition active:scale-95 cursor-pointer border border-slate-200"
                    >
                      +{val / 10000}만
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setEditAmountStr('');
                      setEditForm((prev) => ({ ...prev, amount: 0 }));
                    }}
                    className="p-1 text-xs font-bold text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer ml-1"
                    title="금액 초기화"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 3. Description */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  사용처 / 내용 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="예: 마트 장보기, 식사, 주유..."
                  value={editForm.description}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white border-2 border-slate-300 rounded-xl text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 transition"
                  required
                />
              </div>

              {/* 4. Category Selector */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-blue-600" />
                  <span>지출 분류 (카테고리)</span>
                </label>
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-white border-2 border-slate-300 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  {allCategoryNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>

                {/* Popular category chips for instant 1-click select */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {['식비', '카페/간식', '생활용품', '교통비', '쇼핑', '의료/건강', '문화/여가'].map((quickCat) => (
                    <button
                      key={quickCat}
                      type="button"
                      onClick={() => setEditForm((prev) => ({ ...prev, category: quickCat }))}
                      className={`px-2 py-0.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                        editForm.category === quickCat
                          ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {quickCat}
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. Payment Method */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                  <span>결제 수단</span>
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {allPaymentMethodNames.slice(0, 10).map((pm) => {
                    const badge = getPaymentGroupBadge(pm);
                    const isSelected = editForm.paymentMethod === pm;
                    return (
                      <button
                        key={pm}
                        type="button"
                        onClick={() => setEditForm((prev) => ({ ...prev, paymentMethod: pm }))}
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                            : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                        }`}
                        title={badge ? `${badge.group}` : undefined}
                      >
                        {badge && (
                          <span
                            className={`w-3.5 h-3.5 text-[9px] font-black rounded flex items-center justify-center shrink-0 ${
                              isSelected
                                ? 'bg-white/20 text-white border border-white/30'
                                : `${badge.colorClass}`
                            }`}
                          >
                            {badge.char}
                          </span>
                        )}
                        <span>{pm}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 6. Memo */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">메모 (선택사항)</label>
                <input
                  type="text"
                  placeholder="추가 메모 입력"
                  value={editForm.memo || ''}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, memo: e.target.value }))}
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* 7. Budget Type Flags */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editForm.isRecurring}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        isRecurring: e.target.checked,
                        isSpecial: e.target.checked ? false : prev.isSpecial,
                      }))
                    }
                    className="w-4 h-4 text-purple-600 rounded border-slate-300 cursor-pointer"
                  />
                  <span>📌 고정 예산</span>
                </label>
                <label className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editForm.isSpecial}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        isSpecial: e.target.checked,
                        isRecurring: e.target.checked ? false : prev.isRecurring,
                      }))
                    }
                    className="w-4 h-4 text-amber-600 rounded border-slate-300 cursor-pointer"
                  />
                  <span>🛋️ 특별(비정기) 지출</span>
                </label>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-5 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-center gap-3 shrink-0">
              <button
                type="button"
                disabled={isSubmittingEdit}
                onClick={() => setEditingTx(null)}
                className="px-5 py-2.5 bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition cursor-pointer active:scale-95"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isSubmittingEdit}
                onClick={handleSaveEdit}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-sm transition cursor-pointer flex items-center gap-1.5"
              >
                {isSubmittingEdit ? (
                  <span>저장 중...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>저장 완료</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
