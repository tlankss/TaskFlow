import React, { useState, useEffect, useRef } from 'react'
import {
  X,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ScrollText,
  PanelLeft,
  List,
  Maximize2,
  Minimize2,
  Clock,
  Sparkles,
  Sun,
  Moon,
  Upload,
  Check,
  RotateCcw,
  Sliders,
  FileText,
  Loader2,
  ZoomIn,
  ZoomOut,
  Bookmark,
  Cloud,
  CheckCircle2,
  Play,
  Pause,
  Search,
  Palette,
  Type,
  Gauge,
  Zap,
  Filter,
} from 'lucide-react'
import { Book, BookChapter, ReadingPlan } from '../../types'
import { getBookBinary, saveBookBinary } from '../../lib/bookStorage'
import { uploadBookFileToStorage, downloadBookFileFromStorage } from '../../lib/supabase'
import { correctBookTOCWithAI } from '../../lib/readingAI'
import * as pdfjsLib from 'pdfjs-dist'
import JSZip from 'jszip'

interface BookReaderModalProps {
  isOpen: boolean
  onClose: () => void
  book: Book
  associatedPlan?: ReadingPlan | null
  onUpdateProgress?: (bookId: string, completedPages: number, elapsedMinutes: number) => void
  onUpdateBook?: (book: Book) => void
}

type ReaderTheme = 'white' | 'sepia' | 'mint' | 'gray' | 'dark' | 'navy'

const THEME_STYLES: Record<
  ReaderTheme,
  {
    bg: string
    text: string
    toolbarBg: string
    border: string
    accent: string
    name: string
    swatch: string
  }
> = {
  sepia: {
    bg: 'bg-[#F5F0E6]',
    text: 'text-[#332A22]',
    toolbarBg: 'bg-[#EDE6D8]/95 backdrop-blur-md',
    border: 'border-[#E0D5C1]',
    accent: '#8C6239',
    name: '羊皮纸',
    swatch: '#F5F0E6',
  },
  white: {
    bg: 'bg-[#FBFBFB]',
    text: 'text-[#1F1F1F]',
    toolbarBg: 'bg-white/95 backdrop-blur-md',
    border: 'border-slate-200',
    accent: '#07C160',
    name: '纸白',
    swatch: '#FFFFFF',
  },
  mint: {
    bg: 'bg-[#EAF3EC]',
    text: 'text-[#1D3828]',
    toolbarBg: 'bg-[#DDEEE1]/95 backdrop-blur-md',
    border: 'border-[#CCE3D2]',
    accent: '#07C160',
    name: '薄荷青',
    swatch: '#EAF3EC',
  },
  gray: {
    bg: 'bg-[#ECEBE6]',
    text: 'text-[#282725]',
    toolbarBg: 'bg-[#E2E0D8]/95 backdrop-blur-md',
    border: 'border-[#D4D2C8]',
    accent: '#07C160',
    name: '雅致灰',
    swatch: '#ECEBE6',
  },
  dark: {
    bg: 'bg-[#151516]',
    text: 'text-[#D4D4D8]',
    toolbarBg: 'bg-[#1E1E20]/95 backdrop-blur-md',
    border: 'border-slate-800',
    accent: '#07C160',
    name: '夜间黑',
    swatch: '#18181A',
  },
  navy: {
    bg: 'bg-[#0D1520]',
    text: 'text-[#C8D1D9]',
    toolbarBg: 'bg-[#15202E]/95 backdrop-blur-md',
    border: 'border-slate-800',
    accent: '#38BDF8',
    name: '深海蓝',
    swatch: '#0D1520',
  },
}

export const BookReaderModal: React.FC<BookReaderModalProps> = ({
  isOpen,
  onClose,
  book,
  associatedPlan,
  onUpdateProgress,
  onUpdateBook,
}) => {
  // 核心状态
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null)
  const [isUploadingToCloud, setIsUploadingToCloud] = useState(false)
  const [cloudSyncStatus, setCloudSyncStatus] = useState<string | null>(null)

  // 阅读排版偏好设置 (持久化于 localStorage)
  const [theme, setTheme] = useState<ReaderTheme>(() => {
    return (localStorage.getItem('taskflow_reader_theme') as ReaderTheme) || 'sepia'
  })
  const [fontSize, setFontSize] = useState<number>(() => {
    return Number(localStorage.getItem('taskflow_reader_fontsize')) || 18
  })
  const [lineHeight, setLineHeight] = useState<number>(() => {
    return Number(localStorage.getItem('taskflow_reader_lineheight')) || 1.8
  })
  const [maxWidth, setMaxWidth] = useState<number>(() => {
    return Number(localStorage.getItem('taskflow_reader_maxwidth')) || 820
  })
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif' | 'kaiti'>(() => {
    return (localStorage.getItem('taskflow_reader_fontfamily') as any) || 'sans'
  })

  // 阅读布局模式：'scroll' 上下无缝连续滑动 (微信读书主打)，'page' 单节翻页
  const [readingMode, setReadingMode] = useState<'scroll' | 'page'>('scroll')

  // 交互控制与侧边栏细分 Tab
  const [showControls, setShowControls] = useState(true)
  // 默认在桌面端展开侧边目录，方便用户浏览与点击跳转
  const [isTocOpen, setIsTocOpen] = useState(true)
  const [sidebarTab, setSidebarTab] = useState<'toc' | 'style' | 'autoscroll'>('toc')
  const [tocSearchQuery, setTocSearchQuery] = useState('')
  const [filterMeaningfulOnly, setFilterMeaningfulOnly] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // 自动滚动引擎状态
  const [isAutoScrolling, setIsAutoScrolling] = useState(false)
  const [autoScrollSpeed, setAutoScrollSpeed] = useState<number>(() => {
    return Number(localStorage.getItem('taskflow_reader_autoscroll_speed')) || 1.5
  })
  const autoScrollRafRef = useRef<number | null>(null)
  const accumulatedScrollRef = useRef<number>(0)
  const [isPausedByManualScroll, setIsPausedByManualScroll] = useState(false)
  const manualScrollResumeTimerRef = useRef<NodeJS.Timeout | null>(null)
  // 定时自动翻页（用于 PDF 文档或单节翻页模式，单位：秒/页）
  const [autoPageTurnInterval, setAutoPageTurnInterval] = useState<number>(15)
  const [pageTurnRemaining, setPageTurnRemaining] = useState<number>(15)
  // 视线聚焦辅助线
  const [showReadingGuideLine, setShowReadingGuideLine] = useState<boolean>(() => {
    return localStorage.getItem('taskflow_reader_guideline') === 'true'
  })

  // AI 智能矫正目录状态
  const [isCorrectingTOC, setIsCorrectingTOC] = useState(false)
  const [aiTOCSuccessMsg, setAiTOCSuccessMsg] = useState<string | null>(null)
  const [aiTOCErrorMsg, setAiTOCErrorMsg] = useState<string | null>(null)

  // 进度与章节定位
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0)
  const [currentPage, setCurrentPage] = useState<number>(() => {
    return associatedPlan?.completed_pages ? Math.max(1, associatedPlan.completed_pages) : 1
  })
  const [pdfTotalPages, setPdfTotalPages] = useState<number>(book.total_pages || 100)
  const [progressPercentage, setProgressPercentage] = useState(0)

  // 计时与统计 (专注阅读时长统计)
  const [readingSeconds, setReadingSeconds] = useState(0)
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // 电子书渲染数据
  const [epubChapters, setEpubChapters] = useState<{ id: string; title: string; html: string; href: string }[]>([])
  const [textContent, setTextContent] = useState<string[]>([])
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const pdfDocRef = useRef<any>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  // 1. 加载文件二进制数据 (从 IndexedDB 或云端 URL / Supabase Storage)
  useEffect(() => {
    if (!isOpen) return

    let isMounted = true
    setIsLoading(true)
    setLoadError(null)

    async function loadData() {
      try {
        // 先查本地 IndexedDB
        let buffer = await getBookBinary(book.id)

        // 若本地没有，尝试从云端书库拉取
        if (!buffer) {
          buffer = await downloadBookFileFromStorage(book)
          if (buffer) {
            // 自动存回本地 IndexedDB，下次免下载秒开
            saveBookBinary(book.id, buffer, book.file_name || 'book').catch(() => {})
          }
        }

        if (!isMounted) return

        if (buffer) {
          setFileBuffer(buffer)
          await parseBufferForReading(buffer)
        } else {
          setIsLoading(false)
        }
      } catch (err: any) {
        if (!isMounted) return
        setLoadError(err.message || '加载书籍文件失败')
        setIsLoading(false)
      }
    }

    loadData()

    return () => {
      isMounted = false
    }
  }, [isOpen, book.id, book.cloud_file_url])

  // 2. 解析文件供直接阅读渲染
  const parseBufferForReading = async (buffer: ArrayBuffer) => {
    setIsLoading(true)
    try {
      const format = (book.file_format || '').toLowerCase()

      if (format === 'epub' || book.file_name?.endsWith('.epub')) {
        await parseEpubContent(buffer)
      } else if (format === 'pdf' || book.file_name?.endsWith('.pdf')) {
        await parsePdfContent(buffer)
      } else {
        // TXT / Markdown
        parseTextContent(buffer)
      }
    } catch (err: any) {
      console.error('[BookReader] parseBufferForReading error:', err)
      setLoadError(err.message || '解析书籍内容失败')
    } finally {
      setIsLoading(false)
    }
  }

  // 解析 EPUB 内容与章节，并提取真实的 NCX/NAV 章节名和完整图片
  const parseEpubContent = async (buffer: ArrayBuffer) => {
    const zip = await JSZip.loadAsync(buffer)

    // 读取 META-INF/container.xml 找到 OPF 路径
    const containerXml = await zip.file('META-INF/container.xml')?.async('text')
    let opfPath = 'content.opf'
    if (containerXml) {
      const doc = new DOMParser().parseFromString(containerXml, 'application/xml')
      const rootfile = doc.querySelector('rootfile')
      if (rootfile && rootfile.getAttribute('full-path')) {
        opfPath = rootfile.getAttribute('full-path')!
      }
    }

    const opfContent = await zip.file(opfPath)?.async('text')
    if (!opfContent) throw new Error('无法读取 EPUB 描述文件')

    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : ''
    const doc = new DOMParser().parseFromString(opfContent, 'application/xml')

    // Manifest: 收集所有资源映射及 TOC 文件路径 (ncx / nav)
    const manifestItems = new Map<string, string>()
    let ncxHref: string | null = null
    let navHref: string | null = null

    doc.querySelectorAll('manifest > item').forEach((item) => {
      const id = item.getAttribute('id') || ''
      const href = item.getAttribute('href') || ''
      const mediaType = item.getAttribute('media-type') || ''
      const props = item.getAttribute('properties') || ''

      if (id && href) manifestItems.set(id, href)
      if (mediaType === 'application/x-dtbncx+xml' || id.toLowerCase().includes('ncx') || href.endsWith('.ncx')) {
        ncxHref = href
      }
      if (props.includes('nav') || id.toLowerCase().includes('nav') || href.includes('nav.xhtml') || href.includes('toc.xhtml')) {
        navHref = href
      }
    })

    // 解析 NCX 目录结构得到真实的章节名称映射 (href/file -> Title)
    const ncxTitleMap = new Map<string, string>()
    if (ncxHref) {
      const ncxFile = zip.file(opfDir + ncxHref) || zip.file(ncxHref) || zip.file(decodeURIComponent(opfDir + ncxHref))
      if (ncxFile) {
        try {
          const ncxContent = await ncxFile.async('text')
          const ncxDoc = new DOMParser().parseFromString(ncxContent, 'application/xml')
          ncxDoc.querySelectorAll('navPoint').forEach((np) => {
            const labelText = np.querySelector('navLabel > text')?.textContent?.trim()
            const contentSrc = np.querySelector('content')?.getAttribute('src')?.split('#')[0]
            if (labelText && contentSrc) {
              ncxTitleMap.set(contentSrc, labelText)
              ncxTitleMap.set(decodeURIComponent(contentSrc), labelText)
              const baseName = contentSrc.split('/').pop() || contentSrc
              ncxTitleMap.set(baseName, labelText)
            }
          })
        } catch {}
      }
    }

    // Spine 排序
    const spineItemRefs: string[] = []
    doc.querySelectorAll('spine > itemref').forEach((itemref) => {
      const idref = itemref.getAttribute('idref')
      if (idref && manifestItems.has(idref)) {
        spineItemRefs.push(manifestItems.get(idref)!)
      }
    })

    // 提取每个章节的 HTML 内容，并替换内部图片相对路径
    const extractedChapters: Array<{ id: string; title: string; html: string; href: string }> = []

    for (let i = 0; i < spineItemRefs.length; i++) {
      const href = spineItemRefs[i]
      const fullPath = opfDir + href
      const chapterFile = zip.file(fullPath) || zip.file(decodeURIComponent(fullPath))
      if (!chapterFile) continue

      let rawHtml = await chapterFile.async('text')
      const chapterDoc = new DOMParser().parseFromString(rawHtml, 'text/html')

      // 提取标题：优先 NCX/NAV 真实章节目录
      const baseHref = href.split('/').pop() || href
      let title = ncxTitleMap.get(href) || ncxTitleMap.get(baseHref) || ''

      // 1. 若已有合法且非未知的已保存章节标题，优先复用（防止重新解析时抹除已矫正的标题）
      if (!title || /^(未知|未命名|无标题|无题|untitled|unknown)$/i.test(title.trim())) {
        if (
          book.chapters &&
          book.chapters[i]?.title &&
          !/^(未知|未命名|无标题|无题|untitled|unknown)$/i.test(book.chapters[i].title.trim())
        ) {
          title = book.chapters[i].title
        }
      }

      // 2. 若依然无标题或属于占位词，在 DOM 中寻找有实质内容的标题（排除纯数字、<title>未知</title>等）
      if (!title || /^(未知|未命名|无标题|无题|untitled|unknown)$/i.test(title.trim())) {
        const headingCandidates = Array.from(
          chapterDoc.querySelectorAll('h1, h2, h3, h4, .chapter-title, p strong, p b, .title')
        )
        for (const el of headingCandidates) {
          const t = el.textContent?.replace(/\s+/g, ' ').trim() || ''
          // 过滤纯数字、符号或占位字符
          if (
            t &&
            !/^\d+$/.test(t) &&
            t.length >= 2 &&
            t.length <= 60 &&
            !/^(未知|未命名|无标题|无题|untitled|unknown|chapter|text|page\s*\d+)$/i.test(t)
          ) {
            title = t
            break
          }
        }
      }

      // 3. 识别封面、扉页、目录
      if (i === 0 && (href.toLowerCase().includes('cover') || title.toLowerCase() === 'cover')) {
        title = '封面'
      } else if (href.toLowerCase().includes('titlepage')) {
        title = '扉页'
      } else if (href.toLowerCase().includes('toc') && !title.includes('目录')) {
        title = '目录'
      } else if (!title || /^(未知|未命名|无标题|无题|untitled|unknown)$/i.test(title.trim())) {
        // 4. 从正文第一段有意义文本中尝试识别章节名（例如“第六章 思维之乐”或“第一节 体验的结构”）
        const bodyText = chapterDoc.body?.textContent?.replace(/\s+/g, ' ').trim() || ''
        const firstLine = bodyText.slice(0, 45).split(/[。！？\n]/)[0]?.trim() || ''
        if (
          firstLine &&
          firstLine.length >= 2 &&
          firstLine.length <= 35 &&
          !/^(未知|未命名|untitled)/i.test(firstLine) &&
          /(章|节|篇|部|序|引言|结语|心流|导论|前言|致谢)/.test(firstLine)
        ) {
          title = firstLine
        } else {
          const prevChapter = extractedChapters[extractedChapters.length - 1]
          if (prevChapter && !prevChapter.title.includes('封面') && !prevChapter.title.includes('目录')) {
            const cleanPrev = prevChapter.title.replace(/\s*\(续.*?\)$/, '')
            title = `${cleanPrev} (续)`
          } else {
            title = `第 ${i + 1} 节`
          }
        }
      }

      // 替换图片引用：兼容 <img> 以及 SVG 内嵌的 <image xlink:href="...">
      const imgElements = chapterDoc.querySelectorAll('img, image')
      for (let j = 0; j < imgElements.length; j++) {
        const img = imgElements[j]
        const src = img.getAttribute('src') || img.getAttribute('xlink:href') || img.getAttribute('href')
        if (src && !src.startsWith('http') && !src.startsWith('data:')) {
          const chapterDir = fullPath.includes('/') ? fullPath.substring(0, fullPath.lastIndexOf('/') + 1) : ''
          const imgPath = resolveRelativePath(chapterDir, src)
          const imgZipFile = zip.file(imgPath) || zip.file(decodeURIComponent(imgPath))
          if (imgZipFile) {
            const imgData = await imgZipFile.async('base64')
            const ext = imgPath.split('.').pop()?.toLowerCase() || 'jpg'
            const mime = ext === 'png' ? 'image/png' : ext === 'svg' ? 'image/svg+xml' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
            const dataUrl = `data:${mime};base64,${imgData}`
            img.setAttribute('src', dataUrl)
            img.setAttribute('xlink:href', dataUrl)
            img.setAttribute('href', dataUrl)
          }
        }
      }

      // 清除可能截断内容或阻碍滚动的破坏性内联样式 (如 overflow:hidden, height:100vh)
      if (chapterDoc.body) {
        chapterDoc.body.style.height = 'auto'
        chapterDoc.body.style.overflow = 'visible'
        chapterDoc.body.querySelectorAll('*').forEach((el: any) => {
          const s = el.getAttribute('style') || ''
          if (s.includes('overflow') || s.includes('height') || s.includes('position: fixed') || s.includes('position: absolute')) {
            el.style.overflow = 'visible'
            el.style.height = 'auto'
            el.style.maxHeight = 'none'
            if (el.style.position === 'fixed' || el.style.position === 'absolute') {
              el.style.position = 'static'
            }
          }
        })
      }

      // 获取 body 内容
      const bodyHtml = chapterDoc.body ? chapterDoc.body.innerHTML : rawHtml
      extractedChapters.push({
        id: `ch_${i}`,
        title,
        html: bodyHtml,
        href,
      })
    }

    setEpubChapters(extractedChapters)
  }

  // 相对路径解析辅助函数
  const resolveRelativePath = (base: string, relative: string) => {
    const stack = base.split('/').filter(Boolean)
    const parts = relative.split('/')
    for (const part of parts) {
      if (part === '.') continue
      if (part === '..') {
        stack.pop()
      } else {
        stack.push(part)
      }
    }
    return stack.join('/')
  }

  // 解析 PDF
  const parsePdfContent = async (buffer: ArrayBuffer) => {
    const loadingTask = pdfjsLib.getDocument({ data: buffer })
    const pdfDoc = await loadingTask.promise
    pdfDocRef.current = pdfDoc
    setPdfTotalPages(pdfDoc.numPages)
    renderPdfPage(currentPage, pdfDoc)
  }

  // 渲染 PDF 指定页
  const renderPdfPage = async (pageNumber: number, pdfInstance?: any) => {
    const pdf = pdfInstance || pdfDocRef.current
    if (!pdf) return

    try {
      const page = await pdf.getPage(pageNumber)
      const canvas = pdfCanvasRef.current
      if (!canvas) return

      const context = canvas.getContext('2d')
      if (!context) return

      // Retina 屏幕高 DPI 清晰渲染
      const pixelRatio = window.devicePixelRatio || 1
      const viewport = page.getViewport({ scale: 1.5 })

      canvas.height = viewport.height * pixelRatio
      canvas.width = viewport.width * pixelRatio
      canvas.style.height = `${viewport.height}px`
      canvas.style.width = `${viewport.width}px`

      context.scale(pixelRatio, pixelRatio)

      const renderContext = {
        canvasContext: context,
        viewport,
      }

      await page.render(renderContext).promise
    } catch (err: any) {
      if (err.name !== 'RenderingCancelledException') {
        console.warn('PDF render page error:', err)
      }
    }
  }

  // 解析纯文本
  const parseTextContent = (buffer: ArrayBuffer) => {
    let decoder = new TextDecoder('utf-8')
    let text = decoder.decode(buffer)
    if (text.includes('')) {
      try {
        decoder = new TextDecoder('gbk')
        text = decoder.decode(buffer)
      } catch {}
    }
    const paragraphs = text
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean)
    setTextContent(paragraphs)
  }

  // 监听容器上下连续滑动，实时计算进度与当前可视章节
  const handleContainerScroll = () => {
    const container = scrollContainerRef.current
    if (!container) return

    // 1. 计算总滚动百分比
    const maxScroll = container.scrollHeight - container.clientHeight
    if (maxScroll > 0) {
      const pct = Math.min(100, Math.max(0, Math.round((container.scrollTop / maxScroll) * 100)))
      setProgressPercentage(pct)
    }

    // 2. 识别当前视口顶部的章节
    if (readingMode === 'scroll') {
      const sections = container.querySelectorAll('.chapter-section')
      const containerTop = container.getBoundingClientRect().top
      for (let i = 0; i < sections.length; i++) {
        const rect = sections[i].getBoundingClientRect()
        if (rect.bottom > containerTop + 80) {
          setCurrentChapterIndex(i)
          break
        }
      }
    }
  }

  // 点击目录章节立即平滑跳转到对应章节位置
  const jumpToChapter = (index: number) => {
    if (index < 0 || index >= epubChapters.length) return
    setCurrentChapterIndex(index)

    if (readingMode === 'scroll') {
      const targetEl = document.getElementById(`chapter-section-${index}`)
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    } else {
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  // 调用 AI 智能分析与矫正当前书籍目录大纲
  const handleAICorrectTOC = async () => {
    if (epubChapters.length === 0) return
    setIsCorrectingTOC(true)
    setAiTOCErrorMsg(null)
    setAiTOCSuccessMsg(null)

    try {
      // 提取每个章节的开篇纯文本摘要（最多 120 字），为 AI 提供精准的章节真实线索
      const chaptersWithExcerpt = epubChapters.map((ch, idx) => {
        let excerpt = ''
        try {
          const doc = new DOMParser().parseFromString(ch.html, 'text/html')
          excerpt = doc.body.textContent?.replace(/\s+/g, ' ').trim() || ''
        } catch {
          excerpt = ch.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        }
        return {
          index: idx + 1,
          title: ch.title,
          excerpt: excerpt.slice(0, 120),
        }
      })

      const correctedList = await correctBookTOCWithAI({
        bookTitle: book.title,
        author: book.author,
        chapters: chaptersWithExcerpt,
      })

      if (correctedList && correctedList.length > 0) {
        // 1. 更新当前阅读器中的章节标题
        const updatedEpubChapters = epubChapters.map((ch, idx) => {
          const matched = correctedList.find((c) => c.index === idx + 1)
          return {
            ...ch,
            title: matched?.title || ch.title,
          }
        })
        setEpubChapters(updatedEpubChapters)

        // 2. 自动同步保存回书籍主数据与云端 (book.chapters)
        const updatedChaptersData: BookChapter[] = updatedEpubChapters.map((ch, idx) => {
          const existing = book.chapters?.[idx]
          const sp =
            existing?.start_page ||
            Math.max(1, Math.round(((idx + 1) / Math.max(1, epubChapters.length)) * book.total_pages))
          const ep = existing?.end_page || sp
          return {
            index: idx + 1,
            title: ch.title,
            start_page: sp,
            end_page: ep,
            page_count: Math.max(1, ep - sp + 1),
          }
        })

        const updatedBook: Book = {
          ...book,
          chapters: updatedChaptersData,
          updated_at: new Date().toISOString(),
        }
        onUpdateBook?.(updatedBook)

        setAiTOCSuccessMsg(`✨ AI 目录矫正成功！已规范整理全部 ${updatedEpubChapters.length} 个章节`)
        setTimeout(() => setAiTOCSuccessMsg(null), 5000)
      }
    } catch (err: any) {
      console.error('AI TOC Correction error:', err)
      setAiTOCErrorMsg(err?.message || 'AI 矫正目录失败，请检查网络或在个人设置中配置 API Key')
      setTimeout(() => setAiTOCErrorMsg(null), 6000)
    } finally {
      setIsCorrectingTOC(false)
    }
  }

  // 上一页 / 上一屏翻页
  const handlePrevPage = () => {
    const format = (book.file_format || '').toLowerCase()
    if (format === 'pdf' || book.file_name?.endsWith('.pdf')) {
      if (currentPage > 1) {
        const nextP = currentPage - 1
        setCurrentPage(nextP)
        renderPdfPage(nextP)
      }
    } else if (readingMode === 'scroll') {
      // 连续滑动模式下向上翻一整屏
      scrollContainerRef.current?.scrollBy({
        top: -window.innerHeight * 0.8,
        behavior: 'smooth',
      })
    } else {
      // 单节模式下上一节
      if (currentChapterIndex > 0) {
        jumpToChapter(currentChapterIndex - 1)
      }
    }
  }

  // 下一页 / 下一屏翻页
  const handleNextPage = () => {
    const format = (book.file_format || '').toLowerCase()
    if (format === 'pdf' || book.file_name?.endsWith('.pdf')) {
      if (currentPage < pdfTotalPages) {
        const nextP = currentPage + 1
        setCurrentPage(nextP)
        renderPdfPage(nextP)
      }
    } else if (readingMode === 'scroll') {
      // 连续滑动模式下向下翻一整屏
      scrollContainerRef.current?.scrollBy({
        top: window.innerHeight * 0.8,
        behavior: 'smooth',
      })
    } else {
      // 单节模式下下一节
      if (currentChapterIndex < epubChapters.length - 1) {
        jumpToChapter(currentChapterIndex + 1)
      }
    }
  }

  // 切换自动滚动主控制
  const toggleAutoScroll = () => {
    if (!isAutoScrolling) {
      // 若处于 EPUB/TXT 的单节翻页模式，自动无缝切换为连读滑动，防止被单节截断
      if (readingMode === 'page' && book.file_format !== 'pdf' && !book.file_name?.endsWith('.pdf')) {
        setReadingMode('scroll')
      }
      if (scrollContainerRef.current) {
        accumulatedScrollRef.current = scrollContainerRef.current.scrollTop
      }
      setIsAutoScrolling(true)
      setIsPausedByManualScroll(false)
      setPageTurnRemaining(autoPageTurnInterval)
    } else {
      setIsAutoScrolling(false)
      setIsPausedByManualScroll(false)
      if (manualScrollResumeTimerRef.current) {
        clearTimeout(manualScrollResumeTimerRef.current)
      }
    }
  }

  // 监听用户鼠标滚轮/手势滑动：临时挂起自动滚屏，防止与用户视线打架
  const handleWheelOrTouch = () => {
    if (!isAutoScrolling) return

    // 同步最新的真实 scrollTop 到浮点累加器，杜绝位置回跳
    if (scrollContainerRef.current) {
      accumulatedScrollRef.current = scrollContainerRef.current.scrollTop
    }

    // 暂停滚屏
    setIsPausedByManualScroll(true)

    if (manualScrollResumeTimerRef.current) {
      clearTimeout(manualScrollResumeTimerRef.current)
    }

    // 1.8 秒内无新滚动操作后平滑恢复自动滚屏
    manualScrollResumeTimerRef.current = setTimeout(() => {
      if (scrollContainerRef.current) {
        accumulatedScrollRef.current = scrollContainerRef.current.scrollTop
      }
      setIsPausedByManualScroll(false)
    }, 1800)
  }

  // 自动滚动引擎（支持平滑连续滚屏与 PDF/单节定时翻页双模式）
  useEffect(() => {
    if (!isAutoScrolling) {
      if (autoScrollRafRef.current) {
        cancelAnimationFrame(autoScrollRafRef.current)
        autoScrollRafRef.current = null
      }
      return
    }

    const isPageFlippingMode =
      book.file_format === 'pdf' || book.file_name?.endsWith('.pdf') || readingMode === 'page'

    // 模式 A：PDF 或单节翻页模式下的定时倒计时自动翻页
    if (isPageFlippingMode) {
      setPageTurnRemaining(autoPageTurnInterval)
      const countdownInterval = setInterval(() => {
        if (isPausedByManualScroll) return
        setPageTurnRemaining((prev) => {
          if (prev <= 1) {
            handleNextPage()
            return autoPageTurnInterval
          }
          return prev - 1
        })
      }, 1000)

      return () => clearInterval(countdownInterval)
    }

    // 模式 B：上下连续连读模式下的高帧率平滑滚屏（带高精度浮点累加）
    const container = scrollContainerRef.current
    if (container) {
      accumulatedScrollRef.current = container.scrollTop
    }

    let lastTimestamp = performance.now()

    const step = (now: number) => {
      const dt = (now - lastTimestamp) / 1000
      lastTimestamp = now

      // 当用户手动微调或浏览时挂起推进
      if (!isPausedByManualScroll) {
        const c = scrollContainerRef.current
        if (c) {
          // 速度基准：1.0x 对应每秒 30 像素
          const pixelsPerSecond = 30 * autoScrollSpeed
          accumulatedScrollRef.current += pixelsPerSecond * dt
          c.scrollTop = accumulatedScrollRef.current

          // 触底自动停止并解除状态
          if (c.scrollTop + c.clientHeight >= c.scrollHeight - 6) {
            setIsAutoScrolling(false)
            setIsPausedByManualScroll(false)
            return
          }
        }
      }

      autoScrollRafRef.current = requestAnimationFrame(step)
    }

    autoScrollRafRef.current = requestAnimationFrame(step)

    return () => {
      if (autoScrollRafRef.current) {
        cancelAnimationFrame(autoScrollRafRef.current)
        autoScrollRafRef.current = null
      }
    }
  }, [
    isAutoScrolling,
    autoScrollSpeed,
    readingMode,
    isPausedByManualScroll,
    autoPageTurnInterval,
    book.file_format,
    book.file_name,
  ])

  const updateAutoScrollSpeed = (speed: number) => {
    const clamped = Math.max(0.4, Math.min(6.0, Number(speed.toFixed(1))))
    setAutoScrollSpeed(clamped)
    localStorage.setItem('taskflow_reader_autoscroll_speed', String(clamped))
  }

  const toggleReadingGuideLine = () => {
    setShowReadingGuideLine((prev) => {
      const next = !prev
      localStorage.setItem('taskflow_reader_guideline', String(next))
      return next
    })
  }

  // 键盘快捷翻页与自动滚动调速监听
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === ' ') {
        e.preventDefault()
        toggleAutoScroll()
      } else if (e.key === '=' || e.key === '+' || e.key === ']') {
        e.preventDefault()
        updateAutoScrollSpeed(autoScrollSpeed + 0.2)
      } else if (e.key === '-' || e.key === '_' || e.key === '[') {
        e.preventDefault()
        updateAutoScrollSpeed(autoScrollSpeed - 0.2)
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        handlePrevPage()
      } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        handleNextPage()
      } else if (e.key === 'Escape') {
        handleExit()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    isOpen,
    readingMode,
    currentChapterIndex,
    currentPage,
    epubChapters.length,
    pdfTotalPages,
    isAutoScrolling,
    autoScrollSpeed,
  ])

  // 专注计时器
  useEffect(() => {
    if (!isOpen) return
    timerIntervalRef.current = setInterval(() => {
      setReadingSeconds((prev) => prev + 1)
    }, 1000)

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [isOpen])

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60)
    const secs = totalSec % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // 偏好设置持久化
  const updateTheme = (t: ReaderTheme) => {
    setTheme(t)
    localStorage.setItem('taskflow_reader_theme', t)
  }

  const updateFontSize = (delta: number) => {
    setFontSize((prev) => {
      const next = Math.max(12, Math.min(32, prev + delta))
      localStorage.setItem('taskflow_reader_fontsize', String(next))
      return next
    })
  }

  const updateLineHeight = (lh: number) => {
    setLineHeight(lh)
    localStorage.setItem('taskflow_reader_lineheight', String(lh))
  }

  // 本地补传电子书文件并同步至云端书库
  const handleUploadLocalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsLoading(true)
    setLoadError(null)
    setCloudSyncStatus('正在载入并解析本地文件...')
    try {
      // 1. 立即缓存至本地 IndexedDB，保证本设备立即秒开阅读
      await saveBookBinary(book.id, file, file.name)
      const buffer = await file.arrayBuffer()
      setFileBuffer(buffer)
      await parseBufferForReading(buffer)

      // 2. 检测文件格式并组装更新对象
      const ext = file.name.split('.').pop()?.toLowerCase() || book.file_format || 'epub'
      let updatedBookData: Book = {
        ...book,
        file_name: file.name,
        file_size: file.size,
        file_format: (ext as any) || book.file_format,
      }

      // 3. 异步/同步将原书上传至 Supabase Storage 云端书库
      setIsUploadingToCloud(true)
      setCloudSyncStatus('正在同步原书至云端书库...')
      uploadBookFileToStorage(file, file.name, book.id)
        .then((res) => {
          setIsUploadingToCloud(false)
          if (res.success && res.url) {
            updatedBookData = {
              ...updatedBookData,
              cloud_file_url: res.url,
              cloud_synced: true,
              updated_at: new Date().toISOString(),
            }
            onUpdateBook?.(updatedBookData)
            setCloudSyncStatus('✅ 已成功备份同步至云端书库！')
            setTimeout(() => setCloudSyncStatus(null), 4000)
          } else {
            onUpdateBook?.(updatedBookData)
            if (res.error) {
              setCloudSyncStatus(`⚠️ 本地已就绪 (云端提示: ${res.error})`)
              setTimeout(() => setCloudSyncStatus(null), 5000)
            }
          }
        })
        .catch(() => {
          setIsUploadingToCloud(false)
          onUpdateBook?.(updatedBookData)
          setCloudSyncStatus(null)
        })
    } catch (err: any) {
      setLoadError(err.message || '上传文件失败')
      setIsLoading(false)
      setIsUploadingToCloud(false)
      setCloudSyncStatus(null)
    }
  }

  // 退出阅读器时同步进度与专注时长
  const handleExit = () => {
    const elapsedMins = Math.max(1, Math.round(readingSeconds / 60))
    let calculatedPage = currentPage
    if ((book.file_format === 'epub' || book.file_name?.endsWith('.epub')) && epubChapters.length > 0) {
      calculatedPage = Math.round(
        ((currentChapterIndex + 1) / Math.max(1, epubChapters.length)) * book.total_pages
      )
    }

    if (onUpdateProgress) {
      onUpdateProgress(book.id, calculatedPage, elapsedMins)
    }
    onClose()
  }

  if (!isOpen) return null

  const currentTheme = THEME_STYLES[theme]
  const currentEpubChapter = epubChapters[currentChapterIndex]

  // 计算当前阅读进度百分比
  let displayPercentage = progressPercentage
  if (displayPercentage === 0) {
    if (book.file_format === 'pdf' || book.file_name?.endsWith('.pdf')) {
      displayPercentage = Math.round((currentPage / Math.max(1, pdfTotalPages)) * 100)
    } else if (epubChapters.length > 0) {
      displayPercentage = Math.round(((currentChapterIndex + 1) / epubChapters.length) * 100)
    }
  }

  // 章节目录过滤（关键词搜索与精简核心章节）
  const visibleChapters = epubChapters.filter((ch) => {
    if (tocSearchQuery) {
      return ch.title.toLowerCase().includes(tocSearchQuery.toLowerCase())
    }
    if (filterMeaningfulOnly) {
      // 过滤掉类似 "(续)" 或辅助切片，仅展示主体结构
      return !ch.title.includes('(续)')
    }
    return true
  })

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col ${currentTheme.bg} ${currentTheme.text} transition-colors duration-200 select-text overflow-hidden`}
      style={{
        fontFamily:
          fontFamily === 'serif'
            ? 'Georgia, Songti SC, SimSun, serif'
            : fontFamily === 'kaiti'
            ? 'KaiTi, STKaiti, serif'
            : 'system-ui, -apple-system, PingFang SC, sans-serif',
      }}
    >
      {/* 注入全局增强排版 CSS：防止 EPUB 内联样式截断正文或拉伸 SVG */}
      <style>{`
        .reader-html-content {
          overflow: visible !important;
          height: auto !important;
          max-height: none !important;
          word-break: break-word !important;
        }
        .reader-html-content * {
          max-height: none !important;
          box-sizing: border-box !important;
        }
        .reader-html-content p {
          margin-bottom: 1.35em !important;
          text-align: justify !important;
          text-justify: inter-ideograph !important;
          text-indent: 2em !important;
          line-height: inherit !important;
        }
        .reader-html-content h1, .reader-html-content h2, .reader-html-content h3 {
          margin-top: 1.8em !important;
          margin-bottom: 0.8em !important;
          font-weight: 700 !important;
          line-height: 1.4 !important;
        }
        .reader-html-content img, .reader-html-content svg {
          max-width: 100% !important;
          height: auto !important;
          max-height: 75vh !important;
          object-fit: contain !important;
          margin: 1.5rem auto !important;
          display: block !important;
          border-radius: 8px !important;
        }
        .reader-html-content svg image {
          width: 100% !important;
          height: auto !important;
        }
      `}</style>

      {/* 顶部悬浮控制栏 (微信读书风格，留出 macOS 红黄绿窗口操作区避让边距) */}
      <div
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          showControls ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
        } ${currentTheme.toolbarBg} border-b ${currentTheme.border} pl-20 sm:pl-24 pr-4 sm:pr-6 py-2.5 flex items-center justify-between shadow-xs select-none`}
      >
        <div className="flex items-center space-x-2.5 min-w-0">
          {/* 退出阅读按钮 (避让开 macOS 窗口三键，增加文字标识) */}
          <button
            type="button"
            onClick={handleExit}
            className="px-2.5 py-1 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 transition-colors flex items-center space-x-1 text-xs font-semibold shrink-0"
            title="退出阅读并同步进度 (Esc)"
          >
            <X className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">退出</span>
          </button>

          {/* 侧栏功能开关 (点击展开并默认打开目录) */}
          <button
            type="button"
            onClick={() => {
              if (isTocOpen && sidebarTab === 'toc') {
                setIsTocOpen(false)
              } else {
                setIsTocOpen(true)
                setSidebarTab('toc')
              }
            }}
            className={`px-2.5 py-1 rounded-xl transition-colors flex items-center space-x-1.5 text-xs font-semibold shrink-0 ${
              isTocOpen && sidebarTab === 'toc'
                ? 'bg-[#07C160]/15 text-[#07C160] border border-[#07C160]/30'
                : 'hover:bg-black/5 dark:hover:bg-white/10 border border-black/5 dark:border-white/10'
            }`}
            title="展开/收起左侧章节目录"
          >
            <PanelLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">目录大纲</span>
            <span className="text-[10px] px-1 rounded bg-black/5 dark:bg-white/10 font-mono">
              {epubChapters.length || book.chapters?.length || 0}
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold truncate max-w-xs sm:max-w-md">《{book.title}》</h3>
            <p className="text-[11px] opacity-60 truncate">
              {currentEpubChapter?.title || (book.author ? `${book.author} 著` : '沉浸专研')}
            </p>
          </div>
        </div>

        {/* 顶部中央：专注阅读计时器 & 云端同步状态 */}
        <div className="hidden md:flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-black/5 dark:bg-white/10 text-xs font-mono font-medium">
            <Clock className="w-3.5 h-3.5 text-[#07C160]" />
            <span>专注阅读 {formatTimer(readingSeconds)}</span>
          </div>

          {cloudSyncStatus ? (
            <div className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-medium border border-emerald-500/20 animate-in fade-in">
              {isUploadingToCloud && <Loader2 className="w-3 h-3 animate-spin" />}
              <span>{cloudSyncStatus}</span>
            </div>
          ) : book.cloud_file_url ? (
            <div className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-[#07C160]/10 text-[#07C160] text-xs font-medium border border-[#07C160]/20" title="电子书原文件已备份同步至云端存储桶">
              <Cloud className="w-3.5 h-3.5" />
              <span>原书已同步云端</span>
            </div>
          ) : book.cloud_synced ? (
            <div className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-medium border border-amber-500/20" title="已同步书籍目录与信息，电子书原文件尚未上传">
              <Cloud className="w-3.5 h-3.5" />
              <span>仅大纲已同步 (原书待传)</span>
            </div>
          ) : null}
        </div>

        {/* 顶部右侧快捷按钮 */}
        <div className="flex items-center space-x-1.5">
          {/* 自动滚动快捷启停 */}
          <button
            type="button"
            onClick={() => setIsAutoScrolling(!isAutoScrolling)}
            className={`px-2.5 py-1 rounded-xl border text-xs font-medium flex items-center space-x-1 transition-all ${
              isAutoScrolling
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold'
                : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10'
            }`}
            title="一键开始/暂停自动平滑滚屏 (空格键)"
          >
            {isAutoScrolling ? (
              <>
                <Pause className="w-3.5 h-3.5 text-amber-500 fill-current" />
                <span className="hidden sm:inline">滚屏中 {autoScrollSpeed.toFixed(1)}x</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-[#07C160]" />
                <span className="hidden sm:inline">自动滚动</span>
              </>
            )}
          </button>

          {/* 阅读模式切换：上下连读 vs 单节翻页 */}
          <button
            type="button"
            onClick={() => setReadingMode(readingMode === 'scroll' ? 'page' : 'scroll')}
            className="px-2.5 py-1 rounded-xl border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 text-xs font-medium flex items-center space-x-1 transition-colors"
            title="切换阅读排版方式（推荐上下连读，支持平滑滚动不漏字）"
          >
            {readingMode === 'scroll' ? (
              <>
                <ScrollText className="w-3.5 h-3.5 text-[#07C160]" />
                <span className="hidden sm:inline">上下滑动</span>
              </>
            ) : (
              <>
                <BookOpen className="w-3.5 h-3.5 text-[#07C160]" />
                <span className="hidden sm:inline">单节翻页</span>
              </>
            )}
          </button>

          {/* 排版与背景快捷入口：展开侧栏并进入排版 Tab */}
          <button
            type="button"
            onClick={() => {
              if (isTocOpen && sidebarTab === 'style') {
                setIsTocOpen(false)
              } else {
                setIsTocOpen(true)
                setSidebarTab('style')
              }
            }}
            className={`p-2 rounded-xl border transition-colors ${
              isTocOpen && sidebarTab === 'style'
                ? 'bg-[#07C160]/20 text-[#07C160] border-[#07C160]/30'
                : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10'
            }`}
            title="字体调整与护眼背景设置"
          >
            <Palette className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ========================================================
          主体阅读视口：左侧功能侧栏 (细分为目录、排版、滚屏) + 中央正文阅读区
          ======================================================== */}
      <div className="flex-1 flex overflow-hidden relative pt-12">
        {/* 左侧多功能侧栏 */}
        {isTocOpen && (
          <aside
            className={`w-72 sm:w-80 shrink-0 h-full border-r ${currentTheme.border} ${currentTheme.toolbarBg} flex flex-col z-30 select-none shadow-sm transition-all duration-200 animate-in slide-in-from-left duration-200`}
          >
            {/* 侧栏顶部分段 Tab 切换器 */}
            <div className="p-2 border-b border-black/5 dark:border-white/10 flex items-center justify-between gap-1.5 shrink-0">
              <div className="flex items-center space-x-1 bg-black/5 dark:bg-white/5 p-1 rounded-xl flex-1">
                <button
                  type="button"
                  onClick={() => setSidebarTab('toc')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1 transition-all ${
                    sidebarTab === 'toc'
                      ? 'bg-white dark:bg-slate-800 text-[#07C160] shadow-xs'
                      : 'opacity-60 hover:opacity-100'
                  }`}
                  title="全书目录大纲"
                >
                  <List className="w-3.5 h-3.5" />
                  <span>目录</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarTab('style')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1 transition-all ${
                    sidebarTab === 'style'
                      ? 'bg-white dark:bg-slate-800 text-[#07C160] shadow-xs'
                      : 'opacity-60 hover:opacity-100'
                  }`}
                  title="字体排版与护眼背景"
                >
                  <Palette className="w-3.5 h-3.5" />
                  <span>排版</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarTab('autoscroll')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1 transition-all ${
                    sidebarTab === 'autoscroll'
                      ? 'bg-white dark:bg-slate-800 text-[#07C160] shadow-xs'
                      : 'opacity-60 hover:opacity-100'
                  }`}
                  title="自动滚动滚屏设置"
                >
                  <Gauge className="w-3.5 h-3.5" />
                  <span>滚屏</span>
                  {isAutoScrolling && <span className="w-1.5 h-1.5 rounded-full bg-[#07C160] animate-pulse" />}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsTocOpen(false)}
                className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 opacity-60 hover:opacity-100 shrink-0"
                title="收起侧栏"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* TAB 1: 目录大纲 */}
            {sidebarTab === 'toc' && (
              <div className="flex-1 flex flex-col min-h-0">
                {/* 搜索与精简过滤栏 */}
                <div className="p-3 border-b border-black/5 dark:border-white/10 space-y-2 shrink-0">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                    <input
                      type="text"
                      placeholder="搜索章节名..."
                      value={tocSearchQuery}
                      onChange={(e) => setTocSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl bg-black/5 dark:bg-white/5 border border-transparent focus:border-[#07C160] outline-none"
                    />
                    {tocSearchQuery && (
                      <button
                        onClick={() => setTocSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs opacity-50 hover:opacity-100"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] opacity-60 px-1">
                    <span>
                      {tocSearchQuery
                        ? `搜索结果 (${visibleChapters.length} 节)`
                        : `共 ${epubChapters.length} 节`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFilterMeaningfulOnly(!filterMeaningfulOnly)}
                      className={`hover:opacity-100 flex items-center space-x-1 ${
                        filterMeaningfulOnly ? 'text-[#07C160] font-bold' : ''
                      }`}
                      title="隐藏中间切片辅助节点，仅保留主要章节"
                    >
                      <Filter className="w-3 h-3" />
                      <span>{filterMeaningfulOnly ? '精简主章' : '显示全部'}</span>
                    </button>
                  </div>

                  {/* AI 智能矫正目录按钮与反馈 */}
                  <div className="pt-0.5">
                    <button
                      type="button"
                      disabled={isCorrectingTOC || epubChapters.length === 0}
                      onClick={handleAICorrectTOC}
                      className="w-full py-1.5 px-2.5 rounded-xl bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-emerald-500/15 border border-[#07C160]/30 hover:border-[#07C160]/60 text-[#07C160] text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all shadow-xs disabled:opacity-50"
                      title="调用 AI 深度分析全书开篇正文，自动修复并规范所有章节标题"
                    >
                      {isCorrectingTOC ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>AI 正在审校矫正目录...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-[#07C160]" />
                          <span>AI 智能矫正规范目录</span>
                        </>
                      )}
                    </button>

                    {aiTOCSuccessMsg && (
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium text-center animate-in fade-in">
                        {aiTOCSuccessMsg}
                      </p>
                    )}
                    {aiTOCErrorMsg && (
                      <p className="text-[10px] text-red-500 mt-1 leading-snug text-center animate-in fade-in">
                        {aiTOCErrorMsg}
                      </p>
                    )}
                  </div>
                </div>

                {/* 章节列表 */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs select-text">
                  {visibleChapters.length === 0 ? (
                    <div className="p-6 text-center text-xs opacity-50">
                      {epubChapters.length === 0 ? '正在提取目录结构...' : '未找到匹配章节'}
                    </div>
                  ) : (
                    visibleChapters.map((ch) => {
                      const originalIdx = epubChapters.findIndex((c) => c.id === ch.id)
                      const isActive = currentChapterIndex === originalIdx
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => jumpToChapter(originalIdx)}
                          className={`w-full text-left px-3 py-2 rounded-xl transition-all flex items-center justify-between group ${
                            isActive
                              ? 'bg-[#07C160]/15 text-[#07C160] font-bold shadow-xs border border-[#07C160]/25'
                              : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-80 hover:opacity-100'
                          }`}
                        >
                          <span className="truncate flex-1 mr-2 leading-snug">{ch.title}</span>
                          <span className="text-[10px] opacity-40 font-mono shrink-0">#{originalIdx + 1}</span>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: 排版与背景 */}
            {sidebarTab === 'style' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs select-none">
                {/* 护眼主题配色 (6款方案) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold opacity-80">护眼背景配色</span>
                    <span className="text-[11px] opacity-50 font-mono">{THEME_STYLES[theme].name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(THEME_STYLES) as ReaderTheme[]).map((tKey) => {
                      const s = THEME_STYLES[tKey]
                      const isSelected = theme === tKey
                      return (
                        <button
                          key={tKey}
                          type="button"
                          onClick={() => updateTheme(tKey)}
                          className={`p-2 rounded-xl border flex flex-col items-center justify-center space-y-1.5 transition-all ${
                            isSelected
                              ? 'ring-2 ring-[#07C160] border-transparent font-bold shadow-sm'
                              : 'border-black/10 dark:border-white/10 opacity-70 hover:opacity-100 hover:scale-102'
                          } ${s.bg} ${s.text}`}
                        >
                          <span
                            className="w-4 h-4 rounded-full border border-black/10 dark:border-white/20 shadow-xs"
                            style={{ backgroundColor: s.swatch }}
                          />
                          <span className="text-[11px]">{s.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 正文字体选择 */}
                <div className="space-y-2">
                  <span className="font-semibold opacity-80">阅读字体</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFontFamily('sans')}
                      className={`py-2 rounded-xl border text-xs font-sans transition-all ${
                        fontFamily === 'sans'
                          ? 'border-[#07C160] bg-[#07C160]/10 text-[#07C160] font-bold'
                          : 'border-black/10 dark:border-white/10 opacity-70 hover:opacity-100'
                      }`}
                    >
                      系统黑体
                    </button>
                    <button
                      type="button"
                      onClick={() => setFontFamily('serif')}
                      className={`py-2 rounded-xl border text-xs font-serif transition-all ${
                        fontFamily === 'serif'
                          ? 'border-[#07C160] bg-[#07C160]/10 text-[#07C160] font-bold'
                          : 'border-black/10 dark:border-white/10 opacity-70 hover:opacity-100'
                      }`}
                    >
                      典雅宋体
                    </button>
                    <button
                      type="button"
                      onClick={() => setFontFamily('kaiti')}
                      className={`py-2 rounded-xl border text-xs transition-all ${
                        fontFamily === 'kaiti'
                          ? 'border-[#07C160] bg-[#07C160]/10 text-[#07C160] font-bold'
                          : 'border-black/10 dark:border-white/10 opacity-70 hover:opacity-100'
                      }`}
                      style={{ fontFamily: 'KaiTi, STKaiti, serif' }}
                    >
                      沉浸楷体
                    </button>
                  </div>
                </div>

                {/* 字号大小 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold opacity-80">字号大小</span>
                    <span className="font-mono font-bold text-[#07C160]">{fontSize}px</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => updateFontSize(-1)}
                      className="px-3 py-1.5 rounded-xl border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 font-bold transition-colors"
                      title="缩小字号"
                    >
                      A-
                    </button>
                    <input
                      type="range"
                      min={13}
                      max={30}
                      step={1}
                      value={fontSize}
                      onChange={(e) => {
                        const val = Number(e.target.value)
                        setFontSize(val)
                        localStorage.setItem('taskflow_reader_fontsize', String(val))
                      }}
                      className="flex-1 accent-[#07C160] cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => updateFontSize(1)}
                      className="px-3 py-1.5 rounded-xl border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 font-bold transition-colors"
                      title="放大字号"
                    >
                      A+
                    </button>
                  </div>
                </div>

                {/* 行高间距 */}
                <div className="space-y-2">
                  <span className="font-semibold opacity-80">行高间距</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { val: 1.6, label: '紧凑 1.6' },
                      { val: 1.85, label: '适中 1.85' },
                      { val: 2.2, label: '宽松 2.2' },
                    ].map((item) => (
                      <button
                        key={item.val}
                        type="button"
                        onClick={() => updateLineHeight(item.val)}
                        className={`py-1.5 rounded-xl border transition-all ${
                          lineHeight === item.val
                            ? 'border-[#07C160] bg-[#07C160]/10 text-[#07C160] font-bold'
                            : 'border-black/10 dark:border-white/10 opacity-70 hover:opacity-100'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 版心宽度 */}
                <div className="space-y-2">
                  <span className="font-semibold opacity-80">版心宽度</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { w: 680, label: '适中 (680)' },
                      { w: 820, label: '标准 (820)' },
                      { w: 1020, label: '宽屏 (1020)' },
                    ].map((item) => (
                      <button
                        key={item.w}
                        type="button"
                        onClick={() => {
                          setMaxWidth(item.w)
                          localStorage.setItem('taskflow_reader_maxwidth', String(item.w))
                        }}
                        className={`py-1.5 rounded-xl border transition-all ${
                          maxWidth === item.w
                            ? 'border-[#07C160] bg-[#07C160]/10 text-[#07C160] font-bold'
                            : 'border-black/10 dark:border-white/10 opacity-70 hover:opacity-100'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: 自动滚动 */}
            {sidebarTab === 'autoscroll' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs select-none">
                {/* 核心主控大按钮 */}
                <button
                  type="button"
                  onClick={toggleAutoScroll}
                  className={`w-full py-3.5 px-4 rounded-2xl font-bold flex items-center justify-center space-x-2 shadow-md transition-all ${
                    isAutoScrolling
                      ? isPausedByManualScroll
                        ? 'bg-amber-400 hover:bg-amber-500 text-slate-950 shadow-amber-400/20 ring-2 ring-amber-300 animate-pulse'
                        : 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-amber-500/25 ring-2 ring-amber-400'
                      : 'bg-[#07C160] hover:bg-[#06AD56] text-white shadow-[#07C160]/25'
                  }`}
                >
                  {isAutoScrolling ? (
                    isPausedByManualScroll ? (
                      <>
                        <Play className="w-4 h-4 fill-current text-slate-950" />
                        <span>手动浏览挂起中 (点击立即恢复)</span>
                      </>
                    ) : (
                      <>
                        <Pause className="w-4 h-4 fill-current" />
                        <span>
                          {book.file_format === 'pdf' || book.file_name?.endsWith('.pdf') || readingMode === 'page'
                            ? `暂停自动翻页 (剩 ${pageTurnRemaining}s)`
                            : '暂停自动滚动 (运行中)'}
                        </span>
                      </>
                    )
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>
                        {book.file_format === 'pdf' || book.file_name?.endsWith('.pdf') || readingMode === 'page'
                          ? '开始定时自动翻页'
                          : '开始自动平滑滚动'}
                      </span>
                    </>
                  )}
                </button>

                {/* 区分阅读模式下的专用控制 */}
                {book.file_format === 'pdf' || book.file_name?.endsWith('.pdf') || readingMode === 'page' ? (
                  /* PDF 或单节翻页模式：定时翻页设置 */
                  <div className="space-y-3 p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold opacity-80">单页阅读间隔</span>
                      <span className="font-mono text-[#07C160] font-bold">{autoPageTurnInterval} 秒/页</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {[10, 15, 20, 30, 45].map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => {
                            setAutoPageTurnInterval(sec)
                            setPageTurnRemaining(sec)
                          }}
                          className={`py-1.5 rounded-xl border text-xs font-mono transition-all ${
                            autoPageTurnInterval === sec
                              ? 'border-[#07C160] bg-[#07C160]/15 text-[#07C160] font-bold shadow-xs'
                              : 'border-black/10 dark:border-white/10 opacity-70 hover:opacity-100'
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                    {isAutoScrolling && (
                      <div className="pt-1 flex items-center justify-between text-[11px]">
                        <span className="opacity-70">
                          ⏳ 下一页倒计时：<b className="font-mono text-[#07C160]">{pageTurnRemaining}</b> 秒
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            handleNextPage()
                            setPageTurnRemaining(autoPageTurnInterval)
                          }}
                          className="px-2 py-0.5 rounded-lg bg-[#07C160]/10 text-[#07C160] font-semibold hover:bg-[#07C160]/20"
                        >
                          立即跳页 ⏩
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* 连续滑动模式：平滑速度调节 */
                  <>
                    {/* 速度倍率预设档位 */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold opacity-80">速度倍率预设</span>
                        <span className="font-mono text-[#07C160] font-bold">{autoScrollSpeed.toFixed(1)}x</span>
                      </div>
                      <div className="grid grid-cols-5 gap-1">
                        {[
                          { speed: 0.8, label: '0.8x', tip: '慢读' },
                          { speed: 1.2, label: '1.2x', tip: '匀速' },
                          { speed: 1.8, label: '1.8x', tip: '舒适' },
                          { speed: 2.5, label: '2.5x', tip: '速读' },
                          { speed: 3.5, label: '3.5x', tip: '极速' },
                        ].map((item) => {
                          const isSelected = Math.abs(autoScrollSpeed - item.speed) < 0.15
                          return (
                            <button
                              key={item.speed}
                              type="button"
                              onClick={() => updateAutoScrollSpeed(item.speed)}
                              className={`py-2 rounded-xl border flex flex-col items-center justify-center transition-all ${
                                isSelected
                                  ? 'border-[#07C160] bg-[#07C160]/15 text-[#07C160] font-bold shadow-xs'
                                  : 'border-black/10 dark:border-white/10 opacity-70 hover:opacity-100'
                              }`}
                            >
                              <span className="font-mono text-xs">{item.label}</span>
                              <span className="text-[9px] opacity-60">{item.tip}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* 速度精细微调滑块 */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] opacity-70">
                        <span>精细平滑调速</span>
                        <span className="font-mono font-medium">
                          约 {Math.round(30 * autoScrollSpeed)} 像素/秒
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => updateAutoScrollSpeed(autoScrollSpeed - 0.2)}
                          className="px-2.5 py-1 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 font-mono"
                          title="减速 (-)"
                        >
                          -
                        </button>
                        <input
                          type="range"
                          min={0.4}
                          max={5.0}
                          step={0.1}
                          value={autoScrollSpeed}
                          onChange={(e) => updateAutoScrollSpeed(Number(e.target.value))}
                          className="flex-1 accent-[#07C160] cursor-pointer"
                        />
                        <button
                          type="button"
                          onClick={() => updateAutoScrollSpeed(autoScrollSpeed + 0.2)}
                          className="px-2.5 py-1 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 font-mono"
                          title="加速 (+)"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* 辅助功能选项：视线聚焦点引导线 */}
                <div className="space-y-2 pt-1 border-t border-black/5 dark:border-white/10">
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <span className="font-semibold opacity-85 block">视线聚焦引导线</span>
                      <span className="text-[10px] opacity-50">在阅读黄金视线区域显示柔光辅助线</span>
                    </div>
                    <button
                      type="button"
                      onClick={toggleReadingGuideLine}
                      className={`w-10 h-6 rounded-full transition-colors relative ${
                        showReadingGuideLine ? 'bg-[#07C160]' : 'bg-black/15 dark:bg-white/15'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                          showReadingGuideLine ? 'left-5' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* 智能提示与操作卡片 */}
                <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 space-y-2 leading-relaxed opacity-85">
                  <div className="flex items-center space-x-1.5 font-semibold text-[#07C160]">
                    <Zap className="w-3.5 h-3.5" />
                    <span>自动滚动操控逻辑</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-[11px] opacity-80">
                    <li>
                      按 <b>空格键 (Space)</b> 或 <b>点击正文空白</b> 即可随时暂停/继续。
                    </li>
                    <li>
                      按 <b>[ 或 -</b> 减速，按 <b>] 或 +</b> 加速。
                    </li>
                    <li>
                      随时滚动滑轮可自由翻看，系统自动挂起并在停顿 1.8 秒后平滑恢复。
                    </li>
                    <li>
                      阅读至全书最底端时，系统将安全自动停稳。
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </aside>
        )}

        {/* 中央主阅读区 (支持无限平滑滚动与自然上下滑动) */}
        <div
          ref={scrollContainerRef}
          onScroll={handleContainerScroll}
          onWheel={handleWheelOrTouch}
          onTouchMove={handleWheelOrTouch}
          onClick={(e) => {
            if (isSettingsOpen) setIsSettingsOpen(false)
            // 点击正文空白处快捷切换暂停与恢复
            const target = e.target as HTMLElement
            if (!target.closest('button, a, input, [role="button"]') && isAutoScrolling) {
              if (isPausedByManualScroll) {
                setIsPausedByManualScroll(false)
              } else {
                setIsAutoScrolling(false)
              }
            }
          }}
          className="flex-1 h-full overflow-y-auto px-4 md:px-12 py-8 flex flex-col items-center select-text cursor-default relative"
        >
          {/* 视线聚焦点辅助引导线 */}
          {showReadingGuideLine && isAutoScrolling && !isPausedByManualScroll && (
            <div
              className="fixed left-0 right-0 pointer-events-none z-20 flex items-center justify-center transition-opacity duration-300"
              style={{ top: '38%' }}
            >
              <div className="w-full max-w-4xl mx-auto flex items-center px-6">
                <div className="h-[1.5px] flex-1 bg-gradient-to-r from-transparent via-[#07C160]/40 to-transparent" />
                <span className="px-2.5 py-0.5 text-[10px] font-mono text-[#07C160] bg-black/10 dark:bg-white/10 rounded-full select-none backdrop-blur-xs border border-[#07C160]/20 shadow-xs">
                  视线聚焦点
                </span>
                <div className="h-[1.5px] flex-1 bg-gradient-to-r from-transparent via-[#07C160]/40 to-transparent" />
              </div>
            </div>
          )}
          <div
            className="w-full transition-all duration-150 pb-32"
            style={{
              maxWidth: `${maxWidth}px`,
              fontSize: `${fontSize}px`,
              lineHeight: `${lineHeight}`,
            }}
          >
            {/* 加载中状态 */}
            {isLoading && (
              <div className="py-32 flex flex-col items-center justify-center space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-[#07C160]" />
                <p className="text-xs font-mono opacity-60">正在载入《{book.title}》全文排版...</p>
              </div>
            )}

            {/* 异常错误或无本地文件状态 */}
            {!isLoading && !fileBuffer && (
              <div className="py-24 text-center space-y-4 max-w-md mx-auto p-6 rounded-2xl border border-dashed border-black/10 dark:border-white/10">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-[#07C160]/10 text-[#07C160] flex items-center justify-center">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">本地暂未缓存本书原始文件</h4>
                  <p className="text-xs opacity-60 mt-1 leading-relaxed">
                    请选择本地 EPUB、PDF 或 TXT 电子书。选择后系统将<b>自动保存至离线存储</b>并<b>同步至云端书库</b>，后续打开免下载秒开。
                  </p>
                </div>

                {isUploadingToCloud ? (
                  <div className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-[#07C160]/10 text-[#07C160] text-xs font-semibold">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>正在解析并同步原书至云端书库...</span>
                  </div>
                ) : (
                  <label className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-[#07C160] hover:bg-[#06AD56] text-white text-xs font-semibold cursor-pointer shadow-md shadow-[#07C160]/20 transition-all">
                    <Upload className="w-4 h-4" />
                    <span>选择本地电子书文件（自动同步云端）</span>
                    <input
                      type="file"
                      accept=".epub,.pdf,.txt,.md"
                      onChange={handleUploadLocalFile}
                      className="hidden"
                    />
                  </label>
                )}

                {cloudSyncStatus && (
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mt-2">
                    {cloudSyncStatus}
                  </p>
                )}
              </div>
            )}

            {/* 1. EPUB 内容渲染 */}
            {!isLoading && epubChapters.length > 0 && (
              <>
                {readingMode === 'scroll' ? (
                  /* 上下无缝连续滑动阅读流：全书所有章节自然衔接，上下无限畅读 */
                  <div className="space-y-16">
                    {epubChapters.map((ch, idx) => (
                      <article
                        key={ch.id}
                        id={`chapter-section-${idx}`}
                        className="chapter-section pt-8 border-b border-black/5 dark:border-white/5 pb-12"
                      >
                        {/* 章节顶部分隔符与标题 */}
                        <div className="py-4 mb-6 border-b border-black/5 dark:border-white/5 text-center">
                          <span className="text-[11px] font-mono opacity-50 uppercase tracking-widest">
                            Chapter {idx + 1} / {epubChapters.length}
                          </span>
                          <h2 className="text-xl font-bold mt-1 text-slate-900 dark:text-white">
                            {ch.title}
                          </h2>
                        </div>

                        {/* 章节正文 */}
                        <div
                          className="reader-html-content leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: ch.html }}
                        />
                      </article>
                    ))}
                  </div>
                ) : (
                  /* 单节翻页模式 */
                  currentEpubChapter && (
                    <article className="space-y-4 animate-in fade-in duration-200">
                      <div className="py-3 mb-4 border-b border-black/5 dark:border-white/5 text-center">
                        <span className="text-[11px] font-mono opacity-50 uppercase tracking-widest">
                          Chapter {currentChapterIndex + 1} / {epubChapters.length}
                        </span>
                        <h2 className="text-xl font-bold mt-1">{currentEpubChapter.title}</h2>
                      </div>
                      <div
                        className="reader-html-content leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: currentEpubChapter.html }}
                      />
                    </article>
                  )
                )}
              </>
            )}

            {/* 2. PDF 页面 Canvas 渲染 */}
            {!isLoading && (book.file_format === 'pdf' || book.file_name?.endsWith('.pdf')) && fileBuffer && (
              <div className="flex flex-col items-center space-y-4 animate-in fade-in duration-200">
                <div className="shadow-2xl rounded-lg overflow-hidden border border-black/10">
                  <canvas ref={pdfCanvasRef} className="block max-w-full h-auto" />
                </div>
              </div>
            )}

            {/* 3. TXT 纯文本段落渲染 */}
            {!isLoading && textContent.length > 0 && (
              <article className="space-y-4 animate-in fade-in duration-200">
                {textContent.map((p, idx) => (
                  <p key={idx} className="indent-8 leading-relaxed">
                    {p}
                  </p>
                ))}
              </article>
            )}
          </div>
        </div>
      </div>

      {/* 底部悬浮翻页与导航进度栏 */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ${
          showControls ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
        } ${currentTheme.toolbarBg} border-t ${currentTheme.border} px-4 sm:px-8 py-2.5 flex items-center justify-between select-none shadow-lg`}
      >
        {/* 上一节 / 上一屏 */}
        <div className="flex items-center space-x-1.5">
          {epubChapters.length > 0 && (
            <button
              type="button"
              onClick={() => jumpToChapter(currentChapterIndex - 1)}
              disabled={currentChapterIndex <= 0}
              className="p-1.5 rounded-xl border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 text-xs font-semibold disabled:opacity-30 disabled:pointer-events-none transition-all"
              title="跳转至上一章开头"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={handlePrevPage}
            className="px-3 py-1.5 rounded-xl border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 text-xs font-semibold flex items-center space-x-1 transition-all"
            title="向上翻页或滑动一屏 (PageUp)"
          >
            <ChevronUp className="w-4 h-4" />
            <span>上一页</span>
          </button>
        </div>

        {/* 中央翻页进度条与章节名 */}
        <div className="flex items-center space-x-3 text-xs font-mono">
          <span className="opacity-70 font-semibold max-w-[160px] sm:max-w-xs truncate">
            {epubChapters.length > 0
              ? currentEpubChapter?.title || `第 ${currentChapterIndex + 1} 节`
              : `第 ${currentPage} / ${pdfTotalPages} 页`}
          </span>

          <span className="px-2 py-0.5 rounded-full bg-[#07C160]/15 text-[#07C160] font-bold">
            {displayPercentage}%
          </span>
        </div>

        {/* 下一节 / 下一屏 */}
        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={handleNextPage}
            className="px-3 py-1.5 rounded-xl bg-[#07C160] hover:bg-[#06AD56] active:bg-[#059B4D] text-white text-xs font-semibold flex items-center space-x-1 shadow-sm transition-all"
            title="向下翻页或滑动一屏 (PageDown / 空格键)"
          >
            <span>下一页</span>
            <ChevronDown className="w-4 h-4" />
          </button>

          {epubChapters.length > 0 && (
            <button
              type="button"
              onClick={() => jumpToChapter(currentChapterIndex + 1)}
              disabled={currentChapterIndex >= epubChapters.length - 1}
              className="p-1.5 rounded-xl border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 text-xs font-semibold disabled:opacity-30 disabled:pointer-events-none transition-all"
              title="跳转至下一章开头"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 悬浮自动滚动控制胶囊 (即便侧栏收起也能随时调速/暂停) */}
      {isAutoScrolling && (
        <div className="fixed bottom-14 right-6 z-50 flex items-center space-x-2 px-3.5 py-2 rounded-full bg-slate-900/90 text-white shadow-2xl backdrop-blur-md border border-white/20 animate-in fade-in slide-in-from-bottom-3 duration-200 select-none">
          {isPausedByManualScroll ? (
            <>
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-xs font-semibold text-amber-300">手动微调挂起中</span>
              <button
                type="button"
                onClick={() => setIsPausedByManualScroll(false)}
                className="px-2 py-0.5 rounded-full bg-[#07C160] hover:bg-[#06AD56] text-[11px] font-bold text-white transition-colors shadow-xs"
                title="立即恢复自动滚屏"
              >
                恢复
              </button>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-[#07C160] animate-ping" />
              <span className="text-xs font-semibold">
                {book.file_format === 'pdf' || book.file_name?.endsWith('.pdf') || readingMode === 'page'
                  ? `自动翻页 (${pageTurnRemaining}s)`
                  : '自动滚动中'}
              </span>
              {!(book.file_format === 'pdf' || book.file_name?.endsWith('.pdf') || readingMode === 'page') && (
                <span className="text-xs font-mono text-[#07C160] font-bold">
                  {autoScrollSpeed.toFixed(1)}x
                </span>
              )}
              {!(book.file_format === 'pdf' || book.file_name?.endsWith('.pdf') || readingMode === 'page') && (
                <button
                  type="button"
                  onClick={() => updateAutoScrollSpeed(autoScrollSpeed - 0.2)}
                  className="w-5 h-5 rounded-full hover:bg-white/20 flex items-center justify-center text-xs font-mono transition-colors"
                  title="减速 (-)"
                >
                  -
                </button>
              )}
              <button
                type="button"
                onClick={toggleAutoScroll}
                className="px-2.5 py-0.5 rounded-full bg-amber-500 hover:bg-amber-600 text-[11px] font-bold text-slate-950 transition-colors"
                title="暂停滚屏 (快捷键: 空格键)"
              >
                暂停
              </button>
              {!(book.file_format === 'pdf' || book.file_name?.endsWith('.pdf') || readingMode === 'page') ? (
                <button
                  type="button"
                  onClick={() => updateAutoScrollSpeed(autoScrollSpeed + 0.2)}
                  className="w-5 h-5 rounded-full hover:bg-white/20 flex items-center justify-center text-xs font-mono transition-colors"
                  title="加速 (+)"
                >
                  +
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    handleNextPage()
                    setPageTurnRemaining(autoPageTurnInterval)
                  }}
                  className="px-2 py-0.5 rounded-full bg-[#07C160] hover:bg-[#06AD56] text-[10px] font-bold text-white transition-colors"
                  title="立即翻下一页"
                >
                  下一页 ⏩
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setIsAutoScrolling(false)
              setIsPausedByManualScroll(false)
            }}
            className="w-4 h-4 text-white/50 hover:text-white flex items-center justify-center ml-1 text-xs"
            title="关闭自动滚屏"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
