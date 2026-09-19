"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseCookie, inspect, assemble, redact, redactCookie } = require("../lib/cookie");

const TTWID = "1%7C" + "a".repeat(120);
const UIFID = "b".repeat(160);

test("parseCookie 识别两个键并保留其他键", () => {
  const p = parseCookie(`UIFID_TEMP=${UIFID}; ttwid=${TTWID}; msToken=xyz`);
  assert.equal(p.ttwid, TTWID);
  assert.equal(p.uifidTemp, UIFID);
  assert.equal(p.extras.msToken, "xyz");
});

test("parseCookie 对键名大小写不敏感、兼容没有空格的写法", () => {
  const p = parseCookie(`uifid_temp=${UIFID};ttwid=${TTWID}`);
  assert.equal(p.uifidTemp, UIFID);
  assert.equal(p.ttwid, TTWID);
});

test("assemble 固定 UIFID_TEMP 在前、ttwid 在后", () => {
  const out = assemble({ ttwid: TTWID, uifidTemp: UIFID, extras: {} });
  assert.equal(out, `UIFID_TEMP=${UIFID}; ttwid=${TTWID}`);
});

test("assemble 把额外键追加在最后，且不覆盖两个主键", () => {
  const out = assemble({ ttwid: TTWID, uifidTemp: UIFID, extras: { msToken: "m", ttwid: "坏值" } });
  assert.equal(out, `UIFID_TEMP=${UIFID}; ttwid=${TTWID}; msToken=m`);
});

test("inspect：缺键报错，短值只告警", () => {
  const missing = inspect({ ttwid: "", uifidTemp: "" });
  assert.equal(missing.errors.length, 2);
  const short = inspect({ ttwid: "abc", uifidTemp: UIFID });
  assert.equal(short.errors.length, 0);
  assert.equal(short.warnings.length, 1);
  assert.match(short.warnings[0], /ttwid/);
});

test("inspect：值里的空白/分号/控制字符一律拒绝", () => {
  for (const bad of ["a b", "a;b", "a\tb", "a\u0001b", 'a"b']) {
    const r = inspect({ ttwid: bad, uifidTemp: UIFID });
    assert.equal(r.errors.length, 1, `应拒绝 ${JSON.stringify(bad)}`);
  }
});

test("redact 不泄漏完整值，长度信息保留", () => {
  const r = redact(UIFID);
  assert.ok(!r.includes(UIFID));
  assert.match(r, /^b{6}…b{4}\(160\)$/);
  assert.equal(redact(""), "");
  assert.equal(redact("short"), "sh…(5)");
});

test("redactCookie 把两个键都掩码，其他键原样", () => {
  const out = redactCookie(`UIFID_TEMP=${UIFID}; ttwid=${TTWID}; msToken=xyz`);
  assert.ok(!out.includes(UIFID) && !out.includes(TTWID));
  assert.match(out, /msToken=xyz/);
});

test("往返：parse → assemble 幂等（键序归一后）", () => {
  const one = `UIFID_TEMP=${UIFID}; ttwid=${TTWID}`;
  assert.equal(assemble(parseCookie(one)), one);
  assert.equal(assemble(parseCookie(assemble(parseCookie(one)))), one);
});
