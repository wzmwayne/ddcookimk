"use strict";

/**
 * 极简 Cookie 处理：本项目只关心 ttwid 与 UIFID_TEMP 两个键。
 *
 * 刻意不做成通用 Cookie 库——通用库要处理域、路径、过期、SameSite 等
 * 一大堆与"拼一个请求头"无关的东西，而这个工具的全部价值是**可审计**：
 * 一个文件读完，就知道它到底对你的凭据做了什么（只是解析、校验、拼接、
 * 打印掩码，不发往任何地方）。
 */

const KEY_TTWID = "ttwid";
const KEY_UIFID = "UIFID_TEMP";

// 抖音这两个值的实测长度：UIFID_TEMP ≈ 160 字符，ttwid ≈ 127 字符。
// 这里只当作"看起来不对"的告警阈值，不做硬校验——平台改长度不该让工具直接罢工。
const EXPECTED_MIN_LEN = 40;

/**
 * 解析一段 Cookie 头（`a=1; b=2`）或用户直接粘贴的片段。
 * 大小写不敏感地识别 UIFID_TEMP；同名键取最后一次出现（浏览器行为）。
 */
function parseCookie(input) {
  const out = { ttwid: "", uifidTemp: "", extras: {} };
  for (const raw of String(input == null ? "" : input).split(";")) {
    const part = raw.trim();
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name === KEY_TTWID) out.ttwid = value;
    else if (name.toUpperCase() === KEY_UIFID) out.uifidTemp = value;
    else if (name) out.extras[name] = value;
  }
  return out;
}

/** 单个值的形状检查：不允许空白与 `;`（它们会破坏 Cookie 头结构）。 */
function valueProblem(name, value) {
  if (!value) return `${name} 为空`;
  if (/[\s;,"]/.test(value)) return `${name} 含有空白或分隔符（Cookie 值里不允许）`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return `${name} 含有控制字符`;
  return "";
}

/**
 * 检查一组凭据是否"形状上可用"。
 * 返回 { errors, warnings }：errors 会让工具以非 0 退出，warnings 只提示。
 */
function inspect(parts) {
  const errors = [];
  const warnings = [];
  const t = valueProblem(KEY_TTWID, parts.ttwid);
  const u = valueProblem(KEY_UIFID, parts.uifidTemp);
  if (t) errors.push(t);
  if (u) errors.push(u);
  if (!t && parts.ttwid.length < EXPECTED_MIN_LEN) {
    warnings.push(`${KEY_TTWID} 只有 ${parts.ttwid.length} 字符（实测一般约 127），可能被截断了`);
  }
  if (!u && parts.uifidTemp.length < EXPECTED_MIN_LEN) {
    warnings.push(`${KEY_UIFID} 只有 ${parts.uifidTemp.length} 字符（实测一般约 160），可能被截断了`);
  }
  return { errors, warnings };
}

/**
 * 拼成可直接塞进 `Cookie:` 头的字符串。
 * 顺序与抖音服务端的实测行为无关，这里固定 UIFID_TEMP 在前、ttwid 在后，
 * 便于人眼核对与 diff；其余键按传入顺序追加在最后。
 */
function assemble(parts) {
  const out = [];
  if (parts.uifidTemp) out.push(`${KEY_UIFID}=${parts.uifidTemp}`);
  if (parts.ttwid) out.push(`${KEY_TTWID}=${parts.ttwid}`);
  for (const [k, v] of Object.entries(parts.extras || {})) {
    if (k && v && k !== KEY_TTWID && k.toUpperCase() !== KEY_UIFID) out.push(`${k}=${v}`);
  }
  return out.join("; ");
}

/**
 * 掩码：日志与终端输出里不出现完整凭据。
 * 前 6 + 后 4，中间以长度代替——足够认出"是不是同一把"，又不能用。
 */
function redact(value) {
  const s = String(value || "");
  if (s.length <= 12) return s ? `${s.slice(0, 2)}…(${s.length})` : "";
  return `${s.slice(0, 6)}…${s.slice(-4)}(${s.length})`;
}

/** 把整条 Cookie 头掩码化，供日志使用。 */
function redactCookie(cookie) {
  const parts = parseCookie(cookie);
  return assemble({
    ttwid: parts.ttwid ? redact(parts.ttwid) : "",
    uifidTemp: parts.uifidTemp ? redact(parts.uifidTemp) : "",
    extras: parts.extras,
  });
}

module.exports = {
  KEY_TTWID,
  KEY_UIFID,
  EXPECTED_MIN_LEN,
  parseCookie,
  inspect,
  assemble,
  redact,
  redactCookie,
};
