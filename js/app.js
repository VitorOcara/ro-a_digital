(function (root) {
  const engine = () => root.AD.engine;
  const storage = () => root.AD.storage;
  const data = () => root.AD.data;

  const view = {
    screen: "home",
    teamId: null,
    play: "local",
    modal: null,
    toast: null,
    reveal: false,
    clockEnd: null,
    setup: null,
    presence: {},
    lobby: null,
    roomCode: "",
  };

  let master = null;
  let station = null;
  let room = null;
  let lastScreen = null;
  let toastTimer = null;
  let clockTimer = null;
  let pollTimer = null;
  let inflight = 0;
  let latestSeq = 0;
  let chain = Promise.resolve();

  const ROOM_MESSAGES = {
    SEM_REDIS: "A sala online precisa do Redis na Vercel. Sem isso, as equipes não entram na mesma partida.",
    SALA_AUSENTE: "Não encontrei essa sala. Confira o código de 4 caracteres.",
    CODIGO_INVALIDO: "O código da sala tem 4 caracteres.",
    SEM_PERMISSAO: "Este computador não tem mais acesso a essa sala. Entrem de novo com o código.",
    CADEIRA_OCUPADA: "Essa fazenda já está com outra equipe. Peça ao professor para liberar o lugar.",
    OCUPADO: "A sala está ocupada agora. Tente de novo em alguns segundos.",
    REDE: "Não consegui falar com a sala. Verifiquem a internet.",
    ERRO: "A sala encontrou um erro. Tente de novo.",
  };

  function setupDraft() {
    return {
      mode: "single",
      online: true,
      names: Object.fromEntries(data().TEAMS.map((team) => [team.id, team.name])),
    };
  }

  view.setup = null;

  function init() {
    view.setup = setupDraft();
    master = storage().loadMaster();
    station = storage().loadStation();
    const saved = storage().loadView();
    const savedRoom = storage().loadRoom();
    if (saved && saved.screen) {
      view.screen = saved.screen;
      view.teamId = saved.teamId || null;
      view.play = saved.play === "station" ? "station" : "local";
    }
    if (view.play === "station" && !(station && (station.package || station.results))) view.play = "local";
    if (savedRoom && savedRoom.code && savedRoom.token) {
      room = {
        code: savedRoom.code,
        role: savedRoom.role === "team" ? "team" : "host",
        token: savedRoom.token,
        teamId: savedRoom.teamId || null,
        revision: savedRoom.revision || 0,
      };
      if (room.role === "team") view.teamId = room.teamId;
      if (master && master.mode !== "room") master = null;
    }
    if (!master && !room && view.play !== "station" && ["teacher", "farm", "pick", "ranking", "results", "podium"].includes(view.screen)) {
      if (view.screen !== "teacher") view.screen = "home";
    }
    document.body.addEventListener("click", onClick);
    document.body.addEventListener("change", onChange);
    document.body.addEventListener("input", onInput);
    document.body.addEventListener("focusout", onBlur);
    document.addEventListener("keydown", onKey);
    render();
    if (room) {
      pullRoom(true).then(() => {
        if (room) startPoll();
      });
    }
  }

  function model() {
    return {
      screen: view.screen,
      state: master,
      station,
      teamId: view.teamId,
      play: view.play,
      modal: view.modal,
      toast: view.toast,
      reveal: view.reveal,
      setup: view.setup,
      presence: view.presence,
      lobby: view.lobby,
      roomCode: view.roomCode,
      room: room ? { code: room.code, role: room.role, teamId: room.teamId || null } : null,
      timerLabel: view.clockEnd ? formatClock(Math.max(0, view.clockEnd - Date.now())) : null,
    };
  }

  function render() {
    const app = document.getElementById("app");
    const scrolling = document.scrollingElement;
    const previous = scrolling ? scrolling.scrollTop : 0;
    try {
      app.innerHTML = root.AD.ui.render(model());
    } catch (error) {
      app.innerHTML = `<div class="shell"><h1>A tela encontrou um erro</h1><pre>${escapeHtml(error && error.stack ? error.stack : error)}</pre></div>`;
      return;
    }
    if (view.screen !== lastScreen) {
      lastScreen = view.screen;
      if (scrolling) scrolling.scrollTop = 0;
    } else if (scrolling) scrolling.scrollTop = previous;
    storage().saveView({ screen: view.screen, teamId: view.teamId, play: view.play });
    document.title = room && room.code ? `${room.code} · Agricultura Digital` : "Agricultura Digital";
    const focus = view.modal ? document.querySelector("#modal-ask, .modal .btn-primary") : null;
    if (focus && !view.modal.focused) {
      view.modal.focused = true;
      focus.focus();
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]));
  }

  function toast(message) {
    view.toast = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      view.toast = null;
      render();
    }, 4200);
    render();
  }

  function toastError(result) {
    if (result && ROOM_MESSAGES[result.code]) toast(ROOM_MESSAGES[result.code]);
    else if (result && result.code === "EQUIPES_PENDENTES" && result.meta && result.meta.teams) {
      toast(`Ainda falta confirmar: ${result.meta.teams.map((team) => team.name).join(", ")}.`);
    } else toast(engine().message(result && result.code, result && result.meta));
  }

  function when(result, done) {
    if (result && typeof result.then === "function") result.then(done);
    else done(result);
  }

  function commit(action, options) {
    if (room) return commitRoom(action, options);
    if (!master) {
      toast("Nenhuma partida foi iniciada neste computador.");
      return { ok: false, code: "SEM_PARTIDA" };
    }
    const result = engine().dispatch(master, action);
    if (!result.ok) {
      toastError(result);
      return result;
    }
    master = result.state;
    storage().saveMaster(master);
    if (options && options.screen) view.screen = options.screen;
    if (!options || !options.silent) render();
    return result;
  }

  function sessionRoom() {
    if (!room) return null;
    return {
      code: room.code,
      role: room.role,
      token: room.token,
      teamId: room.teamId || null,
      revision: room.revision,
    };
  }

  function enqueue(work) {
    const run = chain.then(work, work);
    chain = run.then(() => {}, () => {});
    return run;
  }

  function roomApi(body) {
    return fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    }).then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (payload && typeof payload === "object") return payload;
      return { ok: false, code: "REDE" };
    });
  }

  function rememberRoom(result) {
    room.revision = result.revision;
    master = result.state;
    view.presence = result.presence || {};
    storage().saveRoom(sessionRoom());
    storage().saveMaster(master);
  }

  function commitRoom(action, options) {
    if (!master) {
      toast("Nenhuma partida foi iniciada neste computador.");
      return Promise.resolve({ ok: false, code: "SEM_PARTIDA" });
    }
    const seq = ++latestSeq;
    const local = engine().dispatch(JSON.parse(JSON.stringify(master)), action);
    if (!local.ok) {
      toastError(local);
      return Promise.resolve(local);
    }
    if (action.type !== "DRAW_EVENT") {
      master = local.state;
      if (!options || !options.silent) render();
    }
    inflight += 1;
    return enqueue(() => roomApi({ op: "action", code: room.code, token: room.token, action })).then((result) => {
      inflight -= 1;
      if (!result.ok) {
        toastError(result);
        if (seq === latestSeq) return pullRoom(true).then(() => result);
        return result;
      }
      if (seq === latestSeq) {
        rememberRoom(result);
        if (options && options.screen) view.screen = options.screen;
        if (!options || !options.silent || options.screen) render();
      }
      return { ok: true, state: seq === latestSeq ? master : result.state };
    }).catch(() => {
      inflight -= 1;
      toast(ROOM_MESSAGES.REDE);
      return { ok: false, code: "REDE" };
    });
  }

  function isTyping() {
    const el = document.activeElement;
    if (!el) return false;
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
  }

  function startPoll() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => { pullRoom(false); }, 2000);
  }

  function pullRoom(force) {
    if (!room || inflight > 0) return Promise.resolve(null);
    return roomApi({ op: "state", code: room.code, token: room.token }).then((result) => {
      if (!result.ok) {
        if (result.code === "SALA_AUSENTE" || result.code === "SEM_PERMISSAO") dropRoom(result.code);
        else if (force) toastError(result);
        return result;
      }
      const changed = !master || result.revision !== room.revision;
      const prevPhase = master && master.phase;
      const wasReveal = view.reveal;
      rememberRoom(result);
      if (room.role === "team" && prevPhase && prevPhase !== "planning" && master.phase === "planning") view.reveal = true;
      const justOpened = view.reveal && !wasReveal;
      if ((changed || force) && !view.modal && !isTyping() && (!view.reveal || justOpened)) render();
      return result;
    }).catch(() => {
      if (force) toast(ROOM_MESSAGES.REDE);
      return null;
    });
  }

  function dropRoom(code) {
    clearInterval(pollTimer);
    pollTimer = null;
    room = null;
    storage().saveRoom(null);
    if (master && master.mode === "room") {
      master = null;
      storage().clearMaster();
    }
    view.screen = "home";
    view.teamId = null;
    view.presence = {};
    view.lobby = null;
    view.reveal = false;
    toast(code === "SALA_AUSENTE" ? ROOM_MESSAGES.SALA_AUSENTE : ROOM_MESSAGES.SEM_PERMISSAO);
  }

  function collectNames() {
    const names = {};
    for (const team of data().TEAMS) {
      const typed = String(view.setup.names[team.id] || "").trim();
      if (!typed) continue;
      if (typed.length > 40) return { ok: false, code: "NOME_INVALIDO" };
      names[team.id] = typed;
    }
    return { ok: true, names };
  }

  function typedCode() {
    const field = document.querySelector("[data-room-code]");
    const raw = field ? field.value : view.roomCode;
    return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  }

  function createRoom() {
    if (room && master) {
      view.screen = "teacher";
      toast("Esta sala já está aberta.");
      render();
      return;
    }
    const names = collectNames();
    if (!names.ok) {
      toast(engine().message(names.code));
      return;
    }
    roomApi({ op: "create", names: names.names }).then((result) => {
      if (!result.ok) {
        toastError(result);
        return;
      }
      room = { code: result.code, role: "host", token: result.token, teamId: null, revision: result.revision };
      rememberRoom(result);
      view.play = "local";
      view.teamId = null;
      view.screen = "teacher";
      view.lobby = null;
      startPoll();
      toast(`Sala ${result.code} criada. Mostre o código para as equipes.`);
      render();
    }).catch(() => toast(ROOM_MESSAGES.REDE));
  }

  function lookRoom() {
    const code = typedCode();
    view.roomCode = code;
    roomApi({ op: "look", code }).then((result) => {
      if (!result.ok) {
        view.lobby = null;
        toastError(result);
        return;
      }
      view.lobby = result;
      view.screen = "join";
      render();
    }).catch(() => toast(ROOM_MESSAGES.REDE));
  }

  function claimTeam(teamId) {
    if (!view.lobby) return;
    roomApi({ op: "claim", code: view.lobby.code, teamId }).then((result) => {
      if (!result.ok) {
        toastError(result);
        lookRoom();
        return;
      }
      room = { code: result.code, role: "team", token: result.token, teamId: result.teamId, revision: result.revision };
      rememberRoom(result);
      view.teamId = result.teamId;
      view.play = "local";
      view.screen = "farm";
      view.lobby = null;
      view.reveal = master.phase === "planning";
      startPoll();
      const team = master.teams.find((item) => item.id === result.teamId);
      toast(team ? `Vocês entraram como ${team.name}.` : "Vocês entraram na sala.");
      render();
    }).catch(() => toast(ROOM_MESSAGES.REDE));
  }

  function releaseSeat(teamId) {
    if (!room || room.role !== "host") return;
    roomApi({ op: "release", code: room.code, token: room.token, teamId }).then((result) => {
      if (!result.ok) {
        toastError(result);
        return;
      }
      rememberRoom(result);
      toast("Lugar liberado. A equipe pode entrar de novo.");
      render();
    }).catch(() => toast(ROOM_MESSAGES.REDE));
  }

  function resetRoom() {
    if (!room || room.role !== "host") return;
    roomApi({ op: "reset", code: room.code, token: room.token }).then((result) => {
      if (!result.ok) {
        toastError(result);
        return;
      }
      rememberRoom(result);
      view.screen = "teacher";
      view.reveal = false;
      toast("A sala foi reiniciada. O código continua o mesmo.");
      render();
    }).catch(() => toast(ROOM_MESSAGES.REDE));
  }

  function ask(options) {
    view.modal = {
      title: options.title,
      text: options.text,
      confirmLabel: options.confirmLabel || "Confirmar",
      danger: !!options.danger,
      ask: options.ask || null,
      focused: false,
      run: options.run,
    };
    render();
  }

  function onClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target || target.disabled) return;
    const action = target.dataset.action;
    const handler = actions[action];
    if (handler) handler(target);
  }

  function onChange(event) {
    const input = event.target;
    if (input.dataset.import) {
      const file = input.files && input.files[0];
      input.value = "";
      if (file) readJson(file, routeImport);
      return;
    }
    if (input.dataset.setupMode) {
      view.setup.mode = input.dataset.setupMode;
      render();
    }
  }

  function onInput(event) {
    const input = event.target;
    if (input.dataset.setupName) view.setup.names[input.dataset.setupName] = input.value;
    if (input.dataset.roomCode) {
      const next = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
      if (input.value !== next) input.value = next;
      view.roomCode = next;
    }
  }

  function onBlur(event) {
    const input = event.target;
    if (input.dataset.rename) {
      const teamId = input.dataset.rename;
      const name = input.value;
      setTimeout(() => {
        if (!master) return;
        const current = master.teams.find((team) => team.id === teamId);
        if (!current || current.name === name.trim()) return;
        commit({ type: "RENAME", teamId, name });
      }, 0);
    }
    if (input.dataset.note) {
      const teamId = input.dataset.note;
      const season = input.dataset.season;
      const text = input.value;
      setTimeout(() => saveNote(teamId, season, text), 0);
    }
  }

  function onKey(event) {
    if (event.key === "Escape" && view.reveal) {
      view.reveal = false;
      render();
    } else if (event.key === "Escape" && view.modal) {
      view.modal = null;
      render();
    } else if (event.key === "Enter" && view.modal && event.target.id === "modal-ask") {
      event.preventDefault();
      confirmModal();
    } else if (event.key === "Enter" && event.target.dataset && event.target.dataset.roomCode) {
      event.preventDefault();
      lookRoom();
    }
  }

  const actions = {
    goto(target) {
      view.reveal = false;
      view.screen = target.dataset.screen;
      if (room && room.role === "team") view.teamId = room.teamId;
      if (view.screen === "farm" && view.play !== "station" && !view.teamId) view.screen = "pick";
      if (view.screen === "farm" && view.play === "station" && !(station && station.teamId)) view.screen = "station";
      render();
    },
    "start-play"() {
      view.reveal = false;
      if (room && room.role === "team") {
        view.teamId = room.teamId;
        view.screen = "farm";
      } else if (room && room.role === "host") {
        view.screen = "teacher";
      } else if (master && master.mode === "single") {
        view.play = "local";
        view.screen = "pick";
      } else if (master && master.mode === "multi") {
        view.screen = "join";
      } else if (station && station.package) {
        view.play = "station";
        view.screen = station.teamId ? "farm" : "station";
      } else view.screen = "join";
      render();
    },
    "prepare-room"() {
      view.setup.online = true;
      if (room && master) {
        view.screen = "teacher";
        render();
        return;
      }
      if (master && master.mode !== "room") {
        view.screen = "teacher";
        toast("Já existe uma partida neste computador. Reinicie a oficina no painel se quiser criar uma sala.");
        render();
        return;
      }
      view.screen = "teacher";
      render();
    },
    "prepare-local"() {
      view.setup.online = false;
      if (room) {
        view.screen = room.role === "host" ? "teacher" : "farm";
        toast("Este computador já está numa sala. O código continua valendo.");
        render();
        return;
      }
      if (master) {
        view.screen = "teacher";
        render();
        return;
      }
      view.screen = "teacher";
      render();
    },
    "create-room"() { createRoom(); },
    "look-room"() { lookRoom(); },
    "claim-team"(target) { claimTeam(target.dataset.team); },
    "release-seat"(target) { releaseSeat(target.dataset.team); },
    "copy-code"() {
      if (!room) return;
      const text = room.code;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => toast("Código copiado."), () => toast(text));
      } else toast(text);
    },
    "begin-game"() { beginGame(); },
    "draw-event"() {
      when(commit({ type: "DRAW_EVENT" }), (result) => {
        if (result.ok) toast(`Sorteado: ${root.AD.ui.eventTitle(result.state.draftEvent)}. Ainda não foi anunciado.`);
      });
    },
    "open-planning"() {
      when(commit({ type: "OPEN_PLANNING" }, { silent: true }), (result) => {
        if (!result.ok) return;
        view.reveal = true;
        toast("Evento anunciado. Leiam juntos e depois abram as propriedades.");
      });
    },
    "show-reveal"() { view.reveal = true; render(); },
    "close-reveal"() { view.reveal = false; render(); },
    "pick-team"(target) {
      if (room && room.role === "team" && target.dataset.team !== room.teamId) {
        toast("Este computador já entrou como outra fazenda.");
        return;
      }
      view.play = "local";
      view.teamId = target.dataset.team;
      view.screen = "farm";
      view.reveal = false;
      render();
    },
    "station-pick"(target) {
      if (!station) return;
      station.teamId = target.dataset.team;
      storage().saveStation(station);
      render();
    },
    "open-station-farm"() {
      if (!station || !station.teamId) return;
      view.play = "station";
      view.screen = "farm";
      view.reveal = true;
      render();
    },
    "add-crop"(target) { addCrop(target.dataset.crop); },
    "sub-crop"(target) { subCrop(target.dataset.crop); },
    "move-up"(target) { moveCrop(target.dataset.crop, -1); },
    "move-down"(target) { moveCrop(target.dataset.crop, 1); },
    "toggle-improvement"(target) { toggleImprovement(target.dataset.improvement); },
    "ask-confirm"() { askConfirm(); },
    "modal-yes"() { confirmModal(); },
    "close-modal"() { view.modal = null; render(); },
    "ask-harvest"() {
      ask({
        title: "Encerrar a produção?",
        text: "A colheita será calculada agora, com as decisões confirmadas e o evento desta temporada.",
        confirmLabel: "Colher agora",
        run() {
          when(commit({ type: "HARVEST" }, { screen: "results" }), (result) => {
            if (result.ok) toast("Colheita calculada. Abram o relatório e a pergunta da temporada.");
          });
        },
      });
    },
    "ask-next"() {
      ask({
        title: "Abrir a próxima temporada?",
        text: "A água não usada se perde. O caixa, o composto e a captação continuam.",
        confirmLabel: "Avançar",
        run() {
          when(commit({ type: "NEXT_SEASON" }, { screen: "teacher" }), (result) => {
            if (result.ok) toast("Nova temporada. Sorteiem o próximo evento.");
          });
        },
      });
    },
    "ask-finish"() {
      ask({
        title: "Encerrar a partida?",
        text: "O pódio usa a pontuação desta última apuração.",
        confirmLabel: "Ver o pódio",
        run() {
          when(commit({ type: "FINISH" }, { screen: "podium" }), (result) => {
            if (result.ok) toast("Oficina encerrada.");
          });
        },
      });
    },
    "ask-early"() {
      ask({
        title: "Encerrar antes da quarta temporada?",
        text: "O ranking fica com o que já foi colhido. Dá para exportar o resultado mesmo assim.",
        confirmLabel: "Encerrar agora",
        danger: true,
        run() {
          when(commit({ type: "FINISH", early: true }, { screen: "podium" }), (result) => {
            if (result.ok) toast("Oficina encerrada antes do fim.");
          });
        },
      });
    },
    "ask-reset"() {
      if (room && room.role === "host") {
        ask({
          title: "Reiniciar a sala?",
          text: "A partida volta ao começo. O código continua o mesmo e as equipes não precisam entrar de novo.",
          confirmLabel: "Reiniciar sala",
          danger: true,
          ask: "REINICIAR",
          run() { resetRoom(); },
        });
        return;
      }
      ask({
        title: "Reiniciar a oficina neste computador?",
        text: "A partida guardada neste navegador será apagada. Os outros computadores não mudam sozinhos.",
        confirmLabel: "Apagar partida",
        danger: true,
        ask: "REINICIAR",
        run() { resetAll(); },
      });
    },
    reopen(target) {
      const team = master && master.teams.find((item) => item.id === target.dataset.team);
      ask({
        title: "Reabrir as decisões?",
        text: team ? `${team.name} poderá montar o plano de novo. O dinheiro e o composto desta confirmação voltam para o caixa.` : "A equipe poderá planejar de novo.",
        confirmLabel: "Reabrir",
        run() { commit({ type: "REOPEN", teamId: target.dataset.team }); },
      });
    },
    "ask-empty"(target) {
      const team = master && master.teams.find((item) => item.id === target.dataset.team);
      ask({
        title: "Registrar sem plantio?",
        text: team ? `${team.name} confirma a temporada sem culturas e sem melhorias.` : "Confirmar plano vazio.",
        confirmLabel: "Registrar",
        run() {
          when(commit({ type: "CONFIRM", teamId: target.dataset.team, empty: true }), () => {});
        },
      });
    },
    "unlock-station"() {
      if (!station) return;
      station.confirmed = false;
      storage().saveStation(station);
      toast("O plano local foi reaberto. Exportem de novo e peçam ao professor para reabrir a equipe antes de importar.");
    },
    "clear-station"() {
      ask({
        title: "Apagar os dados desta equipe?",
        text: "Some o pacote, o plano e o resultado guardados neste navegador.",
        confirmLabel: "Apagar",
        danger: true,
        run() {
          station = null;
          storage().clearStation();
          view.play = "local";
          view.screen = "station";
          toast("Dados deste computador apagados.");
        },
      });
    },
    "start-timer"() { startTimer(); },
    "export-backup"() { exportBackup(); },
    "export-csv"() { exportCsv(); },
    "export-results"() { exportResults(); },
    "export-package"() { exportPackage(); },
  };

  function beginGame() {
    if (room) {
      toast("Este computador já está numa sala. Reinicie a sala no painel para começar de novo.");
      return;
    }
    if (master) {
      toast("Já existe uma partida. Reinicie a oficina se quiser começar outra.");
      return;
    }
    const names = collectNames();
    if (!names.ok) {
      toast(engine().message(names.code));
      return;
    }
    const created = engine().createGame({ names: names.names, mode: view.setup.mode });
    if (!created.ok) {
      toast(engine().message(created.code));
      return;
    }
    master = created.state;
    storage().saveMaster(master);
    view.play = "local";
    view.screen = "teacher";
    toast("Partida criada. As quatro fazendas começaram iguais. Sorteiem o primeiro evento.");
  }

  function activeContext() {
    if (view.play === "station") {
      if (!station || !station.package || !station.teamId) return null;
      const team = station.package.teams.find((item) => item.id === station.teamId);
      if (!team) return null;
      const harvested = station.results && station.results.season === station.package.season && station.results.phase !== "planning";
      return {
        locked: station.confirmed || team.confirmed || harvested || station.package.phase !== "planning",
        plan: station.plan || { items: [], improvements: [] },
        season: station.package.season,
        team,
        event: station.package.event,
        save(plan) {
          station.plan = plan;
          station.confirmed = false;
          storage().saveStation(station);
          render();
        },
      };
    }
    if (!master || !view.teamId) return null;
    const team = master.teams.find((item) => item.id === view.teamId);
    if (!team) return null;
    return {
      locked: team.confirmed || master.phase !== "planning",
      plan: team.pendingPlan,
      season: master.season,
      team,
      event: master.activeEvent,
      save(plan) { commit({ type: "SET_PLAN", teamId: team.id, plan }); },
    };
  }

  function withPlan(mutator) {
    const ctx = activeContext();
    if (!ctx) {
      toast("Abra a propriedade da equipe para montar o plano.");
      return;
    }
    if (ctx.locked) {
      toast("As decisões desta temporada já estão travadas.");
      return;
    }
    const plan = JSON.parse(JSON.stringify(ctx.plan || { items: [], improvements: [] }));
    const blocked = mutator(plan, ctx);
    if (blocked) {
      toast(blocked);
      return;
    }
    const lots = plan.items.reduce((sum, item) => sum + item.lots, 0);
    if (lots > 10) {
      toast(engine().message("LOTES_DEMAIS"));
      return;
    }
    ctx.save(plan);
  }

  function addCrop(id) {
    withPlan((plan) => {
      const found = plan.items.find((item) => item.cropId === id);
      if (found) found.lots += 1;
      else plan.items.push({ cropId: id, lots: 1 });
    });
  }

  function subCrop(id) {
    withPlan((plan) => {
      const found = plan.items.find((item) => item.cropId === id);
      if (!found) return;
      found.lots -= 1;
      if (found.lots <= 0) plan.items = plan.items.filter((item) => item.cropId !== id);
    });
  }

  function moveCrop(id, direction) {
    withPlan((plan) => {
      const index = plan.items.findIndex((item) => item.cropId === id);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= plan.items.length) return;
      const item = plan.items[index];
      plan.items.splice(index, 1);
      plan.items.splice(next, 0, item);
    });
  }

  function toggleImprovement(id) {
    withPlan((plan, ctx) => {
      const selected = plan.improvements.includes(id);
      if (id === "captacao" && ctx.season >= 4 && !selected) return engine().message("ULTIMA_TEMPORADA");
      if (id === "compostagem" && ctx.team.compost < 5 && !selected) {
        return engine().message("COMPOSTO", { need: 5, have: ctx.team.compost });
      }
      if (selected) plan.improvements = plan.improvements.filter((item) => item !== id);
      else plan.improvements.push(id);
    });
  }

  function askConfirm() {
    const ctx = activeContext();
    if (!ctx || ctx.locked) {
      toast("Não há um plano aberto para confirmar.");
      return;
    }
    const check = engine().validatePlan(ctx.team, ctx.plan, ctx.season);
    if (!check.ok) {
      toast(engine().message(check.code, check.meta));
      return;
    }
    const production = engine().resolveProduction(check.plan, ctx.team.waterLimit || 0, ctx.event);
    const empty = check.lots === 0 && check.plan.improvements.length === 0;
    ask({
      title: empty ? "Confirmar sem plantar?" : "Confirmar decisões?",
      text: empty
        ? "A equipe fecha a temporada sem cultivo e sem melhoria. O caixa não muda e a produção não pontua."
        : `O plano gasta ${root.AD.ui.money(check.money)} e a previsão de receita é ${root.AD.ui.money(production.earned)}, em ${production.produced.reduce((sum, item) => sum + item.lots, 0)} lotes. Depois de confirmar, a equipe não muda esta temporada.`,
      confirmLabel: "Confirmar",
      run() { confirmCurrent(check.plan); },
    });
  }

  function confirmCurrent(plan) {
    if (view.play === "station") {
      station.plan = plan;
      station.confirmed = true;
      storage().saveStation(station);
      download(`agricultura-digital-decisao-${slug(stationTeamName())}-t${station.package.season}.json`, JSON.stringify(stationDecision(), null, 2), "application/json");
      toast("Decisão baixada. Entreguem o arquivo ao professor.");
      render();
      return;
    }
    const result = commit({ type: "CONFIRM", teamId: view.teamId });
    when(result, (done) => {
      if (done.ok) toast("Decisões confirmadas. Esperem o professor fazer a colheita.");
    });
  }

  function stationTeamName() {
    const team = station.package.teams.find((item) => item.id === station.teamId);
    return team ? team.name : "equipe";
  }

  function stationDecision() {
    return {
      kind: "agricultura-digital/decisao",
      version: 1,
      gameId: station.package.gameId,
      season: station.package.season,
      teamId: station.teamId,
      teamName: stationTeamName(),
      plan: station.plan,
      exportedAt: new Date().toISOString(),
    };
  }

  function saveNote(teamId, season, text) {
    if (view.play === "station" && station) {
      station.notes = station.notes || {};
      station.notes[String(season)] = text.trim().slice(0, 280);
      storage().saveStation(station);
      return;
    }
    if (!master) return;
    commit({ type: "SET_NOTE", teamId, season: Number(season), text }, { silent: true });
  }

  function confirmModal() {
    if (!view.modal) return;
    if (view.modal.ask) {
      const input = document.getElementById("modal-ask");
      if (!input || input.value.trim().toUpperCase() !== view.modal.ask) {
        const warn = document.getElementById("modal-warn");
        if (warn) warn.textContent = `Digite ${view.modal.ask} para confirmar.`;
        return;
      }
    }
    const run = view.modal.run;
    view.modal = null;
    run();
  }

  function resetAll() {
    clearInterval(pollTimer);
    pollTimer = null;
    room = null;
    master = null;
    station = null;
    storage().clearAll();
    view.screen = "home";
    view.teamId = null;
    view.play = "local";
    view.reveal = false;
    view.presence = {};
    view.lobby = null;
    view.setup = setupDraft();
    toast("Oficina reiniciada neste computador.");
  }

  function startTimer() {
    view.clockEnd = Date.now() + 3 * 60 * 1000;
    render();
    clearInterval(clockTimer);
    clockTimer = setInterval(() => {
      const label = document.getElementById("timer-value");
      if (!view.clockEnd) {
        clearInterval(clockTimer);
        return;
      }
      const left = Math.max(0, view.clockEnd - Date.now());
      if (label) label.textContent = formatClock(left);
      if (left <= 0) {
        view.clockEnd = null;
        clearInterval(clockTimer);
        toast("O tempo da conversa acabou.");
      }
    }, 250);
  }

  function formatClock(ms) {
    const total = Math.ceil(ms / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function slug(name) {
    return String(name || "equipe").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "equipe";
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function exportBackup() {
    if (!master) return toast("Não há partida para salvar.");
    download(`agricultura-digital-backup-${master.gameId}.json`, JSON.stringify(engine().buildBackup(master), null, 2), "application/json");
  }

  function exportResults() {
    if (master) {
      download(`agricultura-digital-resultados-t${master.season}.json`, JSON.stringify(engine().buildResults(master), null, 2), "application/json");
      return;
    }
    if (station && station.results) {
      download(`agricultura-digital-resultados-t${station.results.season}.json`, JSON.stringify(station.results, null, 2), "application/json");
      return;
    }
    toast("Ainda não há resultados para exportar.");
  }

  function exportCsv() {
    const source = master || (station && station.results ? { teams: station.results.teams } : null);
    if (!source) return toast("Ainda não há ranking para exportar.");
    download("agricultura-digital-ranking.csv", engine().csvRanking(source), "text/csv;charset=utf-8");
  }

  function exportPackage() {
    if (!master) return toast("A partida está no computador do professor.");
    if (master.phase !== "planning") return toast("Abra o planejamento antes de exportar o pacote.");
    download(`agricultura-digital-pacote-t${master.season}.json`, JSON.stringify(engine().buildSeasonPackage(master), null, 2), "application/json");
  }

  function readJson(file, done) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        done(JSON.parse(String(reader.result).replace(/^\uFEFF/, "")));
      } catch (error) {
        toast("Não consegui ler esse JSON.");
      }
    };
    reader.readAsText(file);
  }

  function usingStation() {
    return view.screen === "station" || (view.play === "station" && view.screen !== "teacher");
  }

  function routeImport(file) {
    if (!file || typeof file !== "object" || !file.kind) {
      toast("O arquivo não é um JSON da Agricultura Digital.");
      return;
    }
    if (usingStation()) importStation(file);
    else importTeacher(file);
  }

  function importTeacher(file) {
    if (room && (file.kind === "agricultura-digital/backup" || file.kind === "agricultura-digital/decisao")) {
      toast("Nesta sala as equipes entram com o código. O arquivo não substitui a partida compartilhada.");
      return;
    }
    if (file.kind === "agricultura-digital/backup") {
      if (!file.state || file.state.version !== 1 || !Array.isArray(file.state.teams) || file.state.teams.length !== 4) {
        toast(engine().message("ARQUIVO_INVALIDO"));
        return;
      }
      const apply = () => {
        master = file.state;
        storage().saveMaster(master);
        view.play = "local";
        view.screen = "teacher";
        toast("Backup restaurado neste computador.");
      };
      if (master) {
        ask({ title: "Substituir a partida atual?", text: "O backup passa a ser a partida deste computador.", confirmLabel: "Restaurar", danger: true, run: apply });
      } else apply();
      return;
    }
    if (file.kind === "agricultura-digital/decisao") {
      const result = commit({ type: "IMPORT_DECISION", file });
      when(result, (done) => {
        if (done.ok) toast(`Decisão de ${file.teamName || "equipe"} importada e confirmada.`);
      });
      return;
    }
    if (file.kind === "agricultura-digital/reflexao") {
      if (!master || file.gameId !== master.gameId) return toast(engine().message("JOGO_DIVERGENTE"));
      const result = commit({ type: "SET_NOTE", teamId: file.teamId, season: file.season, text: file.text || "" });
      when(result, (done) => {
        if (done.ok) toast("Reflexão registrada.");
      });
      return;
    }
    if (file.kind === "agricultura-digital/pacote-temporada") {
      toast("Este pacote é para o computador da equipe. Aqui no professor, importe a decisão que a equipe devolver.");
      return;
    }
    if (file.kind === "agricultura-digital/resultados") {
      toast("Este arquivo é a cópia dos resultados para as equipes. O computador do professor já tem a partida completa.");
      return;
    }
    toast(engine().message("ARQUIVO_INVALIDO"));
  }

  function importStation(file) {
    if (file.kind === "agricultura-digital/pacote-temporada") {
      if (file.version !== 1 || !Array.isArray(file.teams) || !file.event) {
        toast(engine().message("ARQUIVO_INVALIDO"));
        return;
      }
      const previous = station;
      const sameRound = previous && previous.package && previous.package.gameId === file.gameId && previous.package.season === file.season;
      const sameGame = previous && previous.package && previous.package.gameId === file.gameId;
      station = {
        package: file,
        teamId: sameGame ? previous.teamId : null,
        plan: sameRound && previous.plan ? previous.plan : { items: [], improvements: [] },
        confirmed: false,
        notes: previous && sameGame ? previous.notes || {} : {},
        results: previous && previous.results && previous.results.gameId === file.gameId ? previous.results : null,
      };
      if (sameRound && station.teamId) {
        const remote = file.teams.find((team) => team.id === station.teamId);
        station.confirmed = !!(remote && remote.confirmed);
      }
      storage().saveStation(station);
      view.play = "station";
      view.screen = "station";
      toast("Pacote importado. Escolham a propriedade de vocês.");
      return;
    }
    if (file.kind === "agricultura-digital/resultados") {
      if (!station) station = { package: null, teamId: null, plan: { items: [], improvements: [] }, confirmed: false, notes: {} };
      if (station.package && file.gameId !== station.package.gameId) return toast(engine().message("JOGO_DIVERGENTE"));
      station.results = file;
      storage().saveStation(station);
      view.play = "station";
      view.screen = "results";
      toast("Resultados importados.");
      return;
    }
    if (file.kind === "agricultura-digital/decisao") {
      toast("A decisão deve ser importada no computador do professor.");
      return;
    }
    toast("Neste computador, importem o pacote da temporada ou o arquivo de resultados.");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(typeof globalThis !== "undefined" ? globalThis : this);
