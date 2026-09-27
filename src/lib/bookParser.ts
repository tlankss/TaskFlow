// Polyfills for Chromium / Electron environment
if (typeof Uint8Array !== 'undefined') {
  if (!(Uint8Array.prototype as any).toHex) {
    ;(Uint8Array.prototype as any).toHex = function () {
      let hex = ''
      for (let i = 0; i < this.length; i++) {
        hex += this[i].toString(16).padStart(2, '0')
      }
      return hex
    }
  }
  if (!(Uint8Array as any).fromHex) {
    ;(Uint8Array as any).fromHex = function (hexString: string) {
      const cleanHex = (hexString || '').replace(/\s+/g, '')
      const bytes = new Uint8Array(Math.floor(cleanHex.length / 2))
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16)
      }
      return bytes
    }
  }
}

if (typeof Promise !== 'undefined' && !(Promise as any).try) {
  ;(Promise as any).try = function (fn: any, ...args: any[]) {
    return new Promise((resolve) => resolve(fn(...args)))
  }
}

import * as pdfjsLib from 'pdfjs-dist'
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url'
import JSZip from 'jszip'
import { BookChapter } from '../types'

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker
}

export const MAX_BOOK_FILE_SIZE = 500 * 1024 * 1024 // 500MB

export type SupportedBookFormat = 'epub' | 'pdf' | 'txt' | 'md' | 'mobi' | 'azw3' | 'other'

export interface ParsedBookResult {
  title: string
  author?: string
  totalPages: number
  chapters: BookChapter[]
  format: SupportedBookFormat
  fileName: string
  fileSize: number
  coverUrl?: string
  rawTextPreview?: string
  tocRawText?: string
}

/**
 * 格式化文件大小为可读字符串
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * 清理文件名得到推荐的书名
 */
export function cleanBookTitleFromFilename(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, '') // 移除扩展名
    .replace(/^[【\[\(][^】\]\)]+[】\]\)]/, '') // 移除前缀标签如【精校版】
    .replace(/[【\[\(](z-lib|epub|pdf|txt|mobi|azw3|精校|完本|全集|校对).*?[】\]\)]/gi, '')
    .trim() || '未命名书籍'
}

/**
 * 解析 EPUB 电子书
 */
async function parseEpub(arrayBuffer: ArrayBuffer, fileName: string): Promise<ParsedBookResult> {
  const zip = await JSZip.loadAsync(arrayBuffer)
  
  // 1. 读取 META-INF/container.xml 找到 OPF 路径
  const containerXml = await zip.file('META-INF/container.xml')?.async('text')
  let opfPath = 'content.opf'
  if (containerXml) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(containerXml, 'application/xml')
    const rootfile = doc.querySelector('rootfile')
    if (rootfile && rootfile.getAttribute('full-path')) {
      opfPath = rootfile.getAttribute('full-path')!
    }
  }

  // 2. 读取并解析 OPF
  const opfContent = await zip.file(opfPath)?.async('text')
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : ''
  
  let title = cleanBookTitleFromFilename(fileName)
  let author: string | undefined
  let coverUrl: string | undefined
  const chapters: BookChapter[] = []
  let totalChars = 0
  let totalPages = 100

  if (opfContent) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(opfContent, 'application/xml')

    // 元数据
    const titleEl = doc.querySelector('dc\\:title, title')
    if (titleEl && titleEl.textContent?.trim()) {
      title = titleEl.textContent.trim()
    }

    const creatorEl = doc.querySelector('dc\\:creator, creator')
    if (creatorEl && creatorEl.textContent?.trim()) {
      author = creatorEl.textContent.trim()
    }

    // 寻找封面图片
    let coverHref: string | null = null
    const metaCover = doc.querySelector('meta[name="cover"]')
    if (metaCover) {
      const coverId = metaCover.getAttribute('content')
      if (coverId) {
        const item = doc.querySelector(`item[id="${coverId}"]`)
        if (item) coverHref = item.getAttribute('href')
      }
    }

    if (!coverHref) {
      // 遍历查找 properties="cover-image" 或 href 包含 cover 的图片
      const items = Array.from(doc.querySelectorAll('item'))
      for (const item of items) {
        const props = item.getAttribute('properties') || ''
        const href = item.getAttribute('href') || ''
        const mediaType = item.getAttribute('media-type') || ''
        if (props.includes('cover-image') || (href.toLowerCase().includes('cover') && mediaType.startsWith('image/'))) {
          coverHref = href
          break
        }
      }
    }

    if (coverHref) {
      const fullCoverPath = opfDir + coverHref
      const coverFile = zip.file(fullCoverPath) || zip.file(coverHref)
      if (coverFile) {
        const base64 = await coverFile.async('base64')
        const mime = coverHref.endsWith('.png') ? 'image/png' : coverHref.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
        coverUrl = `data:${mime};base64,${base64}`
      }
    }

    // 3. 寻找 TOC 目录文件 (ncx 或 nav.xhtml)
    let ncxHref: string | null = null
    let navHref: string | null = null

    const items = Array.from(doc.querySelectorAll('item'))
    for (const item of items) {
      const mediaType = item.getAttribute('media-type') || ''
      const props = item.getAttribute('properties') || ''
      const id = item.getAttribute('id') || ''
      const href = item.getAttribute('href') || ''

      if (mediaType === 'application/x-dtbncx+xml' || id.toLowerCase().includes('ncx') || href.endsWith('.ncx')) {
        ncxHref = href
      }
      if (props.includes('nav') || id.toLowerCase().includes('nav') || href.includes('nav.xhtml') || href.includes('toc.xhtml')) {
        navHref = href
      }
    }

    // 估算总字数与内容量，记录每个 spine 项的字符数以支持跨文件章节的精确统计
    const spineList: { cleanHref: string; chars: number }[] = []
    const spineItemrefs = Array.from(doc.querySelectorAll('spine > itemref'))
    for (const itemref of spineItemrefs) {
      const idref = itemref.getAttribute('idref')
      if (!idref) continue
      const item = doc.querySelector(`item[id="${idref}"]`)
      const href = item?.getAttribute('href')
      if (href) {
        const cleanHref = href.split('#')[0]
        const contentFile =
          zip.file(opfDir + cleanHref) ||
          zip.file(cleanHref) ||
          zip.file(decodeURIComponent(opfDir + cleanHref))
        let itemChars = 0
        if (contentFile) {
          try {
            const text = await contentFile.async('text')
            const cleanText = text.replace(/<[^>]+>/g, '').trim()
            itemChars = cleanText.length
            totalChars += itemChars
          } catch {
            // ignore
          }
        }
        spineList.push({ cleanHref, chars: itemChars })
      }
    }

    // 优先从 NCX 解析目录条目及对应的目标文件
    const rawChapterEntries: { title: string; src: string }[] = []

    if (ncxHref) {
      const ncxFile = zip.file(opfDir + ncxHref) || zip.file(ncxHref)
      if (ncxFile) {
        const ncxContent = await ncxFile.async('text')
        const ncxDoc = parser.parseFromString(ncxContent, 'application/xml')
        const navPoints = Array.from(ncxDoc.querySelectorAll('navMap > navPoint'))

        navPoints.forEach((np) => {
          const textEl = np.querySelector('navLabel > text')
          const contentEl = np.querySelector('content')
          const chapterTitle = textEl?.textContent?.trim()
          const src = contentEl?.getAttribute('src') || ''
          if (chapterTitle) {
            rawChapterEntries.push({ title: chapterTitle, src })
          }
        })
      }
    }

    // 如果 NCX 没提取到，尝试从 Nav XHTML 解析
    if (rawChapterEntries.length === 0 && navHref) {
      const navFile = zip.file(opfDir + navHref) || zip.file(navHref)
      if (navFile) {
        const navContent = await navFile.async('text')
        const navDoc = parser.parseFromString(navContent, 'text/html')
        const links = Array.from(navDoc.querySelectorAll('nav[epub\\:type="toc"] a, nav#toc a, ol a, ul a'))
        links.forEach((a) => {
          const text = a.textContent?.trim()
          const href = a.getAttribute('href') || ''
          if (text && text.length > 1 && !rawChapterEntries.some((c) => c.title === text)) {
            rawChapterEntries.push({ title: text, src: href })
          }
        })
      }
    }

    // 读取各章节对应的真实文字量，支持跨 Spine 文件合并（防止大章节仅指向标题页导致页数过少）
    let tocRawText = ''
    const chapterCharCounts: number[] = []

    // 映射每个 rawChapterEntry 在 spine 中的起始下标
    const entrySpineIndices: number[] = rawChapterEntries.map((entry) => {
      const cleanSrc = entry.src.split('#')[0]
      if (!cleanSrc) return -1
      return spineList.findIndex(
        (sp) => sp.cleanHref === cleanSrc || cleanSrc.endsWith(sp.cleanHref) || sp.cleanHref.endsWith(cleanSrc)
      )
    })

    for (let i = 0; i < rawChapterEntries.length; i++) {
      const entry = rawChapterEntries[i]
      const curSpineIdx = entrySpineIndices[i]
      let chapterChars = 0

      if (curSpineIdx !== -1) {
        // 寻找下一个有效 entry 的 spine 下标
        let nextSpineIdx = spineList.length
        for (let j = i + 1; j < rawChapterEntries.length; j++) {
          if (entrySpineIndices[j] > curSpineIdx) {
            nextSpineIdx = entrySpineIndices[j]
            break
          }
        }
        // 累加该章节跨越的所有 spine 文件字符
        for (let s = curSpineIdx; s < nextSpineIdx; s++) {
          chapterChars += spineList[s].chars
        }
      }

      // 如果未能通过 spine 累加到字符，尝试直接读取单文件
      if (chapterChars === 0 && entry.src) {
        const cleanSrc = entry.src.split('#')[0]
        const chapterFile =
          zip.file(opfDir + cleanSrc) ||
          zip.file(cleanSrc) ||
          zip.file(decodeURIComponent(opfDir + cleanSrc))
        if (chapterFile) {
          try {
            const html = await chapterFile.async('text')
            const textOnly = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            chapterChars = textOnly.length
            if (
              !tocRawText &&
              (/(目\s*录|contents|table of contents)/i.test(entry.title) ||
                (i <= 3 && /(第一[章节回]|chapter\s*1)/i.test(textOnly)))
            ) {
              tocRawText = textOnly.slice(0, 4000)
            }
          } catch {
            // ignore
          }
        }
      }

      chapterCharCounts.push(Math.max(chapterChars, 300))
    }

    // 估算总页数（标准中文排版每页约 550~600 字）
    totalPages = Math.max(10, Math.ceil(totalChars / 550))

    // 如果未能提取出明确目录，根据章节均分
    if (rawChapterEntries.length === 0) {
      const chunkPages = 15
      const chunkCount = Math.max(1, Math.ceil(totalPages / chunkPages))
      for (let i = 1; i <= chunkCount; i++) {
        const sp = (i - 1) * chunkPages + 1
        const ep = Math.min(totalPages, i * chunkPages)
        chapters.push({
          index: i,
          title: `第 ${i} 部分 (P${sp}~P${ep})`,
          start_page: sp,
          end_page: ep,
          page_count: ep - sp + 1,
        })
      }
    } else {
      // 根据各章实际字符篇幅占比分配页码，保证真实起止递增
      const totalChapterChars = chapterCharCounts.reduce((a, b) => a + b, 0)
      let currentStartPage = 1

      rawChapterEntries.forEach((entry, idx) => {
        const chars = chapterCharCounts[idx] || 500
        const isTiny =
          /^(封面|扉页|版权|书名页|cover|title|copyright)$/i.test(entry.title.trim()) || chars < 400

        let pageSpan = 1
        if (isTiny) {
          pageSpan = 1
        } else if (totalChapterChars > 0) {
          pageSpan = Math.max(1, Math.round((chars / totalChapterChars) * totalPages))
        }

        const sp = currentStartPage
        const isLast = idx === rawChapterEntries.length - 1
        const ep = isLast ? Math.max(sp, totalPages) : Math.max(sp, sp + pageSpan - 1)

        chapters.push({
          index: idx + 1,
          title: entry.title,
          start_page: sp,
          end_page: ep,
          page_count: ep - sp + 1,
        })

        currentStartPage = ep + 1
      })
    }

    return {
      title,
      author,
      totalPages,
      chapters,
      format: 'epub',
      fileName,
      fileSize: arrayBuffer.byteLength,
      coverUrl,
      tocRawText,
    }
  }

  return {
    title,
    author,
    totalPages,
    chapters,
    format: 'epub',
    fileName,
    fileSize: arrayBuffer.byteLength,
    coverUrl,
    tocRawText: '',
  }
}

/**
 * 解析 PDF 文档
 */
async function parsePdf(arrayBuffer: ArrayBuffer, fileName: string): Promise<ParsedBookResult> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  })

  const pdfDoc = await loadingTask.promise
  const totalPages = pdfDoc.numPages

  let title = cleanBookTitleFromFilename(fileName)
  let author: string | undefined

  try {
    const meta = await pdfDoc.getMetadata()
    if (meta && meta.info) {
      const info = meta.info as any
      if (info.Title && typeof info.Title === 'string' && info.Title.trim() && !info.Title.startsWith('Microsoft Word')) {
        title = info.Title.trim()
      }
      if (info.Author && typeof info.Author === 'string' && info.Author.trim()) {
        author = info.Author.trim()
      }
    }
  } catch (e) {
    console.warn('Failed to extract PDF metadata:', e)
  }

  const chapters: BookChapter[] = []

  // 提取 PDF 书签 Outline
  try {
    const outline = await pdfDoc.getOutline()
    if (outline && outline.length > 0) {
      interface OutlineNode {
        title: string
        dest: any
        items?: OutlineNode[]
      }

      const flatItems: { title: string; dest: any }[] = []
      const traverse = (items: OutlineNode[]) => {
        for (const item of items) {
          flatItems.push({ title: item.title, dest: item.dest })
          if (item.items && item.items.length > 0) {
            traverse(item.items)
          }
        }
      }
      traverse(outline as OutlineNode[])

      // 解析书签的目标页码
      const resolvedChapters: { title: string; pageNum: number }[] = []
      for (const item of flatItems) {
        let dest = item.dest
        if (typeof dest === 'string') {
          dest = await pdfDoc.getDestination(dest)
        }
        if (Array.isArray(dest) && dest[0]) {
          try {
            const pageIndex = await pdfDoc.getPageIndex(dest[0])
            const pageNum = pageIndex + 1
            if (pageNum >= 1 && pageNum <= totalPages) {
              resolvedChapters.push({
                title: item.title.trim(),
                pageNum,
              })
            }
          } catch {
            // 忽略非单页目标
          }
        }
      }

      // 按页码从小到大排序
      resolvedChapters.sort((a, b) => a.pageNum - b.pageNum)

      // 去重同页码标题（保留首个）
      const deduped: { title: string; pageNum: number }[] = []
      for (const rc of resolvedChapters) {
        if (deduped.length === 0 || deduped[deduped.length - 1].pageNum !== rc.pageNum) {
          deduped.push(rc)
        }
      }

      // 计算每个章节的起始与结束页
      deduped.forEach((rc, idx) => {
        const isLast = idx === deduped.length - 1
        const sp = rc.pageNum
        const ep = isLast ? totalPages : Math.max(sp, deduped[idx + 1].pageNum - 1)
        chapters.push({
          index: idx + 1,
          title: rc.title,
          start_page: sp,
          end_page: ep,
          page_count: ep - sp + 1,
        })
      })
    }
  } catch (err) {
    console.warn('Failed to parse PDF bookmarks:', err)
  }

  // 如果无书签大纲，提取前 3 页文本作为预览
  let rawTextPreview = ''
  try {
    const previewPages = Math.min(3, totalPages)
    const textPieces: string[] = []
    for (let p = 1; p <= previewPages; p++) {
      const page = await pdfDoc.getPage(p)
      const content = await page.getTextContent()
      const pageText = content.items.map((item: any) => item.str).join(' ')
      textPieces.push(`--- 第 ${p} 页 ---\n` + pageText)
    }
    rawTextPreview = textPieces.join('\n\n')
  } catch {
    // ignore
  }

  // 若无书签，按页数智能划分 15~20 页一个阶段
  if (chapters.length === 0) {
    const chunkPages = totalPages > 100 ? 20 : 10
    const count = Math.ceil(totalPages / chunkPages)
    for (let i = 1; i <= count; i++) {
      const sp = (i - 1) * chunkPages + 1
      const ep = Math.min(totalPages, i * chunkPages)
      chapters.push({
        index: i,
        title: `第 ${i} 阶段 (P${sp}~P${ep})`,
        start_page: sp,
        end_page: ep,
        page_count: ep - sp + 1,
      })
    }
  }

  return {
    title,
    author,
    totalPages,
    chapters,
    format: 'pdf',
    fileName,
    fileSize: arrayBuffer.byteLength,
    rawTextPreview,
  }
}

/**
 * 解析 TXT 文本书籍
 */
async function parseTxt(arrayBuffer: ArrayBuffer, fileName: string): Promise<ParsedBookResult> {
  // 先尝试 UTF-8 解码，如果乱码则回退到 GBK
  let text = ''
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
    text = utf8Decoder.decode(arrayBuffer)
  } catch {
    try {
      const gbkDecoder = new TextDecoder('gbk')
      text = gbkDecoder.decode(arrayBuffer)
    } catch {
      text = new TextDecoder('utf-8').decode(arrayBuffer)
    }
  }

  const title = cleanBookTitleFromFilename(fileName)
  const totalChars = text.length
  // 600 字每页
  const totalPages = Math.max(1, Math.ceil(totalChars / 600))

  // 正则匹配中文/英文常见章节格式
  const chapterRegex = /(?:^|\n)\s*(第[0-9一二三四五六七八九十百千万零两]+[章回节卷部篇][^\n]{0,35}|Chapter\s+[0-9IVXLCDM]+[^\n]{0,35}|Section\s+\d+[^\n]{0,35}|引言|序言|前言|后记|结语|尾声|番外[^\n]{0,20})/g

  const matches: { title: string; charIndex: number }[] = []
  let match: RegExpExecArray | null
  while ((match = chapterRegex.exec(text)) !== null) {
    matches.push({
      title: match[1].trim(),
      charIndex: match.index,
    })
  }

  const chapters: BookChapter[] = []

  if (matches.length > 0) {
    matches.forEach((m, idx) => {
      const isLast = idx === matches.length - 1
      const startChar = m.charIndex
      const nextChar = isLast ? totalChars : matches[idx + 1].charIndex
      
      const sp = Math.floor(startChar / 600) + 1
      const ep = isLast ? totalPages : Math.max(sp, Math.floor(nextChar / 600))

      chapters.push({
        index: idx + 1,
        title: m.title,
        start_page: sp,
        end_page: Math.min(totalPages, ep),
        page_count: Math.max(1, Math.min(totalPages, ep) - sp + 1),
      })
    })
  } else {
    // 无章节正则命中，切分阶段
    const chunkPages = 15
    const count = Math.ceil(totalPages / chunkPages)
    for (let i = 1; i <= count; i++) {
      const sp = (i - 1) * chunkPages + 1
      const ep = Math.min(totalPages, i * chunkPages)
      chapters.push({
        index: i,
        title: `第 ${i} 节 (P${sp}~P${ep})`,
        start_page: sp,
        end_page: ep,
        page_count: ep - sp + 1,
      })
    }
  }

  return {
    title,
    totalPages,
    chapters,
    format: 'txt',
    fileName,
    fileSize: arrayBuffer.byteLength,
    rawTextPreview: text.slice(0, 1000),
  }
}

/**
 * 解析 Markdown 电子书
 */
async function parseMarkdown(arrayBuffer: ArrayBuffer, fileName: string): Promise<ParsedBookResult> {
  const text = new TextDecoder('utf-8').decode(arrayBuffer)
  let title = cleanBookTitleFromFilename(fileName)

  // 尝试匹配第一行 # 一级标题作为书名
  const h1Match = text.match(/^#\s+([^\n]+)/m)
  if (h1Match && h1Match[1].trim()) {
    title = h1Match[1].trim()
  }

  const totalChars = text.length
  const totalPages = Math.max(1, Math.ceil(totalChars / 500))

  // 匹配 # 和 ## 标题作为章节
  const headerRegex = /(?:^|\n)(#{1,3})\s+([^\n]+)/g
  const matches: { title: string; charIndex: number }[] = []
  let match: RegExpExecArray | null
  while ((match = headerRegex.exec(text)) !== null) {
    matches.push({
      title: match[2].trim(),
      charIndex: match.index,
    })
  }

  const chapters: BookChapter[] = []
  if (matches.length > 0) {
    matches.forEach((m, idx) => {
      const isLast = idx === matches.length - 1
      const startChar = m.charIndex
      const nextChar = isLast ? totalChars : matches[idx + 1].charIndex

      const sp = Math.floor(startChar / 500) + 1
      const ep = isLast ? totalPages : Math.max(sp, Math.floor(nextChar / 500))

      chapters.push({
        index: idx + 1,
        title: m.title,
        start_page: sp,
        end_page: Math.min(totalPages, ep),
        page_count: Math.max(1, Math.min(totalPages, ep) - sp + 1),
      })
    })
  } else {
    chapters.push({
      index: 1,
      title: '全文',
      start_page: 1,
      end_page: totalPages,
      page_count: totalPages,
    })
  }

  return {
    title,
    totalPages,
    chapters,
    format: 'md',
    fileName,
    fileSize: arrayBuffer.byteLength,
    rawTextPreview: text.slice(0, 1000),
  }
}

/**
 * 解析 MOBI / AZW3 电子书
 */
async function parseMobi(arrayBuffer: ArrayBuffer, fileName: string): Promise<ParsedBookResult> {
  const bytes = new Uint8Array(arrayBuffer)
  let title = cleanBookTitleFromFilename(fileName)
  let author: string | undefined

  // Palm Database 格式校验: 偏移 0x3C 为 "BOOKMOBI"
  let isMobi = false
  if (bytes.length > 0x44) {
    const magic = String.fromCharCode(...bytes.slice(0x3c, 0x44))
    if (magic === 'BOOKMOBI') {
      isMobi = true
    }
  }

  // 尝试读取前 32 字节的名字
  if (isMobi) {
    let rawDbName = ''
    for (let i = 0; i < 32 && bytes[i] !== 0; i++) {
      rawDbName += String.fromCharCode(bytes[i])
    }
    if (rawDbName.trim()) {
      title = cleanBookTitleFromFilename(rawDbName.trim())
    }
  }

  // 估算页数（MOBI 压缩比约为 1:2，以文件大小估算字数）
  const estimatedChars = Math.floor(bytes.length * 1.5)
  const totalPages = Math.max(10, Math.ceil(estimatedChars / 600))

  const chapters: BookChapter[] = []
  const chunkPages = 15
  const count = Math.ceil(totalPages / chunkPages)
  for (let i = 1; i <= count; i++) {
    const sp = (i - 1) * chunkPages + 1
    const ep = Math.min(totalPages, i * chunkPages)
    chapters.push({
      index: i,
      title: `第 ${i} 章节 (P${sp}~P${ep})`,
      start_page: sp,
      end_page: ep,
      page_count: ep - sp + 1,
    })
  }

  return {
    title,
    author,
    totalPages,
    chapters,
    format: 'mobi',
    fileName,
    fileSize: arrayBuffer.byteLength,
  }
}

/**
 * 统一书籍解析入口：支持 EPUB, PDF, TXT, MD, MOBI, AZW3 等多种格式（最大支持 500MB）
 */
export async function parseBookFile(file: File): Promise<ParsedBookResult> {
  if (file.size > MAX_BOOK_FILE_SIZE) {
    throw new Error(
      `书籍文件过大（${formatFileSize(file.size)}），当前单本最大支持 500MB，请压缩或精简后上传`
    )
  }

  const fileName = file.name
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
  const arrayBuffer = await file.arrayBuffer()

  try {
    switch (ext) {
      case '.epub':
        return await parseEpub(arrayBuffer, fileName)
      case '.pdf':
        return await parsePdf(arrayBuffer, fileName)
      case '.txt':
        return await parseTxt(arrayBuffer, fileName)
      case '.md':
      case '.markdown':
        return await parseMarkdown(arrayBuffer, fileName)
      case '.mobi':
      case '.azw':
      case '.azw3':
        return await parseMobi(arrayBuffer, fileName)
      default:
        // 如果未识别出格式，尝试作为文本解析
        try {
          return await parseTxt(arrayBuffer, fileName)
        } catch {
          return {
            title: cleanBookTitleFromFilename(fileName),
            totalPages: 100,
            chapters: [
              {
                index: 1,
                title: '第一部分',
                start_page: 1,
                end_page: 100,
                page_count: 100,
              },
            ],
            format: 'other',
            fileName,
            fileSize: file.size,
          }
        }
    }
  } catch (err: any) {
    console.warn(`Direct parse failed for ${fileName}, falling back to chunked outline:`, err)
    // 降级兜底：无论文件格式如何异常，均保证能生成默认进度，不阻断用户使用
    const fallbackPages = Math.max(10, Math.min(1000, Math.ceil(file.size / (1024 * 50))))
    return {
      title: cleanBookTitleFromFilename(fileName),
      totalPages: fallbackPages,
      chapters: [
        {
          index: 1,
          title: '全书开始 (第一阶段)',
          start_page: 1,
          end_page: Math.ceil(fallbackPages / 2),
          page_count: Math.ceil(fallbackPages / 2),
        },
        {
          index: 2,
          title: '深化推进 (第二阶段)',
          start_page: Math.ceil(fallbackPages / 2) + 1,
          end_page: fallbackPages,
          page_count: fallbackPages - Math.ceil(fallbackPages / 2),
        },
      ],
      format: (ext.replace('.', '') as any) || 'other',
      fileName,
      fileSize: file.size,
    }
  }
}
