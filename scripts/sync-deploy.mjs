// sync-deploy.mjs — 把 dist/ 构建产物同步进 _cfdeploy/（CF Pages 部署副本）
// 用法：npm run build && node scripts/sync-deploy.mjs
// _cfdeploy/ 里手写的 functions/、wrangler.toml、_redirects 保留不动，只替换站点产物。
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const DEPLOY = path.join(ROOT, '_cfdeploy')

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('✗ dist/index.html 不存在，先跑 npm run build')
  process.exit(1)
}

// 1) 清掉旧的站点产物（保留手写部署配置）
const oldAssets = path.join(DEPLOY, 'assets')
if (fs.existsSync(oldAssets)) fs.rmSync(oldAssets, { recursive: true, force: true })
for (const f of ['index.html']) {
  const p = path.join(DEPLOY, f)
  if (fs.existsSync(p)) fs.rmSync(p)
}

// 2) 拷入新产物：index.html + assets/ + data/
fs.copyFileSync(path.join(DIST, 'index.html'), path.join(DEPLOY, 'index.html'))
fs.cpSync(path.join(DIST, 'assets'), path.join(DEPLOY, 'assets'), { recursive: true })
if (fs.existsSync(path.join(DIST, 'data'))) {
  fs.cpSync(path.join(DIST, 'data'), path.join(DEPLOY, 'data'), { recursive: true })
}

console.log('✓ dist/ → _cfdeploy/ 同步完成')
console.log('  _cfdeploy/index.html + assets/ + data/（functions/ wrangler.toml _redirects 保留）')
