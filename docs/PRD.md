# Job Hub｜求职信息聚合与执行 Web App

> PRD & Implementation Baseline  
> Version: V0.1  
> Date: 2026-08-30  
> Status: Ready for implementation  
> Owner: Product Owner  
> Implementation partner: Cursor

---

## 0. 文档用途

本文件是 Job Hub 的产品与开发基线。产品目标、V0 范围、字段语义、技术边界、验收标准与交付顺序均以本文件为准。

长期维护分工：

- `docs/PRD.md`：产品逻辑、范围、页面、数据模型、技术架构、验收标准。
- `AGENTS.md`：Cursor 的长期开发规则。
- Google Sheet `Channel Sheet`：持续变化的渠道清单、搜索配置、验证状态与研究数据。
- 本地 SQLite：V0 应用运行时数据；通过 repository interface 保留后续 PostgreSQL / Supabase 迁移能力。

需求发生变化时，以当前版本为母版，只修改受影响章节，并同步检查字段、接口、页面、自动化与验收标准。

---

## 1. Product Summary

Job Hub 是一个个人求职信息聚合与执行中心。它把分散在通用招聘平台、垂直渠道、公司官网、ATS、公开分享者和社群中的岗位，汇总成一个低噪音、可筛选、可追踪的 Job Pool。

V0 核心链路：

`Collect → Discover → (Dismiss/Excluded | Save | Reference | Start Application → Draft → Mark Submitted → Applied → Interview → Offer → Closed)`

Save 与 Reference 是独立 boolean，可与 Application 共存。Applied / Interview / Offer / Closed 只出现在 Application。Closed 即历史。系统不出现 Rejected、Under Study、用户可见 To Do。

主导航：**Collect Jobs · Discover · Applications · Tasks · Materials**。

V0 完成后，用户可以在一个页面完成四件事：

1. 查看今天或某日期之后新增的岗位。
2. 按 Market、Channel、Keyword、engagement 筛选。
3. 打开原始岗位页完成申请或沟通。
4. 保存岗位、下一步、备注与 Reference；投递生命周期在 Application。

AI Match、Agent、完整 Trust Engine、自动投递和多轮沟通管理均作为后续独立模块。

---

## 2. Problem Statement

### 2.1 信息发现

求职信息分散在多个平台。来源具有不同的数据结构、更新时间、登录要求、申请入口和沟通方式。通用平台噪音较高，垂直渠道和公司官网缺少统一聚合。

### 2.2 执行衔接

发现岗位后，还需要判断来源、回到正确入口、记录是否推进以及下一动作。单独的采集脚本、表格和招聘网站无法形成稳定闭环。

### 2.3 当前技术资产

- 已有本地项目 `mcp-jobs`，已完成 BOSS、猎聘、智联的多页采集、去重、筛选和导出尝试。
- 国内平台采集依赖本机浏览器、登录态或人工打开页面。
- 已有 `Channel Sheet`，保存渠道、关键词、筛选条件、优先级与技术状态。
- 已有 Job Hunting 岗位字段与状态语义，可作为迁移和兼容基线。

---

## 3. Goals

### 3.1 V0 Goals

1. 建立 CN / Global 共用的统一 Job 数据结构。
2. 跑通至少一条真实 CN 采集链与 Manual Import。
3. 支持规范化、去重、基础规则筛选和来源追溯。
4. 建立可真实使用的 Job Pool。
5. 支持回源申请、状态更新、Next Step、Comment 和 Reference。
6. 采集失败、登录失效和基础来源异常可见。
7. 保持 collector、pipeline、database 和 web app 松耦合。

### 3.2 V0 Success Definition

用户可以稳定完成：

`发现真实岗位 → 查看新增 → 基础筛选 → 判断是否推进 → 回到原渠道 → 更新状态`

完成该闭环后，V0 即可投入真实求职使用。

---

## 4. Non-goals

以下内容不进入 V0：

- Agent runtime 或自治求职 Agent。
- AI Match、CV/JD 深度分析和批量评分。
- Grok Cloud 或其他模型驱动的网页采集主链路。
- 跨平台自动提交、一键申请、ATS Autofill。
- 完整 Career Profile、简历版本和材料管理。
- 独立 Application history、Communication CRM、Recruiter Inbox。
- 自动发邮件、自动发送平台消息、自动 Follow-up。
- 完整 Threat Intelligence、Risk Registry 和安全事件系统。
- Channel Sheet 与数据库实时双向同步。
- 同时接入全部 CN / Global 渠道。
- 数据看板、投递漏斗和复杂统计。

---

## 5. Product Principles

1. **Configurable first**：Market、Channel、采集方式、筛选规则和回源动作通过配置扩展。
2. **Rules before AI**：地点、经验、外包、派遣和排除关键词先用确定性规则处理。
3. **Raw before normalized**：原始数据与规范化数据分层保存，支持回溯和重新处理。
4. **Return to source**：V0 将用户送到正确的原始入口完成申请和沟通。
5. **Actionable first**：前台优先展示能产生下一动作的信息。
6. **Idempotent automation**：重复运行不会制造大量重复岗位。
7. **Visible failure**：采集失败、登录失效、验证码和页面变化必须留下状态与原因。
8. **Human confirmation**：外部提交、发消息、付款和敏感信息操作保留人工确认。
9. **Replaceable adapters**：每个 collector 可独立替换，平台逻辑不进入核心 pipeline。
10. **One tracking source**：Web App 正式启用后，岗位状态只维护一份。

---

## 6. User and Usage Context

### 6.1 Primary User

单用户个人工具。V0 不设计团队、多租户、招聘方或管理员角色。

### 6.2 Runtime Context

- 开发：Windows 本地，Cursor。
- 国内采集：本机 Python / Playwright，复用浏览器登录态。
- Web App：本地运行；核心闭环稳定后再判断是否部署云端。
- Database：V0 使用 SQLite WAL；schema 与 migration 纳入 Git。
- Global public sources：后续通过 API、RSS、ATS adapter 或公开网页 collector 接入。

### 6.3 Access Control

- 本地开发阶段仅监听 localhost。
- 部署公网前必须增加单用户登录或访问保护。
- ingestion secret 与平台登录信息只允许出现在本机环境变量中。
- collector 写入使用独立 ingestion secret，不暴露在浏览器。

---

## 7. V0 Scope

### 7.1 Must Have

| 模块 | V0 要求 |
|---|---|
| Market | 支持 `CN` 与 `GLOBAL`，共用 Job schema |
| Channel | 从 Channel Sheet 手动导入或 seed 已启用渠道 |
| Collection | 接通至少一条现有 CN collector；保留 Manual Import |
| Raw Storage | 保存原始 payload、来源、采集时间与 run 信息 |
| Normalize | 把不同来源映射到统一 Job schema |
| Dedup | 同一岗位重复采集时只显示一条 Job，并保留多个来源 |
| Rule Filter | 支持地点、职能、经验、外包/派遣、排除关键词 |
| Job Pool | 支持 Today、Since Date、Market、Channel、Keyword、Engagement |
| Tracking | 支持 Save（favorite）、engagement、Next Step、Comment；投递状态在 Application |
| Return to Source | 支持 Open Source 与 Open Apply Page |
| Reference | 保存不申请但值得学习的岗位和备注 |
| Trust Gate | 来源可追溯、已知 Channel、基础 URL 检查、Review / Blocked |
| Failure State | 显示 collector run 的成功、部分成功、失败和原因 |
| Migration | 能导入现有岗位表的核心字段，不要求长期双写 |

### 7.2 Should Have

- 岗位详情侧栏或详情页。
- 批量更新 engagement / Next Step。
- 过滤原因可见。
- collection run 最近一次状态可见。
- CSV / JSONL 导入。
- 响应式桌面界面。

Should Have 不阻塞第一条端到端链路验收。

### 7.3 Later

- AI Match 与可解释评分。
- Grok / LLM public-web collector adapter。
- Global ATS adapters：Greenhouse、Lever、Ashby、Workable。
- RSS、公众号、自托管 WeRSS / WeWe RSS adapter。
- 独立 applications、communications、match_results。
- 自动 Channel Sheet 同步。
- 自动调度、通知和云端 collector。
- 完整 Trust Engine。

---

## 8. Information Architecture

V0 建立四个产品表面：

### 8.1 `/jobs`（Discover / Job Pool）

采集后的岗位。出现在此不代表用户要跟进。动作：Save（toggle）、Reference（toggle）、Open source、Start application、··· Dismiss。无 Start Review。卡片不显示 Next Step / DDL / task。默认 Current 隐藏 dismissed/excluded。Excluded 不占主栏，从 Filter / More 进入；可 Restore。被 auto-archive 的 excluded 仍出现在 Excluded。

顶栏筛选：All / Saved / Reference。更多 Filter：Source / Market / Date / Location。无 Active / To Do / Under Study / Discovery chips。

Discover More：Auto-archive excluded jobs，默认 OFF，After N days（可配置，默认 14）。仅 excluded/dismissed。

### 8.2 `/tasks`

真实动作队列。入列公式：`next_step OR deadline OR unfinished job_task OR Application.stage=draft`。Save-only / Reference-only / 普通 Discover 岗位不进入。默认分组：OVERDUE / TODAY / UPCOMING / NO DATE。无顶部时间 chips。筛选：Source、Market、Has Application Draft。

### 8.3 `/applications`

仅能通过 Start Application 创建 draft，必须绑定稳定 Job。阶段：draft | applied | interview | offer | closed。主栏默认 Open（search + filters）。Closed 与 `No update Nd+` 在 More 中。N 为用户可配置 idle days（默认 14）。idle-cleanup 开启后，所有 Applied 均可进入 Nd+，Interview / Offer 除外；用户可在申请级排除。Closed 立即保存，不要求 close_reason，无 Close modal。Draft→Applied 只能 Mark submitted。

列表保持表格。列：Role/Company（打开详情）、Stage、**Next step**（`Job.next_step`，空为 `—`；仅当 `Job.deadline` 有值时在下方显示 DDL）、Applied、**Materials**（当前 bindings 计数，默认可见：`No materials` / `1 material` / `N materials`，可排序筛选；点击打开详情 Materials tab）、Actions。Draft 行主按钮：已有 apply URL 则 `Open apply page`，否则已有 job/source URL 则 `Open source`，两者都不可用时显示 `Link missing` 并仍提供 Mark submitted；其余动作在 More。不要根据对话/邮箱/平台私信去猜测入口。页面说明只写 tracking applications / next steps，不写状态机教学文案。

详情为右侧抽屉（桌面约 720px，小屏全屏），不在表下展开整表。Tabs：`Overview / Materials / Notes`，默认 Overview。顶栏：Role、Company、Location、Stage、关闭、source action；Draft 另有次级 Mark submitted。

- Overview：source/link → Next Step / DDL（与 Tasks 相同的 Job 字段，PATCH `/api/jobs/{id}`）→ JD 来自 `Job.description`（缺失时写 “full JD not saved” 并给 Open source，不得把 snippet 标成全文）→ Applied 后显示最近一次 submission 摘要。`Job.comment` 为 JD 下可折叠 Research notes。`Application.notes` 只在 Notes tab，禁止与 comment 合并或双写。
- Materials：Linked materials（add / change version / remove，与今日相同）；Templates & answers 入口仅用于去 Knowledge copy；Submissions 只读冻结快照。Draft 强调当前 Linked materials。Applied+ 优先最近 submission 摘要；当前 bindings 仍可编辑，但标签必须区分 `Linked materials` 与 `Materials used in this submission`。
- Notes：`Application.notes` 为主；Communication notes 为可选折叠（现有 `application_comm_notes` 表）。

Deep link：`?id=` 即使不在当前页/筛选也必须打开（含 Closed）；`tab=packet` 映射到 Materials。关闭抽屉不得重置列表筛选、排序、分页或滚动。

所有 Mark submitted 入口共用同一个确认 **modal**（职位/公司 + **当前 bindings 只读预览**，即即将快照的内容）。确认框不提供另一套材料选择器；要改版本先改 Linked materials 再打开确认。有材料：Confirm submitted。空材料：显示「本次未记录材料」/ Record without materials，并走已实现的服务端 `confirm_empty`。Cancel 零写入。History 快照不随后续 binding 编辑而变。保留 idempotency_key / expected_version_ids / `materials_changed` 409（若已有）。**本轮不**增加可编辑 `submitted_at`、submit 时自由 channel、或独立于 bindings 的 `material_version_ids` picker。

显示时区默认 Asia/Shanghai（可复用已有 `NEXT_PUBLIC_APP_TZ` / `NEXT_PUBLIC_TIMEZONE`）。本轮无 Settings 页。

跨记录编辑（DBG-01/02）：notes、communication draft、next step、material notes、Knowledge 编辑器、SubmitConfirm 均按 record id 隔离。脏切换：Save and switch / Discard / Stay。切换申请须 abort 进行中的 fetch，失败显示 Retry 而不是空列表。保存失败时停留在当前记录并保留草稿（含 communication draft），标明失败项并提供 Retry；进行中的保存阻止再次保存、丢弃、切换与关闭。

本轮明确推迟：Knowledge「Use in application」搜索选择器扩容、全局 `border-border` vs `border-line` token 统一、从数据猜测 Open conversation / Copy email、把 materials 列藏到 More、Part3-after P0。

申请级 “exclude from idle cleanup” 放在 Detail 的折叠 More 中，不占主表行。

### 8.4 `/search`（Collect Jobs）

Keywords / location / sources / collect / import / presets。不在 Collect 里做 Save、Reference、Tasks 或 Application staging。

### 8.5 `/sources`

轻量来源与运行状态页。包含：

- 已启用 Channel。
- collection method。
- last checked / last run。
- success / partial / failed。
- 错误原因和恢复提示。

V0 不在此页面建设完整 Channel 编辑器。Channel Sheet 继续承担人工配置。

### 8.6 `/review`

只显示两类记录：

- 基础 Trust Gate 需要人工确认的来源或岗位。
- 去重结果存在明显歧义、无法安全自动合并的岗位。

无待处理内容时保持空状态，不制造通知。

### 8.7 `/materials`

两条独立车道：Materials 与 Application。Materials 不要求先有 Application。一行一个 Material：name、type、purpose、latest version、updated。Detail 展示版本列表与文件。Add material：name、type、Upload/Link；purpose / notes / version label 可选。Add version：Upload 或 Link，生成不可变版本；material 级字段不变；version purpose/notes 独立。库内新版本不会自动改已有申请 bindings；申请流里 Use version / Change version 才替换当前绑定。上传失败保留输入，重试不得因双击重复版本。

Files / Knowledge 两个 tab（默认 Files）。Knowledge：Message templates 与 Application answers（Answer Bank），轻量编辑器，持久化 `content.md` 版本，Copy；answers 可选 Add to Packet；软归档。无 Send / Log-as-sent / CRM / Need Reply / 主动推送。

Application 绑定 version，UNIQUE(application_id, material_id)。同一材料可绑到多个申请、使用不同版本。Draft 可以有材料，Applied 可以没有。Mark Submitted 从服务器 bindings 拍 submission snapshot（复制文件字节）；允许空材料（需确认 Record without materials / `confirm_empty`）。历史展示与下载永远读当次快照，不读最新版本。Cancel Draft 只清 bindings，library 与 submission history 保留。

---

## 9. Job Pool UX Requirements

### 9.1 Default View

- 默认打开 `Today`。
- 默认隐藏 dismissed / archived（Archive 是 Job 属性，不是 Closed）。
- 默认排序：To Do 优先，然后最近 DDL / 未完成 task due；否则 `discovered_at desc`。
- 默认展示新采集且未归档的岗位。

### 9.2 Job Card

每张卡片至少显示：

- title
- company
- location
- market
- published_at 或 discovered_at
- primary channel
- engagement（可空）
- Save（favorite）
- Next Step 摘要
- DDL 与未完成 task 芯片
- Open Source

### 9.3 Job Detail

至少显示：

- 完整 JD / description
- requirements 原文或提取结果
- 所有来源及链接
- source published time / collected time
- filter result 与 reasons
- trust state 与 reasons
- engagement、Save（favorite）、Next Step、Comment

### 9.4 Noise Control

V0 不展示 profile views、已读未回、浏览量、收藏量和无明确动作价值的平台信号。

---

## 10. Job Lifecycle

### 10.1 Save and Reference

Save（`favorite`）与 Reference（`reference`）都是独立 boolean。二者可以共存，也可以与 Application 共存。Dismiss 时必须清掉 Save 与 Reference。Restore 清除 `dismissed_at` **以及** auto-archive 标记（`archived_at` / `archive_reason`），然后重新跑规则筛选：符合则回 Current，否则进 Excluded 并带原因；不得从 Current 与 Excluded 同时消失。Applications 与 submission history 不变。

### 10.2 Engagement（legacy）

`engagement` 仅只读兼容。禁止再写入 `under_study` / `to_do`。历史 `engagement=reference` 迁移为 `reference=true` 且 `engagement=null`。Job **不**承载 Applied / Interview / Offer / Closed。

### 10.3 Dismiss / Excluded

Discovery 噪音。Dismiss 写入 dismissed_at 并进入 Excluded。Current 默认隐藏。Excluded 可 Restore。

### 10.4 Application

阶段仅：draft → applied → interview → offer → closed。Start Application 可从任意正常 Discover 岗位创建 draft。Draft→Applied 只能 Mark Submitted（服务器 snapshot + submitted_at / applied_date）。材料绑定不是阶段。Closed 立即保存，close_reason 可空，无 Close modal。放弃未投递 draft = 删除 Application。已投递不可硬删。Closed 后可 reopen（再 Mark submitted → Applied）。Interview/Offer 上再记录 submission 不改变阶段。

### 10.5 Archive

Idle auto-archive（默认关，14 天）只处理 Excluded/Dismissed，写 `archived_at`。永不处理 Saved、Reference、进行中的 Application、普通 included 岗位。归档后的 excluded 仍出现在 Excluded 视图。CLI：`job-sentinel archive [--force] [--dry-run]`。

### 10.6 Tasks / DDL

Job 可有 checklist tasks 与主 DDL（`deadline`）。`follow_up_at` 是提醒日期。这些出现在 Tasks，不出现在 Discover 卡片。

---

## 11. Core User Flows

### 11.1 Discover and Review

1. 用户打开 `/jobs`。
2. 系统显示 Current 岗位（隐藏 dismissed/excluded）。
3. 用户按 All / Saved / Reference 或 Source / Market / Date / Location 过滤。
4. 用户 Save、Reference、Start Application，或打开原始页面。
5. 噪音岗位 Dismiss 后进入 Excluded，可 Restore。

### 11.2 Apply

1. 用户在 Discover 对任意正常岗位点击 Start Application（创建 Application draft）。
2. 用户点击 Open source。
3. 用户在原渠道完成申请。
4. 用户返回 Job Hub，Mark Submitted（Application stage=`applied`，写入 submission）。
5. 用户可补充 Next Step 与 Notes。Closed 立即保存，close_reason 可选。

### 11.3 Reference

1. 用户发现一个不准备申请但值得保留的岗位。
2. 用户打开 Reference（独立 boolean，可与 Save / Application 共存）。
3. 用户在 Comment 中记录值得保留的 JD、公司、技能或行业信息。

### 11.4 Manual Import

1. 用户粘贴 URL、JD 文本或填写基础字段。
2. 系统写入 `jobs_raw`。
3. 系统执行 Normalize、Dedup、Rule Filter、Basic Trust Gate。
4. 通过的记录进入 Job Pool；异常记录进入 Review。

### 11.5 Collector Run

1. 用户在本机运行现有 collector。
2. collector 输出 canonical JSONL/JSON，或调用 ingestion endpoint。
3. Job Hub 为本次运行创建 collection run。
4. 数据逐条进入 `jobs_raw`，随后进入 pipeline。
5. 页面显示 created、updated、deduplicated、filtered、review、failed 数量和错误摘要。

---

## 12. Channel Requirements

### 12.1 Channel Registry Fields

| Field | Type | Required | Meaning |
|---|---|---:|---|
| id | uuid | yes | 稳定标识 |
| name | text | yes | 渠道名称 |
| market | enum | yes | CN / GLOBAL |
| channel_type | text | yes | platform / ats / career_page / rss / community / manual |
| base_url | text | no | 渠道主页 |
| collection_method | enum | yes | api / scrape / browser / manual |
| application_mode | enum | yes | source / apply_page / email / platform_message / manual |
| communication_mode | enum | yes | platform / email / contact / none / manual |
| contact_entry | text | no | 邮箱、联系人或沟通入口 |
| enabled | boolean | yes | 是否启用 |
| trust_level | enum | yes | known / review / blocked |
| verification_status | text | no | 验证状态 |
| last_checked_at | timestamptz | no | 最后检查时间 |
| config | jsonb | no | 关键词、地区、频率及渠道特有配置 |
| notes | text | no | 备注 |

### 12.2 Configuration Source

- Channel Sheet 是人可编辑的配置与研究源。
- V0 使用一次性或按需脚本把启用渠道导入数据库。
- Web App 运行中读取数据库 `channels`。
- V0 不实现数据库回写 Sheet。

---

## 13. Collection Architecture

### 13.1 Runtime Units

#### Job Hub repo

负责：

- Web App
- database schema 与 migrations
- ingestion contract
- Manual Import
- pipeline
- Job Pool
- 状态追踪

#### Existing `mcp-jobs` repo

负责：

- BOSS、猎聘、智联的本机浏览器采集
- 保留登录态和平台特殊逻辑
- 把结果转换成 Job Hub ingestion contract

V0 不复制或重写现有 collector。两个 repo 通过文件导入或 authenticated ingestion endpoint 连接。

### 13.2 Collector Adapter Contract

collector 输出的最小结构：

```json
{
  "channel_key": "boss",
  "market": "CN",
  "source_job_id": "optional-platform-id",
  "source_url": "https://...",
  "application_url": "https://...",
  "title": "职位名称",
  "company": "公司名称",
  "location": "地点原文",
  "description": "JD 原文",
  "requirements": "要求原文或 null",
  "published_at": "2026-08-30T00:00:00+08:00",
  "collected_at": "2026-08-30T09:00:00+08:00",
  "raw_payload": {}
}
```

要求：

- `channel_key`、`market`、`source_url`、`title`、`collected_at` 必填。
- collector 不负责最终去重与生命周期状态。
- 解析失败的字段保留 null，原始 payload 保留。
- 一条记录失败不终止整个 run。

### 13.3 Ingestion Modes

V0 支持：

1. `Manual Import`：表单、JSON、JSONL 或 CSV。
2. `Local File Import`：从 `mcp-jobs` 导出文件导入。
3. `Authenticated POST`：collector 调用 `/api/ingest/jobs`。

第一条 vertical slice 优先使用最容易跑通的模式。实现完成后保持同一 canonical contract。

---

## 14. Pipeline Requirements

### 14.1 Pipeline Order

`Validate → Store Raw → Normalize → Resolve Channel → Basic Trust Gate → Dedup → Rule Filter → Upsert Job → Link Sources → Record Run Result`

### 14.2 Validation

- 缺少必填字段：raw record 标记 invalid，并记录原因。
- URL 无法解析：进入 Review 或 invalid。
- 时间统一存 UTC，前台按用户时区显示。
- 原始字符串不覆盖，规范化值另存。

### 14.3 Normalization

至少处理：

- title trim 与空白规范化
- company 名称 trim 与基础符号规范化
- location 原文保留，并提取 country / city（可为空）
- market 标准化为 CN / GLOBAL
- published_at 与 collected_at 标准化
- URL canonicalization，移除已知 tracking parameters
- description 保留纯文本；允许同时保存安全清洗后的 HTML

### 14.4 Dedup

按确定性由高到低执行：

1. 同一 Channel + source_job_id。
2. canonical source_url。
3. company_normalized + title_normalized + location_normalized + description_hash。
4. company + title + location 的近似候选只进入 Review，不自动合并。

去重结果：

- `new_job`：创建 jobs。
- `existing_job`：更新 last_seen_at，新增或更新 job_sources。
- `review`：保留两条记录并进入 Review。

### 14.5 Rule Filter

V0 支持：

- fields：title、company、location、description、market、channel。
- operators：equals、contains、not_contains、in、regex。
- actions：include、exclude、review。
- priority：数字越小越先执行。

每次过滤保存：

- filter_state
- matched_rule_ids
- filter_reasons
- filtered_at

被 exclude 的岗位保留在数据库，默认 Job Pool 不显示。

---

## 15. Basic Trust Gate

V0 只实现最小门槛：

1. source_url 可解析。
2. Channel 已知且 enabled。
3. URL scheme 为 http / https。
4. 域名与 Channel 配置明显不一致时进入 Review。
5. Channel 标记 blocked 时阻止进入默认 Job Pool。
6. redirect 或 URL 异常无法确认时进入 Review。

状态：

- `known`：进入后续 pipeline。
- `review`：进入 `/review`，展示具体原因。
- `blocked`：停止默认展示和自动执行。

V0 不调用付费 Threat Intelligence provider，也不把“未发现异常”表达为安全保证。

---

## 16. Data Model

### 16.1 `markets`

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| code | text unique | CN / GLOBAL |
| name | text | |
| active | boolean | default true |
| config | jsonb | market-specific defaults |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 16.2 `channels`

字段见 12.1。`name + market` 建立唯一约束或稳定 `channel_key`。

### 16.3 `collection_runs`

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| channel_id | uuid FK | |
| method | text | file / api / manual / browser |
| status | text | running / success / partial / failed |
| started_at | timestamptz | |
| finished_at | timestamptz | nullable |
| received_count | int | default 0 |
| created_count | int | default 0 |
| updated_count | int | default 0 |
| deduped_count | int | default 0 |
| excluded_count | int | default 0 |
| review_count | int | default 0 |
| failed_count | int | default 0 |
| error_summary | text | nullable |
| metadata | jsonb | runtime detail |

### 16.4 `jobs_raw`

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| collection_run_id | uuid FK | |
| channel_id | uuid FK | |
| source_job_id | text | nullable |
| source_url | text | required |
| raw_payload | jsonb | required |
| validation_state | text | valid / invalid / review |
| validation_reasons | jsonb | default [] |
| collected_at | timestamptz | required |
| processed_at | timestamptz | nullable |
| created_at | timestamptz | |

### 16.5 `jobs`

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| title | text | required |
| title_normalized | text | required |
| company | text | nullable |
| company_normalized | text | nullable |
| location | text | nullable |
| location_normalized | text | nullable |
| country | text | nullable |
| city | text | nullable |
| market | text | CN / GLOBAL |
| description_text | text | nullable |
| description_html | text | sanitized, nullable |
| requirements | text | nullable |
| primary_source_url | text | required |
| application_url | text | nullable |
| published_at | timestamptz | nullable |
| first_seen_at | timestamptz | required |
| last_seen_at | timestamptz | required |
| fingerprint | text | indexed |
| status | text | deprecated leftover column; sealed writes leave null |
| engagement | text | legacy read-compat only (may still hold under_study/to_do) |
| favorite | boolean | product Save; default false; mutex with dismissed_at |
| reference | boolean | independent keep-aside; can coexist with Save and Application |
| comment | text | nullable |
| next_step | text | nullable |
| deadline | timestamptz | nullable main DDL |
| follow_up_at | timestamptz | reminder; not a Discover chip |
| last_activity_at | timestamptz | user/task activity only; collectors leave NULL |
| dismissed_at | timestamptz | Discovery stow / Excluded |
| archived_at | timestamptz | idle archive for excluded/dismissed only |
| archive_reason | text | nullable |
| filter_state | text | included / excluded / review |
| filter_reasons | jsonb | default [] |
| trust_state | text | known / review / blocked |
| trust_reasons | jsonb | default [] |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Constraints：

- `favorite` 与 `reference` 独立；可同时为 true；均与 dismissed_at 互斥。
- 禁止再写入 engagement=under_study / to_do。历史 engagement=reference 迁移为 reference=true。
- Job 不承载 Applied / Interview / Offer / Closed；无 Rejected。
- primary_source_url 必须对应至少一条 job_sources。

### 16.5b `job_tasks`

| Field | Type | Notes |
|---|---|---|
| id | text PK | |
| job_id | text FK | |
| title | text | required |
| due_at | date | nullable |
| done | boolean | default false |
| sort_order | int | |
| created_at | timestamptz | |

### 16.6 `job_sources`

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| job_id | uuid FK | cascade delete |
| raw_job_id | uuid FK | nullable |
| channel_id | uuid FK | |
| source_job_id | text | nullable |
| source_url | text | required |
| canonical_url | text | required |
| application_url | text | nullable |
| published_at | timestamptz | nullable |
| first_seen_at | timestamptz | |
| last_seen_at | timestamptz | |
| is_primary | boolean | default false |

唯一约束优先使用：`channel_id + source_job_id`；缺少 source_job_id 时使用 `channel_id + canonical_url`。

### 16.7 `filter_rules`

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| market | text | CN / GLOBAL / ALL |
| name | text | |
| field | text | |
| operator | text | |
| value | jsonb | string or array |
| action | text | include / exclude / review |
| reason | text | user-facing explanation |
| priority | int | |
| active | boolean | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 16.8 Application and related

- `applications`：unique `job_id`；stage draft|applied|interview|offer|closed；close_reason 可空；无 rejected；Closed 即历史，无独立 archived 阶段。
- `application_submissions`：每次 Mark Submitted / 重投一条。含 `idempotency_key`（空值以外部分唯一）。`packet_snapshot` 冻结当时材料名、版本、URL，以及服务器复制的文件字节（`snapshot_file_ref`）。
- `application_events`：阶段与关闭历史。
- `application_comm_notes`：申请级轻量沟通备注（非 Timeline）。
- `materials` / `material_versions` / `application_material_bindings`：Library + 当前 bindings。binding UNIQUE(application_id, material_id)，由 version→material_id 解析。purpose 为双层自由文本。soft archive。Cancel Draft 只清 bindings。kinds 含 files 与 `message_template` / `application_answer`（`content.md`）。
- `applications.exclude_from_idle`：申请级排除 idle cleanup。`hub_idle_cleanup_settings`：enabled + idle_days（默认 14，可改）。

V0 不创建或不启用：

- match_results
- communications UI
- risk_registry
- security_events
- career_profiles

---

## 17. API Requirements

### 17.1 Jobs

- `GET /api/jobs`
  - params：since、market、view=discover|tasks、q、has_draft、include_dismissed、include_archived。
- `PATCH /api/jobs/:id`
  - 仅允许更新 favorite、reference、next_step、comment、deadline。
- `POST /api/jobs/:id/save|unsave|reference|unreference|start-application|dismiss|undismiss`

### 17.2 Ingestion

- `POST /api/ingest/jobs`
  - collector 批量提交 canonical records。
  - 需要 ingestion secret。
  - 返回 run_id 与每条 record 的结果。
- `POST /api/import/manual`
  - 接收 URL、JD 文本或基础字段。
- `POST /api/import/file`
  - 接收 JSON、JSONL 或 CSV。

### 17.3 Sources and Runs

- `GET /api/channels`
- `GET /api/collection-runs`
- `GET /api/collection-runs/:id`

### 17.4 Review

- `GET /api/review`
- `POST /api/review/:entityType/:id/resolve`
  - action：approve / keep_separate / block。

### 17.5 Applications, idle cleanup, Materials

- `GET /api/applications?view=open|closed|all&stale_applied=`
- `GET|PUT /api/idle-cleanup-settings` — `enabled`, `idle_days`（默认 14）
- `PATCH /api/applications/:id` — includes `exclude_from_idle`
- `GET|POST /api/materials`；`POST /api/materials/upload`；versions upload/URL/text（`content.md`）
- `GET|PUT /api/applications/:id/packet`；bindings add/change/remove
- `POST /api/applications/:id/submit` 冻结当前服务器 bindings；空材料需 `confirm_empty`；`expected_version_ids` 不一致返回 `materials_changed`；`idempotency_key` 幂等
- `GET /api/applications/:id/submissions/:sid/items/:index/file` 下载当次快照字节，不是最新版本
- `GET|POST|DELETE /api/applications/:id/comm-notes`

---

## 18. Technical Architecture

### 18.1 Open-source Reuse Decision

V0 不从空白脚手架开始。主实现基线采用 [Job Sentinel](https://github.com/harshitwandhare/job-sentinel)，固定到开始开发时确认的 commit，并在独立 `job-hub` repo 中保留上游来源与 MIT License。

采用原因：

- 产品链路已覆盖 source adapter、聚合搜索、岗位池、状态追踪、来源健康和本地 Web UI。
- 技术结构为 Python / Playwright + FastAPI + Next.js，能直接承接现有 `mcp-jobs`。
- 本地 SQLite WAL、repository、scheduler、错误隔离与单用户运行方式适合当前 V0。
- 已有 HLD、LLD、Windows 安装脚本、Docker、类型检查和完整测试基础。
- AI、简历、Telegram 和通知模块与核心层解耦，可以在 V0 禁用。

主基线的使用方式：**fork and reduce**。保留成熟骨架，删减产品范围，并替换 Job 数据契约、状态语义、筛选规则和数据库 schema。

辅助参考：

- `Gsync/jobsync`：参考 Next.js + shadcn 的 tracking UI、自动发现后的 accept/dismiss 流程、Prisma migration 和端到端测试。
- `DrJonoG/job_search`：参考多来源 adapter、后台搜索任务、Job Board、来源合并与去重。
- `CareerPulse`：参考 `last_seen_at`、stale handling、状态时间线和直接申请链接。
- `OpenPostings`：仅研究 ATS coverage 与接口设计；在确认许可证前不复制代码。

### 18.2 Reuse Map

| Upstream area | V0 action | Job Hub adaptation |
|---|---|---|
| `core/models.py` | Replace | 使用本 PRD 的 JobRaw、Job、JobSource、CollectionRun、FilterRule |
| `adapters/base.py` | Reuse | 保留 login / scrape_page / next_page / bounded pagination 契约 |
| `adapters/registry.py` | Reuse | Channel key 对应 adapter ID |
| `sources/base.py` | Reuse | 加入 Market、Channel 与 canonical ingestion fields |
| `sources/search.py` | Reuse | 继续隔离单来源失败，并返回 counts / source errors |
| `db/repository.py` | Replace interface, reuse patterns | 使用自己的 schema、幂等 migration、WAL 与 human-state preservation |
| `api/app.py` / `api/ops.py` | Reduce and adapt | 只保留 jobs、sources、runs、review、manual import、ingestion |
| `web/` | Reduce and adapt | 保留 Next.js、typed API client、测试与 jobs UI 骨架 |
| source health / run state | Reuse | 映射到 collection_runs 与 `/sources` |
| scheduler | Optional V0 | 第一条链路可手动触发；稳定后启用 |
| auth | Keep available | localhost 默认关闭；公网运行时启用 |
| Telegram / email notifier | Disable | 不进入 V0 |
| profile / documents / LLM / chat | Disable | 不进入 V0 |
| application CRM | Reduce | V0 使用 Job engagement / Next Step / Comment / tasks；投递阶段在 Application |

### 18.3 Fixed V0 Stack

- Repository：独立本地 repo `job-hub`，基于 Job Sentinel 的固定 commit 建立。
- Core language：Python 3.11+。
- Backend：FastAPI。
- Browser collection：Playwright / Chromium。
- Frontend：Next.js App Router + TypeScript + Tailwind。
- Database：SQLite WAL。
- Repository / migration：保留可替换 repository interface；schema migration 幂等并纳入 Git。
- Python package manager：`uv`。
- Runtime validation：Pydantic。
- Scheduling：APScheduler，第一条链路允许手动触发。
- HTTP / retry：HTTPX + Tenacity。
- Tests：pytest、mypy、ruff；前端 Vitest；最小 Playwright E2E。
- Deployment：V0 本地运行。PostgreSQL / Supabase 与云端部署后置。
- Domestic collectors：现有 Python / Playwright `mcp-jobs`。

### 18.4 Component Boundary

```text
mcp-jobs / Manual Import
        ↓ canonical ingestion contract
FastAPI / Job Hub API
        ↓
jobs_raw → normalize → trust gate → dedup → rule filter
        ↓
SQLite jobs + job_sources + collection_runs
        ↓
Next.js /jobs → return to source → tracking updates
```

### 18.5 Suggested Repo Structure

```text
job-hub/
├─ AGENTS.md
├─ LICENSE
├─ UPSTREAM.md
├─ docs/
│  └─ PRD.md
├─ src/job_hub/
│  ├─ core/
│  ├─ adapters/
│  ├─ sources/
│  ├─ ingestion/
│  ├─ pipeline/
│  ├─ db/
│  ├─ api/
│  └─ config/
├─ web/
│  ├─ app/
│  │  ├─ jobs/
│  │  ├─ sources/
│  │  └─ review/
│  ├─ components/
│  └─ lib/
├─ scripts/
│  ├─ import_channels.py
│  └─ import_legacy_jobs.py
├─ migrations/
├─ tests/
│  ├─ fixtures/
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/
├─ pyproject.toml
├─ uv.lock
├─ .env.example
└─ README.md
```

### 18.6 Environment Variables

`.env.example` 至少声明：

```text
JOB_HUB_DB_PATH=data/job_hub.db
INGESTION_SECRET=
APP_TIMEZONE=Asia/Shanghai
AUTH_MODE=off
LOG_LEVEL=INFO
```

真实 secret 不得提交 Git。

### 18.7 Upstream and License Rules

- Job Sentinel 与 JobSync 的 MIT 代码可直接复用，必须保留原许可证和版权声明。
- DrJonoG/job_search 的 Apache-2.0 代码复用时保留 LICENSE / NOTICE，并标记修改。
- 每次复制代码记录来源 repo、commit、原路径和本地路径，集中写入 `UPSTREAM.md`。
- 未显示明确许可证的仓库只用于研究交互和架构。
- 优先复用完整模块与测试，避免复制无法追踪的零散片段。

### 18.8 Database Evolution

V0 使用 SQLite，减少基础设施和部署变量。所有业务代码通过 `JobRepository` interface 访问数据，避免路由和 UI 直接写 SQL。

出现以下需求时再评估 PostgreSQL / Supabase：

- 需要离开本机访问。
- 需要稳定云端定时采集。
- 需要多个写入进程或多设备同步。
- SQLite 的并发或部署方式形成真实限制。

迁移时保留本 PRD 的逻辑 schema，并新增 PostgreSQL repository implementation。

### 18.9 AI and Agent Boundary

- V0 不启动 Agent。
- V0 不要求模型 API。
- pipeline 通过独立 service interface 预留后续 matcher/collector adapter。
- Grok Cloud 只作为未来公开网页与官网信息补充来源，不承接国内登录平台主链路。

---

## 19. Legacy Data Migration

### 19.1 Fields to Preserve

现有岗位表至少映射：

| Legacy | Job Hub |
|---|---|
| Name | title |
| Link | primary_source_url |
| Market | market |
| Location | location |
| Status / Engagement | engagement / Application.stage |
| Next Step | next_step |
| Comment | comment |

### 19.2 Migration Rule

1. 先导出旧表。
2. 运行 dry run，生成字段错误与重复报告。
3. 导入测试数据库。
4. 核对总数、状态分布与随机样本。
5. 核对通过后启用 Web App 作为唯一维护入口。
6. 旧表改为只读历史备份。

V0 开发期间不删除旧表。

---

## 20. Failure Handling

### 20.1 Collector Failure

- run 标记 partial 或 failed。
- 保存 channel、时间、错误类型与简短原因。
- 已成功写入的记录保留。
- 支持重新运行，同一数据不重复创建 Job。

### 20.2 Login / CAPTCHA

- 标记 `requires_user_action`。
- 页面显示“需要在本机重新登录”或“需要人工完成验证码”。
- 系统不尝试绕过验证码。

### 20.3 Parser Change

- 原始 payload 保留。
- normalization 失败记录可重跑。
- collector 版本或 parser version 写入 run metadata。

### 20.4 Database / API Error

- 客户端显示明确失败状态。
- mutation 不做假成功。
- 批量 ingestion 返回逐条结果。

---

## 21. Non-functional Requirements

### 21.1 Reliability

- ingestion 与 upsert 幂等。
- 单条错误不终止整个批次。
- 所有批次有 run id。

### 21.2 Performance

- 1,000 条以内 Job Pool 首屏目标在本地或正常网络下 2 秒内可交互。
- 列表使用分页或 cursor pagination。
- 常用字段建立索引：market、status、published_at、first_seen_at、channel_id、fingerprint。

### 21.3 Security

- 数据库管理凭据与 ingestion secret 只在后端或本机进程中使用。
- ingestion endpoint 校验 secret。
- JD HTML 渲染前清洗 script、iframe、form 与事件属性。
- 外部链接使用安全新窗口设置。
- 公网部署启用访问控制。

### 21.4 Privacy

- V0 不保存完整简历、身份证件、银行卡信息或平台账号密码。
- 浏览器登录态留在本机 collector 环境。

### 21.5 Observability

- collection run 有结构化结果。
- pipeline 每阶段保留 reason 或 state。
- 页面可以看到最近失败来源。

### 21.6 Maintainability

- 数据库变更通过 migration。
- source-specific logic 只放 adapter。
- 业务规则有单元测试。
- PRD、AGENTS.md 与代码一起版本控制。

---

## 22. Delivery Plan

### Slice 0｜Project Baseline

交付：

- 记录 Job Sentinel 上游 repo 与固定 commit。
- 在空的 `job-hub` 文件夹中建立 fork-derived 工作树。
- 保留 MIT License，并创建 `UPSTREAM.md`。
- 验证原始 FastAPI + Next.js Web UI 能在 Windows 本地运行。
- 禁用 Telegram、profile、documents、LLM、chat 和完整 application CRM。
- 加入 PRD、AGENTS.md、README、`.env.example`。
- 用本 PRD 的 schema 替换核心 model 与 repository migration。

完成标准：精简后的应用能本地启动，SQLite migration 可重复执行，现有上游测试中的保留模块继续通过。

### Slice 1｜Manual Vertical Slice

交付：

- Manual Import。
- jobs_raw。
- Normalize、Dedup、Rule Filter。
- `/jobs` 列表、Today / Since Date、Open Source。

完成标准：一条真实岗位能从 Manual Import 进入 `/jobs`，重复导入不产生重复 Job。

### Slice 2｜Existing CN Collector

交付：

- 固定 canonical ingestion contract。
- `mcp-jobs` 输出适配。
- collection runs 与错误状态。
- 至少接通 BOSS / 猎聘 / 智联中的一条真实链路。

完成标准：真实采集结果能完整进入 `/jobs`，登录失效或采集失败可见。

### Slice 3｜Tracking Loop

交付：

- Save（favorite）。
- engagement（null / reference / under_study / to_do）；新入库默认 null。
- Next Step、Comment、DDL、job tasks。
- Application stages（draft / applied / interview / offer / closed）。无 Rejected。
- Job-level archive（`archived_at`），不是 Job Closed。
- Reference。
- Open Apply Page。

完成标准：真实岗位能完成“查看 → 回源 → 更新状态”的闭环。

### Slice 4｜Stabilize and Optional Deploy

交付：

- 基础 Review。
- 最小端到端测试。
- 旧岗位表 dry-run migration。
- 公网部署前的单用户访问保护。

完成标准：V0 Acceptance Criteria 全部通过。部署只在本地闭环稳定后进行。

---

## 23. Acceptance Criteria

### AC1｜Manual Import

Given 用户输入一个真实岗位 URL 与 JD，  
When 系统完成导入，  
Then 记录进入 jobs_raw 与 jobs，并能在 `/jobs` 查看。

### AC2｜CN Collector

Given 本机 collector 已取得真实岗位，  
When collector 通过文件或 API 提交，  
Then 系统创建 collection run，并把有效岗位加入 Job Pool。

### AC3｜Idempotency

Given 同一批岗位被重复导入，  
When pipeline 再次运行，  
Then Job Pool 不出现明显重复岗位，last_seen_at 与 sources 正确更新。

### AC4｜Multiple Sources

Given 同一岗位来自两个来源，  
When Dedup 完成，  
Then Job Pool 显示一条 Job，详情中保留两个来源。

### AC5｜Rule Filter

Given 岗位命中明确排除规则，  
When Rule Filter 运行，  
Then 岗位不进入默认视图，并保存过滤原因。

### AC6｜Date and Core Filters

Given 数据库包含多个日期和渠道的岗位，  
When 用户选择 Today 或 Since Date，  
Then 结果时间范围正确，并可继续按 Market、Channel、Keyword、engagement 筛选。

### AC7｜Tracking

Given 用户打开一个岗位，  
When 用户更新 Save、Reference、Next Step 或 Comment，  
Then 刷新页面后数据保持一致。

### AC8｜Mark Submitted

Given 用户从任意普通 Discover 岗位 Start Application 得到 draft，  
When 用户 Mark Submitted，  
Then Application stage 为 applied，并追加一条 submission。Job 的 Save / Reference 不变。

### AC9｜Return to Source

Given Job 存在来源或申请链接，  
When 用户点击 Open Source / Open Apply Page，  
Then 系统打开对应原始入口。

### AC10｜Failure Visibility

Given collector 登录失效、验证码出现或 parser 失败，  
When run 结束，  
Then `/sources` 显示失败状态和可理解的原因，已成功记录仍然保留。

### AC11｜Basic Trust Gate

Given URL 与已知 Channel 域名明显不一致，  
When Trust Gate 运行，  
Then 记录进入 Review，并显示具体原因。

### AC12｜Legacy Compatibility

Given 现有岗位表包含历史与进行中的岗位，  
When migration dry run 执行，  
Then Name、Link、Market、Location、Status、Next Step、Comment 均有明确映射，错误与重复记录有报告。

---

## 24. V0 Exit Criteria

以下条件全部满足即可停止 V0 开发并进入真实使用：

1. Manual Import 端到端跑通。
2. 至少一条真实 CN collector 端到端跑通。
3. Today / Since Date 与五项核心筛选可用。
4. 重复运行不产生明显重复 Job。
5. Open Source、Save、engagement、Next Step、Comment、Application 可用。
6. Reference 可用。
7. 失败状态可见。
8. V0 测试通过。

Global source、AI、Agent、Grok、完整 Trust Engine、自动投递和复杂追踪不影响 V0 完成判断。

---

## 25. Risks and Mitigation

| Risk | V0 Response |
|---|---|
| 国内平台登录态不稳定 | collector 留在本机；失败可见；Manual Import 兜底 |
| CAPTCHA / 反自动化 | 请求人工完成；不绕过 |
| 页面结构变化 | 保留 raw payload、parser version 与可重跑记录 |
| 跨渠道误合并 | 高置信规则自动合并；模糊候选进入 Review |
| 漏合并 | 保留多个 Job；后续人工或规则修正 |
| Channel Sheet 同步复杂 | V0 使用 seed / 手动刷新 |
| 范围扩张 | 以 V0 Exit Criteria 为停止标准 |
| 云端部署暴露私人数据 | 部署前增加单用户访问保护 |
| 外部服务成本或绑定 | AI/Grok 保持可替换 adapter，V0 不依赖 |

---

## 26. Open Questions

这些问题不阻塞 Slice 0–2：

1. V0 稳定后优先接入哪一类 Global source。
2. Channel Sheet 后续采用手动刷新、定时导入或 API 同步。
3. AI Match 的职业标准、输出结构与模型选择。
4. 是否需要独立 Application history。
5. 国内 inbound recruiter 的技术可行性。
6. 出现远程访问需求后采用哪种云端部署与单用户访问方式。

---

## 27. Reference Implementations

1. [harshitwandhare/job-sentinel](https://github.com/harshitwandhare/job-sentinel)：V0 主实现基线；复用 adapter、source aggregation、FastAPI、Next.js UI、SQLite repository、source health 与测试结构。
2. [Job Sentinel HLD](https://github.com/harshitwandhare/job-sentinel/blob/main/docs/design/HLD.md)：组件边界、运行方式、并发、失败恢复与技术选择。
3. [Job Sentinel LLD](https://github.com/harshitwandhare/job-sentinel/blob/main/docs/design/LLD.md)：models、adapter contract、repository、upsert 和 scrape-cycle 细节。
4. [Gsync/jobsync](https://github.com/Gsync/jobsync)：参考成熟 tracking UI、discovery review、Prisma migration 与 E2E。
5. [DrJonoG/job_search](https://github.com/DrJonoG/job_search)：参考多来源 adapter、后台搜索、Job Board 与来源合并。
6. [tcpsyn/CareerPulse](https://github.com/tcpsyn/CareerPulse)：参考 freshness、stale handling、状态时间线与直接申请链接。
7. [Masterjx9/OpenPostings](https://github.com/Masterjx9/OpenPostings)：研究 ATS coverage；许可证确认前不复制代码。
8. [Cursor Rules](https://cursor.com/docs/rules)：项目规则与 `AGENTS.md` 使用方式。
9. [Cursor Cloud Agents](https://cursor.com/docs/cloud-agent)：后续远程 repo 与 Cloud Agent 的运行边界。

---

## 28. Change Control

每次改动先归入一个类型：

- Product Goal
- Scope
- Functional Requirement
- UX
- Data Model
- Technical Constraint
- Safety
- Acceptance Criteria
- Open Question

局部修改后必须检查：

- 是否造成重复或字段重叠。
- 是否改变现有 Status 语义。
- 是否破坏 collector contract。
- 是否需要 migration。
- 是否改变 V0 Exit Criteria。
- 是否把 Later 内容带入当前实现。
