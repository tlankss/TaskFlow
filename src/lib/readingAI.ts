import { Book, BookChapter, ReadingPlan, ReadingDailySchedule, Task } from '../types'

export interface TOCRecognitionResult {
  title: string
  author?: string
  total_pages: number
  chapters: BookChapter[]
}

/**
 * 格式化今天的日期 YYYY-MM-DD
 */
export function getTodayDateStr(): string {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 计算两个日期之间的天数
 */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 调用 AI 识别目录图片或目录文本
 */
export async function recognizeBookTOC(params: {
  imageBase64?: string
  textInput?: string
  apiKey?: string
  baseUrl?: string
}): Promise<TOCRecognitionResult> {
  const { imageBase64, textInput, apiKey, baseUrl } = params
  const effectiveKey = apiKey || localStorage.getItem('taskflow_ai_key') || ''
  const effectiveBaseUrl = baseUrl || localStorage.getItem('taskflow_ai_base_url') || 'https://api.deepseek.com/v1'

  // 如果有 API Key，优先调用 AI
  if (effectiveKey) {
    try {
      const messages: any[] = [
        {
          role: 'system',
          content: `你是一个专业的图书解析助手。你需要分析用户提供的图书目录照片或目录文字，提取全书基本信息及章节结构。
必须返回严格合法的 JSON 对象，不要包含 markdown 代码块包裹之外的多余字符。
返回格式要求：
{
  "title": "书名",
  "author": "作者(如有)",
  "total_pages": 320,
  "chapters": [
    {
      "index": 1,
      "title": "第一章 标题",
      "start_page": 1,
      "end_page": 28,
      "difficulty": "normal"
    }
  ]
}
注意：
1. start_page 与 end_page 为数字。如果最后一章无法确定截止页，可根据 total_pages 估算。
2. 过滤掉无意义的广告页、空白页，但请保留前言、导言与附录。
3. difficulty 可选: easy, normal, hard`,
        },
      ]

      if (imageBase64) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: '请识别这张图书目录/书页照片中的书名、章节与起止页码：' },
            {
              type: 'image_url',
              image_url: {
                url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
              },
            },
          ],
        })
      } else {
        messages.push({
          role: 'user',
          content: `请解析以下图书目录信息：\n${textInput || ''}`,
        })
      }

      const response = await fetch(`${effectiveBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${effectiveKey}`,
        },
        body: JSON.stringify({
          model: imageBase64 ? 'gpt-4o' : 'deepseek-chat',
          messages,
          response_format: { type: 'json_object' },
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const contentStr = data.choices?.[0]?.message?.content
        if (contentStr) {
          const parsed = JSON.parse(contentStr)
          return sanitizeTOCResult(parsed)
        }
      }
    } catch (err) {
      console.warn('[ReadingAI] API 识别出错，自动回退到本地智能规则解析:', err)
    }
  }

  // 兜底本地智能规则解析（若未配置 Key 或网络不可用）
  return fallbackParseTOC(textInput || '')
}

/**
 * 校验与修整 AI 解析结果
 */
function sanitizeTOCResult(raw: any): TOCRecognitionResult {
  const title = raw.title?.trim() || '未命名书籍'
  const author = raw.author?.trim() || '未知作者'
  const chapters: BookChapter[] = []

  let lastEnd = 0
  if (Array.isArray(raw.chapters)) {
    raw.chapters.forEach((ch: any, idx: number) => {
      const start = Number(ch.start_page) || lastEnd + 1
      const end = Number(ch.end_page) || start + 15
      const count = Math.max(1, end - start + 1)
      lastEnd = end

      chapters.push({
        index: idx + 1,
        title: String(ch.title || `第${idx + 1}章`).trim(),
        start_page: start,
        end_page: end,
        page_count: count,
        difficulty: ch.difficulty === 'hard' ? 'hard' : ch.difficulty === 'easy' ? 'easy' : 'normal',
      })
    })
  }

  const total_pages = Number(raw.total_pages) || (chapters.length > 0 ? chapters[chapters.length - 1].end_page : 100)

  return {
    title,
    author,
    total_pages,
    chapters,
  }
}

/**
 * 调用 DeepSeek AI 大模型深度对齐与校验图书真实章节与起止页码
 */
/**
 * 校验并平滑校准章节页码，防止出现某正文大章仅被分配 1~2 页等严重失真畸形情况
 */
export function sanitizeAndBalanceChapters(
  rawChapters: BookChapter[],
  totalPages: number
): { chapters: BookChapter[]; totalPages: number } {
  if (!rawChapters || rawChapters.length === 0) {
    return { chapters: [], totalPages: Math.max(1, totalPages) }
  }

  const effectiveTotal = Math.max(totalPages, rawChapters.length)
  const isFrontOrBackMatter = (title: string) =>
    /^(封面|扉页|版权|书名页|献词|推荐序|中文版序|译者序|前言|自序|目录|附录|参考文献|致谢|后记|结语|contents|cover|copyright|preface|introduction)$/i.test(
      title.trim()
    )

  // 1. 识别并初步清洗
  const cleanList = rawChapters.map((c, idx) => ({
    ...c,
    index: idx + 1,
    title: c.title.trim() || `第 ${idx + 1} 节`,
    start_page: Math.max(1, Number(c.start_page) || 1),
    end_page: Math.max(1, Number(c.end_page) || 1),
  }))

  // 2. 检测是否存在明显的畸形失衡：例如某个核心章节（非扉页前言）被分配了 <= 3 页，而其他大章拥有 50+ 页
  const substantiveChapters = cleanList.filter((c) => !isFrontOrBackMatter(c.title))
  const hasSevereAnomaly =
    effectiveTotal >= 50 &&
    substantiveChapters.some((c) => c.end_page - c.start_page + 1 <= 3) &&
    cleanList.some((c) => c.end_page - c.start_page + 1 >= 40)

  if (hasSevereAnomaly && substantiveChapters.length >= 2) {
    // 重新平衡：给前置轻量章节保留合理页码，主要正文章节根据出版惯例或权重分摊
    let curPage = 1
    const totalSubstantivePages = Math.max(
      substantiveChapters.length * 10,
      effectiveTotal - (cleanList.length - substantiveChapters.length) * 4
    )

    cleanList.forEach((c) => {
      const isMinor = isFrontOrBackMatter(c.title)
      let span = 2
      if (isMinor) {
        if (/^(封面|扉页|版权|献词)$/i.test(c.title)) span = 1
        else if (/目录/i.test(c.title)) span = 2
        else span = Math.min(8, Math.max(3, Math.round(effectiveTotal * 0.03)))
      } else {
        // 主要正文章节：如果有原来的长度差异，平滑保留，但保底至少占合理比例
        const oldSpan = Math.max(1, c.end_page - c.start_page + 1)
        if (oldSpan <= 3) {
          // 被严重压缩的正文部分，给予恢复
          span = Math.max(15, Math.round(totalSubstantivePages / substantiveChapters.length))
        } else {
          span = Math.max(15, oldSpan)
        }
      }
      c.start_page = curPage
      c.end_page = curPage + span - 1
      c.page_count = span
      curPage = c.end_page + 1
    })

    // 等比缩放到总页数闭环
    const currentMax = cleanList[cleanList.length - 1].end_page
    if (currentMax !== effectiveTotal) {
      let runStart = 1
      cleanList.forEach((c, idx) => {
        const ratio = c.page_count / currentMax
        let newSpan = Math.max(1, Math.round(ratio * effectiveTotal))
        if (idx === cleanList.length - 1) {
          newSpan = Math.max(1, effectiveTotal - runStart + 1)
        }
        c.start_page = runStart
        c.end_page = runStart + newSpan - 1
        c.page_count = newSpan
        runStart = c.end_page + 1
      })
    }
  }

  // 3. 严格保证起止页码无缝连续单调递增，且最后一章闭合于 totalPages
  let runningStart = 1
  const finalizedChapters: BookChapter[] = cleanList.map((c, idx) => {
    let span = Math.max(1, c.end_page - c.start_page + 1)
    if (idx === cleanList.length - 1) {
      span = Math.max(1, effectiveTotal - runningStart + 1)
    }
    const sp = runningStart
    const ep = sp + span - 1
    runningStart = ep + 1
    return {
      index: idx + 1,
      title: c.title,
      start_page: sp,
      end_page: ep,
      page_count: Math.max(1, ep - sp + 1),
    }
  })

  const finalTotal = finalizedChapters[finalizedChapters.length - 1].end_page

  return {
    chapters: finalizedChapters,
    totalPages: finalTotal,
  }
}

/**
 * 调用 DeepSeek AI 大模型深度对齐与校验图书真实章节与起止页码
 */
export async function alignChaptersWithDeepSeek(params: {
  bookTitle: string
  chapters: BookChapter[]
  totalPages: number
  tocRawText?: string
  apiKey?: string
  baseUrl?: string
  model?: string
}): Promise<{ chapters: BookChapter[]; totalPages: number }> {
  const { bookTitle, chapters, totalPages, tocRawText, apiKey, baseUrl, model } = params
  const effectiveKey = apiKey || localStorage.getItem('taskflow_ai_key') || ''
  const effectiveBaseUrl =
    baseUrl || localStorage.getItem('taskflow_ai_base_url') || 'https://api.deepseek.com/v1'
  const effectiveModel = model || localStorage.getItem('taskflow_ai_model') || 'deepseek-chat'

  if (!effectiveKey) {
    throw new Error(
      '未检测到 AI API Key，请在左侧侧边栏点击个人头像 ->「大模型设置」中配置 DeepSeek API Key'
    )
  }

  const prompt = `你是一位拥有20年出版审校经验的资深图书排版专家。
当前书籍：《${bookTitle}》，全书估算总页数约为 ${totalPages} 页。
现有提取的章节列表（共 ${chapters.length} 项）：
${chapters.map((c) => `[第${c.index}项] ${c.title} (当前暂定 P${c.start_page}~P${c.end_page})`).join('\n')}

${
  tocRawText && tocRawText.trim()
    ? `【书中印刷版目录原文采样】（包含原书印刷页码线索）：\n${tocRawText.slice(0, 3500)}\n`
    : ''
}

核心任务与出版排版硬性准则：
1. 【结构比例常识校准（极重要）】：
   - 严禁将任何正文核心大章或部分（如“第一部分...”、“第二部分 意义疗法”、“下篇”、“第X章”）分配为只有 1~3 页！
   - 例如在《活出生命的意义》或类似经典著作中，正文核心部分（如“集中营经历”与“意义疗法”）在真实图书中各占重要篇幅（通常分别占全书 55%~65% 与 30%~40%）。若前端暂定数据中某大部被错误截断为仅2页，这是切片提取缺陷，你必须结合图书知识库恢复真实的出版比例！
2. 【前置与后置轻量页】：
   - 扉页、版权页、献词、书名页篇幅极短，精确设置为 1~2 页（例如 P1~1、P2~2）。
   - 目录页通常为 2~4 页。
   - 序言、导读等按实际篇幅分配（一般为 4~12 页）。
3. 【正文章节合理篇幅】：
   - 各正文章节（如“第一章 ...”或“第一部分 ...”）按正规图书篇幅分配真实页码（通常每章 20~50 页，大部 40~80 页）。
4. 【严格连续单调递增】：
   - 页码必须严格无缝连续递增（即第 N+1 章的 start_page 必须等于第 N 章的 end_page + 1），严禁跳空或重叠。
   - 最终全书总页数必须合理闭环（最后一章 end_page 等于全书总页数）。
5. 必须返回且仅返回严格合法的 JSON 对象，格式如下：
{
  "total_pages": ${totalPages},
  "chapters": [
    { "index": 1, "title": "扉页", "start_page": 1, "end_page": 1 },
    { "index": 2, "title": "目录", "start_page": 2, "end_page": 3 },
    { "index": 3, "title": "第一部分 在集中营的痛苦经历", "start_page": 4, "end_page": 95 },
    { "index": 4, "title": "第二部分 意义疗法", "start_page": 96, "end_page": 143 }
  ]
}`

  const response = await fetch(`${effectiveBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${effectiveKey}`,
    },
    body: JSON.stringify({
      model: effectiveModel,
      messages: [
        {
          role: 'system',
          content:
            '你是一个专业的图书目录与页码校验排版助手。严格仅返回标准 JSON 对象，禁止输出任何思考前言或额外 Markdown 说明文字。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`DeepSeek API 请求失败 (HTTP ${response.status}): ${errText.slice(0, 120)}`)
  }

  const data = await response.json()
  const contentStr = data.choices?.[0]?.message?.content
  if (!contentStr) {
    throw new Error('DeepSeek 返回内容为空，请重试')
  }

  let parsed: any
  try {
    let cleanJson = contentStr.trim()
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    }
    parsed = JSON.parse(cleanJson)
  } catch (e: any) {
    throw new Error(`解析 DeepSeek 返回数据失败: ${e.message}`)
  }

  if (!parsed || !Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
    throw new Error('DeepSeek 返回的章节数据格式无效')
  }

  const rawTotalPages = Number(parsed.total_pages) || totalPages

  const updatedChapters: BookChapter[] = parsed.chapters.map((ch: any, idx: number) => {
    const original = chapters[idx]
    const sp = Math.max(1, Number(ch.start_page) || idx + 1)
    const ep = Math.max(sp, Number(ch.end_page) || sp)
    return {
      index: idx + 1,
      title: String(ch.title || original?.title || `第${idx + 1}章`).trim(),
      start_page: sp,
      end_page: ep,
      page_count: Math.max(1, ep - sp + 1),
    }
  })

  // 运行后置平滑守卫，保证无缝连接与杜绝 1~2 页畸形
  return sanitizeAndBalanceChapters(updatedChapters, rawTotalPages)
}

export interface ChapterCorrectionInput {
  index: number
  title: string
  excerpt?: string
}

export interface ChapterCorrectionResult {
  index: number
  title: string
}

/**
 * 调用 DeepSeek / AI 大模型智能矫正混乱、残缺或过度切片的图书目录章节名
 */
export async function correctBookTOCWithAI(params: {
  bookTitle: string
  author?: string
  chapters: ChapterCorrectionInput[]
  apiKey?: string
  baseUrl?: string
  model?: string
}): Promise<ChapterCorrectionResult[]> {
  const { bookTitle, author, chapters, apiKey, baseUrl, model } = params
  const effectiveKey = apiKey || localStorage.getItem('taskflow_ai_key') || ''
  const effectiveBaseUrl =
    baseUrl || localStorage.getItem('taskflow_ai_base_url') || 'https://api.deepseek.com/v1'
  const effectiveModel = model || localStorage.getItem('taskflow_ai_model') || 'deepseek-chat'

  if (!effectiveKey) {
    throw new Error(
      '未检测到 AI API Key，请在左侧侧边栏点击个人头像 ->「大模型设置」中配置 DeepSeek API Key'
    )
  }

  // 单批次处理函数
  const processBatch = async (
    batch: ChapterCorrectionInput[]
  ): Promise<{ index: number; title: string }[]> => {
    const promptLines = batch.map((c) => {
      let cleanExcerpt = (c.excerpt || '').replace(/\s+/g, ' ').trim()
      if (cleanExcerpt.length > 80) cleanExcerpt = cleanExcerpt.slice(0, 80) + '...'
      return `[节点#${c.index}] 原抓取标题: "${c.title}"${cleanExcerpt ? ` | 开篇正文摘录: "${cleanExcerpt}"` : ''}`
    })

    const prompt = `你是一位拥有20年出版审校经验的资深图书编辑专家。
当前书籍：《${bookTitle}》${author ? `，作者：${author}` : ''}。
由于电子书切片提取或格式解析原因，目前系统提取到的章节目录存在混乱（例如出现占位词“未知”、纯数字代码如“3”、重复编号或缺少规范书名）。
当前校准批次：共 ${batch.length} 项（节点序号从 ${batch[0].index} 到 ${batch[batch.length - 1].index}）。

以下是本批次各章节节点、原抓取标题以及对应开篇正文摘要：
${promptLines.join('\n')}

你的核心任务：
结合各章开篇正文摘录、全书结构脉络以及公开出版物真实目录知识，为全部这 ${batch.length} 个节点整理并矫正出最规范、优雅的中文书籍目录标题。

硬性要求：
1. 必须保持原有节点的数量和序号绝对一致（从序号 ${batch[0].index} 到 ${batch[batch.length - 1].index}，共 ${batch.length} 项）。
2. 严禁返回“未知”！将无意义占位词（如 "未知"、"3"、"part01"）结合正文开篇还原为真实章节名（例如："第六章 思维之乐"、"第二节 体验的结构"；若为大章中间的正文延续分段，请规范命名为 "第X章 章节名 (续)" 或其包含的子标题）。
3. 准确识别开篇非正文节点（如 "封面"、"扉页"、"版权信息"、"推荐序"、"前言"、"目录"）与收尾节点（"结语"、"致谢"、"附录"、"参考文献"）。
4. 必须且仅返回标准合法的 JSON 对象，格式如下：
{
  "chapters": [
    { "index": ${batch[0].index}, "title": "规范章节标题" }
  ]
}`

    const response = await fetch(`${effectiveBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${effectiveKey}`,
      },
      body: JSON.stringify({
        model: effectiveModel,
        messages: [
          {
            role: 'system',
            content:
              '你是一个专业的图书目录整理与矫正专家。严格仅返回标准 JSON 对象，禁止输出任何思考前言或多余说明文字。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.15,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`AI 矫正请求失败 (HTTP ${response.status}): ${errText.slice(0, 120)}`)
    }

    const data = await response.json()
    const contentStr = data.choices?.[0]?.message?.content
    if (!contentStr) {
      throw new Error('AI 返回内容为空，请重试')
    }

    let cleanJson = contentStr.trim()
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    }
    const parsed = JSON.parse(cleanJson)

    if (!parsed || !Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
      throw new Error('AI 返回的章节数据格式无效')
    }

    return parsed.chapters.map((ch: any, idx: number) => ({
      index: Number(ch.index) || batch[idx]?.index || idx + 1,
      title: String(ch.title || batch[idx]?.title || `第 ${batch[idx]?.index || idx + 1} 节`).trim(),
    }))
  }

  // 大章节分批处理：每批 25 项，防止超出单次输出 Token 上限导致后续章节被截断
  const BATCH_SIZE = 25
  const allResults: ChapterCorrectionResult[] = []

  if (chapters.length <= BATCH_SIZE) {
    const singleRes = await processBatch(chapters)
    allResults.push(...singleRes)
  } else {
    for (let i = 0; i < chapters.length; i += BATCH_SIZE) {
      const batch = chapters.slice(i, i + BATCH_SIZE)
      try {
        const batchRes = await processBatch(batch)
        allResults.push(...batchRes)
      } catch (err) {
        console.warn(`[readingAI] Batch ${i / BATCH_SIZE + 1} correction failed, falling back:`, err)
        // 批次降级保留
        allResults.push(...batch.map((b) => ({ index: b.index, title: b.title })))
      }
    }
  }

  const resultMap = new Map<number, string>()
  allResults.forEach((r) => resultMap.set(r.index, r.title))

  // 最终组装与杜绝“未知”占位符
  return chapters.map((c) => {
    let finalTitle = resultMap.get(c.index) || c.title
    if (!finalTitle || /^(未知|未命名|无标题|无题|untitled|unknown)$/i.test(finalTitle.trim())) {
      // 尝试从摘录提取首行
      const firstLine = (c.excerpt || '').slice(0, 30).split(/[。！？\n]/)[0]?.trim()
      if (firstLine && firstLine.length >= 2 && /(章|节|篇|部|序|引言|结语|心流)/.test(firstLine)) {
        finalTitle = firstLine
      } else {
        finalTitle = `第 ${c.index} 节`
      }
    }
    return {
      index: c.index,
      title: finalTitle.trim(),
    }
  })
}

/**
 * 本地智能规则文本目录提取器
 */
function fallbackParseTOC(text: string): TOCRecognitionResult {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const chapters: BookChapter[] = []
  let bookTitle = '新录入书籍'

  // 正则匹配: 第x章 xxx 123 或 Chapter 1 xxx 123 或 标题 ... 45
  const pageRegex = /(?:.*?)\s+(?:第?\s*(\d+)\s*页|[pP](\d+)|\.{2,}\s*(\d+)|(\d+)\s*$)/
  let lastPage = 1

  lines.forEach((line, idx) => {
    if (idx === 0 && !line.match(/\d+$/)) {
      bookTitle = line
      return
    }

    const match = line.match(pageRegex)
    let page = 0
    let title = line

    if (match) {
      const pageStr = match[1] || match[2] || match[3] || match[4]
      page = parseInt(pageStr, 10)
      title = line.replace(pageRegex, '').trim().replace(/\.{2,}/g, '').trim()
    } else {
      page = lastPage + 15
    }

    if (!title) title = `第${chapters.length + 1}部分`

    const start = lastPage
    const end = Math.max(start, page)
    chapters.push({
      index: chapters.length + 1,
      title,
      start_page: start,
      end_page: end,
      page_count: end - start + 1,
      difficulty: 'normal',
    })
    lastPage = end + 1
  })

  // 如果未能识别出有效章节，生成一套标准的默认章节
  if (chapters.length === 0) {
    const demoTotal = 180
    const count = 6
    const perChapter = Math.floor(demoTotal / count)
    for (let i = 1; i <= count; i++) {
      const s = (i - 1) * perChapter + 1
      const e = i === count ? demoTotal : i * perChapter
      chapters.push({
        index: i,
        title: `第${i}章：核心要点与实践指南 (${s}-${e}页)`,
        start_page: s,
        end_page: e,
        page_count: e - s + 1,
        difficulty: 'normal',
      })
    }
  }

  const total = chapters[chapters.length - 1].end_page

  return {
    title: bookTitle,
    author: '精选作家',
    total_pages: total,
    chapters,
  }
}

/**
 * 核心排期算法：基于章节保护与难度自适应生成每日排期
 */
export function generateReadingSchedule(params: {
  chapters: BookChapter[]
  targetDays?: number
  dailyMinutes?: number
  startDate?: string
  bufferDaysEnabled?: boolean
}): ReadingDailySchedule[] {
  const {
    chapters,
    targetDays = 14,
    dailyMinutes = 25,
    startDate = getTodayDateStr(),
    bufferDaysEnabled = true,
  } = params

  if (chapters.length === 0) return []

  const totalPages = chapters[chapters.length - 1].end_page - chapters[0].start_page + 1
  // 假设平均阅读速度：1.2 分钟 / 页 (可随章节难度浮动)
  const effectiveDays = Math.max(3, targetDays)
  const schedule: ReadingDailySchedule[] = []

  let currentDate = startDate
  let currentChapterIdx = 0
  let currentChapterPage = chapters[0].start_page
  let dayCounter = 1

  // 计算每日目标平均页数
  const avgPagesPerDay = Math.ceil(totalPages / (effectiveDays * (bufferDaysEnabled ? 0.85 : 1)))

  while (currentChapterIdx < chapters.length && dayCounter <= effectiveDays * 2) {
    // 检查是否插入缓冲/复盘日 (每 6 天或完成阶段性大章后)
    if (bufferDaysEnabled && dayCounter % 6 === 0) {
      schedule.push({
        day_index: dayCounter,
        date: currentDate,
        start_page: currentChapterPage,
        end_page: currentChapterPage,
        page_count: 0,
        chapter_title: '☕️ 阶段复盘与缓冲吸收日 (写读书笔记/补齐进度)',
        is_buffer_day: true,
        estimated_minutes: 20,
        status: 'pending',
      })
      currentDate = addDays(currentDate, 1)
      dayCounter++
      continue
    }

    const curCh = chapters[currentChapterIdx]
    const remainingInChapter = curCh.end_page - currentChapterPage + 1

    let pagesToReadToday = 0
    let endPageToday = 0
    let taskTitle = ''

    // 章节保护策略：如果本章剩余页数和当日平均页数接近，直接读完整章
    if (remainingInChapter <= avgPagesPerDay * 1.3) {
      pagesToReadToday = remainingInChapter
      endPageToday = curCh.end_page
      taskTitle = `${curCh.title} (完)`
      currentChapterIdx++
      if (currentChapterIdx < chapters.length) {
        currentChapterPage = chapters[currentChapterIdx].start_page
      }
    } else {
      // 本章太长，在章内做合理分段
      pagesToReadToday = avgPagesPerDay
      endPageToday = Math.min(curCh.end_page, currentChapterPage + avgPagesPerDay - 1)
      taskTitle = `${curCh.title} (上/阶段)`
      currentChapterPage = endPageToday + 1
    }

    // 根据难度计算预估耗时
    const difficultyMultiplier = curCh.difficulty === 'hard' ? 1.5 : curCh.difficulty === 'easy' ? 0.9 : 1.1
    const estMins = Math.max(15, Math.round(pagesToReadToday * difficultyMultiplier))

    schedule.push({
      day_index: dayCounter,
      date: currentDate,
      start_page: endPageToday - pagesToReadToday + 1,
      end_page: endPageToday,
      page_count: pagesToReadToday,
      chapter_title: taskTitle,
      is_buffer_day: false,
      estimated_minutes: estMins,
      status: 'pending',
    })

    currentDate = addDays(currentDate, 1)
    dayCounter++
  }

  return schedule
}

/**
 * 将生成的阅读计划排期，批量映射投影为 TaskFlow 的标准 Task 待办
 */
export function convertScheduleToTasks(params: {
  planId: string
  book: Book
  schedule: ReadingDailySchedule[]
}): Partial<Task>[] {
  const { planId, book, schedule } = params
  const todayStr = getTodayDateStr()

  return schedule.map((item) => {
    const isToday = item.date === todayStr

    const title = item.is_buffer_day
      ? `☕️《${book.title}》复盘思考日`
      : `📖《${book.title}》${item.chapter_title} (P${item.start_page}-P${item.end_page})`

    const notes = item.is_buffer_day
      ? `回顾前几日核心概念，记录 1~2 条感悟或补足落下的进度。`
      : `今日目标: 第 ${item.start_page} 页至第 ${item.end_page} 页 (共 ${item.page_count} 页)。\n书名: 《${book.title}》${book.author ? ` | 作者: ${book.author}` : ''}`

    const task: Partial<Task> = {
      title,
      notes,
      priority: 'p2',
      project_id: 'reading',
      estimated_minutes: item.estimated_minutes || 25,
      actual_minutes: 0,
      due_date: item.date,
      is_today: isToday,
      status: 'todo',
      task_type: 'reading',
      reading_meta: {
        book_id: book.id,
        plan_id: planId,
        book_title: book.title,
        chapter_title: item.chapter_title,
        start_page: item.start_page,
        end_page: item.end_page,
        cover_url: book.cover_url && !book.cover_url.startsWith('data:') && book.cover_url.length < 500 ? book.cover_url : undefined,
      },
    }

    return task
  })
}

export interface BookGuideResult {
  summary: string
  key_takeaways: string[]
  core_chapters: string[]
  recommended_pace: string
  target_days: number
  daily_minutes: number
  // 主流平台深度结构化导读新字段
  core_problem?: string
  reading_roadmap?: string[]
  core_chapter_details?: { title: string; pages?: string; reason: string }[]
  skim_chapters?: { title: string; pages?: string; tip: string }[]
  pre_reading_questions?: string[]
  actionable_habits?: string[]
  reading_mode?: 'deep' | 'fast' | 'practical'
}

/**
 * 调用 DeepSeek 生成全书精读导读、核心重点章节剖析与个性化阅读节奏建议
 * 参考主流阅读软件（微信读书 AI 领读、得到精读系统、Blinkist）知识工程架构
 */
export async function generateBookGuideWithDeepSeek(params: {
  bookTitle: string
  author?: string
  chapters: BookChapter[]
  totalPages: number
  readingGoal?: 'deep' | 'fast' | 'practical'
  apiKey?: string
  baseUrl?: string
}): Promise<BookGuideResult> {
  const { bookTitle, author, chapters, totalPages, readingGoal = 'deep', apiKey, baseUrl } = params
  const effectiveKey = apiKey || localStorage.getItem('taskflow_ai_key') || ''
  const effectiveBaseUrl =
    baseUrl || localStorage.getItem('taskflow_ai_base_url') || 'https://api.deepseek.com/v1'

  const chapterListStr = chapters
    .slice(0, 40)
    .map((c, i) => `${i + 1}. ${c.title} (第${c.start_page}~${c.end_page}页，约${c.page_count}页)`)
    .join('\n')

  // 根据总页数与阅读偏好计算动态默认节奏
  let defaultDays = 14
  let defaultMins = 25
  if (readingGoal === 'fast') {
    defaultDays = Math.max(5, Math.min(12, Math.round(totalPages / 25)))
    defaultMins = 20
  } else if (readingGoal === 'practical') {
    defaultDays = Math.max(7, Math.min(18, Math.round(totalPages / 18)))
    defaultMins = 25
  } else {
    // deep
    defaultDays = Math.max(10, Math.min(30, Math.round(totalPages / 12)))
    defaultMins = 35
  }

  const primaryChapters = chapters
    .filter((c) => !/^(封面|扉页|版权|献词|目录|附录|致谢)$/i.test(c.title))
    .slice(0, 3)

  const fallbackResult: BookGuideResult = {
    summary: `《${bookTitle}》${author ? `由 ${author} 著，` : ''}全书约 ${totalPages} 页。本书系统梳理了核心议题与底层心智模型，旨在帮助读者打破思维局限，建立清晰的知识架构与实践策略。`,
    core_problem: `现代读者在面对信息过载与认知盲区时的迷茫。本书直击核心痛点，提供结构化思考工具与破局方法。`,
    reading_roadmap: [
      '① 认知唤醒：识别现状与底层心理机制',
      '② 理论重塑：建立核心模型与分析框架',
      '③ 工具落地：将抽象知识转化为日常微习惯',
      '④ 终身复利：在持续迭代中实现知行合一',
    ],
    core_chapter_details: primaryChapters.map((c) => ({
      title: c.title,
      pages: `P${c.start_page}~P${c.end_page}`,
      reason: '本书理论精髓所在，提供了最关键的认知突破口与方法论底座，建议字斟句酌精读。',
    })),
    skim_chapters: chapters
      .filter((c) => /序言|导读|附录|案例|背景/i.test(c.title))
      .slice(0, 2)
      .map((c) => ({
        title: c.title,
        pages: `P${c.start_page}~P${c.end_page}`,
        tip: '属于背景铺垫或辅助参考，建议重点扫描小标题与核心结论即可，不必逐句研读。',
      })),
    key_takeaways: [
      '系统把握全书核心框架与关键理论模型，避免只见树木不见森林',
      '聚焦核心精读篇章深度咀嚼批注，与自身经历对照思考',
      '结合日常实践进行知识迁移，将书中心法转化为行动微清单',
    ],
    core_chapters: primaryChapters.map((c) => c.title),
    pre_reading_questions: [
      '我在相关领域目前遇到的最大阻碍或思维瓶颈是什么？',
      '作者提出的核心假设是否颠覆了我原有的认知直觉？',
      '读完这一章后，我今天可以立刻采取的一个微小行动是什么？',
    ],
    actionable_habits: [
      '阅读时在关键转折处暂停30秒，用自己的话在旁边写一句批注心得',
      '每周设定一次20分钟的缓冲复盘日，梳理本周沉淀的金句与行动点',
    ],
    recommended_pace:
      readingGoal === 'fast'
        ? `【高效通识模式】规划 ${defaultDays} 天，每天约 ${defaultMins} 分钟。抓大放小，主攻核心精读章，案例可快速掠过。`
        : readingGoal === 'practical'
          ? `【实用践行模式】规划 ${defaultDays} 天，每天约 ${defaultMins} 分钟。聚焦方法论章节，随读随做行动清单。`
          : `【深度研读模式】规划 ${defaultDays} 天，每天约 ${defaultMins} 分钟。精研理论内核，周末预留缓冲日吸收消化。`,
    target_days: defaultDays,
    daily_minutes: defaultMins,
    reading_mode: readingGoal,
  }

  if (!effectiveKey) {
    return fallbackResult
  }

  try {
    const goalDescription =
      readingGoal === 'fast'
        ? '【⚡ 高效通识模式】（读者注重快速通览、抓大放小、提炼核心认知框架，明确指出哪些章节可以略读跳读以节省心力）'
        : readingGoal === 'practical'
          ? '【🛠️ 实用践行模式】（读者注重工具心法与直接落地，聚焦具有操作性的方法论章节与可执行的微行动法则）'
          : '【🎯 深度研读模式】（读者注重逐章咀嚼、底层逻辑推演与深度笔记批注，推荐扎实稳健的阅读节奏）'

    const prompt = `你是一位深谙主流高阶读书平台（如微信读书 AI 领读、得到精读系统、Blinkist 等）知识工程体系的【顶级阅读架构师与认知顾问】。
请针对以下图书生成一份极高含金量、结构严谨、颠覆认知的【专业深度导读与精读行动指南】。

图书信息：
- 书名：《${bookTitle}》
- 作者：${author || '未知'}
- 全书总页数：${totalPages} 页
- 章节目录：
${chapterListStr}
- 读者偏好模式：${goalDescription}

【主流软件处理参考规范与原则】：
1. 拒绝空泛的客套话与模板套话！直击痛点与底层逻辑，像“得到讲书”和“微信读书领读”一样充满洞见与交付感。
2. 导读必须点透本书的颠覆性洞见（破局痛点）：回答“为什么值得花时间读？打破了什么固有偏见？”。
3. 给出章节的分层精读策略：
   - 筛选 2~3 个必须逐字细品的【核心精读章】并说明硬核理由。
   - 筛选 1~2 个多为背景铺陈或案例堆砌的【建议略读/跳读章】并传授略读心法。
4. 给出【读前灵魂三问】：提炼 3 个带着批判性思维的读前思考清单，让读者带着问题读。
5. 给出【落地微行动法则】：提炼 2~3 条读完即可践行的行动心法或工具。
6. 动态科学排期：根据全书总页数 ${totalPages} 页与读者的【${readingGoal}】模式，给出最科学的阅读天数与每日分钟数。

请输出严格合法的 JSON 对象（严禁输出任何 markdown 包装外的散装字符）：
{
  "summary": "150~220字全书通透导读，点透全书核心主旨、底层思想与价值",
  "core_problem": "本书破解的现实核心痛点与颠覆性洞见（为什么值得花时间读？打破了什么固有思维盲区？）",
  "reading_roadmap": [
    "① 现状困境：一句话概括...",
    "② 底层机制：一句话概括...",
    "③ 心法重塑：一句话概括...",
    "④ 实践落地：一句话概括..."
  ],
  "core_chapter_details": [
    {
      "title": "精读章节完整名称",
      "pages": "第X~Y页",
      "reason": "为什么必读？本章最硬核的认知模型或抓手是什么"
    }
  ],
  "skim_chapters": [
    {
      "title": "略读章节名称",
      "pages": "第X~Y页",
      "tip": "略读心法：如何快速翻阅以节省心力"
    }
  ],
  "core_chapters": [
    "核心章节名称1",
    "核心章节名称2"
  ],
  "key_takeaways": [
    "关键洞察1（干货，一句话讲透核心）",
    "关键洞察2",
    "关键洞察3"
  ],
  "pre_reading_questions": [
    "读前追问1（带着这个问题读，效率提升300%）",
    "读前追问2",
    "读前追问3"
  ],
  "actionable_habits": [
    "落地微行动1（读完即可付诸实践的具体动作）",
    "日常心智工具2"
  ],
  "recommended_pace": "针对本书厚度、难度与读者选定模式的具体阅读节奏策略",
  "target_days": ${defaultDays},
  "daily_minutes": ${defaultMins}
}`

    const response = await fetch(`${effectiveBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${effectiveKey}`,
      },
      body: JSON.stringify({
        model: localStorage.getItem('taskflow_ai_model') || 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      return fallbackResult
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return fallbackResult

    let cleanJson = content.trim()
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    }
    const parsed = JSON.parse(cleanJson)

    // 适配 core_chapters
    let legacyCoreChapters: string[] = fallbackResult.core_chapters
    if (Array.isArray(parsed.core_chapters) && parsed.core_chapters.length > 0) {
      legacyCoreChapters = parsed.core_chapters
    } else if (Array.isArray(parsed.core_chapter_details) && parsed.core_chapter_details.length > 0) {
      legacyCoreChapters = parsed.core_chapter_details.map((d: any) => d.title)
    }

    return {
      summary: parsed.summary || fallbackResult.summary,
      core_problem: parsed.core_problem || fallbackResult.core_problem,
      reading_roadmap:
        Array.isArray(parsed.reading_roadmap) && parsed.reading_roadmap.length > 0
          ? parsed.reading_roadmap
          : fallbackResult.reading_roadmap,
      core_chapter_details:
        Array.isArray(parsed.core_chapter_details) && parsed.core_chapter_details.length > 0
          ? parsed.core_chapter_details
          : fallbackResult.core_chapter_details,
      skim_chapters:
        Array.isArray(parsed.skim_chapters) && parsed.skim_chapters.length > 0
          ? parsed.skim_chapters
          : fallbackResult.skim_chapters,
      key_takeaways:
        Array.isArray(parsed.key_takeaways) && parsed.key_takeaways.length > 0
          ? parsed.key_takeaways
          : fallbackResult.key_takeaways,
      core_chapters: legacyCoreChapters,
      pre_reading_questions:
        Array.isArray(parsed.pre_reading_questions) && parsed.pre_reading_questions.length > 0
          ? parsed.pre_reading_questions
          : fallbackResult.pre_reading_questions,
      actionable_habits:
        Array.isArray(parsed.actionable_habits) && parsed.actionable_habits.length > 0
          ? parsed.actionable_habits
          : fallbackResult.actionable_habits,
      recommended_pace: parsed.recommended_pace || fallbackResult.recommended_pace,
      target_days:
        typeof parsed.target_days === 'number' && parsed.target_days > 0
          ? parsed.target_days
          : defaultDays,
      daily_minutes:
        typeof parsed.daily_minutes === 'number' && parsed.daily_minutes > 0
          ? parsed.daily_minutes
          : defaultMins,
      reading_mode: readingGoal,
    }
  } catch (err) {
    console.warn('[readingAI] generateBookGuide error:', err)
    return fallbackResult
  }
}

export interface NotesSummaryResult {
  executive_summary: string
  golden_quotes: string[]
  practical_takeaways: string[]
}

/**
 * 调用 DeepSeek 深度总结阅读笔记与提炼全书读后感
 */
export async function summarizeReadingNotesWithDeepSeek(params: {
  bookTitle: string
  author?: string
  userNotes?: string
  chapterNotes?: { chapterTitle: string; notes: string }[]
  completedPages?: number
  totalPages?: number
  apiKey?: string
  baseUrl?: string
}): Promise<NotesSummaryResult> {
  const { bookTitle, author, userNotes, chapterNotes, completedPages, totalPages, apiKey, baseUrl } = params
  const effectiveKey = apiKey || localStorage.getItem('taskflow_ai_key') || ''
  const effectiveBaseUrl =
    baseUrl || localStorage.getItem('taskflow_ai_base_url') || 'https://api.deepseek.com/v1'

  const notesContext = [
    userNotes ? `【读者总读后感/思考】：\n${userNotes}` : '',
    chapterNotes && chapterNotes.length > 0
      ? `【打卡章节记录笔记】：\n` +
        chapterNotes.map((cn) => `· ${cn.chapterTitle}：${cn.notes}`).join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  const fallbackResult: NotesSummaryResult = {
    executive_summary: `通读《${bookTitle}》，全书在理论与实务层面构建了完整的逻辑闭环。读者在阅读中重点记录了关键知识体系与思考感悟，形成了扎实的认知沉淀。`,
    golden_quotes: [
      `真正决定认知深度的，不是阅读的速度，而是思考的留存率。`,
      `把书籍的骨架拆解为行动的清单，阅读才算真正内化。`,
    ],
    practical_takeaways: [
      '定期回顾书中的关键结论，并结合工作生活建立清单机制',
      '将核心概念转化为可执行的微习惯与实操工具',
    ],
  }

  if (!effectiveKey) {
    return fallbackResult
  }

  try {
    const prompt = `你是一位高阶知识管理顾问与认知导师。请针对读者在阅读图书《${bookTitle}》（${author ? `作者: ${author}` : ''}，当前阅读进度 ${completedPages || 0}/${totalPages || 100} 页）时记录的心得笔记，进行深度提炼与结构化总结：

${notesContext || '（读者未提供过多零碎笔记，请结合该书的核心思想与普遍阅读价值提炼）'}

请输出严格合法的 JSON 对象：
{
  "executive_summary": "200-300字的读后感与核心复盘精要，高度凝练深刻",
  "golden_quotes": [
    "提炼或关联 2-3 句经典金句/高光启迪语录"
  ],
  "practical_takeaways": [
    "落地启发1：可直接用于工作或个人成长的行动方案",
    "落地启发2",
    "落地启发3"
  ]
}`

    const response = await fetch(`${effectiveBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${effectiveKey}`,
      },
      body: JSON.stringify({
        model: localStorage.getItem('taskflow_ai_model') || 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      return fallbackResult
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return fallbackResult

    const parsed = JSON.parse(content)
    return {
      executive_summary: parsed.executive_summary || fallbackResult.executive_summary,
      golden_quotes: Array.isArray(parsed.golden_quotes) ? parsed.golden_quotes : fallbackResult.golden_quotes,
      practical_takeaways: Array.isArray(parsed.practical_takeaways)
        ? parsed.practical_takeaways
        : fallbackResult.practical_takeaways,
    }
  } catch (err) {
    console.warn('[readingAI] summarizeReadingNotes error:', err)
    return fallbackResult
  }
}

