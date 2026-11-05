export type Role = 'manager' | 'executor'

export type TaskStatus = 'Новая' | 'В работе' | 'На проверке' | 'Принята' | 'На доработке'

export type Profile = {
  id: string
  full_name: string
  role: Role
}

export type ProfileRef = {
  id?: string
  full_name: string
}

export type ObjectListItem = {
  id: string
  name: string
  address: string
  tasks: { id: string; status: TaskStatus }[]
}

export type SiteObject = {
  id: string
  name: string
  address: string
}

export type TaskRow = {
  id: string
  title: string
  description: string
  status: TaskStatus
  created_at: string
  object_id: string
  assignee_id: string
  author_id: string
  assignee: ProfileRef | ProfileRef[] | null
  author: ProfileRef | ProfileRef[] | null
  object: SiteObject | SiteObject[] | null
}

export type HistoryRow = {
  id: string
  task_id: string
  from_status: TaskStatus | null
  to_status: TaskStatus
  comment: string | null
  created_at: string
  actor: ProfileRef | ProfileRef[] | null
}
