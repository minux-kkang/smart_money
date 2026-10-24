import React, { useState, useMemo } from 'react';
import {
  TrendingDown,
  TrendingUp,
  PiggyBank,
  Calendar,
  Search,
  Trash2,
  Edit2,
  Check,
  X,
  Tag,
  ArrowUpDown,
  Download,
  CheckSquare,
  Square,
  MinusSquare,
  AlertTriangle,
  Loader2,
  CreditCard,
  FileSpreadsheet,
  Settings,
  Layers,
  Package,
  ListPlus,
  Plus,
  RotateCcw,
  ArrowLeftRight,
  FileText,
  Sparkles,
  ArrowRight,
  Info,
} from 'lucide-react';
import { Transaction, TransactionType, formatShortDate, SubItem } from '../types/ledger';
import { SubItemModal } from './SubItemModal';
import { saveSubItemsForTransaction, serializeSubItemsToMemo } from '../services/subItemStorage';

interface DashboardProps {
  transactions: Transaction[];
  activeSheetTitle: string;
  sheetTabs?: Array<{ id: number; title: string }>;
  onSelectSheetTab?: (title: string) => void;
  onEditTransaction: (transaction: Transaction) => Promise<void>;
  onDeleteTransaction: (transaction: Transaction) => Promise<void>;
  onBatchDeleteTransactions?: (transactions: Transaction[]) => Promise<void>;
  isRealGoogleConnected: boolean;
  availableCategories?: string[];
  availablePaymentMethods?: string[];
  onOpenCategoryManager?: () => void;
}

const CATEGORY_COLORS = [
  '#3B82F6', // Blue
  '#EF4444', // Red
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#6366F1', // Indigo
  '#F97316', // Orange
  '#14B8A6', // Teal
  '#64748B', // Slate
];

export const Dashboard: React.FC<DashboardProps> = ({
  transactions,
  activeSheetTitle,
  sheetTabs = [],
  onSelectSheetTab,
  onEditTransaction,
  onDeleteTransaction,
  onBatchDeleteTransactions,
  isRealGoogleConnected,
  availableCategories = [],
  availablePaymentMethods = [],
  onOpenCategoryManager,
}) => {
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'all' | TransactionType>('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  // Default to current month (e.g. 10월) as requested ("월별 상세는 올해*이번달 을 기본으로 해줘")
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>(() => {
    const match = activeSheetTitle?.match(/^(\d{1,2})월$/);
    if (match) return match[1];
    return String(new Date().getMonth() + 1);
  });
  const [sortField, setSortField] = useState<'date' | 'amount'>('date');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Sync month filter when activeSheetTitle changes to a specific month
  React.useEffect(() => {
    const match = activeSheetTitle?.match(/^(\d{1,2})월$/);
    if (match) {
      setSelectedMonthFilter(match[1]);
    }
  }, [activeSheetTitle]);

  // Multi-select row selection
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Long-press detection timer and flag
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressTriggeredRef = React.useRef(false);

  const startLongPress = (id: string) => {
    isLongPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      setIsSelectionMode(true);
      setSelectedIds(new Set([id]));
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(40);
      }
    }, 450);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleRowClick = (t: Transaction) => {
    if (isLongPressTriggeredRef.current) {
      isLongPressTriggeredRef.current = false;
      return;
    }
    if (isSelectionMode) {
      handleToggleSelectOne(t.id);
    } else {
      handleOpenEditModal(t);
    }
  };

  // Deletion Modal State
  const [deleteModalTx, setDeleteModalTx] = useState<Transaction | null>(null);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);
  const [isProcessingDelete, setIsProcessingDelete] = useState(false);

  // Edit Modal State (Synchronized with ExpenseInputForm)
  const [editModalTx, setEditModalTx] = useState<Transaction | null>(null);
  const [editForm, setEditForm] = useState<Partial<Transaction>>({});
  const [editAmountStr, setEditAmountStr] = useState<string>('');
  const [editSubItems, setEditSubItems] = useState<SubItem[]>([]);
  const [showEditSubItemEntry, setShowEditSubItemEntry] = useState<boolean>(false);
  const [customCategoryInput, setCustomCategoryInput] = useState<boolean>(false);
  const [newCategoryText, setNewCategoryText] = useState<string>('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Sub-Item Breakdown Modal State (Coupang, Mart, etc.)
  const [subItemModalTx, setSubItemModalTx] = useState<Transaction | null>(null);

  const handleSaveSubItems = async (updatedTx: Transaction) => {
    saveSubItemsForTransaction(updatedTx, updatedTx.subItems || []);
    await onEditTransaction(updatedTx);
    if (editModalTx && editModalTx.id === updatedTx.id) {
      setEditModalTx(updatedTx);
      setEditForm((prev) => ({
        ...prev,
        amount: updatedTx.amount,
        memo: updatedTx.memo,
        subItems: updatedTx.subItems,
      }));
      setEditAmountStr(updatedTx.amount.toLocaleString('ko-KR'));
      setEditSubItems(updatedTx.subItems ? updatedTx.subItems.map((s) => ({ ...s })) : []);
    }
    setSubItemModalTx(null);
  };

  // Metrics Calculation
  const metrics = useMemo(() => {
    let totalExpense = 0;
    let totalIncome = 0;

    transactions.forEach((t) => {
      if (t.type === 'expense') {
        totalExpense += t.amount;
      } else if (t.type === 'income') {
        totalIncome += t.amount;
      }
    });

    const balance = totalIncome - totalExpense;
    const savingRate = totalIncome > 0 ? Math.max(0, Math.round((balance / totalIncome) * 100)) : 0;

    const uniqueDays = new Set(transactions.map((t) => t.date)).size;
    const daysInCount = Math.max(uniqueDays, 1);
    const dailyAverageExpense = Math.round(totalExpense / daysInCount);

    return {
      totalExpense,
      totalIncome,
      balance,
      savingRate,
      dailyAverageExpense,
      count: transactions.length,
    };
  }, [transactions]);

  // Category breakdown
  const categoryStats = useMemo(() => {
    const map: Record<string, number> = {};
    let totalExpense = 0;

    transactions.forEach((t) => {
      if (t.type === 'expense') {
        const cat = t.category || '기타';
        map[cat] = (map[cat] || 0) + t.amount;
        totalExpense += t.amount;
      }
    });

    const sorted = Object.entries(map)
      .map(([name, amount], index) => ({
        name,
        amount,
        percentage: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      list: sorted,
      totalExpense,
    };
  }, [transactions]);

  // Unique categories for filter dropdown
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => {
      if (t.category) set.add(t.category);
    });
    availableCategories.forEach((c) => {
      if (c) set.add(c);
    });
    return Array.from(set).filter(Boolean);
  }, [transactions, availableCategories]);

  // Available Payment Methods
  const allPaymentMethods = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => {
      if (t.paymentMethod) set.add(t.paymentMethod);
    });
    availablePaymentMethods.forEach((p) => {
      if (p) set.add(p);
    });
    if (set.size === 0) {
      ['신용카드', '체크카드', '현금', '계좌이체', '네이버페이', '카카오페이'].forEach((p) =>
        set.add(p)
      );
    }
    return Array.from(set).filter(Boolean);
  }, [transactions, availablePaymentMethods]);

  // Filtered & Sorted Transactions
  const filteredTransactions = useMemo(() => {
    return transactions
      .filter((t) => {
        if (selectedTypeFilter !== 'all' && t.type !== selectedTypeFilter) return false;
        if (selectedCategoryFilter !== 'all' && t.category !== selectedCategoryFilter) return false;

        // Month filter
        if (selectedMonthFilter !== 'all') {
          const mNum = parseInt(selectedMonthFilter, 10);
          const mStr = String(mNum).padStart(2, '0');

          const matchDate =
            t.date.includes(`-${mStr}-`) ||
            t.date.includes(`.${mStr}.`) ||
            t.date.includes(`/${mStr}/`) ||
            t.date.startsWith(`${mStr}.`) ||
            t.date.startsWith(`${mStr}-`) ||
            t.date.startsWith(`${mStr}/`);

          if (matchDate) {
            // Strictly matched date
          } else {
            // If date contains an explicit different month, reject it
            const explicitMonth = t.date.match(/[-.\/](\d{1,2})[-.\/]/);
            if (explicitMonth && parseInt(explicitMonth[1], 10) !== mNum) {
              return false;
            }
            if (!t.sheetTitle?.includes(`${mNum}월`)) {
              return false;
            }
          }
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchDesc = t.description?.toLowerCase().includes(q);
          const matchCat = t.category?.toLowerCase().includes(q);
          const matchMemo = t.memo?.toLowerCase().includes(q);
          const matchPay = t.paymentMethod?.toLowerCase().includes(q);
          if (!matchDesc && !matchCat && !matchMemo && !matchPay) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortField === 'date') {
          return sortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
        } else {
          return sortAsc ? a.amount - b.amount : b.amount - a.amount;
        }
      });
  }, [
    transactions,
    selectedTypeFilter,
    selectedCategoryFilter,
    selectedMonthFilter,
    searchQuery,
    sortField,
    sortAsc,
  ]);

  // Checkbox selection helpers
  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTransactions.map((t) => t.id)));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Open Edit Modal with full synchronization
  const handleOpenEditModal = (t: Transaction) => {
    setEditModalTx(t);
    setEditForm({
      date: t.date,
      type: t.type,
      category: t.category,
      description: t.description,
      amount: t.amount,
      paymentMethod: t.paymentMethod,
      memo: t.memo,
    });
    setEditAmountStr(t.amount > 0 ? t.amount.toLocaleString('ko-KR') : '');
    setEditSubItems(t.subItems ? t.subItems.map((s) => ({ ...s })) : []);
    setShowEditSubItemEntry(!!(t.subItems && t.subItems.length > 0));
    setCustomCategoryInput(false);
    setNewCategoryText('');
  };

  const handleEditAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    if (!raw) {
      setEditAmountStr('');
      setEditForm((prev) => ({ ...prev, amount: 0 }));
      return;
    }
    const num = parseInt(raw, 10);
    setEditAmountStr(num.toLocaleString('ko-KR'));
    setEditForm((prev) => ({ ...prev, amount: num }));
  };

  const handleEditAddAmount = (addVal: number) => {
    const current = Number(editForm.amount) || 0;
    const next = current + addVal;
    setEditAmountStr(next.toLocaleString('ko-KR'));
    setEditForm((prev) => ({ ...prev, amount: next }));
  };

  const handleSetEditQuickDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    const dateStr = d.toISOString().slice(0, 10);
    setEditForm((prev) => ({ ...prev, date: dateStr }));
  };

  const handleAddEditSubItem = () => {
    setEditSubItems((prev) => [
      ...prev,
      {
        id: `edit-sub-${Date.now()}-${prev.length}`,
        name: '',
        amount: 0,
        category: editForm.category || '식비',
      },
    ]);
  };

  const handleUpdateEditSubItem = (id: string, field: keyof SubItem, value: any) => {
    setEditSubItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleRemoveEditSubItem = (id: string) => {
    setEditSubItems((prev) => prev.filter((item) => item.id !== id));
  };

  const editSubItemsSum = useMemo(() => {
    return editSubItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
  }, [editSubItems]);

  const handleSyncEditAmountWithSubItems = () => {
    if (editSubItemsSum > 0) {
      setEditAmountStr(editSubItemsSum.toLocaleString('ko-KR'));
      setEditForm((prev) => ({ ...prev, amount: editSubItemsSum }));
    }
  };

  const applyEditPreset = (presetType: 'coupang' | 'mart') => {
    if (presetType === 'coupang') {
      const items = [
        { id: `edit-p1`, name: '신선란 30구', amount: 8900, category: '식비' },
        { id: `edit-p2`, name: '서울우유 2.3L', amount: 6450, category: '식비' },
        { id: `edit-p3`, name: '롤화장지 30롤', amount: 19800, category: '생활용품' },
      ];
      setEditSubItems(items);
      const total = items.reduce((a, b) => a + b.amount, 0);
      setEditAmountStr(total.toLocaleString('ko-KR'));
      setEditForm((prev) => ({ ...prev, amount: total }));
    } else {
      const items = [
        { id: `edit-p1`, name: '소고기 등심 300g', amount: 28000, category: '식비' },
        { id: `edit-p2`, name: '양파 & 대파', amount: 6500, category: '식비' },
        { id: `edit-p3`, name: '주방세제 리필', amount: 7500, category: '생활용품' },
      ];
      setEditSubItems(items);
      const total = items.reduce((a, b) => a + b.amount, 0);
      setEditAmountStr(total.toLocaleString('ko-KR'));
      setEditForm((prev) => ({ ...prev, amount: total }));
    }
  };

  // Submit Edit to Google Sheets
  const handleSaveEdit = async () => {
    if (!editModalTx) return;
    const numAmount =
      typeof editForm.amount === 'number' && editForm.amount > 0
        ? editForm.amount
        : parseInt(editAmountStr.replace(/[^0-9]/g, ''), 10) || 0;

    if (!editForm.description?.trim()) {
      alert('내용/사용처를 입력해 주세요.');
      return;
    }
    if (!numAmount || numAmount <= 0) {
      alert('금액을 올바르게 입력해 주세요.');
      return;
    }

    setIsSubmittingEdit(true);
    try {
      const validSubItems = editSubItems
        .filter((item) => item.name.trim().length > 0 || item.amount > 0)
        .map((item) => ({
          ...item,
          name: item.name.trim() || '품목',
          amount: Math.max(0, Number(item.amount) || 0),
          category: item.category || editForm.category || '식비',
        }));

      // Extract existing user memo without old serialized sub-items
      const cleanBaseMemo = (editForm.memo || '')
        .replace(/\[세부품목:[\s\S]*?\]/g, '')
        .trim();

      const finalMemo =
        validSubItems.length > 0
          ? serializeSubItemsToMemo(cleanBaseMemo, validSubItems)
          : cleanBaseMemo;

      const updatedTx: Transaction = {
        ...editModalTx,
        date: editForm.date || editModalTx.date,
        type: editForm.type || editModalTx.type,
        category: editForm.category || editModalTx.category,
        description: editForm.description.trim(),
        amount: numAmount,
        paymentMethod: editForm.paymentMethod || '',
        memo: finalMemo,
        subItems: validSubItems.length > 0 ? validSubItems : undefined,
      };

      saveSubItemsForTransaction(updatedTx, validSubItems);
      await onEditTransaction(updatedTx);
      setEditModalTx(null);
    } catch (err: any) {
      console.error('Save edit error:', err);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Direct Single Delete from Google Sheet
  const handleConfirmSingleDelete = async () => {
    if (!deleteModalTx) return;
    setIsProcessingDelete(true);
    try {
      await onDeleteTransaction(deleteModalTx);
      // Remove from selected set if selected
      if (selectedIds.has(deleteModalTx.id)) {
        const next = new Set(selectedIds);
        next.delete(deleteModalTx.id);
        setSelectedIds(next);
      }
      setDeleteModalTx(null);
    } catch (err: any) {
      console.error('Delete error:', err);
    } finally {
      setIsProcessingDelete(false);
    }
  };

  // Direct Batch Delete from Google Sheet
  const handleConfirmBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsProcessingDelete(true);
    try {
      const targets = transactions.filter((t) => selectedIds.has(t.id));
      if (onBatchDeleteTransactions) {
        await onBatchDeleteTransactions(targets);
      } else {
        for (const t of targets) {
          await onDeleteTransaction(t);
        }
      }
      setSelectedIds(new Set());
      setIsBatchDeleteModalOpen(false);
    } catch (err: any) {
      console.error('Batch delete error:', err);
    } finally {
      setIsProcessingDelete(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['날짜', '구분', '분류', '내용/사용처', '금액', '결제수단', '메모'];
    const rows = filteredTransactions.map((t) => [
      t.date,
      t.type === 'expense' ? '지출' : t.type === 'income' ? '수입' : '이체',
      `"${(t.category || '').replace(/"/g, '""')}"`,
      `"${(t.description || '').replace(/"/g, '""')}"`,
      t.amount,
      `"${(t.paymentMethod || '').replace(/"/g, '""')}"`,
      `"${(t.memo || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `가계부_${activeSheetTitle}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isAllSelected =
    filteredTransactions.length > 0 && selectedIds.size === filteredTransactions.length;
  const isPartiallySelected =
    selectedIds.size > 0 && selectedIds.size < filteredTransactions.length;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 1. Monthly Summary (Consolidated, Zero-Waste High-Density Layout) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Primary Row: Balance & Key Financial Metrics */}
        <div className="p-3.5 sm:p-4 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-slate-300 font-bold">{activeSheetTitle} 잔액</span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-white/10 text-slate-300">
                수입 - 지출
              </span>
              <span className="text-[10px] font-semibold text-slate-400">
                ({metrics.count}건 기록)
              </span>
            </div>
            <div
              className={`text-xl sm:text-2xl font-black mt-0.5 tracking-tight ${
                metrics.balance >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {metrics.balance >= 0 ? '+' : ''}
              {metrics.balance.toLocaleString('ko-KR')}
              <span className="text-xs font-normal text-slate-300 ml-1">원</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 text-right shrink-0">
            <div className="hidden xs:block">
              <span className="text-[10px] sm:text-[11px] text-slate-400 block font-medium">일 평균 지출</span>
              <span className="text-xs sm:text-sm font-bold text-slate-200">
                {metrics.dailyAverageExpense.toLocaleString('ko-KR')}원
              </span>
            </div>
            <div className="pl-2 border-l border-white/15">
              <span className="text-[10px] sm:text-[11px] text-slate-400 block font-medium">저축/잉여율</span>
              <span className="text-xs sm:text-sm font-black text-blue-300">
                {metrics.savingRate}%
              </span>
            </div>
          </div>
        </div>

        {/* 2 Key Pillars: 총 지출 & 총 수입 */}
        <div className="grid grid-cols-2 divide-x divide-slate-150 bg-slate-50/80 py-2.5 px-1 sm:px-3">
          {/* 지출 */}
          <div className="px-2.5 sm:px-4 py-1 flex items-center justify-between min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                <span className="text-[11px] sm:text-xs font-bold text-slate-500 truncate">
                  {activeSheetTitle} 총 지출
                </span>
              </div>
              <p className="text-sm sm:text-lg font-black text-rose-600 truncate mt-0.5">
                {metrics.totalExpense.toLocaleString('ko-KR')}원
              </p>
            </div>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 ml-1.5 shadow-2xs">
              <TrendingDown className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>

          {/* 수입 */}
          <div className="px-2.5 sm:px-4 py-1 flex items-center justify-between min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-[11px] sm:text-xs font-bold text-slate-500 truncate">
                  {activeSheetTitle} 총 수입
                </span>
              </div>
              <p className="text-sm sm:text-lg font-black text-emerald-600 truncate mt-0.5">
                {metrics.totalIncome.toLocaleString('ko-KR')}원
              </p>
            </div>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 ml-1.5 shadow-2xs">
              <TrendingUp className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Visual Spending Breakdown & Transactions Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category Breakdown Card */}
        <div className="lg:col-span-1 p-5 sm:p-6 bg-white rounded-2xl border-2 border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Tag className="w-4 h-4 text-blue-600" />
              <span>카테고리별 지출 순위</span>
            </h3>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-500">
                총 {categoryStats.list.length}개 항목
              </span>
              {onOpenCategoryManager && (
                <button
                  type="button"
                  onClick={onOpenCategoryManager}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition cursor-pointer"
                  title="카테고리 및 결제수단 설정"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Simple Clean Stacked Progress Bar */}
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex my-4">
            {categoryStats.list.slice(0, 8).map((cat) => (
              <div
                key={cat.name}
                style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }}
                className="h-full hover:opacity-80 transition cursor-pointer"
                title={`${cat.name}: ${cat.amount.toLocaleString('ko-KR')}원 (${cat.percentage}%)`}
              />
            ))}
          </div>

          {/* Category List */}
          <div className="flex-1 overflow-y-auto max-h-[380px] space-y-2.5 pr-1">
            {categoryStats.list.length === 0 && (
              <p className="text-xs text-slate-400 py-8 text-center font-medium">
                기록된 지출 내역이 없습니다.
              </p>
            )}
            {categoryStats.list.map((cat) => (
              <div
                key={cat.name}
                className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="font-bold text-slate-800 truncate">{cat.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-black text-slate-900">
                    {cat.amount.toLocaleString('ko-KR')}원
                  </span>
                  <span className="text-[11px] font-bold text-slate-500 w-8 text-right">
                    {cat.percentage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Transactions Table Card */}
        <div className="lg:col-span-2 p-5 sm:p-6 bg-white rounded-2xl border-2 border-slate-200 shadow-sm flex flex-col relative">
          {/* Table Header and Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <h3 className="text-base font-black text-slate-900 whitespace-nowrap">가계부 내역 상세</h3>
                <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap shrink-0">
                  {filteredTransactions.length}건
                </span>
                {isRealGoogleConnected && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1 whitespace-nowrap shrink-0">
                    <FileSpreadsheet className="w-3 h-3" />
                    <span>Google 시트 수정/삭제 즉시 반영</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                수정 및 삭제 시 Google 스프레드시트의 실제 데이터가 안전하고 정확하게 즉시 갱신됩니다.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {sheetTabs.length > 1 && onSelectSheetTab && (
                <div className="flex items-center gap-1.5 text-xs whitespace-nowrap shrink-0">
                  <span className="font-bold text-slate-500">시트 탭:</span>
                  <select
                    value={activeSheetTitle}
                    onChange={(e) => onSelectSheetTab(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border-2 border-blue-200 rounded-xl font-black text-blue-700 shadow-xs cursor-pointer hover:border-blue-400 whitespace-nowrap"
                  >
                    {sheetTabs.map((tab) => (
                      <option key={tab.id} value={tab.title}>
                        {tab.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={handleExportCSV}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border-2 border-slate-200 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                title="CSV로 내보내기"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span>CSV 다운</span>
              </button>
            </div>
          </div>

          {/* Informational Guidance for Sheet Data and Rows */}
          {!isRealGoogleConnected ? (
            <div className="mt-3 p-3 bg-blue-50/90 border border-blue-200 rounded-xl flex items-center justify-between gap-2 text-xs text-blue-900 whitespace-nowrap overflow-x-auto scrollbar-none">
              <div className="flex items-center gap-2 shrink-0">
                <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  <strong>[{activeSheetTitle}]</strong> 상세 거래 내역 (총 <strong>{filteredTransactions.length}건</strong> 표시 중 / 샘플 모드)
                </span>
              </div>
              <span className="text-[11px] font-semibold text-blue-700 bg-white px-2 py-0.5 rounded-lg border border-blue-200 shrink-0">
                Google 계정 연동 시 실제 시트 원본 로드
              </span>
            </div>
          ) : (
            <div className="mt-3 p-3 bg-emerald-50/90 border border-emerald-200 rounded-xl flex items-center justify-between gap-2 text-xs text-emerald-900 whitespace-nowrap overflow-x-auto scrollbar-none">
              <div className="flex items-center gap-2 shrink-0">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Google 시트 <strong>[{activeSheetTitle}]</strong> 탭 실시간 연동 (총 <strong>{filteredTransactions.length}건</strong> 로드됨)
                </span>
              </div>
              <span className="text-[11px] font-bold text-emerald-700 bg-white px-2.5 py-0.5 rounded-lg border border-emerald-200 shrink-0">
                수정/삭제 즉시 시트 반영
              </span>
            </div>
          )}

          {/* Month Quick Filter Pills Bar */}
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[11px] font-bold text-slate-500 shrink-0 mr-1">월 선택:</span>
            <button
              onClick={() => setSelectedMonthFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 ${
                selectedMonthFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              전체 ({transactions.length})
            </button>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const mStr = String(m).padStart(2, '0');
              const count = transactions.filter(
                (t) =>
                  t.date.includes(`-${mStr}-`) ||
                  t.date.includes(`.${mStr}.`) ||
                  t.date.startsWith(`${mStr}.`) ||
                  t.date.startsWith(`${mStr}-`) ||
                  t.sheetTitle?.includes(`${m}월`)
              ).length;
              return (
                <button
                  key={m}
                  onClick={() => {
                    setSelectedMonthFilter(String(m));
                    if (onSelectSheetTab) {
                      onSelectSheetTab(`${m}월`);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 ${
                    selectedMonthFilter === String(m)
                      ? 'bg-blue-600 text-white shadow-xs'
                      : count > 0
                      ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                      : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                  }`}
                >
                  {m}월{count > 0 ? ` (${count})` : ''}
                </button>
              );
            })}
          </div>

          {/* Search & Filter Controls */}
          <div className="py-3 flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="내용, 사용처, 분류, 메모 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border-2 border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
              />
            </div>

            {/* Type Filter */}
            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value as any)}
              className="px-2.5 py-1.5 bg-white border-2 border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer whitespace-nowrap shrink-0"
            >
              <option value="all">전체 구분</option>
              <option value="expense">지출만</option>
              <option value="income">수입만</option>
              <option value="transfer">이체만</option>
            </select>

            {/* Category Filter */}
            {allCategories.length > 0 && (
              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-white border-2 border-slate-200 rounded-xl text-xs font-bold text-slate-700 max-w-[130px] truncate cursor-pointer whitespace-nowrap shrink-0"
              >
                <option value="all">모든 분류</option>
                {allCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            )}

            {/* Sort Order */}
            <button
              onClick={() => {
                if (sortField === 'date') {
                  setSortAsc(!sortAsc);
                } else {
                  setSortField('date');
                  setSortAsc(false);
                }
              }}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowUpDown className="w-3 h-3 text-slate-500" />
              <span>
                {sortField === 'date' ? (sortAsc ? '오래된순' : '최신순') : '날짜순'}
              </span>
            </button>

            {/* Selection Mode Button */}
            <button
              onClick={() => {
                if (isSelectionMode) {
                  setIsSelectionMode(false);
                  setSelectedIds(new Set());
                } else {
                  setIsSelectionMode(true);
                }
              }}
              className={`px-2.5 py-1.5 border-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap shrink-0 ${
                isSelectionMode
                  ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
              }`}
              title="다중 선택 모드 (또는 내역을 길게 누르세요)"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>{isSelectionMode ? '선택 취소' : '선택'}</span>
            </button>
          </div>

          {/* User Guide Hint */}
          {!isSelectionMode && filteredTransactions.length > 0 && (
            <div className="pb-1 text-[11px] text-slate-600 flex items-center justify-between whitespace-nowrap overflow-x-auto scrollbar-none">
              <span className="whitespace-nowrap">💡 내역을 <strong>길게 누르면</strong> 다중 선택 모드가 켜집니다.</span>
              <span className="hidden sm:inline whitespace-nowrap">내역을 클릭하면 바로 수정할 수 있습니다.</span>
            </div>
          )}

          {/* Transactions List Table */}
          <div className="flex-1 overflow-x-auto min-h-[320px]">
            {filteredTransactions.length === 0 ? (
              <div className="py-12 px-4 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 my-4 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 mx-auto flex items-center justify-center">
                  <Calendar className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-800">
                    [{activeSheetTitle}] 시트에 표시할 지출 내역이 없습니다
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                    {/분류관리|기준목록|설정|카테고리/i.test(activeSheetTitle)
                      ? '현재 탭은 가계부 분류/기준 설정용 시트입니다. 실제 지출 거래 내역을 보시려면 아래 시트 탭 목록에서 지출내역 또는 해당 월 시트를 선택해 주세요.'
                      : /dashboard|대시보드|요약/i.test(activeSheetTitle)
                      ? '현재 탭은 연간 요약 매트릭스 대시보드입니다. 상단 탭에서 [2026 연간 요약 매트릭스]를 누르시면 전체 요약표를 보실 수 있습니다.'
                      : '아직 기록된 지출이나 수입 내역이 없거나, 다른 월/시트에 데이터가 보관되어 있을 수 있습니다.'}
                  </p>
                </div>

                {sheetTabs.length > 1 && onSelectSheetTab && (
                  <div className="pt-2">
                    <p className="text-[11px] font-bold text-slate-400 mb-2">다른 시트 탭으로 바로 이동:</p>
                    <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-lg mx-auto">
                      {sheetTabs.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => onSelectSheetTab(t.title)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                            t.title === activeSheetTitle
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-xs'
                          }`}
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{t.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <table className="w-full table-fixed text-left text-xs border-collapse">
                <colgroup>
                  {isSelectionMode && <col className="w-8 sm:w-9" />}
                  <col className="w-16 sm:w-20" />
                  <col className="hidden sm:table-column sm:w-24 md:w-28" />
                  <col className="w-auto" />
                  <col className="w-24 sm:w-28 md:w-32" />
                  <col className="hidden md:table-column md:w-24 lg:w-28" />
                  <col className="w-14 sm:w-16" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-y-2 border-slate-200 font-black">
                    {/* Checkbox column - ONLY displayed when in selection mode */}
                    {isSelectionMode && (
                      <th className="py-2 px-1 text-center w-8 sm:w-9 animate-in fade-in duration-150">
                        <button
                          onClick={handleToggleSelectAll}
                          className="p-1 hover:text-blue-600 cursor-pointer"
                          title={isAllSelected ? '전체 선택 해제' : '전체 선택'}
                        >
                          {isAllSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : isPartiallySelected ? (
                            <MinusSquare className="w-4 h-4 text-blue-500" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                      </th>
                    )}
                    <th className="py-2 sm:py-2.5 px-2 sm:px-3 whitespace-nowrap">날짜</th>
                    <th className="py-2 sm:py-2.5 px-2 whitespace-nowrap hidden sm:table-cell">분류</th>
                    <th className="py-2 sm:py-2.5 px-2 sm:px-3 whitespace-nowrap">내용 / 사용처</th>
                    <th className="py-2 sm:py-2.5 px-2 sm:px-3 text-right whitespace-nowrap">금액</th>
                    <th className="py-2 sm:py-2.5 px-2 whitespace-nowrap hidden md:table-cell">결제수단</th>
                    <th className="py-2 sm:py-2.5 px-1 sm:px-2 text-center whitespace-nowrap">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredTransactions.map((t) => {
                    const isSelected = selectedIds.has(t.id);

                    return (
                      <tr
                        key={t.id}
                        onMouseDown={() => startLongPress(t.id)}
                        onMouseUp={cancelLongPress}
                        onMouseLeave={cancelLongPress}
                        onTouchStart={() => startLongPress(t.id)}
                        onTouchEnd={cancelLongPress}
                        onTouchMove={cancelLongPress}
                        onClick={() => handleRowClick(t)}
                        className={`hover:bg-blue-50/30 transition cursor-pointer select-none group ${
                          isSelected ? 'bg-blue-50/80 border-l-4 border-blue-600' : ''
                        }`}
                      >
                        {/* Checkbox cell - only in selection mode */}
                        {isSelectionMode && (
                          <td className="py-2 sm:py-2.5 px-1 text-center w-8 sm:w-9">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSelectOne(t.id);
                              }}
                              className="p-1 hover:text-blue-600 cursor-pointer"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-blue-600" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 group-hover:text-slate-500" />
                              )}
                            </button>
                          </td>
                        )}

                        {/* 날짜 (Date) */}
                        <td
                          className="py-2 sm:py-2.5 px-2 sm:px-3 text-slate-700 font-mono text-[11px] sm:text-xs whitespace-nowrap font-bold"
                          title={`전체 일자: ${t.date}`}
                        >
                          {formatShortDate(t.date)}
                        </td>

                        {/* 분류 (Category) - visible on sm+ screens */}
                        <td className="py-2 sm:py-2.5 px-2 whitespace-nowrap hidden sm:table-cell">
                          <span className="font-bold text-slate-700 text-xs px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 block truncate max-w-full whitespace-nowrap">
                            {t.category}
                          </span>
                        </td>

                        {/* 내용 / 사용처 (Description) & 세부 품목 묶음 박스 */}
                        <td className="py-2.5 px-2 sm:px-3 min-w-0 align-top">
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
                              <span
                                className="font-bold sm:font-black text-slate-900 text-xs sm:text-sm truncate min-w-0 flex-1 whitespace-nowrap"
                                title={t.description}
                              >
                                {t.description}
                              </span>
                              {/* On mobile, show category tag right next to description */}
                              <span className="sm:hidden text-[9px] font-bold text-slate-500 px-1 py-0.2 rounded bg-slate-100 border border-slate-200 shrink-0 whitespace-nowrap">
                                {t.category}
                              </span>
                              {t.type === 'income' && (
                                <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200 shrink-0 whitespace-nowrap">
                                  수입
                                </span>
                              )}
                            </div>

                            {(t.memo || t.paymentMethod) && (
                              <span className="text-[10px] text-slate-400 truncate max-w-full mt-0.5 whitespace-nowrap block">
                                {[t.paymentMethod, t.memo].filter(Boolean).join(' · ')}
                              </span>
                            )}

                            {/* 세부내역 묶음 박스 (Sub-items Enclosed Box - 세부 품목이 있는 경우에만 깔끔하게 노출) */}
                            {t.subItems && t.subItems.length > 0 && (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenEditModal(t);
                                }}
                                className="mt-2 p-2 sm:p-2.5 bg-slate-50/90 hover:bg-blue-50/50 border border-slate-200 hover:border-blue-300 rounded-xl space-y-1 transition cursor-pointer shadow-xs group/box"
                                title="클릭하여 항목 수정 화면 열기"
                              >
                                <div className="flex items-center justify-between text-[11px] font-black text-slate-700 pb-1 border-b border-slate-200/80 whitespace-nowrap">
                                  <span className="flex items-center gap-1.5 text-blue-700 whitespace-nowrap shrink-0">
                                    <Package className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                    <span className="whitespace-nowrap">세부 품목 ({t.subItems.length}개)</span>
                                  </span>
                                  <span className="text-[10px] text-slate-400 group-hover/box:text-blue-600 flex items-center gap-1 font-bold whitespace-nowrap shrink-0">
                                    <Edit2 className="w-2.5 h-2.5" />
                                    <span>수정</span>
                                  </span>
                                </div>

                                <div className="space-y-1">
                                  {t.subItems.map((sub, sIdx) => (
                                    <div
                                      key={sub.id || sIdx}
                                      className="flex items-center justify-between text-xs py-0.5 leading-tight whitespace-nowrap gap-2"
                                    >
                                      <div className="flex items-center gap-1.5 min-w-0 pr-1 truncate whitespace-nowrap">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                                        <span className="font-semibold text-slate-800 truncate text-[11px] sm:text-xs whitespace-nowrap">
                                          {sub.name}
                                        </span>
                                        {sub.category && sub.category !== t.category && (
                                          <span className="text-[9px] font-bold text-slate-500 bg-white border border-slate-200 px-1 py-0.1 rounded shrink-0 whitespace-nowrap">
                                            {sub.category}
                                          </span>
                                        )}
                                      </div>
                                      <span className="font-black text-slate-700 font-mono text-[11px] sm:text-xs shrink-0 whitespace-nowrap">
                                        {sub.amount.toLocaleString('ko-KR')}원
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 금액 (Amount) */}
                        <td className="py-2.5 px-2 sm:px-3 text-right whitespace-nowrap align-top">
                          <span
                            className={`font-black text-xs sm:text-sm ${
                              t.type === 'income'
                                ? 'text-emerald-600'
                                : t.type === 'transfer'
                                ? 'text-sky-600'
                                : 'text-slate-900'
                            }`}
                          >
                            {t.type === 'income' ? '+' : t.type === 'transfer' ? '' : '-'}
                            {t.amount.toLocaleString('ko-KR')}원
                          </span>
                        </td>

                        {/* 결제수단 (Payment Method) - md+ screens */}
                        <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap text-[11px] font-medium hidden md:table-cell align-top">
                          {t.paymentMethod || '-'}
                        </td>

                        {/* 관리 (Actions) - 깔끔하게 수정 및 삭제만 유지 */}
                        <td className="py-2.5 px-1 sm:px-2 text-center whitespace-nowrap align-top">
                          <div
                            className="flex items-center justify-center gap-0.5 sm:gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => handleOpenEditModal(t)}
                              className="p-1 sm:p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                              title="항목 수정"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteModalTx(t)}
                              className="p-1 sm:p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="Google 시트에서 삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Floating Batch Action Bar when Selection Mode is Active or rows are selected */}
          {(isSelectionMode || selectedIds.size > 0) && (
            <div className="sticky bottom-3 left-0 right-0 mt-4 p-3 bg-slate-900 text-white rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2 duration-150 z-20 border border-slate-700">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-xs font-bold text-slate-200">
                  선택 모드: <strong className="text-white text-sm font-black">{selectedIds.size}건</strong> 선택됨
                </span>
              </div>

              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <button
                    onClick={() => setIsBatchDeleteModalOpen(true)}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition active:scale-95"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>선택 삭제</span>
                  </button>
                )}

                <button
                  onClick={handleToggleSelectAll}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
                >
                  {isAllSelected ? '전체 해제' : '전체 선택'}
                </button>

                <button
                  onClick={() => {
                    setIsSelectionMode(false);
                    setSelectedIds(new Set());
                  }}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
                >
                  선택 모드 종료
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Single Transaction Direct Google Sheet Delete Confirmation Modal */}
      {deleteModalTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border-2 border-rose-200 overflow-hidden">
            <div className="p-5 border-b border-rose-100 flex items-center justify-between bg-rose-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-rose-950">Google 시트에서 내역 삭제</h4>
                  <p className="text-xs text-rose-700 font-medium">
                    Google 스프레드시트의 실제 해당 행을 삭제합니다.
                  </p>
                </div>
              </div>
              <button
                disabled={isProcessingDelete}
                onClick={() => setDeleteModalTx(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target Item Summary */}
            <div className="p-5 bg-white text-xs space-y-2">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 font-medium">
                <div className="flex justify-between">
                  <span className="text-slate-500">거래 일자:</span>
                  <span className="font-bold text-slate-800">
                    {formatShortDate(deleteModalTx.date)}{' '}
                    <span className="text-slate-400 font-normal text-[11px]">({deleteModalTx.date})</span>
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">구분 / 분류:</span>
                  <span className="font-bold text-slate-800">
                    [{deleteModalTx.type === 'expense' ? '지출' : deleteModalTx.type === 'income' ? '수입' : '이체'}]{' '}
                    {deleteModalTx.category}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">내용 / 사용처:</span>
                  <span className="font-black text-slate-900">{deleteModalTx.description}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">금액:</span>
                  <span className="font-black text-rose-600 text-sm">
                    {deleteModalTx.amount.toLocaleString('ko-KR')}원
                  </span>
                </div>
                {deleteModalTx.rowIndex && (
                  <div className="flex justify-between border-t border-slate-200 pt-1.5 mt-1 text-[11px] text-slate-500">
                    <span>Google 시트 위치:</span>
                    <span className="font-mono font-bold text-blue-700">
                      [{activeSheetTitle}] 시트 {deleteModalTx.rowIndex}행
                    </span>
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                삭제를 실행하면 Google 스프레드시트의 원본 행이 즉시 영구 삭제되며, 대시보드 통계에 실시간 반영됩니다.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isProcessingDelete}
                onClick={() => setDeleteModalTx(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isProcessingDelete}
                onClick={handleConfirmSingleDelete}
                className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 active:scale-95 transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-rose-600/20"
              >
                {isProcessingDelete ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>시트에서 삭제 중...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Google 시트에서 삭제</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Batch Delete Confirmation Modal */}
      {isBatchDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border-2 border-rose-300 overflow-hidden">
            <div className="p-5 border-b border-rose-100 flex items-center gap-3 bg-rose-50">
              <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-black text-rose-900">선택 항목 일괄 삭제</h4>
                <p className="text-xs text-rose-700 font-medium">
                  선택한 {selectedIds.size}개 항목을 Google 시트에서 삭제합니다.
                </p>
              </div>
            </div>

            <div className="p-5 space-y-3 text-xs text-slate-600">
              <p className="font-bold text-slate-800">
                ⚠️ 선택하신 {selectedIds.size}개의 실제 행이 Google 스프레드시트에서 완전히 삭제됩니다.
              </p>
              <p className="leading-relaxed">
                삭제 후 변경된 시트 내용과 통계가 즉시 동기화됩니다. 계속 진행하시겠습니까?
              </p>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                disabled={isProcessingDelete}
                onClick={() => setIsBatchDeleteModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 cursor-pointer"
              >
                취소
              </button>
              <button
                disabled={isProcessingDelete}
                onClick={handleConfirmBatchDelete}
                className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 cursor-pointer flex items-center gap-1.5 shadow-md shadow-rose-600/20 active:scale-95 transition"
              >
                {isProcessingDelete ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>일괄 삭제 처리 중...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{selectedIds.size}개 항목 Google 시트에서 삭제</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Edit Transaction Modal (Direct Google Sheet Synchronized & Unified UX) */}
      {editModalTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150 overflow-y-auto">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border-2 border-slate-300 overflow-hidden my-auto flex flex-col max-h-[92vh]">
            {/* Modal Header Banner matching ExpenseInputForm */}
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shrink-0">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-black tracking-tight whitespace-nowrap">가계부 내역 수정</h2>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-300 whitespace-nowrap overflow-x-auto scrollbar-none">
                    <span className="text-slate-400">[{editModalTx.sheetTitle || activeSheetTitle}] 시트</span>
                    {editModalTx.rowIndex && (
                      <>
                        <span className="text-slate-500">•</span>
                        <span>{editModalTx.rowIndex}행</span>
                      </>
                    )}
                    {isRealGoogleConnected && (
                      <>
                        <span className="text-slate-500">•</span>
                        <span className="text-emerald-400 font-bold">Google 시트 실시간 반영</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={isSubmittingEdit}
                onClick={() => setEditModalTx(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer shrink-0"
                title="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <div className="p-5 sm:p-6 space-y-4 bg-white overflow-y-auto flex-1">
              {/* Dynamic target month notification */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-2 text-xs text-blue-950 font-bold whitespace-nowrap overflow-x-auto scrollbar-none">
                <div className="flex items-center gap-2 shrink-0">
                  <Info className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    거래 일자: <strong className="text-blue-900 underline">{formatShortDate(editForm.date || '')}</strong> <span className="text-blue-600 text-[11px] font-normal">({editForm.date})</span>
                  </span>
                </div>
                <span className="px-2 py-0.5 bg-blue-600 text-white rounded-md text-[11px] font-extrabold shrink-0">
                  {editModalTx.sheetTitle || activeSheetTitle} 시트에 수정 반영
                </span>
              </div>

              {/* 1. Date Selection with Quick Buttons */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1 whitespace-nowrap">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>지출/수입 날짜</span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={editForm.date || ''}
                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                    className="flex-1 min-w-[150px] px-3.5 py-2.5 bg-white border-2 border-slate-300 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                    required
                  />
                  <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSetEditQuickDate(0)}
                      className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer"
                    >
                      오늘
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetEditQuickDate(1)}
                      className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer"
                    >
                      어제
                    </button>
                  </div>
                </div>
              </div>

              {/* 2. Transaction Type Segmented Pills */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5 whitespace-nowrap">거래 구분</label>
                <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, type: 'expense' })}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold text-xs sm:text-sm transition cursor-pointer ${
                      editForm.type === 'expense'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    <TrendingDown className="w-4 h-4" />
                    <span>지출</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, type: 'income' })}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold text-xs sm:text-sm transition cursor-pointer ${
                      editForm.type === 'income'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4" />
                    <span>수입</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, type: 'transfer' })}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold text-xs sm:text-sm transition cursor-pointer ${
                      editForm.type === 'transfer'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                    <span>이체/저축</span>
                  </button>
                </div>
              </div>

              {/* 3. Amount Input with Quick Add Keypad */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5 whitespace-nowrap">
                  금액 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-slate-500">
                    ₩
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={editAmountStr}
                    onChange={handleEditAmountChange}
                    className="w-full pl-10 pr-4 py-3 bg-white border-2 border-slate-300 rounded-xl text-xl sm:text-2xl font-black text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-blue-600 transition"
                    required
                  />
                </div>

                {/* Quick Amount Buttons */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2 whitespace-nowrap">
                  {[10000, 30000, 50000, 100000, 500000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleEditAddAmount(val)}
                      className="px-2.5 py-1 text-xs font-extrabold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg transition active:scale-95 cursor-pointer border border-slate-200"
                    >
                      +{val >= 10000 ? `${val / 10000}만` : `${val.toLocaleString()}원`}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setEditAmountStr('');
                      setEditForm((prev) => ({ ...prev, amount: 0 }));
                    }}
                    className="p-1 text-xs font-bold text-slate-500 hover:text-slate-800 rounded-lg ml-auto cursor-pointer"
                    title="금액 지우기"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 4. Description (사용처 / 내용) */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5 whitespace-nowrap">
                  사용처 / 내용 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="예: 마트 장보기, 스타벅스, 식사..."
                  value={editForm.description || ''}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border-2 border-slate-300 rounded-xl text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 transition"
                  required
                />
              </div>

              {/* 5. Category Chips with Direct Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5 whitespace-nowrap">
                  <label className="text-xs font-black text-slate-700 flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-blue-600" />
                    <span>분류 (카테고리)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    {onOpenCategoryManager && (
                      <button
                        type="button"
                        onClick={onOpenCategoryManager}
                        className="flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-blue-600 cursor-pointer"
                        title="카테고리 및 결제수단 관리 열기"
                      >
                        <Settings className="w-3 h-3 text-slate-500" />
                        <span>항목 설정</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setCustomCategoryInput(!customCategoryInput)}
                      className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                    >
                      {customCategoryInput ? '목록 선택' : '+ 직접 입력'}
                    </button>
                  </div>
                </div>

                {customCategoryInput ? (
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <input
                      type="text"
                      placeholder="새 분류 이름 직접 입력..."
                      value={newCategoryText}
                      onChange={(e) => setNewCategoryText(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold focus:border-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newCategoryText.trim()) {
                          setEditForm((prev) => ({ ...prev, category: newCategoryText.trim() }));
                          setCustomCategoryInput(false);
                        }
                      }}
                      className="px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 cursor-pointer shrink-0"
                    >
                      적용
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1 bg-slate-50 p-2 rounded-xl border border-slate-200">
                    {allCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setEditForm({ ...editForm, category: cat })}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
                          editForm.category === cat
                            ? editForm.type === 'expense'
                              ? 'bg-rose-600 text-white shadow-sm'
                              : editForm.type === 'income'
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'bg-sky-600 text-white shadow-sm'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 6. Payment Method Chips */}
              <div>
                <div className="flex items-center justify-between mb-1.5 whitespace-nowrap">
                  <label className="text-xs font-black text-slate-700 flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                    <span>결제 수단</span>
                  </label>
                  {onOpenCategoryManager && (
                    <button
                      type="button"
                      onClick={onOpenCategoryManager}
                      className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-blue-600 cursor-pointer"
                    >
                      <Settings className="w-3 h-3" />
                      <span>결제수단 관리</span>
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {allPaymentMethods.map((pm) => (
                    <button
                      key={pm}
                      type="button"
                      onClick={() => setEditForm({ ...editForm, paymentMethod: pm })}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
                        editForm.paymentMethod === pm
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {pm}
                    </button>
                  ))}
                </div>
              </div>

              {/* 7. Sub-item Breakdown Management (쿠팡, 마트 등 복합 결제) */}
              <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => {
                      if (!showEditSubItemEntry && editSubItems.length === 0) {
                        handleAddEditSubItem();
                      }
                      setShowEditSubItemEntry(!showEditSubItemEntry);
                    }}
                    className="flex items-center gap-2 text-xs font-black text-blue-800 hover:text-blue-900 cursor-pointer"
                  >
                    <div className="w-5 h-5 rounded-md bg-blue-600 text-white flex items-center justify-center font-bold">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <span>쿠팡·마트 품목별 세부내역 관리 ({editSubItems.length}개)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!showEditSubItemEntry && editSubItems.length === 0) {
                        handleAddEditSubItem();
                      }
                      setShowEditSubItemEntry(!showEditSubItemEntry);
                    }}
                    className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                  >
                    {showEditSubItemEntry ? '접기 ▲' : '세부내역 펼치기 ▼'}
                  </button>
                </div>

                {showEditSubItemEntry && (
                  <div className="space-y-2 pt-1 border-t border-blue-100 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 font-medium whitespace-nowrap overflow-x-auto scrollbar-none">
                      <span>품목별로 카테고리와 금액을 나누어 기록할 수 있습니다.</span>
                      <div className="flex items-center gap-1 text-[11px] shrink-0">
                        <span className="text-slate-400">예시:</span>
                        <button
                          type="button"
                          onClick={() => applyEditPreset('coupang')}
                          className="px-1.5 py-0.5 bg-white border border-slate-200 hover:border-blue-400 text-slate-700 rounded text-[10px] font-bold transition cursor-pointer"
                        >
                          쿠팡
                        </button>
                        <button
                          type="button"
                          onClick={() => applyEditPreset('mart')}
                          className="px-1.5 py-0.5 bg-white border border-slate-200 hover:border-blue-400 text-slate-700 rounded text-[10px] font-bold transition cursor-pointer"
                        >
                          마트
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {editSubItems.map((item, idx) => (
                        <div key={item.id} className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className="text-[10px] font-mono font-bold text-slate-400 w-4 text-center shrink-0">
                            {idx + 1}
                          </span>
                          <input
                            type="text"
                            placeholder="품목명 (예: 우유, 세제)"
                            value={item.name}
                            onChange={(e) => handleUpdateEditSubItem(item.id, 'name', e.target.value)}
                            className="flex-1 min-w-[85px] px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                          />
                          <select
                            value={item.category || editForm.category || '식비'}
                            onChange={(e) => handleUpdateEditSubItem(item.id, 'category', e.target.value)}
                            className="w-20 sm:w-24 px-1.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-500 shrink-0"
                          >
                            {allCategories.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <div className="w-22 sm:w-28 relative shrink-0">
                            <input
                              type="number"
                              min="0"
                              step="10"
                              placeholder="금액"
                              value={item.amount || ''}
                              onChange={(e) =>
                                handleUpdateEditSubItem(
                                  item.id,
                                  'amount',
                                  e.target.value ? Number(e.target.value) : 0
                                )
                              }
                              className="w-full pl-2 pr-5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 text-right focus:outline-none focus:border-blue-500"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                              원
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveEditSubItem(item.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-md cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={handleAddEditSubItem}
                        className="px-2.5 py-1 bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>품목 추가</span>
                      </button>

                      {editSubItemsSum > 0 && (
                        <div className="flex items-center gap-2 text-xs whitespace-nowrap shrink-0">
                          <span className="text-slate-600 font-bold">
                            품목 합계:{' '}
                            <strong className="text-blue-700 font-black">
                              {editSubItemsSum.toLocaleString('ko-KR')}원
                            </strong>
                          </span>
                          <button
                            type="button"
                            onClick={handleSyncEditAmountWithSubItems}
                            className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-black cursor-pointer shadow-xs whitespace-nowrap shrink-0"
                            title="상단 금액을 세부 품목 합계로 자동 설정"
                          >
                            총 금액에 적용
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 8. Memo */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1 whitespace-nowrap">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>메모 (선택)</span>
                </label>
                <input
                  type="text"
                  placeholder="비고나 세부 메모를 입력하세요"
                  value={editForm.memo || ''}
                  onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border-2 border-slate-300 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 transition"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0 whitespace-nowrap">
              <button
                type="button"
                disabled={isSubmittingEdit}
                onClick={() => setEditModalTx(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isSubmittingEdit}
                onClick={handleSaveEdit}
                className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-blue-600/20"
              >
                {isSubmittingEdit ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Google 시트에 저장 중...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Google 시트에 수정 저장</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Sub-Item Breakdown Modal (Coupang, Mart, etc.) */}
      {subItemModalTx && (
        <SubItemModal
          isOpen={Boolean(subItemModalTx)}
          transaction={subItemModalTx}
          onClose={() => setSubItemModalTx(null)}
          onSave={handleSaveSubItems}
          availableCategories={allCategories}
        />
      )}
    </div>
  );
};
