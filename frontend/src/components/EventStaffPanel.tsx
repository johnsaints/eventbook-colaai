import { useEffect, useRef, useState, type FormEvent } from 'react'
import { addEventStaff, listEventStaff, removeEventStaff, type StaffMember } from '../staff'

type Props = {
  eventId: string
  eventTitle: string
  token: string
  onClose: () => void
  onSessionExpired: () => void
  embedded?: boolean
}

type TeamState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; members: StaffMember[] }

type Mutation = { kind: 'add' } | { kind: 'remove'; userId: string }

export default function EventStaffPanel({ eventId, eventTitle, token, onClose, onSessionExpired, embedded = false }: Props) {
  const [team, setTeam] = useState<TeamState>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  const [email, setEmail] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [mutation, setMutation] = useState<Mutation | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => {
    headingRef.current?.focus()
    return () => requestRef.current?.abort()
  }, [])

  useEffect(() => {
    if (confirming) confirmRef.current?.focus()
  }, [confirming])

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const members = await listEventStaff(eventId, token, controller.signal)
        if (controller.signal.aborted) return
        if (!members) {
          onSessionExpired()
          return
        }
        setTeam({ status: 'ready', members })
      } catch (error) {
        if (!controller.signal.aborted) {
          setTeam({
            status: 'error',
            message: error instanceof Error ? error.message : 'Não foi possível carregar a equipe.',
          })
        }
      }
    }

    void load()
    return () => controller.abort()
  }, [eventId, token, onSessionExpired, revision])

  async function mutate<T>(
    operation: Mutation,
    request: (signal: AbortSignal) => Promise<T | null>,
    onSaved: (result: T) => void,
  ) {
    if (requestRef.current) return
    const controller = new AbortController()
    requestRef.current = controller
    setMutation(operation)
    setError('')
    setNotice('')

    try {
      const result = await request(controller.signal)
      if (controller.signal.aborted) return
      if (result === null) {
        onSessionExpired()
        return
      }
      onSaved(result)
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : 'Não foi possível atualizar a equipe.')
      }
    } finally {
      requestRef.current = null
      if (!controller.signal.aborted) setMutation(null)
    }
  }

  function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (confirming || !email.trim()) return

    void mutate({ kind: 'add' }, signal => addEventStaff(eventId, email.trim(), token, signal), member => {
      setTeam(current => current.status === 'ready'
        ? { status: 'ready', members: [...current.members, member] }
        : current)
      setEmail('')
      setNotice('Vínculo criado para ' + member.name + '.')
      requestAnimationFrame(() => emailRef.current?.focus())
    })
  }

  function removeMember(member: StaffMember) {
    void mutate({ kind: 'remove', userId: member.userId }, signal =>
      removeEventStaff(eventId, member.userId, token, signal), () => {
      setTeam(current => current.status === 'ready'
        ? { status: 'ready', members: current.members.filter(item => item.userId !== member.userId) }
        : current)
      setConfirming(null)
      setNotice('Vínculo de ' + member.name + ' removido.')
      requestAnimationFrame(() => emailRef.current?.focus())
    })
  }

  function retryLoad() {
    headingRef.current?.focus()
    setTeam({ status: 'loading' })
    setRevision(current => current + 1)
  }

  return (
    <section
      aria-labelledby={embedded ? undefined : 'staff-panel-title'}
      aria-label={embedded ? `Equipe de ${eventTitle}` : undefined}
      className={embedded ? 'drawer-embedded-panel' : 'panel-events'}
    >
      {!embedded && (
        <>
          <h2 id="staff-panel-title" tabIndex={-1} ref={headingRef}>Equipe de {eventTitle}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Fechar equipe</button>
        </>
      )}
      {team.status === 'loading' && <p role="status">Carregando equipe…</p>}
      {team.status === 'error' && (
        <>
          <p role="alert">{team.message}</p>
          <button type="button" onClick={retryLoad}>Tentar novamente</button>
        </>
      )}
      {team.status === 'ready' && (
        <>
          <form className="event-card auth-form lot-form-section" onSubmit={addMember}>
            <label>
              E-mail da conta STAFF
              <input
                ref={emailRef}
                type="email"
                maxLength={191}
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
                disabled={mutation !== null || confirming !== null}
                aria-describedby="staff-email-help"
              />
            </label>
            <p id="staff-email-help" className="event-meta">Use o e-mail de uma conta com perfil STAFF.</p>
            <button type="submit" disabled={mutation !== null || confirming !== null}>
              {mutation?.kind === 'add' ? 'Adicionando…' : 'Adicionar à equipe'}
            </button>
          </form>

          {error && <p role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}

          <div className="lot-form-section">
            {team.members.length === 0 ? (
              <p>Nenhuma pessoa vinculada a este evento.</p>
            ) : (
              <ul className="event-list">
                {team.members.map(member => (
                  <li key={member.userId}>
                    <article className="event-card">
                      <h3>{member.name}</h3>
                      <p>{member.email}</p>
                      {confirming === member.userId ? (
                        <>
                          <p>Remover {member.name} da equipe deste evento?</p>
                          <div className="event-actions">
                            <button ref={confirmRef} type="button" disabled={mutation !== null} onClick={() => removeMember(member)}>
                              {mutation?.kind === 'remove' && mutation.userId === member.userId
                                ? 'Removendo…'
                                : 'Confirmar remoção'}
                            </button>
                            <button
                              type="button"
                              disabled={mutation !== null}
                              onClick={() => {
                                setConfirming(null)
                                setError('')
                                requestAnimationFrame(() => document.getElementById('staff-remove-' + member.userId)?.focus())
                              }}
                            >
                              Manter na equipe
                            </button>
                          </div>
                        </>
                      ) : (
                        <button
                          id={'staff-remove-' + member.userId}
                          type="button"
                          aria-label={'Remover ' + member.name + ' da equipe'}
                          disabled={mutation !== null || confirming !== null}
                          onClick={() => {
                            setError('')
                            setNotice('')
                            setConfirming(member.userId)
                          }}
                        >
                          Remover
                        </button>
                      )}
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  )
}
