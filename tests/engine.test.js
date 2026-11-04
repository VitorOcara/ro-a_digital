const assert = require("assert");
const engine = require("../js/engine.js");
const data = require("../js/data.js");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error.stack || error);
  }
}

function rng(values) {
  let index = 0;
  return () => values[index++];
}

function roll(eventIndex, cropIndex) {
  const values = [(eventIndex + 0.01) / data.EVENTS.length];
  if (cropIndex != null) values.push((cropIndex + 0.01) / data.CROPS.length);
  return rng(values);
}

function start() {
  const created = engine.createGame({ mode: "single", now: 1, gameId: "AD-TESTE" });
  assert.strictEqual(created.ok, true);
  return created.state;
}

function act(state, type, extra) {
  const result = engine.dispatch(state, Object.assign({ type, now: 1 }, extra));
  assert.strictEqual(result.ok, true, `${type} -> ${result.code || "ok"}`);
  return result.state;
}

function failAct(state, type, extra) {
  return engine.dispatch(state, Object.assign({ type, now: 1 }, extra));
}

function open(state, eventIndex, cropIndex) {
  state = act(state, "DRAW_EVENT", { random: roll(eventIndex, cropIndex) });
  state = act(state, "OPEN_PLANNING");
  return state;
}

function confirmAll(state, plans) {
  data.TEAMS.forEach((team) => {
    const plan = plans && plans[team.id];
    if (plan) {
      state = act(state, "SET_PLAN", { teamId: team.id, plan });
      state = act(state, "CONFIRM", { teamId: team.id });
    } else {
      state = act(state, "CONFIRM", { teamId: team.id, empty: true });
    }
  });
  return state;
}

function team(state, id) {
  return state.teams.find((item) => item.id === id);
}

test("quatro equipes começam idênticas", () => {
  const state = start();
  const snapshot = state.teams.map((item) => [item.money, item.compost, item.rainwaterBonus, item.scoreMoney]);
  snapshot.forEach((row) => assert.deepStrictEqual(row, [5000, 20, 0, 5000]));
  const scores = engine.ranking(state).map((item) => item.score.total);
  assert.deepStrictEqual(scores, [200, 200, 200, 200]);
});

test("evento sorteado não entra em vigor antes do anúncio", () => {
  let state = start();
  state = act(state, "DRAW_EVENT", { random: roll(7) });
  assert.strictEqual(state.phase, "event_preview");
  assert.strictEqual(state.teams[0].money, 5000);
  assert.strictEqual(state.eventHistory.length, 0);
  state = act(state, "DRAW_EVENT", { random: roll(0) });
  assert.strictEqual(state.draftEvent.eventId, "seca");
  assert.strictEqual(state.teams[0].money, 5000);
  const blocked = failAct(state, "DRAW_EVENT", { random: roll(1) });
  state = act(state, "OPEN_PLANNING");
  assert.strictEqual(blocked.ok, true);
  const after = failAct(state, "DRAW_EVENT", { random: roll(1) });
  assert.strictEqual(after.ok, false);
  assert.strictEqual(after.code, "JA_INICIADA");
  assert.strictEqual(state.eventHistory[0].eventId, "seca");
  assert.strictEqual(team(state, "equipe-1").waterLimit, 700);
});

test("apoio comunitário soma R$ 400 uma única vez", () => {
  let state = open(start(), 7);
  state.teams.forEach((item) => {
    assert.strictEqual(item.money, 5400);
    assert.strictEqual(item.grant, 400);
    assert.strictEqual(item.openingMoney, 5000);
    assert.strictEqual(item.scoreMoney, 5000);
  });
  assert.ok(engine.ranking(state).every((item) => item.score.financial === 200));
});

test("não planta acima de 10 lotes nem gasta acima do caixa", () => {
  let state = open(start(), 0);
  const tooMany = failAct(state, "SET_PLAN", {
    teamId: "equipe-1",
    plan: {
      items: [
        { cropId: "alface", lots: 6 },
        { cropId: "feijao", lots: 5 },
      ],
      improvements: [],
    },
  });
  assert.strictEqual(tooMany.ok, false);
  assert.strictEqual(tooMany.code, "LOTES_DEMAIS");
  assert.deepStrictEqual(team(state, "equipe-1").pendingPlan.items, []);

  state = act(state, "SET_PLAN", {
    teamId: "equipe-1",
    plan: {
      items: [{ cropId: "tomate", lots: 10 }],
      improvements: ["compostagem", "cobertura", "captacao", "controle"],
    },
  });
  state = act(state, "CONFIRM", { teamId: "equipe-1" });
  ["equipe-2", "equipe-3", "equipe-4"].forEach((id) => {
    state = act(state, "CONFIRM", { teamId: id, empty: true });
  });
  state = act(state, "HARVEST");
  const broke = team(state, "equipe-1");
  assert.strictEqual(broke.money, 2710);
  state = act(state, "NEXT_SEASON");
  state = open(state, 5);
  state = act(state, "SET_PLAN", {
    teamId: "equipe-1",
    plan: { items: [{ cropId: "tomate", lots: 10 }], improvements: [] },
  });
  const denied = failAct(state, "CONFIRM", { teamId: "equipe-1" });
  assert.strictEqual(denied.ok, false);
  assert.strictEqual(denied.code, "DINHEIRO");
  assert.strictEqual(team(state, "equipe-1").confirmed, false);
  assert.strictEqual(team(state, "equipe-1").money, broke.money);
});

test("água segue a ordem, arredonda para baixo e cobra o plantio inteiro", () => {
  let state = open(start(), 2, 3);
  state = confirmAll(state, {
    "equipe-1": {
      items: [
        { cropId: "tomate", lots: 3 },
        { cropId: "alface", lots: 6 },
      ],
      improvements: [],
    },
  });
  state = act(state, "HARVEST");
  const result = team(state, "equipe-1").seasons[0];
  assert.deepStrictEqual(
    result.produced.map((item) => [item.cropId, item.lots, item.waterUsed]),
    [
      ["tomate", 3, 540],
      ["alface", 4, 400],
    ]
  );
  assert.deepStrictEqual(result.failed, [{ cropId: "alface", lots: 2, reason: "agua" }]);
  assert.strictEqual(result.spentMoney, 2100);
  assert.strictEqual(result.earnedMoney, 3060);
  assert.strictEqual(result.waterUsed, 940);
  assert.strictEqual(team(state, "equipe-1").money, 5000 - 2100 + 3060);
});

test("cobertura reduz 20% e muda quantos lotes cabem", () => {
  let state = open(start(), 0);
  state = confirmAll(state, {
    "equipe-1": { items: [{ cropId: "feijao", lots: 10 }], improvements: [] },
    "equipe-2": { items: [{ cropId: "feijao", lots: 10 }], improvements: ["cobertura"] },
  });
  state = act(state, "HARVEST");
  const dry = team(state, "equipe-1").seasons[0];
  const covered = team(state, "equipe-2").seasons[0];
  assert.strictEqual(dry.waterLimit, 700);
  assert.strictEqual(dry.produced[0].lots, 8);
  assert.strictEqual(dry.failed[0].lots, 2);
  assert.strictEqual(covered.produced[0].lots, 10);
  assert.strictEqual(covered.produced[0].waterPerLot, 64);
  assert.strictEqual(covered.waterUsed, 640);
  assert.strictEqual(covered.failed.length, 0);
});

test("eventos de receita, água e proteção", () => {
  function harvestOne(eventIndex, cropIndex, plan) {
    let state = open(start(), eventIndex, cropIndex);
    state = confirmAll(state, { "equipe-1": plan });
    state = act(state, "HARVEST");
    return team(state, "equipe-1");
  }

  const pest = harvestOne(2, 2, { items: [{ cropId: "feijao", lots: 10 }], improvements: [] });
  assert.strictEqual(pest.seasons[0].earnedMoney, 2720);
  const safe = harvestOne(2, 2, { items: [{ cropId: "feijao", lots: 10 }], improvements: ["controle"] });
  assert.strictEqual(safe.seasons[0].earnedMoney, 3400);
  assert.strictEqual(safe.money, 5000 - 1800 - 250 + 3400);

  const market = harvestOne(3, 2, { items: [{ cropId: "feijao", lots: 10 }], improvements: [] });
  assert.strictEqual(market.seasons[0].earnedMoney, 4080);
  const other = harvestOne(3, 0, { items: [{ cropId: "feijao", lots: 10 }], improvements: [] });
  assert.strictEqual(other.seasons[0].earnedMoney, 3400);

  const poor = harvestOne(4, null, { items: [{ cropId: "feijao", lots: 10 }], improvements: [] });
  assert.strictEqual(poor.seasons[0].earnedMoney, 2890);
  const composted = harvestOne(4, null, { items: [{ cropId: "feijao", lots: 10 }], improvements: ["compostagem"] });
  assert.strictEqual(composted.seasons[0].earnedMoney, 3400);
  assert.strictEqual(composted.compost, 15);

  const fair = harvestOne(5, null, { items: [{ cropId: "feijao", lots: 10 }], improvements: [] });
  assert.strictEqual(fair.seasons[0].earnedMoney, 3910);

  const rain = harvestOne(1, null, { items: [{ cropId: "tomate", lots: 10 }], improvements: [] });
  assert.strictEqual(rain.seasons[0].waterLimit, 1200);
  assert.strictEqual(rain.seasons[0].produced[0].lots, 6);

  const waste = harvestOne(6, null, { items: [{ cropId: "alface", lots: 10 }], improvements: [] });
  assert.strictEqual(waste.seasons[0].waterAvailable, 900);
  assert.strictEqual(waste.seasons[0].produced[0].lots, 9);
  const covered = harvestOne(6, null, { items: [{ cropId: "alface", lots: 10 }], improvements: ["cobertura"] });
  assert.strictEqual(covered.seasons[0].waterAvailable, 1000);
  assert.strictEqual(covered.seasons[0].produced[0].lots, 10);
  assert.strictEqual(covered.seasons[0].waterUsed, 800);
});

test("captação só vale na temporada seguinte e água não acumula", () => {
  let state = open(start(), 2, 0);
  state = confirmAll(state, {
    "equipe-1": { items: [{ cropId: "tomate", lots: 10 }], improvements: ["captacao"] },
    "equipe-2": { items: [], improvements: [] },
  });
  state = act(state, "HARVEST");
  assert.strictEqual(team(state, "equipe-1").seasons[0].waterLimit, 1000);
  assert.strictEqual(team(state, "equipe-1").seasons[0].produced[0].lots, 5);
  assert.strictEqual(team(state, "equipe-1").rainwaterBonus, 150);
  assert.strictEqual(team(state, "equipe-2").seasons[0].waterLeft, 1000);
  state = act(state, "NEXT_SEASON");
  state = open(state, 2, 0);
  assert.strictEqual(team(state, "equipe-1").waterLimit, 1150);
  assert.strictEqual(team(state, "equipe-2").waterLimit, 1000);
  state = confirmAll(state, {
    "equipe-1": { items: [{ cropId: "tomate", lots: 10 }], improvements: [] },
  });
  state = act(state, "HARVEST");
  assert.strictEqual(team(state, "equipe-1").seasons[1].produced[0].lots, 6);
  assert.strictEqual(team(state, "equipe-2").seasons[1].waterLimit, 1000);
});

test("captação na temporada 4 é bloqueada e composto acaba", () => {
  let state = start();
  for (let season = 1; season <= 4; season += 1) {
    state = open(state, 5);
    if (season === 4) {
      state = act(state, "SET_PLAN", {
        teamId: "equipe-1",
        plan: { items: [], improvements: ["captacao"] },
      });
      const blocked = failAct(state, "CONFIRM", { teamId: "equipe-1" });
      assert.strictEqual(blocked.code, "ULTIMA_TEMPORADA");
    }
    state = confirmAll(state, {
      "equipe-1": { items: [], improvements: ["compostagem"] },
    });
    state = act(state, "HARVEST");
    if (season < 4) state = act(state, "NEXT_SEASON");
  }
  assert.strictEqual(team(state, "equipe-1").compost, 0);
  assert.strictEqual(team(state, "equipe-1").improvementLog.length, 4);
  const again = engine.validatePlan(team(state, "equipe-1"), { items: [], improvements: ["compostagem"] }, 4);
  assert.strictEqual(again.code, "COMPOSTO");
});

test("práticas e diversidade não contam a mesma melhoria ou cultura duas vezes", () => {
  let state = start();
  const plan = {
    items: [
      { cropId: "alface", lots: 2 },
      { cropId: "tomate", lots: 2 },
      { cropId: "feijao", lots: 3 },
      { cropId: "milho", lots: 3 },
    ],
    improvements: ["cobertura", "compostagem", "controle", "captacao"],
  };
  state = open(state, 1);
  state = confirmAll(state, { "equipe-1": plan });
  state = act(state, "HARVEST");
  state = act(state, "NEXT_SEASON");
  state = open(state, 1);
  state = confirmAll(state, {
    "equipe-1": {
      items: [{ cropId: "alface", lots: 10 }],
      improvements: ["cobertura", "compostagem", "controle", "captacao"],
    },
  });
  state = act(state, "HARVEST");
  const score = engine.scoreTeam(team(state, "equipe-1"));
  assert.strictEqual(score.diversity, 100);
  assert.strictEqual(score.practices, 100);
  assert.ok(score.sustainability <= 300);
  assert.ok(score.total <= 1000);
});

test("limites de pontuação e critérios de desempate", () => {
  const rich = {
    scoreMoney: 20000,
    seasons: [
      ...Array.from({ length: 4 }, () => ({
        produced: [{ cropId: "feijao", lots: 10, waterUsed: 640 }],
      })),
      {
        produced: [
          { cropId: "alface", lots: 1, waterUsed: 80 },
          { cropId: "tomate", lots: 1, waterUsed: 144 },
          { cropId: "milho", lots: 1, waterUsed: 120 },
        ],
      },
    ],
    improvementLog: data.IMPROVEMENTS.map((item) => ({ id: item.id })),
  };
  const capped = engine.scoreTeam(rich);
  assert.strictEqual(capped.financial, 400);
  assert.strictEqual(capped.production, 300);
  assert.strictEqual(capped.water, 100);
  assert.strictEqual(capped.diversity, 100);
  assert.strictEqual(capped.practices, 100);
  assert.strictEqual(capped.sustainability, 300);
  assert.strictEqual(capped.total, 1000);

  const broke = engine.scoreTeam({ scoreMoney: 0, seasons: [], improvementLog: [] });
  assert.strictEqual(broke.total, 0);

  const state = start();
  state.teams[0].scoreMoney = 5000;
  state.teams[1].scoreMoney = 2500;
  state.teams[1].improvementLog = data.IMPROVEMENTS.map((item) => ({ id: item.id }));
  const bySustainability = engine.ranking(state);
  assert.strictEqual(bySustainability[0].teamId, "equipe-2");
  assert.strictEqual(bySustainability[0].score.total, bySustainability[1].score.total);

  state.teams[0].scoreMoney = 20000;
  state.teams[1].scoreMoney = 12000;
  state.teams[1].improvementLog = [];
  state.teams[0].seasons = [{ produced: [{ cropId: "alface", lots: 40, waterUsed: 4000 }] }];
  state.teams[1].seasons = [{ produced: [{ cropId: "alface", lots: 40, waterUsed: 4000 }] }];
  const byMoney = engine.ranking(state);
  assert.strictEqual(byMoney[0].score.total, byMoney[1].score.total);
  assert.strictEqual(byMoney[0].teamId, "equipe-1");

  state.teams[0].scoreMoney = 10000;
  state.teams[1].scoreMoney = 10000;
  state.teams[1].seasons = [{ produced: [{ cropId: "alface", lots: 48, waterUsed: 4800 }] }];
  const byLots = engine.ranking(state);
  assert.strictEqual(byLots[0].score.total, byLots[1].score.total);
  assert.strictEqual(byLots[0].teamId, "equipe-2");
  assert.ok(byLots[0].lots > byLots[1].lots);
});

test("colheita não duplica e confirmação trava o plano", () => {
  let state = open(start(), 2, 0);
  state = act(state, "SET_PLAN", {
    teamId: "equipe-1",
    plan: { items: [{ cropId: "feijao", lots: 10 }], improvements: [] },
  });
  state = act(state, "CONFIRM", { teamId: "equipe-1" });
  const early = failAct(state, "HARVEST");
  assert.strictEqual(early.code, "EQUIPES_PENDENTES");
  state = act(state, "REOPEN", { teamId: "equipe-1" });
  assert.strictEqual(team(state, "equipe-1").money, 5000);
  state = act(state, "CONFIRM", { teamId: "equipe-1" });
  assert.strictEqual(team(state, "equipe-1").money, 3200);
  const locked = failAct(state, "SET_PLAN", {
    teamId: "equipe-1",
    plan: { items: [{ cropId: "milho", lots: 1 }], improvements: [] },
  });
  assert.strictEqual(locked.code, "JA_CONFIRMADA");
  ["equipe-2", "equipe-3", "equipe-4"].forEach((id) => {
    state = act(state, "CONFIRM", { teamId: id, empty: true });
  });
  state = act(state, "HARVEST");
  const twice = failAct(state, "HARVEST");
  assert.strictEqual(twice.code, "FASE");
  assert.strictEqual(team(state, "equipe-1").money, 6600);
  assert.strictEqual(team(state, "equipe-1").seasons.length, 1);
  const score = engine.scoreTeam(team(state, "equipe-1"));
  assert.strictEqual(score.financial, 264);
  assert.strictEqual(score.production, 75);
  assert.strictEqual(score.diversity, 25);
  assert.strictEqual(score.water, 0);
  assert.strictEqual(score.total, 364);
  assert.deepStrictEqual(team(state, "equipe-1").seasons[0].score, score);
});

test("importação de decisão respeita a mesma regra do botão confirmar", () => {
  let state = open(start(), 5);
  const file = {
    kind: "agricultura-digital/decisao",
    version: 1,
    gameId: state.gameId,
    season: 1,
    teamId: "equipe-3",
    plan: { items: [{ cropId: "milho", lots: 6 }], improvements: ["cobertura"] },
  };
  state = act(state, "IMPORT_DECISION", { file });
  const imported = team(state, "equipe-3");
  assert.strictEqual(imported.confirmed, true);
  assert.strictEqual(imported.money, 5000 - 220 * 6 - 300);
  const again = failAct(state, "IMPORT_DECISION", { file });
  assert.strictEqual(again.code, "JA_CONFIRMADA");
  const otherGame = failAct(state, "IMPORT_DECISION", { file: Object.assign({}, file, { gameId: "OUTRO", teamId: "equipe-1" }) });
  assert.strictEqual(otherGame.code, "JOGO_DIVERGENTE");
});

test("projeção usa a mesma conta da colheita", () => {
  const state = open(start(), 6);
  const current = team(state, "equipe-1");
  const preview = engine.project(
    current,
    { items: [{ cropId: "alface", lots: 10 }], improvements: [] },
    1,
    state.activeEvent,
    current.waterLimit
  );
  assert.strictEqual(preview.production.produced[0].lots, 9);
  assert.strictEqual(preview.production.earned, 3240);
  assert.strictEqual(preview.projectedMoney, 5000 - 2000 + 3240);
});

console.log(`\n${passed} testes ok, ${failed} falhas`);
if (failed) process.exit(1);
