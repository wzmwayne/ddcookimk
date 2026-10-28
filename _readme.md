# ddcookimk

抖音 Web 访客凭据（`ttwid` / `UIFID_TEMP`）的**组装与校验**工具：
`ttwid` 走抖音公开的注册端点自动获取；`UIFID_TEMP` 由你在浏览器里手工取出；
两者拼成的 Cookie 头可以直接交给 [vidlink](https://github.com/wzmwayne/vidlink)
之类的解析服务做端到端校验。

零依赖（只用 Node 内置能力），一个命令一次做完，输出可 `eval`。

```bash
# ① 拿 ttwid（公开端点，一次即可，长期复用）
npx ddcookimk ttwid

# ② 手工取 UIFID_TEMP（下面有步骤），然后拼装
npx ddcookimk assemble --ttwid "$TTWID" --uifid "$UIFID" --export
#   export VIDLINK_COOKIE_DOUYIN='UIFID_TEMP=…; ttwid=…'

# ③ 校验：交给一个能真打抖音的客户端跑一次（唯一能给出确定结论的方式）
npx ddcookimk verify --cookie "$VIDLINK_COOKIE_DOUYIN" \
  --base https://vl.wzml.cc.cd --key vl_public --url 'https://v.douyin.com/xxxx/'
```

## 它做什么

| 命令 | 做什么 |
|---|---|
| `ddcookimk ttwid` | `POST https://ttwid.bytedance.com/ttwid/union/register/`，从 `Set-Cookie` 里取出 `ttwid` |
| `ddcookimk assemble` | 解析/校验/拼接 Cookie 头，输出可 `eval` 的 `export VIDLINK_COOKIE_DOUYIN='…'` |
| `ddcookimk verify` | 形状检查（本地）+ 可选端到端（调 vidlink 的 `/v1/links`） |

细节上刻意的选择：

- **值只掩码输出**：日志与终端里打印的是 `UIFID_TEMP=bbbbbb…bbbb(160)` 这种形式，
  完整凭据只出现在你明确要的那一行（`--export` 或裸输出）；
- **不写通用 Cookie 库**：只认这两个键，代码短到可以通读——这个工具的价值是"可审计"；
- **Key 走请求头**：`verify` 把 vidlink 的 API Key 放在 `X-API-Key` 里，
  URL 只带 `url=` 参数（vidlink 的 URL 参数只接受签名凭据，明文 Key 会被 403）。

## 它不做什么（这些是实测结论，不是免责套话）

- **不自动铸造 `UIFID_TEMP`**：它由服务端签发、只发给"通过了挑战的客户端"，
  所有公开 HTTP 端点都不下发。本项目不抓挑战页、**不下载也不执行平台下发的任何
  脚本**、不算任何签名——这部分被有意排除在仓库之外。缺失该值时，服务端会返回
  `403 Blocked by ArgusSecurityPlugin Uifid Not Found`，因此它没有"算法替代品"。
- **不提供无限频次能力**：抖音风控的限流是 **IP 维度**的。触发限流后，
  刚铸造的全新身份一样被拒——**轮换身份绕不过限流**。所以"批量铸造"没有收益，
  本项目也不做批量。
- **不涉及账号体系**：不处理登录态、不触碰任何需要账号的内容，只用匿名访客标识。
- **不收集、不上传任何凭据**：Cookie 只在你本机内存与环境变量里；
  唯一会联网的三个动作是 `ttwid`（注册端点）、`verify --probe`（一次 detail 请求）、
  `verify --base`（一次你自己的 vidlink 解析）。

## `UIFID_TEMP` 怎么手工取

它只能从"真实浏览器通过挑战之后"的会话里拿到：

1. 用桌面浏览器打开 `https://www.douyin.com/`，等页面完全加载（可能会过一次挑战）；
2. `F12` → **Application / 应用** → **Cookies** → `https://www.douyin.com`；
3. 找到名为 `UIFID_TEMP` 的那一行，复制它的值（约 160 字符），同时把 `ttwid`
   也顺手复制一份（浏览器里的和本工具注册到的**任选其一**即可）。

> `ttwid` 有效期实测到 2027-09，`UIFID_TEMP` 到 2028-01，一次取到可以长期复用；
> 放环境变量里即可，不必写进任何文件。

## 与 vidlink 的关系

[vidlink](https://github.com/wzmwayne/vidlink) 是纯 Go、零依赖的轻量视频解析服务。
它自己完成了抖音的全部签名计算（`a_bogus`、`x-secsdk-web-signature` 都在 Go 里算），
**唯一需要外部提供的就是这份访客 Cookie**：

```bash
export VIDLINK_COOKIE_DOUYIN="$(ddcookimk assemble --ttwid "$TTWID" --uifid "$UIFID")"
./vidlink
```

两个项目互不依赖：本工具只是"把凭据凑齐并验证一下"，不参与解析。

## 校验强度（说实话）

| 方式 | 结论 | 代价 |
|---|---|---|
| `assemble` 的形状检查 | 只能说明"拼得对、长度正常" | 零 |
| `verify --probe` | **提示性**：看服务端是否抱怨 `Uifid Not Found`；没抱怨也不代表一定能用 | 一次请求 |
| `verify --base … --key … --url …` | **确定性**：能返回一条直链就是可用 | 一次解析配额 |

一个完整的抖音接口请求还需要平台签名，而签名不在本项目范围内——这也是为什么
"确定性结论"必须交给 vidlink 那样的完整客户端，而不是本工具自己下判断。

## 开发

```bash
npm test     # node --test（30 个用例，全部离线，不发网络请求）
npm run lint # node --check 四个源文件
```

## 合规与免责

见 [DISCLAIMER.md](DISCLAIMER.md) 与 [LICENSE](LICENSE)（AGPL-3.0）。
仅用于互操作性与技术研究；请遵守平台服务条款与所在地法律、控制请求频率；
本项目与 ByteDance／抖音无任何关联，使用者自行承担一切后果。
