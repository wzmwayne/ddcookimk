"use strict";

/**
 * ttwid 自助注册。
 *
 * `ttwid` 是抖音（ByteDance）**公开提供**的匿名设备标识：它的注册端点
 * 谁都能调，`Set-Cookie` 直接给出结果。这里只做这一件事——不抓挑战页、
 * 不执行平台下发的任何脚本、不解任何签名。
 *
 * `UIFID_TEMP` 则完全不同（服务端只发给通过挑战的客户端），本工具
 * **不尝试自动获取**，只提供手工步骤与校验，见 README。
 */

const REGISTER_URL = "https://ttwid.bytedance.com/ttwid/union/register/";

// 用一个普通桌面浏览器 UA：这不是伪装，单纯因为服务端对空 UA 不友好。
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// aid=1768 是抖音 Web 的公开应用标识；service 指注册入口本身对应的站点。
// 这两个值是端点约定，不是密钥。
const REGISTER_BODY = {
  region: "cn",
  aid: 1768,
  needFid: false,
  service: "www.ixigua.com",
  migrate_info: { ticket: "", source: "node" },
  cbUrlProtocol: "https",
  union: true,
};

/** 构造注册请求（纯函数，便于测试断言请求形状）。 */
function registerRequest({ fetchImpl } = {}) {
  return {
    url: REGISTER_URL,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify(REGISTER_BODY),
    },
    fetchImpl,
  };
}

/**
 * 从响应里挑出 ttwid。
 *
 * 优先用 `headers.getSetCookie()`（Node 18.14+ 有）；退化路径按
 * "分隔符 + 换行/逗号" 切分——注意不能简单按逗号切，`Expires=Wed, 21 Oct …`
 * 里就带逗号，那会把一个 Cookie 劈成两半。
 */
function pickTtwid(res) {
  let raw = [];
  if (res && res.headers && typeof res.headers.getSetCookie === "function") {
    raw = res.headers.getSetCookie();
  } else if (res && res.headers && typeof res.headers.get === "function") {
    const all = res.headers.get("set-cookie") || "";
    raw = all.split(/,(?=\s*[A-Za-z0-9_.-]+=)/);
  }
  for (const line of raw) {
    const m = /(?:^|[;\s])ttwid=([^;]+)/.exec(line || "");
    if (m) return m[1].trim();
  }
  return "";
}

/** 调一次注册端点，返回 ttwid（失败抛错，错误里只说状态码，不带响应体细节）。 */
async function registerTtwid(opts = {}) {
  const { url, init, fetchImpl } = registerRequest(opts);
  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== "function") {
    throw new Error("当前 Node 没有 fetch（需要 Node 18+），或显式传入 fetchImpl");
  }
  const res = await doFetch(url, init);
  const ttwid = pickTtwid(res);
  if (!ttwid) {
    throw new Error(`注册端点未返回 ttwid（HTTP ${res.status}）`);
  }
  return { ttwid, status: res.status };
}

module.exports = {
  REGISTER_URL,
  REGISTER_BODY,
  USER_AGENT,
  registerRequest,
  pickTtwid,
  registerTtwid,
};
