import { EstadoFisico, StatusLote, StatusRastreamento } from "@prisma/client";
import { ErroValidacao } from "../erros/ErroDominio.js";

const ORDEM_ESTADO_FISICO: Record<EstadoFisico, number> = {
  NOVO: 0,
  BOM_ESTADO: 1,
  USADO_LEVE: 2,
  USADO_MODERADO: 3,
  DANIFICADO_LEVE: 4,
  DANIFICADO_GRAVE: 5,
  INSERVIVEL: 6
};

export class RegrasEquipamento {
  public static validarTransicaoDesmonte(
    statusAtual: StatusRastreamento,
    statusNovo: StatusRastreamento,
    statusLote: StatusLote
  ): void {
    const destinosDesmonte: StatusRastreamento[] = [
      StatusRastreamento.AGUARDANDO_DESMONTE,
      StatusRastreamento.EM_DESMONTE
    ];

    if (!destinosDesmonte.includes(statusNovo)) {
      return;
    }

    const triagemEquipamentoOk =
      statusAtual === StatusRastreamento.EM_TRIAGEM ||
      statusAtual === StatusRastreamento.AGUARDANDO_DESMONTE;

    const triagemLoteOk =
      statusLote === StatusLote.TRIAGEM_CONCLUIDA ||
      statusLote === StatusLote.ENCAMINHADO ||
      statusLote === StatusLote.FINALIZADO;

    if (!triagemEquipamentoOk && !triagemLoteOk) {
      throw new ErroValidacao(
        "Equipamento só pode avançar para desmonte após passar por triagem"
      );
    }
  }

  public static validarDegradacaoEstado(
    estadoAnterior: EstadoFisico,
    estadoNovo: EstadoFisico,
    justificativa?: string
  ): void {
    const diferenca = ORDEM_ESTADO_FISICO[estadoNovo] - ORDEM_ESTADO_FISICO[estadoAnterior];
    if (diferenca >= 2 && (!justificativa || justificativa.trim().length === 0)) {
      throw new ErroValidacao(
        "Degradação do estado físico em 2 ou mais categorias exige justificativa textual obrigatória"
      );
    }
  }
}
