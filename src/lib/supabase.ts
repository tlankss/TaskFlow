import { createClient, User } from '@supabase/supabase-js'
import { Task, Book, ReadingPlan } from '../types'
import { generateRequestId, API_PROTOCOL_VERSION, sanitizeReadingMeta } from './api'

export * from './api'

// 优化 Fetch 拦截器：按需注入标准协议请求头，并在 401 JWT 过期时自动静默刷新 Token 并重试
async function optimizedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const customHeaders: Record<string, string> = {
    'X-Api-Version': API_PROTOCOL_VERSION,
    'X-Client-Platform': typeof window !== 'undefined' && (window as any).electronAPI ? 'electron-desktop' : 'web',
  }

  const modifiedHeaders = new Headers(init?.headers)
  Object.entries(customHeaders).forEach(([k, v]) => {
    if (!modifiedHeaders.has(k)) {
      modifiedHeaders.set(k, v)
    }
  })

  const modifiedInit: RequestInit = {
    ...init,
    headers: modifiedHeaders,
  }

  try {
    const response = await window.fetch(input, modifiedInit)

    // 针对 401 Unauthorized (JWT 过期) 自动静默尝试续期并无感重试 1 次
    if (response.status === 401 && !((init as any)?._isAuthRetry)) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      // 避免自身 auth 登录接口无限死循环
      if (!url.includes('/auth/v1/token') && !url.includes('/auth/v1/logout')) {
        const client = getSupabaseClient()
        if (client) {
          console.warn('[Supabase 401] 捕获凭据过期，正在尝试静默刷新会话...')
          const { data, error } = await client.auth.refreshSession()
          if (data?.session?.access_token && !error) {
            console.log('[Supabase 401] 会话刷新成功，正在无缝重试原请求...')
            if (typeof window !== 'undefined' && (window as any).electronAPI?.saveAuthData) {
              ;(window as any).electronAPI.saveAuthData({
                supabaseUrl: cachedUrl,
                supabaseKey: cachedKey,
                supabaseSession: data.session,
              }).catch(() => {})
            }
            const retryHeaders = new Headers(modifiedInit.headers)
            retryHeaders.set('Authorization', `Bearer ${data.session.access_token}`)
            return window.fetch(input, {
              ...modifiedInit,
              headers: retryHeaders,
              _isAuthRetry: true,
            } as any)
          }
        }
      }
    }

    return response
  } catch (err) {
    console.error('[Supabase Network Error]', err)
    throw err
  }
}

let cachedClient: any = null
let cachedUrl = ''
let cachedKey = ''

// 内存级 Auth 用户缓存 (60 秒生命周期，杜绝每个 API 调用反复发起网络探测)
let cachedAuthUser: User | null = null
let authUserFetchedAt = 0
const AUTH_CACHE_TTL = 60 * 1000

export function setCachedAuthUser(user: User | null) {
  cachedAuthUser = user
  authUserFetchedAt = Date.now()
}

export function clearCachedAuthUser() {
  cachedAuthUser = null
  authUserFetchedAt = 0
}

export function getSupabaseClient() {
  // 自动从旧版 storage key 迁移已登录会话，防止更新后掉登录
  try {
    if (typeof localStorage !== 'undefined' && !localStorage.getItem('taskflow_auth_token')) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
          const val = localStorage.getItem(k)
          if (val) {
            localStorage.setItem('taskflow_auth_token', val)
            break
          }
        }
      }
    }
  } catch {}

  const url = (typeof localStorage !== 'undefined' ? localStorage.getItem('taskflow_supabase_url') : '') || import.meta.env.VITE_SUPABASE_URL || ''
  const key = (typeof localStorage !== 'undefined' ? localStorage.getItem('taskflow_supabase_key') : '') || import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  if (!url || !key || url.includes('your-project-ref')) {
    return null
  }
  if (cachedClient && cachedUrl === url && cachedKey === key) {
    return cachedClient
  }
  cachedUrl = url
  cachedKey = key
  cachedClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'taskflow_auth_token',
    },
    global: { fetch: optimizedFetch },
  })

  // 监听会话变更，一旦用户登录/登出/续期即时更新内存缓存，并双向备份至 Native 本地文件（防更新丢失）
  cachedClient.auth.onAuthStateChange((event: any, session: any) => {
    cachedAuthUser = session?.user ?? null
    authUserFetchedAt = Date.now()

    if (session) {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.saveAuthData) {
        ;(window as any).electronAPI.saveAuthData({
          supabaseUrl: cachedUrl,
          supabaseKey: cachedKey,
          supabaseSession: session,
        }).catch(() => {})
      }
    } else if (event === 'SIGNED_OUT') {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.clearAuthData) {
        ;(window as any).electronAPI.clearAuthData().catch(() => {})
      }
    }
  })

  return cachedClient
}

export const supabase =
  getSupabaseClient() ||
  createClient(
    'https://placeholder.supabase.co',
    'placeholder',
    { global: { fetch: optimizedFetch } }
  )

/**
 * 跨版本登录态自动对账与恢复引擎：
 * 1. 即使 Mac 更新版本重新安装 / 覆盖 App，也会从 Native 本地文件 (~/Library/Application Support/TaskFlow) 自动恢复 URL、Key 与 Session
 * 2. 自动检查 Token 有效期，提前静默续期，杜绝“经常需要重新登录”
 */
export async function restoreAuthSessionIfAvailable(): Promise<boolean> {
  // 1. 如果在 Electron 环境中，优先从 Native 本地文件恢复 URL, Key 和 Session
  if (typeof window !== 'undefined' && (window as any).electronAPI?.getAuthData) {
    try {
      const authData = await (window as any).electronAPI.getAuthData()
      if (authData) {
        if (authData.supabaseUrl && !localStorage.getItem('taskflow_supabase_url')) {
          localStorage.setItem('taskflow_supabase_url', authData.supabaseUrl)
        }
        if (authData.supabaseKey && !localStorage.getItem('taskflow_supabase_key')) {
          localStorage.setItem('taskflow_supabase_key', authData.supabaseKey)
        }

        const client = getSupabaseClient()
        if (client && authData.supabaseSession) {
          const { data: { session: localSession } } = await client.auth.getSession()
          if (!localSession && authData.supabaseSession.access_token && authData.supabaseSession.refresh_token) {
            console.log('[Auth Restore] 发现新安装/更新版本后丢失网页会话，已成功从 Native 持久化文件中无感恢复登录！')
            await client.auth.setSession({
              access_token: authData.supabaseSession.access_token,
              refresh_token: authData.supabaseSession.refresh_token,
            })
          }
        }
      }
    } catch (e) {
      console.warn('[Auth Restore Warning]', e)
    }
  }

  // 2. 检查会话并执行静默续期
  await ensureFreshSession()
  return true
}

/**
 * 确保当前 Session 处于有效状态，若快过期（或已过期）则静默刷新
 */
export async function ensureFreshSession(): Promise<boolean> {
  const client = getSupabaseClient()
  if (!client) return false

  try {
    const { data: { session } } = await client.auth.getSession()
    if (!session) return false

    const nowSec = Math.floor(Date.now() / 1000)
    // 如果 token 已过期，或将在 5 分钟 (300秒) 内过期，主动执行静默续期
    if (session.expires_at && session.expires_at - nowSec < 300) {
      console.log('[Auth] Token 临近过期或已过期，执行静默刷新...')
      const { data, error } = await client.auth.refreshSession()
      if (data?.session) {
        console.log('[Auth] Token 静默刷新成功！')
        cachedAuthUser = data.session.user
        authUserFetchedAt = Date.now()
        if (typeof window !== 'undefined' && (window as any).electronAPI?.saveAuthData) {
          ;(window as any).electronAPI.saveAuthData({
            supabaseUrl: cachedUrl,
            supabaseKey: cachedKey,
            supabaseSession: data.session,
          }).catch(() => {})
        }
        return true
      }
      if (error) {
        console.warn('[Auth] 静默刷新失败:', error)
      }
    }
    return true
  } catch (e) {
    console.warn('[Auth] ensureFreshSession 出错:', e)
    return false
  }
}

/**
 * 将 Supabase 英文报错转换为地道友好的中文提示
 */
export function formatAuthError(error: any): string {
  if (!error) return '操作失败，请重试'
  const msg = (error.message || error.error_description || String(error)).toLowerCase()

  if (msg.includes('invalid login credentials')) {
    return '登录凭证无效：账号或密码错误，或该账号【尚未通过邮箱验证】（Supabase 默认要求邮箱确认）。'
  }
  if (msg.includes('user already registered') || msg.includes('already exists')) {
    return '该邮箱已被注册，请直接点击“去登录”'
  }
  if (msg.includes('password should be at least')) {
    return '密码强度不足，请至少输入 6 位字符'
  }
  if (msg.includes('invalid api key') || msg.includes('apikey')) {
    return 'Supabase Anon Key 无效，请检查 Project Settings -> API 中的 anon public 密钥'
  }
  if (msg.includes('email not confirmed')) {
    return '该账号尚未通过邮箱激活，请查收邮件或在 Supabase 后台关闭 Confirm email 校验'
  }
  if (msg.includes('unable to validate email') || msg.includes('invalid email')) {
    return '请输入有效的邮箱地址'
  }
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return '网络连接失败，请检查网络或 Supabase Project URL 是否正确'
  }
  if (msg.includes('rate limit')) {
    return '请求过于频繁，请稍后再试'
  }

  return error.message || '操作失败，请稍后重试'
}

/**
 * 用户注册 (邮箱 + 密码)
 */
export async function signUpWithEmail(email: string, password: string, name?: string) {
  const client = getSupabaseClient()
  if (!client) throw new Error('Supabase URL 或 Key 尚未正确配置')

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name || email.split('@')[0],
      },
    },
  })
  if (error) throw error
  if (data?.session && typeof window !== 'undefined' && (window as any).electronAPI?.saveAuthData) {
    ;(window as any).electronAPI.saveAuthData({
      supabaseUrl: cachedUrl,
      supabaseKey: cachedKey,
      supabaseSession: data.session,
    }).catch(() => {})
  }
  return data
}

/**
 * 用户登录 (邮箱 + 密码)
 */
export async function signInWithEmail(email: string, password: string) {
  const client = getSupabaseClient()
  if (!client) throw new Error('Supabase URL 或 Key 尚未正确配置')

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  })
  if (error) throw error
  if (data?.user) {
    setCachedAuthUser(data.user)
  }
  if (data?.session && typeof window !== 'undefined' && (window as any).electronAPI?.saveAuthData) {
    ;(window as any).electronAPI.saveAuthData({
      supabaseUrl: cachedUrl,
      supabaseKey: cachedKey,
      supabaseSession: data.session,
    }).catch(() => {})
  }
  return data
}

/**
 * 退出登录
 */
export async function signOut() {
  clearCachedAuthUser()
  const client = getSupabaseClient()
  if (client) {
    await client.auth.signOut()
  }
  if (typeof window !== 'undefined' && (window as any).electronAPI?.clearAuthData) {
    await (window as any).electronAPI.clearAuthData().catch(() => {})
  }
}

/**
 * 极速获取当前用户 (优先读取客户端内存/本地 Session，0 网络开销)
 */
async function getAuthUser(client: any): Promise<User | null> {
  if (cachedAuthUser && Date.now() - authUserFetchedAt < AUTH_CACHE_TTL) {
    return cachedAuthUser
  }
  try {
    const { data: { session } } = await client.auth.getSession()
    if (session?.user) {
      const nowSec = Math.floor(Date.now() / 1000)
      if (session.expires_at && session.expires_at - nowSec <= 0) {
        const { data: refreshData } = await client.auth.refreshSession()
        if (refreshData?.session?.user) {
          cachedAuthUser = refreshData.session.user
          authUserFetchedAt = Date.now()
          return refreshData.session.user
        }
      }
      setCachedAuthUser(session.user)
      return session.user
    }
    const { data: { user } } = await client.auth.getUser()
    if (user) {
      setCachedAuthUser(user)
    }
    return user
  } catch {
    return null
  }
}

/**
 * 获取当前登录用户 (优先从内存/客户端本地 Session 瞬时读取，杜绝多余 HTTP 请求)
 */
export async function getCurrentUser(): Promise<User | null> {
  if (cachedAuthUser && Date.now() - authUserFetchedAt < AUTH_CACHE_TTL) {
    return cachedAuthUser
  }
  const client = getSupabaseClient()
  if (!client) return null
  return getAuthUser(client)
}

// 远端 Supabase 数据库表结构兼容性状态缓存
let schemaStatus = {
  hasReadingMeta: localStorage.getItem('tf_schema_has_reading_meta') === 'true' 
    ? true 
    : localStorage.getItem('tf_schema_has_reading_meta') === 'false' 
      ? false 
      : (null as boolean | null),
  hasBooksTable: localStorage.getItem('tf_schema_has_books') === 'true'
    ? true
    : localStorage.getItem('tf_schema_has_books') === 'false'
      ? false
      : (null as boolean | null),
  hasReadingPlansTable: localStorage.getItem('tf_schema_has_reading_plans') === 'true'
    ? true
    : localStorage.getItem('tf_schema_has_reading_plans') === 'false'
      ? false
      : (null as boolean | null),
}

export function setSchemaFlag(key: 'hasReadingMeta' | 'hasBooksTable' | 'hasReadingPlansTable', val: boolean) {
  schemaStatus[key] = val
  const storageKeys = {
    hasReadingMeta: 'tf_schema_has_reading_meta',
    hasBooksTable: 'tf_schema_has_books',
    hasReadingPlansTable: 'tf_schema_has_reading_plans',
  }
  localStorage.setItem(storageKeys[key], String(val))
}

export function resetSupabaseSchemaCache() {
  schemaStatus = {
    hasReadingMeta: null,
    hasBooksTable: null,
    hasReadingPlansTable: null,
  }
  localStorage.removeItem('tf_schema_has_reading_meta')
  localStorage.removeItem('tf_schema_has_books')
  localStorage.removeItem('tf_schema_has_reading_plans')
}

export function getSchemaStatus() {
  return { ...schemaStatus }
}

/**
 * 主动检测远端 Supabase 表结构是否已执行阅读模块 SQL 迁移
 */
export async function detectRemoteSchema(): Promise<{
  hasReadingMeta: boolean
  hasBooksTable: boolean
  hasReadingPlansTable: boolean
}> {
  const client = getSupabaseClient()
  if (!client) {
    return { hasReadingMeta: false, hasBooksTable: false, hasReadingPlansTable: false }
  }

  let hasReadingMeta = false
  try {
    const { error } = await client.from('tasks').select('id, reading_meta').limit(1)
    if (!error) {
      hasReadingMeta = true
    } else {
      const msg = error.message || ''
      if (msg.includes('reading_meta') || error.code === 'PGRST204') {
        hasReadingMeta = false
      }
    }
  } catch {
    hasReadingMeta = false
  }

  let hasBooksTable = false
  try {
    const { error } = await client.from('books').select('id').limit(1)
    if (!error) {
      hasBooksTable = true
    } else {
      const msg = (error.message || '').toLowerCase()
      if (msg.includes('does not exist') || error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST200') {
        hasBooksTable = false
      }
    }
  } catch {
    hasBooksTable = false
  }

  let hasReadingPlansTable = false
  try {
    const { error } = await client.from('reading_plans').select('id').limit(1)
    if (!error) {
      hasReadingPlansTable = true
    } else {
      const msg = (error.message || '').toLowerCase()
      if (msg.includes('does not exist') || error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST200') {
        hasReadingPlansTable = false
      }
    }
  } catch {
    hasReadingPlansTable = false
  }

  setSchemaFlag('hasReadingMeta', hasReadingMeta)
  setSchemaFlag('hasBooksTable', hasBooksTable)
  setSchemaFlag('hasReadingPlansTable', hasReadingPlansTable)

  return { hasReadingMeta, hasBooksTable, hasReadingPlansTable }
}

/**
 * -------------------------------------------------------------
 * 大数据量优化与原子化 Supabase 直连 CRUD API
 * -------------------------------------------------------------
 */

// 数组切片分批工具 (避免单次 Payload 超限或触发锁表)
export function chunkArray<T>(items: T[], size: number): T[][] {
  if (!items || items.length === 0) return []
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/**
 * 主动扫描并彻底清理远端 tasks 表中所有误存的巨大 base64 封面数据
 * 将每行体积由 3.5MB 彻底缩减至 200 字节，终结几百 KB 甚至数 MB 的网络带宽与耗时浪费
 */
export async function cleanRemoteTasksBloatedMeta(): Promise<void> {
  // 只执行一次性迁移清理，成功后写入标志，后续绝不再发起任何冗余请求
  if (localStorage.getItem('taskflow_tasks_bloat_cleaned_v2') === 'done') {
    return
  }
  const client = getSupabaseClient()
  if (!client) return
  try {
    const user = await getAuthUser(client)
    if (!user) return

    const { data: dirtyTasks } = await client
      .from('tasks')
      .select('id, reading_meta')
      .eq('user_id', user.id)
      .not('reading_meta', 'is', null)

    if (dirtyTasks && Array.isArray(dirtyTasks)) {
      const needClean = dirtyTasks.filter(
        (t) => t.reading_meta?.cover_url && (t.reading_meta.cover_url.startsWith('data:') || t.reading_meta.cover_url.length > 500)
      )
      if (needClean.length > 0) {
        for (const t of needClean) {
          const clean = sanitizeReadingMeta(t.reading_meta)
          await client.from('tasks').update({ reading_meta: clean }).eq('id', t.id)
        }
        console.log(`[Remote Tasks Auto-Cleaned] 成功批量清理 ${needClean.length} 个任务的超长封面 Base64`)
      }
    }
    localStorage.setItem('taskflow_tasks_bloat_cleaned_v2', 'done')
  } catch (err) {
    console.warn('[cleanRemoteTasksBloatedMeta Warning]', err)
  }
}

// 同一任务连续高频修改防抖合并器 (例如拖拽滑块、连续敲击子任务)
const pendingTaskUpdates = new Map<string, { updates: Partial<Task>; timeout: any }>()

/**
 * 1.1 原子新增单个任务
 */
export async function cloudAddTask(task: Task): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  try {
    const user = await getAuthUser(client)
    if (!user) return

    const now = new Date().toISOString()
    const payload: any = {
      id: task.id,
      user_id: user.id,
      title: task.title,
      notes: task.notes || null,
      priority: task.priority || 'p2',
      project_id: task.project_id || 'work',
      estimated_minutes: task.estimated_minutes || 30,
      actual_minutes: task.actual_minutes || 0,
      due_date: task.due_date || null,
      is_today: task.is_today ?? false,
      status: task.status || 'todo',
      created_at: task.created_at || now,
      updated_at: task.updated_at || now,
      completed_at: task.completed_at || null,
      output_notes: task.output_notes || null,
      subtasks: task.subtasks || [],
      is_deleted: false,
    }

    if (schemaStatus.hasReadingMeta !== false && task.task_type) {
      payload.task_type = task.task_type
      payload.reading_meta = sanitizeReadingMeta(task.reading_meta)
    }

    const { error } = await client.from('tasks').upsert(payload, { onConflict: 'id' })
    if (error) {
      console.error('[Supabase cloudAddTask Error]', error)
    }
  } catch (err) {
    console.error('[Supabase cloudAddTask Network Error]', err)
  }
}

/**
 * 1.2 原子增量更新单个任务 (带防抖合并，只传输变更字段)
 */
export async function cloudUpdateTask(id: string, updates: Partial<Task>): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return

  const existingPending = pendingTaskUpdates.get(id)
  if (existingPending) {
    clearTimeout(existingPending.timeout)
    updates = { ...existingPending.updates, ...updates }
  }

  const timeout = setTimeout(async () => {
    pendingTaskUpdates.delete(id)
    try {
      const user = await getAuthUser(client)
      if (!user) return

      const payload: any = {
        ...updates,
        updated_at: updates.updated_at || new Date().toISOString(),
      }
      if (schemaStatus.hasReadingMeta === false) {
        delete payload.task_type
        delete payload.reading_meta
      } else if (payload.reading_meta) {
        payload.reading_meta = sanitizeReadingMeta(payload.reading_meta)
      }

      const { error } = await client.from('tasks').update(payload).eq('id', id).eq('user_id', user.id)
      if (error) {
        console.error('[Supabase cloudUpdateTask Error]', error)
      }
    } catch (err) {
      console.error('[Supabase cloudUpdateTask Network Error]', err)
    }
  }, 200)

  pendingTaskUpdates.set(id, { updates, timeout })
}

/**
 * 1.3 原子删除单个任务 (软删除标记 is_deleted = true，多端实时同步感知)
 */
export async function cloudDeleteTask(id: string): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return

  const pending = pendingTaskUpdates.get(id)
  if (pending) {
    clearTimeout(pending.timeout)
    pendingTaskUpdates.delete(id)
  }

  try {
    const user = await getAuthUser(client)
    if (!user) return

    const now = new Date().toISOString()
    const { error } = await client
      .from('tasks')
      .update({ is_deleted: true, updated_at: now })
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('[Supabase cloudDeleteTask Error]', error)
    }
  } catch (err) {
    console.error('[Supabase cloudDeleteTask Network Error]', err)
  }
}

/**
 * 1.4 批量新增任务 (分批切片 50 条/批，用于阅读排期等海量生成)
 */
export async function cloudBatchAddTasks(tasks: Task[], chunkSize = 50): Promise<void> {
  const client = getSupabaseClient()
  if (!client || tasks.length === 0) return
  try {
    const user = await getAuthUser(client)
    if (!user) return

    const now = new Date().toISOString()
    const payloads = tasks.map((t) => {
      const p: any = {
        id: t.id,
        user_id: user.id,
        title: t.title,
        notes: t.notes || null,
        priority: t.priority || 'p2',
        project_id: t.project_id || 'work',
        estimated_minutes: t.estimated_minutes || 30,
        actual_minutes: t.actual_minutes || 0,
        due_date: t.due_date || null,
        is_today: t.is_today ?? false,
        status: t.status || 'todo',
        created_at: t.created_at || now,
        updated_at: t.updated_at || now,
        completed_at: t.completed_at || null,
        output_notes: t.output_notes || null,
        subtasks: t.subtasks || [],
        is_deleted: false,
      }
      if (schemaStatus.hasReadingMeta !== false && t.task_type) {
        p.task_type = t.task_type
        p.reading_meta = sanitizeReadingMeta(t.reading_meta)
      }
      return p
    })

    const chunks = chunkArray(payloads, chunkSize)
    for (const chunk of chunks) {
      const { error } = await client.from('tasks').upsert(chunk, { onConflict: 'id' })
      if (error) {
        console.error('[Supabase cloudBatchAddTasks Chunk Error]', error)
      }
    }
  } catch (err) {
    console.error('[Supabase cloudBatchAddTasks Network Error]', err)
  }
}

/**
 * 1.5 批量删除任务 (分批切片软删除)
 */
export async function cloudBatchDeleteTasks(taskIds: string[], chunkSize = 100): Promise<void> {
  const client = getSupabaseClient()
  if (!client || taskIds.length === 0) return

  taskIds.forEach((id) => {
    const pending = pendingTaskUpdates.get(id)
    if (pending) {
      clearTimeout(pending.timeout)
      pendingTaskUpdates.delete(id)
    }
  })

  try {
    const user = await getAuthUser(client)
    if (!user) return

    const now = new Date().toISOString()
    const chunks = chunkArray(taskIds, chunkSize)
    for (const chunk of chunks) {
      const { error } = await client
        .from('tasks')
        .update({ is_deleted: true, updated_at: now })
        .in('id', chunk)
        .eq('user_id', user.id)

      if (error) {
        console.error('[Supabase cloudBatchDeleteTasks Chunk Error]', error)
      }
    }
  } catch (err) {
    console.error('[Supabase cloudBatchDeleteTasks Network Error]', err)
  }
}

/**
 * 2.1 新增书籍
 */
export async function cloudAddBook(book: Book): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  try {
    const user = await getAuthUser(client)
    if (!user) return

    const now = new Date().toISOString()
    const payload: any = {
      id: book.id,
      user_id: user.id,
      title: book.title,
      author: book.author || null,
      total_pages: book.total_pages || 100,
      cover_url: book.cover_url || null,
      isbn: book.isbn || null,
      chapters: book.chapters || [],
      file_name: book.file_name || null,
      file_format: book.file_format || null,
      file_size: book.file_size || null,
      cloud_file_url: book.cloud_file_url || null,
      cloud_synced: book.cloud_synced || false,
      guide: book.guide || null,
      reading_notes: book.reading_notes || null,
      ai_summary: book.ai_summary || null,
      created_at: book.created_at || now,
      updated_at: book.updated_at || now,
    }
    const { error } = await client.from('books').upsert(payload, { onConflict: 'id' })
    if (error) {
      console.error('[Supabase cloudAddBook Error]', error)
    }
  } catch (err) {
    console.error('[Supabase cloudAddBook Network Error]', err)
  }
}

/**
 * 2.1.1 批量新增书籍 (1 次网络请求解决全量上报，杜绝 N+1 循环请求)
 */
export async function cloudBatchAddBooks(books: Book[]): Promise<void> {
  const client = getSupabaseClient()
  if (!client || books.length === 0) return
  try {
    const user = await getAuthUser(client)
    if (!user) return

    const now = new Date().toISOString()
    const payloads = books.map((book) => ({
      id: book.id,
      user_id: user.id,
      title: book.title,
      author: book.author || null,
      total_pages: book.total_pages || 100,
      cover_url: book.cover_url || null,
      isbn: book.isbn || null,
      chapters: book.chapters || [],
      file_name: book.file_name || null,
      file_format: book.file_format || null,
      file_size: book.file_size || null,
      cloud_file_url: book.cloud_file_url || null,
      cloud_synced: book.cloud_synced || false,
      guide: book.guide || null,
      reading_notes: book.reading_notes || null,
      ai_summary: book.ai_summary || null,
      created_at: book.created_at || now,
      updated_at: book.updated_at || now,
    }))

    const { error } = await client.from('books').upsert(payloads, { onConflict: 'id' })
    if (error) {
      console.error('[Supabase cloudBatchAddBooks Error]', error)
    }
  } catch (err) {
    console.error('[Supabase cloudBatchAddBooks Network Error]', err)
  }
}

/**
 * 2.2 更新书籍 (增量 Patch)
 */
export async function cloudUpdateBook(id: string, updates: Partial<Book>): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  try {
    const user = await getAuthUser(client)
    if (!user) return

    const payload: any = {}
    if (updates.title !== undefined) payload.title = updates.title
    if (updates.author !== undefined) payload.author = updates.author
    if (updates.total_pages !== undefined) payload.total_pages = updates.total_pages
    if (updates.cover_url !== undefined) payload.cover_url = updates.cover_url
    if (updates.isbn !== undefined) payload.isbn = updates.isbn
    if (updates.chapters !== undefined) payload.chapters = updates.chapters
    if (updates.file_name !== undefined) payload.file_name = updates.file_name
    if (updates.file_format !== undefined) payload.file_format = updates.file_format
    if (updates.file_size !== undefined) payload.file_size = updates.file_size
    if (updates.cloud_file_url !== undefined) payload.cloud_file_url = updates.cloud_file_url
    if (updates.cloud_synced !== undefined) payload.cloud_synced = updates.cloud_synced
    if (updates.guide !== undefined) payload.guide = updates.guide
    if (updates.reading_notes !== undefined) payload.reading_notes = updates.reading_notes
    if (updates.ai_summary !== undefined) payload.ai_summary = updates.ai_summary
    payload.updated_at = updates.updated_at || new Date().toISOString()

    const { error } = await client.from('books').update(payload).eq('id', id).eq('user_id', user.id)
    if (error) {
      console.error('[Supabase cloudUpdateBook Error]', error)
    }
  } catch (err) {
    console.error('[Supabase cloudUpdateBook Network Error]', err)
  }
}

/**
 * 2.3 彻底删除书籍 (物理删除 + 级联清理 reading_plans 与 Storage 原书文件)
 */
export async function cloudDeleteBook(id: string): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  try {
    const user = await getAuthUser(client)
    if (!user) return

    // 1. 从 books 表真实彻底删除该行记录
    const { error } = await client
      .from('books')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('[Supabase cloudDeleteBook Error]', error)
    }

    // 2. 级联清理可能关联的阅读计划记录
    await client
      .from('reading_plans')
      .delete()
      .eq('book_id', id)
      .eq('user_id', user.id)

    // 3. 联动清理 Storage 云存储桶中可能残留的原书二进制文件
    try {
      const { data: files } = await client.storage.from('books').list(user.id)
      if (files && files.length > 0) {
        const matches = files.filter((f: any) => f.name.startsWith(id))
        if (matches.length > 0) {
          await client.storage.from('books').remove(matches.map((m: any) => `${user.id}/${m.name}`))
        }
      }
    } catch (storageErr) {
      console.warn('[Supabase Storage Clean Warning]', storageErr)
    }
  } catch (err) {
    console.error('[Supabase cloudDeleteBook Network Error]', err)
  }
}

/**
 * 3.1 新增阅读排期计划
 */
export async function cloudAddReadingPlan(plan: ReadingPlan): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  try {
    const user = await getAuthUser(client)
    if (!user) return

    const now = new Date().toISOString()
    const payload: any = {
      id: plan.id,
      user_id: user.id,
      book_id: plan.book_id,
      book_title: plan.book_title,
      status: plan.status || 'active',
      start_date: plan.start_date,
      target_end_date: plan.target_end_date,
      total_pages: plan.total_pages || 100,
      completed_pages: plan.completed_pages || 0,
      daily_minutes: plan.daily_minutes || 25,
      pacing_mode: plan.pacing_mode || 'pages',
      buffer_days_enabled: plan.buffer_days_enabled ?? true,
      schedule: plan.schedule || [],
      reading_notes: plan.reading_notes || null,
      ai_summary: plan.ai_summary || null,
      created_at: plan.created_at || now,
      updated_at: plan.updated_at || now,
    }
    const { error } = await client.from('reading_plans').upsert(payload, { onConflict: 'id' })
    if (error) {
      console.error('[Supabase cloudAddReadingPlan Error]', error)
    }
  } catch (err) {
    console.error('[Supabase cloudAddReadingPlan Network Error]', err)
  }
}

/**
 * 3.1.1 批量新增阅读排期计划 (1 次网络请求解决，杜绝循环请求)
 */
export async function cloudBatchAddReadingPlans(plans: ReadingPlan[]): Promise<void> {
  const client = getSupabaseClient()
  if (!client || plans.length === 0) return
  try {
    const user = await getAuthUser(client)
    if (!user) return

    const now = new Date().toISOString()
    const payloads = plans.map((plan) => ({
      id: plan.id,
      user_id: user.id,
      book_id: plan.book_id,
      book_title: plan.book_title,
      status: plan.status || 'active',
      start_date: plan.start_date,
      target_end_date: plan.target_end_date,
      total_pages: plan.total_pages || 100,
      completed_pages: plan.completed_pages || 0,
      daily_minutes: plan.daily_minutes || 25,
      pacing_mode: plan.pacing_mode || 'pages',
      buffer_days_enabled: plan.buffer_days_enabled ?? true,
      schedule: plan.schedule || [],
      reading_notes: plan.reading_notes || null,
      ai_summary: plan.ai_summary || null,
      created_at: plan.created_at || now,
      updated_at: plan.updated_at || now,
    }))

    const { error } = await client.from('reading_plans').upsert(payloads, { onConflict: 'id' })
    if (error) {
      console.error('[Supabase cloudBatchAddReadingPlans Error]', error)
    }
  } catch (err) {
    console.error('[Supabase cloudBatchAddReadingPlans Network Error]', err)
  }
}

/**
 * 3.2 更新阅读排期计划 (增量 Patch)
 */
export async function cloudUpdateReadingPlan(id: string, updates: Partial<ReadingPlan>): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  try {
    const user = await getAuthUser(client)
    if (!user) return

    const payload: any = {}
    if (updates.book_title !== undefined) payload.book_title = updates.book_title
    if (updates.status !== undefined) payload.status = updates.status
    if (updates.start_date !== undefined) payload.start_date = updates.start_date
    if (updates.target_end_date !== undefined) payload.target_end_date = updates.target_end_date
    if (updates.total_pages !== undefined) payload.total_pages = updates.total_pages
    if (updates.completed_pages !== undefined) payload.completed_pages = updates.completed_pages
    if (updates.daily_minutes !== undefined) payload.daily_minutes = updates.daily_minutes
    if (updates.pacing_mode !== undefined) payload.pacing_mode = updates.pacing_mode
    if (updates.buffer_days_enabled !== undefined) payload.buffer_days_enabled = updates.buffer_days_enabled
    if (updates.schedule !== undefined) payload.schedule = updates.schedule
    if (updates.reading_notes !== undefined) payload.reading_notes = updates.reading_notes
    if (updates.ai_summary !== undefined) payload.ai_summary = updates.ai_summary
    payload.updated_at = updates.updated_at || new Date().toISOString()

    const { error } = await client.from('reading_plans').update(payload).eq('id', id).eq('user_id', user.id)
    if (error) {
      console.error('[Supabase cloudUpdateReadingPlan Error]', error)
    }
  } catch (err) {
    console.error('[Supabase cloudUpdateReadingPlan Network Error]', err)
  }
}

/**
 * 3.3 彻底删除阅读排期计划 (物理删除)
 */
export async function cloudDeleteReadingPlan(id: string): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  try {
    const user = await getAuthUser(client)
    if (!user) return

    const { error } = await client
      .from('reading_plans')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('[Supabase cloudDeleteReadingPlan Error]', error)
    }
  } catch (err) {
    console.error('[Supabase cloudDeleteReadingPlan Network Error]', err)
  }
}

/**
 * 4.1 独立清单同步引擎 (Tasks Delta Sync)
 * 核心待办清单层：仅拉取自 lastSyncTimestamp 以来变更的 tasks，单次网络请求极速完成
 * 严格做到“清单单独查询，不进入 book 不请求多余接口”
 */
export async function cloudPullTasksDelta(lastSyncTimestamp?: string): Promise<{
  upsertedTasks: Task[]
  deletedTaskIds: string[]
  newSyncTimestamp: string
}> {
  const client = getSupabaseClient()
  if (!client) {
    return {
      upsertedTasks: [],
      deletedTaskIds: [],
      newSyncTimestamp: lastSyncTimestamp || new Date().toISOString(),
    }
  }

  const user = await getAuthUser(client)
  if (!user) {
    return {
      upsertedTasks: [],
      deletedTaskIds: [],
      newSyncTimestamp: lastSyncTimestamp || new Date().toISOString(),
    }
  }

  const currentSyncTime = new Date().toISOString()
  let taskQuery = client.from('tasks').select('*').eq('user_id', user.id)
  if (lastSyncTimestamp) {
    taskQuery = taskQuery.gt('updated_at', lastSyncTimestamp)
  }

  const { data: rawTasks, error: taskErr } = await taskQuery
  if (taskErr) console.warn('[Delta Sync Tasks Error]', taskErr)

  const upsertedTasks: Task[] = []
  const deletedTaskIds: string[] = []
  if (rawTasks && Array.isArray(rawTasks)) {
    rawTasks.forEach((row: any) => {
      if (row.is_deleted) {
        deletedTaskIds.push(row.id)
      } else {
        const cleanMeta = sanitizeReadingMeta(row.reading_meta)
        upsertedTasks.push({
          id: row.id,
          title: row.title,
          notes: row.notes || '',
          priority: row.priority || 'p2',
          project_id: row.project_id || 'work',
          estimated_minutes: row.estimated_minutes || 30,
          actual_minutes: row.actual_minutes || 0,
          due_date: row.due_date,
          is_today: row.is_today ?? false,
          status: row.status || 'todo',
          created_at: row.created_at,
          updated_at: row.updated_at,
          completed_at: row.completed_at,
          output_notes: row.output_notes,
          subtasks: row.subtasks || [],
          task_type: row.task_type || 'normal',
          reading_meta: cleanMeta,
        })
      }
    })
  }

  return {
    upsertedTasks,
    deletedTaskIds,
    newSyncTimestamp: currentSyncTime,
  }
}

/**
 * 4.2 独立阅读与书架同步引擎 (Reading & Books Delta Sync)
 * 专用阅读层：仅在用户进入阅读模块（currentView === 'reading'）或打开书籍相关功能时按需调用
 * 未进入阅读视图时绝不请求多余接口
 */
export async function cloudPullReadingDelta(lastSyncTimestamp?: string): Promise<{
  upsertedBooks: Book[]
  deletedBookIds: string[]
  allActiveBookIds?: string[]
  upsertedPlans: ReadingPlan[]
  deletedPlanIds: string[]
  allActivePlanIds?: string[]
  newSyncTimestamp: string
}> {
  const client = getSupabaseClient()
  if (!client) {
    return {
      upsertedBooks: [],
      deletedBookIds: [],
      upsertedPlans: [],
      deletedPlanIds: [],
      newSyncTimestamp: lastSyncTimestamp || new Date().toISOString(),
    }
  }

  const user = await getAuthUser(client)
  if (!user) {
    return {
      upsertedBooks: [],
      deletedBookIds: [],
      upsertedPlans: [],
      deletedPlanIds: [],
      newSyncTimestamp: lastSyncTimestamp || new Date().toISOString(),
    }
  }

  const currentSyncTime = new Date().toISOString()

  let bookQuery = client.from('books').select('*').eq('user_id', user.id)
  if (lastSyncTimestamp) {
    bookQuery = bookQuery.gt('updated_at', lastSyncTimestamp)
  }

  let planQuery = client.from('reading_plans').select('*').eq('user_id', user.id)
  if (lastSyncTimestamp) {
    planQuery = planQuery.gt('updated_at', lastSyncTimestamp)
  }

  // 优化：仅查询 books 和 reading_plans 数据表本身，彻底剔除冗余的 select('id') 接口
  const [
    { data: rawBooks, error: bookErr },
    { data: rawPlans, error: planErr },
  ] = await Promise.all([
    bookQuery,
    planQuery,
  ])

  if (bookErr) console.warn('[Delta Sync Books Error]', bookErr)
  if (planErr) console.warn('[Delta Sync Plans Error]', planErr)

  const upsertedBooks: Book[] = []
  const deletedBookIds: string[] = []
  if (rawBooks && Array.isArray(rawBooks)) {
    rawBooks.forEach((row: any) => {
      if (row.is_deleted) {
        deletedBookIds.push(row.id)
      } else {
        upsertedBooks.push(row)
      }
    })
  }

  const upsertedPlans: ReadingPlan[] = []
  const deletedPlanIds: string[] = []
  if (rawPlans && Array.isArray(rawPlans)) {
    rawPlans.forEach((row: any) => {
      if (row.is_deleted) {
        deletedPlanIds.push(row.id)
      } else {
        upsertedPlans.push(row)
      }
    })
  }

  // 若为无时间戳全量拉取，直接复用已拉取到的记录集合提取 active ID，0 次额外 HTTP 请求
  const allActiveBookIds = !lastSyncTimestamp && rawBooks ? rawBooks.map((r: any) => r.id) : undefined
  const allActivePlanIds = !lastSyncTimestamp && rawPlans ? rawPlans.map((r: any) => r.id) : undefined

  return {
    upsertedBooks,
    deletedBookIds,
    allActiveBookIds,
    upsertedPlans,
    deletedPlanIds,
    allActivePlanIds,
    newSyncTimestamp: currentSyncTime,
  }
}

/**
 * 4.3 全量增量拉取引擎 (复合 Delta Sync) —— 兼容手动全局同步
 */
export async function cloudPullDelta(lastSyncTimestamp?: string): Promise<{
  upsertedTasks: Task[]
  deletedTaskIds: string[]
  upsertedBooks: Book[]
  deletedBookIds: string[]
  allActiveBookIds?: string[]
  upsertedPlans: ReadingPlan[]
  deletedPlanIds: string[]
  allActivePlanIds?: string[]
  newSyncTimestamp: string
}> {
  const [tasksDelta, readingDelta] = await Promise.all([
    cloudPullTasksDelta(lastSyncTimestamp),
    cloudPullReadingDelta(lastSyncTimestamp),
  ])

  return {
    ...tasksDelta,
    ...readingDelta,
    newSyncTimestamp: tasksDelta.newSyncTimestamp,
  }
}

/**
 * 双向数据同步引擎 (Local-First 双向合并)
 * 1. 把本地已有任务增量 Push 给 Supabase
 * 2. 把云端新增/已有的任务 Pull 回本地
 */
export async function syncTasksWithCloud(localTasks: Task[]): Promise<{ mergedTasks: Task[]; pushedCount: number }> {
  const client = getSupabaseClient()
  if (!client) throw new Error('Supabase 未正确配置，无法连接云端')

  const user = await getAuthUser(client)
  if (!user) throw new Error('用户未登录，请先登录账号')

  const canSendReadingMeta = schemaStatus.hasReadingMeta !== false

  const formatTaskPayload = (t: Task, includeReading: boolean) => {
    const base: any = {
      id: t.id,
      user_id: user.id,
      title: t.title,
      notes: t.notes || null,
      priority: t.priority,
      project_id: t.project_id || 'work',
      estimated_minutes: t.estimated_minutes || 30,
      actual_minutes: t.actual_minutes || 0,
      due_date: t.due_date || null,
      is_today: t.is_today ?? false,
      status: t.status || 'todo',
      created_at: t.created_at || new Date().toISOString(),
      completed_at: t.completed_at || null,
    }
    if (includeReading) {
      base.task_type = t.task_type || 'normal'
      base.reading_meta = sanitizeReadingMeta(t.reading_meta)
    }
    return base
  }

  const tasksToUpload = localTasks.map((t) => formatTaskPayload(t, canSendReadingMeta))

  if (tasksToUpload.length > 0) {
    const { error: pushError } = await client.from('tasks').upsert(tasksToUpload, { onConflict: 'id' })
    if (pushError) {
      const msg = pushError.message || ''
      if (canSendReadingMeta && (msg.includes('reading_meta') || pushError.code === 'PGRST204')) {
        setSchemaFlag('hasReadingMeta', false)
        console.warn('[TaskFlow Sync] 远端 tasks 尚未添加 reading_meta 字段，自动使用兼容模式推送')
        const fallbackUpload = localTasks.map((t) => formatTaskPayload(t, false))
        const { error: fallbackErr } = await client.from('tasks').upsert(fallbackUpload, { onConflict: 'id' })
        if (fallbackErr) {
          throw new Error(`云端上传失败: ${fallbackErr.message}`)
        }
      } else {
        throw new Error(`云端上传失败: ${pushError.message}`)
      }
    } else if (canSendReadingMeta && schemaStatus.hasReadingMeta === null) {
      setSchemaFlag('hasReadingMeta', true)
    }
  }

  // 2. 从云端拉取最新全量任务
  const { data: cloudTasks, error: pullError } = await client
    .from('tasks')
    .select('*')
    .eq('user_id', user.id)

  if (pullError) {
    console.error('Pull from cloud error:', pullError)
    throw new Error(`云端拉取失败: ${pullError.message}`)
  }

  // 3. 本地与云端合并 (以最后更新为准，同时保护本地阅读属性)
  const taskMap = new Map<string, Task>()
  localTasks.forEach((t) => taskMap.set(t.id, t))

  if (cloudTasks) {
    cloudTasks.forEach((ct: any) => {
      const existing = taskMap.get(ct.id)
      taskMap.set(ct.id, {
        id: ct.id,
        title: ct.title,
        notes: ct.notes || undefined,
        priority: ct.priority,
        project_id: ct.project_id,
        estimated_minutes: ct.estimated_minutes,
        actual_minutes: ct.actual_minutes,
        due_date: ct.due_date,
        is_today: ct.is_today,
        status: ct.status,
        created_at: ct.created_at,
        completed_at: ct.completed_at || undefined,
        task_type: ct.task_type || existing?.task_type || 'normal',
        reading_meta: ct.reading_meta || existing?.reading_meta || undefined,
      })
    })
  }

  return {
    mergedTasks: Array.from(taskMap.values()),
    pushedCount: tasksToUpload.length,
  }
}

/**
 * 书架书籍双向云端同步
 */
export async function syncBooksWithCloud(localBooks: Book[]): Promise<Book[]> {
  const client = getSupabaseClient()
  if (!client) return localBooks

  if (schemaStatus.hasBooksTable === false) {
    return localBooks
  }

  const user = await getAuthUser(client)
  if (!user) return localBooks

  // 1. 推送本地书籍到云端
  if (localBooks.length > 0) {
    const booksToUpload = localBooks.map((b) => ({
      id: b.id,
      user_id: user.id,
      title: b.title,
      author: b.author || null,
      total_pages: b.total_pages || 0,
      cover_url: b.cover_url || null,
      isbn: b.isbn || null,
      chapters: b.chapters || [],
      file_name: b.file_name || null,
      file_format: b.file_format || null,
      file_size: b.file_size || null,
      cloud_file_url: b.cloud_file_url || null,
      cloud_synced: b.cloud_synced ?? false,
      guide: b.guide || null,
      reading_notes: b.reading_notes || null,
      ai_summary: b.ai_summary || null,
      created_at: b.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))

    const { error } = await client.from('books').upsert(booksToUpload, { onConflict: 'id' })
    if (error) {
      const msg = (error.message || '').toLowerCase()
      if (msg.includes('does not exist') || error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST200') {
        setSchemaFlag('hasBooksTable', false)
        console.warn('[TaskFlow Sync] 远端数据库未创建 books 表，已跳过书籍云端推送，本地书籍不受影响')
        return localBooks
      }
      const fallbackUpload = booksToUpload.map(({ file_name, file_format, file_size, ...rest }) => rest)
      await client.from('books').upsert(fallbackUpload, { onConflict: 'id' }).catch(() => {})
    } else {
      if (schemaStatus.hasBooksTable === null) setSchemaFlag('hasBooksTable', true)
    }
  }

  // 2. 拉取云端书籍
  const { data: cloudBooks, error: pullErr } = await client.from('books').select('*').eq('user_id', user.id)
  if (pullErr) {
    const msg = (pullErr.message || '').toLowerCase()
    if (msg.includes('does not exist') || pullErr.code === '42P01' || pullErr.code === 'PGRST205' || pullErr.code === 'PGRST200') {
      setSchemaFlag('hasBooksTable', false)
    }
    return localBooks
  }

  if (schemaStatus.hasBooksTable === null) setSchemaFlag('hasBooksTable', true)

  const bookMap = new Map<string, Book>()
  localBooks.forEach((b) => bookMap.set(b.id, b))
  if (cloudBooks) {
    cloudBooks.forEach((cb: any) => {
      const local = bookMap.get(cb.id)
      bookMap.set(cb.id, {
        id: cb.id,
        user_id: cb.user_id,
        title: cb.title,
        author: cb.author || undefined,
        total_pages: cb.total_pages,
        cover_url: cb.cover_url || undefined,
        isbn: cb.isbn || undefined,
        chapters: cb.chapters || [],
        file_name: cb.file_name || undefined,
        file_format: cb.file_format || undefined,
        file_size: cb.file_size || undefined,
        cloud_file_url: cb.cloud_file_url || local?.cloud_file_url || undefined,
        cloud_synced: cb.cloud_synced ?? local?.cloud_synced ?? false,
        guide: cb.guide || local?.guide || undefined,
        reading_notes: cb.reading_notes || local?.reading_notes || undefined,
        ai_summary: cb.ai_summary || local?.ai_summary || undefined,
        created_at: cb.created_at,
        updated_at: cb.updated_at,
      })
    })
  }

  return Array.from(bookMap.values())
}

/**
 * 上传书籍原始文件至 Supabase Storage 云端书库
 */
export async function uploadBookFileToStorage(
  file: File | Blob,
  fileName: string,
  bookId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  const client = getSupabaseClient()
  if (!client) {
    return { success: false, error: 'Supabase 尚未配置，请在个人设置中配置 Project URL 与 Key' }
  }

  const user = await getAuthUser(client)
  if (!user) {
    return { success: false, error: '用户未登录云端账号，请先登录' }
  }

  try {
    // 提取纯净后缀名，规避特殊字符、中文字符与过长文件名在 S3 Key 中的限制
    const extMatch = (fileName || '').match(/\.([a-zA-Z0-9]+)$/)
    const rawExt = extMatch ? extMatch[1].toLowerCase() : ''
    const safeExt = ['epub', 'pdf', 'txt', 'md', 'mobi', 'azw3'].includes(rawExt) ? rawExt : 'epub'
    const filePath = `${user.id}/${bookId}.${safeExt}`

    const mimeTypes: Record<string, string> = {
      epub: 'application/epub+zip',
      pdf: 'application/pdf',
      txt: 'text/plain',
      md: 'text/markdown',
      mobi: 'application/x-mobipocket-ebook',
      azw3: 'application/vnd.amazon.ebook',
    }
    const contentType = (file as any).type || mimeTypes[safeExt] || 'application/octet-stream'

    // 尝试直接上传
    let { data, error } = await client.storage
      .from('books')
      .upload(filePath, file, {
        upsert: true,
        contentType,
      })

    // 若触发 RLS 策略或重名冲突限制（例如远端尚未配置 UPDATE 权限时），先移除旧文件再写入
    if (error && (
      error.message?.includes('row-level security') ||
      error.message?.includes('AccessDenied') ||
      error.message?.includes('policy') ||
      error.message?.includes('Duplicate') ||
      error.message?.includes('already exists') ||
      (error as any).statusCode === '403' ||
      (error as any).statusCode === 403
    )) {
      try {
        await client.storage.from('books').remove([filePath])
        const retry = await client.storage
          .from('books')
          .upload(filePath, file, {
            upsert: false,
            contentType,
          })
        if (!retry.error) {
          error = null
          data = retry.data
        } else {
          error = retry.error
        }
      } catch {}
    }

    // 若提示存储桶不存在，尝试自动创建 books 公开存储桶并重试
    if (error && (error.message?.includes('bucket not found') || error.message?.includes('not found') || error.message?.includes('NoSuchBucket'))) {
      try {
        await client.storage.createBucket('books', { public: true })
        const retry = await client.storage
          .from('books')
          .upload(filePath, file, {
            upsert: true,
            contentType,
          })
        if (!retry.error) {
          error = null
          data = retry.data
        } else {
          error = retry.error
        }
      } catch {}
    }

    if (error) {
      if (error.message?.includes('bucket not found') || error.message?.includes('not found') || error.message?.includes('NoSuchBucket')) {
        return {
          success: false,
          error: '云端存储桶 "books" 尚未创建。请在 Supabase 控制台 Storage 中新建名为 "books" 的公开 Bucket。',
        }
      }
      return { success: false, error: error.message }
    }

    // 获取公开访问链接；若有权限限制，额外生成有效签名链接
    let finalUrl = filePath
    const { data: publicUrlData } = client.storage.from('books').getPublicUrl(filePath)
    if (publicUrlData?.publicUrl) {
      finalUrl = publicUrlData.publicUrl
    }

    return { success: true, url: finalUrl }
  } catch (err: any) {
    return { success: false, error: err.message || '上传云端书库异常' }
  }
}

/**
 * 将 Base64 图片在客户端浏览器中压缩，控制最大尺寸与画质，转化为轻量 Blob
 */
export async function compressBase64Image(dataUrl: string, maxWidth = 600, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!dataUrl.startsWith('data:image')) {
      fetch(dataUrl)
        .then((r) => r.blob())
        .then(resolve)
        .catch(reject)
      return
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      let width = img.width
      let height = img.height
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        fetch(dataUrl).then((r) => r.blob()).then(resolve).catch(reject)
        return
      }

      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            fetch(dataUrl).then((r) => r.blob()).then(resolve).catch(reject)
          }
        },
        'image/jpeg',
        quality
      )
    }
    img.onerror = (e) => reject(e)
    img.src = dataUrl
  })
}

/**
 * 将书籍封面图片 (支持 Base64 Data URL 或 Blob) 上传到 Supabase Storage "books" 存储桶，
 * 生成独立的静态资源访问 URL，彻底告别在数据库表中直接存储几兆大小的 Base64 字符串
 */
export async function uploadBookCoverToStorage(
  bookId: string,
  coverDataUrl: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (coverDataUrl.startsWith('http://') || coverDataUrl.startsWith('https://')) {
    return { success: true, url: coverDataUrl }
  }

  const client = getSupabaseClient()
  if (!client) {
    return { success: false, error: 'Supabase 未配置' }
  }

  try {
    const user = await getAuthUser(client)
    if (!user) {
      return { success: false, error: '用户未登录' }
    }

    const blob = await compressBase64Image(coverDataUrl, 600, 0.82)
    const filePath = `${user.id}/covers/${bookId}.jpg`

    let { error } = await client.storage
      .from('books')
      .upload(filePath, blob, {
        upsert: true,
        contentType: 'image/jpeg',
      })

    if (error && (
      error.message?.includes('Duplicate') ||
      error.message?.includes('policy') ||
      error.message?.includes('already exists') ||
      (error as any).statusCode === 403 ||
      (error as any).statusCode === '403'
    )) {
      try {
        await client.storage.from('books').remove([filePath])
        const retry = await client.storage.from('books').upload(filePath, blob, {
          upsert: false,
          contentType: 'image/jpeg',
        })
        if (!retry.error) error = null
      } catch {}
    }

    if (error && (error.message?.includes('bucket not found') || error.message?.includes('not found') || error.message?.includes('NoSuchBucket'))) {
      try {
        await client.storage.createBucket('books', { public: true })
        const retry = await client.storage.from('books').upload(filePath, blob, {
          upsert: true,
          contentType: 'image/jpeg',
        })
        if (!retry.error) error = null
      } catch {}
    }

    if (error) {
      console.warn('[uploadBookCoverToStorage Error]', error)
      return { success: false, error: error.message }
    }

    const { data: publicData } = client.storage.from('books').getPublicUrl(filePath)
    const publicUrl = publicData?.publicUrl || filePath

    return { success: true, url: publicUrl }
  } catch (err: any) {
    console.warn('[uploadBookCoverToStorage Exception]', err)
    return { success: false, error: err.message || '上传封面异常' }
  }
}

/**
 * 自动扫描并迁移现有 books 表中存储的 Base64 封面至 Storage 独立静态资源文件
 */
export async function cleanRemoteBooksBloatedCovers(): Promise<void> {
  // 只执行一次性迁移，成功后写入标志，后续绝不再发起任何冗余请求
  if (localStorage.getItem('taskflow_books_cover_migrated_v2') === 'done') {
    return
  }
  const client = getSupabaseClient()
  if (!client) return
  try {
    const user = await getAuthUser(client)
    if (!user) return

    const { data: booksWithBase64 } = await client
      .from('books')
      .select('id, cover_url')
      .eq('user_id', user.id)
      .like('cover_url', 'data:image%')

    if (booksWithBase64 && Array.isArray(booksWithBase64) && booksWithBase64.length > 0) {
      for (const b of booksWithBase64) {
        if (b.cover_url && b.cover_url.startsWith('data:image')) {
          const res = await uploadBookCoverToStorage(b.id, b.cover_url)
          if (res.success && res.url) {
            await client.from('books').update({ cover_url: res.url }).eq('id', b.id)
            console.log(`[Books Cover Migrated] 成功将书籍 ID: ${b.id} 封面转存为独立静态资源: ${res.url}`)
          }
        }
      }
    }
    localStorage.setItem('taskflow_books_cover_migrated_v2', 'done')
  } catch (err) {
    console.warn('[cleanRemoteBooksBloatedCovers Warning]', err)
  }
}

/**
 * 从 Supabase Storage 云端书库拉取书籍原始文件
 */
export async function downloadBookFileFromStorage(book: Book): Promise<ArrayBuffer | null> {
  const client = getSupabaseClient()

  // 1. 若已有完整 http/https 链接，优先直接 fetch
  if (book.cloud_file_url && book.cloud_file_url.startsWith('http')) {
    try {
      const resp = await fetch(book.cloud_file_url)
      if (resp.ok) {
        return await resp.arrayBuffer()
      }
    } catch (e) {
      console.warn('[Supabase Storage] 直接 fetch 远程书本失败，尝试通过 storage client 下载:', e)
    }
  }

  // 2. 尝试通过 Supabase Storage client 下载
  if (client) {
    try {
      let filePath = ''
      if (book.cloud_file_url) {
        if (book.cloud_file_url.includes('/books/')) {
          filePath = decodeURIComponent(book.cloud_file_url.split('/books/')[1]?.split('?')[0] || '')
        } else if (!book.cloud_file_url.startsWith('http')) {
          filePath = book.cloud_file_url
        }
      }

      if (!filePath) {
        const user = await getAuthUser(client)
        if (user) {
          const extMatch = (book.file_name || '').match(/\.([a-zA-Z0-9]+)$/)
          const ext = extMatch ? extMatch[1].toLowerCase() : (book.file_format || 'epub')
          const safeExt = ['epub', 'pdf', 'txt', 'md', 'mobi', 'azw3'].includes(ext) ? ext : 'epub'
          filePath = `${user.id}/${book.id}.${safeExt}`
        }
      }

      if (filePath) {
        let { data: fileBlob, error: dlErr } = await client.storage.from('books').download(filePath)

        // 兼容旧版带原书名的路径命名
        if (dlErr && book.file_name) {
          const cleanFileName = book.file_name.replace(/[^a-zA-Z0-9._-]/g, '_')
          const legacyPath = `${(await getAuthUser(client))?.id}/${book.id}_${cleanFileName}`
          const legacyRes = await client.storage.from('books').download(legacyPath)
          if (!legacyRes.error && legacyRes.data) {
            fileBlob = legacyRes.data
            dlErr = null
          }
        }

        if (!dlErr && fileBlob) {
          return await fileBlob.arrayBuffer()
        }
      }
    } catch (err) {
      console.warn('[Supabase Storage] downloadBookFileFromStorage 失败:', err)
    }
  }

  return null
}

/**
 * 阅读计划双向云端同步
 */
export async function syncReadingPlansWithCloud(localPlans: ReadingPlan[]): Promise<ReadingPlan[]> {
  const client = getSupabaseClient()
  if (!client) return localPlans

  if (schemaStatus.hasReadingPlansTable === false) {
    return localPlans
  }

  const user = await getAuthUser(client)
  if (!user) return localPlans

  // 1. 推送本地阅读计划
  if (localPlans.length > 0) {
    const plansToUpload = localPlans.map((p) => ({
      id: p.id,
      user_id: user.id,
      book_id: p.book_id,
      book_title: p.book_title,
      status: p.status || 'active',
      start_date: p.start_date,
      target_end_date: p.target_end_date,
      total_pages: p.total_pages,
      completed_pages: p.completed_pages || 0,
      daily_minutes: p.daily_minutes || 25,
      pacing_mode: p.pacing_mode || 'pages',
      buffer_days_enabled: p.buffer_days_enabled ?? true,
      schedule: p.schedule || [],
      reading_notes: p.reading_notes || null,
      ai_summary: p.ai_summary || null,
      created_at: p.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))

    const { error } = await client.from('reading_plans').upsert(plansToUpload, { onConflict: 'id' })
    if (error) {
      const msg = (error.message || '').toLowerCase()
      if (msg.includes('does not exist') || error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST200') {
        setSchemaFlag('hasReadingPlansTable', false)
        console.warn('[TaskFlow Sync] 远端数据库未创建 reading_plans 表，已跳过计划云端推送，本地数据不受影响')
        return localPlans
      }
    } else {
      if (schemaStatus.hasReadingPlansTable === null) setSchemaFlag('hasReadingPlansTable', true)
    }
  }

  // 2. 从云端拉取阅读计划
  const { data: cloudPlans, error: pullErr } = await client
    .from('reading_plans')
    .select('*')
    .eq('user_id', user.id)

  if (pullErr) {
    const msg = (pullErr.message || '').toLowerCase()
    if (msg.includes('does not exist') || pullErr.code === '42P01' || pullErr.code === 'PGRST205' || pullErr.code === 'PGRST200') {
      setSchemaFlag('hasReadingPlansTable', false)
    }
    return localPlans
  }

  if (schemaStatus.hasReadingPlansTable === null) setSchemaFlag('hasReadingPlansTable', true)

  const planMap = new Map<string, ReadingPlan>()
  localPlans.forEach((p) => planMap.set(p.id, p))
  if (cloudPlans) {
    cloudPlans.forEach((cp: any) => {
      const local = planMap.get(cp.id)
      planMap.set(cp.id, {
        id: cp.id,
        user_id: cp.user_id,
        book_id: cp.book_id,
        book_title: cp.book_title,
        status: cp.status,
        start_date: cp.start_date,
        target_end_date: cp.target_end_date,
        total_pages: cp.total_pages,
        completed_pages: cp.completed_pages,
        daily_minutes: cp.daily_minutes,
        pacing_mode: cp.pacing_mode,
        buffer_days_enabled: cp.buffer_days_enabled,
        schedule: cp.schedule || [],
        reading_notes: cp.reading_notes || local?.reading_notes || undefined,
        ai_summary: cp.ai_summary || local?.ai_summary || undefined,
        created_at: cp.created_at,
        updated_at: cp.updated_at,
      })
    })
  }

  return Array.from(planMap.values())
}

/**
 * 阅读模块云端数据表迁移 SQL 脚本
 */
export const READING_FEATURE_MIGRATION_SQL = `-- ==========================================
-- TaskFlow 阅读规划与云端书库数据表迁移 SQL
-- 复制并在 Supabase SQL Editor 中点击 Run 执行
-- ==========================================

-- 1. 为现有 tasks 表扩展阅读任务关联字段
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS task_type text DEFAULT 'normal',
ADD COLUMN IF NOT EXISTS reading_meta jsonb;

-- 2. 创建书籍表 books (支持云端书库与 AI 导读笔记)
CREATE TABLE IF NOT EXISTS books (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  author text,
  total_pages integer NOT NULL DEFAULT 100,
  cover_url text,
  isbn text,
  chapters jsonb DEFAULT '[]'::jsonb,
  file_name text,
  file_format text,
  file_size bigint,
  cloud_file_url text,
  cloud_synced boolean DEFAULT false,
  guide jsonb,
  reading_notes text,
  ai_summary text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 若此前已创建 books 表，补充新增字段
ALTER TABLE books
ADD COLUMN IF NOT EXISTS file_name text,
ADD COLUMN IF NOT EXISTS file_format text,
ADD COLUMN IF NOT EXISTS file_size bigint,
ADD COLUMN IF NOT EXISTS cloud_file_url text,
ADD COLUMN IF NOT EXISTS cloud_synced boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS guide jsonb,
ADD COLUMN IF NOT EXISTS reading_notes text,
ADD COLUMN IF NOT EXISTS ai_summary text;

-- 3. 创建阅读计划表 reading_plans
CREATE TABLE IF NOT EXISTS reading_plans (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id text REFERENCES books(id) ON DELETE CASCADE,
  book_title text NOT NULL,
  status text DEFAULT 'active',
  start_date text NOT NULL,
  target_end_date text NOT NULL,
  total_pages integer NOT NULL DEFAULT 100,
  completed_pages integer DEFAULT 0,
  daily_minutes integer DEFAULT 25,
  pacing_mode text DEFAULT 'pages',
  buffer_days_enabled boolean DEFAULT true,
  schedule jsonb DEFAULT '[]'::jsonb,
  reading_notes text,
  ai_summary text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 若此前已创建 reading_plans 表，补充新增字段
ALTER TABLE reading_plans
ADD COLUMN IF NOT EXISTS reading_notes text,
ADD COLUMN IF NOT EXISTS ai_summary text;

-- 4. 开启行级安全策略 (Row Level Security)
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_plans ENABLE ROW LEVEL SECURITY;

-- 5. 安全创建数据表行级访问策略
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'books' AND policyname = 'Users can manage their own books') THEN
    CREATE POLICY "Users can manage their own books" ON books FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reading_plans' AND policyname = 'Users can manage their own reading plans') THEN
    CREATE POLICY "Users can manage their own reading plans" ON reading_plans FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 6. 创建云端书库 Storage 存储桶并配置安全访问权限
INSERT INTO storage.buckets (id, name, public)
VALUES ('books', 'books', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Allow authenticated users to upload books') THEN
    CREATE POLICY "Allow authenticated users to upload books" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'books');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Allow authenticated users to update books') THEN
    CREATE POLICY "Allow authenticated users to update books" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'books') WITH CHECK (bucket_id = 'books');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Allow authenticated users to view books') THEN
    CREATE POLICY "Allow authenticated users to view books" ON storage.objects
    FOR SELECT TO authenticated USING (bucket_id = 'books');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Allow authenticated users to delete books') THEN
    CREATE POLICY "Allow authenticated users to delete books" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'books');
  END IF;
END $$;
`
