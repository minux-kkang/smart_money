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
  FileSpreadsheet,
  Download,
  UploadCloud,
  Cloud,
  RefreshCw,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { CategoryItem, PaymentMethodItem, PaymentMethodGroup, TransactionType } from '../types/ledger';
import { getPaymentGroupBadge, getPaymentMethodGroup, ALL_PAYMENT_GROUPS } from '../utils/paymentGroupUtils';
import {
  findSettingsTab,
  syncCategoriesToGoogleSheet,
  loadCategoriesFromGoogleSheet,
} from '../services/categoryManager';
import {
  downloadLedgerExcelTemplate,
  createGoogleSheetWithTemplate,
} from '../services/templateGenerator';
import { isAuthExpiredError } from '../services/firebase';

interface CategoryManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: CategoryItem[];
  paymentMethods: PaymentMethodItem[];
  onUpdateCategories: (categories: CategoryItem[]) => void;
  onUpdatePaymentMethods: (methods: PaymentMethodItem[]) => void;
  onResetToDefaults: () => void;
  // Google Sheets integration props
  spreadsheetId?: string;
  spreadsheetTitle?: string;
  sheetTabs?: Array<{ id: number; title: string }>;
  accessToken?: string | null;
  isRealGoogleConnected?: boolean;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onSpreadsheetCreated?: (spreadsheetId: string, spreadsheetTitle: string) => void;
  onTabsUpdated?: (tabs: Array<{ id: number; title: string }>) => void;
  onLogin?: () => void;
}

export const CategoryManagementModal: React.FC<CategoryManagementModalProps> = ({
  isOpen,
  onClose,
  categories,
  paymentMethods,
  onUpdateCategories,
  onUpdatePaymentMethods,
  onResetToDefaults,
  spreadsheetId,
  spreadsheetTitle,
  sheetTabs = [],
  accessToken,
  isRealGoogleConnected,
  onShowToast,
  onSpreadsheetCreated,
  onTabsUpdated,
  onLogin,
}) => {
  const [activeTab, setActiveTab] = useState<'expense' | 'income' | 'payment'>('expense');
  const [searchQuery, setSearchQuery] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [selectedPaymentGroup, setSelectedPaymentGroup] = useState<'all' | PaymentMethodGroup>('all');
  const [newPaymentGroup, setNewPaymentGroup] = useState<PaymentMethodGroup>('신용카드');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isSyncingToSheet, setIsSyncingToSheet] = useState(false);
  const [isLoadingFromSheet, setIsLoadingFromSheet] = useState(false);
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [templateYear, setTemplateYear] = useState<2026 | 2027>(2026);

  if (!isOpen) return null;

  const settingsTab = findSettingsTab(sheetTabs);

  // Download Excel Template for selected year
  const handleDownloadExcelTemplate = (year: number = templateYear) => {
    try {
      downloadLedgerExcelTemplate(year, categories, paymentMethods);
      onShowToast?.(`${year}년 가계부 템플릿(사용설명서·분류설정 포함)이 다운로드되었습니다.`, 'success');
    } catch (e: any) {
      alert(`템플릿 다운로드 실패: ${e?.message || e}`);
    }
  };

  // Create Google Sheet in User's Google Drive
  const handleCreateGoogleSheet = async (year: number = templateYear) => {
    if (!accessToken) {
      if (confirm(`구글 드라이브에 [${year} 스마트가계부] 시트를 생성하려면 Google 로그인이 필요합니다.\n지금 로그인하시겠습니까?`)) {
        onLogin?.();
      }
      return;
    }
    if (!confirm(`현재 구글 드라이브에 [${year} 스마트가계부] 스프레드시트를 생성하시겠습니까?\n(사용설명서, 분류설정, 1~12월 탭이 자동으로 생성됩니다)`)) {
      return;
    }

    try {
      setIsCreatingSheet(true);
      const res = await createGoogleSheetWithTemplate(accessToken, year, categories, paymentMethods);
      onShowToast?.(`구글 드라이브에 ${year}년 가계부 시트가 생성되었습니다!`, 'success');
      onSpreadsheetCreated?.(res.spreadsheetId, `${year} 스마트가계부`);
    } catch (e: any) {
      alert(`시트 생성 실패: ${e?.message || e}`);
    } finally {
      setIsCreatingSheet(false);
    }
  };

  // Load Categories & Payment Methods from Google Sheet '분류설정'
  const handleLoadFromSheet = async () => {
    if (!spreadsheetId) {
      alert('연결된 스프레드시트가 없습니다.');
      return;
    }

    try {
      setIsLoadingFromSheet(true);
      setSyncStatusMsg('시트에서 분류 목록을 읽어오는 중...');
      const loaded = await loadCategoriesFromGoogleSheet(spreadsheetId, accessToken, sheetTabs);

      if (!loaded) {
        alert(
          "스프레드시트에 '분류설정' 탭을 찾을 수 없거나 데이터가 비어 있습니다.\n[시트에 동기화 저장] 버튼을 누르면 '분류설정' 탭이 시트에 자동 생성됩니다."
        );
        return;
      }

      if (loaded.categories.length > 0) {
        onUpdateCategories(loaded.categories);
      }
      if (loaded.paymentMethods.length > 0) {
        onUpdatePaymentMethods(loaded.paymentMethods);
      }

      const msg = `'${loaded.tabTitle}' 탭에서 분류 ${loaded.categories.length}개와 결제수단 ${loaded.paymentMethods.length}개를 불러왔습니다!`;
      setSyncStatusMsg(msg);
      onShowToast?.(msg, 'success');
    } catch (e: any) {
      if (isAuthExpiredError(e)) {
        if (confirm('Google 인증 세션이 만료되었습니다.\n지금 다시 로그인하여 시트에서 분류를 불러오시겠습니까?')) {
          onLogin?.();
        }
      } else {
        alert(`시트 분류 불러오기 실패: ${e?.message || e}`);
      }
    } finally {
      setIsLoadingFromSheet(false);
    }
  };

  // Write Categories & Payment Methods to Google Sheet '분류설정' tab
  const handleSyncToSheet = async () => {
    if (!accessToken) {
      if (confirm('현재 구글 시트에 [분류설정] 탭을 생성하고 저장하려면 Google 로그인이 필요합니다.\n지금 로그인하시겠습니까?')) {
        onLogin?.();
      }
      return;
    }

    if (!spreadsheetId || !isRealGoogleConnected) {
      if (confirm('현재 샘플 2026 가계부를 사용 중입니다.\n내 구글 드라이브에 실제 [2026 스마트가계부] 시트를 생성하시겠습니까?\n(사용설명서, 분류설정, 1~12월 탭이 자동으로 포함됩니다)')) {
        handleCreateGoogleSheet(2026);
      }
      return;
    }

    try {
      setIsSyncingToSheet(true);
      setSyncStatusMsg('시트에 분류설정을 저장하는 중...');
      const res = await syncCategoriesToGoogleSheet(
        spreadsheetId,
        accessToken,
        categories,
        paymentMethods,
        sheetTabs
      );

      const msg = res.created
        ? `현재 구글 시트에 '${res.tabTitle}' 탭을 생성하고 모든 분류 및 결제수단을 저장했습니다!`
        : `구글 시트 '${res.tabTitle}' 탭에 분류 및 결제수단을 동기화했습니다!`;
      setSyncStatusMsg(msg);
      onShowToast?.(msg, 'success');

      if (res.created) {
        onTabsUpdated?.([...sheetTabs, { id: Date.now(), title: res.tabTitle }]);
      }
    } catch (e: any) {
      if (isAuthExpiredError(e)) {
        if (confirm('Google 인증 세션이 만료되었습니다.\n지금 다시 로그인하여 시트에 [분류설정] 탭 생성을 계속하시겠습니까?')) {
          onLogin?.();
        }
      } else {
        alert(`시트 동기화 실패: ${e?.message || e}`);
      }
    } finally {
      setIsSyncingToSheet(false);
    }
  };

  // Filter lists based on search
  const filteredCategories = categories.filter(
    (c) =>
      c.type === (activeTab === 'expense' ? 'expense' : 'income') &&
      c.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const filteredPayments = paymentMethods.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
    if (!matchesSearch) return false;
    if (selectedPaymentGroup !== 'all') {
      const grp = p.group || getPaymentMethodGroup(p.name);
      return grp === selectedPaymentGroup;
    }
    return true;
  });

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
        group: newPaymentGroup,
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
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
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
          {/* Callout if current sheet is missing [분류설정] tab */}
          {!settingsTab && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-amber-950 flex items-center gap-1.5">
                    <span>현재 2026 구글 시트에 [분류설정] 탭이 없습니다!</span>
                  </h4>
                  <p className="text-xs text-amber-900 mt-1 leading-relaxed">
                    구글 시트에도 카테고리(지출/수입/이체)와 결제수단 관리 탭이 있어야 실시간 양방향 연동이 완성됩니다.
                    <br className="hidden sm:inline" />
                    아래 버튼을 누르면 현재 2026 시트에 <strong>[분류설정]</strong> 탭을 바로 생성하고 모든 항목을 채워넣습니다.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSyncToSheet}
                disabled={isSyncingToSheet}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl text-xs font-black shadow-xs transition cursor-pointer shrink-0 disabled:opacity-50"
              >
                {isSyncingToSheet ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                <span>현재 2026 시트에 [분류설정] 탭 생성</span>
              </button>
            </div>
          )}

          {/* Google Sheets [분류설정] Sync & 2026/2027 Template Generator Section */}
          <div className="bg-gradient-to-br from-emerald-50/90 via-teal-50/70 to-blue-50/80 border border-emerald-200/90 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black text-slate-900">
                      구글 시트 [분류설정] 연동 & 가계부 템플릿
                    </span>
                    {settingsTab ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        시트 '{settingsTab.title}' 탭 연결됨
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                        시트 내 탭 생성 필요
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    구글 시트에서 직접 분류/결제수단을 관리하고 연도별 표준 템플릿을 생성합니다
                  </p>
                </div>
              </div>

              {/* Template Year Selector & Actions */}
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                {/* Year Toggle */}
                <div className="inline-flex p-0.5 bg-emerald-100/80 border border-emerald-300 rounded-lg text-xs font-extrabold">
                  <button
                    type="button"
                    onClick={() => setTemplateYear(2026)}
                    className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                      templateYear === 2026
                        ? 'bg-white text-emerald-800 shadow-2xs'
                        : 'text-emerald-700 hover:text-emerald-900'
                    }`}
                  >
                    2026년
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplateYear(2027)}
                    className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                      templateYear === 2027
                        ? 'bg-white text-emerald-800 shadow-2xs'
                        : 'text-emerald-700 hover:text-emerald-900'
                    }`}
                  >
                    2027년
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleDownloadExcelTemplate(templateYear)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-black transition shadow-xs cursor-pointer"
                  title={`📖 사용설명서, ⚙️ 분류설정, 1~12월 탭이 포함된 ${templateYear}년 엑셀 파일 다운로드`}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{templateYear} 엑셀 다운로드</span>
                </button>

                {accessToken && (
                  <button
                    type="button"
                    onClick={() => handleCreateGoogleSheet(templateYear)}
                    disabled={isCreatingSheet}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-black transition shadow-xs cursor-pointer disabled:opacity-50"
                    title={`현재 구글 드라이브에 ${templateYear} 스마트가계부 시트 바로 생성`}
                  >
                    {isCreatingSheet ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Cloud className="w-3.5 h-3.5" />
                    )}
                    <span>내 드라이브에 {templateYear} 시트 생성</span>
                  </button>
                )}
              </div>
            </div>

            {/* Sub-bar: Two-way sync buttons */}
            <div className="pt-2.5 border-t border-emerald-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="text-[11px] text-slate-600">
                {syncStatusMsg ? (
                  <span className="font-bold text-emerald-700 animate-pulse">{syncStatusMsg}</span>
                ) : (
                  <span>
                    💡 시트의 <strong>[분류설정]</strong> 탭을 직접 수정하면 언제든 가져올 수 있고, 앱의 변경사항도 시트로 내보낼 수 있습니다.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                {spreadsheetId && (
                  <button
                    type="button"
                    onClick={handleLoadFromSheet}
                    disabled={isLoadingFromSheet}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-300 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer disabled:opacity-50"
                    title="시트의 '분류설정' 탭에서 카테고리와 결제수단 가져오기"
                  >
                    <RefreshCw className={`w-3 h-3 text-emerald-600 ${isLoadingFromSheet ? 'animate-spin' : ''}`} />
                    <span>시트에서 가져오기</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSyncToSheet}
                  disabled={isSyncingToSheet}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer disabled:opacity-50"
                  title="현재 분류 및 결제수단 목록을 구글 시트의 '분류설정' 탭에 저장"
                >
                  <UploadCloud className={`w-3 h-3 ${isSyncingToSheet ? 'animate-spin' : ''}`} />
                  <span>시트에 동기화 저장</span>
                </button>
              </div>
            </div>
          </div>

          {/* Add Item Form */}
          <div className="space-y-1.5">
            <form onSubmit={handleAddItem} className="flex gap-2">
              <input
                type="text"
                placeholder={
                  activeTab === 'payment'
                    ? '새 결제수단 입력 (예: 현대카드, 신한체크, 카카오페이)...'
                    : '새 카테고리 분류 입력 (예: 반려동물, 배달음식)...'
                }
                value={newItemName}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewItemName(val);
                  if (activeTab === 'payment' && val.trim()) {
                    const detected = getPaymentMethodGroup(val);
                    if (detected) setNewPaymentGroup(detected);
                  }
                }}
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

            {/* When adding payment method, show group selector pills */}
            {activeTab === 'payment' && (
              <div className="flex items-center gap-1.5 flex-wrap text-xs px-1">
                <span className="text-[11px] font-bold text-slate-500">결제 구분:</span>
                {ALL_PAYMENT_GROUPS.map((grp) => (
                  <button
                    key={grp.group}
                    type="button"
                    onClick={() => setNewPaymentGroup(grp.group)}
                    className={`px-2 py-0.5 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center gap-1 ${
                      newPaymentGroup === grp.group
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="w-3.5 h-3.5 text-[9px] font-black rounded flex items-center justify-center bg-white/20">
                      {grp.char}
                    </span>
                    <span>{grp.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Group Filter Tabs for Payment Methods */}
          {activeTab === 'payment' && (
            <div className="flex items-center gap-1 flex-wrap p-2 bg-slate-100/80 rounded-xl border border-slate-200 text-xs">
              <span className="text-[11px] font-black text-slate-600 mr-1">분류별 보기:</span>
              <button
                type="button"
                onClick={() => setSelectedPaymentGroup('all')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition cursor-pointer ${
                  selectedPaymentGroup === 'all'
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                전체 ({paymentMethods.length})
              </button>
              {ALL_PAYMENT_GROUPS.map((grp) => {
                const count = paymentMethods.filter(
                  (p) => (p.group || getPaymentMethodGroup(p.name)) === grp.group
                ).length;
                return (
                  <button
                    key={grp.group}
                    type="button"
                    onClick={() => setSelectedPaymentGroup(grp.group)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition cursor-pointer flex items-center gap-1 ${
                      selectedPaymentGroup === grp.group
                        ? 'bg-indigo-100 text-indigo-950 border-indigo-300 ring-1 ring-indigo-400'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="w-3.5 h-3.5 text-[9px] font-black rounded flex items-center justify-center bg-indigo-200/70">
                      {grp.char}
                    </span>
                    <span>{grp.label} ({count})</span>
                  </button>
                );
              })}
            </div>
          )}

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
                filteredPayments.map((item) => {
                  const payBadge = getPaymentGroupBadge(item.name, item.group);

                  return (
                    <div
                      key={item.id}
                      className="p-2.5 sm:p-3 flex items-center justify-between gap-2 hover:bg-slate-50 transition"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {payBadge && (
                          <span
                            className={`w-5 h-5 min-w-[20px] text-[10px] font-black rounded flex items-center justify-center border shrink-0 ${payBadge.colorClass}`}
                            title={`결제 구분: ${payBadge.label}`}
                          >
                            {payBadge.char}
                          </span>
                        )}
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
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`text-xs sm:text-sm font-bold truncate ${
                                item.isVisible ? 'text-slate-900' : 'text-slate-400 line-through'
                              }`}
                            >
                              {item.name}
                            </span>
                            <span className="text-[11px] text-slate-400 font-medium shrink-0">
                              ({payBadge?.label || '기타'})
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Group Selection Dropdown */}
                        <select
                          value={item.group || getPaymentMethodGroup(item.name)}
                          onChange={(e) => {
                            const newGrp = e.target.value as PaymentMethodGroup;
                            const updated = paymentMethods.map((p) =>
                              p.id === item.id ? { ...p, group: newGrp } : p
                            );
                            onUpdatePaymentMethods(updated);
                          }}
                          className="text-[11px] font-bold px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 cursor-pointer"
                          title="결제수단 대분류 변경 (신용카드, 체크카드, 현금, 페이 등)"
                        >
                          <option value="신용카드">신용카드 [신]</option>
                          <option value="체크카드">체크카드 [체]</option>
                          <option value="현금">현금/이체 [현]</option>
                          <option value="페이">페이/간편결제 [페]</option>
                          <option value="포인트">포인트/상품권 [포]</option>
                        </select>

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
                );
              })
            )) : filteredCategories.length === 0 ? (
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
