import { ExportadorRelatorio, ResultadoExportacao } from "./ExportadorRelatorio.js";

export class ExportadorCsv implements ExportadorRelatorio {
  public exportar(dados: unknown): ResultadoExportacao {
    const linhas = this.extrairLinhas(dados);

    if (linhas.length === 0) {
      return {
        conteudo: "chave,valor\n",
        extensao: "csv",
        mimeType: "text/csv; charset=utf-8"
      };
    }

    const cabecalhos = Array.from(
      linhas.reduce((set, item) => {
        Object.keys(item).forEach((k) => set.add(k));
        return set;
      }, new Set<string>())
    );

    const linhasCsv = [
      cabecalhos.map((c) => this.escaparCelula(c)).join(","),
      ...linhas.map((registro) =>
        cabecalhos.map((c) => this.escaparCelula(registro[c])).join(",")
      )
    ];

    return {
      conteudo: `${linhasCsv.join("\n")}\n`,
      extensao: "csv",
      mimeType: "text/csv; charset=utf-8"
    };
  }

  private extrairLinhas(dados: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(dados)) {
      return dados.map((item) => this.achatarObjeto(item));
    }

    if (dados && typeof dados === "object") {
      const obj = dados as Record<string, unknown>;
      for (const chave of ["ranking", "previsoes", "porOperador", "porPeriodo"]) {
        if (Array.isArray(obj[chave])) {
          return (obj[chave] as unknown[]).map((item) => this.achatarObjeto(item));
        }
      }
      return [this.achatarObjeto(obj)];
    }

    return [{ valor: dados }];
  }

  private achatarObjeto(valor: unknown, prefixo = ""): Record<string, unknown> {
    if (valor === null || typeof valor !== "object" || valor instanceof Date) {
      return { [prefixo || "valor"]: valor instanceof Date ? valor.toISOString() : valor };
    }

    const saida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      const chave = prefixo ? `${prefixo}.${k}` : k;
      if (v !== null && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v)) {
        Object.assign(saida, this.achatarObjeto(v, chave));
      } else if (Array.isArray(v)) {
        saida[chave] = JSON.stringify(v);
      } else if (v instanceof Date) {
        saida[chave] = v.toISOString();
      } else {
        saida[chave] = v;
      }
    }
    return saida;
  }

  private escaparCelula(valor: unknown): string {
    if (valor === null || valor === undefined) {
      return "";
    }
    const texto = String(valor);
    if (/[",\n\r]/.test(texto)) {
      return `"${texto.replace(/"/g, '""')}"`;
    }
    return texto;
  }
}
