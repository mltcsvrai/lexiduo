import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'apps', 'app', 'dist');
const WORKER_PUBLIC_DIR = path.join(ROOT_DIR, 'cloudflare-worker', 'public');
const DIST_ZIP_PATH = path.join(WORKER_PUBLIC_DIR, 'dist.zip');
const WORKER_VERSION_JSON = path.join(WORKER_PUBLIC_DIR, 'version.json');

console.log('🚀 OTA (Over-The-Air) Dağıtımı Başlıyor...');

// Update version dynamically BEFORE building
const packageJsonPath = path.join(ROOT_DIR, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
let currentVersion = packageJson.version;
if (!currentVersion) currentVersion = '0.0.0';

// Increment patch version
const parts = currentVersion.split('.');
parts[2] = parseInt(parts[2] || '0') + 1;
const newVersion = parts.join('.');

packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

console.log(`🏷️ Yeni Versiyon: v${newVersion}`);

// 1. Build the app
console.log('📦 Proje derleniyor (npm run build)...');
try {
  execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });
} catch (error) {
  console.error('❌ Derleme hatası!', error);
  process.exit(1);
}

// Ensure public directory exists
if (!fs.existsSync(WORKER_PUBLIC_DIR)) {
  fs.mkdirSync(WORKER_PUBLIC_DIR, { recursive: true });
}

// 2. Zip the dist folder
console.log('🗜️ dist klasörü sıkıştırılıyor (dist.zip)...');
try {
  // Remove old zip if exists
  if (fs.existsSync(DIST_ZIP_PATH)) {
    fs.unlinkSync(DIST_ZIP_PATH);
  }
  // Zip the contents of the dist directory
  execSync(`cd "${DIST_DIR}" && zip -r "${DIST_ZIP_PATH}" .`, { stdio: 'inherit' });
  console.log(`✅ Zip tamamlandı!`);
  
  const workerBase = (process.env.WORKER_API_BASE_URL || process.env.VITE_WORKER_API_BASE_URL || 'https://your-worker.workers.dev').replace(/\/+$/, '');
  const versionData = {
    version: newVersion,
    minAppVersion: '1.0.0',
    releaseNotes: 'Otomatik OTA Güncellemesi (v' + newVersion + ')',
    downloadUrl: `${workerBase}/download`,
    bundleUrl: `${workerBase}/dist.zip`,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(WORKER_VERSION_JSON, JSON.stringify(versionData, null, 2));

  // 3. Deploy to Cloudflare
  console.log('☁️ Cloudflare Worker yükleniyor...');
  execSync('npx wrangler deploy', { cwd: path.join(ROOT_DIR, 'cloudflare-worker'), stdio: 'inherit' });
  console.log('🎉 OTA Dağıtımı BAŞARILI!');
} catch (err) {
  console.error('❌ İşlem sırasında hata oluştu:', err);
  process.exit(1);
}
