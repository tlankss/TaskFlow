import React from 'react'
import { Flame, CheckCircle2, Clock, Zap, TrendingUp, Award, Calendar } from 'lucide-react'
import { Task, Project } from '../types'

interface AnalyticsViewProps {
  tasks: Task[]
  projects: Project[]
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ tasks, projects }) => {
  const completedTasks = tasks.filter((t) => t.status === 'completed')
  const totalTasksCount = tasks.length
  const completionRate = totalTasksCount > 0 ? Math.round((completedTasks.length / totalTasksCount) * 100) : 0

  const totalFocusMinutes = tasks.reduce((acc, t) => acc + (t.actual_minutes || 0), 0)
  const totalFocusHours = (totalFocusMinutes / 60).toFixed(1)

  // Project distribution
  const projectStats = projects.map((p) => {
    const projTasks = tasks.filter((t) => t.project_id === p.id)
    const completedProjTasks = projTasks.filter((t) => t.status === 'completed')
    const focusMins = projTasks.reduce((acc, t) => acc + (t.actual_minutes || 0), 0)
    return {
      ...p,
      taskCount: projTasks.length,
      completedCount: completedProjTasks.length,
      focusMins,
    }
  })

  return (
    <div className="p-6 space-y-6 overflow-y-auto no-drag">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-white/5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">总投入专注用时</span>
            <div className="p-2 rounded-xl bg-[#07C160]/10 text-[#07C160]">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-1.5">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">{totalFocusHours}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">小时</span>
          </div>
          <p className="mt-1 text-[11px] text-[#07C160] font-medium flex items-center space-x-1">
            <TrendingUp className="w-3 h-3" />
            <span>实时统计真实工作投入</span>
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-white/5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">完成交付率</span>
            <div className="p-2 rounded-xl bg-[#07C160]/10 text-[#07C160]">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-1.5">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">{completionRate}%</span>
          </div>
          <p className="mt-1 text-[11px] text-[#07C160] font-medium">
            已解决 {completedTasks.length} / {totalTasksCount} 项工作
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-white/5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">今日专注积分</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-1.5">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">{completedTasks.length * 15 + totalFocusMinutes}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">pts</span>
          </div>
          <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">连续专注驱动中</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-white/5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">职场状态评估</span>
            <div className="p-2 rounded-xl bg-[#07C160]/10 text-[#07C160]">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-base font-bold text-[#07C160]">
              {completionRate > 75 ? '🔥 卓越极客状态' : completionRate > 40 ? '⚡ 稳健推进中' : '🌱 蓄力规划中'}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-medium">基于近期完成节奏生成</p>
        </div>
      </div>

      {/* Project Distribution Breakdown */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-white/5 space-y-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center space-x-2">
          <Zap className="w-4 h-4 text-[#07C160]" />
          <span>各项目分类消耗统计</span>
        </h3>

        <div className="space-y-3">
          {projectStats.map((p) => {
            const pct = totalFocusMinutes > 0 ? Math.round((p.focusMins / totalFocusMinutes) * 100) : 0
            return (
              <div key={p.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="font-medium text-slate-800 dark:text-slate-200">{p.name}</span>
                    <span className="text-slate-400 dark:text-slate-500">
                      ({p.completedCount}/{p.taskCount} 项已完成)
                    </span>
                  </div>
                  <span className="font-mono text-slate-500 dark:text-slate-400">{p.focusMins} 分钟 ({pct}%)</span>
                </div>
                {/* Progress Bar */}
                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-950 overflow-hidden">
                  <div
                    className="h-full transition-all duration-500 rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: p.color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
