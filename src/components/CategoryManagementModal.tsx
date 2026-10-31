import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Check,
  Eye,
  EyeOff,
  RotateCcw,
  Tag,
  CreditCard,
  TrendingDown,
  TrendingUp,
  Search,
  Sparkles,
} from 'lucide-react';
import { CategoryItem, PaymentMethodItem, TransactionType } from '../types/ledger';

interface CategoryManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: CategoryItem[];
  paymentMethods: PaymentMethodItem[];
  onUpdateCategories: (categories: CategoryItem[]) => void;
  onUpdatePaymentMethods: (methods: PaymentMethodItem[]) => void;
  onResetToDefaults: () => void;
}

export const CategoryManagementModal: React.FC<CategoryManagementModalProps> = ({
  isOpen,
  onClose,
  categories,
  paymentMethods,
  onUpdateCategories,
  onUpdatePaymentMethods,
  onResetToDefaults,
}) => {
  const [activeTab, setActiveTab] = useState<'expense' | 'income' | 'payment'>('expense');
  const [searchQuery, setSearchQuery] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  if (!isOpen) return null;

  // Filter lists based on search
  const filteredCategories = categories.filter(
    (c) =>
      c.type === (activeTab === 'expense' ? 'expense' : 'income') &&
      c.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const filteredPayments = paymentMethods.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  // Toggle Category Visibility (Show/Hide)
  const handleToggleCategoryVisibility = (id: string) => {
    const updated = categories.map((c) =>
      c.id === id ? { ...c, isVisible: !c.isVisible } : c
    );
    onUpdateCategories(updated);
  };

  // Toggle Payment Visibility
  const handleTogglePaymentVisibility = (id: string) => {
    const updated = paymentMethods.map((p) =>
      p.id === id ? { ...p, isVisible: !p.isVisible } : p
    );
    onUpdatePaymentMethods(updated);
  };

  // Add New Item
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newItemName.trim();
    if (!trimmed) return;

    if (activeTab === 'payment') {
      if (paymentMethods.some((p) => p.name === trimmed)) {
        alert('이미 존재하는 결제 수단입니다.');
        return;
      }
      const newMethod: PaymentMethodItem = {
        id: `custom_pm_${Date.now()}`,
        name: trimmed,
        isVisible: true,
        isCustom: true,
      };
      onUpdatePaymentMethods([...paymentMethods, newMethod]);
    } else {
      const targetType: TransactionType = activeTab === 'expense' ? 'expense' : 'income';
      if (categories.some((c) => c.name === trimmed && c.type === targetType)) {
        alert('이미 존재하는 카테고리입니다.');
        return;
      }
      const newCat: CategoryItem = {
        id: `custom_cat_${Date.now()}`,
        name: trimmed,
        type: targetType,
        isVisible: true,
        color: '#6366F1',
        isCustom: true,
      };
      onUpdateCategories([...categories, newCat]);
    }

    setNewItemName('');
  };

  // Start Editing Name
  const handleStartEdit = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  // Save Edited Name
  const handleSaveEdit = (id: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) return;

    if (activeTab === 'payment') {
      const updated = paymentMethods.map((p) =>
        p.id === id ? { ...p, name: trimmed } : p
      );
      onUpdatePaymentMethods(updated);
    } else {
      const updated = categories.map((c) =>
        c.id === id ? { ...c, name: trimmed } : c
      );
      onUpdateCategories(updated);
    }

    setEditingId(null);
    setEditingName('');
  };

  // Delete Item
  const handleDeleteItem = (id: string, name: string) => {
    if (!confirm(`'${name}' 항목을 삭제하시겠습니까?`)) return;

    if (activeTab === 'payment') {
      onUpdatePaymentMethods(paymentMethods.filter((p) => p.id !== id));
    } else {
      onUpdateCategories(categories.filter((c) => c.id !== id));
    }
  };

  // Batch toggle all in active tab
  const handleSetAllVisibility = (visible: boolean) => {
    if (activeTab === 'payment') {
      const updated = paymentMethods.map((p) => ({ ...p, isVisible: visible }));
      onUpdatePaymentMethods(updated);
    } else {
      const targetType = activeTab === 'expense' ? 'expense' : 'income';
      const updated = categories.map((c) =>
        c.type === targetType ? { ...c, isVisible: visible } : c
      );
      onUpdateCategories(updated);
    }
  };

  const expenseCount = categories.filter((c) => c.type === 'expense').length;
  const incomeCount = categories.filter((c) => c.type === 'income').length;
  const visibleExpenseCount = categories.filter((c) => c.type === 'expense' && c.isVisible).length;
  const visibleIncomeCount = categories.filter((c) => c.type === 'income' && c.isVisible).length;
  const visiblePaymentCount = paymentMethods.filter((p) => p.isVisible).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                카테고리 & 결제수단 설정
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                입력창 표시 항목(보이기/숨기기) 및 새 분류 편집
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1.5 bg-slate-100 border-b border-slate-200 gap-1 text-xs font-bold">
          <button
            onClick={() => {
              setActiveTab('expense');
              setEditingId(null);
            }}
            className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'expense'
                ? 'bg-white text-rose-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            <span>지출 ({visibleExpenseCount}/{expenseCount})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('income');
              setEditingId(null);
            }}
            className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'income'
                ? 'bg-white text-emerald-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>수입 ({visibleIncomeCount}/{incomeCount})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('payment');
              setEditingId(null);
            }}
            className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'payment'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>결제수단 ({visiblePaymentCount}/{paymentMethods.length})</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-4">
          {/* Add Item Form */}
          <form onSubmit={handleAddItem} className="flex gap-2">
            <input
              type="text"
              placeholder={
                activeTab === 'payment'
                  ? '새 결제수단 입력 (예: 토스페이, 애플페이)...'
                  : '새 카테고리 분류 입력 (예: 반려동물, 배달음식)...'
              }
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
            />
            <button
              type="submit"
              disabled={!newItemName.trim()}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>추가</span>
            </button>
          </form>

          {/* Quick Visibility Controls & Search Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
            <div className="relative w-full sm:w-auto flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="목록 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0 self-end">
              <button
                type="button"
                onClick={() => handleSetAllVisibility(true)}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition cursor-pointer"
              >
                전체 보이기
              </button>
              <button
                type="button"
                onClick={() => handleSetAllVisibility(false)}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition cursor-pointer"
              >
                전체 숨기기
              </button>
            </div>
          </div>

          {/* Item List */}
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden bg-white">
            {activeTab === 'payment' ? (
              filteredPayments.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  결제 수단이 없습니다.
                </div>
              ) : (
                filteredPayments.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 sm:p-3 flex items-center justify-between gap-2 hover:bg-slate-50 transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <CreditCard className="w-4 h-4 text-indigo-500 shrink-0" />
                      {editingId === item.id ? (
                        <div className="flex items-center gap-1.5 flex-1">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="px-2 py-1 bg-white border border-blue-400 rounded-lg text-xs font-bold text-slate-900 w-full"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(item.id)}
                            className="p-1 rounded bg-blue-600 text-white cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`text-xs sm:text-sm font-bold truncate ${
                            item.isVisible ? 'text-slate-900' : 'text-slate-400 line-through'
                          }`}
                        >
                          {item.name}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Show / Hide Toggle Button */}
                      <button
                        type="button"
                        onClick={() => handleTogglePaymentVisibility(item.id)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                          item.isVisible
                            ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200 border border-slate-200'
                        }`}
                        title={item.isVisible ? '클릭 시 입력창에서 숨김' : '클릭 시 입력창에 노출'}
                      >
                        {item.isVisible ? (
                          <>
                            <Eye className="w-3 h-3 text-blue-600" />
                            <span>보임</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3 h-3 text-slate-400" />
                            <span>숨김</span>
                          </>
                        )}
                      </button>

                      {/* Rename Button */}
                      <button
                        type="button"
                        onClick={() => handleStartEdit(item.id, item.name)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                        title="이름 변경"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id, item.name)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                        title="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )
            ) : filteredCategories.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                카테고리가 없습니다.
              </div>
            ) : (
              filteredCategories.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 sm:p-3 flex items-center justify-between gap-2 hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className="w-3 h-3 rounded-full shrink-0 shadow-2xs"
                      style={{ backgroundColor: item.color || '#3B82F6' }}
                    />
                    {editingId === item.id ? (
                      <div className="flex items-center gap-1.5 flex-1">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="px-2 py-1 bg-white border border-blue-400 rounded-lg text-xs font-bold text-slate-900 w-full"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(item.id)}
                          className="p-1 rounded bg-blue-600 text-white cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span
                        className={`text-xs sm:text-sm font-bold truncate ${
                          item.isVisible ? 'text-slate-900' : 'text-slate-400 line-through'
                        }`}
                      >
                        {item.name}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Show / Hide Toggle Button */}
                    <button
                      type="button"
                      onClick={() => handleToggleCategoryVisibility(item.id)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        item.isVisible
                          ? activeTab === 'expense'
                            ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                          : 'bg-slate-100 text-slate-400 hover:bg-slate-200 border border-slate-200'
                      }`}
                      title={item.isVisible ? '클릭 시 입력창에서 숨김' : '클릭 시 입력창에 노출'}
                    >
                      {item.isVisible ? (
                        <>
                          <Eye className="w-3 h-3" />
                          <span>보임</span>
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3 h-3 text-slate-400" />
                          <span>숨김</span>
                        </>
                      )}
                    </button>

                    {/* Rename Button */}
                    <button
                      type="button"
                      onClick={() => handleStartEdit(item.id, item.name)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                      title="이름 변경"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.id, item.name)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                      title="삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200 text-xs text-blue-900 leading-relaxed">
            <p className="font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>입력창 최적화 팁</span>
            </p>
            <p className="mt-0.5 text-blue-800 text-[11px]">
              자주 사용하지 않는 항목을 <strong>[숨김]</strong>으로 전환하면, 지출 입력창의 버튼 목록이 간결해져 원하는 분류를 더욱 빠르게 선택할 수 있습니다.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onResetToDefaults}
            className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 rounded-xl transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>기본값 복원</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition cursor-pointer shadow-xs active:scale-95"
          >
            설정 완료
          </button>
        </div>
      </div>
    </div>
  );
};
