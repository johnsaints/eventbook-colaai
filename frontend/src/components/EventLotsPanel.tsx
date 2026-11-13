import { useEffect, useRef, useState } from 'react'
import { getManagedLots, type ManagedLot } from '../lots'
import LotForm from './LotForm'

type Props = {
  eventId: string
  eventTitle: string
  token: string
  onClose: () => void
  onSessionExpired: () => void
}

type LotsState =
  | { status: 'loading' | 'error' }
  | { status: 'ready'; lots: ManagedLot[] }

type FormMode = { kind: 'create' } | { kind: 'edit'; lot: ManagedLot }

const formatPrice = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function lotStatus(lot: ManagedLot) {
  if (!lot.active) return 'Inativo'
  if (lot.availableQuantity === 0) return 'Esgotado'
  return 'Ativo'
}

export default function EventLotsPanel({ eventId, eventTitle, token, onClose, onSessionExpired }: Props) {
  const [state, setState] = useState<LotsState>({ status: 'loading' })
  const [form, setForm] = useState<FormMode | null>(null)
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const newLotButton = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function loadLots() {
      try {
        const lots = await getManagedLots(eventId, token, controller.signal)
        if (controller.signal.aborted) return
        if (!lots) {
          onSessionExpired()
          return
        }
        setState({ status: 'ready', lots })
      } catch {
        if (!controller.signal.aborted) setState({ status: 'error' })
      }
    }

    void loadLots()
    return () => controller.abort()
  }, [eventId, token, onSessionExpired, revision])

  function reloadLots() {
    headingRef.current?.focus()
    setState({ status: 'loading' })
    setRevision((current) => current + 1)
  }

  function openForm(mode: FormMode) {
    setNotice('')
    setForm(mode)
  }

  function closeForm() {
    setForm(null)
    requestAnimationFrame(() => newLotButton.current?.focus())
  }

  function handleSaved() {
    setNotice(form?.kind === 'edit' ? 'Lote atualizado.' : 'Lote cadastrado.')
    setForm(null)
    reloadLots()
  }

  return (
    <section aria-labelledby="lots-panel-title" className="panel-events">
      <h2 id="lots-panel-title" tabIndex={-1} ref={headingRef}>Lotes de {eventTitle}</h2>
      <div className="event-actions">
        <button type="button" onClick={onClose}>Fechar lotes</button>
        <button
          ref={newLotButton}
          type="button"
          disabled={form !== null || state.status !== 'ready'}
          onClick={() => openForm({ kind: 'create' })}
        >
          Novo lote
        </button>
      </div>

      {notice && <p role="status">{notice}</p>}
      {form && (
        <section aria-labelledby="lot-form-title" className="lot-form-section">
          <h3 id="lot-form-title">{form.kind === 'edit' ? 'Editar lote' : 'Novo lote'}</h3>
          <LotForm
            key={form.kind === 'edit' ? form.lot.id : 'new'}
            eventId={eventId}
            token={token}
            initialLot={form.kind === 'edit' ? form.lot : undefined}
            onSaved={handleSaved}
            onCancel={closeForm}
            onSessionExpired={onSessionExpired}
          />
        </section>
      )}

      {state.status === 'loading' && <p role="status">Carregando lotes…</p>}
      {state.status === 'error' && (
        <>
          <p role="alert">Não foi possível carregar os lotes.</p>
          <button type="button" onClick={reloadLots}>Tentar novamente</button>
        </>
      )}

      {state.status === 'ready' && (
        state.lots.length === 0 ? (
          <p>Nenhum lote cadastrado para este evento.</p>
        ) : (
          <div className="lots-table-region" role="region" aria-label="Tabela de lotes" tabIndex={0}>
            <table className="lots-table">
              <thead>
                <tr>
                  <th scope="col">Lote</th>
                  <th scope="col">Preço</th>
                  <th scope="col">Estoque livre</th>
                  <th scope="col">Status</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
              <tbody>
                {state.lots.map((lot) => (
                  <tr key={lot.id}>
                    <th scope="row">{lot.name}</th>
                    <td>{formatPrice.format(Number(lot.price))}</td>
                    <td>{lot.availableQuantity} de {lot.quantity}</td>
                    <td>{lotStatus(lot)}</td>
                    <td>
                      <button
                        type="button"
                        aria-label={`Editar lote ${lot.name}`}
                        disabled={form !== null}
                        onClick={() => openForm({ kind: 'edit', lot })}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </section>
  )
}
