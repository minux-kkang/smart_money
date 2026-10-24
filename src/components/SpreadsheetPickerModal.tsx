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
  ClipboardPaste,
  Link2,
} from 'lucide-react';
import { SpreadsheetFile } from '../types/ledger';
import { listSpreadsheets, createHouseholdSpreadsheet } from '../services/googleDrive';

interface SpreadsheetPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string | null;
  currentSpreadsheetId: string;
  onSelectSpreadsheet: (id: string, name: string) => void;
  onImportPastedData?: (sheetTitle: string, rows: string[][]) => void;
}

export const SpreadsheetPickerModal: React.FC<SpreadsheetPickerModalProps> = ({
  isOpen,
  onClose,
  accessToken,
  currentSpreadsheetId,
  onSelectSpreadsheet,
  onImportPastedData,
}) => {
  const [activeTab, setActiveTab] = useState<'drive' | 'url' | 'paste'>('drive');
  const [files, setFiles] = useState<SpreadsheetFile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New sheet creation form
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState(() => `${new Date().getFullYear()}년 우리집 가계부`);
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  // Direct ID or URL input
  const [customId, setCustomId] = useState('');

  // Paste raw text from Excel/Sheets
  const [pastedText, setPastedText] = useState('');
  const [pastedSheetName, setPastedSheetName] = useState(
    () => `${new Date().getMonth() + 1}월`
  );

  const fetchFiles = async (query: string = '') => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await listSpreadsheets(accessToken, query);
      setFiles(result);
    } catch (err: any) {
      setError(err?.message || '스프레드시트 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && accessToken && activeTab === 'drive') {
      fetchFiles();
    }
  }, [isOpen, accessToken, activeTab]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchFiles(searchQuery);
  };

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !newTitle.trim()) return;
    setIsSubmittingNew(true);
    try {
      const created = await createHouseholdSpreadsheet(newTitle.trim(), accessToken);
      onSelectSpreadsheet(created.id, created.name);
      onClose();
    } catch (err: any) {
      setError(err?.message || '새 가계부 생성 실패');
    } finally {
      setIsSubmittingNew(false);
    }
  };

  const handleDirectSelect = () => {
    if (!customId.trim()) return;
    let extractedId = customId.trim();
    const urlMatch = extractedId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (urlMatch) {
      extractedId = urlMatch[1];
    }
    onSelectSpreadsheet(extractedId, '연결된 가계부 스프레드시트');
    onClose();
  };

  const handleParsePastedData = () => {
    if (!pastedText.trim() || !onImportPastedData) return;

    // Split rows by newline and columns by tab (typical when copied from Excel or Sheets) or comma
    const rawLines = pastedText.trim().split(/\r?\n/);
    const parsedRows: string[][] = rawLines.map((line) => {
      if (line.includes('\t')) {
        return line.split('\t').map((c) => c.trim());
      }
      return line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    });

    onImportPastedData(pastedSheetName.trim() || '가계부', parsedRows);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">가계부 스프레드시트 등록 및 연동</h3>
              <p className="text-xs text-slate-500">
                보관 중인 구글 시트 또는 엑셀 데이터를 가져옵니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-slate-100 px-6 bg-slate-50/30 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('drive')}
            className={`py-3 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'drive'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>내 구글 드라이브 검색</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('url')}
            className={`py-3 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'url'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Link2 className="w-4 h-4" />
            <span>시트 링크 / ID 입력</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('paste')}
            className={`py-3 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'paste'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ClipboardPaste className="w-4 h-4" />
            <span>엑셀/시트 복사 붙여넣기</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs flex items-center gap-2 border border-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: Google Drive */}
          {activeTab === 'drive' && (
            <div className="space-y-4">
              {!accessToken ? (
                <div className="p-6 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50">
                  <FileSpreadsheet className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700">Google 로그인이 필요합니다</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    상단의 '구글 로그인' 버튼을 눌러 계정을 연결하면 드라이브의 스프레드시트가 자동으로 조회됩니다.
                  </p>
                  <p className="text-[11px] text-blue-600 mt-3 font-semibold">
                    로그인 없이 바로 테스트하려면 상단의 [시트 링크 / ID 입력] 또는 [엑셀/시트 복사 붙여넣기]를 사용하세요.
                  </p>
                </div>
              ) : (
                <>
                  <form onSubmit={handleSearch} className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="가계부 파일명 검색..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition cursor-pointer"
                    >
                      검색
                    </button>
                    <button
                      type="button"
                      onClick={() => fetchFiles(searchQuery)}
                      disabled={isLoading}
                      className="p-2 text-slate-500 hover:bg-slate-100 border border-slate-200 rounded-xl cursor-pointer"
                      title="새로고침"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </form>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-600 mb-1">
                      <span>내 Google Drive 스프레드시트</span>
                      <button
                        type="button"
                        onClick={() => setIsCreating(!isCreating)}
                        className="text-emerald-700 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isCreating ? '생성 닫기' : '새 가계부 템플릿 생성'}</span>
                      </button>
                    </div>

                    {isCreating && (
                      <form
                        onSubmit={handleCreateNew}
                        className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-3"
                      >
                        <div className="text-xs font-bold text-emerald-900">
                          ✨ 12개월(1월~12월) 탭이 포함된 표준 가계부 템플릿 생성
                        </div>
                        <input
                          type="text"
                          placeholder="새 스프레드시트 제목"
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500"
                          required
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setIsCreating(false)}
                            className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg"
                          >
                            취소
                          </button>
                          <button
                            type="submit"
                            disabled={isSubmittingNew}
                            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            {isSubmittingNew ? 'Google Drive에 생성 중...' : 'Google Drive에 생성 및 연결'}
                          </button>
                        </div>
                      </form>
                    )}

                    {isLoading ? (
                      <div className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                        <p className="text-xs font-medium">스프레드시트를 검색 중입니다...</p>
                      </div>
                    ) : files.length === 0 ? (
                      <div className="py-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                        <FileSpreadsheet className="w-8 h-8 mx-auto mb-1.5 opacity-40 text-emerald-600" />
                        <p className="text-xs font-semibold text-slate-600">검색된 스프레드시트가 없습니다.</p>
                      </div>
                    ) : (
                      <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                        {files.map((file) => {
                          const isCurrent = currentSpreadsheetId === file.id;
                          return (
                            <div
                              key={file.id}
                              onClick={() => {
                                onSelectSpreadsheet(file.id, file.name);
                                onClose();
                              }}
                              className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                                isCurrent
                                  ? 'bg-blue-50/80 border-blue-300 shadow-2xs'
                                  : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-900 truncate">{file.name}</p>
                                  <p className="text-[10px] text-slate-400">
                                    {file.modifiedTime
                                      ? `최근 수정: ${new Date(file.modifiedTime).toLocaleDateString()}`
                                      : 'Google Sheets'}
                                  </p>
                                </div>
                              </div>
                              {isCurrent && (
                                <span className="flex items-center gap-1 text-[11px] font-bold text-blue-600 px-2 py-0.5 rounded-full bg-blue-100">
                                  <Check className="w-3 h-3" />
                                  선택됨
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 2: Direct URL / ID */}
          {activeTab === 'url' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                공유하려는 Google Spreadsheet의 브라우저 주소 표시줄 전체 URL 또는 스프레드시트 ID를 붙여넣으세요.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  스프레드시트 URL 또는 ID
                </label>
                <input
                  type="text"
                  placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="p-3 bg-blue-50 rounded-xl text-xs text-blue-800 space-y-1">
                <p className="font-bold">💡 팁:</p>
                <p>Google 계정으로 로그인되어 있으면 해당 시트를 즉시 불러와 열 구조를 분석합니다.</p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleDirectSelect}
                  disabled={!customId.trim()}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs disabled:opacity-40"
                >
                  연결 및 분석하기
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: Copy & Paste from Excel/Sheets */}
          {activeTab === 'paste' && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
                <span className="font-bold">📋 엑셀/구글 시트 표 직접 붙여넣기:</span>
                <p className="mt-0.5">
                  기존에 쓰시던 엑셀이나 구글 시트에서 헤더(날짜, 구분, 분류, 금액 등)를 포함하여 행들을 드래그 복사(Ctrl+C)한 뒤 아래에 붙여넣기(Ctrl+V)하세요. 즉시 열 매핑과 지출 통계가 분석됩니다.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  시트/월 이름 (예: 3월, 2026-03)
                </label>
                <input
                  type="text"
                  value={pastedSheetName}
                  onChange={(e) => setPastedSheetName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  복사한 표 데이터 붙여넣기
                </label>
                <textarea
                  rows={8}
                  placeholder={`날짜\t구분\t분류\t내용\t금액\t결제수단\t메모\n2026-03-01\t지출\t식비\t스타벅스\t6500\t현대카드\t커피`}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:ring-2 focus:ring-blue-500 whitespace-pre"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleParsePastedData}
                  disabled={!pastedText.trim()}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs disabled:opacity-40"
                >
                  데이터 분석 및 적용
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
