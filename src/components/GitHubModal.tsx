import React, { useState } from 'react';
import {
  Github,
  Check,
  Copy,
  Terminal,
  Workflow,
  Sparkles,
  X,
  ExternalLink,
  Code2,
} from 'lucide-react';

interface GitHubModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GitHubModal: React.FC<GitHubModalProps> = ({ isOpen, onClose }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (!isOpen) return null;

  const scriptCommand = 'bash scripts/setup-github.sh';
  const ghCommand = 'gh repo create smart_money --public --source=. --push';
  const gitManualCommands = `git init
git add .
git commit -m "feat: 스마트 가계부 모바일 최적화 및 PWA 정적 웹 배포"
git branch -M main
git remote add origin https://github.com/minux-kkang/smart_money.git
git push -u origin main --force`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 text-white rounded-xl">
              <Github className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">GitHub 저장소 생성 및 CI/CD 자동 배포 가이드</h3>
              <p className="text-xs text-slate-300">
                저장소 생성부터 GitHub Actions를 통한 전 과정 자동화 설정
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800 text-xs sm:text-sm">
          {/* Status checklist */}
          <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
            <div className="flex items-center gap-2 font-bold text-emerald-900">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>자동화 준비 완료 상태 확인</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-emerald-800">
              <div className="flex items-center gap-1.5 font-medium">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>로컬 Git 저장소 초기화 완료 (`main` 브랜치)</span>
              </div>
              <div className="flex items-center gap-1.5 font-medium">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>GitHub Actions CI/CD 워크플로우 생성됨</span>
              </div>
              <div className="flex items-center gap-1.5 font-medium">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>원클릭 생성 쉘 스크립트 준비됨</span>
              </div>
              <div className="flex items-center gap-1.5 font-medium">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>GitHub Pages 자동 배포 파이프라인 구성됨</span>
              </div>
            </div>
          </div>

          {/* Quick Option 1: Script */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-blue-600" />
                <span>방법 1: 자동화 스크립트 실행 (가장 추천)</span>
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(scriptCommand, 'script')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
              >
                {copiedKey === 'script' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'script' ? '복사됨!' : '명령어 복사'}</span>
              </button>
            </div>
            <div className="p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs flex items-center justify-between">
              <code>{scriptCommand}</code>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              터미널에서 실행하면 모든 파일 스테이징 및 커밋과 함께 다음 단계를 안내합니다.
            </p>
          </div>

          {/* Quick Option 2: GitHub CLI */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <Github className="w-4 h-4 text-slate-700" />
                <span>방법 2: GitHub CLI (gh)로 저장소 생성 및 즉시 푸시</span>
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(ghCommand, 'gh')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
              >
                {copiedKey === 'gh' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'gh' ? '복사됨!' : '명령어 복사'}</span>
              </button>
            </div>
            <div className="p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs flex items-center justify-between">
              <code>{ghCommand}</code>
            </div>
          </div>

          {/* Option 3: Manual Git */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <Code2 className="w-4 h-4 text-slate-700" />
                <span>방법 3: 표준 Git 명령어로 원격 저장소 연결</span>
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(gitManualCommands, 'git')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
              >
                {copiedKey === 'git' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'git' ? '복사됨!' : '명령어 복사'}</span>
              </button>
            </div>
            <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs overflow-x-auto">
              {gitManualCommands}
            </pre>
          </div>

          {/* Deployment Info */}
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <Workflow className="w-4 h-4 text-indigo-600" />
              <span>CI/CD 자동 배포 동작 원리 (`.github/workflows/deploy.yml`)</span>
            </div>
            <ol className="list-decimal list-inside text-xs text-slate-600 space-y-1">
              <li>
                저장소로 코드가 푸시(`git push`)되면 GitHub Actions가 자동으로 빌드를 실행합니다.
              </li>
              <li>
                GitHub 저장소의 <strong>Settings &gt; Pages</strong>에서 Source를{' '}
                <strong>Deploy from a branch &gt; main &gt; /docs</strong>로 설정하시면 별도 빌드 대기 없이 즉시 웹페이지로 배포됩니다. (또는 <strong>GitHub Actions</strong> 선택 가능)
              </li>
              <li>
                웹 브라우저(모바일/PC)에서 접속 시 완전한 가계부 웹페이지가 즉시 로드됩니다.
              </li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            상세 가이드는 <strong>GITHUB_SETUP_GUIDE.md</strong> 파일을 참고하세요.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
