import { FormatoExportacao, StatusLote, StatusRastreamento, EstadoFisico } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ExportadorCsv } from "../src/analytics/exportadores/ExportadorCsv.js";
import { ExportadorJson } from "../src/analytics/exportadores/ExportadorJson.js";
import { FabricaExportador } from "../src/analytics/exportadores/FabricaExportador.js";
import { ErroValidacao } from "../src/domain/erros/ErroDominio.js";
import { RegrasEquipamento } from "../src/domain/regras/RegrasEquipamento.js";
import { ValidadorCNPJ } from "../src/domain/validadores/ValidadorCNPJ.js";
import { ValidadorDataEntrada } from "../src/domain/validadores/ValidadorDataEntrada.js";

describe("Regras de Domínio e Validadores Polimórficos", () => {
  it("valida CNPJs reais pelo Módulo 11 e rejeita inválidos", () => {
    const validador = new ValidadorCNPJ();

    expect(validador.validar("11222333000181")).toBe(true);
    expect(validador.validar("11.444.777/0001-61")).toBe(true);

    expect(validador.validar("00000000000000")).toBe(false);
    expect(validador.obterMensagemErro()).toContain("repetidos");

    expect(validador.validar("11222333000180")).toBe(false);
    expect(validador.validar("12345")).toBe(false);
  });

  it("valida janela de data de entrada de até 90 dias no passado sem datas futuras", () => {
    const referencia = new Date("2026-11-23T12:00:00Z");
    const validador = new ValidadorDataEntrada(referencia);

    expect(validador.validar(new Date("2026-11-23T10:00:00Z"))).toBe(true);
    expect(validador.validar(new Date("2026-09-15T10:00:00Z"))).toBe(true);

    expect(validador.validar(new Date("2026-11-24T12:00:00Z"))).toBe(false);
    expect(validador.obterMensagemErro()).toContain("futura");

    expect(validador.validar(new Date("2026-08-01T12:00:00Z"))).toBe(false);
    expect(validador.obterMensagemErro()).toContain("90 dias");
  });

  it("bloqueia avanço para desmonte sem triagem prévia e exige justificativa em degradação >= 2", () => {
    expect(() =>
      RegrasEquipamento.validarTransicaoDesmonte(
        StatusRastreamento.AGUARDANDO_TRIAGEM,
        StatusRastreamento.AGUARDANDO_DESMONTE,
        StatusLote.RECEBIDO
      )
    ).toThrow(ErroValidacao);

    expect(() =>
      RegrasEquipamento.validarTransicaoDesmonte(
        StatusRastreamento.EM_TRIAGEM,
        StatusRastreamento.AGUARDANDO_DESMONTE,
        StatusLote.EM_TRIAGEM
      )
    ).not.toThrow();

    expect(() =>
      RegrasEquipamento.validarDegradacaoEstado(
        EstadoFisico.NOVO,
        EstadoFisico.USADO_LEVE
      )
    ).toThrow(ErroValidacao);

    expect(() =>
      RegrasEquipamento.validarDegradacaoEstado(
        EstadoFisico.NOVO,
        EstadoFisico.USADO_LEVE,
        "Placa-mãe oxidada após inspeção"
      )
    ).not.toThrow();

    expect(() =>
      RegrasEquipamento.validarDegradacaoEstado(
        EstadoFisico.NOVO,
        EstadoFisico.BOM_ESTADO
      )
    ).not.toThrow();
  });

  it("aplica polimorfismo nos exportadores JSON e CSV", () => {
    const dados = {
      ranking: [
        { tipo: "NOTEBOOK", marca: "Dell", valorMedio: 1950 },
        { tipo: "SERVIDOR", marca: "HPE, Inc.", valorMedio: 11200 }
      ]
    };

    const expJson = FabricaExportador.criar(FormatoExportacao.JSON);
    const expCsv = FabricaExportador.criar(FormatoExportacao.CSV);

    expect(expJson).toBeInstanceOf(ExportadorJson);
    expect(expCsv).toBeInstanceOf(ExportadorCsv);

    const saidaJson = expJson.exportar(dados);
    expect(saidaJson.extensao).toBe("json");
    expect(saidaJson.mimeType).toContain("application/json");
    expect(JSON.parse(saidaJson.conteudo).ranking).toHaveLength(2);

    const saidaCsv = expCsv.exportar(dados);
    expect(saidaCsv.extensao).toBe("csv");
    expect(saidaCsv.mimeType).toContain("text/csv");
    expect(saidaCsv.conteudo).toContain("tipo,marca,valorMedio");
    expect(saidaCsv.conteudo).toContain('"HPE, Inc."');
  });
});
