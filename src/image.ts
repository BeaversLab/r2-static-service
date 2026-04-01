import * as z from 'zod'
import { PREFERRED_OUTPUT_TYPES, SUPPORTED_IMAGE_EXTENSIONS } from './constants.ts'

export const imageParameterSchema = z.object({
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  quality: z.coerce.number().int().min(1).max(100).optional(),
  fit: z.enum(['scale-down', 'contain', 'pad', 'squeeze', 'cover', 'crop']).optional(),
  background: z.string().min(1).optional(),
  blur: z.coerce.number().min(0).max(250).optional(),
  brightness: z.coerce.number().positive().optional(),
  contrast: z.coerce.number().positive().optional(),
  gamma: z.coerce.number().positive().optional(),
  saturation: z.coerce.number().positive().optional(),
  sharpen: z.coerce.number().min(0).max(10).optional(),
  flip: z.enum(['h', 'v', 'hv']).optional(),
  rotate: z.coerce.number().pipe(z.union([
    z.literal(0),
    z.literal(90),
    z.literal(180),
    z.literal(270)
  ])).optional()
})

export type ImageParameters = z.infer<typeof imageParameterSchema>
export const imageParameterNames = Object.keys(imageParameterSchema.shape)

export const isSupportedImageExtension = (extension: string) =>
  SUPPORTED_IMAGE_EXTENSIONS.has(extension.toLowerCase())

export const getPreferredContentType = (acceptHeader: string | undefined, fallback: string) => {
  if (acceptHeader) {
    for (const type of PREFERRED_OUTPUT_TYPES) {
      if (acceptHeader.includes(type)) {
        return type
      }
    }
  }
  return fallback
}
