import { useId, type ReactNode, type SVGProps } from 'react'

export type CaIconProps = SVGProps<SVGSVGElement> & {
  variant?: 'current' | 'gradient'
}

type CaSvgProps = Omit<CaIconProps, 'children'> & {
  children: (accentFill: string) => ReactNode
}

function CaSvg({
  variant = 'current',
  width = 18,
  height = 18,
  strokeWidth = 1.9,
  className,
  children,
  ...rest
}: CaSvgProps) {
  const rawId = useId()
  const gradId = `ca-ico-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const isGradient = variant === 'gradient'
  const stroke = isGradient ? `url(#${gradId})` : 'currentColor'
  const accentFill = isGradient ? `url(#${gradId})` : 'currentColor'

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ? `ca-icon ${className}` : 'ca-icon'}
      {...rest}
    >
      {isGradient && (
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00D4FF" />
            <stop offset="48%" stopColor="#0B7BFF" />
            <stop offset="76%" stopColor="#7A3DFF" />
            <stop offset="100%" stopColor="#FF2E9E" />
          </linearGradient>
        </defs>
      )}
      {children(accentFill)}
    </svg>
  )
}

export function SearchIcon(props: CaIconProps) {
  return (
    <CaSvg {...props}>
      {(fill) => (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" fill={fill} fillOpacity="0.1" />
          <path d="m15.5 15.5 5 5" />
          <path d="M8 9.2a3.2 3.2 0 0 1 3.8-1.4" strokeOpacity="0.6" />
        </>
      )}
    </CaSvg>
  )
}

export function CalendarIcon(props: CaIconProps) {
  return (
    <CaSvg {...props}>
      {(fill) => (
        <>
          <rect x="3" y="4.5" width="18" height="16.5" rx="3" fill={fill} fillOpacity="0.1" />
          <path d="M3 9.5h18" />
          <path d="M8 2.5v3.5M16 2.5v3.5" />
          <rect x="7.2" y="13" width="3.5" height="3.5" rx="0.9" fill={fill} fillOpacity="0.28" />
          <path d="M14.2 13.5h2.6M14.2 16.5h2.6" strokeOpacity="0.7" />
        </>
      )}
    </CaSvg>
  )
}

export function PinIcon(props: CaIconProps) {
  return (
    <CaSvg {...props}>
      {(fill) => (
        <>
          <path d="M12 21.5s6.5-5.6 6.5-11a6.5 6.5 0 1 0-13 0c0 5.4 6.5 11 6.5 11Z" fill={fill} fillOpacity="0.12" />
          <circle cx="12" cy="10.5" r="2.4" fill={fill} fillOpacity="0.24" />
        </>
      )}
    </CaSvg>
  )
}

export function TicketIcon(props: CaIconProps) {
  return (
    <CaSvg {...props}>
      {(fill) => (
        <>
          <path
            d="M3 7.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2.2a2.3 2.3 0 0 0 0 4.6v2.2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2.2a2.3 2.3 0 0 0 0-4.6V7.5Z"
            fill={fill}
            fillOpacity="0.12"
          />
          <path d="M14.5 6v2M14.5 11v2M14.5 16v2" strokeDasharray="1.5 2.5" />
          <path d="M7.2 10.5h4.2M7.2 13.8h3" strokeOpacity="0.78" />
        </>
      )}
    </CaSvg>
  )
}

export function QrCodeIcon(props: CaIconProps) {
  return (
    <CaSvg {...props}>
      {(fill) => (
        <>
          <rect x="3" y="3" width="7.2" height="7.2" rx="1.6" fill={fill} fillOpacity="0.14" />
          <rect x="13.8" y="3" width="7.2" height="7.2" rx="1.6" fill={fill} fillOpacity="0.14" />
          <rect x="3" y="13.8" width="7.2" height="7.2" rx="1.6" fill={fill} fillOpacity="0.14" />
          <path d="M14 14h2.8v2.8H14zM18.2 18.2H21V21h-2.8zM18.2 14H21M14 18.5V21" />
        </>
      )}
    </CaSvg>
  )
}

export function UsersIcon(props: CaIconProps) {
  return (
    <CaSvg {...props}>
      {(fill) => (
        <>
          <circle cx="9.2" cy="7.5" r="3.5" fill={fill} fillOpacity="0.14" />
          <path d="M3 20c0-3 2.7-5 6.2-5s6.2 2 6.2 5" fill={fill} fillOpacity="0.1" />
          <path d="M16.2 4.3a3.2 3.2 0 0 1 0 6.2M21 20c0-2.4-1.8-4.2-4.2-4.7" />
        </>
      )}
    </CaSvg>
  )
}

export function ShieldCheckIcon(props: CaIconProps) {
  return (
    <CaSvg {...props}>
      {(fill) => (
        <>
          <path d="M12 21.5s7.5-3.6 7.5-9.5V5.4L12 2.5 4.5 5.4V12c0 5.9 7.5 9.5 7.5 9.5Z" fill={fill} fillOpacity="0.13" />
          <path d="m8.8 12.2 2.2 2.2 4.5-4.6" />
        </>
      )}
    </CaSvg>
  )
}

export function ChartIcon(props: CaIconProps) {
  return (
    <CaSvg {...props}>
      {(fill) => (
        <>
          <rect x="4" y="12.5" width="3.5" height="7" rx="1" fill={fill} fillOpacity="0.18" />
          <rect x="10.2" y="6.5" width="3.5" height="13" rx="1" fill={fill} fillOpacity="0.24" />
          <rect x="16.5" y="9.5" width="3.5" height="10" rx="1" fill={fill} fillOpacity="0.18" />
          <path d="M2.5 20.5h19" />
        </>
      )}
    </CaSvg>
  )
}

export function PlusIcon(props: CaIconProps) {
  return (
    <CaSvg {...props}>
      {() => (
        <>
          <path d="M12 5v14M5 12h14" />
        </>
      )}
    </CaSvg>
  )
}

export function ArrowLeftIcon(props: CaIconProps) {
  return (
    <CaSvg {...props}>
      {() => <path d="m14.5 18-6-6 6-6" />}
    </CaSvg>
  )
}

export function ArrowRightIcon(props: CaIconProps) {
  return (
    <CaSvg {...props}>
      {() => <path d="m9.5 18 6-6-6-6" />}
    </CaSvg>
  )
}

export function ClockIcon(props: CaIconProps) {
  return (
    <CaSvg {...props}>
      {(fill) => (
        <>
          <circle cx="12" cy="12" r="8.8" fill={fill} fillOpacity="0.1" />
          <path d="M12 7.5v4.8l3.2 1.8" />
        </>
      )}
    </CaSvg>
  )
}

export function BrandGridIcon(props: CaIconProps) {
  return (
    <CaSvg {...props}>
      {(fill) => (
        <>
          <rect x="3.2" y="3.2" width="7.4" height="7.4" rx="2.2" fill={fill} fillOpacity="0.2" />
          <rect x="13.4" y="3.2" width="7.4" height="7.4" rx="2.2" fill={fill} fillOpacity="0.1" />
          <rect x="3.2" y="13.4" width="7.4" height="7.4" rx="2.2" fill={fill} fillOpacity="0.1" />
          <rect x="13.4" y="13.4" width="7.4" height="7.4" rx="3.7" fill={fill} fillOpacity="0.24" />
        </>
      )}
    </CaSvg>
  )
}

export function MusicIcon(props: CaIconProps) {
  return (
    <CaSvg {...props}>
      {(fill) => (
        <>
          <path d="M3 13v-1a9 9 0 0 1 18 0v1" />
          <rect x="3" y="12.5" width="4" height="6.5" rx="1.8" fill={fill} fillOpacity="0.22" />
          <rect x="17" y="12.5" width="4" height="6.5" rx="1.8" fill={fill} fillOpacity="0.22" />
          <path d="M10.5 16v-3.5M13.5 17v-5" strokeOpacity="0.82" />
        </>
      )}
    </CaSvg>
  )
}

export function TheaterIcon(props: CaIconProps) {
  return (
    <CaSvg {...props}>
      {(fill) => (
        <>
          <path d="M3.5 5.2c3.5-1.1 8-1.1 11 0v4.8c0 3.7-2.5 6.4-5.5 7.4-3-1-5.5-3.7-5.5-7.4V5.2Z" fill={fill} fillOpacity="0.18" />
          <path d="M14.5 9.2c2.2-.6 4.5-.5 6.2.2v4.1c0 3-2 5.2-4.5 6-1.2-.4-2.3-1-3.1-1.9" fill={fill} fillOpacity="0.08" />
          <path d="M7.2 9.4h.01M10.8 9.4h.01M7.3 12.6c1 .9 2.4.9 3.4 0" />
        </>
      )}
    </CaSvg>
  )
}

export function TrophyIcon(props: CaIconProps) {
  return (
    <CaSvg {...props}>
      {(fill) => (
        <>
          <path d="M6.5 4h11v5.8a5.5 5.5 0 0 1-11 0V4Z" fill={fill} fillOpacity="0.2" />
          <path d="M6.5 5.5H3.8v2.2a2.8 2.8 0 0 0 2.7 2.8M17.5 5.5h2.7v2.2a2.8 2.8 0 0 1-2.7 2.8" />
          <path d="M12 15.3V19.5M8.2 19.5h7.6" />
        </>
      )}
    </CaSvg>
  )
}

export function LaptopIcon(props: CaIconProps) {
  return (
    <CaSvg {...props}>
      {(fill) => (
        <>
          <rect x="3.5" y="4.5" width="17" height="11.5" rx="2.2" fill={fill} fillOpacity="0.14" />
          <path d="m8.8 8.5-2 1.8 2 1.8M15.2 8.5l2 1.8-2 1.8M12.6 8l-1.2 4.5" strokeOpacity="0.85" />
          <path d="M2 19.2h20" />
        </>
      )}
    </CaSvg>
  )
}

export function UtensilsIcon(props: CaIconProps) {
  return (
    <CaSvg {...props}>
      {(fill) => (
        <>
          <path d="M4.5 16.5a7.5 7.5 0 0 1 15 0H4.5Z" fill={fill} fillOpacity="0.18" />
          <path d="M12 9V6.8M10 6.8h4M2.8 19.2h18.4" />
          <path d="M9.5 13a3 3 0 0 1 2.2-1.8" strokeOpacity="0.65" />
        </>
      )}
    </CaSvg>
  )
}

export function CloseIcon(props: CaIconProps) {
  return (
    <CaSvg {...props}>
      {() => <path d="M17.5 6.5 6.5 17.5M6.5 6.5l11 11" />}
    </CaSvg>
  )
}

export function UploadIcon(props: CaIconProps) {
  return (
    <CaSvg {...props}>
      {(fill) => (
        <>
          <rect x="3.5" y="14.5" width="17" height="6" rx="2" fill={fill} fillOpacity="0.12" />
          <path d="m16.5 8-4.5-4.5L7.5 8M12 3.5v10" />
        </>
      )}
    </CaSvg>
  )
}

export function ImageIcon(props: CaIconProps) {
  return (
    <CaSvg {...props}>
      {(fill) => (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2.5" fill={fill} fillOpacity="0.12" />
          <circle cx="8.8" cy="9.5" r="1.4" fill={fill} fillOpacity="0.35" />
          <path d="m20.5 15.5-4.3-4.3a1.4 1.4 0 0 0-2 0L6.5 19" />
        </>
      )}
    </CaSvg>
  )
}
