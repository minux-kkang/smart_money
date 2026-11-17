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
  Tag,
  Check,
  ArrowRightLeft,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { findAllYearTabs } from '../services/googleSheets';

interface HeaderProps {
  user: User | null;
  spreadsheetTitle: string;
  spreadsheetUrl?: string;
  sheetTabs: Array<{ id: number; title: string; hidden?: boolean }>;
  activeSheetTitle: string;
  onSelectSheet: (title: string) => void;
  onOpenSpreadsheetPicker: () => void;
  onOpenQuickInput: () => void;
  onOpenGitHubModal: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onRefreshData: () => void;
  isRefreshing?: boolean;
  onOpenCategoryManager?: () => void;
  isRealGoogleConnected?: boolean;
  onOpenMigrationModal?: () => void;
  onOpenMigrationImport?: () => void;
  activeYear?: string;
  yearlySheets?: Array<{ year: string; title: string; id: string }>;
  onSelectYearSheet?: (cfg: { year: string; title: string; id: string }) => void;
  onSelectYearTab?: (tabTitle: string) => void;
  onOpenRegisterYearModal?: () => void;
  isYearlyUnifiedMode?: boolean;
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
  onOpenCategoryManager,
  isRealGoogleConnected = false,
  onOpenMigrationModal,
  onOpenMigrationImport,
  activeYear,
  yearlySheets = [],
  onSelectYearSheet,
  onSelectYearTab,
  onOpenRegisterYearModal,
  isYearlyUnifiedMode = false,
}) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [yearMenuOpen, setYearMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const yearMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
        setMoreMenuOpen(false);
      }
      if (yearMenuRef.current && !yearMenuRef.current.contains(e.target as Node)) {
        setYearMenuOpen(false);
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
          <div className="flex items-center gap-1.5 sm:gap-3 flex-1 min-w-0 overflow-hidden">
            <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <Wallet className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <h1 className="font-black text-[13px] sm:text-base md:text-lg text-slate-900 tracking-tight whitespace-nowrap shrink-0">
                스마트 가계부
              </h1>

              {/* Year Switcher Dropdown (2026년 ▼, 2025년 ...) */}
              <div className="relative shrink-0" ref={yearMenuRef}>
                <button
                  type="button"
                  onClick={() => setYearMenuOpen((prev) => !prev)}
                  className="flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] sm:text-xs font-black transition cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
                  title="연도 전환 및 과거 연도 시트 관리"
                >
                  <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-600 shrink-0" />
                  <span>{activeYear || '2026'}년</span>
                  <ChevronDown className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-blue-500 shrink-0" />
                </button>

                {yearMenuOpen && (() => {
                  const yearTabsInFile = findAllYearTabs(sheetTabs);
                  const currentYearStr = activeYear || '2026';
                  const fileYearsSet = new Set(yearTabsInFile.map((y) => String(y.year)));
                  const externalOnly = (yearlySheets || []).filter(
                    (cfg) => !fileYearsSet.has(cfg.year)
                  );
                  return (
                    <div className="fixed sm:absolute left-3 sm:left-0 top-14 sm:top-full sm:mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-3 py-1 border-b border-slate-100 flex items-center justify-between text-[10px] font-bold text-slate-400">
                        <span>연도별 가계부 시트</span>
                        {isYearlyUnifiedMode && (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-extrabold">
                            통합 모드
                          </span>
                        )}
                      </div>

                      <div className="py-1 max-h-60 overflow-y-auto">
                        {yearTabsInFile.length > 0 && (
                          <>
                            {yearTabsInFile.map((yt) => {
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
                                      ? 'bg-blue-50 text-blue-900 font-black'
                                      : 'text-slate-700 hover:bg-slate-50 font-medium'
                                  }`}
                                >
                                  <div className="min-w-0 pr-2">
                                    <span className="font-black text-slate-900 flex items-center gap-1.5">
                                      <span>{yt.year}년</span>
                                      <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[9.5px] font-extrabold">
                                        [{yt.title}] 탭
                                      </span>
                                    </span>
                                    <span className="text-[10px] text-slate-500 block truncate">
                                      현재 파일 · 연도 통합 시트
                                    </span>
                                  </div>
                                  {isCurrent && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0 stroke-[3]" />}
                                </button>
                              );
                            })}
                          </>
                        )}

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
                                    ? 'bg-blue-50 text-blue-900 font-black'
                                    : 'text-slate-700 hover:bg-slate-50 font-medium'
                                }`}
                              >
                                <div className="min-w-0 pr-2">
                                  <span className="font-black text-slate-900 block">{cfg.year}년</span>
                                  <span className="text-[10px] text-slate-500 block truncate">
                                    {cfg.title}
                                  </span>
                                </div>
                                {isCurrent && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0 stroke-[3]" />}
                              </button>
                            );
                          })
                        ) : yearTabsInFile.length === 0 ? (
                          <button
                            type="button"
                            onClick={() => setYearMenuOpen(false)}
                            className="w-full px-3 py-2 text-left flex items-center justify-between text-xs bg-blue-50 text-blue-900 font-black cursor-pointer"
                          >
                            <div className="min-w-0 pr-2">
                              <span className="font-black text-slate-900 block">{currentYearStr}년</span>
                              <span className="text-[10px] text-slate-500 block truncate">
                                {spreadsheetTitle}
                              </span>
                            </div>
                            <Check className="w-3.5 h-3.5 text-blue-600 shrink-0 stroke-[3]" />
                          </button>
                        ) : null}
                      </div>

                      <div className="px-2 pt-1.5 border-t border-slate-100 space-y-1">
                        {onOpenMigrationModal && (
                          <button
                            type="button"
                            onClick={() => {
                              setYearMenuOpen(false);
                              onOpenMigrationModal();
                            }}
                            className="w-full px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-black text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap shadow-2xs"
                          >
                            <Sparkles className="w-3.5 h-3.5 shrink-0" />
                            <span>만년 가계부 시트 전환 (1~12월 통합)</span>
                          </button>
                        )}
                        {onOpenMigrationImport && (
                          <button
                            type="button"
                            onClick={() => {
                              setYearMenuOpen(false);
                              onOpenMigrationImport();
                            }}
                            className="w-full px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span>다른 연도 파일 현재 시트로 이관</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setYearMenuOpen(false);
                            if (onOpenRegisterYearModal) onOpenRegisterYearModal();
                          }}
                          className="w-full px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>+ 다른 연도 파일 연결</span>
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Active Sheet Badge - Clickable to change sheet (hidden on narrow phones to prevent clipping) */}
              <button
                onClick={onOpenSpreadsheetPicker}
                className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-[11px] font-bold text-slate-700 transition cursor-pointer max-w-[140px] md:max-w-[190px] truncate"
                title="클릭하여 가계부 스프레드시트 변경"
              >
                <FileSpreadsheet className="w-3 h-3 text-emerald-600 shrink-0" />
                <span className="truncate">{spreadsheetTitle}</span>
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              </button>

              {/* Data Storage & Sync Status Indicator */}
              {(() => {
                const hasGas = typeof window !== 'undefined' && Boolean(localStorage.getItem('smart_money_gas_url'));
                if (hasGas) {
                  return (
                    <button
                      type="button"
                      onClick={onOpenSpreadsheetPicker}
                      className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-extrabold whitespace-nowrap cursor-pointer transition"
                      title="Apps Script 웹앱으로 영구 실시간 동기화 중 (로그인/토큰 만료 없이 무제한 자동 반영)"
                    >
                      <Sparkles className="w-3 h-3 text-indigo-600 animate-pulse" />
                      <span>웹앱 영구 연동됨</span>
                    </button>
                  );
                }
                if (user && isRealGoogleConnected) {
                  return (
                    <span
                      className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold whitespace-nowrap"
                      title="Google 시트 실시간 동기화 활성화됨: 모든 저장/수정/삭제가 구글 시트 원본에 즉시 반영됩니다."
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>시트 실시간 연동됨</span>
                    </span>
                  );
                }
                return (
                  <button
                    type="button"
                    onClick={onLogin}
                    className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold whitespace-nowrap cursor-pointer transition"
                    title="현재 브라우저 로컬(localStorage)에 보관 중입니다. Google 로그인 또는 [Apps Script 웹앱] 등록 시 구글 시트와 실시간 연동됩니다."
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span>로컬 보관 (시트 연동 필요)</span>
                  </button>
                );
              })()}
            </div>
          </div>

          {/* Desktop Month Selector (Hidden on Mobile) */}
          {sheetTabs.filter((t) => !t.hidden).length > 0 && (
            <div className="hidden lg:flex items-center gap-1 pl-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400 mx-1" />
              <div className="flex items-center gap-0.5 overflow-x-auto max-w-[320px] py-0.5 scrollbar-none">
                {sheetTabs
                  .filter((t) => !t.hidden)
                  .map((tab) => (
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
          <div className="flex items-center gap-1 sm:gap-2 shrink-0" ref={menuRef}>
            {/* Quick Refresh (desktop/tablet; mobile can refresh in status bar or menu) */}
            <button
              onClick={onRefreshData}
              disabled={isRefreshing}
              title="최신 데이터 새로고침"
              className="hidden sm:inline-flex p-1.5 sm:p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`}
              />
            </button>

            {/* Direct Perpetual Ledger Conversion Button */}
            {onOpenMigrationModal && (
              <button
                type="button"
                onClick={onOpenMigrationModal}
                title="구글 시트를 만년 가계부([📊 연도별 요약] + 연도별 탭) 구조로 전환"
                className="flex items-center gap-1 px-2 py-1.5 sm:px-2.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 shadow-2xs active:scale-95 transition cursor-pointer shrink-0 whitespace-nowrap"
              >
                <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-indigo-600 shrink-0" />
                <span>만년</span>
                <span className="hidden sm:inline">가계부</span>
              </button>
            )}

            {/* Quick Expense Entry Button */}
            <button
              onClick={onOpenQuickInput}
              className="flex items-center gap-1 px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs active:scale-95 transition cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" />
              <span className="sm:hidden">입력</span>
              <span className="hidden sm:inline">지출 입력</span>
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
                  {onOpenCategoryManager && (
                    <button
                      onClick={() => {
                        setMoreMenuOpen(false);
                        onOpenCategoryManager();
                      }}
                      className="w-full text-left px-4 py-2.5 text-slate-800 hover:bg-blue-50 flex items-center gap-2 cursor-pointer border-b border-slate-100 font-bold"
                    >
                      <Tag className="w-4 h-4 text-blue-600" />
                      <span>카테고리 & 결제수단 설정</span>
                    </button>
                  )}

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

                  <button
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onRefreshData();
                    }}
                    disabled={isRefreshing}
                    className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 text-blue-600 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>최신 데이터 새로고침</span>
                  </button>

                  {onOpenMigrationModal && (
                    <button
                      onClick={() => {
                        setMoreMenuOpen(false);
                        onOpenMigrationModal();
                      }}
                      className="w-full text-left px-4 py-2 text-indigo-700 hover:bg-indigo-50 flex items-center gap-2 cursor-pointer border-t border-slate-100 font-black"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>만년 가계부 전환 · 이관</span>
                    </button>
                  )}

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
