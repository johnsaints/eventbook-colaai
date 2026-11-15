import { useMemo } from 'react'
import { create as createQrCode } from 'qrcode'

type TicketQrCodeProps = {
  value: string
  className?: string
}

/** Renders a sharp inline SVG QR code encoding the ticket code synchronously. */
export default function TicketQrCode({ value, className }: TicketQrCodeProps) {
  const { size, path } = useMemo(() => {
    const qr = createQrCode(value, { errorCorrectionLevel: 'M' })
    const moduleCount = qr.modules.size
    const segments: string[] = []
    for (let row = 0; row < moduleCount; row += 1) {
      for (let col = 0; col < moduleCount; col += 1) {
        if (qr.modules.get(row, col)) {
          segments.push(`M${col},${row}h1v1h-1z`)
        }
      }
    }
    return { size: moduleCount, path: segments.join('') }
  }, [value])

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`QR Code do ingresso ${value}`}
      className={className}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#0b1f3c" />
    </svg>
  )
}
