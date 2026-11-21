import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  addOrganizerDefaultStaff,
  listOrganizerDefaultStaff,
  provisionStaffMember,
  removeOrganizerDefaultStaff,
  useStaffCandidates,
  type ProvisionStaffInput,
  type ProvisionStaffResult,
  type StaffCandidate,
  type StaffMember,
} from '../staff'
import {
  StaffCandidatesList,
  StaffCredentialsCard,
  StaffModeTabs,
  StaffProvisionForm,
} from './StaffSharedControls'

type Props = {
  token: string
  onSessionExpired: () => void
  onCountChange?: (count: number) => void
}

type TeamState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; members: StaffMember[] }

type Mutation = { kind: 'add' } | { kind: 'provision' } | { kind: 'remove'; userId: string }

export default function OrganizerTeamPanel({ token, onSessionExpired, onCountChange }: Props) {
  const [team, setTeam] = useState<TeamState>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  const [mode, setMode] = useState<'link' | 'provision'>('link')
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [mutation, setMutation] = useState<Mutation | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [lastProvisioned, setLastProvisioned] = useState<ProvisionStaffResult | null>(null)

  const queryRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const requestRef = useRef<AbortController | null>(null)
  const countChangeRef = useRef(onCountChange)

  const {
    candidates,
    setCandidates,
    loading: candidatesLoading,
    error: candidatesError,
  } = useStaffCandidates({
    enabled: team.status === 'ready' && mode === 'link',
    query,
    token,
    revision,
    onSessionExpired,
  })

  useEffect(() => {
    countChangeRef.current = onCountChange
  }, [onCountChange])

  useEffect(() => {
    if (team.status === 'ready') {
      countChangeRef.current?.(team.members.length)
    }
  }, [team])

  useEffect(() => () => requestRef.current?.abort(), [])

  useEffect(() => {
    if (confirming) confirmRef.current?.focus()
  }, [confirming])

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const members = await listOrganizerDefaultStaff(token, controller.signal)
        if (controller.signal.aborted) return
        if (!members) {
          onSessionExpired()
          return
        }
        setTeam({ status: 'ready', members })
      } catch (err) {
        if (!controller.signal.aborted) {
          setTeam({
            status: 'error',
            message: err instanceof Error ? err.message : 'Não foi possível carregar sua equipe padrão.',
          })
        }
      }
    }

    void load()
    return () => controller.abort()
  }, [token, onSessionExpired, revision])

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
        setError(err instanceof Error ? err.message : 'Não foi possível atualizar a equipe padrão.')
      }
      return false
    } finally {
      requestRef.current = null
      if (!controller.signal.aborted) setMutation(null)
    }
  }

  function appendMember(member: StaffMember) {
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
            item.userId === member.userId ? { ...item, inDefaultTeam: true } : item
          )
        : current
    )
  }

  function addByEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (confirming || !query.trim()) return

    void mutate(
      { kind: 'add' },
      (signal) => addOrganizerDefaultStaff(query.trim(), token, signal),
      (member) => {
        appendMember(member)
        setQuery('')
        setNotice(`${member.name} adicionado à sua equipe padrão.`)
        requestAnimationFrame(() => queryRef.current?.focus())
      },
    )
  }

  function addCandidate(candidate: StaffCandidate) {
    if (confirming) return
    void mutate(
      { kind: 'add' },
      (signal) => addOrganizerDefaultStaff(candidate.email, token, signal),
      (member) => {
        appendMember(member)
        setNotice(`${member.name} adicionado à sua equipe padrão.`)
      },
    )
  }

  async function handleProvision(input: ProvisionStaffInput): Promise<boolean> {
    if (confirming) return false
    return mutate(
      { kind: 'provision' },
      (signal) => provisionStaffMember(input, token, signal),
      (result) => {
        appendMember(result.member)
        setLastProvisioned(result)
        setNotice(`Conta STAFF de ${result.member.name} criada e salva na sua equipe padrão.`)
      },
    )
  }

  function removeMember(member: StaffMember) {
    void mutate(
      { kind: 'remove', userId: member.userId },
      (signal) => removeOrganizerDefaultStaff(member.userId, token, signal),
      () => {
        setTeam((current) =>
          current.status === 'ready'
            ? { status: 'ready', members: current.members.filter((item) => item.userId !== member.userId) }
            : current
        )
        setCandidates((current) =>
          current
            ? current.map((item) =>
                item.userId === member.userId ? { ...item, inDefaultTeam: false } : item
              )
            : current
        )
        setConfirming(null)
        setNotice(`${member.name} removido da sua equipe padrão.`)
        requestAnimationFrame(() => queryRef.current?.focus())
      },
    )
  }

  return (
    <section aria-label="Minha equipe padrão" className="drawer-embedded-panel">
      <div className="staff-quick-banner">
        <p className="event-meta">
          Integrantes salvos aqui são vinculados automaticamente aos novos eventos que você criar e ficam disponíveis para aplicar em 1 clique nos eventos existentes.
        </p>
      </div>

      {team.status === 'loading' && <p role="status">Carregando equipe padrão…</p>}
      {team.status === 'error' && (
        <>
          <p className="form-alert" role="alert">{team.message}</p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setTeam({ status: 'loading' })
              setRevision((current) => current + 1)
            }}
          >
            Tentar novamente
          </button>
        </>
      )}

      {team.status === 'ready' && (
        <>
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
            <form className="event-card auth-form lot-form-section" onSubmit={addByEmail}>
              <label>
                Buscar conta STAFF por nome ou e-mail
                <input
                  ref={queryRef}
                  type="text"
                  maxLength={191}
                  placeholder="Digite nome ou e-mail (ex.: checkin@colaai.com)"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  disabled={mutation !== null || confirming !== null}
                />
              </label>
              <StaffCandidatesList
                candidates={candidates}
                loading={candidatesLoading}
                error={candidatesError}
                busy={mutation !== null || confirming !== null}
                mode="default"
                onAddCandidate={addCandidate}
              />
              {query.includes('@') && (
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={mutation !== null || confirming !== null}
                >
                  {mutation?.kind === 'add' ? 'Adicionando…' : 'Vincular por este e-mail'}
                </button>
              )}
            </form>
          ) : (
            <StaffProvisionForm
              disabled={mutation !== null || confirming !== null}
              submitting={mutation?.kind === 'provision'}
              onSubmit={handleProvision}
            />
          )}

          {error && <p className="form-alert" role="alert">{error}</p>}
          {notice && <p className="form-status" role="status">{notice}</p>}
          {lastProvisioned && <StaffCredentialsCard result={lastProvisioned} />}

          <div className="lot-form-section">
            <h3 className="staff-section-subtitle">
              Integrantes da equipe padrão ({team.members.length})
            </h3>
            {team.members.length === 0 ? (
              <p className="event-meta">Nenhum integrante salvo na sua equipe padrão ainda.</p>
            ) : (
              <ul className="event-list">
                {team.members.map((member) => (
                  <li key={member.userId}>
                    <article className="event-card">
                      <h3>{member.name}</h3>
                      <p>{member.email}</p>
                      {confirming === member.userId ? (
                        <>
                          <p className="event-meta">
                            Remover {member.name} da sua equipe padrão? Os vínculos em eventos já criados permanecem até serem editados.
                          </p>
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
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={mutation !== null}
                          onClick={() => {
                            setConfirming(member.userId)
                            setError('')
                            setNotice('')
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
