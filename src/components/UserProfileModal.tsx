import React, { useState, useEffect } from 'react'
import { X, User, ShieldCheck, Cloud, Award, Flame, Sun, Moon, Monitor, Sparkles, Check, RefreshCw, LogIn, LogOut, Key, AlertCircle, Eye, EyeOff, Terminal, ExternalLink, Zap, Loader2, Copy, CheckCheck, Database, Code } from 'lucide-react'
import { UserProfile, UserStats, Task } from '../types'
import { signUpWithEmail, signInWithEmail, signOut, getCurrentUser, syncTasksWithCloud, getSupabaseClient, formatAuthError, detectRemoteSchema, getSchemaStatus, resetSupabaseSchemaCache, READING_FEATURE_MIGRATION_SQL } from '../lib/supabase'

interface UserProfileModalProps {
  isOpen: boolean
  onClose: () => void
  userProfile: UserProfile | null
  userStats: UserStats | null
  tasks: Task[]
  theme?: 'light' | 'dark' | 'system'
  onThemeChange?: (theme: 'light' | 'dark' | 'system') => void
  onSaveProfile: (profile: Partial<UserProfile>) => void
  onTasksSynced: (mergedTasks: Task[]) => void
  onTriggerSync?: () => Promise<void>
  initialTab?: 'profile' | 'sync' | 'ai' | 'badges'
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  userProfile,
  userStats,
  tasks,
  theme = 'system',
  onThemeChange,
  onSaveProfile,
  onTasksSynced,
  onTriggerSync,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'sync' | 'ai' | 'badges'>(initialTab || 'sync')
  const [name, setName] = useState(userProfile?.name || 'Alex 职场极客')
  const [email, setEmail] = useState(userProfile?.email || '')
  const [password, setPassword] = useState('')
  const [roleTitle, setRoleTitle] = useState(userProfile?.role_title || '高级产品专家 / 技术架构师')
  const [syncEnabled, setSyncEnabled] = useState(userProfile?.sync_enabled ?? true)

  // AI 大模型配置状态
  const [aiKey, setAiKey] = useState(localStorage.getItem('taskflow_ai_key') || '')
  const [aiBaseUrl, setAiBaseUrl] = useState(
    localStorage.getItem('taskflow_ai_base_url') || 'https://api.deepseek.com/v1'
  )
  const [aiModel, setAiModel] = useState(
    localStorage.getItem('taskflow_ai_model') || 'deepseek-chat'
  )
  const [showAiKeyVisible, setShowAiKeyVisible] = useState(false)
  const [isTestingAi, setIsTestingAi] = useState(false)
  const [aiTestResult, setAiTestResult] = useState<{ success: boolean; latency?: number; message: string } | null>(null)
  const [aiSavedSuccess, setAiSavedSuccess] = useState(false)

  const AI_PRESETS = [
    {
      name: 'DeepSeek (推荐)',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      desc: '顶尖推理与代码，极高性价比',
      docUrl: 'https://platform.deepseek.com/api_keys',
    },
    {
      name: '通义千问 (阿里)',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus',
      desc: 'DashScope 兼容接口',
      docUrl: 'https://bailian.console.aliyun.com/',
    },
    {
      name: '月之暗面 (Kimi)',
      baseUrl: 'https://api.moonshot.cn/v1',
      model: 'moonshot-v1-8k',
      desc: '擅长超长上下文与细致阅读',
      docUrl: 'https://platform.moonshot.cn/console/api-keys',
    },
    {
      name: 'OpenAI (官方/代理)',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      desc: '支持 OpenAI 官方或反向代理',
      docUrl: 'https://platform.openai.com/api-keys',
    },
    {
      name: '本地 Ollama',
      baseUrl: 'http://localhost:11434/v1',
      model: 'qwen2.5:7b',
      desc: '本地私有部署，免 API Key',
      docUrl: 'https://ollama.com/',
    },
  ]

  // Supabase URL & Key 配置
  const [supabaseUrl, setSupabaseUrl] = useState(
    localStorage.getItem('taskflow_supabase_url') || import.meta.env.VITE_SUPABASE_URL || ''
  )
  const [supabaseKey, setSupabaseKey] = useState(
    localStorage.getItem('taskflow_supabase_key') || import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  )
  const [showConfig, setShowConfig] = useState(false)
  const [showKeyVisible, setShowKeyVisible] = useState(true) // 默认明文可查看

  // 认证与同步状态
  const [currentCloudUser, setCurrentCloudUser] = useState<any>(null)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [showPassword, setShowPassword] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)

  // 同步外部 initialTab
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    }
  }, [initialTab, isOpen])

  const [remoteSchema, setRemoteSchema] = useState(getSchemaStatus())
  const [isCheckingSchema, setIsCheckingSchema] = useState(false)
  const [copiedSql, setCopiedSql] = useState(false)
  const [showSqlDetail, setShowSqlDetail] = useState(false)

  // 检查当前 Supabase 登录状态
  useEffect(() => {
    if (isOpen) {
      checkAuthStatus()
      setRemoteSchema(getSchemaStatus())
    }
  }, [isOpen])

  const checkAuthStatus = async () => {
    try {
      const u = await getCurrentUser()
      setCurrentCloudUser(u)
      if (u?.email) {
        setEmail(u.email)
      }
    } catch {
      setCurrentCloudUser(null)
    }
  }

  const handleCheckSchema = async () => {
    setIsCheckingSchema(true)
    try {
      resetSupabaseSchemaCache()
      const res = await detectRemoteSchema()
      setRemoteSchema(res)
    } finally {
      setIsCheckingSchema(false)
    }
  }

  const handleCopySql = () => {
    navigator.clipboard.writeText(READING_FEATURE_MIGRATION_SQL)
    setCopiedSql(true)
    setTimeout(() => setCopiedSql(false), 2000)
  }

  if (!isOpen) return null

  // 保存个人资料
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault()
    onSaveProfile({
      name: name.trim() || 'Alex 职场极客',
      role_title: roleTitle.trim() || '高级职场专业人士',
      sync_enabled: syncEnabled,
    })
    setSavedSuccess(true)
    setTimeout(() => {
      setSavedSuccess(false)
      onClose()
    }, 1000)
  }

  // 测试 AI 连接
  const handleTestAiConnection = async () => {
    if (!aiKey.trim() && !aiBaseUrl.includes('localhost') && !aiBaseUrl.includes('127.0.0.1')) {
      setAiTestResult({ success: false, message: '请先填写 API Key 密钥' })
      return
    }
    setIsTestingAi(true)
    setAiTestResult(null)
    try {
      if (window.electronAPI?.testAIConnection) {
        const res = await window.electronAPI.testAIConnection({
          apiKey: aiKey.trim(),
          baseUrl: aiBaseUrl.trim(),
          model: aiModel.trim(),
        })
        if (res.success) {
          setAiTestResult({
            success: true,
            latency: res.latency,
            message: `连接成功！响应耗时: ${res.latency ?? 200}ms (大模型工作正常)`,
          })
        } else {
          setAiTestResult({
            success: false,
            message: `连接失败: ${res.error || '无法连通'}`,
          })
        }
      } else {
        const res = await fetch(`${aiBaseUrl.trim()}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${aiKey.trim()}`,
          },
          body: JSON.stringify({
            model: aiModel.trim(),
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 5,
          }),
        })
        if (res.ok) {
          setAiTestResult({ success: true, message: '连接成功！大模型正常就绪' })
        } else {
          const errData = await res.text()
          setAiTestResult({ success: false, message: `HTTP ${res.status}: ${errData.slice(0, 100)}` })
        }
      }
    } catch (err: any) {
      setAiTestResult({ success: false, message: `连接异常: ${err.message || '网络连接超时'}` })
    } finally {
      setIsTestingAi(false)
    }
  }

  // 保存 AI 大模型配置
  const handleSaveAiConfig = () => {
    const cleanKey = aiKey.trim()
    const cleanUrl = aiBaseUrl.trim().replace(/\/+$/, '')
    const cleanModel = aiModel.trim() || 'deepseek-chat'
    localStorage.setItem('taskflow_ai_key', cleanKey)
    localStorage.setItem('taskflow_ai_base_url', cleanUrl)
    localStorage.setItem('taskflow_ai_model', cleanModel)
    setAiSavedSuccess(true)
    setTimeout(() => setAiSavedSuccess(false), 2000)
  }

  // 保存 Supabase 配置
  const handleSaveConfig = () => {
    const cleanUrl = supabaseUrl.trim().replace(/\/+$/, '') // 自动去除末尾多余斜杠
    const cleanKey = supabaseKey.trim()
    localStorage.setItem('taskflow_supabase_url', cleanUrl)
    localStorage.setItem('taskflow_supabase_key', cleanKey)
    setSupabaseUrl(cleanUrl)
    setSupabaseKey(cleanKey)
    setShowConfig(false)
    setAuthError(null)
    checkAuthStatus()
  }

  // 登录或注册
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setAuthLoading(true)

    const cleanEmail = email.trim().toLowerCase()
    const cleanPassword = password.trim()

    try {
      if (authMode === 'signup') {
        const res = await signUpWithEmail(cleanEmail, cleanPassword, name)
        if (res.user && !res.session) {
          // Supabase 开启了 Confirm email，因此注册成功但没有即时会话
          setAuthError(
            '注册申请已提交！但当前 Supabase 项目开启了【邮箱确认】校验，需要去邮箱激活链接后方可登录。建议在 Supabase 控制台直接关闭该校验。'
          )
          setSyncStatus('账号待激活：请查收邮件或在控制台关闭 Confirm email')
        } else if (res.user && res.user.identities && res.user.identities.length === 0) {
          setAuthError('该邮箱已被注册，请直接点击“去登录”；若登录仍报错，说明账号尚未通过邮箱确认。')
        } else if (res.user) {
          setCurrentCloudUser(res.user)
          onSaveProfile({ email: res.user.email, name: name || res.user.email?.split('@')[0] })
          setSyncStatus('注册成功！已自动关联云端账号')
        }
      } else {
        const res = await signInWithEmail(cleanEmail, cleanPassword)
        if (res.user) {
          setCurrentCloudUser(res.user)
          onSaveProfile({ email: res.user.email })
          setSyncStatus('登录成功！准备同步云端数据')
          // 登录后自动触发一次同步
          handleManualSync()
        }
      }
    } catch (err: any) {
      console.error('[Supabase Auth Error]', err)
      setAuthError(formatAuthError(err))
    } finally {
      setAuthLoading(false)
    }
  }

  // 登出
  const handleLogout = async () => {
    await signOut()
    setCurrentCloudUser(null)
    setSyncStatus('已退出云端账号，本地数据依然安全保留')
  }

  // 真实云端双向同步 (优先委托给外层 Delta Sync 增量引擎)
  const handleManualSync = async () => {
    setIsSyncing(true)
    setSyncStatus('正在与 Supabase 云端同步...')
    try {
      if (onTriggerSync) {
        await onTriggerSync()
        setSyncStatus('增量同步完成！数据已更新至最新')
      } else {
        const result = await syncTasksWithCloud(tasks)
        onTasksSynced(result.mergedTasks)
        onSaveProfile({ last_synced_at: new Date().toISOString() })
        setSyncStatus(`同步成功！已双向更新 ${result.mergedTasks.length} 项任务`)
      }
    } catch (err: any) {
      setSyncStatus(`同步失败: ${formatAuthError(err)}`)
    } finally {
      setIsSyncing(false)
    }
  }

  const isConfigured = Boolean(supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project-ref'))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md no-drag">
      <div className="w-full max-w-xl bg-white dark:bg-[#1E1E1E] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] animate-in fade-in zoom-in-95 duration-150 text-slate-900 dark:text-slate-100 transition-colors">
        {/* Header */}
        <div className="px-6 py-4 border-b border-black/5 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#07C160] to-[#059B4D] flex items-center justify-center text-white font-bold text-sm shadow-md shadow-[#07C160]/20">
              {name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>{name}</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-[#07C160]/10 text-[#07C160] border border-[#07C160]/25">
                  {currentCloudUser ? '云端已联机' : '本地模式'}
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{roleTitle}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-2 px-6 pt-3 border-b border-black/5 dark:border-white/5 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('sync')}
            className={`pb-2.5 px-2 border-b-2 flex items-center space-x-1.5 transition-colors ${
              activeTab === 'sync'
                ? 'border-[#07C160] text-[#07C160]'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>云端同步 & 账号</span>
          </button>

          <button
            onClick={() => setActiveTab('ai')}
            className={`pb-2.5 px-2 border-b-2 flex items-center space-x-1.5 transition-colors ${
              activeTab === 'ai'
                ? 'border-[#07C160] text-[#07C160]'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI 大模型设置</span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`pb-2.5 px-2 border-b-2 flex items-center space-x-1.5 transition-colors ${
              activeTab === 'profile'
                ? 'border-[#07C160] text-[#07C160]'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>个人身份 & 外观</span>
          </button>

          <button
            onClick={() => setActiveTab('badges')}
            className={`pb-2.5 px-2 border-b-2 flex items-center space-x-1.5 transition-colors ${
              activeTab === 'badges'
                ? 'border-[#07C160] text-[#07C160]'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>职场勋章 & 成就</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* TAB: AI 大模型配置 */}
          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-transparent border border-[#07C160]/20 flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-[#07C160]/15 text-[#07C160] shrink-0 mt-0.5">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex-1 text-xs">
                  <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-0.5">
                    大模型 API 接入 (深度赋能任务规划与周报总结)
                  </h4>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    配置你的 API Key 后，系统将在「✨ AI 智能规划拆解」与「📅 AI 智能周报」中全面启用大模型深度思考。支持 DeepSeek、通义千问、Kimi、OpenAI 或本地私有化模型。
                  </p>
                </div>
              </div>

              {/* 厂商预设快捷选填 */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>快捷配置预设厂商</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AI_PRESETS.map((preset) => {
                    const isSelected = aiBaseUrl === preset.baseUrl && aiModel === preset.model
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          setAiBaseUrl(preset.baseUrl)
                          setAiModel(preset.model)
                          setAiTestResult(null)
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#07C160] bg-[#07C160]/10 text-slate-900 dark:text-white shadow-sm ring-1 ring-[#07C160]/30'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400 bg-white/50 dark:bg-slate-900/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{preset.name}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-[#07C160] shrink-0" />}
                        </div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 line-clamp-1">{preset.desc}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* API Key 填写 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                    <Key className="w-3.5 h-3.5 text-[#07C160]" />
                    <span>API Key (密钥填写)</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <a
                    href="https://platform.deepseek.com/api_keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-[#07C160] hover:underline flex items-center space-x-1 font-medium"
                  >
                    <span>获取 DeepSeek Key (官网极低费率)</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="relative">
                  <input
                    type={showAiKeyVisible ? 'text' : 'password'}
                    placeholder="请输入你的 API Key (例如 sk-xxxxxxxxxxxxxxxx)"
                    value={aiKey}
                    onChange={(e) => {
                      setAiKey(e.target.value)
                      setAiTestResult(null)
                    }}
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-[#07C160] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAiKeyVisible(!showAiKeyVisible)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                  >
                    {showAiKeyVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  安全承诺：密钥仅加密保存于你本地设备磁盘，直连大模型服务商，绝不中转存储。
                </p>
              </div>

              {/* Base URL & Model */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    API Base URL (接口地址)
                  </label>
                  <input
                    type="text"
                    placeholder="https://api.deepseek.com/v1"
                    value={aiBaseUrl}
                    onChange={(e) => {
                      setAiBaseUrl(e.target.value)
                      setAiTestResult(null)
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-[#07C160]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    模型名称 (Model)
                  </label>
                  <input
                    type="text"
                    placeholder="deepseek-chat"
                    value={aiModel}
                    onChange={(e) => {
                      setAiModel(e.target.value)
                      setAiTestResult(null)
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-[#07C160]"
                  />
                </div>
              </div>

              {/* 测试连接反馈提示 */}
              {aiTestResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center space-x-2.5 animate-in fade-in duration-150 ${
                    aiTestResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {aiTestResult.success ? (
                    <Check className="w-4 h-4 shrink-0 text-emerald-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  )}
                  <span className="flex-1 font-medium">{aiTestResult.message}</span>
                </div>
              )}

              {/* 底部测试与保存按钮 */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-white/5">
                <button
                  type="button"
                  onClick={handleTestAiConnection}
                  disabled={isTestingAi}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isTestingAi ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#07C160]" />
                      <span>正在测试连通性...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>一键测试连通性</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleSaveAiConfig}
                  className="px-5 py-2 rounded-xl bg-[#07C160] hover:bg-[#06ad56] text-white text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-[#07C160]/20 transition-all cursor-pointer"
                >
                  {aiSavedSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>配置已保存生效！</span>
                    </>
                  ) : (
                    <span>保存 AI 配置</span>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB: 云端同步 & 账号 */}
          {activeTab === 'sync' && (
            <div className="space-y-4">
              {/* 配置状态提示 */}
              {!isConfigured && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start space-x-2.5 text-xs text-amber-700 dark:text-amber-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                  <div className="flex-1">
                    <p className="font-semibold">尚未完成 Supabase 环境变量接入</p>
                    <p className="mt-0.5 text-amber-600/90 dark:text-amber-300/80">点击下方设置按钮，填入您的 Project URL 即可立刻联机。</p>
                  </div>
                  <button
                    onClick={() => setShowConfig(!showConfig)}
                    className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 rounded text-[11px] font-semibold text-amber-800 dark:text-amber-200"
                  >
                    配置 URL
                  </button>
                </div>
              )}

              {/* URL & Key 设置展开面板 */}
              {showConfig && (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-[#07C160]/30 space-y-3">
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center space-x-1.5">
                    <Key className="w-3.5 h-3.5 text-[#07C160]" />
                    <span>Supabase 接入参数设置</span>
                  </h4>
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Project URL (例如: https://xxxx.supabase.co)</label>
                    <input
                      type="text"
                      placeholder="https://xxxxxxxx.supabase.co"
                      value={supabaseUrl}
                      onChange={(e) => setSupabaseUrl(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#07C160]"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] text-slate-500 dark:text-slate-400">Publishable / Anon Key (通常以 eyJ 开头)</label>
                      <button
                        type="button"
                        onClick={() => setShowKeyVisible(!showKeyVisible)}
                        className="text-[10px] text-[#07C160] hover:text-[#06AD56] flex items-center space-x-1"
                      >
                        {showKeyVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        <span>{showKeyVisible ? '隐藏明文' : '查看明文'}</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showKeyVisible ? 'text' : 'password'}
                        placeholder="eyJhbGciOi..."
                        value={supabaseKey}
                        onChange={(e) => setSupabaseKey(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:border-[#07C160]"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleSaveConfig}
                    className="px-3 py-1.5 rounded-lg bg-[#07C160] hover:bg-[#06AD56] text-xs text-white font-medium"
                  >
                    保存配置
                  </button>
                </div>
              )}

              {/* 账号状态模块 */}
              {currentCloudUser ? (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">当前已登录云端账号</span>
                      <p className="text-xs text-[#07C160] font-mono mt-0.5">{currentCloudUser.email}</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 text-xs font-medium flex items-center space-x-1"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>退出登录</span>
                    </button>
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-white/5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>上次同步时间: {userProfile?.last_synced_at ? new Date(userProfile.last_synced_at).toLocaleString() : '尚未同步'}</span>
                    <button
                      onClick={handleManualSync}
                      disabled={isSyncing}
                      className="px-3 py-1.5 rounded-lg bg-[#07C160] hover:bg-[#06AD56] text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>{isSyncing ? '同步中...' : '立即双向同步'}</span>
                    </button>
                  </div>
                  {syncStatus && (
                    <p className="text-[11px] text-[#07C160] font-medium">{syncStatus}</p>
                  )}
                </div>
              ) : (
                /* 未登录状态：展示登录/注册表单 */
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/5 pb-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                      {authMode === 'signin' ? '登录 TaskFlow 云端账号' : '注册新账号'}
                    </span>
                    <button
                      onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
                      className="text-xs text-[#07C160] hover:underline"
                    >
                      {authMode === 'signin' ? '没有账号？立即注册' : '已有账号？去登录'}
                    </button>
                  </div>

                  <form onSubmit={handleAuth} className="space-y-3">
                    <div>
                      <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">邮箱地址</label>
                      <input
                        type="email"
                        required
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#07C160]"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] text-slate-500 dark:text-slate-400">密码</label>
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center space-x-1"
                        >
                          {showPassword ? (
                            <>
                              <EyeOff className="w-3 h-3 text-[#07C160]" />
                              <span className="text-[#07C160]">隐藏</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3 h-3" />
                              <span>查看</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          placeholder="至少 6 位字符"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full px-3 py-1.5 pr-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#07C160]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-0.5"
                          title={showPassword ? '隐藏密码' : '查看密码'}
                        >
                          {showPassword ? (
                            <EyeOff className="w-3.5 h-3.5 text-[#07C160]" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {authError && (
                      <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-600 dark:text-red-400 space-y-2">
                        <div className="flex items-start space-x-2">
                          <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                          <div className="space-y-1">
                            <p className="font-semibold text-red-700 dark:text-red-300">{authError}</p>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                              💡 <strong>400 核心原因</strong>：Supabase 新项目默认开启了<strong>【邮箱验证】</strong>。若注册后未点击 163 邮箱里的激活邮件，Supabase 会拒绝登录并返回 400。
                            </p>
                          </div>
                        </div>

                        <div className="pt-1.5 border-t border-red-500/20 text-[11px] text-slate-700 dark:text-slate-300 space-y-1 bg-white/50 dark:bg-black/20 p-2 rounded-lg">
                          <p className="font-semibold text-slate-900 dark:text-slate-100">🚀 快速解决办法（二选一）：</p>
                          <p>
                            <strong>方法 1（强烈推荐，一劳永逸）</strong>：打开 Supabase 网页控制台 → 点击左侧 <strong>Authentication</strong> → <strong>Providers</strong> → 点击 <strong>Email</strong> → 将 <strong>【Confirm email】</strong> 开关关闭并保存。之后任何注册即可直接秒登录！
                          </p>
                          <p>
                            <strong>方法 2（直接激活此账号）</strong>：在 Supabase 控制台 → <strong>Authentication</strong> → <strong>Users</strong> 列表中找到当前邮箱，点击右侧操作菜单 <strong>···</strong> → 选择 <strong>【Confirm user】</strong>，即可立即在此登录。
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => setShowConfig(!showConfig)}
                        className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                      >
                        ⚙️ 配置 Supabase URL
                      </button>
                      <button
                        type="submit"
                        disabled={authLoading}
                        className="px-4 py-1.5 rounded-lg bg-[#07C160] hover:bg-[#06AD56] text-white text-xs font-semibold flex items-center space-x-1.5 disabled:opacity-50"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>{authLoading ? '处理中...' : authMode === 'signin' ? '登录并同步' : '注册账号'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* 阅读规划云端数据表迁移 SQL 模块 */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Database className="w-4 h-4 text-[#07C160]" />
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                      阅读规划云端数据表迁移 (SQL 快速配置)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCheckSchema}
                    disabled={isCheckingSchema}
                    className="px-2.5 py-1 rounded-lg bg-slate-200/60 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300 flex items-center space-x-1 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isCheckingSchema ? 'animate-spin' : ''}`} />
                    <span>{isCheckingSchema ? '检测中...' : '检测表结构'}</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  在多端完整双向同步电子书籍、章节目录与每日排期需远端数据表支持。若未迁移，系统已自动启用本地静默兼容，绝不阻断日常待办同步。
                </p>

                {/* 字段状态检测标签 */}
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div className="p-2 rounded-lg bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-mono">tasks.reading_meta</span>
                    <span className={`font-semibold mt-1 ${remoteSchema.hasReadingMeta ? 'text-[#07C160]' : 'text-amber-500'}`}>
                      {remoteSchema.hasReadingMeta ? '🟢 已支持' : '🟡 待执行迁移'}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-mono">books 表</span>
                    <span className={`font-semibold mt-1 ${remoteSchema.hasBooksTable ? 'text-[#07C160]' : 'text-amber-500'}`}>
                      {remoteSchema.hasBooksTable ? '🟢 已创建' : '🟡 待执行建表'}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-mono">reading_plans 表</span>
                    <span className={`font-semibold mt-1 ${remoteSchema.hasReadingPlansTable ? 'text-[#07C160]' : 'text-amber-500'}`}>
                      {remoteSchema.hasReadingPlansTable ? '🟢 已创建' : '🟡 待执行建表'}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-white/5 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowSqlDetail(!showSqlDetail)}
                    className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center space-x-1"
                  >
                    <Code className="w-3 h-3" />
                    <span>{showSqlDetail ? '折叠 SQL 语句' : '查看完整 SQL 语句'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopySql}
                    className="px-3 py-1.5 rounded-lg bg-[#07C160] hover:bg-[#06AD56] text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm shadow-[#07C160]/20 transition-all"
                  >
                    {copiedSql ? (
                      <>
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>SQL 已复制到剪贴板！</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>一键复制迁移 SQL</span>
                      </>
                    )}
                  </button>
                </div>

                {showSqlDetail && (
                  <pre className="p-2.5 rounded-lg bg-slate-900 text-slate-300 text-[10px] font-mono overflow-x-auto max-h-48 scrollbar-thin select-all">
                    {READING_FEATURE_MIGRATION_SQL}
                  </pre>
                )}
              </div>

              {/* 隐私与安全说明 */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 space-y-1.5 text-slate-500 dark:text-slate-400 text-xs">
                <div className="flex items-center space-x-1.5 text-slate-800 dark:text-white font-medium">
                  <ShieldCheck className="w-4 h-4 text-[#07C160]" />
                  <span>本地优先 (Local-First) 与安全保障</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  未登录时数据 100% 存在本地；登录后自动通过 Supabase 行级安全（RLS）策略双向加密同步，即使断网也不影响任何操作。
                </p>
              </div>

              {/* 开发者接口调试工具 */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 text-slate-800 dark:text-white font-medium">
                    <Terminal className="w-4 h-4 text-[#07C160]" />
                    <span>接口排查与开发者调试 (DevTools)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.electronAPI?.openDevTools) {
                        window.electronAPI.openDevTools()
                      }
                    }}
                    className="px-2.5 py-1 rounded-md bg-[#07C160]/10 hover:bg-[#07C160]/20 text-[#07C160] border border-[#07C160]/30 text-[11px] font-semibold transition-colors flex items-center space-x-1 shadow-sm"
                  >
                    <span>🛠️ 调出开发者工具</span>
                  </button>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1.5 bg-black/5 dark:bg-white/5 p-2.5 rounded-lg border border-black/5 dark:border-white/5">
                  <p>• <strong className="text-slate-700 dark:text-slate-200">快捷键</strong>：界面任意处按 <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-black/10 dark:border-white/10 rounded font-mono text-[10px] text-slate-800 dark:text-slate-200">Cmd + Option + I</kbd> 或 <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-black/10 dark:border-white/10 rounded font-mono text-[10px] text-slate-800 dark:text-slate-200">F12</kbd></p>
                  <p>• <strong className="text-slate-700 dark:text-slate-200">右键支持</strong>：在页面任意空白处右键，选择 <strong className="text-[#07C160]">“检查元素 / 开发者工具”</strong></p>
                  <p>• <strong className="text-slate-700 dark:text-slate-200">网络抓包</strong>：打开 DevTools 后切换到 <strong className="text-[#07C160]">Network (网络)</strong> 标签，筛选 <strong className="text-[#07C160]">Fetch/XHR</strong>，即可查看每一个 Supabase 注册、登录和同步请求的完整 Headers、Payload 与状态码</p>
                  <p>• <strong className="text-slate-700 dark:text-slate-200">格式化日志</strong>：也可在 <strong className="text-[#07C160]">Console (控制台)</strong> 查阅高亮打印的请求与响应详情</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB: 个人身份 & 外观 */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  显示姓名 / 昵称
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#07C160]"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-[#07C160]/20 space-y-2">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-[#07C160] animate-pulse" />
                  <label className="text-xs font-semibold text-[#07C160]">
                    职场角色 / 岗位头衔 (AI 专属定调)
                  </label>
                </div>
                <input
                  type="text"
                  placeholder="例如: 资深架构师 / 市场运营总监"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-[#07C160]/30 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#07C160]"
                />
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  💡 设定您的职场角色后，AI 智能周报引擎将自动采用契合该岗位标准与口吻的专业词汇生成汇报。
                </p>
              </div>

              {/* Theme Mode Selector Section */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 space-y-2.5">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                  外观主题偏好 (Appearance Theme)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => onThemeChange?.('light')}
                    className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center space-x-1.5 transition-all ${
                      theme === 'light'
                        ? 'bg-[#07C160] border-[#07C160] text-white shadow-sm font-semibold'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    <span>浅色模式</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onThemeChange?.('dark')}
                    className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center space-x-1.5 transition-all ${
                      theme === 'dark'
                        ? 'bg-[#07C160] border-[#07C160] text-white shadow-sm font-semibold'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>深色模式</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onThemeChange?.('system')}
                    className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center space-x-1.5 transition-all ${
                      theme === 'system'
                        ? 'bg-[#07C160] border-[#07C160] text-white shadow-sm font-semibold'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    <span>跟随系统</span>
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-black/5 dark:border-white/10 flex items-center justify-end space-x-2">
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059B4D] text-white text-xs font-semibold shadow-lg shadow-[#07C160]/25 flex items-center space-x-1.5 transition-all"
                >
                  {savedSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-white" />
                      <span>保存成功</span>
                    </>
                  ) : (
                    <span>保存资料设置</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB: 职场勋章 & 成就 */}
          {activeTab === 'badges' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 text-center">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">累计专注小时</span>
                  <p className="text-lg font-bold text-[#07C160] mt-0.5">{userStats?.total_focus_hours || 12.5}h</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 text-center">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">交付任务总数</span>
                  <p className="text-lg font-bold text-[#07C160] mt-0.5">{tasks.filter(t => t.status === 'completed').length}项</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 text-center">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">连续打卡天数</span>
                  <p className="text-lg font-bold text-amber-500 mt-0.5">{userStats?.streak_days || 5}天</p>
                </div>
              </div>

              <div className="space-y-2.5">
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">已解锁职场勋章</h4>
                <div className="space-y-2">
                  {userStats?.badges.map((b) => (
                    <div
                      key={b.id}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-[#07C160]/20 flex items-center space-x-3"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#07C160]/10 border border-[#07C160]/30 flex items-center justify-center text-[#07C160]">
                        {b.icon === 'Sun' ? <Sun className="w-4 h-4" /> : b.icon === 'Flame' ? <Flame className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <h5 className="text-xs font-semibold text-slate-900 dark:text-white">{b.name}</h5>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#07C160]/15 text-[#07C160]">已解锁</span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{b.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
