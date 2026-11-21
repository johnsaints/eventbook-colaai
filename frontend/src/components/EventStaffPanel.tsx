import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  addEventStaff,
  applyDefaultStaffToEvent,
  listEventStaff,
  listOrganizerDefaultStaff,
  provisionStaffMember,
  removeEventStaff,
  useStaffCandidates,
  type ProvisionStaffInput,
  type ProvisionStaffResult,
  type StaffCandidate,
  type StaffMember,
} from '../staff'
import { UsersIcon } from './Icons'
import {
  StaffCandidatesList,
  StaffCredentialsCard,
  StaffModeTabs,
  StaffProvisionForm,
} from './StaffSharedControls'

type Props = {
  eventId: string
  eventTitle: string
  token: string
  onClose: () => void
  onSessionExpired: () => void
  onStaffCountChange?: (count: number) => void
  onDefaultTeamCountChange?: (count: number) => void
  onOpenDefaultTeam?: () => void
  embedded?: boolean
}

type TeamState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; members: StaffMember[] }

type Mutation =
  | { kind: 'add' }
  | { kind: 'apply-default' }
  | { kind: 'provision' }
  | { kind: 'remove'; userId: string }

export default function EventStaffPanel({
  eventId,
  eventTitle,
  token,
  onClose,
  onSessionExpired,
  onStaffCountChange,
  onDefaultTeamCountChange,
  onOpenDefaultTeam,
  embedded = false,
}: Props) {
  const [team, setTeam] = useState<TeamState>({ status: 'loading' })
  const [defaultTeam, setDefaultTeam] = useState<StaffMember[]>([])
  const [revision, setRevision] = useState(0)
  const [mode, setMode] = useState<'link' | 'provision'>('link')
  const [email, setEmail] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [mutation, setMutation] = useState<Mutation | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [lastProvisioned, setLastProvisioned] = useState<ProvisionStaffResult | null>(null)

  const headingRef = useRef<HTMLHeadingElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const requestRef = useRef<AbortController | null>(null)
  const staffCountChangeRef = useRef(onStaffCountChange)
  const defaultTeamCountChangeRef = useRef(onDefaultTeamCountChange)

  const {
    candidates,
    setCandidates,
    loading: candidatesLoading,
    error: candidatesError,
  } = useStaffCandidates({
    enabled: team.status === 'ready' && mode === 'link',
    query: email,
    eventId,
    token,
    revision,
    onSessionExpired,
  })

  useEffect(() => {
    staffCountChangeRef.current = onStaffCountChange
  }, [onStaffCountChange])

  useEffect(() => {
    defaultTeamCountChangeRef.current = onDefaultTeamCountChange
  }, [onDefaultTeamCountChange])

  useEffect(() => {
    if (team.status === 'ready') {
      staffCountChangeRef.current?.(team.members.length)
    }
  }, [team])

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
        const [members, orgTeam] = await Promise.all([
          listEventStaff(eventId, token, controller.signal),
          listOrganizerDefaultStaff(token, controller.signal).catch(() => [] as StaffMember[]),
        ])
        if (controller.signal.aborted) return
        if (!members) {
          onSessionExpired()
          return
        }
        setTeam({ status: 'ready', members })
        if (orgTeam) {
          setDefaultTeam(orgTeam)
          defaultTeamCountChangeRef.current?.(orgTeam.length)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setTeam({
            status: 'error',
            message: err instanceof Error ? err.message : 'Não foi possível carregar a equipe.',
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
  ): Promise<boolean> {
    if (requestRef.current) return false
    const controller = new AbortController()
    requestRef.current = controller
    setMutation(operation)
    setError('')
    setNotice('')

    try {
      const result = await request(controller.signal)
      if (controller.signal.aborted) return false
      if (result === null) {
        onSessionExpired()
        return false
      }
      onSaved(result)
      return true
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Não foi possível atualizar a equipe.')
      }
      return false
    } finally {
      requestRef.current = null
      if (!controller.signal.aborted) setMutation(null)
    }
  }

  function appendEventMember(member: StaffMember, inDefault = false) {
    setTeam((current) =>
      current.status === 'ready'
        ? {
            status: 'ready',
            members: current.members.some((item) => item.userId === member.userId)
              ? current.members
              : [...current.members, member],
          }
        : current
    )
    setCandidates((current) =>
      current
        ? current.map((item) =>
            item.userId === member.userId
              ? { ...item, assignedToEvent: true, ...(inDefault ? { inDefaultTeam: true } : {}) }
              : item
          )
        : current
    )
  }

  function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (confirming || !email.trim()) return

    void mutate({ kind: 'add' }, (signal) => addEventStaff(eventId, email.trim(), token, signal), (member) => {
      appendEventMember(member)
      setEmail('')
      setNotice('Vínculo criado para ' + member.name + '.')
      requestAnimationFrame(() => emailRef.current?.focus())
    })
  }

  function addCandidate(candidate: StaffCandidate) {
    if (confirming) return
    void mutate({ kind: 'add' }, (signal) => addEventStaff(eventId, candidate.email, token, signal), (member) => {
      appendEventMember(member)
      setNotice('Vínculo criado para ' + member.name + '.')
    })
  }

  function handleApplyDefault() {
    if (confirming) return
    void mutate(
      { kind: 'apply-default' },
      (signal) => applyDefaultStaffToEvent(eventId, token, signal),
      (result) => {
        setTeam({ status: 'ready', members: result.members })
        const memberIds = new Set(result.members.map((item) => item.userId))
        setCandidates((current) =>
          current
            ? current.map((item) => ({ ...item, assignedToEvent: memberIds.has(item.userId) }))
            : current
        )
        setNotice(
          result.addedCount > 0
            ? `${result.addedCount} ${result.addedCount === 1 ? 'integrante da equipe padrão vinculado' : 'integrantes da equipe padrão vinculados'} ao evento.`
            : 'Todos os integrantes da sua equipe padrão já estavam vinculados.',
        )
      },
    )
  }

  async function handleProvision(input: ProvisionStaffInput): Promise<boolean> {
    if (confirming) return false
    return mutate(
      { kind: 'provision' },
      (signal) => provisionStaffMember(input, token, signal),
      (result) => {
        appendEventMember(result.member, result.addedToDefaultTeam)
        if (result.addedToDefaultTeam) {
          setDefaultTeam((current) => {
            const next = current.some((item) => item.userId === result.member.userId)
              ? current
              : [...current, result.member]
            defaultTeamCountChangeRef.current?.(next.length)
            return next
          })
        }
        setLastProvisioned(result)
        setNotice(`Conta STAFF de ${result.member.name} criada e vinculada a este evento.`)
      },
    )
  }

  function removeMember(member: StaffMember) {
    void mutate(
      { kind: 'remove', userId: member.userId },
      (signal) => removeEventStaff(eventId, member.userId, token, signal),
      () => {
        setTeam((current) =>
          current.status === 'ready'
            ? { status: 'ready', members: current.members.filter((item) => item.userId !== member.userId) }
            : current
        )
        setCandidates((current) =>
          current
            ? current.map((item) =>
                item.userId === member.userId ? { ...item, assignedToEvent: false } : item
              )
            : current
        )
        setConfirming(null)
        setNotice('Vínculo de ' + member.name + ' removido.')
        requestAnimationFrame(() => emailRef.current?.focus())
      },
    )
  }

  function retryLoad() {
    headingRef.current?.focus()
    setTeam({ status: 'loading' })
    setRevision((current) => current + 1)
  }

  const eventMemberIds = new Set(team.status === 'ready' ? team.members.map((item) => item.userId) : [])
  const pendingDefaultCount = defaultTeam.filter((item) => !eventMemberIds.has(item.userId)).length

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
          <p className="form-alert" role="alert">{team.message}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={retryLoad}>Tentar novamente</button>
        </>
      )}
      {team.status === 'ready' && (
        <>
          {(defaultTeam.length > 0 || onOpenDefaultTeam) && (
            <div className="staff-quick-banner">
              <div className="staff-quick-banner-copy">
                <UsersIcon width={15} height={15} variant="gradient" />
                {defaultTeam.length > 0 ? (
                  pendingDefaultCount > 0 ? (
                    <span>
                      Equipe padrão disponível ({pendingDefaultCount}{' '}
                      {pendingDefaultCount === 1 ? 'integrante pendente' : 'integrantes pendentes'})
                    </span>
                  ) : (
                    <span>Equipe padrão já aplicada ({defaultTeam.length})</span>
                  )
                ) : (
                  <span>Configure sua equipe fixa para vincular em 1 clique em todos os eventos.</span>
                )}
              </div>
              {defaultTeam.length > 0 && pendingDefaultCount > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={mutation !== null || confirming !== null}
                  onClick={handleApplyDefault}
                >
                  {mutation?.kind === 'apply-default' ? 'Aplicando…' : 'Aplicar equipe padrão'}
                </button>
              )}
              {defaultTeam.length === 0 && onOpenDefaultTeam && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={mutation !== null || confirming !== null}
                  onClick={onOpenDefaultTeam}
                >
                  Configurar equipe padrão
                </button>
              )}
            </div>
          )}

          <StaffModeTabs
            mode={mode}
            disabled={mutation !== null || confirming !== null}
            onChange={(nextMode) => {
              setMode(nextMode)
              setError('')
              setNotice('')
            }}
          />

          {mode === 'link' ? (
            <form className="event-card auth-form lot-form-section" onSubmit={addMember}>
              <label>
                E-mail da conta STAFF
                <input
                  ref={emailRef}
                  type="email"
                  maxLength={191}
                  required
                  placeholder="Digite nome ou e-mail (ex.: checkin@colaai.com)"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={mutation !== null || confirming !== null}
                  aria-describedby="staff-email-help"
                />
              </label>
              <p id="staff-email-help" className="event-meta">
                Selecione uma conta abaixo ou digite o e-mail de uma conta STAFF (ex.: checkin@colaai.com).
              </p>
              <StaffCandidatesList
                candidates={candidates}
                loading={candidatesLoading}
                error={candidatesError}
                busy={mutation !== null || confirming !== null}
                mode="event"
                onAddCandidate={addCandidate}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={mutation !== null || confirming !== null}>
                {mutation?.kind === 'add' ? 'Adicionando…' : 'Adicionar à equipe'}
              </button>
            </form>
          ) : (
            <StaffProvisionForm
              eventId={eventId}
              disabled={mutation !== null || confirming !== null}
              submitting={mutation?.kind === 'provision'}
              onSubmit={handleProvision}
            />
          )}

          {error && <p className="form-alert" role="alert">{error}</p>}
          {notice && <p className="form-status" role="status">{notice}</p>}
          {lastProvisioned && <StaffCredentialsCard result={lastProvisioned} />}

          <div className="lot-form-section">
            {team.members.length === 0 ? (
              <p>Nenhuma pessoa vinculada a este evento.</p>
            ) : (
              <ul className="event-list">
                {team.members.map((member) => (
                  <li key={member.userId}>
                    <article className="event-card">
                      <h3>{member.name}</h3>
                      <p>{member.email}</p>
                      {confirming === member.userId ? (
                        <>
                          <p>Remover {member.name} da equipe deste evento?</p>
                          <div className="event-actions">
                            <button
                              ref={confirmRef}
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={mutation !== null}
                              onClick={() => removeMember(member)}
                            >
                              {mutation?.kind === 'remove' && mutation.userId === member.userId
                                ? 'Removendo…'
                                : 'Confirmar remoção'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
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
                          className="btn btn-ghost btn-sm"
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
