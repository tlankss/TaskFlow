import React, { useState } from 'react'
import {
  X,
  Sparkles,
  BookOpen,
  FileText,
  Save,
  Check,
  Loader2,
  Quote,
  Lightbulb,
  BookMarked,
  Layers,
  Copy,
  CheckCheck,
} from 'lucide-react'
import { Book, ReadingPlan, Task } from '../../types'
import { summarizeReadingNotesWithDeepSeek } from '../../lib/readingAI'

interface BookNotesModalProps {
  isOpen: boolean
  onClose: () => void
  book: Book
  plan?: ReadingPlan | null
  tasks?: Task[]
  onSaveNotes: (bookId: string, notes: string, aiSummary?: string) => void
}

export const BookNotesModal: React.FC<BookNotesModalProps> = ({
  isOpen,
  onClose,
  book,
  plan,
  tasks = [],
  onSaveNotes,
}) => {
  const [readingNotes, setReadingNotes] = useState(
    book.reading_notes || plan?.reading_notes || ''
  )
  const [aiSummary, setAiSummary] = useState(
    book.ai_summary || plan?.ai_summary || ''
  )
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [copiedSummary, setCopiedSummary] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  if (!isOpen) return null

  // 提取与此书相关的所有已完成打卡任务的笔记
  const planTasks = tasks.filter(
    (t) =>
      t.reading_meta?.book_id === book.id ||
      (plan && t.reading_meta?.plan_id === plan.id)
  )
  const chapterNotes = planTasks
    .filter((t) => t.output_notes?.trim())
    .map((t) => ({
      chapterTitle: t.reading_meta?.chapter_title || t.title,
      notes: t.output_notes!.trim(),
    }))

  const handleGenerateAISummary = async () => {
    setIsSummarizing(true)
    try {
      const res = await summarizeReadingNotesWithDeepSeek({
        bookTitle: book.title,
        author: book.author,
        userNotes: readingNotes,
        chapterNotes,
        completedPages: plan?.completed_pages || 0,
        totalPages: book.total_pages,
      })

      const formatted = `### 📌 核心复盘精要\n${res.executive_summary}\n\n### 💬 经典金句提炼\n${res.golden_quotes
        .map((q) => `> 「${q}」`)
        .join('\n\n')}\n\n### 🚀 实践与行动启发\n${res.practical_takeaways
        .map((t, i) => `${i + 1}. ${t}`)
        .join('\n')}`

      setAiSummary(formatted)
    } finally {
      setIsSummarizing(false)
    }
  }

  const handleSave = () => {
    onSaveNotes(book.id, readingNotes, aiSummary)
    setSaveSuccess(true)
    setTimeout(() => {
      setSaveSuccess(false)
      onClose()
    }, 800)
  }

  const handleCopySummary = () => {
    if (!aiSummary) return
    navigator.clipboard.writeText(aiSummary)
    setCopiedSummary(true)
    setTimeout(() => setCopiedSummary(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md no-drag">
      <div className="w-full max-w-3xl bg-white dark:bg-[#1E1E1E] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-900 dark:text-slate-100 transition-colors">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent dark:from-emerald-950/40 dark:via-slate-900 border-b border-black/5 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#07C160]/15 border border-[#07C160]/30 flex items-center justify-center text-[#07C160]">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>《{book.title}》读后感与笔记中心</span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                记录全书深度感悟，AI 自动提炼章节打卡零碎笔记生成结构化复盘
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-5 select-text">
          {/* 打卡阶段零碎笔记展示 */}
          {chapterNotes.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <div className="flex items-center space-x-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#07C160]" />
                  <span>每日打卡过程记录的心得 ({chapterNotes.length} 条)</span>
                </div>
                <span className="text-[10px] text-slate-400">AI 将自动整合至总结</span>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {chapterNotes.map((cn, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded-lg bg-white dark:bg-slate-950 border border-black/5 dark:border-white/5 text-xs"
                  >
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {cn.chapterTitle}：
                    </span>
                    <span className="text-slate-600 dark:text-slate-400 ml-1">
                      {cn.notes}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 读后感编写区 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                <BookOpen className="w-3.5 h-3.5 text-[#07C160]" />
                <span>我的阅读感悟 / 读后感手记</span>
              </label>
              <button
                type="button"
                onClick={handleGenerateAISummary}
                disabled={isSummarizing}
                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 disabled:opacity-50 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm shadow-purple-600/20 transition-all cursor-pointer"
              >
                {isSummarizing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>DeepSeek 深度总结中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI 智能提炼阅读总结 & 金句</span>
                  </>
                )}
              </button>
            </div>

            <textarea
              rows={6}
              placeholder="在此记录你对整本书的思考、触动你的章节或落地想法...点击右上角按钮可由 DeepSeek 自动结合打卡笔记提炼结构化复盘。"
              value={readingNotes}
              onChange={(e) => setReadingNotes(e.target.value)}
              className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 leading-relaxed focus:outline-none focus:border-[#07C160] resize-y"
            />
          </div>

          {/* AI 智能总结区域 */}
          {aiSummary && (
            <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-500/10 via-indigo-500/5 to-transparent border border-purple-500/25 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs font-bold text-purple-700 dark:text-purple-300">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span>DeepSeek AI 提炼的深度读书复盘</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="px-2 py-1 rounded bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 text-[11px] font-medium flex items-center space-x-1"
                >
                  {copiedSummary ? (
                    <>
                      <CheckCheck className="w-3 h-3 text-[#07C160]" />
                      <span>已复制</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>复制总结</span>
                    </>
                  )}
                </button>
              </div>

              <div className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed bg-white/60 dark:bg-slate-950/60 p-3.5 rounded-xl border border-black/5 dark:border-white/5 font-sans">
                {aiSummary}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-black/5 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50">
          <span className="text-[11px] text-slate-400">
            笔记将自动永久保存在书架与云端中
          </span>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/5 transition-colors"
            >
              取消
            </button>

            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059B4D] text-white text-xs font-semibold shadow-md shadow-[#07C160]/20 flex items-center space-x-1.5 transition-all"
            >
              {saveSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>已保存！</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>保存读后感与笔记</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
