#!/usr/bin/env bash
set -e

echo "=============================================="
echo " 스마트 가계부 GitHub 원클릭 저장소 생성 스크립트"
echo "=============================================="

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ git이 설치되어 있지 않습니다."
    exit 1
fi

# Initialize git if not already a repository
if [ ! -d ".git" ]; then
    git init
    git config user.name "smart-money-user" || true
    git config user.email "user@example.com" || true
fi

# Configure default branch to main
git branch -M main 2>/dev/null || true

# Run production build to keep docs/ and standalone HTML up to date
echo "📦 최신 HTML 웹 및 docs/ 배포 파일 빌드 중..."
npm run build

# Stage all files
git add -A

# Check if there are changes to commit
if git diff --staged --quiet; then
    echo "ℹ️ 이미 모든 변경사항이 커밋되어 있습니다."
else
    git commit -m "feat: 스마트 가계부 - 구글 시트 연동 및 지출 관리 시스템 완성"
    echo "✅ 로컬 커밋 완료!"
fi

echo ""
echo "다음 중 원하는 방법으로 GitHub에 푸시하세요:"
echo "1. GitHub CLI(gh)를 사용할 경우:"
echo "   gh repo create smart-household-ledger --public --source=. --push"
echo ""
echo "2. 수동으로 생성한 GitHub URL이 있을 경우:"
echo "   git remote add origin https://github.com/USERNAME/REPO_NAME.git"
echo "   git push -u origin main"
echo ""
echo "자세한 사항은 GITHUB_SETUP_GUIDE.md 를 참고하세요."
