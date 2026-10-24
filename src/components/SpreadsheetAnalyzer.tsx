import React, { useState } from 'react';
import {
  Table,
  CheckCircle2,
  Calendar,
  CreditCard,
  Tag,
  ExternalLink,
  Plus,
  Sliders,
  ChevronRight,
  Database,
  Layers,
} from 'lucide-react';
import { SheetAnalysisResult, ColumnMapping } from '../types/ledger';

interface SpreadsheetAnalyzerProps {
  analysis: SheetAnalysisResult;
  spreadsheetUrl?: string;
  onUpdateMapping?: (mapping: ColumnMapping) => void;
  onAddMonthTab?: (monthName: string) => Promise<void>;
  isRealGoogleConnected: boolean;
}

export const SpreadsheetAnalyzer: React.FC<SpreadsheetAnalyzerProps> = ({
  analysis,
  spreadsheetUrl,
  onUpdateMapping,
  onAddMonthTab,
  isRealGoogleConnected,
}) => {
  const [isEditingMapping, setIsEditingMapping] = useState(false);
  const [tempMapping, setTempMapping] = useState<ColumnMapping>(analysis.mapping);
  const [newMonthName, setNewMonthName] = useState('');
  const [isCreatingMonth, setIsCreatingMonth] = useState(false);

  const columnLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];

  const handleSaveMapping = () => {
    if (onUpdateMapping) {
      onUpdateMapping(tempMapping);
    }
    setIsEditingMapping(false);
  };

  const handleCreateMonth = async () => {
    if (!newMonthName.trim() || !onAddMonthTab) return;
    setIsCreatingMonth(true);
    try {
      await onAddMonthTab(newMonthName.trim());
      setNewMonthName('');
    } catch (e) {
      console.error(e);
    } finally {
      setIsCreatingMonth(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md shadow-slate-100 overflow-hidden">
      {/* Header */}
      <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">스프레드시트 구조 분석 리포트</h3>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                자동 분석 완료
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              현재 연결된 스프레드시트의 열 구성, 월별 시트 탭, 과거 지출 패턴을 분석했습니다.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsEditingMapping(!isEditingMapping)}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5 text-slate-500" />
            <span>{isEditingMapping ? '닫기' : '열 매핑 수동 조정'}</span>
          </button>

          {spreadsheetUrl && (
            <a
              href={spreadsheetUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition flex items-center gap-1.5 shadow-xs"
            >
              <span>스프레드시트 원본 열기</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-6">
        {/* Manual Column Mapping Section (Toggleable) */}
        {isEditingMapping && (
          <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-2xl animate-in fade-in duration-200">
            <h4 className="text-sm font-bold text-slate-900 mb-2">스프레드시트 열(Column) 매핑 설정</h4>
            <p className="text-xs text-slate-600 mb-4">
              기존에 사용하시던 엑셀 서식에 맞게 각 항목이 위치한 열을 지정할 수 있습니다.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 mb-1 block">날짜 열</label>
                <select
                  value={tempMapping.dateCol}
                  onChange={(e) =>
                    setTempMapping({ ...tempMapping, dateCol: parseInt(e.target.value, 10) })
                  }
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-medium"
                >
                  {columnLetters.map((col, idx) => (
                    <option key={col} value={idx}>
                      {col}열 ({analysis.mapping.detectedHeaders[idx] || `Column ${col}`})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 mb-1 block">분류(카테고리) 열</label>
                <select
                  value={tempMapping.categoryCol}
                  onChange={(e) =>
                    setTempMapping({ ...tempMapping, categoryCol: parseInt(e.target.value, 10) })
                  }
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-medium"
                >
                  {columnLetters.map((col, idx) => (
                    <option key={col} value={idx}>
                      {col}열 ({analysis.mapping.detectedHeaders[idx] || `Column ${col}`})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 mb-1 block">내용/사용처 열</label>
                <select
                  value={tempMapping.descCol}
                  onChange={(e) =>
                    setTempMapping({ ...tempMapping, descCol: parseInt(e.target.value, 10) })
                  }
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-medium"
                >
                  {columnLetters.map((col, idx) => (
                    <option key={col} value={idx}>
                      {col}열 ({analysis.mapping.detectedHeaders[idx] || `Column ${col}`})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 mb-1 block">금액 열</label>
                <select
                  value={tempMapping.amountCol}
                  onChange={(e) =>
                    setTempMapping({ ...tempMapping, amountCol: parseInt(e.target.value, 10) })
                  }
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-medium"
                >
                  {columnLetters.map((col, idx) => (
                    <option key={col} value={idx}>
                      {col}열 ({analysis.mapping.detectedHeaders[idx] || `Column ${col}`})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditingMapping(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveMapping}
                className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs"
              >
                매핑 저장
              </button>
            </div>
          </div>
        )}

        {/* 3 Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Detected Column Headers Card */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70">
            <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-700">
              <Table className="w-4 h-4 text-blue-600" />
              <span>헤더 열 인식 ({analysis.mapping.detectedHeaders.length}개)</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {analysis.mapping.detectedHeaders.map((header, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800 shadow-2xs"
                >
                  <span className="text-[10px] text-blue-600 font-bold">{columnLetters[idx]}</span>
                  <span>{header || '(미지정)'}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Month Tabs Card */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70">
            <div className="flex items-center justify-between mb-2 text-xs font-bold text-slate-700">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span>월별 시트 탭 ({analysis.sheetTabs.length}개)</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {analysis.sheetTabs.map((tab) => (
                <span
                  key={tab.id}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    analysis.activeSheetTitle === tab.title
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white border border-slate-200 text-slate-700'
                  }`}
                >
                  {tab.title}
                </span>
              ))}
            </div>

            {/* Quick Add Month Tab */}
            {isRealGoogleConnected && onAddMonthTab && (
              <div className="mt-3 pt-3 border-t border-slate-200/80 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="예: 5월, 6월"
                  value={newMonthName}
                  onChange={(e) => setNewMonthName(e.target.value)}
                  className="flex-1 px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg"
                />
                <button
                  type="button"
                  onClick={handleCreateMonth}
                  disabled={isCreatingMonth || !newMonthName.trim()}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition disabled:opacity-50 cursor-pointer shrink-0 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>{isCreatingMonth ? '생성 중...' : '시트 추가'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Payment Methods Card */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70">
            <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-700">
              <CreditCard className="w-4 h-4 text-indigo-600" />
              <span>인식된 결제 수단 ({analysis.detectedPaymentMethods.length}개)</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {analysis.detectedPaymentMethods.map((pm, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700"
                >
                  {pm}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Categories Discovered */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
              <Tag className="w-3.5 h-3.5 text-blue-600" />
              <span>기존 시트에서 발견된 지출 분류 및 누적 금액</span>
            </h4>
            <span className="text-xs text-slate-500 font-medium">
              총 {analysis.detectedCategories.length}개 카테고리
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {analysis.detectedCategories.map((cat, idx) => (
              <div
                key={idx}
                className="p-3 bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:border-blue-300 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 truncate">{cat.name}</span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                      cat.type === 'income'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {cat.type === 'income' ? '수입' : '지출'}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between text-xs">
                  <span className="text-slate-400 font-medium">{cat.count}건</span>
                  <span className="font-extrabold text-slate-800">
                    {cat.totalAmount.toLocaleString('ko-KR')}원
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Raw Preview from Sheets */}
        {analysis.rawSampleRows && analysis.rawSampleRows.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-slate-700">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>Google Sheets 원본 데이터 샘플 (첫 {analysis.rawSampleRows.length}행)</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs border-collapse">
                <tbody>
                  {analysis.rawSampleRows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className={rIdx === analysis.mapping.headerRowIndex ? 'bg-blue-50/70 font-bold text-blue-900' : 'hover:bg-slate-50 border-t border-slate-100'}
                    >
                      <td className="p-2 text-slate-400 font-mono text-[10px] bg-slate-50/50 w-8 text-center border-r border-slate-100">
                        {rIdx + 1}
                      </td>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="p-2.5 text-slate-700 max-w-[160px] truncate">
                          {cell || <span className="text-slate-300 italic">-</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
