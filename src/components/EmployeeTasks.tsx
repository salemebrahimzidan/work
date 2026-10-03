import TaskWorkspace from './TaskWorkspace'

export default function EmployeeTasks({ employeeId, branchId }: { employeeId: string; branchId: string | null }) {
  return <TaskWorkspace embedded scopeEmployeeId={employeeId} scopeBranchId={branchId} />
}
