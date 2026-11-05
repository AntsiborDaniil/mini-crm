import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { createObject, loadObjects } from '../lib/api'
import { statusClass } from '../lib/taskRules'
import type { ObjectListItem } from '../lib/types'

export function ObjectsPage() {
  const { profile } = useAuth()
  const [objects, setObjects] = useState<ObjectListItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [pending, setPending] = useState(false)

  async function reload() {
    setLoading(true)
    try {
      setObjects(await loadObjects())
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить объекты')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await createObject(name, address)
      setName('')
      setAddress('')
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось создать объект')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="stack">
      <div className="page-head">
        <div>
          <p className="eyebrow">Площадки</p>
          <h1>Объекты</h1>
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {loading ? <p>Загрузка…</p> : null}
      {!loading && objects.length === 0 ? (
        <p className="muted">
          {profile?.role === 'executor'
            ? 'Вам ещё не назначили задач, поэтому площадок не видно.'
            : 'Площадок пока нет.'}
        </p>
      ) : null}
      <div className="grid">
        {objects.map((object) => (
          <Link key={object.id} to={`/objects/${object.id}`} className="card site-card">
            <h2>{object.name}</h2>
            <p className="muted">{object.address}</p>
            <p className="count">
              {profile?.role === 'executor' ? 'Ваших задач' : 'Задач'}: {object.tasks.length}
            </p>
            <div className="pills">
              {object.tasks.map((task) => (
                <span key={task.id} className={statusClass(task.status)}>
                  {task.status}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
      {profile?.role === 'manager' ? (
        <form className="card stack" onSubmit={(event) => void onCreate(event)}>
          <h2>Новый объект</h2>
          <label>
            <span>Название</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            <span>Адрес</span>
            <input value={address} onChange={(event) => setAddress(event.target.value)} required />
          </label>
          <button type="submit" disabled={pending}>
            {pending ? 'Сохраняем…' : 'Создать объект'}
          </button>
        </form>
      ) : null}
    </section>
  )
}
