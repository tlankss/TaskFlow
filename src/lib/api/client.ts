/**
 * TaskFlow 企业级 RESTful API 服务资源客户端
 * 
 * 遵循协议规范：
 * - REST 架构风格：标准 URI 命名与 HTTP 动词语义映射
 * - 统一信封模型：ApiResponse<T>
 * - 行级安全隔离：所有操作绑定当前登录用户的 auth.uid()
 * - 幂等与容错：自动重试与软/硬删除对账
 */

import { Task, Book, ReadingPlan } from '../../types'
import {
  ApiResponse,
  ApiErrorCode,
  PaginationParams,
  PaginationResult,
  TasksDeltaResponse,
  ReadingDeltaResponse,
  sanitizeReadingMeta,
} from './types'
import { apiSuccess, apiError, handleSupabaseError, generateRequestId } from './response'
import { getSupabaseClient, getCurrentUser } from '../supabase'

/**
 * 校验有效用户会话
 */
async function requireAuthUser(client: any, requestId: string) {
  const user = await getCurrentUser()
  if (!user) {
    return {
      user: null,
      errorResponse: apiError(
        ApiErrorCode.UNAUTHORIZED,
        '用户未登录云端账号，请先登录',
        null,
        '请在个人中心登录您的 Supabase 账号',
        requestId
      ),
    }
  }
  return { user, errorResponse: null }
}

// ==========================================
// 1. 任务清单 REST API 服务 (/v1/tasks)
// ==========================================
export const tasksApi = {
  /**
   * [GET /v1/tasks] 获取任务列表 (支持分页、状态过滤与关键词搜索)
   */
  async list(
    params: PaginationParams & { status?: string; projectId?: string; keyword?: string } = {}
  ): Promise<ApiResponse<PaginationResult<Task>>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) {
      return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)
    }

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!

    const page = Math.max(1, params.page || 1)
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    const sortBy = params.sortBy || 'created_at'
    const sortAscending = params.sortOrder === 'asc'

    try {
      let query = client
        .from('tasks')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .order(sortBy, { ascending: sortAscending })
        .range(from, to)

      if (params.status) {
        query = query.eq('status', params.status)
      }
      if (params.projectId) {
        query = query.eq('project_id', params.projectId)
      }
      if (params.keyword?.trim()) {
        query = query.ilike('title', `%${params.keyword.trim()}%`)
      }

      const { data, count, error } = await query
      if (error) return handleSupabaseError(error, '获取任务列表失败', requestId)

      const total = count || 0
      const totalPages = Math.ceil(total / pageSize)

      return apiSuccess<PaginationResult<Task>>(
        {
          items: data || [],
          total,
          page,
          pageSize,
          totalPages,
          hasNext: page < totalPages,
        },
        '获取任务列表成功',
        requestId
      )
    } catch (err) {
      return handleSupabaseError(err, '获取任务列表网络异常', requestId)
    }
  },

  /**
   * [GET /v1/tasks/:id] 获取单条任务详情
   */
  async get(id: string): Promise<ApiResponse<Task>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!

    try {
      const { data, error } = await client
        .from('tasks')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return apiError(ApiErrorCode.TASK_NOT_FOUND, `未找到 ID 为 ${id} 的任务`, error, undefined, requestId)
        }
        return handleSupabaseError(error, '获取任务详情失败', requestId)
      }
      return apiSuccess<Task>(data, '获取任务成功', requestId)
    } catch (err) {
      return handleSupabaseError(err, '获取任务详情异常', requestId)
    }
  },

  /**
   * [POST /v1/tasks] 创建单个任务
   */
  async create(task: Task): Promise<ApiResponse<Task>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!

    if (!task.title?.trim()) {
      return apiError(ApiErrorCode.VALIDATION_FAILED, '任务标题不能为空', { field: 'title' }, undefined, requestId)
    }

    try {
      const now = new Date().toISOString()
      const row = {
        ...task,
        reading_meta: sanitizeReadingMeta(task.reading_meta),
        user_id: user.id,
        is_deleted: false,
        created_at: task.created_at || now,
        updated_at: now,
      }
      const { data, error } = await client.from('tasks').upsert(row).select().single()
      if (error) return handleSupabaseError(error, '创建任务失败', requestId)
      return apiSuccess<Task>(data || row, '任务创建成功', requestId)
    } catch (err) {
      return handleSupabaseError(err, '创建任务异常', requestId)
    }
  },

  /**
   * [POST /v1/tasks/batch] 批量创建或全量写入任务
   */
  async batchCreate(tasks: Task[], chunkSize = 50): Promise<ApiResponse<{ insertedCount: number }>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!
    if (!tasks || tasks.length === 0) return apiSuccess({ insertedCount: 0 }, '无任务需导入', requestId)

    try {
      const now = new Date().toISOString()
      const rows = tasks.map((t) => ({
        ...t,
        reading_meta: sanitizeReadingMeta(t.reading_meta),
        user_id: user.id,
        is_deleted: false,
        created_at: t.created_at || now,
        updated_at: t.updated_at || now,
      }))

      for (let i = 0; i < rows.length; i += chunkSize) {
        const slice = rows.slice(i, i + chunkSize)
        const { error } = await client.from('tasks').upsert(slice)
        if (error) return handleSupabaseError(error, `批量导入第 ${i + 1} 至 ${i + slice.length} 条任务失败`, requestId)
      }

      return apiSuccess({ insertedCount: rows.length }, `成功批量导入 ${rows.length} 条任务`, requestId)
    } catch (err) {
      return handleSupabaseError(err, '批量导入任务异常', requestId)
    }
  },

  /**
   * [PATCH /v1/tasks/:id] 更新任务部分字段
   */
  async update(id: string, updates: Partial<Task>): Promise<ApiResponse<Task | null>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!

    try {
      const payload: any = {
        ...updates,
        updated_at: new Date().toISOString(),
      }
      if (payload.reading_meta) {
        payload.reading_meta = sanitizeReadingMeta(payload.reading_meta)
      }
      const { data, error } = await client
        .from('tasks')
        .update(payload)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single()

      if (error) return handleSupabaseError(error, '更新任务失败', requestId)
      return apiSuccess<Task | null>(data, '任务更新成功', requestId)
    } catch (err) {
      return handleSupabaseError(err, '更新任务异常', requestId)
    }
  },

  /**
   * [DELETE /v1/tasks/:id] 软删除任务
   */
  async delete(id: string): Promise<ApiResponse<boolean>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!

    try {
      const now = new Date().toISOString()
      const { error } = await client
        .from('tasks')
        .update({ is_deleted: true, updated_at: now })
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) return handleSupabaseError(error, '删除任务失败', requestId)
      return apiSuccess(true, '任务删除成功', requestId)
    } catch (err) {
      return handleSupabaseError(err, '删除任务异常', requestId)
    }
  },

  /**
   * [POST /v1/tasks/batch-delete] 批量软删除任务
   */
  async batchDelete(taskIds: string[], chunkSize = 100): Promise<ApiResponse<{ deletedCount: number }>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!
    if (!taskIds || taskIds.length === 0) return apiSuccess({ deletedCount: 0 }, '无删除目标', requestId)

    try {
      const now = new Date().toISOString()
      for (let i = 0; i < taskIds.length; i += chunkSize) {
        const slice = taskIds.slice(i, i + chunkSize)
        const { error } = await client
          .from('tasks')
          .update({ is_deleted: true, updated_at: now })
          .in('id', slice)
          .eq('user_id', user.id)
        if (error) return handleSupabaseError(error, '批量删除任务失败', requestId)
      }
      return apiSuccess({ deletedCount: taskIds.length }, `成功批量删除 ${taskIds.length} 项任务`, requestId)
    } catch (err) {
      return handleSupabaseError(err, '批量删除任务异常', requestId)
    }
  },

  /**
   * [GET /v1/tasks/delta] 增量拉取任务变更 (仅拉取自上次同步后的更新与软删除)
   */
  async pullDelta(lastSyncTimestamp?: string): Promise<ApiResponse<TasksDeltaResponse>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!

    try {
      let query = client
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)

      if (lastSyncTimestamp) {
        query = query.gt('updated_at', lastSyncTimestamp)
      }

      const { data, error } = await query
      if (error) return handleSupabaseError(error, '增量拉取任务失败', requestId)

      const upsertedTasks: Task[] = []
      const deletedTaskIds: string[] = []

      for (const item of data || []) {
        if (item.is_deleted) {
          deletedTaskIds.push(item.id)
        } else {
          upsertedTasks.push(item)
        }
      }

      let allActiveTaskIds: string[] | undefined = undefined
      if (lastSyncTimestamp) {
        try {
          const { data: idList } = await client
            .from('tasks')
            .select('id')
            .eq('user_id', user.id)
            .eq('is_deleted', false)
          if (idList) {
            allActiveTaskIds = idList.map((r: any) => r.id)
          }
        } catch {}
      }

      return apiSuccess<TasksDeltaResponse>(
        {
          upsertedTasks,
          deletedTaskIds,
          allActiveTaskIds,
          newSyncTimestamp: new Date().toISOString(),
        },
        '任务增量同步成功',
        requestId
      )
    } catch (err) {
      return handleSupabaseError(err, '任务增量同步异常', requestId)
    }
  },

  /**
   * [GET /v1/tasks/today] 仅拉取今日聚焦清单任务 (is_today = true 或 due_date = 今日 且未完成)
   */
  async getTodayTasks(): Promise<ApiResponse<Task[]>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!

    try {
      const todayStr = new Date().toISOString().split('T')[0]
      const { data, error } = await client
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .neq('status', 'completed')
        .or(`is_today.eq.true,due_date.eq.${todayStr}`)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false })

      if (error) return handleSupabaseError(error, '获取今日任务失败', requestId)
      return apiSuccess<Task[]>(data || [], '获取今日任务成功', requestId)
    } catch (err) {
      return handleSupabaseError(err, '获取今日任务异常', requestId)
    }
  },

  /**
   * [GET /v1/tasks/inbox] 收集箱分页拉取 (未分配今日、未完成、非打卡任务)
   */
  async getInboxTasks(
    params: { page?: number; pageSize?: number; keyword?: string } = {}
  ): Promise<ApiResponse<PaginationResult<Task>>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!

    const page = Math.max(1, params.page || 1)
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 15))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    try {
      let query = client
        .from('tasks')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .neq('status', 'completed')
        .eq('is_today', false)
        .neq('task_type', 'reading')
        .order('created_at', { ascending: false })
        .range(from, to)

      if (params.keyword?.trim()) {
        query = query.ilike('title', `%${params.keyword.trim()}%`)
      }

      const { data, count, error } = await query
      if (error) return handleSupabaseError(error, '获取收集箱任务失败', requestId)

      const total = count || 0
      const totalPages = Math.ceil(total / pageSize)

      return apiSuccess<PaginationResult<Task>>(
        {
          items: data || [],
          total,
          page,
          pageSize,
          totalPages,
          hasNext: page < totalPages,
        },
        '获取收集箱任务成功',
        requestId
      )
    } catch (err) {
      return handleSupabaseError(err, '获取收集箱任务异常', requestId)
    }
  },

  /**
   * [GET /v1/tasks/calendar] 按月精准拉取日历视图任务 (由于月份天数 28~31 天，计算精准起止日期)
   */
  async getMonthCalendarTasks(year: number, month: number): Promise<ApiResponse<Task[]>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!

    try {
      const actualMonth = month > 12 ? 12 : month < 1 ? 1 : month
      const startStr = `${year}-${String(actualMonth).padStart(2, '0')}-01`
      const lastDay = new Date(year, actualMonth, 0).getDate()
      const endStr = `${year}-${String(actualMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

      const { data, error } = await client
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .gte('due_date', startStr)
        .lte('due_date', endStr)
        .order('due_date', { ascending: true })

      if (error) return handleSupabaseError(error, `获取 ${year}年${actualMonth}月 日历任务失败`, requestId)
      return apiSuccess<Task[]>(data || [], '获取日历任务成功', requestId)
    } catch (err) {
      return handleSupabaseError(err, '获取日历任务异常', requestId)
    }
  },

  /**
   * [GET /v1/tasks/completed] 历史已完成归档分页拉取 (时间倒序)
   */
  async getCompletedTasks(
    params: { page?: number; pageSize?: number; keyword?: string } = {}
  ): Promise<ApiResponse<PaginationResult<Task>>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!

    const page = Math.max(1, params.page || 1)
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    try {
      let query = client
        .from('tasks')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false, nullsFirst: false })
        .range(from, to)

      if (params.keyword?.trim()) {
        query = query.ilike('title', `%${params.keyword.trim()}%`)
      }

      const { data, count, error } = await query
      if (error) return handleSupabaseError(error, '获取已完成任务失败', requestId)

      const total = count || 0
      const totalPages = Math.ceil(total / pageSize)

      return apiSuccess<PaginationResult<Task>>(
        {
          items: data || [],
          total,
          page,
          pageSize,
          totalPages,
          hasNext: page < totalPages,
        },
        '获取已完成任务成功',
        requestId
      )
    } catch (err) {
      return handleSupabaseError(err, '获取已完成任务异常', requestId)
    }
  },
}

// ==========================================
// 2. 书籍与书库 REST API 服务 (/v1/books)
// ==========================================
export const booksApi = {
  /**
   * [GET /v1/books] 获取书籍列表 (支持分页与关键词检索)
   */
  async list(
    params: PaginationParams & { keyword?: string } = {}
  ): Promise<ApiResponse<PaginationResult<Book>>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!

    const page = Math.max(1, params.page || 1)
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    try {
      let query = client
        .from('books')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order(params.sortBy || 'created_at', { ascending: params.sortOrder === 'asc' })
        .range(from, to)

      if (params.keyword?.trim()) {
        query = query.ilike('title', `%${params.keyword.trim()}%`)
      }

      const { data, count, error } = await query
      if (error) return handleSupabaseError(error, '获取书籍列表失败', requestId)

      const total = count || 0
      const totalPages = Math.ceil(total / pageSize)

      return apiSuccess<PaginationResult<Book>>(
        {
          items: data || [],
          total,
          page,
          pageSize,
          totalPages,
          hasNext: page < totalPages,
        },
        '获取书籍列表成功',
        requestId
      )
    } catch (err) {
      return handleSupabaseError(err, '获取书籍列表异常', requestId)
    }
  },

  /**
   * [GET /v1/books/:id] 获取单本书籍详情
   */
  async get(id: string): Promise<ApiResponse<Book>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!

    try {
      const { data, error } = await client
        .from('books')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return apiError(ApiErrorCode.BOOK_NOT_FOUND, `未找到 ID 为 ${id} 的书籍`, error, undefined, requestId)
        }
        return handleSupabaseError(error, '获取书籍详情失败', requestId)
      }
      return apiSuccess<Book>(data, '获取书籍成功', requestId)
    } catch (err) {
      return handleSupabaseError(err, '获取书籍详情异常', requestId)
    }
  },

  /**
   * [POST /v1/books] 创建书籍
   */
  async create(book: Book): Promise<ApiResponse<Book>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!

    if (!book.title?.trim()) {
      return apiError(ApiErrorCode.VALIDATION_FAILED, '书籍标题不能为空', { field: 'title' }, undefined, requestId)
    }

    try {
      const now = new Date().toISOString()
      const row = {
        ...book,
        user_id: user.id,
        is_deleted: false,
        created_at: book.created_at || now,
        updated_at: now,
      }
      const { data, error } = await client.from('books').upsert(row).select().single()
      if (error) return handleSupabaseError(error, '创建书籍失败', requestId)
      return apiSuccess<Book>(data || row, '书籍创建成功', requestId)
    } catch (err) {
      return handleSupabaseError(err, '创建书籍异常', requestId)
    }
  },

  /**
   * [PATCH /v1/books/:id] 更新书籍
   */
  async update(id: string, updates: Partial<Book>): Promise<ApiResponse<Book | null>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!

    try {
      const payload = {
        ...updates,
        updated_at: new Date().toISOString(),
      }
      const { data, error } = await client
        .from('books')
        .update(payload)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single()

      if (error) return handleSupabaseError(error, '更新书籍失败', requestId)
      return apiSuccess<Book | null>(data, '更新书籍成功', requestId)
    } catch (err) {
      return handleSupabaseError(err, '更新书籍异常', requestId)
    }
  },

  /**
   * [DELETE /v1/books/:id] 彻底物理删除书籍（级联清理关联计划与 Storage 原书）
   */
  async delete(id: string): Promise<ApiResponse<boolean>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!

    try {
      // 1. 删除 books 记录
      const { error: bookDelErr } = await client
        .from('books')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

      if (bookDelErr) return handleSupabaseError(bookDelErr, '物理删除书籍失败', requestId)

      // 2. 级联清理 reading_plans 计划
      await client
        .from('reading_plans')
        .delete()
        .eq('book_id', id)
        .eq('user_id', user.id)

      // 3. 级联清理 Storage 中的原始书籍文件
      try {
        const { data: files } = await client.storage.from('books').list(user.id)
        if (files && files.length > 0) {
          const matches = files.filter((f: any) => f.name.startsWith(id))
          if (matches.length > 0) {
            await client.storage.from('books').remove(matches.map((m: any) => `${user.id}/${m.name}`))
          }
        }
      } catch (storageErr) {
        console.warn('[booksApi.delete] Storage 级联清理提示:', storageErr)
      }

      return apiSuccess(true, '书籍及关联数据已彻底清理', requestId)
    } catch (err) {
      return handleSupabaseError(err, '删除书籍异常', requestId)
    }
  },

  /**
   * [POST /v1/books/:id/storage] 上传原书二进制至 Storage
   */
  async uploadBinary(
    bookId: string,
    file: File | Blob,
    fileName: string
  ): Promise<ApiResponse<{ url: string; path: string }>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!

    try {
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

      let { data, error } = await client.storage
        .from('books')
        .upload(filePath, file, {
          upsert: true,
          contentType,
        })

      // RLS 权限不足或冲突时自动先 remove 旧文件再写入
      if (
        error &&
        (error.message?.includes('row-level security') ||
          error.message?.includes('AccessDenied') ||
          error.message?.includes('policy') ||
          error.message?.includes('Duplicate') ||
          error.message?.includes('already exists') ||
          (error as any).statusCode === '403' ||
          (error as any).statusCode === 403)
      ) {
        try {
          await client.storage.from('books').remove([filePath])
          const retry = await client.storage.from('books').upload(filePath, file, {
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

      if (error) {
        return handleSupabaseError(error, '上传原书文件至云端存储桶失败', requestId)
      }

      let finalUrl = filePath
      const { data: publicUrlData } = client.storage.from('books').getPublicUrl(filePath)
      if (publicUrlData?.publicUrl) {
        finalUrl = publicUrlData.publicUrl
      }

      return apiSuccess({ url: finalUrl, path: filePath }, '书籍原文件同步云端成功', requestId)
    } catch (err) {
      return handleSupabaseError(err, '上传原书二进制异常', requestId)
    }
  },
}

// ==========================================
// 3. 阅读计划 REST API 服务 (/v1/reading-plans)
// ==========================================
export const readingPlansApi = {
  /**
   * [GET /v1/reading-plans] 获取阅读计划列表
   */
  async list(
    params: PaginationParams & { bookId?: string; status?: string } = {}
  ): Promise<ApiResponse<PaginationResult<ReadingPlan>>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!

    const page = Math.max(1, params.page || 1)
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    try {
      let query = client
        .from('reading_plans')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order(params.sortBy || 'created_at', { ascending: params.sortOrder === 'asc' })
        .range(from, to)

      if (params.bookId) {
        query = query.eq('book_id', params.bookId)
      }
      if (params.status) {
        query = query.eq('status', params.status)
      }

      const { data, count, error } = await query
      if (error) return handleSupabaseError(error, '获取阅读计划列表失败', requestId)

      const total = count || 0
      const totalPages = Math.ceil(total / pageSize)

      return apiSuccess<PaginationResult<ReadingPlan>>(
        {
          items: data || [],
          total,
          page,
          pageSize,
          totalPages,
          hasNext: page < totalPages,
        },
        '获取阅读计划列表成功',
        requestId
      )
    } catch (err) {
      return handleSupabaseError(err, '获取阅读计划列表异常', requestId)
    }
  },

  /**
   * [POST /v1/reading-plans] 创建阅读计划
   */
  async create(plan: ReadingPlan): Promise<ApiResponse<ReadingPlan>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!

    try {
      const now = new Date().toISOString()
      const row = {
        ...plan,
        user_id: user.id,
        is_deleted: false,
        created_at: plan.created_at || now,
        updated_at: now,
      }
      const { data, error } = await client.from('reading_plans').upsert(row).select().single()
      if (error) return handleSupabaseError(error, '创建阅读计划失败', requestId)
      return apiSuccess<ReadingPlan>(data || row, '阅读计划创建成功', requestId)
    } catch (err) {
      return handleSupabaseError(err, '创建阅读计划异常', requestId)
    }
  },

  /**
   * [PATCH /v1/reading-plans/:id] 更新阅读计划
   */
  async update(id: string, updates: Partial<ReadingPlan>): Promise<ApiResponse<ReadingPlan | null>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!

    try {
      const payload = {
        ...updates,
        updated_at: new Date().toISOString(),
      }
      const { data, error } = await client
        .from('reading_plans')
        .update(payload)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single()

      if (error) return handleSupabaseError(error, '更新阅读计划失败', requestId)
      return apiSuccess<ReadingPlan | null>(data, '更新阅读计划成功', requestId)
    } catch (err) {
      return handleSupabaseError(err, '更新阅读计划异常', requestId)
    }
  },

  /**
   * [DELETE /v1/reading-plans/:id] 物理删除阅读计划
   */
  async delete(id: string): Promise<ApiResponse<boolean>> {
    const requestId = generateRequestId()
    const client = getSupabaseClient()
    if (!client) return apiError(ApiErrorCode.CONFIG_MISSING, 'Supabase 尚未配置', null, undefined, requestId)

    const { user, errorResponse } = await requireAuthUser(client, requestId)
    if (!user) return errorResponse!

    try {
      const { error } = await client
        .from('reading_plans')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) return handleSupabaseError(error, '删除阅读计划失败', requestId)
      return apiSuccess(true, '阅读计划已彻底删除', requestId)
    } catch (err) {
      return handleSupabaseError(err, '删除阅读计划异常', requestId)
    }
  },
}
