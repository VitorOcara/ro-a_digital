const engine = require("../js/engine.js");

function rng(values) {
  let index = 0;
  return () => values[index++];
}

function roll(eventIndex, cropIndex) {
  const values = [(eventIndex + 0.01) / 8];
  if (cropIndex != null) values.push((cropIndex + 0.01) / 4);
  return rng(values);
}

function play(events, plans) {
  let state = engine.createGame({ gameId: "AD-SIM", now: 1 }).state;
  events.forEach((event, season) => {
    state = engine.dispatch(state, { type: "DRAW_EVENT", random: roll(event[0], event[1]) }).state;
    state = engine.dispatch(state, { type: "OPEN_PLANNING" }).state;
    Object.entries(plans).forEach(([teamId, planner]) => {
      const plan = planner(season + 1, state.teams.find((team) => team.id === teamId), state.activeEvent);
      state = engine.dispatch(state, { type: "SET_PLAN", teamId, plan }).state;
      const confirmed = engine.dispatch(state, { type: "CONFIRM", teamId });
      if (!confirmed.ok) throw new Error(`${teamId} T${season + 1} ${confirmed.code}`);
      state = confirmed.state;
    });
    state = engine.dispatch(state, { type: "HARVEST" }).state;
    if (season < 3) state = engine.dispatch(state, { type: "NEXT_SEASON" }).state;
  });
  return engine.ranking(state).map((entry) => ({
    name: entry.name,
    total: entry.score.total,
    money: entry.money,
    lots: entry.lots,
    financial: entry.score.financial,
    production: entry.score.production,
    water: entry.score.water,
    diversity: entry.score.diversity,
    practices: entry.score.practices,
  }));
}

const events = [[0], [2, 2], [4], [6]];
const beans = () => ({ items: [{ cropId: "feijao", lots: 10 }], improvements: [] });
const tomato = (season, team) => {
  const lots = Math.min(10, Math.floor((team.waterLimit || 1000) / 144));
  return { items: lots ? [{ cropId: "tomate", lots }] : [], improvements: ["cobertura"] };
};
const diverse = (season, team, event) => {
  const improvements = ["cobertura"];
  if (event.eventId === "solo" || season === 2) improvements.push("compostagem");
  if (event.eventId === "pragas") improvements.push("controle");
  if (season === 1) improvements.push("captacao");
  return {
    items: [
      { cropId: "feijao", lots: 4 },
      { cropId: "alface", lots: 3 },
      { cropId: "milho", lots: 2 },
      { cropId: "tomate", lots: 1 },
    ],
    improvements,
  };
};
const idle = () => ({ items: [], improvements: [] });

const table = play(events, {
  "equipe-1": beans,
  "equipe-2": tomato,
  "equipe-3": diverse,
  "equipe-4": idle,
});
console.table(table);
