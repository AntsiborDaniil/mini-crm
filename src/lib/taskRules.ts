import type { Role, TaskStatus } from './types'

export type TaskAction = {
  to: TaskStatus
  label: string
  needsComment: boolean
}

export function actionsFor(role: Role, status: TaskStatus, isAssignee: boolean): TaskAction[] {
  if (role === 'executor' && isAssignee && (status === 'Новая' || status === 'На доработке')) {
    return [{ to: 'В работе', label: 'Взять в работу', needsComment: false }]
  }
  if (role === 'executor' && isAssignee && status === 'В работе') {
    return [{ to: 'На проверке', label: 'Отправить на проверку', needsComment: false }]
  }
  if (role === 'manager' && status === 'На проверке') {
    return [
      { to: 'Принята', label: 'Принять', needsComment: false },
      { to: 'На доработке', label: 'Вернуть на доработку', needsComment: true },
    ]
  }
  return []
}

export function statusClass(status: string): string {
  switch (status) {
    case 'Новая':
      return 'pill pill-new'
    case 'В работе':
      return 'pill pill-work'
    case 'На проверке':
      return 'pill pill-review'
    case 'На доработке':
      return 'pill pill-rework'
    case 'Принята':
      return 'pill pill-done'
    default:
      return 'pill'
  }
}

export function roleLabel(role: Role): string {
  return role === 'manager' ? 'Постановщик' : 'Исполнитель'
}

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

export function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export function many<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}
