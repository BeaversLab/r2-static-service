import type { PolicyAction, WatermarkScheme } from './types.ts'

const textEncoder = new TextEncoder()

const serializeRepeat = (repeat: boolean | undefined) => (repeat ? ' patternUnits="userSpaceOnUse"' : '')

const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

const buildTextWatermarkSvg = (scheme: Extract<WatermarkScheme, { type: 'text' }>) => {
  const width = scheme.width ?? 320
  const height = scheme.height ?? 72
  const fontSize = scheme.fontSize ?? 24
  const fontFamily = scheme.fontFamily ?? 'Arial, sans-serif'
  const color = scheme.color ?? 'rgba(255,255,255,0.8)'
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <style>
        text { fill: ${color}; font: ${fontSize}px ${fontFamily}; dominant-baseline: middle; }
      </style>
      <text x="50%" y="50%" text-anchor="middle">${escapeXml(scheme.text)}</text>
    </svg>
  `.trim()
}

const toStream = (value: string) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(textEncoder.encode(value))
      controller.close()
    }
  })

export const resolveWatermark = async (
  action: PolicyAction,
  schemes: Record<string, WatermarkScheme>
) => {
  if (action.type !== 'watermark') return null
  const scheme = schemes[action.scheme]
  if (!scheme) {
    throw new Error(`Missing watermark scheme: ${action.scheme}`)
  }

  if (scheme.type === 'image') {
    const response = await fetch(scheme.source)
    if (!response.ok || !response.body) {
      throw new Error(`Unable to load watermark asset: ${action.scheme}`)
    }
    return {
      image: response.body,
      drawOptions: {
        opacity: scheme.opacity,
        top: scheme.top,
        right: scheme.right,
        bottom: scheme.bottom,
        left: scheme.left,
        repeat: scheme.repeat
      }
    }
  }

  return {
    image: toStream(buildTextWatermarkSvg(scheme)),
    drawOptions: {
      opacity: scheme.opacity,
      top: scheme.top,
      right: scheme.right,
      bottom: scheme.bottom,
      left: scheme.left,
      repeat: scheme.repeat
    }
  }
}
