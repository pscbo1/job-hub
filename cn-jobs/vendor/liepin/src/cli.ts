#!/usr/bin/env node
// 猎聘公开职位搜索 CLI。免登录、零运行时依赖，Node 22.18+ 或 bun 都能跑。
//
// shebang 走 node：`package.json` 的 `bin` 指着本文件，POSIX 上
// `npx liepin-search` / `npm link` 是**通过这一行**执行它的 ——
// 原来写死 `env bun`，在只有 node 的机器上直接 `env: 'bun': No such file
// or directory`，而「只有 node 也能跑」正是那次迁移的全部目的。
// Node 22.18+ 原生认 TypeScript（type stripping），不需要额外的 loader。
//
// 仅供个人求职使用：猎聘 www 主机的 robots.txt 禁止带查询串的路径，
// 且站点部署了风控脚本。请保持低频，不要用于商业用途或批量采集，风险自负。

import { runSearch, type SearchOpts } from "./commands/search.ts"
import { runDetail, type DetailOpts } from "./commands/detail.ts"
import { resolveCity, knownCityNames } from "./cities.ts"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

// 布尔 flag：永不消费后续 token，即使后面紧跟着看起来像值的东西。
// 少了这个名单，"-h detail" 会把 "detail" 当成 -h 的值吃掉，cmd 变空，
// 显式求助反而以退出码 1 收场。
const BOOLEAN_FLAGS = new Set(["help", "h"])

export function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      // 负数值（如 --limit -1 的 "-1"）以 "-" 开头，但仍然是本 flag 的值，
      // 不能被误判成「下一个 flag」。
      const nextIsValue = next !== undefined && (!next.startsWith("-") || /^-\d/.test(next))
      if (BOOLEAN_FLAGS.has(key) || !nextIsValue) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

/**
 * 严格校验整数字面量：只接受完整的（可带前导负号的）数字串。
 *
 * `parseInt("3abc", 10)` 会得到 3 而不是 NaN，导致 --page 3abc、--jobage 7xyz、
 * --limit 5oops 这类脏输入静默通过校验。这里改成整串匹配，拒绝任何拖尾垃圾字符。
 */
export function parseStrictInt(raw: string): number | null {
  return /^-?\d+$/.test(raw) ? parseInt(raw, 10) : null
}

const HELP = `liepin-cli — 搜索猎聘公开职位

用法
  node src/cli.ts search -q "<关键词>" -l "<城市>" [参数]
  node src/cli.ts detail <id|url> [--format json|plain]

搜索参数
  --query, -q <文本>      关键词（职位名、技能）。必填。
  --location, -l <城市>   城市中文名或猎聘城市码。必填。例：北京、上海、深圳。
  --jobage <天数>         只保留 N 天内更新的职位（客户端过滤）。默认不限。
  --page <n>              页码，1 起始，上限 10 页。默认 1。
  --limit, -n <n>         客户端截断结果条数。
  --edu <码>              学历要求筛选（猎聘 eduLevel 码）。
  --years <码>            工作年限筛选（猎聘 workYearCode）。
  --salary <码>           薪资区间筛选（猎聘 salary 码）。
  --comp-scale <码>       公司规模筛选（猎聘 compScale 码）。
  --industry <码>         行业筛选（猎聘 industry 码）。
  --format <格式>         json（默认）| table | plain。

示例
  node src/cli.ts search -q "后端开发" -l "北京" --jobage 14 --format table
  node src/cli.ts search -q "产品经理" -l "上海" --limit 10 --format plain
  node src/cli.ts search -q "数据分析" -l "深圳" --page 2
  node src/cli.ts detail 1983665159 --format plain

仅供个人求职使用，请保持低频访问。
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    const query = typeof flags.query === "string" ? flags.query : undefined
    if (!query) {
      process.stderr.write(
        JSON.stringify({ error: "必须提供 --query/-q 关键词", code: "NO_QUERY" }) + "\n",
      )
      return 1
    }

    const location = typeof flags.location === "string" ? flags.location : undefined
    if (!location) {
      process.stderr.write(
        JSON.stringify({
          error: '必须提供 --location/-l 城市，例如 -l "北京"',
          code: "NO_LOCATION",
        }) + "\n",
      )
      return 1
    }

    const cityCode = resolveCity(location)
    if (!cityCode) {
      process.stderr.write(
        JSON.stringify({
          error: `无法识别城市「${location}」。已知城市：${knownCityNames().join("、")}。也可直接传猎聘城市码。`,
          code: "BAD_CITY",
        }) + "\n",
      )
      return 1
    }

    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      const val = typeof raw === "string" ? parseStrictInt(raw) : null
      if (val === null) {
        process.stderr.write(
          JSON.stringify({ error: `--${name} 必须是数字，收到 "${String(raw)}"`, code: "BAD_ARG" }) +
            "\n",
        )
        return null
      }
      return val
    }

    for (const name of ["jobage", "page", "limit"]) {
      if (flags[name] !== undefined) {
        const v = parseIntFlag(name, flags[name]!)
        if (v === null) return 1
        flags[name] = String(v)
      }
    }

    const fmt = (flags.format as string) || "json"
    const opts: SearchOpts = {
      query,
      cityCode,
      cityLabel: location,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : 9999,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      edu: typeof flags.edu === "string" ? flags.edu : undefined,
      years: typeof flags.years === "string" ? flags.years : undefined,
      salary: typeof flags.salary === "string" ? flags.salary : undefined,
      compScale: typeof flags["comp-scale"] === "string" ? flags["comp-scale"] : undefined,
      industry: typeof flags.industry === "string" ? flags.industry : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(
        JSON.stringify({ error: "detail 需要一个 <id|url> 参数", code: "NO_ID" }) + "\n",
      )
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = { id, format: fmt === "plain" ? "plain" : "json" }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `未知命令 "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

// 只在直接作为入口执行时才跑 main() —— 测试里 import 本文件（拿 parseFlags
// 等纯函数做单元测试）不应该触发真正的命令分发或进程退出。
//
// ⚠️ **用 `process.exitCode` 设退出码，不要用 `process.exit()`。**
// `htmlFetch`/`jsonFetch` 用了 `AbortSignal.timeout(15000)`，fetch 提前完成时那个
// 定时器还挂着。`process.exit()` 会在句柄正在关闭的当口强杀进程，Windows 上稳定触发
//
//     Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c
//
// 现象极具迷惑性：**JSON 已经完整写到 stdout 了，退出码却是 127**。
// 而 `scrape.md` 明确要求「CLI 非零退出就记录错误并继续」——于是每一条 detail
// 结果都被当成失败丢掉。实测 detail 100% 复现（search 不受影响，它只发一次请求）。
//
// `AbortSignal.timeout()` 的定时器是 unref 的，不会拖住事件循环，所以设了 exitCode
// 之后 Node 照样立刻退出（实测 0.5s 内）。
if (import.meta.main) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((e) => {
      process.stderr.write(
        JSON.stringify({
          error: e instanceof Error ? e.message : String(e),
          code: "INTERNAL_ERROR",
        }) + "\n",
      )
      process.exitCode = 1
    })
}
