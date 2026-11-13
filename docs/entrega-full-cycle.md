# Publicação e demonstração do EventBook

## Repositório e CI

Use um repositório público próprio para o projeto. A branch de publicação deve ser `main`, conforme o Blueprint. Confira a URL do remote e o conteúdo do commit antes do primeiro push. O workflow cria bancos MySQL temporários para integração e E2E. Ele executa os testes e produz o artefato `eventbook-e2e` com o trace do Chromium.

## Publicar no Render

O Blueprint descreve uma API Docker e um frontend estático. O MySQL fica em um serviço gerenciado externo. O plano gratuito do Aiven para MySQL é uma opção para a demonstração. [Render gratuito](https://render.com/docs/free), [MySQL gratuito do Aiven](https://aiven.io/docs/products/mysql/concepts/mysql-free-tier).

1. Depois que o CI do repositório próprio passar, crie o MySQL gerenciado e obtenha a conexão e o certificado CA do serviço.
2. No Render, importe `render.yaml` do seu repositório com a integração do GitHub. Use os nomes de serviços do arquivo ou ajuste-os antes da importação.
3. Na API, cadastre o certificado do banco em **Secret Files** com o nome `mysql-ca.pem`. Configure `DATABASE_URL` com a conexão real, o banco provisionado e os parâmetros `sslcert=/etc/secrets/mysql-ca.pem&sslaccept=strict`. Se houver caracteres reservados no usuário ou na senha, use a forma codificada para URL. O Render gera `JWT_SECRET` para a API. [Certificados no Prisma 6](https://www.prisma.io/docs/orm/v6/core-concepts/supported-databases/mysql).
4. Configure `CORS_ORIGINS` na API com a origem HTTPS do frontend e `VITE_API_URL` no frontend com a URL HTTPS da API. Use as URLs que o Render atribuir. Caso elas só estejam disponíveis após a criação dos serviços, atualize as variáveis e refaça o primeiro build.
5. Confira `/health` na API, abra a vitrine e valide o acesso a `/events`. Em um commit posterior na `main`, confirme que o deploy ficou aguardando os checks e iniciou depois que eles passaram. [Deploy depois do CI](https://render.com/docs/deploys#integrating-with-ci).

O plano gratuito pode suspender a API por inatividade, o que aumenta a latência da primeira requisição. O limite de autenticação usa memória local e depende de o backend identificar o IP atrás do proxy. Valide o comportamento na configuração pública antes da apresentação. Use dados sintéticos e credenciais próprias para contas de demonstração no ambiente público.

## Demonstração

1. Mostre a aplicação online, o repositório próprio e o CI do commit implantado.
2. Mostre o comentário sobre DIP no checkout. Abra o teste que injeta um gateway que recusa o pagamento e preserva o pedido pendente.
3. Crie um evento de teste com início dentro de uma hora, configure o lote, publique e vincule uma conta STAFF. Cadastre um comprador pela API, reserve, pague pelo simulador e consulte o código em **Meus Ingressos**.
4. Entre como STAFF, valide o código e tente usá-lo de novo. Mostre o ingresso como **Utilizado** e a atualização da ocupação.
5. Inspecione uma resposta da API e procure o seu `X-Request-Id` nos logs. Compare `status` e `durationMs`. Abra o trace de um E2E e localize a requisição de checkout ou check-in.

Para analisar um trace local, execute o E2E com `npm test -- --trace on` e abra o `trace.zip` resultante com `npx playwright show-trace CAMINHO_DO_TRACE.zip`, na pasta `e2e`. O guia do cenário descreve como definir a conexão de teste. [Guia do E2E](../e2e/README.md)

Para discutir desempenho, rode esta consulta no MySQL de demonstração e observe `possible_keys`, `key` e `rows`:

```sql
EXPLAIN
SELECT id, eventId, expiresAt
FROM orders
WHERE status = 'PENDING' AND expiresAt <= UTC_TIMESTAMP()
ORDER BY expiresAt, id
LIMIT 100;
```

O plano varia com a distribuição dos dados. Use os logs e o plano de consulta como evidência do diagnóstico. Uma melhoria futura é medir a espera pelo lock em um evento de alta demanda antes de mudar a estratégia de concorrência.

## Evidências locais

- A suíte do backend passou com 66 testes, incluindo 7 testes unitários de regras de eventos.
- O cenário Playwright passou no Chromium. O trace registrou checkout HTTP 200, check-in HTTP 201 e tentativa duplicada HTTP 409, todos com o identificador de requisição.
- No MySQL descartável, o plano de expiração usou o índice composto de `status` e `expiresAt`. A consulta ao catálogo via Compose respondeu HTTP 200 e o identificador da resposta foi localizado no log da API.

## Apresentação individual

Cada pessoa deve registrar sua contribuição, um ponto forte e uma oportunidade de melhoria. Um exemplo de ponto forte do projeto é impedir venda acima do estoque sob concorrência. Uma oportunidade é medir a contenção do lock por evento e avaliar o efeito da latência do MySQL na compra. Relacione os exemplos à parte que você realmente desenvolveu e consegue explicar.
