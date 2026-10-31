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
  getCategoryFrequencyUpToLastMonth,
  sortCategoriesByPastFrequency,
} from '../services/categoryManager';
import { evaluateMathFormula, containsFormula, sanitizeFormulaInput } from '../utils/mathFormula';

interface ExpenseInputFormProps {
  analysis: SheetAnalysisResult;
  activeSheetTitle: string;
  spreadsheetTitle: string;
  isRealGoogleConnected: boolean;
  onAddTransaction: (
    transaction: Omit<Transaction, 'id' | 'rowIndex'> & { sheetTitle?: string }
  ) => Promise<void>;
  onClose?: () => void;
  isModal?: boolean;
  customCategories?: CategoryItem[];
  customPaymentMethods?: PaymentMethodItem[];
  onOpenCategoryManager?: () => void;
  transactions?: Transaction[];
}

export const ExpenseInputForm: React.FC<ExpenseInputFormProps> = ({
  analysis,
  activeSheetTitle,
  spreadsheetTitle,
  isRealGoogleConnected,
  onAddTransaction,
  onClose,
  isModal = false,
  customCategories,
  customPaymentMethods,
  onOpenCategoryManager,
  transactions,
}) => {
  const [type, setType] = useState<TransactionType>('expense');
  const [amountStr, setAmountStr] = useState<string>('');
  const [splitSubItemsIntoSeparateTx, setSplitSubItemsIntoSeparateTx] = useState<boolean>(true);
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [customCategoryInput, setCustomCategoryInput] = useState<boolean>(false);
  const [newCategoryText, setNewCategoryText] = useState<string>('');
  const [showHiddenCategories, setShowHiddenCategories] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successAnimation, setSuccessAnimation] = useState<boolean>(false);

  // Sub-items for composite purchases (Coupang, Mart, etc.)
  const [showSubItemEntry, setShowSubItemEntry] = useState<boolean>(false);
  const [subItems, setSubItems] = useState<SubItem[]>([]);

  const descInputRef = useRef<HTMLInputElement>(null);

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

  // Category frequency map up to last month
  const categoryFrequencyMap = React.useMemo(() => {
    return getCategoryFrequencyUpToLastMonth(transactions || [], date || activeSheetTitle);
  }, [transactions, date, activeSheetTitle]);

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
      list = analysis.detectedCategories
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
  }, [customCategories, analysis.detectedCategories, type, categoryFrequencyMap]);

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
      list = analysis.detectedCategories
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

    if (sorted.length > 0 && !sorted.includes(category)) {
      setCategory(sorted[0]);
    }
  };

  // Resolved payment methods
  const visiblePaymentMethods = React.useMemo(() => {
    if (customPaymentMethods && customPaymentMethods.length > 0) {
      const vis = customPaymentMethods.filter((p) => p.isVisible).map((p) => p.name);
      return vis.length > 0 ? vis : customPaymentMethods.map((p) => p.name);
    }
    return analysis.detectedPaymentMethods.length > 0
      ? analysis.detectedPaymentMethods
      : DEFAULT_PAYMENT_METHODS;
  }, [customPaymentMethods, analysis.detectedPaymentMethods]);

  // Set default category when type or category list changes
  useEffect(() => {
    if (!category || !visibleCategories.includes(category)) {
      if (visibleCategories.length > 0) {
        setCategory(visibleCategories[0]);
      }
    }
  }, [type, visibleCategories]);

  // Set default payment method
  useEffect(() => {
    if (!paymentMethod && visiblePaymentMethods.length > 0) {
      setPaymentMethod(visiblePaymentMethods[0]);
    }
  }, [visiblePaymentMethods]);

  // Smart Autocomplete Suggestions based on Description typing
  const filteredSuggestions = React.useMemo(() => {
    if (!description.trim()) return [];
    const q = description.trim().toLowerCase();
    return analysis.historicalDescriptions
      .filter((h) => h.description.toLowerCase().includes(q))
      .slice(0, 5);
  }, [description, analysis.historicalDescriptions]);

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

    // Auto-predict category
    const exactMatch = analysis.historicalDescriptions.find(
      (h) => h.description.toLowerCase() === val.trim().toLowerCase()
    );
    if (exactMatch) {
      setCategory(exactMatch.category);
      if (exactMatch.paymentMethod) {
        setPaymentMethod(exactMatch.paymentMethod);
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
    if (e.key === 'Enter') {
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
    setDate(d.toISOString().slice(0, 10));
  };

  // Handle Add Category
  const handleAddNewCategory = () => {
    if (newCategoryText.trim()) {
      setCategory(newCategoryText.trim());
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

    setIsSubmitting(true);
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
          };
        });

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

          await onAddTransaction({
            date,
            type,
            category: item.category || category || '기타',
            description: `${description.trim()}${qtyDesc}`,
            amount: item.amount,
            paymentMethod: paymentMethod || undefined,
            memo: memoDetail,
            sheetTitle: targetMonth,
            createdAt: Date.now(),
          });
        }

        // 2. If there is remaining amount, keep it as the original transaction
        if (remaining > 0) {
          await onAddTransaction({
            date,
            type,
            category: category || '기타',
            description: `${description.trim()} (잔여)`,
            amount: remaining,
            paymentMethod: paymentMethod || undefined,
            memo: `[세부 품목 ${subSum.toLocaleString()}원 분할 후 잔여액]`,
            sheetTitle: targetMonth,
            createdAt: Date.now(),
          });
        }
      } else {
        const finalMemo =
          validSubItems.length > 0
            ? serializeSubItemsToMemo(memo.trim() || undefined, validSubItems)
            : memo.trim() || undefined;

        await onAddTransaction({
          date,
          type,
          category: category || '기타',
          description: description.trim(),
          amount: numAmount,
          paymentMethod: paymentMethod || undefined,
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

  return (
    <div className="bg-white rounded-2xl border-2 border-slate-300 shadow-xl overflow-hidden text-slate-900">
      {/* Top Banner / Form Header */}
      <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
            <Plus className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black tracking-tight">가계부 입력창</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-slate-300 font-medium">{spreadsheetTitle}</span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs font-bold text-slate-300">{targetMonth}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
              title="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 bg-white">
        {/* 1. Date Selection */}
        <div>
          <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span>지출/수입 날짜</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 min-w-[150px] px-3.5 py-2.5 bg-white border-2 border-slate-300 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-600"
              required
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setQuickDate(0)}
                className={`px-3 py-2 text-xs font-extrabold rounded-xl transition cursor-pointer ${
                  date === new Date().toISOString().slice(0, 10)
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
            {analysis.historicalDescriptions.length > 0 && (
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

        {/* 5. Category Pills */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-black text-slate-700 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-blue-600" />
                <span>
                  {type === 'income' ? '수입 분류' : type === 'transfer' ? '이체 분류' : '지출 분류'}{' '}
                  ({visibleCategories.length}개)
                </span>
              </label>
              <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                지난달까지 빈도순
              </span>
              {hiddenCategories.length > 0 && (
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
                className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold focus:border-blue-600"
              />
              <button
                type="button"
                onClick={handleAddNewCategory}
                className="px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 cursor-pointer"
              >
                적용
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {/* Visible Categories */}
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1 bg-slate-50 p-2 rounded-xl border border-slate-200">
                {visibleCategories.map((cat) => {
                  const freq = categoryFrequencyMap.get(cat) || 0;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                        category === cat
                          ? type === 'expense'
                            ? 'bg-rose-600 text-white shadow-sm'
                            : type === 'income'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-sky-600 text-white shadow-sm'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-200'
                      }`}
                      title={freq > 0 ? `지난달까지 ${freq}회 사용됨` : '신규/미사용 분류'}
                    >
                      <span>{cat}</span>
                      {freq > 0 && (
                        <span
                          className={`text-[9px] font-bold px-1 rounded-sm ${
                            category === cat ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {freq}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Expandable Hidden Categories */}
              {showHiddenCategories && hiddenCategories.length > 0 && (
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
                        onClick={() => setCategory(cat)}
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

        {/* 6. Payment Method Selector */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
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
            {visiblePaymentMethods.map((pm) => (
              <button
                key={pm}
                type="button"
                onClick={() => setPaymentMethod(pm)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                  paymentMethod === pm
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {pm}
              </button>
            ))}
          </div>
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
                        {visibleCategories.map((c) => (
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

              {/* Auto split option checkbox */}
              {subItems.length > 0 && (
                <div className="mt-2.5 p-2.5 bg-blue-50/90 border border-blue-200 rounded-xl space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-blue-950 select-none">
                    <input
                      type="checkbox"
                      checked={splitSubItemsIntoSeparateTx}
                      onChange={(e) => setSplitSubItemsIntoSeparateTx(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>세부 품목들을 개별 내역으로 각각 분할 등록 (권장)</span>
                  </label>
                  <p className="text-[10.5px] text-blue-700 pl-6 leading-tight">
                    {splitSubItemsIntoSeparateTx
                      ? '✓ 각 품목의 카테고리(식비, 생활용품 등)로 개별 저장되며, 남은 금액은 기존 사용처(쿠팡/마트) 잔여로 유지됩니다.'
                      : '○ 분할하지 않고 1개 거래의 메모란에 품목들을 묶어서 기록합니다.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 7. Memo */}
        <div>
          <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>메모 (선택)</span>
          </label>
          <input
            type="text"
            placeholder="상세 메모 및 비고"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-600"
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className={`w-full py-4 rounded-xl font-black text-base text-white shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer ${
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
          ) : (
            <>
              <Plus className="w-5 h-5" />
              <span>가계부에 저장하기</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
