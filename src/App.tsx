import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from 'firebase/auth';
import {
  initAuth,
  googleSignIn,
  logout,
  getAccessToken,
  setCachedAccessToken,
  refreshGoogleToken,
  isAuthExpiredError,
  saveAuthSession,
  getSavedToken,
} from './services/firebase';
import {
  getSpreadsheetDetails,
  getSheetValues,
  analyzeSheetStructure,
  extractYearMatrixData,
  appendTransactionRow,
  appendBatchTransactions,
  updateTransactionRow,
  batchUpdateTransactionsCategoryInSheet,
  deleteTransactionRow,
  deleteMultipleTransactionRows,
  addMonthlySheetTab,
  exportMonthTransactionsToSheet,
  migrateSheetColumns,
  migrateAllMonthSheetsColumns,
  MonthMigrationResult,
  ConsolidationResult,
  ImportExternalYearResult,
  ExternalImportOptions,
  ExternalSpreadsheetInspection,
  OldMonthTabsAction,
  PERPETUAL_SUMMARY_TAB_TITLE,
  extractMonthNumberFromTab,
  findTabForMonth,
  extractYearFromTab,
  extractYearFromDate,
  findTabForYear,
  findAllYearTabs,
  detectSheetLayoutMode,
  setStoredLayoutMode,
  computeYearDashboardDataFromTransactions,
  consolidateMonthsIntoYearTab,
  importExternalSpreadsheetToYearTab,
  inspectExternalSpreadsheetForImport,
  organizePerpetualSheetStructure,
} from './services/googleSheets';
import { listSpreadsheets } from './services/googleDrive';
import { Header, MainViewTab } from './components/Header';
import { ExpenseInputForm } from './components/ExpenseInputForm';
import { Dashboard } from './components/Dashboard';
import { SpreadsheetPickerModal } from './components/SpreadsheetPickerModal';
import { GitHubModal } from './components/GitHubModal';
import { ConfirmationModal } from './components/ConfirmationModal';
import { AnnualMatrixView } from './components/AnnualMatrixView';
import { YearComparisonView } from './components/YearComparisonView';
import { CategoryManagementModal } from './components/CategoryManagementModal';
import { DomainAuthModal } from './components/DomainAuthModal';
import { UnifiedMigrationModal } from './components/UnifiedMigrationModal';
import { RegisterYearSheetModal } from './components/RegisterYearSheetModal';
import { SettingsModal } from './components/SettingsModal';
import { SAMPLE_ANALYSIS, SAMPLE_TRANSACTIONS } from './data/sampleLedger';
import {
  USER_2026_DATA,
  YearDashboardData,
  generateUserMonthlyTransactions,
  generateUserAllTransactions,
  USER_CATEGORIES,
} from './data/userLedgerData';
import {
  Transaction,
  TransactionType,
  SheetAnalysisResult,
  ColumnMapping,
  CategoryItem,
  PaymentMethodItem,
} from './types/ledger';
import {
  loadCategories,
  saveCategories,
  loadPaymentMethods,
  savePaymentMethods,
  getDefaultCategories,
  getDefaultPaymentMethods,
  findSettingsTab,
  loadCategoriesFromGoogleSheet,
  syncCategoriesToGoogleSheet,
} from './services/categoryManager';
import {
  enrichTransactionsWithSubItems,
  saveSubItemsForTransaction,
} from './services/subItemStorage';
import { registerPaymentMethods } from './utils/paymentGroupUtils';
import {
  BarChart3,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Plus,
  Calendar,
  RefreshCw,
  UploadCloud,
  TrendingUp,
  ShieldAlert,
} from 'lucide-react';

export default function App() {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Custom Categories & Payment Methods with show/hide visibility
  const [customCategories, setCustomCategories] = useState<CategoryItem[]>(() =>
    loadCategories(USER_CATEGORIES)
  );
  const [customPaymentMethods, setCustomPaymentMethods] = useState<PaymentMethodItem[]>(() => {
    const defaultMethods = [
      '신용카드',
      '체크카드',
      '현대카드',
      '신한카드',
      '삼성카드',
      'KB국민카드',
      '자동이체',
      '계좌이체',
      '국민은행',
      '현금',
      '네이버페이',
      '카카오페이',
      '토스페이',
      '티머니',
    ];
    return loadPaymentMethods(defaultMethods);
  });

  const handleAddCustomCategory = useCallback(
    (name: string, catType: TransactionType = 'expense') => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setCustomCategories((prev) => {
        if (
          prev.some(
            (c) =>
              c.name.trim().toLowerCase() === trimmed.toLowerCase() &&
              (c.type || 'expense') === catType
          )
        ) {
          return prev;
        }
        const next: CategoryItem[] = [
          ...prev,
          {
            id: `cat_custom_${Date.now()}`,
            name: trimmed,
            type: catType,
            isVisible: true,
            isCustom: true,
          },
        ];
        saveCategories(next);
        return next;
      });
    },
    []
  );

  const handleAddCustomPaymentMethod = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCustomPaymentMethods((prev) => {
      if (prev.some((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase())) return prev;
      const next = [
        ...prev,
        {
          id: `pm_custom_${Date.now()}`,
          name: trimmed,
          isVisible: true,
          isCustom: true,
        },
      ];
      savePaymentMethods(next);
      return next;
    });
  }, []);

  useEffect(() => {
    registerPaymentMethods(customPaymentMethods);
  }, [customPaymentMethods]);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [isDomainAuthModalOpen, setIsDomainAuthModalOpen] = useState<boolean>(false);

  // Active Spreadsheet & Sheets state
  const [spreadsheetId, setSpreadsheetId] = useState<string>('user-2026-ledger');
  const [spreadsheetTitle, setSpreadsheetTitle] = useState<string>('2026 가계부 Dashboard');
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | undefined>(undefined);
  const [sheetTabs, setSheetTabs] = useState<Array<{ id: number; title: string; hidden?: boolean }>>(() =>
    ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'].map(
      (m, i) => ({ id: i + 1, title: m })
    )
  );
  const [activeSheetTitle, setActiveSheetTitle] = useState<string>(
    () => `${new Date().getMonth() + 1}월`
  );

  // Ledger Analysis & Transactions
  const [analysis, setAnalysis] = useState<SheetAnalysisResult>(() => ({
    spreadsheetId: 'user-2026-ledger',
    spreadsheetTitle: '2026 가계부 Dashboard',
    sheetTabs: ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'].map(
      (m, i) => ({ id: i + 1, title: m })
    ),
    activeSheetTitle: `${new Date().getMonth() + 1}월`,
    mapping: {
      dateCol: 0,
      typeCol: 1,
      categoryCol: 2,
      descCol: 3,
      amountCol: 4,
      paymentMethodCol: 5,
      memoCol: 6,
      headerRowIndex: 4,
      detectedHeaders: ['분류', '연간 지출', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'],
    },
    detectedCategories: USER_2026_DATA.categories.map((c) => ({
      name: c.category,
      count: c.monthly.filter((m) => m > 0).length,
      totalAmount: c.annualTotal,
      type: 'expense' as const,
    })),
    detectedPaymentMethods: ['신용카드', '체크카드', '자동이체', '현금', '네이버페이', '카카오페이'],
    historicalDescriptions: USER_2026_DATA.categories.map((c) => ({
      description: `${c.category} 지출`,
      category: c.category,
      paymentMethod: '신용카드',
      count: c.monthly.filter((m) => m > 0).length,
    })),
    rowCount: 26,
    rawSampleRows: [
      ['2026 가계부 Dashboard'],
      ['총 수입', '236,119,629', '', '총 지출', '134,417,104'],
      ['분류', '연간 지출', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'],
      ['식비', '2,790,578', '57,500', '130,000', '187,500', '347,920', '488,970', '181,750', '333,800', '428,833', '548,355', '85,950', '0', '0'],
      ['외식', '4,159,011', '19,600', '60,400', '414,020', '705,380', '610,670', '536,186', '638,790', '557,895', '495,270', '120,800', '0', '0'],
    ],
  }));
  // Storage keys for robust local persistence
  const PENDING_SYNC_STORAGE_KEY = 'smart_money_pending_sync_txs';

  // Load and consolidate any pending transactions that have not yet reached Google Sheets
  const loadPendingQueue = (): Transaction[] => {
    const queueMap = new Map<string, Transaction>();
    try {
      // 1. Read from dedicated pending sync storage
      const rawPending = localStorage.getItem(PENDING_SYNC_STORAGE_KEY);
      if (rawPending) {
        const parsed: Transaction[] = JSON.parse(rawPending);
        if (Array.isArray(parsed)) {
          parsed.forEach((tx) => {
            if (tx && tx.amount > 0 && tx.date) {
              const key = `${tx.date}_${tx.amount}_${tx.description}_${tx.category}`;
              queueMap.set(key, tx);
            }
          });
        }
      }

      // 2. Scan smart_money_user_transactions_v2 for local unsynced transactions (e.g. October entries)
      const rawV2 = localStorage.getItem('smart_money_user_transactions_v2');
      if (rawV2) {
        const parsedV2: Transaction[] = JSON.parse(rawV2);
        if (Array.isArray(parsedV2)) {
          parsedV2.forEach((tx) => {
            if (
              tx &&
              tx.amount > 0 &&
              tx.date &&
              (tx.id?.startsWith('local-') || tx.rowIndex === undefined || tx.rowIndex === null)
            ) {
              const key = `${tx.date}_${tx.amount}_${tx.description}_${tx.category}`;
              if (!queueMap.has(key)) {
                queueMap.set(key, tx);
              }
            }
          });
        }
      }
    } catch (e) {
      console.warn('Error loading pending sync queue:', e);
    }
    return Array.from(queueMap.values());
  };

  const [pendingSyncList, setPendingSyncList] = useState<Transaction[]>(loadPendingQueue);

  // Auto-persist pending sync queue
  useEffect(() => {
    try {
      localStorage.setItem(PENDING_SYNC_STORAGE_KEY, JSON.stringify(pendingSyncList));
    } catch (e) {
      console.warn('Could not save pending sync list:', e);
    }
  }, [pendingSyncList]);

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const savedSheetId = localStorage.getItem('smart_money_spreadsheet_id');
      const isRealSheet = savedSheetId && !['sample-ledger-2026', 'user-2026-ledger', 'pasted-sheet'].includes(savedSheetId);
      
      const saved = localStorage.getItem('smart_money_user_transactions_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const hasDummy = parsed.some((t: any) => t.id?.startsWith('user-2026-') || t.id?.startsWith('sample-'));
          if (isRealSheet && hasDummy) {
            localStorage.removeItem('smart_money_user_transactions_v2');
            return [];
          }
          return enrichTransactionsWithSubItems(parsed);
        }
      }
      if (isRealSheet) {
        return [];
      }
    } catch (e) {
      console.warn('Could not load local transactions:', e);
    }
    return enrichTransactionsWithSubItems(generateUserAllTransactions());
  });

  // Auto-persist transactions locally to ensure data is never lost on refresh or offline/standalone mode
  useEffect(() => {
    try {
      if (transactions && transactions.length > 0) {
        localStorage.setItem('smart_money_user_transactions_v2', JSON.stringify(transactions));
      }
    } catch (e) {
      console.warn('Could not save local transactions:', e);
    }
  }, [transactions]);

  // Auto-sync any payment methods appearing in transactions into customPaymentMethods so they never disappear
  useEffect(() => {
    if (!transactions || transactions.length === 0) return;
    const existing = new Set(customPaymentMethods.map((p) => p.name));
    let hasNew = false;
    const newItems: PaymentMethodItem[] = [];

    transactions.forEach((t) => {
      if (t.paymentMethod && t.paymentMethod.trim() && !existing.has(t.paymentMethod.trim())) {
        const clean = t.paymentMethod.trim();
        existing.add(clean);
        newItems.push({
          id: `pm_tx_${Date.now()}_${newItems.length}`,
          name: clean,
          isVisible: true,
          isCustom: true,
        });
        hasNew = true;
      }
    });

    if (hasNew) {
      setCustomPaymentMethods((prev) => {
        const merged = [...prev, ...newItems];
        savePaymentMethods(merged);
        return merged;
      });
    }
  }, [transactions, customPaymentMethods]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Active View Tab: 'matrix' | 'monthly' | 'comparison'
  const [activeTab, setActiveTab] = useState<MainViewTab>('matrix');

  const [yearData, setYearData] = useState<YearDashboardData>(USER_2026_DATA);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isGitHubOpen, setIsGitHubOpen] = useState(false);
  const [isInputModalOpen, setIsInputModalOpen] = useState(false);
  const [openImportOnModal, setOpenImportOnModal] = useState(false);
  const [isRegisterYearModalOpen, setIsRegisterYearModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'sheet' | 'categories' | 'advanced'>('sheet');

  // Multi-Year Sheets Registry state (e.g. 2026, 2025, 2024...)
  const [yearlySheets, setYearlySheets] = useState<Array<{ year: string; title: string; id: string; url?: string }>>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('smart_money_yearly_sheets');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    const curYearMatch = spreadsheetTitle?.match(/20\d{2}/) || '2026';
    return [
      {
        year: typeof curYearMatch === 'string' ? curYearMatch : curYearMatch[0],
        id: spreadsheetId,
        title: spreadsheetTitle,
        url: spreadsheetUrl,
      },
    ];
  });

  const activeYear = useMemo(() => {
    const tabYear = extractYearFromTab(activeSheetTitle);
    if (tabYear) return String(tabYear);
    const match = spreadsheetTitle?.match(/20\d{2}/) || activeSheetTitle?.match(/20\d{2}/);
    if (!match) return '2026';
    return typeof match === 'string' ? match : match[0];
  }, [spreadsheetTitle, activeSheetTitle]);

  const isYearlyUnifiedMode = useMemo(() => {
    return detectSheetLayoutMode(sheetTabs, activeSheetTitle, spreadsheetId) === 'yearly';
  }, [sheetTabs, activeSheetTitle, spreadsheetId]);

  // Floating Real-time Sync Toast Notification
  const [syncToast, setSyncToast] = useState<{
    show: boolean;
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (syncToast?.show) {
      const timer = setTimeout(() => {
        setSyncToast(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [syncToast]);

  // User Confirmation Modal state (Mandatory for Google Workspace mutations)
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    details?: string[];
    confirmText?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: '확인',
    onConfirm: () => {},
  });

  const isRealGoogleConnected = Boolean(
    spreadsheetId &&
    !['sample-ledger-2026', 'user-2026-ledger', 'pasted-sheet'].includes(spreadsheetId)
  );

  const needsPerpetualUpgrade = useMemo(() => {
    if (!isRealGoogleConnected) return false;
    const hasVisibleMonths = sheetTabs.some(
      (t) => !t.hidden && extractMonthNumberFromTab(t.title) !== null
    );
    const hasSummaryTab = sheetTabs.some(
      (t) =>
        !t.hidden &&
        (t.title.trim() === PERPETUAL_SUMMARY_TAB_TITLE ||
          /연도별\s*요약|연도\s*요약/i.test(t.title))
    );
    const hasYearTab = findAllYearTabs(sheetTabs).length > 0;
    return !hasYearTab || hasVisibleMonths || !hasSummaryTab;
  }, [isRealGoogleConnected, sheetTabs]);

  // 1. Initialize Auth on Mount with session restoration
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);

        // Auto-restore previously selected spreadsheet
        try {
          const savedId = localStorage.getItem('smart_money_spreadsheet_id');
          const savedTitle = localStorage.getItem('smart_money_spreadsheet_title');
          if (
            savedId &&
            savedTitle &&
            !['sample-ledger-2026', 'user-2026-ledger'].includes(savedId)
          ) {
            handleSelectSpreadsheet(savedId, savedTitle, token);
          }
        } catch (e) {
          console.warn('Could not restore spreadsheet from storage', e);
        }
      },
      () => {
        setUser(null);
        setAccessToken(null);

        // If not logged in, check if user saved a direct sheet ID before
        try {
          const savedId = localStorage.getItem('smart_money_spreadsheet_id');
          const savedTitle = localStorage.getItem('smart_money_spreadsheet_title');
          if (
            savedId &&
            savedTitle &&
            !['sample-ledger-2026', 'user-2026-ledger'].includes(savedId)
          ) {
            handleSelectSpreadsheet(savedId, savedTitle);
          }
        } catch (e) {
          console.warn('Could not restore spreadsheet from storage', e);
        }
      }
    );
    return () => unsubscribe();
  }, []);

  // 2. Fetch and Analyze Google Sheet Data (supports both OAuth and public gviz)
  const loadSheetData = useCallback(
    async (
      sId: string,
      sheetName: string,
      token?: string | null,
      options?: { explicitTabSelection?: boolean }
    ) => {
      setIsLoadingData(true);
      setErrorNotice(null);
      let activeToken = token ?? getSavedToken() ?? null;
      try {
        // Fetch metadata to get latest sheet list and title
        const meta = await getSpreadsheetDetails(sId, activeToken);
        if (activeToken && !getSavedToken()) {
          activeToken = null;
          setAccessToken(null);
        }
        setSpreadsheetTitle(meta.title);
        setSpreadsheetUrl(`https://docs.google.com/spreadsheets/d/${sId}`);

        const formattedTabs = meta.sheets.map((s) => ({
          id: s.id,
          title: s.title,
          hidden: s.hidden,
        }));
        setSheetTabs(formattedTabs);

        // Auto-load categories & payment methods from '분류설정' sheet tab if present
        const settingsTab = findSettingsTab(formattedTabs);
        if (settingsTab) {
          loadCategoriesFromGoogleSheet(sId, activeToken, formattedTabs)
            .then((loaded) => {
              if (loaded) {
                if (loaded.categories.length > 0) {
                  setCustomCategories(loaded.categories);
                  saveCategories(loaded.categories);
                }
                if (loaded.paymentMethods.length > 0) {
                  setCustomPaymentMethods(loaded.paymentMethods);
                  savePaymentMethods(loaded.paymentMethods);
                }
                setSyncToast({
                  show: true,
                  type: 'success',
                  message: `시트의 '${loaded.tabTitle}' 탭에서 분류와 결제수단을 동기화했습니다!`,
                });
              }
            })
            .catch((err) => console.warn('Auto-load categories from sheet notice:', err));
        }

        // Helper tab categorizers
        const isTxTab = (t: string) =>
          /지출내역|가계부내역|거래내역|수입지출|입출금|상세내역|내역입력|가계부|지출|수입|거래|기록|ledger|transactions/i.test(
            t
          );
        const isConfigTab = (t: string) =>
          /분류관리|분류|기준목록|기준|설정|카테고리|코드|항목관리|자산|계좌관리|카드관리|기초/i.test(
            t
          );
        const isDashboardTab = (t: string) =>
          /dashboard|대시보드|요약|summary|연간|matrix/i.test(t);

        // Intelligently find target sheet (supports both unified year tabs e.g. '2026' and legacy monthly tabs '1월'~'12월')
        const effectiveSheetName = sheetName?.trim() || '';
        const detectedMode = detectSheetLayoutMode(formattedTabs, effectiveSheetName || undefined, sId);
        if (detectedMode === 'yearly') {
          setStoredLayoutMode(sId, 'yearly');
        }

        const reqTabYear = extractYearFromTab(effectiveSheetName);
        const fallbackMonthNum = new Date().getMonth() + 1;
        const reqMonthNum =
          reqTabYear === null
            ? effectiveSheetName
              ? extractMonthNumberFromTab(effectiveSheetName)
              : fallbackMonthNum
            : null;

        let targetSheet = effectiveSheetName;
        const exactMatch = effectiveSheetName
          ? formattedTabs.find((t) => t.title === effectiveSheetName)
          : undefined;

        const shouldAutoSelectYearly =
          detectedMode === 'yearly' &&
          (!effectiveSheetName ||
            (!options?.explicitTabSelection &&
              reqTabYear === null &&
              !isDashboardTab(effectiveSheetName)));

        if (shouldAutoSelectYearly) {
          const curCalYear = new Date().getFullYear();
          const yearTabs = findAllYearTabs(formattedTabs);
          const curYearTab = findTabForYear(formattedTabs, curCalYear);
          targetSheet = curYearTab
            ? curYearTab.title
            : yearTabs.length > 0
            ? yearTabs[0].title
            : effectiveSheetName || String(curCalYear);
        } else if (
          exactMatch &&
          !(detectedMode === 'yearly' && exactMatch.hidden && extractYearFromTab(exactMatch.title) === null)
        ) {
          targetSheet = exactMatch.title;
        } else if (reqTabYear !== null) {
          const matchedYearTab = findTabForYear(formattedTabs, reqTabYear);
          targetSheet = matchedYearTab ? matchedYearTab.title : effectiveSheetName;
        } else if (detectedMode === 'yearly') {
          const curCalYear = new Date().getFullYear();
          const yearTabs = findAllYearTabs(formattedTabs);
          const curYearTab = findTabForYear(formattedTabs, curCalYear);
          if (curYearTab) {
            targetSheet = curYearTab.title;
          } else if (yearTabs.length > 0) {
            targetSheet = yearTabs[0].title;
          } else if (reqMonthNum !== null) {
            const matchedTab = findTabForMonth(formattedTabs, reqMonthNum);
            targetSheet = matchedTab ? matchedTab.title : effectiveSheetName || `${reqMonthNum}월`;
          }
        } else if (reqMonthNum !== null) {
          const matchedTab = findTabForMonth(formattedTabs, reqMonthNum);
          if (matchedTab) {
            targetSheet = matchedTab.title;
          } else {
            const txTab = formattedTabs.find((t) => isTxTab(t.title));
            if (txTab) {
              targetSheet = txTab.title;
            } else {
              targetSheet = effectiveSheetName || `${reqMonthNum}월`;
            }
          }
        } else {
          const txTab = formattedTabs.find((t) => isTxTab(t.title));
          if (txTab) {
            targetSheet = txTab.title;
          } else {
            const dashTab = formattedTabs.find((t) => isDashboardTab(t.title));
            if (dashTab) {
              targetSheet = dashTab.title;
            } else {
              const nonConfig = formattedTabs.find((t) => !isConfigTab(t.title));
              targetSheet = nonConfig?.title || formattedTabs[0]?.title || '시트1';
            }
          }
        }
        setActiveSheetTitle(targetSheet);
        const targetTabYear = extractYearFromTab(targetSheet);

        // Fetch sheet values without arbitrary row limit (fetch entire sheet A:Z)
        let rows: string[][] = [];
        try {
          rows = await getSheetValues(sId, targetSheet, activeToken, 'A:Z');
          if (activeToken && !getSavedToken()) {
            setAccessToken(null);
          }
        } catch (fetchErr: any) {
          if (fetchErr?.message?.includes('AUTH_EXPIRED') || isAuthExpiredError(fetchErr)) {
            setAccessToken(null);
            setErrorNotice('Google 인증 세션이 만료되어 읽기 전용 상태입니다. 상단 [Google 로그인 (실시간 쓰기)]을 눌러 재인증해 주세요.');
          } else {
            console.warn(`Sheet tab ${targetSheet} fetch warning:`, fetchErr);
          }
          rows = [];
        }

        // Analyze sheet structure
        const result = analyzeSheetStructure(sId, meta.title, formattedTabs, targetSheet, rows);
        setAnalysis(result.analysis);

        if (result.analysis.isMatrixSheet || isDashboardTab(targetSheet)) {
          const matrix = extractYearMatrixData(rows);
          if (matrix) {
            setYearData(matrix);
          }
          setActiveTab('matrix');
        } else {
          // If NOT on a unified year tab and a dashboard/matrix tab exists elsewhere, sync yearData in background
          const dashTab = formattedTabs.find((t) => isDashboardTab(t.title));
          if (targetTabYear === null && dashTab && targetSheet !== dashTab.title) {
            getSheetValues(sId, dashTab.title, activeToken, 'A:Z')
              .then((dashRows) => {
                const matrix = extractYearMatrixData(dashRows);
                if (matrix && matrix.categories.length > 0) {
                  setYearData(matrix);
                }
              })
              .catch((err) => console.warn('Background dashboard tab sync warning:', err));
          }
          // Find any pending transactions for this year/month/sheet so they are never wiped!
          const currentPending = loadPendingQueue();
          const pendingForThisSheet = currentPending.filter((p) => {
            if (p.sheetTitle === targetSheet) return true;
            if (targetTabYear !== null) {
              const pYear = extractYearFromDate(p.date) || extractYearFromTab(p.sheetTitle);
              return pYear === targetTabYear;
            }
            const pMonth = extractMonthNumberFromTab(p.sheetTitle || p.date);
            const curMonth = reqMonthNum !== null ? reqMonthNum : extractMonthNumberFromTab(targetSheet);
            return pMonth !== null && curMonth !== null && pMonth === curMonth;
          });

          if (result.transactions.length > 0) {
            const merged = [...result.transactions];
            pendingForThisSheet.forEach((p) => {
              const alreadyInSheet = merged.some(
                (m) =>
                  m.date === p.date &&
                  m.amount === p.amount &&
                  m.description === p.description
              );
              if (!alreadyInSheet) {
                merged.unshift(p);
              }
            });
            const enriched = enrichTransactionsWithSubItems(merged);
            setTransactions(enriched);
            if (targetTabYear !== null) {
              setYearData(computeYearDashboardDataFromTransactions(enriched, targetTabYear));
            }
          } else if (pendingForThisSheet.length > 0) {
            // Sheet is empty or new: keep pending transactions visible!
            const enrichedPending = enrichTransactionsWithSubItems(pendingForThisSheet);
            setTransactions(enrichedPending);
            if (targetTabYear !== null) {
              setYearData(computeYearDashboardDataFromTransactions(enrichedPending, targetTabYear));
            }
          } else if (!isRealGoogleConnected && reqMonthNum !== null) {
            // Only in offline sample mode if no transactions exist
            const fallbackTxs = generateUserMonthlyTransactions(reqMonthNum - 1);
            setTransactions(enrichTransactionsWithSubItems(fallbackTxs));
          } else {
            setTransactions([]);
            if (targetTabYear !== null) {
              setYearData({
                year: targetTabYear,
                totalIncome: 0,
                totalExpense: 0,
                categories: [],
              });
            }
          }
          setActiveTab((prev) => (prev === 'comparison' ? 'comparison' : 'monthly'));
        }
      } catch (err: any) {
        console.error('Failed to load sheet:', err);
        setErrorNotice(err?.message || '스프레드시트 데이터를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoadingData(false);
      }
    },
    [isRealGoogleConnected]
  );

  // When active sheet changes
  const handleSelectSheetTab = (title: string) => {
    setActiveSheetTitle(title);

    if (/dashboard|대시보드|요약|matrix|연간/i.test(title)) {
      setActiveTab('matrix');
    } else {
      setActiveTab('monthly');
    }

    if (isRealGoogleConnected) {
      loadSheetData(spreadsheetId, title, accessToken, { explicitTabSelection: true });
    } else {
      // In offline/sample mode: keep complete transactions dataset intact
      // Dashboard will filter to the selected month seamlessly
      setAnalysis((prev) => ({
        ...prev,
        activeSheetTitle: title,
      }));
    }
  };

  // Switch directly to an integrated year tab inside the current file (e.g. '2026', '2025')
  const handleSelectYearTab = useCallback(
    (tabTitle: string) => {
      setActiveSheetTitle(tabTitle);
      setActiveTab((prev) => (prev === 'comparison' ? 'monthly' : prev));
      if (isRealGoogleConnected) {
        loadSheetData(spreadsheetId, tabTitle, accessToken, { explicitTabSelection: true });
      } else {
        setAnalysis((prev) => ({
          ...prev,
          activeSheetTitle: tabTitle,
        }));
      }
    },
    [isRealGoogleConnected, spreadsheetId, accessToken, loadSheetData]
  );

  // Fetch real transactions for a specific month (or monthNum===0 for entire active unified year tab)
  const handleFetchMonthTransactions = useCallback(
    async (monthNum: number): Promise<Transaction[]> => {
      if (!spreadsheetId) return [];
      const effectiveToken = accessToken || getSavedToken() || null;
      const activeTabYear = extractYearFromTab(activeSheetTitle);
      const isUnified =
        activeTabYear !== null ||
        detectSheetLayoutMode(sheetTabs, activeSheetTitle, spreadsheetId) === 'yearly';

      // Unified year tab holds all 12 months in one tab!
      if (isUnified) {
        const targetYearNum = activeTabYear || Number(activeYear) || new Date().getFullYear();
        const yearTab = findTabForYear(sheetTabs, targetYearNum);
        const targetTabTitle = yearTab ? yearTab.title : activeSheetTitle || String(targetYearNum);

        try {
          const rows = await getSheetValues(spreadsheetId, targetTabTitle, effectiveToken, 'A:Z');
          if (!rows || rows.length === 0) return [];
          const result = analyzeSheetStructure(spreadsheetId, spreadsheetTitle, sheetTabs, targetTabTitle, rows);
          const realTransactions = enrichTransactionsWithSubItems(
            (result.transactions || []).filter(
              (t) => !t.id?.startsWith('user-2026-') && !t.id?.startsWith('sample-')
            )
          );
          if (monthNum === 0) return realTransactions;
          return realTransactions.filter((t) => {
            const md = t.date?.match(/^\d{4}\s*[-.\/]\s*(\d{1,2})/);
            return md ? parseInt(md[1], 10) === monthNum : true;
          });
        } catch (err) {
          console.warn(`Failed to fetch unified year tab ${targetTabTitle}:`, err);
          return [];
        }
      }

      if (monthNum <= 0) return [];

      let targetTabTitle: string | null = null;
      const matchedTab = findTabForMonth(sheetTabs, monthNum);
      if (matchedTab) {
        targetTabTitle = matchedTab.title;
      } else {
        // Fallback: check standard tab names e.g. "8월", "08월"
        const fallbackNames = [`${monthNum}월`, `${String(monthNum).padStart(2, '0')}월`, `${monthNum}`];
        const found = sheetTabs.find((t) => fallbackNames.includes(t.title?.trim()));
        targetTabTitle = found ? found.title : `${monthNum}월`;
      }

      try {
        const rows = await getSheetValues(spreadsheetId, targetTabTitle, effectiveToken, 'A:Z');
        if (!rows || rows.length === 0) return [];
        const result = analyzeSheetStructure(spreadsheetId, spreadsheetTitle, sheetTabs, targetTabTitle, rows);
        const realTransactions = (result.transactions || []).filter(
          (t) => !t.id?.startsWith('user-2026-') && !t.id?.startsWith('sample-')
        );
        return enrichTransactionsWithSubItems(realTransactions);
      } catch (err) {
        console.warn(`Failed to fetch transactions for ${targetTabTitle}:`, err);
        return [];
      }
    },
    [spreadsheetId, accessToken, sheetTabs, spreadsheetTitle, activeSheetTitle, activeYear]
  );

  // When user selects a different spreadsheet from Google Drive
  const handleSelectSpreadsheet = async (id: string, name: string, tokenOverride?: string) => {
    const token = tokenOverride || accessToken || (await getAccessToken());
    setSpreadsheetId(id);
    setSpreadsheetTitle(name);
    setSpreadsheetUrl(`https://docs.google.com/spreadsheets/d/${id}`);

    try {
      localStorage.setItem('smart_money_spreadsheet_id', id);
      localStorage.setItem('smart_money_spreadsheet_title', name);
    } catch (e) {
      console.warn('Could not save spreadsheet to storage', e);
    }

    await loadSheetData(id, '', token);
  };

  // Google Login Handler
  const handleLogin = async () => {
    setIsLoggingIn(true);
    setErrorNotice(null);
    try {
      const res = await googleSignIn();
      if (res && res.accessToken) {
        setUser(res.user);
        setAccessToken(res.accessToken);
        setCachedAccessToken(res.accessToken);

        // Search user's drive for ledger files (prefer saved ID or master 만년 가계부 file)
        try {
          const files = await listSpreadsheets(res.accessToken);
          if (files.length > 0) {
            const savedId = localStorage.getItem('smart_money_spreadsheet_id');
            const savedMatch = savedId ? files.find((f) => f.id === savedId) : undefined;
            const perpetualMatch = files.find((f) => /만년\s*가계부/i.test(f.name));
            const ledgerFile =
              savedMatch ||
              perpetualMatch ||
              files.find((f) => /가계부|budget|지출|2026|2025/i.test(f.name)) ||
              files[0];
            await handleSelectSpreadsheet(ledgerFile.id, ledgerFile.name, res.accessToken);
          } else {
            // No spreadsheet found, open picker modal
            setIsPickerOpen(true);
          }
        } catch (e) {
          console.warn('Could not auto-list drive files:', e);
          setIsPickerOpen(true);
        }
      }
    } catch (err: any) {
      const msg = err?.message || '구글 로그인 중 오류가 발생했습니다.';
      setErrorNotice(msg);
      if (msg.includes('도메인') || msg.includes('unauthorized-domain')) {
        setIsDomainAuthModalOpen(true);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Logout Handler
  const handleLogout = async () => {
    await logout();
    try {
      localStorage.removeItem('smart_money_spreadsheet_id');
      localStorage.removeItem('smart_money_spreadsheet_title');
    } catch (e) {
      console.warn('Could not clear saved sheet', e);
    }
    setUser(null);
    setAccessToken(null);
    setSpreadsheetId('sample-ledger-2026');
    setSpreadsheetTitle('2026년 우리집 가계부 (샘플)');
    setSpreadsheetUrl(undefined);
    setSheetTabs(SAMPLE_ANALYSIS.sheetTabs);
    setActiveSheetTitle('3월');
    setAnalysis(SAMPLE_ANALYSIS);
    setTransactions(SAMPLE_TRANSACTIONS);
  };

  const handleSelectYearSheet = useCallback(
    async (cfg: { year: string; title: string; id: string; url?: string }) => {
      if (!cfg.id) return;
      setSpreadsheetId(cfg.id);
      setSpreadsheetTitle(cfg.title);
      setSpreadsheetUrl(cfg.url || `https://docs.google.com/spreadsheets/d/${cfg.id}`);
      try {
        localStorage.setItem('smart_money_spreadsheet_id', cfg.id);
        localStorage.setItem('smart_money_spreadsheet_title', cfg.title);
      } catch {}
      const token = accessToken || getSavedToken() || null;
      await loadSheetData(cfg.id, '', token);
    },
    [accessToken, loadSheetData]
  );

  const handleRegisterYearSheet = useCallback(
    async (year: string, id: string, title: string) => {
      const newConfig = {
        year,
        id,
        title,
        url: `https://docs.google.com/spreadsheets/d/${id}`,
      };
      setYearlySheets((prev) => {
        const filtered = prev.filter((item) => item.year !== year && item.id !== id);
        const updated = [...filtered, newConfig].sort((a, b) => b.year.localeCompare(a.year));
        try {
          localStorage.setItem('smart_money_yearly_sheets', JSON.stringify(updated));
        } catch {}
        return updated;
      });
      await handleSelectYearSheet(newConfig);
    },
    [handleSelectYearSheet]
  );

  // Resolve target tab cleanly for both unified yearly mode ('2026', '2027') and legacy monthly mode ('10월')
  const resolveTargetTabForTx = useCallback(
    (tx: { date?: string; sheetTitle?: string }) => {
      const mode = detectSheetLayoutMode(sheetTabs, activeSheetTitle, spreadsheetId);
      let monthNum = 10;
      if (tx.date) {
        const parts = tx.date.split('-');
        if (parts.length >= 2) {
          const m = parseInt(parts[1], 10);
          if (!isNaN(m) && m >= 1 && m <= 12) monthNum = m;
        }
      } else if (tx.sheetTitle) {
        const mFromTab = extractMonthNumberFromTab(tx.sheetTitle);
        if (mFromTab !== null) monthNum = mFromTab;
      }

      if (mode === 'yearly') {
        const txYear =
          extractYearFromDate(tx.date) ||
          extractYearFromTab(tx.sheetTitle) ||
          Number(activeYear) ||
          new Date().getFullYear();
        const matchedYearTab = findTabForYear(sheetTabs, txYear);
        return {
          targetSheetTitle: matchedYearTab ? matchedYearTab.title : String(txYear),
          monthNum,
          yearNum: txYear,
        };
      }

      const targetMonth = `${monthNum}월`;
      let targetSheetTitle = targetMonth;
      if (sheetTabs && sheetTabs.length > 0) {
        const matched = findTabForMonth(sheetTabs, monthNum);
        if (matched) {
          targetSheetTitle = matched.title;
        } else {
          const direct = sheetTabs.find((t) => t.title === (tx.sheetTitle || targetMonth));
          if (direct) targetSheetTitle = direct.title;
        }
      }
      return {
        targetSheetTitle,
        monthNum,
        yearNum: Number(activeYear) || 2026,
      };
    },
    [sheetTabs, activeSheetTitle, spreadsheetId, activeYear]
  );

  // Add Transaction Handler with Direct Real-time Google Sheets Sync
  const handleAddTransaction = async (
    newTx: Omit<Transaction, 'id' | 'rowIndex'> & { sheetTitle?: string }
  ) => {
    // 1. Resolve target sheet tab (yearly unified tab OR monthly tab)
    const { targetSheetTitle, monthNum } = resolveTargetTabForTx(newTx);

    // 2. Accumulate into the YearDashboardData (2026 Annual Matrix)
    const monthIndex = monthNum - 1;
    setYearData((prev: YearDashboardData) => {
      let found = false;
      const updatedCats = prev.categories.map((cat) => {
        if (cat.category === newTx.category) {
          found = true;
          const newMonthly = [...cat.monthly];
          newMonthly[monthIndex] = (newMonthly[monthIndex] || 0) + newTx.amount;
          return {
            ...cat,
            monthly: newMonthly,
            annualTotal: cat.annualTotal + newTx.amount,
          };
        }
        return cat;
      });

      if (!found) {
        const newMonthly = new Array(12).fill(0);
        newMonthly[monthIndex] = newTx.amount;
        updatedCats.push({
          category: newTx.category,
          annualTotal: newTx.amount,
          monthly: newMonthly,
        });
      }

      const newTotalExpense =
        newTx.type === 'expense' ? prev.totalExpense + newTx.amount : prev.totalExpense;
      const newTotalIncome =
        newTx.type === 'income' ? prev.totalIncome + newTx.amount : prev.totalIncome;

      return {
        ...prev,
        categories: updatedCats,
        totalExpense: newTotalExpense,
        totalIncome: newTotalIncome,
      };
    });

    const gasUrl = typeof window !== 'undefined' ? localStorage.getItem('smart_money_gas_url') : null;
    let currentAuthToken = accessToken || getSavedToken() || null;

    if (isRealGoogleConnected && !currentAuthToken && !gasUrl) {
      if (
        confirm(
          `Google 로그인 세션(1시간 유효)이 만료되어 현재 읽기 전용 상태입니다.\n\n지금 바로 Google 로그인으로 재인증하여 [${targetSheetTitle}] 시트에 즉시 기록할까요?\n([취소]를 누르면 기기에 임시 보관됩니다.)`
        )
      ) {
        try {
          const loginRes = await googleSignIn();
          if (loginRes?.accessToken) {
            currentAuthToken = loginRes.accessToken;
            setAccessToken(loginRes.accessToken);
            setUser(loginRes.user);
          }
        } catch (loginErr) {
          console.warn('Inline re-login warning:', loginErr);
        }
      }
    }

    const canWriteToGoogle = Boolean(currentAuthToken || gasUrl);

    if (!canWriteToGoogle) {
      if (isRealGoogleConnected) {
        setSyncToast({
          show: true,
          type: 'error',
          message: `⚠️ Google 인증이 만료되어 [${targetSheetTitle}] 시트에 아직 전송되지 않았습니다. 상단 빨간 배너의 [구글 시트로 지금 즉시 내보내기]로 전송해 주세요.`,
        });
      } else {
        setSyncToast({
          show: true,
          type: 'info',
          message: `가계부에 저장되었습니다 (${targetSheetTitle})`,
        });
      }
      const id = `local-${Date.now()}`;
      const createdTx: Transaction = {
        ...newTx,
        id,
        createdAt: newTx.createdAt || Date.now(),
        sheetTitle: targetSheetTitle,
      };
      if (createdTx.subItems && createdTx.subItems.length > 0) {
        saveSubItemsForTransaction(createdTx, createdTx.subItems);
      }
      setPendingSyncList((prev) => {
        const next = [createdTx, ...prev.filter((p) => p.id !== createdTx.id)];
        try {
          localStorage.setItem(PENDING_SYNC_STORAGE_KEY, JSON.stringify(next));
        } catch (e) {
          console.warn('Could not save pending sync list:', e);
        }
        return next;
      });
      setTransactions((prev) => {
        const list = [createdTx, ...prev];
        return list.sort((a, b) => b.date.localeCompare(a.date));
      });
      setActiveSheetTitle(targetSheetTitle);
      return;
    }

    // Real Google Mode with active accessToken or Apps Script Web App: Write directly to Google Sheets immediately!
    try {
      if (newTx.subItems && newTx.subItems.length > 0) {
        saveSubItemsForTransaction(
          { ...newTx, sheetTitle: targetSheetTitle },
          newTx.subItems
        );
      }

      const appendRes = await appendTransactionRow(
        spreadsheetId,
        targetSheetTitle,
        analysis.mapping,
        newTx,
        currentAuthToken
      );

      if (newTx.subItems && newTx.subItems.length > 0 && appendRes?.rowIndex) {
        saveSubItemsForTransaction(
          { ...newTx, id: `${targetSheetTitle}-r${appendRes.rowIndex}`, sheetTitle: targetSheetTitle },
          newTx.subItems
        );
      }

      // Successfully synced: clear from pending queue if present
      setPendingSyncList((prev) => {
        const next = prev.filter(
          (p) => !(p.date === newTx.date && p.amount === newTx.amount && p.description === newTx.description)
        );
        try {
          localStorage.setItem(PENDING_SYNC_STORAGE_KEY, JSON.stringify(next));
        } catch (e) {
          console.warn('Could not update pending list:', e);
        }
        return next;
      });

      setSyncToast({
        show: true,
        type: 'success',
        message: currentAuthToken
          ? appendRes.sorted
            ? `✅ Google 시트 [${targetSheetTitle}] 탭에 날짜순으로 정렬 삽입되었습니다!`
            : `✅ Google 시트 [${targetSheetTitle}] 탭 ${appendRes.rowIndex}행에 즉시 반영되었습니다!`
          : `⚡ [Apps Script] 구글 시트 [${targetSheetTitle}] 탭에 실시간 저장되었습니다!`,
      });

      // Reload to ensure real-time synchronization and correct row indices
      setActiveSheetTitle(targetSheetTitle);
      await loadSheetData(spreadsheetId, targetSheetTitle, currentAuthToken, {
        explicitTabSelection: true,
      });
    } catch (err: any) {
      console.error('Google Sheets append error:', err);
      // If token expired, prompt re-login and auto-retry immediately!
      if (err?.message?.includes('AUTH_EXPIRED') || String(err).includes('AUTH_EXPIRED') || isAuthExpiredError(err)) {
        setAccessToken(null);
        try {
          if (confirm(`Google 인증 세션이 만료되어 [${targetSheetTitle}] 시트 전송이 대기되었습니다.\n지금 다시 로그인하여 시트에 즉시 기록하시겠습니까?`)) {
            const loginRes = await googleSignIn();
            if (loginRes?.accessToken) {
              setAccessToken(loginRes.accessToken);
              setUser(loginRes.user);
              if (newTx.subItems && newTx.subItems.length > 0) {
                saveSubItemsForTransaction(
                  { ...newTx, sheetTitle: targetSheetTitle },
                  newTx.subItems
                );
              }
              const retryRes = await appendTransactionRow(
                spreadsheetId,
                targetSheetTitle,
                analysis.mapping,
                newTx,
                loginRes.accessToken
              );
              if (newTx.subItems && newTx.subItems.length > 0 && retryRes?.rowIndex) {
                saveSubItemsForTransaction(
                  { ...newTx, id: `${targetSheetTitle}-r${retryRes.rowIndex}`, sheetTitle: targetSheetTitle },
                  newTx.subItems
                );
              }
              setSyncToast({
                show: true,
                type: 'success',
                message: `✅ 구글 계정 인증 갱신 완료! [${targetSheetTitle}] 탭에 즉시 반영되었습니다!`,
              });
              await loadSheetData(spreadsheetId, targetSheetTitle, loginRes.accessToken);
              return;
            }
          }
        } catch (retryErr) {
          console.warn('Auto re-login retry notice:', retryErr);
        }
      }

      // If still not sent, keep safe in pending sync queue & local transactions state
      const id = `local-${Date.now()}`;
      const createdTx: Transaction = {
        ...newTx,
        id,
        createdAt: newTx.createdAt || Date.now(),
        sheetTitle: targetSheetTitle,
      };
      if (createdTx.subItems && createdTx.subItems.length > 0) {
        saveSubItemsForTransaction(createdTx, createdTx.subItems);
      }
      setPendingSyncList((prev) => {
        const next = [createdTx, ...prev.filter((p) => p.id !== createdTx.id)];
        try {
          localStorage.setItem(PENDING_SYNC_STORAGE_KEY, JSON.stringify(next));
        } catch (e) {
          console.warn('Could not save pending sync list:', e);
        }
        return next;
      });
      setTransactions((prev) => [createdTx, ...prev]);

      setSyncToast({
        show: true,
        type: 'error',
        message: `구글 시트 연동 실패: 데이터는 기기(로컬)에 안전하게 보관되었습니다. [구글 시트로 보내기]로 동기화할 수 있습니다.`,
      });
    }
  };

  // Edit Transaction Handler - syncs directly to Google Sheets with real-time feedback
  const handleEditTransaction = async (tx: Transaction) => {
    let targetSheet = tx.sheetTitle || activeSheetTitle;
    if (sheetTabs && sheetTabs.length > 0) {
      const direct = sheetTabs.find((t) => t.title === targetSheet);
      if (!direct) {
        const m = extractMonthNumberFromTab(targetSheet);
        if (m !== null) {
          const matched = findTabForMonth(sheetTabs, m);
          if (matched) targetSheet = matched.title;
        }
      }
    }

    // Snappy optimistic local state update
    setTransactions((prev) => prev.map((t) => (t.id === tx.id ? tx : t)));
    saveSubItemsForTransaction(tx, tx.subItems || []);

    const gasUrl = typeof window !== 'undefined' ? localStorage.getItem('smart_money_gas_url') : null;
    const canWriteToGoogle = Boolean(accessToken || gasUrl);

    if (isRealGoogleConnected && !canWriteToGoogle) {
      setSyncToast({
        show: true,
        type: 'error',
        message: '시트에 수정 내용을 반영하려면 Google 로그인 또는 Apps Script 연동이 필요합니다.',
      });
      return;
    }

    if (!canWriteToGoogle || !tx.rowIndex) {
      return;
    }

    try {
      await updateTransactionRow(
        spreadsheetId,
        targetSheet,
        tx.rowIndex,
        analysis.mapping,
        tx,
        accessToken
      );
      setSyncToast({
        show: true,
        type: 'success',
        message: gasUrl
          ? `⚡ [Apps Script] 구글 시트 [${targetSheet}] ${tx.rowIndex}행 수정이 실시간 반영되었습니다.`
          : `✅ Google 시트 [${targetSheet}] ${tx.rowIndex}행 수정이 즉시 반영되었습니다.`,
      });
      // Reload to ensure perfect synchronization with Google Sheets
      await loadSheetData(spreadsheetId, activeSheetTitle, accessToken);
    } catch (e: any) {
      console.error('Google Sheets update error:', e);
      // Auto-refresh token if expired and retry
      if (e?.message?.includes('AUTH_EXPIRED') || String(e).includes('AUTH_EXPIRED')) {
        try {
          const newToken = await refreshGoogleToken();
          if (newToken) {
            setAccessToken(newToken);
            await updateTransactionRow(
              spreadsheetId,
              targetSheet,
              tx.rowIndex,
              analysis.mapping,
              tx,
              newToken
            );
            setSyncToast({
              show: true,
              type: 'success',
              message: `✅ 세션이 자동 갱신되어 [${targetSheet}] 수정이 반영되었습니다.`,
            });
            await loadSheetData(spreadsheetId, activeSheetTitle, newToken);
            return;
          }
        } catch (retryErr) {
          console.warn('Auto refresh retry failed:', retryErr);
        }
      }

      setSyncToast({
        show: true,
        type: 'error',
        message: `Google 시트 수정 알림: 로컬에 우선 수정 반영되었습니다.`,
      });
    }
  };

  // Delete Transaction Handler - directly deletes from Google Sheets with real-time feedback
  const handleDeleteTransaction = async (tx: Transaction) => {
    let targetSheet = tx.sheetTitle || activeSheetTitle;
    let targetSheetTab = sheetTabs.find((s) => s.title === targetSheet);
    if (!targetSheetTab) {
      const m = extractMonthNumberFromTab(targetSheet);
      if (m !== null) {
        targetSheetTab = findTabForMonth(sheetTabs, m);
        if (targetSheetTab) targetSheet = targetSheetTab.title;
      }
    }

    // Optimistically remove from local transactions
    setTransactions((prev) => prev.filter((t) => t.id !== tx.id));

    const gasUrl = typeof window !== 'undefined' ? localStorage.getItem('smart_money_gas_url') : null;
    const canWriteToGoogle = Boolean(accessToken || gasUrl);

    if (isRealGoogleConnected && !canWriteToGoogle) {
      setSyncToast({
        show: true,
        type: 'error',
        message: '시트에서 삭제하려면 Google 로그인 또는 Apps Script 연동이 필요합니다.',
      });
      return;
    }

    if (!canWriteToGoogle || !tx.rowIndex || !targetSheetTab) {
      return;
    }

    try {
      await deleteTransactionRow(
        spreadsheetId,
        targetSheetTab.id,
        tx.rowIndex,
        accessToken,
        targetSheet
      );
      setSyncToast({
        show: true,
        type: 'success',
        message: gasUrl
          ? `⚡ [Apps Script] 구글 시트 [${targetSheet}] ${tx.rowIndex}행이 즉시 삭제되었습니다.`
          : `✅ Google 시트 [${targetSheet}] ${tx.rowIndex}행이 즉시 삭제되었습니다.`,
      });
      // Reload to recalculate indices and verify sheet state
      await loadSheetData(spreadsheetId, activeSheetTitle, accessToken);
    } catch (e: any) {
      console.error('Google Sheets delete error:', e);
      // Auto-refresh token if expired and retry
      if (e?.message?.includes('AUTH_EXPIRED') || String(e).includes('AUTH_EXPIRED')) {
        try {
          const newToken = await refreshGoogleToken();
          if (newToken) {
            setAccessToken(newToken);
            await deleteTransactionRow(
              spreadsheetId,
              targetSheetTab.id,
              tx.rowIndex,
              newToken,
              targetSheet
            );
            setSyncToast({
              show: true,
              type: 'success',
              message: `✅ 세션이 자동 갱신되어 [${targetSheet}] 삭제가 반영되었습니다.`,
            });
            await loadSheetData(spreadsheetId, activeSheetTitle, newToken);
            return;
          }
        } catch (retryErr) {
          console.warn('Auto refresh retry failed:', retryErr);
        }
      }

      setSyncToast({
        show: true,
        type: 'error',
        message: `Google 시트 행 삭제 알림: 로컬에서 정상 삭제되었습니다.`,
      });
    }
  };

  // Batch Delete Handler - directly deletes selected rows from Google Sheets
  const handleBatchDeleteTransactions = async (txs: Transaction[]) => {
    const targetSheetTab = sheetTabs.find((s) => s.title === activeSheetTitle);

    const idSet = new Set(txs.map((t) => t.id));
    setTransactions((prev) => prev.filter((t) => !idSet.has(t.id)));

    if (isRealGoogleConnected && !accessToken) {
      setSyncToast({
        show: true,
        type: 'error',
        message: '시트에서 일괄 삭제하려면 Google 로그인이 필요합니다.',
      });
      return;
    }

    if (!isRealGoogleConnected || !accessToken || !targetSheetTab) {
      return;
    }

    try {
      const rowIndices = txs
        .map((t) => t.rowIndex)
        .filter((r): r is number => typeof r === 'number' && r > 0);

      if (rowIndices.length > 0) {
        await deleteMultipleTransactionRows(
          spreadsheetId,
          targetSheetTab.id,
          rowIndices,
          accessToken
        );
        setSyncToast({
          show: true,
          type: 'success',
          message: `✅ Google 시트 [${activeSheetTitle}] ${rowIndices.length}건이 즉시 삭제되었습니다.`,
        });
      }
      await loadSheetData(spreadsheetId, activeSheetTitle, accessToken);
    } catch (e: any) {
      console.error('Google Sheets batch delete error:', e);
      if (e?.message?.includes('AUTH_EXPIRED') || isAuthExpiredError(e)) {
        try {
          const newToken = await refreshGoogleToken();
          if (newToken) {
            setAccessToken(newToken);
            const rowIndices = txs
              .map((t) => t.rowIndex)
              .filter((r): r is number => typeof r === 'number' && r > 0);
            if (rowIndices.length > 0 && targetSheetTab) {
              await deleteMultipleTransactionRows(
                spreadsheetId,
                targetSheetTab.id,
                rowIndices,
                newToken
              );
              setSyncToast({
                show: true,
                type: 'success',
                message: `✅ 세션이 갱신되어 [${activeSheetTitle}] ${rowIndices.length}건이 삭제되었습니다.`,
              });
              await loadSheetData(spreadsheetId, activeSheetTitle, newToken);
              return;
            }
          }
        } catch (retryErr) {
          console.warn('Batch delete retry failed:', retryErr);
        }
      }
      setSyncToast({
        show: true,
        type: 'error',
        message: `Google 시트 일괄 삭제 실패: ${e?.message || e}`,
      });
      throw e;
    }
  };

  // Batch Category Update Handler - updates category of selected transactions and syncs to Google Sheets
  const handleBatchUpdateCategory = async (txs: Transaction[], newCategory: string) => {
    if (!newCategory || txs.length === 0) return;
    const idSet = new Set(txs.map((t) => t.id));

    // 1. Optimistic local state update (Immediate reflection in UI)
    setTransactions((prev) =>
      prev.map((t) => (idSet.has(t.id) ? { ...t, category: newCategory } : t))
    );

    // Also update in pendingSyncList if present
    setPendingSyncList((prev) =>
      prev.map((t) => (idSet.has(t.id) ? { ...t, category: newCategory } : t))
    );

    const gasUrl = typeof window !== 'undefined' ? localStorage.getItem('smart_money_gas_url') : null;
    const canWriteToGoogle = Boolean(accessToken || gasUrl);

    if (isRealGoogleConnected && !canWriteToGoogle) {
      setSyncToast({
        show: true,
        type: 'error',
        message: '시트에 수정 내용을 반영하려면 Google 로그인 또는 Apps Script 연동이 필요합니다.',
      });
      return;
    }

    if (!canWriteToGoogle || !spreadsheetId) {
      setSyncToast({
        show: true,
        type: 'success',
        message: `✅ ${txs.length}건의 카테고리가 [${newCategory}](으)로 변경되었습니다.`,
      });
      return;
    }

    try {
      let currentToken = accessToken;
      const validTxs = txs.filter((t) => typeof t.rowIndex === 'number' && t.rowIndex > 0);
      const catColIdx = analysis?.mapping?.categoryCol ?? 2;

      if (currentToken && validTxs.length > 0 && catColIdx >= 0) {
        const rowsPayload = validTxs.map((t) => ({
          sheetTitle: t.sheetTitle || activeSheetTitle,
          rowIndex: t.rowIndex!,
        }));
        try {
          await batchUpdateTransactionsCategoryInSheet({
            spreadsheetId,
            defaultSheetTitle: activeSheetTitle,
            categoryColIndex: catColIdx,
            rows: rowsPayload,
            newCategory,
            accessToken: currentToken,
          });
        } catch (batchErr: any) {
          if (batchErr?.message?.includes('AUTH_EXPIRED') || String(batchErr).includes('AUTH_EXPIRED')) {
            const newToken = await refreshGoogleToken();
            if (newToken) {
              currentToken = newToken;
              setAccessToken(newToken);
              await batchUpdateTransactionsCategoryInSheet({
                spreadsheetId,
                defaultSheetTitle: activeSheetTitle,
                categoryColIndex: catColIdx,
                rows: rowsPayload,
                newCategory,
                accessToken: newToken,
              });
            }
          } else {
            throw batchErr;
          }
        }
      } else {
        for (const tx of validTxs) {
          const txSheet = tx.sheetTitle || activeSheetTitle;
          await updateTransactionRow(
            spreadsheetId,
            txSheet,
            tx.rowIndex!,
            analysis.mapping,
            { ...tx, category: newCategory },
            currentToken
          );
        }
      }

      setSyncToast({
        show: true,
        type: 'success',
        message: `✅ Google 시트에 ${txs.length}건의 카테고리가 [${newCategory}](으)로 일괄 변경되었습니다!`,
      });

      try {
        await loadSheetData(spreadsheetId, activeSheetTitle, currentToken);
      } catch (reloadErr) {
        console.warn('Post-update reload warning:', reloadErr);
      }
    } catch (e: any) {
      console.error('Batch category update error:', e);
      setSyncToast({
        show: true,
        type: 'info',
        message: `로컬 화면에서 ${txs.length}건의 카테고리가 [${newCategory}](으)로 변경되었습니다.`,
      });
    }
  };

  // Batch Add Transactions Handler (supports both single-month recurring import & multi-month/multi-year card installments)
  const handleBatchAddTransactions = async (
    newTxs: Array<Omit<Transaction, 'id' | 'rowIndex'> & { sheetTitle?: string }>
  ) => {
    if (!newTxs || newTxs.length === 0) return;

    const resolvedItems = newTxs.map((tx, idx) => {
      const { targetSheetTitle, monthNum } = resolveTargetTabForTx(tx);
      return { tx, sheetTitle: targetSheetTitle, monthNum, idx };
    });

    // Update YearDashboardData across all affected months
    setYearData((prev: YearDashboardData) => {
      let updatedCats = prev.categories.map((cat) => ({
        ...cat,
        monthly: [...cat.monthly],
      }));
      let totalExpense = prev.totalExpense;
      let totalIncome = prev.totalIncome;

      resolvedItems.forEach(({ tx, monthNum }) => {
        const mIdx = Math.min(11, Math.max(0, monthNum - 1));
        let found = false;
        updatedCats = updatedCats.map((cat) => {
          if (cat.category === tx.category) {
            found = true;
            cat.monthly[mIdx] = (cat.monthly[mIdx] || 0) + tx.amount;
            cat.annualTotal += tx.amount;
          }
          return cat;
        });
        if (!found) {
          const monthly = new Array(12).fill(0);
          monthly[mIdx] = tx.amount;
          updatedCats.push({
            category: tx.category,
            annualTotal: tx.amount,
            monthly,
          });
        }
        if (tx.type === 'expense') totalExpense += tx.amount;
        else if (tx.type === 'income') totalIncome += tx.amount;
      });

      return {
        ...prev,
        categories: updatedCats,
        totalExpense,
        totalIncome,
      };
    });

    // Clear stale AnnualMatrixView month cache entries for affected months
    if (typeof window !== 'undefined' && spreadsheetId) {
      try {
        const cacheKey = `smart_money_annual_month_cache_${spreadsheetId}`;
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          resolvedItems.forEach(({ monthNum }) => {
            if (parsed && parsed[monthNum]) {
              delete parsed[monthNum];
            }
          });
          localStorage.setItem(cacheKey, JSON.stringify(parsed));
        }
      } catch {
        // Ignore cache cleanup errors
      }
    }

    const groupedByTab = new Map<string, Array<Omit<Transaction, 'id' | 'rowIndex'> & { sheetTitle?: string }>>();
    resolvedItems.forEach(({ tx, sheetTitle }) => {
      const list = groupedByTab.get(sheetTitle) || [];
      list.push({ ...tx, sheetTitle });
      groupedByTab.set(sheetTitle, list);
    });

    const isMultiMonthBatch = groupedByTab.size > 1;

    // Local optimistic update (only inject into active view or all if local mode)
    const createdList: Transaction[] = resolvedItems.map(({ tx, sheetTitle, idx }) => ({
      ...tx,
      id: `batch-${Date.now()}-${idx}`,
      sheetTitle,
      createdAt: tx.createdAt || Date.now() + idx,
    }));

    const gasUrl = typeof window !== 'undefined' ? localStorage.getItem('smart_money_gas_url') : null;
    const canWriteToGoogle = Boolean(accessToken || gasUrl);

    if (isRealGoogleConnected && !canWriteToGoogle) {
      setTransactions((prev) => [
        ...createdList.filter((c) => !isMultiMonthBatch || c.sheetTitle === activeSheetTitle),
        ...prev,
      ]);
      setSyncToast({
        show: true,
        type: 'error',
        message: '시트에 내역을 일괄 등록하려면 Google 로그인 또는 Apps Script 연동이 필요합니다.',
      });
      return;
    }

    if (!canWriteToGoogle || !spreadsheetId) {
      setPendingSyncList((prev) => {
        const next = [...createdList, ...prev];
        try {
          localStorage.setItem(PENDING_SYNC_STORAGE_KEY, JSON.stringify(next));
        } catch (e) {
          console.warn('Could not save pending sync list:', e);
        }
        return next;
      });
      setTransactions((prev) => [...createdList, ...prev]);
      const tabNames = Array.from(groupedByTab.keys()).join(', ');
      setSyncToast({
        show: true,
        type: 'info',
        message: isMultiMonthBatch
          ? `💳 할부 내역 ${createdList.length}건이 ${tabNames}에 자동 등록되었습니다.`
          : `📋 ${createdList.length}건이 등록되었습니다.`,
      });
      return;
    }

    setTransactions((prev) => [
      ...createdList.filter((c) => !isMultiMonthBatch || c.sheetTitle === activeSheetTitle),
      ...prev,
    ]);

    try {
      for (const [tabTitle, groupTxs] of groupedByTab.entries()) {
        await appendBatchTransactions(
          spreadsheetId,
          tabTitle,
          analysis.mapping,
          groupTxs,
          accessToken
        );
      }

      const tabNames = Array.from(groupedByTab.keys());
      setSyncToast({
        show: true,
        type: 'success',
        message: isMultiMonthBatch
          ? `✅ Google 시트 ${tabNames.length}개 월(${tabNames.join(', ')})에 총 ${newTxs.length}건의 할부 내역이 자동 등록되었습니다!`
          : `✅ Google 시트 [${tabNames[0]}] 탭에 ${newTxs.length}건이 일괄 등록되었습니다!`,
      });

      const targetReloadTab = isMultiMonthBatch ? activeSheetTitle : tabNames[0];
      if (!isMultiMonthBatch) {
        setActiveSheetTitle(targetReloadTab);
      }
      await loadSheetData(spreadsheetId, targetReloadTab, accessToken);
    } catch (err: any) {
      console.error('Batch add error:', err);
      setSyncToast({
        show: true,
        type: 'error',
        message: `Google 시트 일괄 등록 실패: ${err?.message || err}`,
      });
      throw err;
    }
  };

  // Batch Copy & Paste Handler - duplicate single/multiple transactions to target month/date
  const handleBatchCopyPaste = async (params: {
    items: Transaction[];
    targetMonth: string;
    dateMode: 'keep_day' | 'today' | 'custom';
    customDate?: string;
    includeSubItems: boolean;
    keepRecurringType: boolean;
  }) => {
    const { items, targetMonth, dateMode, customDate, includeSubItems, keepRecurringType } = params;
    if (!items || items.length === 0) return;

    // Resolve target month number
    const monthNumMatch = targetMonth.match(/(?:^|[^0-9])0*(\d{1,2})월/);
    const targetMonthNum = monthNumMatch ? parseInt(monthNumMatch[1], 10) : 11;

    // Today YYYY-MM-DD
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Resolve target tab title in spreadsheet (respects unified yearly mode)
    const targetSampleDate =
      dateMode === 'custom' && customDate
        ? customDate
        : `${Number(activeYear) || now.getFullYear()}-${String(targetMonthNum).padStart(2, '0')}-01`;
    const { targetSheetTitle } = resolveTargetTabForTx({
      date: targetSampleDate,
      sheetTitle: targetMonth,
    });

    // Build new transactions
    const newTransactions: Array<Omit<Transaction, 'id' | 'rowIndex'> & { sheetTitle?: string }> = items.map(
      (item, idx) => {
        let finalDate = todayStr;
        if (dateMode === 'custom' && customDate) {
          finalDate = customDate;
        } else if (dateMode === 'keep_day') {
          const parts = item.date ? item.date.split('-') : [];
          const origYear = parts[0] || String(now.getFullYear());
          const origDay = parts.length >= 3 ? parseInt(parts[2], 10) : 1;
          const maxDays = new Date(parseInt(origYear, 10), targetMonthNum, 0).getDate();
          const clampedDay = Math.min(Math.max(1, origDay), maxDays);
          finalDate = `${origYear}-${String(targetMonthNum).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
        } else {
          finalDate = todayStr;
        }

        const clonedSubItems =
          includeSubItems && item.subItems && item.subItems.length > 0
            ? item.subItems.map((s, sIdx) => ({
                ...s,
                id: `copy-sub-${Date.now()}-${idx}-${sIdx}`,
              }))
            : [];

        return {
          date: finalDate,
          type: item.type,
          category: item.category || '기타',
          description: item.description,
          amount: item.amount,
          paymentMethod: item.paymentMethod,
          memo: item.memo,
          isRecurring: keepRecurringType ? Boolean(item.isRecurring) : false,
          isSpecial: keepRecurringType ? Boolean(item.isSpecial) : false,
          subItems: clonedSubItems,
          createdAt: Date.now() + idx,
          sheetTitle: targetSheetTitle,
        };
      }
    );

    // Update YearDashboardData (Matrix)
    const monthIndex = targetMonthNum - 1;
    setYearData((prev: YearDashboardData) => {
      let updatedCats = [...prev.categories];
      let addedExpense = 0;
      let addedIncome = 0;

      newTransactions.forEach((tx) => {
        if (tx.type === 'expense') addedExpense += tx.amount;
        if (tx.type === 'income') addedIncome += tx.amount;

        const catIdx = updatedCats.findIndex((c) => c.category === tx.category);
        if (catIdx >= 0) {
          const currentMonthly = [...updatedCats[catIdx].monthly];
          currentMonthly[monthIndex] = (currentMonthly[monthIndex] || 0) + tx.amount;
          updatedCats[catIdx] = {
            ...updatedCats[catIdx],
            monthly: currentMonthly,
            annualTotal: updatedCats[catIdx].annualTotal + tx.amount,
          };
        } else {
          const newMonthly = new Array(12).fill(0);
          newMonthly[monthIndex] = tx.amount;
          updatedCats.push({
            category: tx.category,
            annualTotal: tx.amount,
            monthly: newMonthly,
          });
        }
      });

      return {
        ...prev,
        categories: updatedCats,
        totalExpense: prev.totalExpense + addedExpense,
        totalIncome: prev.totalIncome + addedIncome,
      };
    });

    const gasUrl = typeof window !== 'undefined' ? localStorage.getItem('smart_money_gas_url') : null;
    const canWriteToGoogle = Boolean(accessToken || gasUrl);

    if (!canWriteToGoogle) {
      const createdList: Transaction[] = newTransactions.map((tx, idx) => ({
        ...tx,
        id: `local-copy-${Date.now()}-${idx}`,
        sheetTitle: targetSheetTitle,
      }));

      createdList.forEach((tx) => {
        if (tx.subItems && tx.subItems.length > 0) {
          saveSubItemsForTransaction(tx, tx.subItems);
        }
      });

      setPendingSyncList((prev) => {
        const next = [...createdList, ...prev];
        try {
          localStorage.setItem(PENDING_SYNC_STORAGE_KEY, JSON.stringify(next));
        } catch (e) {
          console.warn('Could not save pending copy list:', e);
        }
        return next;
      });

      if (targetSheetTitle === activeSheetTitle) {
        setTransactions((prev) => {
          const list = [...createdList, ...prev];
          return list.sort((a, b) => b.date.localeCompare(a.date));
        });
      } else {
        setActiveSheetTitle(targetSheetTitle);
        setTransactions((prev) => {
          const list = [...createdList, ...prev];
          return list.sort((a, b) => b.date.localeCompare(a.date));
        });
      }

      setSyncToast({
        show: true,
        type: 'info',
        message: `📋 ${createdList.length}건의 내역이 [${targetSheetTitle}]에 복사되어 보관되었습니다.`,
      });
      return;
    }

    try {
      await appendBatchTransactions(
        spreadsheetId,
        targetSheetTitle,
        analysis.mapping,
        newTransactions,
        accessToken
      );

      newTransactions.forEach((tx, idx) => {
        if (tx.subItems && tx.subItems.length > 0) {
          saveSubItemsForTransaction(
            { ...tx, id: `copy-synced-${Date.now()}-${idx}` } as Transaction,
            tx.subItems
          );
        }
      });

      setSyncToast({
        show: true,
        type: 'success',
        message: `✅ Google 시트 [${targetSheetTitle}] 탭에 ${newTransactions.length}건의 내역이 복사되어 실시간 반영되었습니다!`,
      });

      setActiveSheetTitle(targetSheetTitle);
      await loadSheetData(spreadsheetId, targetSheetTitle, accessToken);
    } catch (err: any) {
      console.error('Batch copy error:', err);
      setSyncToast({
        show: true,
        type: 'error',
        message: `Google 시트 일괄 복사 실패: ${err?.message || err}`,
      });
      throw err;
    }
  };

  // Add Month Tab in Google Sheets
  const handleAddMonthTab = async (monthName: string) => {
    if (!isRealGoogleConnected || !accessToken) return;
    try {
      const headers = analysis.mapping.detectedHeaders.length > 0
        ? analysis.mapping.detectedHeaders
        : ['날짜', '구분', '분류', '내용', '금액', '결제수단', '메모'];

      const newTab = await addMonthlySheetTab(spreadsheetId, monthName, headers, accessToken);
      setSheetTabs((prev) => [...prev, { id: newTab.sheetId, title: newTab.title }]);
      setActiveSheetTitle(monthName);
      await loadSheetData(spreadsheetId, monthName, accessToken);
    } catch (e: any) {
      alert(`시트 탭 생성 실패: ${e?.message}`);
    }
  };

  // Update Manual Column Mapping
  const handleUpdateMapping = (newMapping: ColumnMapping) => {
    setAnalysis((prev) => ({
      ...prev,
      mapping: newMapping,
    }));
  };

  // Import directly pasted rows/columns from Excel or Sheets
  const handleImportPastedData = (sheetTitle: string, rows: string[][]) => {
    const result = analyzeSheetStructure(
      'pasted-sheet',
      '사용자 직접 등록 가계부',
      [{ id: 1, title: sheetTitle }],
      sheetTitle,
      rows
    );
    setSpreadsheetId('pasted-sheet');
    setSpreadsheetTitle('사용자 직접 등록 가계부');
    setSpreadsheetUrl(undefined);
    setSheetTabs([{ id: 1, title: sheetTitle }]);
    setActiveSheetTitle(sheetTitle);
    setAnalysis(result.analysis);
    setTransactions(result.transactions);
  };

  // Category & Payment Method Handlers
  const handleUpdateCategories = (newCats: CategoryItem[]) => {
    setCustomCategories(newCats);
    saveCategories(newCats);
  };

  const handleUpdatePaymentMethods = (newMethods: PaymentMethodItem[]) => {
    setCustomPaymentMethods(newMethods);
    savePaymentMethods(newMethods);
  };

  const handleResetCategoryDefaults = () => {
    const defaultCats = getDefaultCategories(analysis.detectedCategories.map((c) => c.name));
    const defaultMethods = getDefaultPaymentMethods(analysis.detectedPaymentMethods);
    setCustomCategories(defaultCats);
    saveCategories(defaultCats);
    setCustomPaymentMethods(defaultMethods);
    savePaymentMethods(defaultMethods);
  };

  const [isCreatingSettingsTab, setIsCreatingSettingsTab] = useState(false);
  const hasSettingsTab = Boolean(findSettingsTab(sheetTabs));

  const handleQuickCreateSettingsTab = async () => {
    let currentToken = accessToken || (await getAccessToken());

    if (!currentToken) {
      if (confirm('현재 구글 시트에 [분류설정] 탭을 생성하고 저장하려면 Google 로그인이 필요합니다.\n지금 로그인하시겠습니까?')) {
        const loginRes = await googleSignIn();
        if (loginRes?.accessToken) {
          currentToken = loginRes.accessToken;
          setAccessToken(currentToken);
        } else {
          return;
        }
      } else {
        return;
      }
    }

    if (!isRealGoogleConnected) {
      if (confirm('현재 샘플 2026 가계부를 사용 중입니다.\n내 구글 드라이브에 실제 [스마트 만년 가계부] (2026 통합 시트)를 생성하시겠습니까?\n(📊 연도별 요약, 2026, ⚙️ 분류설정, 📖 사용설명서 탭이 자동으로 포함됩니다)')) {
        try {
          setIsCreatingSettingsTab(true);
          const { createGoogleSheetWithTemplate } = await import('./services/templateGenerator');
          const res = await createGoogleSheetWithTemplate(currentToken, 2026, customCategories, customPaymentMethods, '스마트 만년 가계부');
          handleSelectSpreadsheet(res.spreadsheetId, '스마트 만년 가계부', currentToken);
          setSyncToast({
            show: true,
            type: 'success',
            message: '구글 드라이브에 [스마트 만년 가계부] 시트가 성공적으로 생성되었습니다!',
          });
        } catch (e: any) {
          alert(`시트 생성 실패: ${e?.message || e}`);
        } finally {
          setIsCreatingSettingsTab(false);
        }
      }
      return;
    }

    try {
      setIsCreatingSettingsTab(true);
      let res;
      try {
        res = await syncCategoriesToGoogleSheet(
          spreadsheetId,
          currentToken,
          customCategories,
          customPaymentMethods,
          sheetTabs
        );
      } catch (firstErr: any) {
        if (isAuthExpiredError(firstErr)) {
          // Token expired, prompt re-authentication and auto-retry!
          if (confirm('Google 인증 세션이 만료되었습니다.\n다시 로그인하여 현재 2026 시트에 [분류설정] 탭 생성을 계속하시겠습니까?')) {
            const loginRes = await googleSignIn();
            if (loginRes?.accessToken) {
              currentToken = loginRes.accessToken;
              setAccessToken(currentToken);
              res = await syncCategoriesToGoogleSheet(
                spreadsheetId,
                currentToken,
                customCategories,
                customPaymentMethods,
                sheetTabs
              );
            } else {
              return;
            }
          } else {
            return;
          }
        } else {
          throw firstErr;
        }
      }

      // Refresh sheet tabs
      const meta = await getSpreadsheetDetails(spreadsheetId, currentToken);
      const newTabs = meta.sheets.map((s) => ({ id: s.id, title: s.title }));
      setSheetTabs(newTabs);

      setSyncToast({
        show: true,
        type: 'success',
        message: `현재 2026 구글 시트에 '${res.tabTitle}' 탭이 생성되고 모든 분류/결제수단이 저장되었습니다!`,
      });
    } catch (err: any) {
      if (isAuthExpiredError(err)) {
        if (confirm('Google 계정 인증이 만료되었습니다.\n지금 다시 로그인하여 진행하시겠습니까?')) {
          try {
            const loginRes = await googleSignIn();
            if (loginRes?.accessToken) {
              setAccessToken(loginRes.accessToken);
              const retryRes = await syncCategoriesToGoogleSheet(
                spreadsheetId,
                loginRes.accessToken,
                customCategories,
                customPaymentMethods,
                sheetTabs
              );
              const meta = await getSpreadsheetDetails(spreadsheetId, loginRes.accessToken);
              setSheetTabs(meta.sheets.map((s) => ({ id: s.id, title: s.title })));
              setSyncToast({
                show: true,
                type: 'success',
                message: `현재 2026 구글 시트에 '${retryRes.tabTitle}' 탭이 생성되고 분류/결제수단이 저장되었습니다!`,
              });
              return;
            }
          } catch (reErr) {
            console.warn('Re-auth error:', reErr);
          }
        }
      } else {
        alert(`시트 탭 생성 오류: ${err?.message || err}`);
      }
    } finally {
      setIsCreatingSettingsTab(false);
    }
  };

  const [isSyncingPending, setIsSyncingPending] = useState(false);

  const handleSyncPendingToGoogle = async () => {
    if (pendingSyncList.length === 0) return;

    let currentToken = accessToken || (await getAccessToken());
    if (!currentToken) {
      if (confirm('구글 드라이브 시트에 미반영 내역을 전송하려면 Google 로그인이 필요합니다.\n지금 로그인하시겠습니까?')) {
        const loginRes = await googleSignIn();
        if (loginRes?.accessToken) {
          currentToken = loginRes.accessToken;
          setAccessToken(currentToken);
        } else {
          return;
        }
      } else {
        return;
      }
    }

    try {
      setIsSyncingPending(true);
      setSyncToast({
        show: true,
        type: 'info',
        message: `구글 시트에 ${pendingSyncList.length}건의 대기 내역을 전송하는 중...`,
      });

      let successCount = 0;
      const failedItems: Transaction[] = [];

      for (const tx of pendingSyncList) {
        // Resolve target sheet tab for this transaction's year/month
        const { targetSheetTitle } = resolveTargetTabForTx(tx);

        try {
          await appendTransactionRow(
            spreadsheetId,
            targetSheetTitle,
            analysis.mapping,
            tx,
            currentToken
          );
          successCount++;
        } catch (rowErr: any) {
          if (isAuthExpiredError(rowErr)) {
            const reLogin = await googleSignIn();
            if (reLogin?.accessToken) {
              currentToken = reLogin.accessToken;
              setAccessToken(currentToken);
              await appendTransactionRow(
                spreadsheetId,
                targetSheetTitle,
                analysis.mapping,
                tx,
                currentToken
              );
              successCount++;
            } else {
              failedItems.push(tx);
              break;
            }
          } else {
            console.warn(`Row append warning for ${tx.description}:`, rowErr);
            failedItems.push(tx);
          }
        }
      }

      // Update pending list with only failed items
      setPendingSyncList(failedItems);
      localStorage.setItem(PENDING_SYNC_STORAGE_KEY, JSON.stringify(failedItems));

      // Reload metadata and active sheet
      const meta = await getSpreadsheetDetails(spreadsheetId, currentToken);
      setSheetTabs(meta.sheets.map((s) => ({ id: s.id, title: s.title })));
      await loadSheetData(spreadsheetId, activeSheetTitle, currentToken);

      if (successCount > 0) {
        setSyncToast({
          show: true,
          type: 'success',
          message: `✅ 구글 시트에 ${successCount}건의 미반영 내역이 즉시 동기화되었습니다!`,
        });
      }
      if (failedItems.length > 0) {
        alert(`${failedItems.length}건의 내역 전송에 실패했습니다. 다시 시도해 주세요.`);
      }
    } catch (e: any) {
      alert(`구글 시트 일괄 전송 실패: ${e?.message || e}`);
    } finally {
      setIsSyncingPending(false);
    }
  };

  // One-click Export all transactions of the active month into a dedicated tab in Google Sheets
  const [isExportingMonth, setIsExportingMonth] = useState(false);

  const handleExportCurrentMonthToGoogleSheets = async () => {
    if (!isRealGoogleConnected || !spreadsheetId) {
      alert('Google 시트가 연동되어 있지 않습니다.');
      return;
    }
    const token = accessToken || (await getAccessToken());
    if (!token) {
      if (confirm('Google 인증이 만료되었습니다. 다시 로그인하시겠습니까?')) {
        await handleLogin();
      }
      return;
    }

    // Filter transactions belonging to current active sheet month
    const curMonthNum = extractMonthNumberFromTab(activeSheetTitle);
    const monthTxs = transactions.filter((t) => {
      const m = extractMonthNumberFromTab(t.sheetTitle || t.date);
      return (
        t.sheetTitle === activeSheetTitle ||
        (m !== null && curMonthNum !== null && m === curMonthNum)
      );
    });

    const targetList = monthTxs.length > 0 ? monthTxs : transactions;

    if (
      !confirm(
        `현재 화면의 ${targetList.length}건 내역을 구글 드라이브 스프레드시트의 [${activeSheetTitle}] 탭에 생성 및 일괄 저장하시겠습니까?\n(이미 존재하는 탭이면 최신 내역으로 갱신됩니다)`
      )
    ) {
      return;
    }

    setIsExportingMonth(true);
    try {
      const result = await exportMonthTransactionsToSheet(
        spreadsheetId,
        activeSheetTitle,
        targetList,
        token
      );

      setSyncToast({
        show: true,
        type: 'success',
        message: `🎉 구글 시트 [${result.sheetTitle}] 탭에 ${result.count}건이 완벽하게 저장되었습니다!`,
      });

      // Reload metadata so the new tab is recognized in sheetTabs
      const meta = await getSpreadsheetDetails(spreadsheetId, token);
      if (meta && meta.sheets) {
        setSheetTabs(meta.sheets.map((s) => ({ id: s.id, title: s.title })));
      }
      await loadSheetData(spreadsheetId, activeSheetTitle, token);
    } catch (err: any) {
      console.error('Export month transactions error:', err);
      if (err?.message?.includes('AUTH_EXPIRED') || isAuthExpiredError(err)) {
        if (confirm('Google 인증이 만료되었습니다. 다시 로그인하여 즉시 전송하시겠습니까?')) {
          const res = await googleSignIn();
          if (res?.accessToken) {
            setAccessToken(res.accessToken);
            await exportMonthTransactionsToSheet(
              spreadsheetId,
              activeSheetTitle,
              targetList,
              res.accessToken
            );
            setSyncToast({
              show: true,
              type: 'success',
              message: `🎉 구글 시트 [${activeSheetTitle}] 탭에 ${targetList.length}건이 완벽하게 저장되었습니다!`,
            });
            const meta = await getSpreadsheetDetails(spreadsheetId, res.accessToken);
            if (meta && meta.sheets) {
              setSheetTabs(meta.sheets.map((s) => ({ id: s.id, title: s.title })));
            }
            await loadSheetData(spreadsheetId, activeSheetTitle, res.accessToken);
          }
        }
      } else {
        alert(`구글 시트 저장 실패: ${err?.message || err}`);
      }
    } finally {
      setIsExportingMonth(false);
    }
  };

  // One-click Migrate & Split columns in Google Sheets (지출유형, 세부품목, 비고 분리 & 5000번대 행 정리)
  const [isMigratingColumns, setIsMigratingColumns] = useState(false);

  const handleMigrateSheetColumns = async () => {
    if (!isRealGoogleConnected || !spreadsheetId) {
      alert('Google 시트가 연동되어 있지 않습니다.');
      return;
    }
    const token = accessToken || (await getAccessToken());
    if (!token) {
      if (confirm('Google 인증이 필요합니다. 로그인하시겠습니까?')) {
        await handleLogin();
      }
      return;
    }

    if (
      !confirm(
        `구글 시트 [${activeSheetTitle}] 탭의 컬럼을 분리 정리하시겠습니까?\n\n` +
        `• [지출유형], [세부품목], [비고] 컬럼이 별도로 분리 생성됩니다.\n` +
        `• 비고의 [정기예산]/[특별지출]은 '정'/'특'으로 지출유형에 자동 분류됩니다.\n` +
        `• 비고의 세부품목은 [세부품목] 전용 컬럼으로 분리되고 순수 메모만 비고에 남습니다.\n` +
        `• 5000번대 행 등에 흩어져 있던 항목들이 1번 행 아래로 깔끔하게 압축 정렬됩니다.`
      )
    ) {
      return;
    }

    setIsMigratingColumns(true);
    try {
      setSyncToast({
        show: true,
        type: 'info',
        message: `구글 시트 [${activeSheetTitle}] 컬럼 분리 및 정리 중...`,
      });

      const res = await migrateSheetColumns(spreadsheetId, activeSheetTitle, token);

      setSyncToast({
        show: true,
        type: 'success',
        message: `✨ 구글 시트 [${activeSheetTitle}] 탭 ${res.count}건 컬럼 분리 및 정리 완료!`,
      });

      await loadSheetData(spreadsheetId, activeSheetTitle, token);
    } catch (err: any) {
      console.error('Column migration error:', err);
      if (err?.message?.includes('AUTH_EXPIRED') || isAuthExpiredError(err)) {
        if (confirm('Google 인증이 만료되었습니다. 다시 로그인하여 진행하시겠습니까?')) {
          const loginRes = await googleSignIn();
          if (loginRes?.accessToken) {
            setAccessToken(loginRes.accessToken);
            const res = await migrateSheetColumns(spreadsheetId, activeSheetTitle, loginRes.accessToken);
            setSyncToast({
              show: true,
              type: 'success',
              message: `✨ 구글 시트 [${activeSheetTitle}] 탭 ${res.count}건 컬럼 분리 및 정리 완료!`,
            });
            await loadSheetData(spreadsheetId, activeSheetTitle, loginRes.accessToken);
          }
        }
      } else {
        alert(`시트 컬럼 분리 실패: ${err?.message || err}`);
      }
    } finally {
      setIsMigratingColumns(false);
    }
  };

  // 연도 통합 · 데이터 이관 및 1월~12월 전체 시트 일괄 컬럼 분리
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);
  const [migrationModalInitialTab, setMigrationModalInitialTab] = useState<'consolidate' | 'import_external' | 'columns_only'>('consolidate');
  const [isMigratingAllMonths, setIsMigratingAllMonths] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<{
    month: string;
    index: number;
    total: number;
    message: string;
  } | null>(null);
  const [migrationResults, setMigrationResults] = useState<MonthMigrationResult[] | null>(null);
  const [totalMigratedTxs, setTotalMigratedTxs] = useState<number>(0);

  const handleOpenMigrationWithTab = useCallback(
    (tab: 'consolidate' | 'import_external' | 'columns_only' = 'consolidate') => {
      setMigrationModalInitialTab(tab);
      setIsMigrationModalOpen(true);
    },
    []
  );

  const ensureValidTokenOrLogin = useCallback(async (): Promise<string | null> => {
    let token = accessToken || (await getAccessToken());
    if (!token) {
      if (confirm('구글 시트 데이터 이관을 진행하려면 Google 로그인이 필요합니다.\n지금 로그인하시겠습니까?')) {
        const loginRes = await googleSignIn();
        if (loginRes?.accessToken) {
          token = loginRes.accessToken;
          setAccessToken(token);
          return token;
        }
      }
      return null;
    }
    return token;
  }, [accessToken]);

  const handleConsolidateCurrentFile = useCallback(
    async (
      params: {
        targetYear: number;
        targetTabTitle: string;
        mergeWithExisting: boolean;
        newSpreadsheetTitle?: string;
        oldMonthTabsAction: OldMonthTabsAction;
        createSummaryTab: boolean;
      },
      onProgress: (info: { index: number; total: number; message: string }) => void
    ): Promise<ConsolidationResult | null> => {
      if (!isRealGoogleConnected || !spreadsheetId) {
        alert('Google 시트가 연동되어 있지 않습니다.');
        return null;
      }
      let token = await ensureValidTokenOrLogin();
      if (!token) return null;

      const applyPostConsolidation = async (res: ConsolidationResult, usedToken: string) => {
        setStoredLayoutMode(spreadsheetId, 'yearly');
        if (res.renamedTitle) {
          setSpreadsheetTitle(res.renamedTitle);
          try {
            localStorage.setItem('smart_money_spreadsheet_title', res.renamedTitle);
          } catch {}
        }
        const meta = await getSpreadsheetDetails(spreadsheetId, usedToken);
        if (meta?.sheets) {
          setSheetTabs(meta.sheets.map((s) => ({ id: s.id, title: s.title, hidden: s.hidden })));
        }
        if (meta?.title) {
          setSpreadsheetTitle(meta.title);
          try {
            localStorage.setItem('smart_money_spreadsheet_title', meta.title);
          } catch {}
        }
        await loadSheetData(spreadsheetId, res.targetTabTitle, usedToken);
        setSyncToast({
          show: true,
          type: 'success',
          message: `✨ 구글 시트 [${res.targetTabTitle}] 만년 가계부 전환 완료! (${res.totalRowsWritten}건 정리${res.summaryTabCreated ? ' · 연도별 요약 탭 생성' : ''})`,
        });
      };

      try {
        const res = await consolidateMonthsIntoYearTab({
          spreadsheetId,
          targetYear: params.targetYear,
          targetTabTitle: params.targetTabTitle,
          mergeWithExistingTarget: params.mergeWithExisting,
          newSpreadsheetTitle: params.newSpreadsheetTitle,
          oldMonthTabsAction: params.oldMonthTabsAction,
          createSummaryTab: params.createSummaryTab,
          accessToken: token,
          onProgress,
        });

        await applyPostConsolidation(res, token);
        return res;
      } catch (err: any) {
        if (isAuthExpiredError(err) || err?.message?.includes('AUTH_EXPIRED')) {
          if (confirm('Google 계정 인증이 만료되었습니다. 다시 로그인하여 계속 진행하시겠습니까?')) {
            const loginRes = await googleSignIn();
            if (loginRes?.accessToken) {
              setAccessToken(loginRes.accessToken);
              const res = await consolidateMonthsIntoYearTab({
                spreadsheetId,
                targetYear: params.targetYear,
                targetTabTitle: params.targetTabTitle,
                mergeWithExistingTarget: params.mergeWithExisting,
                newSpreadsheetTitle: params.newSpreadsheetTitle,
                oldMonthTabsAction: params.oldMonthTabsAction,
                createSummaryTab: params.createSummaryTab,
                accessToken: loginRes.accessToken,
                onProgress,
              });
              await applyPostConsolidation(res, loginRes.accessToken);
              return res;
            }
          }
          return null;
        }
        throw err;
      }
    },
    [isRealGoogleConnected, spreadsheetId, ensureValidTokenOrLogin, loadSheetData]
  );

  const handleCleanupLegacyMonthTabs = useCallback(
    async (action: 'hide' | 'delete'): Promise<number> => {
      if (!isRealGoogleConnected || !spreadsheetId) {
        throw new Error('Google 시트가 연동되어 있지 않습니다.');
      }
      let token = await ensureValidTokenOrLogin();
      if (!token) return 0;

      const runCleanup = async (usedToken: string) => {
        const result = await organizePerpetualSheetStructure({
          spreadsheetId,
          accessToken: usedToken,
          oldMonthTabsAction: action,
        });
        const meta = await getSpreadsheetDetails(spreadsheetId, usedToken);
        if (meta?.sheets) {
          setSheetTabs(meta.sheets.map((s) => ({ id: s.id, title: s.title, hidden: s.hidden })));
        }
        setSyncToast({
          show: true,
          type: 'success',
          message:
            action === 'delete'
              ? `🗑️ 기존 월별 시트 ${result.handledMonthTabsCount}개를 구글 시트에서 완전히 삭제했습니다.`
              : `👁️ 기존 월별 시트 ${result.handledMonthTabsCount}개를 숨김 처리했습니다.`,
        });
        return result.handledMonthTabsCount;
      };

      try {
        return await runCleanup(token);
      } catch (err: any) {
        if (isAuthExpiredError(err) || err?.message?.includes('AUTH_EXPIRED')) {
          const loginRes = await googleSignIn();
          if (loginRes?.accessToken) {
            setAccessToken(loginRes.accessToken);
            return await runCleanup(loginRes.accessToken);
          }
          return 0;
        }
        throw err;
      }
    },
    [isRealGoogleConnected, spreadsheetId, ensureValidTokenOrLogin]
  );

  const handleInspectExternalFile = useCallback(
    async (params: {
      sourceSpreadsheetId: string;
      targetYear: number;
      previewTabTitle?: string;
      importOptions?: ExternalImportOptions;
    }): Promise<ExternalSpreadsheetInspection | null> => {
      let token = await ensureValidTokenOrLogin();
      if (!token) return null;

      try {
        return await inspectExternalSpreadsheetForImport({
          sourceSpreadsheetId: params.sourceSpreadsheetId,
          targetYear: params.targetYear,
          accessToken: token,
          previewTabTitle: params.previewTabTitle,
          importOptions: params.importOptions,
        });
      } catch (err: any) {
        if (isAuthExpiredError(err) || err?.message?.includes('AUTH_EXPIRED')) {
          const loginRes = await googleSignIn();
          if (loginRes?.accessToken) {
            setAccessToken(loginRes.accessToken);
            return await inspectExternalSpreadsheetForImport({
              sourceSpreadsheetId: params.sourceSpreadsheetId,
              targetYear: params.targetYear,
              accessToken: loginRes.accessToken,
              previewTabTitle: params.previewTabTitle,
              importOptions: params.importOptions,
            });
          }
          return null;
        }
        throw err;
      }
    },
    [ensureValidTokenOrLogin]
  );

  const handleImportExternalFile = useCallback(
    async (
      params: {
        sourceSpreadsheetId?: string;
        preloadedSourceTitle?: string;
        preloadedTabsData?: Array<{ title: string; rows: string[][] }>;
        selectedTabTitles?: string[];
        importOptions?: ExternalImportOptions;
        targetYear: number;
        targetTabTitle: string;
        mergeWithExisting: boolean;
      },
      onProgress: (info: { index: number; total: number; message: string }) => void
    ): Promise<ImportExternalYearResult | null> => {
      if (!isRealGoogleConnected || !spreadsheetId) {
        throw new Error('Google 시트가 연동되어 있지 않습니다. 먼저 상단에서 Google 로그인 및 시트를 연결해 주세요.');
      }
      let token = await ensureValidTokenOrLogin();
      if (!token) return null;

      try {
        const res = await importExternalSpreadsheetToYearTab({
          targetSpreadsheetId: spreadsheetId,
          sourceSpreadsheetId: params.sourceSpreadsheetId,
          preloadedSourceTitle: params.preloadedSourceTitle,
          preloadedTabsData: params.preloadedTabsData,
          selectedTabTitles: params.selectedTabTitles,
          importOptions: params.importOptions,
          targetYear: params.targetYear,
          targetTabTitle: params.targetTabTitle,
          mergeWithExisting: params.mergeWithExisting,
          accessToken: token,
          onProgress,
        });

        setStoredLayoutMode(spreadsheetId, 'yearly');
        const meta = await getSpreadsheetDetails(spreadsheetId, token);
        if (meta?.sheets) {
          setSheetTabs(meta.sheets.map((s) => ({ id: s.id, title: s.title, hidden: s.hidden })));
        }
        setSyncToast({
          show: true,
          type: 'success',
          message: `🎉 '${res.sourceSpreadsheetTitle}' → [${res.targetTabTitle}] 탭으로 ${res.totalRowsWritten}건 이관 및 요약 시트 반영 완료!`,
        });
        return res;
      } catch (err: any) {
        if (isAuthExpiredError(err) || err?.message?.includes('AUTH_EXPIRED')) {
          if (confirm('Google 계정 인증이 만료되었습니다. 다시 로그인하여 이관을 계속하시겠습니까?')) {
            const loginRes = await googleSignIn();
            if (loginRes?.accessToken) {
              setAccessToken(loginRes.accessToken);
              const res = await importExternalSpreadsheetToYearTab({
                targetSpreadsheetId: spreadsheetId,
                sourceSpreadsheetId: params.sourceSpreadsheetId,
                preloadedSourceTitle: params.preloadedSourceTitle,
                preloadedTabsData: params.preloadedTabsData,
                selectedTabTitles: params.selectedTabTitles,
                importOptions: params.importOptions,
                targetYear: params.targetYear,
                targetTabTitle: params.targetTabTitle,
                mergeWithExisting: params.mergeWithExisting,
                accessToken: loginRes.accessToken,
                onProgress,
              });
              setStoredLayoutMode(spreadsheetId, 'yearly');
              const meta = await getSpreadsheetDetails(spreadsheetId, loginRes.accessToken);
              if (meta?.sheets) {
                setSheetTabs(meta.sheets.map((s) => ({ id: s.id, title: s.title, hidden: s.hidden })));
              }
              return res;
            }
          }
          return null;
        }
        throw err;
      }
    },
    [isRealGoogleConnected, spreadsheetId, ensureValidTokenOrLogin]
  );

  const handleRunMigrationAllMonths = async () => {
    if (!isRealGoogleConnected || !spreadsheetId) {
      alert('Google 시트가 연동되어 있지 않습니다.');
      return;
    }
    let token = accessToken || (await getAccessToken());
    if (!token) {
      if (confirm('Google 인증이 필요합니다. 로그인하시겠습니까?')) {
        const loginRes = await googleSignIn();
        if (loginRes?.accessToken) {
          token = loginRes.accessToken;
          setAccessToken(token);
        } else {
          return;
        }
      } else {
        return;
      }
    }

    setIsMigratingAllMonths(true);
    setMigrationResults(null);
    setMigrationProgress({
      month: '1월',
      index: 0,
      total: 12,
      message: `${activeYear}년 전체 시트 마이그레이션 준비 중...`,
    });

    try {
      const outcome = await migrateAllMonthSheetsColumns(
        spreadsheetId,
        token,
        (info) => {
          setMigrationProgress(info);
        }
      );

      setMigrationResults(outcome.results);
      setTotalMigratedTxs(outcome.totalMigratedTxs);

      // Reload metadata and current sheet data
      const meta = await getSpreadsheetDetails(spreadsheetId, token);
      if (meta?.sheets) {
        setSheetTabs(meta.sheets.map((s) => ({ id: s.id, title: s.title })));
      }
      await loadSheetData(spreadsheetId, activeSheetTitle, token);

      setSyncToast({
        show: true,
        type: 'success',
        message: `🎉 ${activeYear}년 1월~12월 전체 시트 컬럼 분리 완료! (총 ${outcome.totalMigratedTxs}건 정리됨)`,
      });
    } catch (err: any) {
      console.error('All months migration error:', err);
      if (isAuthExpiredError(err)) {
        if (confirm('Google 계정 인증이 만료되었습니다. 다시 로그인하여 진행하시겠습니까?')) {
          const loginRes = await googleSignIn();
          if (loginRes?.accessToken) {
            setAccessToken(loginRes.accessToken);
            const outcome = await migrateAllMonthSheetsColumns(
              spreadsheetId,
              loginRes.accessToken,
              (info) => {
                setMigrationProgress(info);
              }
            );
            setMigrationResults(outcome.results);
            setTotalMigratedTxs(outcome.totalMigratedTxs);
            const meta = await getSpreadsheetDetails(spreadsheetId, loginRes.accessToken);
            if (meta?.sheets) {
              setSheetTabs(meta.sheets.map((s) => ({ id: s.id, title: s.title })));
            }
            await loadSheetData(spreadsheetId, activeSheetTitle, loginRes.accessToken);
            setSyncToast({
              show: true,
              type: 'success',
              message: `🎉 ${activeYear}년 1월~12월 전체 시트 컬럼 분리 완료! (총 ${outcome.totalMigratedTxs}건 정리됨)`,
            });
          }
        }
      } else {
        alert(`전체 시트 변환 오류: ${err?.message || err}`);
      }
    } finally {
      setIsMigratingAllMonths(false);
    }
  };

  // Auto-sync when returning to tab from Google Sheets web/app
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isRealGoogleConnected && accessToken) {
        loadSheetData(spreadsheetId, activeSheetTitle, accessToken);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [isRealGoogleConnected, accessToken, spreadsheetId, activeSheetTitle, loadSheetData]);

  const hasGasWebApp =
    typeof window !== 'undefined' && Boolean(localStorage.getItem('smart_money_gas_url'));
  const isLiveWritable = Boolean((isRealGoogleConnected && accessToken) || hasGasWebApp);

  const handleOpenSettings = (tab: 'sheet' | 'categories' | 'advanced' = 'sheet') => {
    setSettingsInitialTab(tab);
    setIsSettingsModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased flex flex-col">
      {/* Global Header */}
      <Header
        user={user}
        spreadsheetTitle={spreadsheetTitle}
        sheetTabs={sheetTabs}
        activeSheetTitle={activeSheetTitle}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        onSelectSheet={handleSelectSheetTab}
        onOpenQuickInput={() => setIsInputModalOpen(true)}
        onOpenSettings={handleOpenSettings}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onRefreshData={() => {
          if (isRealGoogleConnected && accessToken) {
            loadSheetData(spreadsheetId, activeSheetTitle, accessToken);
          }
        }}
        isRefreshing={isLoadingData}
        isLoggingIn={isLoggingIn}
        isSheetLinked={isRealGoogleConnected}
        isLiveWritable={isLiveWritable}
        activeYear={activeYear}
        yearlySheets={yearlySheets}
        onSelectYearSheet={handleSelectYearSheet}
        onSelectYearTab={handleSelectYearTab}
        isYearlyUnifiedMode={isYearlyUnifiedMode}
        hasSettingsAttention={Boolean(
          isRealGoogleConnected && (!hasSettingsTab || needsPerpetualUpgrade)
        )}
      />

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-5 space-y-4">
        {/* Auth Guidance Banner — Shown ONLY when user is not logged in, sheet not linked, or auth expired */}
        {!isLiveWritable && (
          <div
            className={`px-3.5 py-2.5 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2.5 ${
              isRealGoogleConnected && !accessToken
                ? 'bg-amber-50 border-amber-200 text-amber-950'
                : 'bg-blue-50/80 border-blue-200 text-slate-800'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <ShieldAlert
                className={`w-4 h-4 shrink-0 ${
                  isRealGoogleConnected && !accessToken ? 'text-amber-600' : 'text-blue-600'
                }`}
              />
              <div className="min-w-0">
                {!user ? (
                  <p className="font-semibold text-slate-900">
                    Google 로그인이 필요합니다.{' '}
                    <span className="font-normal text-slate-600">
                      로그인하면 내 구글 시트와 실시간으로 자동 저장됩니다.
                    </span>
                  </p>
                ) : !isRealGoogleConnected ? (
                  <p className="font-semibold text-slate-900">
                    연동할 구글 시트를 선택해 주세요.{' '}
                    <span className="font-normal text-slate-600">
                      내 Google 드라이브의 가계부 시트를 선택하면 즉시 동기화됩니다.
                    </span>
                  </p>
                ) : (
                  <p className="font-semibold text-amber-950">
                    Google 인증이 만료되어 읽기 전용 상태입니다.{' '}
                    <span className="font-normal text-amber-800">
                      다시 로그인하면 입력·수정·삭제가 시트에 즉시 반영됩니다.
                    </span>
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!user ? (
                <>
                  <button
                    type="button"
                    onClick={handleLogin}
                    disabled={isLoggingIn}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-60"
                  >
                    {isLoggingIn ? '로그인 중...' : 'Google 로그인'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPickerOpen(true)}
                    className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
                  >
                    시트 직접 연결
                  </button>
                </>
              ) : !isRealGoogleConnected ? (
                <button
                  type="button"
                  onClick={() => setIsPickerOpen(true)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  구글 시트 선택
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-60"
                >
                  {isLoggingIn ? '인증 중...' : 'Google 다시 로그인'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Unsynced Local Data Notice & One-Click Push (Shown only if pending items exist) */}
        {pendingSyncList.length > 0 && (
          <div className="bg-rose-50/90 border border-rose-300 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                  <UploadCloud className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-rose-950">
                    구글 시트에 아직 전송되지 않은 내역 {pendingSyncList.length}건이 대기 중입니다
                  </h4>
                  <p className="text-xs text-rose-800 mt-0.5">
                    인증 만료 또는 네트워크 오류로 로컬에 안전하게 보관 중입니다. 버튼을 누르면 시트로 즉시 저장됩니다.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSyncPendingToGoogle}
                disabled={isSyncingPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-50 shrink-0 self-end sm:self-auto"
              >
                {isSyncingPending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <UploadCloud className="w-3.5 h-3.5" />
                )}
                <span>시트로 즉시 전송 ({pendingSyncList.length}건)</span>
              </button>
            </div>

            <div className="bg-white rounded-lg p-3 border border-rose-200 divide-y divide-rose-100 max-h-44 overflow-y-auto">
              <div className="text-[11px] font-bold text-rose-800 pb-2 px-1 flex justify-between items-center">
                <span>전송 대기 목록 ({pendingSyncList.length}건)</span>
                <span className="tabular-nums">
                  총 {pendingSyncList.reduce((acc, cur) => acc + (cur.amount || 0), 0).toLocaleString()}원
                </span>
              </div>
              {pendingSyncList.map((tx, idx) => (
                <div key={tx.id || idx} className="py-2 px-1 flex items-center justify-between text-xs text-slate-700 gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-semibold text-rose-700 text-[11px] shrink-0 tabular-nums">
                      {tx.date || '날짜 미지정'}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] shrink-0 font-medium">
                      {tx.category}
                    </span>
                    <span className="truncate font-medium text-slate-800">{tx.description}</span>
                  </div>
                  <span className="font-bold text-rose-900 shrink-0 ml-2 tabular-nums">
                    {tx.amount?.toLocaleString()}원
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error Notice */}
        {errorNotice && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-medium">{errorNotice}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {(errorNotice.includes('도메인') || errorNotice.includes('unauthorized-domain')) && (
                <button
                  type="button"
                  onClick={() => setIsDomainAuthModalOpen(true)}
                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>도메인 승인 방법</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setErrorNotice(null)}
                className="text-xs font-bold text-rose-600 hover:underline cursor-pointer px-1 py-0.5"
              >
                닫기
              </button>
            </div>
          </div>
        )}

        {/* Mobile / Tablet View Switcher (Desktop uses Header center nav) */}
        <div className="flex lg:hidden items-center p-1 bg-slate-200/70 rounded-xl w-full">
          <button
            type="button"
            onClick={() => setActiveTab('matrix')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === 'matrix'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>연간 매트릭스</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('monthly')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === 'monthly'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>월별 가계부</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('comparison')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === 'comparison'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>연도별 비교</span>
          </button>
        </div>

        {/* Full Width Main Display Area */}
        <div className="w-full space-y-6">
          {activeTab === 'matrix' ? (
            <AnnualMatrixView
              yearData={yearData}
              onSelectMonth={handleSelectSheetTab}
              transactions={transactions}
              activeSheetTitle={activeSheetTitle}
              onEditTransaction={handleEditTransaction}
              analysis={analysis}
              spreadsheetTitle={spreadsheetTitle}
              customCategories={customCategories}
              customPaymentMethods={customPaymentMethods}
              onAddCustomCategory={handleAddCustomCategory}
              onAddCustomPaymentMethod={handleAddCustomPaymentMethod}
              onOpenCategoryManager={() => setIsCategoryModalOpen(true)}
              spreadsheetId={spreadsheetId}
              accessToken={accessToken}
              sheetTabs={sheetTabs}
              isRealGoogleConnected={isRealGoogleConnected}
              onFetchMonthTransactions={handleFetchMonthTransactions}
            />
          ) : activeTab === 'monthly' ? (
            <Dashboard
              transactions={(() => {
                const list = [...transactions];
                pendingSyncList.forEach((p) => {
                  const exists = list.some(
                    (t) =>
                      t.id === p.id ||
                      (t.date === p.date && t.amount === p.amount && t.description === p.description)
                  );
                  if (!exists) {
                    list.unshift(p);
                  }
                });
                return list;
              })()}
              activeSheetTitle={activeSheetTitle}
              sheetTabs={sheetTabs}
              onSelectSheetTab={handleSelectSheetTab}
              onEditTransaction={handleEditTransaction}
              onDeleteTransaction={handleDeleteTransaction}
              onBatchDeleteTransactions={handleBatchDeleteTransactions}
              onAddTransaction={handleAddTransaction}
              isRealGoogleConnected={Boolean(isRealGoogleConnected && accessToken)}
              analysis={analysis}
              spreadsheetTitle={spreadsheetTitle}
              availableCategories={customCategories.filter((c) => c.isVisible).map((c) => c.name)}
              availablePaymentMethods={customPaymentMethods.filter((p) => p.isVisible).map((p) => p.name)}
              customCategories={customCategories}
              customPaymentMethods={customPaymentMethods}
              onOpenCategoryManager={() => setIsCategoryModalOpen(true)}
              onAddCustomCategory={handleAddCustomCategory}
              onAddCustomPaymentMethod={handleAddCustomPaymentMethod}
              onExportCurrentMonthToGoogleSheets={handleExportCurrentMonthToGoogleSheets}
              isExportingMonth={isExportingMonth}
              onMigrateSheetColumns={handleMigrateSheetColumns}
              isMigratingColumns={isMigratingColumns}
              onOpenMigrationAllMonthsModal={() => handleOpenMigrationWithTab('consolidate')}
              onBatchCopyPaste={handleBatchCopyPaste}
              onBatchUpdateCategory={handleBatchUpdateCategory}
              onOpenQuickImportModal={() => {
                setOpenImportOnModal(true);
                setIsInputModalOpen(true);
              }}
              spreadsheetId={spreadsheetId}
              onFetchMonthTransactions={handleFetchMonthTransactions}
              yearData={yearData}
              isYearlyUnifiedMode={isYearlyUnifiedMode}
            />
          ) : (
            <YearComparisonView
              spreadsheetId={spreadsheetId}
              spreadsheetTitle={spreadsheetTitle}
              sheetTabs={sheetTabs}
              activeSheetTitle={activeSheetTitle}
              activeYear={activeYear}
              transactions={transactions}
              yearlySheets={yearlySheets}
              accessToken={accessToken}
              isRealGoogleConnected={isRealGoogleConnected}
              customCategories={customCategories}
              onOpenMigrationImport={() => handleOpenMigrationWithTab('import_external')}
              onSelectYearTabOrSheet={(source) => {
                if (source.yearTabTitle) {
                  handleSelectYearTab(source.yearTabTitle);
                  setActiveTab('monthly');
                } else if (source.externalId) {
                  handleSelectYearSheet({
                    year: String(source.year),
                    id: source.externalId,
                    title: source.externalTitle || `${source.year} 가계부`,
                  });
                }
              }}
            />
          )}
        </div>
      </main>

      {/* Floating Real-time Sync Toast Notification */}
      {syncToast?.show && (
        <div className="fixed top-5 right-5 z-50 animate-in slide-in-from-top-3 fade-in duration-200 max-w-sm sm:max-w-md">
          <div
            className={`px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-2.5 text-xs font-bold ${
              syncToast.type === 'success'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-600/20'
                : syncToast.type === 'error'
                ? 'bg-rose-600 text-white border-rose-500 shadow-rose-600/20'
                : 'bg-blue-600 text-white border-blue-500 shadow-blue-600/20'
            }`}
          >
            {syncToast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="leading-snug flex-1">{syncToast.message}</span>
            <button
              onClick={() => setSyncToast(null)}
              className="ml-2 hover:opacity-75 cursor-pointer text-white/90 text-sm font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Floating Quick Action for Mobile */}
      <div className="fixed bottom-5 right-5 lg:hidden z-40">
        <button
          onClick={() => {
            setOpenImportOnModal(false);
            setIsInputModalOpen(true);
          }}
          className="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-600/40 flex items-center justify-center active:scale-95 transition cursor-pointer font-black"
          title="가계부 빠른 입력"
        >
          <Plus className="w-7 h-7" />
        </button>
      </div>

      {/* Quick Input Modal (Popup at top of screen) */}
      {isInputModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-xs p-4 pt-10 sm:pt-14 animate-in fade-in duration-200 overflow-y-auto">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border-2 border-slate-300 overflow-hidden my-auto">
            <ExpenseInputForm
              analysis={analysis}
              activeSheetTitle={activeSheetTitle}
              spreadsheetTitle={spreadsheetTitle}
              spreadsheetId={spreadsheetId}
              isRealGoogleConnected={Boolean(
                isRealGoogleConnected &&
                  (accessToken ||
                    (typeof window !== 'undefined' && localStorage.getItem('smart_money_gas_url')))
              )}
              onAddTransaction={handleAddTransaction}
              onBatchAddTransactions={handleBatchAddTransactions}
              sheetTabs={sheetTabs}
              onFetchMonthTransactions={handleFetchMonthTransactions}
              initialOpenImport={openImportOnModal}
              onClose={() => {
                setIsInputModalOpen(false);
                setOpenImportOnModal(false);
              }}
              isModal={true}
              customCategories={customCategories}
              customPaymentMethods={customPaymentMethods}
              transactions={transactions}
              onAddCustomCategory={handleAddCustomCategory}
              onAddCustomPaymentMethod={handleAddCustomPaymentMethod}
              onOpenCategoryManager={() => {
                setIsInputModalOpen(false);
                setOpenImportOnModal(false);
                setIsCategoryModalOpen(true);
              }}
              isYearlyUnifiedMode={isYearlyUnifiedMode}
            />
          </div>
        </div>
      )}

      {/* Spreadsheet Picker Modal */}
      <SpreadsheetPickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        accessToken={accessToken}
        currentSpreadsheetId={spreadsheetId}
        onSelectSpreadsheet={handleSelectSpreadsheet}
        onImportPastedData={handleImportPastedData}
      />

      {/* Multi-Year Sheet Registry Modal */}
      <RegisterYearSheetModal
        isOpen={isRegisterYearModalOpen}
        onClose={() => setIsRegisterYearModalOpen(false)}
        accessToken={accessToken}
        currentYear={activeYear}
        registeredYears={yearlySheets}
        onRegisterYearSheet={handleRegisterYearSheet}
      />

      {/* Category & Payment Method Management Modal */}
      <CategoryManagementModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={customCategories}
        paymentMethods={customPaymentMethods}
        onUpdateCategories={handleUpdateCategories}
        onUpdatePaymentMethods={handleUpdatePaymentMethods}
        onResetToDefaults={handleResetCategoryDefaults}
        spreadsheetId={spreadsheetId}
        spreadsheetTitle={spreadsheetTitle}
        sheetTabs={sheetTabs}
        accessToken={accessToken}
        isRealGoogleConnected={isRealGoogleConnected}
        onShowToast={(msg, type) => {
          setSyncToast({
            show: true,
            type: type || 'info',
            message: msg,
          });
        }}
        onSpreadsheetCreated={(newId, newTitle) => {
          handleSelectSpreadsheet(newId, newTitle, accessToken ?? undefined);
        }}
        onTabsUpdated={(newTabs) => {
          setSheetTabs(newTabs);
        }}
        onLogin={handleLogin}
      />

      {/* GitHub Repository Setup & Deployment Modal */}
      <GitHubModal isOpen={isGitHubOpen} onClose={() => setIsGitHubOpen(false)} />

      {/* Workspace Safety Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        details={confirmConfig.details}
        isDestructive={confirmConfig.isDestructive}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Firebase Domain Authorization Guidance & Token Fallback Modal */}
      <DomainAuthModal
        isOpen={isDomainAuthModalOpen}
        onClose={() => setIsDomainAuthModalOpen(false)}
        onRetryLogin={handleLogin}
        onTokenApplied={(token) => {
          setAccessToken(token);
          setSyncToast({
            show: true,
            type: 'success',
            message: '액세스 토큰이 성공적으로 적용되었습니다! 실시간 시트 쓰기가 가능합니다.',
          });
        }}
      />

      {/* 연도 통합 · 데이터 이관 및 컬럼 정리 통합 모달 */}
      <UnifiedMigrationModal
        isOpen={isMigrationModalOpen}
        onClose={() => setIsMigrationModalOpen(false)}
        initialTab={migrationModalInitialTab}
        spreadsheetId={spreadsheetId}
        spreadsheetTitle={spreadsheetTitle}
        spreadsheetUrl={spreadsheetUrl}
        sheetTabs={sheetTabs}
        accessToken={accessToken}
        isRealGoogleConnected={Boolean(isRealGoogleConnected && accessToken)}
        activeYear={activeYear}
        onLogin={handleLogin}
        onConsolidateCurrentFile={handleConsolidateCurrentFile}
        onCleanupLegacyMonthTabs={handleCleanupLegacyMonthTabs}
        onInspectExternalFile={handleInspectExternalFile}
        onImportExternalFile={handleImportExternalFile}
        availableCategories={customCategories.filter((c) => c.isVisible).map((c) => c.name)}
        onRunColumnsMigration={handleRunMigrationAllMonths}
        isMigratingColumns={isMigratingAllMonths}
        columnsProgress={migrationProgress}
        columnsResults={migrationResults}
        totalMigratedColumnTxs={totalMigratedTxs}
        onSwitchToYearTab={(tabTitle) => {
          setIsMigrationModalOpen(false);
          handleSelectYearTab(tabTitle);
          setActiveTab('monthly');
        }}
        onOpenComparisonView={() => {
          setIsMigrationModalOpen(false);
          setActiveTab('comparison');
        }}
        isSheetLinked={isRealGoogleConnected}
        onOpenSpreadsheetPicker={() => {
          setIsMigrationModalOpen(false);
          setIsPickerOpen(true);
        }}
      />

      {/* Unified Settings & Sheet Management Hub Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        initialTab={settingsInitialTab}
        user={user}
        accessToken={accessToken}
        isRealGoogleConnected={isRealGoogleConnected}
        isLoggingIn={isLoggingIn}
        spreadsheetTitle={spreadsheetTitle}
        spreadsheetUrl={spreadsheetUrl}
        activeSheetTitle={activeSheetTitle}
        activeYear={activeYear}
        yearlySheets={yearlySheets}
        isYearlyUnifiedMode={isYearlyUnifiedMode}
        needsPerpetualUpgrade={needsPerpetualUpgrade}
        hasSettingsTab={hasSettingsTab}
        isCreatingSettingsTab={isCreatingSettingsTab}
        isRefreshing={isLoadingData}
        isExportingMonth={isExportingMonth}
        transactionCount={transactions.length}
        customCategories={customCategories}
        customPaymentMethods={customPaymentMethods}
        analysis={analysis}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onRefreshData={() => {
          if (isRealGoogleConnected && accessToken) {
            loadSheetData(spreadsheetId, activeSheetTitle, accessToken);
          }
        }}
        onOpenSpreadsheetPicker={() => setIsPickerOpen(true)}
        onOpenMigrationModal={(tab) => handleOpenMigrationWithTab(tab)}
        onOpenRegisterYearModal={() => setIsRegisterYearModalOpen(true)}
        onQuickCreateSettingsTab={handleQuickCreateSettingsTab}
        onOpenCategoryManager={() => setIsCategoryModalOpen(true)}
        onOpenGitHubModal={() => setIsGitHubOpen(true)}
        onExportCurrentMonthToGoogleSheets={handleExportCurrentMonthToGoogleSheets}
        onUpdateMapping={handleUpdateMapping}
        onAddMonthTab={handleAddMonthTab}
      />
    </div>
  );
}
