import { PapelUsuario } from "@prisma/client";
import { FastifyReply, FastifyRequest } from "fastify";
import { ErroAutenticacao, ErroAutorizacao } from "../../domain/erros/ErroDominio.js";
import { ApiKeyContext, ServicoApiKey } from "../../services/ServicoApiKey.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      usuario: string;
      papel: PapelUsuario;
    };
    user: {
      sub: string;
      usuario: string;
      papel: PapelUsuario;
    };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    apiKeyContext?: ApiKeyContext;
  }
}

export function criarAutenticacaoJwt(papeisPermitidos?: PapelUsuario[]) {
  return async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    try {
      await request.jwtVerify();
    } catch {
      throw new ErroAutenticacao("Token JWT inválido ou ausente");
    }

    if (papeisPermitidos && !papeisPermitidos.includes(request.user.papel)) {
      throw new ErroAutorizacao("Papel de usuário sem permissão para esta operação");
    }
  };
}

export function criarAutenticacaoApiKey(servicoApiKey: ServicoApiKey) {
  return async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const rawHeader = request.headers["x-api-key"];
    const chave = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (!chave || chave.trim().length === 0) {
      throw new ErroAutenticacao("Header X-API-Key obrigatório");
    }

    request.apiKeyContext = await servicoApiKey.validarChave(chave.trim());
  };
}

export function exigirPermissao(permissao: string) {
  return async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const permissoes = request.apiKeyContext?.permissoes ?? [];
    if (!permissoes.includes(permissao)) {
      throw new ErroAutorizacao(`Escopo obrigatório ausente: ${permissao}`);
    }
  };
}
