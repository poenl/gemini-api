# Gemini API 共享代理

这是一个基于 Cloudflare Worker 的 Google Gemini API 代理服务，它通过汇集并共享所有使用者的 API 密钥，实现了一个高可用的、能自动处理网络问题和密钥失效的 API 共享池。

**API Endpoint:** `https://gemini-api.poenl.top`

## 核心理念：贡献即使用 (Contribute-to-Use)

本项目并非一个免费的无限次 API，而是一个**共享密钥池**服务。

它的工作模式是：

1.  **您必须提供密钥**：在每次请求时，您都需要在请求头中提供一个有效的 Google Gemini API 密钥作为“入场券”。
2.  **密钥加入共享池**：您的密钥会自动加入到一个后端的共享数据库中。
3.  **系统轮询使用**：当系统处理您的请求时，会从整个共享池中轮询选择一个当前可用的密钥（可能是您的，也可能是别人的）来向 Google 的官方 API 发起请求。

这种机制汇集了所有使用者的密钥，共同分担请求负荷，从而在单个密钥达到速率限制时，系统仍能正常服务，实现了接近“无限次”的高可用体验。

## 主要特性

- **共享密钥池**：所有用户贡献的密钥共同组成一个大的可用池，互相分担请求压力。
- **智能的密钥管理**：当一个 API 密钥因为无效 (`API key not valid`) 或过期 (`API key expired`) 而导致请求失败时，系统会自动从可用池中“软删除”这个密钥。
- **自动重试机制**：如果请求因密钥问题失败，系统会自动换一个新的密钥重新发起请求（最多重试 3 次），对用户来说是无感的。
- **解决网络问题**：部署在 Cloudflare 的全球网络上，可以有效解决部分地区访问 Google API 的网络连接问题。
- **状态查询**：通过访问 `/keycount` 端点，可以查询当前共享池中可用的密钥总数。

## 如何使用

您只需要将请求 Google Gemini API 的地址替换为本项目的代理地址 `https://gemini-api.poenl.top`，并在请求头中加入您的密钥即可。

- **API 端点**: `https://gemini-api.poenl.top`
- **请求头 (Headers)**:
  - `Content-Type: application/json`
  - `X-goog-api-key: <你的Google-Gemini-API-密钥>` (**必需**)

#### `curl` 请求示例

```bash
curl --location 'https://gemini-api.poenl.top/v1beta/models/gemini-pro:generateContent' \
--header 'Content-Type: application/json' \
--header 'X-goog-api-key: YOUR_GEMINI_API_KEY' \
--data '{
    "contents":[{
        "parts":[{
            "text": "你好，世界！"
        }]
    }]
}'
```

## 工作原理

1.  用户的请求到达 Cloudflare Worker，并携带 `X-goog-api-key`。
2.  Worker 将该密钥存入 Cloudflare D1 数据库的共享池中（如果已存在则更新状态）。
3.  Worker 从数据库中通过轮询方式获取一个当前标记为“可用”的密钥。
4.  Worker 使用这个从池中获取的密钥，将用户的原始请求转发给 Google Gemini API 的官方服务器。
5.  如果 Google API 返回 2xx 错误（例如密钥失效或速率超限），Worker 会将该密钥在数据库中标记为“失效”，然后自动换一个密钥重试（最多 3 次）。
6.  最终将 Google API 的响应原样返回给用户。

## 本地开发与部署

1.  **克隆项目**

    ```bash
    git clone <repository_url>
    cd gemini-api
    ```

2.  **安装依赖**

    ```bash
    pnpm install
    ```

3.  **配置 `wrangler.toml`**
    参考 `wrangler.toml.example` 创建你自己的 `wrangler.toml` 文件，并配置你的 Cloudflare 账户 ID 和 D1 数据库绑定。

4.  **数据库迁移**

    ```bash
    # 本地
    pnpm migration

    # 生产
    npx drizzle-kit push
    ```

5.  **启动本地开发**

    ```bash
    pnpm dev
    ```

6.  **部署到 Cloudflare**
    ```bash
    pnpm deploy
    ```

## 欢迎贡献

欢迎大家积极使用并共享自己的 API 密钥。贡献的密钥越多，这个共享池就越强大和稳定。如果您在使用后有顾虑，可以等待一段时间后更换或删除您自己的密钥，但我们鼓励您将其保留在池中，以供他人使用。
