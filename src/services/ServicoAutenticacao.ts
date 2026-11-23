import bcrypt from "bcryptjs";
import { PapelUsuario, PrismaClient } from "@prisma/client";
import { ErroAutenticacao } from "../domain/erros/ErroDominio.js";

export interface UsuarioAutenticado {
  id: string;
  usuario: string;
  papel: PapelUsuario;
}

export class ServicoAutenticacao {
  constructor(private readonly prisma: PrismaClient) {}

  public async autenticar(usuario: string, senha: string): Promise<UsuarioAutenticado> {
    const registro = await this.prisma.usuario.findUnique({
      where: { usuario }
    });

    if (!registro || !registro.ativo) {
      throw new ErroAutenticacao("Usuário ou senha inválidos");
    }

    const senhaConfere = await bcrypt.compare(senha, registro.hashSenha);
    if (!senhaConfere) {
      throw new ErroAutenticacao("Usuário ou senha inválidos");
    }

    await this.prisma.usuario.update({
      where: { id: registro.id },
      data: { ultimoAcesso: new Date() }
    });

    return {
      id: registro.id,
      usuario: registro.usuario,
      papel: registro.papel
    };
  }
}
