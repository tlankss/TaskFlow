import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'

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
  completed_at?: string
  output_notes?: string
  subtasks?: SubTask[]
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

interface DatabaseSchema {
  tasks: Task[]
  projects: Project[]
  userProfile: UserProfile
  userStats: UserStats
  settings: {
    apiKey?: string
    apiBaseUrl?: string
    theme: 'dark' | 'light'
    workStartTime: string
    menuBarTimerEnabled: boolean
  }
  auth?: {
    supabaseUrl?: string
    supabaseKey?: string
    supabaseSession?: any
    lastSavedAt?: string
  }
}

class StorageDB {
  private dbPath: string
  private data: DatabaseSchema

  constructor() {
    const userDataPath = app.getPath('userData')
    this.dbPath = path.join(userDataPath, 'taskflow_data.json')
    this.data = this.loadData()
  }

  private loadData(): DatabaseSchema {
    try {
      if (fs.existsSync(this.dbPath)) {
        const fileContent = fs.readFileSync(this.dbPath, 'utf-8')
        const parsed = JSON.parse(fileContent)
        if (!parsed.userProfile) {
          parsed.userProfile = this.getDefaultUserProfile()
        }
        if (!parsed.userStats) {
          parsed.userStats = this.getDefaultUserStats()
        }
        return parsed
      }
    } catch (err) {
      console.error('Failed to read db file, creating new one:', err)
    }

    const defaultData: DatabaseSchema = {
      tasks: [
        {
          id: 'demo-1',
          title: '示例：撰写产品第一期 MVP 功能规划需求文档',
          notes: '提炼核心价值，拆解为模块 A/B/C，产出符合白领工作节奏的方案',
          priority: 'p1',
          project_id: 'work',
          estimated_minutes: 45,
          actual_minutes: 30,
          due_date: new Date().toISOString().split('T')[0],
          is_today: true,
          status: 'todo',
          created_at: new Date().toISOString(),
        },
        {
          id: 'demo-2',
          title: '示例：团队跨部门同步例会',
          notes: '确认接口规范与上线节点',
          priority: 'p2',
          project_id: 'meeting',
          estimated_minutes: 30,
          actual_minutes: 0,
          due_date: new Date().toISOString().split('T')[0],
          is_today: true,
          status: 'todo',
          created_at: new Date().toISOString(),
        },
      ],
      projects: [
        { id: 'work', name: '工作项目', color: '#3B82F6', icon: 'Briefcase' },
        { id: 'meeting', name: '会议沟通', color: '#F59E0B', icon: 'Users' },
        { id: 'personal', name: '个人成长', color: '#10B981', icon: 'User' },
      ],
      userProfile: this.getDefaultUserProfile(),
      userStats: this.getDefaultUserStats(),
      settings: {
        theme: 'dark',
        workStartTime: '09:00',
        menuBarTimerEnabled: true,
      },
    }

    this.saveData(defaultData)
    return defaultData
  }

  private getDefaultUserProfile(): UserProfile {
    return {
      id: 'usr_default_' + Math.random().toString(36).substr(2, 6),
      name: 'Alex 职场极客',
      email: 'alex@taskflow.app',
      role_title: '高级产品专家 / 技术架构师',
      plan: 'pro',
      sync_enabled: true,
      last_synced_at: new Date().toISOString(),
    }
  }

  private getDefaultUserStats(): UserStats {
    return {
      total_focus_hours: 12.5,
      completed_tasks_count: 8,
      streak_days: 5,
      badges: [
        {
          id: 'b1',
          name: '早期规划大师',
          description: '连续 5 天在早晨完成 Today 任务排期',
          icon: 'Sun',
          unlocked: true,
          unlocked_at: new Date().toISOString(),
        },
        {
          id: 'b2',
          name: '专注破百突破',
          description: '累计投入有效专注时长超过 10 小时',
          icon: 'Flame',
          unlocked: true,
          unlocked_at: new Date().toISOString(),
        },
        {
          id: 'b3',
          name: 'AI 汇报先锋',
          description: '使用 AI 智能生成并导出 3 次职场周报',
          icon: 'Sparkles',
          unlocked: true,
          unlocked_at: new Date().toISOString(),
        },
      ],
    }
  }

  private saveData(data: DatabaseSchema) {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to write db file:', err)
    }
  }

  public getTasks(): Task[] {
    return this.data.tasks
  }

  public addTask(task: Omit<Task, 'id' | 'created_at'> & { id?: string; created_at?: string }): Task {
    const newTask: Task = {
      ...task,
      id: task.id || ('task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
      created_at: task.created_at || new Date().toISOString(),
    }
    this.data.tasks.unshift(newTask)
    this.saveData(this.data)
    return newTask
  }

  public addTasks(tasks: (Omit<Task, 'id' | 'created_at'> & { id?: string; created_at?: string })[]): Task[] {
    const now = new Date().toISOString()
    const newTasks: Task[] = tasks.map((task, idx) => ({
      ...task,
      id: task.id || ('task_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substr(2, 4)),
      created_at: task.created_at || now,
    }))
    this.data.tasks.unshift(...newTasks)
    this.saveData(this.data)
    return newTasks
  }

  public updateTask(id: string, updates: Partial<Task>): Task | null {
    const idx = this.data.tasks.findIndex((t) => t.id === id)
    if (idx !== -1) {
      if (updates.status === 'completed' && this.data.tasks[idx].status !== 'completed') {
        updates.completed_at = new Date().toISOString()
      }
      this.data.tasks[idx] = { ...this.data.tasks[idx], ...updates }
      this.saveData(this.data)
      return this.data.tasks[idx]
    }
    return null
  }

  public deleteTask(id: string): boolean {
    const initialLen = this.data.tasks.length
    this.data.tasks = this.data.tasks.filter((t) => t.id !== id)
    if (this.data.tasks.length !== initialLen) {
      this.saveData(this.data)
      return true
    }
    return false
  }

  public getProjects(): Project[] {
    return this.data.projects
  }

  public getUserProfile(): UserProfile {
    return this.data.userProfile || this.getDefaultUserProfile()
  }

  public updateUserProfile(profile: Partial<UserProfile>): UserProfile {
    this.data.userProfile = { ...this.getUserProfile(), ...profile }
    this.saveData(this.data)
    return this.data.userProfile
  }

  public getUserStats(): UserStats {
    const completedTasks = this.data.tasks.filter((t) => t.status === 'completed')
    const totalFocusMinutes = this.data.tasks.reduce(
      (acc, t) => acc + (t.actual_minutes || t.estimated_minutes || 0),
      0
    )

    const stats = this.data.userStats || this.getDefaultUserStats()
    stats.completed_tasks_count = completedTasks.length
    stats.total_focus_hours = Math.round((totalFocusMinutes / 60) * 10) / 10
    this.data.userStats = stats
    this.saveData(this.data)
    return stats
  }

  public getSettings() {
    return this.data.settings
  }

  public updateSettings(settings: Partial<DatabaseSchema['settings']>) {
    this.data.settings = { ...this.data.settings, ...settings }
    this.saveData(this.data)
    return this.data.settings
  }

  public getAuthData(): NonNullable<DatabaseSchema['auth']> {
    return this.data.auth || {}
  }

  public saveAuthData(authData: { supabaseUrl?: string; supabaseKey?: string; supabaseSession?: any }): boolean {
    this.data.auth = {
      ...(this.data.auth || {}),
      ...authData,
      lastSavedAt: new Date().toISOString(),
    }
    this.saveData(this.data)
    return true
  }

  public clearAuthData(): boolean {
    this.data.auth = undefined
    this.saveData(this.data)
    return true
  }
}

export const db = new StorageDB()
