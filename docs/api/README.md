# Referência da API EventBook

- [Contrato OpenAPI](openapi.yaml)
- [Proteções HTTP e CORS](seguranca.md)
- [Regras da consulta de ocupação](ocupacao.md)
- [Estados e respostas na interface](../ui/estados-e-erros.md)
- [ADR 0001 — Concorrência e expiração de reservas](../adr/0001-concorrencia-e-expiracao-de-reservas.md)
- [ADR 0002 — Check-in por vínculo e agregação de ocupação](../adr/0002-check-in-e-ocupacao.md)

O contrato usa a API local em `http://localhost:3333`. Para rotas autenticadas, use o JWT de `POST /login` no cabeçalho `Authorization: Bearer <token>`. Os erros da API descritos no contrato trazem `code`, `message` e `details`.

## Validar o contrato

Execute no Git Bash:

```bash
cd /c/-projetos/EventBook &&
npx --yes @redocly/cli@2.77.0 lint --extends minimal docs/api/openapi.yaml
```

O linter verifica a estrutura e as referências do OpenAPI. O cenário de ponta a ponta exercita a compra e o check-in com a API e um MySQL de teste. [Documentação do E2E](../../e2e/README.md)
