import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Calendar,
  FolderInput,
  Search,
  ArrowUpDown,
  BarChart3,
  Layers,
  X,
  PieChart,
  Loader2,
  Info,
  ArrowRight,
} from 'lucide-react';
import { Transaction, CategoryItem, formatShortDate } from '../types/ledger';
import {
  findAllYearTabs,
  fetchAllTransactionsForYearSource,
  extractYearFromTab,
  extractMonthNumberFromTab,
} from '../services/googleSheets';
import { enrichTransactionsWithSubItems } from '../services/subItemStorage';

interface YearSourceDescriptor {
  year: number;
  label: string;
  spreadsheetId: string;
  spreadsheetTitle: string;
  yearTabTitle?: string;
  isCurrentFileTab: boolean;
}

interface YearComparisonViewProps {
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheetTabs: Array<{ id: number; title: string }>;
  activeSheetTitle: string;
  activeYear: string;
  transactions: Transaction[];
  yearlySheets: Array<{ year: string; title: string; id: string }>;
  accessToken: string | null;
  isRealGoogleConnected: boolean;
  customCategories?: CategoryItem[];
  onOpenMigrationImport: () => void;
  onSelectYearTabOrSheet: (source: { year: number; yearTabTitle?: string; externalId?: string; externalTitle?: string }) => void;
}

const YEAR_PALETTE = [
  { hex: '#94A3B8', bg: 'bg-slate-400', badge: 'bg-slate-100 text-slate-700 border-slate-300', text: 'text-slate-700' },
  { hex: '#0EA5E9', bg: 'bg-sky-500', badge: 'bg-sky-50 text-sky-700 border-sky-200', text: 'text-sky-700' },
  { hex: '#2563EB', bg: 'bg-blue-600', badge: 'bg-blue-50 text-blue-700 border-blue-200', text: 'text-blue-700' },
  { hex: '#10B981', bg: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'text-emerald-700' },
  { hex: '#8B5CF6', bg: 'bg-violet-500', badge: 'bg-violet-50 text-violet-700 border-violet-200', text: 'text-violet-700' },
];

const FIXED_BUDGET_CATEGORIES = new Set([
  '관리비_기타',
  '관리비_수도',
  '관리비_전기',
  '관리비_온수',
  '통신비',
  '보험료',
  '구독',
  '렌탈',
  '대출_원금',
  '대출_이자',
  '세금/공과금',
]);

const SPECIAL_EXPENSE_CATEGORIES = new Set(['여행비', '골프', '경조사']);

function getTxMonth(t: Transaction): number | null {
  if (t.date) {
    const m = t.date.match(/^\d{4}-(\d{1,2})/);
    if (m) {
      const num = parseInt(m[1], 10);
      if (num >= 1 && num <= 12) return num;
    }
  }
  if (t.sheetTitle) {
    return extractMonthNumberFromTab(t.sheetTitle);
  }
  return null;
}

function isPureExpenseCategory(catName?: string, customCategories?: CategoryItem[]): boolean {
  if (!catName) return false;
  const trimmed = catName.trim();
  if (!trimmed) return false;
  if (/^(총\s*지출|총\s*수입|합계|총계|소계|잔액|누적\s*잔액|대시보드|dashboard)$/i.test(trimmed)) return false;
  if (/^(총\s*수입|수입|급여|월급|상여금?|보너스|부수입|금융소득|이자수입|배당금?|환급금?|기타수입)$/i.test(trimmed)) return false;
  if (/^(저축|투자|계좌이체|카드대금|청약|기타이체)$/i.test(trimmed)) return false;
  if (customCategories && customCategories.length > 0) {
    const found = customCategories.find(
      (c) => c.name.trim().replace(/\s+/g, '').toLowerCase() === trimmed.replace(/\s+/g, '').toLowerCase()
    );
    if (found) return found.type === 'expense';
  }
  return true;
}

interface ComputedYearAnalytics {
  year: number;
  transactions: Transaction[];
  totalExpense: number;
  totalIncome: number;
  netSavings: number;
  savingRate: number;
  activeMonthsCount: number;
  monthlyAvgExpense: number;
  monthlyExpense: number[]; // 12
  monthlyIncome: number[]; // 12
  monthlySavings: number[]; // 12
  spendingTypes: {
    recurring: number;
    routine: number;
    special: number;
  };
  categoryTotals: Record<string, number>;
}

function computeAnalyticsForYear(
  year: number,
  txs: Transaction[],
  customCategories?: CategoryItem[]
): ComputedYearAnalytics {
  const monthlyExpense = new Array(12).fill(0);
  const monthlyIncome = new Array(12).fill(0);
  let totalExpense = 0;
  let totalIncome = 0;
  let recurring = 0;
  let routine = 0;
  let special = 0;
  const categoryTotals: Record<string, number> = {};

  txs.forEach((t) => {
    const amt = Number(t.amount) || 0;
    const mNum = getTxMonth(t);
    const mIdx = mNum && mNum >= 1 && mNum <= 12 ? mNum - 1 : 0;

    if (t.type === 'income') {
      totalIncome += amt;
      monthlyIncome[mIdx] += amt;
      return;
    }
    if (t.type && t.type !== 'expense') return;

    totalExpense += amt;
    monthlyExpense[mIdx] += amt;

    const isRec = Boolean(
      t.isRecurring ||
        t.memo?.includes('[정기예산]') ||
        t.memo?.includes('[고정지출]') ||
        t.memo?.includes('[정기지출]') ||
        FIXED_BUDGET_CATEGORIES.has(t.category || '')
    );
    const isSpec = Boolean(
      t.isSpecial ||
        t.memo?.includes('[특별지출]') ||
        t.memo?.includes('[비정기지출]') ||
        SPECIAL_EXPENSE_CATEGORIES.has(t.category || '')
    );

    if (isRec) recurring += amt;
    else if (isSpec) special += amt;
    else routine += amt;

    if (t.subItems && t.subItems.length > 0) {
      t.subItems.forEach((sub) => {
        const subCat = (sub.category || t.category || '기타').trim();
        if (isPureExpenseCategory(subCat, customCategories)) {
          categoryTotals[subCat] = (categoryTotals[subCat] || 0) + (Number(sub.amount) || 0);
        }
      });
    } else {
      const cat = (t.category || '기타').trim();
      if (isPureExpenseCategory(cat, customCategories)) {
        categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
      }
    }
  });

  const monthlySavings = monthlyIncome.map((inc, idx) => inc - monthlyExpense[idx]);
  const netSavings = totalIncome - totalExpense;
  const savingRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;
  const activeMonthsCount = monthlyExpense.filter((v) => v > 0).length;
  const monthlyAvgExpense =
    activeMonthsCount > 0 ? Math.round(totalExpense / activeMonthsCount) : 0;

  return {
    year,
    transactions: txs,
    totalExpense,
    totalIncome,
    netSavings,
    savingRate,
    activeMonthsCount,
    monthlyAvgExpense,
    monthlyExpense,
    monthlyIncome,
    monthlySavings,
    spendingTypes: { recurring, routine, special },
    categoryTotals,
  };
}

export const YearComparisonView: React.FC<YearComparisonViewProps> = ({
  spreadsheetId,
  spreadsheetTitle,
  sheetTabs,
  activeSheetTitle,
  activeYear,
  transactions,
  yearlySheets,
  accessToken,
  isRealGoogleConnected,
  customCategories,
  onOpenMigrationImport,
  onSelectYearTabOrSheet,
}) => {
  // Discover all available year sources (unified tabs inside current file + external yearlySheets)
  const yearSources = useMemo<YearSourceDescriptor[]>(() => {
    const map = new Map<number, YearSourceDescriptor>();

    // 1. Unified year tabs in current master spreadsheet
    const inFileTabs = findAllYearTabs(sheetTabs || []);
    inFileTabs.forEach((yt) => {
      map.set(yt.year, {
        year: yt.year,
        label: `${yt.year}년 (통합 탭: ${yt.title})`,
        spreadsheetId,
        spreadsheetTitle,
        yearTabTitle: yt.title,
        isCurrentFileTab: true,
      });
    });

    // 2. External yearlySheets not yet unified as tabs in current file
    (yearlySheets || []).forEach((cfg) => {
      const yNum = parseInt(cfg.year, 10);
      if (!isNaN(yNum) && cfg.id && !map.has(yNum)) {
        const isCurrentId = cfg.id === spreadsheetId;
        map.set(yNum, {
          year: yNum,
          label: isCurrentId ? `${yNum}년 (현재 파일)` : `${yNum}년 (${cfg.title})`,
          spreadsheetId: cfg.id,
          spreadsheetTitle: cfg.title,
          yearTabTitle: undefined,
          isCurrentFileTab: isCurrentId,
        });
      }
    });

    // 3. Ensure activeYear is always represented
    const activeYNum = parseInt(activeYear || '2026', 10) || 2026;
    if (!map.has(activeYNum)) {
      map.set(activeYNum, {
        year: activeYNum,
        label: `${activeYNum}년 (현재 파일)`,
        spreadsheetId,
        spreadsheetTitle,
        yearTabTitle: extractYearFromTab(activeSheetTitle) === activeYNum ? activeSheetTitle : undefined,
        isCurrentFileTab: true,
      });
    }

    return Array.from(map.values()).sort((a, b) => a.year - b.year);
  }, [sheetTabs, spreadsheetId, spreadsheetTitle, yearlySheets, activeYear, activeSheetTitle]);

  const cacheKeyForYear = useCallback(
    (src: YearSourceDescriptor) =>
      `smart_money_year_cmp_v1_${src.spreadsheetId}_${src.year}`,
    []
  );

  // Loaded transactions per year
  const [yearTxMap, setYearTxMap] = useState<Record<number, Transaction[]>>(() => {
    if (typeof window === 'undefined') return {};
    const initial: Record<number, Transaction[]> = {};
    yearSources.forEach((src) => {
      try {
        const saved = localStorage.getItem(`smart_money_year_cmp_v1_${src.spreadsheetId}_${src.year}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            initial[src.year] = enrichTransactionsWithSubItems(parsed);
          }
        }
      } catch {
        // ignore cache error
      }
    });
    return initial;
  });

  // Immediately keep current active unified year tab (or sample data) fresh from props.transactions
  useEffect(() => {
    const activeTabYear = extractYearFromTab(activeSheetTitle);
    const activeYNum = activeTabYear || parseInt(activeYear || '2026', 10) || 2026;
    if (!transactions || transactions.length === 0) return;

    // Seed if viewing unified year tab OR if offline sample mode
    const matchingTxs = transactions.filter((t) => {
      const m = t.date?.match(/^(\d{4})-/);
      if (m) return parseInt(m[1], 10) === activeYNum;
      return activeTabYear === activeYNum;
    });

    if (activeTabYear === activeYNum || !isRealGoogleConnected) {
      const finalList = matchingTxs.length > 0 ? matchingTxs : transactions;
      setYearTxMap((prev) => ({
        ...prev,
        [activeYNum]: finalList,
      }));
      const src = yearSources.find((s) => s.year === activeYNum);
      if (src && typeof window !== 'undefined') {
        try {
          localStorage.setItem(cacheKeyForYear(src), JSON.stringify(finalList));
        } catch {
          // ignore storage quota errors
        }
      }
    }
  }, [transactions, activeSheetTitle, activeYear, isRealGoogleConnected, yearSources, cacheKeyForYear]);

  const [selectedYears, setSelectedYears] = useState<number[]>(() =>
    yearSources.map((s) => s.year)
  );

  useEffect(() => {
    setSelectedYears((prev) => {
      const available = yearSources.map((s) => s.year);
      const kept = prev.filter((y) => available.includes(y));
      const newlyAdded = available.filter((y) => !kept.includes(y));
      const merged = [...kept, ...newlyAdded].sort((a, b) => a - b);
      return merged.length > 0 ? merged : available;
    });
  }, [yearSources]);

  const [isLoadingYears, setIsLoadingYears] = useState<boolean>(false);
  const [loadingYearLabel, setLoadingYearLabel] = useState<string>('');

  const handleLoadAllYears = useCallback(
    async (forceRefresh = false) => {
      if (!isRealGoogleConnected) return;
      setIsLoadingYears(true);
      try {
        for (const src of yearSources) {
          if (!forceRefresh && yearTxMap[src.year] && yearTxMap[src.year].length > 0) {
            continue;
          }
          setLoadingYearLabel(`${src.year}년 데이터 불러오는 중...`);
          try {
            const raw = await fetchAllTransactionsForYearSource({
              spreadsheetId: src.spreadsheetId,
              spreadsheetTitle: src.spreadsheetTitle,
              year: src.year,
              yearTabTitle: src.yearTabTitle,
              accessToken,
            });
            const enriched = enrichTransactionsWithSubItems(raw);
            setYearTxMap((prev) => ({ ...prev, [src.year]: enriched }));
            try {
              localStorage.setItem(cacheKeyForYear(src), JSON.stringify(enriched));
            } catch {
              // ignore storage quota errors
            }
          } catch (err) {
            console.warn(`Could not fetch year ${src.year}:`, err);
          }
        }
      } finally {
        setIsLoadingYears(false);
        setLoadingYearLabel('');
      }
    },
    [isRealGoogleConnected, yearSources, yearTxMap, accessToken, cacheKeyForYear]
  );

  // Auto-load missing year tabs once when entering Comparison view
  useEffect(() => {
    if (!isRealGoogleConnected) return;
    const missing = yearSources.some((src) => yearTxMap[src.year] === undefined);
    if (missing) {
      handleLoadAllYears(false);
    }
  }, [isRealGoogleConnected, yearSources, yearTxMap, handleLoadAllYears]);

  // Computed analytics per selected year
  const analyticsByYear = useMemo(() => {
    const result: ComputedYearAnalytics[] = [];
    selectedYears
      .slice()
      .sort((a, b) => a - b)
      .forEach((y) => {
        const txs = yearTxMap[y] || [];
        result.push(computeAnalyticsForYear(y, txs, customCategories));
      });
    return result;
  }, [selectedYears, yearTxMap, customCategories]);

  // Chart Metric Mode
  const [chartMetric, setChartMetric] = useState<'expense' | 'income' | 'savings' | 'cumulative'>('expense');
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  // Category table filters & sorting
  const [catSearch, setCatSearch] = useState<string>('');
  const [catSortBy, setCatSortBy] = useState<'latest' | 'diffDesc' | 'pctDesc' | 'name'>('latest');

  // Drill-down modal state
  const [drilldownCell, setDrilldownCell] = useState<{
    year: number;
    category: string;
    txs: Transaction[];
  } | null>(null);

  const monthLabels = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

  // Compute chart values per year per month (12 values each)
  const chartSeries = useMemo(() => {
    return analyticsByYear.map((a, idx) => {
      let values: number[] = a.monthlyExpense;
      if (chartMetric === 'income') values = a.monthlyIncome;
      else if (chartMetric === 'savings') values = a.monthlySavings;
      else if (chartMetric === 'cumulative') {
        let acc = 0;
        values = a.monthlyExpense.map((v) => {
          acc += v;
          return acc;
        });
      }
      return {
        year: a.year,
        color: YEAR_PALETTE[idx % YEAR_PALETTE.length],
        values,
      };
    });
  }, [analyticsByYear, chartMetric]);

  const maxChartVal = useMemo(() => {
    let max = 100000;
    chartSeries.forEach((s) => {
      s.values.forEach((v) => {
        const abs = Math.abs(v);
        if (abs > max) max = abs;
      });
    });
    return max;
  }, [chartSeries]);

  // Category YoY Comparison Rows
  const categoryComparisonRows = useMemo(() => {
    const allCats = new Set<string>();
    analyticsByYear.forEach((a) => {
      Object.keys(a.categoryTotals).forEach((cat) => {
        if (a.categoryTotals[cat] > 0) allCats.add(cat);
      });
    });

    const sortedYears = analyticsByYear.map((a) => a.year);
    const latestYear = sortedYears[sortedYears.length - 1];
    const prevYear = sortedYears.length >= 2 ? sortedYears[sortedYears.length - 2] : null;

    const rows = Array.from(allCats)
      .filter((cat) => !catSearch.trim() || cat.toLowerCase().includes(catSearch.trim().toLowerCase()))
      .map((cat) => {
        const perYear: Record<number, number> = {};
        analyticsByYear.forEach((a) => {
          perYear[a.year] = a.categoryTotals[cat] || 0;
        });
        const latestVal = latestYear ? perYear[latestYear] || 0 : 0;
        const prevVal = prevYear ? perYear[prevYear] || 0 : 0;
        const diff = prevYear !== null ? latestVal - prevVal : 0;
        const pct =
          prevYear !== null && prevVal > 0
            ? Math.round((diff / prevVal) * 1000) / 10
            : prevYear !== null && latestVal > 0
            ? 100
            : 0;

        return {
          category: cat,
          perYear,
          latestVal,
          prevVal,
          diff,
          pct,
        };
      });

    rows.sort((a, b) => {
      if (catSortBy === 'latest') return b.latestVal - a.latestVal;
      if (catSortBy === 'diffDesc') return Math.abs(b.diff) - Math.abs(a.diff);
      if (catSortBy === 'pctDesc') return Math.abs(b.pct) - Math.abs(a.pct);
      return a.category.localeCompare(b.category, 'ko-KR');
    });

    return { rows, latestYear, prevYear };
  }, [analyticsByYear, catSearch, catSortBy]);

  const handleOpenCellDrilldown = (year: number, category: string) => {
    const txs = (yearTxMap[year] || []).filter((t) => {
      if (t.type && t.type !== 'expense') return false;
      if (t.category === category) return true;
      if (t.subItems && t.subItems.some((s) => (s.category || t.category) === category)) return true;
      return false;
    });
    txs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    setDrilldownCell({ year, category, txs });
  };

  return (
    <div className="space-y-5">
      {/* Top Control & Discovery Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <BarChart3 className="w-5 h-5 text-blue-400 shrink-0" />
              <h2 className="text-base sm:text-lg font-black">연도별 비교 & 데이터 분석</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/30 text-blue-200 border border-blue-400/40">
                {yearSources.length}개 연도 감지됨
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              한 파일 내 연도별 탭(예: 2025, 2026) 및 등록된 과거 연도 시트를 자동으로 모아 전년 대비(YoY) 소비 변화를 분석합니다.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {isRealGoogleConnected && (
              <button
                type="button"
                onClick={() => handleLoadAllYears(true)}
                disabled={isLoadingYears}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/15 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingYears ? 'animate-spin' : ''}`} />
                <span>{isLoadingYears ? loadingYearLabel || '불러오는 중...' : '새로고침'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenMigrationImport}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/15 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <FolderInput className="w-3.5 h-3.5" />
              <span>연도 데이터 가져오기</span>
            </button>
          </div>
        </div>

        {/* Year Selection Bar */}
        <div className="px-4 sm:px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-black text-slate-600 mr-1">비교할 연도 선택:</span>
            {yearSources.map((src, idx) => {
              const isSelected = selectedYears.includes(src.year);
              const palette = YEAR_PALETTE[idx % YEAR_PALETTE.length];
              const count = (yearTxMap[src.year] || []).length;
              return (
                <button
                  key={src.year}
                  type="button"
                  onClick={() => {
                    setSelectedYears((prev) => {
                      if (prev.includes(src.year)) {
                        if (prev.length <= 1) return prev; // Keep at least 1 selected
                        return prev.filter((y) => y !== src.year);
                      }
                      return [...prev, src.year].sort((a, b) => a - b);
                    });
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black border transition cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? `${palette.badge} ring-2 ring-offset-1 ring-blue-300 shadow-2xs`
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: palette.hex }} />
                  <span>{src.year}년</span>
                  <span className="text-[10px] opacity-75">
                    ({count > 0 ? `${count.toLocaleString()}건` : src.yearTabTitle ? '통합 탭' : '외부 파일'})
                  </span>
                </button>
              );
            })}
          </div>

          {yearSources.length < 2 && (
            <div className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-lg flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>
                과거 연도 파일(2025년 등)을 현재 파일에 이관하면 연도별 비교 그래프가 자동으로 활성화됩니다!
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Multi-Year KPI Comparison Cards */}
      <div
        className={`grid gap-4 ${
          analyticsByYear.length === 1
            ? 'grid-cols-1'
            : analyticsByYear.length === 2
            ? 'grid-cols-1 md:grid-cols-2'
            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
        }`}
      >
        {analyticsByYear.map((a, idx) => {
          const prevAnalytics = idx > 0 ? analyticsByYear[idx - 1] : null;
          const expDiff = prevAnalytics ? a.totalExpense - prevAnalytics.totalExpense : 0;
          const expPct =
            prevAnalytics && prevAnalytics.totalExpense > 0
              ? Math.round((expDiff / prevAnalytics.totalExpense) * 1000) / 10
              : null;
          const incDiff = prevAnalytics ? a.totalIncome - prevAnalytics.totalIncome : 0;
          const palette = YEAR_PALETTE[idx % YEAR_PALETTE.length];
          const src = yearSources.find((s) => s.year === a.year);

          return (
            <div
              key={a.year}
              className="bg-white rounded-2xl border-2 border-slate-200 shadow-2xs overflow-hidden flex flex-col"
            >
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: palette.hex }}
                  />
                  <span className="text-base font-black text-slate-900">{a.year}년</span>
                  <span className="text-[11px] font-bold text-slate-500">
                    ({a.transactions.length.toLocaleString()}건 · {a.activeMonthsCount}개월 활동)
                  </span>
                </div>

                {src && (
                  <button
                    type="button"
                    onClick={() =>
                      onSelectYearTabOrSheet({
                        year: a.year,
                        yearTabTitle: src.yearTabTitle,
                        externalId: src.isCurrentFileTab ? undefined : src.spreadsheetId,
                        externalTitle: src.isCurrentFileTab ? undefined : src.spreadsheetTitle,
                      })
                    }
                    className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-0.5 cursor-pointer shrink-0"
                  >
                    <span>내역 보기</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="p-4 space-y-3">
                {/* Expense + YoY badge */}
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-500">연간 총 지출</span>
                    {prevAnalytics && expPct !== null && (
                      <span
                        className={`text-[11px] font-black px-2 py-0.5 rounded-full border ${
                          expDiff > 0
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : expDiff < 0
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {prevAnalytics.year} 대비 {expDiff > 0 ? '+' : ''}
                        {expDiff.toLocaleString('ko-KR')}원 ({expPct > 0 ? '+' : ''}
                        {expPct}%)
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-black text-rose-600 mt-0.5">
                    -{a.totalExpense.toLocaleString('ko-KR')}
                    <span className="text-xs font-bold text-slate-400 ml-1">원</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block">총 수입</span>
                    <span className="font-black text-emerald-600">
                      +{a.totalIncome.toLocaleString('ko-KR')}원
                    </span>
                    {prevAnalytics && prevAnalytics.totalIncome > 0 && (
                      <span className="block text-[10px] text-slate-500">
                        ({incDiff >= 0 ? '+' : ''}
                        {Math.round((incDiff / prevAnalytics.totalIncome) * 100)}%)
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block">순저축 (저축률)</span>
                    <span
                      className={`font-black ${
                        a.netSavings >= 0 ? 'text-blue-600' : 'text-rose-600'
                      }`}
                    >
                      {a.netSavings >= 0 ? '+' : ''}
                      {a.netSavings.toLocaleString('ko-KR')}원
                    </span>
                    <span className="block text-[10px] text-slate-500">저축률 {a.savingRate}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block">월평균 지출</span>
                    <span className="font-black text-slate-800">
                      {a.monthlyAvgExpense.toLocaleString('ko-KR')}원
                    </span>
                    <span className="block text-[10px] text-slate-500">
                      활동 {a.activeMonthsCount}개월 평균
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Monthly Multi-Year Comparison Chart */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-2xs p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600 shrink-0" />
              <span>1월 ~ 12월 연도별 추이 비교</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              각 월 막대에 마우스를 올리거나 터치하면 연도별 상세 금액과 전년 대비 차이를 확인할 수 있습니다.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto">
            {[
              { id: 'expense' as const, label: '월별 지출' },
              { id: 'income' as const, label: '월별 수입' },
              { id: 'savings' as const, label: '순저축' },
              { id: 'cumulative' as const, label: '누적 지출' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setChartMetric(m.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  chartMetric === m.id
                    ? 'bg-white text-blue-700 shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart Legend & Hover readout */}
        <div className="flex flex-wrap items-center justify-between gap-2 min-h-[28px]">
          <div className="flex items-center gap-3 flex-wrap">
            {chartSeries.map((s) => (
              <div key={s.year} className="flex items-center gap-1.5 text-xs font-black text-slate-700">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: s.color.hex }} />
                <span>{s.year}년</span>
              </div>
            ))}
          </div>

          {hoveredMonth !== null && (
            <div className="flex items-center gap-2 flex-wrap px-3 py-1 bg-slate-900 text-white rounded-xl text-xs font-bold animate-in fade-in duration-100">
              <span className="text-blue-300 font-black">{monthLabels[hoveredMonth]}</span>
              {chartSeries.map((s) => (
                <span key={s.year} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color.hex }} />
                  <span>{s.year}:</span>
                  <span className="font-black">
                    {s.values[hoveredMonth].toLocaleString('ko-KR')}원
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Grouped Bar Chart (Responsive) */}
        <div className="w-full overflow-x-auto pb-1">
          <div className="min-w-[540px]">
            <div className="grid grid-cols-12 gap-1.5 items-end h-52 pt-4 pb-2 px-1 border-b border-slate-200 bg-gradient-to-t from-slate-50/70 to-transparent rounded-t-xl">
              {monthLabels.map((mLabel, mIdx) => {
                const isHovered = hoveredMonth === mIdx;
                return (
                  <div
                    key={mLabel}
                    onMouseEnter={() => setHoveredMonth(mIdx)}
                    onMouseLeave={() => setHoveredMonth(null)}
                    onClick={() => setHoveredMonth(isHovered ? null : mIdx)}
                    className={`h-full flex flex-col justify-end items-center gap-1 px-0.5 rounded-lg transition cursor-pointer ${
                      isHovered ? 'bg-blue-50/90 ring-1 ring-blue-200' : 'hover:bg-slate-100/70'
                    }`}
                  >
                    <div className="w-full flex-1 flex items-end justify-center gap-0.5 sm:gap-1 px-0.5">
                      {chartSeries.map((s) => {
                        const rawVal = s.values[mIdx];
                        const val = Math.max(0, rawVal);
                        const heightPct = maxChartVal > 0 ? Math.max(val > 0 ? 3 : 0, (val / maxChartVal) * 100) : 0;
                        return (
                          <div
                            key={s.year}
                            className="flex-1 max-w-[18px] h-full flex items-end justify-center"
                            title={`${mLabel} ${s.year}년: ${rawVal.toLocaleString('ko-KR')}원`}
                          >
                            <div
                              className="w-full rounded-t-md transition-all duration-300"
                              style={{
                                height: `${Math.min(100, heightPct)}%`,
                                backgroundColor: rawVal < 0 ? '#E11D48' : s.color.hex,
                                opacity: isHovered ? 1 : 0.88,
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <span
                      className={`text-[11px] font-bold pb-0.5 ${
                        isHovered ? 'text-blue-700 font-black' : 'text-slate-600'
                      }`}
                    >
                      {mLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Spending Type Structure Comparison (고정 vs 일상 vs 특별) */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-2xs p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-purple-600 shrink-0" />
            <span>지출 성격별 연도 비중 비교 (고정 예산 · 일반 일상 · 특별 지출)</span>
          </h3>
        </div>

        <div className="space-y-3">
          {analyticsByYear.map((a) => {
            const total = a.spendingTypes.recurring + a.spendingTypes.routine + a.spendingTypes.special;
            const recPct = total > 0 ? Math.round((a.spendingTypes.recurring / total) * 100) : 0;
            const routPct = total > 0 ? Math.round((a.spendingTypes.routine / total) * 100) : 0;
            const specPct = total > 0 ? Math.max(0, 100 - recPct - routPct) : 0;

            return (
              <div key={a.year} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-black text-slate-900">{a.year}년</span>
                  <div className="flex items-center gap-3 text-[11px] font-bold flex-wrap">
                    <span className="text-purple-700">
                      📌 고정 {recPct}% ({a.spendingTypes.recurring.toLocaleString('ko-KR')}원)
                    </span>
                    <span className="text-rose-600">
                      🛒 일상 {routPct}% ({a.spendingTypes.routine.toLocaleString('ko-KR')}원)
                    </span>
                    <span className="text-amber-600">
                      🛋️ 특별 {specPct}% ({a.spendingTypes.special.toLocaleString('ko-KR')}원)
                    </span>
                  </div>
                </div>
                <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${recPct}%` }}
                    className="h-full bg-purple-600 transition-all"
                    title={`고정 예산: ${recPct}%`}
                  />
                  <div
                    style={{ width: `${routPct}%` }}
                    className="h-full bg-rose-400 transition-all"
                    title={`일반 일상: ${routPct}%`}
                  />
                  <div
                    style={{ width: `${specPct}%` }}
                    className="h-full bg-amber-400 transition-all"
                    title={`특별 지출: ${specPct}%`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category YoY Comparison Table */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>카테고리별 연도 대비표 ({categoryComparisonRows.rows.length}개 분류)</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              금액 셀을 클릭하면 해당 연도·카테고리의 상세 지출 내역을 바로 펼쳐볼 수 있습니다.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={catSearch}
                onChange={(e) => setCatSearch(e.target.value)}
                placeholder="카테고리 검색..."
                className="w-36 sm:w-44 pl-7 pr-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
              />
            </div>
            <select
              value={catSortBy}
              onChange={(e) => setCatSortBy(e.target.value as any)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 cursor-pointer"
            >
              <option value="latest">최신 연도 지출순</option>
              <option value="diffDesc">증감액 큰 순</option>
              <option value="pctDesc">증감률 큰 순</option>
              <option value="name">이름순</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-4 font-black sticky left-0 bg-slate-50 z-10 min-w-[120px]">
                  카테고리
                </th>
                {analyticsByYear.map((a, idx) => (
                  <th key={a.year} className="py-2.5 px-3 font-black text-right whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: YEAR_PALETTE[idx % YEAR_PALETTE.length].hex }}
                      />
                      <span>{a.year}년</span>
                    </span>
                  </th>
                ))}
                {categoryComparisonRows.prevYear !== null && (
                  <th className="py-2.5 px-4 font-black text-right whitespace-nowrap">
                    전년 대비 ({categoryComparisonRows.prevYear} → {categoryComparisonRows.latestYear})
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categoryComparisonRows.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={analyticsByYear.length + 2}
                    className="py-10 text-center text-slate-400 font-bold"
                  >
                    표시할 카테고리 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                categoryComparisonRows.rows.map((row) => (
                  <tr key={row.category} className="hover:bg-blue-50/40 transition">
                    <td className="py-2.5 px-4 font-black text-slate-800 sticky left-0 bg-white">
                      {row.category}
                    </td>
                    {analyticsByYear.map((a) => {
                      const val = row.perYear[a.year] || 0;
                      return (
                        <td key={a.year} className="py-2.5 px-3 text-right whitespace-nowrap">
                          {val > 0 ? (
                            <button
                              type="button"
                              onClick={() => handleOpenCellDrilldown(a.year, row.category)}
                              className="font-bold text-slate-900 hover:text-blue-600 hover:underline cursor-pointer"
                            >
                              {val.toLocaleString('ko-KR')}원
                            </button>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      );
                    })}
                    {categoryComparisonRows.prevYear !== null && (
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-black text-[11px] ${
                            row.diff > 0
                              ? 'bg-rose-50 text-rose-700'
                              : row.diff < 0
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {row.diff > 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : row.diff < 0 ? (
                            <TrendingDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3" />
                          )}
                          <span>
                            {row.diff > 0 ? '+' : ''}
                            {row.diff.toLocaleString('ko-KR')}원
                          </span>
                          <span className="opacity-75">
                            ({row.pct > 0 ? '+' : ''}
                            {row.pct}%)
                          </span>
                        </span>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Category Year Drill-down Modal */}
      {drilldownCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h4 className="text-sm sm:text-base font-black">
                  {drilldownCell.year}년 [{drilldownCell.category}] 상세 내역 ({drilldownCell.txs.length}건)
                </h4>
                <p className="text-xs text-slate-300">
                  합계:{' '}
                  <strong className="text-white">
                    {drilldownCell.txs
                      .reduce((s, t) => s + (Number(t.amount) || 0), 0)
                      .toLocaleString('ko-KR')}
                    원
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrilldownCell(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-3 sm:p-4">
              {drilldownCell.txs.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-8">일치하는 내역이 없습니다.</p>
              ) : (
                drilldownCell.txs.map((tx) => (
                  <div
                    key={tx.id}
                    className="py-2.5 px-2 flex items-center justify-between gap-2 text-xs hover:bg-slate-50 rounded-lg"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-500 shrink-0">
                          {formatShortDate(tx.date)}
                        </span>
                        <span className="font-black text-slate-900 truncate">{tx.description}</span>
                      </div>
                      {(tx.paymentMethod || tx.memo) && (
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">
                          {tx.paymentMethod ? `[${tx.paymentMethod}] ` : ''}
                          {tx.memo || ''}
                        </div>
                      )}
                    </div>
                    <span className="font-black text-rose-600 shrink-0">
                      -{Number(tx.amount).toLocaleString('ko-KR')}원
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
