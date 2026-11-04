const crypto = require("crypto");

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TEAM_ACTIONS = new Set(["SET_PLAN", "CONFIRM", "SET_NOTE"]);

function normalizeCode(value) {
  const code = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 4) return "";
  return code;
}

function makeCode() {
  let code = "";
  for (let i = 0; i < 4; i += 1) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return code;
}

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

function sameSecret(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

function authorize(room, token) {
  if (!room || !token) return null;
  if (sameSecret(token, room.hostToken)) return { role: "host" };
  const found = Object.entries(room.seats || {}).find(([, seat]) => seat && sameSecret(token, seat.token));
  if (!found) return null;
  return { role: "team", teamId: found[0] };
}

function actionAllowed(auth, action) {
  if (!auth || !action || !action.type) return false;
  if (auth.role === "host") return action.type !== "IMPORT_DECISION";
  if (!TEAM_ACTIONS.has(action.type)) return false;
  if (action.teamId !== auth.teamId) return false;
  if (action.type === "CONFIRM" && action.empty) return false;
  return true;
}

function presenceOf(room) {
  return Object.fromEntries(Object.entries(room.seats || {}).map(([id, seat]) => [id, !!seat]));
}

function maskState(state, auth) {
  const copy = structuredClone(state);
  if (!auth || auth.role === "host") return copy;
  copy.draftEvent = null;
  const hidePlans = copy.phase === "await_event" || copy.phase === "event_preview" || copy.phase === "planning";
  copy.teams.forEach((team) => {
    if (team.id === auth.teamId) return;
    if (hidePlans) {
      team.pendingPlan = { items: [], improvements: [] };
      team.confirmedPlan = null;
      team.notes = {};
      team.money = team.scoreMoney;
      team.confirmed = false;
    }
  });
  return copy;
}

module.exports = {
  ALPHABET,
  normalizeCode,
  makeCode,
  makeToken,
  authorize,
  actionAllowed,
  presenceOf,
  maskState,
};
