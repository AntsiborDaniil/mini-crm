import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './env.mjs'
import { accounts, objects, reworkComment, tasks } from './demo-data.mjs'

loadEnv()

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (process.env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Сервисный ключ назван VITE_SUPABASE_SERVICE_ROLE_KEY. Vite унесёт его в браузер. Переименуйте в SUPABASE_SERVICE_ROLE_KEY.',
  )
}
if (!url || !anonKey || !serviceKey) {
  throw new Error('В .env.local нужны VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY и SUPABASE_SERVICE_ROLE_KEY.')
}
if (serviceKey === anonKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY совпадает с публичным ключом. Нужен service_role.')
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function userClient() {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function findUser(email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
    if (found) return found
    if (data.users.length < 200) return null
  }
  return null
}

async function ensureUser(account) {
  let user = await findUser(account.email)
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
    })
    if (error) throw error
    user = data.user
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password: account.password,
      email_confirm: true,
    })
    if (error) throw error
  }
  const { error } = await admin.rpc('bootstrap_profile', {
    p_id: user.id,
    p_full_name: account.name,
    p_role: account.role,
  })
  if (error) throw error
  return user.id
}

async function signIn(account) {
  const client = userClient()
  const { error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  })
  if (error) throw new Error(`Не удалось войти как ${account.email}: ${error.message}`)
  return client
}

async function ensureObject(manager, object) {
  const existing = await manager.from('objects').select('id, address').eq('name', object.name).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return existing.data.id
  const inserted = await manager.from('objects').insert({ name: object.name, address: object.address }).select('id').single()
  if (inserted.error) throw inserted.error
  return inserted.data.id
}

async function advance(manager, assignee, taskId, path) {
  for (let step = 0; step < 6; step += 1) {
    const current = await manager.from('tasks').select('status').eq('id', taskId).single()
    if (current.error) throw current.error
    const index = path.indexOf(current.data.status)
    if (index < 0) {
      throw new Error(`У задачи неожиданный статус «${current.data.status}». Ожидался один из: ${path.join(', ')}`)
    }
    if (index === path.length - 1) return current.data.status
    const next = path[index + 1]
    const actor = next === 'Принята' || next === 'На доработке' ? manager : assignee
    const moved = await actor.rpc('transition_task', {
      p_task_id: taskId,
      p_to_status: next,
      p_comment: next === 'На доработке' ? reworkComment : null,
    })
    if (moved.error) throw moved.error
  }
  throw new Error('Слишком много шагов при подготовке задачи')
}

const ids = {}
for (const account of Object.values(accounts)) {
  ids[account.role === 'manager' ? 'manager' : account.email] = await ensureUser(account)
}

const manager = await signIn(accounts.manager)
const ivan = await signIn(accounts.ivan)
const maria = await signIn(accounts.maria)
const actors = { ivan, maria }

const objectIds = {}
for (const object of objects) {
  objectIds[object.key] = await ensureObject(manager, object)
}

for (const task of tasks) {
  const existing = await manager.from('tasks').select('id').eq('title', task.title).maybeSingle()
  if (existing.error) throw existing.error
  let taskId = existing.data?.id
  if (!taskId) {
    const assigneeId = ids[accounts[task.assignee].email]
    const created = await manager.rpc('create_task', {
      p_title: task.title,
      p_description: task.description,
      p_object_id: objectIds[task.object],
      p_assignee_id: assigneeId,
    })
    if (created.error) throw created.error
    taskId = created.data
  }
  const status = await advance(manager, actors[task.assignee], taskId, task.path)
  console.log(`${task.title}: ${status}`)
}

console.log('Готово. Пароли записаны в README.')
