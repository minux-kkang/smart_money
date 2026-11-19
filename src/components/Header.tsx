import React, { useState, useRef, useEffect } from 'react';
import {
  Wallet,
  Calendar,
  Plus,
  LogOut,
  ChevronDown,
  RefreshCw,
  Check,
  Settings,
  BarChart3,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { findAllYearTabs } from '../services/googleSheets';

export type MainViewTab = 'matrix' | 'monthly' | 'comparison';

interface HeaderProps {
  user: User | null;
  spreadsheetTitle: string;
  sheetTabs: Array<{ id: number; title: string; hidden?: boolean }>;
  activeSheetTitle: string;
  activeTab: MainViewTab;
  onChangeTab: (tab: MainViewTab) => void;
  onSelectSheet: (title: string) => void;
  onOpenQuickInput: () => void;
  onOpenSettings: (initialTab?: 'sheet' | 'categories' | 'advanced') => void;
  onLogin: () => void;
  onLogout: () => void;
  onRefreshData: () => void;
  isRefreshing?: boolean;
  isLoggingIn?: boolean;
  isSheetLinked?: boolean;
  isLiveWritable?: boolean;
  activeYear?: string;
  yearlySheets?: Array<{ year: string; title: string; id: string }>;
  onSelectYearSheet?: (cfg: { year: string; title: string; id: string }) => void;
  onSelectYearTab?: (tabTitle: string) => void;
  isYearlyUnifiedMode?: boolean;
  hasSettingsAttention?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  spreadsheetTitle,
  sheetTabs,
  activeSheetTitle,
  activeTab,
  onChangeTab,
  onSelectSheet,
  onOpenQuickInput,
  onOpenSettings,
  onLogin,
  onLogout,
  onRefreshData,
  isRefreshing = false,
  isLoggingIn = false,
  isSheetLinked = false,
  isLiveWritable = false,
  activeYear,
  yearlySheets = [],
  onSelectYearSheet,
  onSelectYearTab,
  isYearlyUnifiedMode = false,
  hasSettingsAttention = false,
}) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [yearMenuOpen, setYearMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const yearMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (yearMenuRef.current && !yearMenuRef.current.contains(e.target as Node)) {
        setYearMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const needsReauth = Boolean(user && isSheetLinked && !isLiveWritable);

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-4">
          {/* Left: Brand + Clean Year Switcher */}
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center text-white shrink-0">
              <Wallet className="w-4 h-4" />
            </div>

            <h1 className="font-bold text-sm sm:text-base text-slate-900 tracking-tight whitespace-nowrap shrink-0">
              스마트 가계부
            </h1>

            {/* Year Switcher Dropdown */}
            <div className="relative shrink-0" ref={yearMenuRef}>
              <button
                type="button"
                onClick={() => setYearMenuOpen((prev) => !prev)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-slate-800 text-xs font-bold transition cursor-pointer whitespace-nowrap"
                title="연도 선택"
              >
                <span>{activeYear || '2026'}년</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              </button>

              {yearMenuOpen && (() => {
                const yearTabsInFile = findAllYearTabs(sheetTabs);
                const currentYearStr = activeYear || '2026';
                const fileYearsSet = new Set(yearTabsInFile.map((y) => String(y.year)));
                const externalOnly = (yearlySheets || []).filter(
                  (cfg) => !fileYearsSet.has(cfg.year)
                );

                return (
                  <div className="fixed sm:absolute left-3 sm:left-0 top-14 sm:top-full sm:mt-1.5 w-60 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-400">
                      <span>연도 선택</span>
                      {isYearlyUnifiedMode && (
                        <span className="text-[10px] font-semibold text-indigo-600">통합 시트</span>
                      )}
                    </div>

                    <div className="py-1 max-h-60 overflow-y-auto">
                      {yearTabsInFile.length > 0 &&
                        yearTabsInFile.map((yt) => {
                          const yStr = String(yt.year);
                          const isCurrent = yStr === currentYearStr && yt.title === activeSheetTitle;
                          return (
                            <button
                              key={`tab-${yt.id}-${yt.title}`}
                              type="button"
                              onClick={() => {
                                if (onSelectYearTab) onSelectYearTab(yt.title);
                                else onSelectSheet(yt.title);
                                setYearMenuOpen(false);
                              }}
                              className={`w-full px-3 py-2 text-left flex items-center justify-between text-xs transition cursor-pointer ${
                                isCurrent
                                  ? 'bg-blue-50 text-blue-800 font-bold'
                                  : 'text-slate-700 hover:bg-slate-50 font-medium'
                              }`}
                            >
                              <div className="min-w-0 pr-2">
                                <span className="block">{yt.year}년</span>
                                <span className="text-[11px] text-slate-400 block truncate">
                                  [{yt.title}] 탭
                                </span>
                              </div>
                              {isCurrent && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                            </button>
                          );
                        })}

                      {externalOnly.length > 0 ? (
                        externalOnly.map((cfg) => {
                          const isCurrent = cfg.year === currentYearStr && yearTabsInFile.length === 0;
                          return (
                            <button
                              key={`ext-${cfg.year}-${cfg.id}`}
                              type="button"
                              onClick={() => {
                                if (onSelectYearSheet) onSelectYearSheet(cfg);
                                setYearMenuOpen(false);
                              }}
                              className={`w-full px-3 py-2 text-left flex items-center justify-between text-xs transition cursor-pointer ${
                                isCurrent
                                  ? 'bg-blue-50 text-blue-800 font-bold'
                                  : 'text-slate-700 hover:bg-slate-50 font-medium'
                              }`}
                            >
                              <div className="min-w-0 pr-2">
                                <span className="block">{cfg.year}년</span>
                                <span className="text-[11px] text-slate-400 block truncate">
                                  {cfg.title}
                                </span>
                              </div>
                              {isCurrent && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                            </button>
                          );
                        })
                      ) : yearTabsInFile.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => setYearMenuOpen(false)}
                          className="w-full px-3 py-2 text-left flex items-center justify-between text-xs bg-blue-50 text-blue-800 font-bold cursor-pointer"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="block">{currentYearStr}년</span>
                            <span className="text-[11px] text-slate-400 block truncate">
                              {spreadsheetTitle}
                            </span>
                          </div>
                          <Check className="w-4 h-4 text-blue-600 shrink-0" />
                        </button>
                      ) : null}
                    </div>

                    <div className="px-2 pt-1.5 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setYearMenuOpen(false);
                          onOpenSettings('sheet');
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-between transition cursor-pointer"
                      >
                        <span>연도 추가 · 시트 관리</span>
                        <Settings className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Center: Clean 3-Tab Primary Navigation (Desktop) */}
          <nav
            aria-label="주요 화면"
            className="hidden lg:flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/70"
          >
            <button
              type="button"
              onClick={() => onChangeTab('matrix')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                activeTab === 'matrix'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
              <span>연간 매트릭스</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeTab('monthly')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                activeTab === 'monthly'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>월별 가계부</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeTab('comparison')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                activeTab === 'comparison'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
              <span>연도별 비교</span>
            </button>
          </nav>

          {/* Right: Primary Input CTA + Auth + Settings */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0" ref={menuRef}>
            {/* Subtle Refresh */}
            {isSheetLinked && (
              <button
                type="button"
                onClick={onRefreshData}
                disabled={isRefreshing}
                title="최신 데이터 새로고침"
                className="hidden sm:inline-flex p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
              </button>
            )}

            {/* Quick Expense Entry CTA */}
            <button
              type="button"
              onClick={onOpenQuickInput}
              className="flex items-center gap-1 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.75]" />
              <span className="sm:hidden">입력</span>
              <span className="hidden sm:inline">지출 입력</span>
            </button>

            {/* Auth Control (Always Visibly Exposed) */}
            {!user ? (
              <button
                type="button"
                onClick={onLogin}
                disabled={isLoggingIn}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 transition cursor-pointer text-xs font-bold whitespace-nowrap disabled:opacity-60"
                title="Google 계정으로 로그인하여 시트 실시간 연동"
              >
                <span className="w-3.5 h-3.5 shrink-0">
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
                </span>
                <span>{isLoggingIn ? '로그인 중...' : 'Google 로그인'}</span>
              </button>
            ) : needsReauth ? (
              <button
                type="button"
                onClick={onLogin}
                disabled={isLoggingIn}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 transition cursor-pointer text-xs font-bold whitespace-nowrap disabled:opacity-60"
                title="인증이 만료되어 읽기 전용 상태입니다. 클릭하여 다시 로그인하세요."
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>{isLoggingIn ? '인증 중...' : '재인증 필요'}</span>
              </button>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  className="flex items-center gap-1 p-1 rounded-full hover:bg-slate-100 transition cursor-pointer border border-slate-200"
                  title={user.displayName || user.email || '계정'}
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt="Profile"
                      className="w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-800 text-white font-bold text-xs flex items-center justify-center">
                      {(user.displayName || user.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50">
                    <div className="px-3.5 py-2 border-b border-slate-100">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {user.displayName || 'Google 계정'}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                      <p className="text-[11px] text-emerald-600 font-semibold mt-1 truncate">
                        {isLiveWritable ? `${spreadsheetTitle} 연동됨` : '시트 미연결'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>로그아웃</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Unified Settings Button */}
            <button
              type="button"
              onClick={() => onOpenSettings('sheet')}
              className="relative inline-flex items-center gap-1.5 px-2 py-1.5 sm:px-2.5 sm:py-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition cursor-pointer text-xs font-semibold"
              title="설정 및 시트 관리"
              aria-label="설정"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">설정</span>
              {hasSettingsAttention && (
                <span
                  className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-500"
                  aria-hidden="true"
                />
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
