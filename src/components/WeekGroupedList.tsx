import React, { useState, useMemo, useEffect } from 'react'
import {
  Calendar,
  Clock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  LayoutList,
  AlignJustify,
  Layers,
  Sparkles,
} from 'lucide-react'
import { Task, SubTask } from '../types'
import { TaskItem } from './TaskItem'
import { formatDuration } from './DurationPicker'

interface WeekGroup {
  key: string
  label: string
  weekNum: number
  phaseName?: string
  dateRangeStr?: string
  tasks: Task[]
  totalMinutes: number
  completedCount: number
}

interface WeekGroupedListProps {
  tasks: Task[]
  onToggleComplete: (task: Task) => void
  onToggleToday?: (task: Task) => void
  onDelete: (id: string) => void
  onEdit: (task: Task) => void
  onToggleTimer: (task: Task) => void
  activeTimerTaskId?: string
  onOpenReadingProgress?: (task: Task) => void
  onOpenReader?: (task: Task) => void
  onToggleSubTask?: (taskId: string, subtaskId: string) => void
  onUpdateSubTask?: (taskId: string, subtaskId: string, updates: Partial<SubTask>) => void
  onDeleteSubTask?: (taskId: string, subtaskId: string) => void
  onAddSubTask?: (taskId: string, subtask: Omit<SubTask, 'id'>) => void
  isCompact: boolean
  onToggleCompact: () => void
}

// 解析任务所归属的周次与阶段信息
function parseTaskWeek(t: Task): { key: string; label: string; weekNum: number; phaseName?: string } {
  const text = `${t.title} ${t.notes || ''}`
  const weekMatch = text.match(/第\s*(\d+|[一二三四五六七八九十百]+)\s*周/i)
  const phaseMatch = text.match(/【?(第\s*(\d+|[一二三四五六七八九十百]+)\s*阶段[^】\n]*)】?/i)

  const cnMap: Record<string, number> = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
    '十六': 16, '十七': 17, '十八': 18, '十九': 19, '二十': 20,
    '二十一': 21, '二十二': 22, '二十三': 23, '二十四': 24,
  }

  if (weekMatch) {
    const raw = weekMatch[1]
    const num = isNaN(Number(raw)) ? cnMap[raw] || 99 : Number(raw)
    return {
      key: `week_${num}`,
      label: `第 ${num} 周`,
      weekNum: num,
      phaseName: phaseMatch ? phaseMatch[1].replace(/[【】]/g, '').trim() : undefined,
    }
  }

  // 若无显式第X周，根据 due_date 日期对齐到周一所在周
  if (t.due_date && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date)) {
    const d = new Date(t.due_date)
    const day = d.getDay() || 7 // 1 ~ 7
    const monday = new Date(d)
    monday.setDate(d.getDate() - (day - 1))
    const mStr = monday.toISOString().slice(0, 10)
    return {
      key: `date_${mStr}`,
      label: `${mStr} 当周`,
      weekNum: monday.getTime(),
      phaseName: undefined,
    }
  }

  return {
    key: 'other',
    label: '常规任务',
    weekNum: 999999,
    phaseName: undefined,
  }
}

export const WeekGroupedList: React.FC<WeekGroupedListProps> = ({
  tasks,
  onToggleComplete,
  onToggleToday,
  onDelete,
  onEdit,
  onToggleTimer,
  activeTimerTaskId,
  onOpenReadingProgress,
  onOpenReader,
  onToggleSubTask,
  onUpdateSubTask,
  onDeleteSubTask,
  onAddSubTask,
  isCompact,
  onToggleCompact,
}) => {
  const [selectedWeekTab, setSelectedWeekTab] = useState<string>('all')
  const [expandedWeeks, setExpandedWeeks] = useState<Record<string, boolean>>({})

  // 计算多周分组
  const groups: WeekGroup[] = useMemo(() => {
    const map = new Map<string, WeekGroup>()

    tasks.forEach((t) => {
      const { key, label, weekNum, phaseName } = parseTaskWeek(t)
      if (!map.has(key)) {
        map.set(key, {
          key,
          label,
          weekNum,
          phaseName,
          tasks: [],
          totalMinutes: 0,
          completedCount: 0,
        })
      }
      const grp = map.get(key)!
      grp.tasks.push(t)
      grp.totalMinutes += t.estimated_minutes || 30
      if (t.status === 'completed') {
        grp.completedCount++
      }
      if (phaseName && !grp.phaseName) {
        grp.phaseName = phaseName
      }
    })

    const sorted = Array.from(map.values()).sort((a, b) => a.weekNum - b.weekNum)

    // 计算每组起止日期
    sorted.forEach((g) => {
      const dates = g.tasks
        .map((t) => t.due_date)
        .filter(Boolean)
        .sort()
      if (dates.length > 0) {
        g.dateRangeStr =
          dates[0] === dates[dates.length - 1]
            ? dates[0]
            : `${dates[0]} ~ ${dates[dates.length - 1]}`
      }
    })

    return sorted
  }, [tasks])

  // 是否属于包含周次层级的长计划结构
  const hasMultipleWeeks = useMemo(() => {
    if (groups.length <= 1) return false
    return groups.some((g) => g.key.startsWith('week_') || g.key.startsWith('date_'))
  }, [groups])

  // 默认仅展开第一周，其余周收起
  useEffect(() => {
    if (groups.length > 0) {
      setExpandedWeeks((prev) => {
        // 如果已经有展开记录则保留，否则默认展开第 1 个分组
        if (Object.keys(prev).length > 0) return prev
        const initial: Record<string, boolean> = {}
        groups.forEach((g, idx) => {
          initial[g.key] = idx === 0
        })
        return initial
      })
    }
  }, [groups])

  // 切换折叠单个周
  const toggleWeekExpand = (weekKey: string) => {
    setExpandedWeeks((prev) => ({
      ...prev,
      [weekKey]: !prev[weekKey],
    }))
  }

  // 全部展开
  const handleExpandAll = () => {
    const next: Record<string, boolean> = {}
    groups.forEach((g) => {
      next[g.key] = true
    })
    setExpandedWeeks(next)
  }

  // 全部折叠
  const handleCollapseAll = () => {
    const next: Record<string, boolean> = {}
    groups.forEach((g) => {
      next[g.key] = false
    })
    setExpandedWeeks(next)
  }

  // 当前激活过滤下的分组列表
  const displayedGroups = useMemo(() => {
    if (selectedWeekTab === 'all') return groups
    return groups.filter((g) => g.key === selectedWeekTab)
  }, [groups, selectedWeekTab])

  // 普通列表模式（无多周结构时直接线性展示，带紧凑切换）
  if (!hasMultipleWeeks) {
    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between pb-1 px-1 text-xs text-slate-500 dark:text-slate-400">
          <span>共 {tasks.length} 项任务</span>
          <button
            type="button"
            onClick={onToggleCompact}
            className={`flex items-center space-x-1 px-2 py-1 rounded-lg border transition-all cursor-pointer ${
              isCompact
                ? 'bg-[#07C160]/10 text-[#07C160] border-[#07C160]/30 font-medium'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title={isCompact ? '切换为详细卡片视图' : '切换为紧凑单行视图'}
          >
            {isCompact ? <AlignJustify className="w-3.5 h-3.5" /> : <LayoutList className="w-3.5 h-3.5" />}
            <span>{isCompact ? '紧凑视图' : '详细视图'}</span>
          </button>
        </div>

        {tasks.map((t) => (
          <TaskItem
            key={t.id}
            task={t}
            isCompact={isCompact}
            onToggleComplete={onToggleComplete}
            onToggleToday={onToggleToday}
            onDelete={onDelete}
            onEdit={onEdit}
            onToggleTimer={onToggleTimer}
            isTimerRunning={activeTimerTaskId === t.id}
            onOpenReadingProgress={onOpenReadingProgress}
            onOpenReader={onOpenReader}
            onToggleSubTask={onToggleSubTask}
            onUpdateSubTask={onUpdateSubTask}
            onDeleteSubTask={onDeleteSubTask}
            onAddSubTask={onAddSubTask}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3.5">
      {/* 顶部周次 Tab 跑道 (方案二) + 工具操作栏 */}
      <div className="sticky top-0 z-20 -mx-1 px-1 py-1.5 bg-[#EDEDED]/90 dark:bg-[#111111]/90 backdrop-blur-md rounded-xl space-y-2 border-b border-black/5 dark:border-white/5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* 横向滚动周次选择器 */}
          <div className="flex items-center space-x-1.5 overflow-x-auto py-1 scrollbar-none flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setSelectedWeekTab('all')}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                selectedWeekTab === 'all'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-[#07C160]/20 font-semibold'
                  : 'bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-900'
              }`}
            >
              全部 ({tasks.length})
            </button>

            {groups.map((g) => {
              const isSelected = selectedWeekTab === g.key
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => {
                    setSelectedWeekTab(g.key)
                    // 自动展开所选周
                    setExpandedWeeks((prev) => ({ ...prev, [g.key]: true }))
                  }}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center space-x-1.5 ${
                    isSelected
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-[#07C160]/20 font-semibold'
                      : 'bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-900'
                  }`}
                >
                  <span>{g.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-black/5 dark:bg-white/10 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {g.tasks.length}
                  </span>
                </button>
              )
            })}
          </div>

          {/* 右侧展开收起与紧凑视图控制 */}
          <div className="flex items-center space-x-2 shrink-0 text-xs">
            {selectedWeekTab === 'all' && (
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={handleExpandAll}
                  className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 hover:bg-white dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 transition-colors flex items-center space-x-1"
                  title="一键展开全部周"
                >
                  <ChevronsDown className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">全展开</span>
                </button>
                <button
                  type="button"
                  onClick={handleCollapseAll}
                  className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 hover:bg-white dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 transition-colors flex items-center space-x-1"
                  title="一键折叠全部周"
                >
                  <ChevronsUp className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">全折叠</span>
                </button>
              </div>
            )}

            {/* 紧凑模式切换 (方案三) */}
            <button
              type="button"
              onClick={onToggleCompact}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                isCompact
                  ? 'bg-[#07C160]/10 text-[#07C160] border-[#07C160]/30 font-semibold'
                  : 'bg-white/80 dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title={isCompact ? '切换为详细卡片视图' : '开启紧凑列表模式（节省空间）'}
            >
              {isCompact ? <AlignJustify className="w-3.5 h-3.5" /> : <LayoutList className="w-3.5 h-3.5" />}
              <span>{isCompact ? '紧凑模式' : '标准卡片'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 周次折叠分组 Accordion (方案一) */}
      <div className="space-y-3">
        {displayedGroups.map((g) => {
          const isExpanded = selectedWeekTab !== 'all' || expandedWeeks[g.key] !== false
          const completionRate =
            g.tasks.length > 0 ? Math.round((g.completedCount / g.tasks.length) * 100) : 0

          return (
            <div
              key={g.key}
              className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/40 dark:bg-slate-900/40 overflow-hidden shadow-xs transition-all duration-200"
            >
              {/* 周次折叠标题条 */}
              <div
                onClick={() => toggleWeekExpand(g.key)}
                className="px-4 py-3 bg-white/80 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-900/90 cursor-pointer flex items-center justify-between gap-3 select-none transition-colors border-b border-black/[0.03] dark:border-white/5"
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4" />
                  </div>

                  <div className="flex items-center space-x-2 min-w-0 flex-wrap">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                      {g.label}
                    </h3>

                    {g.phaseName && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                        {g.phaseName}
                      </span>
                    )}

                    {g.dateRangeStr && (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                        {g.dateRangeStr}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-3 shrink-0 text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {g.tasks.length} 项任务 · 预计 {formatDuration(g.totalMinutes, true)}
                    </span>

                    {/* 完成度迷你进度条 */}
                    <div className="hidden sm:flex items-center space-x-1.5">
                      <div className="w-12 h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-[#07C160] transition-all duration-300 rounded-full"
                          style={{ width: `${completionRate}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        {g.completedCount}/{g.tasks.length}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* 展开的任务卡片列表 */}
              {isExpanded && (
                <div className="p-3 space-y-2 bg-slate-50/30 dark:bg-slate-950/20">
                  {g.tasks.map((t) => (
                    <TaskItem
                      key={t.id}
                      task={t}
                      isCompact={isCompact}
                      onToggleComplete={onToggleComplete}
                      onToggleToday={onToggleToday}
                      onDelete={onDelete}
                      onEdit={onEdit}
                      onToggleTimer={onToggleTimer}
                      isTimerRunning={activeTimerTaskId === t.id}
                      onOpenReadingProgress={onOpenReadingProgress}
                      onOpenReader={onOpenReader}
                      onToggleSubTask={onToggleSubTask}
                      onUpdateSubTask={onUpdateSubTask}
                      onDeleteSubTask={onDeleteSubTask}
                      onAddSubTask={onAddSubTask}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
