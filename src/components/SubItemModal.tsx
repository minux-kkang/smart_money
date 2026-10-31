import React, { useState, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  Package,
  Layers,
  CheckCircle2,
  AlertCircle,
  Equal,
  Sparkles,
  ShoppingBag,
  ArrowRight,
  Calculator,
  FileSpreadsheet,
} from 'lucide-react';
import { SubItem, Transaction, formatShortDate } from '../types/ledger';
import { serializeSubItemsToMemo } from '../services/subItemStorage';

interface SubItemModalProps {
  transaction: Transaction;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedTransaction: Transaction) => Promise<void> | void;
  onSplitTransaction?: (originalTx: Transaction, items: SubItem[]) => Promise<void> | void;
  availableCategories?: string[];
}

export const SubItemModal: React.FC<SubItemModalProps> = ({
  transaction,
  isOpen,
  onClose,
  onSave,
  onSplitTransaction,
  availableCategories = [],
}) => {
  // Local list of sub-items
  const [subItems, setSubItems] = useState<SubItem[]>(() => {
    if (transaction.subItems && transaction.subItems.length > 0) {
      return transaction.subItems.map((s) => {
        const qty = s.quantity && s.quantity > 0 ? s.quantity : 1;
        const uPrice = s.unitPrice !== undefined ? s.unitPrice : (s.amount > 0 ? Math.round(s.amount / qty) : 0);
        return {
          ...s,
          quantity: qty,
          unitPrice: uPrice,
        };
      });
    }
    // Default with 2 initial blank rows if empty
    return [
      { id: `sub-${Date.now()}-1`, name: '', amount: 0, quantity: 1, unitPrice: 0, category: transaction.category },
      { id: `sub-${Date.now()}-2`, name: '', amount: 0, quantity: 1, unitPrice: 0, category: transaction.category },
    ];
  });

  // Target parent transaction amount (can be synchronized with sub-items sum)
  const [parentAmount, setParentAmount] = useState<number>(transaction.amount);
  const [isSaving, setIsSaving] = useState(false);

  // Calculate sum of sub-items
  const subItemsSum = useMemo(() => {
    return subItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
  }, [subItems]);

  const diff = subItemsSum - parentAmount;
  const isExactMatch = diff === 0;

  // Add a new row
  const handleAddRow = (
    presetName: string = '',
    presetAmt: number = 0,
    presetCat?: string,
    presetQty: number = 1,
    presetUnitPrice?: number
  ) => {
    const qty = presetQty || 1;
    const unitPrice =
      presetUnitPrice !== undefined
        ? presetUnitPrice
        : presetAmt > 0
        ? Math.round(presetAmt / qty)
        : 0;

    setSubItems((prev) => [
      ...prev,
      {
        id: `sub-${Date.now()}-${prev.length + 1}`,
        name: presetName,
        amount: presetAmt,
        quantity: qty,
        unitPrice: unitPrice,
        category: presetCat || transaction.category,
      },
    ]);
  };

  // Remove a row
  const handleRemoveRow = (id: string) => {
    setSubItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Update a row field with automatic quantity, unitPrice, amount sync
  const handleUpdateRow = (id: string, field: keyof SubItem, value: any) => {
    setSubItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          const currentQty = Math.max(
            1,
            Number(field === 'quantity' ? value : item.quantity || 1)
          );

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

  // Sync parent amount to match subItemsSum
  const handleSyncParentAmount = () => {
    if (subItemsSum > 0) {
      setParentAmount(subItemsSum);
    }
  };

  // Save handler
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Filter out completely empty rows
      const validSubItems = subItems
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
          };
        });

      // Serialize into memo for Google Sheets compatibility
      const updatedMemo = serializeSubItemsToMemo(transaction.memo, validSubItems);

      const updatedTx: Transaction = {
        ...transaction,
        amount: parentAmount,
        subItems: validSubItems,
        memo: updatedMemo,
      };

      await onSave(updatedTx);
      onClose();
    } catch (e) {
      console.error('Failed to save sub items:', e);
    } finally {
      setIsSaving(false);
    }
  };

  // Split transaction handler (user request: 가져가고 남은 금액은 기존 쿠팡/마트 항목으로 남김)
  const handleSplit = async () => {
    const validSubItems = subItems
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
        };
      });

    if (validSubItems.length === 0) {
      alert('분할할 세부 품목을 1개 이상 입력해 주세요.');
      return;
    }

    const subSum = validSubItems.reduce((acc, s) => acc + s.amount, 0);
    if (subSum > parentAmount) {
      alert(`세부 품목의 합계(${subSum.toLocaleString('ko-KR')}원)가 원래 거래 금액(${parentAmount.toLocaleString('ko-KR')}원)보다 큽니다. 금액을 확인해 주세요.`);
      return;
    }

    if (onSplitTransaction) {
      setIsSaving(true);
      try {
        await onSplitTransaction(transaction, validSubItems);
        onClose();
      } catch (e) {
        console.error('Failed to split transaction:', e);
      } finally {
        setIsSaving(false);
      }
    } else {
      // Fallback to standard save if onSplitTransaction is not provided
      await handleSave();
    }
  };

  // Preset templates for common multi-item purchases
  const applyPreset = (type: 'coupang' | 'mart' | 'convenience') => {
    if (type === 'coupang') {
      setSubItems([
        { id: `sub-p1`, name: '신선란 30구', quantity: 1, unitPrice: 8900, amount: 8900, category: '식비' },
        { id: `sub-p2`, name: '서울우유 2.3L', quantity: 2, unitPrice: 3225, amount: 6450, category: '식비' },
        { id: `sub-p3`, name: '롤화장지 30롤', quantity: 1, unitPrice: 19800, amount: 19800, category: '생활용품' },
      ]);
      setParentAmount(35150);
    } else if (type === 'mart') {
      setSubItems([
        { id: `sub-p1`, name: '소고기 등심 300g', quantity: 1, unitPrice: 28000, amount: 28000, category: '식비' },
        { id: `sub-p2`, name: '양파 & 대파', quantity: 1, unitPrice: 6500, amount: 6500, category: '식비' },
        { id: `sub-p3`, name: '주방세제 리필', quantity: 2, unitPrice: 3750, amount: 7500, category: '생활용품' },
        { id: `sub-p4`, name: '초콜릿 & 과자', quantity: 2, unitPrice: 2600, amount: 5200, category: '간식' },
      ]);
      setParentAmount(47200);
    } else {
      setSubItems([
        { id: `sub-p1`, name: '아메리카노 캔커피', quantity: 2, unitPrice: 1250, amount: 2500, category: '간식' },
        { id: `sub-p2`, name: '삼각김밥 & 샌드위치', quantity: 2, unitPrice: 2400, amount: 4800, category: '식비' },
        { id: `sub-p3`, name: '건전지 AA', quantity: 1, unitPrice: 3500, amount: 3500, category: '생활용품' },
      ]);
      setParentAmount(10800);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border-2 border-blue-200 overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-blue-100 flex items-center justify-between bg-blue-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900">품목별 세부내역 관리</h3>
                <span className="text-[10px] font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                  쿠팡·마트·쇼핑 세부 입력
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5 flex flex-wrap items-center gap-1.5 font-medium">
                <span className="font-bold text-slate-900">{transaction.description}</span>
                <span className="text-slate-300">|</span>
                <span>{formatShortDate(transaction.date)}</span>
                <span className="text-slate-300">|</span>
                <span className="font-bold text-blue-700">
                  총 {parentAmount.toLocaleString('ko-KR')}원
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-white/80 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Help & Presets Bar */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-50 border-b border-slate-200 text-xs flex items-center justify-between gap-2 shrink-0 whitespace-nowrap overflow-x-auto scrollbar-none">
          <span className="text-[11px] text-slate-500 flex items-center gap-1 font-medium whitespace-nowrap shrink-0">
            <Package className="w-3.5 h-3.5 text-slate-400" />
            <span>장바구니 영수증의 각 품목명과 금액을 입력하세요.</span>
          </span>
          <div className="flex items-center gap-1.5 text-[11px] whitespace-nowrap shrink-0">
            <span className="text-slate-400">예시 템플릿:</span>
            <button
              type="button"
              onClick={() => applyPreset('coupang')}
              className="px-2 py-0.5 bg-white border border-slate-200 hover:border-blue-400 text-slate-700 rounded-md font-bold transition cursor-pointer"
            >
              쿠팡 로켓
            </button>
            <button
              type="button"
              onClick={() => applyPreset('mart')}
              className="px-2 py-0.5 bg-white border border-slate-200 hover:border-blue-400 text-slate-700 rounded-md font-bold transition cursor-pointer"
            >
              마트 장보기
            </button>
          </div>
        </div>

        {/* Sub-item Input List (Scrollable) */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-3 flex-1 min-h-[220px]">
          {subItems.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              등록된 세부 품목이 없습니다. 아래 [+ 새 품목 추가] 버튼을 눌러주세요.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="hidden sm:flex items-center gap-2 text-[11px] font-black text-slate-500 px-2 whitespace-nowrap">
                <div className="w-5 text-center">#</div>
                <div className="flex-1">품목명 / 상품명</div>
                <div className="w-24 sm:w-26">세부분류</div>
                <div className="w-20 text-right">단가 (원)</div>
                <div className="w-20 text-center">수량</div>
                <div className="w-24 text-right">합계 (원)</div>
                <div className="w-7 text-center">삭제</div>
              </div>

              {subItems.map((item, index) => (
                <div
                  key={item.id}
                  className="p-2 sm:p-2.5 bg-slate-50 hover:bg-blue-50/40 rounded-xl border border-slate-200 transition space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-2"
                >
                  {/* Top line on mobile, left block on desktop */}
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="text-[11px] font-bold text-slate-400 w-5 shrink-0 text-center font-mono">
                      {index + 1}
                    </span>
                    <input
                      type="text"
                      placeholder="품목명 (예: 주방세제, 우유)"
                      value={item.name}
                      onChange={(e) => handleUpdateRow(item.id, 'name', e.target.value)}
                      className="flex-1 min-w-[85px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                    />
                    <select
                      value={item.category || transaction.category}
                      onChange={(e) => handleUpdateRow(item.id, 'category', e.target.value)}
                      className="w-22 sm:w-26 shrink-0 px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-500"
                    >
                      {availableCategories.length > 0 ? (
                        availableCategories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="식비">식비</option>
                          <option value="생활용품">생활용품</option>
                          <option value="간식">간식</option>
                          <option value="의류/잡화">의류/잡화</option>
                          <option value="기타">기타</option>
                        </>
                      )}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(item.id)}
                      className="sm:hidden w-7 h-7 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer shrink-0"
                      title="품목 삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Bottom line on mobile, right block on desktop: 단가 × 수량 = 합계 */}
                  <div className="flex items-center justify-between sm:justify-end gap-1.5 pl-6 sm:pl-0 pt-1.5 sm:pt-0 border-t border-slate-200/60 sm:border-0 shrink-0">
                    {/* 단가 */}
                    <div className="flex items-center gap-1">
                      <span className="sm:hidden text-[10px] font-bold text-slate-500 shrink-0">단가:</span>
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
                            handleUpdateRow(item.id, 'unitPrice', e.target.value ? Number(e.target.value) : 0)
                          }
                          className="w-full pl-1.5 pr-4 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 text-right focus:outline-none focus:border-blue-500"
                        />
                        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 select-none">
                          원
                        </span>
                      </div>
                    </div>

                    <span className="text-xs text-slate-400 font-bold select-none">×</span>

                    {/* 수량 */}
                    <div className="flex items-center gap-0.5">
                      <span className="sm:hidden text-[10px] font-bold text-slate-500 shrink-0">수량:</span>
                      <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden shadow-2xs">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateRow(
                              item.id,
                              'quantity',
                              Math.max(1, (item.quantity || 1) - 1)
                            )
                          }
                          className="w-5 h-7 flex items-center justify-center text-xs text-slate-600 hover:bg-slate-100 active:bg-slate-200 cursor-pointer font-black select-none"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="999"
                          value={item.quantity || 1}
                          onChange={(e) =>
                            handleUpdateRow(
                              item.id,
                              'quantity',
                              e.target.value ? Number(e.target.value) : 1
                            )
                          }
                          className="w-8 text-center text-xs font-black text-blue-700 bg-white py-1 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateRow(
                              item.id,
                              'quantity',
                              (item.quantity || 1) + 1
                            )
                          }
                          className="w-5 h-7 flex items-center justify-center text-xs text-slate-600 hover:bg-slate-100 active:bg-slate-200 cursor-pointer font-black select-none"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <span className="text-xs text-slate-400 font-bold select-none">=</span>

                    {/* 합계 금액 */}
                    <div className="w-22 sm:w-26 relative">
                      <input
                        type="number"
                        min="0"
                        step="10"
                        placeholder="합계"
                        value={item.amount || ''}
                        onChange={(e) =>
                          handleUpdateRow(item.id, 'amount', e.target.value ? Number(e.target.value) : 0)
                        }
                        className="w-full pl-1.5 pr-4 py-1.5 bg-blue-50/50 border border-blue-300 rounded-lg text-xs font-black text-blue-900 text-right focus:bg-white focus:outline-none focus:border-blue-500"
                      />
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400 select-none">
                        원
                      </span>
                    </div>

                    {/* Delete on Desktop */}
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(item.id)}
                      className="hidden sm:flex w-7 h-7 items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer shrink-0"
                      title="품목 삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Row Button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => handleAddRow()}
              className="w-full py-2.5 border-2 border-dashed border-blue-200 hover:border-blue-400 hover:bg-blue-50/50 text-blue-600 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>새 품목 추가하기</span>
            </button>
          </div>
        </div>

        {/* Real-time Sum & Match Validation Section */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 space-y-3 shrink-0">
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-blue-600" />
                <span className="font-bold text-slate-600">세부 항목 합계:</span>
                <span className="font-black text-slate-900 text-sm">
                  {subItemsSum.toLocaleString('ko-KR')}원
                </span>
                <span className="text-[11px] text-slate-400">
                  (총 {subItems.filter((i) => i.name.trim() || i.amount > 0).length}개 품목)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-600">원래 거래 금액:</span>
                <span className="font-black text-blue-700 text-sm">
                  {parentAmount.toLocaleString('ko-KR')}원
                </span>
              </div>
            </div>

            {/* Match Status Banner */}
            {isExactMatch ? (
              <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-800 font-bold">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>금액 완벽 일치! 세부 품목의 합계와 거래 총액이 정확히 맞습니다.</span>
                </span>
                <span className="text-[11px] font-black text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                  일치
                </span>
              </div>
            ) : (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 font-bold">
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    차액: {Math.abs(diff).toLocaleString('ko-KR')}원{' '}
                    {diff > 0 ? '초과' : '부족'}{' '}
                    <span className="text-amber-700 font-normal">
                      (세부 합계 {subItemsSum.toLocaleString('ko-KR')}원 vs 거래 금액 {parentAmount.toLocaleString('ko-KR')}원)
                    </span>
                  </span>
                </div>
                {subItemsSum > 0 && (
                  <button
                    type="button"
                    onClick={handleSyncParentAmount}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-[11px] font-black shadow-xs cursor-pointer transition active:scale-95 flex items-center gap-1"
                  >
                    <Equal className="w-3.5 h-3.5" />
                    <span>합계 금액({subItemsSum.toLocaleString('ko-KR')}원)으로 거래 총액 맞추기</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 엑셀 / 구글 시트 저장 미리보기 안내 */}
          <div className="p-2.5 sm:p-3 bg-white rounded-xl border border-slate-200 shadow-xs space-y-1.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-1 font-bold text-slate-700">
              <span className="flex items-center gap-1.5 text-emerald-700">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>엑셀 / Google 시트 반영 미리보기</span>
              </span>
              <span className="text-[10px] text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-full">
                카드 청구서 승인 1건과 1:1 일치
              </span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/90 text-[11px] leading-relaxed space-y-1 font-sans">
              <div className="text-slate-600">
                <span className="font-bold text-slate-700">구글 시트 행:</span>{' '}
                <span className="font-mono text-slate-800">
                  {transaction.date} | [{transaction.category}] {transaction.description} | {parentAmount.toLocaleString('ko-KR')}원 ({transaction.paymentMethod || '카드'})
                </span>
              </div>
              <div className="text-slate-700 pt-0.5 border-t border-slate-200/80">
                <span className="font-bold text-blue-700">시트 메모(비고) 열:</span>{' '}
                <span className="font-mono text-blue-900 bg-blue-50/70 px-1.5 py-0.5 rounded border border-blue-200/70 inline-block mt-0.5 break-all">
                  {serializeSubItemsToMemo(
                    transaction.memo,
                    subItems.filter((s) => s.name.trim() || s.amount > 0)
                  ) || '(세부 품목 없음)'}
                </span>
              </div>
            </div>
            <p className="text-[10.5px] text-slate-500 leading-tight">
              💡 <strong>개별 카테고리 보존:</strong> 각 세부 품목마다 지정한 카테고리(식비, 생활용품 등)는 엑셀 메모란에 <code>품목명(카테고리) 금액</code> 형식으로 함께 기록되어 영수증 세부 내역이 구글 시트 원본에도 그대로 남습니다.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 cursor-pointer"
            >
              닫기
            </button>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSave}
                className="px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition cursor-pointer"
                title="기존 1건 거래 유지 & 메모에 품목 기록"
              >
                1건으로 묶어 저장
              </button>

              <button
                type="button"
                disabled={isSaving || subItems.filter((s) => s.name.trim() || s.amount > 0).length === 0}
                onClick={handleSplit}
                className="px-4 py-2.5 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-600/25"
                title="각 세부 품목을 개별 내역으로 분할하고 남은 금액은 기존 사용처로 유지"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  ✂️ 세부 항목별 개별 내역으로 분할 저장
                  {subItemsSum > 0 && subItemsSum < parentAmount
                    ? ` (잔여 ${(parentAmount - subItemsSum).toLocaleString('ko-KR')}원 유지)`
                    : ''}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
