# Teste de ponta a ponta do EventBook

O teste cadastra um comprador pela API pública, reserva um ingresso, simula o pagamento no navegador e copia o código em **Meus Ingressos**. Em outra sessão do Chromium, a conta STAFF valida o mesmo código e recebe a recusa quando tenta reutilizá-lo. O histórico do comprador deve mostrar o ingresso como **Utilizado**.

O Playwright inicia a API em `127.0.0.1:13333` e o frontend em `127.0.0.1:15173`. Ele aplica as migrações pendentes ao banco `eventbook_e2e` e remove os registros criados pelo cenário ao terminar. A configuração exige uma conexão MySQL local com esse nome de banco. [Servidores de teste do Playwright](https://playwright.dev/docs/test-webserver)

## Executar no Git Bash

Use o Node.js 24 com as dependências do backend e do frontend instaladas e o Prisma Client gerado. Ligue o MySQL do Docker Compose. Os comandos usam a credencial local de exemplo definida no Compose.

```bash
cd /c/-projetos/EventBook/e2e &&
npm ci &&
npx playwright install chromium &&
E2E_DATABASE_URL='mysql://root:rootpassword@127.0.0.1:3306/eventbook_e2e' npm test
```

Se a sua senha ou porta do MySQL for diferente, ajuste a conexão. Para ver o navegador, acrescente `-- --headed` a `npm test`.

## GitHub Actions

O workflow **EventBook E2E** provisiona um MySQL descartável e roda o cenário em pull requests, em pushes para `main` e por execução manual. Quando o teste falha, o job disponibiliza o conteúdo de `e2e/test-results/` como artefato. [Playwright no CI](https://playwright.dev/docs/ci)
