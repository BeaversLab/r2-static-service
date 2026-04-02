# r2-static-service

基于 Cloudflare Workers 的静态文件代理服务，支持：

- 多存储上传，当前支持 `r2` 和 `qiniu`
- 加密访问路径：`/{storageId}/{token}/{seoFilename}`
- 图片通过 WebP 代理做动态处理和可配置水印
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
- 可选字段 `storage_id`，未传时使用 `CURRENT_STORAGE`

示例：

```bash
curl -X PUT \
  -H "Authorization: Bearer change-me" \
  -F "file=@/tmp/demo.png" \
  -F "storage_id=r2-static" \
  http://127.0.0.1:8787/upload
```

返回结果包含：

- `key`: `<storageId>:<objectKey>`，例如 `r2-static:2026/04/01/abcdef123456.png`
- `token`: 对称加密后的访问 token
- `url`: 可直接访问的对外 URL

## 访问

接口：`GET /:storageId/:token/:seoFilename`

图片参数直接对齐 WebP 代理，当前支持：

- `width`
- `height`
- `max_width`
- `max_height`
- `quality`
- `blur`
- `sharpen`
- `rotate`
- `brightness`
- `saturation`
- `contrast`
- `flip`

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
pnpm wrangler secret put UPLOAD_BEARER_TOKEN
pnpm wrangler secret put TOKEN_SECRET
```

`wrangler.example.jsonc` 里的可调变量：

- `CURRENT_STORAGE`: 默认上传存储
- `STORAGE_CONFIGS_JSON`: 存储配置，按 `storageId` 组织
- `IMAGE_PROXY_WATERMARK_SCHEMES_JSON`: 水印规则
- `REFERER_POLICY_ALLOWLIST`: `none` / `reject` / `watermark:<scheme>`
- `REFERER_POLICY_NO_REFERER`
- `REFERER_POLICY_OTHER`
- `REFERER_ALLOWLIST`: 直接写 JSON list，例如 `["example.com", "*.example.com"]`

七牛密钥通过 `STORAGE_SECRETS_JSON` secret 提供，不写入 `wrangler.jsonc`。按当前 `qiniu-static` 配置，示例命令：

```bash
printf '%s' '{"qiniu-static":{"qiniu":{"accessKey":"你的七牛AK","secretKey":"你的七牛SK"}}}' | pnpm wrangler secret put STORAGE_SECRETS_JSON
```

`STORAGE_SECRETS_JSON` 的 key 必须和 `STORAGE_CONFIGS_JSON` 里的 `storageId` 一致。
