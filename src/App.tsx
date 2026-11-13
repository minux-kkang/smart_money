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
  deleteTransactionRow,
  deleteMultipleTransactionRows,
  addMonthlySheetTab,
  exportMonthTransactionsToSheet,
  migrateSheetColumns,
  migrateAllMonthSheetsColumns,
  MonthMigrationResult,
  extractMonthNumberFromTab,
  findTabForMonth,
} from './services/googleSheets';
import { listSpreadsheets } from './services/googleDrive';
import { Header } from './components/Header';
import { ExpenseInputForm } from './components/ExpenseInputForm';
import { Dashboard } from './components/Dashboard';
import { SpreadsheetAnalyzer } from './components/SpreadsheetAnalyzer';
import { SpreadsheetPickerModal } from './components/SpreadsheetPickerModal';
import { GitHubModal } from './components/GitHubModal';
import { ConfirmationModal } from './components/ConfirmationModal';
import { AnnualMatrixView } from './components/AnnualMatrixView';
import { CategoryManagementModal } from './components/CategoryManagementModal';
import { DomainAuthModal } from './components/DomainAuthModal';
import { MigrationAllMonthsModal } from './components/MigrationAllMonthsModal';
import { RegisterYearSheetModal } from './components/RegisterYearSheetModal';
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
  FileSpreadsheet,
  BarChart3,
  SearchCode,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Plus,
  Calendar,
  Tag,
  RefreshCw,
  UploadCloud,
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
  const [sheetTabs, setSheetTabs] = useState<Array<{ id: number; title: string }>>(() =>
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

  // Active View Tab: 'matrix' | 'monthly' | 'analyzer'
  const [activeTab, setActiveTab] = useState<'matrix' | 'monthly' | 'analyzer'>('matrix');

  const [yearData, setYearData] = useState<YearDashboardData>(USER_2026_DATA);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isGitHubOpen, setIsGitHubOpen] = useState(false);
  const [isInputModalOpen, setIsInputModalOpen] = useState(false);
  const [openImportOnModal, setOpenImportOnModal] = useState(false);
  const [isRegisterYearModalOpen, setIsRegisterYearModalOpen] = useState(false);

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
    const match = spreadsheetTitle?.match(/20\d{2}/) || activeSheetTitle?.match(/20\d{2}/);
    if (!match) return '2026';
    return typeof match === 'string' ? match : match[0];
  }, [spreadsheetTitle, activeSheetTitle]);

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
    async (sId: string, sheetName: string, token?: string | null) => {
      setIsLoadingData(true);
      setErrorNotice(null);
      try {
        // Fetch metadata to get latest sheet list and title
        const meta = await getSpreadsheetDetails(sId, token);
        setSpreadsheetTitle(meta.title);
        setSpreadsheetUrl(`https://docs.google.com/spreadsheets/d/${sId}`);

        const formattedTabs = meta.sheets.map((s) => ({ id: s.id, title: s.title }));
        setSheetTabs(formattedTabs);

        // Auto-load categories & payment methods from '분류설정' sheet tab if present
        const settingsTab = findSettingsTab(formattedTabs);
        if (settingsTab) {
          loadCategoriesFromGoogleSheet(sId, token, formattedTabs)
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
        const isMonthNamedTab = (t: string) => /(?:0)?\d{1,2}월/.test(t);
        const isConfigTab = (t: string) =>
          /분류관리|분류|기준목록|기준|설정|카테고리|코드|항목관리|자산|계좌관리|카드관리|기초/i.test(
            t
          );
        const isDashboardTab = (t: string) =>
          /dashboard|대시보드|요약|summary|연간|matrix/i.test(t);

        // Intelligently find target sheet
        const reqMonthNum = extractMonthNumberFromTab(sheetName);

        let targetSheet = sheetName;
        const exactMatch = formattedTabs.find((t) => t.title === targetSheet);

        if (exactMatch) {
          targetSheet = exactMatch.title;
        } else if (reqMonthNum !== null) {
          // Priority 1: Match tab for requested month (e.g. "1월", "01월", "1", "01", "1월 지출")
          const matchedTab = findTabForMonth(formattedTabs, reqMonthNum);
          if (matchedTab) {
            targetSheet = matchedTab.title;
          } else {
            // Priority 2: Dedicated transaction tab (e.g. "지출내역", "가계부", "거래내역")
            const txTab = formattedTabs.find((t) => isTxTab(t.title));
            if (txTab) {
              targetSheet = txTab.title;
            } else {
              targetSheet = sheetName;
            }
          }
        } else {
          // Non-month sheet requested
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

        // Fetch sheet values without arbitrary row limit (fetch entire sheet A:Z)
        let rows: string[][] = [];
        try {
          rows = await getSheetValues(sId, targetSheet, token, 'A:Z');
        } catch (fetchErr) {
          console.warn(`Sheet tab ${targetSheet} fetch warning:`, fetchErr);
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
          // If a dashboard or annual matrix tab exists elsewhere in the sheet, sync yearData in the background
          const dashTab = formattedTabs.find((t) => isDashboardTab(t.title));
          if (dashTab && targetSheet !== dashTab.title) {
            getSheetValues(sId, dashTab.title, token, 'A:Z')
              .then((dashRows) => {
                const matrix = extractYearMatrixData(dashRows);
                if (matrix && matrix.categories.length > 0) {
                  setYearData(matrix);
                }
              })
              .catch((err) => console.warn('Background dashboard tab sync warning:', err));
          }
          // Find any pending transactions for this month or sheet so they are never wiped!
          const currentPending = loadPendingQueue();
          const pendingForThisSheet = currentPending.filter((p) => {
            const pMonth = extractMonthNumberFromTab(p.sheetTitle || p.date);
            const curMonth = reqMonthNum !== null ? reqMonthNum : extractMonthNumberFromTab(targetSheet);
            return (
              p.sheetTitle === targetSheet ||
              (pMonth !== null && curMonth !== null && pMonth === curMonth)
            );
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
            setTransactions(enrichTransactionsWithSubItems(merged));
          } else if (pendingForThisSheet.length > 0) {
            // Sheet is empty or new: keep pending transactions visible!
            setTransactions(enrichTransactionsWithSubItems(pendingForThisSheet));
          } else if (!isRealGoogleConnected && reqMonthNum !== null) {
            // Only in offline sample mode if no transactions exist
            const fallbackTxs = generateUserMonthlyTransactions(reqMonthNum - 1);
            setTransactions(enrichTransactionsWithSubItems(fallbackTxs));
          } else {
            setTransactions([]);
          }
          setActiveTab('monthly');
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
      loadSheetData(spreadsheetId, title, accessToken);
    } else {
      // In offline/sample mode: keep complete transactions dataset intact
      // Dashboard will filter to the selected month seamlessly
      setAnalysis((prev) => ({
        ...prev,
        activeSheetTitle: title,
      }));
    }
  };

  // Fetch real transactions for a specific month tab on demand (used by AnnualMatrixView)
  const handleFetchMonthTransactions = useCallback(
    async (monthNum: number): Promise<Transaction[]> => {
      if (!spreadsheetId) return [];
      const effectiveToken = accessToken || getSavedToken() || null;
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
    [spreadsheetId, accessToken, sheetTabs, spreadsheetTitle]
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

    const curMonth = `${new Date().getMonth() + 1}월`;
    await loadSheetData(id, curMonth, token);
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

        // Search user's drive for ledger files
        try {
          const files = await listSpreadsheets(res.accessToken);
          if (files.length > 0) {
            // Find file that might have '가계부' or year
            const ledgerFile =
              files.find((f) => /가계부|budget|지출|2026|2025/i.test(f.name)) || files[0];
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
      const curMonth = `${new Date().getMonth() + 1}월`;
      const token = accessToken || getSavedToken() || null;
      await loadSheetData(cfg.id, curMonth, token);
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

  // Add Transaction Handler with Direct Real-time Google Sheets Sync
  const handleAddTransaction = async (
    newTx: Omit<Transaction, 'id' | 'rowIndex'> & { sheetTitle?: string }
  ) => {
    // 1. Automatically calculate target month from date
    let targetMonth = activeSheetTitle || '10월';
    let monthNum = 10;
    if (newTx.date) {
      const parts = newTx.date.split('-');
      if (parts.length >= 2) {
        const m = parseInt(parts[1], 10);
        if (!isNaN(m) && m >= 1 && m <= 12) {
          targetMonth = `${m}월`;
          monthNum = m;
        }
      }
    }

    // Resolve exact matching sheet tab in user's spreadsheet
    let targetSheetTitle = targetMonth;
    if (sheetTabs && sheetTabs.length > 0) {
      const matched = findTabForMonth(sheetTabs, monthNum);
      if (matched) {
        targetSheetTitle = matched.title;
      } else {
        const direct = sheetTabs.find((t) => t.title === targetMonth);
        if (direct) {
          targetSheetTitle = direct.title;
        }
        // If not in sheetTabs, targetSheetTitle stays targetMonth (e.g. '10월')
        // appendTransactionRow will create the '10월' tab in Google Sheets!
      }
    }

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
    const canWriteToGoogle = Boolean(accessToken || gasUrl);

    if (!canWriteToGoogle) {
      if (isRealGoogleConnected && !accessToken) {
        setSyncToast({
          show: true,
          type: 'error',
          message: 'Google 시트에 즉시 반영하려면 Google 로그인 또는 [Apps Script 웹앱] 연동이 필요합니다. (화면에 임시 보관됨)',
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
        accessToken
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
        message: gasUrl
          ? `⚡ [Apps Script] 구글 시트 [${targetSheetTitle}] 탭에 영구 실시간 저장되었습니다!`
          : `✅ Google 시트 [${targetSheetTitle}] 탭에 즉시 반영되었습니다!`,
      });

      // Reload to ensure real-time synchronization and correct row indices
      setActiveSheetTitle(targetSheetTitle);
      await loadSheetData(spreadsheetId, targetSheetTitle, accessToken);
    } catch (err: any) {
      console.error('Google Sheets append error:', err);
      // If token expired, prompt re-login and auto-retry immediately!
      if (err?.message?.includes('AUTH_EXPIRED') || String(err).includes('AUTH_EXPIRED') || isAuthExpiredError(err)) {
        try {
          if (confirm('Google 인증 세션이 만료되어 구글 시트 전송이 대기되었습니다.\n지금 다시 로그인하여 시트에 즉시 기록하시겠습니까?')) {
            const loginRes = await googleSignIn();
            if (loginRes?.accessToken) {
              setAccessToken(loginRes.accessToken);
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
        accessToken
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
              newToken
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

      // Sequentially update each row to prevent Google Sheets 429 Write quota rate limits
      for (const tx of validTxs) {
        const txSheet = tx.sheetTitle || activeSheetTitle;
        try {
          await updateTransactionRow(
            spreadsheetId,
            txSheet,
            tx.rowIndex!,
            analysis.mapping,
            { ...tx, category: newCategory },
            currentToken
          );
        } catch (rowErr: any) {
          if (rowErr?.message?.includes('AUTH_EXPIRED') || String(rowErr).includes('AUTH_EXPIRED')) {
            const newToken = await refreshGoogleToken();
            if (newToken) {
              currentToken = newToken;
              setAccessToken(newToken);
              await updateTransactionRow(
                spreadsheetId,
                txSheet,
                tx.rowIndex!,
                analysis.mapping,
                { ...tx, category: newCategory },
                newToken
              );
            }
          } else {
            console.warn(`Row ${tx.rowIndex} update warning:`, rowErr);
          }
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

  // Batch Add Transactions Handler (supports both single-month recurring import & multi-month card installments)
  const handleBatchAddTransactions = async (
    newTxs: Array<Omit<Transaction, 'id' | 'rowIndex'> & { sheetTitle?: string }>
  ) => {
    if (!newTxs || newTxs.length === 0) return;

    const resolveTargetTab = (tx: Omit<Transaction, 'id' | 'rowIndex'> & { sheetTitle?: string }) => {
      let monthNum: number | null = null;
      if (tx.date) {
        const parts = tx.date.split('-');
        if (parts.length >= 2) {
          const m = parseInt(parts[1], 10);
          if (!isNaN(m) && m >= 1 && m <= 12) monthNum = m;
        }
      }
      if (monthNum === null && tx.sheetTitle) {
        monthNum = extractMonthNumberFromTab(tx.sheetTitle);
      }
      const fallbackTab = monthNum ? `${monthNum}월` : tx.sheetTitle || activeSheetTitle || '11월';
      if (monthNum && sheetTabs && sheetTabs.length > 0) {
        const matched = findTabForMonth(sheetTabs, monthNum);
        if (matched) return { sheetTitle: matched.title, monthNum };
      }
      const direct = sheetTabs?.find((t) => t.title === fallbackTab);
      return { sheetTitle: direct ? direct.title : fallbackTab, monthNum: monthNum || 11 };
    };

    const resolvedItems = newTxs.map((tx, idx) => {
      const { sheetTitle, monthNum } = resolveTargetTab(tx);
      return { tx, sheetTitle, monthNum, idx };
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

    // Resolve target tab title in spreadsheet
    let targetSheetTitle = targetMonth;
    if (sheetTabs && sheetTabs.length > 0) {
      const matched = findTabForMonth(sheetTabs, targetMonthNum);
      if (matched) {
        targetSheetTitle = matched.title;
      } else {
        const direct = sheetTabs.find((t) => t.title === targetMonth);
        if (direct) targetSheetTitle = direct.title;
      }
    }

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
      if (confirm('현재 샘플 2026 가계부를 사용 중입니다.\n내 구글 드라이브에 실제 [2026 스마트가계부] 시트를 생성하시겠습니까?\n(사용설명서, 분류설정, 1~12월 탭이 자동으로 포함됩니다)')) {
        try {
          setIsCreatingSettingsTab(true);
          const { createGoogleSheetWithTemplate } = await import('./services/templateGenerator');
          const res = await createGoogleSheetWithTemplate(currentToken, 2026, customCategories, customPaymentMethods);
          handleSelectSpreadsheet(res.spreadsheetId, '2026 스마트가계부', currentToken);
          setSyncToast({
            show: true,
            type: 'success',
            message: '구글 드라이브에 [2026 스마트가계부] 시트가 성공적으로 생성되었습니다!',
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
        // Resolve target sheet tab for this transaction's month
        let targetMonth = tx.sheetTitle || activeSheetTitle || '10월';
        let monthNum = 10;
        if (tx.date) {
          const parts = tx.date.split('-');
          if (parts.length >= 2) {
            const m = parseInt(parts[1], 10);
            if (!isNaN(m) && m >= 1 && m <= 12) {
              targetMonth = `${m}월`;
              monthNum = m;
            }
          }
        }

        let targetSheetTitle = targetMonth;
        if (sheetTabs && sheetTabs.length > 0) {
          const matched = findTabForMonth(sheetTabs, monthNum);
          if (matched) {
            targetSheetTitle = matched.title;
          } else {
            const direct = sheetTabs.find((t) => t.title === targetMonth);
            if (direct) {
              targetSheetTitle = direct.title;
            }
          }
        }

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

  // 2026 1월~12월 전체 시트 일괄 컬럼 분리 및 마이그레이션
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);
  const [isMigratingAllMonths, setIsMigratingAllMonths] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<{
    month: string;
    index: number;
    total: number;
    message: string;
  } | null>(null);
  const [migrationResults, setMigrationResults] = useState<MonthMigrationResult[] | null>(null);
  const [totalMigratedTxs, setTotalMigratedTxs] = useState<number>(0);

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
      message: '2026년 전체 시트 마이그레이션 준비 중...',
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
        message: `🎉 2026년 1월~12월 전체 시트 컬럼 분리 완료! (총 ${outcome.totalMigratedTxs}건 정리됨)`,
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
              message: `🎉 2026년 1월~12월 전체 시트 컬럼 분리 완료! (총 ${outcome.totalMigratedTxs}건 정리됨)`,
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

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 font-sans antialiased flex flex-col">
      {/* Global Header */}
      <Header
        user={user}
        spreadsheetTitle={spreadsheetTitle}
        spreadsheetUrl={spreadsheetUrl}
        sheetTabs={sheetTabs}
        activeSheetTitle={activeSheetTitle}
        onSelectSheet={handleSelectSheetTab}
        onOpenSpreadsheetPicker={() => setIsPickerOpen(true)}
        onOpenQuickInput={() => setIsInputModalOpen(true)}
        onOpenGitHubModal={() => setIsGitHubOpen(true)}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onRefreshData={() => {
          if (isRealGoogleConnected && accessToken) {
            loadSheetData(spreadsheetId, activeSheetTitle, accessToken);
          }
        }}
        isRefreshing={isLoadingData}
        onOpenCategoryManager={() => setIsCategoryModalOpen(true)}
        isRealGoogleConnected={Boolean(isRealGoogleConnected && accessToken)}
        onOpenMigrationModal={() => setIsMigrationModalOpen(true)}
        activeYear={activeYear}
        yearlySheets={yearlySheets}
        onSelectYearSheet={handleSelectYearSheet}
        onOpenRegisterYearModal={() => setIsRegisterYearModalOpen(true)}
      />

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-3.5 sm:py-5 space-y-3.5 sm:space-y-4">
        {/* Compact Connection & Data Status Bar */}
        {!isRealGoogleConnected ? (
          <div className="px-3 py-2 bg-blue-50/90 border border-blue-200/80 rounded-xl text-xs flex items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              <span className="font-bold text-blue-900 shrink-0 text-xs">
                {user ? '구글 계정 인증됨' : '샘플 데이터 모드'}
              </span>
              <span className="hidden sm:inline text-slate-500 text-[11px] truncate">
                {user
                  ? '내 Google 드라이브 가계부 시트를 선택해 실시간 연동하세요.'
                  : '실제 구글 시트 연동 또는 샘플 데이터로 기능 체험이 가능합니다.'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setIsPickerOpen(true)}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition cursor-pointer"
              >
                직접 등록
              </button>
              {user ? (
                <button
                  onClick={() => setIsPickerOpen(true)}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold shadow-xs transition active:scale-95 cursor-pointer"
                >
                  시트 선택
                </button>
              ) : (
                <button
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold shadow-xs transition active:scale-95 cursor-pointer"
                >
                  {isLoggingIn ? '연결 중...' : 'Google 로그인'}
                </button>
              )}
            </div>
          </div>
        ) : accessToken ? (
          <div className="px-3 py-2 bg-emerald-50/90 border border-emerald-200/80 rounded-xl text-xs flex items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="font-black text-emerald-950 shrink-0 text-xs flex items-center gap-1">
                <span>Google 시트 실시간 즉시 반영 켜짐</span>
              </span>
              <span className="text-slate-400 shrink-0 hidden sm:inline">|</span>
              <span className="font-semibold text-slate-700 truncate max-w-[140px] sm:max-w-[280px]" title={spreadsheetTitle}>
                {spreadsheetTitle}
              </span>
              <span className="hidden md:inline text-[11px] text-emerald-700 font-medium shrink-0">
                ({activeSheetTitle} • 입력/수정/삭제 시 시트 원본 실시간 저장)
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {spreadsheetUrl && (
                <a
                  href={spreadsheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2 py-1 bg-white hover:bg-emerald-100/70 border border-emerald-200 text-emerald-800 rounded-lg text-[11px] font-bold transition flex items-center gap-1"
                  title="Google Sheets 원본 열기"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span className="hidden xs:inline">시트 열기</span>
                </a>
              )}
              <button
                onClick={() => setIsPickerOpen(true)}
                className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition cursor-pointer"
              >
                시트 변경
              </button>
            </div>
          </div>
        ) : (
          <div className="px-3 py-2 bg-amber-50/95 border border-amber-200/80 rounded-xl text-xs flex items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
              <span className="font-bold text-amber-950 shrink-0 text-xs">읽기 전용 모드</span>
              <span className="text-amber-400 shrink-0 hidden sm:inline">|</span>
              <span className="font-semibold text-slate-700 truncate max-w-[140px] sm:max-w-[240px]" title={spreadsheetTitle}>
                {spreadsheetTitle}
              </span>
              <span className="hidden lg:inline text-[11px] text-amber-800 font-medium shrink-0">
                (Google 시트 원본에 즉시 쓰려면 Google 로그인이 필요합니다)
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold transition shadow-xs cursor-pointer flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />
                <span>{isLoggingIn ? '로그인 중...' : 'Google 로그인 (실시간 쓰기)'}</span>
              </button>
              <button
                onClick={() => setIsPickerOpen(true)}
                className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition cursor-pointer"
              >
                시트 변경
              </button>
            </div>
          </div>
        )}



        {/* Unsynced Local Data Notice & One-Click Push */}
        {pendingSyncList.length > 0 && (
          <div className="bg-gradient-to-r from-amber-50 via-rose-50 to-orange-50 border-2 border-rose-400 rounded-2xl p-4 sm:p-5 shadow-sm animate-in fade-in space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5 sm:mt-0">
                  <UploadCloud className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm sm:text-base font-black text-rose-950">
                      🚨 구글 시트에 아직 전송되지 않은 내역 {pendingSyncList.length}건이 안전하게 대기 중입니다!
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-200 text-rose-900 border border-rose-300">
                      기기(로컬) 보관 중
                    </span>
                  </div>
                  <p className="text-xs text-rose-900 mt-1 leading-relaxed">
                    구글 인증 토큰 만료 또는 해당 월 탭 미생성으로 인해 기기에 임시 보관되어 있습니다.
                    아래 버튼을 누르면 구글 시트의 해당 월 탭(예: <strong>10월</strong>)으로 즉시 저장됩니다.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <button
                  onClick={handleSyncPendingToGoogle}
                  disabled={isSyncingPending}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-black shadow-md transition cursor-pointer disabled:opacity-50"
                >
                  {isSyncingPending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <UploadCloud className="w-4 h-4" />
                  )}
                  <span>구글 시트로 지금 즉시 내보내기 ({pendingSyncList.length}건)</span>
                </button>
              </div>
            </div>

            {/* List preview of pending items */}
            <div className="bg-white/90 rounded-xl p-3 border border-rose-200 divide-y divide-rose-100 max-h-48 overflow-y-auto">
              <div className="text-[11px] font-bold text-rose-800 pb-2 px-1 flex justify-between items-center">
                <span>전송 대기 목록 ({pendingSyncList.length}건):</span>
                <span>총 {pendingSyncList.reduce((acc, cur) => acc + (cur.amount || 0), 0).toLocaleString()}원</span>
              </div>
              {pendingSyncList.map((tx, idx) => (
                <div key={tx.id || idx} className="py-2 px-1 flex items-center justify-between text-xs text-slate-700 gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-bold text-rose-700 text-[11px] shrink-0">{tx.date || '날짜 미지정'}</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] shrink-0 font-medium">{tx.category}</span>
                    <span className="truncate font-semibold text-slate-800">{tx.description}</span>
                    {tx.paymentMethod && <span className="text-[10px] text-slate-400 shrink-0 hidden xs:inline">({tx.paymentMethod})</span>}
                  </div>
                  <span className="font-black text-rose-900 shrink-0 ml-2">
                    {tx.amount?.toLocaleString()}원
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notice Banner: Missing [분류설정] Tab in currently connected sheet */}
        {!hasSettingsTab && (
          <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-blue-500/10 border border-amber-300 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5 sm:mt-0">
                <Tag className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs sm:text-sm font-black text-slate-900">
                    현재 가계부 시트에 [⚙️ 분류설정] 탭 추가하기
                  </h4>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-200/80 text-amber-900 border border-amber-300">
                    시트 연동 권장
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  구글 시트에도 <strong>[분류설정]</strong> 탭을 만들면 식비/외식 등 카테고리와 결제수단이 시트와 실시간으로 연동됩니다.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              <button
                onClick={handleQuickCreateSettingsTab}
                disabled={isCreatingSettingsTab}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl text-xs font-black shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                {isCreatingSettingsTab ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>현재 시트에 [분류설정] 탭 생성</span>
              </button>
            </div>
          </div>
        )}

        {/* Error Notice */}
        {errorNotice && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex flex-wrap items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-medium">{errorNotice}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {(errorNotice.includes('도메인') || errorNotice.includes('unauthorized-domain')) && (
                <button
                  type="button"
                  onClick={() => setIsDomainAuthModalOpen(true)}
                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold shadow-2xs transition cursor-pointer flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>30초 도메인 승인 방법 ↗</span>
                </button>
              )}
              <button
                onClick={() => setErrorNotice(null)}
                className="text-xs font-bold text-rose-600 hover:underline cursor-pointer px-1 py-0.5"
              >
                닫기
              </button>
            </div>
          </div>
        )}

        {/* Sleek Segmented View Switcher & Current Sheet Info */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Segmented Control Tabs */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/80 w-full sm:w-auto overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveTab('matrix')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                activeTab === 'matrix'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>연간 매트릭스</span>
            </button>

            <button
              onClick={() => setActiveTab('monthly')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                activeTab === 'monthly'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>월별 가계부 ({activeSheetTitle})</span>
            </button>

            <button
              onClick={() => setActiveTab('analyzer')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                activeTab === 'analyzer'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <SearchCode className="w-3.5 h-3.5 text-purple-600 shrink-0" />
              <span>시트 분석</span>
            </button>
          </div>
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
              onOpenMigrationAllMonthsModal={() => setIsMigrationModalOpen(true)}
              onBatchCopyPaste={handleBatchCopyPaste}
              onBatchUpdateCategory={handleBatchUpdateCategory}
              onOpenQuickImportModal={() => {
                setOpenImportOnModal(true);
                setIsInputModalOpen(true);
              }}
              spreadsheetId={spreadsheetId}
              onFetchMonthTransactions={handleFetchMonthTransactions}
              yearData={yearData}
            />
          ) : (
            <SpreadsheetAnalyzer
              analysis={analysis}
              spreadsheetUrl={spreadsheetUrl}
              onUpdateMapping={handleUpdateMapping}
              onAddMonthTab={handleAddMonthTab}
              isRealGoogleConnected={Boolean(isRealGoogleConnected && accessToken)}
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
              isRealGoogleConnected={isRealGoogleConnected}
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

      {/* 2026년 1월~12월 전체 시트 컬럼 분리 & 마이그레이션 모달 */}
      <MigrationAllMonthsModal
        isOpen={isMigrationModalOpen}
        onClose={() => setIsMigrationModalOpen(false)}
        onRunMigration={handleRunMigrationAllMonths}
        isMigrating={isMigratingAllMonths}
        progress={migrationProgress}
        results={migrationResults}
        totalMigratedTxs={totalMigratedTxs}
        spreadsheetTitle={spreadsheetTitle}
        spreadsheetUrl={spreadsheetUrl}
        isRealGoogleConnected={Boolean(isRealGoogleConnected && accessToken)}
        onLogin={handleLogin}
      />
    </div>
  );
}
