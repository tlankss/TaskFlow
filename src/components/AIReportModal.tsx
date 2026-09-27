import React, { useState } from 'react'
import { X, Sparkles, Copy, Check, Settings, Loader2 } from 'lucide-react'
import { Task } from '../types'

interface AIReportModalProps {
  isOpen: boolean
  onClose: () => void
  completedTasks: Task[]
}

export const AIReportModal: React.FC<AIReportModalProps> = ({
  isOpen,
  onClose,
  completedTasks,
}) => {
  const [report, setReport] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [apiKey, setApiKey] = useState(localStorage.getItem('taskflow_ai_key') || '')
  const [showSettings, setShowSettings] = useState(false)

  if (!isOpen) return null

  const handleGenerate = async () => {
    setLoading(true)
    try {
      const baseUrl = localStorage.getItem('taskflow_ai_base_url') || ''
      const model = localStorage.getItem('taskflow_ai_model') || ''
      const result = await window.electronAPI.generateAIWeeklyReport({
        apiKey: apiKey.trim(),
        baseUrl,
        model,
        tasks: completedTasks,
      })
      setReport(result)
    } catch (err) {
      console.error('Failed to generate report:', err)
      setReport('生成报告失败，请检查网络或 API 配置。')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    if (!report) return
    navigator.clipboard.writeText(report)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveSettings = () => {
    localStorage.setItem('taskflow_ai_key', apiKey.trim())
    setShowSettings(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md no-drag">
      <div className="w-full max-w-2xl bg-white dark:bg-[#1E1E1E] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-slate-900 dark:text-slate-100 transition-colors">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent dark:from-emerald-950/40 dark:via-slate-900 border-b border-black/5 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#07C160]/15 border border-[#07C160]/30 flex items-center justify-center text-[#07C160]">
              <Sparkles className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">AI 智能周报归纳引擎</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">已提取本周完成的 {completedTasks.length} 项有效交付任务</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              title="配置 AI API Key"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* API Settings Dropdown */}
        {showSettings && (
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border-b border-black/5 dark:border-[#07C160]/20 space-y-2">
            <label className="block text-xs font-semibold text-[#07C160]">
              接入自定义 DeepSeek / OpenAI API Key (选填):
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#07C160]"
              />
              <button
                onClick={handleSaveSettings}
                className="px-3 py-1.5 rounded-lg bg-[#07C160] hover:bg-[#06AD56] text-xs font-medium text-white"
              >
                保存 Key
              </button>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">未填 Key 时默认使用内嵌的内置高质模板生成器，零门槛即刻使用。</p>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {!report && !loading && (
            <div className="py-12 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-[#07C160]/10 border border-[#07C160]/20 flex items-center justify-center text-[#07C160]">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">准备好整理本周的职场高光了吗？</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                AI 将为您把本周零散的任务自动整理为包含【重点项目】、【部门沟通】与【下周规划】的标准化汇报。
              </p>
              <button
                onClick={handleGenerate}
                className="mt-2 px-6 py-2.5 rounded-xl bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059B4D] text-xs font-semibold text-white shadow-lg shadow-[#07C160]/25 transition-all inline-flex items-center space-x-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>立即一键生成周报</span>
              </button>
            </div>
          )}

          {loading && (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-[#07C160] animate-spin mx-auto" />
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">AI 正在深度梳理您的周任务与时间投入...</p>
            </div>
          )}

          {report && !loading && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#07C160]">生成的 Markdown 汇报预估格式:</span>
                <button
                  onClick={handleCopy}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center space-x-1.5 transition-colors shadow-sm"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-[#07C160]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? '已复制到剪贴板' : '复制周报文本'}</span>
                </button>
              </div>

              <textarea
                value={report}
                onChange={(e) => setReport(e.target.value)}
                rows={14}
                className="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200 leading-relaxed focus:outline-none focus:border-[#07C160] resize-none"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
