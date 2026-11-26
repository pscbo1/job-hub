import {
  DETAIL_A_BASE,
  DETAIL_JOB_BASE,
  htmlFetch,
  LiepinError,
  parseJobDetail,
  writeError,
} from "../helpers.ts"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

interface Target {
  id: string
  urls: string[]
}

/**
 * 解析用户传入的 id 或 URL。
 * 猎聘详情页有两种路径：企业直招 /job/<id>.shtml，猎头职位 /a/<id>.shtml。
 * 传完整 URL 时路径已确定；只传裸 id 时无法判断，两条路径依次尝试
 * （走空的那条会抛 NOT_FOUND —— 猎聘对不存在的详情页返回 HTTP 200 的「此页面
 * 似乎不存在」页，不是 404；runDetail 里对它 continue，见那处注释）。
 *
 * 代价：裸数字 id 先试 /job/ 再试 /a/，猎头职位（/a/）每次都要先发一次必然 404
 * 的 /job/ 请求才能落到正确路径，多耗一次对猎聘的访问——而本项目对猎聘的原则是
 * 低频访问。这里不改回退逻辑本身（无法从纯数字 id 判断类型），只是让代价可见：
 * 调用方应尽量传完整 URL，见 url-reference.md「详情页」一节。
 */
function resolveTarget(input: string): Target | null {
  const fromUrl = input.match(/liepin\.com\/(job|a)\/(\d+)\.shtml/)
  if (fromUrl) {
    const base = fromUrl[1] === "a" ? DETAIL_A_BASE : DETAIL_JOB_BASE
    return { id: fromUrl[2]!, urls: [`${base}/${fromUrl[2]}.shtml`] }
  }
  const bare = input.match(/^(\d{6,})$/)
  if (bare) {
    return {
      id: bare[1]!,
      urls: [`${DETAIL_JOB_BASE}/${bare[1]}.shtml`, `${DETAIL_A_BASE}/${bare[1]}.shtml`],
    }
  }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const target = resolveTarget(opts.id)
  if (!target) {
    writeError(`无法从 "${opts.id}" 解析出职位 ID`, "BAD_ID")
    return 1
  }

  try {
    let html = ""
    let usedUrl = ""
    for (const url of target.urls) {
      try {
        html = await htmlFetch(url)
      } catch (e) {
        // 猎聘对不存在的详情页**返回 HTTP 200**加一个「此页面似乎不存在」页，
        // helpers 把它抛成 NOT_FOUND（见 network-boundary.test.ts 的 B1b）。
        //
        // 裸 id 分不出企业直招还是猎头，要依次试 /job/ 与 /a/ —— 走空的那一条是
        // **预期中的一步**，不是终局。这里原来等的是「htmlFetch 返回空串」，
        // 软 404 改成抛之后循环第一次就被掀出去：猎头职位用裸 id 永远取不到，
        // 还报「大概率已下线，请标记为过期」，把活着的岗写成 expired。
        //
        // 只吞掉「还有下一条可试」时的 NOT_FOUND：候选只剩一条、或别的错误码
        // （限流、解析失败）一律照抛，那些是真结论。
        const last = url === target.urls[target.urls.length - 1]
        if (!last && e instanceof LiepinError && e.code === "NOT_FOUND") continue
        throw e
      }
      if (html) {
        usedUrl = url
        break
      }
    }

    if (!html) {
      writeError("职位不存在或已下线", "NOT_FOUND")
      return 1
    }

    const job = parseJobDetail(html, target.id, usedUrl)

    if (!job.description) {
      writeError(
        "取到了页面但没解析出正文，通常意味着猎聘改了 markup —— 解析锚点见 url-reference.md",
        "PARSE_FAILED",
      )
      return 1
    }

    if (opts.format === "plain") {
      // company 现在从详情页的 JSON-LD 结构化数据解析（见 helpers.ts parseJobDetail），
      // 取不到时才是 null——所以只在有值时才拼公司名，避免留下多余的破折号。
      const salaryPart = job.salary ? `薪资：${job.salary}` : "薪资：面议或未取到"
      const lines = [
        job.title + (job.isHeadhunter ? "（猎头职位）" : ""),
        job.company ? `${job.company} · ${salaryPart}` : salaryPart,
        "",
        job.description,
        "",
        `URL: ${job.url}`,
      ]
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    // 不靠正则匹配错误消息文本来分类 —— 措辞一变分类就静默出错。
    // 所有抛错点都用 LiepinError 带上 code，这里直接读取。
    const code = e instanceof LiepinError ? e.code : "DETAIL_FAILED"
    const msg = e instanceof Error ? e.message : String(e)
    writeError(msg, code)
    return 1
  }
}
