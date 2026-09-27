import React from 'react'
import { Sun, Moon, Monitor, Command, Inbox, Calendar, CheckCircle2, Sparkles, Folder, Code2, RefreshCw, Cloud, BookOpen } from 'lucide-react'
import { ViewMode, Project, UserProfile } from '../types'
import { UserAvatarButton } from './UserAvatarButton'

interface SidebarProps {
  currentView: ViewMode
  selectedProjectId?: string
  onSelectView: (view: ViewMode, projectId?: string) => void
  projects: Project[]
  onOpenAIReport: () => void
  todayCount: number
  inboxCount: number
  readingCount?: number
  userProfile: UserProfile | null
  onOpenProfileModal: () => void
  theme?: 'light' | 'dark' | 'system'
  onToggleTheme?: () => void
  onOpenCommandPalette?: () => void
  onManualSync?: () => void
  isSyncing?: boolean
  syncMessage?: string | null
}

const formatLastSynced = (isoStr?: string | null) => {
  if (!isoStr) return null
  try {
    const date = new Date(isoStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    if (diffMs < 60000) return '刚刚'
    const hours = date.getHours().toString().padStart(2, '0')
    const mins = date.getMinutes().toString().padStart(2, '0')
    return `${hours}:${mins}`
  } catch {
    return null
  }
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  selectedProjectId,
  onSelectView,
  projects,
  onOpenAIReport,
  todayCount,
  inboxCount,
  readingCount = 0,
  userProfile,
  onOpenProfileModal,
  theme = 'system',
  onToggleTheme,
  onOpenCommandPalette,
  onManualSync,
  isSyncing = false,
  syncMessage,
}) => {
  return (
    <aside className="w-64 h-full bg-[#F5F5F5] dark:bg-[#181818] border-r border-black/5 dark:border-white/10 flex flex-col pt-9 pb-4 px-3 select-none transition-colors duration-200">
      {/* App Header */}
      <div className="px-3 py-2 flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#07C160] to-[#059B4D] flex items-center justify-center shadow-lg shadow-[#07C160]/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100 tracking-tight">TaskFlow</h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">职场高效与监督助手</p>
          </div>
        </div>

        <button
          onClick={() => window.electronAPI?.openDevTools?.()}
          title="打开开发者调试面板 (DevTools) [Cmd+Option+I]"
          className="p-1.5 rounded-lg text-slate-400 hover:text-[#07C160] hover:bg-black/5 dark:hover:bg-white/5 transition-colors no-drag"
        >
          <Code2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="space-y-1 mb-4">
        <button
          onClick={() => onSelectView('today')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all no-drag ${
            currentView === 'today'
              ? 'bg-[#07C160] text-white shadow-md shadow-[#07C160]/20 font-semibold'
              : 'text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <Sun className={`w-4 h-4 ${currentView === 'today' ? 'text-amber-200' : 'text-amber-500'}`} />
            <span>Today 聚焦清单</span>
          </div>
          {todayCount > 0 && (
            <span
              className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                currentView === 'today' ? 'bg-white/20 text-white' : 'bg-black/5 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {todayCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onSelectView('inbox')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all no-drag ${
            currentView === 'inbox'
              ? 'bg-[#07C160] text-white shadow-md shadow-[#07C160]/20 font-semibold'
              : 'text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <Inbox className={`w-4 h-4 ${currentView === 'inbox' ? 'text-white' : 'text-[#07C160]'}`} />
            <span>Inbox 收集箱</span>
          </div>
          {inboxCount > 0 && (
            <span
              className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                currentView === 'inbox' ? 'bg-white/20 text-white' : 'bg-black/5 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {inboxCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onSelectView('upcoming')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all no-drag ${
            currentView === 'upcoming'
              ? 'bg-[#07C160] text-white shadow-md shadow-[#07C160]/20 font-semibold'
              : 'text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <Calendar className={`w-4 h-4 ${currentView === 'upcoming' ? 'text-white' : 'text-emerald-500'}`} />
            <span>Upcoming 计划日历</span>
          </div>
        </button>

        <button
          onClick={() => onSelectView('completed')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all no-drag ${
            currentView === 'completed'
              ? 'bg-[#07C160] text-white shadow-md shadow-[#07C160]/20 font-semibold'
              : 'text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className={`w-4 h-4 ${currentView === 'completed' ? 'text-white' : 'text-purple-500'}`} />
            <span>已完成归档</span>
          </div>
        </button>

        <button
          onClick={() => onSelectView('reading')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all no-drag ${
            currentView === 'reading'
              ? 'bg-[#07C160] text-white shadow-md shadow-[#07C160]/20 font-semibold'
              : 'text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <BookOpen className={`w-4 h-4 ${currentView === 'reading' ? 'text-white' : 'text-blue-500'}`} />
            <span>📖 阅读规划书架</span>
          </div>
          {readingCount > 0 && (
            <span
              className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                currentView === 'reading' ? 'bg-white/20 text-white' : 'bg-black/5 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {readingCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onSelectView('analytics')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all no-drag ${
            currentView === 'analytics'
              ? 'bg-[#07C160] text-white shadow-md shadow-[#07C160]/20 font-semibold'
              : 'text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <Sparkles className={`w-4 h-4 ${currentView === 'analytics' ? 'text-white' : 'text-[#07C160]'}`} />
            <span>生产力数据看板</span>
          </div>
        </button>
      </nav>

      {/* AI Super Power Button */}
      <div className="px-1 mb-4">
        <button
          onClick={onOpenAIReport}
          className="w-full relative overflow-hidden group p-3 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/10 dark:from-emerald-950/40 dark:via-slate-900 dark:to-teal-950/40 border border-[#07C160]/30 hover:border-[#07C160]/60 transition-all text-left no-drag shadow-sm"
        >
          <div className="flex items-center space-x-2 mb-1">
            <Sparkles className="w-4 h-4 text-[#07C160] animate-pulse" />
            <span className="text-xs font-semibold text-[#07C160] dark:text-[#07C160]">AI 智能周报总结</span>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
            一键整理本周产出与耗时，生成标准职场总结
          </p>
        </button>
      </div>

      {/* Projects List */}
      <div className="flex-1 overflow-y-auto space-y-1">
        <div className="px-3 py-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            分类项目 (PROJECTS)
          </span>
        </div>

        {projects.map((proj) => (
          <button
            key={proj.id}
            onClick={() => onSelectView('project', proj.id)}
            className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all no-drag ${
              currentView === 'project' && selectedProjectId === proj.id
                ? 'bg-black/10 dark:bg-white/10 text-slate-900 dark:text-white font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: proj.color }} />
            <span className="truncate">{proj.name}</span>
          </button>
        ))}
      </div>

      {/* Bottom Area: Quick actions (⌘K & Theme Switcher) + Sync Button + User Profile */}
      <div className="mt-auto pt-3 border-t border-black/5 dark:border-white/10 space-y-2 no-drag">
        {/* 云端双向同步按钮 (放置在左下侧，方便操作完一键点击) */}
        {onManualSync && (
          <button
            onClick={onManualSync}
            disabled={isSyncing}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all text-xs shadow-sm group select-none ${
              isSyncing
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-[#07C160]/50 text-[#07C160]'
                : syncMessage === '同步完成'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-medium'
                : 'bg-white/70 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 border-black/5 dark:border-white/5 hover:border-[#07C160]/40 text-slate-700 dark:text-slate-200'
            }`}
            title="点击立即双向同步本地与 Supabase 云端数据"
          >
            <div className="flex items-center space-x-2 min-w-0">
              <RefreshCw
                className={`w-3.5 h-3.5 text-[#07C160] shrink-0 ${
                  isSyncing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'
                }`}
              />
              <span className="text-xs font-semibold truncate group-hover:text-[#07C160] dark:group-hover:text-white">
                {isSyncing ? '正在同步数据...' : syncMessage || '立即双向同步'}
              </span>
            </div>

            <div className="flex items-center space-x-1.5 shrink-0 text-slate-400 dark:text-slate-500">
              {formatLastSynced(userProfile?.last_synced_at) && !isSyncing && !syncMessage && (
                <span className="text-[10px] font-mono">{formatLastSynced(userProfile?.last_synced_at)}</span>
              )}
              <Cloud className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#07C160] transition-colors" />
            </div>
          </button>
        )}

        {/* Quick Tool Row: ⌘K Command Palette + Light/Dark Theme Switcher */}
        <div className="grid grid-cols-2 gap-1.5">
          {/* Command Palette Button */}
          <button
            onClick={onOpenCommandPalette}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white/70 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 border border-black/5 dark:border-white/5 hover:border-[#07C160]/40 transition-all text-xs text-slate-700 dark:text-slate-300 shadow-sm group"
            title="搜索与全局指令 (Cmd+K)"
          >
            <div className="flex items-center space-x-1.5 min-w-0">
              <Command className="w-3.5 h-3.5 text-[#07C160] shrink-0" />
              <span className="text-[11px] font-medium truncate group-hover:text-[#07C160] dark:group-hover:text-white">快捷指令</span>
            </div>
            <kbd className="font-mono text-[9px] px-1 py-0.5 rounded bg-black/5 dark:bg-white/10 text-slate-400 dark:text-slate-500 font-semibold">⌘K</kbd>
          </button>

          {/* Theme Switcher Button */}
          <button
            onClick={onToggleTheme}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white/70 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 border border-black/5 dark:border-white/5 hover:border-[#07C160]/40 transition-all text-xs text-slate-700 dark:text-slate-300 shadow-sm group"
            title={`当前主题: ${theme === 'light' ? '浅色模式' : theme === 'dark' ? '深色模式' : '跟随系统'} (点击切换)`}
          >
            <div className="flex items-center space-x-1.5 min-w-0">
              {theme === 'light' ? (
                <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              ) : theme === 'dark' ? (
                <Moon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              ) : (
                <Monitor className="w-3.5 h-3.5 text-[#07C160] shrink-0" />
              )}
              <span className="text-[11px] font-medium truncate group-hover:text-[#07C160] dark:group-hover:text-white">
                {theme === 'light' ? '浅色' : theme === 'dark' ? '深色' : '系统'}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">模式</span>
          </button>
        </div>

        {/* User Avatar & Profile Card */}
        <UserAvatarButton
          userProfile={userProfile}
          onOpenProfileModal={onOpenProfileModal}
        />
      </div>
    </aside>
  )
}
