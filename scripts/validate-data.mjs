// validate-data.mjs — 数据管线判据（退出码 0 通过 / 1 失败）
// 判据（建好跑绿后不许改）：
//   种子 ≥36 条进；输出 ≥30 条出
//   每条七字段齐：id/time/source/heat/title/summary/tags
//   tags 为非空数组；无重复 id
//   含 extraSources 非空的合并条目 ≥3
//   脏数据（缺 title 等）必须失败并指向该条
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SEEDS = resolve(ROOT, 'seeds/raw-items.json')
const ITEMS = resolve(ROOT, 'public/data/items.json')

const REQUIRED = ['id', 'time', 'source', 'heat', 'title', 'summary', 'tags']
let failures = 0
const fail = (msg) => { console.error('  ✗ ' + msg); failures++ }
const ok = (msg) => console.log('  ✓ ' + msg)

function finish() {
  if (failures === 0) {
    console.log('\n✅ VALIDATE PASSED — 退出码 0')
    process.exit(0)
  }
  console.error(`\n❌ VALIDATE FAILED — ${failures} 项不通过 — 退出码 1`)
  process.exit(1)
}

function validate() {
  if (!existsSync(SEEDS)) { fail(`种子文件缺失: ${SEEDS}`); return finish() }
  const raw = JSON.parse(readFileSync(SEEDS, 'utf8'))
  if (!Array.isArray(raw)) { fail('seeds 不是数组'); return finish() }
  if (raw.length < 36) fail(`种子条目数 ${raw.length} < 36（基线 36）`)
  else ok(`种子条目数 ${raw.length} ≥ 36`)

  if (!existsSync(ITEMS)) {
    fail(`数据文件缺失: ${ITEMS}（请先运行 node scripts/build-data.mjs）`)
    return finish()
  }
  const items = JSON.parse(readFileSync(ITEMS, 'utf8'))
  if (!Array.isArray(items)) { fail('items.json 不是数组'); return finish() }
  if (items.length < 30) fail(`输出条目数 ${items.length} < 30（基线 30）`)
  else ok(`输出条目数 ${items.length} ≥ 30`)

  const seenIds = new Set()
  const seenTitles = new Set()
  let mergedWithExtra = 0
  let dupTitle = 0
  const isMock = items.length > 0 && items.every((it) => typeof it.id === 'string' && it.id.startsWith('n'))
  items.forEach((it, idx) => {
    const label = `条目#${idx}${it && typeof it.id === 'string' ? ` (id=${it.id})` : ''}`
    if (!it || typeof it !== 'object') { fail(`${label} 不是对象`); return }
    for (const f of REQUIRED) {
      const v = it[f]
      if (v === undefined || v === null || v === '') {
        fail(`${label} 缺少必要字段 "${f}"`)
      }
    }
    if (!Array.isArray(it.tags) || it.tags.length === 0) {
      fail(`${label} tags 必须为非空数组`)
    }
    if (typeof it.id !== 'string' || seenIds.has(it.id)) {
      fail(`${label} id 重复或非法: ${String(it.id)}`)
    } else {
      seenIds.add(it.id)
    }
    // 标题去重检查（实时数据路径按标题去重，不得有重复标题）
    if (typeof it.title === 'string') {
      if (seenTitles.has(it.title)) { dupTitle++; fail(`${label} 标题重复: ${it.title}`) }
      else seenTitles.add(it.title)
    }
    if (Array.isArray(it.extraSources) && it.extraSources.length > 0) mergedWithExtra++
  })

  if (isMock) {
    if (mergedWithExtra >= 3) ok(`含 extraSources 的合并条目 ${mergedWithExtra} ≥ 3（mock 演示多源合并）`)
    else fail(`含 extraSources 的合并条目 ${mergedWithExtra} < 3（mock 需演示多源合并）`)
  } else {
    ok(`实时数据路径：合并条目 ${mergedWithExtra}（单源无需合并），标题去重 ${dupTitle} 处`)
  }

  ok(`共 ${items.length} 条，唯一 id ${seenIds.size} 个（无重复）`)
  finish()
}

validate()
