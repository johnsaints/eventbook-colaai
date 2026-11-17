# Proteções HTTP da API EventBook

## Cabeçalhos

O Helmet adiciona cabeçalhos de segurança como `Content-Security-Policy`, `X-Content-Type-Options` e `X-Frame-Options`, e remove `X-Powered-By`. [Documentação do Helmet](https://helmet.js.org/)

## CORS

A API libera a leitura de respostas no navegador para as origens listadas em `CORS_ORIGINS`. Uma origem inclui protocolo, hostname e porta, quando necessária. Separe origens por vírgula, sem caminhos ou barras finais. A API continua validando autenticação e permissões nas rotas protegidas. [Documentação do CORS no Express](https://expressjs.com/en/resources/middleware/cors/)

Em desenvolvimento e teste, a configuração padrão aceita `http://localhost:5173` e `http://127.0.0.1:5173`. Ao mudar a porta do Vite, informe a lista atualizada no arquivo `backend/.env` e reinicie a API. Em produção, defina explicitamente as origens do frontend.

```dotenv
CORS_ORIGINS="https://app.eventbook.example,https://painel.eventbook.example"
```

## Limite de tentativas

`POST /login` e `POST /register` compartilham um limite de **10 requisições a cada 15 minutos por IP**. As rotas de Link Mágico (`POST /auth/magic-link` e `POST /auth/magic-link/verify`) também possuem seu próprio limite de **10 requisições a cada 15 minutos por IP**. Requisições bem-sucedidas e recusadas consomem a cota. A partir da 11ª, a API responde com HTTP `429`, o código `RATE_LIMIT_EXCEEDED` e o cabeçalho `Retry-After` em segundos.

O contador fica em memória por processo. Em uma implantação com múltiplas instâncias, é necessário um armazenamento compartilhado para aplicar uma cota única. Atrás de um proxy reverso, configure a confiança de acordo com a topologia para identificar o IP do cliente. [Configuração do express-rate-limit](https://express-rate-limit.mintlify.app/reference/configuration)
