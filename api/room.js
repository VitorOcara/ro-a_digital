const engine = require("../js/engine.js");
const rules = require("../js/room.js");

const TTL = 60 * 60 * 8;
const memory = new Map();
let forceMemory = false;

function redisEnv() {
  if (forceMemory) return null;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

function roomKey(code) {
  return `agricultura-digital:sala:${code}`;
}

function lockKey(code) {
  return `agricultura-digital:trava:${code}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function redisCommand(command) {
  const env = redisEnv();
  const response = await fetch(env.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error("Não foi possível acessar o armazenamento da sala.");
  const payload = await response.json();
  return payload.result;
}

async function storeGet(key) {
  if (!redisEnv()) {
    const value = memory.get(key);
    return value ? structuredClone(value) : null;
  }
  const result = await redisCommand(["GET", key]);
  return result ? JSON.parse(result) : null;
}

async function storeSet(key, value) {
  if (!redisEnv()) {
    memory.set(key, structuredClone(value));
    return true;
  }
  const result = await redisCommand(["SET", key, JSON.stringify(value), "EX", String(TTL)]);
  return result === "OK";
}

async function storeSetNew(key, value) {
  if (!redisEnv()) {
    if (memory.has(key)) return false;
    memory.set(key, structuredClone(value));
    return true;
  }
  const result = await redisCommand(["SET", key, JSON.stringify(value), "NX", "EX", String(TTL)]);
  return result === "OK";
}

async function storeLock(key) {
  if (!redisEnv()) {
    if (memory.has(key)) return false;
    memory.set(key, "1");
    return true;
  }
  const result = await redisCommand(["SET", key, "1", "NX", "EX", "8"]);
  return result === "OK";
}

async function storeDel(key) {
  if (!redisEnv()) {
    memory.delete(key);
    return;
  }
  await redisCommand(["DEL", key]);
}

function storageReady() {
  if (redisEnv()) return true;
  if (process.env.VERCEL && !forceMemory) return false;
  return true;
}

async function withLock(code, work) {
  const key = lockKey(code);
  let locked = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    locked = await storeLock(key);
    if (locked) break;
    await delay(50);
  }
  if (!locked) return { ok: false, code: "OCUPADO" };
  try {
    return await work();
  } finally {
    await storeDel(key);
  }
}

function answer(room, auth, extra) {
  return Object.assign({
    ok: true,
    code: room.code,
    revision: room.revision,
    role: auth.role,
    teamId: auth.teamId || null,
    presence: rules.presenceOf(room),
    state: rules.maskState(room.state, auth),
  }, extra || {});
}

async function saveRoom(room) {
  await storeSet(roomKey(room.code), room);
}

async function createRoom(body) {
  if (!storageReady()) return { ok: false, code: "SEM_REDIS" };
  const names = body.names && typeof body.names === "object" ? body.names : {};
  const created = engine.createGame({ names, mode: "room" });
  if (!created.ok) return created;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = rules.makeCode();
    const room = {
      code,
      revision: 1,
      hostToken: rules.makeToken(),
      seats: Object.fromEntries(created.state.teams.map((team) => [team.id, null])),
      state: created.state,
      updatedAt: Date.now(),
    };
    const saved = await storeSetNew(roomKey(code), room);
    if (saved) return answer(room, { role: "host" }, { token: room.hostToken });
  }
  return { ok: false, code: "OCUPADO" };
}

async function lookRoom(body) {
  const code = rules.normalizeCode(body.code);
  if (!code) return { ok: false, code: "CODIGO_INVALIDO" };
  const room = await storeGet(roomKey(code));
  if (!room) return { ok: false, code: "SALA_AUSENTE" };
  return {
    ok: true,
    code,
    phase: room.state.phase,
    season: room.state.season,
    teams: room.state.teams.map((team) => ({
      id: team.id,
      name: team.name,
      color: team.color,
      accent: team.accent,
      emblem: team.emblem,
      taken: !!(room.seats[team.id]),
    })),
  };
}

async function claimSeat(body) {
  const code = rules.normalizeCode(body.code);
  if (!code) return { ok: false, code: "CODIGO_INVALIDO" };
  return withLock(code, async () => {
    const room = await storeGet(roomKey(code));
    if (!room) return { ok: false, code: "SALA_AUSENTE" };
    const teamId = body.teamId;
    if (!Object.prototype.hasOwnProperty.call(room.seats, teamId)) return { ok: false, code: "EQUIPE" };
    const token = typeof body.token === "string" ? body.token : "";
    const auth = token ? rules.authorize(room, token) : null;
    if (auth && auth.role === "host") return { ok: false, code: "SEM_PERMISSAO" };
    if (auth && auth.role === "team" && auth.teamId !== teamId) return { ok: false, code: "CADEIRA_OCUPADA" };
    const current = room.seats[teamId];
    if (current && (!auth || auth.teamId !== teamId)) return { ok: false, code: "CADEIRA_OCUPADA" };
    const seatToken = current ? current.token : rules.makeToken();
    room.seats[teamId] = { token: seatToken, at: Date.now() };
    room.revision += 1;
    room.updatedAt = Date.now();
    await saveRoom(room);
    return answer(room, { role: "team", teamId }, { token: seatToken });
  });
}

async function readRoom(body) {
  const code = rules.normalizeCode(body.code);
  if (!code) return { ok: false, code: "CODIGO_INVALIDO" };
  const room = await storeGet(roomKey(code));
  if (!room) return { ok: false, code: "SALA_AUSENTE" };
  const auth = rules.authorize(room, body.token);
  if (!auth) return { ok: false, code: "SEM_PERMISSAO" };
  return answer(room, auth);
}

async function mutateRoom(code, token, change) {
  return withLock(code, async () => {
    const room = await storeGet(roomKey(code));
    if (!room) return { ok: false, code: "SALA_AUSENTE" };
    const auth = rules.authorize(room, token);
    if (!auth) return { ok: false, code: "SEM_PERMISSAO" };
    const changed = change(room, auth);
    if (!changed.ok) return changed;
    room.revision += 1;
    room.updatedAt = Date.now();
    await saveRoom(room);
    return answer(room, auth);
  });
}

async function applyAction(body) {
  const code = rules.normalizeCode(body.code);
  if (!code) return { ok: false, code: "CODIGO_INVALIDO" };
  const action = body.action || {};
  return mutateRoom(code, body.token, (room, auth) => {
    if (!rules.actionAllowed(auth, action)) return { ok: false, code: "SEM_PERMISSAO" };
    const result = engine.dispatch(room.state, action);
    if (!result.ok) return result;
    room.state = result.state;
    return { ok: true };
  });
}

async function resetRoom(body) {
  const code = rules.normalizeCode(body.code);
  if (!code) return { ok: false, code: "CODIGO_INVALIDO" };
  return mutateRoom(code, body.token, (room, auth) => {
    if (auth.role !== "host") return { ok: false, code: "SEM_PERMISSAO" };
    const names = Object.fromEntries(room.state.teams.map((team) => [team.id, team.name]));
    const created = engine.createGame({ names, mode: "room" });
    if (!created.ok) return created;
    room.state = created.state;
    return { ok: true };
  });
}

async function releaseSeat(body) {
  const code = rules.normalizeCode(body.code);
  if (!code) return { ok: false, code: "CODIGO_INVALIDO" };
  return mutateRoom(code, body.token, (room, auth) => {
    if (auth.role !== "host") return { ok: false, code: "SEM_PERMISSAO" };
    if (!Object.prototype.hasOwnProperty.call(room.seats, body.teamId)) return { ok: false, code: "EQUIPE" };
    room.seats[body.teamId] = null;
    return { ok: true };
  });
}

async function handle(body) {
  if (!body || typeof body !== "object") return { ok: false, code: "ARQUIVO_INVALIDO" };
  if (!storageReady() && body.op !== "look") {
    if (body.op === "create" || body.op === "claim" || body.op === "action" || body.op === "state" || body.op === "reset" || body.op === "release") {
      return { ok: false, code: "SEM_REDIS" };
    }
  }
  if (body.op === "create") return createRoom(body);
  if (body.op === "look") return lookRoom(body);
  if (body.op === "claim") return claimSeat(body);
  if (body.op === "state") return readRoom(body);
  if (body.op === "action") return applyAction(body);
  if (body.op === "reset") return resetRoom(body);
  if (body.op === "release") return releaseSeat(body);
  return { ok: false, code: "ACAO" };
}

function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body) return JSON.parse(req.body);
  return {};
}

module.exports = async function roomHandler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, code: "ACAO" });
    return;
  }
  try {
    const result = await handle(readJson(req));
    res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({ ok: false, code: "ERRO" });
  }
};

module.exports.handle = handle;
module.exports._memory = memory;
module.exports._forceMemory = (value) => {
  forceMemory = !!value;
};
