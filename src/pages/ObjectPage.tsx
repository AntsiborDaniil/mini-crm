import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import {
  createTask,
  deleteObject,
  loadExecutors,
  loadObject,
  loadObjectTasks,
  updateObject,
} from '../lib/api'
import { one, statusClass } from '../lib/taskRules'
import type { Profile, SiteObject, TaskRow } from '../lib/types'

export function ObjectPage() {
  const { objectId = '' } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [object, setObject] = useState<SiteObject | null>(null)
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [executors, setExecutors] = useState<Profile[]>([])
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [pending, setPending] = useState(false)

  async function reload() {
    setLoading(true)
    try {
      const [nextObject, nextTasks, nextExecutors] = await Promise.all([
        loadObject(objectId),
        loadObjectTasks(objectId),
        profile?.role === 'manager' ? loadExecutors() : Promise.resolve([]),
      ])
      if (!nextObject) {
        setMissing(true)
        setObject(null)
      } else {
        setMissing(false)
        setObject(nextObject)
        setName(nextObject.name)
        setAddress(nextObject.address)
      }
      setTasks(nextTasks)
      setExecutors(nextExecutors)
      setAssigneeId((current) => current || nextExecutors[0]?.id || '')
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось открыть объект')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [objectId, profile?.role])

  async function onSaveObject(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await updateObject(objectId, name, address)
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить объект')
    } finally {
      setPending(false)
    }
  }

  async function onDelete() {
    if (!window.confirm('Удалить объект? Это получится, только если на нём нет задач.')) return
    setPending(true)
    try {
      await deleteObject(objectId)
      navigate('/')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось удалить объект')
      setPending(false)
    }
  }

  async function onCreateTask(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await createTask({ title, description, objectId, assigneeId })
      setTitle('')
      setDescription('')
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось создать задачу')
    } finally {
      setPending(false)
    }
  }

  if (loading) return <p>Загрузка…</p>
  if (missing) {
    return (
      <section className="card">
        <h1>Объект не найден</h1>
        <p className="muted">Его нет, или у вас нет к нему доступа.</p>
        <Link to="/">К списку</Link>
      </section>
    )
  }
  if (!object) return null

  return (
    <section className="stack">
      <Link to="/" className="back">
        Все объекты
      </Link>
      <div className="page-head">
        <div>
          <p className="eyebrow">Объект</p>
          <h1>{object.name}</h1>
          <p className="muted">{object.address}</p>
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {profile?.role === 'manager' ? (
        <form className="card stack" onSubmit={(event) => void onSaveObject(event)}>
          <h2>Карточка</h2>
          <label>
            <span>Название</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            <span>Адрес</span>
            <input value={address} onChange={(event) => setAddress(event.target.value)} required />
          </label>
          <div className="row">
            <button type="submit" disabled={pending}>
              Сохранить
            </button>
            <button type="button" className="danger" disabled={pending} onClick={() => void onDelete()}>
              Удалить объект
            </button>
          </div>
        </form>
      ) : null}
      <div className="stack">
        <h2>{profile?.role === 'manager' ? 'Задачи' : 'Ваши задачи на этом объекте'}</h2>
        {tasks.length === 0 ? <p className="muted">Задач пока нет.</p> : null}
        <div className="list">
          {tasks.map((task) => (
            <Link key={task.id} to={`/tasks/${task.id}`}>
              <span>
                <strong>{task.title}</strong>
                <small>{one(task.assignee)?.full_name}</small>
              </span>
              <span className={statusClass(task.status)}>{task.status}</span>
            </Link>
          ))}
        </div>
      </div>
      {profile?.role === 'manager' ? (
        <form className="card stack" onSubmit={(event) => void onCreateTask(event)}>
          <h2>Новая задача</h2>
          <label>
            <span>Название</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label>
            <span>Описание</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label>
            <span>Исполнитель</span>
            <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} required>
              {executors.length === 0 ? <option value="">Нет исполнителей</option> : null}
              {executors.map((executor) => (
                <option key={executor.id} value={executor.id}>
                  {executor.full_name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={pending || !assigneeId}>
            Поставить задачу
          </button>
        </form>
      ) : null}
    </section>
  )
}
