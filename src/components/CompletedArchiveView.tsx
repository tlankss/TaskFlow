import React, { useState } from 'react'
import { CheckCircle2, Sparkles, Calendar, Clock, Trash2, Copy, Check } from 'lucide-react'
import { Task } from '../types'

interface CompletedArchiveViewProps {
  completedTasks: Task[]
  onDeleteTask: (id: string) => void
  onOpenAIReport: () => void
}

export const CompletedArchiveView: React.FC<CompletedArchiveViewProps> = ({
  completedTasks,
  onDeleteTask,
  onOpenAIReport,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Group tasks by completion date (Today, Yesterday, Earlier)
  const todayStr = new Date().toISOString().split('T')[0]
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  const todayTasks = completedTasks.filter(
    (t) => t.completed_at && t.completed_at.startsWith(todayStr)
  )
  const yesterdayTasks = completedTasks.filter(
    (t) => t.completed_at && t.completed_at.startsWith(yesterdayStr)
  )
  const earlierTasks = completedTasks.filter(
    (t) => !t.completed_at || (!t.completed_at.startsWith(todayStr) && !t.completed_at.startsWith(yesterdayStr))
  )

  const totalFocusMins = completedTasks.reduce(
    (acc, t) => acc + (t.actual_minutes || t.estimated_minutes || 0),
    0
  )

  const handleCopyTask = (t: Task) => {
    const text = `- ${t.title}${t.notes ? ` (${t.notes})` : ''}`
    navigator.clipboard.writeText(text)
    setCopiedId(t.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto space-y-6 no-drag">
      {/* Top Banner Card */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/10 dark:from-emerald-950/40 dark:via-slate-900/90 dark:to-teal-950/40 border border-[#07C160]/30 shadow-sm flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#07C160]/15 text-[#07C160]">
              已归档成果
            </span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">累计交付 {completedTasks.length} 项工作成果</h3>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            总专注投入 **{(totalFocusMins / 60).toFixed(1)}** 小时 | 一键生成标准化职场周报
          </p>
        </div>

        <button
          onClick={onOpenAIReport}
          className="px-4 py-2.5 rounded-xl bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059B4D] text-xs font-semibold text-white shadow-md shadow-[#07C160]/20 flex items-center space-x-2 transition-all shrink-0"
        >
          <Sparkles className="w-4 h-4 text-white animate-pulse" />
          <span>一键生成 AI 周报</span>
        </button>
      </div>

      {completedTasks.length === 0 ? (
        <div className="py-20 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400 shadow-sm">
            <CheckCircle2 className="w-6 h-6 text-[#07C160]" />
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">暂无已完成的归档任务</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">在 Today 或列表中勾选任务，即可在此形成个人成果战报</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section 1: Today Completed */}
          {todayTasks.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold text-[#07C160] flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-[#07C160]" />
                <span>今天完成 ({todayTasks.length})</span>
              </h4>
              <div className="space-y-2">
                {todayTasks.map((t) => (
                  <CompletedTaskCard
                    key={t.id}
                    task={t}
                    onCopy={handleCopyTask}
                    isCopied={copiedId === t.id}
                    onDelete={onDeleteTask}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Section 2: Yesterday Completed */}
          {yesterdayTasks.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold text-[#07C160] flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-[#07C160]" />
                <span>昨天完成 ({yesterdayTasks.length})</span>
              </h4>
              <div className="space-y-2">
                {yesterdayTasks.map((t) => (
                  <CompletedTaskCard
                    key={t.id}
                    task={t}
                    onCopy={handleCopyTask}
                    isCopied={copiedId === t.id}
                    onDelete={onDeleteTask}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Section 3: Earlier Completed */}
          {earlierTasks.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span>更早完成 ({earlierTasks.length})</span>
              </h4>
              <div className="space-y-2">
                {earlierTasks.map((t) => (
                  <CompletedTaskCard
                    key={t.id}
                    task={t}
                    onCopy={handleCopyTask}
                    isCopied={copiedId === t.id}
                    onDelete={onDeleteTask}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const CompletedTaskCard: React.FC<{
  task: Task
  onCopy: (task: Task) => void
  isCopied: boolean
  onDelete: (id: string) => void
}> = ({ task, onCopy, isCopied, onDelete }) => {
  return (
    <div className="group p-3.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-white/5 hover:border-[#07C160]/30 flex items-start justify-between space-x-3 transition-all shadow-sm">
      <div className="flex items-start space-x-3 min-w-0">
        <div className="mt-0.5 w-5 h-5 rounded-md bg-[#07C160]/15 border border-[#07C160]/30 text-[#07C160] flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0">
          <h5 className="text-xs font-medium text-slate-500 dark:text-slate-400 line-through truncate">{task.title}</h5>
          {task.notes && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{task.notes}</p>}
          <div className="flex items-center space-x-3 text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 font-mono">
            <span>投入: {task.actual_minutes || task.estimated_minutes || 30} 分钟</span>
            {task.completed_at && <span>完成时间: {new Date(task.completed_at).toLocaleString()}</span>}
          </div>
        </div>
      </div>

      <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 transition-opacity">
        <button
          onClick={() => onCopy(task)}
          className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors text-xs flex items-center space-x-1"
          title="复制文本"
        >
          {isCopied ? <Check className="w-3.5 h-3.5 text-[#07C160]" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-500 transition-colors"
          title="删除记录"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
