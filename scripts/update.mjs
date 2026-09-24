// update.mjs — 统一数据更新入口（唯一守门员）
// 更新纪律（用户明令 2026-09-24）：
//   只有「交易所开放（交易日） && 数据非最新」才拉取；
//   收盘后已获取当天数据、以及节假日/周末，一律不再拉取。
// 用法：
//   node scripts/update.mjs           # 判断后按需执行全管线
//   node scripts/update.mjs --check   # 只判断不执行（打印决策原因）
//   node scripts/update.mjs --force   # 无视纪律强制全量更新（慎用）
// 管线：screen-market(全市场扫描) → build-rank(强度排序) → win-rate(收盘体检)
//       → 同步数据到 public/data/ 供站点读取
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = process.argv[2] || ''
const CHECK = arg === '--check'
const FORCE = arg === '--force'

// ── 交易日历 ─────────────────────────────────────────────
// A股休市日（只列"原本是工作日"的节假日；周六日本来就休，不用列）。
// ⚠️ 此表为 2026 年估算安排，请以国务院办公厅官方放假通知为准，可手动编辑。
const HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-01-02', // 元旦
  '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', // 春节
  '2026-04-06', // 清明补休
  '2026-05-01', '2026-05-04', '2026-05-05', // 劳动节
  '2026-06-19', // 端午
  '2026-09-25', // 中秋
  '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', // 国庆
])
const YEAR_HOLIDAYS = { 2026: HOLIDAYS_2026 }

const pad = (n) => String(n).padStart(2, '0')
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// 北京时间（UTC+8）当前时刻 → { date:'2026-09-24', time:'09:01:23', hhmm:'0901' }
function beijingNow() {
  const s = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })
  return { date: s.slice(0, 10), time: s.slice(11, 19), hhmm: s.slice(11, 13) + s.slice(14, 16) }
}

function isWeekend(dateStr) {
  const w = new Date(dateStr + 'T12:00:00+08:00').getUTCDay()
  return w === 0 || w === 6
}
function isHoliday(dateStr) {
  const y = dateStr.slice(0, 4)
  return (YEAR_HOLIDAYS[y] || new Set()).has(dateStr)
}
function isTradingDay(dateStr) {
  return !isWeekend(dateStr) && !isHoliday(dateStr)
}
// 最近一个交易日：dateStr 本身是交易日则原样返回，否则向前找
function lastTradingDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00+08:00')
  for (let i = 0; i < 30; i++) {
    const s = fmtDate(d)
    if (isTradingDay(s)) return s
    d.setUTCDate(d.getUTCDate() - 1)
  }
  return null
}

// 解析 "2026/9/23 16:05:18" / ISO 等格式 → { date:'2026-09-23', ts:Date }
function parseTs(s) {
  if (!s) return null
  const m = String(s).match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (!m) return null
  const [, y, mo, d, h = '0', mi = '0', se = '0'] = m
  const ts = new Date(`${y}-${pad(+mo)}-${pad(+d)}T${pad(+h)}:${pad(+mi)}:${pad(+se)}+08:00`)
  return { date: `${y}-${pad(+mo)}-${pad(+d)}`, ts }
}

function readDataTs() {
  const p = path.join(ROOT, 'rank-data.json')
  if (!fs.existsSync(p)) return null
  try {
    return parseTs(JSON.parse(fs.readFileSync(p, 'utf8')).generated)
  } catch {
    return null
  }
}

// ── 决策核心 ─────────────────────────────────────────────
function decide() {
  const now = beijingNow()
  const lastTD = lastTradingDay(now.date)
  const data = readDataTs()

  if (FORCE) return { update: true, reason: '--force 强制更新' }
  if (!lastTD) return { update: false, reason: '未来30天找不到交易日（节假日表未覆盖该年份？）' }
  if (!data) return { update: true, reason: '无 rank-data.json（首次生成）' }

  const market = isTradingDay(now.date)
    ? now.hhmm < '1500' ? '盘中' : '已收盘'
    : isWeekend(now.date) ? '周末休市' : '节假日休市'

  if (data.date > lastTD) return { update: false, reason: `数据日期(${data.date})超前于最近交易日(${lastTD})，异常，跳过` }

  if (data.date === lastTD) {
    const closeTs = new Date(`${lastTD}T15:00:00+08:00`)
    if (now.date === lastTD && market === '已收盘' && data.ts < closeTs) {
      return { update: true, reason: '已有今日盘中版，现已收盘 → 更新为收盘版' }
    }
    return { update: false, reason: `数据已是最近交易日(${lastTD})的最新版本（今天${market}，纪律：不重复拉取）` }
  }

  return { update: true, reason: `数据(${data.date})落后于最近交易日(${lastTD})，今天${market} → 拉取` }
}

// ── 管线执行 ─────────────────────────────────────────────
function runStep(node, script, label) {
  console.log(`\n▶ ${label}（${script}）...`)
  const r = spawnSync(node, [path.join(ROOT, script)], { cwd: ROOT, stdio: 'inherit' })
  if (r.status !== 0) {
    console.error(`✗ ${label} 失败（exit ${r.status}），中止`)
    process.exit(1)
  }
}

function syncToPublic() {
  const pub = path.join(ROOT, 'public', 'data')
  fs.mkdirSync(pub, { recursive: true })
  const files = ['rank-data.json', 'win-rate.json', 'market459-result.json', 'industry-map.json', 'backtest.json']
  for (const f of files) {
    const src = path.join(ROOT, f)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(pub, f))
      console.log('  ✓ 同步', f, '→ public/data/')
    }
  }
}

// ── main ────────────────────────────────────────────────
const now = beijingNow()
const marketState = isTradingDay(now.date)
  ? now.hhmm < '1500' ? '盘中' : '已收盘'
  : isWeekend(now.date) ? '周末休市' : '节假日休市'

console.log('════════════════════════════════════════')
console.log('数据更新守门员 · 北京时间', now.date, now.time, `（${marketState}）`)
console.log('════════════════════════════════════════')

const d = decide()
console.log('决策:', d.update ? '需要更新 ✅' : '跳过 ⏭️')
console.log('原因:', d.reason)

if (CHECK) {
  console.log('（--check 模式，不执行）')
} else if (d.update) {
  const node = process.execPath
  runStep(node, 'scripts/screen-market.mjs', '全市场扫描')
  runStep(node, 'scripts/build-rank.mjs', '强度排序 + 生成报告')
  runStep(node, 'scripts/win-rate.mjs', '5日线收盘体检')
  // 回测是历史统计（与当天行情无关），仅当缺失或超过7天才重跑
  const bt = path.join(ROOT, 'backtest.json')
  const btAge = fs.existsSync(bt) ? (Date.now() - fs.statSync(bt).mtimeMs) / 86400000 : Infinity
  if (btAge > 7) {
    runStep(node, 'scripts/backtest.mjs', '5日线战法回测（7天一刷）')
  } else {
    console.log(`\n⏭️ 回测数据仅 ${btAge.toFixed(1)} 天前生成，跳过（>7天才重跑）`)
  }
  syncToPublic()
  console.log('\n✅ 数据管线完成，public/data/ 已同步。')
} else {
  syncToPublic() // 不拉取，但确保 public/data 与根目录数据一致
  console.log('\n按纪律跳过拉取。数据文件已同步 public/data/。')
}
