import React, { useState } from 'react'
import {
  X,
  BookOpen,
  Sparkles,
  Calendar,
  Clock,
  CheckCircle2,
  FileText,
  Layers,
  Cloud,
  UploadCloud,
  ChevronRight,
  TrendingUp,
  BookmarkCheck,
  Lightbulb,
  ListOrdered,
  BookMarked,
  Plus,
  Loader2,
  HelpCircle,
  Zap,
  Target,
} from 'lucide-react'
import { Book, ReadingPlan, Task, BookChapter } from '../../types'
import { formatFileSize } from '../../lib/bookParser'
import { generateBookGuideWithDeepSeek, correctBookTOCWithAI } from '../../lib/readingAI'

interface BookDetailModalProps {
  isOpen: boolean
  onClose: () => void
  book: Book
  associatedPlan?: ReadingPlan | null
  tasks?: Task[]
  onOpenCreatePlan: (book: Book) => void
  onOpenNotesModal?: (book: Book, plan?: ReadingPlan) => void
  onUpdateBook?: (book: Book) => void
  onUploadBookToCloud?: (book: Book) => void
  onStartReading?: (book: Book, plan?: ReadingPlan | null) => void
}

export const BookDetailModal: React.FC<BookDetailModalProps> = ({
  isOpen,
  onClose,
  book,
  associatedPlan,
  tasks = [],
  onOpenCreatePlan,
  onOpenNotesModal,
  onUpdateBook,
  onUploadBookToCloud,
  onStartReading,
}) => {
  const [activeTab, setActiveTab] = useState<'guide' | 'chapters' | 'notes'>('guide')
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false)
  const [guideError, setGuideError] = useState<string | null>(null)
  const [isCorrectingChapters, setIsCorrectingChapters] = useState(false)
  const [correctSuccessMsg, setCorrectSuccessMsg] = useState<string | null>(null)
  const [correctErrorMsg, setCorrectErrorMsg] = useState<string | null>(null)
  const [detailGoal, setDetailGoal] = useState<'deep' | 'fast' | 'practical'>(
    book.guide?.reading_mode || 'deep'
  )

  if (!isOpen) return null

  const guide = book.guide

  // 若没有导读建议，支持一键在详情中重新调用 DeepSeek 生成
  const handleRegenerateGuide = async (overrideGoal?: 'deep' | 'fast' | 'practical') => {
    const goalToUse = overrideGoal || detailGoal
    setIsGeneratingGuide(true)
    setGuideError(null)
    try {
      const res = await generateBookGuideWithDeepSeek({
        bookTitle: book.title,
        author: book.author,
        totalPages: book.total_pages,
        chapters: book.chapters,
        readingGoal: goalToUse,
      })
      if (res) {
        const updatedBook: Book = {
          ...book,
          guide: res,
          updated_at: new Date().toISOString(),
        }
        onUpdateBook?.(updatedBook)
      }
    } catch (err: any) {
      setGuideError(err.message || '生成失败，请检查网络或 DeepSeek API Key')
    } finally {
      setIsGeneratingGuide(false)
    }
  }

  // 调用 AI 智能矫正规范目录章节名称
  const handleAICorrectChapters = async () => {
    if (!book.chapters || book.chapters.length === 0) return
    setIsCorrectingChapters(true)
    setCorrectErrorMsg(null)
    setCorrectSuccessMsg(null)
    try {
      const inputs = book.chapters.map((c, i) => ({
        index: c.index || i + 1,
        title: c.title,
      }))
      const res = await correctBookTOCWithAI({
        bookTitle: book.title,
        author: book.author,
        chapters: inputs,
      })
      if (res && res.length > 0) {
        const updatedChapters: BookChapter[] = book.chapters.map((c, i) => {
          const matched = res.find((item) => item.index === (c.index || i + 1))
          return {
            ...c,
            title: matched?.title || c.title,
          }
        })
        const updatedBook: Book = {
          ...book,
          chapters: updatedChapters,
          updated_at: new Date().toISOString(),
        }
        onUpdateBook?.(updatedBook)
        setCorrectSuccessMsg(`✨ 已由 AI 成功纠正规范全部 ${updatedChapters.length} 个章节标题并保存！`)
        setTimeout(() => setCorrectSuccessMsg(null), 5000)
      }
    } catch (err: any) {
      setCorrectErrorMsg(err?.message || 'AI 矫正失败，请检查网络或在个人设置中配置 API Key')
      setTimeout(() => setCorrectErrorMsg(null), 6000)
    } finally {
      setIsCorrectingChapters(false)
    }
  }

  // 计算该书关联的计划打卡进度
  const planTasks = associatedPlan
    ? tasks.filter((t) => t.reading_meta?.plan_id === associatedPlan.id)
    : []
  const completedCount = planTasks.filter((t) => t.status === 'completed').length
  const totalTasksCount = planTasks.length
  const percentage =
    totalTasksCount > 0 ? Math.round((completedCount / totalTasksCount) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md no-drag">
      <div className="w-full max-w-3xl bg-white dark:bg-[#1C1C1E] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-900 dark:text-slate-100 transition-colors animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent dark:from-emerald-950/40 dark:via-slate-900 border-b border-black/5 dark:border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#07C160]/15 border border-[#07C160]/30 flex items-center justify-center text-[#07C160] shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-white truncate" title={book.title}>
                《{book.title}》
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {book.author ? `${book.author} 著 · ` : ''}全书共 {book.total_pages} 页
                {book.file_format ? ` · ${book.file_format.toUpperCase()}` : ''}
                {book.file_size ? ` · ${formatFileSize(book.file_size)}` : ''}
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

        {/* Book Highlights Banner & Action Bar */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-900/60 border-b border-black/5 dark:border-white/5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Status Indicators */}
          <div className="flex items-center space-x-2 text-xs">
            {associatedPlan ? (
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[#07C160]/10 text-[#07C160] font-semibold border border-[#07C160]/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>计划进行中 · 已完成 {percentage}% ({completedCount}/{totalTasksCount})</span>
              </span>
            ) : (
              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                <BookMarked className="w-3.5 h-3.5" />
                <span>书架藏书中 · 暂无活动排期</span>
              </span>
            )}

            {book.cloud_synced ? (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-mono">
                <Cloud className="w-3 h-3" />
                <span>云端已备份</span>
              </span>
            ) : onUploadBookToCloud ? (
              <button
                type="button"
                onClick={() => onUploadBookToCloud(book)}
                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[11px] transition-colors"
              >
                <UploadCloud className="w-3 h-3" />
                <span>备份至云端</span>
              </button>
            ) : null}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            {onOpenNotesModal && (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onOpenNotesModal(book, associatedPlan || undefined)
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center space-x-1.5 transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-blue-500" />
                <span>读后感与笔记</span>
              </button>
            )}

            {onStartReading && (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onStartReading(book, associatedPlan)
                }}
                className="px-3.5 py-1.5 rounded-xl bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059B4D] text-white text-xs font-semibold shadow-md shadow-[#07C160]/20 flex items-center space-x-1.5 transition-all"
                title="打开电子书直接开始阅读"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>{associatedPlan ? '继续阅读' : '开始阅读'}</span>
              </button>
            )}

            {!associatedPlan ? (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onOpenCreatePlan(book)
                }}
                className="px-3.5 py-1.5 rounded-xl border border-[#07C160]/30 hover:bg-[#07C160]/10 text-[#07C160] text-xs font-semibold flex items-center space-x-1.5 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>开启阅读计划</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 pt-3 border-b border-black/5 dark:border-white/5 flex items-center space-x-4 shrink-0 bg-white dark:bg-[#1C1C1E]">
          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`pb-2.5 text-xs font-semibold flex items-center space-x-1.5 border-b-2 transition-all ${
              activeTab === 'guide'
                ? 'border-[#07C160] text-[#07C160]'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI 导读与阅读建议</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('chapters')}
            className={`pb-2.5 text-xs font-semibold flex items-center space-x-1.5 border-b-2 transition-all ${
              activeTab === 'chapters'
                ? 'border-[#07C160] text-[#07C160]'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>完整章节目录 ({book.chapters?.length || 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notes')}
            className={`pb-2.5 text-xs font-semibold flex items-center space-x-1.5 border-b-2 transition-all ${
              activeTab === 'notes'
                ? 'border-[#07C160] text-[#07C160]'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>读书笔记与总结</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 p-6 overflow-y-auto select-text space-y-4">
          {/* TAB 1: AI 导读与精读建议 */}
          {activeTab === 'guide' && (
            <div className="space-y-4">
              {guide ? (
                <>
                  {/* 全书核心导读与主旨脉络 */}
                  <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-[#07C160] font-semibold text-xs">
                        <Sparkles className="w-4 h-4" />
                        <span>
                          {guide.reading_mode === 'fast'
                            ? '⚡ 高效通识 · AI 全书主旨导读'
                            : guide.reading_mode === 'practical'
                              ? '🛠️ 实用践行 · AI 全书主旨导读'
                              : '🎯 深度研读 · AI 全书主旨导读'}
                        </span>
                      </div>
                      {guide.reading_mode && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-mono font-medium">
                          {guide.reading_mode === 'fast' ? '通识模式' : guide.reading_mode === 'practical' ? '践行模式' : '研读模式'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-sans">
                      {guide.summary}
                    </p>

                    {guide.core_problem && (
                      <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 dark:text-emerald-200 text-xs leading-relaxed flex items-start space-x-2">
                        <Lightbulb className="w-3.5 h-3.5 text-[#07C160] shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-semibold text-[#07C160]">为什么值得读 · 破解的现实痛点：</strong>
                          <span>{guide.core_problem}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 全书认知演进逻辑脉络 */}
                  {guide.reading_roadmap && guide.reading_roadmap.length > 0 && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
                      <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                        <Layers className="w-4 h-4 text-indigo-500" />
                        <span>全书认知演进逻辑脉络 (Cognitive Roadmap)</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {guide.reading_roadmap.map((step, sIdx) => (
                          <div
                            key={sIdx}
                            className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-white/5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed"
                          >
                            <span className="font-semibold text-indigo-600 dark:text-indigo-400 mr-1.5">
                              {step.slice(0, 2)}
                            </span>
                            <span>{step.slice(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 核心精读章节 & 略读章节 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {/* 重点精读章节 */}
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <BookmarkCheck className="w-4 h-4" />
                        <span>重点精读章节 (建议逐字深研)</span>
                      </div>
                      <div className="space-y-2">
                        {guide.core_chapter_details && guide.core_chapter_details.length > 0 ? (
                          guide.core_chapter_details.map((ch, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/60 dark:border-white/5 text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between text-slate-800 dark:text-slate-200 font-semibold">
                                <span className="truncate">🎯 {ch.title}</span>
                                {ch.pages && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                    {ch.pages}
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                                {ch.reason}
                              </p>
                            </div>
                          ))
                        ) : (
                          guide.core_chapters?.map((ch, idx) => (
                            <div
                              key={idx}
                              className="p-2 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/60 dark:border-white/5 text-xs font-medium text-slate-800 dark:text-slate-200 flex items-start space-x-2"
                            >
                              <span className="w-4 h-4 rounded-full bg-[#07C160]/10 text-[#07C160] text-[10px] font-mono flex items-center justify-center shrink-0 mt-0.5">
                                {idx + 1}
                              </span>
                              <span className="leading-tight">{ch}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* 建议略读章节 */}
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="flex items-center space-x-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                        <Clock className="w-4 h-4" />
                        <span>建议略读/选读章 (抓大放小)</span>
                      </div>
                      <div className="space-y-2">
                        {guide.skim_chapters && guide.skim_chapters.length > 0 ? (
                          guide.skim_chapters.map((ch, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/60 dark:border-white/5 text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between text-slate-800 dark:text-slate-200 font-semibold">
                                <span className="truncate">⚡ {ch.title}</span>
                                {ch.pages && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                    {ch.pages}
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                                {ch.tip}
                              </p>
                            </div>
                          ))
                        ) : (
                          <div className="p-3 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/60 dark:border-white/5 space-y-2 text-xs">
                            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                              {guide.recommended_pace}
                            </p>
                            <div className="flex items-center space-x-4 pt-1 border-t border-black/5 dark:border-white/5 font-mono text-[11px] text-slate-500">
                              <span>📅 目标: {guide.target_days || 14} 天</span>
                              <span>⏱ 每日: {guide.daily_minutes || 25} 分钟</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 读前灵魂三问 & 落地微行动 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {/* 读前灵魂三问 */}
                    {guide.pre_reading_questions && guide.pre_reading_questions.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                        <div className="flex items-center space-x-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                          <HelpCircle className="w-4 h-4" />
                          <span>读前灵魂拷问 (带着问题读)</span>
                        </div>
                        <div className="space-y-1.5">
                          {guide.pre_reading_questions.map((q, idx) => (
                            <div
                              key={idx}
                              className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-white/5 text-xs text-slate-700 dark:text-slate-300 flex items-start space-x-1.5"
                            >
                              <span className="font-mono text-blue-500 font-bold shrink-0">{idx + 1}.</span>
                              <span className="leading-relaxed">{q}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 落地微行动法则 */}
                    {guide.actionable_habits && guide.actionable_habits.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                        <div className="flex items-center space-x-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                          <Zap className="w-4 h-4" />
                          <span>读完立即可用的微心法</span>
                        </div>
                        <div className="space-y-1.5">
                          {guide.actionable_habits.map((act, idx) => (
                            <div
                              key={idx}
                              className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-white/5 text-xs text-slate-700 dark:text-slate-300 flex items-start space-x-1.5"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                              <span className="leading-relaxed">{act}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 推荐完读节奏建议 */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center space-x-1.5 font-semibold text-slate-800 dark:text-slate-200">
                      <Clock className="w-4 h-4 text-purple-500" />
                      <span>科学阅读节奏与排期建议</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      {guide.recommended_pace}
                    </p>
                    <div className="flex items-center space-x-3 pt-1 border-t border-black/5 dark:border-white/5 font-mono text-[11px] text-slate-500">
                      <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400">
                        📅 建议目标: {guide.target_days || 14} 天
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400">
                        ⏱ 建议每日: {guide.daily_minutes || 25} 分钟
                      </span>
                    </div>
                  </div>

                  {/* 切换偏好并重新生成工具条 */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-black/5 dark:border-white/5">
                    <div className="flex items-center space-x-1.5 text-xs">
                      <span className="text-[11px] text-slate-400">切换导向模式：</span>
                      <button
                        type="button"
                        onClick={() => {
                          setDetailGoal('deep')
                          handleRegenerateGuide('deep')
                        }}
                        disabled={isGeneratingGuide}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                          detailGoal === 'deep'
                            ? 'bg-purple-600 text-white font-semibold'
                            : 'bg-black/5 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        🎯 深度研读
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDetailGoal('fast')
                          handleRegenerateGuide('fast')
                        }}
                        disabled={isGeneratingGuide}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                          detailGoal === 'fast'
                            ? 'bg-purple-600 text-white font-semibold'
                            : 'bg-black/5 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        ⚡ 高效通识
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDetailGoal('practical')
                          handleRegenerateGuide('practical')
                        }}
                        disabled={isGeneratingGuide}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                          detailGoal === 'practical'
                            ? 'bg-purple-600 text-white font-semibold'
                            : 'bg-black/5 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        🛠️ 实用践行
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={isGeneratingGuide}
                      onClick={() => handleRegenerateGuide()}
                      className="text-xs text-slate-400 hover:text-[#07C160] flex items-center space-x-1 transition-colors"
                    >
                      {isGeneratingGuide ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>正在重新生成...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>重新生成 AI 导读建议</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                /* 尚未生成导读建议时的空状态 */
                <div className="py-12 text-center space-y-4 rounded-2xl bg-white/40 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800 p-8">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/10 text-[#07C160] flex items-center justify-center">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      暂未生成《{book.title}》的专业 AI 导读与精读建议
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                      参考微信读书与得到体系，提炼本书破局痛点、核心主旨、认知演进逻辑、分层精读策略与读前三问。
                    </p>
                  </div>

                  <div className="inline-flex p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 text-xs">
                    <button
                      type="button"
                      onClick={() => setDetailGoal('deep')}
                      className={`px-3 py-1 rounded-lg transition-all ${
                        detailGoal === 'deep'
                          ? 'bg-purple-600 text-white font-semibold'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      🎯 深度研读
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailGoal('fast')}
                      className={`px-3 py-1 rounded-lg transition-all ${
                        detailGoal === 'fast'
                          ? 'bg-purple-600 text-white font-semibold'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      ⚡ 高效通识
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailGoal('practical')}
                      className={`px-3 py-1 rounded-lg transition-all ${
                        detailGoal === 'practical'
                          ? 'bg-purple-600 text-white font-semibold'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      🛠️ 实用践行
                    </button>
                  </div>

                  {guideError && (
                    <p className="text-xs text-red-500 font-medium">{guideError}</p>
                  )}

                  <div>
                    <button
                      type="button"
                      disabled={isGeneratingGuide}
                      onClick={() => handleRegenerateGuide()}
                      className="px-5 py-2.5 rounded-xl bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059B4D] text-white text-xs font-semibold shadow-lg shadow-[#07C160]/20 inline-flex items-center space-x-2 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {isGeneratingGuide ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>DeepSeek 深度分析中...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>✨ 生成专业导读与精读建议</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: 完整章节目录 */}
          {activeTab === 'chapters' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center space-x-2">
                  <span>共解析出 <b>{book.chapters?.length || 0}</b> 个章节节点</span>
                  <span>· 全书总计 <b>{book.total_pages}</b> 页</span>
                </div>
                <button
                  type="button"
                  disabled={isCorrectingChapters || !book.chapters || book.chapters.length === 0}
                  onClick={handleAICorrectChapters}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-[#07C160] font-semibold flex items-center space-x-1.5 transition-colors border border-[#07C160]/20 disabled:opacity-50 shadow-xs"
                  title="调用 AI 智能分析书名与目录结构，自动修正残缺或混乱的章节名称"
                >
                  {isCorrectingChapters ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>AI 正在审校矫正中...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>AI 智能矫正目录</span>
                    </>
                  )}
                </button>
              </div>

              {correctSuccessMsg && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium animate-in fade-in">
                  {correctSuccessMsg}
                </div>
              )}
              {correctErrorMsg && (
                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-medium animate-in fade-in">
                  {correctErrorMsg}
                </div>
              )}

              <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1 select-text">
                {book.chapters && book.chapters.length > 0 ? (
                  book.chapters.map((ch, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs transition-colors hover:border-[#07C160]/40"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0 flex-1 mr-3">
                        <span className="w-6 h-6 rounded-lg bg-black/5 dark:bg-white/5 font-mono text-[10px] text-slate-400 flex items-center justify-center shrink-0">
                          {ch.index || idx + 1}
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate" title={ch.title}>
                          {ch.title}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <span className="font-mono text-[11px] text-[#07C160] bg-[#07C160]/10 px-2 py-0.5 rounded">
                          P{ch.start_page} ~ P{ch.end_page}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400 w-12 text-right">
                          {ch.page_count}页
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 py-6 text-center">暂无章节目录信息</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: 读书笔记与总结 */}
          {activeTab === 'notes' && (
            <div className="space-y-4">
              {/* 总读后感 */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center space-x-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <FileText className="w-4 h-4 text-blue-500" />
                  <span>读后感与书评思考</span>
                </div>
                {book.reading_notes ? (
                  <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {book.reading_notes}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 italic">尚无编写读后感记录</p>
                )}
              </div>

              {/* AI 深度总结复盘 */}
              {book.ai_summary && (
                <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-transparent border border-blue-500/20 space-y-2">
                  <div className="flex items-center space-x-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
                    <Sparkles className="w-4 h-4" />
                    <span>AI 核心金句与行动复盘</span>
                  </div>
                  <div className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {book.ai_summary}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onOpenNotesModal?.(book, associatedPlan || undefined)
                  }}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-sm"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>打开全屏笔记工作台</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
