-- CreateEnum
CREATE TYPE "PapelUsuario" AS ENUM ('ADMINISTRADOR', 'OPERADOR_CADASTRO', 'GESTOR_ALMOXARIFADO', 'AUDITOR');

-- CreateEnum
CREATE TYPE "StatusLote" AS ENUM ('RECEBIDO', 'EM_TRIAGEM', 'TRIAGEM_CONCLUIDA', 'ENCAMINHADO', 'FINALIZADO');

-- CreateEnum
CREATE TYPE "TipoEquipamento" AS ENUM ('COMPUTADOR_MESA', 'NOTEBOOK', 'MONITOR', 'IMPRESSORA', 'SERVIDOR', 'ROTEADOR', 'CABO_ESTRUTURADO', 'FONTE_ALIMENTACAO');

-- CreateEnum
CREATE TYPE "EstadoFisico" AS ENUM ('NOVO', 'BOM_ESTADO', 'USADO_LEVE', 'USADO_MODERADO', 'DANIFICADO_LEVE', 'DANIFICADO_GRAVE', 'INSERVIVEL');

-- CreateEnum
CREATE TYPE "StatusRastreamento" AS ENUM ('AGUARDANDO_TRIAGEM', 'EM_TRIAGEM', 'AGUARDANDO_DESMONTE', 'EM_DESMONTE', 'PECAS_REAPROVEITADAS', 'MATERIAL_RECICLAVEL', 'DESCARTE_SEGURO', 'BAIXA_DEFINITIVA');

-- CreateEnum
CREATE TYPE "TipoAnalise" AS ENUM ('EFICIENCIA_OPERACIONAL', 'RENTABILIDADE_EQUIPAMENTO', 'VIDA_UTIL_PREDITIVA');

-- CreateEnum
CREATE TYPE "StatusTarefa" AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'FALHOU');

-- CreateEnum
CREATE TYPE "FormatoExportacao" AS ENUM ('JSON', 'CSV');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "hashSenha" TEXT NOT NULL,
    "papel" "PapelUsuario" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoAcesso" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizacoes" (
    "id" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "inscricaoEstadual" TEXT NOT NULL,
    "enderecoCompleto" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "dataCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "organizacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contratos" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "dataAssinatura" TIMESTAMP(3) NOT NULL,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "clausulas" JSONB NOT NULL,
    "valorMensal" DOUBLE PRECISION NOT NULL,
    "renovacaoAutomatica" BOOLEAN NOT NULL DEFAULT false,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "contratos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotes" (
    "id" TEXT NOT NULL,
    "dataEntrada" TIMESTAMP(3) NOT NULL,
    "dataInicioTriagem" TIMESTAMP(3),
    "dataFimTriagem" TIMESTAMP(3),
    "operadorTriagem" TEXT,
    "organizacaoId" TEXT NOT NULL,
    "notaFiscal" TEXT NOT NULL,
    "transportadora" TEXT NOT NULL,
    "statusProcessamento" "StatusLote" NOT NULL DEFAULT 'RECEBIDO',
    "observacoes" TEXT,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "lotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipamentos" (
    "id" TEXT NOT NULL,
    "codigoBarrasInterno" TEXT NOT NULL,
    "tipo" "TipoEquipamento" NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "anoFabricacao" INTEGER NOT NULL,
    "estadoFisico" "EstadoFisico" NOT NULL,
    "pesoQuilogramas" DOUBLE PRECISION NOT NULL,
    "valorEstimadoRecuperacao" DOUBLE PRECISION NOT NULL,
    "loteId" TEXT NOT NULL,
    "posicaoNoLote" INTEGER NOT NULL,
    "statusRastreamento" "StatusRastreamento" NOT NULL DEFAULT 'AGUARDANDO_TRIAGEM',
    "versao" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentacoes" (
    "id" TEXT NOT NULL,
    "equipamentoId" TEXT NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origem" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "responsavel" TEXT NOT NULL,
    "observacao" TEXT,
    "estadoAnterior" "EstadoFisico",
    "estadoNovo" "EstadoFisico",

    CONSTRAINT "movimentacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "nomeParceiro" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "prefixo" TEXT NOT NULL,
    "chaveHash" TEXT NOT NULL,
    "permissoes" TEXT[],
    "limitePorMinuto" INTEGER NOT NULL DEFAULT 60,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "expiraEm" TIMESTAMP(3),
    "ultimoUso" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resultados_analiticos" (
    "id" TEXT NOT NULL,
    "tipo" "TipoAnalise" NOT NULL,
    "referenciaPeriodo" TEXT NOT NULL,
    "parametros" JSONB NOT NULL,
    "resumoMetricas" JSONB NOT NULL,
    "detalhes" JSONB NOT NULL,
    "origemExecucao" TEXT NOT NULL,
    "geradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resultados_analiticos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "previsoes_vida_util" (
    "id" TEXT NOT NULL,
    "resultadoAnaliticoId" TEXT NOT NULL,
    "tipoEquipamento" "TipoEquipamento" NOT NULL,
    "coeficienteAngular" DOUBLE PRECISION NOT NULL,
    "intercepto" DOUBLE PRECISION NOT NULL,
    "rQuadrado" DOUBLE PRECISION NOT NULL,
    "idadeMediaAtualAnos" DOUBLE PRECISION NOT NULL,
    "vidaUtilRemanescenteAnos" DOUBLE PRECISION NOT NULL,
    "anoPrevistoInservivel" INTEGER NOT NULL,
    "amostraTamanho" INTEGER NOT NULL,
    "calculadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "previsoes_vida_util_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefas_relatorio" (
    "id" TEXT NOT NULL,
    "bullJobId" TEXT,
    "apiKeyId" TEXT,
    "organizacaoId" TEXT,
    "tipoAnalise" "TipoAnalise" NOT NULL,
    "formato" "FormatoExportacao" NOT NULL,
    "status" "StatusTarefa" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erroMensagem" TEXT,
    "caminhoArquivo" TEXT,
    "webhookUrl" TEXT,
    "resultadoAnaliticoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "concluidoEm" TIMESTAMP(3),

    CONSTRAINT "tarefas_relatorio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_usuario_key" ON "usuarios"("usuario");

-- CreateIndex
CREATE UNIQUE INDEX "organizacoes_cnpj_key" ON "organizacoes"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_organizacaoId_key" ON "contratos"("organizacaoId");

-- CreateIndex
CREATE INDEX "lotes_organizacaoId_idx" ON "lotes"("organizacaoId");

-- CreateIndex
CREATE INDEX "lotes_dataEntrada_idx" ON "lotes"("dataEntrada");

-- CreateIndex
CREATE UNIQUE INDEX "equipamentos_codigoBarrasInterno_key" ON "equipamentos"("codigoBarrasInterno");

-- CreateIndex
CREATE INDEX "equipamentos_loteId_idx" ON "equipamentos"("loteId");

-- CreateIndex
CREATE INDEX "equipamentos_tipo_idx" ON "equipamentos"("tipo");

-- CreateIndex
CREATE INDEX "movimentacoes_equipamentoId_idx" ON "movimentacoes"("equipamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_chaveHash_key" ON "api_keys"("chaveHash");

-- CreateIndex
CREATE INDEX "api_keys_organizacaoId_idx" ON "api_keys"("organizacaoId");

-- CreateIndex
CREATE INDEX "resultados_analiticos_tipo_geradoEm_idx" ON "resultados_analiticos"("tipo", "geradoEm");

-- CreateIndex
CREATE INDEX "previsoes_vida_util_resultadoAnaliticoId_idx" ON "previsoes_vida_util"("resultadoAnaliticoId");

-- CreateIndex
CREATE INDEX "previsoes_vida_util_tipoEquipamento_idx" ON "previsoes_vida_util"("tipoEquipamento");

-- CreateIndex
CREATE INDEX "tarefas_relatorio_status_idx" ON "tarefas_relatorio"("status");

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipamentos" ADD CONSTRAINT "equipamentos_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "equipamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "previsoes_vida_util" ADD CONSTRAINT "previsoes_vida_util_resultadoAnaliticoId_fkey" FOREIGN KEY ("resultadoAnaliticoId") REFERENCES "resultados_analiticos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
