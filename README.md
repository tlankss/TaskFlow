# TaskFlow — 开发人员与 AI 快速识别全景架构文档

本文档专为**人类开发人员 (Developers)** 与 **AI 编码助手 (AI Agents)** 设计，旨在提供代码库结构、进程架构、数据模型、IPC 通信机制、视图状态机及变更规范的唯一权威索引。后续所有功能改动与架构演进需同步更新本文档。

---

## 目录 (Table of Contents)

1. [项目概览与技术栈选型](#一-项目概览与技术栈选型)
2. [进程模型与架构设计](#二-进程模型与架构设计)
3. [云端后端与鉴权架构 (Supabase BaaS)](#三-云端后端与鉴权架构-supabase-baas)
4. [核心用户流程与状态机 (User Journey Flow)](#四-核心用户流程与状态机-user-journey-flow)
5. [代码目录与模块映射表 (Sitemap)](#五-代码目录与模块映射表-sitemap)
6. [IPC 事件通讯注册表 (IPC Registry)](#六-ipc-事件通讯注册表-ipc-registry)
7. [数据模型与 Schema 规范 (Data Schemas)](#七-数据模型与-schema-规范-data-schemas)
8. [AI 与开发人员二次开发规范](#八-ai-与开发人员二次开发规范)

---

## 一、 项目概览与技术栈选型

* **项目名称**: TaskFlow
* **核心定位**: 白领专属 AI 监督与周报型 Mac 桌面任务管理工具 (Local-First + 云端同步)
* **应用类型**: macOS 原生体验 Desktop App (Frameless + Glassmorphism Vibrancy)
* **核心技术栈**:
  * **主框架**: Electron 32 (Node.js 运行时 + Chromium 渲染器)
  * **构建工具**: Vite 5 + `vite-plugin-electron` (支持 ESM 与 HMR 热更新)
  * **前端 UI**: React 18 + TypeScript + Tailwind CSS 3 + Lucide Icons
  * **云端 BaaS / 鉴权**: Supabase (`@supabase/supabase-js` - Postgres + Auth + RLS 行级安全)
  * **动画与微交互**: Framer Motion + `canvas-confetti` (完成粒子特效)
  * **本地数据持久化**: Node 异步文件引擎与本地数据库 (`electron/db.ts` $\rightarrow$ `taskflow_data.json`)

---

## 二、 进程模型与架构设计

```mermaid
graph TD
    subgraph Cloud Backend [Supabase 云端 BaaS]
        SupaAuth[Supabase Auth - 邮箱/密码]
        SupaDB[(Postgres - public.tasks 表 + RLS)]
    end

    subgraph Electron Main Process [主进程 (Node.js Context)]
        Main[main.ts - 窗口与生命周期]
        DB[db.ts - 本地 JSON/SQLite 存储引擎]
        Tray[Tray - macOS 顶部菜单栏]
        Shortcut[globalShortcut - Opt+Space 唤起]
        AI[AI Engine - 职场角色感知的周报生成 IPC]
    end

    subgraph Preload Bridge [隔离桥接层]
        Preload[preload.ts - contextBridge API]
    end

    subgraph Renderer Process [渲染进程 (Chromium Context)]
        App[App.tsx - 全局状态机与路由]
        Sidebar[Sidebar.tsx - 视角导航与用户底栏]
        SyncEngine[src/lib/supabase.ts - 认证与双向防抖同步]
        
        subgraph View Components [视图组件层]
            ListView[TaskItem.tsx - 极简列表 + 一键流转 Today]
            KanbanView[KanbanView.tsx - 3列看板]
            MatrixView[MatrixView.tsx - 四象限矩阵]
            CalendarView[CalendarView.tsx - 月历网格]
            AnalyticsView[AnalyticsView.tsx - 生产力看板]
            CompletedView[CompletedArchiveView.tsx - 已完成归档战报]
        end

        subgraph Overlay Modals & User Module [模态弹窗与用户模块层]
            TaskModal[TaskModal.tsx - 任务新建/编辑 + 日期预设]
            AIReportModal[AIReportModal.tsx - AI周报生成器]
            CommandPalette[CommandPalette.tsx - Cmd+K 命令面板]
            FocusTimer[FocusTimerBar.tsx - 专注监督条]
            UserProfileModal[UserProfileModal.tsx - 登录/注册/云端双向同步/勋章]
            UserAvatarButton[UserAvatarButton.tsx - 侧边栏用户卡片]
        end
    end

    SyncEngine <-->|HTTPS REST| SupaAuth
    SyncEngine <-->|增量 Upsert / Pull 防抖同步| SupaDB
    Main <-->|IPC Handlers| Preload
    Preload <-->|window.electronAPI| App
    Main -->|FileSystem| DB
    Main -->|Tray Title Update| Tray
```

---

## 三、 云端后端与鉴权架构 (Supabase BaaS)

### 1. 架构原则：Local-First (本地优先)
* 离线可用：无论网络断开还是弱网，用户创建、勾选、删除任务均直接在本地完成（毫秒级）。
* 后台静默防抖同步（3秒）：用户完成、新建、流转任务后，自动静默同步至 Supabase 云端 `tasks` 表。

---

## 四、 核心用户流程与状态机 (User Journey Flow)

### 1. 晨间开工与任务一键流转
* **Inbox $\rightarrow$ Today 瞬时流转**：悬浮在任务卡片上，点击 `☀️` 即可直接纳入 Today，点击 `📥` 即可移回 Inbox，无需打开弹窗。
* **晨间规划条 (Morning Routine)**：当 Today 任务不足 3 项时，顶部自动出现晨间引导条，一键跳转 Inbox 挑选。

### 2. 专注计时与状态机联动
* 点击任务卡片上的 `Play` 开启计时时，任务状态自动由 `todo` 变更为 `in_progress`；
* 暂停时恢复为 `todo`；完成时变更为 `completed`；
* 计时器每秒通过 IPC 同步至 Mac 顶部 Status Bar。

---

## 五、 代码目录与模块映射表 (Sitemap)

| 文件路径 | 进程层级 | 核心职责与功能描述 | AI 识别标签 |
| :--- | :--- | :--- | :--- |
| `src/lib/supabase.ts` | Renderer | Supabase 认证客户端：提供 `signUpWithEmail`、`signInWithEmail`、`syncTasksWithCloud` 等方法 | `#Supabase` `#Auth` `#SyncEngine` |
| `src/components/TaskItem.tsx` | Renderer | 单个任务卡片：支持一键纳入 Today、开启专注、推进中状态展示与动效 | `#TaskCard` `#TaskItem` `#TodayToggle` |
| `electron/main.ts` | Main Process | 主窗口创建、毛玻璃效果、全局快捷键绑定、Tray 菜单栏常驻、支持 UserRole 的 AI 周报生成 | `#MainProcess` `#Electron` `#Window` `#Tray` |
| `electron/preload.ts` | Preload Bridge | 使用 `contextBridge.exposeInMainWorld` 暴露安全 API `window.electronAPI` | `#Preload` `#ContextBridge` `#IPC` |
| `electron/db.ts` | Main Process | 本地持久化引擎：管理任务、项目、用户配置 `userProfile` | `#Database` `#Storage` `#UserProfile` |
| `src/components/UserProfileModal.tsx` | Renderer | 个人中心模态框：支持 Supabase 真实邮箱注册/登录、明文/密文 Key 查看、云端双向同步 | `#UserProfileModal` `#CloudSync` `#AuthModal` |
| `src/components/UserAvatarButton.tsx` | Renderer | 侧边栏底部常驻用户卡片（显示联机状态、头像、角色头衔） | `#UserAvatar` `#SidebarBottom` |
| `src/components/TaskModal.tsx` | Renderer | 任务创建/编辑模态弹窗，包含【任务存储归属 (Inbox/Today/指定日期)】、日期预设 | `#TaskModal` `#Form` `#DatePicker` |
| `src/components/CalendarView.tsx` | Renderer | 月历网格视图，按 `due_date` 归类任务并根据项目色块标记，支持点击日期排期 | `#CalendarView` `#MonthGrid` |
| `src/components/KanbanView.tsx` | Renderer | 3 列式看板视图 (To Do / In Progress / Completed) | `#KanbanView` `#KanbanBoard` |
| `src/components/MatrixView.tsx` | Renderer | 4 象限 Eisenhower 矩阵视图 (P1 紧急重要 -> P4 低优) | `#EisenhowerMatrix` `#QuadView` |
| `src/components/AnalyticsView.tsx` | Renderer | 生产力数据看板，统计专注总用时、完成交付率、项目消耗占比及状态评估 | `#Analytics` `#ProductivityDashboard` |
| `src/components/CompletedArchiveView.tsx` | Renderer | 已完成任务专属归档战报，按【今天/昨天/更早】时间线沉淀成果 | `#ArchiveView` `#CompletedTasks` |
| `src/components/AIReportModal.tsx` | Renderer | AI 智能周报总结弹窗，感知岗位头衔生成专属职场汇报 | `#AIWeeklyReport` `#RoleTitleAI` |

---

## 六、 IPC 事件通讯注册表 (IPC Registry)

| Channel / 方法名 | 传输方向 | 传递参数 | 返回数据 | 业务功能 |
| :--- | :--- | :--- | :--- | :--- |
| `db:getTasks` | Renderer $\rightarrow$ Main | 无 | `Promise<Task[]>` | 获取全量本地任务列表 |
| `db:addTask` | Renderer $\rightarrow$ Main | `Partial<Task>` | `Promise<Task>` | 创建并保存新任务到本地数据库 |
| `db:updateTask` | Renderer $\rightarrow$ Main | `id: string, updates: Partial<Task>` | `Promise<Task \| null>` | 修改指定 ID 任务属性或状态 |
| `db:deleteTask` | Renderer $\rightarrow$ Main | `id: string` | `Promise<boolean>` | 删除指定 ID 任务 |
| `db:getUserProfile` | Renderer $\rightarrow$ Main | 无 | `Promise<UserProfile>` | 获取当前用户个人资料与职场头衔 |
| `db:updateUserProfile`| Renderer $\rightarrow$ Main | `Partial<UserProfile>` | `Promise<UserProfile>` | 更新用户资料（昵称、角色头衔、云同步配置） |
| `db:getUserStats` | Renderer $\rightarrow$ Main | 无 | `Promise<UserStats>` | 获取用户打卡天数、专注时长与已解锁勋章 |
| `ai:generateWeeklyReport` | Renderer $\rightarrow$ Main | `{ apiKey?, baseUrl?, tasks, userRole? }` | `Promise<string>` | 感知岗位头衔，生成专业 Markdown 职场周报 |
| `tray:updateTitle` | Renderer $\rightarrow$ Main (Send) | `title: string` | `void` | 实时更新 macOS 顶部菜单栏图标后文案 |

---

## 七、 数据模型与 Schema 规范 (Data Schemas)

### 1. UserProfile 数据模型 (`UserProfile`)
```typescript
export interface UserProfile {
  id: string                   // 用户 UUID
  name: string                 // 姓名 / 昵称
  email: string                // 登录邮箱
  avatar_url?: string          // 头像 URL / Base64
  role_title: string           // 职场角色头衔 (例如: 高级产品专家 / 技术架构师)
  plan: 'free' | 'pro' | 'team'// 账户方案类型
  sync_enabled: boolean        // 是否开启多设备云端自动同步
  last_synced_at?: string      // 上次成功云同步 ISO 时间戳
}
```

---

## 八、 微信绿色主题色与深浅模式系统 (WeChat Theme & Dark/Light Mode)

### 1. 颜色规范 (Color Tokens)
TaskFlow 采用**微信经典主题色系**，深度适配 macOS 原生毛玻璃背景与视窗层级：
* **主品牌色 (WeChat Green)**: `#07C160` (主按钮、活动导航条目、Checkbox选中态、高光指标)
* **绿色悬停态 (Hover)**: `#06AD56`
* **绿色激活态 (Active)**: `#059B4D`
* **绿色高亮微光 (Soft Glow)**: `rgba(7, 193, 96, 0.12)` 或 `bg-[#07C160]/15`
* **浅色模式背景 (Light Background)**:
  * 页面主底色: `#EDEDED` (微信 Mac 客户端标准底色)
  * 内容区表面: `#F7F7F7`
  * 侧边栏底色: `#F5F5F5`
  * 任务卡片/弹窗背景: `#FFFFFF`
  * 主文字 / 次级文字: `#191919` / `#7F7F7F`
* **深色模式背景 (Dark Background)**:
  * 页面主底色: `#111111`
  * 内容区表面: `#141414`
  * 侧边栏底色: `#181818`
  * 任务卡片/弹窗背景: `#1E1E1E`
  * 主文字 / 次级文字: `#EDEDED` / `#8D8D8D`

### 2. 深浅模式切换架构
* **存储介质**: `localStorage.getItem('taskflow_theme')`，可选值为 `'light' | 'dark' | 'system'`（默认跟随系统）。
* **DOM 响应**: 通过在 `document.documentElement` (`<html>`) 增删 `dark` 类名，配合 Tailwind `darkMode: 'class'` 实现全应用瞬时响应。
* **快速入口**:
  1. 顶部 Header 快捷切换按钮（太阳 / 月亮 / 屏幕图标快速轮转）。
  2. 个人中心设置弹窗（包含“浅色模式 / 深色模式 / 跟随系统”三组一键选择）。

---

## 九、 AI 与开发人员二次开发规范

1. **环境配置规范**: 在根目录 `.env` 或应用 UI 设置中维护 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`。客户端仅使用 Publishable / Anon Key。
2. **防抖同步规范**: 对任务的频繁变动（如连续切换勾选），统一使用 `triggerDebouncedCloudSync` 进行 3 秒防抖处理，避免对 Supabase 发起高频请求。
3. **颜色样式规范**: 界面主动作、确认按钮、勾选状态请统一复用 `wechat.green` (`#07C160`) 与对应 Hover/Active 色，避免引入非微信主题体系的色彩杂质。
4. **代码变更关联文档更新**: 任何对云端表结构、本地 Schema、主题系统或 IPC 接口的改动，**必须同步修改 README.md 本文档**。

