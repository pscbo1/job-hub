// 猎聘城市码。全部经真实接口验证：传入码后 jobSubscribeInfo.dqName 回显对应城市名。
//
// 扩充方法（不要猜码）：猎聘主搜索页页脚有城市 SEO 链接
// https://www.liepin.com/city-<slug>/zhaopin/ ，该页为 SSR 且内嵌 `dqCode: <码>`，
// 抓页面后用正则 /dqCode["']?\s*[:=]\s*["']?(\d+)/ 提取即可。

export const CITY_CODES: Readonly<Record<string, string>> = {
  北京: "010",
  上海: "020",
  天津: "030",
  广州: "050020",
  深圳: "050090",
  南京: "060020",
  杭州: "070020",
  合肥: "080020",
  福州: "090020",
  成都: "280020",
}

/**
 * 把用户输入解析成猎聘城市码。
 * 接受中文城市名（可带「市」后缀）或已经是数字码的输入。
 * 无法解析时返回 null，由调用方报错。
 */
export function resolveCity(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (/^\d{3,6}$/.test(trimmed)) return trimmed
  const name = trimmed.endsWith("市") ? trimmed.slice(0, -1) : trimmed
  return CITY_CODES[name] ?? null
}

export function knownCityNames(): string[] {
  return Object.keys(CITY_CODES)
}
