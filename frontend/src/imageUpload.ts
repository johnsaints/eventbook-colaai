const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export type PrepareImageOptions = {
  maxWidth: number
  maxHeight: number
  maxDataUrlLength: number
  cropSquare?: boolean
}

/** Valida, redimensiona (com recorte quadrado opcional) e comprime uma imagem para Data URL seguro. */
export async function prepareImageUpload(file: File, options: PrepareImageOptions): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Escolha uma imagem PNG, JPEG ou WebP.')
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('A imagem selecionada excede 12 MB.')
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = objectUrl
    await img.decode()

    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error('Não foi possível ler as dimensões da imagem.')
    }

    let sx = 0
    let sy = 0
    let sWidth = img.naturalWidth
    let sHeight = img.naturalHeight
    let width: number
    let height: number

    if (options.cropSquare) {
      const squareSide = Math.min(img.naturalWidth, img.naturalHeight)
      sx = Math.floor((img.naturalWidth - squareSide) / 2)
      sy = Math.floor((img.naturalHeight - squareSide) / 2)
      sWidth = squareSide
      sHeight = squareSide
      const targetSide = Math.min(options.maxWidth, options.maxHeight, squareSide)
      width = Math.max(1, targetSide)
      height = Math.max(1, targetSide)
    } else {
      const scale = Math.min(1, options.maxWidth / img.naturalWidth, options.maxHeight / img.naturalHeight)
      width = Math.max(1, Math.round(img.naturalWidth * scale))
      height = Math.max(1, Math.round(img.naturalHeight * scale))
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Navegador sem suporte para processar imagem.')

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, width, height)

    const outputType = file.type === 'image/png' ? 'image/webp' : 'image/jpeg'
    const encoded = canvas.toDataURL(outputType, 0.86)
    const finalUrl = encoded.startsWith('data:image/webp') || outputType === 'image/jpeg'
      ? encoded
      : canvas.toDataURL('image/jpeg', 0.86)

    if (finalUrl.length > options.maxDataUrlLength) {
      const compact = canvas.toDataURL('image/jpeg', 0.72)
      if (compact.length > options.maxDataUrlLength) {
        throw new Error('A imagem ficou grande demais mesmo após compressão. Tente outra foto.')
      }
      return compact
    }

    return finalUrl
  } catch (error) {
    if (error instanceof Error) throw error
    throw new Error('Não foi possível processar a imagem selecionada.')
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
