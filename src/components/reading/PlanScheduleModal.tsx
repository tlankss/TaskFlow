import React, { useState } from 'react'
import {
  X,
  Calendar,
  Clock,
  CheckCircle2,
  Star,
  FileText,
  Filter,
  Check,
  BookOpen,
  ArrowRight,
  TrendingUp,
} from 'lucide-react'
import { Book, ReadingPlan, Task, ReadingDailySchedule } from '../../types'
import { DatePicker } from '../DatePicker'

interface PlanScheduleModalProps {
  isOpen: boolean
  onClose: () => void
  plan: ReadingPlan
  book?: Book
  tasks: Task[]
  onUpdateScheduleDate?: (planId: string, scheduleIndex: number, newDate: string) => void
  onToggleTodayFromSchedule?: (planId: string, item: ReadingDailySchedule) => void
  onOpenNotesModal?: (book: Book, plan?: ReadingPlan) => void
  onStartReading?: (book: Book, plan: ReadingPlan) => void
}

export const PlanScheduleModal: React.FC<PlanScheduleModalProps> = ({
  isOpen,
  onClose,
  plan,
  book,
  tasks,
  onUpdateScheduleDate,
  onToggleTodayFromSchedule,
  onOpenNotesModal,
  onStartReading,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'pending' | 'today' | 'completed'>('all')

  if (!isOpen) return null

  const planTasks = tasks.filter((t) => t.reading_meta?.plan_id === plan.id)
  const completedCount = planTasks.filter((t) => t.status === 'completed').length
  const totalTasksCount = planTasks.length
  const percentage =
    totalTasksCount > 0 ? Math.round((completedCount / totalTasksCount) * 100) : 0

  const scheduleList = plan.schedule || []

  // 过滤显示
  const filteredSchedule = scheduleList.map((item, idx) => {
    const linkedTask = planTasks.find(
      (t) =>
        t.due_date === item.date ||
        t.reading_meta?.chapter_title === item.chapter_title ||
        t.title.includes(item.chapter_title)
    )
    const isCompleted = linkedTask?.status === 'completed'
    const isToday = Boolean(linkedTask?.is_today || item.is_today)
    return { item, idx, linkedTask, isCompleted, isToday }
  }).filter(({ isCompleted, isToday }) => {
    if (filterMode === 'pending') return !isCompleted
    if (filterMode === 'completed') return isCompleted
    if (filterMode === 'today') return isToday
    return true
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md no-drag">
      <div className="w-full max-w-3xl bg-white dark:bg-[#1C1C1E] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-900 dark:text-slate-100 transition-colors animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent dark:from-emerald-950/40 dark:via-slate-900 border-b border-black/5 dark:border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#07C160]/15 border border-[#07C160]/30 flex items-center justify-center text-[#07C160] shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-white truncate" title={plan.book_title}>
                《{plan.book_title}》完整排期清单
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                共 {scheduleList.length} 个阅读阶段 · 目标完读: {plan.target_end_date} · 每日专注 {plan.daily_minutes}m
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {book && onStartReading && (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onStartReading(book, plan)
                }}
                className="px-3 py-1.5 rounded-xl bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059B4D] text-white text-xs font-semibold shadow-md shadow-[#07C160]/20 flex items-center space-x-1.5 transition-all"
                title="打开电子书直接开始沉浸阅读"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>继续阅读</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress & Filters Bar */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900/60 border-b border-black/5 dark:border-white/5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Progress bar */}
          <div className="flex items-center space-x-3 min-w-[200px] flex-1 max-w-xs">
            <div className="w-full bg-black/10 dark:bg-white/10 h-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#07C160] rounded-full transition-all duration-300"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="text-xs font-mono font-bold text-[#07C160] shrink-0">
              {percentage}%
            </span>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center space-x-1 p-0.5 bg-black/5 dark:bg-white/5 rounded-xl text-xs font-medium">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filterMode === 'all'
                  ? 'bg-white dark:bg-slate-800 text-[#07C160] shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              全部 ({scheduleList.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('pending')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filterMode === 'pending'
                  ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              待读 ({scheduleList.length - completedCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('today')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filterMode === 'today'
                  ? 'bg-white dark:bg-slate-800 text-amber-500 shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Today 聚焦
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('completed')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filterMode === 'completed'
                  ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              已打卡 ({completedCount})
            </button>
          </div>
        </div>

        {/* Schedule List Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-2 select-text">
          {filteredSchedule.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              当前筛选条件下暂无章节排期
            </div>
          ) : (
            filteredSchedule.map(({ item, idx, isCompleted, isToday }) => {
              return (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${
                    isCompleted
                      ? 'bg-slate-100/60 dark:bg-slate-800/40 text-slate-400 border-transparent'
                      : item.is_buffer_day
                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300'
                      : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-[#07C160]/40'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1 mr-3">
                    <span className="font-mono text-xs text-slate-400 w-10 shrink-0 font-semibold">
                      Day {item.day_index}
                    </span>

                    {/* 现代主流日历选择器 */}
                    <DatePicker
                      value={item.date}
                      onChange={(newDate) => {
                        if (newDate && onUpdateScheduleDate) {
                          onUpdateScheduleDate(plan.id, idx, newDate)
                        }
                      }}
                      size="sm"
                      title="点击调整此节点的计划执行日期"
                      className="shrink-0"
                    />

                    <span
                      className={`font-medium truncate flex-1 min-w-0 cursor-default ${
                        isCompleted ? 'line-through text-slate-400 dark:text-slate-500' : ''
                      }`}
                      title={item.chapter_title}
                    >
                      {item.chapter_title}
                    </span>
                  </div>

                  <div className="flex items-center space-x-3 shrink-0">
                    <div className="font-mono text-[11px] text-slate-500">
                      {!item.is_buffer_day && (
                        <span className="bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded font-mono">
                          P{item.start_page} ~ P{item.end_page} ({item.page_count}页)
                        </span>
                      )}
                    </div>

                    {isCompleted ? (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        <span>已打卡</span>
                      </span>
                    ) : (
                      onToggleTodayFromSchedule && (
                        <button
                          type="button"
                          onClick={() => onToggleTodayFromSchedule(plan.id, item)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                            isToday
                              ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/20'
                              : 'bg-white dark:bg-slate-800 hover:bg-[#07C160] hover:text-white border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                          }`}
                          title={isToday ? '当前已加入 Today 今日聚焦，点击移出' : '一键将此阶段加入 Today 待办'}
                        >
                          <Star className={`w-3.5 h-3.5 ${isToday ? 'fill-white text-white' : ''}`} />
                          <span>{isToday ? '已在 Today' : '+ 加入 Today'}</span>
                        </button>
                      )
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-xs shrink-0">
          <span className="text-slate-500 dark:text-slate-400">
            提示：随时点击日期调整各阶段安排；点击「+ 加入 Today」可将当天或急需阅读的章节带入今日聚焦。
          </span>

          {book && onOpenNotesModal && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onOpenNotesModal(book, plan)
              }}
              className="px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center space-x-1.5 transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-blue-500" />
              <span>读后感与笔记</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
