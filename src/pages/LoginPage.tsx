import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth'

export function LoginPage() {
  const { configured, loading, session, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (!configured) {
    return (
      <main className="auth">
        <section className="card narrow">
          <p className="eyebrow">Строительная компания</p>
          <h1>Объекты и задачи</h1>
          <p>
            Приложение ещё не подключено к базе. Скопируйте <code>.env.example</code> в <code>.env.local</code> и
            укажите адрес проекта Supabase и публичный ключ.
          </p>
        </section>
      </main>
    )
  }

  if (loading) return <p className="center">Загрузка…</p>
  if (session) return <Navigate to="/" replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await signIn(email, password)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось войти')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="auth">
      <section className="card narrow">
        <p className="eyebrow">Строительная компания</p>
        <h1>Объекты и задачи</h1>
        <p className="muted">Вход для постановщика и исполнителя. Новую учётку с этого экрана создать нельзя.</p>
        <form onSubmit={(event) => void onSubmit(event)} className="stack">
          <label>
            <span>Почта</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Пароль</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={pending}>
            {pending ? 'Входим…' : 'Войти'}
          </button>
        </form>
      </section>
    </main>
  )
}
