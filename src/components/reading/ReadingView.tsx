import React, { useState } from 'react'
import {
  BookOpen,
  Plus,
  Sparkles,
  Calendar,
  Clock,
  CheckCircle2,
  Trash2,
  TrendingUp,
  Bookmark,
  ArrowRight,
  BookMarked,
  Layers,
  FileText,
  Star,
  Cloud,
  UploadCloud,
  ChevronRight,
  ChevronLeft,
  Search,
  X,
  Info,
} from 'lucide-react'
import { Book, ReadingPlan, Task, ReadingDailySchedule } from '../../types'
import { formatFileSize } from '../../lib/bookParser'
import { BookDetailModal } from './BookDetailModal'
import { PlanScheduleModal } from './PlanScheduleModal'

interface ReadingViewProps {
  books: Book[]
  plans: ReadingPlan[]
  tasks: Task[]
  onOpenCreatePlan: (initialBook?: Book) => void
  onSaveBookOnly?: (book: Book) => void
  onUpdateBook?: (book: Book) => void
  onDeletePlan: (planId: string, bookId: string) => void
  onDeleteBook?: (bookId: string) => void
  onSelectBookToRead?: (book: Book) => void
  onOpenNotesModal?: (book: Book, plan?: ReadingPlan) => void
  onUpdateScheduleDate?: (planId: string, scheduleIndex: number, newDate: string) => void
  onToggleTodayFromSchedule?: (planId: string, item: ReadingDailySchedule) => void
  onUploadBookToCloud?: (book: Book) => void
  onStartReading?: (book: Book, plan?: ReadingPlan | null) => void
}

export const ReadingView: React.FC<ReadingViewProps> = ({
  books,
  plans,
  tasks,
  onOpenCreatePlan,
  onSaveBookOnly,
  onUpdateBook,
  onDeletePlan,
  onDeleteBook,
  onOpenNotesModal,
  onUpdateScheduleDate,
  onToggleTodayFromSchedule,
  onUploadBookToCloud,
  onStartReading,
}) => {
  // 分为两大独立模块：'plans' (阅读计划) 与 'books' (我的书库)，不再混合堆叠
  const [activeTab, setActiveTab] = useState<'plans' | 'books'>('plans')

  // 弹窗状态：选中的排期计划 (PlanScheduleModal) 和选中的书籍详情 (BookDetailModal)
  const [selectedSchedulePlan, setSelectedSchedulePlan] = useState<ReadingPlan | null>(null)
  const [selectedDetailBook, setSelectedDetailBook] = useState<Book | null>(null)

  // 书库独立搜索与分页状态
  const [bookSearchQuery, setBookSearchQuery] = useState('')
  const [bookPage, setBookPage] = useState(1)
  const [bookPageSize, setBookPageSize] = useState(6)

  // 书库搜索与分页动态计算
  const filteredBooks = books.filter((b) => {
    if (!bookSearchQuery.trim()) return true
    const q = bookSearchQuery.toLowerCase()
    return (
      b.title.toLowerCase().includes(q) ||
      (b.author && b.author.toLowerCase().includes(q)) ||
      (b.file_format && b.file_format.toLowerCase().includes(q))
    )
  })

  const totalBookPages = Math.max(1, Math.ceil(filteredBooks.length / bookPageSize))
  const safeCurrentPage = Math.min(bookPage, totalBookPages)
  const paginatedBooks = filteredBooks.slice(
    (safeCurrentPage - 1) * bookPageSize,
    safeCurrentPage * bookPageSize
  )

  // 统计数据
  const activePlans = plans.filter((p) => p.status === 'active')
  const completedPlans = plans.filter((p) => p.status === 'completed')

  // 计算累计阅读任务用时与交付
  const readingTasks = tasks.filter((t) => t.task_type === 'reading')
  const completedReadingTasks = readingTasks.filter((t) => t.status === 'completed')
  const totalReadingMinutes = completedReadingTasks.reduce(
    (sum, t) => sum + (t.actual_minutes || t.estimated_minutes || 0),
    0
  )

  const getFormatBadgeColor = (format?: string) => {
    switch (format?.toLowerCase()) {
      case 'epub':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
      case 'pdf':
        return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
      case 'txt':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
      case 'md':
        return 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20'
      default:
        return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
    }
  }

  // 获取当前查看排期所关联的书籍
  const planForScheduleBook = selectedSchedulePlan
    ? books.find((b) => b.id === selectedSchedulePlan.book_id)
    : undefined

  // 获取当前查看详情书籍所关联的活跃计划
  const detailBookAssociatedPlan = selectedDetailBook
    ? plans.find((p) => p.book_id === selectedDetailBook.id && p.status === 'active')
    : undefined

  return (
    <div className="flex-1 min-h-0 h-full p-6 overflow-y-auto space-y-6 pb-28 select-text no-drag" data-scrollable="true">
      {/* Top Banner / Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-white/10 shadow-xs hover:border-[#07C160]/40 transition-all flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#07C160]/10 text-[#07C160] flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xl font-bold font-mono text-slate-800 dark:text-slate-100 leading-tight">
              {activePlans.length}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">正在执行计划</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-white/10 shadow-xs hover:border-blue-500/40 transition-all flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
            <BookMarked className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xl font-bold font-mono text-slate-800 dark:text-slate-100 leading-tight">
              {books.length}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">书库藏书总数</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-white/10 shadow-xs hover:border-amber-500/40 transition-all flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xl font-bold font-mono text-slate-800 dark:text-slate-100 leading-tight">
              {Math.round((totalReadingMinutes / 60) * 10) / 10} <span className="text-xs font-normal">h</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">累计专注用时</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-white/10 shadow-xs hover:border-emerald-500/40 transition-all flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xl font-bold font-mono text-slate-800 dark:text-slate-100 leading-tight">
              {completedReadingTasks.length} <span className="text-xs font-normal">次</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">已打卡任务交付</div>
          </div>
        </div>
      </div>

      {/* 核心两大模块切换导航 (Segmented Tabs: 阅读计划 vs 我的书库) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-black/5 dark:border-white/5">
        <div className="flex items-center space-x-1.5 p-1 bg-black/5 dark:bg-white/5 rounded-2xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('plans')}
            className={`px-4 py-2 rounded-xl transition-all flex items-center space-x-2 ${
              activeTab === 'plans'
                ? 'bg-white dark:bg-slate-800 text-[#07C160] shadow-sm shadow-black/5'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>阅读计划</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === 'plans'
                  ? 'bg-[#07C160]/15 text-[#07C160]'
                  : 'bg-black/5 dark:bg-white/10 text-slate-400'
              }`}
            >
              {plans.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('books')}
            className={`px-4 py-2 rounded-xl transition-all flex items-center space-x-2 ${
              activeTab === 'books'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm shadow-black/5'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <BookMarked className="w-4 h-4" />
            <span>我的书库</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === 'books'
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                  : 'bg-black/5 dark:bg-white/10 text-slate-400'
              }`}
            >
              {books.length}
            </span>
          </button>
        </div>

        <button
          onClick={() => onOpenCreatePlan()}
          className="h-8 px-4 rounded-xl bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059B4D] text-white text-xs font-semibold shadow-sm shadow-[#07C160]/20 flex items-center space-x-1.5 transition-all shrink-0 active:scale-98"
        >
          <Plus className="w-4 h-4" />
          <span>添加新书 / 录入规划</span>
        </button>
      </div>

      {/* ========================================================
          板块一：阅读计划 (Reading Plans) - 独立专注视图
          ======================================================== */}
      {activeTab === 'plans' && (
        <div className="space-y-4">
          {/* 计划概览顶栏 */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-[#07C160]/5 to-transparent dark:from-emerald-950/30 dark:via-slate-900/60 dark:to-transparent border border-emerald-500/20 dark:border-emerald-500/15 text-xs shadow-xs">
            <div className="flex items-center space-x-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#07C160] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#07C160]"></span>
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                执行中规划 <span className="font-mono text-[#07C160] font-bold text-sm ml-0.5">{plans.length}</span> 个
              </span>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <span className="text-slate-500 dark:text-slate-400">
                拆解后的每日章节阅读默认保持独立流转，可随时按需加入 Today 或日程专注
              </span>
            </div>
          </div>

          {plans.length === 0 ? (
            <div className="py-16 text-center space-y-3 rounded-2xl bg-white/40 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800 p-8">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-[#07C160]/10 flex items-center justify-center text-[#07C160]">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  暂无正在执行的阅读计划
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  可前往「我的书库」挑选书籍开启阅读计划，或点击右上角直接上传电子书开启规划
                </p>
              </div>
              <div className="pt-2 flex items-center justify-center space-x-2">
                <button
                  onClick={() => setActiveTab('books')}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                >
                  前往我的书库挑选
                </button>
                <button
                  onClick={() => onOpenCreatePlan()}
                  className="px-4 py-2 rounded-xl bg-[#07C160] hover:bg-[#06AD56] text-white text-xs font-semibold shadow-md shadow-[#07C160]/20 flex items-center space-x-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>新建阅读计划</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {plans.map((plan) => {
                const book = books.find((b) => b.id === plan.book_id)
                const planTasks = tasks.filter((t) => t.reading_meta?.plan_id === plan.id)
                const completedCount = planTasks.filter((t) => t.status === 'completed').length
                const totalTasksCount = planTasks.length
                const percentage =
                  totalTasksCount > 0 ? Math.round((completedCount / totalTasksCount) * 100) : 0

                return (
                  <div
                    key={plan.id}
                    className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:border-emerald-500/40 dark:hover:border-emerald-500/40 hover:shadow-md transition-all group"
                  >
                    <div>
                      {/* Top: Thumbnail & Meta (完全参考我的书库结构) */}
                      <div className="flex items-start space-x-3.5 min-w-0">
                        {/* Book Thumbnail */}
                        <div
                          onClick={() => book && setSelectedDetailBook(book)}
                          className="w-16 h-22 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0 overflow-hidden relative cursor-pointer border border-slate-200/80 dark:border-white/10 hover:opacity-90 transition-opacity shadow-xs"
                          title="点击查看书籍详情与 AI 导读建议"
                        >
                          {book?.cover_url ? (
                            <img
                              src={book.cover_url}
                              alt={plan.book_title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="p-2 text-center flex flex-col items-center justify-center h-full">
                              <BookOpen className="w-5 h-5 opacity-40 text-slate-400 mb-1" />
                              <span className="text-[10px] font-medium line-clamp-2 leading-tight text-slate-500 dark:text-slate-400">
                                {plan.book_title}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1.5">
                            <div className="relative group/title flex-1 min-w-0">
                              <h5
                                onClick={() => book && setSelectedDetailBook(book)}
                                className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug cursor-pointer hover:text-[#07C160] transition-colors break-words line-clamp-2"
                                title={`《${plan.book_title}》`}
                              >
                                {plan.book_title.startsWith('《') && plan.book_title.endsWith('》')
                                  ? plan.book_title
                                  : `《${plan.book_title}》`}
                              </h5>

                              {/* 悬停即时显示完整标题浮窗 */}
                              {plan.book_title.length > 10 && (
                                <div className="pointer-events-none absolute left-0 top-full mt-1.5 z-40 hidden group-hover/title:block w-max max-w-[260px] px-2.5 py-1.5 rounded-lg bg-slate-900/95 dark:bg-slate-800/95 text-white text-[11px] leading-relaxed shadow-xl backdrop-blur-xs border border-slate-700/50 break-words animate-in fade-in-0 duration-150">
                                  《{plan.book_title}》
                                </div>
                              )}
                            </div>

                            {/* Top Right Badges & Tools */}
                            <div className="flex items-center space-x-1 shrink-0">
                              {book?.file_format && (
                                <span
                                  className={`text-[8px] uppercase px-1.5 py-0.5 rounded font-mono font-bold border ${getFormatBadgeColor(
                                    book.file_format
                                  )}`}
                                >
                                  {book.file_format}
                                </span>
                              )}

                              {book && onOpenNotesModal && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onOpenNotesModal(book, plan)
                                  }}
                                  className="p-0.5 text-slate-400 hover:text-blue-500 rounded transition-colors relative cursor-pointer"
                                  title="查看/撰写读后感与 AI 总结"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  {(book.reading_notes || book.ai_summary) && (
                                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                  )}
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (
                                    window.confirm(
                                      `确定要移除《${plan.book_title}》的阅读计划吗？\n书籍仍将保留在书架中，仅清除生成的待办排期。`
                                    )
                                  ) {
                                    onDeletePlan(plan.id, plan.book_id)
                                  }
                                }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-500 rounded transition-all cursor-pointer"
                                title="移除此计划（书籍保留在书架中）"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                            {book?.author ? `${book.author} 著 · ` : ''}共 {plan.total_pages} 页
                          </p>

                          {/* 目标胶囊信息 */}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/5">
                              <span>📅 完读:</span>
                              <strong className="font-mono text-slate-700 dark:text-slate-300 font-semibold">{plan.target_end_date}</strong>
                            </span>
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/5">
                              <span>⏱ {plan.daily_minutes}m/天</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 进度条区域 */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/5 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 dark:text-slate-400 flex items-center space-x-1.5">
                            <span>完成进度: <b className="text-slate-800 dark:text-slate-200 font-mono font-semibold">{completedCount}/{totalTasksCount}</b></span>
                            {percentage === 100 ? (
                              <span className="px-1.5 py-0.2 rounded-md bg-emerald-500/15 text-[#07C160] text-[10px] font-semibold">已读完</span>
                            ) : percentage > 0 ? (
                              <span className="px-1.5 py-0.2 rounded-md bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px] font-semibold">精读中</span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-white/10 text-slate-500 text-[10px] font-semibold">待开始</span>
                            )}
                          </span>
                          <span className="font-mono text-[#07C160] font-bold text-xs">{percentage}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                          <div
                            className="h-full bg-[#07C160] rounded-full transition-all duration-300"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Bottom Actions: 完全参考「我的书库」排布与防挤压机制 */}
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center gap-2">
                      {/* 详情入口 */}
                      {book && (
                        <button
                          type="button"
                          onClick={() => setSelectedDetailBook(book)}
                          className="h-8 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium flex items-center justify-center space-x-1 shrink-0 whitespace-nowrap transition-colors cursor-pointer"
                          title="查看大纲与 AI 导读建议"
                        >
                          <Info className="w-3.5 h-3.5 text-slate-400" />
                          <span>详情</span>
                        </button>
                      )}

                      {/* 排期查看入口 (flex-1 自适应拉伸) */}
                      <button
                        type="button"
                        onClick={() => setSelectedSchedulePlan(plan)}
                        className="h-8 flex-1 min-w-0 px-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-[#07C160] border border-emerald-500/25 text-xs font-semibold flex items-center justify-center space-x-1 whitespace-nowrap transition-colors cursor-pointer"
                        title="查看详细章节排期与每日计划"
                      >
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">排期 ({plan.schedule?.length || 0} 阶段)</span>
                      </button>

                      {/* 继续阅读按钮 (统一高度 h-8，固定内边距 px-3.5，shrink-0 whitespace-nowrap 绝不折行或变形) */}
                      {book && onStartReading && (
                        <button
                          type="button"
                          onClick={() => onStartReading(book, plan)}
                          className="h-8 px-3.5 rounded-xl bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059B4D] text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm shadow-[#07C160]/20 shrink-0 whitespace-nowrap active:scale-98 transition-all cursor-pointer"
                          title="打开电子书直接开始沉浸阅读"
                        >
                          <BookOpen className="w-3.5 h-3.5 shrink-0" />
                          <span className="shrink-0 whitespace-nowrap">阅读</span>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          板块二：我的书库 (Book Library) - 独立图书资产视图
          ======================================================== */}
      {activeTab === 'books' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-slate-100/70 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 text-xs">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                书库藏书 <b className="font-mono text-slate-900 dark:text-white">{books.length}</b> 本
                {bookSearchQuery && (
                  <span className="ml-1 text-slate-500 dark:text-slate-400 font-normal">
                    (匹配 <b className="font-mono text-emerald-600 dark:text-emerald-400">{filteredBooks.length}</b> 本)
                  </span>
                )}
              </span>
              <span className="text-slate-300 dark:text-slate-600 hidden md:inline">|</span>
              <span className="text-slate-500 dark:text-slate-400 hidden md:inline">
                支持点击任意书籍查看完整章节大纲、撰写读后感与 AI 导读建议
              </span>
            </div>

            {/* 书库独立搜索框 */}
            <div className="relative flex items-center min-w-[200px] max-w-[260px] w-full sm:w-auto">
              <Search className="w-3.5 h-3.5 absolute left-2.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={bookSearchQuery}
                onChange={(e) => {
                  setBookSearchQuery(e.target.value)
                  setBookPage(1)
                }}
                placeholder="搜索书名、作者或格式..."
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-all shadow-xs"
              />
              {bookSearchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setBookSearchQuery('')
                    setBookPage(1)
                  }}
                  className="absolute right-2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {books.length === 0 ? (
            <div className="py-16 text-center space-y-3 rounded-2xl bg-white/40 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800 p-8">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  书库尚无书籍
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  支持上传 EPUB、PDF、TXT、Markdown、MOBI 等主流电子书存入书库，构建您的私人专属知识库
                </p>
              </div>
              <button
                onClick={() => onOpenCreatePlan()}
                className="px-4 py-2 rounded-xl bg-[#07C160] hover:bg-[#06AD56] text-white text-xs font-semibold shadow-md shadow-[#07C160]/20 inline-flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>上传电子书存入书库</span>
              </button>
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="py-12 text-center space-y-2 rounded-2xl bg-white/40 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800 p-6">
              <Search className="w-8 h-8 mx-auto text-slate-400 opacity-60" />
              <p className="text-xs text-slate-500">没有找到匹配 “{bookSearchQuery}” 的书籍</p>
              <button
                type="button"
                onClick={() => {
                  setBookSearchQuery('')
                  setBookPage(1)
                }}
                className="text-xs text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
              >
                清除搜索条件
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {paginatedBooks.map((book) => {
                  const associatedPlan = plans.find(
                    (p) => p.book_id === book.id && p.status === 'active'
                  )

                  return (
                    <div
                      key={book.id}
                      className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:border-emerald-500/40 dark:hover:border-emerald-500/40 hover:shadow-md transition-all group"
                    >
                      <div>
                        {/* Top: Thumbnail & Meta */}
                        <div className="flex items-start space-x-3.5 min-w-0">
                          {/* Book Thumbnail */}
                          <div
                            onClick={() => setSelectedDetailBook(book)}
                            className="w-16 h-22 rounded-xl bg-gradient-to-tr from-slate-700 to-slate-900 flex items-center justify-center text-white shadow-sm shrink-0 overflow-hidden relative cursor-pointer hover:opacity-90 transition-opacity"
                            title="点击查看书籍详情与 AI 阅读建议"
                          >
                            {book.cover_url ? (
                              <img src={book.cover_url} alt="Cover" className="w-full h-full object-cover" />
                            ) : (
                              <BookOpen className="w-6 h-6 opacity-60" />
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="relative group/title flex-1 min-w-0">
                                <h5
                                  onClick={() => setSelectedDetailBook(book)}
                                  className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug cursor-pointer hover:text-[#07C160] transition-colors break-words line-clamp-2"
                                  style={{
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                  }}
                                  title={`《${book.title}》`}
                                >
                                  《{book.title}》
                                </h5>

                                {/* 鼠标悬停显示完整书名浮窗 */}
                                {book.title.length > 10 && (
                                  <div className="pointer-events-none absolute left-0 top-full mt-1.5 z-40 hidden group-hover/title:block w-max max-w-[260px] px-2.5 py-1.5 rounded-lg bg-slate-900/95 dark:bg-slate-800/95 text-white text-[11px] leading-relaxed shadow-xl backdrop-blur-xs border border-slate-700/50 break-words animate-in fade-in-0 duration-150">
                                    《{book.title}》
                                  </div>
                                )}
                              </div>

                              {/* Top Right Badges & Quick Tools */}
                              <div className="flex items-center space-x-1 shrink-0">
                                {book.file_format && (
                                  <span
                                    className={`text-[8px] uppercase px-1.5 py-0.5 rounded font-mono font-bold border ${getFormatBadgeColor(
                                      book.file_format
                                    )}`}
                                  >
                                    {book.file_format}
                                  </span>
                                )}

                                {book.cloud_synced ? (
                                  <span
                                    className="p-0.5 text-emerald-500"
                                    title="已同步至 Supabase 云端书库"
                                  >
                                    <Cloud className="w-3.5 h-3.5" />
                                  </span>
                                ) : onUploadBookToCloud ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      onUploadBookToCloud(book)
                                    }}
                                    className="p-0.5 text-slate-400 hover:text-emerald-500 rounded transition-colors"
                                    title="备份原书与元数据到云端书库"
                                  >
                                    <UploadCloud className="w-3.5 h-3.5" />
                                  </button>
                                ) : null}

                                {onOpenNotesModal && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      onOpenNotesModal(book, associatedPlan)
                                    }}
                                    className="p-0.5 text-slate-400 hover:text-blue-500 rounded transition-colors relative"
                                    title="查看/撰写读后感与 AI 总结"
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                    {(book.reading_notes || book.ai_summary) && (
                                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                    )}
                                  </button>
                                )}

                                {onDeleteBook && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (window.confirm(`确定要从书库彻底删除《${book.title}》吗？`)) {
                                        onDeleteBook(book.id)
                                      }
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-500 rounded transition-all"
                                    title="从书库彻底删除此书"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                              {book.author ? `${book.author} 著 · ` : ''}共 {book.total_pages} 页
                            </p>

                            <div className="mt-1.5 text-[10px] text-slate-400 flex items-center space-x-2">
                              <span className="flex items-center space-x-1">
                                <Layers className="w-3.5 h-3.5 text-[#07C160]" />
                                <span>{book.chapters?.length || 0} 章节</span>
                              </span>
                              {book.file_size && <span>· {formatFileSize(book.file_size)}</span>}
                            </div>

                            {/* AI 导读标识 */}
                            {book.guide && (
                              <div className="mt-2 inline-flex items-center space-x-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-500/10 dark:bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                <Sparkles className="w-3 h-3" />
                                <span>已生成 AI 导读与精读建议</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Bottom Actions: 统一高度、防折行优雅排布 */}
                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center gap-2">
                        {/* 详情入口 */}
                        <button
                          type="button"
                          onClick={() => setSelectedDetailBook(book)}
                          className="h-8 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium flex items-center justify-center space-x-1 shrink-0 whitespace-nowrap transition-colors"
                          title="查看生成过程中的阅读建议、全书目录与读后感"
                        >
                          <Info className="w-3.5 h-3.5 text-slate-400" />
                          <span>详情</span>
                        </button>

                        {/* 计划排期状态或开启按钮 */}
                        {associatedPlan ? (
                          <button
                            type="button"
                            onClick={() => setSelectedSchedulePlan(associatedPlan)}
                            className="h-8 flex-1 min-w-0 px-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-[#07C160] border border-emerald-500/25 text-xs font-semibold flex items-center justify-center space-x-1 whitespace-nowrap transition-colors"
                            title="点击查看此书的完整排期"
                          >
                            <Calendar className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">计划中</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onOpenCreatePlan(book)}
                            className="h-8 flex-1 min-w-0 px-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:text-[#07C160] hover:border-emerald-500/20 border border-transparent text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center justify-center space-x-1 whitespace-nowrap transition-colors"
                            title="开启阅读计划排期"
                          >
                            <Plus className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">开启计划</span>
                          </button>
                        )}

                        {/* 开始/继续沉浸阅读 */}
                        {onStartReading && (
                          <button
                            type="button"
                            onClick={() => onStartReading(book, associatedPlan)}
                            className="h-8 px-3.5 rounded-xl bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059B4D] text-white text-xs font-semibold flex items-center justify-center space-x-1 shadow-sm shadow-[#07C160]/20 shrink-0 whitespace-nowrap active:scale-98 transition-all"
                            title="打开电子书直接开始沉浸阅读"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>{associatedPlan ? '继续阅读' : '开始阅读'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 分页控制栏 */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                <div className="flex items-center space-x-3">
                  <span>
                    显示第 <b className="text-slate-700 dark:text-slate-200">{(safeCurrentPage - 1) * bookPageSize + 1}</b> -{' '}
                    <b className="text-slate-700 dark:text-slate-200">
                      {Math.min(safeCurrentPage * bookPageSize, filteredBooks.length)}
                    </b>{' '}
                    本 / 共 <b className="font-mono text-slate-800 dark:text-slate-100">{filteredBooks.length}</b> 本
                  </span>

                  {/* 每页条数选择 */}
                  <div className="flex items-center space-x-1">
                    <span className="text-[11px] text-slate-400">每页:</span>
                    {[6, 9, 12, 18].map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => {
                          setBookPageSize(size)
                          setBookPage(1)
                        }}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                          bookPageSize === size
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/30'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 分页导航 */}
                {totalBookPages > 1 && (
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      disabled={safeCurrentPage <= 1}
                      onClick={() => setBookPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center space-x-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>上一页</span>
                    </button>

                    <div className="flex items-center space-x-1">
                      {Array.from({ length: totalBookPages }, (_, i) => i + 1).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setBookPage(p)}
                          className={`w-7 h-7 rounded-lg text-xs font-mono font-medium transition-colors ${
                            safeCurrentPage === p
                              ? 'bg-[#07C160] text-white shadow-xs'
                              : 'border border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      disabled={safeCurrentPage >= totalBookPages}
                      onClick={() => setBookPage((p) => Math.min(totalBookPages, p + 1))}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center space-x-1"
                    >
                      <span>下一页</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 模态框 1：完整排期清单与分配 (PlanScheduleModal) - 独立弹窗不挤占卡片 */}
      {selectedSchedulePlan && (
        <PlanScheduleModal
          isOpen={!!selectedSchedulePlan}
          onClose={() => setSelectedSchedulePlan(null)}
          plan={selectedSchedulePlan}
          book={planForScheduleBook}
          tasks={tasks}
          onUpdateScheduleDate={onUpdateScheduleDate}
          onToggleTodayFromSchedule={onToggleTodayFromSchedule}
          onOpenNotesModal={onOpenNotesModal}
          onStartReading={onStartReading}
        />
      )}

      {/* 模态框 2：书籍详情与 AI 阅读建议查看 (BookDetailModal) */}
      {selectedDetailBook && (
        <BookDetailModal
          isOpen={!!selectedDetailBook}
          onClose={() => setSelectedDetailBook(null)}
          book={selectedDetailBook}
          associatedPlan={detailBookAssociatedPlan}
          tasks={tasks}
          onOpenCreatePlan={(book) => {
            setSelectedDetailBook(null)
            onOpenCreatePlan(book)
          }}
          onOpenNotesModal={onOpenNotesModal}
          onUpdateBook={onUpdateBook}
          onUploadBookToCloud={onUploadBookToCloud}
          onStartReading={onStartReading}
        />
      )}
    </div>
  )
}
