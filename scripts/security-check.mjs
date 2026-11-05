import fs from 'node:fs'
import path from 'node:path'
import { loadEnv } from './env.mjs'
import { accounts, objects, tasks } from './demo-data.mjs'

loadEnv()

const failures = []
const sqlPath = 'supabase/migrations/20261105190000_init.sql'
const sql = fs.readFileSync(sqlPath, 'utf8')

const needles = [
  'revoke all on public.tasks from public, anon, authenticated',
  'grant select on public.tasks to authenticated',
  'revoke all on public.status_history from public, anon, authenticated',
  'grant select on public.status_history to authenticated',
  'revoke all on function public.bootstrap_profile(uuid, text, text) from public, anon, authenticated',
  'grant execute on function public.bootstrap_profile(uuid, text, text) to service_role',
  'revoke all on function public.create_task(text, text, uuid, uuid) from public, anon',
  'grant execute on function public.create_task(text, text, uuid, uuid) to authenticated',
  'enable row level security',
  'app.allow_history_write',
  'app.task_write_mode',
  'Такой переход статуса запрещён',
  'Чтобы вернуть задачу, нужен комментарий',
  'Историю статусов нельзя изменить или удалить',
  'Назначить можно только исполнителя',
]

for (const needle of needles) {
  if (!sql.includes(needle)) failures.push(`В миграции нет фразы: ${needle}`)
}
if (/alter\s+table[^;]*force\s+row\s+level\s+security/i.test(sql)) {
  failures.push('FORCE ROW LEVEL SECURITY сломает процедуры записи')
}
if (/grant\s+(all|insert|update|delete)\s+on\s+public\.tasks\s+to\s+(anon|authenticated|public)/i.test(sql)) {
  failures.push('На задачи выдана прямая запись')
}
if (/grant\s+(all|insert|update|delete)\s+on\s+public\.status_history\s+to\s+(anon|authenticated|public)/i.test(sql)) {
  failures.push('На историю выдана прямая запись')
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walk(full))
    else files.push(full)
  }
  return files
}

for (const file of walk('src')) {
  const text = fs.readFileSync(file, 'utf8')
  if (text.includes('service_role') || text.includes('SUPABASE_SERVICE_ROLE')) {
    failures.push(`${file} упоминает сервисный ключ`)
  }
}

const example = fs.readFileSync('.env.example', 'utf8')
if (example.includes('eyJ')) failures.push('.env.example содержит ключ')

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (serviceKey && serviceKey.length > 20) {
  for (const file of walk('src')) {
    if (fs.readFileSync(file, 'utf8').includes(serviceKey)) {
      failures.push(`Сервисный ключ попал в ${file}`)
    }
  }
}

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.log('Проверка файлов:', failures.length ? 'ошибки' : 'ок')
  console.log('Проверка базы: пропущена, нет VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY')
  if (failures.length) {
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
  process.exit(0)
}

const { createClient } = await import('@supabase/supabase-js')

function client() {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function signIn(account) {
  const signed = client()
  const { error } = await signed.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  })
  if (error) throw new Error(`Не удалось войти как ${account.email}: ${error.message}. Сначала npm run seed.`)
  return signed
}

function sameSet(actual, expected, label) {
  const left = [...actual].sort().join('\n')
  const right = [...expected].sort().join('\n')
  if (left !== right) {
    failures.push(`${label}. Получилось: ${[...actual].join(', ') || 'пусто'}. Ожидалось: ${[...expected].join(', ')}`)
  }
}

const anna = await signIn(accounts.manager)
const ivan = await signIn(accounts.ivan)
const maria = await signIn(accounts.maria)

const allTasks = await anna.from('tasks').select('id, title, status, assignee_id')
if (allTasks.error) failures.push(allTasks.error.message)
const rows = allTasks.data ?? []
const byTitle = new Map(rows.map((row) => [row.title, row]))

for (const task of tasks) {
  const row = byTitle.get(task.title)
  const want = task.path[task.path.length - 1]
  if (!row) failures.push(`Нет задачи «${task.title}»`)
  else if (row.status !== want) failures.push(`«${task.title}» в статусе «${row.status}», ожидался «${want}»`)
}

async function visibleTitles(person) {
  const result = await person.from('tasks').select('id, title')
  if (result.error) failures.push(result.error.message)
  return result.data ?? []
}

async function visibleObjects(person) {
  const result = await person.from('objects').select('id, name, address')
  if (result.error) failures.push(result.error.message)
  return result.data ?? []
}

const ivanTasks = await visibleTitles(ivan)
const mariaTasks = await visibleTitles(maria)
sameSet(
  ivanTasks.map((row) => row.title),
  tasks.filter((task) => task.assignee === 'ivan').map((task) => task.title),
  'Иван видит не свои задачи',
)
sameSet(
  mariaTasks.map((row) => row.title),
  tasks.filter((task) => task.assignee === 'maria').map((task) => task.title),
  'Мария видит не свои задачи',
)

const ivanObjects = await visibleObjects(ivan)
const mariaObjects = await visibleObjects(maria)
const namesFor = (assignee) =>
  objects
    .filter((object) => tasks.some((task) => task.assignee === assignee && task.object === object.key))
    .map((object) => object.name)
sameSet(
  ivanObjects.map((row) => row.name),
  namesFor('ivan'),
  'Иван видит не свои объекты',
)
sameSet(
  mariaObjects.map((row) => row.name),
  namesFor('maria'),
  'Мария видит не свои объекты',
)

const concrete = byTitle.get('Приёмка бетона стен')
const rebar = byTitle.get('Завезти арматуру 12 мм')
const north = (await anna.from('objects').select('id, name, address').eq('name', 'ЖК «Северный»').single()).data

if (concrete) {
  const hidden = await ivan.from('tasks').select('id').eq('id', concrete.id)
  if ((hidden.data ?? []).length > 0) failures.push('Иван прочитал задачу Марии по идентификатору')

  const patched = await ivan.from('tasks').update({ status: 'Принята' }).eq('id', concrete.id).select('status')
  const again = await anna.from('tasks').select('status').eq('id', concrete.id).single()
  if (!patched.error && (patched.data ?? []).length > 0) failures.push('Прямая запись чужой задачи не отвергнута')
  if (again.data?.status !== concrete.status) failures.push('Статус чужой задачи изменился прямым запросом')

  const accepted = await ivan.rpc('transition_task', {
    p_task_id: concrete.id,
    p_to_status: 'Принята',
    p_comment: null,
  })
  const afterAccept = await anna.from('tasks').select('status').eq('id', concrete.id).single()
  if (!accepted.error || afterAccept.data?.status === 'Принята') {
    failures.push('Исполнитель смог принять задачу')
  }

  const blank = await anna.rpc('transition_task', {
    p_task_id: concrete.id,
    p_to_status: 'На доработке',
    p_comment: '   ',
  })
  const afterBlank = await anna.from('tasks').select('status').eq('id', concrete.id).single()
  if (!blank.error || afterBlank.data?.status !== concrete.status) {
    failures.push('Возврат с пустым комментарием прошёл')
  }
}

if (rebar) {
  const jumped = await anna.rpc('transition_task', {
    p_task_id: rebar.id,
    p_to_status: 'В работе',
    p_comment: null,
  })
  const afterJump = await anna.from('tasks').select('status').eq('id', rebar.id).single()
  if (!jumped.error || afterJump.data?.status !== 'Новая') {
    failures.push('Постановщик смог взять чужую задачу в работу')
  }

  const direct = await ivan.from('tasks').update({ status: 'Принята' }).eq('id', rebar.id)
  const afterDirect = await anna.from('tasks').select('status').eq('id', rebar.id).single()
  if (afterDirect.data?.status !== 'Новая') failures.push('Исполнитель сменил статус своей задачи прямым запросом')
  void direct
}

if (north) {
  await ivan.from('objects').update({ address: 'секрет' }).eq('id', north.id)
  const after = await anna.from('objects').select('address').eq('id', north.id).single()
  if (after.data?.address !== north.address) failures.push('Исполнитель изменил адрес объекта')
}

const ivanUser = await ivan.auth.getUser()
if (ivanUser.data.user) {
  await ivan.from('profiles').update({ role: 'manager' }).eq('id', ivanUser.data.user.id)
  const role = await ivan.from('profiles').select('role').eq('id', ivanUser.data.user.id).single()
  if (role.data?.role !== 'executor') failures.push('Исполнитель сменил себе роль')
}

const ownIds = new Set(ivanTasks.map((row) => row.id))
const history = await ivan.from('status_history').select('task_id, comment')
if (history.error) failures.push(history.error.message)
for (const row of history.data ?? []) {
  if (!ownIds.has(row.task_id)) failures.push('Иван видит чужую историю')
  if (row.comment === 'подделка') failures.push('В истории осталась поддельная запись')
}

const forged = await ivan.from('status_history').insert({
  task_id: rebar?.id,
  actor_id: ivanUser.data.user?.id,
  from_status: 'Новая',
  to_status: 'Принята',
  comment: 'подделка',
})
const forgedRows = await anna.from('status_history').select('id').eq('comment', 'подделка')
if (!forged.error && (forgedRows.data ?? []).length > 0) failures.push('Удалось дописать историю')
if ((forgedRows.data ?? []).length > 0) failures.push('Поддельная история читается')

const sample = await anna.from('status_history').select('id').limit(1).maybeSingle()
if (sample.data) {
  await ivan.from('status_history').delete().eq('id', sample.data.id)
  const still = await anna.from('status_history').select('id').eq('id', sample.data.id).maybeSingle()
  if (!still.data) failures.push('Историю удалось удалить')
}

if (north && ivanUser.data.user) {
  const before = await anna.from('tasks').select('id', { count: 'exact', head: true })
  const created = await ivan.rpc('create_task', {
    p_title: 'Чужая постановка',
    p_description: '',
    p_object_id: north.id,
    p_assignee_id: ivanUser.data.user.id,
  })
  const after = await anna.from('tasks').select('id', { count: 'exact', head: true })
  if (!created.error || before.count !== after.count) failures.push('Исполнитель создал задачу')
}

const anon = client()
const signup = await anon.auth.signUp({
  email: `no-signup-${Date.now()}@example.com`,
  password: 'Should-Not-Work-1',
})
if (signup.data.session || signup.data.user) {
  failures.push('Открытая регистрация включена. В Supabase выключите Sign ups у Email.')
}

console.log('Проверка файлов и базы:', failures.length ? 'ошибки' : 'ок')
if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
