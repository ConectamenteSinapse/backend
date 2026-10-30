import mongoose from "mongoose";
import CriancaModel from "../models/criancaModel.js";
import { buscarJogoSalvoPorId } from "./jogoSalvoService.js";
import { randomUUID } from "node:crypto";

// Obter a data atual no horário de São Paulo
const obterDataSaoPaulo = (data = new Date()) => {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(data);

  const ano = partes.find((parte) => parte.type === "year").value;
  const mes = partes.find((parte) => parte.type === "month").value;
  const dia = partes.find((parte) => parte.type === "day").value;

  return `${ano}-${mes}-${dia}`;
};
// Verificar se a criança possui tempo disponível no dia
const possuiTempoDisponivel = (crianca, dataAtual) => {
  // Sem limite configurado, a criança pode jogar
  if (crianca.limiteTempoDiario === null) {
    return true;
  }

  // Converter o limite de minutos para segundos
  const limiteSegundos = crianca.limiteTempoDiario * 60;

  // Verificar se o consumo pertence ao dia atual
  const mesmoDia = crianca.dataReferenciaTempo === dataAtual;

  // Se mudou o dia, o consumo anterior não entra no limite de hoje
  const tempoConsumido = mesmoDia ? crianca.tempoUsadoHoje : 0;

  return tempoConsumido < limiteSegundos;
};
// Determinar até quando uma sessão pode ser contabilizada

const obterFimIntervalo = (crianca, agora = new Date()) => {
  // Somente sessões ativas podem consumir tempo
  if (!crianca || crianca.sessaoJogoEstado !== "ativa") {
    return null;
  }

  const ultimoInstante = crianca.sessaoJogoContabilizadoEm;
  const expiracao = crianca.sessaoJogoExpiraEm;

  // Verificar se os valores são datas válidas
  if (
    !(ultimoInstante instanceof Date) ||
    !(expiracao instanceof Date) ||
    !(agora instanceof Date) ||
    !Number.isFinite(ultimoInstante.getTime()) ||
    !Number.isFinite(expiracao.getTime()) ||
    !Number.isFinite(agora.getTime())
  ) {
    return null;
  }

  // Nunca contabilizar além da expiração
  const fim = new Date(Math.min(agora.getTime(), expiracao.getTime()));

  // Evitar intervalos negativos ou já contabilizados
  if (fim.getTime() <= ultimoInstante.getTime()) {
    return null;
  }

  return fim;
};

// Calcular a duração de um intervalo em segundos
const calcularSegundosIntervalo = (inicio, fim) => {
  if (!(inicio instanceof Date) || !(fim instanceof Date)) {
    return 0;
  }

  const inicioMs = inicio.getTime();
  const fimMs = fim.getTime();

  // Evitar cálculos com datas inválidas
  if (!Number.isFinite(inicioMs) || !Number.isFinite(fimMs)) {
    return 0;
  }

  const diferencaMilissegundos = fimMs - inicioMs;

  return Math.max(0, diferencaMilissegundos / 1000);
};
// Encontrar o instante da próxima meia-noite em São Paulo
const obterProximaMeiaNoite = (data) => {
  const diaAtual = obterDataSaoPaulo(data);

  let inicio = data.getTime();
  let fim = inicio + 48 * 60 * 60 * 1000;

  // Localizar a mudança de dia por busca binária
  while (fim - inicio > 1) {
    const meio = Math.floor((inicio + fim) / 2);

    if (obterDataSaoPaulo(new Date(meio)) === diaAtual) {
      inicio = meio;
    } else {
      fim = meio;
    }
  }

  return new Date(fim);
};
// Dividir o tempo de utilização entre os dias de São Paulo
const dividirIntervaloPorDia = (inicio, fim) => {
  const intervalos = [];

  let atual = new Date(inicio);

  while (atual.getTime() < fim.getTime()) {
    // Encontrar a próxima virada de dia
    const proximaMeiaNoite = obterProximaMeiaNoite(atual);

    // O intervalo termina na meia-noite ou no fim informado
    const fimDoTrecho = new Date(
      Math.min(proximaMeiaNoite.getTime(), fim.getTime()),
    );

    // Identificar o dia e calcular a duração
    intervalos.push({
      data: obterDataSaoPaulo(atual),
      segundos: calcularSegundosIntervalo(atual, fimDoTrecho),
    });

    atual = fimDoTrecho;
  }

  return intervalos;
};

const calcularNovoConsumo = (crianca, agora = new Date()) => {
  const dataAtual = obterDataSaoPaulo(agora);

  // Recuperar o consumo registrado no dia atual
  let tempoUsadoHoje =
    crianca.dataReferenciaTempo === dataAtual
      ? (crianca.tempoUsadoHoje ?? 0)
      : 0;

  // Calcular até quando a sessão pode ser contabilizada
  const fimIntervalo = obterFimIntervalo(crianca, agora);

  if (!fimIntervalo) {
    return {
      dataReferenciaTempo: dataAtual,
      tempoUsadoHoje,
      sessaoJogoContabilizadoEm: crianca.sessaoJogoContabilizadoEm,
    };
  }
  // Dividir o intervalo entre os dias de São Paulo
  const intervalos = dividirIntervaloPorDia(
    crianca.sessaoJogoContabilizadoEm,
    fimIntervalo,
  );

  // Somar somente o consumo correspondente ao dia atual
  for (const intervalo of intervalos) {
    if (intervalo.data === dataAtual) {
      tempoUsadoHoje += intervalo.segundos;
    }
  }
  return {
    dataReferenciaTempo: dataAtual,
    tempoUsadoHoje,
    sessaoJogoContabilizadoEm: fimIntervalo,
  };
};
const atualizarConsumoCondicional = async (crianca, novoConsumo) => {
  const versaoAtual = crianca.sessaoJogoVersao ?? 0;
  // Compatibilidade com documentos anteriores ao controle de sessão
  const filtroVersao =
    versaoAtual === 0
      ? {
          $or: [
            { sessaoJogoVersao: 0 },
            { sessaoJogoVersao: { $exists: false } },
          ],
        }
      : { sessaoJogoVersao: versaoAtual };
  const criancaAtualizada = await CriancaModel.findOneAndUpdate(
    {
      _id: crianca._id,
      ...filtroVersao,
    },
    {
      $set: {
        dataReferenciaTempo: novoConsumo.dataReferenciaTempo,
        tempoUsadoHoje: novoConsumo.tempoUsadoHoje,
        sessaoJogoContabilizadoEm: novoConsumo.sessaoJogoContabilizadoEm,
      },
      $inc: {
        sessaoJogoVersao: 1,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );
  return criancaAtualizada;
};
const possuiSessaoAtiva = (crianca, agora = new Date()) => {
  if (crianca.sessaoJogoEstado !== "ativa") {
    return false;
  }
  const expiracao = crianca.sessaoJogoExpiraEm;
  if (!(expiracao instanceof Date) || !Number.isFinite(expiracao.getTime())) {
    return false;
  }
  return expiracao.getTime() > agora.getTime();
};
const prepararAtualizacaoInicio = (
  crianca,
  novoConsumo,
  jogoSalvoId,
  agora,
) => {
  const dataAtual = obterDataSaoPaulo(agora);
  const criancaAtualizada = {
    ...crianca.toObject(),
    ...novoConsumo,
  };
  const tempoDisponivel = possuiTempoDisponivel(criancaAtualizada, dataAtual);
  // Campos comuns: o consumo anterior será preservado
  const atualizacao = {
    dataReferenciaTempo: novoConsumo.dataReferenciaTempo,
    tempoUsadoHoje: novoConsumo.tempoUsadoHoje,
    sessaoJogoContabilizadoEm: novoConsumo.sessaoJogoContabilizadoEm,
  };
  if (!tempoDisponivel) {
    // Registrar consumo, mas não iniciar outra sessão
    return {
      tempoDisponivel: false,
      atualizacao: {
        ...atualizacao,
        sessaoJogoEstado: "encerrada",
        sessaoJogoExpiraEm: null,
      },
    };
  }
  const limiteSegundos =
    crianca.limiteTempoDiario === null
      ? Infinity
      : crianca.limiteTempoDiario * 60;
  const segundosRestantes = Math.max(
    0,
    limiteSegundos - novoConsumo.tempoUsadoHoje,
  );
  const duracaoSessaoMs = Math.min(30_000, segundosRestantes * 1000);
  const expiracao = new Date(agora.getTime() + duracaoSessaoMs);
  return {
    tempoDisponivel: true,
    atualizacao: {
      ...atualizacao,
      sessaoJogoId: randomUUID(),
      sessaoJogoSalvoId: jogoSalvoId,
      sessaoJogoEstado: "ativa",
      sessaoJogoContabilizadoEm: agora,
      sessaoJogoExpiraEm: expiracao,
    },
  };
};
// Verificar se a criança pode iniciar uma sessão de jogo
const iniciarSessaoJogo = async (usuarioId, jogoSalvoId) => {
  if (!mongoose.isValidObjectId(jogoSalvoId)) {
    throw new Error("ID_INVALIDO");
  }
  // Validar a partida antes de alterar o consumo
  const jogoSalvo = await buscarJogoSalvoPorId(usuarioId, jogoSalvoId);
  // Tentar novamente se outra requisição atualizar a versão
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const crianca = await CriancaModel.findOne({ usuarioId });
    if (!crianca) {
      throw new Error("CRIANCA_NAO_ENCONTRADA");
    }
    if (!crianca.permissaoAtiva) {
      throw new Error("PERMISSAO_INATIVA");
    }
    const agora = new Date();
    // Uma sessão válida não pode ser substituída
    if (possuiSessaoAtiva(crianca, agora)) {
      throw new Error("SESSAO_JA_ATIVA");
    }
    const novoConsumo = calcularNovoConsumo(crianca, agora);
    const preparacao = prepararAtualizacaoInicio(
      crianca,
      novoConsumo,
      jogoSalvoId,
      agora,
    );
    const versaoAtual = crianca.sessaoJogoVersao ?? 0;
    // Aceitar documentos antigos sem o campo de versão
    const filtroVersao =
      versaoAtual === 0
        ? {
            $or: [
              { sessaoJogoVersao: 0 },
              { sessaoJogoVersao: { $exists: false } },
            ],
          }
        : { sessaoJogoVersao: versaoAtual };
    const criancaAtualizada = await CriancaModel.findOneAndUpdate(
      {
        _id: crianca._id,
        ...filtroVersao,
      },
      {
        $set: preparacao.atualizacao,
        $inc: { sessaoJogoVersao: 1 },
      },
      {
        new: true,
        runValidators: true,
      },
    );
    // Outra requisição alterou o documento: recalcular
    if (!criancaAtualizada) {
      continue;
    }
    // O consumo foi salvo mesmo quando o limite acabou
    if (!preparacao.tempoDisponivel) {
      throw new Error("LIMITE_TEMPO_ATINGIDO");
    }
    return {
      jogoSalvo,
      sessaoId: criancaAtualizada.sessaoJogoId,
      estado: criancaAtualizada.sessaoJogoEstado,
      expiraEm: criancaAtualizada.sessaoJogoExpiraEm,
      tempoUsadoHoje: criancaAtualizada.tempoUsadoHoje,
      limiteTempoDiario: criancaAtualizada.limiteTempoDiario,
    };
  }
  throw new Error("CONFLITO_SESSAO");
};
const renovarSessaoJogo = async (usuarioId, sessaoId) => {
  if (typeof sessaoId !== "string" || !sessaoId.trim()) {
    throw new Error("SESSAO_INVALIDA");
  }
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const crianca = await CriancaModel.findOne({ usuarioId });
    if (!crianca) {
      throw new Error("CRIANCA_NAO_ENCONTRADA");
    }
    if (crianca.sessaoJogoId !== sessaoId) {
      throw new Error("SESSAO_INVALIDA");
    }
    if (crianca.sessaoJogoEstado !== "ativa") {
      throw new Error("SESSAO_INATIVA");
    }
    // Impedir a renovação de sessões sem referência válida de tempo
    const ultimoInstante = crianca.sessaoJogoContabilizadoEm;
    if (
      !(ultimoInstante instanceof Date) ||
      !Number.isFinite(ultimoInstante.getTime())
    ) {
      const versaoAtual = crianca.sessaoJogoVersao ?? 0;
      const filtroVersao =
        versaoAtual === 0
          ? {
              $or: [
                { sessaoJogoVersao: 0 },
                { sessaoJogoVersao: { $exists: false } },
              ],
            }
          : { sessaoJogoVersao: versaoAtual };
      const sessaoEncerrada = await CriancaModel.findOneAndUpdate(
        {
          _id: crianca._id,
          sessaoJogoId: sessaoId,
          sessaoJogoEstado: "ativa",
          ...filtroVersao,
        },
        {
          $set: {
            sessaoJogoEstado: "encerrada",
            sessaoJogoExpiraEm: null,
          },
          $inc: {
            sessaoJogoVersao: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      );
      if (!sessaoEncerrada) {
        // Outra operação modificou a sessão.
        continue;
      }
      throw new Error("SESSAO_INVALIDA");
    }
    const agora = new Date();
    // Calcular todo o intervalo pendente, sem ultrapassar a expiração da sessão.
    const novoConsumo = calcularNovoConsumo(crianca, agora);
    const dadosAtualizados = {
      ...crianca.toObject(),
      ...novoConsumo,
    };
    const tempoDisponivel = possuiTempoDisponivel(
      dadosAtualizados,
      obterDataSaoPaulo(agora),
    );
    const sessaoValida = possuiSessaoAtiva(crianca, agora);
    const continuarJogando =
      sessaoValida && crianca.permissaoAtiva && tempoDisponivel;
    const atualizacao = {
      ...novoConsumo,
    };
    if (continuarJogando) {
      const segundosRestantes =
        crianca.limiteTempoDiario === null
          ? Infinity
          : Math.max(
              0,
              crianca.limiteTempoDiario * 60 - novoConsumo.tempoUsadoHoje,
            );
      const duracaoMs = Math.min(30_000, segundosRestantes * 1000);
      atualizacao.sessaoJogoExpiraEm = new Date(agora.getTime() + duracaoMs);
    } else {
      atualizacao.sessaoJogoEstado = "encerrada";
      atualizacao.sessaoJogoExpiraEm = null;
    }
    // Controle de concorrência
    const versaoAtual = crianca.sessaoJogoVersao ?? 0;

    const filtroVersao =
      versaoAtual === 0
        ? {
            $or: [
              { sessaoJogoVersao: 0 },
              { sessaoJogoVersao: { $exists: false } },
            ],
          }
        : { sessaoJogoVersao: versaoAtual };

    const criancaAtualizada = await CriancaModel.findOneAndUpdate(
      {
        _id: crianca._id,
        sessaoJogoId: sessaoId,
        sessaoJogoEstado: "ativa",
        ...filtroVersao,
      },
      {
        $set: atualizacao,
        $inc: { sessaoJogoVersao: 1 },
      },
      {
        new: true,
        runValidators: true,
      },
    );
    if (!criancaAtualizada) {
      // Houve alteração concorrente; consultar novamente.
      continue;
    }
    if (!sessaoValida) {
      throw new Error("SESSAO_EXPIRADA");
    }
    if (!crianca.permissaoAtiva) {
      throw new Error("PERMISSAO_INATIVA");
    }
    if (!tempoDisponivel) {
      throw new Error("LIMITE_TEMPO_ATINGIDO");
    }
    return {
      sessaoId: criancaAtualizada.sessaoJogoId,
      estado: criancaAtualizada.sessaoJogoEstado,
      expiraEm: criancaAtualizada.sessaoJogoExpiraEm,
      tempoUsadoHoje: criancaAtualizada.tempoUsadoHoje,
      limiteTempoDiario: criancaAtualizada.limiteTempoDiario,
    };
  }
  throw new Error("CONFLITO_SESSAO");
};
const finalizarSessaoJogo = async (usuarioId, sessaoId, estadoFinal) => {
  if (typeof sessaoId !== "string" || !sessaoId.trim()) {
    throw new Error("SESSAO_INVALIDA");
  }
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const crianca = await CriancaModel.findOne({ usuarioId });
    if (!crianca) {
      throw new Error("CRIANCA_NAO_ENCONTRADA");
    }
    if (crianca.sessaoJogoId !== sessaoId) {
      throw new Error("SESSAO_INVALIDA");
    }
    // Não contabilizar novamente sessões já finalizadas
    if (crianca.sessaoJogoEstado !== "ativa") {
      throw new Error("SESSAO_INATIVA");
    }
    const agora = new Date();
    // Contabilizar o tempo pendente até a expiração
    const novoConsumo = calcularNovoConsumo(crianca, agora);
    const versaoAtual = crianca.sessaoJogoVersao ?? 0;
    const filtroVersao =
      versaoAtual === 0
        ? {
            $or: [
              { sessaoJogoVersao: 0 },
              { sessaoJogoVersao: { $exists: false } },
            ],
          }
        : { sessaoJogoVersao: versaoAtual };
    const criancaAtualizada = await CriancaModel.findOneAndUpdate(
      {
        _id: crianca._id,
        sessaoJogoId: sessaoId,
        sessaoJogoEstado: "ativa",
        ...filtroVersao,
      },
      {
        $set: {
          ...novoConsumo,
          sessaoJogoEstado: estadoFinal,
          sessaoJogoExpiraEm: null,
        },
        $inc: { sessaoJogoVersao: 1 },
      },
      {
        new: true,
        runValidators: true,
      },
    );
    if (!criancaAtualizada) {
      continue;
    }
    return {
      sessaoId: criancaAtualizada.sessaoJogoId,
      estado: criancaAtualizada.sessaoJogoEstado,
      tempoUsadoHoje: criancaAtualizada.tempoUsadoHoje,
      limiteTempoDiario: criancaAtualizada.limiteTempoDiario,
    };
  }
  throw new Error("CONFLITO_SESSAO");
};

// Pausar a sessão
const pausarSessaoJogo = (usuarioId, sessaoId) =>
  finalizarSessaoJogo(usuarioId, sessaoId, "pausada");
// Encerrar a sessão
const encerrarSessaoJogo = (usuarioId, sessaoId) =>
  finalizarSessaoJogo(usuarioId, sessaoId, "encerrada");

const reconciliarSessaoParaResposta = async (
  criancaId,
  usuarioId,
  jogoSalvoId,
  sessaoId,
  session,
) => {
  // Consultar o estado dentro da transação
  const crianca = await CriancaModel.findOne({
    _id: criancaId,
    usuarioId,
  }).session(session);

  if (!crianca) {
    throw new Error("CRIANCA_NAO_ENCONTRADA");
  }

  // Conferir se a sessão pertence à partida informada
  if (
    crianca.sessaoJogoId !== sessaoId ||
    String(crianca.sessaoJogoSalvoId) !== String(jogoSalvoId)
  ) {
    throw new Error("SESSAO_INVALIDA");
  }

  if (crianca.sessaoJogoEstado !== "ativa") {
    throw new Error("SESSAO_INATIVA");
  }

  const agora = new Date();

  const origem = crianca.sessaoJogoContabilizadoEm;
  const expiracao = crianca.sessaoJogoExpiraEm;

  const datasValidas =
    origem instanceof Date &&
    expiracao instanceof Date &&
    Number.isFinite(origem.getTime()) &&
    Number.isFinite(expiracao.getTime()) &&
    origem.getTime() <= agora.getTime();

  // Se não existe referência confiável,
  // não permitir continuar a sessão.
  const novoConsumo = datasValidas
    ? calcularNovoConsumo(crianca, agora)
    : {
        dataReferenciaTempo: obterDataSaoPaulo(agora),
        tempoUsadoHoje:
          crianca.dataReferenciaTempo === obterDataSaoPaulo(agora)
            ? (crianca.tempoUsadoHoje ?? 0)
            : 0,
        sessaoJogoContabilizadoEm: origem,
      };

  const consumoAtualizado = {
    ...crianca.toObject(),
    ...novoConsumo,
  };

  const tempoDisponivel = possuiTempoDisponivel(
    consumoAtualizado,
    obterDataSaoPaulo(agora),
  );

  let codigoBloqueio = null;

  if (!datasValidas) {
    codigoBloqueio = "SESSAO_INVALIDA";
  } else if (expiracao.getTime() <= agora.getTime()) {
    codigoBloqueio = "SESSAO_EXPIRADA";
  } else if (!crianca.permissaoAtiva) {
    codigoBloqueio = "PERMISSAO_INATIVA";
  } else if (!tempoDisponivel) {
    codigoBloqueio = "LIMITE_TEMPO_ATINGIDO";
  }

  const versaoAtual = crianca.sessaoJogoVersao ?? 0;

  const filtroVersao =
    versaoAtual === 0
      ? {
          $or: [
            { sessaoJogoVersao: 0 },
            { sessaoJogoVersao: { $exists: false } },
          ],
        }
      : { sessaoJogoVersao: versaoAtual };

  const atualizacao = {
    ...novoConsumo,
  };

  // Se houve bloqueio, registrar o consumo
  // e impedir que a sessão continue ativa.
  if (codigoBloqueio) {
    atualizacao.sessaoJogoEstado = "encerrada";
    atualizacao.sessaoJogoExpiraEm = null;
  }

  const resultado = await CriancaModel.findOneAndUpdate(
    {
      _id: crianca._id,
      usuarioId,
      sessaoJogoId: sessaoId,
      sessaoJogoSalvoId: jogoSalvoId,
      sessaoJogoEstado: "ativa",
      ...filtroVersao,
    },
    {
      $set: atualizacao,
      $inc: { sessaoJogoVersao: 1 },
    },
    {
      session,
      new: true,
      runValidators: true,
    },
  );

  if (!resultado) {
    throw new Error("CONFLITO_SESSAO");
  }

  return { codigoBloqueio };
};

export {
  iniciarSessaoJogo,
  renovarSessaoJogo,
  pausarSessaoJogo,
  encerrarSessaoJogo,
  reconciliarSessaoParaResposta,
};
