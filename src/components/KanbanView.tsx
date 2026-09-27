import React, { useState } from 'react'
import { Plus, ArrowRight, ArrowLeft, Check, RotateCcw } from 'lucide-react'
import { Task, SubTask } from '../types'
import { TaskItem } from './TaskItem'

interface KanbanViewProps {
  tasks: Task[]
  onToggleComplete: (task: Task) => void
  onToggleToday?: (task: Task) => void
  onDelete: (id: string) => void
  onEdit: (task: Task) => void
  onToggleTimer: (task: Task) => void
  activeTimerTaskId?: string
  onNewTask: () => void
  onUpdateTaskStatus: (taskId: string, newStatus: Task['status']) => void
  onToggleSubTask?: (taskId: string, subtaskId: string) => void
  onUpdateSubTask?: (taskId: string, subtaskId: string, updates: Partial<SubTask>) => void
  onDeleteSubTask?: (taskId: string, subtaskId: string) => void
  onAddSubTask?: (taskId: string, subtask: Omit<SubTask, 'id'>) => void
}

export const KanbanView: React.FC<KanbanViewProps> = ({
  tasks,
  onToggleComplete,
  onToggleToday,
  onDelete,
  onEdit,
  onToggleTimer,
  activeTimerTaskId,
  onNewTask,
  onUpdateTaskStatus,
  onToggleSubTask,
  onUpdateSubTask,
  onDeleteSubTask,
  onAddSubTask,
}) => {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<Task['status'] | null>(null)

  const todoTasks = tasks.filter((t) => t.status === 'todo')
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress')
  const completedTasks = tasks.filter((t) => t.status === 'completed')

  // HTML5 拖拽事件处理
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingTaskId(taskId)
  }

  const handleDragEnd = () => {
    setDraggingTaskId(null)
    setDragOverColumn(null)
  }

  const handleDragOver = (e: React.DragEvent, status: Task['status']) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverColumn !== status) {
      setDragOverColumn(status)
    }
  }

  const handleDragLeave = (e: React.DragEvent, status: Task['status']) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (dragOverColumn === status) {
        setDragOverColumn(null)
      }
    }
  }

  const handleDrop = (e: React.DragEvent, status: Task['status']) => {
    e.preventDefault()
    setDragOverColumn(null)
    setDraggingTaskId(null)
    const taskId = e.dataTransfer.getData('text/plain')
    if (taskId) {
      onUpdateTaskStatus(taskId, status)
    }
  }

  return (
    <div className="flex-1 p-6 flex gap-5 overflow-x-auto overflow-y-hidden no-drag select-none min-h-0">
      {/* Column 1: Todo */}
      <div
        onDragOver={(e) => handleDragOver(e, 'todo')}
        onDragLeave={(e) => handleDragLeave(e, 'todo')}
        onDrop={(e) => handleDrop(e, 'todo')}
        className={`flex-1 min-w-[300px] max-w-[450px] flex flex-col rounded-2xl p-4 overflow-hidden shadow-sm transition-all duration-200 ${
          dragOverColumn === 'todo'
            ? 'ring-2 ring-[#07C160] bg-emerald-50/70 dark:bg-emerald-950/30 border-[#07C160]'
            : 'bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-white/5'
        }`}
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-black/5 dark:border-white/5 shrink-0">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">待开始 (To Do)</h3>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-black/5 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
              {todoTasks.length}
            </span>
          </div>
          <button
            onClick={onNewTask}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
            title="新建任务"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
          {dragOverColumn === 'todo' && (
            <div className="h-16 rounded-xl border-2 border-dashed border-[#07C160] bg-[#07C160]/10 flex items-center justify-center text-xs font-medium text-[#07C160] animate-pulse">
              松开鼠标放入「待开始」
            </div>
          )}

          {todoTasks.map((t) => (
            <div
              key={t.id}
              draggable
              onDragStart={(e) => handleDragStart(e, t.id)}
              onDragEnd={handleDragEnd}
              className={`rounded-xl transition-all duration-150 cursor-grab active:cursor-grabbing ${
                draggingTaskId === t.id ? 'opacity-30 scale-95' : 'opacity-100'
              }`}
            >
              <TaskItem
                task={t}
                onToggleComplete={onToggleComplete}
                onToggleToday={onToggleToday}
                onDelete={onDelete}
                onEdit={onEdit}
                onToggleTimer={onToggleTimer}
                isTimerRunning={activeTimerTaskId === t.id}
                showGrip={true}
                onToggleSubTask={onToggleSubTask}
                onUpdateSubTask={onUpdateSubTask}
                onDeleteSubTask={onDeleteSubTask}
                onAddSubTask={onAddSubTask}
                footerAction={
                  <button
                    type="button"
                    draggable={false}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      onUpdateTaskStatus(t.id, 'in_progress')
                    }}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#07C160] hover:bg-[#07C160]/10 border border-[#07C160]/20 hover:border-[#07C160]/40 transition-colors shrink-0"
                    title="流转至推进中"
                  >
                    <span>推进</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                }
              />
            </div>
          ))}

          {todoTasks.length === 0 && dragOverColumn !== 'todo' && (
            <div className="h-28 rounded-xl border border-dashed border-slate-300/60 dark:border-white/10 flex flex-col items-center justify-center text-xs text-slate-400 dark:text-slate-500">
              <span>暂无待开始任务</span>
              <span className="text-[10px] mt-1 text-slate-400/80">可新建或将任务拖拽至此</span>
            </div>
          )}
        </div>
      </div>

      {/* Column 2: In Progress */}
      <div
        onDragOver={(e) => handleDragOver(e, 'in_progress')}
        onDragLeave={(e) => handleDragLeave(e, 'in_progress')}
        onDrop={(e) => handleDrop(e, 'in_progress')}
        className={`flex-1 min-w-[300px] max-w-[450px] flex flex-col rounded-2xl p-4 overflow-hidden shadow-sm transition-all duration-200 ${
          dragOverColumn === 'in_progress'
            ? 'ring-2 ring-[#07C160] bg-emerald-50/70 dark:bg-emerald-950/30 border-[#07C160]'
            : 'bg-emerald-50/40 dark:bg-slate-900/60 border border-[#07C160]/30'
        }`}
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#07C160]/15 dark:border-white/5 shrink-0">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#07C160] animate-pulse" />
            <h3 className="text-xs font-semibold text-[#07C160]">推进中 (In Progress)</h3>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#07C160]/15 text-[#07C160] font-mono">
              {inProgressTasks.length}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
          {dragOverColumn === 'in_progress' && (
            <div className="h-16 rounded-xl border-2 border-dashed border-[#07C160] bg-[#07C160]/10 flex items-center justify-center text-xs font-medium text-[#07C160] animate-pulse">
              松开鼠标放入「推进中」
            </div>
          )}

          {inProgressTasks.map((t) => (
            <div
              key={t.id}
              draggable
              onDragStart={(e) => handleDragStart(e, t.id)}
              onDragEnd={handleDragEnd}
              className={`rounded-xl transition-all duration-150 cursor-grab active:cursor-grabbing ${
                draggingTaskId === t.id ? 'opacity-30 scale-95' : 'opacity-100'
              }`}
            >
              <TaskItem
                task={t}
                onToggleComplete={onToggleComplete}
                onToggleToday={onToggleToday}
                onDelete={onDelete}
                onEdit={onEdit}
                onToggleTimer={onToggleTimer}
                isTimerRunning={activeTimerTaskId === t.id}
                showGrip={true}
                onToggleSubTask={onToggleSubTask}
                onUpdateSubTask={onUpdateSubTask}
                onDeleteSubTask={onDeleteSubTask}
                onAddSubTask={onAddSubTask}
                footerAction={
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <button
                      type="button"
                      draggable={false}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        onUpdateTaskStatus(t.id, 'todo')
                      }}
                      className="flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[10px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      title="回退到上一状态（待开始）"
                    >
                      <ArrowLeft className="w-2.5 h-2.5" />
                      <span>待办</span>
                    </button>

                    <button
                      type="button"
                      draggable={false}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        onUpdateTaskStatus(t.id, 'completed')
                      }}
                      className="flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[10px] font-medium text-[#07C160] hover:bg-[#07C160]/10 border border-[#07C160]/20 hover:border-[#07C160]/40 transition-colors"
                      title="标记完成"
                    >
                      <span>完成</span>
                      <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                    </button>
                  </div>
                }
              />
            </div>
          ))}

          {inProgressTasks.length === 0 && dragOverColumn !== 'in_progress' && (
            <div className="h-28 rounded-xl border border-dashed border-[#07C160]/20 flex flex-col items-center justify-center text-xs text-slate-400 dark:text-slate-500">
              <span>暂无推进中任务</span>
              <span className="text-[10px] mt-1 text-[#07C160]/70">可从待办拖入或点击「推进」</span>
            </div>
          )}
        </div>
      </div>

      {/* Column 3: Completed */}
      <div
        onDragOver={(e) => handleDragOver(e, 'completed')}
        onDragLeave={(e) => handleDragLeave(e, 'completed')}
        onDrop={(e) => handleDrop(e, 'completed')}
        className={`flex-1 min-w-[300px] max-w-[450px] flex flex-col rounded-2xl p-4 overflow-hidden shadow-sm transition-all duration-200 ${
          dragOverColumn === 'completed'
            ? 'ring-2 ring-[#07C160] bg-emerald-50/70 dark:bg-emerald-950/30 border-[#07C160]'
            : 'bg-slate-100/50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/5'
        }`}
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-black/5 dark:border-white/5 shrink-0">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#07C160]" />
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">已完成 (Done)</h3>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-black/5 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
              {completedTasks.length}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
          {dragOverColumn === 'completed' && (
            <div className="h-16 rounded-xl border-2 border-dashed border-[#07C160] bg-[#07C160]/10 flex items-center justify-center text-xs font-medium text-[#07C160] animate-pulse">
              松开鼠标放入「已完成」
            </div>
          )}

          {completedTasks.map((t) => (
            <div
              key={t.id}
              draggable
              onDragStart={(e) => handleDragStart(e, t.id)}
              onDragEnd={handleDragEnd}
              className={`rounded-xl transition-all duration-150 cursor-grab active:cursor-grabbing ${
                draggingTaskId === t.id ? 'opacity-30 scale-95' : 'opacity-100'
              }`}
            >
              <TaskItem
                task={t}
                onToggleComplete={onToggleComplete}
                onToggleToday={onToggleToday}
                onDelete={onDelete}
                onEdit={onEdit}
                onToggleTimer={onToggleTimer}
                isTimerRunning={activeTimerTaskId === t.id}
                showGrip={true}
                onToggleSubTask={onToggleSubTask}
                onUpdateSubTask={onUpdateSubTask}
                onDeleteSubTask={onDeleteSubTask}
                onAddSubTask={onAddSubTask}
                footerAction={
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <button
                      type="button"
                      draggable={false}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        onUpdateTaskStatus(t.id, 'in_progress')
                      }}
                      className="flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[10px] text-[#07C160] hover:bg-[#07C160]/10 border border-[#07C160]/20 hover:border-[#07C160]/40 transition-colors"
                      title="回退到上一状态（重新推进）"
                    >
                      <ArrowLeft className="w-2.5 h-2.5" />
                      <span>重新推进</span>
                    </button>

                    <button
                      type="button"
                      draggable={false}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        onUpdateTaskStatus(t.id, 'todo')
                      }}
                      className="flex items-center space-x-1 px-1.5 py-0.5 rounded-lg text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      title="恢复为待开始"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>待办</span>
                    </button>
                  </div>
                }
              />
            </div>
          ))}

          {completedTasks.length === 0 && dragOverColumn !== 'completed' && (
            <div className="h-28 rounded-xl border border-dashed border-slate-300/60 dark:border-white/10 flex flex-col items-center justify-center text-xs text-slate-400 dark:text-slate-500">
              <span>暂无已完成任务</span>
              <span className="text-[10px] mt-1 text-slate-400/80">完成任务后将展示在此处</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
