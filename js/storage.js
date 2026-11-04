(function (root) {
  const MASTER = "agricultura-digital-partida";
  const STATION = "agricultura-digital-estacao";
  const VIEW = "agricultura-digital-tela";
  const ROOM = "agricultura-digital-sala";

  function read(storage, key) {
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function write(storage, key, value) {
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  }

  root.AD = root.AD || {};
  root.AD.storage = {
    loadMaster() {
      return read(localStorage, MASTER);
    },
    saveMaster(state) {
      write(localStorage, MASTER, state);
    },
    loadStation() {
      return read(localStorage, STATION);
    },
    saveStation(station) {
      write(localStorage, STATION, station);
    },
    loadView() {
      return read(sessionStorage, VIEW);
    },
    saveView(view) {
      write(sessionStorage, VIEW, view);
    },
    loadRoom() {
      return read(localStorage, ROOM);
    },
    saveRoom(session) {
      write(localStorage, ROOM, session);
    },
    clearMaster() {
      localStorage.removeItem(MASTER);
    },
    clearStation() {
      localStorage.removeItem(STATION);
    },
    clearAll() {
      localStorage.removeItem(MASTER);
      localStorage.removeItem(STATION);
      localStorage.removeItem(ROOM);
      sessionStorage.removeItem(VIEW);
    },
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
