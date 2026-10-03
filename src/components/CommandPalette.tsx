import React, { useState, useEffect } from 'react'
import { Search, Sun, Inbox, Calendar, CheckCircle2, Sparkles, BarChart2, Plus, ArrowRight } from 'lucide-react'
import { Task, ViewMode } from '../types'

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  tasks: Task[]
  onSelectTask: (task: Task) => void
  onSelectView: (view: ViewMode) => void
  onNewTask: () => void
  onOpenAIReport: () => void
  onOpenSmartBreakdown?: () => void
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  tasks,
  onSelectTask,
  onSelectView,
  onNewTask,
  onOpenAIReport,
  onOpenSmartBreakdown,
}) => {
  const [query, setQuery] = useState('')

  // 每次打开面板时自动清空搜索输入，保证立即处于干净就绪状态
  useEffect(() => {
    if (isOpen) {
      setQuery('')
    }
  }, [isOpen])

  // 面板打开时的按键监听: 支持 Esc 退出或再次按 Cmd+K 关闭
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdK =
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        (e.key.toLowerCase() === 'k' || e.code === 'KeyK')

      if (isCmdK || e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const filteredTasks = tasks
    .filter(
      (t) =>
        t.title.toLowerCase().includes(query.toLowerCase()) ||
        (t.notes && t.notes.toLowerCase().includes(query.toLowerCase()))
    )
    .slice(0, 5)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/60 backdrop-blur-md no-drag">
      <div className="w-full max-w-xl bg-white dark:bg-[#1E1E1E] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 text-slate-900 dark:text-slate-100 transition-colors">
        {/* Search Input Bar */}
        <div className="px-4 py-3 border-b border-black/5 dark:border-white/10 flex items-center space-x-3 bg-slate-50 dark:bg-slate-950">
          <Search className="w-4 h-4 text-[#07C160] shrink-0" />
          <input
            type="text"
            placeholder="键入命令或搜索任务... (按 Esc 退出)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] text-slate-600 dark:text-slate-400 font-mono">
            ESC
          </kbd>
        </div>

        {/* Command Options & Search Results */}
        <div className="p-2 overflow-y-auto max-h-[60vh] space-y-3">
          {/* Actions */}
          {!query && (
            <div className="space-y-1">
              <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                快捷动作
              </div>
              <button
                onClick={() => {
                  onNewTask()
                  onClose()
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <div className="flex items-center space-x-2.5">
                  <Plus className="w-4 h-4 text-[#07C160]" />
                  <span>新建任务...</span>
                </div>
                <kbd className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-slate-800 text-[10px] text-slate-500 dark:text-slate-400 font-mono">Cmd+N</kbd>
              </button>

              <button
                onClick={() => {
                  onOpenAIReport()
                  onClose()
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <div className="flex items-center space-x-2.5">
                  <Sparkles className="w-4 h-4 text-[#07C160]" />
                  <span>生成 AI 智能周报</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {onOpenSmartBreakdown && (
                <button
                  onClick={() => {
                    onOpenSmartBreakdown()
                    onClose()
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center space-x-2.5">
                    <Sparkles className="w-4 h-4 text-emerald-500" />
                    <span>智能文本拆解与批量入表...</span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
              )}
            </div>
          )}

          {/* Navigation Shortcuts */}
          {!query && (
            <div className="space-y-1">
              <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                视图导航
              </div>
              <button
                onClick={() => {
                  onSelectView('today')
                  onClose()
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <Sun className="w-4 h-4 text-amber-500" />
                <span>跳转至 Today 聚焦清单</span>
              </button>

              <button
                onClick={() => {
                  onSelectView('inbox')
                  onClose()
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <Inbox className="w-4 h-4 text-[#07C160]" />
                <span>跳转至 Inbox 收集箱</span>
              </button>

              <button
                onClick={() => {
                  onSelectView('analytics')
                  onClose()
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <BarChart2 className="w-4 h-4 text-[#07C160]" />
                <span>查看生产力数据看板</span>
              </button>
            </div>
          )}

          {/* Search Results */}
          {query && (
            <div className="space-y-1">
              <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                匹配任务 ({filteredTasks.length})
              </div>
              {filteredTasks.length === 0 ? (
                <p className="px-3 py-4 text-xs text-slate-400 dark:text-slate-500 text-center">未找到与 "{query}" 相关的任务</p>
              ) : (
                filteredTasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      onSelectTask(t)
                      onClose()
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{t.title}</p>
                      {t.notes && <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{t.notes}</p>}
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0 font-medium">
                      {t.status === 'completed' ? '已完成' : '待办'}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
