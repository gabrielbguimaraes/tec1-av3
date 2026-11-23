# Relatório Técnico de Arquitetura — greencode AV3

## 1. Escolha da Biblioteca Estatística (`simple-statistics`)

Para a camada analítica do **greencode**, optou-se pela biblioteca `simple-statistics` em detrimento de alternativas como `mathjs` ou implementação totalmente manual dos cálculos estatísticos.

### Comparativo e Trade-offs
- **Simplicidade e Foco no Domínio:** O `simple-statistics` expõe diretamente primitivas descritivas (`mean`, `median`, `standardDeviation`, `min`, `max`) e de modelagem linear (`linearRegression`, `linearRegressionLine`, `rSquared`), exatamente aderentes às três análises exigidas (eficiência operacional, rentabilidade e vida útil preditiva). Já o `mathjs` possui escopo amplo voltado à álgebra simbólica, matrizes complexas e análise numérica geral, agregando peso de bundle desnecessário para o problema atual.
- **Portabilidade Multiplataforma:** O `simple-statistics` é escrito em JavaScript/TypeScript puro, sem bindings nativos em C/C++ (`node-gyp`), eliminando falhas de compilação entre ambientes Windows 10+ e Linux Ubuntu 24.04+.
- **Confiabilidade Matemática:** A implementação manual de regressão linear ordinária (OLS) e coeficiente de determinação ($R^2$) é suscetível a erros sutis de arredondamento e tratamento de amostras degeneradas (variância nula em $X$). Utilizar `simple-statistics` com camada defensiva no `AnalisadorVidaUtilPreditivo` garante precisão numérica e legibilidade.
- **Limitação Conhecida:** Caso o projeto evolua para regressão múltipla, séries temporais ARIMA ou inferência bayesiana, o encapsulamento atrás da classe abstrata `AnalisadorBase` permite substituir o motor estatístico pontualmente sem alterar contratos HTTP ou persistência.

---

## 2. Modelagem das Tabelas de Resultados Analíticos e Jobs

A persistência analítica foi modelada de forma híbrida no PostgreSQL, combinando colunas relacionais fortemente tipadas com campos `Json`:

### `ResultadoAnalitico`
- Armazena metadados indexados (`tipo`, `referenciaPeriodo`, `origemExecucao`, `geradoEm`) em colunas relacionais para consultas rápidas e filtragem temporal no histórico (`/api/v1/internal/analytics/historico`).
- Os blocos `parametros`, `resumoMetricas` e `detalhes` utilizam `Json` (`jsonb` no PostgreSQL), permitindo que os três tipos de análise (`EFICIENCIA_OPERACIONAL`, `RENTABILIDADE_EQUIPAMENTO`, `VIDA_UTIL_PREDITIVA`) compartilhem um histórico unificado sem proliferação de tabelas esparsas ou migrações a cada nova métrica agregada.

### `PrevisaoVidaUtil`
- Como a análise preditiva de vida útil exige comparação contínua entre previsões passadas e degradação real observada ao longo do tempo, seus coeficientes (`coeficienteAngular`, `intercepto`, `rQuadrado`, `idadeMediaAtualAnos`, `vidaUtilRemanescenteAnos`, `anoPrevistoInservivel`, `amostraTamanho`) foram normalizados em tabela própria vinculada por chave estrangeira a `ResultadoAnalitico`.
- Isso habilita consultas SQL analíticas diretas por `tipoEquipamento` e série temporal de `calculadoEm` dentro da mesma transação ACID (`prisma.$transaction`) que registra o snapshot geral.

### `TarefaRelatorio`
- Desacopla o ciclo de vida de negócio do estado efêmero da fila no Redis. Mesmo após expiração ou limpeza dos jobs no Redis (`removeOnComplete` / `removeOnFail`), o PostgreSQL preserva `status`, `tentativas`, `erroMensagem`, `caminhoArquivo`, `resultadoAnaliticoId` e timestamps de criação/conclusão para auditoria, polling e download confiável.

---

## 3. Política de Retry e Tolerância a Falhas no BullMQ

Relatórios analíticos sob demanda envolvem agregações em banco de dados, cálculos estatísticos e escrita em disco, operações sujeitas a falhas transitórias (oscilação de conexão com PostgreSQL, contenção de I/O ou indisponibilidade momentânea de webhook externo).

### Estratégia Adotada
- **Tentativas e Backoff Exponencial:** A fila `relatorios-analiticos` configura `attempts: 3` com `backoff: { type: "exponential", delay: 2000 }`. Assim, falhas transitórias são reprocessadas aproximadamente após 2s e 4s, evitando sobrecarga imediata (thundering herd) sobre o banco de dados.
- **Idempotência de Execução:** Cada job recebe `jobId: tarefaId`. Caso seja reexecutado após falha na geração do arquivo, o worker sobrescreve o mesmo caminho determinístico (`storage/relatorios/<tarefaId>.<ext>`) e atualiza o registro existente em `TarefaRelatorio`, sem duplicar arquivos órfãos.
- **Isolamento de Webhook:** A notificação opcional via `webhookUrl` ocorre após a persistência do arquivo e atualização para `CONCLUIDO`, encapsulada em bloco isolado com timeout de 5 segundos. Falhas em servidores de terceiros não invalidam o relatório já gerado nem provocam reprocessamento desnecessário da análise pesada.
- **Rastreabilidade de Erros e Limpeza:** O evento `failed` do `WorkerRelatorios` registra `tentativas` e `erroMensagem`, marcando o status final como `FALHOU` somente após esgotadas as 3 tentativas. As políticas `removeOnComplete: 100` e `removeOnFail: 200` mantêm o consumo de memória do Redis controlado.

---

## 4. Plano de Evolução e Escalabilidade (Centenas a Milhares de Parceiros)

Para escalar o **greencode** de um monólito modular para centenas ou milhares de parceiros integrados via API pública, propõe-se a seguinte evolução incremental:

1. **Separação Física de Processos (API vs. Workers):**
   - O projeto já dispõe do entrypoint isolado `npm run worker` (`src/queue/runWorker.ts`). Em produção, os nós HTTP devem rodar sem workers embutidos, enquanto pools dedicados de workers escalam horizontalmente de acordo com a profundidade da fila no Redis.
2. **Desacoplamento de Leituras Analíticas no PostgreSQL:**
   - Direcionar consultas analíticas pesadas para **Read Replicas** do PostgreSQL, isolando a carga de leitura agregada das transações OLTP de recebimento de lotes e movimentações.
   - Introduzir **Materialized Views** ou tabelas de agregação pré-calculadas (atualizadas incrementalmente ou via cron) para reduzir varreduras completas em milhões de equipamentos.
3. **Cache Distribuído e Rate Limit em Cluster:**
   - Configurar `@fastify/rate-limit` com backend Redis compartilhado (`redis` store) para garantir que limites por `X-API-Key` sejam consistentes entre múltiplas réplicas da API atrás de um Load Balancer ou API Gateway (Kong, Envoy ou AWS API Gateway).
   - Cachear no Redis as respostas analíticas globais e por organização com TTL curto (ex.: 5 a 15 minutos), reduzindo pressão repetitiva sobre o banco.
4. **Armazenamento de Objetos e Entrega Assíncrona:**
   - Substituir a gravação local em `storage/relatorios/` por Object Storage compatível com S3 (MinIO/AWS S3), retornando URLs pré-assinadas no endpoint de download e eliminando dependência de disco compartilhado entre réplicas.
5. **Dead-Letter Queue (DLQ) e Webhooks Assíncronos Dedicados:**
   - Mover entregas de webhook para uma fila separada com política própria de retry e encaminhar jobs permanentemente falhos para uma DLQ monitorada por alertas e métricas (OpenTelemetry / Prometheus).
