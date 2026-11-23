import "../src/config/env.js";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  EstadoFisico,
  PapelUsuario,
  PrismaClient,
  StatusLote,
  StatusRastreamento,
  TipoEquipamento
} from "@prisma/client";

const prisma = new PrismaClient();

function gerarHashSha256(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

function adicionarHoras(base: Date, horas: number): Date {
  return new Date(base.getTime() + horas * 3600 * 1000);
}

async function main(): Promise<void> {
  const usuarios = [
    { usuario: "admin", senhaPlana: "admin123", papel: PapelUsuario.ADMINISTRADOR },
    { usuario: "operador", senhaPlana: "operador123", papel: PapelUsuario.OPERADOR_CADASTRO },
    { usuario: "gestor", senhaPlana: "gestor123", papel: PapelUsuario.GESTOR_ALMOXARIFADO },
    { usuario: "auditor", senhaPlana: "auditor123", papel: PapelUsuario.AUDITOR }
  ];

  for (const item of usuarios) {
    const hashSenha = await bcrypt.hash(item.senhaPlana, 10);
    await prisma.usuario.upsert({
      where: { usuario: item.usuario },
      update: { hashSenha, papel: item.papel, ativo: true },
      create: { usuario: item.usuario, hashSenha, papel: item.papel, ativo: true }
    });
  }

  const org1 = await prisma.organizacao.upsert({
    where: { cnpj: "11222333000181" },
    update: {},
    create: {
      id: "org-techcorp-001",
      razaoSocial: "TechCorp Telecomunicações S.A.",
      cnpj: "11222333000181",
      inscricaoEstadual: "110042490114",
      enderecoCompleto: "Av. Paulista, 1500 - Bela Vista, São Paulo - SP",
      telefone: "(11) 3000-1000",
      email: "sustentabilidade@techcorp.com.br",
      ativo: true
    }
  });

  const org2 = await prisma.organizacao.upsert({
    where: { cnpj: "11444777000161" },
    update: {},
    create: {
      id: "org-ecobank-002",
      razaoSocial: "EcoBank Serviços Financeiros Ltda.",
      cnpj: "11444777000161",
      inscricaoEstadual: "245889120118",
      enderecoCompleto: "Rua da Consolação, 2200 - Consolação, São Paulo - SP",
      telefone: "(11) 4004-2200",
      email: "ativos@ecobank.com.br",
      ativo: true
    }
  });

  await prisma.contrato.upsert({
    where: { organizacaoId: org1.id },
    update: {},
    create: {
      organizacaoId: org1.id,
      dataAssinatura: new Date("2026-01-10T10:00:00Z"),
      dataVencimento: new Date("2027-01-10T10:00:00Z"),
      clausulas: [
        "Coleta mensal programada de ativos obsoletos",
        "Emissão de certificado de destinação ambientalmente adequada",
        "Relatórios analíticos trimestrais via API"
      ],
      valorMensal: 8500,
      renovacaoAutomatica: true
    }
  });

  await prisma.contrato.upsert({
    where: { organizacaoId: org2.id },
    update: {},
    create: {
      organizacaoId: org2.id,
      dataAssinatura: new Date("2026-02-01T10:00:00Z"),
      dataVencimento: new Date("2027-02-01T10:00:00Z"),
      clausulas: [
        "Descaracterização segura de mídias de armazenamento",
        "Rastreabilidade completa por código de barras interno"
      ],
      valorMensal: 6200,
      renovacaoAutomatica: false
    }
  });

  const chaveFull = "gc_live_parceiro_full_2026";
  const chaveReadonly = "gc_live_parceiro_readonly_2026";

  await prisma.apiKey.upsert({
    where: { chaveHash: gerarHashSha256(chaveFull) },
    update: {
      permissoes: ["READ_TRACKING", "WRITE_LOTES", "READ_ANALYTICS"],
      limitePorMinuto: 60,
      ativa: true
    },
    create: {
      nomeParceiro: "Parceiro Integrador Full",
      organizacaoId: org1.id,
      prefixo: chaveFull.slice(0, 16),
      chaveHash: gerarHashSha256(chaveFull),
      permissoes: ["READ_TRACKING", "WRITE_LOTES", "READ_ANALYTICS"],
      limitePorMinuto: 60,
      ativa: true
    }
  });

  await prisma.apiKey.upsert({
    where: { chaveHash: gerarHashSha256(chaveReadonly) },
    update: {
      permissoes: ["READ_TRACKING"],
      limitePorMinuto: 5,
      ativa: true
    },
    create: {
      nomeParceiro: "Parceiro Auditoria Somente Leitura",
      organizacaoId: org2.id,
      prefixo: chaveReadonly.slice(0, 16),
      chaveHash: gerarHashSha256(chaveReadonly),
      permissoes: ["READ_TRACKING"],
      limitePorMinuto: 5,
      ativa: true
    }
  });

  const definicaoLotes = [
    { id: "lote-seed-01", orgId: org1.id, nf: "NF-2026-0101", transp: "TransVerde Logística", operador: "gestor1", entrada: "2026-06-05T08:00:00Z", inicio: 2, fim: 10 },
    { id: "lote-seed-02", orgId: org2.id, nf: "NF-2026-0102", transp: "EcoFrete Express", operador: "gestor2", entrada: "2026-06-18T09:00:00Z", inicio: 1, fim: 14 },
    { id: "lote-seed-03", orgId: org1.id, nf: "NF-2026-0103", transp: "TransVerde Logística", operador: "gestor1", entrada: "2026-07-04T08:00:00Z", inicio: 2, fim: 12 },
    { id: "lote-seed-04", orgId: org2.id, nf: "NF-2026-0104", transp: "CicloCarga Ltda", operador: "gestor3", entrada: "2026-07-19T10:00:00Z", inicio: 6, fim: 84 },
    { id: "lote-seed-05", orgId: org1.id, nf: "NF-2026-0105", transp: "TransVerde Logística", operador: "gestor2", entrada: "2026-08-03T08:00:00Z", inicio: 1, fim: 15 },
    { id: "lote-seed-06", orgId: org2.id, nf: "NF-2026-0106", transp: "EcoFrete Express", operador: "gestor1", entrada: "2026-08-21T11:00:00Z", inicio: 2, fim: 11 },
    { id: "lote-seed-07", orgId: org1.id, nf: "NF-2026-0107", transp: "CicloCarga Ltda", operador: "gestor3", entrada: "2026-09-07T08:00:00Z", inicio: 8, fim: 96 },
    { id: "lote-seed-08", orgId: org2.id, nf: "NF-2026-0108", transp: "EcoFrete Express", operador: "gestor2", entrada: "2026-09-22T09:00:00Z", inicio: 2, fim: 16 },
    { id: "lote-seed-09", orgId: org1.id, nf: "NF-2026-0109", transp: "TransVerde Logística", operador: "gestor1", entrada: "2026-10-05T08:00:00Z", inicio: 1, fim: 9 },
    { id: "lote-seed-10", orgId: org2.id, nf: "NF-2026-0110", transp: "CicloCarga Ltda", operador: "gestor3", entrada: "2026-10-18T08:00:00Z", inicio: 5, fim: 78 },
    { id: "lote-seed-11", orgId: org1.id, nf: "NF-2026-0111", transp: "TransVerde Logística", operador: "gestor2", entrada: "2026-11-02T09:00:00Z", inicio: 2, fim: 13 },
    { id: "lote-seed-12", orgId: org2.id, nf: "NF-2026-0112", transp: "EcoFrete Express", operador: "gestor1", entrada: "2026-11-12T08:00:00Z", inicio: 1, fim: 10 }
  ];

  for (const item of definicaoLotes) {
    const dataEntrada = new Date(item.entrada);
    await prisma.lote.upsert({
      where: { id: item.id },
      update: {},
      create: {
        id: item.id,
        organizacaoId: item.orgId,
        notaFiscal: item.nf,
        transportadora: item.transp,
        operadorTriagem: item.operador,
        dataEntrada,
        dataInicioTriagem: adicionarHoras(dataEntrada, item.inicio),
        dataFimTriagem: adicionarHoras(dataEntrada, item.fim),
        statusProcessamento: StatusLote.TRIAGEM_CONCLUIDA,
        observacoes: "Lote processado na unidade central greencode"
      }
    });
  }

  const equipamentosSeed: Array<{
    codigo: string;
    tipo: TipoEquipamento;
    marca: string;
    modelo: string;
    ano: number;
    estado: EstadoFisico;
    peso: number;
    valor: number;
    loteId: string;
    pos: number;
    status: StatusRastreamento;
  }> = [
    { codigo: "GC-NB-2025-001", tipo: TipoEquipamento.NOTEBOOK, marca: "Dell", modelo: "Latitude 5440", ano: 2025, estado: EstadoFisico.NOVO, peso: 1.45, valor: 3200, loteId: "lote-seed-01", pos: 1, status: StatusRastreamento.PECAS_REAPROVEITADAS },
    { codigo: "GC-NB-2024-002", tipo: TipoEquipamento.NOTEBOOK, marca: "Lenovo", modelo: "ThinkPad T14", ano: 2024, estado: EstadoFisico.BOM_ESTADO, peso: 1.5, valor: 2600, loteId: "lote-seed-01", pos: 2, status: StatusRastreamento.PECAS_REAPROVEITADAS },
    { codigo: "GC-NB-2023-003", tipo: TipoEquipamento.NOTEBOOK, marca: "Dell", modelo: "Latitude 5430", ano: 2023, estado: EstadoFisico.USADO_LEVE, peso: 1.5, valor: 1950, loteId: "lote-seed-02", pos: 1, status: StatusRastreamento.EM_TRIAGEM },
    { codigo: "GC-NB-2022-004", tipo: TipoEquipamento.NOTEBOOK, marca: "HP", modelo: "EliteBook 840", ano: 2022, estado: EstadoFisico.USADO_MODERADO, peso: 1.6, valor: 1350, loteId: "lote-seed-03", pos: 1, status: StatusRastreamento.AGUARDANDO_DESMONTE },
    { codigo: "GC-NB-2020-005", tipo: TipoEquipamento.NOTEBOOK, marca: "Lenovo", modelo: "ThinkPad T490", ano: 2020, estado: EstadoFisico.DANIFICADO_LEVE, peso: 1.55, valor: 720, loteId: "lote-seed-04", pos: 1, status: StatusRastreamento.EM_DESMONTE },
    { codigo: "GC-NB-2019-006", tipo: TipoEquipamento.NOTEBOOK, marca: "Dell", modelo: "Latitude 5400", ano: 2019, estado: EstadoFisico.DANIFICADO_GRAVE, peso: 1.65, valor: 340, loteId: "lote-seed-05", pos: 1, status: StatusRastreamento.MATERIAL_RECICLAVEL },
    { codigo: "GC-NB-2017-007", tipo: TipoEquipamento.NOTEBOOK, marca: "HP", modelo: "ProBook 440", ano: 2017, estado: EstadoFisico.INSERVIVEL, peso: 1.8, valor: 110, loteId: "lote-seed-06", pos: 1, status: StatusRastreamento.DESCARTE_SEGURO },
    { codigo: "GC-NB-2021-008", tipo: TipoEquipamento.NOTEBOOK, marca: "Dell", modelo: "Latitude 5420", ano: 2021, estado: EstadoFisico.USADO_MODERADO, peso: 1.5, valor: 1100, loteId: "lote-seed-07", pos: 1, status: StatusRastreamento.AGUARDANDO_DESMONTE },

    { codigo: "GC-PC-2025-009", tipo: TipoEquipamento.COMPUTADOR_MESA, marca: "Dell", modelo: "OptiPlex 7010", ano: 2025, estado: EstadoFisico.NOVO, peso: 5.2, valor: 2800, loteId: "lote-seed-01", pos: 3, status: StatusRastreamento.PECAS_REAPROVEITADAS },
    { codigo: "GC-PC-2024-010", tipo: TipoEquipamento.COMPUTADOR_MESA, marca: "Lenovo", modelo: "ThinkCentre M70q", ano: 2024, estado: EstadoFisico.BOM_ESTADO, peso: 4.8, valor: 2150, loteId: "lote-seed-02", pos: 2, status: StatusRastreamento.PECAS_REAPROVEITADAS },
    { codigo: "GC-PC-2022-011", tipo: TipoEquipamento.COMPUTADOR_MESA, marca: "HP", modelo: "ProDesk 400", ano: 2022, estado: EstadoFisico.USADO_LEVE, peso: 5.4, valor: 1400, loteId: "lote-seed-03", pos: 2, status: StatusRastreamento.AGUARDANDO_DESMONTE },
    { codigo: "GC-PC-2021-012", tipo: TipoEquipamento.COMPUTADOR_MESA, marca: "Dell", modelo: "OptiPlex 5090", ano: 2021, estado: EstadoFisico.USADO_MODERADO, peso: 5.5, valor: 980, loteId: "lote-seed-04", pos: 2, status: StatusRastreamento.EM_DESMONTE },
    { codigo: "GC-PC-2019-013", tipo: TipoEquipamento.COMPUTADOR_MESA, marca: "Lenovo", modelo: "ThinkCentre M720", ano: 2019, estado: EstadoFisico.DANIFICADO_LEVE, peso: 5.8, valor: 510, loteId: "lote-seed-05", pos: 2, status: StatusRastreamento.MATERIAL_RECICLAVEL },
    { codigo: "GC-PC-2018-014", tipo: TipoEquipamento.COMPUTADOR_MESA, marca: "HP", modelo: "EliteDesk 800", ano: 2018, estado: EstadoFisico.DANIFICADO_GRAVE, peso: 6.1, valor: 260, loteId: "lote-seed-06", pos: 2, status: StatusRastreamento.MATERIAL_RECICLAVEL },
    { codigo: "GC-PC-2017-015", tipo: TipoEquipamento.COMPUTADOR_MESA, marca: "Dell", modelo: "OptiPlex 3050", ano: 2017, estado: EstadoFisico.INSERVIVEL, peso: 6.3, valor: 120, loteId: "lote-seed-07", pos: 2, status: StatusRastreamento.DESCARTE_SEGURO },

    { codigo: "GC-SV-2025-016", tipo: TipoEquipamento.SERVIDOR, marca: "Dell", modelo: "PowerEdge R750", ano: 2025, estado: EstadoFisico.NOVO, peso: 18.5, valor: 14500, loteId: "lote-seed-08", pos: 1, status: StatusRastreamento.PECAS_REAPROVEITADAS },
    { codigo: "GC-SV-2024-017", tipo: TipoEquipamento.SERVIDOR, marca: "HPE", modelo: "ProLiant DL380", ano: 2024, estado: EstadoFisico.BOM_ESTADO, peso: 19.0, valor: 11200, loteId: "lote-seed-08", pos: 2, status: StatusRastreamento.PECAS_REAPROVEITADAS },
    { codigo: "GC-SV-2022-018", tipo: TipoEquipamento.SERVIDOR, marca: "Dell", modelo: "PowerEdge R740", ano: 2022, estado: EstadoFisico.USADO_LEVE, peso: 18.2, valor: 7600, loteId: "lote-seed-09", pos: 1, status: StatusRastreamento.AGUARDANDO_DESMONTE },
    { codigo: "GC-SV-2021-019", tipo: TipoEquipamento.SERVIDOR, marca: "Lenovo", modelo: "ThinkSystem SR650", ano: 2021, estado: EstadoFisico.USADO_MODERADO, peso: 19.5, valor: 5400, loteId: "lote-seed-09", pos: 2, status: StatusRastreamento.EM_DESMONTE },
    { codigo: "GC-SV-2019-020", tipo: TipoEquipamento.SERVIDOR, marca: "HPE", modelo: "ProLiant DL360", ano: 2019, estado: EstadoFisico.DANIFICADO_LEVE, peso: 16.0, valor: 2300, loteId: "lote-seed-10", pos: 1, status: StatusRastreamento.MATERIAL_RECICLAVEL },
    { codigo: "GC-SV-2018-021", tipo: TipoEquipamento.SERVIDOR, marca: "Dell", modelo: "PowerEdge R630", ano: 2018, estado: EstadoFisico.DANIFICADO_GRAVE, peso: 17.5, valor: 1100, loteId: "lote-seed-11", pos: 1, status: StatusRastreamento.MATERIAL_RECICLAVEL },
    { codigo: "GC-SV-2017-022", tipo: TipoEquipamento.SERVIDOR, marca: "Cisco", modelo: "UCS C220 M4", ano: 2017, estado: EstadoFisico.INSERVIVEL, peso: 17.0, valor: 450, loteId: "lote-seed-12", pos: 1, status: StatusRastreamento.DESCARTE_SEGURO },

    { codigo: "GC-MN-2025-023", tipo: TipoEquipamento.MONITOR, marca: "LG", modelo: "UltraFine 27", ano: 2025, estado: EstadoFisico.NOVO, peso: 4.1, valor: 1250, loteId: "lote-seed-03", pos: 3, status: StatusRastreamento.PECAS_REAPROVEITADAS },
    { codigo: "GC-MN-2023-024", tipo: TipoEquipamento.MONITOR, marca: "Dell", modelo: "P2422H", ano: 2023, estado: EstadoFisico.BOM_ESTADO, peso: 3.9, valor: 820, loteId: "lote-seed-04", pos: 3, status: StatusRastreamento.PECAS_REAPROVEITADAS },
    { codigo: "GC-MN-2022-025", tipo: TipoEquipamento.MONITOR, marca: "Samsung", modelo: "S24R350", ano: 2022, estado: EstadoFisico.USADO_LEVE, peso: 3.7, valor: 540, loteId: "lote-seed-05", pos: 3, status: StatusRastreamento.EM_TRIAGEM },
    { codigo: "GC-MN-2020-026", tipo: TipoEquipamento.MONITOR, marca: "Dell", modelo: "E2220H", ano: 2020, estado: EstadoFisico.USADO_MODERADO, peso: 3.8, valor: 350, loteId: "lote-seed-06", pos: 3, status: StatusRastreamento.AGUARDANDO_DESMONTE },
    { codigo: "GC-MN-2019-027", tipo: TipoEquipamento.MONITOR, marca: "LG", modelo: "24MK430H", ano: 2019, estado: EstadoFisico.DANIFICADO_LEVE, peso: 3.6, valor: 180, loteId: "lote-seed-07", pos: 3, status: StatusRastreamento.MATERIAL_RECICLAVEL },
    { codigo: "GC-MN-2018-028", tipo: TipoEquipamento.MONITOR, marca: "Samsung", modelo: "LS22F350", ano: 2018, estado: EstadoFisico.DANIFICADO_GRAVE, peso: 3.5, valor: 90, loteId: "lote-seed-08", pos: 3, status: StatusRastreamento.DESCARTE_SEGURO },
    { codigo: "GC-MN-2017-029", tipo: TipoEquipamento.MONITOR, marca: "AOC", modelo: "E2270S", ano: 2017, estado: EstadoFisico.INSERVIVEL, peso: 3.4, valor: 45, loteId: "lote-seed-09", pos: 3, status: StatusRastreamento.DESCARTE_SEGURO },

    { codigo: "GC-IM-2024-030", tipo: TipoEquipamento.IMPRESSORA, marca: "HP", modelo: "LaserJet Pro M404", ano: 2024, estado: EstadoFisico.BOM_ESTADO, peso: 8.6, valor: 1100, loteId: "lote-seed-10", pos: 2, status: StatusRastreamento.PECAS_REAPROVEITADAS },
    { codigo: "GC-IM-2023-031", tipo: TipoEquipamento.IMPRESSORA, marca: "Brother", modelo: "HL-L2350DW", ano: 2023, estado: EstadoFisico.USADO_LEVE, peso: 7.2, valor: 760, loteId: "lote-seed-10", pos: 3, status: StatusRastreamento.AGUARDANDO_DESMONTE },
    { codigo: "GC-IM-2021-032", tipo: TipoEquipamento.IMPRESSORA, marca: "Epson", modelo: "EcoTank L3250", ano: 2021, estado: EstadoFisico.USADO_MODERADO, peso: 4.5, valor: 490, loteId: "lote-seed-11", pos: 2, status: StatusRastreamento.EM_DESMONTE },
    { codigo: "GC-IM-2020-033", tipo: TipoEquipamento.IMPRESSORA, marca: "HP", modelo: "LaserJet M1132", ano: 2020, estado: EstadoFisico.DANIFICADO_LEVE, peso: 7.0, valor: 230, loteId: "lote-seed-11", pos: 3, status: StatusRastreamento.MATERIAL_RECICLAVEL },
    { codigo: "GC-IM-2018-034", tipo: TipoEquipamento.IMPRESSORA, marca: "Brother", modelo: "DCP-L2540DW", ano: 2018, estado: EstadoFisico.DANIFICADO_GRAVE, peso: 9.8, valor: 130, loteId: "lote-seed-12", pos: 2, status: StatusRastreamento.DESCARTE_SEGURO },
    { codigo: "GC-IM-2017-035", tipo: TipoEquipamento.IMPRESSORA, marca: "Samsung", modelo: "M2070W", ano: 2017, estado: EstadoFisico.INSERVIVEL, peso: 7.4, valor: 65, loteId: "lote-seed-12", pos: 3, status: StatusRastreamento.BAIXA_DEFINITIVA },
    { codigo: "GC-NB-2024-036", tipo: TipoEquipamento.NOTEBOOK, marca: "Dell", modelo: "Latitude 5440", ano: 2024, estado: EstadoFisico.BOM_ESTADO, peso: 1.45, valor: 2750, loteId: "lote-seed-12", pos: 4, status: StatusRastreamento.EM_TRIAGEM }
  ];

  for (const eq of equipamentosSeed) {
    const salvo = await prisma.equipamento.upsert({
      where: { codigoBarrasInterno: eq.codigo },
      update: {},
      create: {
        codigoBarrasInterno: eq.codigo,
        tipo: eq.tipo,
        marca: eq.marca,
        modelo: eq.modelo,
        anoFabricacao: eq.ano,
        estadoFisico: eq.estado,
        pesoQuilogramas: eq.peso,
        valorEstimadoRecuperacao: eq.valor,
        loteId: eq.loteId,
        posicaoNoLote: eq.pos,
        statusRastreamento: eq.status
      }
    });

    const movExistente = await prisma.movimentacao.findFirst({
      where: { equipamentoId: salvo.id }
    });

    if (!movExistente) {
      await prisma.movimentacao.createMany({
        data: [
          {
            equipamentoId: salvo.id,
            origem: "DOCA_RECEBIMENTO",
            destino: "BANCADA_TRIAGEM",
            responsavel: "gestor",
            observacao: "Recebimento e conferência inicial de lote",
            estadoAnterior: eq.estado,
            estadoNovo: eq.estado
          },
          {
            equipamentoId: salvo.id,
            origem: "BANCADA_TRIAGEM",
            destino: eq.status,
            responsavel: "gestor",
            observacao: "Classificação física e encaminhamento operacional",
            estadoAnterior: eq.estado,
            estadoNovo: eq.estado
          }
        ]
      });
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
