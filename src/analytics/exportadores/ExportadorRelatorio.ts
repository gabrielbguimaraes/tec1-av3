export interface ResultadoExportacao {
  conteudo: string;
  extensao: string;
  mimeType: string;
}

export interface ExportadorRelatorio {
  exportar(dados: unknown): ResultadoExportacao;
}
