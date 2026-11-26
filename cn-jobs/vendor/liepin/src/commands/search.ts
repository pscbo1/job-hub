import { apiFetch, parseJobCards, writeError, LiepinError, type LiepinJobCard } from "../helpers.ts"

export interface SearchOpts {
  query: string
  cityCode: string
  cityLabel: string
  jobage: number
  page: number
  limit?: number
  edu?: string
  years?: string
  salary?: string
  compScale?: string
  industry?: string
  format: "json" | "table" | "plain"
}

/** 猎聘每页固定返回 40 条本市 + 2 条非本市推广位，pageSize 恒传 40。 */
const PAGE_SIZE = 40

function buildBody(opts: SearchOpts): unknown {
  return {
    data: {
      mainSearchPcConditionForm: {
        city: opts.cityCode,
        dq: opts.cityCode,
        pubTime: "",
        currentPage: opts.page - 1, // 猎聘 currentPage 从 0 起
        pageSize: PAGE_SIZE,
        key: opts.query,
        suggestTag: "",
        workYearCode: opts.years ?? "0",
        compId: "",
        compName: "",
        compTag: "",
        industry: opts.industry ?? "",
        salary: opts.salary ?? "",
        jobKind: "",
        compScale: opts.compScale ?? "",
        compKind: "",
        compStage: "",
        eduLevel: opts.edu ?? "",
      },
      passThroughForm: {
        scene: "init",
        skeyword: opts.query,
        sfrom: "search_job_pc",
      },
    },
  }
}

/**
 * 取北京时间（UTC+8）的日历日期 YYYY-MM-DD。
 *
 * 职位卡的 date 来自猎聘的 refreshTime，是北京本地日历日期。用 UTC 日期
 * 去比较会在北京 00:00–08:00 这段时间少算一天，让 --jobage N 放进 N+1 天前的职位。
 */
export function beijingDate(ms: number): string {
  return new Date(ms + 8 * 3600_000).toISOString().slice(0, 10)
}

/**
 * 按发布时间过滤。
 * 猎聘的 pubTime 参数是哑的（传「一天内」照样返回两年前的职位），
 * 所以必须在客户端按 refreshTime 过滤。
 *
 * **两种被丢掉的要分开数，不能只报一个 count。**
 * `refreshTime` 不是每张卡都有：实测该用户职位库里 2232 个猎聘岗只有
 * 259 个带日期（12%）。没有日期的一律丢掉是保守的选择（无从验证新鲜度），
 * 但**丢了多少必须报出来**，因为两种原因指向完全相反的动作：
 *
 * - `tooOld` 多 → 这个词确实挖到底了，该换词；
 * - `noDate` 多 → 丢掉的**可能全是新岗**，该考虑这一轮别传 `--jobage`。
 *
 * 不报的代价在下游：`query_yield` 按产出剪掉「挖空的词」——
 * 一个词的结果全因缺日期被丢掉，它就会被当成挖空剪掉，而那是误判。
 * 这个仓库对「沉默的截断」一贯的规矩：数给出来，停不停由人定。
 */
export interface AgeFilterResult {
  cards: LiepinJobCard[]
  /** 有日期、但早于截止日 —— 过滤器在按预期工作。 */
  tooOld: number
  /** **压根没有日期，被一起丢掉了。** 见下面那段说明。 */
  noDate: number
}

export function filterByAge(
  cards: LiepinJobCard[],
  days: number,
  nowMs: number = Date.now(),
): AgeFilterResult {
  if (!days || days <= 0 || days >= 9999) {
    return { cards, tooOld: 0, noDate: 0 }
  }
  const cutoffISO = beijingDate(nowMs - days * 86400_000)
  let tooOld = 0
  let noDate = 0
  const kept = cards.filter((c) => {
    if (c.date === null) {
      noDate++
      return false
    }
    if (c.date < cutoffISO) {
      tooOld++
      return false
    }
    return true
  })
  return { cards: kept, tooOld, noDate }
}

/**
 * 判断码点是否为「宽字符」（在等宽终端里占 2 列显示宽度）。
 * 覆盖常见的东亚全角区间：CJK 统一表意文字及其扩展、假名、谚文音节、
 * CJK 兼容表意文字、全角 ASCII/标点等，含星形平面的 CJK 扩展 B 及以上。
 */
function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // 谚文字母
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) || // CJK 部首补充 ~ 彦文字母扩展
    (cp >= 0xac00 && cp <= 0xd7a3) || // 谚文音节
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK 兼容表意文字
    (cp >= 0xfe30 && cp <= 0xfe6f) || // 竖排标点、小写变体、全角形式
    (cp >= 0xff00 && cp <= 0xff60) || // 全角 ASCII、全角标点
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x3fffd) // CJK 扩展 B 及以上（星形平面）
  )
}

/**
 * 计算字符串在等宽终端里的显示宽度。
 *
 * `String.prototype.length`/`padEnd` 按 UTF-16 码元计数，而中日韩全角字符
 * 在终端里占 2 列——职位名、公司名、地点几乎全是中文，所以这不是边角情况
 * 而是默认场景，每一行都会因此右移错位。用 for...of 按码点（而不是码元）
 * 迭代，代理对（星形平面的 CJK 扩展字）会被当成一个字符正确处理。
 */
export function displayWidth(s: string): number {
  let width = 0
  for (const ch of s) {
    width += isWide(ch.codePointAt(0)!) ? 2 : 1
  }
  return width
}

/** 先按显示宽度截断（不切断代理对/宽字符），再补齐空格到目标显示宽度。 */
export function padTo(s: string, width: number): string {
  let result = ""
  let w = 0
  for (const ch of s) {
    const chWidth = isWide(ch.codePointAt(0)!) ? 2 : 1
    if (w + chWidth > width) break
    result += ch
    w += chWidth
  }
  return result + " ".repeat(Math.max(0, width - w))
}

export function renderTable(cards: LiepinJobCard[]): string {
  if (cards.length === 0) return "没有结果。"
  const header =
    padTo("ID", 11) +
    " " +
    padTo("职位", 30) +
    " " +
    padTo("公司", 22) +
    " " +
    padTo("地点", 16) +
    " " +
    padTo("薪资", 14) +
    " 更新"
  const rows = cards.map((c) => {
    const title = padTo(c.title || "", 30)
    const company = padTo(c.company || "—", 22)
    const loc = padTo(c.location || "—", 16)
    const sal = padTo(c.salary || "—", 14)
    const mark = c.isHeadhunter ? "[猎头]" : ""
    return `${padTo(c.id, 11)} ${title} ${company} ${loc} ${sal} ${c.date || "—"}${mark}`
  })
  return [header, "-".repeat(displayWidth(header)), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const payload = await apiFetch(buildBody(opts))
    const parsed = parseJobCards(payload)

    const aged = filterByAge(parsed.cards, opts.jobage)
    let cards = aged.cards
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}${c.isHeadhunter ? "（猎头职位）" : ""}\n` +
              `  ${c.company || "—"} · ${c.location || "—"} · ${c.salary || "—"}\n` +
              `  ${c.compIndustry || "—"} · ${c.compScale || "—"} · ${c.compStage || "融资阶段未知"}\n` +
              `  要求：${c.workYears || "—"} / ${c.eduLevel || "—"}\n` +
              `  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: {
              count: cards.length,
              page: opts.page,
              totalPage: parsed.totalPage,
              city: opts.cityLabel,
              hasNext: opts.page < parsed.totalPage,
              // 解析失败被跳过的卡片数。非 0 就是信号：要么数据脏，要么猎聘改了结构。
              skipped: parsed.skipped,
              // `--jobage` 丢掉的两类。**分开报**：`tooOld` 是过滤器在干活，
              // `noDate` 是「这张卡没有日期，所以一并丢了」—— 后者可能是新岗。
              // 判据见 `filterByAge` 的注释。
              droppedTooOld: aged.tooOld,
              droppedNoDate: aged.noDate,
            },
            results: cards,
          },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const code = e instanceof LiepinError ? e.code : "SEARCH_FAILED"
    writeError(msg, code)
    return 1
  }
}
