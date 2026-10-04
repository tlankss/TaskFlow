import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, Sun, Moon, Monitor, Sparkles, Search, LayoutList, Kanban, Grid, Calendar as CalendarIcon, Command, Inbox, ArrowRight, CheckCircle2, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react'
import { Sidebar } from './components/Sidebar'
import { TaskItem } from './components/TaskItem'
import { TaskModal } from './components/TaskModal'
import { SmartBreakdownModal } from './components/SmartBreakdownModal'
import { AIReportModal } from './components/AIReportModal'
import { FocusTimerBar } from './components/FocusTimerBar'
import { CommandPalette } from './components/CommandPalette'
import { AnalyticsView } from './components/AnalyticsView'
import { KanbanView } from './components/KanbanView'
import { MatrixView } from './components/MatrixView'
import { CalendarView } from './components/CalendarView'
import { CompletedArchiveView } from './components/CompletedArchiveView'
import { UserProfileModal } from './components/UserProfileModal'
import { ReadingView } from './components/reading/ReadingView'
import { ReadingPlanModal } from './components/reading/ReadingPlanModal'
import { ReadingProgressModal } from './components/reading/ReadingProgressModal'
import { BookNotesModal } from './components/reading/BookNotesModal'
import { BookReaderModal } from './components/reading/BookReaderModal'
import { Task, SubTask, Project, ViewMode, LayoutMode, UserProfile, UserStats, Book, ReadingPlan, ReadingDailySchedule } from './types'
import {
  tasksApi,
  cloudAddTask,
  cloudUpdateTask,
  cloudDeleteTask,
  cloudBatchAddTasks,
  cloudBatchDeleteTasks,
  cloudAddBook,
  cloudBatchAddBooks,
  cloudUpdateBook,
  cloudDeleteBook,
  cloudAddReadingPlan,
  cloudBatchAddReadingPlans,
  cloudUpdateReadingPlan,
  cloudDeleteReadingPlan,
  cloudPullDelta,
  cloudPullTasksDelta,
  cloudPullReadingDelta,
  cleanRemoteTasksBloatedMeta,
  cleanRemoteBooksBloatedCovers,
  uploadBookCoverToStorage,
  getCurrentUser,
  restoreAuthSessionIfAvailable,
  ensureFreshSession,
  uploadBookFileToStorage,
} from './lib/supabase'
import { getBookBinary, saveBookBinary, deleteBookBinary } from './lib/bookStorage'

// 针对不同视图，仅展示最合理需要的视图切换模式：
// - Today 聚焦清单: 列表、看板、四象限 (无需整月日历)
// - Inbox 收集箱: 列表、四象限整理 (暂存项无需看板与月历)
// - Upcoming 计划日历: 月历网格、日程清单
// - 分类项目: 列表、看板、四象限
const allowedLayoutsByView: Record<ViewMode, LayoutMode[]> = {
  today: ['list', 'kanban', 'matrix'],
  inbox: ['list', 'matrix'],
  upcoming: ['calendar', 'list'],
  project: ['list', 'kanban', 'matrix'],
  completed: [],
  analytics: [],
  reading: [],
}

export const App: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [userStats, setUserStats] = useState<UserStats | null>(null)

  // Theme mode: light | dark | system
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem('taskflow_theme') as 'light' | 'dark' | 'system') || 'system'
  })

  const [currentView, setCurrentView] = useState<ViewMode>('today')
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('list')
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>()

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [targetDateForNewTask, setTargetDateForNewTask] = useState<string | undefined>()

  const [isAIReportOpen, setIsAIReportOpen] = useState(false)
  const [isSmartBreakdownOpen, setIsSmartBreakdownOpen] = useState(false)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [isUserProfileModalOpen, setIsUserProfileModalOpen] = useState(false)
  const [userProfileTab, setUserProfileTab] = useState<'profile' | 'sync' | 'ai' | 'badges'>('sync')

  const [activeTimerTask, setActiveTimerTask] = useState<Task | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  // 视口精准按需加载与分页状态 (Inbox 分页、已完成分页、日历月度缓存)
  const [inboxPage, setInboxPage] = useState(1)
  const [inboxPageSize] = useState(15)
  const [inboxTotal, setInboxTotal] = useState(0)

  const [completedPage, setCompletedPage] = useState(1)
  const [completedPageSize] = useState(20)
  const [completedTotal, setCompletedTotal] = useState(0)

  const calendarFetchedMonthsRef = useRef<Set<string>>(new Set())

  // Reading Domain State
  const [books, setBooks] = useState<Book[]>(() => {
    try {
      const saved = localStorage.getItem('taskflow_books')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [readingPlans, setReadingPlans] = useState<ReadingPlan[]>(() => {
    try {
      const saved = localStorage.getItem('taskflow_reading_plans')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [isReadingPlanModalOpen, setIsReadingPlanModalOpen] = useState(false)
  const [editingBookForPlan, setEditingBookForPlan] = useState<Book | null>(null)
  const [activeProgressTask, setActiveProgressTask] = useState<Task | null>(null)
  const [activeNotesBook, setActiveNotesBook] = useState<{ book: Book; plan?: ReadingPlan } | null>(null)
  const [activeReadingSession, setActiveReadingSession] = useState<{
    book: Book
    plan?: ReadingPlan | null
  } | null>(null)

  useEffect(() => {
    localStorage.setItem('taskflow_books', JSON.stringify(books))
  }, [books])

  useEffect(() => {
    localStorage.setItem('taskflow_reading_plans', JSON.stringify(readingPlans))
  }, [readingPlans])

  // 当前视图所支持的布局模式
  const availableLayouts = allowedLayoutsByView[currentView] || []

  // 当切换视图导致当前 layoutMode 不在支持的列表中时，自动回退到该视图默认支持的第一个模式
  useEffect(() => {
    if (availableLayouts.length > 0 && !availableLayouts.includes(layoutMode)) {
      setLayoutMode(availableLayouts[0])
    }
  }, [currentView, availableLayouts, layoutMode])

  // 全局快捷指令面板监听: ⌘K / Ctrl+K (捕获原生键盘事件与 Electron 菜单/IPC 广播)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isCmdK =
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        (e.key.toLowerCase() === 'k' || e.code === 'KeyK')

      if (isCmdK) {
        e.preventDefault()
        e.stopPropagation()
        setIsCommandPaletteOpen((prev) => !prev)
      }
    }

    // 使用捕获阶段 (capture: true)，确保即使输入框或子组件获得焦点时也能优先响应
    window.addEventListener('keydown', handleGlobalKeyDown, true)

    // 监听 Electron 主进程 / 系统菜单派发的快捷指令，彻底杜绝系统/浏览器冲突
    let unsubscribeIpc: (() => void) | undefined
    if (window.electronAPI?.onToggleCommandPalette) {
      unsubscribeIpc = window.electronAPI.onToggleCommandPalette(() => {
        setIsCommandPaletteOpen((prev) => !prev)
      })
    }

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true)
      if (unsubscribeIpc) unsubscribeIpc()
    }
  }, [])

  // Theme effect: synchronize document.documentElement class
  useEffect(() => {
    const root = document.documentElement
    const applyTheme = () => {
      if (theme === 'system') {
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        root.classList.toggle('dark', systemDark)
      } else {
        root.classList.toggle('dark', theme === 'dark')
      }
    }

    applyTheme()
    localStorage.setItem('taskflow_theme', theme)

    if (theme === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)')
      const listener = (e: MediaQueryListEvent) => {
        root.classList.toggle('dark', e.matches)
      }
      media.addEventListener('change', listener)
      return () => media.removeEventListener('change', listener)
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => {
      if (prev === 'light') return 'dark'
      if (prev === 'dark') return 'system'
      return 'light'
    })
  }

  // 挂载与同步并发锁 (杜绝 React 18 StrictMode 双次触发与高频请求并发)
  const initialTasksSyncFiredRef = useRef(false)
  const isTasksSyncingRef = useRef(false)
  const isReadingSyncingRef = useRef(false)
  const lastReadingSyncTimeRef = useRef<number>(0)
  // SWR 视口数据缓存记录 (60秒内切回相同视图直接复用内存数据，0ms 极速响应，杜绝多余远程网络等待)
  const lastScopedFetchRef = useRef<Record<string, number>>({})

  // Load initial data and run silent tasks delta sync (guarded against React 18 StrictMode double-fire)
  useEffect(() => {
    const initData = async () => {
      // 1. 跨版本登录自愈：从本地 Native 文件无感恢复登录会话，并执行 Token 提前静默续期
      await restoreAuthSessionIfAvailable()
      await loadData()
      if (initialTasksSyncFiredRef.current) return
      initialTasksSyncFiredRef.current = true

      try {
        const u = await getCurrentUser()
        if (u) {
          await performTasksDeltaSync(false)
        }
      } catch (e) {
        console.warn('Initial silent tasks delta sync skipped:', e)
      }
    }
    initData()

    // 窗口重新聚焦或从系统睡眠唤醒时，静默检测并刷新 Token，杜绝长时间放置后掉登录
    const handleWindowFocus = () => {
      ensureFreshSession().catch(() => {})
    }
    window.addEventListener('focus', handleWindowFocus)
    return () => {
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [])

  // 1. 仅按需拉取今日聚焦任务 (首屏极速加载，本地优先 + SWR 缓存)
  const loadTodayTasksScoped = async (force = false) => {
    const now = Date.now()
    if (!force && lastScopedFetchRef.current['today'] && now - lastScopedFetchRef.current['today'] < 60000) {
      return
    }
    lastScopedFetchRef.current['today'] = now
    try {
      const res = await tasksApi.getTodayTasks()
      if (res.success && res.data) {
        setTasks((prev) => {
          const tMap = new Map(prev.map((t) => [t.id, t]))
          res.data.forEach((t) => tMap.set(t.id, t))
          return Array.from(tMap.values())
        })
      }
    } catch (e) {
      console.warn('loadTodayTasksScoped skipped:', e)
    }
  }

  // 2. 收集箱按需分页拉取 (按页请求，带内存 SWR 缓存)
  const loadInboxTasksScoped = async (page: number, force = false) => {
    const cacheKey = `inbox_${page}_${searchQuery || ''}`
    const now = Date.now()
    if (!force && lastScopedFetchRef.current[cacheKey] && now - lastScopedFetchRef.current[cacheKey] < 60000) {
      return
    }
    lastScopedFetchRef.current[cacheKey] = now
    try {
      const res = await tasksApi.getInboxTasks({ page, pageSize: inboxPageSize, keyword: searchQuery })
      if (res.success && res.data) {
        setInboxTotal(res.data.total)
        setTasks((prev) => {
          const tMap = new Map(prev.map((t) => [t.id, t]))
          res.data.items.forEach((t) => tMap.set(t.id, t))
          return Array.from(tMap.values())
        })
      }
    } catch (e) {
      console.warn('loadInboxTasksScoped skipped:', e)
    }
  }

  // 3. 日历按月精准拉取 (带当前月缓存池，翻到哪个月拉取哪个月)
  const loadCalendarMonthTasksScoped = async (year: number, month: number, force = false) => {
    const key = `${year}-${String(month).padStart(2, '0')}`
    if (!force && calendarFetchedMonthsRef.current.has(key)) {
      return
    }
    try {
      const res = await tasksApi.getMonthCalendarTasks(year, month)
      if (res.success && res.data) {
        calendarFetchedMonthsRef.current.add(key)
        setTasks((prev) => {
          const tMap = new Map(prev.map((t) => [t.id, t]))
          res.data.forEach((t) => tMap.set(t.id, t))
          return Array.from(tMap.values())
        })
      }
    } catch (e) {
      console.warn('loadCalendarMonthTasksScoped skipped:', e)
    }
  }

  // 4. 已完成归档按需分页拉取 (带内存 SWR 缓存)
  const loadCompletedTasksScoped = async (page: number, force = false) => {
    const cacheKey = `completed_${page}_${searchQuery || ''}`
    const now = Date.now()
    if (!force && lastScopedFetchRef.current[cacheKey] && now - lastScopedFetchRef.current[cacheKey] < 60000) {
      return
    }
    lastScopedFetchRef.current[cacheKey] = now
    try {
      const res = await tasksApi.getCompletedTasks({ page, pageSize: completedPageSize, keyword: searchQuery })
      if (res.success && res.data) {
        setCompletedTotal(res.data.total)
        setTasks((prev) => {
          const tMap = new Map(prev.map((t) => [t.id, t]))
          res.data.items.forEach((t) => tMap.set(t.id, t))
          return Array.from(tMap.values())
        })
      }
    } catch (e) {
      console.warn('loadCompletedTasksScoped skipped:', e)
    }
  }

  // 视口驱动的精准按需加载体系 (View-Driven Scoped Data Fetching)
  useEffect(() => {
    if (currentView === 'today') {
      loadTodayTasksScoped()
    } else if (currentView === 'inbox') {
      loadInboxTasksScoped(inboxPage)
    } else if (currentView === 'upcoming') {
      const now = new Date()
      loadCalendarMonthTasksScoped(now.getFullYear(), now.getMonth() + 1)
    } else if (currentView === 'completed') {
      loadCompletedTasksScoped(completedPage)
    } else if (currentView === 'reading') {
      performReadingDeltaSync(false)
    }
  }, [currentView])

  useEffect(() => {
    if (currentView === 'inbox') {
      loadInboxTasksScoped(inboxPage)
    }
  }, [inboxPage])

  useEffect(() => {
    if (currentView === 'completed') {
      loadCompletedTasksScoped(completedPage)
    }
  }, [completedPage])

  useEffect(() => {
    if (currentView === 'inbox') {
      setInboxPage(1)
      loadInboxTasksScoped(1, true)
    } else if (currentView === 'completed') {
      setCompletedPage(1)
      loadCompletedTasksScoped(1, true)
    }
  }, [searchQuery])

  const loadData = async () => {
    if (window.electronAPI) {
      try {
        const fetchedTasks = await window.electronAPI.getTasks()
        const fetchedProjects = await window.electronAPI.getProjects()
        const fetchedProfile = await window.electronAPI.getUserProfile()
        const fetchedStats = await window.electronAPI.getUserStats()

        // 自动净化历史残留的 base64 巨大封面数据，防止单次同步请求几十兆导致 413 Payload Too Large
        const cleanedTasks = (fetchedTasks || []).map((t: Task) => {
          if (t.reading_meta?.cover_url && (t.reading_meta.cover_url.startsWith('data:') || t.reading_meta.cover_url.length > 500)) {
            const { cover_url, ...restMeta } = t.reading_meta
            const cleaned = { ...t, reading_meta: restMeta }
            window.electronAPI?.updateTask(t.id, cleaned)
            return cleaned
          }
          return t
        })

        setTasks(cleanedTasks)
        setProjects(fetchedProjects || [])
        setUserProfile(fetchedProfile || null)
        setUserStats(fetchedStats || null)
      } catch (err) {
        console.error('Failed to load initial data:', err)
      }
    }
  }

  // 1. 核心待办清单层增量同步 (仅单次接口请求 tasks，不进入 book 不请求多余接口)
  const performTasksDeltaSync = async (isManual = false) => {
    if (isTasksSyncingRef.current) return
    isTasksSyncingRef.current = true
    if (isManual) {
      setIsSyncing(true)
      setSyncMessage('清单同步中...')
    }
    try {
      const u = await getCurrentUser()
      if (!u) {
        if (isManual) {
          setIsUserProfileModalOpen(true)
          setSyncMessage('请先登录云端账号')
          setTimeout(() => setSyncMessage(null), 3000)
        }
        return
      }

      // 异步主动清洗远端历史可能误存的 3.5MB Base64 脏数据，一键将网络请求体积由几百 KB 恢复至几百字节
      cleanRemoteTasksBloatedMeta()

      // 提取任务同步时间戳
      const localLastSync = localStorage.getItem('taskflow_tasks_last_synced_at') || localStorage.getItem('taskflow_last_synced_at')
      const lastSyncTimestamp = localLastSync || userProfile?.last_synced_at || undefined

      // 仅当从未执行过清单初次上报且云端无同步时间戳时，批量上报 1 次本地任务
      const hasInitialTasksPushed = localStorage.getItem('taskflow_tasks_has_initial_pushed') === 'true'
      if (!lastSyncTimestamp && !hasInitialTasksPushed) {
        if (tasks.length > 0) {
          await cloudBatchAddTasks(tasks)
        }
        localStorage.setItem('taskflow_tasks_has_initial_pushed', 'true')
      }

      // 仅拉取 tasks 变更 (严格保证仅 1 次 HTTP 请求)
      const delta = await cloudPullTasksDelta(lastSyncTimestamp)

      // 1. 处理删除任务
      if (delta.deletedTaskIds.length > 0) {
        if (window.electronAPI) {
          for (const id of delta.deletedTaskIds) {
            await window.electronAPI.deleteTask(id)
          }
        }
      }

      // 2. 处理增量插入与更新任务
      if (delta.upsertedTasks.length > 0) {
        if (window.electronAPI) {
          const currentLocal = (await window.electronAPI.getTasks()) || []
          const localMap = new Map(currentLocal.map((t) => [t.id, t]))
          for (const ut of delta.upsertedTasks) {
            if (localMap.has(ut.id)) {
              await window.electronAPI.updateTask(ut.id, ut)
            } else {
              await window.electronAPI.addTask(ut)
            }
          }
        }
      }

      // 刷新本地最新任务
      if (window.electronAPI) {
        const refreshed = (await window.electronAPI.getTasks()) || []
        setTasks(refreshed)
      } else {
        const delSet = new Set(delta.deletedTaskIds)
        const tMap = new Map<string, Task>()
        tasks.filter((t) => !delSet.has(t.id)).forEach((t) => tMap.set(t.id, t))
        delta.upsertedTasks.forEach((t) => tMap.set(t.id, t))
        setTasks(Array.from(tMap.values()))
      }

      // 记录任务层同步时间戳
      localStorage.setItem('taskflow_tasks_last_synced_at', delta.newSyncTimestamp)
      localStorage.setItem('taskflow_last_synced_at', delta.newSyncTimestamp)
      localStorage.setItem('taskflow_tasks_has_initial_pushed', 'true')
      if (window.electronAPI) {
        const updatedProfile = await window.electronAPI.updateUserProfile({
          last_synced_at: delta.newSyncTimestamp,
        })
        if (updatedProfile) {
          setUserProfile(updatedProfile)
        }
      }

      if (isManual) {
        const totalChanges = delta.upsertedTasks.length + delta.deletedTaskIds.length
        setSyncMessage(totalChanges > 0 ? `清单同步完成 (${totalChanges} 项变更)` : '清单已是最新')
        setTimeout(() => setSyncMessage(null), 2500)
      }
    } catch (err: any) {
      console.error('Tasks delta sync error:', err)
      if (isManual) {
        setSyncMessage('清单同步失败，请检查网络')
        setTimeout(() => setSyncMessage(null), 3000)
      }
    } finally {
      isTasksSyncingRef.current = false
      if (isManual) {
        setIsSyncing(false)
      }
    }
  }

  // 2. 阅读与书架层按需增量同步 (仅在进入阅读视图或阅读操作时按需调用，杜绝刷新时多余请求)
  const performReadingDeltaSync = async (isManual = false) => {
    // 若非手动点击同步且 60 秒内已同步过，直接跳过静默请求，防止频繁切视图带来的无谓网络开销
    if (!isManual && Date.now() - lastReadingSyncTimeRef.current < 60000) {
      return
    }

    if (isReadingSyncingRef.current) return
    isReadingSyncingRef.current = true
    if (isManual) {
      setIsSyncing(true)
      setSyncMessage('书籍与排期同步中...')
    }
    try {
      const u = await getCurrentUser()
      if (!u) {
        if (isManual) {
          setIsUserProfileModalOpen(true)
          setSyncMessage('请先登录云端账号')
          setTimeout(() => setSyncMessage(null), 3000)
        }
        return
      }

      const localLastSync = localStorage.getItem('taskflow_reading_last_synced_at')
      const lastSyncTimestamp = localLastSync || undefined

      const hasInitialReadingPushed = localStorage.getItem('taskflow_reading_has_initial_pushed') === 'true'
      if (!lastSyncTimestamp && !hasInitialReadingPushed) {
        if (books.length > 0) {
          await cloudBatchAddBooks(books)
        }
        if (readingPlans.length > 0) {
          await cloudBatchAddReadingPlans(readingPlans)
        }
        localStorage.setItem('taskflow_reading_has_initial_pushed', 'true')
      }

      // 异步主动清洗云端历史残留的 Base64 封面，自动压缩并迁移至 Supabase Storage 静态资源桶
      cleanRemoteBooksBloatedCovers().catch(() => {})

      // 仅在阅读模块请求 books 和 reading_plans
      const delta = await cloudPullReadingDelta(lastSyncTimestamp)

      // 处理书籍增量与物理删除对账
      setBooks((prevBooks) => {
        const delSet = new Set(delta.deletedBookIds)
        const activeSet = delta.allActiveBookIds ? new Set(delta.allActiveBookIds) : null
        const bMap = new Map<string, Book>()
        prevBooks
          .filter((b) => !delSet.has(b.id) && (!activeSet || activeSet.has(b.id)))
          .forEach((b) => bMap.set(b.id, b))
        delta.upsertedBooks.forEach((b) => bMap.set(b.id, b))
        return Array.from(bMap.values())
      })

      // 处理阅读排期增量与物理删除对账
      setReadingPlans((prevPlans) => {
        const delSet = new Set(delta.deletedPlanIds)
        const activeSet = delta.allActivePlanIds ? new Set(delta.allActivePlanIds) : null
        const pMap = new Map<string, ReadingPlan>()
        prevPlans
          .filter((p) => !delSet.has(p.id) && (!activeSet || activeSet.has(p.id)))
          .forEach((p) => pMap.set(p.id, p))
        delta.upsertedPlans.forEach((p) => pMap.set(p.id, p))
        return Array.from(pMap.values())
      })

      localStorage.setItem('taskflow_reading_last_synced_at', delta.newSyncTimestamp)
      localStorage.setItem('taskflow_reading_has_initial_pushed', 'true')
      lastReadingSyncTimeRef.current = Date.now()

      if (isManual) {
        const totalChanges =
          delta.upsertedBooks.length +
          delta.deletedBookIds.length +
          delta.upsertedPlans.length +
          delta.deletedPlanIds.length
        setSyncMessage(totalChanges > 0 ? `书籍同步完成 (${totalChanges} 项变更)` : '书籍已是最新')
        setTimeout(() => setSyncMessage(null), 2500)
      }
    } catch (err: any) {
      console.error('Reading delta sync error:', err)
      if (isManual) {
        setSyncMessage('书籍同步失败，请检查网络')
        setTimeout(() => setSyncMessage(null), 3000)
      }
    } finally {
      isReadingSyncingRef.current = false
      if (isManual) {
        setIsSyncing(false)
      }
    }
  }

  // 手动触发云端增量同步（按当前视图智能分级：阅读视图同步书籍，清单视图单独同步任务）
  const handleManualSync = async () => {
    lastScopedFetchRef.current = {}
    if (currentView === 'reading') {
      await performReadingDeltaSync(true)
    } else {
      await performTasksDeltaSync(true)
    }
  }

  // --- 阅读规划与书籍管理 Handlers ---
  const handleSaveBookOnly = (newBook: Book) => {
    const existingIdx = books.findIndex((b) => b.id === newBook.id)
    const isExisting = existingIdx >= 0
    let updatedBooks: Book[]
    if (isExisting) {
      updatedBooks = books.map((b) => (b.id === newBook.id ? newBook : b))
    } else {
      updatedBooks = [newBook, ...books]
    }
    setBooks(updatedBooks)

    // 1. 同步更新当前正在阅读会话中的图书对象
    setActiveReadingSession((prev) => {
      if (prev && prev.book.id === newBook.id) {
        return { ...prev, book: newBook }
      }
      return prev
    })

    // 2. 检查是否有与该书籍绑定的活动阅读计划，同步更新排期与待办任务中的章节名称
    if (newBook.chapters && newBook.chapters.length > 0) {
      const associatedPlans = readingPlans.filter((p) => p.book_id === newBook.id)
      if (associatedPlans.length > 0) {
        let tasksUpdated = false
        const nextTasks = [...tasks]

        const updatedPlans = readingPlans.map((plan) => {
          if (plan.book_id !== newBook.id) return plan

          const newSchedule = plan.schedule.map((item) => {
            if (item.is_buffer_day) return item

            // 依据章节序号或页码范围查找匹配的矫正后新章节
            const matchedCh =
              newBook.chapters.find((c) => c.index === item.day_index) ||
              newBook.chapters.find((c) => {
                return (
                  (item.start_page >= c.start_page && item.end_page <= c.end_page) ||
                  (c.start_page >= item.start_page && c.start_page <= item.end_page)
                )
              })

            if (matchedCh && matchedCh.title && matchedCh.title !== item.chapter_title) {
              const oldTitle = item.chapter_title
              const newTitle = matchedCh.title

              // 同步更新 tasks 中对应的待办任务标题与元数据
              for (let i = 0; i < nextTasks.length; i++) {
                const t = nextTasks[i]
                if (
                  t.reading_meta?.plan_id === plan.id &&
                  (t.reading_meta.chapter_title === oldTitle ||
                    (t.reading_meta.start_page === item.start_page && t.reading_meta.end_page === item.end_page))
                ) {
                  const newTaskTitle = `📖《${newBook.title}》${newTitle} (P${item.start_page}-P${item.end_page})`
                  const updatedTask: Task = {
                    ...t,
                    title: newTaskTitle,
                    reading_meta: {
                      ...t.reading_meta,
                      chapter_title: newTitle,
                      book_title: newBook.title,
                    },
                  }
                  nextTasks[i] = updatedTask
                  tasksUpdated = true
                  if (window.electronAPI) {
                    window.electronAPI.updateTask(t.id, updatedTask)
                  }
                  cloudUpdateTask(t.id, updatedTask)
                }
              }

              return {
                ...item,
                chapter_title: newTitle,
              }
            }
            return item
          })

          const updatedPlan: ReadingPlan = {
            ...plan,
            schedule: newSchedule,
            updated_at: new Date().toISOString(),
          }
          cloudUpdateReadingPlan(plan.id, updatedPlan)
          return updatedPlan
        })

        setReadingPlans(updatedPlans)
        if (tasksUpdated) {
          setTasks(nextTasks)
        }
      }
    }

    // 3. 原子级云端同步
    if (isExisting) {
      cloudUpdateBook(newBook.id, newBook)
    } else {
      cloudAddBook(newBook)
    }

    // 4. 若封面为 Base64 Data URL，自动后台压缩并上传至 Supabase Storage 静态资源桶，降低数据库体积
    if (newBook.cover_url && newBook.cover_url.startsWith('data:image')) {
      uploadBookCoverToStorage(newBook.id, newBook.cover_url)
        .then((res) => {
          if (res.success && res.url) {
            const cdnUrl = res.url
            setBooks((prev) => prev.map((b) => (b.id === newBook.id ? { ...b, cover_url: cdnUrl } : b)))
            cloudUpdateBook(newBook.id, { cover_url: cdnUrl })
          }
        })
        .catch(() => {})
    }
  }

  const handleDeleteBook = async (bookId: string) => {
    // 1. 本地书库状态移除
    const updatedBooks = books.filter((b) => b.id !== bookId)
    setBooks(updatedBooks)

    // 2. 云端 Supabase 物理彻底删除 (books 表 + 级联 reading_plans + Storage 文件)
    cloudDeleteBook(bookId)

    // 3. 本地 IndexedDB 缓存文件彻底清理
    deleteBookBinary(bookId)

    // 4. 清除该书所有的排期计划及生成的关联待办任务
    const associatedPlans = readingPlans.filter((p) => p.book_id === bookId)
    if (associatedPlans.length > 0) {
      const planIds = associatedPlans.map((p) => p.id)
      const updatedPlans = readingPlans.filter((p) => !planIds.includes(p.id))
      setReadingPlans(updatedPlans)
      for (const pid of planIds) {
        cloudDeleteReadingPlan(pid)
      }

      const tasksToDelete = tasks.filter(
        (t) => t.reading_meta?.plan_id && planIds.includes(t.reading_meta.plan_id)
      )
      if (tasksToDelete.length > 0) {
        const taskIds = tasksToDelete.map((t) => t.id)
        if (window.electronAPI) {
          for (const id of taskIds) {
            await window.electronAPI.deleteTask(id)
          }
        }
        const remainingTasks = tasks.filter(
          (t) => !t.reading_meta?.plan_id || !planIds.includes(t.reading_meta.plan_id)
        )
        setTasks(remainingTasks)
        cloudBatchDeleteTasks(taskIds)
      }
    }
  }

  const handlePlanCreated = async (newBook: Book, newPlan: ReadingPlan, newTasksData: Partial<Task>[]) => {
    const existingBookIdx = books.findIndex((b) => b.id === newBook.id)
    const updatedBooks = existingBookIdx >= 0
      ? books.map((b) => (b.id === newBook.id ? newBook : b))
      : [newBook, ...books]

    const updatedPlans = [newPlan, ...readingPlans.filter((p) => p.id !== newPlan.id)]
    setBooks(updatedBooks)
    setReadingPlans(updatedPlans)

    // 原子增量同步书籍与计划
    if (existingBookIdx >= 0) {
      cloudUpdateBook(newBook.id, newBook)
    } else {
      cloudAddBook(newBook)
    }
    cloudAddReadingPlan(newPlan)

    // 若封面为 Base64 Data URL，自动后台压缩并上传至 Supabase Storage 静态资源桶
    if (newBook.cover_url && newBook.cover_url.startsWith('data:image')) {
      uploadBookCoverToStorage(newBook.id, newBook.cover_url)
        .then((res) => {
          if (res.success && res.url) {
            const cdnUrl = res.url
            setBooks((prev) => prev.map((b) => (b.id === newBook.id ? { ...b, cover_url: cdnUrl } : b)))
            cloudUpdateBook(newBook.id, { cover_url: cdnUrl })
          }
        })
        .catch(() => {})
    }

    const createdTasks: Task[] = []
    for (const t of newTasksData) {
      try {
        if (window.electronAPI) {
          const added = await window.electronAPI.addTask(t)
          if (added) createdTasks.push(added)
        } else {
          createdTasks.push({
            id: `rt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            title: t.title || '阅读任务',
            priority: t.priority || 'p2',
            project_id: t.project_id || 'reading',
            estimated_minutes: t.estimated_minutes || 25,
            actual_minutes: 0,
            due_date: t.due_date || '',
            is_today: t.is_today || false,
            status: 'todo',
            created_at: new Date().toISOString(),
            task_type: 'reading',
            reading_meta: t.reading_meta,
            notes: t.notes,
          })
        }
      } catch (e) {
        console.error('Failed to add reading task:', e)
      }
    }

    const updatedTasks = [...createdTasks, ...tasks]
    setTasks(updatedTasks)

    // 批量分块切片极速上报生成的海量排期任务
    if (createdTasks.length > 0) {
      cloudBatchAddTasks(createdTasks)
    }
  }

  const handleDeleteReadingPlan = async (planId: string, bookId: string) => {
    const updatedPlans = readingPlans.filter((p) => p.id !== planId)
    // 仅删除排期计划和关联生成的待办任务，书籍仍完整保留在书架中供以后再次开启阅读
    setReadingPlans(updatedPlans)
    cloudDeleteReadingPlan(planId)

    const tasksToDelete = tasks.filter((t) => t.reading_meta?.plan_id === planId)
    if (tasksToDelete.length > 0) {
      const taskIds = tasksToDelete.map((t) => t.id)
      if (window.electronAPI) {
        for (const id of taskIds) {
          await window.electronAPI.deleteTask(id)
        }
      }
      const remainingTasks = tasks.filter((t) => t.reading_meta?.plan_id !== planId)
      setTasks(remainingTasks)
      cloudBatchDeleteTasks(taskIds)
    }
  }

  const handleSaveReadingProgress = async (taskId: string, actualPage: number, notes?: string) => {
    const targetTask = tasks.find((t) => t.id === taskId)
    if (!targetTask) return

    const updatedMeta = targetTask.reading_meta
      ? { ...targetTask.reading_meta, current_page: actualPage }
      : undefined

    const now = new Date().toISOString()
    const updates: Partial<Task> = {
      status: 'completed',
      output_notes: notes || targetTask.output_notes,
      reading_meta: updatedMeta,
      completed_at: now,
      updated_at: now,
    }

    if (window.electronAPI) {
      await window.electronAPI.updateTask(taskId, updates)
    }

    const updatedTasks = tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
    setTasks(updatedTasks)
    cloudUpdateTask(taskId, updates)

    if (targetTask.reading_meta?.plan_id) {
      const planId = targetTask.reading_meta.plan_id
      let planUpdates: Partial<ReadingPlan> | null = null
      const updatedPlans = readingPlans.map((p) => {
        if (p.id === planId) {
          const completedPageMax = Math.max(p.completed_pages || 0, actualPage)
          const isAllCompleted = completedPageMax >= p.total_pages
          planUpdates = {
            completed_pages: completedPageMax,
            status: (isAllCompleted ? 'completed' : p.status) as ReadingPlan['status'],
            updated_at: now,
          }
          return {
            ...p,
            ...planUpdates,
          }
        }
        return p
      })
      setReadingPlans(updatedPlans)
      if (planUpdates) {
        cloudUpdateReadingPlan(planId, planUpdates)
      }
    }
  }

  // 阅读排期具体日期调整联动
  const handleUpdateScheduleDate = async (planId: string, scheduleIndex: number, newDate: string) => {
    const now = new Date().toISOString()
    let updatedTasks = [...tasks]
    let planScheduleUpdates: Partial<ReadingPlan> | null = null

    const updatedPlans = readingPlans.map((plan) => {
      if (plan.id !== planId) return plan
      const updatedSched = [...(plan.schedule || [])]
      const oldItem = updatedSched[scheduleIndex]
      if (!oldItem) return plan
      const oldDate = oldItem.date
      updatedSched[scheduleIndex] = { ...oldItem, date: newDate }

      // 联动更新关联的待办任务由于日期
      updatedTasks = updatedTasks.map((t) => {
        if (
          t.reading_meta?.plan_id === planId &&
          (t.due_date === oldDate ||
            t.reading_meta?.chapter_title === oldItem.chapter_title ||
            t.title.includes(oldItem.chapter_title))
        ) {
          const updated = { ...t, due_date: newDate, updated_at: now }
          window.electronAPI?.updateTask(t.id, updated)
          cloudUpdateTask(t.id, { due_date: newDate, updated_at: now })
          return updated
        }
        return t
      })

      planScheduleUpdates = {
        schedule: updatedSched,
        updated_at: now,
      }

      return {
        ...plan,
        ...planScheduleUpdates,
      }
    })

    setReadingPlans(updatedPlans)
    setTasks(updatedTasks)
    if (planScheduleUpdates) {
      cloudUpdateReadingPlan(planId, planScheduleUpdates)
    }
  }

  // 从阅读排期节点一键加入/移出 Today 今日聚焦
  const handleToggleTodayFromSchedule = async (planId: string, item: ReadingDailySchedule) => {
    const matchingTask = tasks.find(
      (t) =>
        t.reading_meta?.plan_id === planId &&
        (t.due_date === item.date ||
          t.reading_meta?.chapter_title === item.chapter_title ||
          t.title.includes(item.chapter_title))
    )

    if (matchingTask) {
      const nextIsToday = !matchingTask.is_today
      const now = new Date().toISOString()
      const updatedTask: Task = {
        ...matchingTask,
        is_today: nextIsToday,
        updated_at: now,
      }
      const updatedTasks = tasks.map((t) => (t.id === matchingTask.id ? updatedTask : t))
      setTasks(updatedTasks)
      window.electronAPI?.updateTask(matchingTask.id, updatedTask)
      cloudUpdateTask(matchingTask.id, { is_today: nextIsToday, updated_at: now })

      let planScheduleUpdates: Partial<ReadingPlan> | null = null
      const updatedPlans = readingPlans.map((plan) => {
        if (plan.id !== planId) return plan
        const updatedSched = (plan.schedule || []).map((s) =>
          s.day_index === item.day_index ? { ...s, is_today: nextIsToday } : s
        )
        planScheduleUpdates = { schedule: updatedSched, updated_at: now }
        return { ...plan, ...planScheduleUpdates }
      })
      setReadingPlans(updatedPlans)
      if (planScheduleUpdates) {
        cloudUpdateReadingPlan(planId, planScheduleUpdates)
      }
    }
  }

  // 保存读后感与 AI 总结
  const handleSaveBookNotes = async (bookId: string, notes: string, aiSummary?: string) => {
    const now = new Date().toISOString()
    const bookUpdates: Partial<Book> = {
      reading_notes: notes,
      ai_summary: aiSummary,
      updated_at: now,
    }

    const updatedBooks = books.map((b) =>
      b.id === bookId
        ? {
            ...b,
            reading_notes: notes,
            ai_summary: aiSummary || b.ai_summary,
            updated_at: now,
          }
        : b
    )
    setBooks(updatedBooks)
    cloudUpdateBook(bookId, bookUpdates)

    const updatedPlans = readingPlans.map((p) => {
      if (p.book_id === bookId) {
        cloudUpdateReadingPlan(p.id, {
          reading_notes: notes,
          ai_summary: aiSummary || p.ai_summary,
          updated_at: now,
        })
        return {
          ...p,
          reading_notes: notes,
          ai_summary: aiSummary || p.ai_summary,
          updated_at: now,
        }
      }
      return p
    })
    setReadingPlans(updatedPlans)

    if (activeNotesBook) {
      const refreshedBook = updatedBooks.find((b) => b.id === bookId)
      if (refreshedBook) {
        setActiveNotesBook((prev) => (prev ? { ...prev, book: refreshedBook } : null))
      }
    }
  }

  // 手动备份书籍原文件及元数据至云端书库
  const handleUploadBookToCloud = async (book: Book) => {
    const user = await getCurrentUser()
    if (!user) {
      setUserProfileTab('sync')
      setIsUserProfileModalOpen(true)
      return
    }

    setSyncMessage(`正在检查《${book.title}》本地文件...`)

    // 1. 尝试从本地 IndexedDB 取出该书籍二进制文件
    let buffer = await getBookBinary(book.id)

    // 2. 如果本地已缓存该文件，直接上传二进制至 Supabase Storage
    if (buffer) {
      setSyncMessage(`正在将《${book.title}》原书上传至云端书库...`)
      const fileName = book.file_name || `${book.title}.${book.file_format || 'epub'}`
      const blob = new Blob([buffer])
      const res = await uploadBookFileToStorage(blob, fileName, book.id)

      const now = new Date().toISOString()
      const updatedBook: Book = {
        ...book,
        cloud_file_url: res.url || book.cloud_file_url,
        cloud_synced: res.success ? true : book.cloud_synced,
        updated_at: now,
      }
      const updatedBooks = books.map((b) => (b.id === book.id ? updatedBook : b))
      setBooks(updatedBooks)
      cloudUpdateBook(book.id, updatedBook)

      if (res.success) {
        setSyncMessage(`✅ 《${book.title}》原书与元数据已成功同步至云端书库！`)
      } else {
        setSyncMessage(`⚠️ 云端提示: ${res.error}`)
      }
      setTimeout(() => setSyncMessage(null), 4000)
      return
    }

    // 3. 如果本地尚未缓存该书二进制（例如历史仅录入大纲），弹出文件选择器供用户选取原书文件
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = '.epub,.pdf,.txt,.md,.mobi,.azw3'
    fileInput.onchange = async (e: any) => {
      const file = e.target?.files?.[0]
      if (!file) return
      setSyncMessage(`正在保存《${book.title}》并同步至云端...`)
      try {
        await saveBookBinary(book.id, file, file.name)
        const res = await uploadBookFileToStorage(file, file.name, book.id)
        const ext = file.name.split('.').pop()?.toLowerCase() || book.file_format || 'epub'
        const now = new Date().toISOString()
        const updatedBook: Book = {
          ...book,
          file_name: file.name,
          file_size: file.size,
          file_format: (ext as any) || book.file_format,
          cloud_file_url: res.url || book.cloud_file_url,
          cloud_synced: res.success ? true : false,
          updated_at: now,
        }
        const updatedBooks = books.map((b) => (b.id === book.id ? updatedBook : b))
        setBooks(updatedBooks)
        cloudUpdateBook(book.id, updatedBook)

        if (res.success) {
          setSyncMessage(`✅ 《${book.title}》原书已存入本地并同步至云端书库！`)
        } else {
          setSyncMessage(`✅ 本地已就绪！云端提示: ${res.error}`)
        }
      } catch (err: any) {
        setSyncMessage(`上传失败: ${err.message}`)
      }
      setTimeout(() => setSyncMessage(null), 4000)
    }
    fileInput.click()
  }

  // 沉浸阅读器退出时自动同步进度与专注时长
  const handleReaderProgressUpdate = async (
    bookId: string,
    completedPages: number,
    elapsedMinutes: number
  ) => {
    let updatedTasks = [...tasks]
    let updatedPlans = [...readingPlans]
    const now = new Date().toISOString()

    // 1. 若有关联阅读计划，更新计划的已读页数与状态
    const planIndex = updatedPlans.findIndex((p) => p.book_id === bookId && p.status === 'active')
    if (planIndex !== -1) {
      const plan = updatedPlans[planIndex]
      const newCompletedPages = Math.max(plan.completed_pages || 0, completedPages)
      const isPlanAllDone = newCompletedPages >= plan.total_pages

      const updatedPlanItem = {
        ...plan,
        completed_pages: newCompletedPages,
        status: isPlanAllDone ? 'completed' : plan.status,
        updated_at: now,
      }
      updatedPlans[planIndex] = updatedPlanItem
      cloudUpdateReadingPlan(plan.id, updatedPlanItem)

      // 2. 联动更新该计划下待办任务的完成状态
      updatedTasks = updatedTasks.map((t) => {
        if (t.reading_meta?.plan_id === plan.id) {
          if (t.reading_meta.end_page <= newCompletedPages && t.status !== 'completed') {
            const finishedTask: Task = {
              ...t,
              status: 'completed',
              actual_minutes: (t.actual_minutes || 0) + elapsedMinutes,
              completed_at: now,
              updated_at: now,
            }
            window.electronAPI?.updateTask(t.id, finishedTask)
            cloudUpdateTask(t.id, finishedTask)
            return finishedTask
          }
        }
        return t
      })
    }

    setReadingPlans(updatedPlans)
    setTasks(updatedTasks)

    if (activeReadingSession?.book.id === bookId && planIndex !== -1) {
      setActiveReadingSession((prev) =>
        prev ? { ...prev, plan: updatedPlans[planIndex] } : null
      )
    }
  }

  // 从待办任务直接唤起全屏沉浸阅读器
  const handleOpenReaderFromTask = (task: Task) => {
    if (!task.reading_meta) return
    let book = books.find((b) => b.id === task.reading_meta?.book_id)
    if (!book) {
      book = books.find((b) => b.title === task.reading_meta?.chapter_title || task.title.includes(b.title))
    }
    const plan = task.reading_meta.plan_id
      ? readingPlans.find((p) => p.id === task.reading_meta?.plan_id)
      : null

    if (book) {
      setActiveReadingSession({ book, plan })
    } else {
      const tempBook: Book = {
        id: task.reading_meta.book_id || `book_${Date.now()}`,
        title: task.title.replace(/^《|》.*$/g, '') || task.title,
        total_pages: task.reading_meta.end_page,
        chapters: [],
      }
      setActiveReadingSession({ book: tempBook, plan })
    }
  }

  // Filter tasks based on current view & search query
  const filteredTasks = tasks.filter((t) => {
    if (searchQuery) {
      const matchSearch =
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.notes && t.notes.toLowerCase().includes(searchQuery.toLowerCase()))
      if (!matchSearch) return false
    }

    if (currentView === 'today') {
      if (layoutMode === 'kanban') {
        return t.is_today
      }
      return t.is_today && t.status !== 'completed'
    } else if (currentView === 'inbox') {
      if (layoutMode === 'kanban') {
        return !t.is_today && t.task_type !== 'reading'
      }
      return !t.is_today && t.status !== 'completed' && t.task_type !== 'reading'
    } else if (currentView === 'upcoming') {
      if (layoutMode === 'kanban') {
        return true
      }
      return t.status !== 'completed'
    } else if (currentView === 'completed') {
      return t.status === 'completed'
    } else if (currentView === 'project' && selectedProjectId) {
      if (layoutMode === 'kanban') {
        return t.project_id === selectedProjectId
      }
      return t.project_id === selectedProjectId && t.status !== 'completed'
    }
    return true
  })

  // 视口与分页精准切片计算 (Inbox 分页、已完成分页)
  const totalInboxFiltered = currentView === 'inbox' ? filteredTasks.length : 0
  const effectiveInboxTotal = Math.max(inboxTotal, totalInboxFiltered)
  const totalInboxPages = Math.max(1, Math.ceil(effectiveInboxTotal / inboxPageSize))

  const totalCompletedFiltered = currentView === 'completed' ? filteredTasks.length : 0
  const effectiveCompletedTotal = Math.max(completedTotal, totalCompletedFiltered)
  const totalCompletedPages = Math.max(1, Math.ceil(effectiveCompletedTotal / completedPageSize))

  const displayedTasks = useMemo(() => {
    if (layoutMode === 'kanban' || layoutMode === 'matrix') {
      return filteredTasks
    }
    if (currentView === 'inbox') {
      const from = (inboxPage - 1) * inboxPageSize
      return filteredTasks.slice(from, from + inboxPageSize)
    }
    if (currentView === 'completed') {
      const from = (completedPage - 1) * completedPageSize
      return filteredTasks.slice(from, from + completedPageSize)
    }
    return filteredTasks
  }, [filteredTasks, currentView, layoutMode, inboxPage, inboxPageSize, completedPage, completedPageSize])

  // 状态流转（用于看板拖拽/流转至不同状态或上一状态）
  const handleUpdateTaskStatus = async (taskId: string, newStatus: Task['status']) => {
    const now = new Date().toISOString()
    const updates: Partial<Task> = {
      status: newStatus,
      updated_at: now,
      ...(newStatus === 'completed' ? { completed_at: now } : {}),
    }
    if (window.electronAPI) {
      await window.electronAPI.updateTask(taskId, updates)
      if (activeTimerTask?.id === taskId && (newStatus === 'completed' || newStatus === 'todo')) {
        setActiveTimerTask(null)
      }
      const updatedTasks = tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
      setTasks(updatedTasks)
      cloudUpdateTask(taskId, updates)
    }
  }

  // 子任务清单就地勾选联动
  const handleToggleSubTask = async (taskId: string, subtaskId: string) => {
    const targetTask = tasks.find((t) => t.id === taskId)
    if (!targetTask || !targetTask.subtasks) return
    const now = new Date().toISOString()
    const updatedSubtasks = targetTask.subtasks.map((st) =>
      st.id === subtaskId ? { ...st, completed: !st.completed } : st
    )
    const updates: Partial<Task> = {
      subtasks: updatedSubtasks,
      updated_at: now,
    }
    const updatedTasks = tasks.map((t) =>
      t.id === taskId ? { ...t, ...updates } : t
    )
    setTasks(updatedTasks)
    if (window.electronAPI) {
      await window.electronAPI.updateTask(taskId, updates)
    }
    cloudUpdateTask(taskId, updates)
  }

  // 子任务清单编辑（标题、用时等）——主任务总用时直接按子任务用时合集同步
  const handleUpdateSubTask = async (taskId: string, subtaskId: string, updates: Partial<SubTask>) => {
    const targetTask = tasks.find((t) => t.id === taskId)
    if (!targetTask || !targetTask.subtasks) return
    const now = new Date().toISOString()
    const updatedSubtasks = targetTask.subtasks.map((st) =>
      st.id === subtaskId ? { ...st, ...updates } : st
    )
    const newEstimatedMinutes = updatedSubtasks.reduce(
      (sum, st) => sum + (st.estimated_minutes || 15),
      0
    )
    const taskUpdates: Partial<Task> = {
      subtasks: updatedSubtasks,
      estimated_minutes: newEstimatedMinutes,
      updated_at: now,
    }
    const updatedTasks = tasks.map((t) =>
      t.id === taskId ? { ...t, ...taskUpdates } : t
    )
    setTasks(updatedTasks)
    if (window.electronAPI) {
      await window.electronAPI.updateTask(taskId, taskUpdates)
    }
    cloudUpdateTask(taskId, taskUpdates)
  }

  // 子任务删除——主任务用时重新求和
  const handleDeleteSubTask = async (taskId: string, subtaskId: string) => {
    const targetTask = tasks.find((t) => t.id === taskId)
    if (!targetTask || !targetTask.subtasks) return
    const now = new Date().toISOString()
    const updatedSubtasks = targetTask.subtasks.filter((st) => st.id !== subtaskId)
    const newEstimatedMinutes =
      updatedSubtasks.length > 0
        ? updatedSubtasks.reduce((sum, st) => sum + (st.estimated_minutes || 15), 0)
        : targetTask.estimated_minutes || 30
    const updates: Partial<Task> = {
      subtasks: updatedSubtasks,
      estimated_minutes: newEstimatedMinutes,
      updated_at: now,
    }
    const updatedTasks = tasks.map((t) =>
      t.id === taskId ? { ...t, ...updates } : t
    )
    setTasks(updatedTasks)
    if (window.electronAPI) {
      await window.electronAPI.updateTask(taskId, updates)
    }
    cloudUpdateTask(taskId, updates)
  }

  // 子任务在卡片中快速添加——主任务用时重新求和
  const handleAddSubTask = async (taskId: string, subtaskData: Omit<SubTask, 'id'>) => {
    const targetTask = tasks.find((t) => t.id === taskId)
    if (!targetTask) return
    const now = new Date().toISOString()
    const newSubTask: SubTask = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `st_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ...subtaskData,
    }
    const currentSubtasks = targetTask.subtasks || []
    const updatedSubtasks = [...currentSubtasks, newSubTask]
    const newEstimatedMinutes = updatedSubtasks.reduce(
      (sum, st) => sum + (st.estimated_minutes || 15),
      0
    )
    const updates: Partial<Task> = {
      subtasks: updatedSubtasks,
      estimated_minutes: newEstimatedMinutes,
      updated_at: now,
    }
    const updatedTasks = tasks.map((t) =>
      t.id === taskId ? { ...t, ...updates } : t
    )
    setTasks(updatedTasks)
    if (window.electronAPI) {
      await window.electronAPI.updateTask(taskId, updates)
    }
    cloudUpdateTask(taskId, updates)
  }

  // 1. 完成状态切换
  const handleToggleComplete = async (task: Task) => {
    const nextStatus: Task['status'] = task.status === 'completed' ? 'todo' : 'completed'
    const now = new Date().toISOString()
    const updates: Partial<Task> = {
      status: nextStatus,
      completed_at: nextStatus === 'completed' ? now : undefined,
      updated_at: now,
    }
    if (window.electronAPI) {
      await window.electronAPI.updateTask(task.id, updates)
      if (activeTimerTask?.id === task.id && nextStatus === 'completed') {
        setActiveTimerTask(null)
      }
      const updatedTasks: Task[] = tasks.map((t) => (t.id === task.id ? { ...t, ...updates } : t))
      setTasks(updatedTasks)
      cloudUpdateTask(task.id, updates)
    }
  }

  // 2. 一键流转到 Today / 移回 Inbox
  const handleToggleToday = async (task: Task) => {
    const nextIsToday = !task.is_today
    const now = new Date().toISOString()
    const updates: Partial<Task> = {
      is_today: nextIsToday,
      updated_at: now,
    }
    if (window.electronAPI) {
      await window.electronAPI.updateTask(task.id, updates)
      const updatedTasks = tasks.map((t) => (t.id === task.id ? { ...t, ...updates } : t))
      setTasks(updatedTasks)
      cloudUpdateTask(task.id, updates)
    }
  }

  // 3. 删除任务
  const handleDeleteTask = async (id: string) => {
    if (window.electronAPI) {
      await window.electronAPI.deleteTask(id)
      if (activeTimerTask?.id === id) {
        setActiveTimerTask(null)
      }
      const updatedTasks = tasks.filter((t) => t.id !== id)
      setTasks(updatedTasks)
      cloudDeleteTask(id)
    }
  }

  // 4. 保存/新建任务
  const handleSaveTask = async (taskData: Partial<Task>) => {
    try {
      const now = new Date().toISOString()
      if (window.electronAPI) {
        if (editingTask) {
          const updates = { ...taskData, updated_at: now }
          const updated = await window.electronAPI.updateTask(editingTask.id, updates)
          const finalTask = updated || { ...editingTask, ...updates }
          setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? finalTask : t)))
          cloudUpdateTask(editingTask.id, updates)
        } else {
          const newTask = await window.electronAPI.addTask({ ...taskData, updated_at: now })
          if (newTask) {
            setTasks((prev) => [newTask, ...prev])
            cloudAddTask(newTask)
          }
        }
      }
    } catch (err) {
      console.error('Save task error:', err)
    }
  }

  // 4.1 批量导入与排期任务 (由智能文本拆解器触发，本地即时乐观更新 + 静默云端同步)
  const handleBatchAddTasks = async (newTasksData: Partial<Task>[]) => {
    try {
      const now = new Date().toISOString()
      const formattedTasks = newTasksData.map((td) => ({
        ...td,
        updated_at: now,
      }))

      if (window.electronAPI?.addTasks) {
        const created = await window.electronAPI.addTasks(formattedTasks)
        if (created && created.length > 0) {
          setTasks((prev) => [...created, ...prev])
          cloudBatchAddTasks(created)
        }
      } else if (window.electronAPI?.addTask) {
        const addedList: Task[] = []
        for (const item of formattedTasks) {
          const added = await window.electronAPI.addTask(item)
          if (added) addedList.push(added)
        }
        if (addedList.length > 0) {
          setTasks((prev) => [...addedList, ...prev])
          cloudBatchAddTasks(addedList)
        }
      } else {
        const fallbackTasks: Task[] = formattedTasks.map((t, idx) => ({
          ...t,
          id: `task_${Date.now()}_${idx}`,
          created_at: now,
          status: 'todo',
        } as Task))
        setTasks((prev) => [...fallbackTasks, ...prev])
        cloudBatchAddTasks(fallbackTasks)
      }
    } catch (err) {
      console.error('Batch add tasks error:', err)
    }
  }

  // 5. 专注计时器状态联动 (开始专注时将任务自动标记为 in_progress)
  const handleToggleTimer = async (task: Task) => {
    const now = new Date().toISOString()
    if (activeTimerTask?.id === task.id) {
      setActiveTimerTask(null)
      // 暂停专注时恢复为 todo
      if (task.status === 'in_progress') {
        const updates: Partial<Task> = { status: 'todo', updated_at: now }
        await window.electronAPI?.updateTask(task.id, updates)
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...updates } : t)))
        cloudUpdateTask(task.id, updates)
      }
    } else {
      setActiveTimerTask(task)
      // 开启专注时自动标记为 in_progress
      if (task.status === 'todo') {
        const updates: Partial<Task> = { status: 'in_progress', updated_at: now }
        await window.electronAPI?.updateTask(task.id, updates)
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...updates } : t)))
        cloudUpdateTask(task.id, updates)
      }
    }
  }

  const handleSaveProfile = async (profileData: Partial<UserProfile>) => {
    if (window.electronAPI) {
      const updated = await window.electronAPI.updateUserProfile(profileData)
      if (updated) {
        setUserProfile(updated)
      }
    }
  }

  const todayCount = tasks.filter((t) => t.is_today && t.status !== 'completed').length
  const inboxCount = tasks.filter((t) => !t.is_today && t.status !== 'completed' && t.task_type !== 'reading').length
  const completedTasks = tasks.filter((t) => t.status === 'completed')

  return (
    <div className="flex h-screen w-screen bg-[#EDEDED] dark:bg-[#111111] text-[#191919] dark:text-[#EDEDED] font-sans overflow-hidden transition-colors duration-200">
      {/* Sidebar */}
      <Sidebar
        currentView={currentView}
        selectedProjectId={selectedProjectId}
        onSelectView={(view, projId) => {
          setCurrentView(view)
          setSelectedProjectId(projId)
          const targetAvailable = allowedLayoutsByView[view] || []
          if (targetAvailable.length > 0 && !targetAvailable.includes(layoutMode)) {
            setLayoutMode(targetAvailable[0])
          }
        }}
        projects={projects}
        onOpenAIReport={() => setIsAIReportOpen(true)}
        todayCount={todayCount}
        inboxCount={inboxCount}
        readingCount={readingPlans.filter((p) => p.status === 'active').length}
        userProfile={userProfile}
        onOpenProfileModal={() => setIsUserProfileModalOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onManualSync={handleManualSync}
        isSyncing={isSyncing}
        syncMessage={syncMessage}
      />

      {/* Main Content Area */}
      <main className="flex-1 h-full flex flex-col pt-9 min-w-0 min-h-0 overflow-hidden bg-[#F7F7F7] dark:bg-[#141414] transition-colors duration-200">
        {/* Top Header Bar */}
        <header className="px-6 py-3.5 flex items-center justify-between border-b border-black/5 dark:border-white/5 bg-white/50 dark:bg-transparent backdrop-blur-md select-none shrink-0 min-w-0">
          <div className="min-w-0 pr-4">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center space-x-2 truncate">
              {currentView === 'today' && (
                <>
                  <Sun className="w-5 h-5 text-amber-500 shrink-0" />
                  <span className="truncate">Today 聚焦清单</span>
                </>
              )}
              {currentView === 'inbox' && (
                <>
                  <Inbox className="w-5 h-5 text-[#07C160] shrink-0" />
                  <span className="truncate">Inbox 收集箱</span>
                </>
              )}
              {currentView === 'upcoming' && (
                <>
                  <CalendarIcon className="w-5 h-5 text-[#07C160] shrink-0" />
                  <span className="truncate">Upcoming 计划日历</span>
                </>
              )}
              {currentView === 'reading' && (
                <>
                  <BookOpen className="w-5 h-5 text-blue-500 shrink-0" />
                  <span className="truncate">📖 阅读规划与书架</span>
                </>
              )}
              {currentView === 'completed' && (
                <>
                  <Sparkles className="w-5 h-5 text-[#07C160] shrink-0" />
                  <span className="truncate">已完成归档战报</span>
                </>
              )}
              {currentView === 'analytics' && <span className="truncate">生产力数据动态看板</span>}
              {currentView === 'project' && (
                <span className="truncate">
                  项目: {projects.find((p) => p.id === selectedProjectId)?.name || '详细清单'}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-md">
              {currentView === 'today' && '早晨规划好的优先事项，保持高压集中突破'}
              {currentView === 'inbox' && '暂存的闪念与待整理工作，随时一键移入 Today 或归类'}
              {currentView === 'upcoming' && '全月日期视角的任务安排与色彩归类看板'}
              {currentView === 'reading' && 'AI 拍照多模态识页提取章节目录，科学排期并同步到 TaskFlow 待办流'}
              {currentView === 'analytics' && '聚合历史投入用时、分类占比与完成效率'}
              {currentView === 'completed' && '您的历史工作成果沉淀，随时生成 AI 周报'}
            </p>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-2.5 shrink-0">
            {/* View Layout Switcher (仅展示当前视图所合理需要的模式) */}
            {availableLayouts.length > 1 && (
              <div className="flex items-center p-0.5 sm:p-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs no-drag shadow-sm shrink-0">
                {availableLayouts.includes('list') && (
                  <button
                    onClick={() => setLayoutMode('list')}
                    className={`p-1.5 rounded-lg transition-colors ${
                      layoutMode === 'list'
                        ? 'bg-[#07C160] text-white font-medium shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                    title="清单列表视图"
                  >
                    <LayoutList className="w-3.5 h-3.5" />
                  </button>
                )}
                {availableLayouts.includes('kanban') && (
                  <button
                    onClick={() => setLayoutMode('kanban')}
                    className={`p-1.5 rounded-lg transition-colors ${
                      layoutMode === 'kanban'
                        ? 'bg-[#07C160] text-white font-medium shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                    title="看板流转视图"
                  >
                    <Kanban className="w-3.5 h-3.5" />
                  </button>
                )}
                {availableLayouts.includes('matrix') && (
                  <button
                    onClick={() => setLayoutMode('matrix')}
                    className={`p-1.5 rounded-lg transition-colors ${
                      layoutMode === 'matrix'
                        ? 'bg-[#07C160] text-white font-medium shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                    title="四象限矩阵视图"
                  >
                    <Grid className="w-3.5 h-3.5" />
                  </button>
                )}
                {availableLayouts.includes('calendar') && (
                  <button
                    onClick={() => setLayoutMode('calendar')}
                    className={`p-1.5 rounded-lg transition-colors ${
                      layoutMode === 'calendar'
                        ? 'bg-[#07C160] text-white font-medium shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                    title="月历网格视图"
                  >
                    <CalendarIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Search Input */}
            <div className="relative no-drag shrink">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="搜索任务... (⌘K)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-28 pl-7 sm:w-36 md:w-44 focus:w-48 px-2.5 py-1.5 pl-7.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#07C160] transition-all duration-150 shadow-sm"
              />
            </div>

            {/* Quick Add Button */}
            {currentView === 'reading' ? (
              <button
                onClick={() => {
                  setEditingBookForPlan(null)
                  setIsReadingPlanModalOpen(true)
                }}
                className="h-8 px-3.5 rounded-xl bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059B4D] text-white text-xs font-semibold shadow-md shadow-[#07C160]/20 flex items-center space-x-1.5 transition-all no-drag shrink-0 whitespace-nowrap"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">新建阅读规划</span>
              </button>
            ) : (
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={() => setIsSmartBreakdownOpen(true)}
                  className="h-8 px-3 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-[#07C160]/15 hover:from-emerald-500/20 hover:to-teal-500/20 text-[#07C160] dark:text-emerald-400 border border-[#07C160]/30 text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-all no-drag shrink-0 whitespace-nowrap cursor-pointer active:scale-95"
                  title="粘贴整段长文排期、健身计划或周度任务，自动识别日期并智能拆解入表"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#07C160]" />
                  <span>智能拆解</span>
                </button>
                <button
                  onClick={() => {
                    setEditingTask(null)
                    setTargetDateForNewTask(undefined)
                    setIsTaskModalOpen(true)
                  }}
                  className="h-8 px-3.5 rounded-xl bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059B4D] text-white text-xs font-semibold shadow-md shadow-[#07C160]/20 flex items-center space-x-1.5 transition-all no-drag shrink-0 whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span className="whitespace-nowrap">新建任务</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Focus Timer Supervision Bar */}
        <FocusTimerBar
          activeTask={activeTimerTask}
          onTaskCompleted={(task) => handleToggleComplete(task)}
        />

        {/* 晨间规划仪式感条：Today 任务较少时引导从 Inbox 一键纳入 */}
        {currentView === 'today' && todayCount < 3 && inboxCount > 0 && (
          <div className="mx-6 mb-3 p-3 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-emerald-500/10 border border-amber-500/20 flex items-center justify-between no-drag">
            <div className="flex items-center space-x-2 text-xs text-amber-700 dark:text-amber-300">
              <Sun className="w-4 h-4 text-amber-500" />
              <span>早晨好！Inbox 还有 <b>{inboxCount}</b> 项待整理任务，挑选 1~2 项纳入今日执行？</span>
            </div>
            <button
              onClick={() => setCurrentView('inbox')}
              className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-200 text-xs font-semibold rounded-lg flex items-center space-x-1 transition-colors"
            >
              <span>前往挑选</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Dynamic Views Rendering */}
        {currentView === 'reading' ? (
          <ReadingView
            books={books}
            plans={readingPlans}
            tasks={tasks}
            onOpenCreatePlan={(initialBook) => {
              setEditingBookForPlan(initialBook || null)
              setIsReadingPlanModalOpen(true)
            }}
            onSaveBookOnly={handleSaveBookOnly}
            onUpdateBook={handleSaveBookOnly}
            onDeletePlan={handleDeleteReadingPlan}
            onDeleteBook={handleDeleteBook}
            onOpenNotesModal={(book, plan) => {
              setActiveNotesBook({ book, plan })
            }}
            onUpdateScheduleDate={handleUpdateScheduleDate}
            onToggleTodayFromSchedule={handleToggleTodayFromSchedule}
            onUploadBookToCloud={handleUploadBookToCloud}
            onStartReading={(book, plan) => setActiveReadingSession({ book, plan: plan || null })}
          />
        ) : currentView === 'analytics' ? (
          <AnalyticsView tasks={tasks} projects={projects} />
        ) : currentView === 'completed' ? (
          <CompletedArchiveView
            completedTasks={completedTasks}
            onDeleteTask={handleDeleteTask}
            onOpenAIReport={() => setIsAIReportOpen(true)}
          />
        ) : layoutMode === 'calendar' ? (
          <CalendarView
            tasks={tasks}
            projects={projects}
            onSelectDateTask={(dateStr) => {
              setEditingTask(null)
              setTargetDateForNewTask(dateStr)
              setIsTaskModalOpen(true)
            }}
            onToggleComplete={handleToggleComplete}
            onEditTask={(task) => {
              setEditingTask(task)
              setIsTaskModalOpen(true)
            }}
            onMonthChange={(year, month) => loadCalendarMonthTasksScoped(year, month)}
          />
        ) : layoutMode === 'kanban' ? (
          <KanbanView
            tasks={filteredTasks}
            onToggleComplete={handleToggleComplete}
            onToggleToday={handleToggleToday}
            onDelete={handleDeleteTask}
            onEdit={(task) => {
              setEditingTask(task)
              setIsTaskModalOpen(true)
            }}
            onToggleTimer={handleToggleTimer}
            activeTimerTaskId={activeTimerTask?.id}
            onNewTask={() => {
              setEditingTask(null)
              setTargetDateForNewTask(undefined)
              setIsTaskModalOpen(true)
            }}
            onUpdateTaskStatus={handleUpdateTaskStatus}
            onToggleSubTask={handleToggleSubTask}
            onUpdateSubTask={handleUpdateSubTask}
            onDeleteSubTask={handleDeleteSubTask}
            onAddSubTask={handleAddSubTask}
          />
        ) : layoutMode === 'matrix' ? (
          <MatrixView
            tasks={filteredTasks}
            onToggleComplete={handleToggleComplete}
            onToggleToday={handleToggleToday}
            onDelete={handleDeleteTask}
            onEdit={(task) => {
              setEditingTask(task)
              setIsTaskModalOpen(true)
            }}
            onToggleTimer={handleToggleTimer}
            activeTimerTaskId={activeTimerTask?.id}
            onToggleSubTask={handleToggleSubTask}
            onUpdateSubTask={handleUpdateSubTask}
            onDeleteSubTask={handleDeleteSubTask}
            onAddSubTask={handleAddSubTask}
          />
        ) : (
          /* Default List Layout */
          <div className="flex-1 p-6 overflow-y-auto space-y-2.5">
            {filteredTasks.length === 0 ? (
              <div className="py-20 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 shadow-sm">
                  {currentView === 'inbox' ? (
                    <Inbox className="w-6 h-6 text-[#07C160]" />
                  ) : (
                    <Sun className="w-6 h-6 text-amber-500" />
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {currentView === 'today'
                    ? '太棒了！今天聚焦清单已清空或暂无排期'
                    : currentView === 'inbox'
                    ? 'Inbox 收集箱空空如也，有新想法随时记录下来'
                    : '当前视图暂无相关任务'}
                </p>
                <button
                  onClick={() => {
                    setEditingTask(null)
                    setTargetDateForNewTask(undefined)
                    setIsTaskModalOpen(true)
                  }}
                  className="text-xs text-[#07C160] hover:text-[#06AD56] hover:underline font-semibold"
                >
                  + 点击新建一项任务
                </button>
              </div>
            ) : (
              <>
                {displayedTasks.map((t) => (
                  <TaskItem
                    key={t.id}
                    task={t}
                    onToggleComplete={handleToggleComplete}
                    onToggleToday={handleToggleToday}
                    onDelete={handleDeleteTask}
                    onEdit={(task) => {
                      setEditingTask(task)
                      setIsTaskModalOpen(true)
                    }}
                    onToggleTimer={handleToggleTimer}
                    isTimerRunning={activeTimerTask?.id === t.id}
                    onOpenReadingProgress={(task) => setActiveProgressTask(task)}
                    onOpenReader={handleOpenReaderFromTask}
                    onToggleSubTask={handleToggleSubTask}
                    onUpdateSubTask={handleUpdateSubTask}
                    onDeleteSubTask={handleDeleteSubTask}
                    onAddSubTask={handleAddSubTask}
                  />
                ))}

                {/* Inbox 收集箱分页控制栏 */}
                {currentView === 'inbox' && effectiveInboxTotal > inboxPageSize && (
                  <div className="flex items-center justify-between px-3 py-3 mt-4 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center space-x-1.5">
                      <span>共 <strong className="text-slate-700 dark:text-slate-300 font-semibold">{effectiveInboxTotal}</strong> 项收集箱待办</span>
                      <span>•</span>
                      <span>第 <strong className="text-[#07C160] font-semibold">{inboxPage}</strong> / {totalInboxPages} 页</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setInboxPage((p) => Math.max(1, p - 1))}
                        disabled={inboxPage <= 1}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium flex items-center space-x-1 cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>上一页</span>
                      </button>
                      <button
                        onClick={() => setInboxPage((p) => Math.min(totalInboxPages, p + 1))}
                        disabled={inboxPage >= totalInboxPages}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium flex items-center space-x-1 cursor-pointer"
                      >
                        <span>下一页</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Modals & Command Overlay */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSave={handleSaveTask}
        editingTask={editingTask}
        projects={projects}
        defaultIsToday={currentView === 'today'}
        defaultDueDate={targetDateForNewTask}
        defaultProjectId={selectedProjectId}
        onOpenAISettings={() => {
          setUserProfileTab('ai')
          setIsUserProfileModalOpen(true)
        }}
        onOpenSmartBreakdown={() => setIsSmartBreakdownOpen(true)}
      />

      <SmartBreakdownModal
        isOpen={isSmartBreakdownOpen}
        onClose={() => setIsSmartBreakdownOpen(false)}
        projects={projects}
        onBatchAddTasks={handleBatchAddTasks}
      />

      <AIReportModal
        isOpen={isAIReportOpen}
        onClose={() => setIsAIReportOpen(false)}
        completedTasks={completedTasks}
      />

      {isReadingPlanModalOpen && (
        <ReadingPlanModal
          key={editingBookForPlan ? `plan_${editingBookForPlan.id}` : `new_plan_${Date.now()}`}
          isOpen={isReadingPlanModalOpen}
          onClose={() => {
            setIsReadingPlanModalOpen(false)
            setEditingBookForPlan(null)
          }}
          initialBook={editingBookForPlan}
          onPlanCreated={handlePlanCreated}
          onSaveBookOnly={handleSaveBookOnly}
        />
      )}

      {activeProgressTask && (
        <ReadingProgressModal
          isOpen={!!activeProgressTask}
          onClose={() => setActiveProgressTask(null)}
          task={activeProgressTask}
          onSaveProgress={handleSaveReadingProgress}
        />
      )}

      {activeNotesBook && (
        <BookNotesModal
          isOpen={!!activeNotesBook}
          onClose={() => setActiveNotesBook(null)}
          book={activeNotesBook.book}
          plan={activeNotesBook.plan}
          tasks={tasks}
          onSaveNotes={handleSaveBookNotes}
        />
      )}

      {activeReadingSession && (
        <BookReaderModal
          isOpen={!!activeReadingSession}
          onClose={() => setActiveReadingSession(null)}
          book={activeReadingSession.book}
          associatedPlan={activeReadingSession.plan}
          onUpdateProgress={handleReaderProgressUpdate}
          onUpdateBook={handleSaveBookOnly}
        />
      )}

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        tasks={tasks}
        onSelectTask={(task) => {
          setEditingTask(task)
          setIsTaskModalOpen(true)
        }}
        onSelectView={(view) => setCurrentView(view)}
        onNewTask={() => {
          setEditingTask(null)
          setTargetDateForNewTask(undefined)
          setIsTaskModalOpen(true)
        }}
        onOpenAIReport={() => setIsAIReportOpen(true)}
        onOpenSmartBreakdown={() => setIsSmartBreakdownOpen(true)}
      />

      <UserProfileModal
        isOpen={isUserProfileModalOpen}
        onClose={() => setIsUserProfileModalOpen(false)}
        initialTab={userProfileTab}
        userProfile={userProfile}
        userStats={userStats}
        tasks={tasks}
        theme={theme}
        onThemeChange={(newTheme) => setTheme(newTheme)}
        onSaveProfile={handleSaveProfile}
        onTriggerSync={handleManualSync}
        onTasksSynced={(mergedTasks) => {
          setTasks(mergedTasks)
          mergedTasks.forEach((t) => {
            window.electronAPI?.updateTask(t.id, t)
          })
        }}
      />
    </div>
  )
}

export default App
