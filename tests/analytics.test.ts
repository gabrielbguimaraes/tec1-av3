import { TipoAnalise } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { AnalisadorEficienciaOperacional } from "../src/analytics/AnalisadorEficienciaOperacional.js";
import { AnalisadorRentabilidadeEquipamento } from "../src/analytics/AnalisadorRentabilidadeEquipamento.js";
import { AnalisadorVidaUtilPreditivo } from "../src/analytics/AnalisadorVidaUtilPreditivo.js";
import { prisma } from "../src/infra/prisma.js";

describe("Camada Analítica e Regressão Linear OLS", () => {
  const idsCriados: string[] = [];

  afterAll(async () => {
    if (idsCriados.length > 0) {
      await prisma.resultadoAnalitico.deleteMany({
        where: { id: { in: idsCriados } }
      });
    }
    await prisma.$disconnect();
  });

  it("calcula eficiência operacional e identifica gargalo de triagem", async () => {
    const analisador = new AnalisadorEficienciaOperacional(prisma);
    const resultado = await analisador.executar({ origemExecucao: "TESTE" });
    idsCriados.push(resultado.resultadoAnaliticoId);

    expect(resultado.resumoGlobal.totalLotesAnalisados).toBeGreaterThanOrEqual(10);
    expect(resultado.resumoGlobal.tempoMedioHoras).toBeGreaterThan(0);
    expect(resultado.resumoGlobal.desvioPadraoHoras).toBeGreaterThan(0);
    expect(resultado.porOperador.length).toBeGreaterThanOrEqual(3);
    expect(resultado.gargalos.operadores).toContain("gestor3");

    const salvo = await prisma.resultadoAnalitico.findUnique({
      where: { id: resultado.resultadoAnaliticoId }
    });
    expect(salvo?.tipo).toBe(TipoAnalise.EFICIENCIA_OPERACIONAL);
  });

  it("calcula ranking de rentabilidade por equipamento ordenado do maior para o menor", async () => {
    const analisador = new AnalisadorRentabilidadeEquipamento(prisma);
    const resultado = await analisador.executar({ origemExecucao: "TESTE" });
    idsCriados.push(resultado.resultadoAnaliticoId);

    expect(resultado.resumoGeral.totalEquipamentos).toBeGreaterThanOrEqual(30);
    expect(resultado.ranking.length).toBeGreaterThan(0);
    expect(resultado.ranking[0].valorMedioRecuperacao).toBeGreaterThanOrEqual(
      resultado.ranking[resultado.ranking.length - 1].valorMedioRecuperacao
    );
    expect(resultado.resumoGeral.retornoMedioPorKg).toBeGreaterThan(0);
  });

  it("executa regressão OLS para vida útil preditiva e persiste PrevisaoVidaUtil", async () => {
    const analisador = new AnalisadorVidaUtilPreditivo(prisma);
    const resultado = await analisador.executar({
      origemExecucao: "TESTE",
      anoReferencia: 2026
    });
    idsCriados.push(resultado.resultadoAnaliticoId);

    expect(resultado.previsoes.length).toBeGreaterThanOrEqual(5);

    const notebook = resultado.previsoes.find((p) => p.tipoEquipamento === "NOTEBOOK");
    expect(notebook).toBeDefined();
    expect(notebook!.coeficienteAngular).toBeLessThan(0);
    expect(notebook!.rQuadrado).toBeGreaterThan(0.7);
    expect(notebook!.vidaUtilRemanescenteAnos).toBeGreaterThanOrEqual(0);
    expect(notebook!.anoPrevistoInservivel).toBeGreaterThanOrEqual(2026);

    const previsoesBanco = await prisma.previsaoVidaUtil.findMany({
      where: { resultadoAnaliticoId: resultado.resultadoAnaliticoId }
    });
    expect(previsoesBanco.length).toBe(resultado.previsoes.length);
  });
});
