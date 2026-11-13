# ADR 0002 — Check-in por vínculo e agregação de ocupação

- Estado implementado nas M07 e M08
- Data 2026-11-09

## Contexto

A portaria precisa impedir que duas pessoas validem o mesmo ingresso. O organizador precisa distinguir ingressos vendidos de entradas confirmadas e consultar os totais por lote em uma mesma leitura.

## Decisão

### Check-in

O staff só registra entrada quando sua conta tem o perfil STAFF e está vinculada ao evento. O serviço verifica o vínculo, a associação do ingresso, seu estado e a janela de entrada. A janela inclui as duas horas anteriores ao início e vai até o horário de término do evento.

A gravação usa o lock do evento, atualiza apenas um ingresso ainda `VALID` para `USED` e cria o registro de check-in na mesma transação. A restrição única de `CheckIn.ticketId` protege contra duplicidade. Quando o ingresso já está `USED` ou possui um check-in, a operação retorna `409 TICKET_ALREADY_USED`. [ADR 0001](0001-concorrencia-e-expiracao-de-reservas.md)

### Ocupação

A rota é exclusiva do organizador dono do evento. O MySQL soma o estoque cadastrado e vendido e conta os check-ins persistidos. O cálculo inclui lotes inativos e usa a mesma transação de leitura com `RepeatableRead` para os totais e o detalhamento. A taxa divide os check-ins pelo estoque cadastrado, arredonda a duas casas decimais e retorna zero quando o denominador é zero. [Contrato de ocupação](../api/ocupacao.md)

## Consequências

- Operações de escrita no mesmo evento compartilham o lock, o que preserva a consistência e pode aumentar a espera em eventos muito concorridos.
- Check-in registrado e venda confirmada são medidas separadas. Uma reserva pendente fica fora do total de vendas.
- Ingressos legados já marcados como `USED` são recusados no check-in. A ocupação conta as entradas que possuem registro persistido.
- A consulta mantém os totais e os lotes consistentes durante alterações de estoque e check-ins concorrentes.

## Verificação

- [Vínculo, estado do ingresso e duplicidade](../../backend/tests/checkin.rn07.test.ts)
- [Bordas da janela de check-in](../../backend/tests/checkin.rn08.test.ts)
- [Ocupação, evento sem lotes e permissões](../../backend/tests/occupancy.test.ts)
- [Fluxo de compra e check-in no Chromium](../../e2e/compra-checkin.spec.mjs)
