import React, { useState } from 'react';
import {
  Table,
  TrendingDown,
  TrendingUp,
  PiggyBank,
  Sparkles,
  ArrowUpDown,
  Filter,
} from 'lucide-react';
import { USER_2026_DATA, YearDashboardData, CategoryMonthlyData } from '../data/userLedgerData';

interface AnnualMatrixViewProps {
  yearData?: YearDashboardData;
  onSelectMonth?: (monthTitle: string) => void;
}

export const AnnualMatrixView: React.FC<AnnualMatrixViewProps> = ({
  yearData = USER_2026_DATA,
  onSelectMonth,
}) => {
  const [sortField, setSortField] = useState<'total' | 'name'>('total');
  const [filterZero, setFilterZero] = useState<boolean>(true);
  const [searchCat, setSearchCat] = useState<string>('');

  const months = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

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

      {/* Monthly Expenditure Bar Trends (Isolated & Never Overlapping) */}
      <div className="p-4 sm:p-6 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
              <span>2026년 월별 총 지출 추이 (1월 ~ 12월)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              각 월 막대를 클릭하면 해당 월의 가계부로 즉시 이동합니다.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80">
              최고 지출: 9월 ({Math.max(...monthlyTotals).toLocaleString('ko-KR')}원)
            </span>
          </div>
        </div>

        {/* Visual Monthly Bars: 12 months in a single chronological row with horizontal scroll on narrow screens */}
        <div className="overflow-x-auto pb-2 pt-2 scrollbar-none">
          <div className="min-w-[480px] sm:min-w-0 grid grid-cols-12 gap-1.5 sm:gap-2.5 items-end h-40">
            {months.map((m, idx) => {
              const amt = monthlyTotals[idx];
              const max = Math.max(...monthlyTotals, 1);
              const heightPercent = Math.max(Math.round((amt / max) * 100), 5);
              const isFilled = amt > 0;
              const isMax = amt === Math.max(...monthlyTotals);

              return (
                <button
                  key={m}
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
                  <div className="w-full bg-slate-100 rounded-t-lg overflow-hidden flex items-end h-24 group-hover:bg-slate-200 transition">
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full rounded-t-lg transition-all duration-300 ${
                        isFilled
                          ? isMax
                            ? 'bg-gradient-to-t from-indigo-700 to-indigo-500 group-hover:from-indigo-800 group-hover:to-indigo-600'
                            : 'bg-gradient-to-t from-blue-600 to-sky-500 group-hover:from-blue-700 group-hover:to-sky-600'
                          : 'bg-slate-200'
                      }`}
                    />
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
