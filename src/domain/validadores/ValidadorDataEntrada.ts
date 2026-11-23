import { Validador } from "./Validador.js";

const NOVENTA_DIAS_MS = 90 * 24 * 60 * 60 * 1000;

export class ValidadorDataEntrada extends Validador<Date> {
  private readonly referencia: Date;

  constructor(referencia: Date = new Date()) {
    super();
    this.referencia = referencia;
  }

  public validar(valor: Date): boolean {
    if (!(valor instanceof Date) || Number.isNaN(valor.getTime())) {
      this.mensagemErro = "Data de entrada inválida";
      return false;
    }

    const diffMs = this.referencia.getTime() - valor.getTime();
    if (diffMs < 0) {
      this.mensagemErro = "Data de entrada não pode ser futura";
      return false;
    }

    if (diffMs > NOVENTA_DIAS_MS) {
      this.mensagemErro = "Data de entrada não pode ser anterior a mais de 90 dias";
      return false;
    }

    return true;
  }
}
