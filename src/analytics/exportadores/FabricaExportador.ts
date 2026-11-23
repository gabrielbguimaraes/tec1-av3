import { FormatoExportacao } from "@prisma/client";
import { ExportadorCsv } from "./ExportadorCsv.js";
import { ExportadorJson } from "./ExportadorJson.js";
import { ExportadorRelatorio } from "./ExportadorRelatorio.js";

export class FabricaExportador {
  public static criar(formato: FormatoExportacao): ExportadorRelatorio {
    switch (formato) {
      case FormatoExportacao.CSV:
        return new ExportadorCsv();
      case FormatoExportacao.JSON:
      default:
        return new ExportadorJson();
    }
  }
}
