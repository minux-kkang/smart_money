import React from 'react';
import {
  Wallet,
  Calendar,
  FileSpreadsheet,
  ExternalLink,
  Github,
  PlusCircle,
  LogOut,
  ChevronDown,
  Sparkles,
  RefreshCw,
  Download,
} from 'lucide-react';
import { User } from 'firebase/auth';

interface HeaderProps {
  user: User | null;
  spreadsheetTitle: string;
  spreadsheetUrl?: string;
  sheetTabs: Array<{ id: number; title: string }>;
  activeSheetTitle: string;
  onSelectSheet: (title: string) => void;
  onOpenSpreadsheetPicker: () => void;
  onOpenQuickInput: () => void;
  onOpenGitHubModal: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onRefreshData: () => void;
  isRefreshing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  spreadsheetTitle,
  spreadsheetUrl,
  sheetTabs,
  activeSheetTitle,
  onSelectSheet,
  onOpenSpreadsheetPicker,
  onOpenQuickInput,
  onOpenGitHubModal,
  onLogin,
  onLogout,
  onRefreshData,
  isRefreshing = false,
}) => {
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg text-slate-900 tracking-tight">
                  스마트 가계부
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/50">
                  <Sparkles className="w-3 h-3 text-blue-600" />
                  스프레드시트 동기화
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden md:block">
                구글 드라이브 연동 지출 관리 시스템
              </p>
            </div>
          </div>

          {/* Active Spreadsheet & Month Selector */}
          <div className="hidden md:flex items-center gap-2 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 text-xs">
            <button
              onClick={onOpenSpreadsheetPicker}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white font-medium text-slate-800 shadow-xs hover:bg-slate-50 transition cursor-pointer max-w-[200px] truncate"
              title="가계부 파일 변경"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">{spreadsheetTitle}</span>
              <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
            </button>

            {sheetTabs.length > 0 && (
              <div className="flex items-center gap-1 pl-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400 mx-1" />
                <div className="flex items-center gap-0.5 overflow-x-auto max-w-[320px] py-0.5 scrollbar-none">
                  {sheetTabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => onSelectSheet(tab.title)}
                      className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer shrink-0 ${
                        activeSheetTitle === tab.title
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                      }`}
                    >
                      {tab.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Quick Refresh from Google Sheet */}
            <button
              onClick={onRefreshData}
              disabled={isRefreshing}
              title="구글 시트 최신 데이터 새로고침"
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
            </button>

            {/* Direct Open in Google Sheets Web */}
            {spreadsheetUrl && (
              <a
                href={spreadsheetUrl}
                target="_blank"
                rel="noreferrer"
                title="Google Sheets 웹에서 원본 직접 열기"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>시트 열기</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>
            )}

            {/* Download Options */}
            <a
              href="./smart_money_standalone.html"
              download="smart_money_standalone.html"
              title="서버 없이 더블클릭해서 바로 실행되는 단일 HTML 앱 파일 다운로드"
              className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>HTML 앱 다운로드</span>
            </a>

            <a
              href="./SPECIFICATION.md"
              download="smart_ledger_specification.md"
              title="시스템 구현 명세서 다운로드 (SPECIFICATION.md)"
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">명세서 (.md)</span>
            </a>

            {/* GitHub Setup Button */}
            <button
              onClick={onOpenGitHubModal}
              title="GitHub 연동 및 자동 배포 가이드"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 transition cursor-pointer"
            >
              <Github className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">GitHub 자동화</span>
            </button>

            {/* Main Action: New Expense Entry */}
            <button
              onClick={onOpenQuickInput}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/25 active:scale-95 transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>가계부 입력</span>
            </button>

            {/* User Profile / Google Sign-in */}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 p-1 pl-2 rounded-full hover:bg-slate-100 transition cursor-pointer border border-slate-200"
                >
                  <span className="text-xs font-semibold text-slate-700 hidden md:inline max-w-[100px] truncate">
                    {user.displayName || user.email?.split('@')[0]}
                  </span>
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt="Profile"
                      className="w-7 h-7 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                      {(user.displayName || user.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50">
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-xs text-slate-500">연결된 구글 계정</p>
                      <p className="text-sm font-bold text-slate-800 truncate">
                        {user.displayName || 'Google 사용자'}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{user.email}</p>
                    </div>

                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        onOpenSpreadsheetPicker();
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      <span>내 구글 드라이브 가계부 선택</span>
                    </button>

                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>로그아웃</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={onLogin}
                className="gsi-material-button inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 transition cursor-pointer text-xs font-semibold text-slate-700 shadow-xs"
              >
                <div className="gsi-material-button-icon w-4 h-4">
                  <svg viewBox="0 0 48 48" className="w-full h-full">
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                </div>
                <span>구글 로그인</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Month Tabs row */}
        {sheetTabs.length > 0 && (
          <div className="flex lg:hidden items-center justify-between py-2 border-t border-slate-100 overflow-x-auto text-xs scrollbar-none gap-2">
            <button
              onClick={onOpenSpreadsheetPicker}
              className="flex items-center gap-1 text-slate-700 font-bold shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span className="max-w-[140px] truncate">{spreadsheetTitle}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
              {sheetTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => onSelectSheet(tab.title)}
                  className={`px-2.5 py-1 rounded-md font-semibold shrink-0 ${
                    activeSheetTitle === tab.title
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 bg-slate-100'
                  }`}
                >
                  {tab.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
