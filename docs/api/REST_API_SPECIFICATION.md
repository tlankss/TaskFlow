# TaskFlow 企业级 RESTful API 协议规范与接口契约文档

> **版本**：v1.0.0  
> **协议版本**：1.0.0 (`X-Api-Version: 1.0.0`)  
> **基准路径**：`https://<project-ref>.supabase.co/rest/v1`  
> **适用终端**：Electron 桌面端 (macOS / Windows)、Web 网页端、Mobile 移动端  
> **最后更新**：2026-09-27  

---

## 1. 协议规范 (Protocol Specifications)

### 1.1 传输层与安全通道
- **强制 HTTPS**：所有 API 请求必须使用 TLS 1.2+ 加密通道，禁止明文 HTTP 传输。
- **编码格式**：全量请求与响应均采用 `UTF-8` 字符集编码。
- **媒体类型**：
  - 默认请求体与响应载荷：`application/json`
  - 二进制存储传输（书籍原书）：`multipart/form-data` 或标准二进制流（如 `application/epub+zip`、`application/pdf`）。

### 1.2 标准 HTTP 请求动词语义
| HTTP Verb | 语义说明 | 幂等性 | 典型应用场景 |
| :--- | :--- | :---: | :--- |
| **GET** | 安全获取资源列表或详情 | 是 | 获取任务列表、单书详情、拉取增量切片 |
| **POST** | 创建新资源或执行非幂等操作 | 否 | 新增任务、上传原书二进制、批量导入 |
| **PUT** | 完整覆盖/替换目标资源 | 是 | 全量更新书籍或计划元数据 |
| **PATCH** | 部分字段增量更新 | 否/视实现 | 任务勾选完成、更新阅读进度页码 |
| **DELETE** | 移除资源（物理删除或软标记） | 是 | 删除书籍及关联 Storage、清除排期 |

### 1.3 标准请求头规范 (Standard Request Headers)
每一个发往云端接口的 HTTP 请求均要求携带以下标准化头信息：

```http
Content-Type: application/json
Accept: application/json
Authorization: Bearer <JWT_ACCESS_TOKEN>
apikey: <SUPABASE_ANON_KEY>
X-Api-Version: 1.0.0
X-Request-Id: req_9a8f2c1b4e5d6a7b
X-Client-Platform: electron-desktop
```

- `X-Request-Id`：前端随机生成的 16 位或 32 位唯一链路追踪 ID，贯穿请求发起、网络拦截、服务端日志与错误排查。
- `X-Api-Version`：客户端所声明遵循的接口协议版本，服务端基于此提供平滑向后兼容。
- `X-Client-Platform`：客户端载体（`electron-desktop` / `web` / `mobile`）。

---

## 2. 统一响应模型 (Unified Response Envelope)

所有业务接口（包含成功响应与异常处理）均封装为严格一致的 JSON 信封结构，杜绝字段混乱与不可预期的输出格式：

```typescript
export interface ApiResponse<T = any> {
  code: number          // 业务状态码 (20000 为成功，非 20000 见全局错误码表)
  success: boolean       // 明确成败布尔标识
  data: T               // 泛型业务数据载荷 (出错误时为 null)
  message: string        // 友好中文提示说明
  timestamp: number     // 响应毫秒级时间戳 (Unix Epoch ms)
  requestId: string     // 链路追踪 Request ID (与请求头回传一一对应)
  version: string       // API 契约协议版本 (固定为 'v1')
  error?: {             // 错误明细 (仅在 success 为 false 时提供)
    code: number
    message: string
    details?: any
    field?: string
    hint?: string       // 自愈建议或修复指引
  }
}
```

### 2.1 成功响应范例 (200 OK)
```json
{
  "code": 20000,
  "success": true,
  "data": {
    "id": "t_1727429182001",
    "title": "阅读《金钱心理学》第 1 章",
    "status": "todo",
    "priority": "p1",
    "estimated_minutes": 30,
    "actual_minutes": 0,
    "is_today": true,
    "created_at": "2026-09-27T08:00:00.000Z",
    "updated_at": "2026-09-27T08:00:00.000Z"
  },
  "message": "任务创建成功",
  "timestamp": 1727429182345,
  "requestId": "req_8f1a23c091be4f",
  "version": "v1"
}
```

### 2.2 失败响应范例 (400 Bad Request / 403 Forbidden)
```json
{
  "code": 40301,
  "success": false,
  "data": null,
  "message": "操作被安全策略拦截 (Row Level Security 校验未通过)",
  "timestamp": 1727429182390,
  "requestId": "req_8f1a23c091be4f",
  "version": "v1",
  "error": {
    "code": 40301,
    "message": "new row violates row-level security policy",
    "hint": "请确保已登录对应账户，且 Supabase 已配置 UPDATE 行级安全策略"
  }
}
```

---

## 3. 全局错误码体系 (Error Code Registry)

错误码采用标准 5 位分段数字设计，首三位对齐 HTTP Status 语义，后两位代表具体业务细分场景：

| 错误码 | 错误枚举 | HTTP 映射 | 中文解释说明 | 客户端自愈策略与处理建议 |
| :--- | :--- | :---: | :--- | :--- |
| **`20000`** | `SUCCESS` | 200 | 请求成功处理 | 正常消费 `data` 载荷 |
| **`40000`** | `BAD_REQUEST` | 400 | 请求参数格式错误 | 检查请求 Body 格式与 URL 参数 |
| **`40001`** | `VALIDATION_FAILED` | 400 | 必填字段缺失或格式校验未通过 | 提示用户修正表单对应输入字段 |
| **`40002`** | `INVALID_ID_FORMAT` | 400 | 资源 ID 格式不合规 | 检查传入的 UUID 或自定义 ID |
| **`40003`** | `PAYLOAD_TOO_LARGE` | 413 | 传输体积超出上限 (如超大 EPUB) | 提示用户压缩文件或选用小于 100MB 电子书 |
| **`40100`** | `UNAUTHORIZED` | 401 | 未检测到有效用户会话 | 唤起登录弹窗，引导用户登录云端账号 |
| **`40101`** | `INVALID_CREDENTIALS` | 401 | 账号或密码不匹配 | 提示用户重新核对密码或使用忘记密码 |
| **`40102`** | `EMAIL_NOT_CONFIRMED` | 401 | 注册邮箱尚未完成激活链接确认 | 提示前往邮箱点击确认邮件 |
| **`40103`** | `SESSION_EXPIRED` | 401 | 登录凭据失效已过期 | 清除本地旧 Session，触发重新登录 |
| **`40104`** | `CONFIG_MISSING` | 401 | 本地未配置 Supabase URL 或 Key | 引导用户在个人设置中配置连接信息 |
| **`40300`** | `FORBIDDEN` | 403 | 拒绝访问 | 检查当前操作主体权限 |
| **`40301`** | `RLS_POLICY_VIOLATION`| 403 | 触发 Supabase 行级安全策略拦截 | 客户端触发自动先删后插降级或补齐 SQL UPDATE 策略 |
| **`40302`** | `STORAGE_ACCESS_DENIED`| 403 | 云端 Storage 存储桶读写权限受限 | 确保存储桶配置为 public 且包含 INSERT/UPDATE 策略 |
| **`40400`** | `NOT_FOUND` | 404 | 目标资源不存在 | 更新本地视图，移除已不存在的废弃条目 |
| **`40401`** | `TASK_NOT_FOUND` | 404 | 指定任务已从云端移除 | 同步本地状态为已删除 |
| **`40402`** | `BOOK_NOT_FOUND` | 404 | 指定书籍已从书库移除 | 提示书籍已被彻底清理 |
| **`40403`** | `PLAN_NOT_FOUND` | 404 | 指定阅读计划不存在 | 刷新阅读排期面板 |
| **`40405`** | `BUCKET_NOT_FOUND` | 404 | 云端 `books` 存储桶未建立 | 系统自动尝试调用 createBucket 兜底创建 |
| **`40900`** | `CONFLICT` | 409 | 资源状态冲突 | 重新拉取最新数据后再提交变更 |
| **`40901`** | `USER_ALREADY_EXISTS` | 409 | 该邮箱账号已被注册 | 引导用户直接前往登录 |
| **`40902`** | `RESOURCE_ALREADY_EXISTS`| 409 | 资源或文件已存在 | 自动切换为覆盖写入模式 |
| **`42900`** | `RATE_LIMIT_EXCEEDED`| 429 | 请求频次过密触发挥发保护 | 前端退避重试（Exponential Backoff） |
| **`50000`** | `INTERNAL_SERVER_ERROR`| 500 | 云端后端处理异常 | 捕获异常，记录错误日志并反馈开发团队 |
| **`50001`** | `NETWORK_ERROR` | 502/504 | 网络不可达或断网 | 开启离线模式，本地优先读写，恢复后自动同步 |
| **`50003`** | `SCHEMA_NOT_INITIALIZED`| 500 | 远端缺少对应表结构或字段 | 提示用户在 Supabase 控制台执行 SQL 迁移 |

---

## 4. 安全规范与行级隔离 (Security & Multitenancy)

### 4.1 多租户行级安全 (Row-Level Security)
TaskFlow 在云端 PostgreSQL 数据库强制启用 RLS。每一个业务数据表均将 `user_id` 作为核心隔离分区字段：
```sql
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own tasks" ON tasks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```
- **越权防御**：客户端即使尝试传入他人数据 ID 进行篡改，数据库引擎将从内核层直接拒绝，返回 `42501 (RLS Policy Violation)`。
- **安全沙箱存储**：Storage 书籍二进制存储采用沙箱化前缀路径：`${auth.uid()}/${bookId}.${safeExt}`，完全阻绝跨用户目录遍历（Directory Traversal）攻击。

---

## 5. 核心 RESTful 资源接口契约 (Endpoint Registry)

### 5.1 任务清单资源 (`/v1/tasks`)

#### 5.1.1 获取任务分页列表
- **路由**：`GET /v1/tasks`
- **入参 (Query Parameters)**：
  - `page` (number, 可选, 默认 1): 当前页码
  - `pageSize` (number, 可选, 默认 20, 上限 100): 单页条数
  - `status` (string, 可选): `todo` | `in_progress` | `completed`
  - `projectId` (string, 可选): 项目分类 ID
  - `keyword` (string, 可选): 标题模糊检索词
- **响应载荷**：`PaginationResult<Task>`

#### 5.1.2 创建任务
- **路由**：`POST /v1/tasks`
- **请求体 (Body)**：`Task` 对象完整字段
- **响应载荷**：新增成功后的持久化 `Task` 实体

#### 5.1.3 更新任务
- **路由**：`PATCH /v1/tasks/:id`
- **请求体 (Body)**：`Partial<Task>`（仅需传输更新字段，支持防抖聚合）
- **响应载荷**：更新后的 `Task` 实体

#### 5.1.4 软删除任务
- **路由**：`DELETE /v1/tasks/:id`
- **语义说明**：标记 `is_deleted = true` 并刷新 `updated_at`，确保多端增量对账能感知到删除事件。

#### 5.1.5 任务层轻量极速增量同步
- **路由**：`GET /v1/tasks/delta`
- **入参**：`lastSyncTimestamp` (ISO 8601 时间戳，可选)
- **核心优势**：单次 HTTP 请求即可完成全部变更拉取，启动 0 冗余开销。
- **响应载荷**：
  ```typescript
  {
    upsertedTasks: Task[]       // 新增或更新的任务条目
    deletedTaskIds: string[]    // 自上次同步以来软删除的任务 ID 集合
    allActiveTaskIds?: string[] // 当前云端有效存活任务 ID（用于物理一致性对账）
    newSyncTimestamp: string    // 本次同步锚点时间戳
  }
  ```

---

### 5.2 书籍与书库资源 (`/v1/books`)

#### 5.2.1 获取书库列表
- **路由**：`GET /v1/books`
- **入参**：`page`, `pageSize`, `keyword` (搜索书名/作者), `sortBy`, `sortOrder`
- **响应载荷**：`PaginationResult<Book>`

#### 5.2.2 创建书籍
- **路由**：`POST /v1/books`
- **请求体**：`Book` 元数据（含章节、导读结构等）
- **响应载荷**：`Book`

#### 5.2.3 物理彻底删除书籍
- **路由**：`DELETE /v1/books/:id`
- **级联语义**：
  1. 从 `books` 关系表中真实彻底删除；
  2. 级联清除 `reading_plans` 关联排期记录；
  3. 联动清理 Supabase Storage 中关联的原书二进制文件。

#### 5.2.4 上传书籍原文件二进制
- **路由**：`POST /v1/books/:id/storage`
- **内容类型**：`multipart/form-data`
- **安全路径**：`${user.id}/${bookId}.${safeExt}`
- **自愈机制**：若遇到云端远端缺失 UPDATE 行级策略时，自动调用底层 DELETE 清理旧文件并执行全量重建，保证 100% 写入成功。

---

### 5.3 阅读计划资源 (`/v1/reading-plans`)

#### 5.3.1 获取阅读排期列表
- **路由**：`GET /v1/reading-plans`
- **入参**：`bookId` (按书籍过滤), `status` (`active` | `completed` | `paused`)
- **响应载荷**：`PaginationResult<ReadingPlan>`

#### 5.3.2 创建阅读排期
- **路由**：`POST /v1/reading-plans`
- **请求体**：包含 `schedule` 每日计划切片的 `ReadingPlan`

#### 5.3.3 阅读层按需增量同步
- **路由**：`GET /v1/reading/delta`
- **按需加载原则**：仅在用户切换至“阅读”视图模块时才发起请求，首屏刷新完全不请求阅读接口，大幅优化系统首屏响应速度。

---

## 6. 性能设计与离线高可用 (Performance & High Availability)

1. **接口分级与按需加载**：
   - 清单主模块（`tasks`）与阅读子模块（`books` + `reading_plans`）物理拆分。
   - 首页加载仅需 1 个增量查询，带宽开销 < 2KB，耗时 < 100ms。
2. **Session 内存即时缓存 (Zero Network Cost Auth)**：
   - 采用 `getAuthUser` 优先从客户端本地缓存读取当前用户身份，消除高频无效的 `/auth/v1/user` 网络请求风暴。
3. **批量原子分块处理 (Chunking Batch)**：
   - 批量新增任务限制单包 50 条，批量删除单包 100 条，杜绝 URL 超长或 Payload 膨胀。
4. **客户端更新防抖合并 (Debounced Mutation)**：
   - 200ms 内对同一实体的连续微调（如拖拽、重命名、勾选）自动合并为单次 PATCH 请求。
5. **离线优先设计 (Offline First)**：
   - 当检测到离线状态或网络超时，自动无缝降级为本地持久化引擎（Electron SQLite / LocalStorage），网络恢复后通过时间戳增量对账自愈合并。

---

## 7. 契约兼容性保障 (Backwards Compatibility)

- **动态 Schema 探测**：通过 `detectRemoteSchema` 预先探测远端字段兼容性。若云端暂未执行扩展 SQL（如缺失 `reading_meta` 列），系统将自动降维剔除该字段，保障核心待办清单不受影响。
- **存储路径双轨兼容**：下载原书时优先检索新版标准路径 `${user.id}/${bookId}.${safeExt}`，若未命中则自动平滑回退匹配旧版包含书名的文件名路径，确保老用户历史书籍无缝阅读。
