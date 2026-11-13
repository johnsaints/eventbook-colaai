# API de ocupação do EventBook

`GET /events/:id/occupancy` atende à RN-10. Envie o token do organizador dono do evento no cabeçalho `Authorization: Bearer <token>` e use o UUID do evento em `:id`.

## Resposta HTTP 200

O objeto contém `eventId`, `totals` com os números do evento e `lots` com uma entrada por lote. Cada lote inclui `id`, `name` e as mesmas métricas de `totals`.

| Campo | Significado |
| --- | --- |
| `totalTickets` | Quantidade cadastrada nos lotes do evento, inclusive nos inativos. |
| `soldTickets` | Vendas confirmadas contabilizadas no estoque. Reservas pendentes ficam fora e cancelamentos que devolvem estoque reduzem o total. |
| `checkIns` | Entradas registradas na tabela de check-ins. |
| `occupancyPercentage` | Check-ins divididos pela quantidade cadastrada e multiplicados por 100, com até duas casas decimais. |

Em eventos sem lotes, os totais são zero e `lots` é uma lista vazia. A resposta inclui `Cache-Control: no-store`.

## Erros

| HTTP | Código | Motivo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Identificador fora do formato UUID. |
| 401 | `UNAUTHORIZED` | Sessão ausente ou inválida. |
| 403 | `FORBIDDEN` | A conta autenticada não é o organizador dono do evento. |
| 404 | `EVENT_NOT_FOUND` | O evento não existe. |

## Painel do organizador

Entre com a conta que criou o evento. Em **Painel de eventos → Meus eventos**, selecione **Ver ocupação** no cartão do evento. Os cards mostram os totais do evento e o gráfico detalha o percentual de check-ins de cada lote. Use **Atualizar dados** para consultar os números após vendas, cancelamentos ou check-ins.
