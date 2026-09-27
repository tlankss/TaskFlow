import React, { useState } from 'react'
import {
  X,
  Sparkles,
  BookOpen,
  Upload,
  Calendar,
  Clock,
  Check,
  ChevronRight,
  AlertCircle,
  FileText,
  Camera,
  Loader2,
  ArrowLeft,
  FileCode,
  FileSpreadsheet,
  Plus,
  Trash2,
  Layers,
  BookMarked,
  Info,
  Compass,
  Lightbulb,
  Zap,
  Target,
  BookmarkCheck,
  HelpCircle,
} from 'lucide-react'
import { Book, BookChapter, ReadingPlan, ReadingDailySchedule, Task } from '../../types'
import {
  recognizeBookTOC,
  generateReadingSchedule,
  convertScheduleToTasks,
  getTodayDateStr,
  alignChaptersWithDeepSeek,
  generateBookGuideWithDeepSeek,
  BookGuideResult,
} from '../../lib/readingAI'
import { parseBookFile, formatFileSize, SupportedBookFormat } from '../../lib/bookParser'
import { uploadBookFileToStorage } from '../../lib/supabase'
import { saveBookBinary } from '../../lib/bookStorage'
import { DatePicker } from '../DatePicker'

interface ReadingPlanModalProps {
  isOpen: boolean
  onClose: () => void
  onPlanCreated: (book: Book, plan: ReadingPlan, newTasks: Partial<Task>[]) => void
  onSaveBookOnly?: (book: Book) => void
  initialBook?: Book | null
}

export const ReadingPlanModal: React.FC<ReadingPlanModalProps> = ({
  isOpen,
  onClose,
  onPlanCreated,
  onSaveBookOnly,
  initialBook,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1) // 1: 录入/识图/上传, 2: 确认目录, 3: 生成排期
  const [inputMode, setInputMode] = useState<'file' | 'image' | 'text'>('file')

  const [bookTitle, setBookTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [totalPages, setTotalPages] = useState<number>(200)
  const [textTOC, setTextTOC] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isRecognizing, setIsRecognizing] = useState(false)

  // 电子书文件上传解析状态
  const [isParsingBook, setIsParsingBook] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [tocRawText, setTocRawText] = useState('')
  const [isDeepSeekAligning, setIsDeepSeekAligning] = useState(false)
  const [deepSeekSuccessMsg, setDeepSeekSuccessMsg] = useState<string | null>(null)
  const [parsedFileInfo, setParsedFileInfo] = useState<{
    format: SupportedBookFormat
    fileName: string
    fileSize: number
  } | null>(null)

  // 识别出的章节列表
  const [chapters, setChapters] = useState<BookChapter[]>([])

  // AI 导读与精读建议
  const [bookGuide, setBookGuide] = useState<BookGuideResult | null>(null)
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)

  // 计划参数
  const [readingGoal, setReadingGoal] = useState<'deep' | 'fast' | 'practical'>('deep')
  const [planStartDate, setPlanStartDate] = useState(getTodayDateStr())
  const [targetDays, setTargetDays] = useState(14)
  const [dailyMinutes, setDailyMinutes] = useState(25)
  const [bufferDaysEnabled, setBufferDaysEnabled] = useState(true)
  const [generatedSchedule, setGeneratedSchedule] = useState<ReadingDailySchedule[]>([])

  // 彻底初始化/重置全部表单状态（确保每次从书架进入或点击“新增”时都是全新的干净状态）
  const resetFormState = React.useCallback(() => {
    if (initialBook) {
      setStep(2)
      setInputMode('file')
      setBookTitle(initialBook.title || '')
      setAuthor(initialBook.author || '')
      setTotalPages(initialBook.total_pages || 100)
      setTextTOC('')
      setImagePreview(initialBook.cover_url || null)
      setChapters(initialBook.chapters || [])
      setBookGuide(
        initialBook.guide
          ? {
              ...initialBook.guide,
              target_days: initialBook.guide.target_days || 14,
              daily_minutes: initialBook.guide.daily_minutes || 25,
            }
          : null
      )
      setParsedFileInfo(
        initialBook.file_format
          ? {
              format: initialBook.file_format as any,
              fileName: initialBook.file_name || `${initialBook.title}.${initialBook.file_format}`,
              fileSize: initialBook.file_size || 0,
            }
          : null
      )
    } else {
      setStep(1)
      setInputMode('file')
      setBookTitle('')
      setAuthor('')
      setTotalPages(200)
      setTextTOC('')
      setImagePreview(null)
      setChapters([])
      setBookGuide(null)
      setParsedFileInfo(null)
    }
    setIsRecognizing(false)
    setIsParsingBook(false)
    setParseError(null)
    setIsDragging(false)
    setTocRawText('')
    setIsDeepSeekAligning(false)
    setIsGeneratingGuide(false)
    setUploadedFile(null)
    setDeepSeekSuccessMsg(null)
    setPlanStartDate(getTodayDateStr())
    setTargetDays(14)
    setDailyMinutes(25)
    setBufferDaysEnabled(true)
    setGeneratedSchedule([])
  }, [initialBook])

  React.useEffect(() => {
    if (isOpen) {
      resetFormState()
    }
  }, [isOpen, resetFormState])

  const handleModalClose = () => {
    resetFormState()
    onClose()
  }

  if (!isOpen) return null

  // 处理电子书文件解析
  const handleProcessBookFile = async (file: File) => {
    if (!file) return

    // 限制单文件上限为 500MB
    const MAX_LIMIT = 500 * 1024 * 1024
    if (file.size > MAX_LIMIT) {
      setParseError(
        `文件大小为 ${formatFileSize(file.size)}，已超过 500MB 上限，请上传 500MB 以内的书籍文件`
      )
      return
    }

    setIsParsingBook(true)
    setParseError(null)

    try {
      setUploadedFile(file)
      const result = await parseBookFile(file)
      setBookTitle(result.title)
      if (result.author) setAuthor(result.author)
      setTotalPages(result.totalPages)
      if (result.coverUrl) {
        setImagePreview(result.coverUrl)
      }
      if (result.chapters && result.chapters.length > 0) {
        setChapters(result.chapters)
      }
      setParsedFileInfo({
        format: result.format,
        fileName: result.fileName,
        fileSize: result.fileSize,
      })

      if (result.tocRawText) {
        setTocRawText(result.tocRawText)
      } else {
        setTocRawText('')
      }
      setDeepSeekSuccessMsg(null)

      // 解析成功后自动前进到第二步核对微调
      setStep(2)
    } catch (err: any) {
      console.error('Book file parse error:', err)
      setParseError(err?.message || '解析书籍文件失败，请确保格式正确且文件未损坏')
    } finally {
      setIsParsingBook(false)
    }
  }

  // 调用 DeepSeek 深度校准真实章节起止页码
  const handleDeepSeekAlign = async () => {
    setIsDeepSeekAligning(true)
    setParseError(null)
    setDeepSeekSuccessMsg(null)

    try {
      const res = await alignChaptersWithDeepSeek({
        bookTitle,
        chapters,
        totalPages,
        tocRawText,
      })

      if (res.chapters && res.chapters.length > 0) {
        setChapters(res.chapters)
        if (res.totalPages) {
          setTotalPages(res.totalPages)
        }
        setDeepSeekSuccessMsg(
          `✨ DeepSeek 对齐成功！已根据全书排版与目录线索校准全部 ${res.chapters.length} 个章节真实起止页`
        )
      }
    } catch (err: any) {
      console.error('DeepSeek alignment error:', err)
      setParseError(
        err?.message || 'DeepSeek 对齐失败，请检查网络或在个人设置中配置 DeepSeek API Key'
      )
    } finally {
      setIsDeepSeekAligning(false)
    }
  }

  // 调用 DeepSeek 生成全书精读导读、核心重点章节与自适应节奏建议
  const handleDeepSeekGenerateGuide = async (overrideGoal?: 'deep' | 'fast' | 'practical') => {
    if (!bookTitle.trim()) return
    const currentGoal = overrideGoal || readingGoal
    setIsGeneratingGuide(true)
    setParseError(null)

    try {
      const res = await generateBookGuideWithDeepSeek({
        bookTitle: bookTitle.trim(),
        author: author.trim(),
        chapters,
        totalPages,
        readingGoal: currentGoal,
      })
      setBookGuide(res)
    } catch (err: any) {
      console.error('DeepSeek guide error:', err)
      setParseError(err?.message || '生成全书导读失败，请检查网络或配置 API Key')
    } finally {
      setIsGeneratingGuide(false)
    }
  }

  // 一键采纳 AI 建议的阅读节奏并前进到排期步骤
  const handleApplyAIPace = (paceDays: number, paceMinutes: number) => {
    setTargetDays(paceDays)
    setDailyMinutes(paceMinutes)
    const sched = generateReadingSchedule({
      chapters,
      targetDays: paceDays,
      dailyMinutes: paceMinutes,
      startDate: getTodayDateStr(),
      bufferDaysEnabled,
    })
    setGeneratedSchedule(sched)
    setStep(3)
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleProcessBookFile(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleProcessBookFile(file)
    }
  }

  // 处理拍照/图片选择
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      setImagePreview(base64)
    }
    reader.readAsDataURL(file)
  }

  // 触发 AI 识别（图片或文本）
  const handleStartRecognize = async () => {
    setIsRecognizing(true)
    try {
      const res = await recognizeBookTOC({
        imageBase64: imagePreview || undefined,
        textInput: textTOC || undefined,
      })
      if (res.title && (!bookTitle || bookTitle === '新录入书籍')) {
        setBookTitle(res.title)
      }
      if (res.author) setAuthor(res.author)
      if (res.total_pages) setTotalPages(res.total_pages)
      if (res.chapters.length > 0) {
        setChapters(res.chapters)
      }
      setParsedFileInfo(null)
      setStep(2)
    } catch (err) {
      console.error('TOC recognition error:', err)
    } finally {
      setIsRecognizing(false)
    }
  }

  // 手动修改章节页码
  const handleUpdateChapter = (idx: number, updates: Partial<BookChapter>) => {
    setChapters((prev) =>
      prev.map((c, i) =>
        i === idx
          ? {
              ...c,
              ...updates,
              page_count: Math.max(
                1,
                (updates.end_page !== undefined ? updates.end_page : c.end_page) -
                  (updates.start_page !== undefined ? updates.start_page : c.start_page) +
                  1
              ),
            }
          : c
      )
    )
  }

  // 添加新章节
  const handleAddChapter = () => {
    const lastChapter = chapters[chapters.length - 1]
    const nextStart = lastChapter ? lastChapter.end_page + 1 : 1
    const nextEnd = Math.min(totalPages, nextStart + 15)
    const newCh: BookChapter = {
      index: chapters.length + 1,
      title: `第 ${chapters.length + 1} 章节`,
      start_page: nextStart,
      end_page: nextEnd,
      page_count: Math.max(1, nextEnd - nextStart + 1),
    }
    setChapters([...chapters, newCh])
  }

  // 删除章节
  const handleDeleteChapter = (idx: number) => {
    setChapters((prev) => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, index: i + 1 })))
  }

  // 生成排期
  const handlePreviewSchedule = () => {
    const sched = generateReadingSchedule({
      chapters,
      targetDays,
      dailyMinutes,
      startDate: planStartDate || getTodayDateStr(),
      bufferDaysEnabled,
    })
    setGeneratedSchedule(sched)
    setStep(3)
  }

  // 仅存入书架（暂不制定排期，待用户自主决定何时开启）
  const handleSaveToBookshelfOnly = () => {
    const bookId = initialBook?.id || `b_${Date.now()}`
    const newBook: Book = {
      id: bookId,
      title: bookTitle.trim() || '未命名书籍',
      author: author.trim() || undefined,
      total_pages: totalPages,
      cover_url: imagePreview || undefined,
      file_name: parsedFileInfo?.fileName,
      file_format: parsedFileInfo?.format,
      file_size: parsedFileInfo?.fileSize,
      chapters,
      guide: bookGuide || initialBook?.guide || undefined,
      reading_notes: initialBook?.reading_notes || undefined,
      ai_summary: initialBook?.ai_summary || undefined,
      cloud_file_url: initialBook?.cloud_file_url || undefined,
      cloud_synced: initialBook?.cloud_synced ?? false,
      created_at: initialBook?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    if (onSaveBookOnly) {
      onSaveBookOnly(newBook)
    }

    // 本地持久化缓存离线二进制，供阅读器直接秒开
    if (uploadedFile) {
      saveBookBinary(bookId, uploadedFile, uploadedFile.name).catch(() => {})
      uploadBookFileToStorage(uploadedFile, uploadedFile.name, bookId)
        .then((res) => {
          if (res.success && res.url) {
            onSaveBookOnly?.({ ...newBook, cloud_file_url: res.url, cloud_synced: true })
          }
        })
        .catch(() => {})
    }

    onClose()
  }

  // 完成并保存
  const handleConfirmAndSave = () => {
    const bookId = initialBook?.id || `b_${Date.now()}`
    const planId = `rp_${Date.now()}`

    const newBook: Book = {
      id: bookId,
      title: bookTitle.trim() || '未命名书籍',
      author: author.trim() || undefined,
      total_pages: totalPages,
      cover_url: imagePreview || undefined,
      file_name: parsedFileInfo?.fileName,
      file_format: parsedFileInfo?.format,
      file_size: parsedFileInfo?.fileSize,
      chapters,
      guide: bookGuide || initialBook?.guide || undefined,
      reading_notes: initialBook?.reading_notes || undefined,
      ai_summary: initialBook?.ai_summary || undefined,
      cloud_file_url: initialBook?.cloud_file_url || undefined,
      cloud_synced: initialBook?.cloud_synced ?? false,
      created_at: initialBook?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (uploadedFile) {
      saveBookBinary(bookId, uploadedFile, uploadedFile.name).catch(() => {})
      uploadBookFileToStorage(uploadedFile, uploadedFile.name, bookId)
        .then((res) => {
          if (res.success && res.url) {
            onSaveBookOnly?.({ ...newBook, cloud_file_url: res.url, cloud_synced: true })
          }
        })
        .catch(() => {})
    }

    const newPlan: ReadingPlan = {
      id: planId,
      book_id: bookId,
      book_title: newBook.title,
      status: 'active',
      start_date: planStartDate || getTodayDateStr(),
      target_end_date: generatedSchedule[generatedSchedule.length - 1]?.date || planStartDate || getTodayDateStr(),
      total_pages: totalPages,
      completed_pages: 0,
      daily_minutes: dailyMinutes,
      pacing_mode: 'pages',
      buffer_days_enabled: bufferDaysEnabled,
      schedule: generatedSchedule,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const tasks = convertScheduleToTasks({
      planId,
      book: newBook,
      schedule: generatedSchedule,
    })

    onPlanCreated(newBook, newPlan, tasks)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md no-drag">
      <div className="w-full max-w-3xl bg-white dark:bg-[#1E1E1E] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-900 dark:text-slate-100 transition-colors">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent dark:from-emerald-950/40 dark:via-slate-900 border-b border-black/5 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#07C160]/15 border border-[#07C160]/30 flex items-center justify-center text-[#07C160]">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>AI 智能阅读规划器</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#07C160]/10 text-[#07C160] font-mono">
                  步骤 {step}/3
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {step === 1 && '上传主流电子书（EPUB/PDF/TXT/MD/MOBI）或拍目录照片，AI 自动提取章节'}
                {step === 2 && '已识别出全书章节与起止页码，可核对微调'}
                {step === 3 && '设定阅读目标节奏，生成自适应每日排期并同步到待办清单'}
              </p>
            </div>
          </div>

          <button
            onClick={handleModalClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* STEP 1: 录入书籍与 AI 识页 / 电子书上传 */}
          {step === 1 && (
            <div className="space-y-5">
              {/* 书名与作者基础信息 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    书名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="上传电子书将自动提取书名，也可手动输入"
                    value={bookTitle}
                    onChange={(e) => setBookTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-[#07C160]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    作者 (选填)
                  </label>
                  <input
                    type="text"
                    placeholder="如：詹姆斯·克利尔"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-[#07C160]"
                  />
                </div>
              </div>

              {/* 三种输入方式切换 Segmented Tabs */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    选择书籍录入与目录解析方式：
                  </label>
                  <div className="flex items-center space-x-1 p-1 bg-black/5 dark:bg-white/5 rounded-xl text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setInputMode('file')}
                      className={`px-3 py-1 rounded-lg transition-all flex items-center space-x-1.5 ${
                        inputMode === 'file'
                          ? 'bg-white dark:bg-slate-800 text-[#07C160] shadow-sm font-semibold'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>上传电子书 (推荐)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputMode('image')}
                      className={`px-3 py-1 rounded-lg transition-all flex items-center space-x-1.5 ${
                        inputMode === 'image'
                          ? 'bg-white dark:bg-slate-800 text-[#07C160] shadow-sm font-semibold'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>拍目录照片</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputMode('text')}
                      className={`px-3 py-1 rounded-lg transition-all flex items-center space-x-1.5 ${
                        inputMode === 'text'
                          ? 'bg-white dark:bg-slate-800 text-[#07C160] shadow-sm font-semibold'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>粘贴目录文本</span>
                    </button>
                  </div>
                </div>

                {/* 模式 1: 上传电子书（支持多种主流格式） */}
                {inputMode === 'file' && (
                  <div className="space-y-3">
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`relative border-2 border-dashed rounded-2xl p-6 transition-all text-center ${
                        isDragging
                          ? 'border-[#07C160] bg-[#07C160]/10 scale-[1.01]'
                          : 'border-slate-200 dark:border-slate-800 hover:border-[#07C160] dark:hover:border-[#07C160] bg-slate-50/50 dark:bg-slate-900/30'
                      }`}
                    >
                      <input
                        type="file"
                        accept=".epub,.pdf,.txt,.md,.markdown,.mobi,.azw,.azw3"
                        onChange={handleFileInputChange}
                        disabled={isParsingBook}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                      />

                      {isParsingBook ? (
                        <div className="py-8 space-y-3">
                          <Loader2 className="w-9 h-9 text-[#07C160] animate-spin mx-auto" />
                          <div>
                            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              正在深度解析书籍格式与目录大纲...
                            </p>
                            <p className="text-[11px] text-slate-400 mt-1">
                              自动提取章节起止页码、作者与封面图片
                            </p>
                          </div>
                        </div>
                      ) : parsedFileInfo ? (
                        <div className="py-4 space-y-3">
                          <div className="w-12 h-12 rounded-xl bg-[#07C160]/15 text-[#07C160] flex items-center justify-center mx-auto">
                            <Check className="w-6 h-6" />
                          </div>
                          <div>
                            <div className="flex items-center justify-center space-x-2">
                              <span className="uppercase text-[10px] font-mono px-2 py-0.5 rounded bg-[#07C160]/15 text-[#07C160] font-bold">
                                {parsedFileInfo.format}
                              </span>
                              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-xs">
                                {parsedFileInfo.fileName}
                              </h4>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1">
                              大小: {formatFileSize(parsedFileInfo.fileSize)} · 已提取 {chapters.length} 个章节 · 共 {totalPages} 页
                            </p>
                          </div>
                          <p className="text-[10px] text-[#07C160] font-medium">
                            点击或拖放新文件可替换
                          </p>
                        </div>
                      ) : (
                        <div className="py-6 space-y-3">
                          <div className="w-12 h-12 rounded-2xl bg-[#07C160]/10 text-[#07C160] flex items-center justify-center mx-auto">
                            <Upload className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              拖放书籍文件到此处，或 <span className="text-[#07C160] underline">点击浏览选择</span>
                            </p>
                            <p className="text-[11px] text-slate-400 mt-1">
                              支持主流格式：EPUB、PDF、TXT、Markdown、MOBI、AZW3（单文件最大支持 500MB）
                            </p>
                          </div>

                          {/* 格式标签说明徽章 */}
                          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono font-medium">
                              单文件支持最高 500MB
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono font-medium">
                              EPUB
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 font-mono font-medium">
                              PDF
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono font-medium">
                              TXT
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-mono font-medium">
                              Markdown
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 font-mono font-medium">
                              MOBI/AZW3
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {parseError && (
                      <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center space-x-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{parseError}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 模式 2: 上传图片 / 拍照识别 */}
                {inputMode === 'image' && (
                  <label className="border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-[#07C160] dark:hover:border-[#07C160] rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-900/30">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    {imagePreview ? (
                      <div className="relative w-full h-40 rounded-xl overflow-hidden">
                        <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity text-white text-xs font-semibold">
                          点击更换照片
                        </div>
                      </div>
                    ) : (
                      <div className="text-center space-y-2 py-4">
                        <Camera className="w-8 h-8 text-[#07C160] mx-auto" />
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                          拍照或上传实体书目录页照片
                        </p>
                        <p className="text-[10px] text-slate-400">调用多模态 AI 视觉模型提取章节标题与页码范围</p>
                      </div>
                    )}
                  </label>
                )}

                {/* 模式 3: 粘贴目录文本 */}
                {inputMode === 'text' && (
                  <div className="flex flex-col">
                    <textarea
                      rows={7}
                      placeholder="复制并粘贴图书目录文字，例如：&#10;第1章 习惯的惊人力量 1&#10;第2章 习惯是如何塑造身份的 25&#10;第3章 打造好习惯的四个步骤 48...&#10;AI 会自动清洗并推导每章页码。"
                      value={textTOC}
                      onChange={(e) => setTextTOC(e.target.value)}
                      className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 leading-relaxed focus:outline-none focus:border-[#07C160] resize-none"
                    />
                  </div>
                )}
              </div>

              {/* 底部操作按钮 */}
              <div className="pt-2 flex items-center justify-between">
                <div className="text-[11px] text-slate-400 flex items-center space-x-1">
                  <Info className="w-3.5 h-3.5" />
                  <span>
                    {inputMode === 'file'
                      ? '上传书籍后将自动完成章节与页码映射'
                      : '点击识别后 AI 将智能提取章节起止页码'}
                  </span>
                </div>

                {inputMode === 'file' ? (
                  <button
                    onClick={() => setStep(2)}
                    disabled={chapters.length === 0}
                    className="px-6 py-2.5 rounded-xl bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059B4D] disabled:opacity-40 text-xs font-semibold text-white shadow-lg shadow-[#07C160]/20 flex items-center space-x-2 transition-all"
                  >
                    <span>下一步：核对章节目录</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleStartRecognize}
                    disabled={isRecognizing || (!imagePreview && !textTOC && !bookTitle)}
                    className="px-6 py-2.5 rounded-xl bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059B4D] disabled:opacity-40 text-xs font-semibold text-white shadow-lg shadow-[#07C160]/20 flex items-center space-x-2 transition-all"
                  >
                    {isRecognizing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>AI 正在识别解析目录与书页...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>调用 AI 识别章节结构</span>
                        <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: 核对与微调章节页码 */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl text-xs text-emerald-800 dark:text-emerald-300">
                <div className="flex items-center space-x-2">
                  <Check className="w-4 h-4 text-[#07C160] shrink-0" />
                  <span>
                    解析成功！已提取 <b>{chapters.length}</b> 个章节，全书共 <b>{totalPages}</b> 页。
                  </span>
                </div>
                <button
                  onClick={handleAddChapter}
                  className="px-2 py-1 rounded bg-[#07C160]/20 hover:bg-[#07C160]/30 text-[#07C160] text-[11px] font-semibold flex items-center space-x-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>添加章节</span>
                </button>
              </div>

              {/* DeepSeek AI 智能工具栏：校准页码 + 全书导读与精读建议 */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-transparent border border-purple-500/25 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                        <span>DeepSeek AI 智能助读与排版校准</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded font-semibold">
                          主流精读体系
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        结合原书章节与目录线索，自动纠正畸形页码；参考微信读书与得到体系，生成结构化导读与分层策略
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleDeepSeekAlign}
                      disabled={isDeepSeekAligning || chapters.length === 0}
                      className="px-3 py-1.5 rounded-xl border border-purple-500/30 hover:bg-purple-500/10 text-purple-700 dark:text-purple-300 text-xs font-medium flex items-center space-x-1 disabled:opacity-50 transition-all cursor-pointer shadow-sm"
                      title="结合图书出版标准常理与真实文字篇幅，纠正错误截断或畸形分配的起止页码"
                    >
                      {isDeepSeekAligning ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>页码校准中...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>校准起止页码</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeepSeekGenerateGuide()}
                      disabled={isGeneratingGuide || !bookTitle.trim()}
                      className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-purple-600/20 flex items-center space-x-1.5 transition-all cursor-pointer"
                      title="让 DeepSeek 分析本书主旨、提炼破局痛点、核心必读章节、读前三问与自适应节奏"
                    >
                      {isGeneratingGuide ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>AI 分析全书中...</span>
                        </>
                      ) : (
                        <>
                          <Compass className="w-3.5 h-3.5" />
                          <span>生成导读与精读建议</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* 阅读偏好导向切换（杜绝死板默认处理） */}
                <div className="pt-2 border-t border-purple-500/15 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center space-x-1">
                      <Target className="w-3 h-3 text-purple-500" />
                      <span>精读导向偏好：</span>
                    </span>
                    <div className="inline-flex p-0.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                      <button
                        type="button"
                        onClick={() => setReadingGoal('deep')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                          readingGoal === 'deep'
                            ? 'bg-purple-600 text-white shadow-xs font-semibold'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                        }`}
                        title="注重底层机理推演、逐章细品与深度笔记批注"
                      >
                        🎯 深度研读
                      </button>
                      <button
                        type="button"
                        onClick={() => setReadingGoal('fast')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                          readingGoal === 'fast'
                            ? 'bg-purple-600 text-white shadow-xs font-semibold'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                        }`}
                        title="抓大放小、快速通览全书核心认知模型与颠覆性洞见"
                      >
                        ⚡ 高效通识
                      </button>
                      <button
                        type="button"
                        onClick={() => setReadingGoal('practical')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                          readingGoal === 'practical'
                            ? 'bg-purple-600 text-white shadow-xs font-semibold'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                        }`}
                        title="知行合一，聚焦工具心法、实操章节与微行动法则"
                      >
                        🛠️ 实用践行
                      </button>
                    </div>
                  </div>

                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    {readingGoal === 'deep' && '🎯 深度研读：深挖理论内核与批判思考，排期更扎实'}
                    {readingGoal === 'fast' && '⚡ 高效通识：提炼核心观点，指导跳读掠读，排期更紧凑'}
                    {readingGoal === 'practical' && '🛠️ 实用践行：聚焦方法论工具章，随读随落地'}
                  </span>
                </div>

                {deepSeekSuccessMsg && (
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-300 flex items-center space-x-2">
                    <Check className="w-4 h-4 shrink-0 text-[#07C160]" />
                    <span>{deepSeekSuccessMsg}</span>
                  </div>
                )}
              </div>

              {/* AI 导读与精读建议展示卡片 */}
              {bookGuide && (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-500/10 via-emerald-500/5 to-teal-500/10 border border-purple-500/25 space-y-4 text-xs animate-in fade-in duration-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-500/15 pb-3">
                    <div className="flex items-center space-x-2 text-purple-700 dark:text-purple-300 font-bold">
                      <Compass className="w-4 h-4 text-purple-600" />
                      <span>
                        {bookGuide.reading_mode === 'fast'
                          ? '⚡ 高效通识 · AI 导读与精读指南'
                          : bookGuide.reading_mode === 'practical'
                            ? '🛠️ 实用践行 · AI 导读与精读指南'
                            : '🎯 深度研读 · AI 导读与精读指南'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApplyAIPace(bookGuide.target_days, bookGuide.daily_minutes)}
                      className="px-3.5 py-1.5 rounded-xl bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059B4D] text-white text-[11px] font-semibold flex items-center space-x-1.5 shadow-md shadow-[#07C160]/20 transition-all cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>一键采纳建议节奏并排期 ({bookGuide.target_days}天 · {bookGuide.daily_minutes}分钟/天)</span>
                    </button>
                  </div>

                  {/* 1. 导读主旨与破解痛点 */}
                  <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/5 dark:border-white/5 space-y-2.5">
                    <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-[#07C160]" />
                      <span>全书核心主旨与思想价值</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">
                      {bookGuide.summary}
                    </p>

                    {bookGuide.core_problem && (
                      <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-800 dark:text-purple-300 text-[11px] leading-relaxed flex items-start space-x-2">
                        <Lightbulb className="w-3.5 h-3.5 text-purple-600 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-semibold">为什么值得读 · 破解的现实痛点：</strong>
                          <span>{bookGuide.core_problem}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. 全书认知演进路线图 */}
                  {bookGuide.reading_roadmap && bookGuide.reading_roadmap.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/5 dark:border-white/5 space-y-2">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                        <Layers className="w-3.5 h-3.5 text-indigo-500" />
                        <span>全书认知演进逻辑脉络 (Mental Roadmap)</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {bookGuide.reading_roadmap.map((stepItem, sIdx) => (
                          <div
                            key={sIdx}
                            className="p-2 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/40 dark:border-indigo-800/30 text-[11px] text-slate-700 dark:text-slate-300"
                          >
                            <span className="font-medium text-indigo-600 dark:text-indigo-400 mr-1.5">
                              {stepItem.slice(0, 2)}
                            </span>
                            <span>{stepItem.slice(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 3. 分层精读策略：核心精读 vs 建议略读 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* 核心精读章节 */}
                    <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/5 dark:border-white/5 space-y-2">
                      <div className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center space-x-1.5">
                        <BookmarkCheck className="w-3.5 h-3.5 text-emerald-500" />
                        <span>核心必读章 (建议逐字深研)</span>
                      </div>
                      <div className="space-y-2">
                        {bookGuide.core_chapter_details && bookGuide.core_chapter_details.length > 0 ? (
                          bookGuide.core_chapter_details.map((ch, i) => (
                            <div
                              key={i}
                              className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] space-y-1"
                            >
                              <div className="flex items-center justify-between text-emerald-900 dark:text-emerald-200 font-semibold">
                                <span className="truncate">🎯 {ch.title}</span>
                                {ch.pages && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                                    {ch.pages}
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[10px]">
                                {ch.reason}
                              </p>
                            </div>
                          ))
                        ) : (
                          bookGuide.core_chapters.map((ch, i) => (
                            <div
                              key={i}
                              className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-2.5 py-1 rounded-lg font-medium truncate"
                            >
                              🎯 {ch}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* 建议略读/跳读章节 */}
                    <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/5 dark:border-white/5 space-y-2">
                      <div className="font-semibold text-amber-700 dark:text-amber-400 flex items-center space-x-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        <span>建议略读/选读章 (抓大放小)</span>
                      </div>
                      <div className="space-y-2">
                        {bookGuide.skim_chapters && bookGuide.skim_chapters.length > 0 ? (
                          bookGuide.skim_chapters.map((ch, i) => (
                            <div
                              key={i}
                              className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] space-y-1"
                            >
                              <div className="flex items-center justify-between text-amber-900 dark:text-amber-200 font-semibold">
                                <span className="truncate">⚡ {ch.title}</span>
                                {ch.pages && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">
                                    {ch.pages}
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[10px]">
                                {ch.tip}
                              </p>
                            </div>
                          ))
                        ) : (
                          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 text-[11px] leading-relaxed">
                            <span>背景介绍与案例铺陈段落可快速略读，核心聚焦点留在论点与总结即可。</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 4. 读前灵魂三问 & 落地微行动 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* 读前灵魂三问 */}
                    {bookGuide.pre_reading_questions && bookGuide.pre_reading_questions.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/5 dark:border-white/5 space-y-2">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                          <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
                          <span>读前灵魂拷问 (带着问题读)</span>
                        </div>
                        <div className="space-y-1.5">
                          {bookGuide.pre_reading_questions.map((q, idx) => (
                            <div
                              key={idx}
                              className="text-[11px] text-slate-700 dark:text-slate-300 p-2 rounded-lg bg-blue-500/5 border border-blue-500/10 flex items-start space-x-1.5"
                            >
                              <span className="font-mono text-blue-500 font-bold shrink-0">{idx + 1}.</span>
                              <span className="leading-snug">{q}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 落地微行动法则 */}
                    {bookGuide.actionable_habits && bookGuide.actionable_habits.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/5 dark:border-white/5 space-y-2">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                          <Zap className="w-3.5 h-3.5 text-amber-500" />
                          <span>读完立即可用的行动微心法</span>
                        </div>
                        <div className="space-y-1.5">
                          {bookGuide.actionable_habits.map((act, idx) => (
                            <div
                              key={idx}
                              className="text-[11px] text-slate-700 dark:text-slate-300 p-2 rounded-lg bg-amber-500/5 border border-amber-500/10 flex items-start space-x-1.5"
                            >
                              <Check className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                              <span className="leading-snug">{act}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 5. 节奏建议条 */}
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-black/5 dark:bg-white/5 p-3 rounded-xl flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-1.5">
                      <span>⏱️</span>
                      <span><strong>科学排期节奏</strong>：{bookGuide.recommended_pace}</span>
                    </div>
                    <div className="flex items-center space-x-2 shrink-0 font-mono text-[10px] text-purple-700 dark:text-purple-300 font-semibold">
                      <span className="px-2 py-0.5 rounded-full bg-purple-500/15">
                        建议 {bookGuide.target_days} 天
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-purple-500/15">
                        每日 {bookGuide.daily_minutes} 分钟
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {parseError && step === 2 && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              {/* 章节列表 */}
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {chapters.map((ch, idx) => {
                  const pct = Math.round((ch.page_count / Math.max(1, totalPages)) * 100)
                  return (
                    <div
                      key={idx}
                      className="group p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col space-y-1.5 text-xs transition-colors hover:border-slate-300 dark:hover:border-slate-700"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="w-6 h-6 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center font-mono text-[10px] text-slate-500 shrink-0">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={ch.title}
                          onChange={(e) => handleUpdateChapter(idx, { title: e.target.value })}
                          className="flex-1 bg-transparent border-none text-xs font-medium focus:outline-none"
                        />
                        <div className="flex items-center space-x-1.5 shrink-0 text-slate-500 font-mono text-[11px]">
                          <span>P</span>
                          <input
                            type="number"
                            value={ch.start_page}
                            onChange={(e) => handleUpdateChapter(idx, { start_page: parseInt(e.target.value) || 1 })}
                            className="w-12 px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center"
                          />
                          <span>~</span>
                          <input
                            type="number"
                            value={ch.end_page}
                            onChange={(e) =>
                              handleUpdateChapter(idx, { end_page: parseInt(e.target.value) || ch.start_page })
                            }
                            className="w-12 px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center"
                          />
                          <span className="text-[10px] text-slate-400">({ch.page_count}页)</span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                              pct > 30
                                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                                : 'bg-slate-200/60 dark:bg-slate-800 text-slate-500'
                            }`}
                            title={`占全书比例约 ${pct}%`}
                          >
                            {pct}%
                          </span>
                        </div>

                        <button
                          onClick={() => handleDeleteChapter(idx)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded transition-all"
                          title="删除章节"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* 章节占比进度指示线 */}
                      <div className="w-full bg-black/5 dark:bg-white/5 h-1 rounded-full overflow-hidden">
                        <div
                          className="bg-[#07C160]/60 dark:bg-[#07C160]/40 h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 底部按钮 */}
              <div className="pt-3 flex flex-wrap items-center justify-between gap-2 border-t border-black/5 dark:border-white/5">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/5 flex items-center space-x-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{initialBook ? '返回上一步' : '返回重新选择书籍'}</span>
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleSaveToBookshelfOnly}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center space-x-1.5 transition-all shadow-sm"
                    title="仅保存此书与已解析章节到我的书架，暂不生成每日排期待办"
                  >
                    <BookMarked className="w-4 h-4 text-[#07C160]" />
                    <span>仅存入书架 (暂不制订排期)</span>
                  </button>

                  <button
                    onClick={handlePreviewSchedule}
                    className="px-6 py-2.5 rounded-xl bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059B4D] text-xs font-semibold text-white shadow-lg shadow-[#07C160]/20 flex items-center space-x-2 transition-all"
                  >
                    <span>下一步：定制阅读节奏</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: 定制节奏与排期预览 */}
          {step === 3 && (
            <div className="space-y-5">
              {/* 参数设定 */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                  <label className="text-[11px] text-slate-500 font-medium">计划开始日期</label>
                  <DatePicker
                    value={planStartDate}
                    onChange={(newStart) => {
                      const s = newStart || getTodayDateStr()
                      setPlanStartDate(s)
                      setGeneratedSchedule(
                        generateReadingSchedule({
                          chapters,
                          targetDays,
                          dailyMinutes,
                          startDate: s,
                          bufferDaysEnabled,
                        })
                      )
                    }}
                    size="sm"
                    className="w-full"
                  />
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                  <label className="text-[11px] text-slate-500 font-medium">完读目标天数</label>
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-[#07C160]" />
                    <select
                      value={targetDays}
                      onChange={(e) => {
                        const days = Number(e.target.value)
                        setTargetDays(days)
                        setGeneratedSchedule(
                          generateReadingSchedule({
                            chapters,
                            targetDays: days,
                            dailyMinutes,
                            startDate: planStartDate || getTodayDateStr(),
                            bufferDaysEnabled,
                          })
                        )
                      }}
                      className="bg-transparent text-xs font-semibold focus:outline-none flex-1"
                    >
                      <option value={7}>7 天冲刺速读</option>
                      <option value={14}>14 天两周精读</option>
                      <option value={21}>21 天习惯养成</option>
                      <option value={30}>30 天一个月细读</option>
                      <option value={60}>60 天大部头长线</option>
                    </select>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                  <label className="text-[11px] text-slate-500 font-medium">每日阅读专注时段</label>
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-[#07C160]" />
                    <select
                      value={dailyMinutes}
                      onChange={(e) => {
                        const mins = Number(e.target.value)
                        setDailyMinutes(mins)
                        setGeneratedSchedule(
                          generateReadingSchedule({
                            chapters,
                            targetDays,
                            dailyMinutes: mins,
                            startDate: planStartDate || getTodayDateStr(),
                            bufferDaysEnabled,
                          })
                        )
                      }}
                      className="bg-transparent text-xs font-semibold focus:outline-none flex-1"
                    >
                      <option value={15}>15 分钟/天 (微习惯)</option>
                      <option value={25}>25 分钟/天 (1个番茄钟)</option>
                      <option value={45}>45 分钟/天 (深度阅读)</option>
                      <option value={60}>60 分钟/天 (沉浸专研)</option>
                    </select>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                  <label className="text-[11px] text-slate-500 font-medium">弹性缓冲机制</label>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-medium">每周预留缓冲区</span>
                    <input
                      type="checkbox"
                      checked={bufferDaysEnabled}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setBufferDaysEnabled(checked)
                        setGeneratedSchedule(
                          generateReadingSchedule({
                            chapters,
                            targetDays,
                            dailyMinutes,
                            startDate: planStartDate || getTodayDateStr(),
                            bufferDaysEnabled: checked,
                          })
                        )
                      }}
                      className="rounded accent-[#07C160] w-4 h-4 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* 生成的每日排期预览 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    预计总日程: <b>{generatedSchedule.length}</b> 天 · 完读日期:{' '}
                    <b>{generatedSchedule[generatedSchedule.length - 1]?.date || '-'}</b>
                  </span>
                  <span className="text-[#07C160] font-mono">
                    每天均读约 {Math.round(totalPages / Math.max(1, generatedSchedule.length))} 页
                  </span>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-2 pr-1 select-text">
                  {generatedSchedule.map((item) => (
                    <div
                      key={item.day_index}
                      className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                        item.is_buffer_day
                          ? 'bg-amber-500/5 border-amber-500/20 text-amber-800 dark:text-amber-300'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0 flex-1 mr-2">
                        <span className="font-mono text-[10px] text-slate-400 w-10 shrink-0">
                          Day {item.day_index}
                        </span>
                        <DatePicker
                          value={item.date}
                          onChange={(newDate) => {
                            if (!newDate) return
                            setGeneratedSchedule((prev) =>
                              prev.map((s) => (s.day_index === item.day_index ? { ...s, date: newDate } : s))
                            )
                          }}
                          size="xs"
                          title="点击日期可自由微调分配排期"
                          className="shrink-0"
                        />
                        <span
                          className="font-medium text-slate-800 dark:text-slate-200 truncate cursor-default"
                          title={item.chapter_title}
                        >
                          {item.chapter_title}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2.5 shrink-0">
                        {!item.is_buffer_day && (
                          <span className="font-mono text-[10px] text-[#07C160] bg-[#07C160]/10 px-2 py-0.5 rounded">
                            P{item.start_page} ~ P{item.end_page} ({item.page_count}页)
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono">
                          {item.estimated_minutes}m
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 底部按钮 */}
              <div className="pt-3 flex items-center justify-between border-t border-black/5 dark:border-white/5">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/5 flex items-center space-x-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>微调章节目录</span>
                </button>

                <button
                  onClick={handleConfirmAndSave}
                  className="px-6 py-2.5 rounded-xl bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059B4D] text-xs font-semibold text-white shadow-lg shadow-[#07C160]/20 flex items-center space-x-2"
                >
                  <Check className="w-4 h-4" />
                  <span>确认规划并同步到待办清单</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
