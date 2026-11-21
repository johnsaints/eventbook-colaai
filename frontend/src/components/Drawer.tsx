import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from './Icons'
import './Drawer.css'

export type DrawerSide = 'right' | 'left' | 'bottom'
export type DrawerSize = 'sm' | 'md' | 'lg'

type DrawerProps = {
  open: boolean
  onClose: () => void
  title: string
  eyebrow?: string
  subtitle?: string
  side?: DrawerSide
  size?: DrawerSize
  scrollResetKey?: string | number
  headerExtra?: ReactNode
  footer?: ReactNode
  children: ReactNode
}

type ScrollLockSnapshot = {
  htmlOverflow: string
  htmlOverscrollBehavior: string
  bodyOverflow: string
  bodyPaddingRight: string
}

let activeScrollLocks = 0
let scrollSnapshot: ScrollLockSnapshot | null = null

function acquireScrollLock() {
  if (activeScrollLocks === 0) {
    const html = document.documentElement
    const body = document.body
    const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth)

    scrollSnapshot = {
      htmlOverflow: html.style.overflow,
      htmlOverscrollBehavior: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
    }

    html.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'
    body.style.overflow = 'hidden'

    if (scrollbarWidth > 0) {
      const computedPaddingRight = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0
      body.style.paddingRight = `${computedPaddingRight + scrollbarWidth}px`
    }
  }
  activeScrollLocks += 1
}

function releaseScrollLock() {
  activeScrollLocks = Math.max(0, activeScrollLocks - 1)
  if (activeScrollLocks === 0 && scrollSnapshot) {
    const html = document.documentElement
    const body = document.body
    html.style.overflow = scrollSnapshot.htmlOverflow
    html.style.overscrollBehavior = scrollSnapshot.htmlOverscrollBehavior
    body.style.overflow = scrollSnapshot.bodyOverflow
    body.style.paddingRight = scrollSnapshot.bodyPaddingRight
    scrollSnapshot = null
  }
}

/** Gaveta deslizante reutilizável com bloqueio de scroll, retorno de foco e suporte a Esc. */
export default function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  subtitle,
  side = 'right',
  size = 'md',
  scrollResetKey,
  headerExtra,
  footer,
  children,
}: DrawerProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const backdropPressRef = useRef(false)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open || !bodyRef.current) return
    bodyRef.current.scrollTop = 0
  }, [open, scrollResetKey])

  useEffect(() => {
    if (!open) return

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    acquireScrollLock()

    const frame = requestAnimationFrame(() => {
      panelRef.current?.focus()
    })

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
      releaseScrollLock()
      const previous = previousFocusRef.current
      if (previous && previous.isConnected) {
        requestAnimationFrame(() => previous.focus())
      }
    }
  }, [open])

  if (!open) return null

  function handleBackdropMouseDown(event: MouseEvent<HTMLDivElement>) {
    backdropPressRef.current = event.target === event.currentTarget
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (backdropPressRef.current && event.target === event.currentTarget) {
      onClose()
    }
    backdropPressRef.current = false
  }

  return createPortal(
    <div
      className={`ca-drawer-backdrop ca-drawer-backdrop-${side}`}
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`ca-drawer-panel ca-drawer-${side} ca-drawer-${size}`}
      >
        <div className="ca-drawer-accent" aria-hidden="true" />
        <header className="ca-drawer-header">
          <div className="ca-drawer-header-top">
            <div className="ca-drawer-title-group">
              {eyebrow && <span className="eyebrow ca-drawer-eyebrow">{eyebrow}</span>}
              <h2 id={titleId} className="ca-drawer-title">{title}</h2>
              {subtitle && <p className="ca-drawer-subtitle">{subtitle}</p>}
            </div>
            <button
              type="button"
              className="ca-drawer-close"
              onClick={onClose}
              aria-label="Fechar painel"
            >
              <CloseIcon width={18} height={18} />
            </button>
          </div>
          {headerExtra && <div className="ca-drawer-header-extra">{headerExtra}</div>}
        </header>

        <div className="ca-drawer-body" ref={bodyRef}>{children}</div>

        {footer && <footer className="ca-drawer-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
