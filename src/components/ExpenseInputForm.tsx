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
} from 'lucide-react';
import { Transaction, TransactionType, SheetAnalysisResult, formatShortDate } from '../types/ledger';

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
}

export const ExpenseInputForm: React.FC<ExpenseInputFormProps> = ({
  analysis,
  activeSheetTitle,
  spreadsheetTitle,
  isRealGoogleConnected,
  onAddTransaction,
  onClose,
  isModal = false,
}) => {
  const [type, setType] = useState<TransactionType>('expense');
  const [amountStr, setAmountStr] = useState<string>('');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [customCategoryInput, setCustomCategoryInput] = useState<boolean>(false);
  const [newCategoryText, setNewCategoryText] = useState<string>('');
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successAnimation, setSuccessAnimation] = useState<boolean>(false);

  const descInputRef = useRef<HTMLInputElement>(null);

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

  // Available categories for selected type
  const availableCategories = React.useMemo(() => {
    const list = analysis.detectedCategories
      .filter((c) => (type === 'income' ? c.type === 'income' : c.type === 'expense'))
      .map((c) => c.name);

    if (list.length === 0) {
      if (type === 'income') {
        return ['급여', '상여금', '부수입', '금융소득', '용돈', '기타수입'];
      }
      return [
        '식비',
        '외식',
        '간식',
        '생활용품',
        '의류/잡화',
        '교육',
        '용돈',
        '관리비_기타',
        '통신비',
        '보험료',
        '구독',
        '렌탈',
        '교통비',
        '자동차관리',
        '의료비',
        '여행비',
        '취미',
        '골프',
        '경조사',
        '세금/공과금',
        '대출_원금',
        '대출_이자',
        '미용',
      ];
    }
    return list;
  }, [analysis.detectedCategories, type]);

  // Set default category when type or category list changes
  useEffect(() => {
    if (!category || !availableCategories.includes(category)) {
      if (availableCategories.length > 0) {
        setCategory(availableCategories[0]);
      }
    }
  }, [type, availableCategories]);

  // Set default payment method
  useEffect(() => {
    if (!paymentMethod && analysis.detectedPaymentMethods.length > 0) {
      setPaymentMethod(analysis.detectedPaymentMethods[0]);
    }
  }, [analysis.detectedPaymentMethods]);

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

  // Quick Amount Adders
  const handleAddAmount = (addValue: number) => {
    const current = parseInt(amountStr.replace(/[^0-9]/g, '') || '0', 10);
    const updated = current + addValue;
    setAmountStr(updated.toLocaleString('ko-KR'));
  };

  const handleAmountInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawDigits = e.target.value.replace(/[^0-9]/g, '');
    if (!rawDigits) {
      setAmountStr('');
      return;
    }
    const num = parseInt(rawDigits, 10);
    setAmountStr(num.toLocaleString('ko-KR'));
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
    const numAmount = parseInt(amountStr.replace(/[^0-9]/g, '') || '0', 10);
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
      await onAddTransaction({
        date,
        type,
        category: category || '기타',
        description: description.trim(),
        amount: numAmount,
        paymentMethod: paymentMethod || undefined,
        memo: memo.trim() || undefined,
        sheetTitle: targetMonth,
      });

      // Show success feedback
      setSuccessAnimation(true);
      setTimeout(() => setSuccessAnimation(false), 2000);

      // Reset form fields for rapid next entry
      setAmountStr('');
      setDescription('');
      setMemo('');

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
              <span className="text-xs font-black text-yellow-300 flex items-center gap-1">
                <span>{formatShortDate(date)}</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
                <span className="bg-yellow-400 text-slate-900 px-1.5 py-0.2 rounded font-extrabold">
                  {targetMonth} 자동 누적
                </span>
              </span>
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
        {/* Dynamic target month notification */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-2 text-xs text-blue-950 font-bold">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              입력 날짜: <strong className="text-blue-900 underline">{formatShortDate(date)}</strong> <span className="text-blue-600 text-[11px] font-normal">({date})</span>
            </span>
          </div>
          <span className="px-2 py-0.5 bg-blue-600 text-white rounded-md text-[11px] font-extrabold">
            {targetMonth} 시트에 자동 누적 반영됨
          </span>
        </div>

        {/* 1. Date Selection First so Month is immediately visible */}
        <div>
          <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span>지출/수입 날짜 (선택 시 해당 월로 자동 분기)</span>
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
              onClick={() => setType('expense')}
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
              onClick={() => setType('income')}
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
              onClick={() => setType('transfer')}
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

        {/* 3. Amount Input with Quick Add keypad */}
        <div>
          <label className="block text-xs font-black text-slate-700 mb-1.5">
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
              value={amountStr}
              onChange={handleAmountInputChange}
              className="w-full pl-10 pr-4 py-3 bg-white border-2 border-slate-300 rounded-xl text-xl sm:text-2xl font-black text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-blue-600 transition"
              required
            />
          </div>

          {/* Quick Amount Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {[10000, 30000, 50000, 100000, 500000].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => handleAddAmount(val)}
                className="px-2.5 py-1 text-xs font-extrabold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg transition active:scale-95 cursor-pointer border border-slate-200"
              >
                +{val >= 10000 ? `${val / 10000}만` : `${val.toLocaleString()}원`}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAmountStr('')}
              className="p-1 text-xs font-bold text-slate-500 hover:text-slate-800 rounded-lg ml-auto cursor-pointer"
              title="금액 지우기"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
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

        {/* 5. Category Pills (26 Categories) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-black text-slate-700 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-blue-600" />
              <span>분류 (카테고리 {availableCategories.length}개)</span>
            </label>
            <button
              type="button"
              onClick={() => setCustomCategoryInput(!customCategoryInput)}
              className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
            >
              {customCategoryInput ? '목록에서 선택' : '+ 직접 입력'}
            </button>
          </div>

          {customCategoryInput ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="새 분류 이름 입력..."
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
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1 bg-slate-50 p-2 rounded-xl border border-slate-200">
              {availableCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                    category === cat
                      ? type === 'expense'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 6. Payment Method Selector */}
        <div>
          <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1">
            <CreditCard className="w-3.5 h-3.5 text-blue-600" />
            <span>결제 수단</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {analysis.detectedPaymentMethods.map((pm) => (
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
              <span>[{targetMonth}]에 기록 및 누적되었습니다!</span>
            </>
          ) : isSubmitting ? (
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              <span>가계부에 저장 중...</span>
            </div>
          ) : (
            <>
              <Plus className="w-5 h-5" />
              <span>{targetMonth} 가계부에 입력하기</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
