import React, { useState, useEffect } from 'react'
import { X, Calendar, Clock, Inbox, Sun, Folder, Plus, Trash2, Check, ListTodo, MessageSquare, Sparkles, Loader2, Settings } from 'lucide-react'
import { Task, Project, SubTask } from '../types'
import { DurationPicker, formatDuration } from './DurationPicker'
import { DatePicker } from './DatePicker'

interface TaskModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (taskData: Partial<Task>) => void
  editingTask?: Task | null
  projects: Project[]
  defaultIsToday?: boolean
  defaultDueDate?: string
  defaultProjectId?: string
  onOpenAISettings?: () => void
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingTask,
  projects,
  defaultIsToday = false,
  defaultDueDate,
  defaultProjectId = 'work',
  onOpenAISettings,
}) => {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [priority, setPriority] = useState<Task['priority']>('p2')
  const [projectId, setProjectId] = useState(defaultProjectId)
  const [estimatedMinutes, setEstimatedMinutes] = useState(30)
  const [targetLocation, setTargetLocation] = useState<'inbox' | 'today' | 'date'>('inbox')
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0])
  const [subtasks, setSubtasks] = useState<SubTask[]>([])
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [newSubtaskMinutes, setNewSubtaskMinutes] = useState(15)
  const [expandedNoteSubtaskId, setExpandedNoteSubtaskId] = useState<string | null>(null)
  const [isAIBreakingDown, setIsAIBreakingDown] = useState(false)

  // Date Presets Calculation
  const todayObj = new Date()
  const todayStr = todayObj.toISOString().split('T')[0]

  const tomorrowObj = new Date()
  tomorrowObj.setDate(todayObj.getDate() + 1)
  const tomorrowStr = tomorrowObj.toISOString().split('T')[0]

  const nextMonObj = new Date()
  const dayOfWeek = todayObj.getDay()
  const daysUntilNextMon = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
  nextMonObj.setDate(todayObj.getDate() + daysUntilNextMon)
  const nextMondayStr = nextMonObj.toISOString().split('T')[0]

  useEffect(() => {
    if (editingTask) {
      setTitle(editingTask.title)
      setNotes(editingTask.notes || '')
      setPriority(editingTask.priority)
      setProjectId(editingTask.project_id || 'work')
      setEstimatedMinutes(editingTask.estimated_minutes || 30)
      setTargetLocation(editingTask.is_today ? 'today' : 'inbox')
      setDueDate(editingTask.due_date || todayStr)
      setSubtasks(editingTask.subtasks ? [...editingTask.subtasks] : [])
    } else {
      setTitle('')
      setNotes('')
      setPriority('p2')
      setProjectId(defaultProjectId || 'work')
      setEstimatedMinutes(30)
      setSubtasks([])
      setNewSubtaskTitle('')
      setNewSubtaskMinutes(15)

      if (defaultDueDate) {
        setTargetLocation('date')
        setDueDate(defaultDueDate)
      } else if (defaultIsToday) {
        setTargetLocation('today')
        setDueDate(todayStr)
      } else {
        setTargetLocation('inbox')
        setDueDate(todayStr)
      }
    }
  }, [editingTask, isOpen, defaultIsToday, defaultDueDate, defaultProjectId, todayStr])

  if (!isOpen) return null

  const handleAddSubtask = () => {
    const text = newSubtaskTitle.trim()
    if (!text) return
    const newSt: SubTask = {
      id: 'st_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      title: text,
      completed: false,
      estimated_minutes: newSubtaskMinutes,
    }
    setSubtasks((prev) => [...prev, newSt])
    setNewSubtaskTitle('')
  }

  const handleToggleSubtask = (stId: string) => {
    setSubtasks((prev) =>
      prev.map((s) => (s.id === stId ? { ...s, completed: !s.completed } : s))
    )
  }

  const handleUpdateSubtaskTitle = (stId: string, newTitle: string) => {
    setSubtasks((prev) =>
      prev.map((s) => (s.id === stId ? { ...s, title: newTitle } : s))
    )
  }

  const handleUpdateSubtaskMinutes = (stId: string, minutes: number) => {
    setSubtasks((prev) =>
      prev.map((s) => (s.id === stId ? { ...s, estimated_minutes: minutes } : s))
    )
  }

  const handleUpdateSubtaskNotes = (stId: string, notes: string) => {
    setSubtasks((prev) =>
      prev.map((s) => (s.id === stId ? { ...s, notes } : s))
    )
  }

  // 完成多子任务后，可以总结出备注写入主任务说明（作为AI总结数据源）
  const handleSummarizeSubtasks = () => {
    const completed = subtasks.filter((s) => s.completed)
    const itemsToSummarize = completed.length > 0 ? completed : subtasks
    if (itemsToSummarize.length === 0) return

    const summaryLines = itemsToSummarize.map((s, idx) => {
      const notePart = s.notes && s.notes.trim() ? ` — 成果: ${s.notes.trim()}` : ''
      return `• 【步骤${idx + 1}】${s.title}${s.completed ? ' (已完成)' : ''}${notePart}`
    })

    const summaryBlock = `\n\n📌 **子步骤成果总结 (${completed.length}/${subtasks.length}已完成)**：\n` + summaryLines.join('\n')
    setNotes((prev) => (prev ? prev.trim() + summaryBlock : summaryBlock.trim()))
  }

  // AI 智能规划与子任务拆解
  const handleAIBreakdownTask = async () => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return
    setIsAIBreakingDown(true)

    try {
      const apiKey = localStorage.getItem('taskflow_ai_key') || ''
      const baseUrl = localStorage.getItem('taskflow_ai_base_url') || ''
      const model = localStorage.getItem('taskflow_ai_model') || ''
      let result: { title: string; estimated_minutes: number }[] = []

      if (window.electronAPI?.aiBreakdownTask) {
        result = await window.electronAPI.aiBreakdownTask({
          title: trimmedTitle,
          notes: notes.trim(),
          apiKey,
          baseUrl,
          model,
        })
      } else {
        // Fallback for browser environment
        const text = `${trimmedTitle} ${notes || ''}`.toLowerCase()
        if (/(代码|开发|编程|接口|架构|重构|前端|后端|api|bug|上线|部署|优化|feature)/i.test(text)) {
          result = [
            { title: '梳理技术方案与设计核心接口规范', estimated_minutes: 25 },
            { title: '搭建基础代码结构与实现核心业务逻辑', estimated_minutes: 45 },
            { title: '编写边界测试用例与异常场景验证', estimated_minutes: 30 },
            { title: 'Code Review 与部署联调上线', estimated_minutes: 20 },
          ]
        } else if (/(文档|方案|需求|报告|总结|调研|立项|规划|prd)/i.test(text)) {
          result = [
            { title: '收集整理背景资料与核心诉求边界', estimated_minutes: 25 },
            { title: '拟定文档核心逻辑骨架与各章节大纲', estimated_minutes: 20 },
            { title: '撰写主体详细内容与关键数据图表论证', estimated_minutes: 45 },
            { title: '通篇润色排版与关键干系人对齐确认', estimated_minutes: 20 },
          ]
        } else if (/(会议|沟通|同步|汇报|对齐|讨论|周会)/i.test(text)) {
          result = [
            { title: '拟定会议议程与关键议题讨论清单', estimated_minutes: 15 },
            { title: '准备汇报演示文稿与核心支撑材料', estimated_minutes: 30 },
            { title: '组织召开会议并推动形成结论共识', estimated_minutes: 45 },
            { title: '梳理会议纪要并同步待办 Action Items', estimated_minutes: 15 },
          ]
        } else if (/(学习|阅读|读书|研究|复习|课程|考试|看书)/i.test(text)) {
          result = [
            { title: '通读全貌框架，标记核心概念与难点', estimated_minutes: 30 },
            { title: '精读重点章节并记录关键思考笔记', estimated_minutes: 45 },
            { title: '结合案例实操推演与知识点自测', estimated_minutes: 30 },
            { title: '梳理思维导图与形成个人实践心得', estimated_minutes: 25 },
          ]
        } else if (/(设计|ui|ux|原型|交互|视觉|海报)/i.test(text)) {
          result = [
            { title: '收集优秀参考案例与明确设计风格', estimated_minutes: 25 },
            { title: '绘制低保真线框图与梳理交互流转', estimated_minutes: 35 },
            { title: '产出高保真视觉稿与交互状态细节', estimated_minutes: 50 },
            { title: '组件规范整理与切图资源交付走查', estimated_minutes: 20 },
          ]
        } else {
          result = [
            { title: '明确核心目标与验收标准', estimated_minutes: 15 },
            { title: '准备执行所需资源与前置依赖', estimated_minutes: 20 },
            { title: '核心阶段攻坚与实质成果推进', estimated_minutes: 45 },
            { title: '复盘自查验收与交付成果归档', estimated_minutes: 20 },
          ]
        }
      }

      if (result && result.length > 0) {
        const generatedSubtasks: SubTask[] = result.map((item, idx) => ({
          id: 'st_ai_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).slice(2, 6),
          title: item.title,
          completed: false,
          estimated_minutes: item.estimated_minutes,
        }))

        if (subtasks.length > 0) {
          const replace = window.confirm(
            '当前已有子任务，是否覆盖？\n• 点击【确定】替换全部子任务\n• 点击【取消】追加到现有子任务末尾'
          )
          if (replace) {
            setSubtasks(generatedSubtasks)
          } else {
            setSubtasks((prev) => [...prev, ...generatedSubtasks])
          }
        } else {
          setSubtasks(generatedSubtasks)
        }
      }
    } catch (err) {
      console.error('AI breakdown error:', err)
    } finally {
      setIsAIBreakingDown(false)
    }
  }

  const handleDeleteSubtask = (stId: string) => {
    setSubtasks((prev) => prev.filter((s) => s.id !== stId))
  }

  const subtasksTotalMinutes = subtasks.reduce(
    (acc, s) => acc + (s.estimated_minutes || 15),
    0
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const finalTitle = title.trim() || '未命名新任务'

    const isToday = targetLocation === 'today'
    const finalDueDate = targetLocation === 'date' ? dueDate : todayStr

    // 如果有子任务，主任务用时直接使用子任务用时合集
    const finalCalculatedMinutes =
      subtasks.length > 0 ? subtasksTotalMinutes : (estimatedMinutes || 30)

    onSave({
      title: finalTitle,
      notes: notes.trim(),
      priority,
      project_id: projectId,
      estimated_minutes: finalCalculatedMinutes,
      is_today: isToday,
      due_date: finalDueDate,
      status: editingTask ? editingTask.status : 'todo',
      subtasks,
    })
    onClose()
  }

  const completedSubtasksCount = subtasks.filter((s) => s.completed).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-drag">
      <div className="w-full max-w-lg bg-white dark:bg-[#1E1E1E] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-slate-900 dark:text-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-black/5 dark:border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {editingTask ? '编辑任务' : '新建任务'}
            </h2>
            {subtasks.length > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#07C160]/10 text-[#07C160] font-mono font-medium">
                {completedSubtasksCount}/{subtasks.length} 项子任务
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <input
              type="text"
              placeholder="想做点什么？(例如: 上线个人软件项目)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-700/60 focus:border-[#07C160] text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <textarea
              placeholder="添加补充说明、关键要点或相关链接 (可选)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-700/60 focus:border-[#07C160] text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none transition-colors resize-none"
            />
          </div>

          {/* Subtasks Checklist Section (拆分子步骤与时间配置) */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <ListTodo className="w-3.5 h-3.5 text-[#07C160]" />
                <span>子任务拆解清单 ({completedSubtasksCount}/{subtasks.length})</span>
              </div>
              <div className="flex items-center space-x-2">
                {subtasks.length > 0 && (
                  <div className="flex items-center space-x-2 mr-1">
                    <div className="w-14 h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-[#07C160] transition-all duration-300"
                        style={{
                          width: `${Math.round((completedSubtasksCount / subtasks.length) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-[#07C160] font-mono font-medium">
                      {Math.round((completedSubtasksCount / subtasks.length) * 100)}%
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleAIBreakdownTask}
                  disabled={isAIBreakingDown || !title.trim()}
                  className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-emerald-500/15 via-teal-500/15 to-[#07C160]/10 hover:from-emerald-500/25 hover:to-teal-500/25 text-[#07C160] dark:text-emerald-400 border border-[#07C160]/30 text-xs font-semibold transition-all shadow-sm active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                  title={title.trim() ? '根据任务目标与身份，AI 智能规划拆解步骤与建议时间' : '请先在上方输入任务标题'}
                >
                  {isAIBreakingDown ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#07C160]" />
                      <span>规划拆解中...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-[#07C160]" />
                      <span>✨ AI 规划拆解</span>
                    </>
                  )}
                </button>

                {onOpenAISettings && (
                  <button
                    type="button"
                    onClick={onOpenAISettings}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                    title="配置大模型 API Key / 切换模型 (设置)"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* List of subtasks with inline title edit, time config, notes, and delete */}
            {subtasks.length > 0 && (
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {subtasks.map((st) => (
                  <div
                    key={st.id}
                    className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-white/5 text-xs group space-y-1.5 transition-all"
                  >
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handleToggleSubtask(st.id)}
                        className={`w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0 ${
                          st.completed
                            ? 'bg-[#07C160] border-[#07C160] text-white'
                            : 'border-slate-300 dark:border-slate-600 hover:border-[#07C160] bg-white dark:bg-slate-950'
                        }`}
                      >
                        {st.completed && <Check className="w-3 h-3 stroke-[3]" />}
                      </button>

                      {/* Inline title editing */}
                      <input
                        type="text"
                        value={st.title}
                        onChange={(e) => handleUpdateSubtaskTitle(st.id, e.target.value)}
                        className={`flex-1 min-w-0 bg-transparent border-none p-0 focus:outline-none focus:ring-0 text-xs ${
                          st.completed
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                        placeholder="子任务名称..."
                      />

                      {/* Note button */}
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedNoteSubtaskId(
                            expandedNoteSubtaskId === st.id ? null : st.id
                          )
                        }
                        className={`p-1 rounded transition-colors ${
                          st.notes
                            ? 'text-[#07C160] bg-[#07C160]/10 hover:bg-[#07C160]/20'
                            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 opacity-60 group-hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
                        }`}
                        title={st.notes ? '已填写成果备注 (点击编辑)' : '添加完成备注/成果心得 (作为AI总结数据源)'}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>

                      {/* Modern DurationPicker per subtask */}
                      <DurationPicker
                        value={st.estimated_minutes || 15}
                        onChange={(m) => handleUpdateSubtaskMinutes(st.id, m)}
                        size="sm"
                      />

                      <button
                        type="button"
                        onClick={() => handleDeleteSubtask(st.id)}
                        className="p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        title="删除此子项"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Subtask Completion Note Row */}
                    {(st.notes !== undefined || expandedNoteSubtaskId === st.id) && (
                      <div className="flex items-center space-x-1.5 pt-1.5 border-t border-black/[0.04] dark:border-white/5 pl-6">
                        <span className="text-[10px] text-[#07C160] font-medium shrink-0 flex items-center space-x-0.5">
                          <Sparkles className="w-2.5 h-2.5" />
                          <span>成果备注:</span>
                        </span>
                        <input
                          type="text"
                          value={st.notes || ''}
                          onChange={(e) => handleUpdateSubtaskNotes(st.id, e.target.value)}
                          placeholder="记录该步骤的心得、产出成果或结论 (作为AI总结数据源)..."
                          className="flex-1 bg-transparent border-none p-0 focus:outline-none focus:ring-0 text-[11px] text-slate-700 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-500"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Subtask Rapid Input with Modern DurationPicker */}
            <div className="flex items-center space-x-1.5">
              <input
                type="text"
                placeholder="添加子步骤，按 Enter 连续拆解录入..."
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddSubtask()
                  }
                }}
                className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#07C160]"
              />

              <DurationPicker
                value={newSubtaskMinutes}
                onChange={setNewSubtaskMinutes}
                size="md"
                showUnitText={true}
              />

              <button
                type="button"
                onClick={handleAddSubtask}
                disabled={!newSubtaskTitle.trim()}
                className="px-2.5 py-1.5 rounded-lg bg-[#07C160]/10 hover:bg-[#07C160]/20 disabled:opacity-40 text-[#07C160] text-xs font-semibold flex items-center space-x-1 transition-colors shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>添加</span>
              </button>
            </div>

            {/* Smart Summary of Subtask Minutes & AI Subtask Summarizer */}
            {subtasks.length > 0 && (
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-black/5 dark:border-white/5 flex-wrap gap-2">
                <div className="flex items-center space-x-2">
                  <span>
                    子项累计用时: <strong className="text-slate-700 dark:text-slate-200 font-mono">{formatDuration(subtasksTotalMinutes, true)}</strong>
                  </span>
                  <span className="text-[#07C160] flex items-center space-x-1 font-medium">
                    <Check className="w-3 h-3 stroke-[3]" />
                    <span>已自动作为主任务总用时</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleSummarizeSubtasks}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-[#07C160]/10 hover:bg-[#07C160]/20 text-[#07C160] font-medium transition-colors cursor-pointer"
                  title="将子任务执行成果与备注自动提炼汇总到上方任务说明中，作为后续 AI 周报的数据源"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>提炼总结到任务备注 (AI数据源)</span>
                </button>
              </div>
            )}
          </div>

          {/* Storage Target Location Switcher */}
          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1.5 font-semibold uppercase tracking-wider">
              任务存储归属 (Storage Location)
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTargetLocation('inbox')}
                className={`flex items-center justify-center space-x-1.5 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                  targetLocation === 'inbox'
                    ? 'bg-[#07C160] border-[#07C160] text-white shadow-md shadow-[#07C160]/20 font-semibold'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Inbox className="w-3.5 h-3.5" />
                <span>Inbox 收集箱</span>
              </button>

              <button
                type="button"
                onClick={() => setTargetLocation('today')}
                className={`flex items-center justify-center space-x-1.5 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                  targetLocation === 'today'
                    ? 'bg-[#07C160] border-[#07C160] text-white shadow-md shadow-[#07C160]/20 font-semibold'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Today 聚焦</span>
              </button>

              <button
                type="button"
                onClick={() => setTargetLocation('date')}
                className={`flex items-center justify-center space-x-1.5 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                  targetLocation === 'date'
                    ? 'bg-[#07C160] border-[#07C160] text-white shadow-md shadow-[#07C160]/20 font-semibold'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>指定日期</span>
              </button>
            </div>
          </div>

          {/* Date Selector Box (visible when targetLocation === 'date') */}
          {targetLocation === 'date' && (
            <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-[#07C160]/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-emerald-800 dark:text-emerald-300 font-semibold">安排具体执行日期:</label>
                <DatePicker
                  value={dueDate}
                  onChange={setDueDate}
                  size="sm"
                  align="right"
                />
              </div>

              {/* One-Tap Quick Date Presets */}
              <div className="flex items-center space-x-2 pt-1 border-t border-[#07C160]/20">
                <span className="text-[11px] text-emerald-800/80 dark:text-emerald-300/70 font-medium">快捷预设:</span>
                <button
                  type="button"
                  onClick={() => setDueDate(todayStr)}
                  className={`px-2.5 py-1 rounded-md text-[11px] border transition-colors ${
                    dueDate === todayStr
                      ? 'bg-[#07C160] border-[#07C160] text-white font-semibold'
                      : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  今天 ({todayStr.slice(5)})
                </button>
                <button
                  type="button"
                  onClick={() => setDueDate(tomorrowStr)}
                  className={`px-2.5 py-1 rounded-md text-[11px] border transition-colors ${
                    dueDate === tomorrowStr
                      ? 'bg-[#07C160] border-[#07C160] text-white font-semibold'
                      : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  明天 ({tomorrowStr.slice(5)})
                </button>
                <button
                  type="button"
                  onClick={() => setDueDate(nextMondayStr)}
                  className={`px-2.5 py-1 rounded-md text-[11px] border transition-colors ${
                    dueDate === nextMondayStr
                      ? 'bg-[#07C160] border-[#07C160] text-white font-semibold'
                      : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  下周一 ({nextMondayStr.slice(5)})
                </button>
              </div>
            </div>
          )}

          {/* Options Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {/* Priority */}
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1.5 font-medium">优先级</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Task['priority'])}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700/60 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#07C160]"
              >
                <option value="p1">🔴 P1 紧急重要</option>
                <option value="p2">🟡 P2 重要优先</option>
                <option value="p3">🔵 P3 普通处理</option>
                <option value="p4">⚪ P4 选做/低优</option>
              </select>
            </div>

            {/* Project */}
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1.5 font-medium">所属分类项目</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700/60 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#07C160]"
              >
                {(projects || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                主任务预估总用时
              </label>
              {subtasks.length > 0 && (
                <span className="text-[10px] text-[#07C160] font-medium flex items-center space-x-1">
                  <Check className="w-3 h-3 stroke-[3]" />
                  <span>已直接按子任务合集计算</span>
                </span>
              )}
            </div>

            {subtasks.length > 0 ? (
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#07C160]/10 border border-[#07C160]/30 text-xs">
                <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-200">
                  <Clock className="w-4 h-4 text-[#07C160] shrink-0" />
                  <span>
                    子任务共 <strong>{subtasks.length}</strong> 项，自动合并累计用时:
                  </span>
                </div>
                <div className="text-sm font-bold font-mono text-[#07C160] flex items-center space-x-1">
                  <span>{subtasksTotalMinutes} 分钟</span>
                  <span className="text-[10px] font-normal text-slate-400">({subtasksTotalMinutes}m)</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 flex-wrap gap-y-1.5">
                {[15, 25, 30, 45, 60, 90, 120].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setEstimatedMinutes(m)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
                      estimatedMinutes === m
                        ? 'bg-[#07C160] text-white font-semibold shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-white/5 hover:border-[#07C160]/40 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {m === 25 ? '25m 🍅' : `${m}m`}
                  </button>
                ))}

                <div className="relative inline-flex items-center">
                  <input
                    type="number"
                    min={1}
                    max={480}
                    step={5}
                    value={estimatedMinutes}
                    onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
                    className="w-20 px-2 py-1 pr-6 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#07C160]"
                    placeholder="自定义"
                  />
                  <span className="absolute right-2 text-[10px] text-slate-400 pointer-events-none">
                    分
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-black/5 dark:border-white/10 flex items-center justify-end space-x-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059B4D] text-white shadow-lg shadow-[#07C160]/25 transition-all"
            >
              保存任务
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
