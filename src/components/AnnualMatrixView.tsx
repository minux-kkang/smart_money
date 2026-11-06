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
} from 'lucide-react';
import {
  USER_2026_DATA,
  YearDashboardData,
  CategoryMonthlyData,
  generateUserMonthlyTransactions,
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

interface AnnualMatrixViewProps {
  yearData?: YearDashboardData;
  onSelectMonth?: (monthTitle: string) => void;
  transactions?: Transaction[];
  onEditTransaction?: (tx: Transaction) => Promise<void> | void;
  customCategories?: CategoryItem[];
  customPaymentMethods?: PaymentMethodItem[];
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
  if (dateStr) {
    const m1 = dateStr.match(/^(\d{4})[-./](\d{1,2})/);
    if (m1) return parseInt(m1[2], 10);
    const m2 = dateStr.match(/(\d{1,2})월/);
    if (m2) return parseInt(m2[1], 10);
    const m3 = dateStr.match(/^(\d{1,2})[-./]/);
    if (m3) return parseInt(m3[1], 10);
  }
  if (sheetTitle) {
    const s1 = sheetTitle.match(/(\d{1,2})월/);
    if (s1) return parseInt(s1[1], 10);
    const s2 = sheetTitle.match(/(\d{4})[-_](\d{1,2})/);
    if (s2) return parseInt(s2[2], 10);
  }
  return null;
}

export const AnnualMatrixView: React.FC<AnnualMatrixViewProps> = ({
  yearData = USER_2026_DATA,
  onSelectMonth,
  transactions,
  onEditTransaction,
  customCategories,
  customPaymentMethods,
}) => {
  const [sortField, setSortField] = useState<'total' | 'name'>('total');
  const [filterZero, setFilterZero] = useState<boolean>(true);
  const [searchCat, setSearchCat] = useState<string>('');

  // Annual chart view mode: 'category' (stacked colors per category) vs 'spendingType' (고정, 일반, 특별 구분)
  const [chartViewMode, setChartViewMode] = useState<'category' | 'spendingType'>('category');

  // Filter chart by a single selected category (User request: 카테고리 누르면 해당 카테고리만 그래프에 표시)
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);

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

  // Local optimistic transaction overrides for immediate UI reflection in matrix view
  const [localTxOverrides, setLocalTxOverrides] = useState<Transaction[]>([]);

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

  // Map each category to a distinct color
  const categoryColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    yearData.categories.forEach((cat, idx) => {
      map[cat.category] = CATEGORY_COLOR_PALETTE[idx % CATEGORY_COLOR_PALETTE.length];
    });
    return map;
  }, [yearData.categories]);

  // Top categories for chart legend
  const topCategoriesForLegend = useMemo(() => {
    return [...yearData.categories]
      .filter((c) => c.annualTotal > 0)
      .sort((a, b) => b.annualTotal - a.annualTotal)
      .slice(0, 10);
  }, [yearData.categories]);

  // Available categories list
  const allCategoryNames = useMemo(() => {
    const names = new Set<string>();
    yearData.categories.forEach((c) => names.add(c.category));
    if (customCategories) {
      customCategories.forEach((c) => names.add(c.name));
    }
    return Array.from(names);
  }, [yearData.categories, customCategories]);

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
        // Fallback to yearData.categories monthly numbers
        yearData.categories.forEach((cat) => {
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
  }, [months, effectiveTransactions, yearData.categories]);

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
    return yearData.categories.reduce((sum, cat) => sum + (cat.monthly[mIdx] || 0), 0);
  });

  // Filtered categories for the matrix table
  const categories = [...yearData.categories]
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

  const balance = yearData.totalIncome - yearData.totalExpense;
  const savingRate = yearData.totalIncome > 0 ? Math.round((balance / yearData.totalIncome) * 100) : 0;

  // Selected Category Data for single-category trend chart
  const selectedCategoryData = useMemo(() => {
    if (!selectedCategoryFilter) return null;
    const catObj = yearData.categories.find((c) => c.category === selectedCategoryFilter);
    const color = categoryColorMap[selectedCategoryFilter] || '#3B82F6';
    const monthlyAmts = months.map((_, idx) => catObj?.monthly[idx] || 0);
    const total = catObj?.annualTotal || monthlyAmts.reduce((s, a) => s + a, 0);
    const max = Math.max(...monthlyAmts, 1);
    const activeMonthsCount = monthlyAmts.filter((a) => a > 0).length || 1;
    const avg = Math.round(total / (activeMonthsCount || 1));

    return {
      category: selectedCategoryFilter,
      color,
      monthlyAmts,
      total,
      max,
      avg,
      activeMonthsCount,
    };
  }, [selectedCategoryFilter, yearData.categories, categoryColorMap, months]);

  // Matching items for the clicked matrix cell (Category + Month)
  const cellDetailItems = useMemo<MatchedMatrixItem[]>(() => {
    if (!selectedCellDetail) return [];

    const { category, monthNumber } = selectedCellDetail;
    const results: MatchedMatrixItem[] = [];

    // 1. Try matching from effectiveTransactions
    let matchedFromTransactions = false;

    effectiveTransactions.forEach((t) => {
      if (t.type && t.type !== 'expense') return;

      const txMonth = extractMonthNumber(t.date, t.sheetTitle);
      if (txMonth !== monthNumber) return;

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
          if (subCat === category) {
            hasMatchedSub = true;
            matchedFromTransactions = true;
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
      if (t.category === category) {
        matchedFromTransactions = true;
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

    // 2. If no items matched from current transactions dataset, generate from standard monthly sample
    if (results.length === 0 && monthNumber >= 1 && monthNumber <= 12) {
      const sampleTxs: Transaction[] = generateUserMonthlyTransactions(monthNumber - 1);
      sampleTxs.forEach((t) => {
        if (t.type && t.type !== 'expense') return;

        const isRec = Boolean(
          t.isRecurring ||
          t.memo?.includes('[정기예산]') ||
          t.memo?.includes('[고정지출]')
        );
        const isSpec = Boolean(
          t.isSpecial ||
          t.memo?.includes('[특별지출]') ||
          t.memo?.includes('[비정기지출]')
        );

        if (t.subItems && t.subItems.length > 0) {
          let hasMatchedSub = false;
          t.subItems.forEach((sub) => {
            const subCat = sub.category || t.category;
            if (subCat === category) {
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

        if (t.category === category) {
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
    }

    // Sort by date descending
    results.sort((a, b) => (b.tx.date || '').localeCompare(a.tx.date || ''));
    return results;
  }, [selectedCellDetail, effectiveTransactions]);

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

          <div className="text-right text-xs shrink-0">
            <span className="text-[10px] sm:text-[11px] text-slate-400 block font-medium">집계 기준</span>
            <span className="text-xs sm:text-sm font-bold text-slate-200">2026 Dashboard</span>
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
                {yearData.totalIncome.toLocaleString('ko-KR')}원
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
                {yearData.totalExpense.toLocaleString('ko-KR')}원
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
            <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                2026년 월별 {selectedCategoryFilter ? `[${selectedCategoryFilter}] 지출 추이` : '총 지출 추이'} (1월 ~ 12월)
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {selectedCategoryFilter
                ? `현재 '${selectedCategoryFilter}' 카테고리만 필터링하여 월별 지출을 표시하고 있습니다.`
                : '카테고리를 누르면 해당 카테고리만의 월별 추이가 그래프에 표시됩니다.'}
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* View Mode Toggle (Active when no single category filter) */}
            {!selectedCategoryFilter ? (
              <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setChartViewMode('category')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    chartViewMode === 'category'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>카테고리별 보기</span>
                </button>
                <button
                  type="button"
                  onClick={() => setChartViewMode('spendingType')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    chartViewMode === 'spendingType'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>고정·일반·특별 구분</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSelectedCategoryFilter(null)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-300 transition cursor-pointer shadow-2xs"
                title="카테고리 필터 해제하고 전체 지출 보기"
              >
                <X className="w-3.5 h-3.5" />
                <span>전체 지출 보기로 복원</span>
              </button>
            )}

            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200/80 shrink-0">
              {selectedCategoryData ? (
                <>연간 합계: {selectedCategoryData.total.toLocaleString('ko-KR')}원</>
              ) : (
                <>최고 지출: 9월 ({Math.max(...monthlyTotals).toLocaleString('ko-KR')}원)</>
              )}
            </span>
          </div>
        </div>

        {/* Active Category Filter Highlight Banner */}
        {selectedCategoryData && (
          <div className="mb-3 p-2.5 px-3 bg-indigo-50/90 border border-indigo-200 rounded-xl flex items-center justify-between gap-3 text-xs animate-in fade-in duration-150 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-3.5 h-3.5 rounded-full shadow-2xs shrink-0 ring-2 ring-white"
                style={{ backgroundColor: selectedCategoryData.color }}
              />
              <span className="font-black text-indigo-950">
                선택된 카테고리: <strong className="underline underline-offset-2">{selectedCategoryData.category}</strong>
              </span>
              <span className="text-indigo-700 font-semibold text-[11px] hidden sm:inline">
                (연간 총 {selectedCategoryData.total.toLocaleString('ko-KR')}원 • 월평균 약 {selectedCategoryData.avg.toLocaleString('ko-KR')}원)
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedCategoryFilter(null)}
                className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-indigo-100 text-indigo-800 font-bold rounded-lg border border-indigo-300 shadow-2xs transition cursor-pointer text-xs"
              >
                <X className="w-3.5 h-3.5" />
                <span>필터 해제</span>
              </button>
            </div>
          </div>
        )}

        {/* Visual Monthly Bars */}
        <div className="overflow-x-auto pb-2 pt-2 scrollbar-none">
          <div className="min-w-[520px] sm:min-w-0 grid grid-cols-12 gap-1.5 sm:gap-2.5 items-end h-44 sm:h-48">
            {months.map((m, idx) => {
              // 1. Single Category Mode
              if (selectedCategoryData) {
                const catAmt = selectedCategoryData.monthlyAmts[idx] || 0;
                const max = selectedCategoryData.max || 1;
                const heightPercent = catAmt > 0 ? Math.max(Math.round((catAmt / max) * 100), 8) : 0;
                const isMax = catAmt > 0 && catAmt === Math.max(...selectedCategoryData.monthlyAmts);

                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      if (catAmt > 0) {
                        setSelectedCellDetail({
                          category: selectedCategoryData.category,
                          monthNumber: idx + 1,
                          monthName: m,
                          amount: catAmt,
                        });
                      } else if (onSelectMonth) {
                        onSelectMonth(m);
                      }
                    }}
                    className="group flex flex-col items-center h-full justify-end cursor-pointer transition active:scale-95"
                    title={`${m} ${selectedCategoryData.category}: ${catAmt.toLocaleString('ko-KR')}원\n클릭하여 상세 내역 확인 및 수정`}
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
                          style={{
                            height: `${heightPercent}%`,
                            backgroundColor: selectedCategoryData.color,
                          }}
                          className="w-full rounded-t-md transition-all duration-300 shadow-2xs hover:opacity-85"
                        />
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

              const monthCats = yearData.categories
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
                                  setSelectedCategoryFilter(cat.category);
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
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
          <span className="font-bold text-slate-700 text-[11px] shrink-0 flex items-center gap-1">
            <Filter className="w-3 h-3 text-indigo-600" />
            <span>카테고리 필터:</span>
          </span>

          {/* All categories reset pill */}
          <button
            type="button"
            onClick={() => setSelectedCategoryFilter(null)}
            className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition cursor-pointer ${
              selectedCategoryFilter === null
                ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            전체 지출
          </button>

          {topCategoriesForLegend.map((cat) => {
            const isSelected = selectedCategoryFilter === cat.category;
            const color = categoryColorMap[cat.category] || '#94A3B8';

            return (
              <button
                key={cat.category}
                type="button"
                onClick={() => {
                  setSelectedCategoryFilter((prev) => (prev === cat.category ? null : cat.category));
                }}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] transition cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-100 text-indigo-950 font-black border-indigo-400 ring-2 ring-indigo-500/30 shadow-2xs'
                    : 'bg-slate-50 text-slate-700 font-semibold border-slate-200/80 hover:bg-indigo-50 hover:border-indigo-200'
                }`}
                title={`클릭하여 '${cat.category}' 카테고리만 월별 그래프에 보기`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                  style={{ backgroundColor: color }}
                />
                <span>{cat.category}</span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {(cat.annualTotal / 10000).toFixed(0)}만
                </span>
                {isSelected && <Check className="w-3 h-3 text-indigo-600 stroke-[3]" />}
              </button>
            );
          })}

          <span className="text-[11px] text-slate-400 ml-auto hidden md:inline-block">
            💡 카테고리를 클릭하면 해당 카테고리만 그래프에 집중 표시됩니다
          </span>
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
                      onClick={() => {
                        setSelectedCategoryFilter((prev) => (prev === cat.category ? null : cat.category));
                      }}
                      className="flex items-center gap-1.5 text-left hover:text-indigo-600 transition cursor-pointer min-w-0"
                      title={`클릭하여 상단 그래프에서 [${cat.category}] 추이만 보기`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                        style={{ backgroundColor: categoryColorMap[cat.category] || '#3B82F6' }}
                      />
                      <span
                        className={`truncate ${
                          selectedCategoryFilter === cat.category ? 'text-indigo-700 font-black' : ''
                        }`}
                      >
                        {cat.category}
                      </span>
                      {selectedCategoryFilter === cat.category && (
                        <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-1 rounded shrink-0">
                          그래프 보기중
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
                  {yearData.totalExpense.toLocaleString('ko-KR')}원
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
              {cellDetailItems.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-1">
                  <Tag className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-xs font-bold text-slate-600">
                    {selectedCellDetail.monthName} '{selectedCellDetail.category}'의 세부 거래 내역을 불러오는 중입니다.
                  </p>
                  <p className="text-[11px] text-slate-400">
                    상단 가계부 탭에서 해당 월을 열어 최신 내역을 확인할 수도 있습니다.
                  </p>
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
                            {item.tx.paymentMethod && (() => {
                              const badge = getPaymentGroupBadge(item.tx.paymentMethod);
                              if (!badge) return null;
                              return (
                                <span
                                  className={`inline-flex items-center justify-center w-4 h-4 text-[9px] font-black rounded ${badge.badgeBg} ${badge.badgeText} border ${badge.badgeBorder} shrink-0`}
                                  title={`결제수단: ${item.tx.paymentMethod} (${badge.label})`}
                                >
                                  {badge.char}
                                </span>
                              );
                            })()}
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

                        <div className="text-right shrink-0 flex items-center gap-3">
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
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 font-medium">
                💡 목록의 항목이나 [수정] 버튼을 누르면 즉시 편집 창이 열립니다.
              </span>
              <button
                type="button"
                onClick={() => setSelectedCellDetail(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-xs transition cursor-pointer"
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
            <div className="px-5 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                disabled={isSubmittingEdit}
                onClick={() => setEditingTx(null)}
                className="px-4 py-2 bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition cursor-pointer"
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
