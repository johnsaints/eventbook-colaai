# EventBook

Projeto final da Formação Full Cycle. O EventBook permite publicar eventos, gerenciar lotes, reservar e emitir ingressos e validar a entrada com uma conta STAFF vinculada ao evento. O organizador acompanha o estoque, as vendas e os check-ins por lote.

## Rodar com Docker

Com Docker Desktop e Compose disponíveis, rode na raiz do projeto:

```bash
docker compose up -d --build --wait
```

Abra o frontend em `http://localhost:5173`. A API responde em `http://localhost:3333/health`. O Compose espera o MySQL aceitar consultas antes de iniciar a API. A imagem aplica as migrações com `prisma migrate deploy` antes de abrir a porta. O volume `mysql_data` guarda os dados entre reinícios. [Ordem de inicialização no Docker Compose](https://docs.docker.com/compose/how-tos/startup-order/)

Caso as portas já estejam ocupadas por uma sessão local, use um projeto Compose separado para a demonstração:

```bash
EVENTBOOK_MYSQL_PORT=13306 EVENTBOOK_API_PORT=13334 EVENTBOOK_WEB_PORT=15174 \
  docker compose -p eventbook-demo up -d --build --wait
```

Nesse caso, abra `http://localhost:15174`. Para criar usuários e um evento de demonstração em um banco local novo, execute `docker compose exec backend node --import tsx prisma/seed.ts`. Se usou o projeto separado, acrescente `-p eventbook-demo` após `docker compose`. As credenciais padrão do seed são apenas locais.

## Decisões técnicas

- **Express e TypeScript.** Os controllers tratam HTTP, os serviços aplicam regras de negócio e o Prisma acessa o MySQL.
- **MySQL e transações.** O projeto usa o lock do evento para serializar reserva, checkout e check-in concorrentes do mesmo evento. A ocupação agrega as métricas no banco. [ADR de reservas](docs/adr/0001-concorrencia-e-expiracao-de-reservas.md), [ADR de check-in e ocupação](docs/adr/0002-check-in-e-ocupacao.md).
- **SOLID.** O checkout depende do contrato `PaymentGateway`. O simulador é a implementação padrão e os testes injetam outra implementação para simular uma recusa. [Checkout](backend/src/modules/orders/orders.checkout.ts), [teste de rollback](backend/tests/checkout.rollback.test.ts).
- **Escopo da entrega.** O cadastro de comprador é feito pela API e o pagamento é simulado. Isso permite demonstrar autenticação, estoque, transações e emissão de ingressos sem integrar cobrança real.

## Pirâmide de testes e CI/CD

| Nível | Evidência |
| --- | --- |
| Unitário | Regras de data e publicação testadas com datas fixas, sem acesso ao MySQL. [Testes unitários](backend/tests/events.rules.test.ts) |
| Integração | API com Supertest e MySQL para permissões, estoque, concorrência, rollback e check-in. [Suíte do backend](backend/tests/) |
| Ponta a ponta | Chromium cobre cadastro pela API, compra, emissão, check-in e recusa de código duplicado. [Execução do E2E](e2e/README.md) |

O GitHub Actions executa a compilação, o lint do frontend, os testes e a construção das imagens a cada push e pull request. O workflow guarda o trace do Chromium. O Blueprint configura o Render para aguardar os checks do mesmo commit antes do deploy automático. [Workflow](.github/workflows/e2e.yml), [configuração de publicação](docs/entrega-full-cycle.md), [integração do Render com CI](https://render.com/docs/deploys#integrating-with-ci).

A IA auxiliou na criação dos casos de teste, na revisão da documentação e na preparação do roteiro. As evidências da entrega foram conferidas com dados sintéticos e execução da suíte.

## Logs e desempenho

A API inclui `X-Request-Id` nas respostas e registra o mesmo identificador, o nome da rota, o status e a duração em milissegundos nos logs. Os logs de acesso usam a rota parametrizada e omitem dados da requisição. Para acompanhar a API, use `docker compose logs -f backend`.

A expiração de reservas usa o índice composto de `status` e `expiresAt` e lê os pedidos em páginas. O checkout emite os ingressos em lotes de até 500. A ocupação usa somas e contagens no MySQL. O lock do evento pode virar um gargalo em eventos concorridos e o rate limit em memória tem escopo de uma instância. O [roteiro de entrega](docs/entrega-full-cycle.md) mostra como inspecionar um plano de consulta, um log e um trace durante a demonstração.

## API

| Rota | Uso |
| --- | --- |
| `GET /health` | Verificar a API |
| `POST /register` e `POST /login` | Cadastrar comprador e iniciar sessão |
| `GET /events` | Consultar eventos publicados |
| `POST /orders` | Reservar ingressos |
| `POST /orders/:id/checkout` | Confirmar pagamento simulado |
| `POST /tickets/:code/checkin` | Validar ingresso |
| `GET /events/:id/occupancy` | Consultar ocupação |

[Contrato completo OpenAPI](docs/api/openapi.yaml) · [Segurança e CORS](docs/api/seguranca.md) · [Estados da interface](docs/ui/estados-e-erros.md)

## Licença e Propriedade Intelectual

Copyright © 2026 **John Facundo** — **Todos os direitos reservados (`All Rights Reserved`)**.

Este repositório é mantido público **exclusivamente para leitura e avaliação acadêmica** no contexto do projeto final da Formação Full Cycle. Nenhuma licença open source é concedida: é proibida a cópia, redistribuição, modificação, implantação em produção ou exploração comercial (total ou parcial) deste código, interface e ativos sem autorização prévia e expressa por escrito do titular. Consulte [LICENSE](LICENSE) para os termos completos.
