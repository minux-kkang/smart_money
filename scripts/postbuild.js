import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const docsDir = path.join(rootDir, 'docs');
const publicDir = path.join(rootDir, 'public');

// Ensure docs dir exists
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

// Copy directory recursively
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 1. Copy dist to docs for GitHub Pages (/docs deployment)
copyDir(distDir, docsDir);

// 2. Add .nojekyll to docs to prevent GitHub Pages Jekyll processing
fs.writeFileSync(path.join(docsDir, '.nojekyll'), '');

// 3. Generate Single-File Standalone HTML
try {
  const assetsDir = path.join(distDir, 'assets');
  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    const jsFile = files.find((f) => f.endsWith('.js'));
    const cssFile = files.find((f) => f.endsWith('.css'));

    if (jsFile && cssFile) {
      const jsContent = fs.readFileSync(path.join(assetsDir, jsFile), 'utf8');
      const cssContent = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8');
      let html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');

      // Strip external asset tags
      html = html.replace(/<link rel="stylesheet"[^>]*>/gi, '');
      html = html.replace(/<script type="module"[^>]*><\/script>/gi, '');

      // Embed inline
      const inlineBundle = `
  <style>
${cssContent}
  </style>
  <script type="module">
${jsContent}
  </script>
</head>`;
      html = html.replace('</head>', inlineBundle);

      fs.writeFileSync(path.join(rootDir, 'smart_money.html'), html);
      fs.writeFileSync(path.join(docsDir, 'smart_money.html'), html);
      fs.writeFileSync(path.join(publicDir, 'smart_money.html'), html);
      fs.writeFileSync(path.join(distDir, 'smart_money.html'), html);

      console.log('✅ Generated standalone smart_money.html successfully');
    }
  }
} catch (err) {
  console.error('Failed to generate standalone HTML:', err);
}

console.log('✅ Postbuild completed: docs/ updated for GitHub Pages and standalone HTML generated');
