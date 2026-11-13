# ADR 0001 — Concorrência e expiração de reservas

- Estado implementado na M05 e ampliado na M06
- Data 2026-11-08
- Revisão 2026-11-09

## Contexto

Dois compradores podem tentar reservar a última vaga ao mesmo tempo. Um pedido pode ocupar vários lotes do mesmo evento, e uma falha em qualquer item precisa impedir a gravação parcial. A RN-02 define a janela de venda e o saldo, a RN-03 proíbe a venda acima do estoque, a RN-04 fixa a reserva em 15 minutos e a RN-09 preserva o preço da compra.

## Estratégias avaliadas

| Estratégia | Comportamento e custo |
| --- | --- |
| Lock pessimista por evento | O `SELECT … FOR UPDATE` faz as operações do mesmo evento aguardarem umas pelas outras. Reaproveita o lock usado na edição de eventos e lotes. A contenção pode aumentar em um evento muito concorrido, mesmo quando as compras usam lotes diferentes. |
| `UPDATE` condicional por lote | A condição de saldo no `WHERE` permite confirmar cada incremento pelo número de linhas afetadas. Pedidos com vários lotes ainda exigem uma transação e ordem de atualização estável. A coordenação com a edição do evento e a expiração também precisa ser definida. |
| Contador lido e incrementado separadamente | `reservedQty` torna a consulta de saldo barata. Se duas operações leem o mesmo saldo antes de incrementar, ambas podem aceitar a última vaga. O contador precisa de proteção transacional. |

## Decisão

Usar o lock pessimista por evento e manter `TicketLot.reservedQty` como contador. Cada transação que altera uma reserva deve adquirir primeiro o lock da linha de `events` pelo ID, seguindo o padrão de `lockEventForWrite` e `ReadCommitted`. O mesmo protocolo vale para criação, expiração, checkout e cancelamento de pedidos pendentes ou pagos. Cada transação trabalha com um único evento. Manter a transação curta, com acesso ao banco e sem chamadas externas.

No `POST /orders`, validar o evento publicado e a associação dos lotes, processar as reservas vencidas que ocupam os lotes solicitados e calcular o saldo de cada lote. Usar um único instante UTC capturado após adquirir o lock para verificar as janelas e fixar `createdAt` e `expiresAt`. A janela de venda inclui as duas bordas. O saldo é `totalQuantity - soldQuantity - reservedQty`. Lote inativo retorna `422 LOT_INACTIVE`, fora da janela retorna `422 LOT_OUT_OF_SALE_WINDOW` e saldo insuficiente retorna `409 INSUFFICIENT_STOCK`.

Depois de validar todos os itens, criar o pedido `PENDING`, seus itens e os incrementos dos contadores na mesma transação. Gravar `expiresAt = createdAt + 15 minutos` e copiar o preço atual de cada lote para `unitPriceSnapshot`. Calcular `totalAmount` com `Decimal`, somando o preço de cada item multiplicado pela quantidade. Uma falha durante a gravação desfaz o pedido, os itens e os incrementos.

## Expiração sob demanda e periódica

- **Sob demanda.** Antes de calcular o saldo de compra, processar os pedidos `PENDING` com `expiresAt <= agora` que ocupam algum dos lotes solicitados. Uma recusa prevista de compra após essa limpeza pode ser devolvida após o commit, para preservar a liberação já feita. Nesse caminho, a validação ocorre antes de qualquer gravação da nova reserva.
- **Job periódico.** Buscar pedidos vencidos em lotes de processamento usando o índice de `status` e `expiresAt`. Processar um evento por transação, com o mesmo lock da compra, e verificar novamente o estado e o prazo após adquiri-lo. O intervalo do job afeta o tempo de atualização do contador fora do fluxo de compra.
- **Liberação única.** Trocar `PENDING` por `EXPIRED` e decrementar `reservedQty` em todos os lotes do pedido na mesma transação, inclusive nos lotes ausentes da nova compra. Só decrementar se a transição de estado afetar uma linha. O cancelamento pendente usa a mesma disciplina e transita para `CANCELLED` quando ainda estiver no prazo.

## Checkout e cancelamento de pedidos pagos

O checkout de um pedido válido converte o estoque reservado em vendido, emite os ingressos e marca o pedido como `PAID` na mesma transação. A confirmação usa o valor salvo na reserva. Uma segunda tentativa em um pedido já pago retorna `409 ORDER_ALREADY_PAID`.

O cancelamento de pedido pago é permitido até 12 horas antes do início do evento, inclusive. A mesma transação marca os ingressos como `CANCELLED`, devolve o estoque vendido e atualiza o pedido. Repetir um cancelamento concluído devolve o pedido já cancelado sem devolver estoque outra vez. Reservas vencidas retornam `422 ORDER_EXPIRED` e são liberadas uma única vez.

## Evidência do ensaio

Ensaio com as migrações atuais em um banco MySQL temporário, com dados sintéticos. Foram exercitadas as operações no banco, antes da implementação da rota e do agendador.

- Oito tentativas concorrentes para um pedido de dois lotes, com uma única vaga em um deles. Uma tentativa gravou o pedido e os dois itens. Sete foram recusadas por estoque.
- Uma falha induzida depois das gravações reverteu o pedido, os itens e os contadores.
- Duas transações de expiração no instante exato do vencimento fizeram uma única transição e devolveram as vagas de ambos os lotes uma vez.
- No teste do `UPDATE` condicional, apenas uma das duas tentativas incrementou o contador de reservas. No teste com contador desprotegido, ambas incrementaram após ler a mesma vaga disponível.

A implementação tem cobertura de concorrência e preço preservado nas reservas, expiração, rollback do checkout e cancelamento. [Pedidos](../../backend/tests/orders.test.ts), [expiração](../../backend/tests/orders.expiration.test.ts), [rollback](../../backend/tests/checkout.rollback.test.ts), [cancelamento](../../backend/tests/cancellation.test.ts).

## Referências

- [Tarefa #57 — Spike e ADR](https://github.com/marcosfelpdev/EventBook/issues/57)
- [Regras de negócio do EventBook](https://github.com/marcosfelpdev/EventBook/blob/main/docs/regras-de-negocio.md)
- [MySQL 8.0 — locks em linhas e ordem das operações](https://dev.mysql.com/doc/refman/8.0/en/internal-locking.html)
- [Prisma 6 — transações interativas](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions)
