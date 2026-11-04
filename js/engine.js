(function (root, factory) {
  const data = typeof module !== "undefined" && module.exports ? require("./data.js") : root.AD.data;
  const api = factory(data);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else {
    root.AD = root.AD || {};
    root.AD.engine = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (data) {
  const L = data.LIMITS;

  function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function nowStamp(action) {
    return action && action.now ? action.now : Date.now();
  }

  function log(state, action, type, message) {
    state.actionLog.push({
      t: nowStamp(action),
      season: state.season,
      type,
      message,
    });
    if (state.actionLog.length > 300) state.actionLog.splice(0, state.actionLog.length - 300);
  }

  function fail(code, meta) {
    return meta ? { ok: false, code, meta } : { ok: false, code };
  }

  function ok(state) {
    state.updatedAt = Date.now();
    return { ok: true, state };
  }

  function teamById(state, teamId) {
    return state.teams.find((team) => team.id === teamId) || null;
  }

  function createTeam(seed) {
    return {
      id: seed.id,
      name: seed.name,
      color: seed.color,
      accent: seed.accent,
      emblem: seed.emblem,
      money: L.money,
      compost: L.compost,
      rainwaterBonus: 0,
      scoreMoney: L.money,
      harvestedLots: 0,
      pendingPlan: { items: [], improvements: [] },
      confirmed: false,
      confirmedPlan: null,
      waterLimit: null,
      openingMoney: L.money,
      grant: 0,
      seasons: [],
      improvementLog: [],
      notes: {},
    };
  }

  function createGame(options) {
    const source = options || {};
    const names = source.names || {};
    const teams = data.TEAMS.map((seed) => {
      const team = createTeam(seed);
      if (names[seed.id]) team.name = sanitizeName(names[seed.id]);
      return team;
    });
    if (teams.some((team) => !team.name)) return fail("NOME_INVALIDO");
    return {
      ok: true,
      state: {
        version: 1,
        gameId: source.gameId || makeGameId(),
        mode: source.mode === "multi" ? "multi" : source.mode === "room" ? "room" : "single",
        status: "playing",
        season: 1,
        phase: "await_event",
        draftEvent: null,
        activeEvent: null,
        eventHistory: [],
        actionLog: [
          {
            t: source.now || Date.now(),
            season: 1,
            type: "inicio",
            message: "A oficina começou. As quatro propriedades partiram com os mesmos recursos.",
          },
        ],
        teams,
        createdAt: source.now || Date.now(),
        updatedAt: source.now || Date.now(),
      },
    };
  }

  function makeGameId() {
    const date = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
    const rand = Math.floor(Math.random() * 1296).toString(36).padStart(2, "0");
    return `AD-${stamp}-${rand}`;
  }

  function sanitizeName(value) {
    const name = String(value || "").replace(/\s+/g, " ").trim();
    if (!name || name.length > 40) return "";
    return name;
  }

  function waterPerLot(crop, hasCover) {
    if (!hasCover) return crop.water;
    return (crop.water * 4) / 5;
  }

  function computeWaterLimit(team, event) {
    const base = L.water + team.rainwaterBonus;
    if (!event) return base;
    if (event.eventId === "seca") return Math.floor((base * 70) / 100);
    if (event.eventId === "chuvas") return base + L.rainLiters;
    return base;
  }

  function normalizePlan(plan) {
    const items = [];
    const seenCrops = new Set();
    for (const raw of (plan && plan.items) || []) {
      if (!raw || seenCrops.has(raw.cropId)) return fail("CULTURA_REPETIDA");
      if (!data.cropsById[raw.cropId]) return fail("CULTURA_DESCONHECIDA");
      if (!Number.isInteger(raw.lots) || raw.lots < 0 || raw.lots > L.lots) return fail("LOTES_INVALIDOS");
      seenCrops.add(raw.cropId);
      if (raw.lots > 0) items.push({ cropId: raw.cropId, lots: raw.lots });
    }
    const improvements = [];
    const seenImprovements = new Set();
    for (const id of (plan && plan.improvements) || []) {
      if (seenImprovements.has(id)) return fail("MELHORIA_REPETIDA");
      if (!data.improvementsById[id]) return fail("MELHORIA_DESCONHECIDA");
      seenImprovements.add(id);
      improvements.push(id);
    }
    const lots = items.reduce((sum, item) => sum + item.lots, 0);
    if (lots > L.lots) return fail("LOTES_DEMAIS", { lots, max: L.lots });
    const money = roundMoney(
      items.reduce((sum, item) => sum + item.lots * data.cropsById[item.cropId].cost, 0) +
        improvements.reduce((sum, id) => sum + data.improvementsById[id].cost, 0)
    );
    const compost = improvements.reduce((sum, id) => sum + data.improvementsById[id].compost, 0);
    return { ok: true, plan: { items, improvements }, lots, money, compost };
  }

  function validatePlan(team, plan, season) {
    const normalized = normalizePlan(plan);
    if (!normalized.ok) return normalized;
    if (normalized.plan.improvements.includes("captacao") && season >= L.seasons) {
      return fail("ULTIMA_TEMPORADA");
    }
    if (normalized.money > roundMoney(team.money)) {
      return fail("DINHEIRO", { need: normalized.money, have: roundMoney(team.money) });
    }
    if (normalized.compost > team.compost) {
      return fail("COMPOSTO", { need: normalized.compost, have: team.compost });
    }
    return normalized;
  }

  function applyRevenueFactors(base, cropId, event, flags) {
    let value = base;
    const factors = [];
    if (event && event.eventId === "pragas" && event.cropId === cropId) {
      if (flags.bio) factors.push({ id: "pragas-bloqueadas", label: "Controle biológico anulou o ataque", multiplier: 1 });
      else {
        value *= L.pestFactor;
        factors.push({ id: "pragas", label: "Ataque de pragas (−20%)", multiplier: L.pestFactor });
      }
    }
    if (event && event.eventId === "mercado" && event.cropId === cropId) {
      value *= L.marketFactor;
      factors.push({ id: "mercado", label: "Mercado aquecido (+20%)", multiplier: L.marketFactor });
    }
    if (event && event.eventId === "feira") {
      value *= L.fairFactor;
      factors.push({ id: "feira", label: "Feira agroecológica (+15%)", multiplier: L.fairFactor });
    }
    if (event && event.eventId === "solo") {
      if (flags.compost) factors.push({ id: "solo-bloqueado", label: "Compostagem protegeu o solo", multiplier: 1 });
      else {
        value *= L.soilFactor;
        factors.push({ id: "solo", label: "Solo empobrecido (−15%)", multiplier: L.soilFactor });
      }
    }
    return { revenue: roundMoney(value), factors };
  }

  function resolveProduction(plan, waterLimit, event) {
    const flags = {
      cover: plan.improvements.includes("cobertura"),
      bio: plan.improvements.includes("controle"),
      compost: plan.improvements.includes("compostagem"),
    };
    let available = waterLimit;
    const notes = [];
    if (event && event.eventId === "desperdicio") {
      if (flags.cover) notes.push("A cobertura do solo evitou a perda de 100 litros.");
      else {
        available = Math.max(0, available - L.wasteLiters);
        notes.push("Sem cobertura do solo, a propriedade perdeu 100 litros antes do plantio produzir.");
      }
    }
    if (event && event.eventId === "pragas" && flags.bio) {
      notes.push("O controle biológico protegeu a cultura atacada nesta temporada.");
    }
    if (event && event.eventId === "solo" && flags.compost) {
      notes.push("A compostagem impediu a perda de receita por solo empobrecido.");
    }
    if (event && event.eventId === "solo" && !flags.compost) {
      notes.push("Sem compostagem nesta temporada, a receita de toda a colheita caiu 15%.");
    }
    let waterLeft = available;
    const produced = [];
    const failed = [];
    for (const item of plan.items) {
      const crop = data.cropsById[item.cropId];
      const perLot = waterPerLot(crop, flags.cover);
      const can = perLot > 0 ? Math.floor(waterLeft / perLot) : 0;
      const lots = Math.min(item.lots, Math.max(0, can));
      const lost = item.lots - lots;
      const waterUsed = lots * perLot;
      waterLeft -= waterUsed;
      if (lots > 0) {
        const baseRevenue = lots * crop.revenue;
        const priced = applyRevenueFactors(baseRevenue, item.cropId, event, flags);
        produced.push({
          cropId: item.cropId,
          lots,
          waterPerLot: perLot,
          waterUsed,
          baseRevenue,
          revenue: priced.revenue,
          factors: priced.factors,
        });
      }
      if (lost > 0) failed.push({ cropId: item.cropId, lots: lost, reason: "agua" });
    }
    if (failed.length) {
      notes.push("Parte dos lotes não produziu porque a água acabou. A prioridade seguiu a ordem escolhida pela equipe.");
    }
    if (flags.cover) notes.push("A cobertura reduziu 20% o consumo de água de cada lote produzido.");
    const earned = roundMoney(produced.reduce((sum, item) => sum + item.revenue, 0));
    const waterUsed = produced.reduce((sum, item) => sum + item.waterUsed, 0);
    return {
      produced,
      failed,
      waterLimit,
      waterAvailable: available,
      waterUsed,
      waterLeft: available - waterUsed,
      earned,
      notes,
      flags,
    };
  }

  function distinctCrops(team) {
    const crops = new Set();
    team.seasons.forEach((season) => {
      season.produced.forEach((item) => {
        if (item.lots > 0) crops.add(item.cropId);
      });
    });
    return crops.size;
  }

  function distinctImprovements(team) {
    return new Set(team.improvementLog.map((entry) => entry.id)).size;
  }

  function totalHarvestedLots(team) {
    return team.seasons.reduce(
      (sum, season) => sum + season.produced.reduce((inner, item) => inner + item.lots, 0),
      0
    );
  }

  function waterEconomyScore(team) {
    let potential = 0;
    let actual = 0;
    team.seasons.forEach((season) => {
      season.produced.forEach((item) => {
        const crop = data.cropsById[item.cropId];
        potential += item.lots * crop.water;
        actual += item.waterUsed;
      });
    });
    if (potential <= 0) return 0;
    const savedRatio = (potential - actual) / potential;
    return roundMoney(clamp((savedRatio / L.waterScoreFullSavings) * L.waterMax, 0, L.waterMax));
  }

  function scoreTeam(team, money) {
    const balance = money == null ? team.scoreMoney : money;
    const financial = roundMoney(clamp(balance * L.financialFactor, 0, L.financialMax));
    const lots = totalHarvestedLots(team);
    const production = roundMoney(clamp(lots * L.productionPerLot, 0, L.productionMax));
    const water = waterEconomyScore(team);
    const diversity = clamp(distinctCrops(team) * L.diversityPerCrop, 0, L.diversityMax);
    const practices = clamp(distinctImprovements(team) * L.practicePerImprovement, 0, L.practiceMax);
    const sustainability = roundMoney(water + diversity + practices);
    const total = roundMoney(financial + production + sustainability);
    return { financial, production, water, diversity, practices, sustainability, total, lots };
  }

  function compareRanking(a, b) {
    if (b.score.total !== a.score.total) return b.score.total - a.score.total;
    if (b.score.sustainability !== a.score.sustainability) return b.score.sustainability - a.score.sustainability;
    if (b.money !== a.money) return b.money - a.money;
    if (b.lots !== a.lots) return b.lots - a.lots;
    return a.order - b.order;
  }

  function ranking(state) {
    return state.teams
      .map((team, order) => ({
        order,
        teamId: team.id,
        name: team.name,
        color: team.color,
        emblem: team.emblem,
        money: team.scoreMoney,
        cash: team.money,
        lots: totalHarvestedLots(team),
        crops: distinctCrops(team),
        practices: distinctImprovements(team),
        score: scoreTeam(team),
      }))
      .sort(compareRanking)
      .map((entry, index) => ({ ...entry, position: index + 1 }));
  }

  function sameStanding(a, b) {
    return a.score.total === b.score.total && a.score.sustainability === b.score.sustainability && a.money === b.money && a.lots === b.lots;
  }

  function explainWinner(table) {
    if (!table.length) return "";
    const winner = table[0];
    const tied = table.filter((entry) => sameStanding(entry, winner));
    if (tied.length > 1) {
      const names = tied.map((entry) => entry.name).join(", ");
      return `${names} terminaram empatadas nos pontos, na sustentabilidade, no saldo e nos lotes colhidos. O primeiro lugar, neste caso, foi compartilhado: nenhuma propriedade ficou à frente quando os critérios de desempate acabaram. Sustentabilidade econômica é a propriedade seguir de pé, com alimento, solo, água e renda.`;
    }
    const second = table[1];
    const parts = [];
    parts.push(`${winner.name} ficou em primeiro lugar, com ${formatPoints(winner.score.total)} pontos.`);
    const reasons = [];
    if (winner.score.production >= 225) reasons.push("colheu a maior parte dos lotes ao longo da oficina");
    else if (winner.score.production >= 120) reasons.push("manteve comida saindo da horta");
    if (winner.score.diversity >= 75) reasons.push("diversificou as culturas e ficou menos exposta a um único problema");
    else if (winner.score.diversity === 25) reasons.push("concentrou a produção em uma cultura só, o que limita a sustentabilidade");
    if (winner.score.water >= 80) reasons.push("economizou água com a cobertura do solo");
    if (winner.score.practices >= 75) reasons.push("registrou várias práticas agroecológicas");
    if (winner.score.financial >= 320) reasons.push("administrou o caixa até o fim da safra");
    if (reasons.length) parts.push(`O desempenho veio principalmente porque a equipe ${reasons.join("; ")}.`);
    if (second && winner.score.total === second.score.total) {
      parts.push(
        `A pontuação total empatou com ${second.name}. O desempate olhou, nesta ordem, para sustentabilidade, saldo financeiro e lotes colhidos.`
      );
    } else if (second && winner.score.financial < second.score.financial && winner.score.sustainability > second.score.sustainability) {
      parts.push(
        `${second.name} fechou com mais dinheiro, mas ${winner.name} cuidou melhor da sustentabilidade. Na agricultura familiar, continuar produzindo pesa junto com o lucro.`
      );
    } else if (second) {
      parts.push(`${second.name} ficou logo atrás, com ${formatPoints(second.score.total)} pontos.`);
    }
    parts.push(
      "Sustentabilidade econômica é a propriedade seguir de pé: com alimento, solo, água e renda, não apenas com o maior caixa de uma temporada."
    );
    return parts.join(" ");
  }

  function formatPoints(value) {
    return value.toLocaleString("pt-BR", { minimumFractionDigits: Number.isInteger(value) ? 0 : 1, maximumFractionDigits: 2 });
  }

  function project(team, plan, season, event, waterLimit) {
    const check = validatePlan(team, plan, season);
    if (!check.ok) return check;
    const production = resolveProduction(check.plan, waterLimit == null ? team.waterLimit || 0 : waterLimit, event);
    const preview = clone(team);
    preview.money = roundMoney(preview.money - check.money + production.earned);
    preview.scoreMoney = preview.money;
    preview.seasons = preview.seasons.concat([
      {
        produced: production.produced,
        waterUsed: production.waterUsed,
      },
    ]);
    check.plan.improvements.forEach((id) => {
      if (!preview.improvementLog.some((entry) => entry.id === id)) preview.improvementLog.push({ id, season });
    });
    return {
      ok: true,
      plan: check.plan,
      lots: check.lots,
      cost: check.money,
      compost: check.compost,
      production,
      projectedScore: scoreTeam(preview),
      projectedMoney: preview.money,
    };
  }

  function drawEvent(state, action) {
    if (state.status !== "playing") return fail("PARTIDA_ENCERRADA");
    if (state.phase !== "await_event" && state.phase !== "event_preview") return fail("JA_INICIADA");
    const random = typeof action.random === "function" ? action.random : Math.random;
    const eventIndex = Math.min(data.EVENTS.length - 1, Math.floor(random() * data.EVENTS.length));
    const event = data.EVENTS[eventIndex];
    let cropId = null;
    if (event.needsCrop) {
      const cropIndex = Math.min(data.CROPS.length - 1, Math.floor(random() * data.CROPS.length));
      cropId = data.CROPS[cropIndex].id;
    }
    state.draftEvent = { eventId: event.id, cropId };
    state.phase = "event_preview";
    const cropName = cropId ? data.cropsById[cropId].name : null;
    log(
      state,
      action,
      "sorteio",
      cropName ? `Evento sorteado: ${event.name} (${cropName}). Ainda não foi anunciado.` : `Evento sorteado: ${event.name}. Ainda não foi anunciado.`
    );
    return ok(state);
  }

  function openPlanning(state, action) {
    if (state.status !== "playing") return fail("PARTIDA_ENCERRADA");
    if (state.phase !== "event_preview" || !state.draftEvent) return fail("SEM_EVENTO");
    state.activeEvent = clone(state.draftEvent);
    state.phase = "planning";
    state.eventHistory.push({
      season: state.season,
      eventId: state.activeEvent.eventId,
      cropId: state.activeEvent.cropId,
      announcedAt: nowStamp(action),
    });
    state.teams.forEach((team) => {
      team.openingMoney = team.money;
      team.grant = 0;
      team.waterLimit = computeWaterLimit(team, state.activeEvent);
      team.pendingPlan = { items: [], improvements: [] };
      team.confirmed = false;
      team.confirmedPlan = null;
      if (state.activeEvent.eventId === "apoio") {
        team.money = roundMoney(team.money + L.supportMoney);
        team.grant = L.supportMoney;
      }
    });
    const event = data.eventsById[state.activeEvent.eventId];
    log(state, action, "anuncio", `Temporada ${state.season} aberta com o evento ${event.name}.`);
    return ok(state);
  }

  function setPlan(state, action) {
    if (state.phase !== "planning") return fail("FASE");
    const team = teamById(state, action.teamId);
    if (!team) return fail("EQUIPE");
    if (team.confirmed) return fail("JA_CONFIRMADA");
    const normalized = normalizePlan(action.plan || { items: [], improvements: [] });
    if (!normalized.ok) return normalized;
    team.pendingPlan = normalized.plan;
    return ok(state);
  }

  function confirmTeam(state, team, action, empty) {
    if (team.confirmed) return fail("JA_CONFIRMADA");
    const source = empty ? { items: [], improvements: [] } : team.pendingPlan;
    const check = validatePlan(team, source, state.season);
    if (!check.ok) return { ...check, meta: { ...(check.meta || {}), teamId: team.id, name: team.name } };
    team.money = roundMoney(team.money - check.money);
    team.compost -= check.compost;
    team.confirmed = true;
    team.confirmedPlan = {
      items: check.plan.items,
      improvements: check.plan.improvements,
      spentMoney: check.money,
      spentCompost: check.compost,
    };
    team.pendingPlan = clone(check.plan);
    log(state, action, "confirmacao", `${team.name} confirmou as decisões da temporada ${state.season}.`);
    return { ok: true };
  }

  function confirm(state, action) {
    if (state.phase !== "planning") return fail("FASE");
    const team = teamById(state, action.teamId);
    if (!team) return fail("EQUIPE");
    const result = confirmTeam(state, team, action, !!action.empty);
    if (!result.ok) return result;
    return ok(state);
  }

  function reopen(state, action) {
    if (state.phase !== "planning") return fail("FASE");
    const team = teamById(state, action.teamId);
    if (!team) return fail("EQUIPE");
    if (!team.confirmed || !team.confirmedPlan) return fail("NAO_CONFIRMADA");
    team.money = roundMoney(team.money + team.confirmedPlan.spentMoney);
    team.compost += team.confirmedPlan.spentCompost;
    team.confirmed = false;
    team.confirmedPlan = null;
    log(state, action, "reabertura", `O professor reabriu as decisões de ${team.name}. O caixa e o composto dessa confirmação foram devolvidos.`);
    return ok(state);
  }

  function harvest(state, action) {
    if (state.phase !== "planning" || !state.activeEvent) return fail("FASE");
    const pending = state.teams.filter((team) => !team.confirmed);
    if (pending.length) {
      return fail("EQUIPES_PENDENTES", { teams: pending.map((team) => ({ id: team.id, name: team.name })) });
    }
    state.teams.forEach((team) => {
      const plan = team.confirmedPlan;
      const production = resolveProduction(plan, team.waterLimit, state.activeEvent);
      team.money = roundMoney(team.money + production.earned);
      plan.improvements.forEach((id) => {
        team.improvementLog.push({ id, season: state.season, cost: data.improvementsById[id].cost });
        if (id === "captacao") team.rainwaterBonus += L.captureLiters;
      });
      const harvested = production.produced.reduce((sum, item) => sum + item.lots, 0);
      team.harvestedLots += harvested;
      team.scoreMoney = team.money;
      const record = {
        season: state.season,
        eventId: state.activeEvent.eventId,
        cropId: state.activeEvent.cropId,
        openingMoney: team.openingMoney,
        grant: team.grant,
        spentMoney: plan.spentMoney,
        spentCompost: plan.spentCompost,
        earnedMoney: production.earned,
        closingMoney: team.money,
        waterLimit: production.waterLimit,
        waterAvailable: production.waterAvailable,
        waterUsed: production.waterUsed,
        waterLeft: production.waterLeft,
        produced: production.produced,
        failed: production.failed,
        improvements: plan.improvements.slice(),
        items: plan.items.slice(),
        notes: production.notes,
        score: null,
      };
      team.seasons.push(record);
      record.score = scoreTeam(team);
      team.confirmed = false;
      team.confirmedPlan = null;
      team.pendingPlan = { items: [], improvements: [] };
      team.waterLimit = null;
    });
    state.phase = "results";
    log(state, action, "colheita", `A colheita da temporada ${state.season} foi apurada.`);
    return ok(state);
  }

  function nextSeason(state, action) {
    if (state.phase !== "results") return fail("FASE");
    if (state.season >= L.seasons) return fail("TEMPORADA_MAX");
    state.season += 1;
    state.phase = "await_event";
    state.draftEvent = null;
    state.activeEvent = null;
    state.teams.forEach((team) => {
      team.pendingPlan = { items: [], improvements: [] };
      team.confirmed = false;
      team.confirmedPlan = null;
      team.waterLimit = null;
      team.grant = 0;
      team.openingMoney = team.money;
    });
    log(state, action, "temporada", `A temporada ${state.season} está pronta para o sorteio do evento.`);
    return ok(state);
  }

  function finish(state, action) {
    if (state.phase !== "results" && state.phase !== "finished") return fail("FASE");
    if (state.phase === "finished") return ok(state);
    if (state.season < L.seasons && !action.early) return fail("FALTA_TEMPORADA");
    state.status = "finished";
    state.phase = "finished";
    log(
      state,
      action,
      "fim",
      action.early ? "O professor encerrou a oficina antes da quarta temporada." : "A oficina foi encerrada após a quarta temporada."
    );
    return ok(state);
  }

  function rename(state, action) {
    const team = teamById(state, action.teamId);
    if (!team) return fail("EQUIPE");
    const name = sanitizeName(action.name);
    if (!name) return fail("NOME_INVALIDO");
    team.name = name;
    log(state, action, "nome", `A propriedade passou a se chamar ${name}.`);
    return ok(state);
  }

  function setNote(state, action) {
    const team = teamById(state, action.teamId);
    if (!team) return fail("EQUIPE");
    const text = String(action.text || "").trim().slice(0, 280);
    team.notes[String(action.season || state.season)] = text;
    return ok(state);
  }

  function importDecision(state, action) {
    if (state.phase !== "planning") return fail("FASE");
    const file = action.file || {};
    if (file.kind !== "agricultura-digital/decisao" || file.version !== 1) return fail("ARQUIVO_INVALIDO");
    if (file.gameId !== state.gameId) return fail("JOGO_DIVERGENTE");
    if (file.season !== state.season) return fail("TEMPORADA_DIVERGENTE");
    const team = teamById(state, file.teamId);
    if (!team) return fail("EQUIPE");
    if (team.confirmed) return fail("JA_CONFIRMADA", { name: team.name });
    team.pendingPlan = file.plan || { items: [], improvements: [] };
    const confirmed = confirmTeam(state, team, action, false);
    if (!confirmed.ok) return confirmed;
    return ok(state);
  }

  function dispatch(state, action) {
    if (!state) return fail("SEM_PARTIDA");
    const next = clone(state);
    const type = action && action.type;
    if (type === "DRAW_EVENT") return drawEvent(next, action);
    if (type === "OPEN_PLANNING") return openPlanning(next, action);
    if (type === "SET_PLAN") return setPlan(next, action);
    if (type === "CONFIRM") return confirm(next, action);
    if (type === "REOPEN") return reopen(next, action);
    if (type === "HARVEST") return harvest(next, action);
    if (type === "NEXT_SEASON") return nextSeason(next, action);
    if (type === "FINISH") return finish(next, action);
    if (type === "RENAME") return rename(next, action);
    if (type === "SET_NOTE") return setNote(next, action);
    if (type === "IMPORT_DECISION") return importDecision(next, action);
    return fail("ACAO");
  }

  function buildSeasonPackage(state) {
    return {
      kind: "agricultura-digital/pacote-temporada",
      version: 1,
      gameId: state.gameId,
      season: state.season,
      phase: state.phase,
      event: state.activeEvent,
      exportedAt: new Date().toISOString(),
      teams: state.teams.map((team) => ({
        id: team.id,
        name: team.name,
        color: team.color,
        accent: team.accent,
        emblem: team.emblem,
        money: team.money,
        compost: team.compost,
        rainwaterBonus: team.rainwaterBonus,
        waterLimit: team.waterLimit,
        scoreMoney: team.scoreMoney,
        seasons: team.seasons,
        improvementLog: team.improvementLog,
        confirmed: team.confirmed,
      })),
    };
  }

  function buildDecision(state, teamId) {
    const team = teamById(state, teamId);
    return {
      kind: "agricultura-digital/decisao",
      version: 1,
      gameId: state.gameId,
      season: state.season,
      teamId,
      teamName: team ? team.name : "",
      plan: team ? clone(team.pendingPlan) : { items: [], improvements: [] },
      exportedAt: new Date().toISOString(),
    };
  }

  function buildResults(state) {
    return {
      kind: "agricultura-digital/resultados",
      version: 1,
      gameId: state.gameId,
      season: state.season,
      phase: state.phase,
      status: state.status,
      eventHistory: state.eventHistory,
      ranking: ranking(state),
      winnerText: explainWinner(ranking(state)),
      teams: state.teams.map((team) => ({
        id: team.id,
        name: team.name,
        color: team.color,
        accent: team.accent,
        emblem: team.emblem,
        money: team.money,
        compost: team.compost,
        scoreMoney: team.scoreMoney,
        rainwaterBonus: team.rainwaterBonus,
        seasons: team.seasons,
        improvementLog: team.improvementLog,
        notes: team.notes,
      })),
      exportedAt: new Date().toISOString(),
    };
  }

  function buildBackup(state) {
    return {
      kind: "agricultura-digital/backup",
      version: 1,
      state,
      exportedAt: new Date().toISOString(),
    };
  }

  function csvRanking(state) {
    const header = [
      "posicao",
      "propriedade",
      "pontuacao_total",
      "financeiro",
      "producao",
      "economia_agua",
      "diversidade",
      "praticas",
      "sustentabilidade",
      "saldo_apuracao",
      "caixa_atual",
      "lotes_colhidos",
    ];
    const lines = ranking(state).map((entry) =>
      [
        entry.position,
        `"${entry.name.replace(/"/g, '""')}"`,
        csvNumber(entry.score.total),
        csvNumber(entry.score.financial),
        csvNumber(entry.score.production),
        csvNumber(entry.score.water),
        csvNumber(entry.score.diversity),
        csvNumber(entry.score.practices),
        csvNumber(entry.score.sustainability),
        csvNumber(entry.money),
        csvNumber(entry.cash),
        entry.lots,
      ].join(";")
    );
    return `\uFEFF${header.join(";")}\n${lines.join("\n")}\n`;
  }

  function csvNumber(value) {
    return String(value).replace(".", ",");
  }

  function message(code, meta) {
    const money = (value) =>
      (value == null ? 0 : value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const map = {
      FASE: "Essa ação ainda não pode ser feita nesta etapa.",
      SEM_EVENTO: "Sorteie um evento antes de abrir a temporada.",
      JA_INICIADA: "O evento só pode ser trocado antes de abrir o planejamento.",
      LOTES_DEMAIS: "A propriedade tem 10 lotes. O plano passou desse limite.",
      LOTES_INVALIDOS: "A quantidade de lotes precisa ser um número inteiro entre 0 e 10.",
      CULTURA_REPETIDA: "Cada cultura deve aparecer uma vez só. Aumente a quantidade na linha que já existe.",
      CULTURA_DESCONHECIDA: "Essa cultura não faz parte do jogo.",
      MELHORIA_REPETIDA: "Cada melhoria pode ser comprada uma vez por temporada.",
      MELHORIA_DESCONHECIDA: "Essa melhoria não faz parte do jogo.",
      DINHEIRO: `O plano custa ${money(meta && meta.need)} e o caixa tem ${money(meta && meta.have)}.`,
      COMPOSTO: `A compostagem pede ${meta && meta.need} unidades de composto e a equipe tem ${meta && meta.have}.`,
      ULTIMA_TEMPORADA: "A captação só vale nas temporadas seguintes. Na temporada 4 ela não teria efeito, então a compra fica bloqueada.",
      JA_CONFIRMADA: meta && meta.name ? `${meta.name} já confirmou esta temporada.` : "As decisões desta temporada já foram confirmadas.",
      NAO_CONFIRMADA: "Esta equipe ainda não confirmou.",
      EQUIPES_PENDENTES: "Ainda há equipes sem confirmação. A colheita só acontece quando as quatro fecharem o plano.",
      TEMPORADA_MAX: "A quarta temporada já é a última. Encerre a partida para ver o pódio.",
      FALTA_TEMPORADA: "Ainda há temporadas pela frente. Avance a oficina ou encerre antes do fim se o tempo acabar.",
      PARTIDA_ENCERRADA: "Esta partida já foi encerrada.",
      JOGO_DIVERGENTE: "Este arquivo é de outra partida.",
      TEMPORADA_DIVERGENTE: "Este arquivo é de outra temporada.",
      ARQUIVO_INVALIDO: "O arquivo não é um JSON reconhecido pela Agricultura Digital.",
      NOME_INVALIDO: "O nome da propriedade precisa ter entre 1 e 40 caracteres.",
      EQUIPE: "Equipe não encontrada.",
      SEM_PARTIDA: "Nenhuma partida foi iniciada neste computador.",
      ACAO: "Ação desconhecida.",
    };
    return map[code] || "Não foi possível concluir a ação.";
  }

  function teacherStep(state) {
    if (!state) return { title: "Comece a oficina", detail: "Cadastre as quatro propriedades e inicie a partida." };
    if (state.phase === "finished") return { title: "Oficina encerrada", detail: "Mostre o pódio, comente os aprendizados e exporte os resultados." };
    if (state.phase === "await_event") return { title: "Sortear o evento", detail: `Temporada ${state.season} de 4. O evento ainda não foi sorteado.` };
    if (state.phase === "event_preview") {
      return {
        title: "Anunciar o evento",
        detail: "Veja o evento com calma. Se o sorteio foi um engano, sorteie outro antes de abrir o planejamento.",
      };
    }
    if (state.phase === "planning") {
      const confirmed = state.teams.filter((team) => team.confirmed).length;
      return {
        title: "Planejamento das equipes",
        detail: `${confirmed} de 4 equipes confirmaram. Quando as quatro fecharem, encerre a produção e faça a colheita.`,
      };
    }
    if (state.phase === "results") {
      return {
        title: "Conversa da temporada",
        detail:
          state.season < 4
            ? "Leia o relatório, faça a pergunta reflexiva e só então avance para a próxima temporada."
            : "Leia o relatório da última safra e encerre a partida para abrir o pódio.",
      };
    }
    return { title: "Partida em andamento", detail: "" };
  }

  return {
    createGame,
    dispatch,
    normalizePlan,
    validatePlan,
    resolveProduction,
    computeWaterLimit,
    waterPerLot,
    scoreTeam,
    ranking,
    explainWinner,
    project,
    buildSeasonPackage,
    buildDecision,
    buildResults,
    buildBackup,
    csvRanking,
    message,
    teacherStep,
    roundMoney,
    distinctCrops,
    distinctImprovements,
  };
});
