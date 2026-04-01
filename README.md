# r2-static-service

基于 Cloudflare Workers + R2 的静态文件服务，支持：

- 任意文件上传到私有 `static` bucket
- 加密访问路径：`/{token}/{seoFilename}`
- 图片动态缩放、质量调整和可配置水印
- Referer 策略分流
- `Authorization: Bearer <Token>` 上传鉴权
- Cache API 缓存最终输出

## 开发

```bash
pnpm install
pnpm dev
pnpm test
```

## 上传

接口：`PUT /upload`

- Header: `Authorization: Bearer <UPLOAD_BEARER_TOKEN>`
- Body: `multipart/form-data`
- 文件字段固定为 `file`

示例：

```bash
curl -X PUT \
  -H "Authorization: Bearer change-me" \
  -F "file=@/tmp/demo.png" \
  http://127.0.0.1:8787/upload
```

返回结果包含：

- `key`: R2 物理路径，例如 `2026/04/01/abcdef123456.png`
- `token`: 对称加密后的访问 token
- `url`: 可直接访问的对外 URL

## 访问

接口：`GET /:token/:seoFilename`

图片支持查询参数：

- `width`
- `height`
- `quality`

非图片文件始终原样输出。当前支持动态处理的图片后缀：

- `jpg`
- `jpeg`
- `png`
- `webp`
- `avif`
- `gif`

## 配置

复制 `wrangler.example.jsonc` 为 `wrangler.jsonc`，再配置 secrets：

```bash
wrangler secret put UPLOAD_BEARER_TOKEN
wrangler secret put TOKEN_SECRET
```

`wrangler.example.jsonc` 里的可调变量：

- `REFERER_ALLOWLIST`: 逗号分隔域名或 `*.example.com`
- `REFERER_POLICY_ALLOWLIST`: `none` / `reject` / `watermark:<scheme>`
- `REFERER_POLICY_NO_REFERER`
- `REFERER_POLICY_OTHER`
- `REFERER_ALLOWLIST`: 直接写 JSON list，例如 `["example.com", "*.example.com"]`
- `WATERMARK_SCHEMES_JSON`: 直接写 JSON object，不需要再包成字符串
