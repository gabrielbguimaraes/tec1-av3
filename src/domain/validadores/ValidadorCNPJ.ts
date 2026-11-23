import { Validador } from "./Validador.js";

export class ValidadorCNPJ extends Validador<string> {
  public static limpar(cnpj: string): string {
    return cnpj.replace(/\D/g, "");
  }

  public validar(valor: string): boolean {
    const cnpj = ValidadorCNPJ.limpar(valor ?? "");

    if (cnpj.length !== 14) {
      this.mensagemErro = "CNPJ deve conter exatamente 14 dígitos numéricos";
      return false;
    }

    if (/^(\d)\1{13}$/.test(cnpj)) {
      this.mensagemErro = "CNPJ inválido: sequência de dígitos repetidos";
      return false;
    }

    const primeiroDigito = this.calcularDigito(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    if (primeiroDigito !== Number(cnpj[12])) {
      this.mensagemErro = "CNPJ inválido: primeiro dígito verificador incorreto";
      return false;
    }

    const segundoDigito = this.calcularDigito(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    if (segundoDigito !== Number(cnpj[13])) {
      this.mensagemErro = "CNPJ inválido: segundo dígito verificador incorreto";
      return false;
    }

    return true;
  }

  private calcularDigito(base: string, pesos: number[]): number {
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) {
      soma += Number(base[i]) * pesos[i];
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  }
}
