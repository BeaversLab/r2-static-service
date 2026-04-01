import { Hono } from 'hono/tiny'
import { buildCacheRequest } from './cache.ts'
import { isAuthorizedUpload } from './auth.ts'
import { getConfig } from './config.ts'
import { decryptToken } from './crypto.ts'
import { buildObjectResponse } from './object-response.ts'
import { resolvePolicyAction } from './referer.ts'
import { getFileFromBody, storeUploadedFile } from './upload.ts'

const app = new Hono<{ Bindings: Cloudflare.Env }>()

app.put('/upload', async (c) => {
  const config = getConfig(c.env)
  const isAuthorized = isAuthorizedUpload(
    c.req.header('Authorization'),
    config.uploadBearerToken
  )
  if (!isAuthorized) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const body = await c.req.parseBody()
  const file = getFileFromBody(body)
  if (!file) {
    return c.json({ error: 'Missing file field `file`' }, 400)
  }

  const stored = await storeUploadedFile(c.req.url, file, c.env, config.tokenSecret)
  return c.json(stored, 201)
})

app.get('/:token/:seoFilename', async (c) => {
  const config = getConfig(c.env)
  const cache = globalThis.caches?.default
  const action = resolvePolicyAction(config, c.req.header('Referer'))
  if (action.type === 'reject') {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const cacheRequest = buildCacheRequest(c.req.raw, action)
  if (cache) {
    const cached = await cache.match(cacheRequest)
    if (cached) {
      return cached
    }
  }

  let payload
  try {
    payload = decryptToken(c.req.param('token'), config.tokenSecret)
  } catch {
    return c.json({ error: 'Invalid token' }, 400)
  }

  const object = await c.env.BUCKET.get(payload.path)
  if (!object) {
    return c.notFound()
  }

  const response = await buildObjectResponse(
    object,
    payload.extension,
    c.req.query(),
    c.req.header('Accept'),
    action,
    config,
    c.env.IMAGES
  )

  if (response.ok && cache) {
    const cacheWrite = cache.put(cacheRequest, response.clone())
    try {
      c.executionCtx.waitUntil(cacheWrite)
    } catch {
      await cacheWrite
    }
  }

  return response
})

export default app
