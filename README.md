# regular-check-in

用于自有 New API 站点测试学习的通用网页签到自动化项目。项目使用 TypeScript + Playwright，支持 Docker 部署、多站点配置、系统访问令牌登录、浏览器登录态保存、SQLite 运行记录、失败截图和定时执行。

## 功能

- 默认站点配置在 `config/config.json`：
  - `https://elysiver.h-e.top/console/personal`
  - `https://api456.me/console/personal`
- 支持 New API 的“系统访问令牌”登录。
- 使用真实 Chromium 页面执行签到。
- 无访问令牌时也可用 `auth` 命令手动保存浏览器登录态。
- 签到结果写入 `data/app.db`。
- 失败或触发安全验证时截图到 `data/screenshots`。
- 支持单次执行和 cron 定时执行。

## 访问令牌登录

New API 的个人设置里可以生成“系统访问令牌”。本项目会使用：

- `Authorization`：系统访问令牌。
- `New-Api-User`：用户 ID，也就是页面头像区域显示的 `ID: xxx`。
- `/api/user/self`：用于校验令牌并拿到用户信息。

官方仓库当前代码里，用户接口除了 `Authorization` 还会校验 `New-Api-User`。不同版本对 `Authorization` 是否需要 `Bearer ` 前缀可能不一致，所以配置里默认 `headerMode: "auto"`，会自动尝试裸 token 和 `Bearer token`。

### 配置令牌

复制环境变量文件：

```bash
cp .env.example .env
```

填写：

```env
ELYSIVER_ACCESS_TOKEN=你的_elysiver_系统访问令牌
API456_ACCESS_TOKEN=你的_api456_系统访问令牌
```

站点配置在 `config/config.json`：

```json
{
  "id": "elysiver",
  "name": "Elysiver",
  "baseUrl": "https://elysiver.h-e.top",
  "personalPath": "/console/personal",
  "enabled": true,
  "auth": {
    "type": "accessToken",
    "userId": "691",
    "accessTokenEnv": "ELYSIVER_ACCESS_TOKEN",
    "headerMode": "auto"
  }
}
```

如果你的用户 ID 不是 `691`，把 `userId` 改成页面上显示的 ID。

## 本地测试

安装依赖：

```bash
npm install
```

如果本机没有 Playwright 浏览器：

```bash
npx playwright install chromium
```

构建：

```bash
npm run build
```

查看配置是否能正常加载：

```bash
node dist/index.js sites
```

测试单个站点：

```bash
npm run checkin -- --site elysiver
npm run checkin -- --site api456
```

测试全部站点：

```bash
npm run checkin
```

如果不想使用访问令牌，也可以手动保存浏览器登录态：

```bash
npm run auth -- --site elysiver
npm run auth -- --site api456
```

打开的浏览器里完成登录后，在终端按 Enter，会话会保存到 `data/sessions/<site>.json`。

## Docker 部署

先在服务器或 `.env` 中配置访问令牌：

```env
ELYSIVER_ACCESS_TOKEN=你的_elysiver_系统访问令牌
API456_ACCESS_TOKEN=你的_api456_系统访问令牌
```

构建并启动：

```bash
docker compose up -d --build
```

查看日志：

```bash
docker compose logs -f
```

手动执行全部站点：

```bash
docker compose exec regular-check-in node dist/index.js run
```

手动执行单个站点：

```bash
docker compose exec regular-check-in node dist/index.js run --site elysiver
```

## 配置说明

完整配置文件在 `config/config.json`：

```json
{
  "headless": true,
  "timezone": "Asia/Shanghai",
  "cron": "15 9 * * *",
  "screenshotOnSuccess": false,
  "handoffTimeoutSeconds": 0,
  "sites": []
}
```

新增站点时在 `sites` 数组里追加：

```json
{
  "id": "example",
  "name": "Example",
  "baseUrl": "https://example.com",
  "personalPath": "/console/personal",
  "enabled": true,
  "auth": {
    "type": "accessToken",
    "userId": "123",
    "accessTokenEnv": "EXAMPLE_ACCESS_TOKEN",
    "headerMode": "auto"
  }
}
```

如果按钮文案或页面提示不同，可以加 `selectors`：

```json
{
  "selectors": {
    "checkInButtonText": "立即签到",
    "alreadyCheckedTexts": ["已签到", "今日已签到"],
    "successTexts": ["签到成功", "领取成功"],
    "challengeTexts": ["人机验证", "安全验证", "验证码"]
  }
}
```

也可以用环境变量 `CHECKIN_SITES_JSON` 完全覆盖配置文件里的 `sites` 数组。

## 人机验证处理

项目不会尝试破解验证码。检测到人机验证时会：

1. 保存截图。
2. 记录状态为 `needs_handoff`。
3. 如果设置了 `HANDOFF_TIMEOUT_SECONDS`，会等待指定秒数后再次检查页面。

自有测试站点更推荐在服务端为测试账号、固定 IP 或测试环境 Header 提供验证开关。
