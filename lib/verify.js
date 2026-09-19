"use strict";

/**
 * 校验：本工具唯一"上网"的部分，而且刻意做成两种强度。
 *
 *   ① 形状检查（纯本地）：拼出来的 Cookie 头是否合法、值有没有被截断。
 *   ② 端到端检查（推荐）：把它交给一个能真正打抖音的客户端跑一次
 *      —— 本工具直接调用 vidlink 的 `/v1/links`，成功即说明凭据可用。
 *
 * 另有一个可选的"存在性探针"：直接请求抖音的 detail 端点，看服务端是
 * 抱怨 Uifid Not Found，还是给出别的答复。它**只是提示性的**：一个完整
 * 的抖音请求还需要平台签名，而签名不在本项目的范围内（README 有说明）。
 */

const { inspect, assemble, redact } = require("./cookie");

// 抖音 Web detail 端点：不带给定时，若凭据没被接受，实测响应体会出现这句。
const PROBE_URL = "https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=0";
const UIFID_MISSING_MARK = "Uifid Not Found";

/**
 * 形状检查：返回 { ok, errors, warnings, mask }。
 */
function formatReport(parts) {
  const { errors, warnings } = inspect(parts);
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    mask: assemble({
      ttwid: redact(parts.ttwid),
      uifidTemp: redact(parts.uifidTemp),
      extras: {},
    }),
  };
}

/**
 * 存在性探针：报告服务端对这份凭据的"第一句话"。
 *
 * accepted 只是启发式：看到 Uifid Not Found 就说明凭据没送到/没被接受；
 * 没看到这句话**不等于**凭据一定可用（可能被别的风控环节挡下）。
 */
async function probePresence({ cookie, fetchImpl } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== "function") {
    throw new Error("当前 Node 没有 fetch（需要 Node 18+），或显式传入 fetchImpl");
  }
  const res = await doFetch(PROBE_URL, {
    headers: { Cookie: cookie, "User-Agent": require("./ttwid").USER_AGENT },
  });
  const body = await res.text();
  const missing = body.includes(UIFID_MISSING_MARK);
  return {
    status: res.status,
    accepted: !missing && res.status !== 403,
    evidence: missing
      ? `响应里出现「${UIFID_MISSING_MARK}」：这份凭据没有被接受`
      : `HTTP ${res.status}，响应体 ${body.length} 字节（没有出现「${UIFID_MISSING_MARK}」）`,
    snippet: body.slice(0, 200),
  };
}

/**
 * 端到端检查：用 vidlink 的解析接口验证这份 Cookie 真能取到直链。
 *
 * 这是**唯一能给出确定结论**的校验方式：形状对不代表凭据有效，
 * 而"能不能解析出一条抖音直链"是可用性的直接证据。
 * Key 走请求头（vidlink 的 URL 参数只接受签名凭据，明文 Key 会被 403）。
 */
async function checkViaVidlink({ base, key, url, fetchImpl } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  if (!base) throw new Error("缺少 --base（vidlink 服务地址）");
  if (!key) throw new Error("缺少 --key（vidlink 的 API Key）");
  if (!url) throw new Error("缺少 --url（要解析的抖音分享链接）");
  const target = base.replace(/\/+$/, "") + "/v1/links?url=" + encodeURIComponent(url);
  const res = await doFetch(target, { headers: { "X-API-Key": key } });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = { raw: text.slice(0, 200) };
  }
  return {
    status: res.status,
    ok: res.status === 200 && !!(body && body.url),
    direct: (body && body.url) || "",
    quota: {
      consumed: res.headers.get("X-Quota-Consumed"),
      remaining: res.headers.get("X-Quota-Remaining"),
    },
    error: body && body.error ? body.error : null,
    body,
  };
}

module.exports = {
  PROBE_URL,
  UIFID_MISSING_MARK,
  formatReport,
  probePresence,
  checkViaVidlink,
};
