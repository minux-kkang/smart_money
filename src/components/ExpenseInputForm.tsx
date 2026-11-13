import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Calendar,
  CreditCard,
  Tag,
  FileText,
  Sparkles,
  ArrowRight,
  Check,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  ArrowLeftRight,
  Info,
  X,
  Layers,
  Package,
  Trash2,
  Equal,
  Settings,
  Calculator,
  Repeat,
  ChevronDown,
  ChevronUp,
  Search,
  CheckSquare,
  Square,
  Loader2,
  Copy,
  CheckCircle2,
  Clock,
  Edit2,
} from 'lucide-react';
import {
  Transaction,
  TransactionType,
  SheetAnalysisResult,
  formatShortDate,
  CategoryItem,
  PaymentMethodItem,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_TRANSFER_CATEGORIES,
  DEFAULT_PAYMENT_METHODS,
  SubItem,
} from '../types/ledger';
import { serializeSubItemsToMemo, saveSubItemsForTransaction } from '../services/subItemStorage';
import {
  getSmartUsageFrequencyMap,
  sortCategoriesByPastFrequency,
  UsageFrequencyStats,
} from '../services/categoryManager';
import { evaluateMathFormula, containsFormula, sanitizeFormulaInput } from '../utils/mathFormula';
import { getPaymentGroupBadge } from '../utils/paymentGroupUtils';
import { extractMonthNumberFromTab } from '../services/googleSheets';
import {
  buildInstallmentMemoTag,
  calculateInstallmentSchedule,
  parseInstallmentMeta,
  saveInstallmentPlan,
  InstallmentPlan,
} from '../services/installmentStorage';

interface ExpenseInputFormProps {
  analysis?: SheetAnalysisResult;
  activeSheetTitle: string;
  spreadsheetTitle?: string;
  spreadsheetId?: string;
  isRealGoogleConnected: boolean;
  onAddTransaction?: (
    transaction: Omit<Transaction, 'id' | 'rowIndex'> & { sheetTitle?: string }
  ) => Promise<void>;
  onBatchAddTransactions?: (
    transactions: Array<Omit<Transaction, 'id' | 'rowIndex'> & { sheetTitle?: string }>
  ) => Promise<void>;
  mode?: 'create' | 'edit';
  editingTransaction?: Transaction | null;
  onUpdateTransaction?: (transaction: Transaction) => Promise<void>;
  onDeleteTransactionFromEdit?: (transaction: Transaction) => void;
  onCopyTransactionFromEdit?: (transaction: Transaction) => void;
  onSplitTransactionFromEdit?: (transaction: Transaction, subItems: SubItem[]) => Promise<void> | void;
  subtitleOverride?: string;
  onClose?: () => void;
  isModal?: boolean;
  customCategories?: CategoryItem[];
  customPaymentMethods?: PaymentMethodItem[];
  onAddCustomCategory?: (name: string, type: TransactionType) => void;
  onAddCustomPaymentMethod?: (name: string) => void;
  onOpenCategoryManager?: () => void;
  transactions?: Transaction[];
  sheetTabs?: Array<{ id: number; title: string }>;
  onFetchMonthTransactions?: (monthNum: number) => Promise<Transaction[]>;
  initialOpenImport?: boolean;
  initialDate?: string;
}

const stripMachineMemoTags = (rawMemo?: string): string => {
  if (!rawMemo) return '';
  return rawMemo
    .replace(/\[세부품목:[\s\S]*?\]/g, '')
    .replace(/\[할부:[^\]]*\]/g, '')
    .replace(/\[정기예산\]/g, '')
    .replace(/\[고정지출\]/g, '')
    .replace(/\[정기지출\]/g, '')
    .replace(/\[특별지출\]/g, '')
    .replace(/\[비정기지출\]/g, '')
    .trim();
};

export const ExpenseInputForm: React.FC<ExpenseInputFormProps> = ({
  analysis,
  activeSheetTitle,
  spreadsheetTitle = '',
  spreadsheetId,
  isRealGoogleConnected,
  onAddTransaction,
  onBatchAddTransactions,
  mode = 'create',
  editingTransaction = null,
  onUpdateTransaction,
  onDeleteTransactionFromEdit,
  onCopyTransactionFromEdit,
  onSplitTransactionFromEdit,
  subtitleOverride,
  onClose,
  isModal = false,
  customCategories,
  customPaymentMethods,
  onAddCustomCategory,
  onAddCustomPaymentMethod,
  onOpenCategoryManager,
  transactions = [],
  sheetTabs = [],
  onFetchMonthTransactions,
  initialOpenImport = false,
  initialDate,
}) => {
  const isEditMode = mode === 'edit' && Boolean(editingTransaction);
  const [type, setType] = useState<TransactionType>(() =>
    editingTransaction ? editingTransaction.type || 'expense' : 'expense'
  );
  const [amountStr, setAmountStr] = useState<string>(() =>
    editingTransaction && editingTransaction.amount > 0
      ? editingTransaction.amount.toLocaleString('ko-KR')
      : ''
  );
  const [splitSubItemsIntoSeparateTx, setSplitSubItemsIntoSeparateTx] = useState<boolean>(false);

  const formatLocalYMD = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const sheetStorageKey = `smart_money_last_entered_dates_${spreadsheetId || analysis?.spreadsheetId || 'default'}`;

  const getSavedEnteredDates = (): { lastDate?: string; byMonth?: Record<string, string> } => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(sheetStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {}
    return {};
  };

  const saveLastEnteredDate = (enteredDate: string) => {
    if (typeof window === 'undefined' || !/^\d{4}-\d{2}-\d{2}$/.test(enteredDate)) return;
    try {
      const existing = getSavedEnteredDates();
      const monthNum = parseInt(enteredDate.slice(5, 7), 10);
      const updated = {
        lastDate: enteredDate,
        byMonth: {
          ...(existing.byMonth || {}),
          ...(monthNum >= 1 && monthNum <= 12 ? { [String(monthNum)]: enteredDate } : {}),
        },
      };
      localStorage.setItem(sheetStorageKey, JSON.stringify(updated));
    } catch {}
  };

  // User request:
  // 1. If the user has previously entered a date (for the viewed month, or overall on non-month tabs), default to that date for seamless consecutive entries.
  // 2. Otherwise fall back to viewed month + topmost transaction's day (or today).
  const computeSmartDefaultDate = (): { date: string; isRemembered: boolean } => {
    if (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)) {
      return { date: initialDate, isRemembered: false };
    }

    // 1. Year (from spreadsheetTitle e.g. "2026_가계부" or activeSheetTitle or current calendar year)
    const yearMatch = spreadsheetTitle?.match(/20\d{2}/) || activeSheetTitle?.match(/20\d{2}/);
    const yearStr = yearMatch ? yearMatch[0] : String(new Date().getFullYear());

    // 2. Month (from activeSheetTitle e.g. "10월" -> 10)
    const extractedMonth = extractMonthNumberFromTab(activeSheetTitle);
    const viewedMonthNum = extractedMonth ?? new Date().getMonth() + 1;
    const monthStr = String(viewedMonthNum).padStart(2, '0');

    // 2-1. Check if the user has already entered a date before
    const saved = getSavedEnteredDates();
    if (extractedMonth !== null) {
      const savedForMonth = saved.byMonth?.[String(viewedMonthNum)];
      if (savedForMonth && /^\d{4}-\d{2}-\d{2}$/.test(savedForMonth) && savedForMonth.startsWith(`${yearStr}-`)) {
        return { date: savedForMonth, isRemembered: true };
      }
    } else if (saved.lastDate && /^\d{4}-\d{2}-\d{2}$/.test(saved.lastDate) && saved.lastDate.startsWith(`${yearStr}-`)) {
      return { date: saved.lastDate, isRemembered: true };
    }

    // 3. Day: Look for topmost transaction in this viewed month
    if (transactions && transactions.length > 0) {
      const monthTxs = transactions.filter((t) => {
        if (!t.date) return false;
        const md = t.date.match(/^(?:20\d{2}[-.\/])?0*(\d{1,2})[-.\/]/);
        if (md) {
          return parseInt(md[1], 10) === viewedMonthNum;
        }
        return true;
      });

      if (monthTxs.length > 0) {
        const topTx = monthTxs[0];
        const dMatch = topTx.date.match(/[-.\/](\d{1,2})(?:일)?$/) || topTx.date.match(/(\d{1,2})일/);
        if (dMatch) {
          const dNum = parseInt(dMatch[1], 10);
          if (dNum >= 1 && dNum <= 31) {
            const dayStr = String(dNum).padStart(2, '0');
            return { date: `${yearStr}-${monthStr}-${dayStr}`, isRemembered: false };
          }
        }
      }
    }

    // 4. Fallback: if viewing current calendar month, use today; otherwise today's day capped
    const today = new Date();
    if (today.getMonth() + 1 === viewedMonthNum && String(today.getFullYear()) === yearStr) {
      return { date: formatLocalYMD(today), isRemembered: false };
    }
    const safeDay = String(Math.min(today.getDate(), 28)).padStart(2, '0');
    return { date: `${yearStr}-${monthStr}-${safeDay}`, isRemembered: false };
  };

  const initialDefaultDateInfo = computeSmartDefaultDate();
  const [date, setDate] = useState<string>(() =>
    editingTransaction?.date ? editingTransaction.date : initialDefaultDateInfo.date
  );
  const [isRememberedDate, setIsRememberedDate] = useState<boolean>(() =>
    editingTransaction ? false : initialDefaultDateInfo.isRemembered
  );

  // Sync date when activeSheetTitle, initialDate, or spreadsheetId changes (create mode only)
  useEffect(() => {
    if (isEditMode) return;
    const info = computeSmartDefaultDate();
    setDate(info.date);
    setIsRememberedDate(info.isRemembered);
  }, [activeSheetTitle, initialDate, spreadsheetId, isEditMode]);

  const [description, setDescription] = useState<string>(() => editingTransaction?.description || '');
  const [category, setCategory] = useState<string>(() => editingTransaction?.category || '');
  const [paymentMethod, setPaymentMethod] = useState<string>(() => editingTransaction?.paymentMethod || '');
  const [memo, setMemo] = useState<string>(() => stripMachineMemoTags(editingTransaction?.memo));
  const [isRecurring, setIsRecurring] = useState<boolean>(() =>
    Boolean(
      editingTransaction &&
        (editingTransaction.isRecurring ||
          editingTransaction.memo?.includes('[정기예산]') ||
          editingTransaction.memo?.includes('[고정지출]') ||
          editingTransaction.memo?.includes('[정기지출]'))
    )
  );
  const [isSpecial, setIsSpecial] = useState<boolean>(() =>
    Boolean(
      editingTransaction &&
        (editingTransaction.isSpecial ||
          editingTransaction.memo?.includes('[특별지출]') ||
          editingTransaction.memo?.includes('[비정기지출]'))
    )
  );
  const [customCategoryInput, setCustomCategoryInput] = useState<boolean>(false);
  const [newCategoryText, setNewCategoryText] = useState<string>('');
  const [categorySearchQuery, setCategorySearchQuery] = useState<string>('');
  const [categoryActiveIndex, setCategoryActiveIndex] = useState<number>(0);
  const [showHiddenCategories, setShowHiddenCategories] = useState<boolean>(false);
  const [customPaymentInput, setCustomPaymentInput] = useState<boolean>(false);
  const [newPaymentText, setNewPaymentText] = useState<string>('');
  const [paymentSearchQuery, setPaymentSearchQuery] = useState<string>('');
  const [paymentActiveIndex, setPaymentActiveIndex] = useState<number>(0);
  const [showAllPaymentMethods, setShowAllPaymentMethods] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successAnimation, setSuccessAnimation] = useState<boolean>(false);

  // Card Installment (카드 할부 자동 분할) State - non-intrusive, collapsed by default
  const [showInstallmentPanel, setShowInstallmentPanel] = useState<boolean>(false);
  const [isInstallmentEnabled, setIsInstallmentEnabled] = useState<boolean>(false);
  const [installmentMonths, setInstallmentMonths] = useState<number>(3);
  const [installmentRateStr, setInstallmentRateStr] = useState<string>('0');

  useEffect(() => {
    if (type !== 'expense') {
      setIsInstallmentEnabled(false);
      setShowInstallmentPanel(false);
    }
  }, [type]);

  // Import (지난달 고정지출 & 내역 복사) State
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(Boolean(initialOpenImport));
  const [importTab, setImportTab] = useState<'fixed' | 'all'>('fixed');

  // Sync initialOpenImport changes
  useEffect(() => {
    if (initialOpenImport) {
      setIsImportModalOpen(true);
      setImportTab('fixed');
    }
  }, [initialOpenImport]);

  const currentMonthNum = React.useMemo(() => {
    const parsed = parseInt(activeSheetTitle.replace(/[^0-9]/g, ''), 10);
    return isNaN(parsed) || parsed < 1 || parsed > 12 ? new Date().getMonth() + 1 : parsed;
  }, [activeSheetTitle]);

  const defaultPrevMonthNum = React.useMemo(() => {
    return currentMonthNum === 1 ? 12 : currentMonthNum - 1;
  }, [currentMonthNum]);

  const [selectedSourceMonth, setSelectedSourceMonth] = useState<number>(defaultPrevMonthNum);
  const [importedTransactions, setImportedTransactions] = useState<Transaction[]>([]);
  const [isLoadingImport, setIsLoadingImport] = useState<boolean>(false);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());
  const [importSearchQuery, setImportSearchQuery] = useState<string>('');
  const [isBatchRegistering, setIsBatchRegistering] = useState<boolean>(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  // Sync default month on activeSheetTitle change
  useEffect(() => {
    setSelectedSourceMonth(defaultPrevMonthNum);
  }, [defaultPrevMonthNum]);

  // Recognizes fixed/recurring expenses based on flag, tags, category and description
  const isFixedOrRecurring = (t: Transaction): boolean => {
    if (t.isRecurring) return true;
    const memo = t.memo || '';
    if (
      memo.includes('[정기') ||
      memo.includes('[고정') ||
      memo.includes('정기') ||
      memo.includes('고정')
    ) {
      return true;
    }
    const cat = t.category || '';
    const recurringCats = [
      '주거/통신',
      '관리비',
      '통신비',
      '보험',
      '보험료',
      '보험/세금',
      '구독',
      '렌탈',
      '월세',
      '대출',
      '대출이자',
      '이자',
      '회비',
      '교육',
      '적금',
      '저축',
    ];
    if (recurringCats.some((c) => cat.includes(c))) return true;
    const desc = t.description || '';
    const recurringWords = [
      '관리비',
      '통신비',
      '인터넷',
      '휴대폰',
      '월세',
      '넷플릭스',
      '유튜브',
      '쿠팡와우',
      '네이버플러스',
      '보험',
      '국민연금',
      '건강보험',
      '적금',
      '대출이자',
      '정기결제',
      '정기구독',
      '렌탈료',
      '멤버십',
      '청약',
    ];
    return recurringWords.some((w) => desc.includes(w));
  };

  // Load transactions when Import Modal opens or selectedSourceMonth changes
  useEffect(() => {
    if (!isImportModalOpen) return;

    let isMounted = true;
    const loadSourceData = async () => {
      setIsLoadingImport(true);
      try {
        if (onFetchMonthTransactions) {
          const list = await onFetchMonthTransactions(selectedSourceMonth);
          if (isMounted) {
            setImportedTransactions(list || []);
            const recurringItems = (list || []).filter(isFixedOrRecurring);
            setSelectedImportIds(new Set(recurringItems.map((t) => t.id)));
          }
        } else if (transactions && transactions.length > 0) {
          if (isMounted) {
            setImportedTransactions(transactions);
            const recurringItems = transactions.filter(isFixedOrRecurring);
            setSelectedImportIds(new Set(recurringItems.map((t) => t.id)));
          }
        }
      } catch (err) {
        console.warn('Failed to load import transactions:', err);
      } finally {
        if (isMounted) setIsLoadingImport(false);
      }
    };

    loadSourceData();
    return () => {
      isMounted = false;
    };
  }, [isImportModalOpen, selectedSourceMonth, onFetchMonthTransactions, transactions]);

  // Target date mapping
  const calculateTargetDate = (originalDateStr?: string): string => {
    const curParts = date.split('-');
    const curYear = parseInt(curParts[0], 10) || new Date().getFullYear();
    const curMonth = parseInt(curParts[1], 10) || currentMonthNum;

    let day = 1;
    if (originalDateStr) {
      const match = originalDateStr.match(/(\d{1,2})$/);
      if (match) {
        day = parseInt(match[1], 10);
      }
    }
    const maxDay = new Date(curYear, curMonth, 0).getDate();
    const clampedDay = Math.min(Math.max(1, day), maxDay);

    return `${curYear}-${String(curMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
  };

  // 1-Click Load into Form
  const handleFillItemIntoForm = (t: Transaction) => {
    setDescription(t.description);
    setAmountStr(t.amount.toLocaleString('ko-KR'));
    setType(t.type || 'expense');
    setCategory(t.category);
    setPaymentMethod(t.paymentMethod || '');
    setMemo(t.memo || '');
    setIsRecurring(Boolean(t.isRecurring || isFixedOrRecurring(t)));
    const targetD = calculateTargetDate(t.date);
    setDate(targetD);
    if (t.subItems && t.subItems.length > 0) {
      setSubItems(t.subItems);
      setShowSubItemEntry(true);
    }
    setIsImportModalOpen(false);
    setImportNotice(`✨ [${t.description}] 내역이 입력창에 불러와졌습니다 (날짜: ${targetD})`);
    setTimeout(() => setImportNotice(null), 4000);
  };

  // Batch register multiple recurring expenses into the current month
  const handleBatchRegisterSelected = async () => {
    const selectedList = importedTransactions.filter((t) => selectedImportIds.has(t.id));
    if (selectedList.length === 0) {
      alert('등록할 항목을 1건 이상 선택해주세요.');
      return;
    }

    setIsBatchRegistering(true);
    try {
      const newItems = selectedList.map((t) => ({
        date: calculateTargetDate(t.date),
        type: t.type || 'expense',
        category: t.category,
        description: t.description,
        amount: t.amount,
        paymentMethod: t.paymentMethod || '',
        memo: t.memo || '',
        isRecurring: true,
        sheetTitle: targetMonth,
        subItems: t.subItems,
      }));

      if (onBatchAddTransactions) {
        await onBatchAddTransactions(newItems);
      } else if (onAddTransaction) {
        for (const item of newItems) {
          await onAddTransaction(item);
        }
      }

      setIsImportModalOpen(false);
      setImportNotice(`✅ ${newItems.length}건의 고정지출이 이번 달(${targetMonth})에 일괄 등록되었습니다!`);
      setTimeout(() => setImportNotice(null), 4000);
      if (onClose) {
        onClose();
      }
    } catch (err: any) {
      console.error('Batch add recurring error:', err);
      alert(`고정지출 일괄 등록 중 오류가 발생했습니다: ${err?.message || err}`);
    } finally {
      setIsBatchRegistering(false);
    }
  };

  // Detect if fixed tab has zero explicit matches and fell back to all transactions
  const isFallbackFixedList = React.useMemo(() => {
    if (importTab !== 'fixed' || importedTransactions.length === 0) return false;
    return importedTransactions.filter(isFixedOrRecurring).length === 0;
  }, [importTab, importedTransactions]);

  const displayImportItems = React.useMemo(() => {
    let list = importedTransactions;
    if (importTab === 'fixed') {
      const fixed = list.filter(isFixedOrRecurring);
      // Smart Fallback: if no items match explicit recurring filters, show all items so user can choose!
      list = fixed.length > 0 ? fixed : list;
    }
    if (importSearchQuery.trim()) {
      const q = importSearchQuery.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.description?.toLowerCase().includes(q) ||
          t.category?.toLowerCase().includes(q) ||
          t.memo?.toLowerCase().includes(q) ||
          t.paymentMethod?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [importedTransactions, importTab, importSearchQuery]);

  const handleToggleSelectAllImport = () => {
    const currentVisibleIds = displayImportItems.map((t) => t.id);
    const allSelected = currentVisibleIds.length > 0 && currentVisibleIds.every((id) => selectedImportIds.has(id));
    if (allSelected) {
      const next = new Set(selectedImportIds);
      currentVisibleIds.forEach((id) => next.delete(id));
      setSelectedImportIds(next);
    } else {
      const next = new Set(selectedImportIds);
      currentVisibleIds.forEach((id) => next.add(id));
      setSelectedImportIds(next);
    }
  };

  const selectedTotalImportAmount = React.useMemo(() => {
    return importedTransactions
      .filter((t) => selectedImportIds.has(t.id))
      .reduce((sum, t) => sum + (t.amount || 0), 0);
  }, [importedTransactions, selectedImportIds]);

  // Sub-items for composite purchases (Coupang, Mart, etc.)
  const [showSubItemEntry, setShowSubItemEntry] = useState<boolean>(() =>
    Boolean(editingTransaction?.subItems && editingTransaction.subItems.length > 0)
  );
  const [subItems, setSubItems] = useState<SubItem[]>(() =>
    editingTransaction?.subItems ? editingTransaction.subItems.map((s) => ({ ...s })) : []
  );

  // Sync all fields when editingTransaction changes in edit mode
  useEffect(() => {
    if (!isEditMode || !editingTransaction) return;
    const isRec = Boolean(
      editingTransaction.isRecurring ||
        editingTransaction.memo?.includes('[정기예산]') ||
        editingTransaction.memo?.includes('[고정지출]') ||
        editingTransaction.memo?.includes('[정기지출]')
    );
    const isSpec = Boolean(
      editingTransaction.isSpecial ||
        editingTransaction.memo?.includes('[특별지출]') ||
        editingTransaction.memo?.includes('[비정기지출]')
    );
    setType(editingTransaction.type || 'expense');
    setAmountStr(editingTransaction.amount > 0 ? editingTransaction.amount.toLocaleString('ko-KR') : '');
    setDate(editingTransaction.date || '');
    setIsRememberedDate(false);
    setDescription(editingTransaction.description || '');
    setCategory(editingTransaction.category || '');
    setPaymentMethod(editingTransaction.paymentMethod || '');
    setMemo(stripMachineMemoTags(editingTransaction.memo));
    setIsRecurring(isRec);
    setIsSpecial(isSpec);
    setSubItems(editingTransaction.subItems ? editingTransaction.subItems.map((s) => ({ ...s })) : []);
    setShowSubItemEntry(Boolean(editingTransaction.subItems && editingTransaction.subItems.length > 0));
    setCategorySearchQuery('');
    setPaymentSearchQuery('');
    setCustomCategoryInput(false);
    setNewCategoryText('');
    setCustomPaymentInput(false);
    setNewPaymentText('');
    setCategoryHighlighted(false);
  }, [isEditMode, editingTransaction]);

  const amountInputRef = useRef<HTMLInputElement>(null);
  const descInputRef = useRef<HTMLInputElement>(null);
  const categorySectionRef = useRef<HTMLDivElement>(null);
  const categorySearchInputRef = useRef<HTMLInputElement>(null);
  const paymentSectionRef = useRef<HTMLDivElement>(null);
  const paymentSearchInputRef = useRef<HTMLInputElement>(null);
  const memoInputRef = useRef<HTMLInputElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const [categoryHighlighted, setCategoryHighlighted] = useState<boolean>(false);

  const focusAndScroll = (
    el: HTMLElement | null | undefined,
    scrollTarget?: HTMLElement | null,
    block: ScrollLogicalPosition = 'center'
  ) => {
    if (!el) return;
    el.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      (scrollTarget || el).scrollIntoView({ behavior: 'smooth', block });
    });
  };

  // Focus amount input on modal open for rapid keyboard entry
  useEffect(() => {
    if (isModal && !initialOpenImport) {
      const timer = setTimeout(() => {
        amountInputRef.current?.focus({ preventScroll: true });
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isModal, initialOpenImport]);

  const subItemsSum = React.useMemo(() => {
    return subItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
  }, [subItems]);

  const handleAddSubItem = () => {
    setSubItems((prev) => [
      ...prev,
      {
        id: `form-sub-${Date.now()}-${prev.length}`,
        name: '',
        quantity: 1,
        unitPrice: 0,
        amount: 0,
        category: category || '식비',
      },
    ]);
  };

  const handleUpdateSubItem = (id: string, field: keyof SubItem, value: any) => {
    setSubItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        const updated = { ...item, [field]: value };

        if (field === 'quantity') {
          const qty = Math.max(1, Number(value) || 1);
          updated.quantity = qty;
          if (updated.unitPrice && updated.unitPrice > 0) {
            updated.amount = updated.unitPrice * qty;
          } else if (item.amount > 0) {
            const up = Math.round(item.amount / (item.quantity || 1));
            updated.unitPrice = up;
            updated.amount = up * qty;
          }
        } else if (field === 'unitPrice') {
          const up = Math.max(0, Number(value) || 0);
          const qty = updated.quantity && updated.quantity > 0 ? updated.quantity : 1;
          updated.unitPrice = up;
          updated.amount = up * qty;
        } else if (field === 'amount') {
          const amt = Math.max(0, Number(value) || 0);
          const qty = updated.quantity && updated.quantity > 0 ? updated.quantity : 1;
          updated.amount = amt;
          updated.unitPrice = qty > 0 ? Math.round(amt / qty) : amt;
        }

        return updated;
      })
    );
  };

  const handleRemoveSubItem = (id: string) => {
    setSubItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSyncAmountWithSubItems = () => {
    if (subItemsSum > 0) {
      setAmountStr(subItemsSum.toLocaleString('ko-KR'));
    }
  };

  // Automatically calculate target month from the selected date!
  const targetMonth = React.useMemo(() => {
    if (!date) return activeSheetTitle || '10월';
    const parts = date.split('-');
    if (parts.length >= 2) {
      const m = parseInt(parts[1], 10);
      if (!isNaN(m) && m >= 1 && m <= 12) {
        return `${m}월`;
      }
    }
    return activeSheetTitle || '10월';
  }, [date, activeSheetTitle]);

  // Category frequency stats map (smart recency: last month prioritized at start of month, current month dynamically boosted)
  const categoryStatsMap = React.useMemo(() => {
    return getSmartUsageFrequencyMap(transactions || [], date || activeSheetTitle, 'category');
  }, [transactions, date, activeSheetTitle]);

  const categoryFrequencyMap = React.useMemo(() => {
    const map = new Map<string, number>();
    categoryStatsMap.forEach((stat, key) => map.set(key, stat.score));
    return map;
  }, [categoryStatsMap]);

  // Categories resolved from custom settings or sheet, strictly filtered by type and sorted by frequency
  const { visibleCategories, hiddenCategories } = React.useMemo(() => {
    let list: CategoryItem[] = [];
    if (customCategories && customCategories.length > 0) {
      list = customCategories.filter((c) => {
        if (type === 'income') return c.type === 'income';
        if (type === 'transfer') return c.type === 'transfer';
        return c.type === 'expense' || !c.type;
      });
    } else {
      list = (analysis?.detectedCategories || [])
        .filter((c) => {
          if (type === 'income') return c.type === 'income';
          if (type === 'transfer') return c.type === 'transfer';
          return c.type === 'expense' || !c.type;
        })
        .map((c, i) => ({
          id: `det_${i}_${c.name}`,
          name: c.name,
          type: c.type,
          isVisible: true,
        }));
    }

    if (list.length === 0) {
      const defaults =
        type === 'income'
          ? DEFAULT_INCOME_CATEGORIES
          : type === 'transfer'
          ? DEFAULT_TRANSFER_CATEGORIES
          : DEFAULT_EXPENSE_CATEGORIES;

      list = defaults.map((name, i) => ({
        id: `def_${i}_${name}`,
        name,
        type,
        isVisible: true,
      }));
    }

    // In edit mode, ensure the currently assigned category is always visible in the pills list
    if (isEditMode && category && !list.some((c) => c.name === category)) {
      list = [
        ...list,
        {
          id: `edit_curr_${category}`,
          name: category,
          type,
          isVisible: true,
        },
      ];
    }

    const rawVisible = list.filter((c) => c.isVisible).map((c) => c.name);
    const rawHidden = list.filter((c) => !c.isVisible).map((c) => c.name);

    // Sort categories based on usage frequency up to last month!
    const sortedVisible = sortCategoriesByPastFrequency(
      rawVisible.length > 0 ? rawVisible : list.map((c) => c.name),
      categoryFrequencyMap
    );
    const sortedHidden = sortCategoriesByPastFrequency(rawHidden, categoryFrequencyMap);

    return {
      visibleCategories: sortedVisible,
      hiddenCategories: sortedHidden,
    };
  }, [customCategories, analysis?.detectedCategories, type, categoryFrequencyMap, isEditMode, category]);

  // Comprehensive searchable categories across visible, hidden, sheet-detected, history, defaults, and other types
  const allSearchableCategories = React.useMemo(() => {
    const result: Array<{ name: string; isHidden: boolean; otherType?: TransactionType }> = [];
    const seenCurrent = new Set<string>();

    const addCurrent = (rawName: string, isHidden: boolean) => {
      const name = rawName.trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (seenCurrent.has(key)) return;
      seenCurrent.add(key);
      result.push({ name, isHidden });
    };

    visibleCategories.forEach((name) => addCurrent(name, false));
    hiddenCategories.forEach((name) => addCurrent(name, true));

    // Detected from sheet for current type
    (analysis?.detectedCategories || []).forEach((c) => {
      const cType: TransactionType = c.type || 'expense';
      if (cType === type) {
        addCurrent(c.name, false);
      }
    });

    // Seen in transactions for current type
    (transactions || []).forEach((t) => {
      if ((t.type || 'expense') === type && t.category) {
        addCurrent(t.category, false);
      }
    });

    // Standard defaults for current type
    const defaults =
      type === 'income'
        ? DEFAULT_INCOME_CATEGORIES
        : type === 'transfer'
        ? DEFAULT_TRANSFER_CATEGORIES
        : DEFAULT_EXPENSE_CATEGORIES;
    defaults.forEach((name) => addCurrent(name, false));

    // Categories belonging to other types (searchable globally when typing)
    const seenOther = new Set<string>();
    const addOther = (rawName: string, catType: TransactionType, isHidden: boolean) => {
      const name = rawName.trim();
      if (!name) return;
      const lower = name.toLowerCase();
      if (seenCurrent.has(lower) || seenOther.has(`${catType}:${lower}`)) return;
      seenOther.add(`${catType}:${lower}`);
      result.push({ name, isHidden, otherType: catType });
    };

    (customCategories || []).forEach((c) => {
      const cType: TransactionType = c.type || 'expense';
      if (cType !== type) addOther(c.name, cType, !c.isVisible);
    });
    (analysis?.detectedCategories || []).forEach((c) => {
      const cType: TransactionType = c.type || 'expense';
      if (cType !== type) addOther(c.name, cType, false);
    });

    return result;
  }, [visibleCategories, hiddenCategories, analysis?.detectedCategories, transactions, customCategories, type]);

  // Filtered categories for inline search box (searches ALL categories without requiring '전체보기/숨김보기')
  const filteredCategoryOptions = React.useMemo(() => {
    const q = categorySearchQuery.trim().toLowerCase();
    if (!q) {
      return visibleCategories.map((name) => ({
        name,
        isHidden: false,
        otherType: undefined as TransactionType | undefined,
      }));
    }
    return allSearchableCategories
      .filter((item) => item.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aLower = a.name.toLowerCase();
        const bLower = b.name.toLowerCase();
        const aExact = aLower === q ? 0 : 1;
        const bExact = bLower === q ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        const aStarts = aLower.startsWith(q) ? 0 : 1;
        const bStarts = bLower.startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        const aOther = a.otherType ? 1 : 0;
        const bOther = b.otherType ? 1 : 0;
        if (aOther !== bOther) return aOther - bOther;
        if (a.isHidden !== b.isHidden) return a.isHidden ? 1 : -1;
        return 0;
      });
  }, [categorySearchQuery, visibleCategories, allSearchableCategories]);

  const hasExactCategoryMatch = React.useMemo(() => {
    const q = categorySearchQuery.trim().toLowerCase();
    if (!q) return true;
    return allSearchableCategories.some((c) => !c.otherType && c.name.toLowerCase() === q);
  }, [categorySearchQuery, allSearchableCategories]);

  useEffect(() => {
    setCategoryActiveIndex(0);
  }, [categorySearchQuery, type]);

  // Switch type and smoothly switch to the top frequency category of that type
  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);

    let list: CategoryItem[] = [];
    if (customCategories && customCategories.length > 0) {
      list = customCategories.filter((c) => {
        if (newType === 'income') return c.type === 'income';
        if (newType === 'transfer') return c.type === 'transfer';
        return c.type === 'expense' || !c.type;
      });
    } else {
      list = (analysis?.detectedCategories || [])
        .filter((c) => {
          if (newType === 'income') return c.type === 'income';
          if (newType === 'transfer') return c.type === 'transfer';
          return c.type === 'expense' || !c.type;
        })
        .map((c, i) => ({
          id: `det_${i}_${c.name}`,
          name: c.name,
          type: c.type,
          isVisible: true,
        }));
    }

    if (list.length === 0) {
      const defaults =
        newType === 'income'
          ? DEFAULT_INCOME_CATEGORIES
          : newType === 'transfer'
          ? DEFAULT_TRANSFER_CATEGORIES
          : DEFAULT_EXPENSE_CATEGORIES;
      list = defaults.map((name, i) => ({
        id: `def_${i}_${name}`,
        name,
        type: newType,
        isVisible: true,
      }));
    }

    const availableNames = list.filter((c) => c.isVisible).map((c) => c.name);
    const sorted = sortCategoriesByPastFrequency(
      availableNames.length > 0 ? availableNames : list.map((c) => c.name),
      categoryFrequencyMap
    );

    // If a category was previously chosen but doesn't exist in the new type, reset to empty (do not auto-select)
    if (category && !sorted.includes(category)) {
      setCategory('');
    }
  };


  // Track frequency of payment methods (smart recency: last month prioritized at start of month, current month dynamically boosted)
  const paymentStatsMap = React.useMemo(() => {
    return getSmartUsageFrequencyMap(transactions || [], date || activeSheetTitle, 'paymentMethod');
  }, [transactions, date, activeSheetTitle]);

  const paymentFrequencyMap = React.useMemo(() => {
    const map = new Map<string, number>();
    paymentStatsMap.forEach((stat, key) => map.set(key, stat.score));
    return map;
  }, [paymentStatsMap]);

  // Comprehensive resolved payment methods from all sources so none ever disappear
  const { allAvailablePaymentMethods, displayPaymentMethods, hiddenPaymentMethods, totalVisibleCount, hasMore } =
    React.useMemo(() => {
      const set = new Set<string>();

      // 1. Existing user custom payment methods
      if (customPaymentMethods && customPaymentMethods.length > 0) {
        customPaymentMethods.forEach((p) => {
          if (p.name && p.name.trim()) set.add(p.name.trim());
        });
      }

      // 2. All payment methods present in actual transactions
      if (transactions && transactions.length > 0) {
        transactions.forEach((t) => {
          if (t.paymentMethod && t.paymentMethod.trim()) set.add(t.paymentMethod.trim());
        });
      }

      // 3. Detected from sheet analysis
      if (analysis?.detectedPaymentMethods && analysis.detectedPaymentMethods.length > 0) {
        analysis.detectedPaymentMethods.forEach((p) => {
          if (p && p.trim()) set.add(p.trim());
        });
      }

      // 4. Default standard Korean payment methods
      DEFAULT_PAYMENT_METHODS.forEach((p) => set.add(p));

      // Current selected payment method should always be included
      if (paymentMethod && paymentMethod.trim()) {
        set.add(paymentMethod.trim());
      }

      // Sort by frequency of usage descending
      const sorted = Array.from(set).sort((a, b) => {
        const fA = paymentFrequencyMap.get(a) || 0;
        const fB = paymentFrequencyMap.get(b) || 0;
        if (fA !== fB) return fB - fA;
        return a.localeCompare(b);
      });

      const isHiddenMap = new Map<string, boolean>();
      if (customPaymentMethods) {
        customPaymentMethods.forEach((p) => {
          if (!p.isVisible) isHiddenMap.set(p.name, true);
        });
      }

      const visibleList = sorted.filter((p) => !isHiddenMap.get(p));
      const hiddenList = sorted.filter((p) => isHiddenMap.get(p));

      // Limit initial visible pills to 8 if not expanded, so UI stays clean while giving instant expand button
      const displayed = showAllPaymentMethods ? visibleList : visibleList.slice(0, 8);

      return {
        allAvailablePaymentMethods: sorted,
        displayPaymentMethods: displayed,
        hiddenPaymentMethods: hiddenList,
        totalVisibleCount: visibleList.length,
        hasMore: visibleList.length > 8,
      };
    }, [
      customPaymentMethods,
      transactions,
      analysis?.detectedPaymentMethods,
      paymentMethod,
      paymentFrequencyMap,
      showAllPaymentMethods,
    ]);

  // Filtered payment methods for inline search box (searches across ALL available payment methods)
  const filteredPaymentOptions = React.useMemo(() => {
    const q = paymentSearchQuery.trim().toLowerCase();
    if (!q) {
      return displayPaymentMethods;
    }
    return allAvailablePaymentMethods
      .filter((pm) => pm.toLowerCase().includes(q))
      .sort((a, b) => {
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();
        const aExact = aLower === q ? 0 : 1;
        const bExact = bLower === q ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        const aStarts = aLower.startsWith(q) ? 0 : 1;
        const bStarts = bLower.startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return 0;
      });
  }, [paymentSearchQuery, displayPaymentMethods, allAvailablePaymentMethods]);

  const hasExactPaymentMatch = React.useMemo(() => {
    const q = paymentSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return allAvailablePaymentMethods.some((pm) => pm.toLowerCase() === q);
  }, [paymentSearchQuery, allAvailablePaymentMethods]);

  useEffect(() => {
    setPaymentActiveIndex(0);
  }, [paymentSearchQuery]);

  // Hidden payment method lookup for search badge
  const hiddenPaymentSet = React.useMemo(() => {
    const set = new Set<string>();
    (customPaymentMethods || []).forEach((p) => {
      if (!p.isVisible && p.name) set.add(p.name.trim());
    });
    return set;
  }, [customPaymentMethods]);

  const handleSelectOrAddCategoryFromSearch = (chosenName: string, isNew: boolean = false) => {
    const trimmed = chosenName.trim();
    if (!trimmed) return;
    setCategory(trimmed);
    const alreadyInCustom = Boolean(
      customCategories?.some(
        (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase() && (c.type || 'expense') === type
      )
    );
    if ((isNew || !alreadyInCustom) && onAddCustomCategory) {
      onAddCustomCategory(trimmed, type);
    }
    setCategoryHighlighted(false);
    setCategorySearchQuery('');
    setCustomCategoryInput(false);
  };

  const handleSelectOrAddPaymentFromSearch = (chosenName: string, isNew: boolean) => {
    const trimmed = chosenName.trim();
    if (!trimmed) return;
    setPaymentMethod(trimmed);
    const alreadyInCustom = Boolean(
      customPaymentMethods?.some((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase())
    );
    if ((isNew || !alreadyInCustom) && onAddCustomPaymentMethod) {
      onAddCustomPaymentMethod(trimmed);
    }
    setPaymentSearchQuery('');
    setCustomPaymentInput(false);
  };

  const handleAddNewPaymentMethod = () => {
    const trimmed = newPaymentText.trim();
    if (trimmed) {
      setPaymentMethod(trimmed);
      if (onAddCustomPaymentMethod) {
        onAddCustomPaymentMethod(trimmed);
      }
      setNewPaymentText('');
      setCustomPaymentInput(false);
    }
  };

  // Automatically suggest recurring when fixed budget category is picked
  useEffect(() => {
    const fixedBudgetCats = [
      '관리비_기타',
      '관리비_수도',
      '관리비_전기',
      '통신비',
      '보험료',
      '구독',
      '렌탈',
      '대출_원금',
      '대출_이자',
      '세금/공과금',
    ];
    if (category && fixedBudgetCats.includes(category)) {
      setIsRecurring(true);
    }
  }, [category]);

  // Keep category unselected by default in create mode when switching types
  useEffect(() => {
    if (isEditMode) return;
    if (category && !visibleCategories.includes(category) && !hiddenCategories.includes(category)) {
      setCategory('');
    }
  }, [type, visibleCategories, hiddenCategories, isEditMode]);

  // Set default payment method (create mode only)
  useEffect(() => {
    if (isEditMode) return;
    if (!paymentMethod && displayPaymentMethods.length > 0) {
      setPaymentMethod(displayPaymentMethods[0]);
    }
  }, [displayPaymentMethods, isEditMode]);

  // Smart Autocomplete Suggestions based on Description typing
  const filteredSuggestions = React.useMemo(() => {
    if (!description.trim()) return [];
    const q = description.trim().toLowerCase();
    return (analysis?.historicalDescriptions || [])
      .filter((h) => h.description.toLowerCase().includes(q))
      .slice(0, 5);
  }, [description, analysis?.historicalDescriptions]);

  // Handle smart autofill from historical pick
  const handleSelectSuggestion = (item: {
    description: string;
    category: string;
    paymentMethod?: string;
  }) => {
    setDescription(item.description);
    if (item.category) {
      setCategory(item.category);
    }
    if (item.paymentMethod) {
      setPaymentMethod(item.paymentMethod);
    }
    setShowSuggestions(false);
  };

  // When user types description, predict category if exact match or strong pattern
  const handleDescriptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDescription(val);
    setShowSuggestions(true);

    // Auto-predict category (do not overwrite existing category in edit mode)
    if (!isEditMode || !category) {
      const exactMatch = (analysis?.historicalDescriptions || []).find(
        (h) => h.description.toLowerCase() === val.trim().toLowerCase()
      );
      if (exactMatch) {
        setCategory(exactMatch.category);
        if (exactMatch.paymentMethod && (!isEditMode || !paymentMethod)) {
          setPaymentMethod(exactMatch.paymentMethod);
        }
      }
    }
  };

  // Math formula calculation for amount
  const formulaEval = React.useMemo(() => {
    return evaluateMathFormula(amountStr);
  }, [amountStr]);

  const isFormula = React.useMemo(() => {
    return containsFormula(amountStr);
  }, [amountStr]);

  const handleApplyFormula = () => {
    if (formulaEval.isValid && formulaEval.value !== null) {
      setAmountStr(formulaEval.value.toLocaleString('ko-KR'));
    }
  };

  // Installment live schedule preview (create mode + expense only)
  const parsedBaseAmount = React.useMemo(() => {
    if (isFormula) {
      return formulaEval.isValid && formulaEval.value !== null ? formulaEval.value : 0;
    }
    return parseInt(amountStr.replace(/[^0-9]/g, '') || '0', 10);
  }, [isFormula, formulaEval, amountStr]);

  const inferredSheetYear = React.useMemo(() => {
    const yMatch = spreadsheetTitle?.match(/20\d{2}/) || activeSheetTitle?.match(/20\d{2}/);
    if (yMatch) return parseInt(yMatch[0], 10);
    const dMatch = date?.match(/^(20\d{2})-/);
    return dMatch ? parseInt(dMatch[1], 10) : new Date().getFullYear();
  }, [spreadsheetTitle, activeSheetTitle, date]);

  const annualInterestRateNum = React.useMemo(() => {
    const cleaned = installmentRateStr.replace(/[^0-9.]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) || n < 0 ? 0 : Math.min(99, n);
  }, [installmentRateStr]);

  const installmentPreview = React.useMemo(() => {
    if (isEditMode || type !== 'expense' || !isInstallmentEnabled) return null;
    return calculateInstallmentSchedule({
      totalPrincipal: parsedBaseAmount,
      months: installmentMonths,
      annualInterestRate: annualInterestRateNum,
      startDate: date || formatLocalYMD(new Date()),
      sheetYear: inferredSheetYear,
    });
  }, [
    isEditMode,
    type,
    isInstallmentEnabled,
    parsedBaseAmount,
    installmentMonths,
    annualInterestRateNum,
    date,
    inferredSheetYear,
  ]);

  const installmentInSheetItems = React.useMemo(() => {
    if (!installmentPreview) return [];
    const sameYear = installmentPreview.schedule.filter((s) => s.recordedInSheet);
    return sameYear.length > 0 ? sameYear : installmentPreview.schedule;
  }, [installmentPreview]);

  const installmentFutureYearItems = React.useMemo(() => {
    if (!installmentPreview) return [];
    const sameYear = installmentPreview.schedule.filter((s) => s.recordedInSheet);
    return sameYear.length > 0 ? installmentPreview.schedule.filter((s) => !s.recordedInSheet) : [];
  }, [installmentPreview]);

  const handleInsertChar = (ch: string) => {
    if (ch === '=') {
      handleApplyFormula();
      return;
    }
    if (ch === 'C' || ch === 'AC') {
      setAmountStr('');
      return;
    }
    if (ch === 'BS' || ch === 'backspace') {
      setAmountStr((prev) => prev.slice(0, -1).trimEnd());
      return;
    }

    // Digits, 00, or dot
    if (/^[0-9.]$/.test(ch) || ch === '00') {
      setAmountStr((prev) => {
        if (prev === '0' && ch !== '.') return ch;
        return `${prev}${ch}`;
      });
      return;
    }

    // Math Operators: +, -, *, /, ×, ÷
    const op = ch === '×' ? '*' : ch === '÷' ? '/' : ch;
    if (['+', '-', '*', '/'].includes(op)) {
      if (!amountStr.trim()) {
        if (op === '-') {
          setAmountStr('-');
        } else {
          setAmountStr(`0 ${op} `);
        }
        return;
      }
      const trimmed = amountStr.trimEnd();
      if (/[+\-*\/]$/.test(trimmed)) {
        setAmountStr(`${trimmed.slice(0, -1)} ${op} `);
      } else {
        setAmountStr(`${trimmed} ${op} `);
      }
      return;
    }

    // Parentheses ( or )
    if (ch === '(' || ch === ')') {
      setAmountStr((prev) => `${prev}${ch}`);
    }
  };

  const handleAmountKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      if (isFormula && formulaEval.isValid && formulaEval.value !== null) {
        handleApplyFormula();
      }
      focusAndScroll(descInputRef.current);
      return;
    }
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      if (isFormula && formulaEval.isValid && formulaEval.value !== null) {
        e.preventDefault();
        handleApplyFormula();
      }
    }
  };

  // Quick Amount Adders
  const handleAddAmount = (addValue: number) => {
    if (isFormula && formulaEval.isValid && formulaEval.value !== null) {
      const updated = formulaEval.value + addValue;
      setAmountStr(updated.toLocaleString('ko-KR'));
    } else {
      const current = parseInt(amountStr.replace(/[^0-9]/g, '') || '0', 10);
      const updated = current + addValue;
      setAmountStr(updated.toLocaleString('ko-KR'));
    }
  };

  const handleAmountInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const sanitized = sanitizeFormulaInput(raw);

    if (!sanitized) {
      setAmountStr('');
      return;
    }

    if (!containsFormula(sanitized)) {
      const rawDigits = sanitized.replace(/[^0-9]/g, '');
      if (!rawDigits) {
        setAmountStr('');
        return;
      }
      const num = parseInt(rawDigits, 10);
      setAmountStr(num.toLocaleString('ko-KR'));
    } else {
      // Keep formula string as entered so user can write e.g. 15000 + 4500, 3000 * 2, etc.
      setAmountStr(sanitized);
    }
  };

  // Quick Date Setters
  const setQuickDate = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    setDate(formatLocalYMD(d));
    setIsRememberedDate(false);
  };

  // Handle Add Category
  const handleAddNewCategory = () => {
    const trimmed = newCategoryText.trim();
    if (trimmed) {
      setCategory(trimmed);
      if (onAddCustomCategory) {
        onAddCustomCategory(trimmed, type);
      }
      setNewCategoryText('');
      setCustomCategoryInput(false);
    }
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let numAmount = 0;
    if (isFormula) {
      if (formulaEval.isValid && formulaEval.value !== null) {
        numAmount = formulaEval.value;
        setAmountStr(formulaEval.formatted || String(formulaEval.value));
      } else {
        alert(formulaEval.error || '금액 수식이 올바르지 않습니다. 확인 후 다시 시도해 주세요.');
        return;
      }
    } else {
      numAmount = parseInt(amountStr.replace(/[^0-9]/g, '') || '0', 10);
    }

    if (!numAmount || numAmount <= 0) {
      alert('올바른 금액을 입력해 주세요.');
      return;
    }
    if (!description.trim()) {
      alert('사용처(내용)를 입력해 주세요.');
      descInputRef.current?.focus();
      return;
    }
    if (!category.trim()) {
      alert('카테고리(분류)를 선택해 주세요.');
      setCategoryHighlighted(true);
      categorySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }


    setIsSubmitting(true);
    if (!isEditMode) {
      saveLastEnteredDate(date);
    }
    try {
      const validSubItems = subItems
        .filter((s) => s.name.trim().length > 0 || (Number(s.amount) || 0) > 0)
        .map((s) => {
          const qty = Math.max(1, Number(s.quantity) || 1);
          const amt = Math.max(0, Number(s.amount) || 0);
          const up = s.unitPrice && s.unitPrice > 0 ? s.unitPrice : qty > 0 ? Math.round(amt / qty) : amt;
          return {
            ...s,
            name: s.name.trim() || '품목',
            quantity: qty,
            unitPrice: up,
            amount: amt,
            category: s.category || category || '식비',
          };
        });

      if (isEditMode && editingTransaction && onUpdateTransaction) {
        const cleanBaseMemo = stripMachineMemoTags(memo);
        let finalMemo =
          validSubItems.length > 0
            ? serializeSubItemsToMemo(cleanBaseMemo || undefined, validSubItems)
            : cleanBaseMemo;

        const existingInstallmentTagMatch = editingTransaction.memo?.match(/\[할부:[^\]]*\]/);
        if (existingInstallmentTagMatch) {
          finalMemo = finalMemo
            ? `${existingInstallmentTagMatch[0]} ${finalMemo}`
            : existingInstallmentTagMatch[0];
        }

        if (isRecurring) {
          finalMemo = finalMemo ? `[정기예산] ${finalMemo}` : '[정기예산]';
        } else if (isSpecial) {
          finalMemo = finalMemo ? `[특별지출] ${finalMemo}` : '[특별지출]';
        }

        const updatedTx: Transaction = {
          ...editingTransaction,
          date: date || editingTransaction.date,
          type,
          category: category || editingTransaction.category || '기타',
          description: description.trim(),
          amount: numAmount,
          paymentMethod: paymentMethod || '',
          isRecurring: isRecurring || undefined,
          isSpecial: isSpecial || undefined,
          memo: finalMemo || undefined,
          subItems: validSubItems.length > 0 ? validSubItems : undefined,
        };

        saveSubItemsForTransaction(updatedTx, validSubItems);
        await onUpdateTransaction(updatedTx);
        if (isModal && onClose) {
          onClose();
        }
        return;
      }

      if (!onAddTransaction && !(isInstallmentEnabled && onBatchAddTransactions)) {
        throw new Error('거래 추가 핸들러가 연결되지 않았습니다.');
      }

      // Card Installment Auto-Split Registration (create mode + expense)
      if (type === 'expense' && isInstallmentEnabled && installmentPreview) {
        const monthsClamped = Math.min(60, Math.max(2, Math.round(installmentMonths)));
        const cleanBaseMemo = stripMachineMemoTags(memo);
        const sameYearExists = installmentPreview.schedule.some((s) => s.recordedInSheet);
        const normalizedSchedule = sameYearExists
          ? installmentPreview.schedule
          : installmentPreview.schedule.map((s) => ({ ...s, recordedInSheet: true }));

        const itemsToWrite = normalizedSchedule.filter((s) => s.recordedInSheet);

        const plan: InstallmentPlan = {
          id: `inst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          description: description.trim(),
          category: category || '기타',
          paymentMethod: paymentMethod || '',
          startDate: date,
          totalPrincipal: numAmount,
          months: monthsClamped,
          annualInterestRate: annualInterestRateNum,
          totalInterest: installmentPreview.totalInterest,
          totalPayable: installmentPreview.totalPayable,
          memo: cleanBaseMemo || undefined,
          isRecurring: isRecurring || undefined,
          isSpecial: isSpecial || undefined,
          createdAt: Date.now(),
          schedule: normalizedSchedule,
        };
        saveInstallmentPlan(plan, spreadsheetId || analysis?.spreadsheetId);

        const nowTs = Date.now();
        const batchTxs: Array<Omit<Transaction, 'id' | 'rowIndex'> & { sheetTitle?: string }> =
          itemsToWrite.map((item) => {
            const instTag = buildInstallmentMemoTag({
              index: item.index,
              months: monthsClamped,
              annualInterestRate: annualInterestRateNum,
              totalPrincipal: numAmount,
              startDate: date,
            });
            const interestNote =
              item.interest > 0
                ? `(이자 ${item.interest.toLocaleString('ko-KR')}원 포함)`
                : '';

            const parts: string[] = [];
            if (isRecurring) parts.push('[정기예산]');
            else if (isSpecial) parts.push('[특별지출]');
            parts.push(instTag);
            if (interestNote) parts.push(interestNote);
            if (cleanBaseMemo) parts.push(cleanBaseMemo);

            return {
              date: item.date,
              type: 'expense' as TransactionType,
              category: category || '기타',
              description: `${description.trim()} (할부 ${item.index}/${monthsClamped})`,
              amount: item.amount,
              paymentMethod: paymentMethod || undefined,
              isRecurring: isRecurring || undefined,
              isSpecial: isSpecial || undefined,
              memo: parts.join(' ').trim(),
              sheetTitle: item.sheetTitle,
              createdAt: nowTs + item.index,
            };
          });

        if (onBatchAddTransactions) {
          await onBatchAddTransactions(batchTxs);
        } else if (onAddTransaction) {
          for (const tx of batchTxs) {
            await onAddTransaction(tx);
          }
        }

        setSuccessAnimation(true);
        setTimeout(() => setSuccessAnimation(false), 2000);

        setAmountStr('');
        setDescription('');
        setMemo('');
        setCategorySearchQuery('');
        setPaymentSearchQuery('');
        setIsRecurring(false);
        setIsSpecial(false);
        setSubItems([]);
        setShowSubItemEntry(false);
        setIsInstallmentEnabled(false);
        setShowInstallmentPanel(false);
        setInstallmentMonths(3);
        setInstallmentRateStr('0');

        if (isModal && onClose) {
          onClose();
        }
        return;
      }

      if (!onAddTransaction) {
        throw new Error('거래 추가 핸들러가 연결되지 않았습니다.');
      }

      if (validSubItems.length > 0 && splitSubItemsIntoSeparateTx) {
        const subSum = validSubItems.reduce((acc, s) => acc + s.amount, 0);
        const remaining = numAmount - subSum;

        if (remaining < 0) {
          alert(`세부 품목의 합계(${subSum.toLocaleString()}원)가 총 금액(${numAmount.toLocaleString()}원)보다 큽니다. 금액을 확인해 주세요.`);
          setIsSubmitting(false);
          return;
        }

        // 1. Add each sub-item as an individual transaction
        for (const item of validSubItems) {
          const qtyDesc = item.quantity && item.quantity > 1 ? ` (${item.name} ${item.quantity}개)` : ` (${item.name})`;
          const memoDetail = item.quantity && item.quantity > 1
            ? `${description.trim()} 세부 품목 (수량: ${item.quantity}개, 개당 ${(item.unitPrice || Math.round(item.amount / item.quantity)).toLocaleString('ko-KR')}원)`
            : `${description.trim()} 세부 품목`;

          let memoPrefix = '';
          if (isRecurring) memoPrefix = '[정기예산] ';
          else if (isSpecial) memoPrefix = '[특별지출] ';
          const taggedMemo = memoPrefix ? `${memoPrefix}${memoDetail}` : memoDetail;

          await onAddTransaction({
            date,
            type,
            category: item.category || category || '기타',
            description: `${description.trim()}${qtyDesc}`,
            amount: item.amount,
            paymentMethod: paymentMethod || undefined,
            isRecurring: isRecurring || undefined,
            isSpecial: isSpecial || undefined,
            memo: taggedMemo,
            sheetTitle: targetMonth,
            createdAt: Date.now(),
          });
        }

        // 2. If there is remaining amount, keep it as the original transaction
        if (remaining > 0) {
          let remPrefix = '';
          if (isRecurring) remPrefix = '[정기예산] ';
          else if (isSpecial) remPrefix = '[특별지출] ';
          const remMemo = `${remPrefix}[세부 품목 ${subSum.toLocaleString()}원 분할 후 잔여액]`;

          await onAddTransaction({
            date,
            type,
            category: category || '기타',
            description: `${description.trim()} (잔여)`,
            amount: remaining,
            paymentMethod: paymentMethod || undefined,
            isRecurring: isRecurring || undefined,
            isSpecial: isSpecial || undefined,
            memo: remMemo,
            sheetTitle: targetMonth,
            createdAt: Date.now(),
          });
        }
      } else {
        const cleanBaseMemo = stripMachineMemoTags(memo);
        let finalMemo =
          validSubItems.length > 0
            ? serializeSubItemsToMemo(cleanBaseMemo || undefined, validSubItems)
            : cleanBaseMemo || undefined;

        if (isRecurring) {
          finalMemo = finalMemo
            ? (finalMemo.includes('[정기예산]') ? finalMemo : `[정기예산] ${finalMemo}`)
            : '[정기예산]';
        } else if (isSpecial) {
          finalMemo = finalMemo
            ? (finalMemo.includes('[특별지출]') ? finalMemo : `[특별지출] ${finalMemo}`)
            : '[특별지출]';
        }

        if (validSubItems.length > 0) {
          saveSubItemsForTransaction(
            {
              date,
              description: description.trim(),
              amount: numAmount,
              sheetTitle: targetMonth,
            },
            validSubItems
          );
        }

        await onAddTransaction({
          date,
          type,
          category: category || '기타',
          description: description.trim(),
          amount: numAmount,
          paymentMethod: paymentMethod || undefined,
          isRecurring: isRecurring || undefined,
          isSpecial: isSpecial || undefined,
          memo: finalMemo,
          sheetTitle: targetMonth,
          subItems: validSubItems.length > 0 ? validSubItems : undefined,
          createdAt: Date.now(),
        });
      }

      // Show success feedback
      setSuccessAnimation(true);
      setTimeout(() => setSuccessAnimation(false), 2000);

      // Reset form fields for rapid next entry
      setAmountStr('');
      setDescription('');
      setMemo('');
      setCategorySearchQuery('');
      setPaymentSearchQuery('');
      setIsRecurring(false);
      setIsSpecial(false);
      setSubItems([]);
      setShowSubItemEntry(false);

      if (isModal && onClose) {
        onClose();
      }
    } catch (err: any) {
      console.error('Submit error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const validSubItemsForSplit = React.useMemo(
    () =>
      subItems
        .filter((s) => s.name.trim().length > 0 || (Number(s.amount) || 0) > 0)
        .map((s) => {
          const qty = Math.max(1, Number(s.quantity) || 1);
          const amt = Math.max(0, Number(s.amount) || 0);
          const up = s.unitPrice && s.unitPrice > 0 ? s.unitPrice : qty > 0 ? Math.round(amt / qty) : amt;
          return {
            ...s,
            name: s.name.trim() || '품목',
            quantity: qty,
            unitPrice: up,
            amount: amt,
            category: s.category || category || '식비',
          };
        }),
    [subItems, category]
  );

  return (
    <div className="bg-white rounded-2xl border-2 border-slate-300 shadow-xl overflow-hidden text-slate-900">
      {/* Top Banner / Form Header */}
      <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shrink-0">
            {isEditMode ? <Edit2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-black tracking-tight whitespace-nowrap">
              {isEditMode ? '가계부 내역 수정' : '가계부 입력창'}
            </h2>
            {isEditMode ? (
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-300 whitespace-nowrap overflow-x-auto scrollbar-none">
                {subtitleOverride ? (
                  <span>{subtitleOverride}</span>
                ) : (
                  <>
                    <span className="text-slate-400">
                      [{editingTransaction?.sheetTitle || activeSheetTitle}] 시트
                    </span>
                    {editingTransaction?.rowIndex && (
                      <>
                        <span className="text-slate-500">•</span>
                        <span>{editingTransaction.rowIndex}행</span>
                      </>
                    )}
                    {isRealGoogleConnected && (
                      <>
                        <span className="text-slate-500">•</span>
                        <span className="text-emerald-400 font-bold">Google 시트 실시간 반영</span>
                      </>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-300 font-medium">{spreadsheetTitle}</span>
                <span className="text-xs text-slate-400">•</span>
                <span className="text-xs font-bold text-slate-300">{targetMonth}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onClose && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
              title="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Mode-specific Top Sub-banner */}
      {isEditMode ? (
        <div className="px-5 py-2.5 bg-blue-50 border-b border-blue-200 flex items-center justify-between gap-2 text-xs text-blue-950 font-bold whitespace-nowrap overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-2 shrink-0">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              거래 일자:{' '}
              <strong className="text-blue-900 underline">{formatShortDate(date || '')}</strong>{' '}
              <span className="text-blue-600 text-[11px] font-normal">({date})</span>
            </span>
            {(() => {
              const instMeta = editingTransaction ? parseInstallmentMeta(editingTransaction) : null;
              if (!instMeta) return null;
              return (
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 border border-indigo-300 rounded-md text-[11px] font-black shrink-0">
                  💳 할부 {instMeta.current}/{instMeta.total}
                  {instMeta.isInterestFree ? ' 무이자' : instMeta.rateLabel ? ` (${instMeta.rateLabel})` : ''}
                </span>
              );
            })()}
          </div>
          <span className="px-2 py-0.5 bg-blue-600 text-white rounded-md text-[11px] font-extrabold shrink-0">
            {editingTransaction?.sheetTitle || activeSheetTitle} 시트에 수정 반영
          </span>
        </div>
      ) : (
        <div className="px-5 py-3 bg-gradient-to-r from-blue-50 via-indigo-50 to-slate-50 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-800">
                지난달 고정지출 불러오기 / 내역 복사
              </p>
              <p className="text-[11px] text-slate-500 font-medium">
                관리비·통신비·보험료 등 정기 지출을 1초 만에 채우거나 일괄 등록하세요
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setImportTab('fixed');
                setIsImportModalOpen(true);
              }}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm shadow-indigo-600/20 active:scale-95 transition cursor-pointer"
              title="지난달 고정지출(관리비, 통신비, 보험, 구독 등)을 바로 불러옵니다."
            >
              <Repeat className="w-3.5 h-3.5" />
              <span>⚡ 지난달 고정지출 불러오기</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setImportTab('all');
                setIsImportModalOpen(true);
              }}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition cursor-pointer"
              title="과거 내역을 검색하여 복사합니다."
            >
              <Copy className="w-3.5 h-3.5 text-slate-500" />
              <span>최근 내역 복사</span>
            </button>
          </div>
        </div>
      )}

      {importNotice && (
        <div className="px-5 py-2.5 bg-emerald-50 text-emerald-800 border-b border-emerald-200 text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{importNotice}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 bg-white">
        {/* 1. Date Selection */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className="text-xs font-black text-slate-700 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>지출/수입 날짜</span>
            </label>
            {isRememberedDate && (
              <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md whitespace-nowrap">
                직전 입력 날짜 유지됨
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setIsRememberedDate(false);
              }}
              className="flex-1 min-w-[150px] px-3.5 py-2.5 bg-white border-2 border-slate-300 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-600"
              required
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setQuickDate(0)}
                className={`px-3 py-2 text-xs font-extrabold rounded-xl transition cursor-pointer ${
                  date === formatLocalYMD(new Date())
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                오늘
              </button>
              <button
                type="button"
                onClick={() => setQuickDate(1)}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer"
              >
                어제
              </button>
              <button
                type="button"
                onClick={() => setQuickDate(2)}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer"
              >
                2일전
              </button>
            </div>
          </div>
        </div>

        {/* 2. Type Selector (지출 / 수입 / 이체) */}
        <div>
          <label className="block text-xs font-black text-slate-700 mb-1.5">거래 구분</label>
          <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => handleTypeChange('expense')}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold text-xs sm:text-sm transition cursor-pointer ${
                type === 'expense'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <TrendingDown className="w-4 h-4" />
              <span>지출</span>
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('income')}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold text-xs sm:text-sm transition cursor-pointer ${
                type === 'income'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>수입</span>
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('transfer')}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold text-xs sm:text-sm transition cursor-pointer ${
                type === 'transfer'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>이체/저축</span>
            </button>
          </div>
        </div>

        {/* 3. Amount Input with Formula Calculation & Quick Add */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
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
              ref={amountInputRef}
              type="text"
              inputMode="text"
              placeholder="0 (수식 입력 가능: 15000 + 4500, 3000 * 3)"
              value={amountStr}
              onChange={handleAmountInputChange}
              onKeyDown={handleAmountKeyDown}
              className="w-full pl-10 pr-24 py-3 bg-white border-2 border-slate-300 rounded-xl text-xl sm:text-2xl font-black text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-blue-600 transition"
              required
            />
            {isFormula && formulaEval.isValid && formulaEval.value !== null && (
              <button
                type="button"
                onClick={handleApplyFormula}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-black rounded-lg shadow-sm flex items-center gap-1 transition cursor-pointer"
                title="계산 결과를 금액으로 확정"
              >
                <span>= 계산</span>
              </button>
            )}
          </div>

          {/* Real-time Formula Preview */}
          {isFormula && (
            <div
              className={`mt-2 p-2.5 rounded-xl border flex items-center justify-between text-xs transition animate-in fade-in duration-150 ${
                formulaEval.isValid && formulaEval.value !== null
                  ? 'bg-blue-50/80 border-blue-200 text-blue-900'
                  : 'bg-amber-50/80 border-amber-200 text-amber-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xs px-1.5 py-0.5 rounded bg-white/90 border border-current shadow-2xs">
                  수식
                </span>
                {formulaEval.isValid && formulaEval.value !== null ? (
                  <span className="font-bold">
                    계산 결과: <span className="text-base font-black text-blue-700">₩{formulaEval.formatted}원</span>
                    <span className="text-[11px] font-normal text-slate-500 ml-1.5">
                      (Enter 또는 [= 계산] 클릭 시 적용)
                    </span>
                  </span>
                ) : (
                  <span className="font-medium text-amber-700">
                    {formulaEval.error || '수식 입력 중... (예: 15000 + 4500, (3000 * 2) + 1500)'}
                  </span>
                )}
              </div>
              {formulaEval.isValid && formulaEval.value !== null && (
                <button
                  type="button"
                  onClick={handleApplyFormula}
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
                  onClick={() => handleAddAmount(val)}
                  className="px-2.5 py-1 text-xs font-extrabold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg transition active:scale-95 cursor-pointer border border-slate-200 whitespace-nowrap"
                >
                  +{val / 10000}만
                </button>
              ))}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setAmountStr('')}
                className="p-1 text-xs font-bold text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer ml-1"
                title="금액 지우기"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 4. Description / Merchant */}
        <div className="relative">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-black text-slate-700 flex items-center gap-1">
              <span>사용처 / 내용</span>
              <span className="text-red-500">*</span>
            </label>
            {(analysis?.historicalDescriptions?.length ?? 0) > 0 && (
              <span className="text-[11px] text-blue-600 flex items-center gap-1 font-bold">
                <Sparkles className="w-3 h-3" />
                자동완성 추천
              </span>
            )}
          </div>
          <div className="relative">
            <input
              ref={descInputRef}
              type="text"
              placeholder="예: 마트 장보기, 스타벅스, 관리비, 점심식사..."
              value={description}
              onChange={handleDescriptionChange}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  e.preventDefault();
                  setShowSuggestions(false);
                  if (e.shiftKey) {
                    focusAndScroll(amountInputRef.current);
                  } else {
                    if (description.trim() && !category.trim()) {
                      setCategoryHighlighted(true);
                      setTimeout(() => setCategoryHighlighted(false), 2500);
                    }
                    focusAndScroll(categorySearchInputRef.current, categorySectionRef.current);
                  }
                  return;
                }
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  setShowSuggestions(false);
                  if (!category.trim()) {
                    setCategoryHighlighted(true);
                    setTimeout(() => setCategoryHighlighted(false), 2500);
                  }
                  focusAndScroll(categorySearchInputRef.current, categorySectionRef.current);
                }
              }}
              onBlur={() => {
                setTimeout(() => setShowSuggestions(false), 200);
                if (
                  description.trim() &&
                  !category.trim() &&
                  document.activeElement !== categorySearchInputRef.current
                ) {
                  setCategoryHighlighted(true);
                  categorySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  setTimeout(() => setCategoryHighlighted(false), 2500);
                }
              }}
              className="w-full px-4 py-2.5 bg-white border-2 border-slate-300 rounded-xl text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 transition"
              required
            />

          </div>

          {/* Autocomplete Dropdown */}
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-2xl border-2 border-slate-300 py-1.5 z-30">
              <div className="px-3 py-1 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                이전 가계부 기록에서 발견됨
              </div>
              {filteredSuggestions.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectSuggestion(item)}
                  className="w-full text-left px-3.5 py-2 hover:bg-blue-50 flex items-center justify-between text-xs transition cursor-pointer"
                >
                  <span className="font-bold text-slate-900">{item.description}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-bold">
                      {item.category}
                    </span>
                    {item.paymentMethod && (
                      <span className="px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[10px] font-bold">
                        {item.paymentMethod}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 4.5. Budget Classification: 고정 지출 & 특별(비정기) 지출 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {/* 고정 지출 (정기 예산) */}
          <div
            className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs transition ${
              isRecurring
                ? 'bg-purple-50/90 border-purple-300 text-purple-900 shadow-2xs'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIsRecurring(checked);
                  if (checked) setIsSpecial(false);
                }}
                className="w-4 h-4 text-purple-600 rounded border-purple-300 focus:ring-purple-500 cursor-pointer"
              />
              <span className="font-black text-xs flex items-center gap-1">
                <span>📌 고정 지출 (정기 예산)</span>
                {isRecurring && (
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
                { name: '렌탈', cat: '렌탈', pay: '자동이체' },
                { name: '대출', cat: '대출_원금', pay: '자동이체' },
              ].map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setIsRecurring(true);
                    setIsSpecial(false);
                    if (!description.trim()) setDescription(preset.name);
                    setCategory(preset.cat);
                    setPaymentMethod(preset.pay);
                  }}
                  className="px-2 py-0.5 bg-white hover:bg-purple-100 border border-slate-200 hover:border-purple-300 text-slate-600 hover:text-purple-900 rounded-lg text-[11px] font-bold transition shrink-0 cursor-pointer whitespace-nowrap"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* 특별/비정기 지출 (침대, 가전, 이사, 여행 등 일회성 대형 지출) */}
          <div
            className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs transition ${
              isSpecial
                ? 'bg-amber-50/90 border-amber-300 text-amber-900 shadow-2xs'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={isSpecial}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIsSpecial(checked);
                  if (checked) setIsRecurring(false);
                }}
                className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
              />
              <span className="font-black text-xs flex items-center gap-1">
                <span>🛋️ 특별(비정기) 지출</span>
                {isSpecial && (
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
                    setIsSpecial(true);
                    setIsRecurring(false);
                    if (!description.trim()) setDescription(preset.name);
                    setCategory(preset.cat);
                    setPaymentMethod(preset.pay);
                  }}
                  className="px-2 py-0.5 bg-white hover:bg-amber-100 border border-slate-200 hover:border-amber-300 text-slate-600 hover:text-amber-900 rounded-lg text-[11px] font-bold transition shrink-0 cursor-pointer whitespace-nowrap"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        </div>


        {/* 5. Category Pills with Inline Search & Tagging */}
        <div
          ref={categorySectionRef}
          tabIndex={-1}
          className={`transition-all rounded-2xl p-2.5 -m-1 focus:outline-none ${
            categoryHighlighted
              ? 'ring-4 ring-rose-400 bg-rose-50/70 shadow-md animate-pulse'
              : !category
              ? 'bg-amber-50/50 border border-dashed border-amber-300'
              : ''
          }`}
        >
          <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <label className="text-xs font-black text-slate-700 flex items-center gap-1 shrink-0">
                <Tag className="w-3.5 h-3.5 text-blue-600" />
                <span>
                  {type === 'income' ? '수입 분류' : type === 'transfer' ? '이체 분류' : '지출 분류'}{' '}
                  ({visibleCategories.length}개)
                </span>
                <span className="text-red-500">*</span>
              </label>

              {/* Inline Category Search Input */}
              <div className="relative">
                <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={categorySearchInputRef}
                  type="text"
                  value={categorySearchQuery}
                  onChange={(e) => {
                    setCategorySearchQuery(e.target.value);
                    if (customCategoryInput) setCustomCategoryInput(false);
                  }}
                  onFocus={() => {
                    categorySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      if (e.shiftKey) {
                        focusAndScroll(descInputRef.current);
                      } else {
                        const q = categorySearchQuery.trim().toLowerCase();
                        if (q && filteredCategoryOptions.length > 0) {
                          const exact = filteredCategoryOptions.find((item) => item.name.toLowerCase() === q);
                          if (exact) {
                            handleSelectOrAddCategoryFromSearch(exact.name);
                          } else if (filteredCategoryOptions.length === 1) {
                            handleSelectOrAddCategoryFromSearch(filteredCategoryOptions[0].name);
                          }
                        }
                        focusAndScroll(paymentSearchInputRef.current, paymentSectionRef.current);
                      }
                      return;
                    }
                    if (e.key === 'ArrowDown') {
                      if (filteredCategoryOptions.length > 0) {
                        e.preventDefault();
                        setCategoryActiveIndex((prev) => (prev + 1) % filteredCategoryOptions.length);
                      }
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      if (filteredCategoryOptions.length > 0) {
                        e.preventDefault();
                        setCategoryActiveIndex(
                          (prev) => (prev - 1 + filteredCategoryOptions.length) % filteredCategoryOptions.length
                        );
                      }
                      return;
                    }
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      const q = categorySearchQuery.trim();
                      if (!q) {
                        focusAndScroll(paymentSearchInputRef.current, paymentSectionRef.current);
                        return;
                      }
                      if (filteredCategoryOptions.length > 0) {
                        const safeIdx = Math.min(categoryActiveIndex, filteredCategoryOptions.length - 1);
                        handleSelectOrAddCategoryFromSearch(filteredCategoryOptions[safeIdx].name, false);
                      } else {
                        handleSelectOrAddCategoryFromSearch(q, true);
                      }
                    }
                  }}
                  placeholder="전체 분류 검색·추가 (Enter)"
                  className="w-40 sm:w-48 pl-6 pr-6 py-1 bg-white border border-slate-300 rounded-lg text-[11px] font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition"
                />
                {categorySearchQuery && (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => {
                      setCategorySearchQuery('');
                      categorySearchInputRef.current?.focus();
                    }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="검색어 지우기"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {!category ? (
                <span className="text-[10px] sm:text-[11px] font-black text-rose-600 bg-rose-50 border border-rose-300 px-2 py-0.5 rounded-md animate-pulse">
                  ⚠️ 카테고리 미선택 (선택 필수)
                </span>
              ) : (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300">
                  선택됨: <strong>{category}</strong>
                </span>
              )}

              <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 hidden sm:inline">
                지난달까지 빈도순
              </span>
              {hiddenCategories.length > 0 && !categorySearchQuery.trim() && (
                <button
                  type="button"
                  onClick={() => setShowHiddenCategories(!showHiddenCategories)}
                  className="text-[11px] font-bold text-slate-500 hover:text-blue-600 transition cursor-pointer"
                >
                  {showHiddenCategories ? '숨김 닫기 ▲' : `+숨김 ${hiddenCategories.length}개 보기 ▼`}
                </button>
              )}
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
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="새 분류 이름 직접 입력..."
                value={newCategoryText}
                onChange={(e) => setNewCategoryText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleAddNewCategory();
                    setCategoryHighlighted(false);
                  }
                }}
                className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold focus:border-blue-600"
              />
              <button
                type="button"
                onClick={() => {
                  handleAddNewCategory();
                  setCategoryHighlighted(false);
                }}
                className="px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 cursor-pointer"
              >
                적용
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {/* Visible / Filtered Categories */}
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1 bg-slate-50 p-2 rounded-xl border border-slate-200">
                {filteredCategoryOptions.map((item, idx) => {
                  const cat = item.name;
                  const stat = categoryStatsMap.get(cat);
                  const displayCount = stat?.displayCount || 0;
                  const label = stat?.displayLabel || '신규/미사용 분류';
                  const isKeyboardHighlighted =
                    Boolean(categorySearchQuery.trim()) &&
                    idx === Math.min(categoryActiveIndex, filteredCategoryOptions.length - 1);
                  return (
                    <button
                      key={`${cat}-${item.otherType || type}-${item.isHidden ? 'h' : 'v'}`}
                      type="button"
                      onClick={() => handleSelectOrAddCategoryFromSearch(cat, false)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                        category === cat
                          ? type === 'expense'
                            ? 'bg-rose-600 text-white shadow-sm'
                            : type === 'income'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-sky-600 text-white shadow-sm'
                          : isKeyboardHighlighted
                          ? 'bg-blue-50 text-blue-800 border-2 border-blue-500 ring-2 ring-blue-200'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-200'
                      }`}
                      title={label}
                    >
                      <span>{cat}</span>
                      {item.otherType && (
                        <span
                          className={`text-[9px] font-bold px-1 rounded-sm ${
                            category === cat ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.otherType === 'income' ? '수입' : item.otherType === 'transfer' ? '이체' : '지출'}
                        </span>
                      )}
                      {item.isHidden && (
                        <span
                          className={`text-[9px] font-bold px-1 rounded-sm ${
                            category === cat ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          숨김
                        </span>
                      )}
                      {displayCount > 0 && (
                        <span
                          className={`text-[9px] font-bold px-1 rounded-sm ${
                            category === cat ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {displayCount}
                        </span>
                      )}
                    </button>
                  );
                })}

                {categorySearchQuery.trim() && !hasExactCategoryMatch && (
                  <button
                    type="button"
                    onClick={() => handleSelectOrAddCategoryFromSearch(categorySearchQuery, true)}
                    className="px-3 py-1.5 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer flex items-center gap-1 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>"{categorySearchQuery.trim()}" 새 분류 추가·태그</span>
                  </button>
                )}

                {categorySearchQuery.trim() && filteredCategoryOptions.length === 0 && hasExactCategoryMatch && (
                  <span className="text-xs text-slate-400 font-medium px-2 py-1">일치하는 분류가 없습니다.</span>
                )}
              </div>

              {/* Expandable Hidden Categories */}
              {!categorySearchQuery.trim() && showHiddenCategories && hiddenCategories.length > 0 && (
                <div className="p-2 bg-slate-100/80 rounded-xl border border-dashed border-slate-300 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 px-1">
                    <span>숨김 처리된 분류 (클릭하여 선택 가능)</span>
                    {onOpenCategoryManager && (
                      <button
                        type="button"
                        onClick={onOpenCategoryManager}
                        className="text-blue-600 hover:underline cursor-pointer"
                      >
                        설정에서 보이기 전환
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                    {hiddenCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setCategory(cat);
                          setCategoryHighlighted(false);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                          category === cat
                            ? 'bg-slate-800 text-white'
                            : 'bg-white/80 text-slate-600 border border-slate-200 hover:bg-white'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>


        {/* 6. Payment Method Selector with Inline Search & Tagging */}
        <div ref={paymentSectionRef} tabIndex={-1} className="focus:outline-none">
          <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <label className="text-xs font-black text-slate-700 flex items-center gap-1 shrink-0">
                <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                <span>결제 수단 ({totalVisibleCount}개)</span>
              </label>

              {/* Inline Payment Method Search Input */}
              <div className="relative">
                <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={paymentSearchInputRef}
                  type="text"
                  value={paymentSearchQuery}
                  onChange={(e) => {
                    setPaymentSearchQuery(e.target.value);
                    if (customPaymentInput) setCustomPaymentInput(false);
                  }}
                  onFocus={() => {
                    paymentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      if (e.shiftKey) {
                        focusAndScroll(categorySearchInputRef.current, categorySectionRef.current);
                      } else {
                        const q = paymentSearchQuery.trim().toLowerCase();
                        if (q && filteredPaymentOptions.length > 0) {
                          const exact = filteredPaymentOptions.find((pm) => pm.toLowerCase() === q);
                          if (exact) {
                            handleSelectOrAddPaymentFromSearch(exact, false);
                          } else if (filteredPaymentOptions.length === 1) {
                            handleSelectOrAddPaymentFromSearch(filteredPaymentOptions[0], false);
                          }
                        }
                        focusAndScroll(memoInputRef.current, submitButtonRef.current, 'end');
                      }
                      return;
                    }
                    if (e.key === 'ArrowDown') {
                      if (filteredPaymentOptions.length > 0) {
                        e.preventDefault();
                        setPaymentActiveIndex((prev) => (prev + 1) % filteredPaymentOptions.length);
                      }
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      if (filteredPaymentOptions.length > 0) {
                        e.preventDefault();
                        setPaymentActiveIndex(
                          (prev) => (prev - 1 + filteredPaymentOptions.length) % filteredPaymentOptions.length
                        );
                      }
                      return;
                    }
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      const q = paymentSearchQuery.trim();
                      if (!q) {
                        focusAndScroll(memoInputRef.current, submitButtonRef.current, 'end');
                        return;
                      }
                      if (filteredPaymentOptions.length > 0) {
                        const safeIdx = Math.min(paymentActiveIndex, filteredPaymentOptions.length - 1);
                        handleSelectOrAddPaymentFromSearch(filteredPaymentOptions[safeIdx], false);
                      } else {
                        handleSelectOrAddPaymentFromSearch(q, true);
                      }
                    }
                  }}
                  placeholder="전체 결제수단 검색·추가 (Enter)"
                  className="w-40 sm:w-48 pl-6 pr-6 py-1 bg-white border border-slate-300 rounded-lg text-[11px] font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition"
                />
                {paymentSearchQuery && (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => {
                      setPaymentSearchQuery('');
                      paymentSearchInputRef.current?.focus();
                    }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="검색어 지우기"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {paymentMethod && (
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  선택됨: <strong>{paymentMethod}</strong>
                </span>
              )}

              {hasMore && !paymentSearchQuery.trim() && (
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
                      <span>+{totalVisibleCount - 8}개 더보기</span>
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
                  title="결제수단 관리 열기"
                >
                  <Settings className="w-3 h-3" />
                  <span>결제수단 관리</span>
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

          {customPaymentInput ? (
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                placeholder="새 결제수단 (예: 현대카드, 국민은행, 토스페이)..."
                value={newPaymentText}
                onChange={(e) => setNewPaymentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleAddNewPaymentMethod();
                  }
                }}
                className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold focus:border-blue-600"
              />
              <button
                type="button"
                onClick={handleAddNewPaymentMethod}
                className="px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 cursor-pointer shrink-0"
              >
                추가/선택
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1 bg-slate-50 p-2 rounded-xl border border-slate-200">
                {filteredPaymentOptions.map((pm, idx) => {
                  const stat = paymentStatsMap.get(pm);
                  const displayCount = stat?.displayCount || 0;
                  const label = stat?.displayLabel || undefined;
                  const badge = getPaymentGroupBadge(pm);
                  const isSelected = paymentMethod === pm;
                  const isKeyboardHighlighted =
                    Boolean(paymentSearchQuery.trim()) &&
                    idx === Math.min(paymentActiveIndex, filteredPaymentOptions.length - 1);
                  return (
                    <button
                      key={pm}
                      type="button"
                      onClick={() => handleSelectOrAddPaymentFromSearch(pm, false)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : isKeyboardHighlighted
                          ? 'bg-indigo-50 text-indigo-900 border-2 border-indigo-500 ring-2 ring-indigo-200'
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
                      {hiddenPaymentSet.has(pm) && (
                        <span
                          className={`text-[9px] font-bold px-1 rounded-sm ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          숨김
                        </span>
                      )}
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

                {paymentSearchQuery.trim() && !hasExactPaymentMatch && (
                  <button
                    type="button"
                    onClick={() => handleSelectOrAddPaymentFromSearch(paymentSearchQuery, true)}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition cursor-pointer flex items-center gap-1 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>"{paymentSearchQuery.trim()}" 결제수단 추가/태그</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 6.5 Sub-item Breakdown Mode (쿠팡, 마트 등 복합 결제) */}
        <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                if (!showSubItemEntry && subItems.length === 0) {
                  handleAddSubItem();
                }
                setShowSubItemEntry(!showSubItemEntry);
              }}
              className="flex items-center gap-2 text-xs font-black text-blue-800 hover:text-blue-900 cursor-pointer"
            >
              <div className="w-5 h-5 rounded-md bg-blue-600 text-white flex items-center justify-center font-bold">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <span>쿠팡·마트 품목별 세부내역 함께 입력 ({subItems.length}개)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!showSubItemEntry && subItems.length === 0) {
                  handleAddSubItem();
                }
                setShowSubItemEntry(!showSubItemEntry);
              }}
              className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
            >
              {showSubItemEntry ? '접기 ▲' : '세부내역 펼치기 ▼'}
            </button>
          </div>

          {showSubItemEntry && (
            <div className="space-y-2 pt-1 border-t border-blue-100 animate-in fade-in duration-150">
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 font-medium whitespace-nowrap overflow-x-auto scrollbar-none">
                <span>쿠팡·마트 등 여러 물품을 결제했을 때 각 품목별 카테고리와 금액을 나누어 기록합니다.</span>
                <div className="flex items-center gap-1 text-[11px] shrink-0">
                  <span className="text-slate-400">예시:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSubItems([
                        { id: `sub-p1`, name: '신선란 30구', quantity: 1, unitPrice: 8900, amount: 8900, category: '식비' },
                        { id: `sub-p2`, name: '서울우유 2.3L', quantity: 2, unitPrice: 3225, amount: 6450, category: '식비' },
                        { id: `sub-p3`, name: '롤화장지 30롤', quantity: 1, unitPrice: 19800, amount: 19800, category: '생활용품' },
                      ]);
                      setAmountStr((35150).toLocaleString('ko-KR'));
                    }}
                    className="px-1.5 py-0.5 bg-white border border-slate-200 hover:border-blue-400 text-slate-700 rounded text-[10px] font-bold transition cursor-pointer"
                  >
                    쿠팡
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSubItems([
                        { id: `sub-p1`, name: '소고기 300g', quantity: 1, unitPrice: 28000, amount: 28000, category: '식비' },
                        { id: `sub-p2`, name: '대파 & 양파', quantity: 1, unitPrice: 6500, amount: 6500, category: '식비' },
                        { id: `sub-p3`, name: '주방세제 리필', quantity: 2, unitPrice: 3750, amount: 7500, category: '생활용품' },
                      ]);
                      setAmountStr((42000).toLocaleString('ko-KR'));
                    }}
                    className="px-1.5 py-0.5 bg-white border border-slate-200 hover:border-blue-400 text-slate-700 rounded text-[10px] font-bold transition cursor-pointer"
                  >
                    마트
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {subItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="p-2 sm:p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-2 transition hover:border-blue-300"
                  >
                    {/* Row 1 on mobile, left part on desktop: Number + Name + Category + (Delete on mobile) */}
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="text-[10px] font-mono font-bold text-slate-400 w-4 text-center shrink-0">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        placeholder="품목명 (예: 우유, 세제)"
                        value={item.name}
                        onChange={(e) => handleUpdateSubItem(item.id, 'name', e.target.value)}
                        className="flex-1 min-w-[90px] px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-500"
                      />
                      <select
                        value={item.category || category || '식비'}
                        onChange={(e) => handleUpdateSubItem(item.id, 'category', e.target.value)}
                        className="w-20 sm:w-24 px-1.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 focus:bg-white focus:outline-none focus:border-blue-500 shrink-0"
                      >
                        {Array.from(
                          new Set([
                            ...visibleCategories,
                            ...hiddenCategories,
                            ...(item.category ? [item.category] : []),
                            ...(category ? [category] : []),
                          ])
                        ).map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleRemoveSubItem(item.id)}
                        className="sm:hidden p-1.5 text-slate-400 hover:text-rose-600 rounded-md cursor-pointer shrink-0"
                        title="품목 삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Row 2 on mobile, right part on desktop: Unit Price × Quantity = Total Amount */}
                    <div className="flex items-center justify-between sm:justify-end gap-1.5 pl-5 sm:pl-0 pt-1.5 sm:pt-0 border-t border-slate-100 sm:border-0 shrink-0">
                      {/* 단가 */}
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-bold text-slate-500 shrink-0">단가:</span>
                        <div className="w-20 sm:w-22 relative">
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
                              handleUpdateSubItem(
                                item.id,
                                'unitPrice',
                                e.target.value ? Number(e.target.value) : 0
                              )
                            }
                            className="w-full pl-1.5 pr-4 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 text-right focus:bg-white focus:outline-none focus:border-blue-500"
                          />
                          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 select-none">
                            원
                          </span>
                        </div>
                      </div>

                      {/* 곱하기 기호 */}
                      <span className="text-xs text-slate-400 font-bold select-none">×</span>

                      {/* 수량 */}
                      <div className="flex items-center gap-0.5">
                        <span className="text-[10px] font-bold text-slate-500 shrink-0">수량:</span>
                        <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden shadow-2xs">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateSubItem(
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
                              handleUpdateSubItem(
                                item.id,
                                'quantity',
                                e.target.value ? Number(e.target.value) : 1
                              )
                            }
                            className="w-7 text-center text-xs font-black text-slate-900 focus:outline-none py-0.5"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateSubItem(item.id, 'quantity', (item.quantity || 1) + 1)
                            }
                            className="w-5 h-6 flex items-center justify-center text-xs text-slate-600 hover:bg-slate-100 active:bg-slate-200 cursor-pointer font-black select-none"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* 등호 기호 */}
                      <span className="text-xs text-slate-400 font-bold select-none">=</span>

                      {/* 총 금액 */}
                      <div className="w-22 sm:w-26 relative">
                        <input
                          type="number"
                          min="0"
                          step="10"
                          placeholder="합계"
                          value={item.amount || ''}
                          onChange={(e) =>
                            handleUpdateSubItem(
                              item.id,
                              'amount',
                              e.target.value ? Number(e.target.value) : 0
                            )
                          }
                          className="w-full pl-1.5 pr-4 py-1 bg-blue-50/70 border border-blue-300 rounded-lg text-xs font-black text-blue-900 text-right focus:bg-white focus:outline-none focus:border-blue-500"
                        />
                        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] font-bold text-blue-500 select-none">
                          원
                        </span>
                      </div>

                      {/* Desktop Delete button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveSubItem(item.id)}
                        className="hidden sm:inline-flex p-1 text-slate-400 hover:text-rose-600 rounded-md cursor-pointer shrink-0 transition"
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
                  onClick={handleAddSubItem}
                  className="px-2.5 py-1 bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>품목 추가</span>
                </button>

                {subItemsSum > 0 && (
                  <div className="flex items-center gap-2 text-xs whitespace-nowrap shrink-0">
                    <span className="text-slate-600 font-bold">
                      품목 합계: <strong className="text-blue-700 font-black">{subItemsSum.toLocaleString('ko-KR')}원</strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleSyncAmountWithSubItems}
                      className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-black cursor-pointer shadow-xs whitespace-nowrap shrink-0"
                      title="입력창 상단 금액을 세부 품목 합계로 자동 설정"
                    >
                      총 금액에 적용
                    </button>
                  </div>
                )}
              </div>

              {/* Auto split option checkbox (create mode only; edit mode provides split action button below) */}
              {!isEditMode && subItems.length > 0 && (
                <div className="mt-2.5 p-2.5 bg-blue-50/90 border border-blue-200 rounded-xl space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-blue-950 select-none">
                    <input
                      type="checkbox"
                      checked={splitSubItemsIntoSeparateTx}
                      onChange={(e) => setSplitSubItemsIntoSeparateTx(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>세부 품목들을 개별 거래 내역으로 각각 분할 등록</span>
                  </label>
                  <p className="text-[10.5px] text-blue-700 pl-6 leading-tight">
                    {splitSubItemsIntoSeparateTx
                      ? '✓ 각 품목(식비, 생활용품 등)이 독립된 거래 내역으로 각각 등록되며, 남은 금액은 잔여 내역으로 남깁니다.'
                      : '✓ 기본값: 1건의 지출 내역(총액) 안에 세부 품목 목록을 온전히 묶어서 보관합니다. (카드 청구서 1건과 1:1 일치)'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 6.5. Optional Collapsible Card Installment Section (Non-intrusive, expense create mode only) */}
        {!isEditMode && type === 'expense' && (
          <div
            className={`rounded-xl border transition-all ${
              isInstallmentEnabled
                ? 'border-indigo-400 bg-indigo-50/40 shadow-xs'
                : showInstallmentPanel
                ? 'border-indigo-200 bg-slate-50/70'
                : 'border-slate-200 bg-slate-50/40'
            }`}
          >
            <button
              type="button"
              tabIndex={-1}
              onClick={() => {
                setShowInstallmentPanel((prev) => {
                  const next = !prev;
                  if (next && !isInstallmentEnabled) {
                    setIsInstallmentEnabled(true);
                  }
                  return next;
                });
              }}
              className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-100/70 rounded-xl transition cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
                <span>카드 할부 자동 분할 (선택)</span>
                {isInstallmentEnabled ? (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-600 text-white">
                    {installmentMonths}개월 {annualInterestRateNum > 0 ? `연 ${annualInterestRateNum}%` : '무이자'}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                    — 할부 기간 동안 매월 자동 입력 · 이자율 지원
                  </span>
                )}
              </span>
              <span className="text-[11px] font-bold text-indigo-600 flex items-center gap-0.5 shrink-0">
                <span>{showInstallmentPanel ? '접기' : isInstallmentEnabled ? '설정 보기' : '할부 설정'}</span>
                {showInstallmentPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </span>
            </button>

            {showInstallmentPanel && (
              <div className="px-3.5 pb-3.5 pt-2 border-t border-indigo-100 space-y-3 animate-in fade-in duration-150">
                {/* Enable Checkbox */}
                <label className="flex items-center justify-between gap-2 p-2.5 bg-white border border-indigo-200 rounded-xl cursor-pointer select-none">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isInstallmentEnabled}
                      onChange={(e) => setIsInstallmentEnabled(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-black text-indigo-950 block">
                        이 결제를 카드 할부로 매월 자동 분할 등록
                      </span>
                      <span className="text-[10.5px] text-slate-500 block">
                        결제일({date || '오늘'}) 기준으로 매월 같은 날짜에 할부 회차가 자동 생성됩니다.
                      </span>
                    </div>
                  </div>
                </label>

                {isInstallmentEnabled && (
                  <>
                    {/* Installment Months */}
                    <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-black text-slate-700">할부 개월 수</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={2}
                            max={60}
                            value={installmentMonths}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              if (!isNaN(v)) setInstallmentMonths(Math.min(60, Math.max(2, v)));
                            }}
                            className="w-14 px-2 py-1 text-right text-xs font-black text-indigo-900 bg-indigo-50 border border-indigo-300 rounded-lg focus:outline-none focus:border-indigo-600"
                          />
                          <span className="text-[11px] font-bold text-slate-600">개월</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[2, 3, 6, 10, 12, 24].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setInstallmentMonths(m)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                              installmentMonths === m
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-indigo-50 hover:border-indigo-300'
                            }`}
                          >
                            {m}개월
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Interest Rate */}
                    <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[11px] font-black text-slate-700">연 할부 이자율</span>
                          <span className="text-[10px] text-slate-400 ml-1.5">(유이자 시 원리금균등 계산)</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={installmentRateStr}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9.]/g, '');
                              const parts = val.split('.');
                              const normalized = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : val;
                              setInstallmentRateStr(normalized);
                            }}
                            onBlur={() => {
                              if (!installmentRateStr.trim()) setInstallmentRateStr('0');
                            }}
                            className="w-16 px-2 py-1 text-right text-xs font-black text-indigo-900 bg-indigo-50 border border-indigo-300 rounded-lg focus:outline-none focus:border-indigo-600"
                          />
                          <span className="text-[11px] font-bold text-slate-600">%</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: '무이자 (0%)', val: '0' },
                          { label: '3.5%', val: '3.5' },
                          { label: '5.9%', val: '5.9' },
                          { label: '10%', val: '10' },
                          { label: '14.5%', val: '14.5' },
                        ].map((preset) => (
                          <button
                            key={preset.val}
                            type="button"
                            onClick={() => setInstallmentRateStr(preset.val)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                              Number(installmentRateStr || '0') === Number(preset.val)
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-indigo-50 hover:border-indigo-300'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Live Preview Box */}
                    {installmentPreview && (
                      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-3 space-y-2">
                        {parsedBaseAmount <= 0 ? (
                          <p className="text-[11px] font-bold text-indigo-700">
                            💡 상단에 총 할부 원금을 입력하면 월 납부액과 회차별 날짜가 바로 계산됩니다.
                          </p>
                        ) : (
                          <>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div className="bg-white/90 rounded-lg p-2 border border-indigo-100">
                                <span className="text-[10px] font-bold text-slate-500 block">월 평균 납부액</span>
                                <span className="text-xs sm:text-sm font-black text-indigo-700">
                                  {installmentPreview.monthlyAverage.toLocaleString('ko-KR')}원
                                </span>
                              </div>
                              <div className="bg-white/90 rounded-lg p-2 border border-indigo-100">
                                <span className="text-[10px] font-bold text-slate-500 block">총 할부 이자</span>
                                <span className={`text-xs sm:text-sm font-black ${installmentPreview.totalInterest > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                  {installmentPreview.totalInterest > 0
                                    ? `+${installmentPreview.totalInterest.toLocaleString('ko-KR')}원`
                                    : '무이자 0원'}
                                </span>
                              </div>
                              <div className="bg-white/90 rounded-lg p-2 border border-indigo-100">
                                <span className="text-[10px] font-bold text-slate-500 block">총 납부 합계</span>
                                <span className="text-xs sm:text-sm font-black text-slate-900">
                                  {installmentPreview.totalPayable.toLocaleString('ko-KR')}원
                                </span>
                              </div>
                            </div>

                            <div className="text-[11px] text-indigo-900 space-y-1">
                              <div className="flex flex-wrap items-center justify-between gap-1">
                                <span className="font-bold">
                                  📅 할부 기간:{' '}
                                  <strong className="font-black">
                                    {installmentPreview.schedule[0]?.date} ~{' '}
                                    {installmentPreview.schedule[installmentPreview.schedule.length - 1]?.date}
                                  </strong>
                                </span>
                                <span className="text-[10.5px] font-bold text-indigo-700">
                                  {inferredSheetYear}년 시트 {installmentInSheetItems.length}건 자동 입력
                                </span>
                              </div>

                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {installmentPreview.schedule.slice(0, 6).map((s) => (
                                  <span
                                    key={s.index}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                      s.recordedInSheet || installmentFutureYearItems.length === 0
                                        ? 'bg-white text-indigo-800 border-indigo-200'
                                        : 'bg-slate-100 text-slate-500 border-slate-200'
                                    }`}
                                  >
                                    {s.index}회 {s.date.slice(2, 7)} · {s.amount.toLocaleString('ko-KR')}원
                                  </span>
                                ))}
                                {installmentPreview.schedule.length > 6 && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-indigo-600">
                                    외 {installmentPreview.schedule.length - 6}회...
                                  </span>
                                )}
                              </div>

                              {installmentFutureYearItems.length > 0 && (
                                <p className="text-[10.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 font-bold">
                                  ℹ️ 내년({installmentFutureYearItems[0].year}년) 이후 {installmentFutureYearItems.length}회차는 올해({inferredSheetYear}) 시트 합계 왜곡을 막기 위해 시트에는 쓰지 않고, 대시보드 <strong>💳 할부 현황</strong>에서 잔여 회차로 계속 추적됩니다.
                                </p>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* 7. Memo */}
        <div>
          <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>메모 (선택)</span>
          </label>
          <input
            ref={memoInputRef}
            type="text"
            placeholder="상세 메모 및 비고"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault();
                if (e.shiftKey) {
                  focusAndScroll(paymentSearchInputRef.current, paymentSectionRef.current);
                } else {
                  focusAndScroll(submitButtonRef.current, submitButtonRef.current, 'end');
                }
              }
            }}
            className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-600"
          />
        </div>

        {/* Submit / Action Bar */}
        {isEditMode ? (
          <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
            {onClose && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 cursor-pointer transition active:scale-95"
              >
                닫기
              </button>
            )}

            {editingTransaction && onDeleteTransactionFromEdit && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => onDeleteTransactionFromEdit(editingTransaction)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 cursor-pointer flex items-center gap-1.5 transition active:scale-95"
                title="이 내역 삭제하기"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                <span>삭제</span>
              </button>
            )}

            {editingTransaction && onCopyTransactionFromEdit && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => onCopyTransactionFromEdit(editingTransaction)}
                className="px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 cursor-pointer flex items-center gap-1.5 transition active:scale-95"
                title="이 내역 복사하기"
              >
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>복사</span>
              </button>
            )}

            {editingTransaction && onSplitTransactionFromEdit && validSubItemsForSplit.length > 0 && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  const parsedAmount =
                    isFormula && formulaEval.isValid && formulaEval.value !== null
                      ? formulaEval.value
                      : parseInt(amountStr.replace(/[^0-9]/g, '') || '0', 10) || editingTransaction.amount;
                  onSplitTransactionFromEdit(
                    {
                      ...editingTransaction,
                      amount: parsedAmount,
                      category: category || editingTransaction.category,
                      description: description.trim() || editingTransaction.description,
                      paymentMethod: paymentMethod || editingTransaction.paymentMethod,
                    },
                    validSubItemsForSplit
                  );
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-600/25"
                title="각 세부 품목을 개별 내역으로 분할하고 남은 금액은 기존 항목 잔여로 유지"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>✂️ 개별 분할 저장</span>
              </button>
            )}

            <button
              ref={submitButtonRef}
              type="submit"
              disabled={isSubmitting}
              onKeyDown={(e) => {
                if (e.key === 'Tab' && e.shiftKey) {
                  e.preventDefault();
                  focusAndScroll(memoInputRef.current, submitButtonRef.current, 'end');
                }
              }}
              className="px-6 py-2.5 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-blue-600/20 focus:outline-none focus:ring-4 focus:ring-blue-300"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isRealGoogleConnected ? 'Google 시트에 저장 중...' : '수정 저장 중...'}</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{isRealGoogleConnected ? 'Google 시트에 수정 저장' : '수정 내용 저장'}</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <button
            ref={submitButtonRef}
            type="submit"
            disabled={isSubmitting}
            onKeyDown={(e) => {
              if (e.key === 'Tab' && e.shiftKey) {
                e.preventDefault();
                focusAndScroll(memoInputRef.current, submitButtonRef.current, 'end');
              }
            }}
            className={`w-full py-4 rounded-xl font-black text-base text-white shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-4 focus:ring-blue-300 ${
              successAnimation
                ? 'bg-emerald-600 shadow-emerald-500/30'
                : type === 'expense'
                ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/30 active:scale-98'
                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/30 active:scale-98'
            }`}
          >
            {successAnimation ? (
              <>
                <Check className="w-5 h-5 animate-bounce" />
                <span>저장 완료되었습니다!</span>
              </>
            ) : isSubmitting ? (
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>가계부에 저장 중...</span>
              </div>
            ) : isInstallmentEnabled && installmentPreview ? (
              <>
                <CreditCard className="w-5 h-5" />
                <span>
                  💳 {installmentMonths}개월 할부 등록 (시트 {installmentInSheetItems.length}건 자동 입력)
                </span>
              </>
            ) : (
              <>
                <Plus className="w-5 h-5" />
                <span>가계부에 저장하기</span>
              </>
            )}
          </button>
        )}
      </form>

      {/* 4. Import / Copy Modal (지난달 고정지출 & 최근 내역 복사) */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border-2 border-indigo-200 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-indigo-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-blue-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-600/20">
                  <Repeat className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-black text-indigo-950 flex items-center gap-2">
                    <span>지난달 고정지출 불러오기 / 복사</span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-700">
                      {selectedSourceMonth}월 기준
                    </span>
                  </h4>
                  <p className="text-xs text-indigo-700 font-medium">
                    지난달 정기 지출을 1초 만에 현재 입력창에 채우거나, 여러 개를 이번 달에 일괄 등록합니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition cursor-pointer"
                title="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Source Month Pills Selector */}
            <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <span className="text-xs font-bold text-slate-500 shrink-0 mr-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>불러올 월:</span>
              </span>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const isSelected = selectedSourceMonth === m;
                const isPrevMonth = m === defaultPrevMonthNum;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSelectedSourceMonth(m)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 transition cursor-pointer flex items-center gap-1 ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : isPrevMonth
                        ? 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200 ring-1 ring-indigo-300'
                        : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    <span>{m}월</span>
                    {isPrevMonth && <span className="text-[10px] opacity-80">(지난달)</span>}
                  </button>
                );
              })}
            </div>

            {/* Filter Tabs & Search Bar */}
            <div className="p-3 sm:px-5 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setImportTab('fixed')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    importTab === 'fixed'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Repeat className="w-3.5 h-3.5 text-indigo-600" />
                  <span>⚡ 고정지출만 ({importedTransactions.filter(isFixedOrRecurring).length}건)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImportTab('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    importTab === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>전체 내역 ({importedTransactions.length}건)</span>
                </button>
              </div>

              {/* Search input */}
              <div className="relative flex-1 min-w-[140px] max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={importSearchQuery}
                  onChange={(e) => setImportSearchQuery(e.target.value)}
                  placeholder="항목/분류/메모 검색..."
                  className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:bg-white"
                />
              </div>
            </div>

            {/* Transaction Items List */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-2 bg-slate-50/50">
              {isLoadingImport ? (
                <div className="py-14 text-center text-slate-500 space-y-3">
                  <Loader2 className="w-7 h-7 animate-spin mx-auto text-indigo-600" />
                  <p className="text-xs font-bold">{selectedSourceMonth}월 내역을 불러오는 중입니다...</p>
                </div>
              ) : displayImportItems.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2 bg-white rounded-2xl border border-slate-200 p-6">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                    <Repeat className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-bold text-slate-600">
                    {importTab === 'fixed'
                      ? `${selectedSourceMonth}월에 고정/정기지출로 분류된 항목이 없습니다.`
                      : `${selectedSourceMonth}월에 등록된 내역이 없습니다.`}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    상단에서 다른 월을 선택하거나 [전체 내역] 탭을 눌러보세요.
                  </p>
                </div>
              ) : (
                <>
                  {isFallbackFixedList && (
                    <div className="p-3 bg-indigo-50/80 border border-indigo-200 rounded-xl text-xs text-indigo-950 flex items-start gap-2 shadow-2xs mb-2">
                      <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                      <div className="leading-relaxed">
                        <p className="font-black text-indigo-950">
                          💡 '고정' 태그된 항목이 없어 {selectedSourceMonth}월 전체 내역({importedTransactions.length}건)을 표시합니다.
                        </p>
                        <p className="text-[11px] text-indigo-800 mt-0.5">
                          원하는 항목을 선택하여 하단 [선택한 항목 이번 달에 일괄 등록]을 누르거나, 우측 [채우기] 버튼을 눌러보세요!
                        </p>
                      </div>
                    </div>
                  )}

                  {displayImportItems.map((item) => {
                  const isChecked = selectedImportIds.has(item.id);
                  const isFixed = isFixedOrRecurring(item);
                  const payBadge = getPaymentGroupBadge(item.paymentMethod);
                  const targetD = calculateTargetDate(item.date);

                  return (
                    <div
                      key={item.id}
                      className={`p-3 bg-white rounded-xl border transition-all duration-150 flex items-center justify-between gap-3 ${
                        isChecked
                          ? 'border-indigo-300 shadow-xs bg-indigo-50/20 ring-1 ring-indigo-200'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* Checkbox & Item Info */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Set(selectedImportIds);
                            if (next.has(item.id)) {
                              next.delete(item.id);
                            } else {
                              next.add(item.id);
                            }
                            setSelectedImportIds(next);
                          }}
                          className="shrink-0 p-1 text-slate-400 hover:text-indigo-600 cursor-pointer"
                          title="일괄 등록용 선택"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300" />
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {item.date?.slice(5) || '날짜'}
                            </span>

                            {payBadge && (
                              <span
                                className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${payBadge.colorClass}`}
                                title={item.paymentMethod}
                              >
                                {payBadge.label}
                              </span>
                            )}

                            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                              {item.category || '미분류'}
                            </span>

                            {isFixed && (
                              <span className="text-[10px] font-black text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                                고정
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-1">
                            <h5 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                              {item.description}
                            </h5>
                            {item.memo && (
                              <span className="text-[11px] text-slate-400 truncate max-w-[120px]">
                                ({item.memo})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Amount & Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <span
                            className={`text-xs sm:text-sm font-black font-mono ${
                              item.type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {item.type === 'income' ? '+' : ''}
                            {item.amount.toLocaleString()}원
                          </span>
                          <span className="block text-[10px] text-slate-400 font-medium">
                            적용일: {targetD.slice(5)}
                          </span>
                        </div>

                        {/* 1-Click Load into Form Button */}
                        <button
                          type="button"
                          onClick={() => handleFillItemIntoForm(item)}
                          className="px-2.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-black shadow-xs cursor-pointer active:scale-95 transition flex items-center gap-1"
                          title="이 항목을 현재 입력창에 자동으로 채워 넣습니다."
                        >
                          <Plus className="w-3 h-3" />
                          <span>입력창 채우기</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
            </div>

            {/* Bottom Floating Action Bar for Batch Import */}
            <div className="p-3 sm:p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-t border-slate-800">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleToggleSelectAllImport}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  {displayImportItems.length > 0 &&
                  displayImportItems.every((t) => selectedImportIds.has(t.id))
                    ? '전체 해제'
                    : '전체 선택'}
                </button>
                <div className="text-xs">
                  <span className="text-slate-400">선택: </span>
                  <strong className="text-white font-black">{selectedImportIds.size}건</strong>
                  <span className="text-slate-500 mx-1.5">|</span>
                  <span className="text-slate-400">합계: </span>
                  <strong className="text-indigo-300 font-black font-mono">
                    {selectedTotalImportAmount.toLocaleString()}원
                  </strong>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  닫기
                </button>
                <button
                  type="button"
                  disabled={selectedImportIds.size === 0 || isBatchRegistering}
                  onClick={handleBatchRegisterSelected}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-indigo-600/30 active:scale-95 transition cursor-pointer"
                >
                  {isBatchRegistering ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{targetMonth}에 일괄 등록 중...</span>
                    </>
                  ) : (
                    <>
                      <Repeat className="w-3.5 h-3.5" />
                      <span>선택한 {selectedImportIds.size}개 이번 달({targetMonth})에 일괄 등록</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
