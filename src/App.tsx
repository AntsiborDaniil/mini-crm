import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { Layout } from './Layout'
import { LoginPage } from './pages/LoginPage'
import { MyTasksPage } from './pages/MyTasksPage'
import { ObjectPage } from './pages/ObjectPage'
import { ObjectsPage } from './pages/ObjectsPage'
import { TaskPage } from './pages/TaskPage'

function Gate() {
  const { configured, loading, session } = useAuth()
  if (!configured) return <LoginPage />
  if (loading) return <p className="center">Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  return <Layout />
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Gate />}>
        <Route path="/" element={<ObjectsPage />} />
        <Route path="/objects/:objectId" element={<ObjectPage />} />
        <Route path="/tasks/:taskId" element={<TaskPage />} />
        <Route path="/my" element={<MyTasksPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
