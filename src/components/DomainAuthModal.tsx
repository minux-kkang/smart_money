import React, { useState } from 'react';
import { ExternalLink, Copy, Check, ShieldAlert, Sparkles, X, KeyRound } from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';
import { saveAuthSession } from '../services/firebase';

interface DomainAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTokenApplied?: (token: string) => void;
  onRetryLogin?: () => void;
}

export const DomainAuthModal: React.FC<DomainAuthModalProps> = ({
  isOpen,
  onClose,
  onTokenApplied,
  onRetryLogin,
}) => {
  const [copied, setCopied] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [appliedSuccess, setAppliedSuccess] = useState(false);

  if (!isOpen) return null;

  const currentHostname =
    typeof window !== 'undefined' && window.location.hostname
      ? window.location.hostname
      : 'minux-kkang.github.io';

  const projectId = firebaseConfig.projectId || 'gen-lang-client-0127617720';
  const consoleSettingsUrl = `https://console.firebase.google.com/project/${projectId}/authentication/settings`;

  const handleCopyDomain = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(currentHostname);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = currentHostname;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.warn('Copy failed', e);
    }
  };

  const handleApplyManualToken = () => {
    const trimmed = manualToken.trim();
    if (!trimmed) {
      alert('유효한 Google OAuth 액세스 토큰을 입력해 주세요.');
      return;
    }
    saveAuthSession(trimmed, 3600);
    setAppliedSuccess(true);
    if (onTokenApplied) {
      onTokenApplied(trimmed);
    }
    setTimeout(() => {
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-500 to-amber-600 text-white flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black leading-tight">
                Google 로그인 도메인 승인 안내
              </h3>
              <p className="text-xs text-amber-100 mt-0.5">
                GitHub Pages에서 Google 시트 실시간 쓰기를 위해 1회 등록이 필요합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 transition cursor-pointer text-white/80 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm text-slate-700">
          {/* Reason banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-900 leading-relaxed text-xs">
            <span className="font-bold">왜 이 안내가 뜨나요?</span>
            <p className="mt-1 text-slate-600">
              Google 보안 정책상 신규 배포 도메인(GitHub Pages)은 Firebase 콘솔의{' '}
              <strong className="text-slate-900 font-bold">승인된 도메인</strong>에 1회 등록해야
              로그인 팝업이 정상 작동합니다. (약 30초 소요)
            </p>
          </div>

          {/* Copy Domain Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <span className="text-xs font-bold text-slate-500 block">등록할 도메인 주소:</span>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono text-xs font-bold text-blue-700 select-all truncate">
                {currentHostname}
              </div>
              <button
                type="button"
                onClick={handleCopyDomain}
                className={`px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 hover:bg-slate-900 text-white shadow-xs'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>복사 완료!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>도메인 복사</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 3 Steps Guide */}
          <div className="space-y-2.5">
            <span className="font-black text-slate-900 text-xs sm:text-sm block">
              등록 순서 (3단계 • 30초)
            </span>
            <div className="space-y-2 text-xs text-slate-600">
              <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <div className="flex-1">
                  <span className="font-bold text-slate-800 block">Firebase 설정 콘솔 열기</span>
                  아래 <strong className="text-blue-700">[Firebase 콘솔 바로가기]</strong> 버튼을
                  누릅니다.
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <div className="flex-1">
                  <span className="font-bold text-slate-800 block">도메인 추가</span>
                  페이지 하단 <strong className="text-slate-900 font-bold">[승인된 도메인]</strong>{' '}
                  섹션에서 <strong className="text-slate-900 font-bold">[+ 도메인 추가]</strong>를 누르고
                  위에서 복사한 <code className="text-blue-600 bg-blue-50 px-1 rounded">{currentHostname}</code>을 붙여넣고 저장합니다.
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <div className="flex-1">
                  <span className="font-bold text-slate-800 block">로그인 다시 시도</span>
                  본 페이지로 돌아와 [Google 로그인 다시 시도] 버튼을 누르면 실시간 시트 쓰기가 즉시
                  작동합니다.
                </div>
              </div>
            </div>
          </div>

          {/* Direct Firebase Console Action */}
          <a
            href={consoleSettingsUrl}
            target="_blank"
            rel="noreferrer"
            className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer text-xs sm:text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Firebase 콘솔 승인 도메인 설정 바로가기 ↗</span>
          </a>

          {/* Alternative: Direct Token Entry */}
          <div className="pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowManualInput(!showManualInput)}
              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 font-bold cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{showManualInput ? '토큰 직접 입력 접기 ▲' : '또는 OAuth 액세스 토큰 직접 입력 (설정 없이 즉시 사용) ▼'}</span>
            </button>

            {showManualInput && (
              <div className="mt-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <p className="text-[11px] text-slate-500">
                  Google OAuth Playground 또는 개발자 도구에서 발급받은 Bearer Access Token을 입력하시면
                  Firebase 설정 없이도 즉시 실시간 시트 쓰기가 가능합니다.
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="ya29.a0..."
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono outline-hidden focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleApplyManualToken}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition shrink-0 cursor-pointer"
                  >
                    {appliedSuccess ? '적용 완료!' : '토큰 적용'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 transition cursor-pointer"
          >
            닫기
          </button>
          <div className="flex items-center gap-2">
            {onRetryLogin && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRetryLogin();
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Google 로그인 다시 시도</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
