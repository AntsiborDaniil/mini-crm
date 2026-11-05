import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { loadMyTasks } from '../lib/api'
import { one, statusClass } from '../lib/taskRules'
import type { TaskRow } from '../lib/types'

export function MyTasksPage() {
  const { profile } = useAuth()
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    let alive = true
    loadMyTasks(profile.id)
      .then((rows) => {
        if (!alive) return
        setTasks(rows)
        setError(null)
      })
      .catch((caught: unknown) => {
        if (!alive) return
        setError(caught instanceof Error ? caught.message : 'Не удалось загрузить задачи')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [profile])

  return (
    <section className="stack">
      <div>
        <p className="eyebrow">Исполнитель</p>
        <h1>Мои задачи</h1>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {loading ? <p>Загрузка…</p> : null}
      {!loading && tasks.length === 0 ? <p className="muted">Вам ещё не назначили задач.</p> : null}
      <div className="list">
        {tasks.map((task) => {
          const site = one(task.object)
          return (
            <Link key={task.id} to={`/tasks/${task.id}`}>
              <span>
                <strong>{task.title}</strong>
                <small>{site ? `${site.name} · ${site.address}` : 'Объект'}</small>
              </span>
              <span className={statusClass(task.status)}>{task.status}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
