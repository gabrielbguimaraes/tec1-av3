export const schemaErro = {
  type: "object",
  properties: {
    statusCode: { type: "integer" },
    codigo: { type: "string" },
    erro: { type: "string" },
    mensagem: { type: "string" }
  }
};

export const respostasErroPadrao = {
  400: { description: "Dados inválidos", ...schemaErro },
  401: { description: "Não autenticado", ...schemaErro },
  403: { description: "Sem permissão", ...schemaErro },
  404: { description: "Recurso não encontrado", ...schemaErro },
  409: { description: "Conflito de versão ou unicidade", ...schemaErro },
  429: { description: "Limite de requisições excedido", ...schemaErro },
  500: { description: "Erro interno do servidor", ...schemaErro }
};
