# regular-check-in

用于自有 New API 站点测试学习的通用网页签到自动化项目。项目使用 TypeScript + Playwright，支持 Docker 部署、多站点配置、系统访问令牌登录、浏览器登录态保存、SQLite 运行记录、失败截图和定时执行。

## 配置

所有站点统一配置在 `config/config.json` 的 `sites` 数组里。New API 站点只需要填：

- `url`：网站地址，只填域名，不需要带 `/console/personal`
- `appId`：New API 用户 ID，也就是页面里的 `ID: xxx`
- `accessTokenEnv`：访问令牌对应的环境变量名

示例：

```json
{
  "headless": true,
  "timezone": "Asia/Shanghai",
  "cron": "15 9 * * *",
  "screenshotOnSuccess": false,
  "handoffTimeoutSeconds": 0,
  "sites": [
    {
      "id": "elysiver",
      "name": "Elysiver",
      "url": "https://elysiver.h-e.top",
      "appId": "691",
      "accessTokenEnv": "ELYSIVER_ACCESS_TOKEN",
      "enabled": true
    },
    {
      "id": "api456",
      "name": "API456",
      "url": "https://api456.me",
      "appId": "691",
      "accessTokenEnv": "API456_ACCESS_TOKEN",
      "enabled": true
    }
  ]
}
```

如果你愿意把令牌直接放进配置，也支持 `accessToken`：

```json
{
  "id": "example",
  "name": "Example",
  "url": "https://example.com",
  "appId": "123",
  "accessToken": "你的系统访问令牌",
  "enabled": true
}
```

但更推荐使用 `accessTokenEnv`，不要把令牌提交到 Git。

## 环境变量

复制示例文件：

```bash
cp .env.example .env
```

填写令牌：

```env
ELYSIVER_ACCESS_TOKEN=你的_elysiver_系统访问令牌
API456_ACCESS_TOKEN=你的_api456_系统访问令牌
```

访问令牌在 New API 页面生成：

```txt
个人设置 -> 安全设置 -> 系统访问令牌 -> 生成令牌
```

## 本地测试

安装依赖并构建：

```bash
npm install
npm run build
```

查看配置是否加载正常：

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

## Docker 部署

服务器上同样需要配置 `.env`：

```env
ELYSIVER_ACCESS_TOKEN=xxx
API456_ACCESS_TOKEN=xxx
```

启动：

```bash
docker compose up -d --build
```

查看日志：

```bash
docker compose logs -f
```

手动执行：

```bash
docker compose exec regular-check-in node dist/index.js run
docker compose exec regular-check-in node dist/index.js run --site elysiver
```

## 其他配置

如果某个站点的签到路径不是 `/console/personal`，可以额外配置：

```json
{
  "personalPath": "/console/personal"
}
```

如果按钮文案或页面提示不同，可以额外配置：

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

旧配置里的 `baseUrl`、`auth.userId` 仍兼容，但新站点建议使用 `url`、`appId`、`accessTokenEnv`。
