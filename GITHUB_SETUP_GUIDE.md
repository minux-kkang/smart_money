# 스마트 가계부 GitHub 연동 및 자동 배포 가이드

이 프로젝트는 GitHub 저장소(Repository) 생성부터 GitHub Actions를 통한 자동 빌드 및 배포까지 전 과정이 자동화되도록 설정되어 있습니다.

---

## 🚀 빠른 시작 (3단계)

### 1단계: Git 저장소 초기화 및 커밋
프로젝트 터미널에서 다음 명령어를 실행합니다:

```bash
# 1. 파일 스테이징 및 첫 커밋
git add .
git commit -m "feat: 스마트 가계부 및 구글 시트 연동 기능 구축"
git branch -M main
```

### 2단계: GitHub 저장소 생성 및 푸시

#### 방법 A: GitHub CLI (`gh`) 사용 (가장 간편)
```bash
# GitHub CLI 로그인 (최초 1회)
gh auth login

# 새 원격 저장소 자동 생성 및 푸시 (public 또는 private 선택)
gh repo create smart-household-ledger --public --source=. --remote=origin --push
```

#### 방법 B: GitHub 웹사이트에서 생성 후 푸시
1. [GitHub New Repository](https://github.com/new) 접속
2. 저장소 이름 (예: `smart-household-ledger`) 입력 후 **Create repository** 클릭
3. 터미널에서 원격 주소 연결 후 푸시:
```bash
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/smart-household-ledger.git
git push -u origin main
```

---

## ⚙️ GitHub Pages 웹페이지 배포 설정 (2가지 방법 중 택 1)

### 방법 1: 가장 추천 (/docs 폴더 배포 - 1초 만에 배포 완료)
1. GitHub 저장소(`minux-kkang/smart_money`)의 **Settings** > **Pages**로 이동합니다.
2. **Build and deployment** 아래의 **Source**에서:
   - Source: **Deploy from a branch**
   - Branch: **`main`**
   - Folder: **`/docs`** (기본값인 `/ (root)` 대신 `/docs` 선택!)
3. **Save**를 누르면 즉시 `https://minux-kkang.github.io/smart_money/` 로 모바일/PC 겸용 HTML 웹페이지가 열립니다!

### 방법 2: GitHub Actions 자동 빌드 배포
1. 저장소의 **Settings** > **Pages**로 이동합니다.
2. **Source**를 **GitHub Actions**로 선택합니다.
3. 코드 푸시 시 자동으로 `.github/workflows/deploy.yml`이 동작하여 배포됩니다.

---

## 💻 서버 없이 파일로 바로 실행하기 (`smart_money.html`)
프로젝트 루트 또는 `docs/` 폴더에 생성되어 있는 **`smart_money.html`** 파일은 HTML, CSS, JavaScript가 모두 1개의 파일 안에 포함된 완전 독립형 웹페이지입니다.
- 인터넷이나 웹 서버 없이도, **PC나 스마트폰에서 `smart_money.html` 파일을 더블클릭(터치)**하면 웹 브라우저에서 가계부가 바로 실행됩니다!

---

## 🔐 Google Workspace OAuth 환경설정 안내
GitHub Pages나 자체 도메인으로 배포 시, Firebase 콘솔의 **Authentication > Settings > Authorized domains**에 해당 도메인 (예: `YOUR_USERNAME.github.io`)을 추가해 주시면 로그인 팝업이 원활하게 작동합니다.
