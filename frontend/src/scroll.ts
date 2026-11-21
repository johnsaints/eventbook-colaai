/** Retorna o comportamento de rolagem respeitando a preferência de movimento reduzido. */
export function preferredScrollBehavior(): ScrollBehavior {
  if (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return 'auto'
  }
  return 'smooth'
}

/** Rola a janela para o topo da página atual. */
export function scrollWindowToTop(smooth = false) {
  if (typeof window === 'undefined' || typeof window.scrollTo !== 'function') return
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: smooth ? preferredScrollBehavior() : 'auto',
  })
}

/** Rola suavemente até o início da seção informada, respeitando scroll-margin-top. */
export function scrollElementToTop(element: HTMLElement | null) {
  if (!element || typeof element.scrollIntoView !== 'function') return
  element.scrollIntoView({
    behavior: preferredScrollBehavior(),
    block: 'start',
  })
}
