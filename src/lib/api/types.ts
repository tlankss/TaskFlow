/**
 * TaskFlow 企业级统一接口规范与类型定义
 * 
 * 规范标准：
 * - 传输协议：HTTPS 强制
 * - 风格架构：RESTful Resource-Oriented Architecture (ROA)
 * - 接口版本：API_VERSION = 'v1' (Header: X-Api-Version)
 * - 链路追踪：X-Request-Id (UUID/TraceID)
 * - 响应模型：统一信封结构 ApiResponse<T>
 */

import { Task, Book, ReadingPlan } from '../../types'

export const API_VERSION = 'v1'
export const API_PROTOCOL_VERSION = '1.0.0'

/**
 * 标准业务状态码与 HTTP 语义映射字典
 */
export enum ApiErrorCode {
  /** 20000: 操作成功 */
  SUCCESS = 20000,

  // --- 400XX: 客户端参数与请求规范错误 (HTTP 400 Bad Request) ---
  /** 40000: 通用请求参数或格式错误 */
  BAD_REQUEST = 40000,
  /** 40001: 字段校验失败（缺少必填项或数据类型不合规） */
  VALIDATION_FAILED = 40001,
  /** 40002: 资源唯一标识 ID 格式不合法 */
  INVALID_ID_FORMAT = 40002,
  /** 40003: 请求体或上传文件体积超出系统限制 */
  PAYLOAD_TOO_LARGE = 40003,
  /** 40015: 不支持的媒体内容类型 (Unsupported Media Type) */
  UNSUPPORTED_MEDIA_TYPE = 40015,

  // --- 401XX: 认证与身份凭证错误 (HTTP 401 Unauthorized) ---
  /** 40100: 用户尚未认证或未提供有效身份凭证 */
  UNAUTHORIZED = 40100,
  /** 40101: 账号或密码错误 */
  INVALID_CREDENTIALS = 40101,
  /** 40102: 邮箱尚未验证确认 (Email not confirmed) */
  EMAIL_NOT_CONFIRMED = 40102,
  /** 40103: 用户会话或 Token 已过期，需重新登录 */
  SESSION_EXPIRED = 40103,
  /** 40104: 云端连接配置缺失 (缺少 Project URL 或 Key) */
  CONFIG_MISSING = 40104,

  // --- 403XX: 安全策略与权限不足 (HTTP 403 Forbidden) ---
  /** 40300: 访问被拒绝，无权访问或操作目标资源 */
  FORBIDDEN = 40300,
  /** 40301: 违反 Supabase 行级安全策略 (RLS Policy Violation) */
  RLS_POLICY_VIOLATION = 40301,
  /** 40302: 云端存储桶操作权限受限 */
  STORAGE_ACCESS_DENIED = 40302,

  // --- 404XX: 资源不存在 (HTTP 404 Not Found) ---
  /** 40400: 目标资源未找到 */
  NOT_FOUND = 40400,
  /** 40401: 指定任务不存在或已被彻底删除 */
  TASK_NOT_FOUND = 40401,
  /** 40402: 指定书籍不存在或已被彻底删除 */
  BOOK_NOT_FOUND = 40402,
  /** 40403: 指定阅读计划不存在或已被彻底删除 */
  PLAN_NOT_FOUND = 40403,
  /** 40404: 目标存储文件未找到 */
  STORAGE_OBJECT_NOT_FOUND = 40404,
  /** 40405: 目标存储桶未创建 (Bucket not found) */
  BUCKET_NOT_FOUND = 40405,

  // --- 409XX: 资源状态冲突与并发控制 (HTTP 409 Conflict) ---
  /** 40900: 资源状态冲突或已被其他客户端修改 */
  CONFLICT = 40900,
  /** 40901: 该邮箱已被注册 */
  USER_ALREADY_EXISTS = 40901,
  /** 40902: 资源或文件已存在，不可重复创建 */
  RESOURCE_ALREADY_EXISTS = 40902,

  // --- 429XX: 访问频次流控 (HTTP 429 Too Many Requests) ---
  /** 42900: 访问频次超出限制，触发限流保护 */
  RATE_LIMIT_EXCEEDED = 42900,

  // --- 500XX: 服务端与网络层异常 (HTTP 500/502/503/504) ---
  /** 50000: 服务器内部未知异常 */
  INTERNAL_SERVER_ERROR = 50000,
  /** 50001: 本地网络故障或网络不通 */
  NETWORK_ERROR = 50001,
  /** 50002: 云端服务暂时不可用或维护中 */
  SERVICE_UNAVAILABLE = 50002,
  /** 50003: 远端数据库表结构未初始化 (缺少对应数据表或列) */
  SCHEMA_NOT_INITIALIZED = 50003,
}

/**
 * 详细错误信息结构体
 */
export interface ApiErrorDetail {
  /** 业务错误码 */
  code: ApiErrorCode | number
  /** 错误描述 */
  message: string
  /** 关联字段（如有） */
  field?: string
  /** 底层原始错误对象/响应 */
  details?: any
  /** 自愈操作建议 */
  hint?: string
}

/**
 * 全局统一接口响应信封 (Standard API Response Envelope)
 */
export interface ApiResponse<T = any> {
  /** 业务状态码，20000 为成功 */
  code: ApiErrorCode | number
  /** 明确操作成败标识 */
  success: boolean
  /** 业务数据载荷 */
  data: T
  /** 用户或系统友好提示信息 */
  message: string
  /** 响应生成时间戳 (毫秒) */
  timestamp: number
  /** 链路追踪 Request ID */
  requestId: string
  /** 接口契约协议版本 */
  version: string
  /** 错误细项（当 success === false 时存在） */
  error?: ApiErrorDetail
}

/**
 * 标准分页请求参数
 */
export interface PaginationParams {
  /** 当前页码，从 1 开始，默认 1 */
  page?: number
  /** 每页条数，默认 20 */
  pageSize?: number
  /** 排序字段，默认 'created_at' */
  sortBy?: string
  /** 排序方向，默认 'desc' */
  sortOrder?: 'asc' | 'desc'
}

/**
 * 标准分页响应载荷
 */
export interface PaginationResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasNext: boolean
}

/**
 * 任务层增量同步响应载荷
 */
export interface TasksDeltaResponse {
  upsertedTasks: Task[]
  deletedTaskIds: string[]
  allActiveTaskIds?: string[]
  newSyncTimestamp: string
}

/**
 * 阅读与书架层增量同步响应载荷
 */
export interface ReadingDeltaResponse {
  upsertedBooks: Book[]
  deletedBookIds: string[]
  allActiveBookIds?: string[]
  upsertedPlans: ReadingPlan[]
  deletedPlanIds: string[]
  allActivePlanIds?: string[]
  newSyncTimestamp: string
}

/**
 * 净化 reading_meta，杜绝将几兆大小的 base64 封面注入到每个每日任务中
 * 书籍封面在 books 表已统一存储，每日任务中严禁携带大型 data:image base64
 */
export function sanitizeReadingMeta(meta?: any): any {
  if (!meta) return null
  const sanitized = { ...meta }
  // 如果包含了 base64 格式的图片，或者超长 URL，直接清理，杜绝单次请求几十兆导致 413 Payload Too Large
  if (sanitized.cover_url && (sanitized.cover_url.startsWith('data:') || sanitized.cover_url.length > 500)) {
    delete sanitized.cover_url
  }
  return sanitized
}
