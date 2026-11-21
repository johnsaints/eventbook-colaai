import { useState, type FormEvent } from 'react'
import type { ProvisionStaffInput, ProvisionStaffResult, StaffCandidate } from '../staff'
import { CheckIcon, CopyIcon, PlusIcon, UsersIcon } from './Icons'

type ModeTab = 'link' | 'provision'

export function StaffModeTabs({
  mode,
  onChange,
  disabled,
}: {
  mode: ModeTab
  onChange: (nextMode: ModeTab) => void
  disabled?: boolean
}) {
  return (
    <div className="staff-mode-tabs" role="tablist" aria-label="Modo de vinculação de equipe">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'link'}
        className={mode === 'link' ? 'drawer-tab active' : 'drawer-tab'}
        disabled={disabled}
        onClick={() => onChange('link')}
      >
        <UsersIcon width={14} height={14} />
        <span>Vincular conta STAFF</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'provision'}
        className={mode === 'provision' ? 'drawer-tab active' : 'drawer-tab'}
        disabled={disabled}
        onClick={() => onChange('provision')}
      >
        <PlusIcon width={14} height={14} />
        <span>Cadastrar novo membro</span>
      </button>
    </div>
  )
}

export function StaffCandidatesList({
  candidates,
  loading,
  error,
  busy,
  mode,
  onAddCandidate,
}: {
  candidates: StaffCandidate[] | null
  loading: boolean
  error: string
  busy: boolean
  mode: 'default' | 'event'
  onAddCandidate: (candidate: StaffCandidate) => void
}) {
  return (
    <div className="staff-candidates-box">
      <div className="staff-candidates-header">
        <span className="staff-candidates-title">Contas STAFF disponíveis</span>
        {loading && <span className="event-meta">Buscando…</span>}
      </div>

      {error ? (
        <p className="form-alert" role="alert">{error}</p>
      ) : !candidates || candidates.length === 0 ? (
        <p className="event-meta">
          {loading
            ? 'Consultando contas de portaria…'
            : 'Nenhuma conta STAFF encontrada com esse filtro. Use "Cadastrar novo membro" para criar uma agora.'}
        </p>
      ) : (
        <ul className="staff-candidates-list">
          {candidates.map((candidate) => {
            const alreadyLinked = mode === 'default' ? candidate.inDefaultTeam : candidate.assignedToEvent

            return (
              <li key={candidate.userId} className="staff-candidate-row">
                <div className="staff-candidate-info">
                  <strong>{candidate.name}</strong>
                  <span>{candidate.email}</span>
                </div>
                <div className="staff-candidate-actions">
                  {candidate.inDefaultTeam && (
                    <span className="staff-badge staff-badge-default">
                      {mode === 'default' ? 'Na equipe padrão' : 'Equipe padrão'}
                    </span>
                  )}
                  {alreadyLinked ? (
                    mode === 'event' ? <span className="staff-badge staff-badge-applied">Já na equipe</span> : null
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => onAddCandidate(candidate)}
                    >
                      <PlusIcon width={13} height={13} />
                      Adicionar
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function StaffCredentialsCard({ result }: { result: ProvisionStaffResult }) {
  const [copied, setCopied] = useState(false)

  async function copyCredentials() {
    const lines = [
      `Acesso ColaAí Portaria (${result.member.name})`,
      `E-mail: ${result.member.email}`,
      result.temporaryPassword
        ? `Senha temporária: ${result.temporaryPassword}`
        : 'Senha: definida por você no cadastro',
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="staff-credentials-card" aria-label="Credenciais da nova conta STAFF">
      <div className="staff-credentials-head">
        <div>
          <span className="eyebrow">Conta STAFF criada</span>
          <h3>{result.member.name}</h3>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copyCredentials()}>
          {copied ? <CheckIcon width={14} height={14} /> : <CopyIcon width={14} height={14} />}
          <span>{copied ? 'Copiado' : 'Copiar credenciais'}</span>
        </button>
      </div>
      <dl className="staff-credentials-grid">
        <div>
          <dt>E-mail</dt>
          <dd><code>{result.member.email}</code></dd>
        </div>
        <div>
          <dt>Senha inicial</dt>
          <dd>
            {result.temporaryPassword ? (
              <code>{result.temporaryPassword}</code>
            ) : (
              <span>Definida no cadastro</span>
            )}
          </dd>
        </div>
      </dl>
      <p className="event-meta">
        Compartilhe esses dados com segurança. O integrante já pode entrar com senha ou solicitar um Link mágico na tela de login.
      </p>
    </section>
  )
}

export function StaffProvisionForm({
  eventId,
  disabled,
  submitting,
  onSubmit,
}: {
  eventId?: string
  disabled?: boolean
  submitting?: boolean
  onSubmit: (input: ProvisionStaffInput) => Promise<boolean>
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [addToDefaultTeam, setAddToDefaultTeam] = useState(true)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim() || !email.trim()) return

    const ok = await onSubmit({
      name: name.trim(),
      email: email.trim(),
      ...(password.trim() ? { password } : {}),
      addToDefaultTeam: eventId ? addToDefaultTeam : true,
      ...(eventId ? { eventId } : {}),
    })

    if (ok) {
      setName('')
      setEmail('')
      setPassword('')
    }
  }

  return (
    <form className="event-card auth-form lot-form-section" onSubmit={handleSubmit}>
      <label>
        Nome completo
        <input
          type="text"
          minLength={2}
          maxLength={100}
          required
          placeholder="Ex.: Ana Paula Portaria"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={disabled}
        />
      </label>
      <label>
        E-mail
        <input
          type="email"
          maxLength={191}
          required
          placeholder="portaria@suaprodutora.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={disabled}
        />
      </label>
      <label>
        Senha inicial (opcional)
        <input
          type="password"
          minLength={6}
          maxLength={128}
          placeholder="Deixe em branco para gerar automaticamente"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={disabled}
        />
      </label>
      {eventId && (
        <label className="remember-access-field">
          <input
            type="checkbox"
            checked={addToDefaultTeam}
            onChange={(event) => setAddToDefaultTeam(event.target.checked)}
            disabled={disabled}
          />
          <span className="remember-access-copy">
            <strong>Salvar também na minha equipe padrão</strong>
            <span>Reaproveita esta pessoa automaticamente nos seus próximos eventos.</span>
          </span>
        </label>
      )}
      <button type="submit" className="btn btn-primary btn-sm" disabled={disabled}>
        <PlusIcon width={14} height={14} />
        {submitting ? 'Criando conta…' : 'Criar conta STAFF'}
      </button>
    </form>
  )
}
