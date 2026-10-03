import React, { useState } from 'react'
import {
  X,
  Sparkles,
  Calendar,
  Clock,
  Check,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Folder,
  ArrowRight,
  Loader2,
  FileText,
  Dumbbell,
  Laptop,
  BookOpen,
  Settings,
  Bot,
  Zap,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'
import confetti from 'canvas-confetti'
import { Project, Task, ParsedTaskItem, SubTask } from '../types'
import { formatDuration } from './DurationPicker'

interface SmartBreakdownModalProps {
  isOpen: boolean
  onClose: () => void
  projects: Project[]
  onBatchAddTasks: (tasks: Partial<Task>[]) => Promise<void>
  onOpenSettings?: () => void
}

// 预设优秀范例文本，方便用户一键体验
const PRESET_EXAMPLES = [
  {
    icon: Dumbbell,
    name: '居家自重燃脂塑形计划',
    content: `那就纯无器械，主打自重燃脂加线条雕刻，刚好适配你要的穿衣显瘦脱衣有轮廓。周一胸：标准俯卧撑4组×15次，窄距俯卧撑3组×12次，跪姿夹胸俯卧撑3组×18次，接30分钟原地高抬腿。周三背：桌沿反屈伸4组×15次，超人式伸展4组×20次，俯身Y字抬背3组×18次，卷腹3组×20次，接25分钟跳绳或原地跑。周五肩腹：靠墙静推4组×45秒，侧平举自重空臂训练4组×25次，俄罗斯转体3组×30次，接15分钟波比跳间歇。周二周四周六选一天做40分钟快走或慢跑，剩下两天做15分钟全身激活，周日休息。全程不用任何器材，靠自重多次数压体脂，肩胸背的薄线条很快能出来。`,
    defaultProject: 'personal',
  },
  {
    icon: Dumbbell,
    name: '居家哑铃增肌周计划',
    content: `那就改成纯居家哑铃版，不用健身房器械，按一周6练1休来，直接能记进表。
周一胸：热身5分钟开合跳，哑铃平板卧推4组×12次，上斜哑铃卧推用枕头垫背4组×12次，哑铃臂屈伸3组×10次，最后原地高抬腿30分钟。
周三背：哑铃单臂划船左右各4组×12次，俯身哑铃划船4组×12次，哑铃耸肩3组×15次，平板支撑3组×60秒。
周五肩臂：哑铃推举4组×12次，哑铃侧平举4组×15次，哑铃弯举3组×12次，颈后哑铃臂屈伸3组×12次，波比跳15分钟间歇。
周二、四、六选一天纯有氧，跳绳或原地跑45分钟，剩下两天一天做轻量哑铃激活，周日休息。组间歇90秒，重量选做到第12次刚好力竭的，每周慢慢加次数或重量`,
    defaultProject: 'personal',
  },
  {
    icon: Laptop,
    name: '敏捷研发冲刺周排期',
    content: `周一：梳理新版本核心业务需求，对齐原型细节与后端接口协议，组织研发评审会。
周二：搭建数据模型表结构与本地迁移，实现用户鉴权与会话缓存模块。
周三：联调第三方云存储与大文件分片上传功能，编写接口单元测试用例。
周四：前端完成看板视图与日历网格拖拽联动，修复边缘偶发渲染卡顿问题。
周五：全量集成测试与预发布验证，编写发版更新说明并完成线上自动化部署。`,
    defaultProject: 'work',
  },
  {
    icon: BookOpen,
    name: '考研/考试周度复习计划',
    content: `周一：高数第七章微分方程考点复盘，精做历年真题大题10道并整理错题本。
周二：英语真题阅读精读2篇，整理生词与长难句结构，背诵高频写作句型。
周三：专业课数据结构树与图算法推演，手写经典遍历与最短路径代码实现。
周四：高数多元函数积分计算专项突破，限时模拟做题并自测评分。
周五：政治马原核心考点梳理，刷选择题100道并标记易混淆知识盲区。
周六：全真全真全科模拟实战模考，周日整理全周错题并查漏补缺。`,
    defaultProject: 'personal',
  },
]

export const SmartBreakdownModal: React.FC<SmartBreakdownModalProps> = ({
  isOpen,
  onClose,
  projects,
  onBatchAddTasks,
  onOpenSettings,
}) => {
  const [inputText, setInputText] = useState('')
  const [baseWeek, setBaseWeek] = useState<'current' | 'next'>('next')
  const [selectedProjectId, setSelectedProjectId] = useState('personal')
  const [isParsing, setIsParsing] = useState(false)
  const [parsedItems, setParsedItems] = useState<ParsedTaskItem[]>([])
  const [hasParsed, setHasParsed] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  // 是否启用 AI 深度解析开关（支持持久化记忆）
  const [enableAI, setEnableAI] = useState(() => {
    const saved = localStorage.getItem('taskflow_use_ai_breakdown')
    return saved !== null ? saved === 'true' : true
  })

  const toggleEnableAI = () => {
    const nextVal = !enableAI
    setEnableAI(nextVal)
    localStorage.setItem('taskflow_use_ai_breakdown', String(nextVal))
  }

  // 从全局通用设置中获取通用大模型配置
  const globalApiKey = localStorage.getItem('taskflow_ai_key') || ''
  const globalBaseUrl = localStorage.getItem('taskflow_ai_base_url') || ''
  const globalModel = localStorage.getItem('taskflow_ai_model') || 'deepseek-chat'

  if (!isOpen) return null

  // 执行智能拆解
  const handleParse = async () => {
    const trimmed = inputText.trim()
    if (!trimmed) return
    setIsParsing(true)

    try {
      // 若开启 AI 且全局设置已配置 Key，则走大模型；若关闭或未配 Key 则走本地离线规则
      const effectiveKey = enableAI ? globalApiKey.trim() : ''
      const effectiveBaseUrl = enableAI ? globalBaseUrl.trim() : ''
      const effectiveModel = enableAI ? globalModel.trim() : ''

      let result: ParsedTaskItem[] = []

      if (window.electronAPI?.smartParseTasks) {
        result = await window.electronAPI.smartParseTasks({
          text: trimmed,
          baseWeek,
          defaultProjectId: selectedProjectId,
          apiKey: effectiveKey,
          baseUrl: effectiveBaseUrl,
          model: effectiveModel,
        })
      }

      const formatted = result.map((item, idx) => ({
        ...item,
        id: `parsed_${Date.now()}_${idx}`,
        selected: true,
      }))

      setParsedItems(formatted)
      setHasParsed(true)
      if (formatted.length > 0) {
        setExpandedIndex(0)
      }
    } catch (err) {
      console.error('Smart parse error:', err)
    } finally {
      setIsParsing(false)
    }
  }

  // 批量入表保存
  const handleBatchSubmit = async () => {
    const selectedTasks = parsedItems.filter((item) => item.selected !== false)
    if (selectedTasks.length === 0) return

    setIsSubmitting(true)
    try {
      const tasksToCreate: Partial<Task>[] = selectedTasks.map((item) => ({
        title: item.title,
        notes: item.notes || '',
        priority: item.priority || 'p2',
        project_id: item.project_id || selectedProjectId,
        estimated_minutes: item.estimated_minutes || 30,
        due_date: item.due_date,
        is_today: item.is_today ?? false,
        status: 'todo',
        subtasks: (item.subtasks || []).map((st, sIdx) => ({
          id: `st_${Date.now()}_${sIdx}_${Math.random().toString(36).slice(2, 6)}`,
          title: st.title,
          completed: false,
          estimated_minutes: st.estimated_minutes || 15,
        })),
      }))

      await onBatchAddTasks(tasksToCreate)

      // 释放礼花特效
      try {
        confetti({
          particleCount: 60,
          spread: 70,
          origin: { y: 0.6 },
        })
      } catch {}

      onClose()
      // 重置状态
      setInputText('')
      setParsedItems([])
      setHasParsed(false)
    } catch (err) {
      console.error('Batch add tasks error:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedCount = parsedItems.filter((i) => i.selected !== false).length
  const totalSubtasksCount = parsedItems.reduce(
    (acc, curr) => acc + (curr.subtasks?.length || 0),
    0
  )
  const totalEstimatedMinutes = parsedItems.reduce(
    (acc, curr) => acc + (curr.estimated_minutes || 0),
    0
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-drag">
      <div className="w-full max-w-2xl bg-white dark:bg-[#1E1E1E] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-slate-900 dark:text-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-black/5 dark:border-white/10 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-white/[0.02]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-md shadow-[#07C160]/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
                <span>文本智能拆解与排期入表</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#07C160]/15 text-[#07C160] font-mono font-medium">
                  AI + 规则双引擎
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                粘贴长篇计划、排期表或健身方案，自动识别星期日期并拆解为可执行待办与子步骤
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Quick Preset Buttons */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
              <span>快速填入示例体验:</span>
              {inputText && (
                <button
                  type="button"
                  onClick={() => setInputText('')}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                >
                  清空输入
                </button>
              )}
            </div>
            <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
              {PRESET_EXAMPLES.map((ex, idx) => {
                const Icon = ex.icon
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setInputText(ex.content)
                      setSelectedProjectId(ex.defaultProject)
                    }}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 hover:bg-[#07C160]/10 hover:text-[#07C160] text-slate-600 dark:text-slate-300 text-xs font-medium border border-slate-200 dark:border-slate-800 transition-all cursor-pointer"
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{ex.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Driver Engine Status & AI Toggle */}
          <div className="flex items-center justify-between px-1 text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-slate-400 font-medium">驱动模式:</span>
              {enableAI ? (
                globalApiKey.trim() ? (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-500/20">
                    <Bot className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                    <span>AI 大模型深度语义解析 ({globalModel})</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium border border-amber-500/20">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                    <span>已启用 AI，但全局未配 Key (自动降级为本地规则)</span>
                  </span>
                )
              ) : (
                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium border border-blue-500/20">
                  <Zap className="w-3.5 h-3.5 text-blue-500" />
                  <span>本地启发式规则引擎 (离线·免Key·极速)</span>
                </span>
              )}
            </div>

            <div className="flex items-center space-x-3">
              {/* 开关：是否启用 AI */}
              <label className="flex items-center space-x-1.5 cursor-pointer select-none">
                <span className="text-slate-600 dark:text-slate-300 font-medium text-xs">
                  启用 AI 转化
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enableAI}
                  onClick={toggleEnableAI}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    enableAI ? 'bg-[#07C160]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      enableAI ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </label>

              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="flex items-center space-x-1 text-slate-400 hover:text-[#07C160] dark:hover:text-[#07C160] transition-colors cursor-pointer text-xs"
                  title="前往个人中心配置或更改通用 AI 模型与 Key"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>通用设置</span>
                </button>
              )}
            </div>
          </div>

          {/* Text Input Area */}
          <div className="relative">
            <textarea
              rows={hasParsed ? 3 : 6}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="在此粘贴包含多天排期、周度计划、训练安排或待办清单的文本...&#10;系统将自动提取每天主题、安排具体日期、预估用时并智能拆解子任务动作！"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#07C160] focus:ring-2 focus:ring-[#07C160]/20 transition-all font-sans leading-relaxed"
            />
          </div>

          {/* Parse Options Bar */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-black/5 dark:border-white/5">
            <div className="flex items-center space-x-3 text-xs">
              {/* Project selector */}
              <div className="flex items-center space-x-1 text-slate-500 dark:text-slate-400">
                <Folder className="w-3.5 h-3.5" />
                <span>归属:</span>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:border-[#07C160]"
                >
                  {(projects || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Target week selector */}
              <div className="flex items-center space-x-1 text-slate-500 dark:text-slate-400">
                <Calendar className="w-3.5 h-3.5" />
                <span>排期基准:</span>
                <select
                  value={baseWeek}
                  onChange={(e) => setBaseWeek(e.target.value as 'current' | 'next')}
                  className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:border-[#07C160]"
                >
                  <option value="next">下周一至周日 (推荐周计划)</option>
                  <option value="current">本周内排期</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleParse}
              disabled={isParsing || !inputText.trim()}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-xs font-semibold shadow-md shadow-emerald-500/20 flex items-center space-x-1.5 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer active:scale-95"
            >
              {isParsing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>正在深度解析排期...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{hasParsed ? '重新解析拆解' : '🚀 开始智能拆解'}</span>
                </>
              )}
            </button>
          </div>

          {/* Parsed Tasks List Preview */}
          {hasParsed && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    拆解预览 (勾选需入表的项目)
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                    共 {parsedItems.length} 项主任务 · {totalSubtasksCount} 个子步骤 · 预计总投入 {formatDuration(totalEstimatedMinutes, true)}
                  </span>
                </div>

                <div className="flex items-center space-x-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      const allSelected = parsedItems.every((i) => i.selected !== false)
                      setParsedItems((prev) =>
                        prev.map((item) => ({ ...item, selected: !allSelected }))
                      )
                    }}
                    className="text-[#07C160] hover:underline font-medium text-[11px]"
                  >
                    {parsedItems.every((i) => i.selected !== false) ? '取消全选' : '全选'}
                  </button>
                </div>
              </div>

              {/* Tasks Cards */}
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {parsedItems.map((item, idx) => {
                  const isExpanded = expandedIndex === idx
                  return (
                    <div
                      key={item.id || idx}
                      className={`p-3.5 rounded-xl border transition-all ${
                        item.selected !== false
                          ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-950/40 border-slate-200/50 dark:border-slate-800/40 opacity-60'
                      }`}
                    >
                      {/* Top Row: Checkbox, Date, Title, Minutes */}
                      <div className="flex items-center space-x-2.5">
                        <input
                          type="checkbox"
                          checked={item.selected !== false}
                          onChange={(e) => {
                            const checked = e.target.checked
                            setParsedItems((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, selected: checked } : it))
                            )
                          }}
                          className="w-4 h-4 rounded text-[#07C160] focus:ring-[#07C160] border-slate-300 dark:border-slate-700 cursor-pointer"
                        />

                        {/* Date badge */}
                        <div className="flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-mono font-medium shrink-0">
                          <Calendar className="w-3 h-3 text-[#07C160]" />
                          <span>{item.due_date}</span>
                        </div>

                        {/* Engine tag */}
                        {item.engine === 'ai' ? (
                          <div className="flex items-center space-x-0.5 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono font-medium shrink-0">
                            <Bot className="w-3 h-3 text-emerald-500" />
                            <span>AI拆解</span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-0.5 px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-mono font-medium shrink-0">
                            <Zap className="w-3 h-3 text-blue-500" />
                            <span>规则拆解</span>
                          </div>
                        )}

                        {/* Title Input (Editable) */}
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) => {
                            const val = e.target.value
                            setParsedItems((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, title: val } : it))
                            )
                          }}
                          className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none transition-colors"
                        />

                        {/* Estimated Minutes */}
                        <div className="flex items-center space-x-1 text-slate-500 dark:text-slate-400 font-mono text-[11px] shrink-0">
                          <Clock className="w-3 h-3 text-amber-500" />
                          <span>{item.estimated_minutes}m</span>
                        </div>

                        {/* Expand Subtasks Button */}
                        {item.subtasks && item.subtasks.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                            title="展开/折叠子任务明细"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>

                      {/* Subtasks Accordion Content */}
                      {isExpanded && item.subtasks && item.subtasks.length > 0 && (
                        <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5 pl-6">
                          <div className="text-[10px] text-slate-400 font-medium flex items-center justify-between">
                            <span>子任务拆解步骤 ({item.subtasks.length} 项):</span>
                            {item.notes && <span className="text-slate-400 truncate max-w-[280px]">说明: {item.notes}</span>}
                          </div>
                          <div className="space-y-1">
                            {item.subtasks.map((st, sIdx) => (
                              <div
                                key={sIdx}
                                className="flex items-center justify-between text-xs py-1 px-2 rounded-md bg-slate-50 dark:bg-slate-950/60 border border-slate-200/50 dark:border-slate-800/50"
                              >
                                <div className="flex items-center space-x-1.5 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#07C160]" />
                                  <span className="truncate text-slate-700 dark:text-slate-300 font-medium">
                                    {st.title}
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-2">
                                  {st.estimated_minutes || 15} 分钟
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-black/5 dark:border-white/10 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-white/[0.02]">
          <div className="text-xs text-slate-400">
            {hasParsed ? (
              <span>
                已勾选 <strong className="text-[#07C160] font-semibold">{selectedCount}</strong> / {parsedItems.length} 项任务即将存入系统
              </span>
            ) : (
              <span>点击「开始智能拆解」预览任务明细与排期</span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              取消
            </button>

            {hasParsed && (
              <button
                type="button"
                onClick={handleBatchSubmit}
                disabled={isSubmitting || selectedCount === 0}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059B4D] text-white shadow-lg shadow-[#07C160]/25 flex items-center space-x-1.5 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>正在批量入表...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>一键批量生成 ({selectedCount} 项)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
