import React, { useState, useMemo } from 'react';
import { Transaction } from '../types/ledger';
import {
  Copy,
  Calendar,
  Check,
  X,
  FileSpreadsheet,
  Layers,
  Sparkles,
  ArrowRight,
  ClipboardPaste,
  CheckCircle2,
} from 'lucide-react';

interface CopyPasteModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactionsToCopy: Transaction[];
  currentSheetTitle: string;
  sheetTabs: Array<{ id: number; title: string }>;
  onExecuteCopyPaste: (params: {
    items: Transaction[];
    targetMonth: string;
    dateMode: 'keep_day' | 'today' | 'custom';
    customDate?: string;
    includeSubItems: boolean;
    keepRecurringType: boolean;
  }) => Promise<void>;
  onSaveToClipboardOnly?: (items: Transaction[]) => void;
}

export const CopyPasteModal: React.FC<CopyPasteModalProps> = ({
  isOpen,
  onClose,
  transactionsToCopy,
  currentSheetTitle,
  sheetTabs = [],
  onExecuteCopyPaste,
  onSaveToClipboardOnly,
}) => {
  // Extract month number from current sheet
  const defaultMonthNumber = useMemo(() => {
    const match = currentSheetTitle?.trim().match(/(?:^|[^0-9])0*(\d{1,2})월/);
    if (match) return parseInt(match[1], 10);
    return new Date().getMonth() + 1;
  }, [currentSheetTitle]);

  const [targetMonthNum, setTargetMonthNum] = useState<number>(defaultMonthNumber);
  const [dateMode, setDateMode] = useState<'keep_day' | 'today' | 'custom'>('keep_day');
  
  const todayStr = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const [customDate, setCustomDate] = useState<string>(todayStr);
  const [includeSubItems, setIncludeSubItems] = useState<boolean>(true);
  const [keepRecurringType, setKeepRecurringType] = useState<boolean>(true);
  
  // Exclude/include specific items from copying
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    return new Set(transactionsToCopy.map((t) => t.id));
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync selection when transactionsToCopy changes
  React.useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(transactionsToCopy.map((t) => t.id)));
      setTargetMonthNum(defaultMonthNumber);
    }
  }, [isOpen, transactionsToCopy, defaultMonthNumber]);

  if (!isOpen || transactionsToCopy.length === 0) return null;

  const targetSheetTitle = `${targetMonthNum}월`;
  const selectedItems = transactionsToCopy.filter((t) => selectedIds.has(t.id));
  const totalAmount = selectedItems.reduce((acc, t) => acc + (t.amount || 0), 0);

  const handleToggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedItems.length === 0) {
      alert('복사할 내역을 1건 이상 선택해 주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onExecuteCopyPaste({
        items: selectedItems,
        targetMonth: targetSheetTitle,
        dateMode,
        customDate: dateMode === 'custom' ? customDate : undefined,
        includeSubItems,
        keepRecurringType,
      });
      onClose();
    } catch (err: any) {
      console.error('Copy-paste error:', err);
      alert(err?.message || '내역 복사 및 붙여넣기 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveClipboard = () => {
    if (onSaveToClipboardOnly) {
      onSaveToClipboardOnly(selectedItems);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black shadow-sm shrink-0">
              <Copy className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900">내역 복사 & 붙여넣기</h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-100 text-blue-800">
                  {selectedItems.length}건 선택됨
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                선택한 내역을 원하는 월 시트나 특정 날짜로 복제하여 저장합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs flex-1">
          {/* 1. Preview of items to copy */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-slate-700 font-bold">
              <span>복사 대상 내역 ({selectedItems.length}건):</span>
              <span className="text-blue-600 font-black">
                합계 {totalAmount.toLocaleString('ko-KR')}원
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 max-h-40 overflow-y-auto space-y-1.5 divide-y divide-slate-100 scrollbar-none">
              {transactionsToCopy.map((tx) => {
                const isChecked = selectedIds.has(tx.id);
                return (
                  <label
                    key={tx.id}
                    onClick={() => handleToggleOne(tx.id)}
                    className={`flex items-center justify-between gap-2 p-1.5 rounded-lg transition cursor-pointer select-none ${
                      isChecked ? 'bg-white shadow-2xs text-slate-900' : 'opacity-50 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className="font-bold text-[11px] text-slate-500 shrink-0">
                        {tx.date}
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold shrink-0">
                        {tx.category}
                      </span>
                      <span className="font-bold truncate text-slate-800">{tx.description}</span>
                      {tx.subItems && tx.subItems.length > 0 && (
                        <span className="px-1 py-0.2 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold shrink-0">
                          +{tx.subItems.length}품목
                        </span>
                      )}
                    </div>
                    <span className="font-black shrink-0 text-slate-900">
                      {tx.amount.toLocaleString('ko-KR')}원
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 2. Target Month Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>붙여넣을 대상 월 (시트 탭)</span>
              </label>
              <span className="text-[11px] text-slate-500">
                선택된 대상: <strong className="text-blue-600">{targetSheetTitle}</strong>
              </span>
            </div>

            {/* 12 Months Chip Grid */}
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const isSelected = targetMonthNum === m;
                const isCurrent = defaultMonthNumber === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setTargetMonthNum(m)}
                    className={`py-2 px-1 rounded-xl text-xs font-bold transition cursor-pointer flex flex-col items-center justify-center relative ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-xs font-black ring-2 ring-blue-300'
                        : isCurrent
                        ? 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/60'
                    }`}
                  >
                    <span>{m}월</span>
                    {isCurrent && (
                      <span
                        className={`text-[9px] mt-0.5 leading-none ${
                          isSelected ? 'text-blue-100' : 'text-blue-600'
                        }`}
                      >
                        (현재)
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Target Date Mode */}
          <div className="space-y-2.5 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span>붙여넣을 날짜 설정</span>
            </label>

            <div className="space-y-2">
              {/* Option A: Keep Day */}
              <label
                className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition cursor-pointer ${
                  dateMode === 'keep_day'
                    ? 'bg-white border-blue-400 shadow-2xs'
                    : 'bg-transparent border-transparent hover:bg-white/70'
                }`}
              >
                <input
                  type="radio"
                  name="dateMode"
                  checked={dateMode === 'keep_day'}
                  onChange={() => setDateMode('keep_day')}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <span>원래 날짜의 '일(Day)' 유지</span>
                    <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 text-[10px] font-black">
                      추천
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    기존 날짜의 '일'을 그대로 유지하고 월만 <strong>{targetMonthNum}월</strong>로 변경합니다. (예: 10월 15일 → <strong>{targetMonthNum}월 15일</strong>)
                  </p>
                </div>
              </label>

              {/* Option B: Today */}
              <label
                className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition cursor-pointer ${
                  dateMode === 'today'
                    ? 'bg-white border-blue-400 shadow-2xs'
                    : 'bg-transparent border-transparent hover:bg-white/70'
                }`}
              >
                <input
                  type="radio"
                  name="dateMode"
                  checked={dateMode === 'today'}
                  onChange={() => setDateMode('today')}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-slate-900">오늘 날짜로 통일</div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    모든 내역의 날짜를 오늘(<strong>{todayStr}</strong>)로 설정합니다.
                  </p>
                </div>
              </label>

              {/* Option C: Custom Date */}
              <label
                className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition cursor-pointer ${
                  dateMode === 'custom'
                    ? 'bg-white border-blue-400 shadow-2xs'
                    : 'bg-transparent border-transparent hover:bg-white/70'
                }`}
              >
                <input
                  type="radio"
                  name="dateMode"
                  checked={dateMode === 'custom'}
                  onChange={() => setDateMode('custom')}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="font-bold text-slate-900">특정 날짜 직접 지정</div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    원하는 날짜를 선택하여 모든 내역에 동일하게 적용합니다.
                  </p>
                  {dateMode === 'custom' && (
                    <div className="mt-2">
                      <input
                        type="date"
                        value={customDate}
                        onChange={(e) => setCustomDate(e.target.value)}
                        className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                </div>
              </label>
            </div>
          </div>

          {/* 4. Options */}
          <div className="flex items-center gap-4 flex-wrap pt-1">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
              <input
                type="checkbox"
                checked={includeSubItems}
                onChange={(e) => setIncludeSubItems(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>세부품목(품목별 금액/카테고리) 함께 복제</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
              <input
                type="checkbox"
                checked={keepRecurringType}
                onChange={(e) => setKeepRecurringType(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>지출유형(정기예산/특별지출) 유지</span>
            </label>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2 flex-wrap">
          <div>
            {onSaveToClipboardOnly && (
              <button
                type="button"
                onClick={handleSaveClipboard}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                title="지금 바로 붙여넣지 않고 클립보드에 보관한 뒤 나중에 다른 화면에서 붙여넣습니다."
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden sm:inline">클립보드에 보관</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || selectedItems.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-95 text-white rounded-xl text-xs font-black shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>시트에 저장 중...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    [{targetSheetTitle}]에 {selectedItems.length}건 붙여넣기 실행
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
