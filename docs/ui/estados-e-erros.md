# Estados de interface do EventBook

## Estados por tela

| Tela | Durante a consulta | Quando não há dados | Como recuperar |
| --- | --- | --- | --- |
| Vitrine | Carregando eventos | Nenhum evento publicado | Tentar novamente na vitrine |
| Detalhes do evento | Carregando evento | Nenhum lote à venda | Tentar novamente ou voltar à vitrine se o evento não existir |
| Login | Entrando | Formulário para iniciar a sessão | Corrigir credenciais ou aguardar o prazo informado |
| Painel do organizador | Carregando painel | Nenhum evento cadastrado | Tentar novamente no painel |
| Lotes, equipe e ocupação | Carregando a seção | Mensagem específica sobre os dados ausentes | Tentar novamente na seção |
| Meus Ingressos | Carregamento separado para ingressos e pedidos | Mensagem própria em cada lista | Tentar novamente na lista que falhou |
| Check-in | Carregando seus eventos | Nenhum evento vinculado | Tentar novamente ou pedir vínculo ao organizador |

Endereços desconhecidos mostram **Página não encontrada** com acesso à vitrine.

## Respostas da API

| HTTP | Comportamento da interface |
| --- | --- |
| 400 | Solicita a revisão dos dados. A reserva mantém a seleção para correção. |
| 401 | No login, informa credenciais inválidas. Em fluxos autenticados, oferece novo login quando a sessão expira. |
| 403 | Informa a restrição de perfil ou de permissão no fluxo afetado. |
| 404 | Distingue página desconhecida, evento ausente e lote indisponível conforme o fluxo. |
| 409 | Informa conflito, como estoque alterado ou ingresso já utilizado. |
| 422 | Mostra a recusa de negócio, como lote fora da janela de venda, pagamento recusado ou check-in inválido. |
| 429 | No login, orienta a aguardar o tempo indicado em `Retry-After` quando o cabeçalho está disponível. |
| 500 | Informa falha e oferece nova tentativa na tela ou na ação afetada. |
