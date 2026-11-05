import { supabase } from './supabase'
import type { HistoryRow, ObjectListItem, Profile, SiteObject, TaskRow, TaskStatus } from './types'
import { many } from './taskRules'

const TASK_SELECT = `
  id, title, description, status, created_at, object_id, assignee_id, author_id,
  assignee:profiles!tasks_assignee_id_fkey(id, full_name),
  author:profiles!tasks_author_id_fkey(id, full_name),
  object:objects!tasks_object_id_fkey(id, name, address)
`

const HISTORY_SELECT = `
  id, task_id, from_status, to_status, comment, created_at,
  actor:profiles!status_history_actor_id_fkey(full_name)
`

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

export async function loadObjects(): Promise<ObjectListItem[]> {
  const { data, error } = await supabase
    .from('objects')
    .select('id, name, address, tasks(id, status)')
    .order('name')
  fail(error)
  return ((data ?? []) as ObjectListItem[]).map((row) => ({
    ...row,
    tasks: many(row.tasks),
  }))
}

export async function createObject(name: string, address: string): Promise<void> {
  const { error } = await supabase.from('objects').insert({ name, address })
  fail(error)
}

export async function updateObject(id: string, name: string, address: string): Promise<void> {
  const { error } = await supabase.from('objects').update({ name, address }).eq('id', id)
  fail(error)
}

export async function deleteObject(id: string): Promise<void> {
  const { error } = await supabase.from('objects').delete().eq('id', id)
  fail(error)
}

export async function loadObject(id: string): Promise<SiteObject | null> {
  const { data, error } = await supabase.from('objects').select('id, name, address').eq('id', id).maybeSingle()
  fail(error)
  return data as SiteObject | null
}

export async function loadObjectTasks(objectId: string): Promise<TaskRow[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('object_id', objectId)
    .order('created_at', { ascending: true })
  fail(error)
  return (data ?? []) as TaskRow[]
}

export async function loadExecutors(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('role', 'executor')
    .order('full_name')
  fail(error)
  return (data ?? []) as Profile[]
}

export async function createTask(input: {
  title: string
  description: string
  objectId: string
  assigneeId: string
}): Promise<void> {
  const { error } = await supabase.rpc('create_task', {
    p_title: input.title,
    p_description: input.description,
    p_object_id: input.objectId,
    p_assignee_id: input.assigneeId,
  })
  fail(error)
}

export async function updateTask(id: string, title: string, description: string): Promise<void> {
  const { error } = await supabase.rpc('update_task', {
    p_task_id: id,
    p_title: title,
    p_description: description,
  })
  fail(error)
}

export async function transitionTask(id: string, status: TaskStatus, comment: string | null): Promise<void> {
  const { error } = await supabase.rpc('transition_task', {
    p_task_id: id,
    p_to_status: status,
    p_comment: comment,
  })
  fail(error)
}

export async function loadTask(id: string): Promise<TaskRow | null> {
  const { data, error } = await supabase.from('tasks').select(TASK_SELECT).eq('id', id).maybeSingle()
  fail(error)
  return (data as TaskRow | null) ?? null
}

export async function loadHistory(taskId: string): Promise<HistoryRow[]> {
  const { data, error } = await supabase
    .from('status_history')
    .select(HISTORY_SELECT)
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
  fail(error)
  return (data ?? []) as HistoryRow[]
}

export async function loadMyTasks(assigneeId: string): Promise<TaskRow[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('assignee_id', assigneeId)
    .order('created_at', { ascending: false })
  fail(error)
  return (data ?? []) as TaskRow[]
}
