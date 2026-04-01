import test from 'node:test'
import assert from 'node:assert/strict'
import app from '../src/app.ts'
import { decryptToken, encryptToken } from '../src/crypto.ts'
import { buildObjectKey } from '../src/path.ts'
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

class MockImageResult {
  private readonly bodyText: string
  private readonly contentType: string

  constructor(bodyText: string, contentType: string) {
    this.bodyText = bodyText
    this.contentType = contentType
  }

  response() {
    return new Response(this.bodyText, {
      headers: { 'Content-Type': this.contentType }
    })
  }
}

class MockTransformer {
  readonly operations: unknown[] = []

  transform(parameters: unknown) {
    this.operations.push({ type: 'transform', parameters })
    return this
  }

  draw(_image: unknown, options?: unknown) {
    this.operations.push({ type: 'draw', options })
    return this
  }

  async output(options: { format: string; quality?: number }) {
    this.operations.push({ type: 'output', options })
    return new MockImageResult(JSON.stringify(this.operations), options.format)
  }
}

class MockImagesBinding {
  lastTransformer: MockTransformer | null = null

  input(_stream: ReadableStream<Uint8Array>) {
    this.lastTransformer = new MockTransformer()
    return this.lastTransformer
  }
}

const createEnv = () => ({
  BUCKET: new MemoryBucket(),
  IMAGES: new MockImagesBinding(),
  UPLOAD_BEARER_TOKEN: 'secret-token',
  TOKEN_SECRET: 'token-secret',
  REFERER_ALLOWLIST: ['allowed.example.com'],
  REFERER_POLICY_ALLOWLIST: 'watermark:light',
  REFERER_POLICY_NO_REFERER: 'watermark:light',
  REFERER_POLICY_OTHER: 'watermark:strong',
  WATERMARK_SCHEMES_JSON: {
    light: { type: 'text', text: 'Lite', opacity: 0.15, bottom: 12, right: 12, fontSize: 18 },
    strong: { type: 'text', text: 'Strong', opacity: 0.3, bottom: 16, right: 16, fontSize: 26 }
  }
})

const installCache = () => {
  const cache = new MemoryCache()
  Object.defineProperty(globalThis, 'caches', {
    value: { default: cache },
    configurable: true
  })
  return cache
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

test('uploads file field and returns tokenized url', async () => {
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
  assert.match(payload.key, /^\d{4}\/\d{2}\/\d{2}\/[a-f0-9]{12}\.txt$/)
  assert.match(payload.url, /^http:\/\/example\.com\/[^/]+\/greeting-file\.txt$/)

  const decrypted = decryptToken(payload.token, env.TOKEN_SECRET)
  assert.equal(decrypted.path, payload.key)
  assert.equal(decrypted.extension, 'txt')
})

test('returns clear error when file field is missing', async () => {
  installCache()
  const env = createEnv()
  const formData = new FormData()
  formData.set('image', new File(['hello'], 'hello.txt', { type: 'text/plain' }))

  const response = await app.request('http://example.com/upload', {
    method: 'PUT',
    headers: { Authorization: 'Bearer secret-token' },
    body: formData
  }, env)

  assert.equal(response.status, 400)
})

test('serves non-image files without image processing', async () => {
  installCache()
  const env = createEnv()
  await env.BUCKET.put('2026/04/01/abcdef123456.txt', new TextEncoder().encode('plain text').buffer, {
    httpMetadata: { contentType: 'text/plain' }
  })
  const token = encryptToken('2026/04/01/abcdef123456.txt', 'txt', env.TOKEN_SECRET)
  const response = await app.request(`http://example.com/${token}/plain.txt`, {
    headers: { Referer: 'https://allowed.example.com/post' }
  }, env)

  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'plain text')
})

test('applies image transforms and watermark for allowed images', async () => {
  installCache()
  const env = createEnv()
  await env.BUCKET.put('2026/04/01/abcdef123456.png', new Uint8Array([1, 2, 3]).buffer, {
    httpMetadata: { contentType: 'image/png' }
  })
  const token = encryptToken('2026/04/01/abcdef123456.png', 'png', env.TOKEN_SECRET)

  const response = await app.request(
    `http://example.com/${token}/sample.png?width=320&quality=80&fit=cover&blur=4&sharpen=1.5&brightness=1.2&contrast=1.1&saturation=1.3&gamma=1.05&flip=h&rotate=90&background=%23ffffff`,
    {
    headers: {
      Accept: 'image/avif,image/webp,image/*',
      Referer: 'https://allowed.example.com/article'
    }
    },
    env
  )

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Content-Type'), 'image/avif')
  const body = JSON.parse(await response.text())
  assert.equal(body[0].type, 'transform')
  assert.equal(body[0].parameters.width, 320)
  assert.equal(body[0].parameters.fit, 'cover')
  assert.equal(body[0].parameters.blur, 4)
  assert.equal(body[0].parameters.sharpen, 1.5)
  assert.equal(body[0].parameters.brightness, 1.2)
  assert.equal(body[0].parameters.contrast, 1.1)
  assert.equal(body[0].parameters.saturation, 1.3)
  assert.equal(body[0].parameters.gamma, 1.05)
  assert.equal(body[0].parameters.flip, 'h')
  assert.equal(body[0].parameters.rotate, 90)
  assert.equal(body[0].parameters.background, '#ffffff')
  assert.equal(body[1].type, 'draw')
  assert.equal(body[2].type, 'output')
})

test('returns 400 for invalid image transform enum values', async () => {
  installCache()
  const env = createEnv()
  await env.BUCKET.put('2026/04/01/abcdef123456.png', new Uint8Array([1, 2, 3]).buffer, {
    httpMetadata: { contentType: 'image/png' }
  })
  const token = encryptToken('2026/04/01/abcdef123456.png', 'png', env.TOKEN_SECRET)

  const response = await app.request(`http://example.com/${token}/sample.png?fit=stretch`, {
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
  const token = encryptToken('2026/04/01/abcdef123456.png', 'png', env.TOKEN_SECRET)

  const response = await app.request(`http://example.com/${token}/sample.png`, {
    headers: { Referer: 'https://blocked.example.com/' }
  }, env)

  assert.equal(response.status, 403)
})

test('helper utilities keep planned behavior stable', async () => {
  assert.equal(isAuthorizedUpload('Bearer secret', 'secret'), true)
  assert.equal(isAuthorizedUpload('Basic abc', 'secret'), false)
  assert.equal(resolveRefererCategory(undefined, ['allowed.example.com']), 'no-referer')
  assert.equal(resolveRefererCategory('https://allowed.example.com/path', ['allowed.example.com']), 'allowlist')
  assert.equal(resolveRefererCategory('https://blocked.example.com/path', ['allowed.example.com']), 'other')
  assert.equal(isSupportedImageExtension('png'), true)
  assert.equal(isSupportedImageExtension('pdf'), false)
  assert.match(buildObjectKey(new Date('2026-04-01T00:00:00Z'), 'abcdef1234567890', 'png'), /^2026\/04\/01\/abcdef123456\.png$/)
})
