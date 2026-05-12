# regular-check-in

用于自有 New API 站点测试学习的通用网页签到自动化项目。项目使用 TypeScript + Playwright，支持 Docker 部署、多站点配置、系统访问令牌登录、SQLite 运行记录、失败截图和定时执行。

## 单文件配置

所有站点配置都放在 `config/config.json`。你只需要维护这一个文件，不需要再单独配置 `.env` 令牌。

New API 站点主要填三个字段：

- `url`：网站地址，只填域名，不需要带 `/console/personal`
- `appId`：New API 用户 ID，也就是页面里的 `ID: xxx`
- `accessToken`：个人设置里生成的“系统访问令牌”

当前配置示例：

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
      "accessToken": "",
      "enabled": true
    },
    {
      "id": "api456",
      "name": "API456",
      "url": "https://api456.me",
      "appId": "691",
      "accessToken": "",
      "enabled": true
    }
  ]
}
```

你要做的就是把每个站点的 `accessToken` 填进去。如果用户 ID 不是 `691`，同步修改 `appId`。

访问令牌生成位置：

```txt
个人设置 -> 安全设置 -> 系统访问令牌 -> 生成令牌
```

新增站点时复制一段：

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

注意：如果你把真实令牌写进 `config/config.json`，不要再把这个文件提交到公开仓库。

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

服务器上编辑同一个文件：

```txt
config/config.json
```

然后启动：

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

## 可选字段

如果某个站点的签到路径不是 `/console/personal`：

```json
{
  "personalPath": "/console/personal"
}
```

如果按钮文案或页面提示不同：

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

旧配置里的 `accessTokenEnv` 仍兼容，但新配置推荐直接使用 `accessToken`，把站点地址、appId 和令牌放在同一个站点对象里。
