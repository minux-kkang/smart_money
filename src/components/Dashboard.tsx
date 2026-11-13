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
  LineChart,
} from 'lucide-react';


import {
  Transaction,
  TransactionType,
  formatShortDate,
  SubItem,
  CategoryItem,
  PaymentMethodItem,
  SheetAnalysisResult,
} from '../types/ledger';
import { SubItemModal } from './SubItemModal';
import { CopyPasteModal } from './CopyPasteModal';
import { DailyPaceComparisonModal } from './DailyPaceComparisonModal';
import { ExpenseInputForm } from './ExpenseInputForm';
import { YearDashboardData } from '../data/userLedgerData';
import { saveSubItemsForTransaction, serializeSubItemsToMemo } from '../services/subItemStorage';
import { getPaymentGroupBadge } from '../utils/paymentGroupUtils';
import {
  parseInstallmentMeta,
  loadInstallmentPlans,
  deleteInstallmentPlan,
  InstallmentPlan,
} from '../services/installmentStorage';

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
  analysis?: SheetAnalysisResult;
  spreadsheetTitle?: string;
  availableCategories?: string[];
  availablePaymentMethods?: string[];
  customCategories?: CategoryItem[];
  customPaymentMethods?: PaymentMethodItem[];
  onOpenCategoryManager?: () => void;
  onAddCustomCategory?: (name: string, type: TransactionType) => void;
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
  onBatchUpdateCategory?: (transactions: Transaction[], newCategory: string) => Promise<void>;
  onOpenQuickImportModal?: () => void;
  spreadsheetId?: string | null;
  onFetchMonthTransactions?: (monthNum: number) => Promise<Transaction[]>;
  yearData?: YearDashboardData;
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
  analysis,
  spreadsheetTitle = '',
  availableCategories = [],
  availablePaymentMethods = [],
  customCategories = [],
  customPaymentMethods,
  onOpenCategoryManager,
  onAddCustomCategory,
  onAddCustomPaymentMethod,
  onExportCurrentMonthToGoogleSheets,
  isExportingMonth = false,
  onMigrateSheetColumns,
  isMigratingColumns = false,
  onOpenMigrationAllMonthsModal,
  onBatchCopyPaste,
  onBatchUpdateCategory,
  onOpenQuickImportModal,
  spreadsheetId,
  onFetchMonthTransactions,
  yearData,
}) => {
  // Daily Pace Comparison Modal state (User request: 11월 총 지출 클릭 시 지난 달들과 일자별 지출 비교 그래프)
  const [isDailyPaceModalOpen, setIsDailyPaceModalOpen] = useState<boolean>(false);

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
    'all' | 'recurring' | 'routine' | 'special' | 'variable' | 'installment'
  >('all');
  const [isInstallmentModalOpen, setIsInstallmentModalOpen] = useState<boolean>(false);
  const [confirmDeletePlanId, setConfirmDeletePlanId] = useState<string | null>(null);
  const [installmentPlans, setInstallmentPlans] = useState<InstallmentPlan[]>(() =>
    loadInstallmentPlans(spreadsheetId)
  );

  React.useEffect(() => {
    setInstallmentPlans(loadInstallmentPlans(spreadsheetId));
    if (!isInstallmentModalOpen) setConfirmDeletePlanId(null);
  }, [spreadsheetId, transactions, isInstallmentModalOpen]);
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

  // Batch Category Modal State
  const [isBatchCategoryModalOpen, setIsBatchCategoryModalOpen] = useState(false);
  const [batchTargetCategory, setBatchTargetCategory] = useState('');
  const [batchCategoryCustom, setBatchCategoryCustom] = useState('');
  const [batchCategorySearch, setBatchCategorySearch] = useState('');
  const [isProcessingBatchCategory, setIsProcessingBatchCategory] = useState(false);

  // Edit Modal State (Unified with ExpenseInputForm)
  const [editModalTx, setEditModalTx] = useState<Transaction | null>(null);

  const resolvedCustomPaymentMethods = useMemo<PaymentMethodItem[]>(() => {
    if (customPaymentMethods && customPaymentMethods.length > 0) {
      return customPaymentMethods;
    }
    return availablePaymentMethods.map((name, i) => ({
      id: `pm_prop_${i}_${name}`,
      name,
      isVisible: true,
    }));
  }, [customPaymentMethods, availablePaymentMethods]);

  // Amount Display Sign Mode ('positive': 양수 통일 | 'signed': 지출- 수입+)
  const [amountSignMode, setAmountSignMode] = useState<'positive' | 'signed'>(() => {
    try {
      const saved = localStorage.getItem('smart_money_amount_sign_mode');
      if (saved === 'signed' || saved === 'positive') return saved;
    } catch {}
    return 'positive'; // Default to positive (카테고리/구분이 있으므로 음수 없이 양수 통일)
  });

  // Sub-Item Breakdown Modal State (Coupang, Mart, etc.)
  const [subItemModalTx, setSubItemModalTx] = useState<Transaction | null>(null);

  const handleSaveSubItems = async (updatedTx: Transaction) => {
    saveSubItemsForTransaction(updatedTx, updatedTx.subItems || []);
    await onEditTransaction(updatedTx);
    if (editModalTx && editModalTx.id === updatedTx.id) {
      setEditModalTx(updatedTx);
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


  // Unique categories for filter dropdown & sub-item modal (includes hidden customCategories)
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    customCategories.forEach((c) => {
      if (c.name) set.add(c.name);
    });
    transactions.forEach((t) => {
      if (t.category) set.add(t.category);
    });
    availableCategories.forEach((c) => {
      if (c) set.add(c);
    });
    return Array.from(set).filter(Boolean);
  }, [customCategories, transactions, availableCategories]);

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
          if (selectedRecurringFilter === 'installment' && !parseInstallmentMeta(t)) return false;
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

  // Merged installment tracker view (saved local plans + sheet-detected installment rows)
  const mergedInstallmentOverview = useMemo(() => {
    const now = new Date();
    const todayYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const sheetDiscoveredMap = new Map<
      string,
      {
        key: string;
        description: string;
        category: string;
        paymentMethod: string;
        total: number;
        rateLabel: string;
        isInterestFree: boolean;
        totalPrincipal?: number;
        startDate?: string;
        rows: Array<{ tx: Transaction; current: number; total: number }>;
      }
    >();

    transactions.forEach((t) => {
      const meta = parseInstallmentMeta(t);
      if (!meta) return;
      const baseDesc = (t.description || '').replace(/\s*\(할부\s*\d+\/\d+\)\s*$/, '').trim();
      const existing = sheetDiscoveredMap.get(meta.planKey);
      if (existing) {
        existing.rows.push({ tx: t, current: meta.current, total: meta.total });
      } else {
        sheetDiscoveredMap.set(meta.planKey, {
          key: meta.planKey,
          description: baseDesc || t.description,
          category: t.category,
          paymentMethod: t.paymentMethod || '',
          total: meta.total,
          rateLabel: meta.rateLabel || (meta.isInterestFree ? '무이자' : '유이자'),
          isInterestFree: meta.isInterestFree,
          totalPrincipal: meta.totalPrincipal,
          startDate: meta.startDate || t.date,
          rows: [{ tx: t, current: meta.current, total: meta.total }],
        });
      }
    });

    const matchedKeys = new Set<string>();
    const savedCards = installmentPlans.map((plan) => {
      const expectedKey = `${plan.description.trim()}__${plan.months}__${plan.startDate}`;
      const fallbackKey = `${plan.description.trim()}__${plan.months}`;
      if (sheetDiscoveredMap.has(expectedKey)) matchedKeys.add(expectedKey);
      if (sheetDiscoveredMap.has(fallbackKey)) matchedKeys.add(fallbackKey);

      const paidCount = plan.schedule.filter((s) => s.date <= todayYMD).length;
      const remainingCount = Math.max(0, plan.schedule.length - paidCount);
      const remainingAmount = plan.schedule
        .filter((s) => s.date > todayYMD)
        .reduce((acc, s) => acc + s.amount, 0);
      const monthlyAvg =
        plan.schedule.length > 0 ? Math.round(plan.totalPayable / plan.schedule.length) : 0;

      return {
        id: plan.id,
        isSavedPlan: true,
        plan,
        description: plan.description,
        category: plan.category,
        paymentMethod: plan.paymentMethod,
        startDate: plan.startDate,
        months: plan.months,
        annualInterestRate: plan.annualInterestRate,
        rateLabel: plan.annualInterestRate > 0 ? `연 ${plan.annualInterestRate}%` : '무이자',
        totalPrincipal: plan.totalPrincipal,
        totalInterest: plan.totalInterest,
        totalPayable: plan.totalPayable,
        monthlyAvg,
        paidCount,
        remainingCount,
        remainingAmount,
      };
    });

    const sheetOnlyCards = Array.from(sheetDiscoveredMap.values())
      .filter((item) => !matchedKeys.has(item.key))
      .map((item) => {
        const sortedRows = [...item.rows].sort((a, b) => a.current - b.current);
        const latestRow = sortedRows[sortedRows.length - 1];
        const avgAmt =
          sortedRows.length > 0
            ? Math.round(
                sortedRows.reduce((acc, r) => acc + r.tx.amount, 0) / sortedRows.length
              )
            : 0;
        const paidCount = Math.min(item.total, latestRow ? latestRow.current : sortedRows.length);
        const remainingCount = Math.max(0, item.total - paidCount);
        const totalEst = item.totalPrincipal || avgAmt * item.total;

        return {
          id: `sheet_${item.key}`,
          isSavedPlan: false,
          plan: null as InstallmentPlan | null,
          description: item.description,
          category: item.category,
          paymentMethod: item.paymentMethod,
          startDate: item.startDate || sortedRows[0]?.tx.date || '',
          months: item.total,
          annualInterestRate: 0,
          rateLabel: item.rateLabel,
          totalPrincipal: totalEst,
          totalInterest: 0,
          totalPayable: totalEst,
          monthlyAvg: avgAmt,
          paidCount,
          remainingCount,
          remainingAmount: avgAmt * remainingCount,
          sheetRows: sortedRows,
        };
      });

    const allCards = [...savedCards, ...sheetOnlyCards];
    const activeCards = allCards.filter((c) => c.remainingCount > 0);
    const totalRemainingAmount = activeCards.reduce((acc, c) => acc + c.remainingAmount, 0);
    const monthlyCommitment = activeCards.reduce((acc, c) => acc + c.monthlyAvg, 0);

    return {
      allCards,
      activeCount: activeCards.length,
      totalCount: allCards.length,
      totalRemainingAmount,
      monthlyCommitment,
    };
  }, [installmentPlans, transactions]);

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

  // Open Unified Edit Modal
  const handleOpenEditModal = (t: Transaction) => {
    setEditModalTx(t);
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

  // Direct Batch Category Update in Google Sheet & Local State
  const handleConfirmBatchCategory = async () => {
    const finalCategory = (batchCategoryCustom.trim() || batchTargetCategory).trim();
    if (!finalCategory) {
      alert('변경할 카테고리를 선택하거나 직접 입력해주세요.');
      return;
    }
    const targetMap = new Map<string, Transaction>();
    transactions.forEach((t) => {
      if (selectedIds.has(t.id)) targetMap.set(t.id, t);
    });
    filteredTransactions.forEach((t) => {
      if (selectedIds.has(t.id) && !targetMap.has(t.id)) targetMap.set(t.id, t);
    });
    const targets = Array.from(targetMap.values());
    if (targets.length === 0) {
      alert('선택된 항목을 찾을 수 없습니다. 다시 선택해주세요.');
      return;
    }

    setIsProcessingBatchCategory(true);
    try {
      const existsInCustom = customCategories.some(
        (c) => c.name.trim().toLowerCase() === finalCategory.toLowerCase()
      );
      if (!existsInCustom && onAddCustomCategory) {
        onAddCustomCategory(finalCategory, 'expense');
      }
      if (onBatchUpdateCategory) {
        await onBatchUpdateCategory(targets, finalCategory);
      } else {
        for (const t of targets) {
          await onEditTransaction({ ...t, category: finalCategory });
        }
      }
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      setIsBatchCategoryModalOpen(false);
      setBatchCategorySearch('');
      setBatchCategoryCustom('');
    } catch (err: any) {
      console.error('Batch category update failed:', err);
      alert(`카테고리 일괄 변경 중 오류가 발생했습니다: ${err?.message || err}`);
    } finally {
      setIsProcessingBatchCategory(false);
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
          {/* 지출 (Click to open Daily Pace Comparison Graph) */}
          <div
            onClick={() => setIsDailyPaceModalOpen(true)}
            className="px-2.5 sm:px-4 py-1 flex items-center justify-between min-w-0 cursor-pointer rounded-xl hover:bg-rose-50/80 active:scale-[0.98] transition group border border-transparent hover:border-rose-200"
            title="클릭하여 지난 달들과 일자별 지출 비교 그래프 보기 (특별 지출 제외)"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                <span className="text-[11px] sm:text-xs font-bold text-slate-500 group-hover:text-rose-700 truncate">
                  {activeSheetTitle} {excludeSpecialExpense ? '일상 총 지출 (특별 제외)' : '총 지출'}
                </span>
                <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold text-rose-600 bg-rose-100 group-hover:bg-rose-200 px-1.5 py-0.5 rounded-full transition ml-0.5 shrink-0">
                  <LineChart className="w-2.5 h-2.5" />
                  <span>일자별 비교</span>
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
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-100 group-hover:bg-rose-200 text-rose-600 flex items-center justify-center shrink-0 ml-1.5 shadow-2xs transition group-hover:scale-105">
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

        {/* 3-Way Expense Breakdown Sub-bar (2-row compact layout) */}
        <div className="px-3 sm:px-4 py-2.5 bg-slate-100/70 border-t border-slate-200/80 space-y-2 text-xs">
          {/* Row 1: 3-column equal split for spending types */}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center">
            {/* Col 1: Recurring */}
            <button
              type="button"
              onClick={() => setSelectedSpendingTypeDetail('recurring')}
              className="p-1.5 sm:p-2 rounded-xl bg-white/90 hover:bg-purple-50 border border-purple-200/60 shadow-2xs transition cursor-pointer text-center group flex flex-col items-center justify-center min-w-0"
              title="클릭하여 고정 예산 상세 내역 모아보기"
            >
              <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700 group-hover:text-purple-900 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                <span className="truncate">📌 고정 예산</span>
              </div>
              <div className="text-[11px] sm:text-xs font-black text-purple-700 mt-0.5 truncate w-full">
                {metrics.recurringExpense.toLocaleString('ko-KR')}원
                <span className="text-[10px] font-bold text-purple-600/80 ml-0.5 sm:ml-1">({metrics.recurringRate}%)</span>
              </div>
            </button>

            {/* Col 2: Routine */}
            <button
              type="button"
              onClick={() => setSelectedSpendingTypeDetail('routine')}
              className="p-1.5 sm:p-2 rounded-xl bg-white/90 hover:bg-rose-50 border border-rose-200/60 shadow-2xs transition cursor-pointer text-center group flex flex-col items-center justify-center min-w-0"
              title="클릭하여 일반 일상 지출 상세 내역 모아보기"
            >
              <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700 group-hover:text-rose-900 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                <span className="truncate">🛒 일반 일상</span>
              </div>
              <div className="text-[11px] sm:text-xs font-black text-slate-900 mt-0.5 truncate w-full">
                {metrics.routineExpense.toLocaleString('ko-KR')}원
                <span className="text-[10px] font-bold text-slate-500 ml-0.5 sm:ml-1">({metrics.routineRate}%)</span>
              </div>
            </button>

            {/* Col 3: Special */}
            <button
              type="button"
              onClick={() => setSelectedSpendingTypeDetail('special')}
              className="p-1.5 sm:p-2 rounded-xl bg-white/90 hover:bg-amber-50 border border-amber-200/60 shadow-2xs transition cursor-pointer text-center group flex flex-col items-center justify-center min-w-0"
              title="클릭하여 특별(비정기) 지출 상세 내역 모아보기"
            >
              <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700 group-hover:text-amber-900 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <span className="truncate">🛋️ 특별(비정기)</span>
              </div>
              <div className="text-[11px] sm:text-xs font-black text-amber-800 mt-0.5 truncate w-full">
                {metrics.specialExpense.toLocaleString('ko-KR')}원
                <span className="text-[10px] font-bold text-amber-600 ml-0.5 sm:ml-1">({metrics.specialRate}%)</span>
              </div>
            </button>
          </div>

          {/* Row 2: 1-Click Toggle & Proportion Progress Bar */}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            {/* 1-Click Toggle: Exclude / Include Special Expenses */}
            <button
              type="button"
              onClick={() => setExcludeSpecialExpense((prev) => !prev)}
              className={`px-2.5 py-1 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 border shadow-2xs whitespace-nowrap shrink-0 ${
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
                className="flex-1 max-w-[180px] sm:max-w-xs h-2.5 bg-slate-200 rounded-full overflow-hidden flex shrink-0 cursor-pointer shadow-2xs"
                title="클릭하여 지출 유형별 상세 내역 모아보기"
              >
                <div
                  style={{ width: `${metrics.recurringRate}%` }}
                  onClick={() => setSelectedSpendingTypeDetail('recurring')}
                  className="bg-purple-600 h-full hover:opacity-75 transition cursor-pointer"
                  title={`고정 예산: ${metrics.recurringExpense.toLocaleString('ko-KR')}원 (${metrics.recurringRate}%)`}
                />
                <div
                  style={{ width: `${metrics.routineRate}%` }}
                  onClick={() => setSelectedSpendingTypeDetail('routine')}
                  className="bg-rose-400 h-full hover:opacity-75 transition cursor-pointer"
                  title={`일반 일상 지출: ${metrics.routineExpense.toLocaleString('ko-KR')}원 (${metrics.routineRate}%)`}
                />
                <div
                  style={{ width: `${metrics.specialRate}%` }}
                  onClick={() => setSelectedSpendingTypeDetail('special')}
                  className="bg-amber-500 h-full hover:opacity-75 transition cursor-pointer"
                  title={`특별 지출: ${metrics.specialExpense.toLocaleString('ko-KR')}원 (${metrics.specialRate}%)`}
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
            className="col-span-1 lg:col-span-3 p-3 sm:p-3.5 bg-white rounded-2xl border-2 border-slate-200 shadow-2xs flex items-center justify-between cursor-pointer hover:bg-slate-50 hover:border-blue-300 transition group gap-2"
            title="클릭하여 카테고리별 지출 순위 펼치기"
          >
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
              <Tag className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-xs sm:text-sm font-black text-slate-900 whitespace-nowrap shrink-0">카테고리별 지출 순위</span>
              <span className="text-[11px] font-bold text-slate-500 truncate min-w-0 flex-1">
                (총 {categoryStats.list.length}개 분류 · 합계 {categoryStats.totalExpense.toLocaleString('ko-KR')}원)
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsCategoryRankCollapsed(false);
              }}
              className="flex items-center gap-1 text-xs font-bold text-blue-600 group-hover:text-blue-700 bg-blue-50 px-2 sm:px-2.5 py-1 rounded-lg transition shrink-0 whitespace-nowrap"
            >
              <span>순위 펼치기</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="lg:col-span-1 p-5 sm:p-6 bg-white rounded-2xl border-2 border-slate-200 shadow-sm flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Tag className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="whitespace-nowrap shrink-0">카테고리별 지출 순위</span>
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
          } p-3.5 sm:p-5 bg-white rounded-2xl border-2 border-slate-200 shadow-sm flex flex-col relative transition-all duration-200 w-full max-w-full overflow-hidden`}
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
            <div className="flex items-center gap-1.5 w-full">
              {/* Search input with quick clear */}
              <div className="relative flex-1 min-w-0">
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
                      : selectedRecurringFilter === 'installment'
                      ? 'bg-indigo-600 text-white border-indigo-700'
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
                <option value="installment">💳 할부 지출만</option>
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

              {/* Card Installment Tracker Modal Button */}
              <button
                type="button"
                onClick={() => setIsInstallmentModalOpen(true)}
                className={`px-2 py-1 border rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition whitespace-nowrap shrink-0 ${
                  mergedInstallmentOverview.totalCount > 0
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-800 hover:bg-indigo-100'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                title="카드 할부 내역 모아보기 및 잔여 회차 관리"
              >
                <CreditCard className="w-3 h-3 text-indigo-600" />
                <span>할부 현황</span>
                {mergedInstallmentOverview.totalCount > 0 && (
                  <span className="px-1 py-0.2 rounded bg-indigo-600 text-white text-[9px] font-black leading-none">
                    {mergedInstallmentOverview.totalCount}
                  </span>
                )}
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
                  <col className="w-24 sm:w-28 md:w-32" />
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
                  {filteredTransactions.map((t, idx) => {
                    const prevTx = idx > 0 ? filteredTransactions[idx - 1] : null;
                    const getDateGroupKey = (dateStr?: string): string => {
                      if (!dateStr) return '';
                      const short = formatShortDate(dateStr);
                      const yearMatch = String(dateStr).trim().match(/^(\d{4})/);
                      return yearMatch ? `${yearMatch[1]}-${short}` : short;
                    };
                    const showDateDivider = Boolean(
                      prevTx &&
                        sortField !== 'amount' &&
                        getDateGroupKey(prevTx.date) !== getDateGroupKey(t.date)
                    );
                    const dateDividerRow = showDateDivider ? (
                      <tr aria-hidden="true" className="pointer-events-none">
                        {isSelectionMode && (
                          <td className="p-0 border-0 bg-slate-100/90">
                            <div className="h-[3px] border-t-2 border-slate-400/75 bg-slate-100" />
                          </td>
                        )}
                        <td className="p-0 border-0 bg-slate-100/90">
                          <div className="h-[3px] border-t-2 border-slate-400/75 bg-slate-100" />
                        </td>
                        <td className="p-0 border-0 bg-slate-100/90 hidden sm:table-cell">
                          <div className="h-[3px] border-t-2 border-slate-400/75 bg-slate-100" />
                        </td>
                        <td className="p-0 border-0 bg-slate-100/90">
                          <div className="h-[3px] border-t-2 border-slate-400/75 bg-slate-100" />
                        </td>
                        <td className="p-0 border-0 bg-slate-100/90">
                          <div className="h-[3px] border-t-2 border-slate-400/75 bg-slate-100" />
                        </td>
                        <td className="p-0 border-0 bg-slate-100/90 hidden sm:table-cell">
                          <div className="h-[3px] border-t-2 border-slate-400/75 bg-slate-100" />
                        </td>
                      </tr>
                    ) : null;

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
                          {dateDividerRow}
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
                                  {(() => {
                                    const instMeta = parseInstallmentMeta(t);
                                    if (!instMeta) return null;
                                    return (
                                      <span
                                        className="text-[9px] font-black text-indigo-700 bg-indigo-100 px-1.5 py-0.2 rounded border border-indigo-300 shrink-0 whitespace-nowrap"
                                        title={`할부 ${instMeta.current}/${instMeta.total}${instMeta.rateLabel ? ` · ${instMeta.rateLabel}` : ''}`}
                                      >
                                        💳 {instMeta.current}/{instMeta.total}
                                      </span>
                                    );
                                  })()}
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

                            {/* 금액 (묶음 전체 총액) - 결제수단 배지([신]/[체]/[현]/[페]/[포])를 금액 앞에 배치 */}
                            <td className="py-2 sm:py-2.5 px-1 sm:px-2 pr-2.5 sm:pr-3 text-right whitespace-nowrap align-middle">
                              <div className="inline-flex items-center gap-1.5 justify-end">
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
                      <React.Fragment key={t.id}>
                        {dateDividerRow}
                        <tr
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
                              {(() => {
                                const instMeta = parseInstallmentMeta(t);
                                if (!instMeta) return null;
                                return (
                                  <span
                                    className="text-[9px] font-black text-indigo-700 bg-indigo-100 px-1.5 py-0.2 rounded border border-indigo-300 shrink-0 whitespace-nowrap"
                                    title={`카드 할부 ${instMeta.current}/${instMeta.total}${instMeta.rateLabel ? ` · ${instMeta.rateLabel}` : ''}${instMeta.totalPrincipal ? ` · 원금 ${instMeta.totalPrincipal.toLocaleString('ko-KR')}원` : ''}`}
                                  >
                                    💳 {instMeta.current}/{instMeta.total}
                                  </span>
                                );
                              })()}
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

                        {/* 금액 (Amount) - 금액 바로 앞에 [신]/[체]/[현]/[페]/[포] 결제수단 배지 배치 */}
                        <td className="py-2 sm:py-2.5 px-1 sm:px-2 pr-2.5 sm:pr-3 text-right whitespace-nowrap align-middle">
                          <div className="inline-flex items-center gap-1.5 justify-end">
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
                      </React.Fragment>
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
                      onClick={() => {
                        setBatchTargetCategory('');
                        setBatchCategoryCustom('');
                        setIsBatchCategoryModalOpen(true);
                      }}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition active:scale-95"
                      title="선택한 내역들의 카테고리를 한번에 일괄 변경합니다."
                    >
                      <Tag className="w-3.5 h-3.5" />
                      <span>카테고리 변경 ({selectedIds.size}건)</span>
                    </button>

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

      {/* 4-2. Batch Category Update Modal */}
      {isBatchCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border-2 border-indigo-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-indigo-100 flex items-center justify-between bg-indigo-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-600/20">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-black text-indigo-950">카테고리 일괄 변경</h4>
                  <p className="text-xs text-indigo-700 font-medium">
                    선택한 <strong className="font-black text-indigo-900">{selectedIds.size}개 항목</strong>의 분류를 한번에 변경합니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBatchCategoryModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Selected Items Preview */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  선택된 항목 미리보기 ({selectedIds.size}건)
                </label>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl max-h-36 overflow-y-auto space-y-1.5 text-xs">
                  {transactions
                    .filter((t) => selectedIds.has(t.id))
                    .slice(0, 10)
                    .map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-2 py-1 px-2 bg-white rounded-lg border border-slate-100">
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-mono text-slate-400 text-[11px] shrink-0">{t.date?.slice(5)}</span>
                          <span className="font-bold text-slate-800 truncate">{t.description}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 shrink-0 font-medium">
                            {t.category || '미분류'}
                          </span>
                        </div>
                        <span className="font-black text-slate-900 shrink-0 font-mono">
                          {t.amount.toLocaleString()}원
                        </span>
                      </div>
                    ))}
                  {selectedIds.size > 10 && (
                    <p className="text-[11px] text-center text-slate-400 font-bold py-1">
                      외 {selectedIds.size - 10}개 항목이 더 선택되었습니다.
                    </p>
                  )}
                </div>
              </div>

              {/* Target Category Selection */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <label className="text-xs font-black text-slate-700">
                    새로 적용할 카테고리 선택
                  </label>
                  <div className="relative">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={batchCategorySearch}
                      onChange={(e) => setBatchCategorySearch(e.target.value)}
                      placeholder="전체 분류 검색·추가"
                      className="w-44 pl-6 pr-6 py-1 bg-white border border-slate-300 rounded-lg text-[11px] font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600"
                    />
                    {batchCategorySearch && (
                      <button
                        type="button"
                        onClick={() => setBatchCategorySearch('')}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Global Categories Search & Chips */}
                {(() => {
                  const fallbackCats = [
                    '식비', '카페/간식', '생활용품', '주거/통신', '교통비', '쇼핑',
                    '문화/여가', '의료/건강', '교육', '용돈', '세금/이자', '기타',
                  ];
                  const q = batchCategorySearch.trim().toLowerCase();
                  const visibleList =
                    availableCategories && availableCategories.length > 0 ? availableCategories : fallbackCats;
                  const hiddenMap = new Map<string, boolean>();
                  customCategories.forEach((c) => {
                    if (!c.isVisible && c.name) hiddenMap.set(c.name, true);
                  });
                  const fullPool = Array.from(
                    new Set([
                      ...visibleList,
                      ...customCategories.map((c) => c.name),
                      ...(analysis?.detectedCategories || []).map((c) => c.name),
                      ...allCategories,
                      ...fallbackCats,
                    ])
                  ).filter(Boolean);
                  const displayList = q
                    ? fullPool.filter((c) => c.toLowerCase().includes(q))
                    : visibleList;
                  const hasExact = q ? fullPool.some((c) => c.toLowerCase() === q) : true;

                  return (
                    <div className="flex flex-wrap gap-1.5 mb-3 max-h-40 overflow-y-auto pr-1">
                      {displayList.map((cat) => {
                        const isSelected = batchTargetCategory === cat && !batchCategoryCustom;
                        const isHidden = hiddenMap.get(cat);
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              setBatchTargetCategory(cat);
                              setBatchCategoryCustom('');
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                              isSelected
                                ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400 ring-offset-1'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            <span>{cat}</span>
                            {isHidden && (
                              <span
                                className={`text-[9px] font-bold px-1 rounded-sm ${
                                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                숨김
                              </span>
                            )}
                          </button>
                        );
                      })}
                      {q && !hasExact && (
                        <button
                          type="button"
                          onClick={() => {
                            const newCat = batchCategorySearch.trim();
                            setBatchCategoryCustom(newCat);
                            setBatchTargetCategory('');
                            setBatchCategorySearch('');
                          }}
                          className="px-3 py-1.5 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white transition cursor-pointer flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>"{batchCategorySearch.trim()}" 새 분류 적용</span>
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/* Or Direct Input */}
                <div className="mt-2">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    또는 원하는 카테고리 직접 입력
                  </label>
                  <input
                    type="text"
                    value={batchCategoryCustom}
                    onChange={(e) => {
                      setBatchCategoryCustom(e.target.value);
                      if (e.target.value) setBatchTargetCategory('');
                    }}
                    placeholder="예: 자동차관리, 여행경비, 취미..."
                    className="w-full px-3.5 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-600"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-500">
                선택된 카테고리:{' '}
                <strong className="text-indigo-600 font-black">
                  {(batchCategoryCustom.trim() || batchTargetCategory) || '선택 안 됨'}
                </strong>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isProcessingBatchCategory}
                  onClick={() => setIsBatchCategoryModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={isProcessingBatchCategory || (!batchTargetCategory && !batchCategoryCustom.trim())}
                  onClick={handleConfirmBatchCategory}
                  className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 shadow-md shadow-indigo-600/20 active:scale-95 transition"
                >
                  {isProcessingBatchCategory ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>카테고리 변경 처리 중...</span>
                    </>
                  ) : (
                    <>
                      <Tag className="w-3.5 h-3.5" />
                      <span>
                        {selectedIds.size}건 카테고리 [{(batchCategoryCustom.trim() || batchTargetCategory) || '선택'}] 변경
                      </span>
                    </>
                  )}
                </button>
              </div>
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

      {/* 5. Edit Transaction Modal (Unified with ExpenseInputForm) */}
      {editModalTx && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-xs p-4 pt-10 sm:pt-14 animate-in fade-in duration-150 overflow-y-auto"
          onClick={() => setEditModalTx(null)}
        >
          <div
            className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border-2 border-slate-300 overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <ExpenseInputForm
              mode="edit"
              editingTransaction={editModalTx}
              analysis={analysis}
              activeSheetTitle={activeSheetTitle}
              spreadsheetTitle={spreadsheetTitle}
              spreadsheetId={spreadsheetId || undefined}
              isRealGoogleConnected={isRealGoogleConnected}
              onUpdateTransaction={async (updatedTx) => {
                await onEditTransaction(updatedTx);
                setEditModalTx(null);
              }}
              onDeleteTransactionFromEdit={(tx) => {
                setEditModalTx(null);
                setDeleteModalTx(tx);
              }}
              onCopyTransactionFromEdit={(tx) => {
                setEditModalTx(null);
                handleOpenCopyModal(tx);
              }}
              onSplitTransactionFromEdit={handleSplitTransaction}
              onClose={() => setEditModalTx(null)}
              isModal={true}
              customCategories={customCategories}
              customPaymentMethods={resolvedCustomPaymentMethods}
              onAddCustomCategory={onAddCustomCategory}
              onAddCustomPaymentMethod={onAddCustomPaymentMethod}
              onOpenCategoryManager={() => {
                setEditModalTx(null);
                onOpenCategoryManager?.();
              }}
              transactions={transactions}
              sheetTabs={sheetTabs}
              onFetchMonthTransactions={onFetchMonthTransactions}
            />
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

      {/* 9. Daily Pace Comparison Modal (Click 11월 총 지출 card) */}
      <DailyPaceComparisonModal
        isOpen={isDailyPaceModalOpen}
        onClose={() => setIsDailyPaceModalOpen(false)}
        currentMonthTransactions={transactions}
        activeSheetTitle={activeSheetTitle}
        spreadsheetId={spreadsheetId}
        onFetchMonthTransactions={onFetchMonthTransactions}
        yearData={yearData}
        onSelectSheetTab={onSelectSheetTab}
      />

      {/* 10. Card Installment Tracker Modal (카드 할부 내역 모아보기 / 관리) */}
      {isInstallmentModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setIsInstallmentModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border-2 border-indigo-200 overflow-hidden flex flex-col max-h-[88vh] animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/30 border border-indigo-400/50 text-white flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-black tracking-tight flex items-center gap-2">
                    <span>카드 할부 내역 모아보기</span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-indigo-500/40 border border-indigo-300/40">
                      총 {mergedInstallmentOverview.totalCount}건
                    </span>
                  </h4>
                  <p className="text-xs text-indigo-200 font-medium">
                    등록된 할부 원금, 이자율, 회차별 납부 현황 및 잔여 할부금을 한눈에 확인합니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsInstallmentModalOpen(false)}
                className="p-1.5 text-indigo-200 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
                title="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Summary KPI Strip */}
            <div className="grid grid-cols-3 gap-2 p-4 bg-indigo-50/70 border-b border-indigo-100 text-center">
              <div className="bg-white rounded-xl p-2.5 border border-indigo-100 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 block">진행 중 할부</span>
                <span className="text-sm sm:text-base font-black text-indigo-900">
                  {mergedInstallmentOverview.activeCount}건
                </span>
              </div>
              <div className="bg-white rounded-xl p-2.5 border border-indigo-100 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 block">월 평균 할부 부담</span>
                <span className="text-sm sm:text-base font-black text-blue-700">
                  {mergedInstallmentOverview.monthlyCommitment.toLocaleString('ko-KR')}원
                </span>
              </div>
              <div className="bg-white rounded-xl p-2.5 border border-indigo-100 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 block">잔여 총 할부액</span>
                <span className="text-sm sm:text-base font-black text-rose-600">
                  {mergedInstallmentOverview.totalRemainingAmount.toLocaleString('ko-KR')}원
                </span>
              </div>
            </div>

            {/* Installment Cards List */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1 bg-slate-50/60">
              {mergedInstallmentOverview.allCards.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-black text-slate-700">등록된 카드 할부 내역이 없습니다.</p>
                  <p className="text-xs text-slate-500">
                    지출 입력창 하단의 <strong>카드 할부 자동 분할</strong>을 켜고 등록하면 매월 시트에 자동 입력되며 이곳에서 관리할 수 있습니다.
                  </p>
                </div>
              ) : (
                mergedInstallmentOverview.allCards.map((item) => {
                  const progressPct = Math.min(100, Math.round((item.paidCount / Math.max(1, item.months)) * 100));
                  const now = new Date();
                  const todayYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3"
                    >
                      {/* Top Row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-black text-slate-900 truncate">
                              {item.description}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                                item.annualInterestRate > 0
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                              }`}
                            >
                              {item.months}개월 · {item.rateLabel}
                            </span>
                            {item.category && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">
                                {item.category}
                              </span>
                            )}
                            {item.paymentMethod && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold">
                                {item.paymentMethod}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-medium flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                            <span>시작일: {item.startDate || '-'}</span>
                            <span>•</span>
                            <span>원금: {item.totalPrincipal.toLocaleString('ko-KR')}원</span>
                            {item.totalInterest > 0 && (
                              <>
                                <span>•</span>
                                <span className="text-amber-700 font-bold">
                                  총 이자: +{item.totalInterest.toLocaleString('ko-KR')}원
                                </span>
                              </>
                            )}
                            <span>•</span>
                            <span className="font-bold text-slate-700">
                              월 평균 {item.monthlyAvg.toLocaleString('ko-KR')}원
                            </span>
                          </div>
                        </div>

                        {item.isSavedPlan && (
                          <div className="flex items-center gap-1 shrink-0">
                            {confirmDeletePlanId === item.id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = deleteInstallmentPlan(item.id, spreadsheetId);
                                    setInstallmentPlans(next);
                                    setConfirmDeletePlanId(null);
                                  }}
                                  className="px-2 py-1 text-[10.5px] font-black text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition cursor-pointer"
                                  title="구글 시트의 월별 내역은 유지되고 할부 추적 목록에서만 삭제됩니다"
                                >
                                  목록에서 제거
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeletePlanId(null)}
                                  className="px-2 py-1 text-[10.5px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                                >
                                  취소
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeletePlanId(item.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                title="할부 추적 목록에서 삭제"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span className="text-indigo-700">
                            진행률 {item.paidCount}/{item.months}회 ({progressPct}%)
                          </span>
                          <span className={item.remainingCount > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                            {item.remainingCount > 0
                              ? `잔여 ${item.remainingCount}회 · ${item.remainingAmount.toLocaleString('ko-KR')}원`
                              : '✓ 완납 완료'}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              item.remainingCount === 0 ? 'bg-emerald-500' : 'bg-indigo-600'
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Schedule Chips */}
                      {item.plan && item.plan.schedule.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {item.plan.schedule.map((sch) => {
                            const isPastOrToday = sch.date <= todayYMD;
                            return (
                              <span
                                key={sch.index}
                                className={`px-2 py-1 rounded-lg text-[10.5px] font-bold border flex items-center gap-1 ${
                                  isPastOrToday
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : sch.recordedInSheet
                                    ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                    : 'bg-slate-50 text-slate-500 border-slate-200'
                                }`}
                                title={`${sch.index}회차 (${sch.date}) · 원금 ${sch.principal.toLocaleString('ko-KR')}원${sch.interest > 0 ? ` + 이자 ${sch.interest.toLocaleString('ko-KR')}원` : ''} · ${sch.recordedInSheet ? '시트 반영됨' : '차년도 예정'}`}
                              >
                                <span>{isPastOrToday ? '✓' : '•'}</span>
                                <span>{sch.index}회</span>
                                <span className="font-mono">{sch.date.slice(2, 10)}</span>
                                <span>{sch.amount.toLocaleString('ko-KR')}원</span>
                                {!sch.recordedInSheet && (
                                  <span className="text-[9px] px-1 rounded bg-slate-200 text-slate-600">
                                    차년도
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-white border-t border-slate-200 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsInstallmentModalOpen(false);
                  setSelectedRecurringFilter('installment');
                }}
                className="px-3.5 py-1.5 rounded-xl text-xs font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition cursor-pointer"
              >
                💳 할부 내역만 필터로 보기
              </button>
              <button
                type="button"
                onClick={() => setIsInstallmentModalOpen(false)}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition cursor-pointer"
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
