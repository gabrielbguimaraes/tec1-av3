export abstract class Validador<T> {
  protected mensagemErro = "Valor inválido";

  abstract validar(valor: T): boolean;

  public obterMensagemErro(): string {
    return this.mensagemErro;
  }
}
