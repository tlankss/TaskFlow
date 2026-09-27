import React from 'react'
import { Task, SubTask } from '../types'
import { TaskItem } from './TaskItem'

interface MatrixViewProps {
  tasks: Task[]
  onToggleComplete: (task: Task) => void
  onToggleToday?: (task: Task) => void
  onDelete: (id: string) => void
  onEdit: (task: Task) => void
  onToggleTimer: (task: Task) => void
  activeTimerTaskId?: string
  onToggleSubTask?: (taskId: string, subtaskId: string) => void
  onUpdateSubTask?: (taskId: string, subtaskId: string, updates: Partial<SubTask>) => void
  onDeleteSubTask?: (taskId: string, subtaskId: string) => void
  onAddSubTask?: (taskId: string, subtask: Omit<SubTask, 'id'>) => void
}

export const MatrixView: React.FC<MatrixViewProps> = ({
  tasks,
  onToggleComplete,
  onToggleToday,
  onDelete,
  onEdit,
  onToggleTimer,
  activeTimerTaskId,
  onToggleSubTask,
  onUpdateSubTask,
  onDeleteSubTask,
  onAddSubTask,
}) => {
  const p1Tasks = tasks.filter((t) => t.priority === 'p1' && t.status !== 'completed')
  const p2Tasks = tasks.filter((t) => t.priority === 'p2' && t.status !== 'completed')
  const p3Tasks = tasks.filter((t) => t.priority === 'p3' && t.status !== 'completed')
  const p4Tasks = tasks.filter((t) => t.priority === 'p4' && t.status !== 'completed')

  return (
    <div className="flex-1 p-6 grid grid-cols-2 grid-rows-2 gap-4 overflow-hidden no-drag">
      {/* Q1: P1 紧急且重要 */}
      <div className="flex flex-col rounded-2xl bg-red-500/5 dark:bg-red-950/20 border border-red-500/20 dark:border-red-500/30 p-4 overflow-hidden shadow-sm">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-red-500/10 dark:border-red-500/20">
          <h3 className="text-xs font-semibold text-red-700 dark:text-red-300 flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span>象限一：紧急且重要 (P1 - 马上做)</span>
          </h3>
          <span className="text-[10px] text-red-500 dark:text-red-400 font-mono font-semibold">{p1Tasks.length} 项</span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {p1Tasks.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              onToggleComplete={onToggleComplete}
              onToggleToday={onToggleToday}
              onDelete={onDelete}
              onEdit={onEdit}
              onToggleTimer={onToggleTimer}
              isTimerRunning={activeTimerTaskId === t.id}
              onToggleSubTask={onToggleSubTask}
              onUpdateSubTask={onUpdateSubTask}
              onDeleteSubTask={onDeleteSubTask}
              onAddSubTask={onAddSubTask}
            />
          ))}
        </div>
      </div>

      {/* Q2: P2 重要不紧急 */}
      <div className="flex flex-col rounded-2xl bg-amber-500/5 dark:bg-amber-950/20 border border-amber-500/20 dark:border-amber-500/30 p-4 overflow-hidden shadow-sm">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-amber-500/10 dark:border-amber-500/20">
          <h3 className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>象限二：重要不紧急 (P2 - 规划做)</span>
          </h3>
          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono font-semibold">{p2Tasks.length} 项</span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {p2Tasks.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              onToggleComplete={onToggleComplete}
              onToggleToday={onToggleToday}
              onDelete={onDelete}
              onEdit={onEdit}
              onToggleTimer={onToggleTimer}
              isTimerRunning={activeTimerTaskId === t.id}
              onToggleSubTask={onToggleSubTask}
              onUpdateSubTask={onUpdateSubTask}
              onDeleteSubTask={onDeleteSubTask}
              onAddSubTask={onAddSubTask}
            />
          ))}
        </div>
      </div>

      {/* Q3: P3 紧急不重要 */}
      <div className="flex flex-col rounded-2xl bg-blue-500/5 dark:bg-blue-950/20 border border-blue-500/20 dark:border-blue-500/30 p-4 overflow-hidden shadow-sm">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-blue-500/10 dark:border-blue-500/20">
          <h3 className="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span>象限三：紧急不重要 (P3 - 快速做/授权)</span>
          </h3>
          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-mono font-semibold">{p3Tasks.length} 项</span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {p3Tasks.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              onToggleComplete={onToggleComplete}
              onToggleToday={onToggleToday}
              onDelete={onDelete}
              onEdit={onEdit}
              onToggleTimer={onToggleTimer}
              isTimerRunning={activeTimerTaskId === t.id}
              onToggleSubTask={onToggleSubTask}
              onUpdateSubTask={onUpdateSubTask}
              onDeleteSubTask={onDeleteSubTask}
              onAddSubTask={onAddSubTask}
            />
          ))}
        </div>
      </div>

      {/* Q4: P4 不紧急不重要 */}
      <div className="flex flex-col rounded-2xl bg-slate-100/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/50 p-4 overflow-hidden shadow-sm">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-black/5 dark:border-slate-700/50">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span>象限四：不紧急不重要 (P4 - 空闲做)</span>
          </h3>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono font-semibold">{p4Tasks.length} 项</span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {p4Tasks.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              onToggleComplete={onToggleComplete}
              onToggleToday={onToggleToday}
              onDelete={onDelete}
              onEdit={onEdit}
              onToggleTimer={onToggleTimer}
              isTimerRunning={activeTimerTaskId === t.id}
              onToggleSubTask={onToggleSubTask}
              onUpdateSubTask={onUpdateSubTask}
              onDeleteSubTask={onDeleteSubTask}
              onAddSubTask={onAddSubTask}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
