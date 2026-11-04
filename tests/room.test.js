const assert = require("assert");
const api = require("../api/room.js");
const rules = require("../js/room.js");

api._forceMemory(true);

const TEAMS = ["equipe-1", "equipe-2", "equipe-3", "equipe-4"];

async function check(name, fn) {
  api._memory.clear();
  try {
    await fn();
    console.log("ok", name);
  } catch (error) {
    console.error("FAIL", name);
    console.error(error);
    process.exitCode = 1;
  }
}

async function main() {
  await check("código e máscara", async () => {
    assert.strictEqual(rules.normalizeCode(" ab2-3 "), "AB23");
    assert.strictEqual(rules.normalizeCode("ABC"), "");
    const created = await api.handle({ op: "create", names: {} });
    const masked = rules.maskState(created.state, { role: "team", teamId: "equipe-2" });
    assert.strictEqual(masked.draftEvent, null);
    assert.notStrictEqual(masked, created.state);
  });

  await check("sala, cadeiras, plano, colheita e reinício", async () => {
    const created = await api.handle({ op: "create", names: { "equipe-1": "Horta Norte" } });
    assert.strictEqual(created.ok, true);
    assert.strictEqual(created.state.mode, "room");
    assert.strictEqual(created.state.phase, "await_event");
    assert.strictEqual(created.state.teams[0].name, "Horta Norte");
    assert.strictEqual(created.code.length, 4);
    const code = created.code;
    const host = created.token;

    const look = await api.handle({ op: "look", code: code.toLowerCase() });
    assert.strictEqual(look.ok, true);
    assert.ok(look.teams.every((team) => team.taken === false));
    assert.strictEqual((await api.handle({ op: "look", code: "ABC" })).code, "CODIGO_INVALIDO");
    assert.strictEqual((await api.handle({ op: "look", code: "ZZZZ" })).code, "SALA_AUSENTE");

    const seat = await api.handle({ op: "claim", code, teamId: "equipe-1" });
    assert.strictEqual(seat.ok, true);
    assert.strictEqual(seat.role, "team");
    assert.strictEqual(seat.teamId, "equipe-1");
    assert.ok(seat.token);
    const occupied = await api.handle({ op: "claim", code, teamId: "equipe-1" });
    assert.strictEqual(occupied.code, "CADEIRA_OCUPADA");
    const again = await api.handle({ op: "claim", code, teamId: "equipe-1", token: seat.token });
    assert.strictEqual(again.ok, true);
    assert.strictEqual(again.token, seat.token);

    const afterClaim = await api.handle({ op: "look", code });
    assert.strictEqual(afterClaim.teams.find((team) => team.id === "equipe-1").taken, true);
    assert.strictEqual((await api.handle({ op: "action", code, token: seat.token, action: { type: "HARVEST" } })).code, "SEM_PERMISSAO");

    const drawn = await api.handle({ op: "action", code, token: host, action: { type: "DRAW_EVENT" } });
    assert.strictEqual(drawn.ok, true);
    assert.strictEqual(drawn.state.phase, "event_preview");
    assert.ok(drawn.state.draftEvent);
    const opened = await api.handle({ op: "action", code, token: host, action: { type: "OPEN_PLANNING" } });
    assert.strictEqual(opened.ok, true);
    assert.strictEqual(opened.state.phase, "planning");

    const planted = await api.handle({
      op: "action",
      code,
      token: seat.token,
      action: { type: "SET_PLAN", teamId: "equipe-1", plan: { items: [{ cropId: "feijao", lots: 2 }], improvements: ["cobertura"] } },
    });
    assert.strictEqual(planted.ok, true);
    assert.strictEqual(planted.state.teams.find((team) => team.id === "equipe-1").pendingPlan.items[0].lots, 2);
    assert.strictEqual((await api.handle({
      op: "action",
      code,
      token: seat.token,
      action: { type: "SET_PLAN", teamId: "equipe-2", plan: { items: [], improvements: [] } },
    })).code, "SEM_PERMISSAO");
    assert.strictEqual((await api.handle({
      op: "action",
      code,
      token: seat.token,
      action: { type: "CONFIRM", teamId: "equipe-1", empty: true },
    })).code, "SEM_PERMISSAO");

    const other = await api.handle({ op: "claim", code, teamId: "equipe-2" });
    assert.strictEqual(other.ok, true);
    const hidden = other.state.teams.find((team) => team.id === "equipe-1");
    assert.deepStrictEqual(hidden.pendingPlan.items, []);
    assert.strictEqual(hidden.confirmedPlan, null);
    assert.strictEqual(other.state.draftEvent, null);
    const hostView = await api.handle({ op: "state", code, token: host });
    const visible = hostView.state.teams.find((team) => team.id === "equipe-1");
    assert.strictEqual(visible.pendingPlan.items[0].cropId, "feijao");
    assert.deepStrictEqual(visible.pendingPlan.improvements, ["cobertura"]);

    const own = await api.handle({
      op: "action",
      code,
      token: seat.token,
      action: { type: "CONFIRM", teamId: "equipe-1" },
    });
    assert.strictEqual(own.ok, true);
    assert.strictEqual(own.state.teams.find((team) => team.id === "equipe-1").confirmed, true);
    for (const teamId of TEAMS.slice(1)) {
      const empty = await api.handle({
        op: "action",
        code,
        token: host,
        action: { type: "CONFIRM", teamId, empty: true },
      });
      assert.strictEqual(empty.ok, true, teamId);
    }
    assert.strictEqual((await api.handle({ op: "action", code, token: seat.token, action: { type: "HARVEST" } })).code, "SEM_PERMISSAO");
    const harvest = await api.handle({ op: "action", code, token: host, action: { type: "HARVEST" } });
    assert.strictEqual(harvest.ok, true);
    assert.strictEqual(harvest.state.phase, "results");
    const report = harvest.state.teams.find((team) => team.id === "equipe-1").seasons[0];
    const harvestedLots = report.produced.reduce((sum, item) => sum + item.lots, 0);
    assert.ok(harvestedLots >= 1);
    assert.ok(report.earnedMoney > 0);

    const reset = await api.handle({ op: "reset", code, token: host });
    assert.strictEqual(reset.ok, true);
    assert.strictEqual(reset.code, code);
    assert.strictEqual(reset.state.phase, "await_event");
    assert.strictEqual(reset.state.teams[0].name, "Horta Norte");
    const still = await api.handle({ op: "state", code, token: seat.token });
    assert.strictEqual(still.ok, true);
    assert.strictEqual(still.state.season, 1);
    assert.strictEqual(still.presence["equipe-1"], true);

    const released = await api.handle({ op: "release", code, token: host, teamId: "equipe-1" });
    assert.strictEqual(released.ok, true);
    assert.strictEqual(released.presence["equipe-1"], false);
    assert.strictEqual((await api.handle({ op: "state", code, token: seat.token })).code, "SEM_PERMISSAO");
    assert.strictEqual((await api.handle({ op: "state", code, token: other.token })).ok, true);
  });

  await check("sem redis na Vercel a sala não abre", async () => {
    const keys = ["VERCEL", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"];
    const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.VERCEL = "1";
    keys.slice(1).forEach((key) => { delete process.env[key]; });
    api._forceMemory(false);
    try {
      const result = await api.handle({ op: "create", names: {} });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.code, "SEM_REDIS");
    } finally {
      api._forceMemory(true);
      keys.forEach((key) => {
        if (saved[key] == null) delete process.env[key];
        else process.env[key] = saved[key];
      });
    }
  });

  if (process.exitCode) process.exit(process.exitCode);
}

main();
