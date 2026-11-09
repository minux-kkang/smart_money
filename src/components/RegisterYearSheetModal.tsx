import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Search,
  Plus,
  X,
  RefreshCw,
  FolderOpen,
  Check,
  AlertCircle,
  Calendar,
  Link2,
  Sparkles,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { SpreadsheetFile } from '../types/ledger';
import { listSpreadsheets } from '../services/googleDrive';

interface RegisterYearSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string | null;
  currentYear: string;
  registeredYears: Array<{ year: string; title: string; id: string }>;
  onRegisterYearSheet: (year: string, sheetId: string, sheetTitle: string) => Promise<void>;
}

export const RegisterYearSheetModal: React.FC<RegisterYearSheetModalProps> = ({
  isOpen,
  onClose,
  accessToken,
  currentYear,
  registeredYears,
  onRegisterYearSheet,
}) => {
  // Candidate years e.g. 2026, 2025, 2024, 2023
  const [selectedYear, setSelectedYear] = useState<string>(() => {
    const prevYear = String(Number(currentYear) - 1);
    return prevYear || '2025';
  });
  const [customYearInput, setCustomYearInput] = useState<string>('');

  const [inputMode, setInputMode] = useState<'drive' | 'url'>(accessToken ? 'drive' : 'url');
  const [files, setFiles] = useState<SpreadsheetFile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Direct sheet ID or URL
  const [customSheetUrlOrId, setCustomSheetUrlOrId] = useState('');
  const [customSheetName, setCustomSheetName] = useState('');

  // Selected file from drive
  const [selectedDriveFile, setSelectedDriveFile] = useState<SpreadsheetFile | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch Drive files when modal opens with accessToken
  useEffect(() => {
    if (isOpen && accessToken && inputMode === 'drive' && files.length === 0) {
      loadDriveFiles();
    }
  }, [isOpen, accessToken, inputMode]);

  const loadDriveFiles = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const list = await listSpreadsheets(accessToken);
      setFiles(list);
    } catch (e: any) {
      setError(e.message || '구글 드라이브 파일 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const effectiveYear = customYearInput.trim() || selectedYear;

  // Filtered drive files (prioritizing selectedYear in filename)
  const filteredFiles = files
    .filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      // Prioritize files containing the selected year in name
      const aHasYear = a.name.includes(effectiveYear) ? 1 : 0;
      const bHasYear = b.name.includes(effectiveYear) ? 1 : 0;
      if (aHasYear !== bHasYear) return bHasYear - aHasYear;
      return 0;
    });

  const handleSubmit = async () => {
    let targetId = '';
    let targetName = '';

    if (inputMode === 'drive') {
      if (!selectedDriveFile) {
        alert('연결할 구글 스프레드시트 파일을 선택해 주세요.');
        return;
      }
      targetId = selectedDriveFile.id;
      targetName = selectedDriveFile.name;
    } else {
      const raw = customSheetUrlOrId.trim();
      if (!raw) {
        alert('구글 스프레드시트 링크 또는 ID를 입력해 주세요.');
        return;
      }
      const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      targetId = match ? match[1] : raw;
      targetName = customSheetName.trim() || `${effectiveYear}년 가계부`;
    }

    setIsSubmitting(true);
    try {
      await onRegisterYearSheet(effectiveYear, targetId, targetName);
      onClose();
    } catch (err: any) {
      alert(`시트 등록 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-150 flex items-center justify-between bg-gradient-to-r from-blue-50/80 via-slate-50 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-200 shrink-0">
              <Calendar className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900">
                연도별 가계부 시트 등록
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                과거 연도(2025 등) 구글시트를 연결하여 연간 분석 및 비교를 지원합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Step 1: Select Year */}
          <div>
            <label className="block text-xs font-black text-slate-800 mb-1.5">
              1. 등록할 연도 선택
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {['2025', '2024', '2026', '2023'].map((y) => {
                const isSelected = effectiveYear === y;
                const existing = registeredYears.find((r) => r.year === y);
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => {
                      setSelectedYear(y);
                      setCustomYearInput('');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 border shadow-2xs whitespace-nowrap ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span>{y}년</span>
                    {existing && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                          isSelected ? 'bg-blue-800 text-blue-200' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        연결됨
                      </span>
                    )}
                  </button>
                );
              })}

              <div className="flex items-center gap-1">
                <input
                  type="text"
                  placeholder="직접입력 (예: 2022)"
                  value={customYearInput}
                  onChange={(e) => setCustomYearInput(e.target.value)}
                  className="w-28 px-2.5 py-1 text-xs border border-slate-300 rounded-xl focus:outline-blue-500 font-bold"
                />
              </div>
            </div>
          </div>

          {/* Format Compatibility Reassurance Banner */}
          <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1">
            <div className="font-black flex items-center gap-1 text-amber-800">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
              <span>양식이 2026년과 달라도 안심하세요!</span>
            </div>
            <p className="text-[11px] text-amber-800/90 leading-relaxed font-medium">
              스마트 가계부의 <strong>지능형 헤더 감지 엔진</strong>이 시트 첫 행을 분석하여{' '}
              <strong>[날짜, 사용처, 분류, 금액]</strong> 열의 위치를 자동으로 찾아냅니다. 
              결제수단이나 세부품목 등 과거에 없던 컬럼은 안전하게 자동 호환 처리됩니다.
            </p>
          </div>

          {/* Step 2: Select Sheet Source Method */}
          <div>
            <label className="block text-xs font-black text-slate-800 mb-1.5">
              2. {effectiveYear}년 구글 스프레드시트 선택
            </label>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl mb-3">
              {accessToken && (
                <button
                  type="button"
                  onClick={() => setInputMode('drive')}
                  className={`flex-1 py-1.5 text-xs font-black rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    inputMode === 'drive'
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>내 구글 드라이브에서 선택</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setInputMode('url')}
                className={`flex-1 py-1.5 text-xs font-black rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                  inputMode === 'url'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>시트 링크 / ID 직접 입력</span>
              </button>
            </div>

            {/* Mode A: Google Drive List */}
            {inputMode === 'drive' && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="드라이브 가계부 파일 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-blue-500"
                  />
                </div>

                {isLoading ? (
                  <div className="py-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                    <span>구글 드라이브 스프레드시트 목록 검색 중...</span>
                  </div>
                ) : filteredFiles.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    스프레드시트 파일을 찾을 수 없습니다. 직접 링크 입력을 이용해 보세요.
                  </div>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-1.5 border border-slate-200 rounded-2xl p-1.5">
                    {filteredFiles.map((file) => {
                      const isSelected = selectedDriveFile?.id === file.id;
                      const hasYear = file.name.includes(effectiveYear);
                      return (
                        <div
                          key={file.id}
                          onClick={() => setSelectedDriveFile(file)}
                          className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 text-xs ${
                            isSelected
                              ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-500/20 text-blue-950 font-black'
                              : 'bg-white border-slate-200/80 hover:bg-slate-50 text-slate-700 font-medium'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                            <div className="min-w-0">
                              <div className="truncate flex items-center gap-1.5">
                                <span className="truncate">{file.name}</span>
                                {hasYear && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded shrink-0">
                                    추천
                                  </span>
                                )}
                              </div>
                              {file.modifiedTime && (
                                <span className="text-[10px] text-slate-400 block mt-0.5">
                                  최근 수정: {new Date(file.modifiedTime).toLocaleDateString('ko-KR')}
                                </span>
                              )}
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0 stroke-[3]" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Mode B: Direct URL / ID Input */}
            {inputMode === 'url' && (
              <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    구글 스프레드시트 링크 또는 ID
                  </label>
                  <input
                    type="text"
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={customSheetUrlOrId}
                    onChange={(e) => setCustomSheetUrlOrId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:outline-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    시트 별칭 (선택사항)
                  </label>
                  <input
                    type="text"
                    placeholder={`예: ${effectiveYear}_가계부`}
                    value={customSheetName}
                    onChange={(e) => setCustomSheetName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-blue-500"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-150 bg-slate-50 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || (inputMode === 'drive' && !selectedDriveFile) || (inputMode === 'url' && !customSheetUrlOrId.trim())}
            className="px-5 py-2 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-700 active:scale-95 text-white transition cursor-pointer shadow-md shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>등록 및 분석 중...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>{effectiveYear}년 시트로 등록하고 전환</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
