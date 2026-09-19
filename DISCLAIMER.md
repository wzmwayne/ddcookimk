# 免责声明 / Disclaimer

## 中文

本仓库（ddcookimk）提供的是一份**凭据组装与校验**工具：它调用抖音公开的
`ttwid` 注册端点，把你**自行**取得的 `UIFID_TEMP` 拼成 Cookie 头，并可选地
调用你自己指定的服务做一次端到端校验。

请在使用前确认你已理解并接受：

1. **风险自负**：本软件按"现状"提供，不附带任何明示或默示的担保，
   包括但不限于可用性、适销性或特定用途适用性的担保。作者不对使用本软件
   造成的任何直接或间接损失负责。
2. **合规责任在你**：请自行确认你的使用方式符合目标平台的服务条款、
   robots／API 约定，以及你所在国家或地区的法律法规。作者不鼓励、也不授权
   任何违反上述约定的用途。
3. **无关联**：本项目与 ByteDance、抖音及其关联公司没有任何隶属、赞助或背书关系；
   所有商标归其各自所有者。
4. **不做的事**：本仓库不包含、也不提供任何自动化绕过平台风控挑战的实现
   （不抓挑战页、不下载或执行平台下发的脚本、不计算平台签名）。仓库被有意
   限制在"凭据组装 + 校验"这一层。
5. **凭据安全**：本软件不会收集、上传或缓存任何凭据；Cookie 只存在于你本机的
   内存与环境变量中。请勿把你的 Cookie 提交到任何仓库或粘贴到公开位置。
6. **请求频率**：请控制请求频率并遵守平台限流。平台的限流是 IP 维度的，
   轮换身份无法绕过；被限流时请停止请求，等待恢复。

如不同意上述任何一条，请勿使用本软件。

## English

This repository (ddcookimk) is a **credential assembly and verification** tool. It
calls Douyin's public `ttwid` registration endpoint, assembles the `UIFID_TEMP`
value **you obtained yourself** into a Cookie header, and can optionally perform a
single end-to-end check against a service you specify.

By using this software you acknowledge and accept:

1. **Use at your own risk.** The software is provided "as is", without warranty of
   any kind, express or implied, including but not limited to the warranties of
   merchantability, fitness for a particular purpose and noninfringement. The
   authors are not liable for any claim, damages or other liability arising from
   the use of this software.
2. **Compliance is your responsibility.** You must ensure your use complies with the
   target platform's terms of service, robots/API conventions, and the laws and
   regulations of your jurisdiction. The authors neither encourage nor authorize any
   use that violates them.
3. **No affiliation.** This project is not affiliated with, sponsored by, or endorsed
   by ByteDance, Douyin, or any of their affiliates. All trademarks belong to their
   respective owners.
4. **Scope limit.** This repository does not contain, and does not provide, any
   implementation that automates bypassing platform risk-control challenges (no
   challenge-page scraping, no downloading or executing platform-provided scripts,
   no platform signature computation). It is deliberately limited to credential
   assembly and verification.
5. **Credential safety.** The software never collects, uploads, or caches credentials;
   cookies live only in your local memory and environment. Never commit your cookie
   or paste it anywhere public.
6. **Rate limits.** Respect the platform's rate limits. They are enforced per IP;
   rotating identities does not bypass them. If you get limited, stop and wait.

If you do not agree with any of the above, do not use this software.
