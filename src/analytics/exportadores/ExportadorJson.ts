import { ExportadorRelatorio, ResultadoExportacao } from "./ExportadorRelatorio.js";

export class ExportadorJson implements ExportadorRelatorio {
  public exportar(dados: unknown): ResultadoExportacao {
    return {
      conteudo: JSON.stringify(dados, null, 2),
      extensao: "json",
      mimeType: "application/json"
    };
  }
}
