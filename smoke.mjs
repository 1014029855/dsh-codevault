// dsh-codevault runtime smoke test — no cordis needed (V2 object cards + vault ctx).
// Runs the REAL execute() of the tools plus the /codevault handler against a
// throwaway data dir (DSCODEVAULT_DATA_DIR), then wipes it.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'dsh-codevault-smoke-'))
process.env.DSCODEVAULT_DATA_DIR = dir

const [{ TOOLS }, store, vault, { codevaultCommandHandler }] =
  await Promise.all([
    import('./lib/tools.js'),
    import('./lib/store.js'),
    import('./lib/vault.js'),
    import('./lib/commands.js'),
  ])

const { readEntries, queryEntries, recentEntries, archiveStats, hubSlug, hubPath, deleteEntry, configureDataRoot, dataRoot, noteFilePath, migrateLegacyNoteFiles } = store
const { configureVaultRoot, vaultRoot } = vault
const [capture, note, expand, query, recent, vaultSearch, vaultRead, vaultSuggest, readLink] = TOOLS
const exec = { signal: new AbortController().signal }

let failures = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label} => ${JSON.stringify(actual)}`)
  if (!ok) { failures += 1; console.log(`     expected: ${JSON.stringify(expected)}`) }
}
function truthy(label, value) {
  const ok = Boolean(value)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label} => ${JSON.stringify(value)}`)
  if (!ok) failures += 1
}
function lossless(label, value) {
  const ok = JSON.stringify(value) === JSON.stringify(JSON.parse(JSON.stringify(value)))
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label} lossless`)
  if (!ok) failures += 1
  return value
}
async function throws(label, fn) {
  try { await fn(); console.log(`FAIL ${label}: did not throw`); failures += 1 }
  catch { console.log(`PASS ${label} threw`) }
}
function rowOf(id) { return readEntries().find((e) => e.id === id) }

// --- capture A (object 1: plugin.ts#apply) ---
const c1 = await capture.execute({
  subject: { repo: 'deepseek-ai/deepseek-harness', ref: '0.1.2-rc.1', path: 'src/core/plugin.ts', symbol: 'apply' },
  title: 'apply：插件入口的声明式依赖注入',
  note: 'apply 就是插件入口：inject 声明服务依赖，框架就绪后调用。这是第一遍快记，坐标与机制。',
  context: '读插件加载机制。',
  tags: ['cordis', '插件机制'],
}, exec)
check('capture1 kind', c1.kind, 'capture')
check('capture1 count', c1.libraryCount, 1)
check('capture1 file title-based', basename(c1.notePath).replace(/\.md$/, ''), 'apply-插件入口的声明式依赖注入')

// --- capture B (different object: tools.ts) ---
const c2 = await capture.execute({
  subject: { repo: 'deepseek-ai/deepseek-harness', path: 'src/tools.ts' },
  title: 'defineTool 一站推导类型',
  note: 'defineTool 的 parameters 推导出模型可见 JSON Schema 与 execute 入参类型。第二个对象。',
  tags: ['dsh-tools'],
}, exec)
check('capture2 count', c2.libraryCount, 2)

// --- SECOND read of object 1 as a note: SAME card, timeline grows ---
const longBody = [
  '对象坐标：cordis 的 service 注入机制集中在 apply(ctx) 的调用约定里。插件模块导出 name/inject/apply，inject 列出依赖服务名，框架等这些服务就绪后才调用 apply，这就是声明式依赖注入。',
  '',
  '机制：注册面 ctx.tools/ctx.skills/ctx.commands 都是 cordis 的模块增强服务。register() 返回 disposer，卸载时自动清理。ctx.tools.register 接受 defineTool 产出的对象，parameters 被转成模型可见 JSON Schema。',
  '',
  '提炼与比较：inject 让插件与宿主解耦——框架保证顺序，插件只声明需要什么，比手写生命周期更稳。扩展点应该做成声明依赖 + 就绪回调的注册面。',
  '',
  '存疑与回访：apply 里同步代码抛错时 cordis 如何处理，留待回访。',
].join('\n')
const n1 = await note.execute({
  subject: { repo: 'deepseek-ai/deepseek-harness', ref: '0.1.2-rc.1', path: 'src/core/plugin.ts', symbol: 'apply' },
  title: 'apply：插件入口的声明式依赖注入', // same object
  context: '系统学习 dsh 插件框架，讲清注入机制。',
  bodyMarkdown: longBody,
  takeaway: ['扩展点应做成声明依赖 + 就绪回调的注册面', 'register() 返回 disposer，框架负责卸载清理'],
  tags: ['cordis', 'di'],
}, exec)
check('note1 kind', n1.kind, 'note')
check('note1 count', n1.libraryCount, 3)
check('same object shares noteFile', rowOf(n1.id).noteFile, rowOf(c1.id).noteFile)
check('note1 same file path as c1', n1.notePath, c1.notePath)
const obj1Text = () => readFileSync(c1.notePath, 'utf8')
truthy('object card timeline header', obj1Text().includes('阅读时间线'))
truthy('object card readCount 2', obj1Text().includes('readCount: 2'))
truthy('timeline lists both events', obj1Text().includes(`id ${c1.id}`) && obj1Text().includes(`id ${n1.id}`))
truthy('merged takeaways present', obj1Text().includes('全部提炼要点'))

// --- capture C: third event on object 1 (quick revisit) — still same card ---
const c3 = await capture.execute({
  subject: { repo: 'deepseek-ai/deepseek-harness', ref: '0.1.2-rc.1', path: 'src/core/plugin.ts', symbol: 'apply' },
  note: '重读确认：inject 顺序无关，只要名字对。第三遍，卡片时间线应有三段。',
}, exec)
check('revisit count', c3.libraryCount, 4)
check('revisit shares card', rowOf(c3.id).noteFile, rowOf(c1.id).noteFile)
check('object card readCount 3', obj1Text().includes('readCount: 3'), true)
truthy('hub lists 2 objects / 4 events', readFileSync(hubPath('deepseek-ai/deepseek-harness'), 'utf8').includes('共 2 个对象 · 4 次阅读'))

// --- validation failures (nothing persisted) ---
await throws('capture missing repo', () => capture.execute({ subject: { repo: '  ' }, note: 'x' }, exec))
await throws('capture empty note', () => capture.execute({ subject: { repo: 'a/b' }, note: '  ' }, exec))
await throws('note short body', () => note.execute({ subject: { repo: 'a/b' }, context: 'why', bodyMarkdown: '太短了。', takeaway: ['x'] }, exec))
await throws('note missing context', () => note.execute({ subject: { repo: 'a/b' }, bodyMarkdown: longBody, takeaway: ['x'] }, exec))
await throws('note missing takeaway', () => note.execute({ subject: { repo: 'a/b' }, context: 'why', bodyMarkdown: longBody }, exec))
check('rejects persisted nothing', readEntries().length, 4)

// --- query (object view) ---
const qRepo = await query.execute({ filter: { repo: 'deepseek-ai/deepseek-harness' }, limit: 10 }, exec)
lossless('query output lossless', qRepo)
lossless('query object lossless', qRepo.objects[0])
check('query repo objects', qRepo.total, 2)
check('query newest object first', qRepo.objects[0].noteFile, rowOf(c1.id).noteFile)
check('query object readCount', qRepo.objects[0].readCount, 3)
const qSymbol = await query.execute({ filter: { symbol: 'apply' } }, exec)
check('query symbol objects', qSymbol.total, 1)
const qKindNote = await query.execute({ filter: { kind: 'note' } }, exec)
check('query kind note objects', qKindNote.total, 1)
const qTag = await query.execute({ filter: { tag: 'cordis' } }, exec)
check('query tag objects', qTag.total, 1)
const qLimit = await query.execute({ filter: {}, limit: 1 }, exec)
check('query limit objects', qLimit.objects.length, 1)
check('query limit total intact', qLimit.total, 2)

// --- recent ---
const r = await recent.execute({ limit: 3 }, exec)
lossless('recent output lossless', r)
lossless('recent object lossless', r.objects[0])
check('recent total', r.total, 2)
check('recent first is object1', r.objects[0].noteFile, rowOf(c1.id).noteFile)

// --- archive stats ---
const stats = archiveStats()
check('stats events', stats.total, 4)
check('stats objects', stats.objects, 2)
check('stats repos', stats.repos, 1)
check('stats captures', stats.captures, 3)
check('stats notes', stats.notes, 1)

// --- read_expand promotes one event inside object 1 card ---
const expandBody = [
  '对象坐标：本事件是 apply 对象下第三次阅读的快记，现在升级为深读笔记以验证对象卡模型下的 read_expand——同一行补正文，kind 翻转，卡片文件不换名。',
  '',
  '机制：expandEntry 定位 id，校验正文长度与 takeaway，整行原子重写；随后 writeObjectCard 基于该对象全部事件重建同一张卡，时间线里这条从快记变深读。',
  '',
  '提炼与比较：先记后深与对象卡叠加后，时间线里可以混合快记与深读事件，全部提炼要点跨事件去重合并——比每条一个文件更能体现理解随重读生长。',
].join('\n')
const ex = await expand.execute({ id: c3.id, bodyMarkdown: expandBody, takeaway: ['对象卡时间线能混合快记与深读，takeaway 跨事件合并'] }, exec)
check('expand kind note', ex.kind, 'note')
check('expand file unchanged', ex.noteFile, rowOf(c1.id).noteFile)
truthy('expanded card has deep body', obj1Text().includes('先记后深与对象卡叠加'))
truthy('expanded card merged takeaway', obj1Text().includes('takeaway 跨事件合并'))
check('stats after expand notes', archiveStats().notes, 2)
await throws('expand note again', () => expand.execute({ id: c3.id, bodyMarkdown: expandBody, takeaway: ['x'] }, exec))

// --- /codevault command handler ---
const usage = codevaultCommandHandler('')
check('command usage ok', usage.kind, 'success')
truthy('command vault mentions MOC', codevaultCommandHandler('vault').text.includes('MOC.md'))
const recentCmd = codevaultCommandHandler('recent')
check('command recent ok', recentCmd.kind, 'success')
truthy('command recent shows objects', recentCmd.text.includes('对象'))

// --- delete: object2 (single event) removes its card; object1 keeps card ---
const c2CardBefore = noteFilePath(rowOf(c2.id))
truthy('c2 card exists', existsSync(c2CardBefore))
check('delete c2 (last event of object2)', deleteEntry(c2.id), true)
check('after delete events', archiveStats().total, 3)
check('object2 card removed', existsSync(c2CardBefore), false)
check('delete c1 (object1 still has events)', deleteEntry(c1.id), true)
truthy('object1 card survives', existsSync(noteFilePath(rowOf(n1.id))))
truthy('object1 card no longer lists c1', !readFileSync(noteFilePath(rowOf(n1.id)), 'utf8').includes(`id ${c1.id}`))

// --- dataDir config priority ---
const altDir = mkdtempSync(join(tmpdir(), 'dsh-codevault-alt-'))
try {
  check('env root before config', dataRoot(), dir)
  configureDataRoot('   ')
  check('blank config falls back', dataRoot(), dir)
  configureDataRoot(altDir)
  check('config wins over env', dataRoot(), altDir)
  const c4 = await capture.execute({ subject: { repo: 'a/b' }, title: '配置目录测试', note: '写入自定义目录的对象。' }, exec)
  truthy('write to configured dir works', existsSync(join(altDir, 'library.jsonl')))
  configureDataRoot(undefined)
  check('unset falls back to env', dataRoot(), dir)
} finally {
  rmSync(altDir, { recursive: true, force: true })
}

// --- legacy migration smoke ---
const legacyDir = mkdtempSync(join(tmpdir(), 'dsh-codevault-legacy-'))
try {
  configureDataRoot(legacyDir)
  const t1 = '2026-08-01T00:00:00.000Z'
  const t2 = '2026-08-02T00:00:00.000Z'
  const legacyRows = [
    { id: 'aaa11111', kind: 'capture', readAt: t1, subject: { repo: 'old/r', path: 'x.ts', symbol: 'f' }, note: '旧数据快记1', takeaway: [], tags: [], updatedAt: t1 },
    { id: 'bbb22222', kind: 'capture', readAt: t2, subject: { repo: 'old/r', path: 'x.ts', symbol: 'f' }, note: '旧数据快记2（同对象）', takeaway: [], tags: [], updatedAt: t2 },
    { id: 'ccc33333', kind: 'capture', readAt: t2, subject: { repo: 'old/r', path: 'y.ts' }, note: '旧数据快记3（另一对象）', takeaway: [], tags: [], updatedAt: t2 },
  ]
  writeFileSync(join(legacyDir, 'library.jsonl'), legacyRows.map(JSON.stringify).join('\n') + '\n', 'utf8')
  mkdirSync(join(legacyDir, 'notes'), { recursive: true })
  writeFileSync(join(legacyDir, 'notes', 'aaa11111.md'), '# aaa\n', 'utf8')
  writeFileSync(join(legacyDir, 'notes', 'bbb22222.md'), '# bbb\n', 'utf8')
  writeFileSync(join(legacyDir, 'notes', 'ccc33333.md'), '# ccc\n', 'utf8')
  const migrated = migrateLegacyNoteFiles()
  check('migrate reconciled 2 objects', migrated, 2)
  const rowsNow = readEntries()
  const fRows = rowsNow.filter((e) => e.subject.symbol === 'f')
  check('same-object rows share noteFile', fRows.length === 2 && fRows[0].noteFile === fRows[1].noteFile, true)
  const cardFile = join(legacyDir, 'notes', `${fRows[0].noteFile}.md`)
  truthy('object card exists after migrate', existsSync(cardFile))
  truthy('object card has both notes', (() => { const t = readFileSync(cardFile, 'utf8'); return t.includes('旧数据快记1') && t.includes('旧数据快记2') })())
  check('legacy id card removed', existsSync(join(legacyDir, 'notes', 'aaa11111.md')), false)
  check('migrate idempotent', migrateLegacyNoteFiles(), 0)
  configureDataRoot(undefined)
  check('config reset after legacy', dataRoot(), dir)
} finally {
  rmSync(legacyDir, { recursive: true, force: true })
}

// --- vault context tools (direction A) ---
const vaultDirTmp = mkdtempSync(join(tmpdir(), 'dsh-codevault-vault-'))
try {
  check('vault root unset initially', vaultRoot(), undefined)
  await throws('vault_search without config', () => vaultSearch.execute({ query: 'x' }, exec))
  configureVaultRoot(vaultDirTmp, join(vaultDirTmp, '源码阅读'))
  check('vault root configured', vaultRoot(), vaultDirTmp)
  mkdirSync(join(vaultDirTmp, '论文'), { recursive: true })
  mkdirSync(join(vaultDirTmp, '笔记'), { recursive: true })
  mkdirSync(join(vaultDirTmp, '源码阅读'), { recursive: true })
  mkdirSync(join(vaultDirTmp, '.obsidian'), { recursive: true })
  mkdirSync(join(vaultDirTmp, 'node_modules'), { recursive: true })
  writeFileSync(join(vaultDirTmp, '论文', '依赖注入论文.md'), '---\ntags: [di, pattern]\ntitle: 依赖注入论文\n---\n这是一篇讲依赖注入（Dependency Injection）机制的论文笔记，讨论构造函数注入与属性注入的取舍。', 'utf8')
  writeFileSync(join(vaultDirTmp, '笔记', 'cordis注入.md'), '---\ntags: [cordis, di]\n---\n记录 cordis 的注入机制细节。', 'utf8')
  writeFileSync(join(vaultDirTmp, '源码阅读', '档案卡.md'), '---\nkind: "object"\ntags: [di]\n---\n插件写的档案卡。', 'utf8')
  writeFileSync(join(vaultDirTmp, '.obsidian', 'workspace.json'), '{}\n', 'utf8')
  writeFileSync(join(vaultDirTmp, 'node_modules', 'skip.md'), '不应被搜到\n', 'utf8')

  const s1 = await vaultSearch.execute({ query: '依赖注入' }, exec)
  lossless('vault search lossless', s1)
  check('vault search query hits paper note', s1.total, 1)
  const s1b = await vaultSearch.execute({ query: '注入机制' }, exec)
  check('vault search query hits cordis note', s1b.total, 1)
  const s2 = await vaultSearch.execute({ tag: 'di' }, exec)
  check('vault search by tag (user scope)', s2.total, 2)
  const s3 = await vaultSearch.execute({ folder: '论文' }, exec)
  check('vault search folder filter', s3.total, 1)
  const s4 = await vaultSearch.execute({ title: 'cordis' }, exec)
  check('vault search by title', s4.total, 1)
  truthy('ignored .obsidian/node_modules excluded', !JSON.stringify(s1).includes('workspace.json') && !JSON.stringify(s1).includes('skip.md'))

  // archive/user separation: '源码阅读' subfolder is the plugin archive
  const sArch = await vaultSearch.execute({ scope: 'archive', tag: 'di' }, exec)
  check('archive scope only own cards', sArch.total, 1)
  check('archive hit flagged', sArch.notes[0].inArchive, true)
  const sUser = await vaultSearch.execute({ scope: 'user', tag: 'di' }, exec)
  check('user scope excludes archive cards', sUser.total, 2)
  check('user hit not flagged', sUser.notes[0].inArchive, false)
  const sAll = await vaultSearch.execute({ scope: 'all', tag: 'di' }, exec)
  check('all scope includes both', sAll.total, 3)
  const sUserDefault = await vaultSearch.execute({ tag: 'di' }, exec)
  check('default scope is user', sUserDefault.total, 2)

  const rd = await vaultRead.execute({ path: '论文/依赖注入论文.md' }, exec)
  lossless('vault read lossless', rd)
  truthy('vault read content', rd.content.includes('Dependency Injection'))
  await throws('vault read path escape', () => vaultRead.execute({ path: '../../etc/passwd' }, exec))
  await throws('vault read missing note', () => vaultRead.execute({ path: '不存在.md' }, exec))

  // vault_suggest: candidates ranked by matched word count, user notes only
  const su = await vaultSuggest.execute({ words: ['依赖注入', 'di'] }, exec)
  lossless('vault suggest lossless', su)
  check('suggest finds paper+note', su.total, 2)
  truthy('suggest excludes archive card', !JSON.stringify(su).includes('档案卡'))
  check('suggest best match first', su.suggestions[0].basename, '依赖注入论文')
  check('suggest matched count', su.suggestions[0].matched, 2)
  await throws('suggest empty words', () => vaultSuggest.execute({ words: [] }, exec))

  // read_link: append deduped structured links to a real event (main archive)
  const before = readEntries().find((e) => e.id === n1.id)
  const rl = await readLink.execute({ id: n1.id, links: ['依赖注入论文', '笔记/cordis注入'] }, exec)
  lossless('read link lossless', rl)
  check('read link kind kept', rl.kind, 'note')
  truthy('link appended', rl.links.includes('依赖注入论文'))
  const afterLink = readEntries().find((e) => e.id === n1.id)
  check('links persisted on row', afterLink.links.includes('笔记/cordis注入'), true)
  // dedupe: adding the same link again must not duplicate
  const rl2 = await readLink.execute({ id: n1.id, links: ['依赖注入论文'] }, exec)
  check('read link dedupes', rl2.links.filter((l) => l === '依赖注入论文').length, 1)
  // card section now lists the linked note
  const linkedCard = readFileSync(noteFilePath(afterLink), 'utf8')
  truthy('card vault-links section lists new link', linkedCard.includes('[[依赖注入论文]]'))
  await throws('read link unknown id', () => readLink.execute({ id: 'nope1234', links: ['X'] }, exec))

  configureVaultRoot(undefined)
  check('vault root reset', vaultRoot(), undefined)
} finally {
  rmSync(vaultDirTmp, { recursive: true, force: true })
}

rmSync(dir, { recursive: true, force: true })
console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
