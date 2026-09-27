/**
 * TaskFlow 统一响应与错误转换辅助引擎
 */

import { ApiResponse, ApiErrorCode, API_VERSION, ApiErrorDetail } from './types'

/**
 * 生成全局唯一的链路追踪 Request ID
 */
export function generateRequestId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
    }
  } catch {}
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 构造标准成功响应
 */
export function apiSuccess<T>(
  data: T,
  message = '操作成功',
  requestId?: string
): ApiResponse<T> {
  return {
    code: ApiErrorCode.SUCCESS,
    success: true,
    data,
    message,
    timestamp: Date.now(),
    requestId: requestId || generateRequestId(),
    version: API_VERSION,
  }
}

/**
 * 构造标准失败响应
 */
export function apiError<T = any>(
  code: ApiErrorCode | number,
  message: string,
  details?: any,
  hint?: string,
  requestId?: string
): ApiResponse<T> {
  const reqId = requestId || generateRequestId()
  const errorDetail: ApiErrorDetail = {
    code,
    message,
    details,
    hint,
  }

  return {
    code,
    success: false,
    data: null as unknown as T,
    message,
    timestamp: Date.now(),
    requestId: reqId,
    version: API_VERSION,
    error: errorDetail,
  }
}

/**
 * 将 Supabase / PostgREST / 网络层异常智能映射为企业级统一响应模型
 */
export function handleSupabaseError<T = any>(
  error: any,
  defaultMessage = '操作失败',
  requestId?: string
): ApiResponse<T> {
  if (!error) {
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, defaultMessage, null, undefined, requestId)
  }

  const rawMsg = error.message || error.error_description || String(error)
  const lowerMsg = rawMsg.toLowerCase()
  const postgrestCode = error.code || ''

  // 1. 网络连接失败
  if (lowerMsg.includes('failed to fetch') || lowerMsg.includes('networkerror') || lowerMsg.includes('network request failed')) {
    return apiError(
      ApiErrorCode.NETWORK_ERROR,
      '网络连接异常，无法连接至云端服务',
      error,
      '请检查您的网络连接或代理配置',
      requestId
    )
  }

  // 2. 认证错误与未登录
  if (lowerMsg.includes('invalid login credentials')) {
    return apiError(
      ApiErrorCode.INVALID_CREDENTIALS,
      '登录凭证无效：账号或密码错误，或该账号尚未验证邮箱',
      error,
      '请核对邮箱与密码，或前往注册邮箱查收确认链接',
      requestId
    )
  }
  if (lowerMsg.includes('email not confirmed')) {
    return apiError(
      ApiErrorCode.EMAIL_NOT_CONFIRMED,
      '该账号尚未通过邮箱验证，请先查收邮件确认激活',
      error,
      '可在 Supabase 仪表盘 Auth 模块临时关闭 Confirm Email 校验',
      requestId
    )
  }
  if (lowerMsg.includes('jwt') || lowerMsg.includes('token') && lowerMsg.includes('expired')) {
    return apiError(
      ApiErrorCode.SESSION_EXPIRED,
      '登录状态已过期，请重新登录',
      error,
      '请点击个人头像重新登录',
      requestId
    )
  }

  // 3. 行级安全策略冲突 (RLS)
  if (
    lowerMsg.includes('row-level security') ||
    lowerMsg.includes('accessdenied') ||
    postgrestCode === '42501' ||
    (error.statusCode === '403' || error.statusCode === 403)
  ) {
    return apiError(
      ApiErrorCode.RLS_POLICY_VIOLATION,
      '操作被安全策略拦截 (Row Level Security 校验未通过)',
      error,
      '请确保已登录对应账户，或在 Supabase 控制台补齐对应的 INSERT/UPDATE/DELETE 策略',
      requestId
    )
  }

  // 4. 重复记录冲突 (Conflict / Duplicate)
  if (
    lowerMsg.includes('already exists') ||
    lowerMsg.includes('duplicate') ||
    postgrestCode === '23505' ||
    error.statusCode === '409' ||
    error.statusCode === 409
  ) {
    return apiError(
      ApiErrorCode.RESOURCE_ALREADY_EXISTS,
      '目标资源或记录已存在，无法重复创建',
      error,
      '如需更新已有资源，请使用 PATCH/UPDATE 操作',
      requestId
    )
  }

  // 5. 存储桶或数据表不存在
  if (
    lowerMsg.includes('bucket not found') ||
    lowerMsg.includes('nosuchbucket') ||
    postgrestCode === '42P01' // undefined_table
  ) {
    return apiError(
      ApiErrorCode.SCHEMA_NOT_INITIALIZED,
      '云端数据表或存储桶尚未初始化',
      error,
      '请在 Supabase SQL Editor 执行数据库建表与存储桶创建迁移脚本',
      requestId
    )
  }

  // 6. 流控限流
  if (lowerMsg.includes('rate limit') || error.statusCode === 429) {
    return apiError(
      ApiErrorCode.RATE_LIMIT_EXCEEDED,
      '请求过于频繁，触发云端流控保护，请稍后重试',
      error,
      '建议适当降低并发同步频率',
      requestId
    )
  }

  // 7. 兜底通用错误
  return apiError(
    ApiErrorCode.INTERNAL_SERVER_ERROR,
    rawMsg || defaultMessage,
    error,
    undefined,
    requestId
  )
}
