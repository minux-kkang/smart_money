import React, { useState } from 'react';
import { User } from 'firebase/auth';
import {
  X,
  Settings,
  FileSpreadsheet,
  ExternalLink,
  RefreshCw,
  ArrowRightLeft,
  FolderInput,
  Plus,
  Tag,
  SearchCode,
  Download,
  Github,
  LogOut,
  LogIn,
  CheckCircle2,
  AlertTriangle,
  CloudUpload,
  Sparkles,
  Calendar,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { SheetAnalysisResult, ColumnMapping, CategoryItem, PaymentMethodItem } from '../types/ledger';
import { SpreadsheetAnalyzer } from './SpreadsheetAnalyzer';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'sheet' | 'categories' | 'advanced';
  user: User | null;
  accessToken: string | null;
  isRealGoogleConnected: boolean;
  isLoggingIn: boolean;
  spreadsheetTitle: string;
  spreadsheetUrl?: string;
  activeSheetTitle: string;
  activeYear: string;
  yearlySheets: Array<{ year: string; title: string; id: string }>;
  isYearlyUnifiedMode: boolean;
  needsPerpetualUpgrade: boolean;
  hasSettingsTab: boolean;
  isCreatingSettingsTab: boolean;
  isRefreshing: boolean;
  isExportingMonth: boolean;
  transactionCount: number;
  customCategories: CategoryItem[];
  customPaymentMethods: PaymentMethodItem[];
  analysis: SheetAnalysisResult;
  onLogin: () => void;
  onLogout: () => void;
  onRefreshData: () => void;
  onOpenSpreadsheetPicker: () => void;
  onOpenMigrationModal: (tab: 'consolidate' | 'import_external' | 'columns_only') => void;
  onOpenRegisterYearModal: () => void;
  onQuickCreateSettingsTab: () => void;
  onOpenCategoryManager: () => void;
  onOpenGitHubModal: () => void;
  onExportCurrentMonthToGoogleSheets: () => Promise<void>;
  onUpdateMapping: (mapping: ColumnMapping) => void;
  onAddMonthTab: (monthTitle: string) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'sheet',
  user,
  accessToken,
  isRealGoogleConnected,
  isLoggingIn,
  spreadsheetTitle,
  spreadsheetUrl,
  activeSheetTitle,
  activeYear,
  yearlySheets,
  isYearlyUnifiedMode,
  needsPerpetualUpgrade,
  hasSettingsTab,
  isCreatingSettingsTab,
  isRefreshing,
  isExportingMonth,
  transactionCount,
  customCategories,
  customPaymentMethods,
  analysis,
  onLogin,
  onLogout,
  onRefreshData,
  onOpenSpreadsheetPicker,
  onOpenMigrationModal,
  onOpenRegisterYearModal,
  onQuickCreateSettingsTab,
  onOpenCategoryManager,
  onOpenGitHubModal,
  onExportCurrentMonthToGoogleSheets,
  onUpdateMapping,
  onAddMonthTab,
}) => {
  const [activeTab, setActiveTab] = useState<'sheet' | 'categories' | 'advanced'>(initialTab);

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const hasGas =
    typeof window !== 'undefined' && Boolean(localStorage.getItem('smart_money_gas_url'));
  const isLiveWritable = Boolean((isRealGoogleConnected && accessToken) || hasGas);
  const visibleExpenseCats = customCategories.filter(
    (c) => c.isVisible && (c.type || 'expense') === 'expense'
  ).length;
  const visibleIncomeCats = customCategories.filter(
    (c) => c.isVisible && c.type === 'income'
  ).length;
  const visiblePaymentMethods = customPaymentMethods.filter((p) => p.isVisible).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[88vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">설정 및 시트 관리</h2>
              <p className="text-xs text-slate-500">
                구글 시트 연동, 구조 변환, 분류 및 고급 도구를 한곳에서 관리합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Clean Tab Bar */}
        <div className="px-5 pt-3 border-b border-slate-200 bg-slate-50/70 flex items-center gap-1 shrink-0 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('sheet')}
            className={`px-3.5 py-2 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'sheet'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>시트 연결 · 관리</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('categories')}
            className={`px-3.5 py-2 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'categories'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>분류 · 결제수단</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('advanced')}
            className={`px-3.5 py-2 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'advanced'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <SearchCode className="w-3.5 h-3.5" />
            <span>시트 구조 분석 · 백업</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-50/40">
          {activeTab === 'sheet' && (
            <>
              {/* 1. Current Connected Spreadsheet */}
              <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[11px] font-semibold text-slate-500">현재 연결된 스프레드시트</span>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900 truncate">{spreadsheetTitle}</h3>
                      <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                        {activeSheetTitle} 탭
                      </span>
                      {isYearlyUnifiedMode && (
                        <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                          만년 가계부
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {isLiveWritable ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{hasGas ? '웹앱 영구 연동' : '실시간 연동됨'}</span>
                      </span>
                    ) : isRealGoogleConnected ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>읽기 전용</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
                        <span>샘플 / 로컬 모드</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSpreadsheetPicker();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>시트 변경 / 연결</span>
                  </button>

                  {spreadsheetUrl && (
                    <a
                      href={spreadsheetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                      <span>구글 시트 원본 열기</span>
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={onRefreshData}
                    disabled={isRefreshing || !isRealGoogleConnected}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
                    <span>데이터 새로고침</span>
                  </button>
                </div>
              </section>

              {/* 2. Sheet Structure & Maintenance Tasks */}
              <section className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50/70">
                  <h3 className="text-xs font-bold text-slate-700">시트 구조 관리 및 데이터 작업</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    연도 통합, 과거 데이터 가져오기, 월별 시트 정리 등 시트 유지보수 작업입니다.
                  </p>
                </div>

                {/* Consolidate & Monthly Tab Cleanup */}
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <ArrowRightLeft className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span className="text-sm font-bold text-slate-900">만년 가계부 전환 · 월별 탭 정리</span>
                      {needsPerpetualUpgrade && isRealGoogleConnected && (
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                          권장
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      1~12월 탭을 [{activeYear}] 연도 통합 탭으로 합치거나, 기존 월별 시트를 숨김/삭제합니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenMigrationModal('consolidate');
                    }}
                    className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition cursor-pointer shrink-0 self-start sm:self-auto"
                  >
                    열기
                  </button>
                </div>

                {/* Import External Year / Excel / CSV */}
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FolderInput className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="text-sm font-bold text-slate-900">과거 연도 파일 / 엑셀·CSV 가져오기</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      다른 구글 시트나 .xlsx/.csv 파일의 컬럼을 매핑해 현재 만년 가계부에 연도 탭으로 이관합니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenMigrationModal('import_external');
                    }}
                    className="px-3.5 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer shrink-0 self-start sm:self-auto"
                  >
                    가져오기
                  </button>
                </div>

                {/* Column Split Cleanup */}
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-slate-600 shrink-0" />
                      <span className="text-sm font-bold text-slate-900">기존 시트 컬럼 형식 정리</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      구버전 월별 시트의 합쳐진 결제수단·태그 열을 표준 컬럼으로 일괄 분리합니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenMigrationModal('columns_only');
                    }}
                    className="px-3.5 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer shrink-0 self-start sm:self-auto"
                  >
                    컬럼 정리
                  </button>
                </div>

                {/* External Year Registry */}
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-600 shrink-0" />
                      <span className="text-sm font-bold text-slate-900">외부 연도 시트 별도 연결</span>
                      {yearlySheets.length > 0 && (
                        <span className="text-[11px] font-semibold text-slate-500">
                          ({yearlySheets.length}개 연결됨)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      별도 파일로 보관 중인 과거 연도 스프레드시트를 등록해 연도별 비교에 포함합니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenRegisterYearModal();
                    }}
                    className="px-3.5 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer shrink-0 self-start sm:self-auto"
                  >
                    연도 관리
                  </button>
                </div>

                {/* Create [분류설정] Tab (if missing) */}
                {!hasSettingsTab && (
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50/40">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-amber-600 shrink-0" />
                        <span className="text-sm font-bold text-slate-900">시트에 [분류설정] 탭 추가</span>
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                          미생성
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        현재 시트에 [분류설정] 탭을 만들면 카테고리와 결제수단이 구글 시트와 자동 동기화됩니다.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onQuickCreateSettingsTab}
                      disabled={isCreatingSettingsTab}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-50 shrink-0 self-start sm:self-auto"
                    >
                      {isCreatingSettingsTab ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      <span>탭 생성</span>
                    </button>
                  </div>
                )}

                {/* Manual Batch Export Current Tab */}
                {isRealGoogleConnected && accessToken && (
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <CloudUpload className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-sm font-bold text-slate-900">
                          현재 화면 내역 시트로 일괄 내보내기
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        현재 [{activeSheetTitle}] 화면의 {transactionCount.toLocaleString()}건 내역을 구글 시트 탭에 일괄 기록합니다.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onExportCurrentMonthToGoogleSheets}
                      disabled={isExportingMonth || transactionCount === 0}
                      className="px-3.5 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer disabled:opacity-50 shrink-0 self-start sm:self-auto"
                    >
                      {isExportingMonth ? '저장 중...' : '일괄 저장'}
                    </button>
                  </div>
                )}
              </section>

              {/* 3. Account & Auth */}
              <section className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                    {user?.photoURL ? (
                      <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {user ? user.displayName || user.email : 'Google 계정 미연결'}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {user
                        ? accessToken
                          ? `${user.email || ''} · 실시간 쓰기 인증 활성화됨`
                          : `${user.email || ''} · 쓰기 권한 재인증 필요`
                        : 'Google 로그인 후 내 드라이브 시트와 실시간 연동할 수 있습니다.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {(!user || !accessToken) && (
                    <button
                      type="button"
                      onClick={onLogin}
                      disabled={isLoggingIn}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>{isLoggingIn ? '인증 중...' : user ? '다시 인증' : 'Google 로그인'}</span>
                    </button>
                  )}
                  {user && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onLogout();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 border border-slate-200 text-rose-600 text-xs font-semibold transition cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>로그아웃</span>
                    </button>
                  )}
                </div>
              </section>
            </>
          )}

          {activeTab === 'categories' && (
            <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">카테고리 및 결제수단 관리</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    지출·수입 분류와 카드/결제수단을 추가·숨김·정렬하고 구글 시트 [분류설정] 탭과 동기화합니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCategoryManager();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition cursor-pointer shrink-0 self-start sm:self-auto"
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>분류 · 결제수단 편집 열기</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-500">활성 지출 카테고리</span>
                  <p className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{visibleExpenseCats}개</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-500">활성 수입 카테고리</span>
                  <p className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{visibleIncomeCats}개</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-500">활성 결제수단</span>
                  <p className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{visiblePaymentMethods}개</p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <span className="text-[11px] font-semibold text-slate-500 block mb-2">현재 사용 중인 지출 분류</span>
                <div className="flex flex-wrap gap-1.5">
                  {customCategories
                    .filter((c) => c.isVisible && (c.type || 'expense') === 'expense')
                    .map((c) => (
                      <span
                        key={c.id}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium"
                      >
                        {c.name}
                      </span>
                    ))}
                </div>
              </div>
            </section>
          )}

          {activeTab === 'advanced' && (
            <div className="space-y-5">
              {/* Embedded Spreadsheet Analyzer */}
              <SpreadsheetAnalyzer
                analysis={analysis}
                spreadsheetUrl={spreadsheetUrl}
                onUpdateMapping={onUpdateMapping}
                onAddMonthTab={onAddMonthTab}
                isRealGoogleConnected={Boolean(isRealGoogleConnected && accessToken)}
              />

              {/* Backup & Deployment Tools */}
              <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <h3 className="text-xs font-bold text-slate-700">앱 백업 및 배포</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href="./smart_money_standalone.html"
                    download="smart_money_standalone.html"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    <span>단일 HTML 앱 다운로드</span>
                  </a>

                  <a
                    href="./SPECIFICATION.md"
                    download="smart_ledger_specification.md"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition"
                  >
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    <span>시스템 명세서 (.md)</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenGitHubModal();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
                  >
                    <Github className="w-3.5 h-3.5 text-slate-700" />
                    <span>GitHub 배포 설정</span>
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
