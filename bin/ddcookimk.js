#!/usr/bin/env node
"use strict";

/**
 * ddcookimk —— 抖音 Web 访客凭据（ttwid / UIFID_TEMP）的组装与校验。
 *
 * 它只做三件事：
 *   1. 调用抖音公开的 ttwid 注册端点拿 ttwid；
 *   2. 把你**手工**从浏览器里取到的 UIFID_TEMP 与它拼成 Cookie 头；
 *   3. 校验这份 Cookie 是否真的可用（推荐走 vidlink 的解析接口，给确定结论）。
 *
 * 不抓挑战页、不执行平台下发的脚本、不算任何签名、不批量铸造身份。
 * 原因与边界写在 README「它不做什么」一节，那里是实测结论而不是免责套话。
 */

const fs = require("fs");
const path = require("path");

const { parseCookie, inspect, assemble, redact, redactCookie, KEY_TTWID, KEY_UIFID } =
  require("../lib/cookie");
const { registerTtwid } = require("../lib/ttwid");
const { formatReport, probePresence, checkViaVidlink } = require("../lib/verify");

const USAGE = `
ddcookimk —— 抖音 Web 访客凭据（ttwid / UIFID_TEMP）的组装与校验

用法：
  ddcookimk ttwid                       自助注册一个 ttwid（抖音公开端点）
  ddcookimk assemble [选项]             拼出可直接使用的 Cookie 头
  ddcookimk verify   [选项]             校验凭据（形状 + 可选端到端）

assemble 选项：
  --ttwid <值>          直接给 ttwid
  --uifid <值>          直接给 UIFID_TEMP（手工从浏览器取的）
  --cookie <串>         给一整段 Cookie（a=1; b=2），自动识别两个键
  --file <路径>         从文件读 Cookie 串（便于把手工步骤的结果存起来）
  --extra <k=v>         追加额外键，可重复
  --json                以 JSON 输出（便于脚本消费）
  --export              输出 export VIDLINK_COOKIE_DOUYIN='...' 一行

verify 选项：
  以上全部，外加：
  --probe               直接问抖音 detail 端点（提示性，不给确定结论；会联网）
  --base <URL>          用 vidlink 服务端到端验证（推荐；会消耗一次解析配额）
  --key <API Key>       vidlink 的 Key（走 X-API-Key 头）
  --url <分享链接>       要解析的抖音链接
  --json                以 JSON 输出

示例：
  # ① 拿 ttwid（公开端点，一次即可，长期复用）
  ddcookimk ttwid

  # ② 手工取 UIFID_TEMP（见 README 的三步图），然后拼装
  ddcookimk assemble --ttwid "$TTWID" --uifid "$UIFID" --export

  # ③ 校验：给它一个能真打抖音的客户端（最可靠）
  ddcookimk verify --cookie "$VIDLINK_COOKIE_DOUYIN" \\
      --base https://vl.wzml.cc.cd --key vl_public \\
      --url 'https://v.douyin.com/xxxx/'

退出码：0 成功；1 校验未通过；2 用法错误。
`.trim();

/** 极简参数解析：只认 `--flag value` 与 `--flag`，没有依赖。 */
function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const name = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        if (name === "extra") {
          flags.extra = flags.extra || [];
          flags.extra.push(next);
        } else {
          flags[name] = next;
        }
        i++;
      } else {
        flags[name] = true;
      }
    } else {
      rest.push(a);
    }
  }
  return { flags, rest };
}

function die(msg, code = 2) {
  console.error(msg);
  process.exit(code);
}

/** 把命令行/文件里的输入统一成 {ttwid, uifidTemp, extras}。 */
function collectParts(flags) {
  let parts = { ttwid: "", uifidTemp: "", extras: {} };
  if (flags.file) {
    const p = path.resolve(String(flags.file));
    if (!fs.existsSync(p)) die(`读不到文件：${p}`);
    parts = parseCookie(fs.readFileSync(p, "utf8"));
  }
  if (flags.cookie) {
    const c = parseCookie(flags.cookie);
    parts = { ttwid: c.ttwid || parts.ttwid, uifidTemp: c.uifidTemp || parts.uifidTemp, extras: Object.assign({}, parts.extras, c.extras) };
  }
  if (flags.ttwid) parts.ttwid = String(flags.ttwid);
  if (flags.uifid) parts.uifidTemp = String(flags.uifid);
  for (const kv of flags.extra || []) {
    const eq = kv.indexOf("=");
    if (eq > 0) parts.extras[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim();
  }
  return parts;
}

function printReport(rep, { json } = {}) {
  if (json) {
    console.log(JSON.stringify(rep, null, 2));
    return;
  }
  console.log(`凭据（掩码）：${rep.mask}`);
  for (const w of rep.warnings) console.log(`  ⚠ ${w}`);
  for (const e of rep.errors) console.log(`  ✗ ${e}`);
  if (rep.ok && !rep.warnings.length) console.log("  形状检查通过");
}

async function cmdTtwid(flags) {
  const { ttwid, status } = await registerTtwid();
  if (flags.json) {
    console.log(JSON.stringify({ ttwid, http_status: status }, null, 2));
  } else {
    console.log(`ttwid（HTTP ${status}）：${ttwid}`);
    console.log("");
    console.log("下一步：手工取 UIFID_TEMP（见 README），然后：");
    console.log(`  ddcookimk assemble --ttwid '${ttwid}' --uifid '<你取到的值>' --export`);
  }
}

function cmdAssemble(flags) {
  const parts = collectParts(flags);
  const rep = formatReport(parts);
  if (flags.json) {
    // 一次只输出**一个** JSON 文档，方便 `| jq` 或脚本直接消费
    console.log(JSON.stringify(Object.assign({}, rep, { cookie: rep.ok ? assemble(parts) : "" }), null, 2));
    process.exit(rep.ok ? 0 : 1);
  }
  printReport(rep);
  if (!rep.ok) {
    console.error("");
    console.error("拼不出来：上面的错误需要先解决（UIFID_TEMP 的取法见 README）。");
    process.exit(1);
  }
  const cookie = assemble(parts);
  if (flags.export) {
    console.log("");
    console.log(`export VIDLINK_COOKIE_DOUYIN='${cookie}'`);
  } else {
    console.log("");
    console.log(cookie);
  }
}

async function cmdVerify(flags) {
  const parts = collectParts(flags);
  const rep = formatReport(parts);
  const result = { shape: rep, probe: null, end_to_end: null };

  if (!flags.json) printReport(rep);
  if (!rep.ok) {
    if (flags.json) console.log(JSON.stringify(result, null, 2));
    console.error("");
    console.error("形状就不对，先修好再校验（UIFID_TEMP 的取法见 README）。");
    process.exit(1);
  }
  const cookie = assemble(parts);

  if (flags.probe) {
    const p = await probePresence({ cookie });
    result.probe = p;
    if (!flags.json) {
      console.log("");
      console.log("存在性探针（提示性，不足以定论）：");
      console.log(`  ${p.evidence}`);
    }
  }

  if (flags.base || flags.key || flags.url) {
    const e = await checkViaVidlink({ base: flags.base, key: flags.key, url: flags.url });
    result.end_to_end = e;
    if (!flags.json) {
      console.log("");
      console.log("端到端校验（vidlink）：");
      if (e.ok) {
        console.log(`  ✓ 可用：取到直链 ${redact(e.direct)}`);
        console.log(`    本次消耗 ${e.quota.consumed ?? "?"}，剩余 ${e.quota.remaining ?? "?"}`);
      } else if (e.error) {
        console.log(`  ✗ HTTP ${e.status} ${e.error.kind}：${e.error.message}`);
      } else {
        console.log(`  ✗ HTTP ${e.status}：响应里没有直链`);
      }
    }
  }

  if (flags.json) console.log(JSON.stringify(result, null, 2));
  const bad = (result.probe && result.probe.accepted === false) ||
    (result.end_to_end && !result.end_to_end.ok);
  process.exit(bad ? 1 : 0);
}

async function main() {
  const argv = process.argv.slice(2);
  const { flags, rest } = parseArgs(argv);
  const cmd = rest[0] || (flags.help ? "help" : "");

  switch (cmd) {
    case "ttwid":
      await cmdTtwid(flags);
      return;
    case "assemble":
    case "build":
      cmdAssemble(flags);
      return;
    case "verify":
    case "check":
      await cmdVerify(flags);
      return;
    case "help":
    case "":
      console.log(USAGE);
      process.exit(cmd === "" ? 2 : 0);
      return;
    default:
      console.error(`未知子命令：${cmd}\n`);
      console.log(USAGE);
      process.exit(2);
  }
}

// 只有直接执行时才跑 CLI：`node --test` 里 require 本文件只取那几个纯函数。
if (require.main === module) {
  main().catch((err) => {
    console.error(`失败：${err && err.message ? err.message : err}`);
    process.exit(1);
  });
}

module.exports = { parseArgs, collectParts, USAGE, redactCookie, KEY_TTWID, KEY_UIFID, inspect };
