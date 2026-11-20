import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { notifyUserUpdated, sessionTokenKey } from '../api'
import AppLayout from '../components/AppLayout'
import { QrCodeIcon, ShieldCheckIcon } from '../components/Icons'
import { listCheckinEvents, submitCheckin, type CheckinEvent, type CheckinResult } from '../checkin'
import { formatDate } from '../events'
import './CheckinPage.css'

type EventList =
  | { status: 'loading' | 'error' | 'forbidden' | 'signed-out' }
  | { status: 'ready'; events: CheckinEvent[] }

function clearSession(token: string) {
  if (sessionStorage.getItem(sessionTokenKey) === token) {
    sessionStorage.removeItem(sessionTokenKey)
    notifyUserUpdated(null)
  }
}

function CheckinFeedback({ result }: { result: CheckinResult }) {
  if (result.status === 'approved') {
    return (
      <div className="checkin-feedback checkin-approved" role="status">
        <strong>Check-in aprovado</strong>
        <p>Ingresso <code>{result.code}</code> utilizado em{' '}
          <time dateTime={result.checkedInAt}>{formatDate.format(new Date(result.checkedInAt))}</time>.
        </p>
      </div>
    )
  }

  const titles = {
    duplicate: 'Ingresso já utilizado',
    rejected: 'Check-in recusado',
    error: 'Não foi possível confirmar o check-in',
  }

  return (
    <div className="checkin-feedback checkin-rejected" role="alert">
      <strong>{titles[result.status]}</strong>
      <p>{result.message}</p>
    </div>
  )
}

export default function CheckinPage() {
  const [token] = useState(() => sessionStorage.getItem(sessionTokenKey))
  const [list, setList] = useState<EventList>({ status: token ? 'loading' : 'signed-out' })
  const [revision, setRevision] = useState(0)
  const [eventId, setEventId] = useState('')
  const [code, setCode] = useState('')
  const [result, setResult] = useState<CheckinResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()

    async function loadEvents(session: string) {
      try {
        const nextList = await listCheckinEvents(session, controller.signal)
        if (controller.signal.aborted) return
        if (nextList.status === 'signed-out') clearSession(session)
        if (nextList.status === 'ready' && nextList.events.length === 1) {
          setEventId(nextList.events[0].id)
        }
        setList(nextList)
      } catch {
        if (!controller.signal.aborted) setList({ status: 'error' })
      }
    }

    void loadEvents(token)
    return () => controller.abort()
  }, [token, revision])

  useEffect(() => () => requestRef.current?.abort(), [])

  const selectedEvent = list.status === 'ready' ? list.events.find(event => event.id === eventId) : undefined
  const singleEvent = list.status === 'ready' && list.events.length === 1
  useEffect(() => {
    if (submitting || (!singleEvent && !result)) return
    codeRef.current?.focus()
    if (result && result.status !== 'approved') codeRef.current?.select()
  }, [singleEvent, submitting, result])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const ticketCode = code.trim()
    if (!token || !eventId || !ticketCode || requestRef.current) return

    const controller = new AbortController()
    requestRef.current = controller
    setSubmitting(true)
    setResult(null)

    try {
      const response = await submitCheckin(token, eventId, ticketCode, controller.signal)
      if (controller.signal.aborted) return
      if (response.status === 'signed-out') {
        clearSession(token)
        setList({ status: 'signed-out' })
        return
      }
      if (response.status === 'approved') setCode('')
      setResult(response)
    } catch {
      if (!controller.signal.aborted) {
        setResult({ status: 'error', message: 'Confira a conexão e tente validar o mesmo ingresso novamente.' })
      }
    } finally {
      requestRef.current = null
      if (!controller.signal.aborted) setSubmitting(false)
    }
  }

  return (
    <AppLayout>
      <main className="catalog checkin-page">
        <div className="checkin-shell">
          <header className="page-header">
            <span className="eyebrow">Portaria ColaAí</span>
            <h1 className="checkin-title">
              <ShieldCheckIcon variant="gradient" width={26} height={26} className="title-icon" />
              Check-in de ingressos
            </h1>
          </header>

          {list.status === 'loading' && <p className="state-banner" role="status">Carregando seus eventos…</p>}
          {list.status === 'signed-out' && (
            <div className="state-banner">
              <p><Link to="/login">Entrar</Link> com uma conta de Equipe de Check-in (ou Administrador).</p>
            </div>
          )}
          {list.status === 'forbidden' && (
            <div className="state-banner state-error">
              <p role="alert">Esta área é reservada à Equipe de Check-in (ou Administrador). <Link to="/login">Trocar de conta</Link>.</p>
            </div>
          )}
          {list.status === 'error' && (
            <div className="state-banner state-error">
              <p role="alert">Não foi possível carregar seus eventos.</p>
              <button type="button" className="btn btn-secondary" onClick={() => {
                setList({ status: 'loading' })
                setRevision(value => value + 1)
              }}>Tentar novamente</button>
            </div>
          )}
          {list.status === 'ready' && (list.events.length === 0 ? (
            <div className="state-banner">
              <p>Nenhum evento vinculado. Peça ao organizador para adicionar sua conta à equipe.</p>
            </div>
          ) : (
            <form className="event-card auth-form checkin-form" onSubmit={handleSubmit}>
              <label>
                Evento
                <select value={eventId} required disabled={submitting} onChange={event => {
                  setEventId(event.target.value)
                  setCode('')
                  setResult(null)
                }}>
                  <option value="" disabled>Selecione um evento</option>
                  {list.events.map(event => (
                    <option key={event.id} value={event.id}>
                      {event.title}
                    </option>
                  ))}
                </select>
              </label>
              {selectedEvent && (
                <p className="event-meta checkin-event-details">
                  <time dateTime={selectedEvent.startsAt}>{formatDate.format(new Date(selectedEvent.startsAt))}</time>
                  {' · '}{selectedEvent.location}
                </p>
              )}
              <label>
                Código do ingresso
                <input ref={codeRef} name="code" value={code} onChange={event => setCode(event.target.value)}
                  required autoComplete="off" spellCheck={false} maxLength={191}
                  placeholder="Escaneie ou cole o código do ingresso"
                  disabled={!eventId} readOnly={submitting} aria-describedby="checkin-hint" />
              </label>
              <p className="event-meta" id="checkin-hint">Digite ou cole o código e pressione Enter para validar.</p>
              <button type="submit" className="btn btn-primary btn-full" disabled={submitting || !eventId || !code.trim()}>
                <QrCodeIcon />
                {submitting ? 'Validando…' : 'Validar ingresso'}
              </button>
              {result && <CheckinFeedback result={result} />}
            </form>
          ))}
        </div>
      </main>
    </AppLayout>
  )
}
