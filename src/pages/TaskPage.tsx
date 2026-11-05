import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { loadHistory, loadTask, transitionTask, updateTask } from '../lib/api'
import { actionsFor, formatWhen, one, statusClass, type TaskAction } from '../lib/taskRules'
import type { HistoryRow, TaskRow } from '../lib/types'

export function TaskPage() {
  const { taskId = '' } = useParams()
  const { profile } = useAuth()
  const [task, setTask] = useState<TaskRow | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [comment, setComment] = useState('')
  const [askComment, setAskComment] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [pending, setPending] = useState(false)

  async function reload() {
    setLoading(true)
    try {
      const next = await loadTask(taskId)
      if (!next) {
        setMissing(true)
        setTask(null)
        setHistory([])
      } else {
        setMissing(false)
        setTask(next)
        setTitle(next.title)
        setDescription(next.description)
        setHistory(await loadHistory(next.id))
      }
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось открыть задачу')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [taskId])

  async function onSave(event: FormEvent) {
    event.preventDefault()
    if (!task) return
    setPending(true)
    try {
      await updateTask(task.id, title, description)
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить задачу')
    } finally {
      setPending(false)
    }
  }

  async function onAction(action: TaskAction) {
    if (!task) return
    if (action.needsComment && !askComment) {
      setAskComment(true)
      return
    }
    if (action.needsComment && comment.trim() === '') {
      setError('Напишите, что исправить')
      return
    }
    setPending(true)
    setError(null)
    try {
      await transitionTask(task.id, action.to, action.needsComment ? comment.trim() : null)
      setAskComment(false)
      setComment('')
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Переход не выполнен')
    } finally {
      setPending(false)
    }
  }

  if (loading) return <p>Загрузка…</p>
  if (missing || !task || !profile) {
    return (
      <section className="card">
        <h1>Задача не найдена</h1>
        <p className="muted">Её нет, или она назначена другому исполнителю.</p>
        <Link to="/">К объектам</Link>
      </section>
    )
  }

  const site = one(task.object)
  const actions = actionsFor(profile.role, task.status, task.assignee_id === profile.id)

  return (
    <section className="stack">
      <Link to={site ? `/objects/${site.id}` : '/'} className="back">
        {site ? site.name : 'К объектам'}
      </Link>
      <div className="page-head">
        <div>
          <p className="eyebrow">Задача</p>
          <h1>{task.title}</h1>
          {site ? <p className="muted">{site.address}</p> : null}
        </div>
        <span className={statusClass(task.status)}>{task.status}</span>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <dl className="facts">
        <div>
          <dt>Исполнитель</dt>
          <dd>{one(task.assignee)?.full_name ?? '—'}</dd>
        </div>
        <div>
          <dt>Автор</dt>
          <dd>{one(task.author)?.full_name ?? '—'}</dd>
        </div>
        <div>
          <dt>Создана</dt>
          <dd>{formatWhen(task.created_at)}</dd>
        </div>
      </dl>
      {profile.role === 'manager' ? (
        <form className="card stack" onSubmit={(event) => void onSave(event)}>
          <h2>Текст задачи</h2>
          <label>
            <span>Название</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label>
            <span>Описание</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <button type="submit" disabled={pending}>
            Сохранить текст
          </button>
        </form>
      ) : (
        <section className="card">
          <h2>Описание</h2>
          <p>{task.description || 'Без описания.'}</p>
        </section>
      )}
      {actions.length > 0 ? (
        <section className="card stack">
          <h2>Действие</h2>
          <div className="row">
            {actions.map((action) => (
              <button
                key={action.to}
                type="button"
                className={action.needsComment ? 'secondary' : undefined}
                disabled={pending}
                onClick={() => void onAction(action)}
              >
                {action.label}
              </button>
            ))}
          </div>
          {askComment ? (
            <label>
              <span>Что исправить</span>
              <textarea value={comment} onChange={(event) => setComment(event.target.value)} />
              <small className="muted">Напишите замечание и ещё раз нажмите «Вернуть на доработку».</small>
            </label>
          ) : null}
        </section>
      ) : (
        <p className="muted">Сейчас вам нечего менять в статусе этой задачи.</p>
      )}
      <section className="stack">
        <h2>История</h2>
        <ol className="timeline">
          {history.map((row) => (
            <li key={row.id}>
              <div>
                <strong>
                  {row.from_status ? `${row.from_status} → ${row.to_status}` : `Создание · ${row.to_status}`}
                </strong>
                <small>
                  {one(row.actor)?.full_name ?? 'Система'} · {formatWhen(row.created_at)}
                </small>
              </div>
              {row.comment ? <p>{row.comment}</p> : null}
            </li>
          ))}
        </ol>
      </section>
    </section>
  )
}
