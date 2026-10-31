import React, { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import {
  initAuth,
  googleSignIn,
  logout,
  getAccessToken,
  setCachedAccessToken,
  refreshGoogleToken,
} from './services/firebase';
import {
  getSpreadsheetDetails,
  getSheetValues,
  analyzeSheetStructure,
  extractYearMatrixData,
  appendTransactionRow,
  updateTransactionRow,
  deleteTransactionRow,
  deleteMultipleTransactionRows,
  addMonthlySheetTab,
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
} from './services/categoryManager';
import {
  enrichTransactionsWithSubItems,
  saveSubItemsForTransaction,
} from './services/subItemStorage';
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
  const [customPaymentMethods, setCustomPaymentMethods] = useState<PaymentMethodItem[]>(() =>
    loadPaymentMethods()
  );
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
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem('smart_money_user_transactions_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return enrichTransactionsWithSubItems(parsed);
        }
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
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Active View Tab: 'matrix' | 'monthly' | 'analyzer'
  const [activeTab, setActiveTab] = useState<'matrix' | 'monthly' | 'analyzer'>('matrix');

  const [yearData, setYearData] = useState<YearDashboardData>(USER_2026_DATA);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isGitHubOpen, setIsGitHubOpen] = useState(false);
  const [isInputModalOpen, setIsInputModalOpen] = useState(false);

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
          if (result.transactions.length > 0) {
            setTransactions(enrichTransactionsWithSubItems(result.transactions));
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
        } else if (activeSheetTitle) {
          targetSheetTitle = activeSheetTitle;
        }
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
      setTransactions((prev) => [createdTx, ...prev]);
      setActiveSheetTitle(targetSheetTitle);
      return;
    }

    // Real Google Mode with active accessToken or Apps Script Web App: Write directly to Google Sheets immediately!
    try {
      await appendTransactionRow(
        spreadsheetId,
        targetSheetTitle,
        analysis.mapping,
        newTx,
        accessToken
      );

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
      // If token expired, auto-refresh and retry once!
      if (err?.message?.includes('AUTH_EXPIRED') || String(err).includes('AUTH_EXPIRED')) {
        try {
          const newToken = await refreshGoogleToken();
          if (newToken) {
            setAccessToken(newToken);
            await appendTransactionRow(
              spreadsheetId,
              targetSheetTitle,
              analysis.mapping,
              newTx,
              newToken
            );
            setSyncToast({
              show: true,
              type: 'success',
              message: `✅ 세션이 자동 갱신되어 [${targetSheetTitle}] 탭에 즉시 반영되었습니다!`,
            });
            await loadSheetData(spreadsheetId, targetSheetTitle, newToken);
            return;
          }
        } catch (retryErr) {
          console.warn('Auto refresh retry failed:', retryErr);
        }
      }

      setSyncToast({
        show: true,
        type: 'error',
        message: `구글 시트 연동 알림: 데이터는 로컬 가계부에 안전하게 보관되었습니다.`,
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

          {/* Current Sheet Info */}
          <div className="flex items-center justify-end gap-1 text-[11px] text-slate-500 font-semibold">
            <span className="text-slate-400">조회 중:</span>
            <span className="font-bold text-slate-700">{activeSheetTitle}</span>
          </div>
        </div>

        {/* Full Width Main Display Area */}
        <div className="w-full space-y-6">
          {activeTab === 'matrix' ? (
            <AnnualMatrixView yearData={yearData} onSelectMonth={handleSelectSheetTab} />
          ) : activeTab === 'monthly' ? (
            <Dashboard
              transactions={transactions}
              activeSheetTitle={activeSheetTitle}
              sheetTabs={sheetTabs}
              onSelectSheetTab={handleSelectSheetTab}
              onEditTransaction={handleEditTransaction}
              onDeleteTransaction={handleDeleteTransaction}
              onBatchDeleteTransactions={handleBatchDeleteTransactions}
              onAddTransaction={handleAddTransaction}
              isRealGoogleConnected={Boolean(isRealGoogleConnected && accessToken)}
              availableCategories={customCategories.filter((c) => c.isVisible).map((c) => c.name)}
              availablePaymentMethods={customPaymentMethods.filter((p) => p.isVisible).map((p) => p.name)}
              customCategories={customCategories}
              onOpenCategoryManager={() => setIsCategoryModalOpen(true)}
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
          onClick={() => setIsInputModalOpen(true)}
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
              isRealGoogleConnected={isRealGoogleConnected}
              onAddTransaction={handleAddTransaction}
              onClose={() => setIsInputModalOpen(false)}
              isModal={true}
              customCategories={customCategories}
              customPaymentMethods={customPaymentMethods}
              transactions={transactions}
              onOpenCategoryManager={() => {
                setIsInputModalOpen(false);
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

      {/* Category & Payment Method Management Modal */}
      <CategoryManagementModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={customCategories}
        paymentMethods={customPaymentMethods}
        onUpdateCategories={handleUpdateCategories}
        onUpdatePaymentMethods={handleUpdatePaymentMethods}
        onResetToDefaults={handleResetCategoryDefaults}
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
    </div>
  );
}
