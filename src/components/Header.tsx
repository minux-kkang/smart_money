import React, { useState, useRef, useEffect } from 'react';
import {
  Wallet,
  Calendar,
  FileSpreadsheet,
  ExternalLink,
  Github,
  Plus,
  LogOut,
  ChevronDown,
  Sparkles,
  RefreshCw,
  Download,
  MoreVertical,
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
          {/* Logo & Brand & Active Sheet */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <Wallet className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="font-black text-sm sm:text-base md:text-lg text-slate-900 tracking-tight whitespace-nowrap shrink-0">
                스마트 가계부
              </h1>

              {/* Active Sheet Badge - Clickable to change sheet */}
              <button
                onClick={onOpenSpreadsheetPicker}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-[11px] font-bold text-slate-700 transition cursor-pointer max-w-[130px] sm:max-w-[200px] truncate"
                title="클릭하여 가계부 스프레드시트 변경"
              >
                <FileSpreadsheet className="w-3 h-3 text-emerald-600 shrink-0" />
                <span className="truncate">{spreadsheetTitle}</span>
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              </button>
            </div>
          </div>

          {/* Desktop Month Selector (Hidden on Mobile) */}
          {sheetTabs.length > 0 && (
            <div className="hidden lg:flex items-center gap-1 pl-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 text-xs">
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

          {/* Right Action Bar */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0" ref={menuRef}>
            {/* Quick Refresh */}
            <button
              onClick={onRefreshData}
              disabled={isRefreshing}
              title="최신 데이터 새로고침"
              className="p-1.5 sm:p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`}
              />
            </button>

            {/* Quick Expense Entry Button */}
            <button
              onClick={onOpenQuickInput}
              className="flex items-center gap-1 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs active:scale-95 transition cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" />
              <span>지출 입력</span>
            </button>

            {/* User Profile or Google Login */}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => {
                    setUserMenuOpen(!userMenuOpen);
                    setMoreMenuOpen(false);
                  }}
                  className="flex items-center gap-1.5 p-1 rounded-full hover:bg-slate-100 transition cursor-pointer border border-slate-200"
                  title={user.displayName || user.email || '계정 설정'}
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt="Profile"
                      className="w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                      {(user.displayName || user.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <ChevronDown className="w-3 h-3 text-slate-400 mr-1 hidden sm:block" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50">
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-[11px] text-slate-400">구글 계정 연동됨</p>
                      <p className="text-xs font-bold text-slate-800 truncate">
                        {user.displayName || user.email}
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        onOpenSpreadsheetPicker();
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      <span>가계부 시트 변경</span>
                    </button>

                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
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
                className="inline-flex items-center gap-1.5 px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition cursor-pointer text-xs font-semibold shadow-2xs whitespace-nowrap shrink-0"
                title="구글 계정 로그인"
              >
                <div className="w-4 h-4 shrink-0">
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
                <span className="hidden sm:inline">구글 로그인</span>
              </button>
            )}

            {/* More Menu Dropdown (Download, GitHub, Sheet Links) */}
            <div className="relative">
              <button
                onClick={() => {
                  setMoreMenuOpen(!moreMenuOpen);
                  setUserMenuOpen(false);
                }}
                className="p-1.5 sm:p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                title="더보기 메뉴"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {moreMenuOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 z-50 text-xs">
                  {spreadsheetUrl && (
                    <a
                      href={spreadsheetUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setMoreMenuOpen(false)}
                      className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                        <span>원본 시트 열기</span>
                      </span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </a>
                  )}

                  <button
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onOpenSpreadsheetPicker();
                    }}
                    className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                    <span>가계부 시트 변경/연동</span>
                  </button>

                  <a
                    href="./smart_money_standalone.html"
                    download="smart_money_standalone.html"
                    onClick={() => setMoreMenuOpen(false)}
                    className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-emerald-600" />
                    <span>단일 HTML 앱 파일 다운</span>
                  </a>

                  <a
                    href="./SPECIFICATION.md"
                    download="smart_ledger_specification.md"
                    onClick={() => setMoreMenuOpen(false)}
                    className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-indigo-600" />
                    <span>시스템 명세서 (.md)</span>
                  </a>

                  <button
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onOpenGitHubModal();
                    }}
                    className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer border-t border-slate-100 mt-1 pt-2"
                  >
                    <Github className="w-4 h-4 text-slate-700" />
                    <span>GitHub 배포 설정</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
