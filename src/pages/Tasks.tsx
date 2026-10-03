import { useSearchParams } from 'react-router-dom'
import TaskWorkspace from '../components/TaskWorkspace'

export default function Tasks() {
  const [params] = useSearchParams()
  return <TaskWorkspace initialEmployeeFilter={params.get('employee') ?? ''} initialTaskId={params.get('task') ?? ''} />
}
