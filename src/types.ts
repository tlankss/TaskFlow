export interface SubTask {
  id: string
  title: string
  completed: boolean
  estimated_minutes?: number
  due_date?: string
  notes?: string
  completed_at?: string
}

export interface Task {
  id: string
  title: string
  notes?: string
  priority: 'p1' | 'p2' | 'p3' | 'p4'
  project_id: string
  estimated_minutes: number
  actual_minutes: number
  due_date: string
  is_today: boolean
  status: 'todo' | 'in_progress' | 'completed' | 'cancelled'
  created_at: string
  updated_at?: string
  is_deleted?: boolean
  completed_at?: string
  output_notes?: string
  subtasks?: SubTask[]
  task_type?: 'normal' | 'reading'
  reading_meta?: ReadingTaskMeta
}

export interface ReadingTaskMeta {
  book_id: string
  plan_id: string
  book_title: string
  chapter_title: string
  start_page: number
  end_page: number
  current_page?: number
  cover_url?: string
}

export interface BookChapter {
  index: number
  title: string
  start_page: number
  end_page: number
  page_count: number
  difficulty?: 'easy' | 'normal' | 'hard'
}

export interface BookGuide {
  summary: string
  key_takeaways: string[]
  core_chapters: string[]
  recommended_pace: string
  target_days?: number
  daily_minutes?: number
  // 主流阅读软件（微信读书/得到）深度结构化导读字段
  core_problem?: string // 解决的现实痛点与颠覆性洞见（为什么值得读）
  reading_roadmap?: string[] // 全书认知演进与逻辑脉络（从困境到重塑）
  core_chapter_details?: { title: string; pages?: string; reason: string }[] // 核心精读章与理由
  skim_chapters?: { title: string; pages?: string; tip: string }[] // 略读/选读章与策略
  pre_reading_questions?: string[] // 读前灵魂三问（带着问题思考）
  actionable_habits?: string[] // 读完可直接落地的微行动法则
  reading_mode?: 'deep' | 'fast' | 'practical' // 用户阅读偏好模式
}

export interface Book {
  id: string
  user_id?: string
  title: string
  author?: string
  total_pages: number
  cover_url?: string
  isbn?: string
  chapters: BookChapter[]
  file_name?: string
  file_format?: 'epub' | 'pdf' | 'txt' | 'md' | 'mobi' | 'azw3' | 'other'
  file_size?: number
  cloud_file_url?: string
  cloud_synced?: boolean
  guide?: BookGuide
  reading_notes?: string
  ai_summary?: string
  is_deleted?: boolean
  created_at?: string
  updated_at?: string
}

export interface ReadingDailySchedule {
  day_index: number
  date: string
  start_page: number
  end_page: number
  page_count: number
  chapter_title: string
  is_buffer_day?: boolean
  estimated_minutes: number
  status: 'pending' | 'completed' | 'delayed'
  actual_page_reached?: number
  task_id?: string
  is_today?: boolean
}

export interface ReadingPlan {
  id: string
  user_id?: string
  book_id: string
  book_title: string
  status: 'active' | 'completed' | 'paused'
  start_date: string
  target_end_date: string
  total_pages: number
  completed_pages: number
  daily_minutes: number
  pacing_mode: 'pages' | 'chapters'
  buffer_days_enabled: boolean
  schedule: ReadingDailySchedule[]
  reading_notes?: string
  ai_summary?: string
  is_deleted?: boolean
  created_at?: string
  updated_at?: string
}

export interface Project {
  id: string
  name: string
  color: string
  icon?: string
}

export interface UserProfile {
  id: string
  name: string
  email: string
  avatar_url?: string
  role_title: string
  plan: 'free' | 'pro' | 'team'
  sync_enabled: boolean
  last_synced_at?: string
}

export interface UserBadge {
  id: string
  name: string
  description: string
  icon: string
  unlocked: boolean
  unlocked_at?: string
}

export interface UserStats {
  total_focus_hours: number
  completed_tasks_count: number
  streak_days: number
  badges: UserBadge[]
}

export type ViewMode = 'today' | 'inbox' | 'upcoming' | 'completed' | 'project' | 'analytics' | 'reading'
export type LayoutMode = 'list' | 'kanban' | 'matrix' | 'calendar'

declare global {
  interface Window {
    electronAPI: {
      getTasks: () => Promise<Task[]>
      addTask: (task: Partial<Task>) => Promise<Task>
      updateTask: (id: string, updates: Partial<Task>) => Promise<Task | null>
      deleteTask: (id: string) => Promise<boolean>
      getProjects: () => Promise<Project[]>
      getSettings: () => Promise<any>
      updateSettings: (settings: any) => Promise<any>
      getUserProfile: () => Promise<UserProfile>
      updateUserProfile: (profile: Partial<UserProfile>) => Promise<UserProfile>
      getUserStats: () => Promise<UserStats>
      generateAIWeeklyReport: (params: { apiKey?: string; baseUrl?: string; model?: string; tasks: Task[]; userRole?: string }) => Promise<string>
      aiBreakdownTask?: (params: { title: string; notes?: string; apiKey?: string; baseUrl?: string; model?: string; userRole?: string }) => Promise<{ title: string; estimated_minutes: number }[]>
      testAIConnection?: (params: { apiKey: string; baseUrl?: string; model?: string }) => Promise<{ success: boolean; latency?: number; error?: string }>
      updateTrayTitle: (title: string) => void
      openDevTools?: () => Promise<void>
      onToggleCommandPalette?: (callback: () => void) => () => void
    }
  }
}
