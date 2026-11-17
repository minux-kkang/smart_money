import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  X,
  CheckCircle2,
  FileSpreadsheet,
  ExternalLink,
  Layers,
  Check,
  Loader2,
  FolderInput,
  Search,
  RefreshCw,
  Link2,
  ShieldCheck,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import {
  ConsolidationResult,
  ImportExternalYearResult,
  MonthMigrationResult,
  OldMonthTabsAction,
  PERPETUAL_SUMMARY_TAB_TITLE,
  extractMonthNumberFromTab,
  findAllYearTabs,
} from '../services/googleSheets';
import { listSpreadsheets } from '../services/googleDrive';
import { SpreadsheetFile } from '../types/ledger';

type MigrationModalTab = 'consolidate' | 'import_external' | 'columns_only';

interface UnifiedMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: MigrationModalTab;
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl?: string;
  sheetTabs: Array<{ id: number; title: string }>;
  accessToken: string | null;
  isRealGoogleConnected: boolean;
  activeYear?: string;
  onLogin: () => void;
  onConsolidateCurrentFile: (
    params: {
      targetYear: number;
      targetTabTitle: string;
      mergeWithExisting: boolean;
      newSpreadsheetTitle?: string;
      oldMonthTabsAction: OldMonthTabsAction;
      createSummaryTab: boolean;
    },
    onProgress: (info: { index: number; total: number; message: string }) => void
  ) => Promise<ConsolidationResult | null>;
  onImportExternalFile: (
    params: {
      sourceSpreadsheetId: string;
      targetYear: number;
      targetTabTitle: string;
      mergeWithExisting: boolean;
    },
    onProgress: (info: { index: number; total: number; message: string }) => void
  ) => Promise<ImportExternalYearResult | null>;
  // Legacy 12-month column split handler
  onRunColumnsMigration: () => Promise<void>;
  isMigratingColumns: boolean;
  columnsProgress: { month: string; index: number; total: number; message: string } | null;
  columnsResults: MonthMigrationResult[] | null;
  totalMigratedColumnTxs: number;
  onSwitchToYearTab?: (tabTitle: string) => void;
  onOpenComparisonView?: () => void;
  isSheetLinked?: boolean;
  onOpenSpreadsheetPicker?: () => void;
}

export const UnifiedMigrationModal: React.FC<UnifiedMigrationModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'consolidate',
  spreadsheetId,
  spreadsheetTitle,
  spreadsheetUrl,
  sheetTabs,
  accessToken,
  isRealGoogleConnected,
  activeYear = '2026',
  onLogin,
  onConsolidateCurrentFile,
  onImportExternalFile,
  onRunColumnsMigration,
  isMigratingColumns,
  columnsProgress,
  columnsResults,
  totalMigratedColumnTxs,
  onSwitchToYearTab,
  onOpenComparisonView,
  isSheetLinked = true,
  onOpenSpreadsheetPicker,
}) => {
  const [activeTab, setActiveTab] = useState<MigrationModalTab>(initialTab);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // --- Tab 1: Consolidate current file's 1월~12월 into Perpetual Multi-Year Sheet ---
  const [consolidateYear, setConsolidateYear] = useState<string>(() => activeYear || '2026');
  const [consolidateTabTitle, setConsolidateTabTitle] = useState<string>(() => activeYear || '2026');
  const [mergeConsolidate, setMergeConsolidate] = useState<boolean>(true);
  const [renameFileChecked, setRenameFileChecked] = useState<boolean>(
    () => !/만년/.test(spreadsheetTitle || '')
  );
  const [newSpreadsheetTitle, setNewSpreadsheetTitle] = useState<string>('스마트 만년 가계부');
  const [oldMonthTabsAction, setOldMonthTabsAction] = useState<OldMonthTabsAction>('hide');
  const [createSummaryTab, setCreateSummaryTab] = useState<boolean>(true);
  const [isConsolidating, setIsConsolidating] = useState<boolean>(false);
  const [consolidateProgress, setConsolidateProgress] = useState<{
    index: number;
    total: number;
    message: string;
  } | null>(null);
  const [consolidateResult, setConsolidateResult] = useState<ConsolidationResult | null>(null);
  const [consolidateError, setConsolidateError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const y = activeYear || '2026';
      setConsolidateYear(y);
      setConsolidateTabTitle(y);
      setConsolidateError(null);
      setRenameFileChecked(!/만년/.test(spreadsheetTitle || ''));
      setNewSpreadsheetTitle(
        /만년/.test(spreadsheetTitle || '') ? spreadsheetTitle : '스마트 만년 가계부'
      );
    }
  }, [isOpen, activeYear, spreadsheetTitle]);

  // --- Tab 2: Import External Year File into Current Master File ---
  const [importYear, setImportYear] = useState<string>(() => {
    const num = parseInt(activeYear || '2026', 10);
    return String(isNaN(num) ? 2025 : num - 1);
  });
  const [importTabTitle, setImportTabTitle] = useState<string>(() => {
    const num = parseInt(activeYear || '2026', 10);
    return String(isNaN(num) ? 2025 : num - 1);
  });
  const [sourceInputMode, setSourceInputMode] = useState<'drive' | 'url'>(
    accessToken ? 'drive' : 'url'
  );
  const [driveFiles, setDriveFiles] = useState<SpreadsheetFile[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState<boolean>(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveSearch, setDriveSearch] = useState<string>('');
  const [selectedDriveFile, setSelectedDriveFile] = useState<SpreadsheetFile | null>(null);
  const [externalUrlOrId, setExternalUrlOrId] = useState<string>('');
  const [mergeExternal, setMergeExternal] = useState<boolean>(true);
  const [isImportingExternal, setIsImportingExternal] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<{
    index: number;
    total: number;
    message: string;
  } | null>(null);
  const [importResult, setImportResult] = useState<ImportExternalYearResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const detectedMonthTabs = useMemo(
    () =>
      (sheetTabs || []).filter((t) => extractMonthNumberFromTab(t.title) !== null),
    [sheetTabs]
  );

  const existingYearTabs = useMemo(() => findAllYearTabs(sheetTabs || []), [sheetTabs]);

  useEffect(() => {
    if (
      isOpen &&
      activeTab === 'import_external' &&
      accessToken &&
      sourceInputMode === 'drive' &&
      driveFiles.length === 0
    ) {
      loadDriveFiles();
    }
  }, [isOpen, activeTab, accessToken, sourceInputMode]);

  const loadDriveFiles = async () => {
    if (!accessToken) return;
    setIsLoadingDrive(true);
    setDriveError(null);
    try {
      const list = await listSpreadsheets(accessToken);
      setDriveFiles(list.filter((f) => f.id !== spreadsheetId));
    } catch (e: any) {
      setDriveError(e?.message || '구글 드라이브 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const filteredDriveFiles = useMemo(() => {
    const q = driveSearch.trim().toLowerCase();
    return driveFiles
      .filter((f) => !q || f.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aHit = a.name.includes(importYear) ? 1 : 0;
        const bHit = b.name.includes(importYear) ? 1 : 0;
        if (aHit !== bHit) return bHit - aHit;
        return 0;
      });
  }, [driveFiles, driveSearch, importYear]);

  if (!isOpen) return null;

  const isBusy = isConsolidating || isImportingExternal || isMigratingColumns;

  const handleRunConsolidate = async () => {
    const yearNum = parseInt(consolidateYear.trim(), 10);
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2099) {
      setConsolidateError('올바른 4자리 연도(예: 2026)를 입력해 주세요.');
      return;
    }
    const tabTitle = consolidateTabTitle.trim() || String(yearNum);
    setIsConsolidating(true);
    setConsolidateError(null);
    setConsolidateResult(null);
    setConsolidateProgress({ index: 0, total: 16, message: '만년 가계부 구글 시트 전환 준비 중...' });
    try {
      const res = await onConsolidateCurrentFile(
        {
          targetYear: yearNum,
          targetTabTitle: tabTitle,
          mergeWithExisting: mergeConsolidate,
          newSpreadsheetTitle: renameFileChecked ? newSpreadsheetTitle.trim() : undefined,
          oldMonthTabsAction,
          createSummaryTab,
        },
        (info) => setConsolidateProgress(info)
      );
      if (res) {
        setConsolidateResult(res);
      }
    } catch (err: any) {
      setConsolidateError(err?.message || String(err));
    } finally {
      setIsConsolidating(false);
    }
  };

  const handleRunImportExternal = async () => {
    const yearNum = parseInt(importYear.trim(), 10);
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2099) {
      setImportError('가져올 연도(예: 2025)를 정확히 입력해 주세요.');
      return;
    }
    let sourceId = '';
    if (sourceInputMode === 'drive') {
      if (!selectedDriveFile) {
        setImportError('가져올 스프레드시트 파일을 선택해 주세요.');
        return;
      }
      sourceId = selectedDriveFile.id;
    } else {
      const raw = externalUrlOrId.trim();
      if (!raw) {
        setImportError('스프레드시트 링크 또는 ID를 입력해 주세요.');
        return;
      }
      const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      sourceId = match ? match[1] : raw;
    }

    if (sourceId === spreadsheetId) {
      setImportError('현재 열려 있는 파일과 동일한 파일입니다. 현재 파일 통합은 첫 번째 탭을 이용해 주세요.');
      return;
    }

    const tabTitle = importTabTitle.trim() || String(yearNum);
    setIsImportingExternal(true);
    setImportError(null);
    setImportResult(null);
    setImportProgress({ index: 0, total: 10, message: '외부 파일 연결 중...' });
    try {
      const res = await onImportExternalFile(
        {
          sourceSpreadsheetId: sourceId,
          targetYear: yearNum,
          targetTabTitle: tabTitle,
          mergeWithExisting: mergeExternal,
        },
        (info) => setImportProgress(info)
      );
      if (res) {
        setImportResult(res);
      }
    } catch (err: any) {
      setImportError(err?.message || String(err));
    } finally {
      setIsImportingExternal(false);
    }
  };

  const columnsProgressPercent = columnsProgress
    ? Math.round((columnsProgress.index / Math.max(1, columnsProgress.total)) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 rounded-xl shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black">
                  연도별 단일 파일 구조 전환 & 데이터 이관
                </h3>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 truncate">
                마스터 시트: <strong className="text-white">{spreadsheetTitle}</strong>
                {existingYearTabs.length > 0 && (
                  <span className="ml-2 text-emerald-300">
                    (보유 연도 탭: {existingYearTabs.map((y) => y.title).join(', ')})
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl transition cursor-pointer disabled:opacity-40 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-4 sm:px-6 pt-3 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => setActiveTab('consolidate')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-black transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 border-b-2 ${
              activeTab === 'consolidate'
                ? 'bg-white text-indigo-700 border-indigo-600 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>1. 만년 가계부 시트 전환 ({consolidateYear})</span>
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => setActiveTab('import_external')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-black transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 border-b-2 ${
              activeTab === 'import_external'
                ? 'bg-white text-blue-700 border-blue-600 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent'
            }`}
          >
            <FolderInput className="w-3.5 h-3.5" />
            <span>2. 다른 연도 파일 가져오기 (2025 등)</span>
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => setActiveTab('columns_only')}
            className={`px-3 py-2 rounded-t-xl text-xs font-bold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 border-b-2 ${
              activeTab === 'columns_only'
                ? 'bg-white text-slate-900 border-slate-700 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>월별 탭 9컬럼 정리</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1 text-slate-800 text-xs sm:text-sm">
          {activeTab === 'consolidate' && (
            <>
              {/* Why unified structure card */}
              <div className="p-3.5 bg-indigo-50/80 border border-indigo-200 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-indigo-950 font-black text-xs sm:text-sm">
                  <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>구글 스프레드시트 자체를 [만년 가계부] 구조로 전환</span>
                </div>
                <ul className="text-xs text-indigo-900 space-y-1">
                  <li className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                    <span>
                      현재 구글 시트의 <strong>1월~12월</strong> 데이터를 모두 모아 <strong>[{consolidateTabTitle}]</strong> 연도 통합 탭 1개로 합치고 헤더/금액 서식을 정리합니다.
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                    <span>
                      구글 시트 맨 앞에 <strong>[{PERPETUAL_SUMMARY_TAB_TITLE}]</strong> 수식 탭을 생성해, 연도별/월별 합계가 구글 시트에서도 자동 계산됩니다.
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                    <span>
                      기존 <strong>1월~12월 탭을 숨기거나</strong> 정리해, 구글 시트 하단 탭이 <code>[{PERPETUAL_SUMMARY_TAB_TITLE}] [{consolidateTabTitle}] [⚙️ 분류설정]</code> 처럼 깔끔해집니다.
                    </span>
                  </li>
                </ul>
              </div>

              {!isSheetLinked ? (
                <div className="p-3.5 bg-blue-50 border border-blue-300 rounded-xl text-xs text-blue-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <strong className="block text-blue-900">
                      현재 샘플 가계부 화면입니다.
                    </strong>
                    <span>
                      먼저 회원님의 실제 2026 구글 스프레드시트를 선택해 연결한 뒤 전환을 실행해 주세요.
                    </span>
                  </div>
                  {onOpenSpreadsheetPicker && (
                    <button
                      type="button"
                      onClick={onOpenSpreadsheetPicker}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-black shrink-0 cursor-pointer"
                    >
                      내 2026 구글 시트 선택하기
                    </button>
                  )}
                </div>
              ) : (!isRealGoogleConnected || !accessToken) && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 flex items-center justify-between gap-2">
                  <span>
                    실제 내 구글 드라이브의 스프레드시트를 변환하려면 먼저 <strong>Google 로그인</strong>이 필요합니다.
                  </span>
                </div>
              )}

              {/* Config inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">
                    대상 연도
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['2026', '2025', '2024'].map((y) => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => {
                          setConsolidateYear(y);
                          setConsolidateTabTitle(y);
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-black border cursor-pointer transition ${
                          consolidateYear === y
                            ? 'bg-indigo-600 text-white border-indigo-700'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {y}년
                      </button>
                    ))}
                    <input
                      type="text"
                      value={consolidateYear}
                      onChange={(e) => {
                        setConsolidateYear(e.target.value);
                        setConsolidateTabTitle(e.target.value);
                      }}
                      placeholder="직접입력"
                      className="w-20 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">
                    생성/저장할 통합 시트 탭 이름
                  </label>
                  <input
                    type="text"
                    value={consolidateTabTitle}
                    onChange={(e) => setConsolidateTabTitle(e.target.value)}
                    placeholder="예: 2026"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
                  />
                </div>
              </div>

              {/* Google Sheet Perpetual Structure Options */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-black text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={renameFileChecked}
                      onChange={(e) => setRenameFileChecked(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 cursor-pointer"
                    />
                    <span>구글 스프레드시트 파일 이름 변경</span>
                  </label>
                  {renameFileChecked && (
                    <input
                      type="text"
                      value={newSpreadsheetTitle}
                      onChange={(e) => setNewSpreadsheetTitle(e.target.value)}
                      placeholder="예: 스마트 만년 가계부"
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <span className="block text-xs font-black text-slate-800">
                    기존 1월~12월 탭 처리 ({detectedMonthTabs.length}개 감지됨)
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setOldMonthTabsAction('hide')}
                      className={`px-2 py-2 rounded-lg text-[11px] font-bold border text-center cursor-pointer transition ${
                        oldMonthTabsAction === 'hide'
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      숨기기 (추천)
                      <span className="block text-[10px] font-normal opacity-80">백업 보존·탭 정리</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOldMonthTabsAction('keep')}
                      className={`px-2 py-2 rounded-lg text-[11px] font-bold border text-center cursor-pointer transition ${
                        oldMonthTabsAction === 'keep'
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      보이기 유지
                      <span className="block text-[10px] font-normal opacity-80">1~12월 탭 표시</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOldMonthTabsAction('delete')}
                      className={`px-2 py-2 rounded-lg text-[11px] font-bold border text-center cursor-pointer transition ${
                        oldMonthTabsAction === 'delete'
                          ? 'bg-rose-600 text-white border-rose-700 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-rose-50'
                      }`}
                    >
                      완전 삭제
                      <span className="block text-[10px] font-normal opacity-80">통합 후 탭 제거</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-slate-200/80">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createSummaryTab}
                      onChange={(e) => setCreateSummaryTab(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 cursor-pointer"
                    />
                    <span>구글 시트 내 [{PERPETUAL_SUMMARY_TAB_TITLE}] 수식 탭 생성</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={mergeConsolidate}
                      onChange={(e) => setMergeConsolidate(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 cursor-pointer"
                    />
                    <span>중복 없이 병합</span>
                  </label>
                </div>
              </div>

              {consolidateError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{consolidateError}</span>
                </div>
              )}

              {isConsolidating && consolidateProgress && (
                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                      <span>{consolidateProgress.message}</span>
                    </span>
                    <span>
                      {Math.round(
                        (consolidateProgress.index / Math.max(1, consolidateProgress.total)) * 100
                      )}
                      %
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-indigo-200/70 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-300 rounded-full"
                      style={{
                        width: `${Math.round(
                          (consolidateProgress.index / Math.max(1, consolidateProgress.total)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {consolidateResult && !isConsolidating && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-emerald-900 font-black text-sm">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <span>
                        [{consolidateResult.targetTabTitle}] 연도 통합 시트 구축 완료!
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {spreadsheetUrl && (
                        <a
                          href={spreadsheetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1"
                        >
                          <span>구글 시트 확인</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {onSwitchToYearTab && (
                        <button
                          type="button"
                          onClick={() => {
                            onSwitchToYearTab(consolidateResult.targetTabTitle);
                            onClose();
                          }}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black flex items-center gap-1 cursor-pointer"
                        >
                          <span>[{consolidateResult.targetTabTitle}] 탭 바로 보기</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-emerald-900 space-y-1">
                    <p>
                      • <strong>[{consolidateResult.targetTabTitle}]</strong> 탭에 총 <strong>{consolidateResult.totalRowsWritten.toLocaleString()}건</strong>이 날짜순 저장 및 서식 정리되었습니다.
                      {consolidateResult.skippedDuplicates > 0 &&
                        ` (중복 ${consolidateResult.skippedDuplicates}건 제외)`}
                    </p>
                    {consolidateResult.summaryTabCreated && (
                      <p>
                        • 구글 시트 맨 앞에 <strong>[{PERPETUAL_SUMMARY_TAB_TITLE}]</strong> 실시간 요약 수식 탭이 생성/갱신되었습니다.
                      </p>
                    )}
                    {consolidateResult.renamedTitle && (
                      <p>
                        • 스프레드시트 파일 이름이 <strong>{consolidateResult.renamedTitle}</strong>(으)로 변경되었습니다.
                      </p>
                    )}
                    {consolidateResult.handledMonthTabsCount !== undefined &&
                      consolidateResult.handledMonthTabsCount > 0 && (
                        <p>
                          • 기존 1~12월 탭 {consolidateResult.handledMonthTabsCount}개:{' '}
                          <strong>
                            {consolidateResult.oldMonthTabsAction === 'hide'
                              ? '숨김 처리 완료 (데이터 보존)'
                              : consolidateResult.oldMonthTabsAction === 'delete'
                              ? '삭제 완료'
                              : '유지됨'}
                          </strong>
                        </p>
                      )}
                  </div>
                  <div className="max-h-36 overflow-y-auto border border-emerald-200 rounded-lg bg-white/80 divide-y divide-emerald-100 text-[11px]">
                    {consolidateResult.monthLogs.map((log) => (
                      <div key={log.sourceTab} className="px-3 py-1.5 flex items-center justify-between">
                        <span className="font-bold text-slate-800">{log.sourceTab}</span>
                        <span>
                          {log.status === 'read' && (
                            <span className="text-emerald-700 font-bold">{log.count}건 통합됨</span>
                          )}
                          {log.status === 'empty' && (
                            <span className="text-slate-400">내역 없음</span>
                          )}
                          {log.status === 'skipped' && (
                            <span className="text-slate-400">탭 없음 (건너뜀)</span>
                          )}
                          {log.status === 'error' && (
                            <span className="text-rose-600 font-bold">오류: {log.error}</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'import_external' && (
            <>
              <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl space-y-1.5">
                <div className="flex items-center gap-2 text-blue-950 font-black text-xs sm:text-sm">
                  <FolderInput className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>과거 연도별 가계부 파일을 현재 마스터 시트의 연도 탭으로 가져오기</span>
                </div>
                <p className="text-xs text-blue-900 leading-relaxed">
                  예전에 따로 관리하던 <strong>2025년, 2024년</strong> 스프레드시트(1월~12월 탭 구조 또는 단일 탭 모두 지원)를 읽어
                  현재 파일의 <strong>[{importTabTitle}]</strong> 탭으로 한 번에 이관합니다. 이관이 끝나면 <strong>연도별 비교</strong> 탭에서 즉시 비교할 수 있습니다.
                </p>
              </div>

              {/* Step 1: Target Year & Tab Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">
                    1. 가져올 데이터의 연도
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['2025', '2024', '2023', '2022'].map((y) => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => {
                          setImportYear(y);
                          setImportTabTitle(y);
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-black border cursor-pointer transition ${
                          importYear === y
                            ? 'bg-blue-600 text-white border-blue-700'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {y}년
                      </button>
                    ))}
                    <input
                      type="text"
                      value={importYear}
                      onChange={(e) => {
                        setImportYear(e.target.value);
                        setImportTabTitle(e.target.value);
                      }}
                      placeholder="직접"
                      className="w-16 px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">
                    2. 현재 파일에 만들 탭 이름
                  </label>
                  <input
                    type="text"
                    value={importTabTitle}
                    onChange={(e) => setImportTabTitle(e.target.value)}
                    placeholder="예: 2025"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
                  />
                </div>
              </div>

              {/* Step 2: Source File Picker */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-black text-slate-700">
                    3. 가져올 원본 스프레드시트 선택
                  </label>
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setSourceInputMode('drive')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                        sourceInputMode === 'drive'
                          ? 'bg-white text-blue-700 shadow-2xs'
                          : 'text-slate-600'
                      }`}
                    >
                      Google 드라이브
                    </button>
                    <button
                      type="button"
                      onClick={() => setSourceInputMode('url')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                        sourceInputMode === 'url'
                          ? 'bg-white text-blue-700 shadow-2xs'
                          : 'text-slate-600'
                      }`}
                    >
                      링크 / ID 입력
                    </button>
                  </div>
                </div>

                {sourceInputMode === 'drive' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={driveSearch}
                          onChange={(e) => setDriveSearch(e.target.value)}
                          placeholder="파일명 검색 (예: 2025, 가계부)..."
                          className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={loadDriveFiles}
                        disabled={isLoadingDrive || !accessToken}
                        className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDrive ? 'animate-spin' : ''}`} />
                        <span>새로고침</span>
                      </button>
                    </div>

                    {driveError && (
                      <p className="text-xs text-rose-600 font-bold">{driveError}</p>
                    )}

                    <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                      {!accessToken ? (
                        <div className="p-4 text-center text-xs text-slate-500">
                          Google 로그인 후 드라이브 파일 목록을 불러올 수 있습니다.
                        </div>
                      ) : isLoadingDrive ? (
                        <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                          <span>드라이브 스프레드시트 검색 중...</span>
                        </div>
                      ) : filteredDriveFiles.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500">
                          일치하는 스프레드시트가 없습니다.
                        </div>
                      ) : (
                        filteredDriveFiles.map((file) => {
                          const isSelected = selectedDriveFile?.id === file.id;
                          return (
                            <button
                              key={file.id}
                              type="button"
                              onClick={() => setSelectedDriveFile(file)}
                              className={`w-full px-3 py-2 text-left flex items-center justify-between text-xs transition cursor-pointer ${
                                isSelected
                                  ? 'bg-blue-50 text-blue-900 font-black'
                                  : 'hover:bg-slate-50 text-slate-700 font-medium'
                              }`}
                            >
                              <span className="flex items-center gap-2 min-w-0">
                                <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span className="truncate">{file.name}</span>
                              </span>
                              {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Link2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={externalUrlOrId}
                        onChange={(e) => setExternalUrlOrId(e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/d/... 또는 시트 ID"
                        className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold"
                      />
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={mergeExternal}
                    onChange={(e) => setMergeExternal(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 cursor-pointer"
                  />
                  <span>이미 [{importTabTitle}] 탭에 내역이 있을 경우 중복 건 제외하고 병합</span>
                </label>
              </div>

              {importError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {isImportingExternal && importProgress && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-blue-900">
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                      <span>{importProgress.message}</span>
                    </span>
                    <span>
                      {Math.round(
                        (importProgress.index / Math.max(1, importProgress.total)) * 100
                      )}
                      %
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-blue-200/70 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-300 rounded-full"
                      style={{
                        width: `${Math.round(
                          (importProgress.index / Math.max(1, importProgress.total)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {importResult && !isImportingExternal && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-emerald-900 font-black text-sm">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <span>
                        [{importResult.sourceSpreadsheetTitle}] → [{importResult.targetTabTitle}] 이관 완료!
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {onOpenComparisonView && (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenComparisonView();
                            onClose();
                          }}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-black flex items-center gap-1 cursor-pointer"
                        >
                          <span>연도별 비교 바로 보기</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-emerald-800">
                    신규 <strong>{importResult.newlyAddedCount.toLocaleString()}건</strong> 반영 완료 (총{' '}
                    <strong>{importResult.totalRowsWritten.toLocaleString()}건</strong> 저장됨
                    {importResult.skippedDuplicates > 0
                      ? `, 중복 ${importResult.skippedDuplicates}건 건너뜀`
                      : ''}
                    )
                  </p>
                  <div className="max-h-32 overflow-y-auto border border-emerald-200 rounded-lg bg-white/80 divide-y divide-emerald-100 text-[11px]">
                    {importResult.sourceTabLogs.map((log) => (
                      <div key={log.sourceTab} className="px-3 py-1.5 flex items-center justify-between">
                        <span className="font-bold text-slate-800">{log.sourceTab}</span>
                        <span>
                          {log.status === 'read' && (
                            <span className="text-emerald-700 font-bold">{log.count}건 가져옴</span>
                          )}
                          {log.status === 'empty' && <span className="text-slate-400">빈 시트</span>}
                          {log.status === 'skipped' && <span className="text-slate-400">요약 시트 제외</span>}
                          {log.status === 'error' && (
                            <span className="text-rose-600 font-bold">오류: {log.error}</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'columns_only' && (
            <>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                <span className="text-xs font-black text-slate-800 block">
                  기존 1월~12월 월별 탭을 유지하면서 9개 표준 컬럼만 정리하기
                </span>
                <p className="text-xs text-slate-600">
                  각 월별 시트의 비고 태그(<code>[정기예산]</code>, <code>[특별지출]</code>, 세부품목)를 전용 컬럼으로 분리하고 5000번대 빈 행을 2행부터 압축 정리합니다.
                </p>
              </div>

              {isMigratingColumns && columnsProgress && (
                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                      <span>{columnsProgress.message}</span>
                    </span>
                    <span className="text-indigo-600">{columnsProgressPercent}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-indigo-200/70 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-300 rounded-full"
                      style={{ width: `${columnsProgressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {columnsResults && !isMigratingColumns && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2.5">
                  <div className="flex items-center gap-2 text-emerald-900 font-black text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span>1월~12월 컬럼 정리 완료 (총 {totalMigratedColumnTxs}건)</span>
                  </div>
                  <div className="max-h-36 overflow-y-auto border border-emerald-200 rounded-lg bg-white/80 divide-y divide-emerald-100 text-[11px]">
                    {columnsResults.map((r) => (
                      <div key={r.monthTitle} className="px-3 py-1.5 flex items-center justify-between">
                        <span className="font-bold text-slate-800">{r.monthTitle}</span>
                        <span className="text-emerald-700 font-semibold">
                          {r.status === 'migrated'
                            ? `${r.count}건 정리 완료`
                            : r.status === 'error'
                            ? `실패: ${r.error}`
                            : '헤더 초기화됨'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
          <div>
            {spreadsheetUrl && (
              <a
                href={spreadsheetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>구글 시트 열기</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200/80 rounded-xl transition cursor-pointer disabled:opacity-40"
            >
              닫기
            </button>

            {!isRealGoogleConnected || !accessToken ? (
              <button
                type="button"
                onClick={onLogin}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-xs transition cursor-pointer"
              >
                <span>Google 로그인 후 실행하기</span>
              </button>
            ) : activeTab === 'consolidate' ? (
              <button
                type="button"
                onClick={handleRunConsolidate}
                disabled={isBusy}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white text-xs font-black rounded-xl shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isConsolidating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>통합 진행 중...</span>
                  </>
                ) : (
                  <>
                    <Layers className="w-4 h-4" />
                    <span>실제 구글 시트 만년 가계부로 전환하기</span>
                  </>
                )}
              </button>
            ) : activeTab === 'import_external' ? (
              <button
                type="button"
                onClick={handleRunImportExternal}
                disabled={isBusy}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white text-xs font-black rounded-xl shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isImportingExternal ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>데이터 가져오는 중...</span>
                  </>
                ) : (
                  <>
                    <FolderInput className="w-4 h-4" />
                    <span>[{importTabTitle}] 탭으로 이관 실행</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={onRunColumnsMigration}
                disabled={isBusy}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-black rounded-xl shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isMigratingColumns ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>컬럼 정리 중...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>1월~12월 컬럼 일괄 정리</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
