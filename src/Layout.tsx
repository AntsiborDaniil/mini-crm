import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from './auth'
import { roleLabel } from './lib/taskRules'

export function Layout() {
  const { profile, profileError, signOut } = useAuth()

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark">Объекты и задачи</span>
          {profile ? (
            <nav>
              <NavLink to="/" end>
                Объекты
              </NavLink>
              {profile.role === 'executor' ? <NavLink to="/my">Мои задачи</NavLink> : null}
            </nav>
          ) : null}
        </div>
        <div className="who">
          {profile ? (
            <span>
              {profile.full_name}
              <small>{roleLabel(profile.role)}</small>
            </span>
          ) : null}
          <button type="button" className="secondary" onClick={() => void signOut()}>
            Выйти
          </button>
        </div>
      </header>
      <main className="wrap">
        {profileError ? <p className="error">{profileError}</p> : null}
        {!profileError && !profile ? (
          <section className="card">
            <h1>Роль не назначена</h1>
            <p>Учётная запись есть, но в базе для неё нет профиля. Администратор запускает подготовку данных.</p>
          </section>
        ) : null}
        {profile ? <Outlet /> : null}
      </main>
    </div>
  )
}
