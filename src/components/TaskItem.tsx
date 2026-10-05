import React, { useState, useRef, useEffect } from 'react'
import {
  Check,
  Clock,
  Play,
  Pause,
  Trash2,
  Edit3,
  Sun,
  Inbox,
  ArrowRight,
  GripVertical,
  ListTodo,
  ChevronDown,
  Plus,
  X,
  MoreHorizontal,
  MessageSquare,
  Sparkles,
  BookOpen,
} from 'lucide-react'
import { Task, SubTask } from '../types'
import { DurationPicker, formatDuration } from './DurationPicker'

interface TaskItemProps {
  task: Task
  isCompact?: boolean
  onToggleComplete: (task: Task) => void
  onDelete: (id: string) => void
  onEdit: (task: Task) => void
  onToggleTimer?: (task: Task) => void
  onToggleToday?: (task: Task) => void
  onOpenReadingProgress?: (task: Task) => void
  onOpenReader?: (task: Task) => void
  isTimerRunning?: boolean
  footerAction?: React.ReactNode
  showGrip?: boolean
  onToggleSubTask?: (taskId: string, subtaskId: string) => void
  onUpdateSubTask?: (taskId: string, subtaskId: string, updates: Partial<SubTask>) => void
  onDeleteSubTask?: (taskId: string, subtaskId: string) => void
  onAddSubTask?: (taskId: string, subtask: Omit<SubTask, 'id'>) => void
}

export const TaskItem: React.FC<TaskItemProps> = ({
  task,
  isCompact = false,
  onToggleComplete,
  onDelete,
  onEdit,
  onToggleTimer,
  onToggleToday,
  onOpenReadingProgress,
  onOpenReader,
  isTimerRunning = false,
  footerAction,
  showGrip = false,
  onToggleSubTask,
  onUpdateSubTask,
  onDeleteSubTask,
  onAddSubTask,
}) => {
  const [isSubtasksExpanded, setIsSubtasksExpanded] = useState(false)

  // Subtask inline editing state on card
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editMinutes, setEditMinutes] = useState(15)
  const [editNotes, setEditNotes] = useState('')

  // Subtask inline quick add state on card
  const [isAddingSubtask, setIsAddingSubtask] = useState(false)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [newSubtaskMinutes, setNewSubtaskMinutes] = useState(15)

  // Floating dropdown menu state (浮窗图标一直显示，移入显示下拉框选项)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const menuContainerRef = useRef<HTMLDivElement | null>(null)

  const handleMenuMouseEnter = () => {
    if (menuTimeoutRef.current) {
      clearTimeout(menuTimeoutRef.current)
      menuTimeoutRef.current = null
    }
    setIsMenuOpen(true)
  }

  const handleMenuMouseLeave = () => {
    menuTimeoutRef.current = setTimeout(() => {
      setIsMenuOpen(false)
    }, 180)
  }

  useEffect(() => {
    return () => {
      if (menuTimeoutRef.current) {
        clearTimeout(menuTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isMenuOpen])

  const isCompleted = task.status === 'completed'
  const isInProgress = task.status === 'in_progress' || isTimerRunning

  const priorityStyles = {
    p1: 'bg-red-500/10 text-red-500 dark:text-red-400 border-red-500/20',
    p2: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    p3: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    p4: 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20',
  }

  const priorityLabels = {
    p1: 'P1 紧急',
    p2: 'P2 重要',
    p3: 'P3 普通',
    p4: 'P4 低优',
  }

  const subtasks = task.subtasks || []
  const completedSubtasksCount = subtasks.filter((s) => s.completed).length
  const subtasksTotal = subtasks.length
  const subtaskPercentage =
    subtasksTotal > 0 ? Math.round((completedSubtasksCount / subtasksTotal) * 100) : 0
  const subtasksTotalMinutes = subtasks.reduce(
    (acc, st) => acc + (st.estimated_minutes || 15),
    0
  )
  // 如果有子任务，主任务用时直接使用子任务用时合集
  const displayEstimatedMinutes =
    subtasksTotal > 0 ? subtasksTotalMinutes : (task.estimated_minutes || 30)

  const startEditingSubtask = (st: SubTask) => {
    setEditingSubtaskId(st.id)
    setEditTitle(st.title)
    setEditMinutes(st.estimated_minutes || 15)
    setEditNotes(st.notes || '')
  }

  const saveEditingSubtask = (stId: string) => {
    if (editTitle.trim()) {
      onUpdateSubTask?.(task.id, stId, {
        title: editTitle.trim(),
        estimated_minutes: editMinutes,
        notes: editNotes.trim() || undefined,
      })
    }
    setEditingSubtaskId(null)
  }

  const handleAddNewSubtask = () => {
    if (newSubtaskTitle.trim()) {
      onAddSubTask?.(task.id, {
        title: newSubtaskTitle.trim(),
        completed: false,
        estimated_minutes: newSubtaskMinutes,
      })
      setNewSubtaskTitle('')
      setIsAddingSubtask(false)
    }
  }

  return (
    <div
      className={`group relative ${
        isCompact ? 'p-2.5 px-3' : 'p-3.5'
      } rounded-xl border transition-all duration-200 no-drag ${
        isCompleted
          ? 'bg-slate-100/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/60 opacity-60'
          : isTimerRunning
          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-[#07C160]/60 shadow-lg shadow-[#07C160]/10 ring-1 ring-[#07C160]/30'
          : isInProgress
          ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-[#07C160]/30'
          : task.is_today
          ? 'border-amber-400/35 dark:border-amber-500/25 bg-gradient-to-br from-amber-500/[0.06] via-amber-500/[0.01] to-white dark:to-slate-900/60 shadow-sm hover:border-amber-400/50'
          : 'bg-white dark:bg-slate-900/60 border-slate-200/80 dark:border-white/5 hover:border-[#07C160]/40 dark:hover:border-[#07C160]/40 hover:shadow-sm'
      }`}
    >
      {/* 当日聚焦艺术太阳背景水印 */}
      {task.is_today && (
        <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none select-none">
          <div className="absolute -right-3 -bottom-3 opacity-[0.08] dark:opacity-[0.14] text-amber-500">
            <Sun className="w-24 h-24 -rotate-12 stroke-[1.25]" />
          </div>
        </div>
      )}

      {/* Card Header: Checkbox + Title + 浮窗图标与下拉框选项 */}
      <div className="flex items-start space-x-2.5 relative">
        {/* Animated Checkbox */}
        <button
          type="button"
          onClick={() => onToggleComplete(task)}
          className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0 ${
            isCompleted
              ? 'bg-[#07C160] border-[#07C160] text-white scale-100'
              : 'border-slate-300 dark:border-slate-600 hover:border-[#07C160] bg-white dark:bg-slate-950/50 hover:bg-[#07C160]/10 text-transparent'
          }`}
        >
          <Check className="w-3.5 h-3.5 stroke-[3]" />
        </button>

        {/* Task Content: Title & Notes */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center space-x-1.5 min-w-0">
            {task.is_today && (
              <span title="今日聚焦事项" className="shrink-0 text-amber-500">
                <Sun className="w-3.5 h-3.5 fill-amber-500/20" />
              </span>
            )}
            {task.task_type === 'reading' && (
              <span title="AI 阅读规划任务" className="shrink-0 text-blue-500">
                <BookOpen className="w-3.5 h-3.5" />
              </span>
            )}
            <h3
              className={`text-sm font-medium leading-snug break-words ${
                isCompleted
                  ? 'line-through text-slate-400 dark:text-slate-500'
                  : 'text-slate-800 dark:text-slate-100 group-hover:text-slate-900 dark:group-hover:text-white'
              }`}
            >
              {task.title}
            </h3>
          </div>

          {task.notes && (
            <p
              className={`mt-0.5 text-xs text-slate-500 dark:text-slate-400 ${
                isCompact ? 'line-clamp-1' : 'line-clamp-2'
              } leading-relaxed break-words`}
            >
              {task.notes}
            </p>
          )}
        </div>

        {/* 浮窗图标一直显示 移入显示下拉框 选项 */}
        <div
          ref={menuContainerRef}
          onMouseEnter={handleMenuMouseEnter}
          onMouseLeave={handleMenuMouseLeave}
          className="relative shrink-0 flex items-center space-x-1"
        >
          {showGrip && (
            <div
              title="按住可拖动至其他状态列"
              className="p-1 text-slate-300 dark:text-slate-600 cursor-grab active:cursor-grabbing hover:text-slate-500 transition-colors"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </div>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setIsMenuOpen((prev) => !prev)
            }}
            title="任务选项"
            className={`p-1.5 rounded-lg border transition-all duration-150 ${
              isMenuOpen
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-600 shadow-sm'
                : 'bg-white/80 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border-slate-200/80 dark:border-white/10 shadow-xs'
            }`}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>

          {/* 移入显示下拉框 选项 */}
          {isMenuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 space-y-0.5"
            >
              {/* 阅读进度记页码打卡 */}
              {task.task_type === 'reading' && onOpenReadingProgress && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false)
                    onOpenReadingProgress(task)
                  }}
                  className="w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition-colors text-left"
                >
                  <BookOpen className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span>记录阅读进度与心得</span>
                </button>
              )}

              {/* 一键流转到 Today / 移回 Inbox 按钮 */}
              {!isCompleted && onToggleToday && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false)
                    onToggleToday(task)
                  }}
                  className="w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-left"
                >
                  {task.is_today ? (
                    <>
                      <Inbox className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>移出今日，存入 Inbox</span>
                    </>
                  ) : (
                    <>
                      <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>纳入今日 Today 聚焦</span>
                    </>
                  )}
                </button>
              )}

              {/* 专注计时按钮 */}
              {!isCompleted && onToggleTimer && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false)
                    onToggleTimer(task)
                  }}
                  className="w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-[#07C160]/10 hover:text-[#07C160] transition-colors text-left"
                >
                  {isTimerRunning ? (
                    <>
                      <Pause className="w-3.5 h-3.5 text-[#07C160] shrink-0" />
                      <span>暂停专注计时</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-[#07C160] shrink-0" />
                      <span>开启专注计时</span>
                    </>
                  )}
                </button>
              )}

              {/* 直接沉浸阅读 */}
              {task.reading_meta && onOpenReader && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false)
                    onOpenReader(task)
                  }}
                  className="w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#07C160] hover:bg-[#07C160]/10 transition-colors text-left"
                >
                  <BookOpen className="w-3.5 h-3.5 text-[#07C160] shrink-0" />
                  <span>打开电子书开始阅读</span>
                </button>
              )}

              {/* 编辑任务详情 */}
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false)
                  onEdit(task)
                }}
                className="w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
              >
                <Edit3 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                <span>编辑任务详情</span>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              {/* 删除任务 */}
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false)
                  onDelete(task.id)
                }}
                className="w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-left"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span>删除任务</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Subtasks Progress Bar & Inline Checklist (支持卡片就地勾选、编辑、删除与加项) */}
      {(subtasksTotal > 0 || isAddingSubtask) && (
        <div className={`${isCompact ? 'mt-1.5 pt-1.5' : 'mt-2.5 pt-2'} border-t border-black/[0.04] dark:border-white/5 space-y-1.5`}>
          <div
            onClick={(e) => {
              e.stopPropagation()
              setIsSubtasksExpanded(!isSubtasksExpanded)
            }}
            className="flex items-center justify-between cursor-pointer group/st select-none py-0.5"
            title="点击展开/收起子任务清单"
          >
            <div className="flex items-center space-x-1.5">
              <ListTodo className="w-3.5 h-3.5 text-[#07C160] shrink-0" />
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                子任务 ({completedSubtasksCount}/{subtasksTotal})
              </span>
              {subtasksTotal > 0 && completedSubtasksCount === subtasksTotal && (
                <span className="text-[10px] text-[#07C160] font-semibold flex items-center space-x-0.5">
                  <span>全完成</span>
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              {subtasksTotal > 0 && (
                <>
                  <div className="w-14 h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-[#07C160] transition-all duration-300 rounded-full"
                      style={{ width: `${subtaskPercentage}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                    {subtaskPercentage}%
                  </span>
                </>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 group-hover/st:text-slate-700 dark:group-hover/st:text-slate-200 transition-transform duration-200 ${
                  isSubtasksExpanded ? 'rotate-180' : ''
                }`}
              />
            </div>
          </div>

          {/* Expanded Subtasks List (可就地勾选、改名、调时间、删减、加项) */}
          {isSubtasksExpanded && (
            <div className="space-y-1 pt-1 max-h-56 overflow-y-auto">
              {subtasks.map((st) => (
                <div key={st.id}>
                  {editingSubtaskId === st.id ? (
                    /* Inline Edit Mode */
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 bg-black/[0.04] dark:bg-white/[0.06] rounded-lg text-xs space-y-1.5"
                    >
                      <div className="flex items-center space-x-1.5">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditingSubtask(st.id)
                            if (e.key === 'Escape') setEditingSubtaskId(null)
                          }}
                          autoFocus
                          placeholder="子任务名称..."
                          className="flex-1 min-w-0 px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#07C160]"
                        />
                        <DurationPicker
                          value={editMinutes}
                          onChange={setEditMinutes}
                          size="sm"
                        />
                        <button
                          type="button"
                          onClick={() => saveEditingSubtask(st.id)}
                          className="p-1 rounded bg-[#07C160] text-white hover:bg-[#06AD56]"
                          title="保存修改"
                        >
                          <Check className="w-3 h-3 stroke-[3]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingSubtaskId(null)}
                          className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                          title="取消"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Inline Note input */}
                      <div className="flex items-center space-x-1.5 pt-1 border-t border-black/[0.04] dark:border-white/5">
                        <span className="text-[10px] text-[#07C160] font-medium shrink-0 flex items-center space-x-0.5">
                          <MessageSquare className="w-3 h-3" />
                          <span>成果备注:</span>
                        </span>
                        <input
                          type="text"
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditingSubtask(st.id)
                          }}
                          placeholder="记录步骤心得、成果结论 (作为AI总结数据源)..."
                          className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-700 dark:text-slate-300 focus:outline-none focus:border-[#07C160]"
                        />
                      </div>
                    </div>
                  ) : (
                    /* Display Mode */
                    <div className="py-1 px-1.5 rounded-lg hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors group/item text-xs space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onToggleSubTask?.(task.id, st.id)
                          }}
                          className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-all shrink-0 ${
                            st.completed
                              ? 'bg-[#07C160] border-[#07C160] text-white'
                              : 'border-slate-300 dark:border-slate-600 hover:border-[#07C160] bg-white dark:bg-slate-900'
                          }`}
                        >
                          {st.completed && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </button>
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            onToggleSubTask?.(task.id, st.id)
                          }}
                          className={`break-words min-w-0 flex-1 leading-snug cursor-pointer select-none transition-colors ${
                            st.completed
                              ? 'line-through text-slate-400 dark:text-slate-500'
                              : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {st.title}
                        </span>

                        {/* Time badge */}
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono shrink-0 px-1 py-0.2 rounded bg-black/[0.03] dark:bg-white/[0.04]">
                          ⏱ {formatDuration(st.estimated_minutes || 15)}
                        </span>

                        {/* Quick action buttons on hover: edit & delete */}
                        <div className="opacity-0 group-hover/item:opacity-100 flex items-center space-x-0.5 transition-opacity shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              startEditingSubtask(st)
                            }}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10"
                            title="编辑子任务/修改备注与用时"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onDeleteSubTask?.(task.id, st.id)
                            }}
                            className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-500/10"
                            title="删除此子项"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Display subtask completion note if exists */}
                      {st.notes && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation()
                            startEditingSubtask(st)
                          }}
                          title="点击修改成果备注"
                          className="text-[10px] text-slate-500 dark:text-slate-400 pl-5.5 flex items-center space-x-1 cursor-pointer hover:text-[#07C160] transition-colors"
                        >
                          <span className="text-[#07C160]">💬</span>
                          <span className="truncate">{st.notes}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Quick inline add subtask on the card */}
              {isAddingSubtask ? (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center space-x-1.5 py-1 px-1 bg-black/[0.03] dark:bg-white/[0.04] rounded-lg text-xs pt-1.5"
                >
                  <input
                    type="text"
                    placeholder="输入子步骤，按 Enter 确认..."
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddNewSubtask()
                      if (e.key === 'Escape') setIsAddingSubtask(false)
                    }}
                    autoFocus
                    className="flex-1 min-w-0 px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#07C160]"
                  />
                  <DurationPicker
                    value={newSubtaskMinutes}
                    onChange={setNewSubtaskMinutes}
                    size="sm"
                  />
                  <button
                    type="button"
                    onClick={handleAddNewSubtask}
                    disabled={!newSubtaskTitle.trim()}
                    className="p-1 rounded bg-[#07C160] disabled:opacity-40 text-white hover:bg-[#06AD56]"
                    title="添加"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingSubtask(false)}
                    className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    title="取消"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsAddingSubtask(true)
                  }}
                  className="w-full py-1 text-center text-[11px] text-[#07C160] hover:text-[#06AD56] hover:bg-[#07C160]/5 rounded-md transition-colors flex items-center justify-center space-x-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>添加子步骤</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Card Footer: Metadata on left, Status Transition action on right */}
      <div className={`${isCompact ? 'mt-1.5 pt-1.5' : 'mt-2.5 pt-2'} border-t border-black/[0.04] dark:border-white/5 flex items-center justify-between gap-2`}>
        <div className="flex items-center flex-wrap gap-1.5 text-[10px]">
          <span
            className={`shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded font-semibold border ${
              priorityStyles[task.priority]
            }`}
          >
            {priorityLabels[task.priority]}
          </span>

          {task.reading_meta && (
            <div className="flex items-center space-x-1 shrink-0 whitespace-nowrap">
              {onOpenReader && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenReader(task)
                  }}
                  className="hover:bg-[#07C160]/20 transition-colors flex items-center space-x-1 px-1.5 py-0.5 rounded bg-[#07C160]/10 text-[#07C160] font-medium border border-[#07C160]/25"
                  title="点击直接打开电子书沉浸阅读"
                >
                  <BookOpen className="w-3 h-3" />
                  <span>读原书</span>
                </button>
              )}
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenReadingProgress?.(task)
                }}
                className="cursor-pointer hover:bg-blue-500/20 transition-colors flex items-center space-x-1 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium border border-blue-500/20"
                title="点击记录或更新实际读到的页码"
              >
                <span>P{task.reading_meta.start_page}~P{task.reading_meta.end_page}</span>
                <span className="text-[9px] underline ml-0.5">打卡</span>
              </span>
            </div>
          )}

          <span
            title={subtasksTotal > 0 ? `已按子任务用时合并: ${formatDuration(subtasksTotalMinutes, true)}` : `预估用时: ${formatDuration(displayEstimatedMinutes, true)}`}
            className="flex items-center space-x-1 shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded bg-black/[0.03] dark:bg-white/[0.04] text-slate-500 dark:text-slate-400"
          >
            <Clock className="w-3 h-3 text-slate-400" />
            <span>{formatDuration(displayEstimatedMinutes)}</span>
          </span>

          {task.actual_minutes > 0 && (
            <span className="text-[#07C160] font-medium shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded bg-[#07C160]/10 border border-[#07C160]/20">
              已专注 {task.actual_minutes}m
            </span>
          )}

          {task.due_date && !task.is_today && (
            <span className="shrink-0 whitespace-nowrap text-slate-400 dark:text-slate-500">
              📅 {task.due_date}
            </span>
          )}
        </div>

        {/* Embedded Footer Action */}
        {footerAction && (
          <div className="shrink-0">
            {footerAction}
          </div>
        )}
      </div>
    </div>
  )
}
