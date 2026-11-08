import React from 'react';
import {
  Sparkles,
  X,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ArrowRight,
  ExternalLink,
  Layers,
  Check,
  Loader2,
} from 'lucide-react';
import { MonthMigrationResult } from '../services/googleSheets';

interface MigrationAllMonthsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunMigration: () => Promise<void>;
  isMigrating: boolean;
  progress: { month: string; index: number; total: number; message: string } | null;
  results: MonthMigrationResult[] | null;
  totalMigratedTxs: number;
  spreadsheetTitle: string;
  spreadsheetUrl?: string;
  isRealGoogleConnected: boolean;
  onLogin: () => void;
}

export const MigrationAllMonthsModal: React.FC<MigrationAllMonthsModalProps> = ({
  isOpen,
  onClose,
  onRunMigration,
  isMigrating,
  progress,
  results,
  totalMigratedTxs,
  spreadsheetTitle,
  spreadsheetUrl,
  isRealGoogleConnected,
  onLogin,
}) => {
  if (!isOpen) return null;

  const isCompleted = results !== null && !isMigrating;
  const progressPercent = progress ? Math.round((progress.index / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-400 border border-indigo-400/30 rounded-xl">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold">
                  2026년 전체 시트(1월~12월) 컬럼 분리 & 정리
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/30 text-indigo-300 border border-indigo-400/40">
                  9개 표준 컬럼
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                대상: <strong className="text-white">{spreadsheetTitle}</strong> (1월 ~ 12월 전체 탭)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isMigrating}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl transition cursor-pointer disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 text-slate-800 text-xs sm:text-sm">
          {/* Comparison Cards: Before vs After */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block">
                ❌ 기존 방식 (문제점)
              </span>
              <ul className="text-xs text-slate-600 space-y-1.5">
                <li className="flex items-start gap-1.5">
                  <span className="text-rose-500 font-bold shrink-0">•</span>
                  <span>
                    비고 하나에 <code>[정기예산]</code>, <code>[세부품목: ...]</code> 텍스트가 몰려 있어 엑셀 필터링이나 피벗이 불편함
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-rose-500 font-bold shrink-0">•</span>
                  <span>신규 추가 항목이 5000번대 행으로 밀려 저장되는 현상 발생</span>
                </li>
              </ul>
            </div>

            <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
              <span className="text-[11px] font-extrabold text-indigo-700 uppercase tracking-wider block">
                ✨ 변경 후 (9개 전용 컬럼 분리)
              </span>
              <ul className="text-xs text-indigo-950 space-y-1.5">
                <li className="flex items-start gap-1.5">
                  <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>지출유형</strong> 컬럼 신설: <code>정</code>(정기예산) / <code>특</code>(특별지출) / 빈칸(일반)
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>세부품목</strong> 컬럼 분리: <code>우유 (식비) 2,500원</code> 형태로 저장
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>비고</strong> 컬럼: 태그 없는 순수 메모만 남김
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                  <span>
                    5000대 행 데이터를 2행부터 연속으로 <strong>빈틈없이 압축 정렬</strong>
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* Standard 9 Columns Preview Banner */}
          <div className="p-3 bg-slate-900 text-white rounded-xl font-mono text-[11px] overflow-x-auto">
            <span className="text-[10px] text-slate-400 block mb-1 font-sans font-bold">
              구글 시트 1행 헤더 구조:
            </span>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              {['날짜', '구분', '분류', '내용/사용처', '금액', '결제수단', '지출유형', '세부품목', '비고'].map(
                (h, idx) => (
                  <span
                    key={h}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      idx >= 6 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'
                    }`}
                  >
                    {h}
                  </span>
                )
              )}
            </div>
          </div>

          {/* Live Progress Bar (when executing) */}
          {isMigrating && progress && (
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                  <span>{progress.message}</span>
                </span>
                <span className="text-indigo-600">{progressPercent}%</span>
              </div>
              <div className="w-full h-2.5 bg-indigo-200/70 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Completed Results Summary */}
          {isCompleted && results && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3 animate-in fade-in">
              <div className="flex items-center gap-2 text-emerald-900 font-extrabold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>
                  2026년 1월~12월 전체 시트 마이그레이션이 성공적으로 완료되었습니다!
                </span>
              </div>
              <p className="text-xs text-emerald-800">
                총 <strong className="font-bold underline">{totalMigratedTxs}건</strong>의 거래 내역이 지출유형, 세부품목, 순수 비고 컬럼으로 분리되고 2행부터 연속 압축 저장되었습니다.
              </p>

              {/* Monthly breakdown table */}
              <div className="max-h-40 overflow-y-auto border border-emerald-200/80 rounded-lg bg-white/80 divide-y divide-emerald-100 text-[11px]">
                {results.map((r) => (
                  <div key={r.monthTitle} className="px-3 py-1.5 flex items-center justify-between">
                    <span className="font-bold text-slate-800">{r.monthTitle}</span>
                    <span className="flex items-center gap-1.5">
                      {r.status === 'migrated' && (
                        <span className="text-emerald-700 font-semibold">
                          {r.count}건 분리 & 압축 완료
                        </span>
                      )}
                      {r.status === 'initialized' && (
                        <span className="text-blue-600 font-medium">9개 컬럼 헤더 초기화됨</span>
                      )}
                      {r.status === 'created_and_initialized' && (
                        <span className="text-indigo-600 font-medium">신규 탭 생성 & 9개 컬럼 초기화됨</span>
                      )}
                      {r.status === 'error' && (
                        <span className="text-rose-600 font-medium">실패: {r.error}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            {spreadsheetUrl && (
              <a
                href={spreadsheetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>스프레드시트 열기</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isMigrating}
              className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200/80 rounded-xl transition cursor-pointer disabled:opacity-40"
            >
              {isCompleted ? '확인 및 닫기' : '취소'}
            </button>

            {!isCompleted && (
              <>
                {!isRealGoogleConnected ? (
                  <button
                    type="button"
                    onClick={onLogin}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                  >
                    <span>Google 로그인 후 실행하기</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onRunMigration}
                    disabled={isMigrating}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {isMigrating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>전체 시트 변환 진행 중...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>지금 1월~12월 전체 시트 일괄 변환 실행</span>
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
