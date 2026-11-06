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
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Calculator,
  Repeat,
  Filter,
  CloudUpload,
  Copy,
  ClipboardPaste,
} from 'lucide-react';


import {
  Transaction,
  TransactionType,
  formatShortDate,
  SubItem,
  CategoryItem,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_TRANSFER_CATEGORIES,
} from '../types/ledger';
import { SubItemModal } from './SubItemModal';
import { CopyPasteModal } from './CopyPasteModal';
import { saveSubItemsForTransaction, serializeSubItemsToMemo } from '../services/subItemStorage';
import {
  getSmartUsageFrequencyMap,
  sortCategoriesByPastFrequency,
  UsageFrequencyStats,
} from '../services/categoryManager';
import { evaluateMathFormula, containsFormula, sanitizeFormulaInput } from '../utils/mathFormula';
import { getPaymentGroupBadge } from '../utils/paymentGroupUtils';

interface DashboardProps {
  transactions: Transaction[];
  activeSheetTitle: string;
  sheetTabs?: Array<{ id: number; title: string }>;
  onSelectSheetTab?: (title: string) => void;
  onEditTransaction: (transaction: Transaction) => Promise<void>;
  onDeleteTransaction: (transaction: Transaction) => Promise<void>;
  onBatchDeleteTransactions?: (transactions: Transaction[]) => Promise<void>;
  onAddTransaction?: (
    transaction: Omit<Transaction, 'id' | 'rowIndex'> & { sheetTitle?: string }
  ) => Promise<void>;
  isRealGoogleConnected: boolean;
  availableCategories?: string[];
  availablePaymentMethods?: string[];
  customCategories?: CategoryItem[];
  onOpenCategoryManager?: () => void;
  onAddCustomPaymentMethod?: (name: string) => void;
  onExportCurrentMonthToGoogleSheets?: () => Promise<void>;
  isExportingMonth?: boolean;
  onMigrateSheetColumns?: () => Promise<void>;
  isMigratingColumns?: boolean;
  onOpenMigrationAllMonthsModal?: () => void;
  onBatchCopyPaste?: (params: {
    items: Transaction[];
    targetMonth: string;
    dateMode: 'keep_day' | 'today' | 'custom';
    customDate?: string;
    includeSubItems: boolean;
    keepRecurringType: boolean;
  }) => Promise<void>;
}

export function extractMonthFromDate(dateStr?: string, sheetTitle?: string): number | null {
  if (dateStr) {
    // 1. Matches YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD, YYYY. M. D
    const ymd = dateStr.match(/^\d{4}\s*[-.\/]\s*(\d{1,2})\s*[-.\/]\s*(\d{1,2})/);
    if (ymd) {
      const m = parseInt(ymd[1], 10);
      if (m >= 1 && m <= 12) return m;
    }
    // 2. Matches YY-MM-DD, YY.MM.DD
    const y2md = dateStr.match(/^\d{2}\s*[-.\/]\s*(\d{1,2})\s*[-.\/]\s*(\d{1,2})/);
    if (y2md) {
      const m = parseInt(y2md[1], 10);
      if (m >= 1 && m <= 12) return m;
    }
    // 3. Matches MM-DD, MM.DD, M.D, M/D
    const md = dateStr.match(/^(\d{1,2})\s*[-.\/]\s*(\d{1,2})/);
    if (md) {
      const m = parseInt(md[1], 10);
      if (m >= 1 && m <= 12) return m;
    }
    // 4. Matches "X월"
    const kor = dateStr.match(/(\d{1,2})월/);
    if (kor) {
      const m = parseInt(kor[1], 10);
      if (m >= 1 && m <= 12) return m;
    }
  }

  // Fallback to sheetTitle
  if (sheetTitle) {
    const sm = sheetTitle.match(/(?:^|[^0-9])(\d{1,2})월/);
    if (sm) return parseInt(sm[1], 10);
  }

  return null;
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
  onAddTransaction,
  isRealGoogleConnected,
  availableCategories = [],
  availablePaymentMethods = [],
  customCategories = [],
  onOpenCategoryManager,
  onAddCustomPaymentMethod,
  onExportCurrentMonthToGoogleSheets,
  isExportingMonth = false,
  onMigrateSheetColumns,
  isMigratingColumns = false,
  onOpenMigrationAllMonthsModal,
  onBatchCopyPaste,
}) => {
  // Copy & Paste Modal state
  const [isCopyModalOpen, setIsCopyModalOpen] = useState<boolean>(false);
  const [transactionsToCopy, setTransactionsToCopy] = useState<Transaction[]>([]);
  const [clipboardItems, setClipboardItems] = useState<Transaction[]>([]);

  const handleOpenCopyModal = (tx: Transaction) => {
    setTransactionsToCopy([tx]);
    setIsCopyModalOpen(true);
  };

  const handleOpenBatchCopyModal = () => {
    const selectedList = filteredTransactions.filter((t) => selectedIds.has(t.id));
    if (selectedList.length === 0) {
      alert('복사할 내역을 1건 이상 선택해 주세요.');
      return;
    }
    setTransactionsToCopy(selectedList);
    setIsCopyModalOpen(true);
  };

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'all' | TransactionType>('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedRecurringFilter, setSelectedRecurringFilter] = useState<
    'all' | 'recurring' | 'routine' | 'special' | 'variable'
  >('all');
  const [excludeSpecialExpense, setExcludeSpecialExpense] = useState<boolean>(false);
  // Default to current month (e.g. 10월, 11월)
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>(() => {
    const match = activeSheetTitle?.trim().match(/(?:^|[^0-9])0*(\d{1,2})월/);
    if (match) return String(parseInt(match[1], 10));
    return String(new Date().getMonth() + 1);
  });
  const [sortField, setSortField] = useState<'recent' | 'date' | 'amount'>('date');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Collapsible category ranking box state (collapsed by default on mobile so transactions are immediately visible)
  const [isCategoryRankCollapsed, setIsCategoryRankCollapsed] = useState<boolean>(() => {
    return typeof window !== 'undefined' ? window.innerWidth < 1024 : false;
  });
  // Selected category for temporary drill-down popup modal
  const [selectedCategoryDetail, setSelectedCategoryDetail] = useState<string | null>(null);
  // Selected spending type (고정예산, 일반지출, 특별지출) for drill-down popup modal
  const [selectedSpendingTypeDetail, setSelectedSpendingTypeDetail] = useState<'recurring' | 'routine' | 'special' | null>(null);

  // Month selector auto-scroll refs
  const monthScrollContainerRef = React.useRef<HTMLDivElement>(null);
  const activeMonthBadgeRef = React.useRef<HTMLButtonElement>(null);

  // Month navigation helpers for swipe and arrow navigation
  const getCurrentMonthNumber = (): number => {
    const parsed = parseInt(selectedMonthFilter, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 12) return parsed;
    const fromSheet = activeSheetTitle?.match(/(?:^|[^0-9])0*(\d{1,2})월/);
    if (fromSheet) return parseInt(fromSheet[1], 10);
    return new Date().getMonth() + 1;
  };

  const goToPrevMonth = () => {
    const cur = getCurrentMonthNumber();
    const prev = cur > 1 ? cur - 1 : 12;
    setSelectedMonthFilter(String(prev));
    if (onSelectSheetTab) onSelectSheetTab(`${prev}월`);
  };

  const goToNextMonth = () => {
    const cur = getCurrentMonthNumber();
    const next = cur < 12 ? cur + 1 : 1;
    setSelectedMonthFilter(String(next));
    if (onSelectSheetTab) onSelectSheetTab(`${next}월`);
  };

  // Sync month filter when activeSheetTitle changes to a specific month
  React.useEffect(() => {
    if (!activeSheetTitle) return;
    const match = activeSheetTitle.trim().match(/(?:^|[^0-9])0*(\d{1,2})월/);
    if (match) {
      const mNum = parseInt(match[1], 10);
      if (mNum >= 1 && mNum <= 12) {
        setSelectedMonthFilter(String(mNum));
      }
    }
  }, [activeSheetTitle]);

  // Auto-scroll the month filter bar so the active month badge is centered in view
  React.useEffect(() => {
    const scrollToActiveBadge = () => {
      if (activeMonthBadgeRef.current && monthScrollContainerRef.current) {
        const container = monthScrollContainerRef.current;
        const target = activeMonthBadgeRef.current;
        const targetLeft = target.offsetLeft;
        const targetWidth = target.offsetWidth;
        const containerWidth = container.offsetWidth;
        const scrollGoal = targetLeft - containerWidth / 2 + targetWidth / 2;

        container.scrollTo({
          left: Math.max(0, scrollGoal),
          behavior: 'smooth',
        });
      }
    };

    // Immediate attempt
    scrollToActiveBadge();
    // Re-check after DOM reflow and font metrics settle
    const timer = setTimeout(scrollToActiveBadge, 150);
    return () => clearTimeout(timer);
  }, [selectedMonthFilter, activeSheetTitle]);

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
  const [customPaymentInput, setCustomPaymentInput] = useState<boolean>(false);
  const [newPaymentText, setNewPaymentText] = useState<string>('');
  const [showAllPaymentMethods, setShowAllPaymentMethods] = useState<boolean>(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Amount Display Sign Mode ('positive': 양수 통일 | 'signed': 지출- 수입+)
  const [amountSignMode, setAmountSignMode] = useState<'positive' | 'signed'>(() => {
    try {
      const saved = localStorage.getItem('smart_money_amount_sign_mode');
      if (saved === 'signed' || saved === 'positive') return saved;
    } catch {}
    return 'positive'; // Default to positive (카테고리/구분이 있으므로 음수 없이 양수 통일)
  });

  // Category frequency stats map for the Edit modal (smart recency)
  const editCategoryStatsMap = useMemo(() => {
    return getSmartUsageFrequencyMap(transactions, editForm.date || activeSheetTitle, 'category');
  }, [transactions, editForm.date, activeSheetTitle]);

  const editCategoryFrequencyMap = useMemo(() => {
    const map = new Map<string, number>();
    editCategoryStatsMap.forEach((stat, key) => map.set(key, stat.score));
    return map;
  }, [editCategoryStatsMap]);

  // Categories for Edit Modal, strictly filtered by editForm.type and sorted by past frequency
  const editModalCategories = useMemo(() => {
    const currentType = editForm.type || 'expense';
    let list: string[] = [];

    if (customCategories && customCategories.length > 0) {
      list = customCategories
        .filter((c) => {
          if (currentType === 'income') return c.type === 'income';
          if (currentType === 'transfer') return c.type === 'transfer';
          return c.type === 'expense' || !c.type;
        })
        .map((c) => c.name);
    }

    if (list.length === 0) {
      if (currentType === 'income') {
        list = [...DEFAULT_INCOME_CATEGORIES];
      } else if (currentType === 'transfer') {
        list = [...DEFAULT_TRANSFER_CATEGORIES];
      } else {
        list = [...DEFAULT_EXPENSE_CATEGORIES];
      }
    }

    // Include existing categories from transactions of this type
    transactions.forEach((t) => {
      if (t.type === currentType && t.category && !list.includes(t.category)) {
        list.push(t.category);
      }
    });

    // Ensure currently selected category is included
    if (editForm.category && !list.includes(editForm.category)) {
      list.push(editForm.category);
    }

    return sortCategoriesByPastFrequency(list, editCategoryFrequencyMap);
  }, [editForm.type, editForm.category, customCategories, transactions, editCategoryFrequencyMap]);

  // Change edit type and switch category to matching top category if current is not in new type
  const handleEditTypeChange = (newType: TransactionType) => {
    let list: string[] = [];
    if (customCategories && customCategories.length > 0) {
      list = customCategories
        .filter((c) => {
          if (newType === 'income') return c.type === 'income';
          if (newType === 'transfer') return c.type === 'transfer';
          return c.type === 'expense' || !c.type;
        })
        .map((c) => c.name);
    }

    if (list.length === 0) {
      if (newType === 'income') {
        list = [...DEFAULT_INCOME_CATEGORIES];
      } else if (newType === 'transfer') {
        list = [...DEFAULT_TRANSFER_CATEGORIES];
      } else {
        list = [...DEFAULT_EXPENSE_CATEGORIES];
      }
    }

    const sorted = sortCategoriesByPastFrequency(list, editCategoryFrequencyMap);
    const nextCategory = sorted.includes(editForm.category || '')
      ? editForm.category
      : (sorted[0] || '기타');

    setEditForm((prev) => ({
      ...prev,
      type: newType,
      category: nextCategory,
    }));
  };

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

  // Split transaction: take sub-items as separate transactions, retain remaining amount as original description
  const handleSplitTransaction = async (originalTx: Transaction, items: SubItem[]) => {
    const validItems = items
      .filter((s) => s.name.trim().length > 0 || (Number(s.amount) || 0) > 0)
      .map((s) => {
        const qty = Math.max(1, Number(s.quantity) || 1);
        const amt = Math.max(0, Number(s.amount) || 0);
        const uPrice = s.unitPrice !== undefined && s.unitPrice > 0 ? s.unitPrice : Math.round(amt / qty);
        return {
          ...s,
          name: s.name.trim() || '품목',
          quantity: qty,
          unitPrice: uPrice,
          amount: amt,
        };
      });

    if (validItems.length === 0) {
      alert('분할할 세부 품목을 1개 이상 입력해 주세요.');
      return;
    }

    const subSum = validItems.reduce((acc, s) => acc + s.amount, 0);
    const remaining = originalTx.amount - subSum;

    if (remaining < 0) {
      alert(`세부 품목의 합계(${subSum.toLocaleString('ko-KR')}원)가 원래 거래 금액(${originalTx.amount.toLocaleString('ko-KR')}원)보다 큽니다. 금액을 확인해 주세요.`);
      return;
    }

    const cleanBaseDesc = originalTx.description.replace(/\s*\(잔여\)$/, '').trim();

    // 1. If remaining > 0:
    // Update original transaction to retain remaining amount
    if (remaining > 0) {
      const updatedOriginal: Transaction = {
        ...originalTx,
        amount: remaining,
        description: `${cleanBaseDesc} (잔여)`,
        subItems: [],
        memo: serializeSubItemsToMemo(
          `[세부 분할 ${subSum.toLocaleString('ko-KR')}원 분리 완료]`,
          validItems
        ),
      };
      await onEditTransaction(updatedOriginal);

      // Add each valid sub-item as its own individual transaction
      if (onAddTransaction) {
        for (const item of validItems) {
          const itemDesc = item.quantity && item.quantity > 1 ? `${item.name} ${item.quantity}개` : item.name;
          const itemMemo = `${cleanBaseDesc} 세부 분할${
            item.quantity && item.quantity > 1
              ? ` (수량: ${item.quantity}개${item.unitPrice ? `, 개당 ${item.unitPrice.toLocaleString('ko-KR')}원` : ''})`
              : ''
          }`;

          await onAddTransaction({
            date: originalTx.date,
            type: originalTx.type,
            category: item.category || originalTx.category,
            description: `${cleanBaseDesc} (${itemDesc})`,
            amount: item.amount,
            paymentMethod: originalTx.paymentMethod,
            memo: itemMemo,
            sheetTitle: originalTx.sheetTitle,
            createdAt: Date.now(),
          });
        }
      }
    } else {
      // 2. If remaining === 0:
      // The first item updates the original transaction row
      const first = validItems[0];
      const firstDesc = first.quantity && first.quantity > 1 ? `${first.name} ${first.quantity}개` : first.name;
      const firstMemo = `${cleanBaseDesc} 세부 분할${
        first.quantity && first.quantity > 1
          ? ` (수량: ${first.quantity}개${first.unitPrice ? `, 개당 ${first.unitPrice.toLocaleString('ko-KR')}원` : ''})`
          : ''
      }`;

      const updatedOriginal: Transaction = {
        ...originalTx,
        amount: first.amount,
        category: first.category || originalTx.category,
        description: `${cleanBaseDesc} (${firstDesc})`,
        subItems: [],
        memo: firstMemo,
      };
      await onEditTransaction(updatedOriginal);

      // Remaining items are added as new transactions
      if (onAddTransaction && validItems.length > 1) {
        for (const item of validItems.slice(1)) {
          const itemDesc = item.quantity && item.quantity > 1 ? `${item.name} ${item.quantity}개` : item.name;
          const itemMemo = `${cleanBaseDesc} 세부 분할${
            item.quantity && item.quantity > 1
              ? ` (수량: ${item.quantity}개${item.unitPrice ? `, 개당 ${item.unitPrice.toLocaleString('ko-KR')}원` : ''})`
              : ''
          }`;

          await onAddTransaction({
            date: originalTx.date,
            type: originalTx.type,
            category: item.category || originalTx.category,
            description: `${cleanBaseDesc} (${itemDesc})`,
            amount: item.amount,
            paymentMethod: originalTx.paymentMethod,
            memo: itemMemo,
            sheetTitle: originalTx.sheetTitle,
            createdAt: Date.now(),
          });
        }
      }
    }

    if (editModalTx && editModalTx.id === originalTx.id) {
      setEditModalTx(null);
    }
    setSubItemModalTx(null);
  };

  // Metrics Calculation
  const metrics = useMemo(() => {
    let totalExpense = 0;
    let totalIncome = 0;
    let recurringExpense = 0;
    let specialExpense = 0;
    let routineExpense = 0;

    transactions.forEach((t) => {
      if (t.type === 'expense') {
        totalExpense += t.amount;
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

        if (isRec) {
          recurringExpense += t.amount;
        } else if (isSpec) {
          specialExpense += t.amount;
        } else {
          routineExpense += t.amount;
        }
      } else if (t.type === 'income') {
        totalIncome += t.amount;
      }
    });

    const variableExpense = routineExpense + specialExpense;
    const activeTotalExpense = excludeSpecialExpense ? totalExpense - specialExpense : totalExpense;
    const balance = totalIncome - activeTotalExpense;
    const savingRate = totalIncome > 0 ? Math.max(0, Math.round((balance / totalIncome) * 100)) : 0;

    const uniqueDays = new Set(transactions.map((t) => t.date)).size;
    const daysInCount = Math.max(uniqueDays, 1);
    const dailyAverageExpense = Math.round(activeTotalExpense / daysInCount);

    const recurringRate = totalExpense > 0 ? Math.round((recurringExpense / totalExpense) * 100) : 0;
    const specialRate = totalExpense > 0 ? Math.round((specialExpense / totalExpense) * 100) : 0;
    const routineRate = totalExpense > 0 ? Math.round((routineExpense / totalExpense) * 100) : 0;
    const variableRate = totalExpense > 0 ? Math.round((variableExpense / totalExpense) * 100) : 0;

    return {
      totalExpense,
      activeTotalExpense,
      totalIncome,
      recurringExpense,
      specialExpense,
      routineExpense,
      variableExpense,
      recurringRate,
      specialRate,
      routineRate,
      variableRate,
      balance,
      savingRate,
      dailyAverageExpense,
      count: transactions.length,
    };
  }, [transactions, excludeSpecialExpense]);

  // Category breakdown
  const categoryStats = useMemo(() => {
    const map: Record<string, number> = {};
    let totalExpense = 0;

    transactions.forEach((t) => {
      if (t.type === 'expense') {
        const isSpec = Boolean(
          t.isSpecial ||
          t.memo?.includes('[특별지출]') ||
          t.memo?.includes('[비정기지출]')
        );
        if (excludeSpecialExpense && isSpec) return;

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
  }, [transactions, excludeSpecialExpense]);

  // Transactions belonging to selectedCategoryDetail for temporary popup drill-down modal
  const categoryModalData = useMemo(() => {
    if (!selectedCategoryDetail) return null;

    const matchedList: Array<{
      tx: Transaction;
      subItemName?: string;
      matchedAmount: number;
      isSubItem: boolean;
      isRecurring: boolean;
      isSpecial: boolean;
    }> = [];

    let totalCategoryAmount = 0;

    transactions.forEach((t) => {
      // Respect month filter if selected
      if (selectedMonthFilter !== 'all') {
        const mNum = parseInt(selectedMonthFilter, 10);
        const txMonth = extractMonthFromDate(t.date, t.sheetTitle);
        if (txMonth !== null && txMonth !== mNum) return;
      }

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

      // Exclude special expense if toggle is active
      if (excludeSpecialExpense && isSpec) return;

      // 1. If transaction has subItems matching this category
      if (t.subItems && t.subItems.length > 0) {
        const matchedSubs = t.subItems.filter((s) => s.category === selectedCategoryDetail);
        if (matchedSubs.length > 0) {
          matchedSubs.forEach((sub) => {
            const amt = Number(sub.amount) || 0;
            totalCategoryAmount += amt;
            matchedList.push({
              tx: t,
              subItemName: sub.name,
              matchedAmount: amt,
              isSubItem: true,
              isRecurring: isRec,
              isSpecial: isSpec,
            });
          });
          return;
        }
      }

      // 2. If main transaction matches category
      if (t.category === selectedCategoryDetail) {
        totalCategoryAmount += t.amount;
        matchedList.push({
          tx: t,
          matchedAmount: t.amount,
          isSubItem: false,
          isRecurring: isRec,
          isSpecial: isSpec,
        });
      }
    });

    // Sort by date descending
    matchedList.sort((a, b) => b.tx.date.localeCompare(a.tx.date));

    const color = categoryStats.list.find((c) => c.name === selectedCategoryDetail)?.color || '#3B82F6';

    return {
      categoryName: selectedCategoryDetail,
      items: matchedList,
      totalAmount: totalCategoryAmount,
      color,
    };
  }, [transactions, selectedCategoryDetail, selectedMonthFilter, categoryStats.list, excludeSpecialExpense]);

  // Transactions belonging to selectedSpendingTypeDetail for temporary drill-down modal
  const spendingTypeModalData = useMemo(() => {
    if (!selectedSpendingTypeDetail) return null;

    const matchedList: Array<{
      tx: Transaction;
      subItemName?: string;
      matchedAmount: number;
      isSubItem: boolean;
      category: string;
      isRecurring: boolean;
      isSpecial: boolean;
    }> = [];

    let totalAmount = 0;

    transactions.forEach((t) => {
      // Must be an expense transaction
      if (t.type && t.type !== 'expense') return;

      // Respect month filter if selected
      if (selectedMonthFilter !== 'all') {
        const mNum = parseInt(selectedMonthFilter, 10);
        const txMonth = extractMonthFromDate(t.date, t.sheetTitle);
        if (txMonth !== null && txMonth !== mNum) return;
      }

      const isRec = Boolean(
        t.isRecurring ||
        t.memo?.includes('[정기예산]') ||
        t.memo?.includes('[고정지출]') ||
        t.memo?.includes('[정기지출]') ||
        t.memo?.includes('[고정]')
      );
      const isSpec = Boolean(
        t.isSpecial ||
        t.memo?.includes('[특별지출]') ||
        t.memo?.includes('[비정기지출]') ||
        t.memo?.includes('[특별]') ||
        t.memo?.includes('[비정기]')
      );
      const isRout = !isRec && !isSpec;

      let matches = false;
      if (selectedSpendingTypeDetail === 'recurring' && isRec) matches = true;
      if (selectedSpendingTypeDetail === 'routine' && isRout) matches = true;
      if (selectedSpendingTypeDetail === 'special' && isSpec) matches = true;

      if (!matches) return;

      // If transaction has subItems, list the subItems
      if (t.subItems && t.subItems.length > 0) {
        t.subItems.forEach((sub) => {
          const amt = Number(sub.amount) || 0;
          totalAmount += amt;
          matchedList.push({
            tx: t,
            subItemName: sub.name,
            matchedAmount: amt,
            isSubItem: true,
            category: sub.category || t.category || '기타',
            isRecurring: isRec,
            isSpecial: isSpec,
          });
        });
      } else {
        totalAmount += t.amount;
        matchedList.push({
          tx: t,
          matchedAmount: t.amount,
          isSubItem: false,
          category: t.category || '기타',
          isRecurring: isRec,
          isSpecial: isSpec,
        });
      }
    });

    // Sort by date descending
    matchedList.sort((a, b) => (b.tx.date || '').localeCompare(a.tx.date || ''));

    const meta =
      selectedSpendingTypeDetail === 'recurring'
        ? {
            title: '고정 예산',
            icon: '📌',
            color: '#9333EA', // purple-600
            desc: '매월 정기적으로 지출되는 고정 예산(월세, 관리비, 공과금, 구독료, 통신비 등) 내역입니다.',
            filterVal: 'recurring' as const,
          }
        : selectedSpendingTypeDetail === 'special'
        ? {
            title: '특별(비정기) 지출',
            icon: '🛋️',
            color: '#F59E0B', // amber-500
            desc: '가전, 가구, 여행, 경조사 등 가끔 발생하는 대형 비정기 지출 내역입니다.',
            filterVal: 'special' as const,
          }
        : {
            title: '일반 일상 지출',
            icon: '🛒',
            color: '#FB7185', // rose-400
            desc: '식비, 생필품, 카페, 쇼핑 등 일상에서 반복되는 변동 지출 내역입니다.',
            filterVal: 'routine' as const,
          };

    return {
      type: selectedSpendingTypeDetail,
      ...meta,
      items: matchedList,
      totalAmount,
    };
  }, [transactions, selectedSpendingTypeDetail, selectedMonthFilter]);


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

  // Available Payment Methods with smart frequency tracking (start of month: last month, then current month)
  const paymentStatsMap = useMemo(() => {
    return getSmartUsageFrequencyMap(transactions, editForm.date || activeSheetTitle, 'paymentMethod');
  }, [transactions, editForm.date, activeSheetTitle]);

  const paymentFrequencyMap = useMemo(() => {
    const map = new Map<string, number>();
    paymentStatsMap.forEach((stat, key) => map.set(key, stat.score));
    return map;
  }, [paymentStatsMap]);

  const allPaymentMethods = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => {
      if (t.paymentMethod && t.paymentMethod.trim()) set.add(t.paymentMethod.trim());
    });
    availablePaymentMethods.forEach((p) => {
      if (p && p.trim()) set.add(p.trim());
    });
    [
      '신용카드',
      '체크카드',
      '현대카드',
      '신한카드',
      '삼성카드',
      'KB국민카드',
      '자동이체',
      '계좌이체',
      '국민은행',
      '현금',
      '네이버페이',
      '카카오페이',
      '토스페이',
      '티머니',
    ].forEach((p) => set.add(p));

    return Array.from(set)
      .filter(Boolean)
      .sort((a, b) => {
        const fA = paymentFrequencyMap.get(a) || 0;
        const fB = paymentFrequencyMap.get(b) || 0;
        if (fA !== fB) return fB - fA;
        return a.localeCompare(b);
      });
  }, [transactions, availablePaymentMethods, paymentFrequencyMap]);

  // Filtered & Sorted Transactions
  const filteredTransactions = useMemo(() => {
    return transactions
      .filter((t) => {
        if (selectedTypeFilter !== 'all' && t.type !== selectedTypeFilter) return false;
        if (selectedCategoryFilter !== 'all' && t.category !== selectedCategoryFilter) return false;

        // Budget classification filter
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

        // 1-Click Toggle: Exclude special expenses from view
        if (excludeSpecialExpense && isSpec) {
          return false;
        }

        if (selectedRecurringFilter !== 'all') {
          if (selectedRecurringFilter === 'recurring' && !isRec) return false;
          if (selectedRecurringFilter === 'special' && !isSpec) return false;
          if (selectedRecurringFilter === 'routine' && (isRec || isSpec)) return false;
          if (selectedRecurringFilter === 'variable' && isRec) return false;
        }

        // Month filter - robustly extract month from date or sheet title
        if (selectedMonthFilter !== 'all') {
          const mNum = parseInt(selectedMonthFilter, 10);
          const txMonth = extractMonthFromDate(t.date, t.sheetTitle);
          if (txMonth !== null && txMonth !== mNum) {
            return false;
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
        if (sortField === 'recent') {
          // Latest entered first ("나중에 입력한 거를 위로 가게. 위쪽으로 가게 해 줘. 최신처럼")
          const timeA = a.createdAt !== undefined ? a.createdAt : (a.rowIndex ? a.rowIndex * 1000 : 0);
          const timeB = b.createdAt !== undefined ? b.createdAt : (b.rowIndex ? b.rowIndex * 1000 : 0);
          if (timeA !== timeB) {
            return sortAsc ? timeA - timeB : timeB - timeA;
          }
          const d = sortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
          if (d !== 0) return d;
          return sortAsc ? (a.rowIndex ?? 0) - (b.rowIndex ?? 0) : (b.rowIndex ?? 0) - (a.rowIndex ?? 0);
        } else if (sortField === 'date') {
          const dateDiff = sortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
          if (dateDiff !== 0) return dateDiff;
          // Tie-breaker when dates are equal: later entered item on top!
          const timeA = a.createdAt !== undefined ? a.createdAt : (a.rowIndex ?? 0);
          const timeB = b.createdAt !== undefined ? b.createdAt : (b.rowIndex ?? 0);
          return sortAsc ? timeA - timeB : timeB - timeA;
        } else {
          const amtDiff = sortAsc ? a.amount - b.amount : b.amount - a.amount;
          if (amtDiff !== 0) return amtDiff;
          const timeA = a.createdAt !== undefined ? a.createdAt : (a.rowIndex ?? 0);
          const timeB = b.createdAt !== undefined ? b.createdAt : (b.rowIndex ?? 0);
          return sortAsc ? timeA - timeB : timeB - timeA;
        }
      });
  }, [
    transactions,
    selectedTypeFilter,
    selectedCategoryFilter,
    selectedRecurringFilter,
    excludeSpecialExpense,
    selectedMonthFilter,
    searchQuery,
    sortField,
    sortAsc,
  ]);

  // Active filter state and reset helper
  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
    selectedTypeFilter !== 'all' ||
    selectedRecurringFilter !== 'all' ||
    selectedCategoryFilter !== 'all' ||
    excludeSpecialExpense
  );

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedTypeFilter('all');
    setSelectedRecurringFilter('all');
    setSelectedCategoryFilter('all');
    setExcludeSpecialExpense(false);
  };

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
    setEditModalTx(t);
    setEditForm({
      date: t.date,
      type: t.type,
      category: t.category,
      description: t.description,
      amount: t.amount,
      paymentMethod: t.paymentMethod,
      memo: t.memo,
      isRecurring: isRec,
      isSpecial: isSpec,
    });
    setEditAmountStr(t.amount > 0 ? t.amount.toLocaleString('ko-KR') : '');
    setEditSubItems(t.subItems ? t.subItems.map((s) => ({ ...s })) : []);
    setShowEditSubItemEntry(!!(t.subItems && t.subItems.length > 0));
    setCustomCategoryInput(false);
    setNewCategoryText('');
    setCustomPaymentInput(false);
    setNewPaymentText('');
    setShowAllPaymentMethods(false);
  };

  // Math formula calculation for edit modal amount
  const editFormulaEval = useMemo(() => {
    return evaluateMathFormula(editAmountStr);
  }, [editAmountStr]);

  const isEditFormula = useMemo(() => {
    return containsFormula(editAmountStr);
  }, [editAmountStr]);

  const handleApplyEditFormula = () => {
    if (editFormulaEval.isValid && typeof editFormulaEval.value === 'number') {
      const val = editFormulaEval.value;
      setEditAmountStr(val.toLocaleString('ko-KR'));
      setEditForm((prev) => ({ ...prev, amount: val }));
    }
  };

  const handleInsertEditChar = (ch: string) => {
    if (ch === '=') {
      handleApplyEditFormula();
      return;
    }
    if (ch === 'C' || ch === 'AC' || ch === 'clear') {
      setEditAmountStr('');
      setEditForm((prev) => ({ ...prev, amount: 0 }));
      return;
    }
    if (ch === 'BS' || ch === 'backspace') {
      setEditAmountStr((prev) => prev.slice(0, -1).trimEnd());
      return;
    }

    // Digits, 00, or dot
    if (/^[0-9.]$/.test(ch) || ch === '00') {
      setEditAmountStr((prev) => {
        if (prev === '0' && ch !== '.') return ch;
        return `${prev}${ch}`;
      });
      return;
    }

    const cleanOp = ch === '×' ? '*' : ch === '÷' ? '/' : ch;
    if (['+', '-', '*', '/'].includes(cleanOp)) {
      if (!editAmountStr.trim()) {
        if (cleanOp === '-') {
          setEditAmountStr('-');
        } else {
          setEditAmountStr(`0 ${cleanOp} `);
        }
        return;
      }
      const trimmed = editAmountStr.trimEnd();
      if (/[+\-*\/]$/.test(trimmed)) {
        setEditAmountStr(`${trimmed.slice(0, -1)} ${cleanOp} `);
      } else {
        setEditAmountStr(`${trimmed} ${cleanOp} `);
      }
    } else if (ch === '(' || ch === ')') {
      setEditAmountStr((prev) => `${prev}${ch}`);
    }
  };

  const handleEditAmountKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (isEditFormula && editFormulaEval.isValid && editFormulaEval.value !== null) {
        e.preventDefault();
        handleApplyEditFormula();
      }
    }
  };

  const handleEditAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const sanitized = sanitizeFormulaInput(val);

    if (!sanitized) {
      setEditAmountStr('');
      setEditForm((prev) => ({ ...prev, amount: 0 }));
      return;
    }

    if (!containsFormula(sanitized)) {
      const raw = sanitized.replace(/[^0-9]/g, '');
      if (!raw) {
        setEditAmountStr('');
        setEditForm((prev) => ({ ...prev, amount: 0 }));
        return;
      }
      const num = parseInt(raw, 10);
      setEditAmountStr(num.toLocaleString('ko-KR'));
      setEditForm((prev) => ({ ...prev, amount: num }));
    } else {
      setEditAmountStr(sanitized);
    }
  };

  const handleEditAddAmount = (addVal: number) => {
    if (isEditFormula && editFormulaEval.isValid && editFormulaEval.value !== null) {
      const next = editFormulaEval.value + addVal;
      setEditAmountStr(next.toLocaleString('ko-KR'));
      setEditForm((prev) => ({ ...prev, amount: next }));
    } else {
      const current = Number(editForm.amount) || 0;
      const next = current + addVal;
      setEditAmountStr(next.toLocaleString('ko-KR'));
      setEditForm((prev) => ({ ...prev, amount: next }));
    }
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
        quantity: 1,
        unitPrice: 0,
        category: editForm.category || '식비',
      },
    ]);
  };

  const handleUpdateEditSubItem = (id: string, field: keyof SubItem, value: any) => {
    setEditSubItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          const currentQty = Math.max(1, Number(field === 'quantity' ? value : item.quantity || 1));

          if (field === 'quantity') {
            const newQty = Math.max(1, Number(value) || 1);
            updated.quantity = newQty;
            if (item.unitPrice && item.unitPrice > 0) {
              updated.amount = item.unitPrice * newQty;
            } else if (item.amount > 0) {
              updated.unitPrice = Math.round(item.amount / newQty);
            }
          } else if (field === 'unitPrice') {
            const newUnitPrice = Math.max(0, Number(value) || 0);
            updated.unitPrice = newUnitPrice;
            updated.amount = newUnitPrice * currentQty;
          } else if (field === 'amount') {
            const newAmount = Math.max(0, Number(value) || 0);
            updated.amount = newAmount;
            updated.unitPrice = Math.round(newAmount / currentQty);
          }

          return updated;
        }
        return item;
      })
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
        { id: `edit-p1`, name: '신선란 30구', quantity: 1, unitPrice: 8900, amount: 8900, category: '식비' },
        { id: `edit-p2`, name: '서울우유 2.3L', quantity: 2, unitPrice: 3225, amount: 6450, category: '식비' },
        { id: `edit-p3`, name: '롤화장지 30롤', quantity: 1, unitPrice: 19800, amount: 19800, category: '생활용품' },
      ];
      setEditSubItems(items);
      const total = items.reduce((a, b) => a + b.amount, 0);
      setEditAmountStr(total.toLocaleString('ko-KR'));
      setEditForm((prev) => ({ ...prev, amount: total }));
    } else {
      const items = [
        { id: `edit-p1`, name: '소고기 등심 300g', quantity: 1, unitPrice: 28000, amount: 28000, category: '식비' },
        { id: `edit-p2`, name: '양파 & 대파', quantity: 1, unitPrice: 6500, amount: 6500, category: '식비' },
        { id: `edit-p3`, name: '주방세제 리필', quantity: 2, unitPrice: 3750, amount: 7500, category: '생활용품' },
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
    let numAmount = 0;
    if (isEditFormula) {
      if (editFormulaEval.isValid && editFormulaEval.value !== null) {
        numAmount = editFormulaEval.value;
        setEditAmountStr(editFormulaEval.formatted || String(editFormulaEval.value));
        setEditForm((prev) => ({ ...prev, amount: numAmount }));
      } else {
        alert(editFormulaEval.error || '금액 수식이 올바르지 않습니다. 확인 후 다시 시도해 주세요.');
        return;
      }
    } else {
      numAmount =
        typeof editForm.amount === 'number' && editForm.amount > 0
          ? editForm.amount
          : parseInt(editAmountStr.replace(/[^0-9]/g, ''), 10) || 0;
    }

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
        .filter((item) => item.name.trim().length > 0 || (Number(item.amount) || 0) > 0)
        .map((item) => {
          const qty = Math.max(1, Number(item.quantity) || 1);
          const amt = Math.max(0, Number(item.amount) || 0);
          const uPrice = item.unitPrice !== undefined && item.unitPrice > 0 ? item.unitPrice : Math.round(amt / qty);
          return {
            ...item,
            name: item.name.trim() || '품목',
            quantity: qty,
            unitPrice: uPrice,
            amount: amt,
            category: item.category || editForm.category || '식비',
          };
        });

      const isRec = Boolean(editForm.isRecurring);
      const isSpec = Boolean(editForm.isSpecial);

      // Extract existing user memo without old serialized sub-items or recurring/special tags
      const cleanBaseMemo = (editForm.memo || '')
        .replace(/\[세부품목:[\s\S]*?\]/g, '')
        .replace(/\[정기예산\]/g, '')
        .replace(/\[고정지출\]/g, '')
        .replace(/\[정기지출\]/g, '')
        .replace(/\[특별지출\]/g, '')
        .replace(/\[비정기지출\]/g, '')
        .trim();

      let finalMemo =
        validSubItems.length > 0
          ? serializeSubItemsToMemo(cleanBaseMemo, validSubItems)
          : cleanBaseMemo;

      if (isRec) {
        finalMemo = finalMemo ? `[정기예산] ${finalMemo}` : '[정기예산]';
      } else if (isSpec) {
        finalMemo = finalMemo ? `[특별지출] ${finalMemo}` : '[특별지출]';
      }

      const updatedTx: Transaction = {
        ...editModalTx,
        date: editForm.date || editModalTx.date,
        type: editForm.type || editModalTx.type,
        category: editForm.category || editModalTx.category,
        description: editForm.description.trim(),
        amount: numAmount,
        paymentMethod: editForm.paymentMethod || '',
        isRecurring: isRec || undefined,
        isSpecial: isSpec || undefined,
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

              {isRealGoogleConnected && onExportCurrentMonthToGoogleSheets && (
                <button
                  type="button"
                  onClick={onExportCurrentMonthToGoogleSheets}
                  disabled={isExportingMonth || metrics.count === 0}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[11px] font-bold text-white shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50 ml-1"
                  title={`현재 화면의 ${metrics.count}건 내역을 구글 드라이브 가계부 시트에 [${activeSheetTitle}] 탭을 만들어 일괄 저장합니다.`}
                >
                  <CloudUpload className="w-3.5 h-3.5" />
                  <span>
                    {isExportingMonth
                      ? '시트에 저장 중...'
                      : `구글 시트에 [${activeSheetTitle}] 생성 & ${metrics.count}건 일괄 저장`}
                  </span>
                </button>
              )}


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
                  {activeSheetTitle} {excludeSpecialExpense ? '일상 총 지출 (특별 제외)' : '총 지출'}
                </span>
              </div>
              <p className="text-sm sm:text-lg font-black text-rose-600 truncate mt-0.5">
                {metrics.activeTotalExpense.toLocaleString('ko-KR')}원
              </p>
              {excludeSpecialExpense && metrics.specialExpense > 0 && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 inline-block truncate mt-0.5">
                  🛋️ 특별 지출 {metrics.specialExpense.toLocaleString('ko-KR')}원 제외 중
                </span>
              )}
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

        {/* 3-Way Expense Breakdown Sub-bar with 1-Click Toggle */}
        <div className="px-3 sm:px-4 py-2.5 bg-slate-100/70 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[11px] font-black text-slate-600 flex items-center gap-1">
              <span>지출 유형 분석:</span>
            </span>
            <button
              type="button"
              onClick={() => setSelectedSpendingTypeDetail('recurring')}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-purple-100/80 active:scale-95 transition cursor-pointer text-left group"
              title="클릭하여 고정 예산 상세 내역 모아보기"
            >
              <span className="w-2 h-2 rounded-full bg-purple-500 group-hover:scale-125 transition shrink-0" />
              <span className="font-bold text-slate-700 text-[11px] group-hover:text-purple-950">
                📌 고정 예산:{' '}
                <strong className="text-purple-700 font-black">
                  {metrics.recurringExpense.toLocaleString('ko-KR')}원
                </strong>
                <span className="text-[10px] text-purple-600 ml-0.5">({metrics.recurringRate}%)</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSpendingTypeDetail('routine')}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-rose-100/80 active:scale-95 transition cursor-pointer text-left group"
              title="클릭하여 일반 일상 지출 상세 내역 모아보기"
            >
              <span className="w-2 h-2 rounded-full bg-rose-400 group-hover:scale-125 transition shrink-0" />
              <span className="font-bold text-slate-700 text-[11px] group-hover:text-rose-950">
                🛒 일반 일상 지출:{' '}
                <strong className="text-slate-900 font-black">
                  {metrics.routineExpense.toLocaleString('ko-KR')}원
                </strong>
                <span className="text-[10px] text-slate-500 ml-0.5">({metrics.routineRate}%)</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSpendingTypeDetail('special')}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-amber-100/80 active:scale-95 transition cursor-pointer text-left group"
              title="클릭하여 특별(비정기) 지출 상세 내역 모아보기"
            >
              <span className="w-2 h-2 rounded-full bg-amber-500 group-hover:scale-125 transition shrink-0" />
              <span className="font-bold text-slate-700 text-[11px] group-hover:text-amber-950">
                🛋️ 특별(비정기) 지출:{' '}
                <strong className="text-amber-800 font-black">
                  {metrics.specialExpense.toLocaleString('ko-KR')}원
                </strong>
                <span className="text-[10px] text-amber-700 ml-0.5">({metrics.specialRate}%)</span>
              </span>
            </button>
          </div>

          <div className="flex items-center gap-3 shrink-0 ml-auto">
            {/* 1-Click Toggle: Exclude / Include Special Expenses */}
            <button
              type="button"
              onClick={() => setExcludeSpecialExpense((prev) => !prev)}
              className={`px-2.5 py-1 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 border shadow-2xs whitespace-nowrap ${
                excludeSpecialExpense
                  ? 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600'
                  : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
              }`}
              title="침대, 가전, 이사 등 가끔 있는 대형 비정기 지출을 통계와 목록에서 제외하여 일반적인 일상 지출만 분리 확인"
            >
              <span>🛋️ 특별(비정기) 지출 제외</span>
              <span
                className={`w-7 h-3.5 rounded-full p-0.5 transition flex items-center ${
                  excludeSpecialExpense ? 'bg-amber-800 justify-end' : 'bg-slate-300 justify-start'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-white shadow-2xs block" />
              </span>
            </button>

            {/* Proportion Progress Bar (Purple, Rose, Amber) */}
            {metrics.totalExpense > 0 && (
              <div
                className="w-28 sm:w-36 h-2 bg-slate-200 rounded-full overflow-hidden flex shrink-0 cursor-pointer shadow-2xs"
                title="클릭하여 지출 유형별 상세 내역 모아보기"
              >
                <div
                  style={{ width: `${metrics.recurringRate}%` }}
                  onClick={() => setSelectedSpendingTypeDetail('recurring')}
                  className="bg-purple-600 h-full hover:opacity-75 transition cursor-pointer"
                  title={`클릭하여 고정 예산 내역 모아보기: ${metrics.recurringExpense.toLocaleString('ko-KR')}원 (${metrics.recurringRate}%)`}
                />
                <div
                  style={{ width: `${metrics.routineRate}%` }}
                  onClick={() => setSelectedSpendingTypeDetail('routine')}
                  className="bg-rose-400 h-full hover:opacity-75 transition cursor-pointer"
                  title={`클릭하여 일반 일상 지출 내역 모아보기: ${metrics.routineExpense.toLocaleString('ko-KR')}원 (${metrics.routineRate}%)`}
                />
                <div
                  style={{ width: `${metrics.specialRate}%` }}
                  onClick={() => setSelectedSpendingTypeDetail('special')}
                  className="bg-amber-500 h-full hover:opacity-75 transition cursor-pointer"
                  title={`클릭하여 특별 지출 내역 모아보기: ${metrics.specialExpense.toLocaleString('ko-KR')}원 (${metrics.specialRate}%)`}
                />
              </div>
            )}
          </div>
        </div>
      </div>


      {/* 2. Visual Spending Breakdown & Transactions Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category Breakdown Card (Collapsible) */}
        {isCategoryRankCollapsed ? (
          <div
            onClick={() => setIsCategoryRankCollapsed(false)}
            className="col-span-1 lg:col-span-3 p-3 sm:p-3.5 bg-white rounded-2xl border-2 border-slate-200 shadow-2xs flex items-center justify-between cursor-pointer hover:bg-slate-50 hover:border-blue-300 transition group"
            title="클릭하여 카테고리별 지출 순위 펼치기"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Tag className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-xs sm:text-sm font-black text-slate-900">카테고리별 지출 순위</span>
              <span className="text-[11px] font-bold text-slate-500 truncate">
                (총 {categoryStats.list.length}개 분류 · 합계 {categoryStats.totalExpense.toLocaleString('ko-KR')}원)
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsCategoryRankCollapsed(false);
              }}
              className="flex items-center gap-1 text-xs font-bold text-blue-600 group-hover:text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg transition shrink-0"
            >
              <span>순위 펼치기</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
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
                <button
                  type="button"
                  onClick={() => setIsCategoryRankCollapsed(true)}
                  className="px-1.5 py-0.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition cursor-pointer flex items-center gap-0.5 text-xs font-bold"
                  title="카테고리 순위 박스 접기"
                >
                  <span className="text-[11px]">접기</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Simple Clean Stacked Progress Bar */}
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex my-4">
              {categoryStats.list.slice(0, 8).map((cat) => (
                <div
                  key={cat.name}
                  onClick={() => setSelectedCategoryDetail(cat.name)}
                  style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }}
                  className="h-full hover:opacity-75 transition cursor-pointer"
                  title={`클릭하여 '${cat.name}' 내역 모아보기: ${cat.amount.toLocaleString('ko-KR')}원 (${cat.percentage}%)`}
                />
              ))}
            </div>

            {/* Category List */}
            <div className="flex-1 overflow-y-auto max-h-[380px] space-y-2 pr-1">
              {categoryStats.list.length === 0 && (
                <p className="text-xs text-slate-400 py-8 text-center font-medium">
                  기록된 지출 내역이 없습니다.
                </p>
              )}
              {categoryStats.list.map((cat) => (
                <div
                  key={cat.name}
                  onClick={() => setSelectedCategoryDetail(cat.name)}
                  className="flex items-center justify-between p-2 rounded-xl hover:bg-blue-50/80 active:scale-98 transition text-xs cursor-pointer group border border-transparent hover:border-blue-200"
                  title={`클릭하여 '${cat.name}' 지출 내역 모아보기`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 group-hover:scale-125 transition"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="font-bold text-slate-800 truncate group-hover:text-blue-700">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-black text-slate-900 group-hover:text-blue-700">
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
        )}

        {/* Transactions Table Card */}
        <div
          className={`${
            isCategoryRankCollapsed ? 'lg:col-span-3' : 'lg:col-span-2'
          } p-3.5 sm:p-5 bg-white rounded-2xl border-2 border-slate-200 shadow-sm flex flex-col relative transition-all duration-200`}
        >
          {/* 1. Compact Table Header and Actions */}
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-sm sm:text-base font-black text-slate-900 whitespace-nowrap">가계부 내역</h3>
              <span className="text-xs font-black px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap shrink-0">
                {filteredTransactions.length}건
              </span>
              {isRealGoogleConnected ? (
                <span
                  className="text-[10px] sm:text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1 whitespace-nowrap shrink-0"
                  title="Google 스프레드시트 실시간 동기화 중"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>실시간 연동</span>
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 whitespace-nowrap shrink-0">
                  샘플 모드
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {sheetTabs.length > 1 && onSelectSheetTab && (
                <div className="flex items-center gap-1 text-xs shrink-0">
                  <select
                    value={activeSheetTitle}
                    onChange={(e) => onSelectSheetTab(e.target.value)}
                    className="px-2 py-1 bg-white border border-blue-300 rounded-lg font-black text-xs text-blue-700 shadow-2xs cursor-pointer hover:border-blue-500 whitespace-nowrap"
                    title="시트 탭 선택"
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
                className="p-1 sm:px-2.5 sm:py-1 rounded-lg text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 transition flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                title="CSV로 내보내기"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span className="hidden sm:inline">CSV</span>
              </button>
            </div>
          </div>

          {/* 2. Tight Month Quick Filter Pills Bar */}
          <div className="py-2 flex items-center justify-between gap-1 border-b border-slate-100">
            <div
              ref={monthScrollContainerRef}
              className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none min-w-0 flex-1 scroll-smooth"
            >
              <button
                type="button"
                onClick={goToPrevMonth}
                className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer shrink-0"
                title="이전 달"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <button
                ref={selectedMonthFilter === 'all' ? activeMonthBadgeRef : undefined}
                onClick={() => setSelectedMonthFilter('all')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 ${
                  selectedMonthFilter === 'all'
                    ? 'bg-blue-600 text-white shadow-xs font-black'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                전체 ({transactions.length})
              </button>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const count = transactions.filter(
                  (t) => extractMonthFromDate(t.date, t.sheetTitle) === m
                ).length;
                const isSelected = selectedMonthFilter === String(m);
                return (
                  <button
                    key={m}
                    ref={isSelected ? activeMonthBadgeRef : undefined}
                    onClick={() => {
                      setSelectedMonthFilter(String(m));
                      if (onSelectSheetTab) {
                        onSelectSheetTab(`${m}월`);
                      }
                    }}
                    className={`px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-xs font-black'
                        : count > 0
                        ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 font-extrabold'
                        : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    {m}월{count > 0 ? ` (${count})` : ''}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={goToNextMonth}
                className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer shrink-0"
                title="다음 달"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 3. High-Efficiency Compact Search & Filters */}
          <div className="py-2 space-y-1.5">
            {/* Row 1: Search + Type + Sort + Selection */}
            <div className="flex items-center gap-1.5">
              {/* Search input with quick clear */}
              <div className="relative flex-1 min-w-[120px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="내용, 사용처, 분류 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-7 pr-6 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                    title="검색어 지우기"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Type Filter */}
              <select
                value={selectedTypeFilter}
                onChange={(e) => setSelectedTypeFilter(e.target.value as any)}
                className={`px-2 py-1.5 border rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap shrink-0 transition ${
                  selectedTypeFilter !== 'all'
                    ? 'bg-blue-50 border-blue-400 text-blue-800'
                    : 'bg-white border-slate-300 text-slate-700'
                }`}
              >
                <option value="all">전체 구분</option>
                <option value="expense">지출만</option>
                <option value="income">수입만</option>
                <option value="transfer">이체만</option>
              </select>

              {/* Sort Order Selector */}
              <select
                value={
                  sortField === 'recent'
                    ? (sortAsc ? 'recent_asc' : 'recent_desc')
                    : sortField === 'date'
                    ? (sortAsc ? 'date_asc' : 'date_desc')
                    : (sortAsc ? 'amount_asc' : 'amount_desc')
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'recent_desc') {
                    setSortField('recent');
                    setSortAsc(false);
                  } else if (val === 'recent_asc') {
                    setSortField('recent');
                    setSortAsc(true);
                  } else if (val === 'date_desc') {
                    setSortField('date');
                    setSortAsc(false);
                  } else if (val === 'date_asc') {
                    setSortField('date');
                    setSortAsc(true);
                  } else if (val === 'amount_desc') {
                    setSortField('amount');
                    setSortAsc(false);
                  } else if (val === 'amount_asc') {
                    setSortField('amount');
                    setSortAsc(true);
                  }
                }}
                className={`px-2 py-1.5 border rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap shrink-0 transition ${
                  sortField === 'date'
                    ? 'bg-blue-50 border-blue-400 text-blue-800'
                    : 'bg-white border-slate-300 text-slate-700'
                }`}
                title="정렬 기준"
              >
                <option value="date_desc">날짜순 (최신)</option>
                <option value="date_asc">날짜순 (과거)</option>
                <option value="recent_desc">최근 입력순</option>
                <option value="amount_desc">금액 높은순</option>
                <option value="amount_asc">금액 낮은순</option>
              </select>

              {/* Multi-Selection Mode Button */}
              <button
                type="button"
                onClick={() => {
                  if (isSelectionMode) {
                    setIsSelectionMode(false);
                    setSelectedIds(new Set());
                  } else {
                    setIsSelectionMode(true);
                  }
                }}
                className={`px-2.5 py-1.5 border rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition whitespace-nowrap shrink-0 ${
                  isSelectionMode
                    ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                    : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
                }`}
                title="다중 선택 모드 (또는 내역 길게 누르기)"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>{isSelectionMode ? '선택 취소' : '선택'}</span>
              </button>
            </div>

            {/* Row 2: Smooth Horizontal Scrollable Filter Chips (never wraps to 3rd or 4th row!) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-xs">
              {/* Category Filter Pill */}
              {allCategories.length > 0 && (
                <select
                  value={selectedCategoryFilter}
                  onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                  className={`px-2 py-1 border rounded-lg text-[11px] font-bold max-w-[120px] truncate cursor-pointer whitespace-nowrap shrink-0 transition ${
                    selectedCategoryFilter !== 'all'
                      ? 'bg-blue-600 text-white border-blue-700'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                  title="분류별 필터"
                >
                  <option value="all">모든 분류</option>
                  {allCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              )}

              {/* Expenditure Type Filter Pill */}
              <select
                value={selectedRecurringFilter}
                onChange={(e) => setSelectedRecurringFilter(e.target.value as any)}
                className={`px-2 py-1 border rounded-lg text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0 transition ${
                  selectedRecurringFilter !== 'all'
                    ? selectedRecurringFilter === 'special'
                      ? 'bg-amber-500 text-white border-amber-600'
                      : selectedRecurringFilter === 'recurring'
                      ? 'bg-purple-600 text-white border-purple-700'
                      : 'bg-blue-600 text-white border-blue-700'
                    : 'bg-white border-slate-200 text-slate-700'
                }`}
                title="지출 형태 필터링"
              >
                <option value="all">모든 지출형태</option>
                <option value="routine">🛒 일반 일상만</option>
                <option value="recurring">📌 고정 예산만</option>
                <option value="special">🛋️ 특별(비정기)만</option>
                <option value="variable">변동 전체(일상+특별)</option>
              </select>

              {/* 1-Click Toggle: Exclude Special Expense */}
              <button
                type="button"
                onClick={() => setExcludeSpecialExpense((prev) => !prev)}
                className={`px-2 py-1 border rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
                  excludeSpecialExpense
                    ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                }`}
                title="대형 비정기 지출 제외"
              >
                <span>🛋️ 특별 제외</span>
                <span
                  className={`w-5 h-2.5 rounded-full p-0.5 transition flex items-center ${
                    excludeSpecialExpense ? 'bg-amber-800 justify-end' : 'bg-slate-300 justify-start'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white block" />
                </span>
              </button>

              {/* Amount Sign Mode Toggle (₩+ 양수 통일 vs ± 부호 고정) */}
              <button
                type="button"
                onClick={() => {
                  const next = amountSignMode === 'positive' ? 'signed' : 'positive';
                  setAmountSignMode(next);
                  try {
                    localStorage.setItem('smart_money_amount_sign_mode', next);
                  } catch {}
                }}
                className={`px-2 py-1 border rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition whitespace-nowrap shrink-0 ${
                  amountSignMode === 'positive'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                    : 'bg-indigo-50 border-indigo-300 text-indigo-800 hover:bg-indigo-100'
                }`}
                title="금액 표기 전환"
              >
                <span className="font-mono font-black text-[10px]">
                  {amountSignMode === 'positive' ? '₩+' : '±'}
                </span>
                <span>{amountSignMode === 'positive' ? '양수 통일' : '부호 표기'}</span>
              </button>

              {/* Reset Filters Button (appears when any filter is active) */}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-2 py-1 border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-[11px] font-black transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 animate-in fade-in"
                  title="모든 필터 초기화"
                >
                  <X className="w-3 h-3" />
                  <span>필터 초기화</span>
                </button>
              )}

              {/* Subtle User Guide Hint */}
              {!isSelectionMode && filteredTransactions.length > 0 && (
                <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0 ml-auto hidden md:inline">
                  💡 내역 길게 눌러 다중선택 · 클릭하여 수정
                </span>
              )}
            </div>
          </div>

          {/* Clipboard Banner if transactions were copied to clipboard */}
          {clipboardItems.length > 0 && (
            <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between gap-2 text-xs mb-3 animate-in fade-in">
              <div className="flex items-center gap-2 min-w-0">
                <ClipboardPaste className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="font-bold text-indigo-950 truncate">
                  클립보드에 <strong>{clipboardItems.length}건</strong> 복사되어 대기 중입니다
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setTransactionsToCopy(clipboardItems);
                    setIsCopyModalOpen(true);
                  }}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-black shadow-xs transition active:scale-95 cursor-pointer flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  <span>현재 시트({activeSheetTitle})에 붙여넣기</span>
                </button>
                <button
                  type="button"
                  onClick={() => setClipboardItems([])}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                  title="클립보드 비우기"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Transactions List Table */}
          <div className="flex-1 overflow-x-hidden min-h-[320px]">
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
                  {isSelectionMode && <col className="w-7 sm:w-8" />}
                  <col className="w-11 sm:w-14" />
                  <col className="hidden sm:table-column sm:w-18 md:w-22" />
                  <col className="w-auto" />
                  <col className="w-20 sm:w-28 md:w-32" />
                  <col className="hidden sm:table-column sm:w-22 md:w-26" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-y-2 border-slate-200 font-black">
                    {/* Checkbox column - ONLY displayed when in selection mode */}
                    {isSelectionMode && (
                      <th className="py-2 px-0.5 text-center w-7 sm:w-8 animate-in fade-in duration-150">
                        <button
                          onClick={handleToggleSelectAll}
                          className="p-0.5 hover:text-blue-600 cursor-pointer"
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
                    <th
                      onClick={() => {
                        if (sortField === 'date') {
                          setSortAsc(!sortAsc);
                        } else {
                          setSortField('date');
                          setSortAsc(false);
                        }
                      }}
                      className="py-2 sm:py-2.5 px-1 sm:px-2.5 whitespace-nowrap cursor-pointer hover:text-blue-600 transition"
                      title="클릭하여 날짜순 정렬"
                    >
                      <div className="flex items-center gap-0.5">
                        <span>날짜</span>
                        {sortField === 'date' && (
                          <span className="text-[10px] text-blue-600">{sortAsc ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th className="py-2 sm:py-2.5 px-1.5 whitespace-nowrap hidden sm:table-cell">분류</th>
                    <th className="py-2 sm:py-2.5 px-1.5 sm:px-2.5 text-slate-900 font-black">내용 / 사용처</th>
                    <th
                      onClick={() => {
                        if (sortField === 'amount') {
                          setSortAsc(!sortAsc);
                        } else {
                          setSortField('amount');
                          setSortAsc(false);
                        }
                      }}
                      className="py-2 sm:py-2.5 px-1 sm:px-2 pr-2 sm:pr-3 text-right whitespace-nowrap cursor-pointer hover:text-blue-600 transition"
                      title="클릭하여 금액순 정렬"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>금액</span>
                        <span className="text-[10px] font-normal text-slate-400">
                          ({amountSignMode === 'positive' ? '양수' : '부호'})
                        </span>
                        {sortField === 'amount' && (
                          <span className="text-[10px] text-blue-600">{sortAsc ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th className="py-2 sm:py-2.5 px-1 text-center whitespace-nowrap hidden sm:table-cell">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredTransactions.map((t) => {
                    const isSelected = selectedIds.has(t.id);
                    const hasSubItems = Boolean(t.subItems && t.subItems.length > 0);
                    const isTxRecurring = Boolean(
                      t.isRecurring ||
                      t.memo?.includes('[정기예산]') ||
                      t.memo?.includes('[고정지출]') ||
                      t.memo?.includes('[정기지출]')
                    );
                    const isTxSpecial = Boolean(
                      t.isSpecial ||
                      t.memo?.includes('[특별지출]') ||
                      t.memo?.includes('[비정기지출]')
                    );

                    // 1. When transaction has sub-items, render a cohesive "Bundle Box":
                    // The original merchant/item name is written ONLY ONCE in the box header,
                    // and every individual sub-item is shown cleanly underneath with full width!
                    if (hasSubItems && t.subItems && t.subItems.length > 0) {
                      const subItemsSum = t.subItems.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
                      const remainder = t.amount - subItemsSum;

                      return (
                        <React.Fragment key={t.id}>
                          {/* 묶음 박스 상단 헤더: 원래 항목 이름(쿠팡, 이마트 등)을 상단에 1회만 표시 */}
                          <tr
                            onClick={() => handleOpenEditModal(t)}
                            className="bg-blue-100/70 border-t-2 border-l-4 border-r-2 border-blue-500 font-bold select-none cursor-pointer hover:bg-blue-200/60 transition"
                            title="클릭하여 묶음 전체 및 세부 항목 일괄 수정"
                          >
                            {/* Checkbox cell */}
                            {isSelectionMode && (
                              <td className="py-2 sm:py-2.5 px-1 text-center w-8 sm:w-9">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleSelectOne(t.id);
                                  }}
                                  className="p-1 hover:text-blue-600 cursor-pointer"
                                >
                                  {isSelected ? (
                                    <CheckSquare className="w-4 h-4 text-blue-600" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
                                  )}
                                </button>
                              </td>
                            )}

                            {/* 날짜 */}
                            <td className="py-2 sm:py-2.5 px-1 sm:px-2.5 text-blue-950 font-mono text-[11px] sm:text-xs whitespace-nowrap font-black align-middle">
                              {formatShortDate(t.date)}
                            </td>

                            {/* 분류 */}
                            <td className="py-2 sm:py-2.5 px-1.5 whitespace-nowrap hidden sm:table-cell align-middle">
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCategoryDetail(t.category);
                                }}
                                className="font-bold text-blue-900 text-xs px-2 py-0.5 rounded-md bg-blue-200/90 border border-blue-300 block truncate max-w-full whitespace-nowrap hover:bg-blue-300 transition cursor-pointer"
                                title="클릭하여 이 카테고리 내역 모아보기"
                              >
                                {t.category}
                              </span>
                            </td>

                            {/* 내용 / 사용처: 원래 항목 이름(쿠팡, 마트 등)을 1회만 큼직하게 표기 */}
                            <td className="py-2 sm:py-2.5 px-1.5 sm:px-2.5 min-w-0 align-middle">
                              <div className="flex flex-col justify-center min-w-0">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-sm shrink-0">
                                    {isTxSpecial ? '🛋️' : isTxRecurring ? '📌' : '🛒'}
                                  </span>
                                  {/* 결제수단 한 글자 배지 (신/체/현/페/기) */}
                                  {(() => {
                                    const payBadge = getPaymentGroupBadge(t.paymentMethod);
                                    if (!payBadge) return null;
                                    return (
                                      <span
                                        className={`w-4.5 h-4.5 min-w-[18px] text-[10px] font-black rounded flex items-center justify-center shrink-0 border cursor-help shadow-2xs ${payBadge.colorClass}`}
                                        title={`결제수단: ${t.paymentMethod} (${payBadge.label})`}
                                      >
                                        {payBadge.char}
                                      </span>
                                    );
                                  })()}
                                  <span
                                    className={`font-black text-xs sm:text-sm truncate min-w-0 flex-1 ${
                                      isTxSpecial
                                        ? 'text-amber-800 font-black'
                                        : isTxRecurring
                                        ? 'text-purple-700 font-black'
                                        : 'text-blue-950'
                                    }`}
                                    title={
                                      isTxSpecial
                                        ? `${t.description} (특별·비정기 지출)`
                                        : isTxRecurring
                                        ? `${t.description} (고정 지출)`
                                        : t.description
                                    }
                                  >
                                    {t.description}
                                  </span>
                                </div>

                                {/* 모바일 보조 라인: 분류 태그 & 묶음 세부 품목 개수 */}
                                <div className="sm:hidden flex items-center gap-1.5 mt-0.5 text-[10px] text-blue-900">
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedCategoryDetail(t.category);
                                    }}
                                    className="font-bold text-blue-900 px-1.5 py-0.2 rounded bg-blue-200/90 border border-blue-300 shrink-0 whitespace-nowrap hover:bg-blue-300 transition cursor-pointer"
                                    title="클릭하여 이 카테고리 내역 모아보기"
                                  >
                                    {t.category}
                                  </span>
                                  <span className="text-[10px] font-bold text-blue-700/80">
                                    세부품목 {t.subItems.length}개
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* 금액 (묶음 전체 총액) */}
                            <td className="py-2 sm:py-2.5 px-1 sm:px-2 pr-2 sm:pr-3 text-right whitespace-nowrap align-middle">
                              <div className="inline-flex items-center gap-1 justify-end">
                                <span className="font-black text-xs sm:text-sm tracking-tight text-blue-950">
                                  {amountSignMode === 'signed' ? '-' : ''}
                                  {t.amount.toLocaleString('ko-KR')}원
                                </span>
                                <ChevronRight className="w-3.5 h-3.5 text-blue-400 sm:hidden shrink-0" />
                              </div>
                            </td>

                            {/* 관리 (Desktop Only) */}
                            <td className="py-2 sm:py-2.5 px-1 text-center whitespace-nowrap align-middle hidden sm:table-cell">
                              <div
                                className="inline-flex items-center gap-0.5 bg-blue-200/80 p-0.5 rounded-lg border border-blue-300 shadow-2xs"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleOpenCopyModal(t)}
                                  className="p-1 text-blue-900 hover:text-indigo-700 hover:bg-white rounded transition cursor-pointer"
                                  title="묶음 내역 복사 & 붙여넣기"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModal(t)}
                                  className="p-1 text-blue-950 hover:text-blue-950 hover:bg-white rounded transition cursor-pointer font-bold"
                                  title="묶음 전체 및 세부 항목 수정"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteModalTx(t)}
                                  className="p-1 text-rose-700 hover:text-rose-900 hover:bg-white rounded transition cursor-pointer"
                                  title="묶음 삭제"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* 세부 항목 행들: 원래 항목명(쿠팡 등)을 중복 표기하지 않아 내용이 잘리지 않고 넓게 표시됨 */}
                          {t.subItems.map((sub, sIdx) => {
                            const isLastSub = sIdx === t.subItems!.length - 1 && remainder <= 0;
                            const subRowKey = sub.id ? `${t.id}-${sub.id}` : `${t.id}-sub-${sIdx}`;

                            return (
                              <tr
                                key={subRowKey}
                                onClick={() => handleOpenEditModal(t)}
                                className={`bg-blue-50/25 border-l-4 border-r-2 border-blue-500 border-t border-t-blue-100 hover:bg-blue-100/50 transition select-none cursor-pointer ${
                                  isLastSub ? 'border-b-2 border-b-blue-500' : ''
                                }`}
                                title="클릭하여 묶음 세부 항목 수정"
                              >
                                {/* Checkbox cell */}
                                {isSelectionMode && (
                                  <td className="py-2 px-1 text-center w-8 sm:w-9 text-blue-400 text-xs font-bold">
                                    ↳
                                  </td>
                                )}

                                {/* 날짜 */}
                                <td className="py-2 px-1 sm:px-2.5 text-slate-400 font-mono text-[10px] sm:text-[11px] whitespace-nowrap align-middle">
                                  {formatShortDate(t.date)}
                                </td>

                                {/* 세부 품목의 개별 분류 */}
                                <td className="py-2 px-1.5 whitespace-nowrap hidden sm:table-cell align-middle">
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedCategoryDetail(sub.category || t.category);
                                    }}
                                    className="font-semibold text-slate-700 text-[11px] px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 block truncate max-w-full whitespace-nowrap hover:bg-blue-100 hover:text-blue-800 transition cursor-pointer"
                                    title="클릭하여 이 카테고리 내역 모아보기"
                                  >
                                    {sub.category || t.category}
                                  </span>
                                </td>

                                {/* 세부 품목명 (쿠팡 등 반복 태그 없이 전체 너비 사용) */}
                                <td className="py-2 px-1.5 sm:px-2.5 min-w-0 align-middle">
                                  <div className="flex flex-col justify-center min-w-0">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="text-blue-500 font-bold text-xs shrink-0">↳</span>
                                      <span
                                        className="font-bold text-slate-800 text-xs sm:text-sm truncate min-w-0 flex-1"
                                        title={
                                          sub.quantity && sub.quantity > 1 && sub.unitPrice
                                            ? `${sub.name} (${sub.quantity}개, 개당 ${sub.unitPrice.toLocaleString('ko-KR')}원)`
                                            : sub.name
                                        }
                                      >
                                        {sub.name}
                                      </span>
                                      {sub.quantity && sub.quantity > 1 ? (
                                        <span
                                          className="text-[10px] font-black text-blue-700 bg-blue-100/80 border border-blue-200 px-1.5 py-0.2 rounded shrink-0 whitespace-nowrap"
                                          title={
                                            sub.unitPrice
                                              ? `개당 ${sub.unitPrice.toLocaleString('ko-KR')}원`
                                              : undefined
                                          }
                                        >
                                          {sub.quantity}개
                                        </span>
                                      ) : null}
                                    </div>

                                    {/* 모바일 분류 태그 (보조 라인으로 이동하여 품목명이 잘리지 않게 함) */}
                                    <div className="sm:hidden flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-500">
                                      <span
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedCategoryDetail(sub.category || t.category);
                                        }}
                                        className="font-semibold text-slate-600 px-1.5 py-0.2 rounded bg-slate-100 border border-slate-200 shrink-0 whitespace-nowrap hover:bg-blue-100 hover:text-blue-800 transition cursor-pointer"
                                        title="클릭하여 이 카테고리 내역 모아보기"
                                      >
                                        {sub.category || t.category}
                                      </span>
                                    </div>
                                  </div>
                                </td>

                                {/* 세부 품목 금액 */}
                                <td className="py-2 px-1 sm:px-2 pr-2.5 sm:pr-3 text-right whitespace-nowrap align-middle">
                                  <div className="inline-flex items-center gap-1 justify-end">
                                    <span className="font-bold text-xs sm:text-sm tracking-tight text-slate-800">
                                      {amountSignMode === 'signed' ? '-' : ''}
                                      {sub.amount.toLocaleString('ko-KR')}원
                                    </span>
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 sm:hidden shrink-0" />
                                  </div>
                                </td>

                                {/* 관리 (Desktop Only) */}
                                <td className="py-2 px-1 text-center whitespace-nowrap align-middle hidden sm:table-cell">
                                  <div
                                    className="inline-flex items-center gap-0.5 bg-blue-100/80 p-0.5 rounded-lg border border-blue-200 shadow-2xs"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditModal(t)}
                                      className="p-1 text-blue-800 hover:text-blue-950 hover:bg-white rounded transition cursor-pointer"
                                      title="묶음 및 세부 항목 수정"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}

                          {/* 미할당 잔액이 남아있는 경우 잔액 표시 행 */}
                          {remainder > 0 && (
                            <tr
                              onClick={() => handleOpenEditModal(t)}
                              className="bg-amber-50/40 border-l-4 border-r-2 border-blue-500 border-t border-t-amber-200/70 border-b-2 border-b-blue-500 hover:bg-amber-100/40 transition select-none cursor-pointer"
                              title="클릭하여 미할당 잔액 세부 품목 추가"
                            >
                              {isSelectionMode && (
                                <td className="py-2 px-1 text-center w-8 sm:w-9 text-amber-500 text-xs font-bold">
                                  ↳
                                </td>
                              )}
                              <td className="py-2 px-1 sm:px-2.5 text-slate-400 font-mono text-[10px] sm:text-[11px] whitespace-nowrap align-middle">
                                {formatShortDate(t.date)}
                              </td>
                              <td className="py-2 px-1.5 whitespace-nowrap hidden sm:table-cell align-middle">
                                <span className="font-semibold text-amber-800 text-[11px] px-1.5 py-0.5 rounded bg-amber-100/90 border border-amber-300 block truncate max-w-full whitespace-nowrap">
                                  {t.category}
                                </span>
                              </td>
                              <td className="py-2 px-1.5 sm:px-2.5 min-w-0 align-middle">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-amber-500 font-bold text-xs shrink-0">↳</span>
                                  <span className="font-bold text-amber-900 text-xs sm:text-sm truncate min-w-0">
                                    기타 미할당 잔액 ({t.description})
                                  </span>
                                </div>
                              </td>
                              <td className="py-2 px-1 sm:px-2 pr-2.5 sm:pr-3 text-right whitespace-nowrap align-middle">
                                <div className="inline-flex items-center gap-1 justify-end">
                                  <span className="font-bold text-xs sm:text-sm tracking-tight text-amber-900">
                                    {amountSignMode === 'signed' ? '-' : ''}
                                    {remainder.toLocaleString('ko-KR')}원
                                  </span>
                                  <ChevronRight className="w-3.5 h-3.5 text-amber-400 sm:hidden shrink-0" />
                                </div>
                              </td>
                              <td className="py-2 px-1 text-center whitespace-nowrap align-middle hidden sm:table-cell">
                                <div
                                  className="inline-flex items-center gap-0.5 bg-amber-100/90 p-0.5 rounded-lg border border-amber-300 shadow-2xs"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditModal(t)}
                                    className="p-1 text-amber-800 hover:text-amber-950 hover:bg-white rounded transition cursor-pointer"
                                    title="미할당 잔액 세부 품목 지정"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    }

                    // 2. Regular single row for items without sub-items
                    const isIncome = t.type === 'income';

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
                        className={`transition cursor-pointer select-none group ${
                          isSelected
                            ? 'bg-blue-50/80 border-l-4 border-blue-600'
                            : isIncome
                            ? 'bg-emerald-50/30 hover:bg-emerald-50/60 border-l-4 border-emerald-500'
                            : 'hover:bg-blue-50/30'
                        }`}
                      >
                        {/* Checkbox cell - only in selection mode */}
                        {isSelectionMode && (
                          <td className="py-2 sm:py-2.5 px-1 text-center w-8 sm:w-9">
                            <button
                              type="button"
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
                          className={`py-2 sm:py-2.5 px-1 sm:px-2.5 font-mono text-[11px] sm:text-xs whitespace-nowrap font-bold align-middle ${
                            isIncome ? 'text-emerald-900' : 'text-slate-700'
                          }`}
                          title={`전체 일자: ${t.date}`}
                        >
                          {formatShortDate(t.date)}
                        </td>

                        {/* 분류 (Category) - visible on sm+ screens */}
                        <td className="py-2 sm:py-2.5 px-1.5 whitespace-nowrap hidden sm:table-cell align-middle">
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCategoryDetail(t.category);
                            }}
                            className={`font-bold text-xs px-2 py-0.5 rounded-md border block truncate max-w-full whitespace-nowrap transition cursor-pointer ${
                              isIncome
                                ? 'bg-emerald-100/90 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-blue-100 hover:text-blue-800 hover:border-blue-300'
                            }`}
                            title="클릭하여 이 카테고리 내역 모아보기"
                          >
                            {t.category}
                          </span>
                        </td>

                        {/* 내용 / 사용처 (Description) */}
                        <td className="py-2 sm:py-2.5 px-1.5 sm:px-2.5 min-w-0 align-middle">
                          <div className="flex flex-col justify-center min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {/* 결제수단 한 글자 배지 (신/체/현/페/기) */}
                              {(() => {
                                const payBadge = getPaymentGroupBadge(t.paymentMethod);
                                if (!payBadge) return null;
                                return (
                                  <span
                                    className={`w-4.5 h-4.5 min-w-[18px] text-[10px] font-black rounded flex items-center justify-center shrink-0 border cursor-help shadow-2xs ${payBadge.colorClass}`}
                                    title={`결제수단: ${t.paymentMethod} (${payBadge.label})`}
                                  >
                                    {payBadge.char}
                                  </span>
                                );
                              })()}

                              <span
                                className={`font-bold sm:font-black text-xs sm:text-sm truncate min-w-0 flex-1 ${
                                  isIncome
                                    ? 'text-emerald-950 font-black'
                                    : isTxSpecial
                                    ? 'text-amber-800 font-black'
                                    : isTxRecurring
                                    ? 'text-purple-700 font-black'
                                    : 'text-slate-900'
                                }`}
                                title={
                                  isIncome
                                    ? `${t.description} (입금 / 수입)`
                                    : isTxSpecial
                                    ? `${t.description} (특별·비정기 지출)`
                                    : isTxRecurring
                                    ? `${t.description} (고정 지출)`
                                    : t.description
                                }
                              >
                                {t.description}
                              </span>

                              {t.createdAt && t.createdAt > Date.now() - 600000 && (
                                <span className="text-[9px] font-black text-blue-700 bg-blue-100 px-1 py-0.2 rounded border border-blue-300 shrink-0 whitespace-nowrap">
                                  최신
                                </span>
                              )}
                              {isIncome && (
                                <span className="text-[9px] font-black text-emerald-800 bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300 shrink-0 whitespace-nowrap">
                                  입금
                                </span>
                              )}
                            </div>

                            {/* 모바일 보조 라인: 분류 태그 & 메모 */}
                            <div className="sm:hidden flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-500">
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCategoryDetail(t.category);
                                }}
                                className={`font-semibold px-1.5 py-0.2 rounded border shrink-0 whitespace-nowrap transition cursor-pointer ${
                                  isIncome
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-blue-100 hover:text-blue-800'
                                }`}
                                title="클릭하여 이 카테고리 내역 모아보기"
                              >
                                {t.category}
                              </span>
                              {t.memo && (
                                <span className="truncate max-w-[160px] text-slate-400" title={t.memo}>
                                  {t.memo}
                                </span>
                              )}
                            </div>

                            {/* 데스크탑 메모 (데스크탑은 분류 컬럼이 별도로 표시되므로 메모만 표기) */}
                            {t.memo && (
                              <div
                                className="hidden sm:block text-[10px] text-slate-400 truncate max-w-xs mt-0.5"
                                title={t.memo}
                              >
                                {t.memo}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 금액 (Amount) */}
                        <td className="py-2 sm:py-2.5 px-1 sm:px-2 pr-2 sm:pr-3 text-right whitespace-nowrap align-middle">
                          <div className="inline-flex items-center gap-1 justify-end">
                            <span
                              className={`font-black text-xs sm:text-sm tracking-tight ${
                                isIncome
                                  ? 'text-emerald-600 font-black'
                                  : t.type === 'transfer'
                                  ? 'text-sky-600'
                                  : 'text-slate-900'
                              }`}
                            >
                              {amountSignMode === 'signed'
                                ? (isIncome ? '+' : t.type === 'transfer' ? '' : '-')
                                : (isIncome ? '+' : '')}
                              {t.amount.toLocaleString('ko-KR')}원
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-300 sm:hidden shrink-0" />
                          </div>
                        </td>

                        {/* 관리 (Actions) - Desktop Only */}
                        <td className="py-2 sm:py-2.5 px-1 text-center whitespace-nowrap align-middle hidden sm:table-cell">
                          <div
                            className="inline-flex items-center gap-0.5 bg-slate-100/90 hover:bg-slate-100 p-0.5 rounded-lg border border-slate-200 shadow-2xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => handleOpenCopyModal(t)}
                              className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-white rounded transition cursor-pointer"
                              title="내역 복사 & 붙여넣기"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(t)}
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-white rounded transition cursor-pointer"
                              title="수정"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSubItemModalTx(t)}
                              className="hidden sm:inline-flex p-1 text-slate-500 hover:text-indigo-600 hover:bg-white rounded transition cursor-pointer"
                              title="품목별 세부내역 / 분할 관리"
                            >
                              <Layers className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteModalTx(t)}
                              className="p-1 text-slate-500 hover:text-rose-600 hover:bg-white rounded transition cursor-pointer"
                              title="삭제"
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
                  <>
                    <button
                      type="button"
                      onClick={handleOpenBatchCopyModal}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition active:scale-95"
                      title="선택한 내역을 복사하여 원하는 월 또는 날짜에 붙여넣습니다."
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>선택 복사 ({selectedIds.size}건)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsBatchDeleteModalOpen(true)}
                      className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition active:scale-95"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>선택 삭제</span>
                    </button>
                  </>
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

      {/* 5. Copy & Paste Modal (Duplicate single or multi transactions to any month/date) */}
      {isCopyModalOpen && onBatchCopyPaste && (
        <CopyPasteModal
          isOpen={isCopyModalOpen}
          onClose={() => {
            setIsCopyModalOpen(false);
            setTransactionsToCopy([]);
            setIsSelectionMode(false);
            setSelectedIds(new Set());
          }}
          transactionsToCopy={transactionsToCopy}
          currentSheetTitle={activeSheetTitle}
          sheetTabs={sheetTabs}
          onExecuteCopyPaste={onBatchCopyPaste}
          onSaveToClipboardOnly={(items) => {
            setClipboardItems(items);
            setIsSelectionMode(false);
            setSelectedIds(new Set());
          }}
        />
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
                    onClick={() => handleEditTypeChange('expense')}
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
                    onClick={() => handleEditTypeChange('income')}
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
                    onClick={() => handleEditTypeChange('transfer')}
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

              {/* 3. Amount Input with Formula Calculator & Quick Add */}
              <div>
                <div className="flex items-center justify-between mb-1.5 whitespace-nowrap">
                  <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                    <Calculator className="w-3.5 h-3.5 text-blue-600" />
                    <span>금액</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-500 font-medium">
                    직접 숫자나 수식(+, -, *, /, 괄호) 입력 가능
                  </span>
                </div>

                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-slate-500 select-none">
                    ₩
                  </span>
                  <input
                    type="text"
                    inputMode="text"
                    placeholder="0 (수식 입력 가능: 15000 + 4500, 3000 * 3)"
                    value={editAmountStr}
                    onChange={handleEditAmountChange}
                    onKeyDown={handleEditAmountKeyDown}
                    className="w-full pl-10 pr-24 py-3 bg-white border-2 border-slate-300 rounded-xl text-xl sm:text-2xl font-black text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-blue-600 transition"
                    required
                  />
                  {isEditFormula && editFormulaEval.isValid && editFormulaEval.value !== null && (
                    <button
                      type="button"
                      onClick={handleApplyEditFormula}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-black rounded-lg shadow-sm flex items-center gap-1 transition cursor-pointer"
                      title="계산 결과를 금액으로 확정"
                    >
                      <span>= 계산</span>
                    </button>
                  )}
                </div>

                {/* Real-time Formula Preview */}
                {isEditFormula && (
                  <div
                    className={`mt-2 p-2.5 rounded-xl border flex items-center justify-between text-xs transition animate-in fade-in duration-150 ${
                      editFormulaEval.isValid && editFormulaEval.value !== null
                        ? 'bg-blue-50/80 border-blue-200 text-blue-900'
                        : 'bg-amber-50/80 border-amber-200 text-amber-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-xs px-1.5 py-0.5 rounded bg-white/90 border border-current shadow-2xs">
                        수식
                      </span>
                      {editFormulaEval.isValid && editFormulaEval.value !== null ? (
                        <span className="font-bold">
                          계산 결과: <span className="text-base font-black text-blue-700">₩{editFormulaEval.formatted}원</span>
                          <span className="text-[11px] font-normal text-slate-500 ml-1.5">
                            (Enter 또는 [= 계산] 클릭 시 적용)
                          </span>
                        </span>
                      ) : (
                        <span className="font-medium text-amber-700">
                          {editFormulaEval.error || '수식 입력 중... (예: 15000 + 4500, (3000 * 2) + 1500)'}
                        </span>
                      )}
                    </div>
                    {editFormulaEval.isValid && editFormulaEval.value !== null && (
                      <button
                        type="button"
                        onClick={handleApplyEditFormula}
                        className="text-xs font-bold text-blue-700 hover:underline cursor-pointer shrink-0 ml-2"
                      >
                        적용하기
                      </button>
                    )}
                  </div>
                )}

                {/* Quick Amount Buttons */}
                <div className="flex items-center justify-between gap-1.5 mt-2">
                  <span className="text-[11px] font-bold text-slate-500">빠른 금액 추가:</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[10000, 30000, 50000, 100000].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleEditAddAmount(val)}
                        className="px-2.5 py-1 text-xs font-extrabold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg transition active:scale-95 cursor-pointer border border-slate-200 whitespace-nowrap"
                      >
                        +{val / 10000}만
                      </button>
                    ))}
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setEditAmountStr('');
                        setEditForm((prev) => ({ ...prev, amount: 0 }));
                      }}
                      className="p-1 text-xs font-bold text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer ml-1"
                      title="금액 지우기"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>
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

              {/* 4.5. Budget Classification in Edit Modal (고정 지출 & 특별 지출) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* 고정 지출 (정기 예산) */}
                <div
                  className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs transition ${
                    editForm.isRecurring
                      ? 'bg-purple-50/90 border-purple-300 text-purple-900 shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                    <input
                      type="checkbox"
                      checked={Boolean(editForm.isRecurring)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setEditForm((prev) => ({
                          ...prev,
                          isRecurring: checked,
                          isSpecial: checked ? false : prev.isSpecial,
                        }));
                      }}
                      className="w-4 h-4 text-purple-600 rounded border-purple-300 focus:ring-purple-500 cursor-pointer"
                    />
                    <span className="font-black text-xs flex items-center gap-1">
                      <span>📌 고정 지출 (정기 예산)</span>
                      {editForm.isRecurring && (
                        <span className="text-[10px] font-black text-purple-700 bg-purple-100 px-1 py-0.2 rounded border border-purple-200">
                          적용
                        </span>
                      )}
                    </span>
                  </label>

                  <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pl-1">
                    <span className="text-[10px] text-slate-400 font-bold shrink-0 hidden sm:inline">추천:</span>
                    {[
                      { name: '관리비', cat: '관리비_기타', pay: '자동이체' },
                      { name: '통신비', cat: '통신비', pay: '자동이체' },
                      { name: '보험료', cat: '보험료', pay: '자동이체' },
                      { name: '구독', cat: '구독', pay: '신용카드' },
                      { name: '대출', cat: '대출_원금', pay: '자동이체' },
                    ].map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          setEditForm((prev) => ({
                            ...prev,
                            isRecurring: true,
                            isSpecial: false,
                            description: prev.description || preset.name,
                            category: preset.cat,
                            paymentMethod: preset.pay,
                          }));
                        }}
                        className="px-2 py-0.5 bg-white hover:bg-purple-100 border border-slate-200 hover:border-purple-300 text-slate-600 hover:text-purple-900 rounded-lg text-[11px] font-bold transition shrink-0 cursor-pointer whitespace-nowrap"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 특별/비정기 지출 (침대, 가전, 이사, 여행 등) */}
                <div
                  className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs transition ${
                    editForm.isSpecial
                      ? 'bg-amber-50/90 border-amber-300 text-amber-900 shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                    <input
                      type="checkbox"
                      checked={Boolean(editForm.isSpecial)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setEditForm((prev) => ({
                          ...prev,
                          isSpecial: checked,
                          isRecurring: checked ? false : prev.isRecurring,
                        }));
                      }}
                      className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
                    />
                    <span className="font-black text-xs flex items-center gap-1">
                      <span>🛋️ 특별(비정기) 지출</span>
                      {editForm.isSpecial && (
                        <span className="text-[10px] font-black text-amber-700 bg-amber-100 px-1 py-0.2 rounded border border-amber-200">
                          적용
                        </span>
                      )}
                    </span>
                  </label>

                  <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pl-1">
                    <span className="text-[10px] text-slate-400 font-bold shrink-0 hidden sm:inline">추천:</span>
                    {[
                      { name: '침대/가구', cat: '생활용품', pay: '신용카드' },
                      { name: '가전제품', cat: '생활용품', pay: '신용카드' },
                      { name: '이사/수리', cat: '관리비_기타', pay: '계좌이체' },
                      { name: '여행비', cat: '여행비', pay: '신용카드' },
                      { name: '경조사', cat: '경조사', pay: '계좌이체' },
                    ].map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          setEditForm((prev) => ({
                            ...prev,
                            isSpecial: true,
                            isRecurring: false,
                            description: prev.description || preset.name,
                            category: preset.cat,
                            paymentMethod: preset.pay,
                          }));
                        }}
                        className="px-2 py-0.5 bg-white hover:bg-amber-100 border border-slate-200 hover:border-amber-300 text-slate-600 hover:text-amber-900 rounded-lg text-[11px] font-bold transition shrink-0 cursor-pointer whitespace-nowrap"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>


              {/* 5. Category Chips with Direct Input */}
              <div>

                <div className="flex items-center justify-between mb-1.5 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-black text-slate-700 flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5 text-blue-600" />
                      <span>
                        {editForm.type === 'income' ? '수입 분류' : editForm.type === 'transfer' ? '이체 분류' : '지출 분류'} ({editModalCategories.length}개)
                      </span>
                    </label>
                    <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                      지난달까지 빈도순
                    </span>
                  </div>
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
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1 bg-slate-50 p-2 rounded-xl border border-slate-200">
                    {editModalCategories.map((cat) => {
                      const stat = editCategoryStatsMap.get(cat);
                      const displayCount = stat?.displayCount || 0;
                      const label = stat?.displayLabel || '신규/미사용 분류';
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setEditForm({ ...editForm, category: cat })}
                          className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                            editForm.category === cat
                              ? editForm.type === 'expense'
                                ? 'bg-rose-600 text-white shadow-sm'
                                : editForm.type === 'income'
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'bg-sky-600 text-white shadow-sm'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-200'
                          }`}
                          title={label}
                        >
                          <span>{cat}</span>
                          {displayCount > 0 && (
                            <span
                              className={`text-[9px] font-bold px-1 rounded-sm ${
                                editForm.category === cat ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {displayCount}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 6. Payment Method Chips with Expand and Direct Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-black text-slate-700 flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                      <span>결제 수단 ({allPaymentMethods.length}개)</span>
                    </label>
                    {allPaymentMethods.length > 8 && (
                      <button
                        type="button"
                        onClick={() => setShowAllPaymentMethods(!showAllPaymentMethods)}
                        className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer flex items-center gap-0.5"
                      >
                        {showAllPaymentMethods ? (
                          <>
                            <span>접기</span>
                            <ChevronUp className="w-3 h-3" />
                          </>
                        ) : (
                          <>
                            <span>+{allPaymentMethods.length - 8}개 더보기</span>
                            <ChevronDown className="w-3 h-3" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {onOpenCategoryManager && (
                      <button
                        type="button"
                        onClick={onOpenCategoryManager}
                        className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-blue-600 cursor-pointer"
                      >
                        <Settings className="w-3 h-3" />
                        <span>관리</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setCustomPaymentInput(!customPaymentInput)}
                      className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                    >
                      {customPaymentInput ? '목록 선택' : '+ 직접 입력'}
                    </button>
                  </div>
                </div>

                {customPaymentInput && (
                  <div className="flex items-center gap-2 mb-2 whitespace-nowrap">
                    <input
                      type="text"
                      placeholder="새 결제 수단 직접 입력..."
                      value={newPaymentText}
                      onChange={(e) => setNewPaymentText(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold focus:border-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = newPaymentText.trim();
                        if (trimmed) {
                          setEditForm((prev) => ({ ...prev, paymentMethod: trimmed }));
                          if (onAddCustomPaymentMethod) onAddCustomPaymentMethod(trimmed);
                          setNewPaymentText('');
                          setCustomPaymentInput(false);
                        }
                      }}
                      className="px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 cursor-pointer shrink-0"
                    >
                      적용
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {(showAllPaymentMethods ? allPaymentMethods : allPaymentMethods.slice(0, 8)).map((pm) => {
                    const stat = paymentStatsMap.get(pm);
                    const displayCount = stat?.displayCount || 0;
                    const label = stat?.displayLabel || undefined;
                    const badge = getPaymentGroupBadge(pm);
                    const isSelected = editForm.paymentMethod === pm;
                    return (
                      <button
                        key={pm}
                        type="button"
                        onClick={() => setEditForm({ ...editForm, paymentMethod: pm })}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                        title={label || `${badge?.group || '결제수단'}`}
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
                        {displayCount > 0 && (
                          <span
                            className={`text-[9px] font-bold px-1 rounded-sm ${
                              isSelected ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {displayCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
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

                    <div className="space-y-2">
                      {editSubItems.map((item, idx) => (
                        <div
                          key={item.id}
                          className="p-2 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1.5 sm:space-y-0 sm:flex sm:items-center sm:gap-2 transition hover:border-blue-300"
                        >
                          {/* Top on mobile, left on desktop */}
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <span className="text-[10px] font-mono font-bold text-slate-400 w-4 text-center shrink-0">
                              {idx + 1}
                            </span>
                            <input
                              type="text"
                              placeholder="품목명 (예: 우유, 세제)"
                              value={item.name}
                              onChange={(e) => handleUpdateEditSubItem(item.id, 'name', e.target.value)}
                              className="flex-1 min-w-[85px] px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
                            />
                            <select
                              value={item.category || editForm.category || '식비'}
                              onChange={(e) => handleUpdateEditSubItem(item.id, 'category', e.target.value)}
                              className="w-20 sm:w-24 px-1.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 focus:bg-white focus:outline-none focus:border-blue-500 shrink-0"
                            >
                              {allCategories.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleRemoveEditSubItem(item.id)}
                              className="sm:hidden p-1 text-slate-400 hover:text-rose-600 rounded-md cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Bottom on mobile, right on desktop: 단가 × 수량 = 합계 */}
                          <div className="flex items-center justify-between sm:justify-end gap-1.5 pl-5 sm:pl-0 pt-1 sm:pt-0 border-t border-slate-100 sm:border-0 shrink-0">
                            {/* 단가 */}
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold text-slate-500 shrink-0">단가:</span>
                              <div className="w-18 sm:w-20 relative">
                                <input
                                  type="number"
                                  min="0"
                                  step="10"
                                  placeholder="단가"
                                  value={
                                    item.unitPrice ||
                                    (item.quantity && item.quantity > 0 && item.amount
                                      ? Math.round(item.amount / item.quantity)
                                      : item.amount || '')
                                  }
                                  onChange={(e) =>
                                    handleUpdateEditSubItem(
                                      item.id,
                                      'unitPrice',
                                      e.target.value ? Number(e.target.value) : 0
                                    )
                                  }
                                  className="w-full pl-1.5 pr-4 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 text-right focus:bg-white focus:outline-none focus:border-blue-500"
                                />
                                <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 select-none">
                                  원
                                </span>
                              </div>
                            </div>

                            <span className="text-xs text-slate-400 font-bold select-none">×</span>

                            {/* 수량 */}
                            <div className="flex items-center gap-0.5">
                              <span className="text-[10px] font-bold text-slate-500 shrink-0">수량:</span>
                              <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden shadow-2xs">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateEditSubItem(
                                      item.id,
                                      'quantity',
                                      Math.max(1, (item.quantity || 1) - 1)
                                    )
                                  }
                                  className="w-5 h-6 flex items-center justify-center text-xs text-slate-600 hover:bg-slate-100 active:bg-slate-200 cursor-pointer font-black select-none"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  max="999"
                                  value={item.quantity || 1}
                                  onChange={(e) =>
                                    handleUpdateEditSubItem(
                                      item.id,
                                      'quantity',
                                      e.target.value ? Number(e.target.value) : 1
                                    )
                                  }
                                  className="w-7 text-center text-xs font-black text-blue-700 bg-white py-0.5 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateEditSubItem(
                                      item.id,
                                      'quantity',
                                      (item.quantity || 1) + 1
                                    )
                                  }
                                  className="w-5 h-6 flex items-center justify-center text-xs text-slate-600 hover:bg-slate-100 active:bg-slate-200 cursor-pointer font-black select-none"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            <span className="text-xs text-slate-400 font-bold select-none">=</span>

                            {/* 합계 */}
                            <div className="w-20 sm:w-24 relative">
                              <input
                                type="number"
                                min="0"
                                step="10"
                                placeholder="합계"
                                value={item.amount || ''}
                                onChange={(e) =>
                                  handleUpdateEditSubItem(
                                    item.id,
                                    'amount',
                                    e.target.value ? Number(e.target.value) : 0
                                  )
                                }
                                className="w-full pl-1.5 pr-4 py-1 bg-blue-50/50 border border-blue-300 rounded-lg text-xs font-black text-blue-900 text-right focus:bg-white focus:outline-none focus:border-blue-500"
                              />
                              <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400 select-none">
                                원
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveEditSubItem(item.id)}
                              className="hidden sm:flex p-1 text-slate-400 hover:text-rose-600 rounded-md cursor-pointer shrink-0"
                              title="품목 삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
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
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSubmittingEdit}
                  onClick={() => setEditModalTx(null)}
                  className="px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 cursor-pointer"
                >
                  닫기
                </button>
                {editModalTx && (
                  <>
                    <button
                      type="button"
                      disabled={isSubmittingEdit}
                      onClick={() => {
                        const tx = editModalTx;
                        setEditModalTx(null);
                        handleOpenCopyModal(tx);
                      }}
                      className="px-3 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 cursor-pointer flex items-center gap-1"
                      title="이 내역 복사하기"
                    >
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>복사</span>
                    </button>
                    <button
                      type="button"
                      disabled={isSubmittingEdit}
                      onClick={() => {
                        const tx = editModalTx;
                        setEditModalTx(null);
                        setDeleteModalTx(tx);
                      }}
                      className="px-3 py-2.5 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 cursor-pointer flex items-center gap-1"
                      title="이 내역 삭제하기"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      <span>삭제</span>
                    </button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {editSubItems.filter((s) => s.name.trim().length > 0 || (Number(s.amount) || 0) > 0).length > 0 && (
                  <button
                    type="button"
                    disabled={isSubmittingEdit}
                    onClick={() => {
                      if (editModalTx) {
                        const parsedAmount =
                          parseInt(editAmountStr.replace(/[^0-9]/g, '') || '0', 10) ||
                          editModalTx.amount;
                        handleSplitTransaction(
                          {
                            ...editModalTx,
                            amount: parsedAmount,
                            category: editForm.category || editModalTx.category,
                            description: editForm.description?.trim() || editModalTx.description,
                            paymentMethod: editForm.paymentMethod || editModalTx.paymentMethod,
                          },
                          editSubItems
                        );
                      }
                    }}
                    className="px-4 py-2.5 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-600/25"
                    title="각 세부 품목을 개별 내역으로 분할하고 남은 금액은 기존 항목 잔여로 유지"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>✂️ 세부 항목별 개별 분할 저장</span>
                  </button>
                )}
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
        </div>
      )}

      {/* 6. Sub-Item Breakdown Modal (Coupang, Mart, etc.) */}
      {subItemModalTx && (
        <SubItemModal
          isOpen={Boolean(subItemModalTx)}
          transaction={subItemModalTx}
          onClose={() => setSubItemModalTx(null)}
          onSave={handleSaveSubItems}
          onSplitTransaction={handleSplitTransaction}
          availableCategories={allCategories}
        />
      )}

      {/* 7. Temporary Category Detail Drill-Down Modal */}
      {categoryModalData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedCategoryDetail(null)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs ring-2 ring-white/30"
                  style={{ backgroundColor: categoryModalData.color }}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-black truncate">
                      {categoryModalData.categoryName} 내역 모아보기
                    </h3>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/15 text-slate-200">
                      {selectedMonthFilter === 'all' ? '전체 기간' : `${selectedMonthFilter}월`}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-600/80 text-white">
                      총 {categoryModalData.items.length}건
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5 font-medium">
                    해당 카테고리의 모든 지출 거래 및 세부 품목 목록입니다.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedCategoryDetail(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition cursor-pointer shrink-0 ml-2"
                title="닫기 (ESC)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions Bar */}
            <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 text-xs flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-bold">카테고리 총 지출:</span>
                <span className="text-sm font-black text-rose-600">
                  {categoryModalData.totalAmount.toLocaleString('ko-KR')}원
                </span>
                {categoryModalData.items.length > 0 && (
                  <span className="text-[11px] text-slate-400 font-medium">
                    (건당 평균 {Math.round(categoryModalData.totalAmount / categoryModalData.items.length).toLocaleString('ko-KR')}원)
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedCategoryFilter(categoryModalData.categoryName);
                  setSelectedCategoryDetail(null);
                }}
                className="px-2.5 py-1 bg-white hover:bg-blue-50 border border-slate-300 hover:border-blue-400 text-blue-700 font-bold rounded-lg text-xs flex items-center gap-1 transition cursor-pointer shadow-2xs"
                title="메인 가계부 목록의 분류 필터를 이 카테고리로 변경"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>메인 목록에서 이 분류만 필터링</span>
              </button>
            </div>

            {/* Modal Body / Transactions List */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-2 flex-1">
              {categoryModalData.items.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-1">
                  <Tag className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-xs font-bold text-slate-500">
                    선택한 기간 동안 '{categoryModalData.categoryName}' 내역이 없습니다.
                  </p>
                  <p className="text-[11px] text-slate-400">
                    월 필터를 '전체'로 변경하면 다른 달의 내역도 확인할 수 있습니다.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {categoryModalData.items.map((item, idx) => {
                    return (
                      <div
                        key={`${item.tx.id}-${idx}`}
                        onClick={() => {
                          setSelectedCategoryDetail(null);
                          handleOpenEditModal(item.tx);
                        }}
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
                                <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded font-bold border border-blue-200">
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

                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                            {item.tx.paymentMethod && (
                              <span className="inline-flex items-center gap-1 text-slate-700 font-semibold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                {(() => {
                                  const b = getPaymentGroupBadge(item.tx.paymentMethod);
                                  if (!b) return null;
                                  return (
                                    <span className={`w-3.5 h-3.5 text-[9px] font-black rounded flex items-center justify-center shrink-0 ${b.colorClass}`}>
                                      {b.char}
                                    </span>
                                  );
                                })()}
                                <span>{item.tx.paymentMethod}</span>
                              </span>
                            )}
                            {item.tx.memo && (
                              <>
                                <span>•</span>
                                <span className="truncate max-w-[200px] text-slate-500">
                                  {item.tx.memo}
                                </span>
                              </>
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
                              setSelectedCategoryDetail(null);
                              handleOpenEditModal(item.tx);
                            }}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-100/60 transition cursor-pointer"
                            title="내역 수정"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
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
                목록 항목을 클릭하면 바로 수정 창이 열립니다.
              </span>
              <button
                type="button"
                onClick={() => setSelectedCategoryDetail(null)}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition cursor-pointer shadow-2xs"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Temporary Spending Type Detail Drill-Down Modal (고정예산, 일반지출, 특별지출) */}
      {spendingTypeModalData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedSpendingTypeDetail(null)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs ring-2 ring-white/30"
                  style={{ backgroundColor: spendingTypeModalData.color }}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-black truncate">
                      {spendingTypeModalData.icon} {spendingTypeModalData.title} 내역 모아보기
                    </h3>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/15 text-slate-200">
                      {selectedMonthFilter === 'all' ? '전체 기간' : `${selectedMonthFilter}월`}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-600/80 text-white">
                      총 {spendingTypeModalData.items.length}건
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5 font-medium">
                    {spendingTypeModalData.desc}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSpendingTypeDetail(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition cursor-pointer shrink-0 ml-2"
                title="닫기 (ESC)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions Bar */}
            <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 text-xs flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-bold">{spendingTypeModalData.title} 총액:</span>
                <span className="text-sm font-black text-rose-600">
                  {spendingTypeModalData.totalAmount.toLocaleString('ko-KR')}원
                </span>
                {spendingTypeModalData.items.length > 0 && (
                  <span className="text-[11px] text-slate-400 font-medium">
                    (건당 평균 {Math.round(spendingTypeModalData.totalAmount / spendingTypeModalData.items.length).toLocaleString('ko-KR')}원)
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedRecurringFilter(spendingTypeModalData.filterVal);
                  setSelectedSpendingTypeDetail(null);
                }}
                className="px-2.5 py-1 bg-white hover:bg-blue-50 border border-slate-300 hover:border-blue-400 text-blue-700 font-bold rounded-lg text-xs flex items-center gap-1 transition cursor-pointer shadow-2xs"
                title="메인 가계부 목록의 지출형태 필터를 이 유형으로 변경"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>메인 목록에서 이 지출형태만 필터링</span>
              </button>
            </div>

            {/* Modal Body / Transactions List */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-2 flex-1">
              {spendingTypeModalData.items.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-1">
                  <p className="text-2xl mb-1">{spendingTypeModalData.icon}</p>
                  <p className="text-xs font-bold text-slate-500">
                    선택한 기간 동안 '{spendingTypeModalData.title}' 내역이 없습니다.
                  </p>
                  <p className="text-[11px] text-slate-400">
                    월 필터를 '전체'로 변경하면 다른 달의 내역도 확인할 수 있습니다.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {spendingTypeModalData.items.map((item, idx) => {
                    return (
                      <div
                        key={`${item.tx.id}-${idx}`}
                        onClick={() => {
                          setSelectedSpendingTypeDetail(null);
                          handleOpenEditModal(item.tx);
                        }}
                        className="p-3 bg-white hover:bg-blue-50/60 rounded-xl border border-slate-200 hover:border-blue-300 transition flex items-center justify-between gap-3 text-xs cursor-pointer group shadow-2xs"
                        title="클릭하여 이 내역 수정"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-slate-500 text-[11px] font-bold">
                              {formatShortDate(item.tx.date)}
                            </span>
                            {item.category && (
                              <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded font-bold border border-slate-200">
                                {item.category}
                              </span>
                            )}
                            {item.isSubItem ? (
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded font-bold border border-blue-200">
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

                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                            {item.tx.paymentMethod && (
                              <span className="inline-flex items-center gap-1 text-slate-700 font-semibold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                {(() => {
                                  const b = getPaymentGroupBadge(item.tx.paymentMethod);
                                  if (!b) return null;
                                  return (
                                    <span className={`w-3.5 h-3.5 text-[9px] font-black rounded flex items-center justify-center shrink-0 ${b.colorClass}`}>
                                      {b.char}
                                    </span>
                                  );
                                })()}
                                <span>{item.tx.paymentMethod}</span>
                              </span>
                            )}
                            {item.tx.memo && (
                              <>
                                <span>•</span>
                                <span className="truncate max-w-[200px] text-slate-500">
                                  {item.tx.memo}
                                </span>
                              </>
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
                              setSelectedSpendingTypeDetail(null);
                              handleOpenEditModal(item.tx);
                            }}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-100/60 transition cursor-pointer"
                            title="내역 수정"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
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
                목록 항목을 클릭하면 바로 수정 창이 열립니다.
              </span>
              <button
                type="button"
                onClick={() => setSelectedSpendingTypeDetail(null)}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition cursor-pointer shadow-2xs"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

  );
};
