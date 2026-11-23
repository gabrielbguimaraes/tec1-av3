# greencode - AV3

- Aluno: João Gabriel Barros Guimarães
- Turma: 2º DSM

## Como rodar

1. Subir PostgreSQL 15 e Redis 7:

```bash
docker compose up -d
```

2. Instalar dependências:

```bash
npm install
```

3. Gerar cliente Prisma, aplicar migrações e popular o banco (seed):

```bash
npm run setup
```

4. Iniciar a API (com worker BullMQ e cron integrados):

```bash
npm start
```

Comandos auxiliares:

```bash
npm run dev
npm run worker
npm run build
npm test
```

Documentação OpenAPI (Swagger):
- `http://localhost:3000/docs`
- `http://localhost:3000/docs/json`

Credenciais internas de teste (seed):
- `admin` / `admin123` (`ADMINISTRADOR`)
- `operador` / `operador123` (`OPERADOR_CADASTRO`)
- `gestor` / `gestor123` (`GESTOR_ALMOXARIFADO`)
- `auditor` / `auditor123` (`AUDITOR`)

API Keys de parceiro de teste (header `X-API-Key`):
- `gc_live_parceiro_full_2026` (`READ_TRACKING`, `WRITE_LOTES`, `READ_ANALYTICS` - 60 req/min)
- `gc_live_parceiro_readonly_2026` (`READ_TRACKING` - 5 req/min)

## Estrutura

- `prisma/` - Schema relacional, migrações SQL e seed idempotente
- `src/config/` - Variáveis de ambiente e fallbacks padrão
- `src/domain/` - Erros de domínio, regras de negócio e validadores polimórficos
- `src/services/` - Serviços transacionais, autenticação JWT e gestão de API Keys
- `src/analytics/` - Analisadores estatísticos, regressão linear OLS, agendador cron e exportadores JSON/CSV
- `src/queue/` - Fila e worker BullMQ integrados ao Redis
- `src/http/` - Servidor Fastify, plugins de segurança/rate limit, Swagger e rotas segregadas (`/api/v1/internal` e `/api/v1/public`)
- `src/infra/` - Instância compartilhada do Prisma Client
- `tests/` - Suíte de testes unitários e de integração com Vitest
- `RELATORIO_TECNICO.md` - Justificativas arquiteturais e plano de escalabilidade
