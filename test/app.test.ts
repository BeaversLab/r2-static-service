import test from 'node:test'
import assert from 'node:assert/strict'
import app from '../src/app.ts'
import { buildTokenPayload, decryptToken, encryptToken } from '../src/crypto.ts'
import { buildObjectKey, getFileExtension } from '../src/path.ts'
import { isAuthorizedUpload } from '../src/auth.ts'
import { resolveRefererCategory } from '../src/referer.ts'
import { isSupportedImageExtension } from '../src/image.ts'

class MemoryR2ObjectBody {
  private readonly bytes: Uint8Array
  readonly httpMetadata?: { contentType?: string }
  readonly customMetadata?: Record<string, string>

  constructor(
    bytes: Uint8Array,
    httpMetadata?: { contentType?: string },
    customMetadata?: Record<string, string>
  ) {
    this.bytes = bytes
    this.httpMetadata = httpMetadata
    this.customMetadata = customMetadata
  }

  get body() {
    const data = this.bytes
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(data)
        controller.close()
      }
    })
  }

  async arrayBuffer() {
    return this.bytes.buffer.slice(0)
  }
}

class MemoryBucket {
  private readonly store = new Map<string, MemoryR2ObjectBody>()

  async put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }
  ) {
    this.store.set(key, new MemoryR2ObjectBody(new Uint8Array(value), options?.httpMetadata, options?.customMetadata))
  }

  async get(key: string) {
    return this.store.get(key) ?? null
  }
}

class MemoryCache {
  private readonly store = new Map<string, Response>()

  async match(request: Request) {
    const response = this.store.get(request.url)
    return response ? response.clone() : undefined
  }

  async put(request: Request, response: Response) {
    this.store.set(request.url, response.clone())
  }
}

const createEnv = () => ({
  BUCKET: new MemoryBucket(),
  UPLOAD_BEARER_TOKEN: 'secret-token',
  TOKEN_SECRET: 'token-secret',
  CURRENT_STORAGE: 'r2',
  STORAGE_CONFIGS_JSON: {
    r2: {
      type: 'r2',
      publicBaseUrl: 'https://r2.example.com',
      proxyBaseUrl: 'https://r2-proxy.example.com'
    },
    qiniu: {
      type: 'qiniu',
      bucket: 'static',
      publicBaseUrl: 'https://cdn.example.com',
      proxyBaseUrl: 'https://qiniu-proxy.example.com',
      uploadUrl: 'https://upload.qiniup.com'
    }
  },
  STORAGE_SECRETS_JSON: {
    qiniu: {
      qiniu: {
        accessKey: 'qiniu-ak',
        secretKey: 'qiniu-sk'
      }
    }
  },
  IMAGE_PROXY_WATERMARK_SCHEMES_JSON: {
    light: {
      text: 'Lite',
      font: 'Source Han Sans HC VF',
      color: 'FFFFFF',
      colorOpacity: 1,
      fill: 'FFFFFF',
      fillOpacity: 0,
      width: 0.28,
      height: 0.0904,
      offsetX: 0.04,
      offsetY: 0.04
    },
    strong: {
      text: 'Strong',
      font: 'Source Han Sans HC VF',
      color: 'FF5050',
      colorOpacity: 1,
      fill: 'FFFFFF',
      fillOpacity: 0,
      width: 0.36,
      height: 0.0904,
      offsetX: 0.04,
      offsetY: 0.04
    }
  },
  REFERER_ALLOWLIST: ['allowed.example.com'],
  REFERER_POLICY_ALLOWLIST: 'watermark:light',
  REFERER_POLICY_NO_REFERER: 'watermark:light',
  REFERER_POLICY_OTHER: 'watermark:strong'
})

const installCache = () => {
  const cache = new MemoryCache()
  Object.defineProperty(globalThis, 'caches', {
    value: { default: cache },
    configurable: true
  })
  return cache
}

const withMockFetch = async (
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  run: () => Promise<void>
) => {
  const originalFetch = globalThis.fetch
  Object.defineProperty(globalThis, 'fetch', {
    value: handler,
    configurable: true
  })

  try {
    await run()
  } finally {
    Object.defineProperty(globalThis, 'fetch', {
      value: originalFetch,
      configurable: true
    })
  }
}

test('rejects upload when bearer token is missing', async () => {
  installCache()
  const env = createEnv()
  const formData = new FormData()
  formData.set('file', new File(['hello'], 'hello.txt', { type: 'text/plain' }))

  const response = await app.request('http://example.com/upload', {
    method: 'PUT',
    body: formData
  }, env)

  assert.equal(response.status, 401)
})

test('uploads to default r2 storage and returns storage aware url', async () => {
  installCache()
  const env = createEnv()
  const formData = new FormData()
  formData.set('file', new File(['hello world'], 'Greeting File.txt', { type: 'text/plain' }))

  const response = await app.request('http://example.com/upload', {
    method: 'PUT',
    headers: { Authorization: 'Bearer secret-token' },
    body: formData
  }, env)

  assert.equal(response.status, 201)
  const payload = await response.json()
  assert.match(payload.key, /^r2:\d{4}\/\d{2}\/\d{2}\/[a-f0-9]{12}\.txt$/)
  assert.match(payload.url, /^http:\/\/example\.com\/r2\/[^/]+\/greeting-file\.txt$/)

  const decrypted = decryptToken(payload.token, env.TOKEN_SECRET)
  assert.equal(decrypted.path, payload.key.slice(3))
  assert.equal(decrypted.extension, 'txt')
})

test('uploads to qiniu when storage_id is specified', async () => {
  installCache()
  const env = createEnv()

  await withMockFetch(async (input, init) => {
    assert.equal(String(input), 'https://upload.qiniup.com')
    assert.equal(init?.method, 'POST')
    return new Response(JSON.stringify({ key: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }, async () => {
    const formData = new FormData()
    formData.set('file', new File(['hello world'], 'Greeting File.txt', { type: 'text/plain' }))
    formData.set('storage_id', 'qiniu')

    const response = await app.request('http://example.com/upload', {
      method: 'PUT',
      headers: { Authorization: 'Bearer secret-token' },
      body: formData
    }, env)

    assert.equal(response.status, 201)
    const payload = await response.json()
    assert.match(payload.key, /^qiniu:\d{4}\/\d{2}\/\d{2}\/[a-f0-9]{12}\.txt$/)
    assert.match(payload.url, /^http:\/\/example\.com\/qiniu\/[^/]+\/greeting-file\.txt$/)
  })
})

test('rejects invalid storage_id during upload', async () => {
  installCache()
  const env = createEnv()
  const formData = new FormData()
  formData.set('file', new File(['hello world'], 'Greeting File.txt', { type: 'text/plain' }))
  formData.set('storage_id', 'missing')

  const response = await app.request('http://example.com/upload', {
    method: 'PUT',
    headers: { Authorization: 'Bearer secret-token' },
    body: formData
  }, env)

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'Invalid storage_id' })
})

test('serves non-image files directly from the selected storage', async () => {
  installCache()
  const env = createEnv()
  const token = encryptToken('2026/04/01/abcdef123456.txt', env.TOKEN_SECRET)

  await withMockFetch(async (input) => {
    assert.equal(String(input), 'https://r2.example.com/2026/04/01/abcdef123456.txt')
    return new Response('plain text', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    })
  }, async () => {
    const response = await app.request(`http://example.com/r2/${token}/plain.txt`, {
      headers: { Referer: 'https://allowed.example.com/post' }
    }, env)

    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'plain text')
  })
})

test('proxies image requests through the configured r2 webp proxy', async () => {
  installCache()
  const env = createEnv()
  const token = encryptToken('2026/04/01/abcdef123456.png', env.TOKEN_SECRET)

  await withMockFetch(async (input) => {
    const url = new URL(String(input))
    assert.equal(url.origin, 'https://r2-proxy.example.com')
    assert.equal(url.pathname, '/2026/04/01/abcdef123456.png')
    assert.equal(url.searchParams.get('width'), '320')
    assert.equal(url.searchParams.get('max_height'), '240')
    assert.equal(url.searchParams.get('quality'), '80')
    assert.equal(url.searchParams.get('blur'), '4')
    assert.equal(url.searchParams.get('sharpen'), '1.5')
    assert.equal(url.searchParams.get('brightness'), '1.2')
    assert.equal(url.searchParams.get('contrast'), '1.1')
    assert.equal(url.searchParams.get('saturation'), '1.3')
    assert.equal(url.searchParams.get('rotate'), '90')
    assert.equal(url.searchParams.get('flip'), 'b')
    assert.equal(
      url.searchParams.get('visual_effect'),
      'watermark,text__TGl0ZQ,font__U291cmNlIEhhbiBTYW5zIEhDIFZG,color__ffffffff,fill__ffffff00,width__0.28,height__0.0904,offset_x__0.04,offset_y__0.04'
    )
    return new Response('proxy-image', {
      status: 200,
      headers: { 'Content-Type': 'image/webp' }
    })
  }, async () => {
    const response = await app.request(
      `http://example.com/r2/${token}/sample.png?width=320&max_height=240&quality=80&blur=4&sharpen=1.5&brightness=1.2&contrast=1.1&saturation=1.3&flip=b&rotate=90`,
      {
        headers: {
          Referer: 'https://allowed.example.com/article'
        }
      },
      env
    )

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Content-Type'), 'image/webp')
    assert.equal(await response.text(), 'proxy-image')
  })
})

test('rejects unsupported legacy image parameters', async () => {
  installCache()
  const env = createEnv()
  const token = encryptToken('2026/04/01/abcdef123456.png', env.TOKEN_SECRET)

  const response = await app.request(`http://example.com/r2/${token}/sample.png?fit=cover`, {
    headers: { Referer: 'https://allowed.example.com/article' }
  }, env)

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'Invalid image transformation parameters' })
})

test('returns 403 when referer policy is reject', async () => {
  installCache()
  const env = {
    ...createEnv(),
    REFERER_POLICY_OTHER: 'reject'
  }
  const token = encryptToken('2026/04/01/abcdef123456.png', env.TOKEN_SECRET)

  const response = await app.request(`http://example.com/r2/${token}/sample.png`, {
    headers: { Referer: 'https://blocked.example.com/' }
  }, env)

  assert.equal(response.status, 403)
})

test('rejects invalid storage_id during read', async () => {
  installCache()
  const env = createEnv()
  const token = encryptToken('2026/04/01/abcdef123456.png', env.TOKEN_SECRET)

  const response = await app.request(`http://example.com/missing/${token}/sample.png`, {}, env)

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'Invalid storage_id' })
})

test('proxies qiniu image requests through the qiniu webp proxy', async () => {
  installCache()
  const env = createEnv()
  const token = encryptToken('2026/04/01/abcdef123456.webp', env.TOKEN_SECRET)

  await withMockFetch(async (input) => {
    const url = new URL(String(input))
    assert.equal(url.origin, 'https://qiniu-proxy.example.com')
    assert.equal(url.pathname, '/2026/04/01/abcdef123456.webp')
    assert.equal(url.searchParams.get('width'), '320')
    assert.equal(url.searchParams.get('height'), '180')
    assert.equal(url.searchParams.get('quality'), '80')
    assert.equal(
      url.searchParams.get('visual_effect'),
      'watermark,text__TGl0ZQ,font__U291cmNlIEhhbiBTYW5zIEhDIFZG,color__ffffffff,fill__ffffff00,width__0.28,height__0.0904,offset_x__0.04,offset_y__0.04'
    )
    return new Response('qiniu-image', {
      status: 200,
      headers: { 'Content-Type': 'image/webp' }
    })
  }, async () => {
    const response = await app.request(
      `http://example.com/qiniu/${token}/sample.webp?width=320&height=180&quality=80`,
      {
        headers: {
          Referer: 'https://allowed.example.com/article'
        }
      },
      env
    )

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Content-Type'), 'image/webp')
    assert.equal(await response.text(), 'qiniu-image')
  })
})

test('helper utilities keep planned behavior stable', async () => {
  assert.equal(isAuthorizedUpload('Bearer secret', 'secret'), true)
  assert.equal(isAuthorizedUpload('Basic abc', 'secret'), false)
  assert.equal(resolveRefererCategory(undefined, ['allowed.example.com']), 'no-referer')
  assert.equal(resolveRefererCategory('https://allowed.example.com/path', ['allowed.example.com']), 'allowlist')
  assert.equal(resolveRefererCategory('https://blocked.example.com/path', ['allowed.example.com']), 'other')
  assert.equal(isSupportedImageExtension('png'), true)
  assert.equal(isSupportedImageExtension('pdf'), false)
  assert.equal(getFileExtension('test03.js', 'application/octet-stream'), 'js')
  assert.equal(getFileExtension('LICENSE', 'application/octet-stream'), '')
  assert.match(buildObjectKey(new Date('2026-04-01T00:00:00Z'), 'abcdef1234567890', 'png'), /^2026\/04\/01\/abcdef123456\.png$/)
  assert.equal(buildObjectKey(new Date('2026-04-01T00:00:00Z'), 'abcdef1234567890', ''), '2026/04/01/abcdef123456')
  assert.equal(buildTokenPayload('2026/04/01/abcdef123456'), 'v1|DEM28dVXhmsSDXUD|')
  assert.equal(decryptToken(encryptToken('2026/04/01/abcdef123456', 'token-secret'), 'token-secret').path, '2026/04/01/abcdef123456')
})

test('prints compressed token plaintext and ciphertext sample', () => {
  const path = '2026/04/01/abcdef123456.svg'
  const plainText = buildTokenPayload(path)
  const token = encryptToken(path, 'token-secret')
  const decrypted = decryptToken(token, 'token-secret')

  console.log(`plainText=${plainText}`)
  console.log(`token=${token}`)

  assert.equal(decrypted.path, path)
  assert.equal(decrypted.extension, 'svg')
  assert.ok(plainText.length < `v1|${path}`.length)
})
