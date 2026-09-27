import React, { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon } from 'lucide-react'
import { Task, Project } from '../types'

interface CalendarViewProps {
  tasks: Task[]
  projects: Project[]
  onSelectDateTask: (dateStr: string) => void
  onToggleComplete: (task: Task) => void
  onEditTask: (task: Task) => void
  onMonthChange?: (year: number, month: number) => void
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  tasks,
  projects,
  onSelectDateTask,
  onToggleComplete,
  onEditTask,
  onMonthChange,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date())

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // 监听翻月并通知父组件按月拉取日程数据
  useEffect(() => {
    onMonthChange?.(year, month + 1)
  }, [year, month, onMonthChange])

  // Navigation helpers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  // Days in month calculation
  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()

  // 0 = Sunday, 1 = Monday ... convert to Monday-first (0 = Mon, 6 = Sun)
  let startDayOffset = firstDayOfMonth.getDay() - 1
  if (startDayOffset === -1) startDayOffset = 6

  const todayStr = new Date().toISOString().split('T')[0]
  const monthNames = [
    '一月',
    '二月',
    '三月',
    '四月',
    '五月',
    '六月',
    '七月',
    '八月',
    '九月',
    '十月',
    '十一月',
    '十二月',
  ]

  // Create grid cells
  const gridCells = []

  // Padding cells from previous month
  for (let i = 0; i < startDayOffset; i++) {
    gridCells.push(null)
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const formattedMonth = month + 1 < 10 ? `0${month + 1}` : `${month + 1}`
    const formattedDay = day < 10 ? `0${day}` : `${day}`
    const dateStr = `${year}-${formattedMonth}-${formattedDay}`
    gridCells.push({ day, dateStr })
  }

  // Map project colors
  const getProjectColor = (projId: string) => {
    const proj = projects.find((p) => p.id === projId)
    return proj ? proj.color : '#3B82F6'
  }

  return (
    <div className="flex-1 p-6 flex flex-col overflow-hidden no-drag">
      {/* Calendar Header Control */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-black/5 dark:border-white/5">
        <div className="flex items-center space-x-3">
          <CalendarIcon className="w-5 h-5 text-[#07C160]" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
            {year}年 {monthNames[month]} 日历归类
          </h3>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleToday}
            className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-[#07C160] dark:hover:text-[#07C160] hover:border-[#07C160]/40 transition-colors shadow-sm"
          >
            返回今天
          </button>
          <div className="flex items-center space-x-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-0.5 shadow-sm">
            <button
              onClick={handlePrevMonth}
              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10"
              title="上个月"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10"
              title="下个月"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Weekday Labels Header */}
      <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
        <div>周一</div>
        <div>周二</div>
        <div>周三</div>
        <div>周四</div>
        <div>周五</div>
        <div className="text-[#07C160]">周六</div>
        <div className="text-[#07C160]">周日</div>
      </div>

      {/* Calendar Grid Cells */}
      <div className="flex-1 grid grid-cols-7 grid-rows-5 gap-2 overflow-hidden">
        {gridCells.map((cell, idx) => {
          if (!cell) {
            return (
              <div
                key={`empty_${idx}`}
                className="rounded-xl bg-black/[0.02] dark:bg-slate-950/40 border border-black/5 dark:border-white/5 opacity-40"
              />
            )
          }

          const dayTasks = tasks.filter((t) => t.due_date === cell.dateStr)
          const isTodayCell = cell.dateStr === todayStr

          return (
            <div
              key={cell.dateStr}
              onClick={() => onSelectDateTask(cell.dateStr)}
              className={`group flex flex-col p-2.5 rounded-xl border transition-all cursor-pointer overflow-hidden ${
                isTodayCell
                  ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-[#07C160]/50 shadow-md shadow-[#07C160]/10'
                  : 'bg-white dark:bg-slate-900/50 border-slate-200/80 dark:border-white/5 hover:border-[#07C160]/40 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 shadow-sm'
              }`}
            >
              {/* Day Cell Header */}
              <div className="flex items-center justify-between mb-1.5 shrink-0">
                <span
                  className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded-md ${
                    isTodayCell
                      ? 'bg-[#07C160] text-white shadow-sm'
                      : 'text-slate-700 dark:text-slate-300 group-hover:text-[#07C160] dark:group-hover:text-white'
                  }`}
                >
                  {cell.day}
                </span>

                <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectDateTask(cell.dateStr)
                    }}
                    className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                    title="在此时段排期任务"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Day Cell Task Pills */}
              <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
                {dayTasks.map((t) => (
                  <div
                    key={t.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditTask(t)
                    }}
                    className={`px-2 py-1 rounded-md border text-[11px] truncate flex items-center justify-between space-x-1.5 transition-all ${
                      t.status === 'completed'
                        ? 'bg-slate-100 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 line-through'
                        : 'bg-slate-50 dark:bg-slate-950/80 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-[#07C160]/40'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5 truncate">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: getProjectColor(t.project_id) }}
                      />
                      <span className="truncate">{t.title}</span>
                    </div>

                    {t.priority === 'p1' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
