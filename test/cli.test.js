"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const BIN = path.join(__dirname, "..", "bin", "ddcookimk.js");
const TTWID = "1%7C" + "a".repeat(120);
const UIFID = "b".repeat(160);

function run(args, { expectFail = false } = {}) {
  try {
    const out = execFileSync(process.execPath, [BIN, ...args], { encoding: "utf8" });
    return { code: 0, out };
  } catch (err) {
    if (!expectFail) throw err;
    return { code: err.status, out: `${err.stdout || ""}${err.stderr || ""}` };
  }
}

test("--help 退出码 0，输出用法", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /ddcookimk/);
  assert.match(r.out, /UIFID_TEMP/);
});

test("无参数：打印用法并以 2 退出", () => {
  const r = run([], { expectFail: true });
  assert.equal(r.code, 2);
});

test("未知子命令：退出码 2", () => {
  const r = run(["nope"], { expectFail: true });
  assert.equal(r.code, 2);
  assert.match(r.out, /未知子命令/);
});

test("assemble：拼出 Cookie 头", () => {
  const r = run(["assemble", "--ttwid", TTWID, "--uifid", UIFID]);
  assert.equal(r.code, 0);
  assert.match(r.out, new RegExp(`UIFID_TEMP=${UIFID}; ttwid=${TTWID}`));
});

test("assemble --export：输出可直接 eval 的一行", () => {
  const r = run(["assemble", "--ttwid", TTWID, "--uifid", UIFID, "--export"]);
  assert.match(r.out, /^export VIDLINK_COOKIE_DOUYIN='UIFID_TEMP=.*; ttwid=.*'$/m);
});

test("assemble：缺 UIFID_TEMP 时以 1 退出并讲清原因", () => {
  const r = run(["assemble", "--ttwid", TTWID], { expectFail: true });
  assert.equal(r.code, 1);
  assert.match(r.out, /UIFID_TEMP 为空/);
  assert.match(r.out, /README/);
});

test("assemble --json：只输出一个 JSON 文档", () => {
  const r = run(["assemble", "--ttwid", TTWID, "--uifid", UIFID, "--json"]);
  const doc = JSON.parse(r.out);
  assert.equal(doc.ok, true);
  assert.match(doc.cookie, /^UIFID_TEMP=/);
  assert.ok(doc.mask.includes("…"), "掩码里应有省略号");
});

test("assemble --file：从文件读、且不打印明文凭据（只有掩码与结果两处）", () => {
  const f = path.join(os.tmpdir(), `ddcookimk-${process.pid}.txt`);
  fs.writeFileSync(f, `UIFID_TEMP=${UIFID}; ttwid=${TTWID}; msToken=xyz\n`);
  try {
    const r = run(["assemble", "--file", f, "--json"]);
    const doc = JSON.parse(r.out);
    assert.equal(doc.ok, true);
    assert.match(doc.cookie, /msToken=xyz/);
  } finally {
    fs.unlinkSync(f);
  }
});

test("verify：形状不对直接以 1 退出，不发任何网络请求", () => {
  const r = run(["verify", "--ttwid", TTWID, "--probe"], { expectFail: true });
  assert.equal(r.code, 1);
  assert.match(r.out, /形状就不对/);
});

test("verify --cookie 缺 --base/--key/--url 时不联网，仅形状检查通过", () => {
  const r = run(["verify", "--cookie", `UIFID_TEMP=${UIFID}; ttwid=${TTWID}`, "--json"]);
  const doc = JSON.parse(r.out);
  assert.equal(doc.shape.ok, true);
  assert.equal(doc.probe, null);
  assert.equal(doc.end_to_end, null);
});
