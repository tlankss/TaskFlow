import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { db } from './db'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

app.setName('TaskFlow')

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname, '../public')

let win: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

app.on('before-quit', () => {
  isQuitting = true
})

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
  const preloadPath = fs.existsSync(path.join(__dirname, 'preload.mjs'))
    ? path.join(__dirname, 'preload.mjs')
    : path.join(__dirname, 'preload.js')

  const iconPath = process.env.VITE_PUBLIC ? path.join(process.env.VITE_PUBLIC, 'icon.png') : ''

  win = new BrowserWindow({
    title: 'TaskFlow',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    width: 1080,
    height: 720,
    minWidth: 800,
    minHeight: 550,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    transparent: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  // 注册右键菜单，方便随时打开 DevTools 或刷新页面
  win.webContents.on('context-menu', (_, props) => {
    const menu = Menu.buildFromTemplate([
      {
        label: '检查元素 / 开发者工具 (DevTools)',
        click: () => {
          win?.webContents.inspectElement(props.x, props.y)
          if (!win?.webContents.isDevToolsOpened()) {
            win?.webContents.openDevTools({ mode: 'detach' })
          }
        },
      },
      {
        label: '重新加载页面 (Reload)',
        click: () => win?.webContents.reload(),
      },
      { type: 'separator' },
      { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' },
      { role: 'selectAll', label: '全选' },
    ])
    menu.popup()
  })

  // 快捷键支持: Cmd+Option+I (Mac) / Ctrl+Shift+I (Windows) 或 F12 切换 DevTools
  win.webContents.on('before-input-event', (event, input) => {
    const isMac = process.platform === 'darwin'
    const isToggleDevTools =
      (isMac && input.meta && input.alt && input.key.toLowerCase() === 'i') ||
      (!isMac && input.control && input.shift && input.key.toLowerCase() === 'i') ||
      input.key === 'F12'

    if (isToggleDevTools) {
      if (win?.webContents.isDevToolsOpened()) {
        win.webContents.closeDevTools()
      } else {
        win?.webContents.openDevTools({ mode: 'detach' })
      }
      event.preventDefault()
      return
    }

    // 快捷键支持: Cmd+K / Ctrl+K 切换全局搜索与快捷指令面板
    const isCmdK =
      (input.meta || input.control) &&
      !input.alt &&
      (input.key.toLowerCase() === 'k' || input.code === 'KeyK')

    if (isCmdK && input.type === 'keyDown') {
      win?.webContents.send('action:toggleCommandPalette')
      event.preventDefault()
      return
    }
  })

  // Mac 平台特有优化：点击窗口红叉关闭时隐藏窗口，不彻底销毁，保证顶部任务栏小图标随时秒开
  win.on('close', (event) => {
    if (!isQuitting && process.platform === 'darwin') {
      event.preventDefault()
      win?.hide()
    }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(process.env.DIST || path.join(__dirname, '../dist'), 'index.html'))
  }
}

function createTray() {
  const iconPath = process.env.VITE_PUBLIC ? path.join(process.env.VITE_PUBLIC, 'icon.png') : ''
  let icon: Electron.NativeImage
  if (iconPath && fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 })
  } else {
    icon = nativeImage.createEmpty()
  }

  try {
    tray = new Tray(icon)
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '打开 TaskFlow',
        click: () => {
          if (!win || win.isDestroyed()) {
            createWindow()
          } else {
            win.show()
            win.focus()
          }
        },
      },
      {
        label: '开始今天规划',
        click: () => {
          if (!win || win.isDestroyed()) {
            createWindow()
          } else {
            win.show()
            win.focus()
          }
          win?.webContents.send('action:planToday')
        },
      },
      { type: 'separator' },
      {
        label: '退出 TaskFlow',
        click: () => {
          isQuitting = true
          app.quit()
        },
      },
    ])

    tray.setToolTip('TaskFlow 待办清单与专注监督')
    tray.setContextMenu(contextMenu)
    tray.setTitle(' TaskFlow')

    // Mac 状态栏托盘：点击直接切换显示/隐藏窗口
    tray.on('click', () => {
      if (!win || win.isDestroyed()) {
        createWindow()
      } else if (win.isVisible() && win.isFocused()) {
        win.hide()
      } else {
        win.show()
        win.focus()
      }
    })
  } catch (e) {
    console.log('Tray icon creation fallback:', e)
  }
}

function setupAppMenu() {
  const isMac = process.platform === 'darwin'
  const template: any[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about', label: '关于 TaskFlow' },
              { type: 'separator' },
              { role: 'services', label: '服务' },
              { type: 'separator' },
              { role: 'hide', label: '隐藏 TaskFlow' },
              { role: 'hideOthers', label: '隐藏其他' },
              { role: 'unhide', label: '全部显示' },
              { type: 'separator' },
              { role: 'quit', label: '退出 TaskFlow' },
            ],
          },
        ]
      : []),
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '查看',
      submenu: [
        {
          label: '快捷指令与全局搜索',
          accelerator: 'CommandOrControl+K',
          click: () => {
            win?.webContents.send('action:toggleCommandPalette')
          },
        },
        { type: 'separator' },
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        {
          label: '开发者工具',
          accelerator: isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I',
          click: () => {
            if (win?.webContents.isDevToolsOpened()) {
              win?.webContents.closeDevTools()
            } else {
              win?.webContents.openDevTools({ mode: 'detach' })
            }
          },
        },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front', label: '前置全部窗口' },
              { type: 'separator' },
              { role: 'window', label: '窗口' },
            ]
          : [{ role: 'close', label: '关闭' }]),
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 || !win || win.isDestroyed()) {
    createWindow()
  } else {
    win.show()
    win.focus()
  }
})

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.setName('TaskFlow')
    const iconPath = process.env.VITE_PUBLIC ? path.join(process.env.VITE_PUBLIC, 'icon.png') : ''
    if (fs.existsSync(iconPath)) {
      const img = nativeImage.createFromPath(iconPath)
      app.dock.setIcon(img)
    }
  }

  createWindow()
  setupAppMenu()
  createTray()

  try {
    globalShortcut.register('Option+Space', () => {
      if (win) {
        if (win.isVisible()) {
          win.hide()
        } else {
          win.show()
          win.focus()
          win.webContents.send('action:quickAdd')
        }
      }
    })
  } catch (e) {
    console.error('Failed to register global shortcut:', e)
  }

  // Database IPC Handlers
  ipcMain.handle('db:getTasks', () => db.getTasks())
  ipcMain.handle('db:addTask', (_, task) => db.addTask(task))
  ipcMain.handle('db:addTasks', (_, tasks) => db.addTasks(tasks))
  ipcMain.handle('db:updateTask', (_, id, updates) => db.updateTask(id, updates))
  ipcMain.handle('db:deleteTask', (_, id) => db.deleteTask(id))
  ipcMain.handle('db:getProjects', () => db.getProjects())
  ipcMain.handle('db:getSettings', () => db.getSettings())
  ipcMain.handle('db:updateSettings', (_, settings) => db.updateSettings(settings))

  // User Profile & Stats IPC Handlers
  ipcMain.handle('db:getUserProfile', () => db.getUserProfile())
  ipcMain.handle('db:updateUserProfile', (_, profile) => db.updateUserProfile(profile))
  ipcMain.handle('db:getUserStats', () => db.getUserStats())

  // Persistent Auth Data Handlers (跨版本、永不掉登录)
  ipcMain.handle('db:getAuthData', () => db.getAuthData())
  ipcMain.handle('db:saveAuthData', (_, authData) => db.saveAuthData(authData))
  ipcMain.handle('db:clearAuthData', () => db.clearAuthData())

  // AI Weekly Report generator (Inject User Role Title into System Prompt)
  ipcMain.handle('ai:generateWeeklyReport', async (_, { apiKey, baseUrl, model, tasks, userRole }) => {
    const completedTasks = tasks.filter((t: any) => t.status === 'completed')
    const totalMinutes = completedTasks.reduce(
      (acc: number, t: any) => acc + (t.actual_minutes || t.estimated_minutes || 0),
      0
    )

    const roleTitle = userRole || db.getUserProfile().role_title || '资深职场专业人士'

    const formatTaskPrompt = (t: any) => {
      let line = `- [${t.project_id}] ${t.title} (耗时: ${t.actual_minutes || t.estimated_minutes}分钟) 成果/说明: ${t.notes || '已完成'}`
      if (t.subtasks && t.subtasks.length > 0) {
        const completedSub = t.subtasks.filter((st: any) => st.completed)
        if (completedSub.length > 0) {
          const subDetails = completedSub
            .map((st: any) => `${st.title}${st.notes ? `【关键心得/成果: ${st.notes}】` : ''}`)
            .join('；')
          line += `\n  ↳ 拆解子步骤执行记录: ${subDetails}`
        }
      }
      return line
    }

    if (apiKey) {
      try {
        const response = await fetch(`${baseUrl || 'https://api.deepseek.com/v1'}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model || 'deepseek-chat',
            messages: [
              {
                role: 'system',
                content: `你是一位顶尖职场效率专家。请以【${roleTitle}】的口吻与视角，根据用户本周完成的任务清单（含详细子步骤成果与心得备注），撰写一份结构清晰、术语专业、逻辑严密的【本周工作总结报告】。分成【重点项目推进】、【日常业务处理】、【产出与亮点】、【下周计划】四个板块，充分吸纳子步骤中的具体细节成果，使用 Markdown 格式。`,
              },
              {
                role: 'user',
                content: `以下是我本周完成的任务及细分步骤成果列表：\n${completedTasks.map(formatTaskPrompt).join('\n')}`,
              },
            ],
          }),
        })
        const data = await response.json()
        if (data.choices && data.choices[0]?.message?.content) {
          return data.choices[0].message.content
        }
      } catch (err) {
        console.error('AI API Error, falling back to smart template generator:', err)
      }
    }

    // Smart template fallback with user role title integration
    const workTasks = completedTasks.filter(
      (t: any) => t.project_id === 'work' || t.project_id === 'default'
    )
    const meetingTasks = completedTasks.filter((t: any) => t.project_id === 'meeting')
    const otherTasks = completedTasks.filter(
      (t: any) => t.project_id !== 'work' && t.project_id !== 'meeting'
    )

    return `# 📅 TaskFlow 本周工作总结报告

> 汇报人身份: **${roleTitle}** | 累计完成任务 **${completedTasks.length}** 项 | 累计有效专注 **${Math.round((totalMinutes / 60) * 10) / 10}** 小时

---

### 一、 🚀 核心重点项目推进
${
  workTasks.length > 0
    ? workTasks
        .map(
          (t: any) => {
            let res = `* **${t.title}**\n  - 耗时: ${t.actual_minutes || t.estimated_minutes} 分钟\n  - 交付与说明: ${t.notes || '已按既定高标准完成'}`
            if (t.subtasks && t.subtasks.length > 0) {
              const completedWithNotes = t.subtasks.filter((st: any) => st.completed && st.notes)
              if (completedWithNotes.length > 0) {
                res += `\n  - 细分步骤成果:\n` + completedWithNotes.map((st: any) => `    • ${st.title}: ${st.notes}`).join('\n')
              }
            }
            return res
          }
        )
        .join('\n')
    : '* 本周完成了基础核心流程梳理与架构优化工作。'
}

### 二、 🤝 跨部门沟通与例会
${
  meetingTasks.length > 0
    ? meetingTasks
        .map((t: any) => `* **${t.title}** (投入: ${t.actual_minutes || t.estimated_minutes}m)`)
        .join('\n')
    : '* 积极参与团队例会并达成多项协同共识。'
}

### 三、 💡 业务日常与能力提升
${
  otherTasks.length > 0
    ? otherTasks.map((t: any) => `* ${t.title}`).join('\n')
    : '* 完成日常事务清理及流程自动化。'
}

### 四、 📌 关键产出与下周计划
1. 以 **${roleTitle}** 的标准持续推进关键业务闭环，提高交付质量；
2. 强化个人时间块安排，进一步提升日间专注效率。
`
  })

  // AI Task Breakdown & Planning generator
  ipcMain.handle('ai:breakdownTask', async (_, { title, notes, apiKey, baseUrl, model, userRole }) => {
    const roleTitle = userRole || db.getUserProfile().role_title || '专业人士'

    if (apiKey) {
      try {
        const response = await fetch(`${baseUrl || 'https://api.deepseek.com/v1'}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model || 'deepseek-chat',
            messages: [
              {
                role: 'system',
                content: `你是一位顶尖的工作效率与敏捷项目管理专家。请根据用户提供的主任务目标、背景说明及身份角色【${roleTitle}】，将该任务科学严密地拆解为 3 至 6 个具体、可行动、循序渐进的子任务步骤（Subtasks），并为每个步骤预估合理可落地的专注时间（单位：分钟，通常为 15 到 60 分钟）。
必须仅输出合法的纯 JSON 数组，严禁包含任何前言、解释文字或 Markdown 标记。格式如下：
[
  { "title": "步骤具体行动名称", "estimated_minutes": 25 },
  { "title": "下一步具体行动名称", "estimated_minutes": 30 }
]`,
              },
              {
                role: 'user',
                content: `请帮我拆解并规划该任务：\n任务标题：${title}\n背景与补充：${notes || '无'}`,
              },
            ],
            temperature: 0.3,
          }),
        })

        const data = await response.json()
        if (data.choices && data.choices[0]?.message?.content) {
          let text = data.choices[0].message.content.trim()
          if (text.startsWith('```')) {
            text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
          }
          const parsed = JSON.parse(text)
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed
              .map((item: any) => ({
                title: String(item.title || item.name || '').trim(),
                estimated_minutes: Number(item.estimated_minutes) || 25,
              }))
              .filter((item: any) => item.title.length > 0)
          }
        }
      } catch (err) {
        console.error('AI Breakdown API Error, falling back to smart rule engine:', err)
      }
    }

    // Smart Local Fallback Rule Engine
    const text = `${title} ${notes || ''}`.toLowerCase()
    if (/(代码|开发|编程|接口|架构|重构|前端|后端|api|bug|上线|部署|优化|feature)/i.test(text)) {
      return [
        { title: '梳理技术方案与设计核心接口规范', estimated_minutes: 25 },
        { title: '搭建基础代码结构与实现核心业务逻辑', estimated_minutes: 45 },
        { title: '编写边界测试用例与异常场景验证', estimated_minutes: 30 },
        { title: 'Code Review 与部署联调上线', estimated_minutes: 20 },
      ]
    }
    if (/(文档|方案|需求|报告|总结|调研|立项|规划|prd)/i.test(text)) {
      return [
        { title: '收集整理背景资料与核心诉求边界', estimated_minutes: 25 },
        { title: '拟定文档核心逻辑骨架与各章节大纲', estimated_minutes: 20 },
        { title: '撰写主体详细内容与关键数据图表论证', estimated_minutes: 45 },
        { title: '通篇润色排版与关键干系人对齐确认', estimated_minutes: 20 },
      ]
    }
    if (/(会议|沟通|同步|汇报|对齐|讨论|周会)/i.test(text)) {
      return [
        { title: '拟定会议议程与关键议题讨论清单', estimated_minutes: 15 },
        { title: '准备汇报演示文稿与核心支撑材料', estimated_minutes: 30 },
        { title: '组织召开会议并推动形成结论共识', estimated_minutes: 45 },
        { title: '梳理会议纪要并同步待办 Action Items', estimated_minutes: 15 },
      ]
    }
    if (/(学习|阅读|读书|研究|复习|课程|考试|看书)/i.test(text)) {
      return [
        { title: '通读全貌框架，标记核心概念与难点', estimated_minutes: 30 },
        { title: '精读重点章节并记录关键思考笔记', estimated_minutes: 45 },
        { title: '结合案例实操推演与知识点自测', estimated_minutes: 30 },
        { title: '梳理思维导图与形成个人实践心得', estimated_minutes: 25 },
      ]
    }
    if (/(设计|ui|ux|原型|交互|视觉|海报)/i.test(text)) {
      return [
        { title: '收集优秀参考案例与明确设计风格', estimated_minutes: 25 },
        { title: '绘制低保真线框图与梳理交互流转', estimated_minutes: 35 },
        { title: '产出高保真视觉稿与交互状态细节', estimated_minutes: 50 },
        { title: '组件规范整理与切图资源交付走查', estimated_minutes: 20 },
      ]
    }

    return [
      { title: '明确核心目标与验收标准', estimated_minutes: 15 },
      { title: '准备执行所需资源与前置依赖', estimated_minutes: 20 },
      { title: '核心阶段攻坚与实质成果推进', estimated_minutes: 45 },
      { title: '复盘自查验收与交付成果归档', estimated_minutes: 20 },
    ]
  })

  // 辅助时间解析
  function parseDurationMinutes(str: string, defaultMin = 15): number {
    const mMatch = str.match(/(\d+)\s*(?:分钟|分|m|min)/i)
    if (mMatch) return parseInt(mMatch[1], 10)
    const hMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:小时|个钟|h|hr)/i)
    if (hMatch) return Math.round(parseFloat(hMatch[1]) * 60)
    const sMatch = str.match(/(\d+)\s*(?:秒|s|sec)/i)
    if (sMatch) return Math.max(5, Math.round(parseInt(sMatch[1], 10) / 60 * 5))
    const setsMatch = str.match(/(\d+)\s*组/i)
    if (setsMatch) {
      const sets = parseInt(setsMatch[1], 10)
      return Math.max(10, sets * 3)
    }
    return defaultMin
  }

  // 本地智能规则解析引擎 (支持复杂周度排期、训练计划、多日复合句、列表与动作拆解，100% 离线可用)
  function smartLocalTextParser(
    text: string,
    baseWeek: 'current' | 'next' = 'next',
    defaultProjectId: string = 'personal',
    durationScope: string = 'auto'
  ): any[] {
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]
    const currentDay = now.getDay()
    
    const monday = new Date(now)
    if (baseWeek === 'next') {
      const daysToNextMonday = currentDay === 0 ? 1 : 8 - currentDay
      monday.setDate(now.getDate() + daysToNextMonday)
    } else {
      const diff = currentDay === 0 ? -6 : 1 - currentDay
      monday.setDate(now.getDate() + diff)
    }

    const getWeekDate = (offsetDays: number) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + offsetDays)
      return d.toISOString().split('T')[0]
    }

    const weekDayMap: Record<string, { offset: number; name: string }> = {
      '周一': { offset: 0, name: '周一' },
      '星期一': { offset: 0, name: '周一' },
      '周二': { offset: 1, name: '周二' },
      '星期二': { offset: 1, name: '周二' },
      '周三': { offset: 2, name: '周三' },
      '星期三': { offset: 2, name: '周三' },
      '周四': { offset: 3, name: '周四' },
      '星期四': { offset: 3, name: '周四' },
      '周五': { offset: 4, name: '周五' },
      '星期五': { offset: 4, name: '周五' },
      '周六': { offset: 5, name: '周六' },
      '星期六': { offset: 5, name: '周六' },
      '周日': { offset: 6, name: '周日' },
      '周天': { offset: 6, name: '周日' },
      '星期日': { offset: 6, name: '周日' },
      '星期天': { offset: 6, name: '周日' },
    }

    // 智能切分多行文本：先对未换行的连贯周计划长文按“周X/星期X”断句，确保每一天能成为独立的一行
    const normalizedText = text
      .replace(/(?<=[。；;！？!\n\r]|^)\s*(?=(?:周[一二三四五六日天]|星期[一二三四五六日天]|礼拜[一二三四五六日天]))/g, '\n')
      .replace(/(?<=[^\n])(?=(?:周[一二三四五六日天]|星期[一二三四五六日天]|礼拜[一二三四五六日天])[\u4e00-\u9fa5]{0,6}[:：])/g, '\n')
      .replace(/(?<=[。；;！？!\s])\s*(?=(?:周[一二三四五六日天][、\/和与及]?)+选一天)/g, '\n')

    const rawLines = normalizedText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    const parsedTasks: any[] = []

    const hasWeekdayMarkers = rawLines.some((l) =>
      Object.keys(weekDayMap).some((k) => l.includes(k))
    )

    if (hasWeekdayMarkers) {
      for (const line of rawLines) {
        if (line.includes('选一天') || line.includes('二、四、六') || line.includes('周二周四周六')) {
          const parts = line.split(/[，。；]/).map((p) => p.trim()).filter(Boolean)

          let aerobicDesc = ''
          let aerobicMins = 40
          const optPartIdx = parts.findIndex((p) => p.includes('选一天'))
          if (optPartIdx !== -1) {
            const optPart = parts[optPartIdx].replace(/^.*选一天(?:做)?/, '').trim()
            if (optPartIdx + 1 < parts.length && !parts[optPartIdx + 1].includes('剩下') && !parts[optPartIdx + 1].includes('休息')) {
              aerobicDesc = (optPart ? optPart + ' ' : '') + parts[optPartIdx + 1]
            } else {
              aerobicDesc = optPart
            }
          }
          if (!aerobicDesc) {
            aerobicDesc = parts.find((p) => /有氧|跳绳|跑|快走|慢跑/.test(p)) || '纯有氧训练'
          }
          const m1 = aerobicDesc.match(/(\d+)\s*分钟/) || line.match(/(\d+)\s*分钟(?:快走|慢跑|跳绳|跑|有氧)/)
          if (m1) aerobicMins = parseInt(m1[1], 10)

          let activateDesc = ''
          let activateMins = 20
          const remPart = parts.find((p) => /剩下|两天/.test(p) && /激活|哑铃|拉伸|自重/.test(p))
          if (remPart) {
            activateDesc = remPart.replace(/^.*(?:剩下两天|两天)(?:一天)?(?:做)?/, '').trim()
          } else {
            activateDesc = parts.find((p) => /激活|拉伸|恢复/.test(p)) || '全身激活与拉伸'
          }
          const m2 = activateDesc.match(/(\d+)\s*分钟/) || line.match(/(\d+)\s*分钟(?:全身激活|激活|拉伸|哑铃)/)
          if (m2) activateMins = parseInt(m2[1], 10)

          parsedTasks.push({
            title: `周二：${aerobicDesc.replace(/[，,]/g, ' ')}`,
            due_date: getWeekDate(1),
            priority: 'p2',
            project_id: defaultProjectId,
            estimated_minutes: aerobicMins,
            notes: line,
            engine: 'local',
            subtasks: [
              { title: '热身活动与心率提升 5分钟', estimated_minutes: 5 },
              { title: aerobicDesc, estimated_minutes: Math.max(10, aerobicMins - 5) },
            ],
          })

          parsedTasks.push({
            title: `周四：${activateDesc}`,
            due_date: getWeekDate(3),
            priority: 'p2',
            project_id: defaultProjectId,
            estimated_minutes: activateMins,
            notes: line,
            engine: 'local',
            subtasks: [
              { title: activateDesc, estimated_minutes: activateMins },
            ],
          })

          parsedTasks.push({
            title: `周六：${activateDesc}`,
            due_date: getWeekDate(5),
            priority: 'p2',
            project_id: defaultProjectId,
            estimated_minutes: activateMins,
            notes: line,
            engine: 'local',
            subtasks: [
              { title: activateDesc, estimated_minutes: activateMins },
            ],
          })
          continue
        }

        let matchedDayKey: string | null = null
        for (const k of Object.keys(weekDayMap)) {
          if (line.startsWith(k) || line.includes(`${k}：`) || line.includes(`${k}:`)) {
            matchedDayKey = k
            break
          }
        }

        if (matchedDayKey) {
          const { offset, name } = weekDayMap[matchedDayKey]
          const targetDate = getWeekDate(offset)

          let taskTitle = ''
          let detailsText = ''
          const colonIdx = line.search(/[:：]/)
          if (colonIdx !== -1) {
            const prefix = line.slice(0, colonIdx).trim()
            taskTitle = prefix.replace(/^周[一二三四五六日天]/, (m) => `${m} `)
            if (/胸/.test(taskTitle) && !/训练|练/.test(taskTitle)) taskTitle += '部训练'
            else if (/背/.test(taskTitle) && !/训练|练/.test(taskTitle)) taskTitle += '部训练'
            else if (/(肩|臂)/.test(taskTitle) && !/训练|练/.test(taskTitle)) taskTitle += '训练'
            else if (/腿/.test(taskTitle) && !/训练|练/.test(taskTitle)) taskTitle += '部训练'
            else if (/腹|核心/.test(taskTitle) && !/训练|练/.test(taskTitle)) taskTitle += '训练'

            detailsText = line.slice(colonIdx + 1).trim()
          } else {
            taskTitle = line
            detailsText = ''
          }

          const subItems = detailsText
            ? detailsText.split(/[，,；;。]/).map((s) => s.trim()).filter(Boolean)
            : []

          let totalMins = 0
          const subtasks = subItems.map((item) => {
            const cleanTitle = item.replace(/^(?:接|然后|最后|再做)\s*/, '')
            const mins = parseDurationMinutes(cleanTitle, 15)
            totalMins += mins
            return {
              title: cleanTitle,
              estimated_minutes: mins,
            }
          })

          if (totalMins === 0) totalMins = 45

          parsedTasks.push({
            title: taskTitle.includes('：') || taskTitle.includes(':') ? taskTitle : `${name}：${taskTitle.replace(name, '').trim()}`,
            due_date: targetDate,
            priority: 'p2',
            project_id: defaultProjectId,
            estimated_minutes: totalMins,
            notes: detailsText,
            engine: 'local',
            subtasks,
          })
          continue
        }
      }
    }

    if (parsedTasks.length > 0) {
      parsedTasks.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
    }

    // 智能识别时间规划跨度 (如: 3个月, 1个月, 4周, 半年, 2周)
    let detectedScope = durationScope || 'auto'
    if (detectedScope === 'auto') {
      if (/(\d+|[一两二三四五六七八九十]+)\s*个?月/.test(text)) {
        const m = text.match(/(\d+|[一两二三四五六七八九十]+)\s*个?月/)!
        const numMap: any = { '一': 1, '两': 2, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 }
        const val = parseInt(m[1], 10) || numMap[m[1]] || 1
        if (val >= 6) detectedScope = '6months'
        else if (val >= 3) detectedScope = '3months'
        else if (val >= 1) detectedScope = '1month'
      } else if (/半年/.test(text)) {
        detectedScope = '6months'
      } else if (/(\d+|[一两二三四五六七八九十]+)\s*周/.test(text)) {
        const m = text.match(/(\d+|[一两二三四五六七八九十]+)\s*周/)!
        const numMap: any = { '一': 1, '两': 2, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 }
        const val = parseInt(m[1], 10) || numMap[m[1]] || 1
        if (val >= 12) detectedScope = '3months'
        else if (val >= 4) detectedScope = '1month'
        else if (val >= 2) detectedScope = '2weeks'
        else detectedScope = '1week'
      } else if (/季度/.test(text)) {
        detectedScope = '3months'
      }
    }

    let totalWeeks = 1
    if (detectedScope === '2weeks') totalWeeks = 2
    else if (detectedScope === '1month') totalWeeks = 4
    else if (detectedScope === '3months') totalWeeks = 12
    else if (detectedScope === '6months') totalWeeks = 24

    if (totalWeeks > 1 && parsedTasks.length > 0) {
      const multiWeekTasks: any[] = []
      for (let w = 1; w <= totalWeeks; w++) {
        const dayOffset = (w - 1) * 7
        const phaseMonth = Math.ceil(w / 4)
        for (const t of parsedTasks) {
          const d = new Date(t.due_date)
          d.setDate(d.getDate() + dayOffset)
          const newDueDate = d.toISOString().split('T')[0]
          const phaseNote = totalWeeks >= 4 ? `【第${phaseMonth}阶段·第${w}周进阶】` : `【第${w}周】`
          multiWeekTasks.push({
            ...t,
            title: t.title.startsWith('第') ? t.title : `第${w}周·${t.title}`,
            due_date: newDueDate,
            notes: `${phaseNote}${t.notes || ''}`.trim(),
            engine: 'local',
          })
        }
      }
      return multiWeekTasks
    }

    if (parsedTasks.length === 0) {
      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i]
        if (line.length < 3) continue
        const cleaned = line.replace(/^\d+[\.、\s]+/, '').replace(/^[-*•]\s+/, '').trim()
        if (!cleaned) continue

        parsedTasks.push({
          title: cleaned.slice(0, 60),
          due_date: todayStr,
          priority: 'p2',
          project_id: defaultProjectId,
          estimated_minutes: 30,
          notes: line.length > 60 ? line : '',
          engine: 'local',
          subtasks: [],
        })
      }
    }

    return parsedTasks
  }

  // AI Smart Text Breakdown & Multi-Task Parser (支持复杂排期、时间周期需求、长文智能拆解)
  ipcMain.handle('ai:smartParseTasks', async (_, {
    text,
    baseWeek = 'next',
    durationScope = 'auto',
    defaultProjectId = 'personal',
    apiKey,
    baseUrl,
    model,
    userRole
  }) => {
    if (!text || !text.trim()) return []

    const roleTitle = userRole || db.getUserProfile().role_title || '专业人士'
    const now = new Date()
    const currentDay = now.getDay()
    const daysToNextMonday = currentDay === 0 ? 1 : 8 - currentDay
    const targetMonday = new Date(now)
    if (baseWeek === 'next') {
      targetMonday.setDate(now.getDate() + daysToNextMonday)
    } else {
      const diff = currentDay === 0 ? -6 : 1 - currentDay
      targetMonday.setDate(now.getDate() + diff)
    }
    const targetMondayStr = targetMonday.toISOString().split('T')[0]

    // 智能识别时间跨度需求 (如用户输入 "生成3个月计划"、"持续4周"、"半年")
    let detectedScope = durationScope || 'auto'
    if (detectedScope === 'auto') {
      if (/(\d+|[一两二三四五六七八九十]+)\s*个?月/.test(text)) {
        const m = text.match(/(\d+|[一两二三四五六七八九十]+)\s*个?月/)!
        const numMap: any = { '一': 1, '两': 2, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 }
        const val = parseInt(m[1], 10) || numMap[m[1]] || 1
        if (val >= 6) detectedScope = '6months'
        else if (val >= 3) detectedScope = '3months'
        else if (val >= 1) detectedScope = '1month'
      } else if (/半年/.test(text)) {
        detectedScope = '6months'
      } else if (/(\d+|[一两二三四五六七八九十]+)\s*周/.test(text)) {
        const m = text.match(/(\d+|[一两二三四五六七八九十]+)\s*周/)!
        const numMap: any = { '一': 1, '两': 2, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 }
        const val = parseInt(m[1], 10) || numMap[m[1]] || 1
        if (val >= 12) detectedScope = '3months'
        else if (val >= 4) detectedScope = '1month'
        else if (val >= 2) detectedScope = '2weeks'
        else detectedScope = '1week'
      } else if (/季度/.test(text)) {
        detectedScope = '3months'
      }
    }

    let totalWeeks = 1
    let scopeDesc = '单周计划 (1 周)'
    if (detectedScope === '2weeks') { totalWeeks = 2; scopeDesc = '双周冲刺计划 (持续 2 周)' }
    else if (detectedScope === '1month') { totalWeeks = 4; scopeDesc = '月度进阶计划 (持续 4 周 / 1 个月)' }
    else if (detectedScope === '3months') { totalWeeks = 12; scopeDesc = '季度进阶计划 (持续 12 周 / 3 个月)' }
    else if (detectedScope === '6months') { totalWeeks = 24; scopeDesc = '半年长期进阶规划 (持续 24 周 / 6 个月)' }

    const endDate = new Date(targetMonday)
    endDate.setDate(targetMonday.getDate() + (totalWeeks * 7) - 1)
    const endDateStr = endDate.toISOString().split('T')[0]

    if (apiKey) {
      try {
        const response = await fetch(`${baseUrl || 'https://api.deepseek.com/v1'}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model || 'deepseek-chat',
            max_tokens: 8192,
            temperature: 0.2,
            messages: [
              {
                role: 'system',
                content: `你是一位顶尖的任务规划与时间管理专家。请将用户输入的任意复杂文本（如长期训练排期、周计划、项目大纲、学习冲刺等）智能分析并拆解为标准结构化的待办任务列表。

基准时间与跨度信息：
- 起始周一公历日期：${targetMondayStr}
- 识别到的规划总时间跨度：${scopeDesc}（自 ${targetMondayStr} 起，延续至 ${endDateStr}，共计 ${totalWeeks} 周）
- 身份角色：${roleTitle}
- 默认项目分类：${defaultProjectId}

拆解与时间跨度处理核心要求（极其关键）：
1. 【时间需求与日期排期覆盖】：
   - 用户明确指定了时间跨度需求（${scopeDesc}）。你生成的待办任务【必须真实排布并覆盖整个 ${totalWeeks} 周时间周期】（从起始周一直规划延续至 ${endDateStr} 对应周期），严禁仅输出单单一星期！
   - 每项任务的 due_date 必须是格式为 YYYY-MM-DD 的具体真实公历日期，严格根据周次和星期几精准推算。例如起始周周一为 ${targetMondayStr}，后续周依次为 +7天、+14天、+21天等；周二依次为 +1天、+8天...严格排布至整个 ${totalWeeks} 周（${endDateStr}）范围内！
   - 对于长周期（如 3 个月/12 周 / 4 周）：
     * 阶段性进阶排期：按阶段清晰排布（例如：【第1月/第1~4周·燃脂启动与自重适应期】、【第2月/第5~8周·肌耐力与负荷强化期】、【第3月/第9~12周·线条雕刻与间歇冲刺期】），每个阶段每周安排清晰对应的训练任务！
     * 渐进式超负荷：根据用户在文本中提到的要求（如“每周慢慢加次数或重量”、“自重多次数压体脂雕刻线条”），在不同周次或阶段中，子动作的组数、次数、时长逐步进阶递增，并在 notes 中注明该阶段的进阶要点！
2. 【复合日程智能展开】：
   - 若某句话中提到多个天（例如“周二周四周六选一天做40分钟快走或慢跑，剩下两天做15分钟全身激活”），请将其智能展开拆解为对应周几的具体独立任务！
3. 【任务标题与子任务】：
   - 主任务标题 title 必须精炼有力且包含阶段或周次（例如：“第1周·周一：自重胸部进阶训练” 或 “第5周·周一：胸肌强化 (增次数)”）。
   - 将每个任务包含的具体动作、步骤拆解为 subtasks 数组，清洗掉“接”、“然后”、“最后”等口语连词，并合理预估每个子步骤的分钟数（estimated_minutes）。
   - 主任务的 estimated_minutes 为各子步骤用时之和。
   - 提取组间歇、动作要领作为 notes。
4. 【输出规范】：
   - 必须严格且仅输出标准 JSON 数组，严禁任何前言、解释或 Markdown 代码块外壳。

示例输出格式：
[
  {
    "title": "第1周·周一：自重胸部燃脂雕刻 (适应期)",
    "due_date": "${targetMondayStr}",
    "priority": "p2",
    "project_id": "${defaultProjectId}",
    "estimated_minutes": 70,
    "notes": "第一阶段适应期，组间歇60秒，动作标准到位",
    "subtasks": [
      { "title": "标准俯卧撑4组×15次", "estimated_minutes": 16 },
      { "title": "窄距俯卧撑3组×12次", "estimated_minutes": 12 },
      { "title": "跪姿夹胸俯卧撑3组×18次", "estimated_minutes": 12 },
      { "title": "原地高抬腿30分钟", "estimated_minutes": 30 }
    ]
  }
]`,
              },
              {
                role: 'user',
                content: `请帮我将以下内容智能拆解为任务列表：\n${text}`,
              },
            ],
          }),
        })

        const data = await response.json()
        if (data.choices && data.choices[0]?.message?.content) {
          let content = data.choices[0].message.content.trim()
          if (content.startsWith('```')) {
            content = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
          }
          const parsed = JSON.parse(content)
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map((item: any) => ({
              title: String(item.title || item.name || '').trim(),
              due_date: String(item.due_date || targetMondayStr),
              priority: item.priority || 'p2',
              project_id: item.project_id || defaultProjectId,
              estimated_minutes: Number(item.estimated_minutes) || 30,
              notes: item.notes || '',
              engine: 'ai',
              subtasks: Array.isArray(item.subtasks)
                ? item.subtasks.map((st: any) => ({
                    title: String(st.title || st.name || '').trim(),
                    estimated_minutes: Number(st.estimated_minutes) || 15,
                  })).filter((st: any) => st.title.length > 0)
                : [],
            }))
          }
        }
      } catch (err) {
        console.error('AI smartParseTasks API Error, falling back to local heuristic parser:', err)
      }
    }

    return smartLocalTextParser(text, baseWeek, defaultProjectId, detectedScope)
  })

  // AI Connection Test
  ipcMain.handle('ai:testConnection', async (_, { apiKey, baseUrl, model }) => {
    if (!apiKey) return { success: false, error: '缺少 API Key，请先输入密钥' }
    const start = Date.now()
    try {
      const response = await fetch(`${baseUrl || 'https://api.deepseek.com/v1'}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'deepseek-chat',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5,
        }),
      })
      const latency = Date.now() - start
      if (!response.ok) {
        const errText = await response.text()
        return { success: false, error: `HTTP ${response.status}: ${errText.slice(0, 150)}` }
      }
      return { success: true, latency }
    } catch (err: any) {
      return { success: false, error: err.message || '网络连接超时或地址不可达' }
    }
  })

  ipcMain.on('tray:updateTitle', (_, title) => {
    if (tray) {
      tray.setTitle(` ${title}`)
    }
  })

  // DevTools IPC Handler
  ipcMain.handle('app:openDevTools', () => {
    if (win) {
      if (win.webContents.isDevToolsOpened()) {
        win.webContents.closeDevTools()
      } else {
        win.webContents.openDevTools({ mode: 'detach' })
      }
    }
  })
})
