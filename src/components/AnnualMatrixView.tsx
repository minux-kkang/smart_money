import React, { useState, useMemo } from 'react';
import {
  Table,
  TrendingDown,
  TrendingUp,
  PiggyBank,
  Sparkles,
  ArrowUpDown,
  Filter,
  Tag,
  Layers,
} from 'lucide-react';
import { USER_2026_DATA, YearDashboardData, CategoryMonthlyData } from '../data/userLedgerData';
import { Transaction } from '../types/ledger';

interface AnnualMatrixViewProps {
  yearData?: YearDashboardData;
  onSelectMonth?: (monthTitle: string) => void;
  transactions?: Transaction[];
}

const CATEGORY_COLOR_PALETTE = [
  '#3B82F6', // blue-500
  '#10B981', // emerald-500
  '#F59E0B', // amber-500
  '#8B5CF6', // purple-500
  '#EC4899', // pink-500
  '#06B6D4', // cyan-500
  '#F97316', // orange-500
  '#14B8A6', // teal-500
  '#84CC16', // lime-500
  '#6366F1', // indigo-500
  '#E11D48', // rose-600
  '#0284C7', // sky-600
  '#D97706', // amber-600
  '#9333EA', // purple-600
  '#059669', // emerald-600
  '#EA580C', // orange-600
  '#4F46E5', // indigo-600
  '#DB2777', // pink-600
  '#0D9488', // teal-600
  '#65A30D', // lime-600
  '#2563EB', // blue-600
  '#CA8A04', // yellow-600
  '#7C3AED', // violet-600
  '#C026D3', // fuchsia-600
  '#0891B2', // cyan-600
  '#64748B', // slate-500
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

const SPECIAL_EXPENSE_CATEGORIES = new Set([
  '여행비',
  '골프',
  '경조사',
]);

export const AnnualMatrixView: React.FC<AnnualMatrixViewProps> = ({
  yearData = USER_2026_DATA,
  onSelectMonth,
  transactions,
}) => {
  const [sortField, setSortField] = useState<'total' | 'name'>('total');
  const [filterZero, setFilterZero] = useState<boolean>(true);
  const [searchCat, setSearchCat] = useState<string>('');
  // Annual chart view mode: 'category' (stacked colors per category) vs 'spendingType' (고정, 일반, 특별 구분)
  const [chartViewMode, setChartViewMode] = useState<'category' | 'spendingType'>('category');

  const months = useMemo(() => ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'], []);

  // Map each category to a distinct color
  const categoryColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    yearData.categories.forEach((cat, idx) => {
      map[cat.category] = CATEGORY_COLOR_PALETTE[idx % CATEGORY_COLOR_PALETTE.length];
    });
    return map;
  }, [yearData.categories]);

  // Top categories for chart legend
  const topCategoriesForLegend = useMemo(() => {
    return [...yearData.categories]
      .filter((c) => c.annualTotal > 0)
      .sort((a, b) => b.annualTotal - a.annualTotal)
      .slice(0, 10);
  }, [yearData.categories]);

  // Monthly breakdown by spending types (고정예산, 일반일상, 특별지출)
  const monthlySpendingTypeData = useMemo(() => {
    return months.map((monthStr, mIdx) => {
      const mNum = mIdx + 1;
      let rec = 0;
      let spec = 0;
      let rout = 0;

      // Extract from transactions if available
      const monthTx = (transactions || []).filter((t) => {
        if (t.type && t.type !== 'expense') return false;
        let txMonth: number | null = null;
        if (t.date) {
          const ym = t.date.match(/^(\d{4})[-.\/](\d{1,2})/);
          if (ym) txMonth = parseInt(ym[2], 10);
          else {
            const m = t.date.match(/(\d{1,2})월/);
            if (m) txMonth = parseInt(m[1], 10);
          }
        }
        if (txMonth === null && t.sheetTitle) {
          const sm = t.sheetTitle.match(/(\d{1,2})월/);
          if (sm) txMonth = parseInt(sm[1], 10);
        }
        return txMonth === mNum;
      });

      if (monthTx.length > 0) {
        monthTx.forEach((t) => {
          const isRec = Boolean(
            t.isRecurring ||
            t.memo?.includes('[정기예산]') ||
            t.memo?.includes('[고정지출]') ||
            t.memo?.includes('[고정]')
          );
          const isSpec = Boolean(
            t.isSpecial ||
            t.memo?.includes('[특별지출]') ||
            t.memo?.includes('[특별]') ||
            t.memo?.includes('[비정기]')
          );
          if (isRec) rec += t.amount;
          else if (isSpec) spec += t.amount;
          else rout += t.amount;
        });
      } else {
        // Fallback to yearData.categories monthly numbers
        yearData.categories.forEach((cat) => {
          const amt = cat.monthly[mIdx] || 0;
          if (FIXED_BUDGET_CATEGORIES.has(cat.category)) {
            rec += amt;
          } else if (SPECIAL_EXPENSE_CATEGORIES.has(cat.category)) {
            spec += amt;
          } else {
            rout += amt;
          }
        });
      }

      const total = rec + spec + rout;
      return {
        month: monthStr,
        total,
        recurring: rec,
        routine: rout,
        special: spec,
      };
    });
  }, [months, transactions, yearData.categories]);

  // Annual sums for spending types
  const annualSpendingTypeTotals = useMemo(() => {
    const recurring = monthlySpendingTypeData.reduce((s, m) => s + m.recurring, 0);
    const routine = monthlySpendingTypeData.reduce((s, m) => s + m.routine, 0);
    const special = monthlySpendingTypeData.reduce((s, m) => s + m.special, 0);
    const total = recurring + routine + special;
    return {
      recurring,
      routine,
      special,
      total,
      recurringRate: total > 0 ? Math.round((recurring / total) * 100) : 0,
      routineRate: total > 0 ? Math.round((routine / total) * 100) : 0,
      specialRate: total > 0 ? Math.round((special / total) * 100) : 0,
    };
  }, [monthlySpendingTypeData]);

  // Calculate monthly total across all categories
  const monthlyTotals = months.map((_, mIdx) => {
    return yearData.categories.reduce((sum, cat) => sum + (cat.monthly[mIdx] || 0), 0);
  });

  const categories = [...yearData.categories]
    .filter((cat) => {
      if (filterZero && cat.annualTotal === 0) return false;
      if (searchCat.trim() && !cat.category.toLowerCase().includes(searchCat.trim().toLowerCase())) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortField === 'total') return b.annualTotal - a.annualTotal;
      return a.category.localeCompare(b.category);
    });

  const balance = yearData.totalIncome - yearData.totalExpense;
  const savingRate = yearData.totalIncome > 0 ? Math.round((balance / yearData.totalIncome) * 100) : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 2026 Annual Overview Summary Card (Consolidated & Zero Waste) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Main Row: Annual Net Balance */}
        <div className="p-3.5 sm:p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-slate-300 font-bold">2026 연간 누적 잔액</span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-500/30 text-blue-200">
                연간 저축률 {savingRate}%
              </span>
            </div>
            <div
              className={`text-xl sm:text-2xl font-black mt-0.5 tracking-tight ${
                balance >= 0 ? 'text-blue-400' : 'text-rose-400'
              }`}
            >
              {balance >= 0 ? '+' : ''}
              {balance.toLocaleString('ko-KR')}
              <span className="text-xs font-normal text-slate-300 ml-1">원</span>
            </div>
          </div>

          <div className="text-right text-xs shrink-0">
            <span className="text-[10px] sm:text-[11px] text-slate-400 block font-medium">집계 기준</span>
            <span className="text-xs sm:text-sm font-bold text-slate-200">2026 Dashboard</span>
          </div>
        </div>

        {/* 2 Pillars: 연간 총 수입 vs 연간 총 지출 */}
        <div className="grid grid-cols-2 divide-x divide-slate-150 bg-slate-50/80 py-2.5 px-1 sm:px-3">
          {/* 총 수입 */}
          <div className="px-2.5 sm:px-4 py-1 flex items-center justify-between min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-[11px] sm:text-xs font-bold text-slate-500 truncate">
                  2026 총 수입
                </span>
              </div>
              <p className="text-sm sm:text-lg font-black text-emerald-600 truncate mt-0.5">
                {yearData.totalIncome.toLocaleString('ko-KR')}원
              </p>
            </div>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 ml-1.5 shadow-2xs">
              <TrendingUp className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>

          {/* 총 지출 */}
          <div className="px-2.5 sm:px-4 py-1 flex items-center justify-between min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                <span className="text-[11px] sm:text-xs font-bold text-slate-500 truncate">
                  2026 총 지출
                </span>
              </div>
              <p className="text-sm sm:text-lg font-black text-rose-600 truncate mt-0.5">
                {yearData.totalExpense.toLocaleString('ko-KR')}원
              </p>
            </div>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 ml-1.5 shadow-2xs">
              <TrendingDown className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Expenditure Bar Trends (Stacked Bars & Dual View Modes) */}
      <div className="p-4 sm:p-6 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
              <span>2026년 월별 총 지출 추이 (1월 ~ 12월)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              각 월 막대를 클릭하면 해당 월의 가계부로 이동합니다.
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => setChartViewMode('category')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                  chartViewMode === 'category'
                    ? 'bg-white text-indigo-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>카테고리별 보기</span>
              </button>
              <button
                type="button"
                onClick={() => setChartViewMode('spendingType')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                  chartViewMode === 'spendingType'
                    ? 'bg-white text-indigo-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>고정·일반·특별 구분</span>
              </button>
            </div>

            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200/80 shrink-0">
              최고 지출: 9월 ({Math.max(...monthlyTotals).toLocaleString('ko-KR')}원)
            </span>
          </div>
        </div>

        {/* Visual Monthly Stacked Bars: 12 months in a single chronological row with horizontal scroll on narrow screens */}
        <div className="overflow-x-auto pb-2 pt-2 scrollbar-none">
          <div className="min-w-[520px] sm:min-w-0 grid grid-cols-12 gap-1.5 sm:gap-2.5 items-end h-44 sm:h-48">
            {months.map((m, idx) => {
              const amt = monthlyTotals[idx];
              const max = Math.max(...monthlyTotals, 1);
              const heightPercent = amt > 0 ? Math.max(Math.round((amt / max) * 100), 6) : 0;
              const isMax = amt === Math.max(...monthlyTotals);

              // Categories with positive amounts for this month, sorted descending
              const monthCats = yearData.categories
                .filter((c) => (c.monthly[idx] || 0) > 0)
                .sort((a, b) => (b.monthly[idx] || 0) - (a.monthly[idx] || 0));

              // Spending type breakdown
              const st = monthlySpendingTypeData[idx];
              const stTotal = (st?.total && st.total > 0) ? st.total : amt;

              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => onSelectMonth && onSelectMonth(m)}
                  className="group flex flex-col items-center h-full justify-end cursor-pointer transition active:scale-95"
                  title={`${m}: ${amt.toLocaleString('ko-KR')}원 (클릭하여 ${m} 가계부 보기)`}
                >
                  <span
                    className={`text-[10px] font-bold mb-1 transition truncate max-w-full ${
                      isMax ? 'text-indigo-600 font-extrabold' : 'text-slate-500'
                    }`}
                  >
                    {amt > 0 ? `${(amt / 10000).toFixed(0)}만` : '-'}
                  </span>
                  <div className="w-full bg-slate-100 rounded-t-lg overflow-hidden flex flex-col justify-end h-28 sm:h-32 group-hover:bg-slate-200/70 transition p-0.5">
                    {amt > 0 ? (
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className="w-full rounded-t-md overflow-hidden flex flex-col-reverse justify-start transition-all duration-300 shadow-2xs"
                      >
                        {chartViewMode === 'category' ? (
                          // Mode 1: Stacked by categories with distinct colors
                          monthCats.map((cat) => {
                            const catAmt = cat.monthly[idx] || 0;
                            const catPct = (catAmt / amt) * 100;
                            const color = categoryColorMap[cat.category] || '#94A3B8';
                            return (
                              <div
                                key={cat.category}
                                style={{ height: `${catPct}%`, backgroundColor: color }}
                                className="w-full transition-opacity hover:opacity-85"
                                title={`${cat.category}: ${catAmt.toLocaleString('ko-KR')}원 (${Math.round(catPct)}%)`}
                              />
                            );
                          })
                        ) : (
                          // Mode 2: Stacked by spending types (고정예산, 일반일상, 특별지출)
                          <>
                            {st && st.recurring > 0 && (
                              <div
                                style={{
                                  height: `${(st.recurring / stTotal) * 100}%`,
                                  backgroundColor: '#9333EA',
                                }}
                                className="w-full transition-opacity hover:opacity-85"
                                title={`📌 고정 예산: ${st.recurring.toLocaleString('ko-KR')}원 (${Math.round((st.recurring / stTotal) * 100)}%)`}
                              />
                            )}
                            {st && st.routine > 0 && (
                              <div
                                style={{
                                  height: `${(st.routine / stTotal) * 100}%`,
                                  backgroundColor: '#FB7185',
                                }}
                                className="w-full transition-opacity hover:opacity-85"
                                title={`🛒 일반 일상 지출: ${st.routine.toLocaleString('ko-KR')}원 (${Math.round((st.routine / stTotal) * 100)}%)`}
                              />
                            )}
                            {st && st.special > 0 && (
                              <div
                                style={{
                                  height: `${(st.special / stTotal) * 100}%`,
                                  backgroundColor: '#F59E0B',
                                }}
                                className="w-full transition-opacity hover:opacity-85"
                                title={`🛋️ 특별(비정기) 지출: ${st.special.toLocaleString('ko-KR')}원 (${Math.round((st.special / stTotal) * 100)}%)`}
                              />
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="w-full h-1 bg-slate-300 rounded-full" />
                    )}
                  </div>
                  <span
                    className={`text-xs font-black mt-1.5 transition ${
                      isMax ? 'text-indigo-700 font-black' : 'text-slate-700 group-hover:text-blue-600'
                    }`}
                  >
                    {m}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Legend based on View Mode */}
        {chartViewMode === 'category' ? (
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs">
            <span className="font-bold text-slate-700 text-[11px] shrink-0">주요 카테고리:</span>
            {topCategoriesForLegend.map((cat) => (
              <div
                key={cat.category}
                className="flex items-center gap-1.5 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200/70"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                  style={{ backgroundColor: categoryColorMap[cat.category] || '#94A3B8' }}
                />
                <span className="font-semibold text-slate-700 text-[11px]">{cat.category}</span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {(cat.annualTotal / 10000).toFixed(0)}만
                </span>
              </div>
            ))}
            <span className="text-[11px] text-slate-400 ml-auto hidden md:inline-block">
              💡 막대의 각 색상 영역을 터치하거나 마우스를 올리면 세부 금액을 볼 수 있습니다
            </span>
          </div>
        ) : (
          <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-purple-50/70 border border-purple-200/70">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#9333EA] shadow-2xs shrink-0" />
                <span className="text-xs font-bold text-purple-900">📌 고정 예산</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-black text-purple-900">
                  {annualSpendingTypeTotals.recurring.toLocaleString('ko-KR')}원
                </span>
                <span className="text-[10px] text-purple-600 font-bold ml-1.5">
                  ({annualSpendingTypeTotals.recurringRate}%)
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50/70 border border-rose-200/70">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#FB7185] shadow-2xs shrink-0" />
                <span className="text-xs font-bold text-rose-900">🛒 일반 일상 지출</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-black text-rose-900">
                  {annualSpendingTypeTotals.routine.toLocaleString('ko-KR')}원
                </span>
                <span className="text-[10px] text-rose-600 font-bold ml-1.5">
                  ({annualSpendingTypeTotals.routineRate}%)
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/70">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#F59E0B] shadow-2xs shrink-0" />
                <span className="text-xs font-bold text-amber-900">🛋️ 특별(비정기) 지출</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-black text-amber-900">
                  {annualSpendingTypeTotals.special.toLocaleString('ko-KR')}원
                </span>
                <span className="text-[10px] text-amber-600 font-bold ml-1.5">
                  ({annualSpendingTypeTotals.specialRate}%)
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 26-Category Matrix Table */}
      <div className="p-5 sm:p-6 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Table className="w-4 h-4 text-emerald-600" />
              <span>연간 카테고리별 지출 매트릭스 (2026 가계부 Dashboard)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              사용자 정의 26개 지출 분류와 1월~12월 집계 데이터입니다.
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="분류 검색..."
              value={searchCat}
              onChange={(e) => setSearchCat(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900"
            />
            <button
              onClick={() => setFilterZero(!filterZero)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                filterZero
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-slate-300 text-slate-700'
              }`}
            >
              지출 있는 항목만 보기
            </button>
          </div>
        </div>

        {/* Matrix Table */}
        <div className="overflow-x-auto min-h-[350px] mt-2">
          <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-300">
                <th className="py-3 px-3 sticky left-0 bg-slate-100 z-10 border-r border-slate-200">
                  분류 (26개)
                </th>
                <th className="py-3 px-3 text-right bg-slate-200 text-slate-900 font-black">
                  연간 지출 합계
                </th>
                {months.map((m) => (
                  <th key={m} className="py-3 px-2.5 text-right font-bold text-slate-700">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {categories.map((cat) => (
                <tr key={cat.category} className="hover:bg-blue-50/70 transition">
                  <td className="py-2.5 px-3 font-bold text-slate-900 sticky left-0 bg-white hover:bg-blue-50/70 z-10 border-r border-slate-200">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                      <span>{cat.category}</span>
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-black text-rose-600 bg-slate-50">
                    {cat.annualTotal.toLocaleString('ko-KR')}원
                  </td>
                  {cat.monthly.map((amt, mIdx) => (
                    <td
                      key={mIdx}
                      className={`py-2.5 px-2.5 text-right font-medium ${
                        amt > 0 ? 'text-slate-900 font-bold' : 'text-slate-400'
                      }`}
                    >
                      {amt > 0 ? `${amt.toLocaleString('ko-KR')}원` : '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                <td className="py-3 px-3 sticky left-0 bg-slate-100 z-10 border-r border-slate-200">
                  월별 총 지출 합계
                </td>
                <td className="py-3 px-3 text-right text-rose-700 font-black text-sm bg-slate-200">
                  {yearData.totalExpense.toLocaleString('ko-KR')}원
                </td>
                {monthlyTotals.map((tot, idx) => (
                  <td key={idx} className="py-3 px-2.5 text-right font-black text-slate-900">
                    {tot > 0 ? `${tot.toLocaleString('ko-KR')}원` : '-'}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
