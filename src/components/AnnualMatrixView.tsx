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
      {/* 2026 Annual Overview Summary Cards */}
      <div className="grid grid-cols-1 xs:grid-cols-3 gap-2.5 sm:gap-4">
        <div className="p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <span className="text-[11px] sm:text-xs font-bold text-slate-500 truncate">연간 총 수입</span>
            <div className="p-1 sm:p-1.5 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
              <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-base sm:text-2xl font-black text-slate-900 tracking-tight truncate">
            {yearData.totalIncome.toLocaleString('ko-KR')}
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500 ml-0.5">원</span>
          </div>
          <p className="mt-0.5 text-[10px] sm:text-xs text-slate-400 font-medium truncate hidden xs:block">
            Dashboard 기준
          </p>
        </div>

        <div className="p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <span className="text-[11px] sm:text-xs font-bold text-slate-500 truncate">연간 총 지출</span>
            <div className="p-1 sm:p-1.5 rounded-lg bg-rose-100 text-rose-700 shrink-0">
              <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-base sm:text-2xl font-black text-rose-600 tracking-tight truncate">
            {yearData.totalExpense.toLocaleString('ko-KR')}
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500 ml-0.5">원</span>
          </div>
          <p className="mt-0.5 text-[10px] sm:text-xs text-slate-400 font-medium truncate hidden xs:block">
            1~12월 누적 지출
          </p>
        </div>

        <div className="p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <span className="text-[11px] sm:text-xs font-bold text-slate-500 truncate">누적 잔액</span>
            <div className="p-1 sm:p-1.5 rounded-lg bg-blue-100 text-blue-700 shrink-0">
              <PiggyBank className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-base sm:text-2xl font-black text-blue-600 tracking-tight truncate">
            {balance.toLocaleString('ko-KR')}
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500 ml-0.5">원</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[10px] sm:text-xs">
            <span className="text-slate-400 hidden xs:inline">저축률:</span>
            <span className="font-bold text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded">
              {savingRate}%
            </span>
          </div>
        </div>
      </div>

      {/* Monthly Expenditure Bar Trends */}
      <div className="p-5 sm:p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>2026년 월별 총 지출 추이 (1월 ~ 12월)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              각 월 바를 클릭하면 해당 월의 세부 내역으로 즉시 이동합니다.
            </p>
          </div>
          <span className="text-xs font-bold text-slate-600">
            최고 지출: 9월 ({Math.max(...monthlyTotals).toLocaleString('ko-KR')}원)
          </span>
        </div>

        {/* Visual Monthly Bars */}
        <div className="grid grid-cols-6 sm:grid-cols-12 gap-2 pt-4 pb-2 items-end h-44">
          {months.map((m, idx) => {
            const amt = monthlyTotals[idx];
            const max = Math.max(...monthlyTotals, 1);
            const heightPercent = Math.max(Math.round((amt / max) * 100), 4);
            const isFilled = amt > 0;

            return (
              <button
                key={m}
                onClick={() => onSelectMonth && onSelectMonth(m)}
                className="group flex flex-col items-center h-full justify-end cursor-pointer"
                title={`${m}: ${amt.toLocaleString('ko-KR')}원 (클릭하여 해당 월 보기)`}
              >
                <span className="text-[10px] font-bold text-slate-500 mb-1 group-hover:text-blue-600 transition truncate max-w-full">
                  {amt > 0 ? `${(amt / 10000).toFixed(0)}만` : '-'}
                </span>
                <div className="w-full bg-slate-100 rounded-t-lg overflow-hidden flex items-end h-28 group-hover:bg-slate-200 transition">
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={`w-full rounded-t-lg transition-all duration-300 ${
                      isFilled
                        ? idx === 8
                          ? 'bg-indigo-600 group-hover:bg-indigo-700'
                          : 'bg-blue-600 group-hover:bg-blue-700'
                        : 'bg-slate-300'
                    }`}
                  />
                </div>
                <span className="text-xs font-extrabold text-slate-800 mt-1.5 group-hover:text-blue-600">
                  {m}
                </span>
              </button>
            );
          })}
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
