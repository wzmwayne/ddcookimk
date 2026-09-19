"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { REGISTER_URL, REGISTER_BODY, registerRequest, pickTtwid, registerTtwid } = require("../lib/ttwid");
const { formatReport, probePresence, checkViaVidlink, UIFID_MISSING_MARK } = require("../lib/verify");

const TTWID = "1%7C" + "a".repeat(120);
const UIFID = "b".repeat(160);
const COOKIE = `UIFID_TEMP=${UIFID}; ttwid=${TTWID}`;

test("注册请求形状：公开端点 + JSON 体 + 普通桌面 UA", () => {
  const { url, init } = registerRequest();
  assert.equal(url, REGISTER_URL);
  assert.equal(init.method, "POST");
  assert.match(init.headers["Content-Type"], /application\/json/);
  assert.match(init.headers["User-Agent"], /Chrome/);
  const body = JSON.parse(init.body);
  assert.equal(body.aid, 1768);
  assert.equal(body.region, "cn");
  assert.equal(body.union, true);
  assert.deepEqual(body, REGISTER_BODY, "请求体应当只有这些字段");
});

test("pickTtwid：优先用 getSetCookie()", () => {
  const res = { status: 200, headers: { getSetCookie: () => ["foo=1; Path=/", `ttwid=${TTWID}; Path=/`] } };
  assert.equal(pickTtwid(res), TTWID);
});

test("pickTtwid：退化路径不会被 Expires 里的逗号劈开", () => {
  const raw = `other=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/, ttwid=${TTWID}; Path=/; HttpOnly`;
  const res = { status: 200, headers: { get: () => raw } };
  assert.equal(pickTtwid(res), TTWID);
});

test("pickTtwid：没有 ttwid 时返回空串", () => {
  const res = { status: 200, headers: { getSetCookie: () => ["a=1"] } };
  assert.equal(pickTtwid(res), "");
});

test("registerTtwid：拿不到就报错（错误里只带状态码）", async () => {
  const fetchImpl = async () => ({ status: 503, headers: { getSetCookie: () => [] } });
  await assert.rejects(() => registerTtwid({ fetchImpl }), /HTTP 503/);
});

test("formatReport：缺 UIFID_TEMP 时 ok=false，且掩码里没有明文", () => {
  const rep = formatReport({ ttwid: TTWID, uifidTemp: "", extras: {} });
  assert.equal(rep.ok, false);
  assert.match(rep.errors.join(" "), /UIFID_TEMP/);
  assert.ok(!rep.mask.includes(TTWID));
});

test("probePresence：出现 Uifid Not Found 判定为未被接受", async () => {
  const fetchImpl = async () => ({
    status: 403,
    text: async () => JSON.stringify({ message: `Blocked by ArgusSecurityPlugin ${UIFID_MISSING_MARK}` }),
  });
  const p = await probePresence({ cookie: COOKIE, fetchImpl });
  assert.equal(p.accepted, false);
  assert.match(p.evidence, /Uifid Not Found/);
});

test("probePresence：没有那句话时不武断判定（只报告 HTTP 与体量）", async () => {
  const fetchImpl = async () => ({ status: 200, text: async () => "x".repeat(50) });
  const p = await probePresence({ cookie: COOKIE, fetchImpl });
  assert.equal(p.accepted, true);
  assert.match(p.evidence, /HTTP 200/);
});

test("checkViaVidlink：Key 走请求头，URL 只带 url 参数；200 且有直链才算通过", async () => {
  let seen = null;
  const fetchImpl = async (url, init) => {
    seen = { url: String(url), init };
    return {
      status: 200,
      headers: { get: (h) => (h === "X-Quota-Consumed" ? "1" : "41") },
      text: async () => JSON.stringify({ url: "https://cdn.example/v.mp4" }),
    };
  };
  const r = await checkViaVidlink({
    base: "https://vl.wzml.cc.cd/",
    key: "vl_public",
    url: "https://v.douyin.com/xxxx/",
    fetchImpl,
  });
  assert.equal(r.ok, true);
  assert.equal(r.quota.consumed, "1");
  assert.match(seen.url, /^https:\/\/vl\.wzml\.cc\.cd\/v1\/links\?url=https%3A%2F%2Fv\.douyin\.com%2Fxxxx%2F$/);
  assert.equal(seen.init.headers["X-API-Key"], "vl_public");
  assert.ok(!seen.url.includes("key="), "明文 Key 不能进 URL");
});

test("checkViaVidlink：403/429 时把 error.kind 带出来", async () => {
  const fetchImpl = async () => ({
    status: 403,
    headers: { get: () => null },
    text: async () => JSON.stringify({ error: { kind: "key_format", message: "URL 里的 key 只能是签名凭据" } }),
  });
  const r = await checkViaVidlink({ base: "https://x", key: "k", url: "u", fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.error.kind, "key_format");
});

test("checkViaVidlink：缺参数直接报错（不发请求）", async () => {
  await assert.rejects(() => checkViaVidlink({ base: "", key: "k", url: "u" }), /--base/);
  await assert.rejects(() => checkViaVidlink({ base: "b", key: "", url: "u" }), /--key/);
  await assert.rejects(() => checkViaVidlink({ base: "b", key: "k", url: "" }), /--url/);
});
