# regular-check-in

一个用于自有站点测试学习的通用网页签到自动化项目。第一版使用 TypeScript + Playwright，支持 Docker 部署、多站点配置、浏览器登录态保存、SQLite 运行记录、失败截图和定时执行。

## 功能

- 多站点配置，默认包含：
  - `https://elysiver.h-e.top/console/personal`
  - `https://api456.me/console/personal`
- 使用真实 Chromium 页面执行签到。
- 每个站点单独保存登录态到 `data/sessions`。
- 签到结果写入 `data/app.db`。
- 失败或触发安全验证时截图到 `data/screenshots`。
- 支持单次执行和 cron 定时执行。

## 本地使用

安装依赖：

```bash
npm install
```

如果本机没有 Playwright 浏览器：

```bash
npx playwright install chromium
```

先为站点保存登录态：

```bash
npm run build
npm run auth -- --site elysiver
npm run auth -- --site api456
```

打开的浏览器里完成登录后，在终端按 Enter，会话会保存到 `data/sessions/<site>.json`。

手动执行一次签到：

```bash
npm run checkin
npm run checkin -- --site elysiver
```

启动定时任务：

```bash
npm start
```

## Docker 部署

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

## 站点配置

配置文件在 `config/sites.json`。新增站点时按下面格式追加：

```json
{
  "id": "example",
  "name": "Example",
  "baseUrl": "https://example.com",
  "personalPath": "/console/personal",
  "enabled": true
}
```

如果按钮文案或页面提示不同，可以加 selectors：

```json
{
  "id": "example",
  "name": "Example",
  "baseUrl": "https://example.com",
  "personalPath": "/console/personal",
  "enabled": true,
  "selectors": {
    "checkInButtonText": "立即签到",
    "alreadyCheckedTexts": ["已签到", "今日已签到"],
    "successTexts": ["签到成功", "领取成功"],
    "challengeTexts": ["人机验证", "安全验证", "验证码"]
  }
}
```

也可以用环境变量 `CHECKIN_SITES_JSON` 完全覆盖配置文件。

## 人机验证处理

项目不会尝试破解验证码。检测到人机验证时会：

1. 保存截图。
2. 记录状态为 `needs_handoff`。
3. 如果设置了 `HANDOFF_TIMEOUT_SECONDS`，会等待指定秒数后再次检查页面。

自有测试站点更推荐在服务端为测试账号、固定 IP 或测试环境 Header 提供验证开关。

## 常用环境变量

复制 `.env.example` 后按需调整：

```bash
cp .env.example .env
```

关键项：

- `CHECKIN_CRON`：定时规则，默认 `15 9 * * *`。
- `TIMEZONE`：默认 `Asia/Shanghai`。
- `HEADLESS`：是否无头运行，Docker 默认 `true`。
- `DATA_DIR`：运行数据目录，Docker 默认 `/app/data`。
- `SCREENSHOT_ON_SUCCESS`：成功时是否也截图。
- `HANDOFF_TIMEOUT_SECONDS`：检测到验证后的等待秒数。
