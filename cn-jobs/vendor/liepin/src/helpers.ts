// 数据源：猎聘 PC 端公开接口。免登录。
// 搜索走私有 JSON API（返回结构化职位卡），详情走 SSR HTML 页面。
// 详情页有两种路径：企业直招 /job/<id>.shtml，猎头职位 /a/<id>.shtml。
//
// 仅供个人求职使用。猎聘 www 主机的 robots.txt 禁止带查询串的路径，
// 请保持低频，不要用于商业用途或批量采集，风险自负。

export const SEARCH_URL =
  "https://api-c.liepin.com/api/com.liepin.searchfront4c.pc-search-job"
export const DETAIL_JOB_BASE = "https://www.liepin.com/job"
export const DETAIL_A_BASE = "https://www.liepin.com/a"

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

/** 请求最小间隔，避免触发猎聘风控。 */
const MIN_INTERVAL_MS = 1500
let lastRequestAt = 0

/**
 * 串行化的节流闸门。所有请求排在同一条 promise 链上依次通过。
 *
 * 不能写成「先算 wait、await、再写 lastRequestAt」—— 那样并发调用会同时读到
 * 同一个陈旧时间戳，算出同样的等待，睡完一起发出去，最小间隔静默失效。
 *
 * 注意这是**进程内**节流：并行运行多个 CLI 进程时各有各的链，互不约束。
 */
let throttleChain: Promise<void> = Promise.resolve()

export function throttle(): Promise<void> {
  const next = throttleChain.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastRequestAt = Date.now()
  })
  // 链上任何一环失败都不能卡死后续请求
  throttleChain = next.catch(() => {})
  return next
}

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/**
 * 带错误码的错误，供上层直接分类，不必去匹配消息文本。
 *
 * 之前上层靠正则匹配这里抛出的消息字符串来分类错误（如判断是否限流），
 * 一旦这里改了措辞，分类就会静默出错，且编译器和测试都不会报警。
 */
export class LiepinError extends Error {
  // ⚠️ 显式声明 + 显式赋值，**不要**改回构造器参数属性（`readonly code: string` 写在
  // 参数位）。那是需要生成代码的 TS 特性，而 Node 的类型剥离只做擦除、不做转换，
  // 一改回去 `node src/cli.ts` 就会直接抛错 —— 本 CLI 支持 node 与 bun 两个运行时
  // 正是为了让用户不必额外装 Bun（Claude Code 本身走 npm 安装，Node 必然已存在）。
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.code = code
    this.name = "LiepinError"
  }
}

/**
 * 把 fetch/正文读取抛出的异常归类成带 code 的 LiepinError。
 *
 * `AbortSignal.timeout()` 触发时抛的是 name 为 `TimeoutError`（部分运行时为
 * `AbortError`）的异常 → 归 `TIMEOUT`；DNS 解析失败、连接被重置、断网等
 * 一律归 `NETWORK`。之前这些异常会直接穿出退避循环、零重试，最后被上层
 * 归成通用 SEARCH_FAILED/DETAIL_FAILED，既不重试也不可操作。
 *
 * 导出供测试直接断言分类（退避循环最终一击的整段实跑代价太高，不宜每次跑测都等）。
 */
export function classifyNetworkError(e: unknown): LiepinError {
  const msg = e instanceof Error ? e.message : String(e)
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return new LiepinError(`请求超时（15s 内无响应），可能是网络拥塞或猎聘无响应：${msg}`, "TIMEOUT")
  }
  return new LiepinError(`网络请求失败（DNS 解析失败/连接被重置/断网等）：${msg}`, "NETWORK")
}

/**
 * 检测详情页响应是否其实是限流挑战页，而非真正的职位页。
 *
 * 触发风控时猎聘会 302 到 `https://wow.liepin.com/tXXXX/transit.html`：一个
 * ~1.3KB、HTTP 200、既无 `ld+json` 结构化数据也无 `job-intro-content` 正文锚点的
 * 中转页。若不识别，下游 parseJobDetail 会因取不到正文而误报 PARSE_FAILED
 * 「猎聘改了 markup」，把用户引向去改解析锚点（url-reference.md 明确警告别这么做），
 * 实际上该做的是退避。这里据 redirect 落点主机/路径 + body 启发式识别，归为限流。
 */
function isChallengePage(response: Response, body: string): boolean {
  try {
    const u = new URL(response.url)
    if (u.hostname.includes("wow.liepin.com") || u.pathname.includes("transit.html")) {
      return true
    }
  } catch {
    // response.url 可能为空串或非法（如构造出来的 Response）——忽略，走 body 启发式。
  }
  // body 启发式：挑战页很短，且两个真实详情页必有的锚点都缺失。真实职位页
  // （企业直招 /job/ 与猎头 /a/）总有 ld+json 且恰有一处 job-intro-content，绝不会命中。
  return (
    body.length < 4096 &&
    !/application\/ld\+json/i.test(body) &&
    !/job-intro-content/i.test(body)
  )
}

/**
 * 检测详情页响应是否其实是「职位已下线」的软 404 页。
 *
 * 猎聘对已下线/不存在的职位**不返回 404**，而是 HTTP 200 + 一个约 5KB 的页面：
 * 「我们找遍了所有地方 / 此页面似乎不存在 / 4s 后将进入猎聘首页」。它既无
 * `ld+json` 也无 `job-intro-content`，但比 transit 挑战页大，落不进
 * `isChallengePage` 的 `body.length < 4096` 启发式，于是被下游误报成
 * PARSE_FAILED「猎聘改了 markup」——那会把维护者引向去改解析锚点，而
 * url-reference.md 明确警告不要那么做。正确结论是这条职位没了。
 *
 * 判据用页面文案而非体积：文案是这个页面的本质特征，体积会随模板改版漂移。
 */
function isSoftNotFoundPage(body: string): boolean {
  if (/application\/ld\+json/i.test(body) || /job-intro-content/i.test(body)) return false
  return /此页面似乎不存在|我们找遍了所有地方/.test(body)
}

/** POST 搜索接口，对 429/5xx/网络错误/超时指数退避。返回已解析的 JSON。 */
export async function apiFetch(body: unknown): Promise<unknown> {
  const maxRetries = 6
  let delay = 500
  // 退避一次并递增下次的基准延迟。attempt < maxRetries 时才调用。
  const backoff = async () => {
    const jitter = Math.floor(Math.random() * 500)
    await new Promise((r) => setTimeout(r, delay + jitter))
    delay = Math.min(delay * 2, 8000)
  }
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await throttle()
    let response: Response
    try {
      response = await fetch(SEARCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://www.liepin.com",
          Referer: "https://www.liepin.com/",
          "User-Agent": UA,
          "X-Client-Type": "web",
          "X-Fscp-Version": "1.1",
          "X-Requested-With": "XMLHttpRequest",
          "X-Fscp-Std-Info": '{"client_id": "40108"}',
          "X-Fscp-Trace-Id": crypto.randomUUID(),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      })
    } catch (e) {
      // 网络错误/超时也退避重试，而不是直接穿出循环。
      if (attempt === maxRetries) throw classifyNetworkError(e)
      await backoff()
      continue
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new LiepinError(
          `猎聘限流或服务异常：${response.status} ${response.statusText}`,
          "RATE_LIMITED",
        )
      }
      await backoff()
      continue
    }

    if (!response.ok) {
      throw new LiepinError(`请求失败：${response.status} ${response.statusText}`, "REQUEST_FAILED")
    }

    let text: string
    try {
      text = await response.text()
    } catch (e) {
      // 连接在读取响应体途中被重置等：同样退避重试。
      if (attempt === maxRetries) throw classifyNetworkError(e)
      await backoff()
      continue
    }
    if (text.trimStart().startsWith("<")) {
      throw new LiepinError("接口返回 HTML 而非 JSON，通常意味着触发了风控验证", "RATE_LIMITED")
    }
    return JSON.parse(text)
  }
  throw new LiepinError("重试耗尽仍未取得响应", "REQUEST_FAILED")
}

/** GET 详情页 HTML，对 429/5xx/网络错误/超时退避；404 返回空串（供路径回退判断）。 */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  const backoff = async () => {
    const jitter = Math.floor(Math.random() * 500)
    await new Promise((r) => setTimeout(r, delay + jitter))
    delay = Math.min(delay * 2, 8000)
  }
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await throttle()
    let response: Response
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
          Referer: "https://www.liepin.com/zhaopin/",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      })
    } catch (e) {
      if (attempt === maxRetries) throw classifyNetworkError(e)
      await backoff()
      continue
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new LiepinError(
          `猎聘限流或服务异常：${response.status} ${response.statusText}`,
          "RATE_LIMITED",
        )
      }
      await backoff()
      continue
    }

    if (response.status === 404) return ""
    if (!response.ok) {
      throw new LiepinError(`请求失败：${response.status} ${response.statusText}`, "REQUEST_FAILED")
    }

    let text: string
    try {
      text = await response.text()
    } catch (e) {
      if (attempt === maxRetries) throw classifyNetworkError(e)
      await backoff()
      continue
    }
    // 限流挑战页（transit.html）识别：归限流而非让下游误报 PARSE_FAILED。
    if (isChallengePage(response, text)) {
      throw new LiepinError(
        "详情页被重定向到限流验证页（transit.html），已触发猎聘风控 —— 请降低频率后重试",
        "RATE_LIMITED",
      )
    }
    // 「职位已下线」的 HTTP 200 软 404：归 NOT_FOUND，调用方应标 expired，
    // 而不是被 PARSE_FAILED 误导去改解析锚点。
    if (isSoftNotFoundPage(text)) {
      throw new LiepinError(
        "职位页已不存在（猎聘返回 HTTP 200 的「此页面似乎不存在」页）—— 该职位大概率已下线，请标记为过期而非重试",
        "NOT_FOUND",
      )
    }
    return text
  }
  throw new LiepinError("重试耗尽仍未取得响应", "REQUEST_FAILED")
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

/** 用于标题、公司名这类单行字段：标签换空格，所有空白（含换行）压成一个空格。 */
export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/** 猎聘的 refreshTime 是 YYYYMMDDHHMMSS，转成 ISO 日期 YYYY-MM-DD。 */
export function refreshTimeToDate(raw: string | null | undefined): string | null {
  if (!raw || raw.length < 8) return null
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

/**
 * 常见复姓。**不求全** —— 漏一个的代价只是把「欧阳」切成「欧」，
 * 称呼略生硬，不会错到伤人；而列全表要维护八十多条，其中大半在今天的
 * 招聘场景里一个也见不到。
 */
const COMPOUND_SURNAMES = new Set([
  "欧阳", "上官", "司马", "诸葛", "东方", "独孤", "南宫", "皇甫", "尉迟",
  "公孙", "慕容", "宇文", "长孙", "令狐", "钟离", "轩辕", "司徒", "司空",
  "澹台", "呼延", "端木", "拓跋", "鲜于", "宗政", "濮阳", "夏侯", "闻人",
  "万俟", "百里", "东郭", "南门", "梁丘", "左丘", "西门", "太叔",
])

/** 平台常把称谓一起写进名字（「<姓>女士」「<姓>顾问」）—— 先摘掉再取姓。 */
const HONORIFIC_TAIL = /(?:先生|女士|小姐|老师|同学|顾问|经理|总监|主管|专员|招聘官|HR|hr)$/

/**
 * 招聘者姓名 → **只留姓**。取不到、或不是中文名，返回 `null`。
 *
 * **本 CLI 不输出全名。** 下游要它只为一件事：跟进消息里的称呼（`<姓>女士`）——
 * `workflows/job-outcome.md` 那一节写死了「只记姓 + 称呼就够，不要全名、
 * 不要电话、不要微信号。那些是别人的个人信息，记进文件没有用途，
 * 只多一份泄露面」。
 *
 * 截断放在**最上游**：落了盘再脱敏，等于赌后面每一层都记得脱一次。
 *
 * 非中文名一律 `null`：拉丁名分不出姓氏在前在后，猜错就是把全名原样吐出去 ——
 * 那正是这个函数要防的。
 */
export function surnameOf(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : ""
  if (!s) return null
  const bare = s.replace(HONORIFIC_TAIL, "").trim()
  if (!/^[一-鿿]/.test(bare)) return null
  const two = bare.slice(0, 2)
  return COMPOUND_SURNAMES.has(two) ? two : bare.slice(0, 1)
}

export interface LiepinJobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  salary: string | null
  salaryMonths: number | null
  eduLevel: string | null
  workYears: string | null
  compScale: string | null
  compIndustry: string | null
  compStage: string | null
  recruiterTitle: string | null
  /**
   * 跟你说话的那个人的**姓**（`recruiter.recruiterName` 截出来的，见 `surnameOf`）。
   *
   * 搜索接口每张卡片都带着它，而这里此前只取了同一个对象里的 `recruiterTitle`
   * ——那个字段实测装的是**职务**（「猎头顾问」16 张、「HRBP」「招聘专员」
   * 「研发总监」各若干，还有 4 张是空串）。同一个「猎头顾问」挂在 16 个
   * **不同的招聘者**身上 —— 它标的是角色，不是人。
   *
   * （那个「不同」按样本里的按人标识数出来的。这里不写那个字段名：
   * `test_no_maintainer_data_in_repo` 盯着 `cli/src/` 里出不出现它，
   * 判据是「解析器一旦开始读它，样本脱敏就不再是零成本」——
   * 一句注释提一下也会被数进去。）
   * 于是台账的 `contact_person` 一列 0/85 有值，而三处在读它，每一次都在降级
   * （跟进话术称呼「团队」而不是「<姓>女士」）。
   */
  recruiterSurname: string | null
  isHeadhunter: boolean
}

export interface LiepinJobDetail extends LiepinJobCard {
  description: string | null
}

/** 从「20-40k·15薪」这类薪资串里取出薪数；没有则 null。 */
export function parseSalaryMonths(salary: string | null): number | null {
  if (!salary) return null
  const m = salary.match(/(\d+)\s*薪/)
  return m ? parseInt(m[1]!, 10) : null
}

interface RawPagination {
  currentPage: number
  totalPage: number
  totalCounts: number
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {}
}

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null
}

/**
 * 像 str()，但对 JSON number 也容忍：用 String(v) 归一成非空字符串。
 *
 * 猎聘个别字段（jobId / refreshTime / jobKind）偶尔以 number 而非 string 下发。
 * 若对它们硬性要求 string：jobId→null→整卡被跳→全卡被跳→parseJobCards 误报
 * PARSE_FAILED「改了字段结构」（其实只是类型变了）；refreshTime 数值→date null→
 * `--jobage` 静默丢所有；jobKind 数值 1→isHeadhunter 误判。只对这几个「本可为数值」的
 * 字段放宽，标题/公司名/链接等真该是 string 的字段仍走严格的 str()。
 */
function coerceStr(v: unknown): string | null {
  if (typeof v === "string") return v !== "" ? v : null
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  return null
}

/**
 * 解析搜索响应。
 * 猎聘用 flag 表示成败：flag 必须为 1，且 data.pagination 必须存在
 * （传入非法 pubTime 时接口会返回没有 pagination 的畸形响应）。
 * 两者任一不满足都抛错 —— 绝不静默返回空数组，否则上层会误读成「没有匹配职位」。
 */
export function parseJobCards(payload: unknown): {
  cards: LiepinJobCard[]
  totalPage: number
  currentPage: number
  totalCounts: number
  skipped: number
} {
  const root = asRecord(payload)
  if (root.flag !== 1) {
    throw new LiepinError(
      `猎聘接口返回 flag=${String(root.flag)}，通常意味着参数非法或触发风控`,
      "RATE_LIMITED",
    )
  }
  const data = asRecord(root.data)
  const pagination = data.pagination as RawPagination | undefined
  if (!pagination || typeof pagination.totalPage !== "number") {
    throw new LiepinError("响应缺少 pagination，通常意味着请求参数非法", "PARSE_FAILED")
  }

  const inner = asRecord(data.data)
  const rawCards = Array.isArray(inner.jobCardList) ? inner.jobCardList : []

  const cards: LiepinJobCard[] = []
  // 静默丢卡必须计数：否则字段结构变更（如某次重构写错字段路径）只会表现为
  // cards.length 悄悄变少，事后无法分辨是「数据本身脏」还是「解析代码有 bug」。
  let skipped = 0
  for (const raw of rawCards) {
    // 每张卡独立解析：单张畸形不影响其余。
    try {
      const card = asRecord(raw)
      const job = asRecord(card.job)
      const comp = asRecord(card.comp)
      const recruiter = asRecord(card.recruiter)

      const id = coerceStr(job.jobId)
      const title = str(job.title)
      const link = str(job.link)
      if (!id || !title || !link) {
        skipped++
        continue
      }

      const salary = str(job.salary)
      cards.push({
        id,
        title,
        company: str(comp.compName),
        location: str(job.dq),
        date: refreshTimeToDate(coerceStr(job.refreshTime)),
        url: link,
        salary,
        salaryMonths: parseSalaryMonths(salary),
        eduLevel: str(job.requireEduLevel),
        workYears: str(job.requireWorkYears),
        compScale: str(comp.compScale),
        compIndustry: str(comp.compIndustry),
        compStage: str(comp.compStage),
        recruiterTitle: str(recruiter.recruiterTitle),
        recruiterSurname: surnameOf(recruiter.recruiterName),
        isHeadhunter: coerceStr(job.jobKind) === "1",
      })
    } catch {
      skipped++
      continue
    }
  }

  // 接口给了卡片却一张都没解析成功 —— 这几乎不可能是「数据脏」，
  // 而是猎聘改了字段结构。必须抛错，不能返回空数组让上层读成「没有匹配职位」。
  if (rawCards.length > 0 && cards.length === 0) {
    throw new LiepinError(
      `接口返回 ${rawCards.length} 条职位卡但一条都没解析成功，` +
        "通常意味着猎聘改了字段结构 —— 解析锚点见 url-reference.md",
      "PARSE_FAILED",
    )
  }

  return {
    cards,
    totalPage: pagination.totalPage,
    currentPage: pagination.currentPage,
    // totalCounts 已知不可信（接口报 ~800 但 totalPage 只有 10 页 = 400 条），
    // 原样透传仅供参考，不要用它做「共 N 条」这类展示。
    totalCounts: pagination.totalCounts,
    skipped,
  }
}

/**
 * 提取详情页正文。
 * 企业直招页（/job/<id>.shtml）与猎头职位页（/a/<id>.shtml）都用同一个锚点
 * <dd data-selector="job-intro-content">，且在两种页面里都恰好出现一次。
 * 正文里的换行是字面 \n，不需要还原 <br>。
 */
export function extractIntro(html: string): string | null {
  const open = html.match(/<dd[^>]*data-selector="job-intro-content"[^>]*>/i)
  if (!open || open.index === undefined) return null
  const start = open.index + open[0].length
  const end = html.indexOf("</dd>", start)
  if (end === -1) return null

  const raw = html.slice(start, end)
  const text = decodeHtmlEntities(raw.replace(/<[^>]+>/g, ""))
  const normalized = text
    .split("\n")
    // [^\S\n] = 除换行外的任意空白（空格、制表符、全角空格）。逐行压缩，保住段落结构。
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return normalized || null
}

/**
 * 从 <title> 标签内容里取出职位名。
 * 猎聘详情页没有 <h1>，标题只能从 <title> 里抠：格式固定为
 * 「【<城市> <职位名>招聘】-<后缀>-猎聘」（后缀企业直招页是公司名，猎头页是「猎头顾问」）。
 * 取「【」与「招聘】」之间的内容，再去掉开头的城市名（第一个空格之前的部分）与首尾空白。
 * 职位名本身可能含空格、括号，也可能带尾随空格，所以只从第一个空格切一刀，其余原样保留后 trim。
 * 格式对不上（或没有 <title>）时回落到占位符，不抛错——毕竟这只是辅助锚点。
 */
function parseTitleFromTitleTag(titleTagContent: string): string {
  const raw = decodeHtmlEntities(titleTagContent)
  const m = raw.match(/【([^】]*)招聘】/)
  if (!m) return "(未取到标题)"
  const inner = m[1]!
  const spaceIdx = inner.indexOf(" ")
  const withoutCity = spaceIdx === -1 ? inner : inner.slice(spaceIdx + 1)
  const title = withoutCity.trim()
  return title || "(未取到标题)"
}

/**
 * 定位详情页里 schema.org 的 JobPosting 结构化数据块。
 * 页面里有两个 `<script type="application/ld+json">` 块：第一个是百度站内搜索用的
 * `cambrian.jsonld`（没有 `@type`，`title` 字段就是整串 `<title>` 文本，没用）；
 * 第二个才是 `"@type": "JobPosting"`，字段干净可靠。不假设它总是第几个，按内容找。
 */
function findJobPostingLdJson(html: string): string | null {
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    if (/"@type"\s*:\s*"JobPosting"/.test(m[1]!)) return m[1]!
  }
  return null
}

/**
 * 从一段 JSON 文本（不要求整段本身合法）里按 key 提取字符串字段值。
 * 用标准 JSON 字符串转义规则匹配（`(?:[^"\\]|\\.)*`），正确处理值里出现的转义引号
 * `\"`；抓到引号内的原始内容后套一对引号丢给 JSON.parse 还原转义序列，
 * 而不是自己写反转义逻辑。
 */
function extractJsonStringField(source: string, key: string): string | null {
  const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`)
  const m = source.match(re)
  if (!m) return null
  try {
    return JSON.parse(`"${m[1]}"`) as string
  } catch {
    return null
  }
}

/**
 * 从一段 JSON 文本里按 key 取出对象字段的原始子串（含花括号），供进一步嵌套提取。
 * 用括号计数（跳过字符串内的花括号）定位匹配的右花括号，不依赖整段文本合法 ——
 * 这正是这里要处理的场景：ld+json 块的 description 字段值含裸换行，整段非法 JSON，
 * 但只要不去 JSON.parse 整段，逐字符扫描花括号配对不受影响。
 *
 * 也容忍 schema.org 允许的数组形态 `"key": [ {…}, … ]`（如 jobLocation 是 Place 数组、
 * hiringOrganization 偶为数组）：匹配到首个 `{` 后即从该对象起做花括号配对，取数组第一个
 * 对象；末尾的 `]` 不参与配对、无害。
 */
function extractJsonObjectField(source: string, key: string): string | null {
  const m = source.match(new RegExp(`"${key}"\\s*:\\s*\\[?\\s*\\{`))
  if (!m || m.index === undefined) return null
  let i = m.index + m[0].length
  let depth = 1
  let inString = false
  for (; i < source.length; i++) {
    const c = source[i]
    if (inString) {
      if (c === "\\") {
        i++
        continue
      }
      if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      continue
    }
    if (c === "{") depth++
    else if (c === "}") {
      depth--
      if (depth === 0) break
    }
  }
  if (depth !== 0) return null
  return source.slice(m.index, i + 1)
}

/** 解析详情页。搜索结果里已有的字段由调用方合并，这里只补正文、标题、公司名、地点。 */
export function parseJobDetail(html: string, id: string, url: string): LiepinJobDetail {
  // 优先用 JSON-LD 的 JobPosting 结构化数据 —— 比任何 HTML class/id 锚点都可靠，
  // 页面改版通常不会动 SEO 用的结构化数据。
  //
  // 注意：这个块**不能直接 JSON.parse**。它的 description 字段值里混着裸换行符，
  // 是非法 JSON（实测报 `Invalid control character`）。这里只对 title、
  // hiringOrganization.name/sameAs、jobLocation.address.streetAddress 这几个
  // 本身不含裸换行的字段做定向正则提取，不去动 description，避免这个坑。
  // 千万不要图省事把整块丢给 JSON.parse —— 会在真实页面上直接抛错。
  const ldJson = findJobPostingLdJson(html)

  let ldTitle: string | null = null
  let company: string | null = null
  let location: string | null = null
  if (ldJson) {
    ldTitle = extractJsonStringField(ldJson, "title")
    const org = extractJsonObjectField(ldJson, "hiringOrganization")
    company = org ? extractJsonStringField(org, "name") : null
    const jobLocation = extractJsonObjectField(ldJson, "jobLocation")
    const address = jobLocation ? extractJsonObjectField(jobLocation, "address") : null
    location = address ? extractJsonStringField(address, "streetAddress") : null
  }

  // <title> 标签解析是兜底：JSON-LD 缺失或取不到 title 时才用。两者都没有则用占位符。
  let title = ldTitle?.trim() || null
  if (!title) {
    const titleTagMatch = html.match(/<title>([\s\S]*?)<\/title>/i)
    title = titleTagMatch ? parseTitleFromTitleTag(titleTagMatch[1]!) : null
  }
  title = title || "(未取到标题)"

  // 锚点是 class="salary"（精确匹配，不是 job-salary）。job-salary 命中的是侧边栏
  // 「相似职位推荐」卡片，不是当前职位——旧实现踩过这个坑，混进了别的职位的薪资。
  // JSON-LD 的 baseSalary 字段没有实际数值（unitText 之外没有金额），不可用。
  const salaryMatch = html.match(/<span class="salary">([\s\S]*?)<\/span>/i)
  const salary = salaryMatch ? clean(salaryMatch[1]!) || null : null

  return {
    id,
    title,
    company: company?.trim() || null,
    location: location?.trim() || null,
    date: null,
    url,
    salary,
    salaryMonths: parseSalaryMonths(salary),
    eduLevel: null,
    workYears: null,
    compScale: null,
    compIndustry: null,
    compStage: null,
    recruiterTitle: null,
    // 详情页不带招聘者对象 —— 和它旁边那几个 null 同因（见 SKILL.md：
    // 这几项要从 `search` 的结果里取）。
    recruiterSurname: null,
    isHeadhunter: url.includes("/a/"),
    description: extractIntro(html),
  }
}
