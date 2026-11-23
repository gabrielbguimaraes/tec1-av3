export class ErroDominio extends Error {
  public readonly statusCode: number;
  public readonly codigo: string;

  constructor(mensagem: string, statusCode = 400, codigo = "ERRO_DOMINIO") {
    super(mensagem);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.codigo = codigo;
  }
}

export class ErroValidacao extends ErroDominio {
  constructor(mensagem: string) {
    super(mensagem, 400, "ERRO_VALIDACAO");
  }
}

export class ErroAutenticacao extends ErroDominio {
  constructor(mensagem = "Credenciais inválidas ou ausentes") {
    super(mensagem, 401, "ERRO_AUTENTICACAO");
  }
}

export class ErroAutorizacao extends ErroDominio {
  constructor(mensagem = "Permissão insuficiente para esta operação") {
    super(mensagem, 403, "ERRO_AUTORIZACAO");
  }
}

export class ErroNaoEncontrado extends ErroDominio {
  constructor(mensagem = "Recurso não encontrado") {
    super(mensagem, 404, "ERRO_NAO_ENCONTRADO");
  }
}

export class ErroConflitoVersao extends ErroDominio {
  constructor(mensagem = "Conflito de concorrência: registro alterado por outro processo") {
    super(mensagem, 409, "CONFLITO_VERSAO");
  }
}
