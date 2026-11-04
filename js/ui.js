(function (root) {
  const icon = (name) => root.AD.icon(name);
  const cropArt = (id) => root.AD.cropArt(id);

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function money(value) {
    return (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function points(value) {
    const number = Number(value) || 0;
    return number.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }

  function liters(value) {
    return `${(Number(value) || 0).toLocaleString("pt-BR")} L`;
  }

  function data() { return root.AD.data; }
  function engine() { return root.AD.engine; }

  function crop(id) { return data().cropsById[id]; }
  function improvement(id) { return data().improvementsById[id]; }
  function eventInfo(id) { return data().eventsById[id]; }

  const EVENT_ICON = {
    seca: "sun",
    chuvas: "rain",
    pragas: "bug",
    mercado: "store",
    solo: "mountain",
    feira: "users",
    desperdicio: "droplet",
    apoio: "heart",
  };

  const OF = { alface: "da alface", tomate: "do tomate", feijao: "do feijão", milho: "do milho" };

  function eventTitle(instance) {
    if (!instance) return "";
    const info = eventInfo(instance.eventId);
    if (instance.eventId === "pragas" && instance.cropId) return `Ataque de pragas ${OF[instance.cropId]}`;
    if (instance.eventId === "mercado" && instance.cropId) return `Mercado aquecido ${OF[instance.cropId]}`;
    return info ? info.name : "Evento";
  }

  function eventDetail(instance) {
    const info = eventInfo(instance.eventId);
    if (!info) return "";
    if (instance.eventId === "pragas") {
      return `A receita ${OF[instance.cropId]} cai 20% nos lotes colhidos. O controle biológico desta temporada anula a perda.`;
    }
    if (instance.eventId === "mercado") {
      return `A receita ${OF[instance.cropId]} sobe 20% nos lotes colhidos.`;
    }
    return info.summary;
  }

  function theme(season) {
    return data().SEASON_THEMES[season - 1] || data().SEASON_THEMES[0];
  }

  function btn(label, action, extra) {
    const attrs = extra || "";
    return `<button type="button" class="btn" data-action="${action}" ${attrs}>${label}</button>`;
  }

  function shell(model, content) {
    return `<a class="skip" href="#conteudo">Ir para o conteúdo</a>
      <div class="shell">
        ${topbar(model)}
        <main id="conteudo">${content}</main>
        <p class="footer-note">Agricultura Digital · a sala online sincroniza professor e equipes · neste computador a partida também pode ficar só no navegador</p>
      </div>
      ${model.reveal ? reveal(model) : ""}
      ${model.modal ? modal(model.modal) : ""}
      <div class="toast" role="status">${model.toast ? esc(model.toast) : ""}</div>`;
  }

  function topbar(model) {
    const playing = model.state || (model.station && model.station.package);
    return `<header class="topbar">
      <button type="button" class="brand" data-action="goto" data-screen="home">
        <span class="brand-mark">${icon("sprout")}</span>
        <span><strong>Agricultura Digital</strong><span>Informática e Agroecologia</span></span>
      </button>
      <nav class="nav">
        ${navButton("Início", "home")}
        ${playing ? navButton("Propriedade", "farm") : ""}
        ${playing ? navButton("Ranking", "ranking") : ""}
        ${navButton("Professor", "teacher")}
        ${navButton("Como jogar", "how")}
      </nav>
    </header>`;
  }

  function navButton(label, screen) {
    return `<button type="button" class="btn btn-small btn-ghost" data-action="goto" data-screen="${screen}">${label}</button>`;
  }

  function progress(season, phase) {
    const pips = [1, 2, 3, 4].map((number) => {
      const cls = phase === "finished" || number < season ? "is-done" : number === season ? "is-now" : "";
      return `<div class="season-pip ${cls}">Temporada ${number}${number === season && phase !== "finished" ? " · " + esc(theme(number).title) : ""}</div>`;
    }).join("");
    const steps = [
      ["evento", "Evento", phase === "await_event" || phase === "event_preview"],
      ["plano", "Planejamento", phase === "planning"],
      ["colheita", "Colheita", phase === "results" || phase === "finished"],
    ];
    const order = ["await_event", "event_preview", "planning", "results", "finished"];
    const current = order.indexOf(phase);
    const phases = [
      ["Evento", current > 1, current <= 1],
      ["Planejamento", current > 2, current === 2],
      ["Colheita e conversa", phase === "finished", phase === "results"],
    ].map(([label, done, now]) => `<span class="phase ${now ? "is-now" : ""} ${done ? "is-done" : ""}">${label}</span>`).join("");
    return `<div class="progress-wrap"><div class="seasons">${pips}</div><div class="phases">${phases}</div><p class="muted">Temporada ${Math.min(season, 4)} de 4. O jogo só avança quando o professor confirma.</p></div>`;
  }

  function home(model) {
    const state = model.state;
    const status = state ? homeStatus(model) : `<p class="muted">Nenhuma partida neste computador. O professor cria a sala e as equipes entram com o código.</p>`;
    return `<section class="hero">
      <div>
        <p class="eyebrow">Simulação para o Ensino Médio</p>
        <h1>Agricultura Digital</h1>
        <p class="lede">Quatro equipes cuidam de uma propriedade rural. Em quatro temporadas, decidem o que plantar, como usar a água e quais práticas agroecológicas cabem no caixa.</p>
        <div class="hero-actions">
          <button type="button" class="btn btn-primary" data-action="prepare-room">${icon("flag")} Criar sala</button>
          <button type="button" class="btn btn-secondary" data-action="goto" data-screen="join">${icon("sprout")} Entrar na sala</button>
          <button type="button" class="btn" data-action="prepare-local">Jogar neste computador</button>
          <button type="button" class="btn" data-action="goto" data-screen="how">${icon("book")} Como jogar</button>
        </div>
        ${model.room ? `<div class="callout"><strong>Sala ${esc(model.room.code)}</strong><p>${model.room.role === "host" ? "Mostre este código para as equipes." : "Este computador já entrou na sala."}</p>
          <button type="button" class="btn btn-small btn-primary" data-action="goto" data-screen="${model.room.role === "host" ? "teacher" : "farm"}">${model.room.role === "host" ? "Abrir painel" : "Abrir propriedade"}</button></div>` : ""}
        ${status}
      </div>
      ${scene()}
    </section>`;
  }

  function homeStatus(model) {
    const state = model.state;
    const step = engine().teacherStep(state);
    const teams = state.mode === "single" ? `<div class="row-actions">${state.teams.map((team) =>
      `<button type="button" class="btn btn-small" data-action="pick-team" data-team="${team.id}" style="--team:${team.color}">${esc(team.name)}</button>`
    ).join("")}</div>` : "";
    const where = state.mode === "room" ? "sala online" : state.mode === "multi" ? "quatro computadores" : "neste computador";
    return `<div class="callout"><strong>Partida em andamento · ${esc(state.gameId)}</strong><p>${esc(where)}. ${esc(step.title)}. ${esc(step.detail)}</p>${teams}</div>`;
  }

  function scene() {
    return `<div class="scene" aria-hidden="true">
      <div class="sun"></div><div class="cloud cloud-a"></div><div class="cloud cloud-b"></div>
      <div class="hill"></div><div class="ground"></div>
      <div class="barn"><div class="barn-roof"></div><div class="door"></div></div>
      <div class="tree"></div>
      <div class="crops-pix"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
    </div>`;
  }

  function how() {
    const crops = data().CROPS.map((item) =>
      `<tr><td>${esc(item.name)}</td><td>${money(item.cost)}</td><td>${liters(item.water)}</td><td>${money(item.revenue)}</td></tr>`
    ).join("");
    return `<h1>Como jogar</h1>
      <p class="lede">A oficina dura cerca de duas horas. Vinte estudantes, quatro equipes, um professor conduzindo as etapas. Na sala online, cada grupo usa o próprio computador.</p>
      <details open><summary>Sala online, professor e equipes</summary>
        <ol>
          <li>Abra o jogo publicado na internet. A sala precisa de conexão.</li>
          <li>No computador do professor, clique em <strong>Criar sala</strong>, confira os nomes e confirme. Aparece um código de 4 caracteres.</li>
          <li>Cada equipe clica em <strong>Entrar na sala</strong>, digita o código e escolhe a fazenda livre do grupo.</li>
          <li>O professor sorteia o evento, lê a revelação em voz alta e só então abre o planejamento. O evento chega sozinho nos computadores das equipes.</li>
          <li>Cada equipe monta o plano na própria fazenda e confirma. As outras equipes não veem esse plano antes da colheita.</li>
          <li>Quando as quatro confirmarem, o professor encerra a produção. A colheita aparece para todo mundo.</li>
          <li>Leiam o relatório, conversem sobre a pergunta e o professor abre a próxima temporada. Na quarta, encerrem a partida e abram o pódio.</li>
        </ol>
        <p>Se uma equipe entrou na fazenda errada, o professor usa <strong>Liberar lugar</strong>. Reiniciar a sala mantém o mesmo código.</p>
      </details>
      <details><summary>Um computador só, sem internet</summary>
        <p>Dá para jogar abrindo o arquivo neste computador. A partida fica no navegador e não atravessa para outra máquina.</p>
        <ol>
          <li>Clique em <strong>Jogar neste computador</strong>, confira os nomes e comece a partida.</li>
          <li>Sorteie o evento, leia a revelação em voz alta e só então abra o planejamento.</li>
          <li>Passe o computador para cada equipe. Cada grupo abre a própria fazenda, monta o plano e confirma.</li>
          <li>Quando as quatro confirmarem, o professor encerra a produção.</li>
        </ol>
      </details>
      <details><summary>Recursos, culturas e melhorias</summary>
        <p>Todas começam iguais: <strong>${money(5000)}</strong>, 10 lotes, 1.000 litros por temporada e 20 unidades de composto. A água não usada não acumula. O composto só diminui quando alguém faz compostagem.</p>
        <div class="table-wrap"><table><thead><tr><th>Cultura</th><th>Custo por lote</th><th>Água</th><th>Receita</th></tr></thead><tbody>${crops}</tbody></table></div>
        <p>Dá para misturar culturas. A água atende primeiro o que estiver no topo da lista. Lote sem água não produz, mas o custo do plantio já foi pago.</p>
        <ul>
          <li><strong>Compostagem</strong> — ${money(300)} e 5 de composto. Protege contra solo empobrecido nesta temporada.</li>
          <li><strong>Cobertura do solo</strong> — ${money(300)}. Reduz 20% a água de cada lote nesta temporada e evita o desperdício de 100 litros.</li>
          <li><strong>Captação de chuva</strong> — ${money(600)}. Soma 150 litros nas temporadas seguintes, não nesta. Na temporada 4 a compra fica bloqueada.</li>
          <li><strong>Controle biológico</strong> — ${money(250)}. Anula o ataque de pragas desta temporada.</li>
        </ul>
      </details>
      <details><summary>Pontuação, até 1.000 pontos</summary>
        <ul>
          <li><strong>Financeiro, 400.</strong> Saldo na apuração × 0,04. Abaixo de zero vira 0. Acima de ${money(10000)} continua 400.</li>
          <li><strong>Produção, 300.</strong> Cada lote colhido vale 7,5. Quarenta lotes, o máximo em quatro temporadas, fecham 300.</li>
          <li><strong>Água, 100.</strong> Compara o consumo real com o consumo sem cobertura. Economizar 20% em toda a colheita vale 100.</li>
          <li><strong>Diversidade, 100.</strong> Cada cultura diferente colhida ao longo do jogo vale 25.</li>
          <li><strong>Práticas, 100.</strong> Cada melhoria diferente, comprada ao menos uma vez, vale 25. Repetir a mesma não soma de novo.</li>
        </ul>
        <p>O ranking é recalculado no fim de cada temporada. Empate: maior sustentabilidade, depois maior saldo, depois mais lotes colhidos.</p>
        <p>O feijão rende bem e gasta pouca água. O tomate paga mais por lote, mas a água não deixa encher a horta. Ficar só na cultura mais eficiente perde pontos de diversidade. O jogo premia quem produz comida, cuida da água e não depende de uma aposta só.</p>
      </details>
      <details><summary>Salvar, exportar, atualizar e reiniciar</summary>
        <p>Atualizar a página não tira o professor nem a equipe da sala: o navegador guarda a entrada neste computador. A partida em si fica na sala, compartilhada.</p>
        <p>No painel do professor há exportação da partida inteira em JSON, do ranking em CSV e dos resultados. O CSV abre no Excel com separador de ponto e vírgula.</p>
        <p>Para recomeçar a oficina online, use <strong>Reiniciar a oficina</strong> e confirme com a palavra REINICIAR. O código da sala continua o mesmo.</p>
      </details>
      ${lessonGrid()}`;
  }

  function lessonGrid() {
    return `<h2>O que a simulação quer mostrar</h2><div class="lesson-grid">${data().LESSONS.map((lesson) =>
      `<article class="card lesson"><h3>${esc(lesson.title)}</h3><p>${esc(lesson.text)}</p></article>`
    ).join("")}</div>`;
  }

  function join(model) {
    const lobby = model.lobby;
    const seats = lobby && lobby.teams ? `<h2>Sala ${esc(lobby.code)}</h2><p>Escolham a propriedade livre do grupo.</p><div class="team-grid">${lobby.teams.map((team) =>
      `<button type="button" class="team-card" data-action="claim-team" data-team="${team.id}" ${team.taken ? "disabled" : ""} style="border-top: 8px solid ${team.color}">
        <h2>${icon(team.emblem)} ${esc(team.name)}</h2>
        <p>${team.taken ? "Ocupada" : "Livre"}</p>
      </button>`
    ).join("")}</div>` : "";
    return `<h1>Entrar na sala</h1>
      <p>Digite o código de 4 caracteres que o professor mostrou.</p>
      <div class="card">
        <label>Código da sala<br>
          <input class="join-code" type="text" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" data-room-code value="${esc(model.roomCode || "")}">
        </label>
        <div class="row-actions"><button type="button" class="btn btn-primary" data-action="look-room">Ver fazendas</button></div>
      </div>
      ${seats}
      <p class="muted">Se a fazenda estiver ocupada e for um engano, o professor libera o lugar no painel.</p>`;
  }

  function teacher(model) {
    if (model.room && model.room.role === "team") {
      return `<h1>Painel do professor</h1>
        <p>Quem conduz a sala é o computador do professor. A equipe de vocês joga na propriedade.</p>
        <button type="button" class="btn btn-primary" data-action="goto" data-screen="farm">Ir para a propriedade</button>`;
    }
    if (!model.state) return teacherSetup(model);
    return teacherDash(model);
  }

  function teacherSetup(model) {
    const fields = data().TEAMS.map((team) => `<label>${esc(team.name)} padrão<br>
      <input type="text" maxlength="40" data-setup-name="${team.id}" value="${esc(model.setup.names[team.id] || team.name)}"></label>`).join("");
    const online = !model.setup || model.setup.online !== false;
    if (online) {
      return `<h1>Criar a sala</h1>
        <p>A sala fica na internet. As equipes entram com um código de 4 caracteres, cada uma no próprio computador.</p>
        <div class="card setup-grid">
          <h2>Nomes das equipes</h2>
          ${fields}
          <button type="button" class="btn btn-primary" data-action="create-room">${icon("flag")} Criar sala</button>
        </div>`;
    }
    return `<h1>Jogar neste computador</h1>
      <p>As quatro propriedades partem com os mesmos recursos. A partida fica neste navegador.</p>
      <div class="card setup-grid">
        <h2>Nomes das equipes</h2>
        ${fields}
        <label class="choice"><input type="radio" name="mode" data-setup-mode="single" ${model.setup.mode !== "multi" ? "checked" : ""}> <span><strong>Um computador.</strong> As equipes se revezam nesta máquina. O professor também usa este painel.</span></label>
        <label class="choice"><input type="radio" name="mode" data-setup-mode="multi" ${model.setup.mode === "multi" ? "checked" : ""}> <span><strong>Quatro computadores, por arquivo.</strong> O professor exporta um JSON e importa a decisão de cada equipe. Não precisa de rede.</span></label>
        <button type="button" class="btn btn-primary" data-action="begin-game">${icon("flag")} Começar neste computador</button>
      </div>`;
  }

  function roomBanner(model) {
    if (!model.room || model.room.role !== "host") return "";
    return `<div class="callout room-banner"><p class="muted">Código da sala</p><p class="room-code">${esc(model.room.code)}</p>
      <p>As equipes abrem o jogo, escolhem <strong>Entrar na sala</strong> e digitam este código.</p>
      <button type="button" class="btn btn-small" data-action="copy-code">Copiar código</button></div>`;
  }

  function teacherDash(model) {
    const state = model.state;
    const step = engine().teacherStep(state);
    const confirmed = state.teams.filter((team) => team.confirmed).length;
    const draft = state.draftEvent;
    const active = state.activeEvent;
    const where = state.mode === "room" ? "sala online" : state.mode === "multi" ? "quatro computadores" : "um computador";
    return `${roomBanner(model)}
      ${progress(state.season, state.phase)}
      <div class="callout"><strong>${esc(step.title)}</strong><p>${esc(step.detail)}</p>${teacherActions(state, confirmed)}</div>
      <p class="muted">Partida ${esc(state.gameId)} · ${where}</p>
      ${draft && state.phase === "event_preview" ? eventCard(draft, false) : ""}
      ${active && state.phase === "planning" ? eventCard(active, true) : ""}
      <div class="split"><h2>Propriedades</h2><span class="badge ${confirmed === 4 ? "badge-ok" : "badge-wait"}">${confirmed} de 4 confirmaram</span></div>
      <div class="team-grid">${state.teams.map((team) => teamCard(state, team, model)).join("")}</div>
      ${multiTools(state)}
      <h2>Ranking da última apuração</h2>
      ${rankingTable(engine().ranking(state), state.teams.some((team) => team.money !== team.scoreMoney))}
      <details><summary>Histórico de eventos anunciados</summary>${eventHistory(state)}</details>
      <details><summary>Histórico de ações</summary><div class="history">${state.actionLog.slice().reverse().map((entry) =>
        `<p><strong>T${entry.season}.</strong> ${esc(entry.message)}</p>`).join("") || "<p>Nenhuma ação ainda.</p>"}</div></details>
      <div class="row-actions no-print">
        <button type="button" class="btn btn-small" data-action="export-backup">${icon("download")} Backup da partida</button>
        <button type="button" class="btn btn-small" data-action="export-results">${icon("download")} Resultados JSON</button>
        <button type="button" class="btn btn-small" data-action="export-csv">${icon("download")} Ranking CSV</button>
        <label class="btn btn-small file-btn">${icon("upload")} Importar arquivo<input type="file" accept="application/json,.json" data-import="auto"></label>
        <button type="button" class="btn btn-small btn-danger" data-action="ask-reset">Reiniciar a oficina</button>
      </div>`;
  }

  function teacherActions(state, confirmed) {
    if (state.phase === "await_event") {
      return `<button type="button" class="btn btn-primary" data-action="draw-event">${icon("sun")} Sortear evento</button>`;
    }
    if (state.phase === "event_preview") {
      return `<div class="row-actions"><button type="button" class="btn btn-primary" data-action="open-planning">${icon("flag")} Anunciar e abrir o planejamento</button>
        <button type="button" class="btn" data-action="draw-event">${icon("refresh")} Sortear outro evento</button></div>
        <p class="muted">Trocar o evento só é possível agora, antes de abrir a temporada.</p>`;
    }
    if (state.phase === "planning") {
      return `<div class="row-actions"><button type="button" class="btn btn-primary" data-action="ask-harvest" ${confirmed === 4 ? "" : "disabled"}>${icon("sprout")} Encerrar produção e colher</button>
        <button type="button" class="btn" data-action="show-reveal">Revelar evento de novo</button></div>`;
    }
    if (state.phase === "results") {
      const next = state.season < 4
        ? `<button type="button" class="btn btn-primary" data-action="ask-next">Abrir a próxima temporada</button>
           <button type="button" class="btn btn-danger" data-action="ask-early">Encerrar a oficina antes do fim</button>`
        : `<button type="button" class="btn btn-primary" data-action="ask-finish">${icon("trophy")} Encerrar partida e ver o pódio</button>`;
      return `<div class="row-actions">${next}<button type="button" class="btn" data-action="goto" data-screen="results">Abrir relatório da temporada</button></div>`;
    }
    return `<button type="button" class="btn btn-primary" data-action="goto" data-screen="podium">${icon("trophy")} Ver pódio</button>`;
  }

  function teamCard(state, team, model) {
    const score = engine().scoreTeam(team);
    const plan = team.confirmed && team.confirmedPlan ? team.confirmedPlan : team.pendingPlan;
    const summary = plan && plan.items && plan.items.length
      ? plan.items.map((item) => `${crop(item.cropId).name} ×${item.lots}`).join(", ")
      : "Sem plantio neste plano";
    const improvements = plan && plan.improvements && plan.improvements.length
      ? plan.improvements.map((id) => improvement(id).name).join(", ")
      : "Nenhuma melhoria";
    const actions = state.phase === "planning" ? `<div class="row-actions no-print">
        <button type="button" class="btn btn-small" data-action="pick-team" data-team="${team.id}">Abrir fazenda</button>
        ${team.confirmed
          ? `<button type="button" class="btn btn-small" data-action="reopen" data-team="${team.id}">Reabrir decisões</button>`
          : `<button type="button" class="btn btn-small" data-action="ask-empty" data-team="${team.id}">Registrar sem plantio</button>`}
      </div>` : `<button type="button" class="btn btn-small no-print" data-action="pick-team" data-team="${team.id}">Ver fazenda</button>`;
    const online = model && model.room && model.presence && model.presence[team.id];
    const presence = model && model.room && model.room.role === "host"
      ? `<span class="badge ${online ? "badge-ok" : "badge-wait"}">${online ? "Na sala" : "Ainda não entrou"}</span>`
      : "";
    const release = online && model.room.role === "host"
      ? `<button type="button" class="btn btn-small" data-action="release-seat" data-team="${team.id}">Liberar lugar</button>`
      : "";
    return `<article class="team-card" style="--team:${team.color}; border-top: 8px solid ${team.color}">
      <div class="split"><h3>${esc(team.name)}</h3><span class="badge ${team.confirmed ? "badge-ok" : "badge-wait"}">${team.confirmed ? "Confirmada" : "Em aberto"}</span>${presence}</div>
      <label class="muted">Nome da propriedade<input type="text" maxlength="40" data-rename="${team.id}" value="${esc(team.name)}"></label>
      <p>${money(team.money)} no caixa · composto ${team.compost} · água ${team.waterLimit == null ? "ainda não definida" : liters(team.waterLimit)}</p>
      <p><strong>Plano:</strong> ${esc(summary)}</p>
      <p><strong>Melhorias:</strong> ${esc(improvements)}</p>
      <p class="muted">Apuração: ${points(score.total)} pts · saldo da apuração ${money(team.scoreMoney)}</p>
      ${actions}
      ${release}
    </article>`;
  }

  function multiTools(state) {
    if (state.mode !== "multi") return "";
    const ready = state.phase === "planning";
    return `<div class="callout"><strong>Troca de arquivos desta temporada</strong>
      <p>${ready ? "Exportem o pacote, esperem as decisões e importem um JSON por vez." : "O pacote da temporada fica disponível depois que o planejamento abrir."}</p>
      <div class="row-actions no-print">
        <button type="button" class="btn btn-secondary" data-action="export-package" ${ready ? "" : "disabled"}>${icon("download")} Exportar pacote da temporada</button>
        <label class="btn file-btn">${icon("upload")} Importar decisão<input type="file" accept="application/json,.json" data-import="auto"></label>
      </div></div>`;
  }

  function eventHistory(state) {
    if (!state.eventHistory.length) return "<p>Nenhum evento foi anunciado ainda.</p>";
    return state.eventHistory.map((entry) => {
      const info = eventInfo(entry.eventId);
      return `<p><strong>Temporada ${entry.season}:</strong> ${esc(eventTitle(entry))}. ${esc(info ? info.summary : "")}</p>`;
    }).join("");
  }

  function eventCard(instance, announced) {
    const info = eventInfo(instance.eventId);
    return `<article class="event-card tone-${info.tone}">
      <div class="big-icon">${icon(EVENT_ICON[instance.eventId] || "sun")}</div>
      <p class="tag">${announced ? "Evento da temporada" : "Sorteado, ainda não anunciado"}</p>
      <h2>${esc(eventTitle(instance))}</h2>
      <p>${esc(eventDetail(instance))}</p>
      <p><strong>Na prática:</strong> ${esc(info.consequence)}</p>
      ${announced ? "" : `<p class="muted">As equipes ainda não estão vendo este evento.</p>`}
    </article>`;
  }

  function reveal(model) {
    const instance = revealInstance(model);
    if (!instance) return "";
    const info = eventInfo(instance.eventId);
    return `<div class="reveal-back"><article class="reveal-card tone-${info.tone}" role="dialog" aria-modal="true">
      <div class="big-icon">${icon(EVENT_ICON[instance.eventId] || "sun")}</div>
      <p class="tag">Evento da temporada ${revealSeason(model)}</p>
      <h2>${esc(eventTitle(instance))}</h2>
      <p>${esc(eventDetail(instance))}</p>
      <p><strong>Consequência:</strong> ${esc(info.consequence)}</p>
      <p>${esc(info.education)}</p>
      <button type="button" class="btn btn-primary" data-action="close-reveal">Continuar</button>
    </article></div>`;
  }

  function revealInstance(model) {
    if (model.play === "station" && model.station && model.station.package) return model.station.package.event;
    if (!model.state) return null;
    return model.state.phase === "event_preview" ? model.state.draftEvent : model.state.activeEvent;
  }

  function revealSeason(model) {
    if (model.play === "station" && model.station && model.station.package) return model.station.package.season;
    return model.state ? model.state.season : 1;
  }

  function pick(model) {
    if (!model.state) return `<div class="callout"><strong>A partida ainda não começou</strong><p>Peça ao professor para abrir o painel e começar a oficina.</p>
      <button type="button" class="btn btn-primary" data-action="goto" data-screen="teacher">Ir ao painel do professor</button></div>`;
    const intro = model.state.mode === "room"
      ? "Este computador é o do professor. Dá para abrir uma fazenda daqui se alguma equipe precisar de ajuda."
      : model.state.mode === "multi"
      ? "Este computador é o do professor. Dá para abrir uma fazenda daqui se alguma equipe ficar sem máquina."
      : "Escolham a propriedade do seu grupo. Quando terminarem, devolvam o computador para a próxima equipe.";
    return `<h1>Qual é a sua fazenda?</h1><p>${intro}</p><div class="team-grid">${model.state.teams.map((team) =>
      `<button type="button" class="team-card" data-action="pick-team" data-team="${team.id}" style="border-top: 8px solid ${team.color}">
        <h2>${icon(team.emblem)} ${esc(team.name)}</h2>
        <p>${money(team.money)} · ${team.confirmed ? "decisões confirmadas" : "plano em aberto"}</p>
      </button>`).join("")}</div>`;
  }

  function farm(model) {
    const ctx = farmContext(model);
    if (!ctx) {
      if (model.play === "station") return station(model);
      return pick(model);
    }
    const team = ctx.team;
    const score = engine().scoreTeam(team);
    const latest = team.seasons && team.seasons.length ? team.seasons[team.seasons.length - 1] : null;
    const planning = ctx.phase === "planning" && !ctx.locked;
    return `<div class="team-banner" style="--team:${team.color}; --team-soft:${team.accent}">
        <div><p class="eyebrow">${model.room ? "Sala " + esc(model.room.code) : ctx.mode === "station" ? "Computador da equipe" : "Propriedade"}</p><h1>${icon(team.emblem)} ${esc(team.name)}</h1></div>
        <span class="badge ${ctx.locked && ctx.phase === "planning" ? "badge-ok" : "badge-wait"}">${farmStatus(ctx)}</span>
      </div>
      ${model.state && model.play !== "station" ? progress(model.state.season, model.state.phase) : progress(ctx.season, ctx.phase)}
      ${ctx.event ? eventBanner(ctx.event) : waitingBanner(ctx)}
      ${resources(team, ctx, latest)}
      ${planning ? farmEditor(ctx) : farmLocked(ctx, latest)}
      <div class="grid-2">
        ${scoreCard(team, score, ctx)}
        <article class="card"><h2>Leitura da temporada</h2><p>${esc(tip(ctx))}</p><p class="muted">${esc(theme(ctx.season).question)}</p></article>
      </div>`;
  }

  function farmStatus(ctx) {
    if (ctx.phase === "planning" && ctx.locked) return "Decisões confirmadas";
    if (ctx.phase === "planning") return "Planejamento aberto";
    if (ctx.phase === "results" || ctx.phase === "finished") return "Colheita apurada";
    return "Aguardando o professor";
  }

  function waitingBanner(ctx) {
    const text = ctx.phase === "event_preview" || ctx.phase === "await_event"
      ? "O professor ainda vai anunciar o evento. Aproveitem para lembrar quanto dinheiro e composto vocês têm. O plano abre em seguida."
      : "Esta etapa é conduzida pelo professor.";
    return `<div class="callout"><strong>${esc(theme(ctx.season).title)}</strong><p>${text}</p></div>`;
  }

  function eventBanner(instance) {
    const info = eventInfo(instance.eventId);
    return `<article class="callout tone-${info.tone} event-card"><div class="split"><div>
      <p class="tag">${icon(EVENT_ICON[instance.eventId] || "sun")} Evento em vigor</p>
      <h2>${esc(eventTitle(instance))}</h2>
      <p>${esc(eventDetail(instance))}</p>
      <p class="muted">${esc(info.education)}</p>
    </div><button type="button" class="btn no-print" data-action="show-reveal">Revelar de novo</button></div></article>`;
  }

  function resources(team, ctx, latest) {
    const planning = ctx.phase === "planning";
    const lots = planning
      ? ((ctx.plan && ctx.plan.items) || []).reduce((sum, item) => sum + item.lots, 0)
      : latest ? latest.produced.reduce((sum, item) => sum + item.lots, 0) : 0;
    const waterValue = team.waterLimit != null ? liters(team.waterLimit) : latest ? liters(latest.waterUsed) : "1.000 L";
    const waterText = team.waterLimit != null
      ? waterCaption(team, ctx)
      : latest ? `de ${liters(latest.waterAvailable)} disponíveis na última colheita` : "reserva base de cada temporada";
    return `<div class="resources">
      <article class="resource money"><span class="label">${icon("coins")} Dinheiro</span><strong>${money(team.money)}</strong><span class="muted">Caixa para esta decisão</span></article>
      <article class="resource water"><span class="label">${icon("droplet")} Água</span><strong>${waterValue}</strong><span class="muted">${waterText}</span></article>
      <article class="resource land"><span class="label">${icon("grid")} Terreno</span><strong>${lots}/10</strong><span class="muted">${planning ? "lotes neste plano" : "lotes na última colheita"}</span></article>
      <article class="resource compost"><span class="label">${icon("recycle")} Composto</span><strong>${team.compost}</strong><span class="muted">unidades · compostagem gasta 5</span></article>
    </div>`;
  }

  function waterCaption(team, ctx) {
    if (team.waterLimit == null) return "a reserva da temporada aparece com o planejamento";
    const bits = ["não acumula para a próxima"];
    if (team.rainwaterBonus) bits.unshift(`inclui ${team.rainwaterBonus} L de captação`);
    if (ctx.event && ctx.event.eventId === "seca") bits.unshift("seca −30%");
    if (ctx.event && ctx.event.eventId === "chuvas") bits.unshift("chuva +200 L");
    return bits.join(" · ");
  }

  function farmEditor(ctx) {
    const view = planView(ctx);
    return `<div class="farm-layout">
      <div>
        <h2>O que plantar</h2>
        <p>A água vai primeiro para o topo da lista. Usem as setas para definir a prioridade.</p>
        <div class="catalog">${data().CROPS.map((item) => cropButton(item)).join("")}</div>
        <div class="plan-list">${view.rows || `<div class="card"><p>A horta ainda está vazia. Escolham uma cultura para começar.</p></div>`}</div>
        <h2>Melhorias da temporada</h2>
        <div class="grid-2">${data().IMPROVEMENTS.map((item) => improveButton(ctx, item)).join("")}</div>
      </div>
      ${previewCard(ctx, view)}
    </div>`;
  }

  function cropButton(item) {
    const profit = item.revenue - item.cost;
    return `<button type="button" class="crop-card" data-action="add-crop" data-crop="${item.id}">
      ${cropArt(item.id)}
      <header><strong>${esc(item.name)}</strong><span>+ lote</span></header>
      <p>${esc(item.blurb)}</p>
      <p class="muted">${money(item.cost)} · ${liters(item.water)} · colheita ${money(item.revenue)} · sobra ${money(profit)} por lote</p>
    </button>`;
  }

  function planView(ctx) {
    const normalized = engine().normalizePlan(ctx.plan);
    if (!normalized.ok) return { rows: "", error: engine().message(normalized.code, normalized.meta) };
    const production = ctx.team.waterLimit == null ? null : engine().resolveProduction(normalized.plan, ctx.team.waterLimit, ctx.event);
    const check = engine().validatePlan(ctx.team, ctx.plan, ctx.season);
    const rows = normalized.plan.items.map((item, index) => {
      const grown = production && production.produced.find((row) => row.cropId === item.cropId);
      const failed = production && production.failed.find((row) => row.cropId === item.cropId);
      const note = failed ? `<p class="warn">${failed.lots} ${failed.lots === 1 ? "lote não produz" : "lotes não produzem"} por falta de água</p>` : "";
      const ok = grown ? `<p class="muted">${grown.lots} ${grown.lots === 1 ? "lote produz" : "lotes produzem"} · ${liters(grown.waterUsed)}</p>` : "";
      return `<div class="plan-row"><div class="stack-buttons">
          <button type="button" class="btn btn-small" data-action="move-up" data-crop="${item.cropId}" aria-label="Subir prioridade" ${index === 0 ? "disabled" : ""}>${icon("up")}</button>
          <button type="button" class="btn btn-small" data-action="move-down" data-crop="${item.cropId}" aria-label="Descer prioridade" ${index === normalized.plan.items.length - 1 ? "disabled" : ""}>${icon("down")}</button>
        </div>
        <div><strong>${index + 1}. ${esc(crop(item.cropId).name)}</strong>${ok}${note}</div>
        <div class="stack-buttons">
          <button type="button" class="btn btn-small" data-action="sub-crop" data-crop="${item.cropId}" aria-label="Tirar um lote">${icon("minus")}</button>
          <span class="qty">${item.lots}</span>
          <button type="button" class="btn btn-small" data-action="add-crop" data-crop="${item.cropId}" aria-label="Adicionar um lote">${icon("plus")}</button>
        </div></div>`;
    }).join("");
    return { rows, normalized, production, check };
  }

  function improveButton(ctx, item) {
    const selected = ctx.plan.improvements.includes(item.id);
    const owned = (ctx.team.improvementLog || []).some((entry) => entry.id === item.id);
    const lock = improvementLock(ctx, item.id, selected);
    return `<button type="button" class="improve ${selected ? "is-on" : ""} ${lock ? "is-locked" : ""}" data-action="toggle-improvement" data-improvement="${item.id}">
      <header><strong>${icon(item.id === "compostagem" ? "recycle" : item.id === "cobertura" ? "leaf" : item.id === "captacao" ? "rain" : "shield")} ${esc(item.name)}</strong><span>${selected ? "Na cesta" : "Comprar"}</span></header>
      <p>${money(item.cost)}${item.compost ? ` · ${item.compost} de composto` : ""}</p>
      <p>${esc(item.blurb)}</p>
      <p class="muted">${esc(item.education)}</p>
      ${owned ? `<p class="muted">Os 25 pontos desta prática já foram registrados. Comprar de novo só repete o efeito da temporada.</p>` : `<p class="muted">Primeira compra: +25 pontos de práticas agroecológicas.</p>`}
      ${lock ? `<p class="warn">${esc(lock)}</p>` : ""}
    </button>`;
  }

  function improvementLock(ctx, id, selected) {
    if (id === "captacao" && ctx.season >= 4 && !selected) return "Na temporada 4 não há temporada seguinte, então a captação fica bloqueada.";
    if (id === "compostagem" && ctx.team.compost < 5 && !selected) return "Composto insuficiente para mais uma compostagem.";
    return "";
  }

  function previewCard(ctx, view) {
    if (!view.normalized) return `<aside class="card preview preview-bad"><h2>Plano inválido</h2><p>${esc(view.error)}</p></aside>`;
    const production = view.production;
    const check = view.check;
    const cost = view.normalized.money;
    const afterPay = engine().roundMoney(ctx.team.money - cost);
    const earned = production ? production.earned : 0;
    const afterHarvest = engine().roundMoney(afterPay + earned);
    const failed = production ? production.failed.reduce((sum, item) => sum + item.lots, 0) : 0;
    const produced = production ? production.produced.reduce((sum, item) => sum + item.lots, 0) : 0;
    const bad = !check.ok;
    return `<aside class="card preview ${bad ? "preview-bad" : ""}">
      <h2>Antes de confirmar</h2>
      <div class="kv"><span>Custo do plano</span><span>${money(cost)}</span></div>
      <div class="kv"><span>Composto usado</span><span>${view.normalized.compost}</span></div>
      <div class="kv"><span>Caixa depois de pagar</span><span>${money(afterPay)}</span></div>
      <div class="kv"><span>Lotes que produzem</span><span>${produced}</span></div>
      <div class="kv"><span>Lotes sem água</span><span>${failed}</span></div>
      <div class="kv"><span>Água prevista</span><span>${production ? `${liters(production.waterUsed)} de ${liters(production.waterAvailable)}` : "—"}</span></div>
      <div class="kv"><span>Receita prevista</span><span>${money(earned)}</span></div>
      <div class="kv"><span>Caixa se a colheita vier assim</span><span>${money(afterHarvest)}</span></div>
      ${bad ? `<p class="warn">${esc(engine().message(check.code, check.meta))}</p>` : `<p class="muted">Depois de confirmar, esta temporada não pode ser mudada pela equipe.</p>`}
      ${production && production.notes.length ? `<p class="muted">${esc(production.notes[0])}</p>` : ""}
      <button type="button" class="btn btn-primary" data-action="ask-confirm" ${bad ? "disabled" : ""}>${icon("check")} Confirmar decisões</button>
      ${ctx.mode === "station" ? `<p class="muted">No modo quatro computadores, confirmar também baixa o arquivo para o professor.</p>` : ""}
    </aside>`;
  }

  function farmLocked(ctx, latest) {
    const plan = ctx.team.confirmedPlan || ctx.plan;
    const text = plan && plan.items && plan.items.length
      ? plan.items.map((item) => `${crop(item.cropId).name} ×${item.lots}`).join(", ")
      : "Nenhum lote plantado";
    const improvements = plan && plan.improvements && plan.improvements.length
      ? plan.improvements.map((id) => improvement(id).name).join(", ")
      : "Nenhuma melhoria";
    const report = latest ? reportCard(ctx.team, latest, ctx.team.seasons[ctx.team.seasons.length - 2]) : "";
    const reopen = ctx.mode === "station" && ctx.phase === "planning"
      ? `<button type="button" class="btn" data-action="unlock-station">Corrigir e exportar de novo</button>`
      : "";
    return `<div class="grid-2"><article class="card"><h2>${ctx.phase === "planning" ? "Plano travado" : "Situação da propriedade"}</h2>
      <p><strong>Culturas:</strong> ${esc(text)}</p><p><strong>Melhorias:</strong> ${esc(improvements)}</p>
      ${ctx.phase === "planning" ? "<p>Esperem o professor encerrar a produção. A receita entra no caixa só na colheita.</p>" : ""}
      ${reopen}</article>${latest ? "" : `<article class="card"><h2>Ainda não houve colheita</h2><p>Os pontos de produção, água, diversidade e práticas aparecem quando o professor apurar a temporada.</p></article>`}</div>${report}`;
  }

  function scoreCard(team, score, ctx) {
    const projection = ctx.phase === "planning" && !ctx.locked ? engine().project(team, ctx.plan, ctx.season, ctx.event, team.waterLimit) : null;
    const projected = projection && projection.ok ? `<p>Se a colheita sair como a previsão, a pontuação iria para <strong>${points(projection.projectedScore.total)}</strong>.</p>` : "";
    return `<article class="card"><h2>Pontuação apurada</h2><p class="timer">${points(score.total)} <span class="muted">/ 1.000</span></p>
      ${scoreBars(score)}${projected}${audit(team, score)}</article>`;
  }

  function scoreBars(score) {
    const rows = [
      ["Financeiro", score.financial, 400, "gold"],
      ["Produção", score.production, 300, ""],
      ["Economia de água", score.water, 100, "blue"],
      ["Diversidade", score.diversity, 100, "leaf"],
      ["Práticas", score.practices, 100, "leaf"],
    ];
    return `<div class="bars">${rows.map(([label, value, max, cls]) => `<div>
      <div class="bar-label"><span>${label}</span><span>${points(value)} / ${max}</span></div>
      <div class="track"><div class="fill ${cls}" style="width:${Math.max(0, Math.min(100, (value / max) * 100))}%"></div></div>
    </div>`).join("")}</div>`;
  }

  function audit(team, score) {
    let potential = 0;
    let actual = 0;
    const crops = new Set();
    (team.seasons || []).forEach((season) => {
      (season.produced || []).forEach((item) => {
        if (item.lots > 0) crops.add(crop(item.cropId).name);
        potential += item.lots * crop(item.cropId).water;
        actual += item.waterUsed;
      });
    });
    const saved = potential > 0 ? Math.round(((potential - actual) / potential) * 1000) / 10 : 0;
    const practices = [...new Set((team.improvementLog || []).map((entry) => improvement(entry.id).name))];
    return `<details><summary>Como esta conta foi feita</summary>
      <p>Financeiro: ${money(team.scoreMoney)} × 0,04 = ${points(score.financial)} (teto 400).</p>
      <p>Produção: ${score.lots} lotes × 7,5 = ${points(score.production)} (teto 300).</p>
      <p>Água: consumo sem cobertura ${liters(potential)}, consumo real ${liters(actual)}, economia ${saved.toLocaleString("pt-BR")}%. Os 100 pontos correspondem a 20% de economia sobre toda a colheita.</p>
      <p>Diversidade: ${crops.size ? [...crops].join(", ") : "nenhuma cultura colhida ainda"} × 25.</p>
      <p>Práticas: ${practices.length ? practices.join(", ") : "nenhuma melhoria apurada ainda"} × 25. Repetir a mesma não soma outra vez.</p>
    </details>`;
  }

  function tip(ctx) {
    const items = (ctx.plan && ctx.plan.items) || [];
    if (ctx.phase !== "planning") return theme(ctx.season).question;
    if (ctx.event && ctx.event.eventId === "desperdicio" && !(ctx.plan.improvements || []).includes("cobertura")) {
      return "Sem cobertura do solo, a propriedade perde 100 litros antes de produzir. A cobertura desta temporada evita essa perda e ainda reduz o consumo.";
    }
    if (items.length === 1 && items[0].lots >= 8) {
      return "Uma cultura só enche a horta, mas um evento em cima desse alimento atinge a propriedade inteira. Cada cultura diferente colhida vale 25 pontos.";
    }
    if (ctx.event && ctx.event.eventId === "pragas" && !(ctx.plan.improvements || []).includes("controle")) {
      return "Há ataque de pragas anunciado. O controle biológico comprado agora anula a perda desta temporada.";
    }
    if (ctx.event && ctx.event.eventId === "solo" && !(ctx.plan.improvements || []).includes("compostagem")) {
      return "O solo empobrecido corta 15% da receita de quem não fizer compostagem nesta temporada.";
    }
    if ((ctx.team.rainwaterBonus || 0) === 0 && ctx.season < 4) {
      return "A captação não ajuda hoje. Ela guarda 150 litros para as próximas temporadas, quando a seca pode aparecer.";
    }
    return "A água que sobrar não fica para depois. Vale mais produzir com folga do que apostar todos os litros numa cultura só.";
  }

  function ranking(model) {
    const board = boardOf(model);
    if (!board) return `<h1>Ranking</h1><p>O ranking aparece quando a partida começa.</p>`;
    const fresh = board.teams.every((team) => !(team.seasons || []).length);
    return `${model.state && model.play !== "station" ? progress(model.state.season, model.state.phase) : ""}
      <h1>Ranking</h1>
      ${fresh ? `<div class="callout"><strong>Antes da primeira colheita</strong><p>Todas têm ${points(200)} pontos porque o saldo inicial é ${money(5000)} × 0,04. Produção e sustentabilidade entram na apuração.</p></div>` : ""}
      ${rankingTable(board.ranking, board.ranking.some((entry) => entry.cash != null && entry.cash !== entry.money))}
      <div class="row-actions no-print">
        <button type="button" class="btn" data-action="export-csv">${icon("download")} Exportar CSV</button>
        <button type="button" class="btn" data-action="goto" data-screen="podium">Abrir pódio</button>
      </div>`;
  }

  function rankingTable(table, showCash) {
    const body = table.map((entry) => `<tr class="${entry.position <= 3 ? "place-" + entry.position : ""}">
      <td><strong>${entry.position}º</strong></td>
      <td>${esc(entry.name)}</td>
      <td>${points(entry.score.total)}</td>
      <td>${money(entry.money)}</td>
      ${showCash ? `<td>${money(entry.cash)}</td>` : ""}
      <td>${entry.lots}</td>
      <td>${points(entry.score.sustainability)}</td>
    </tr>`).join("");
    return `<div class="table-wrap"><table><thead><tr>
      <th>Posição</th><th>Propriedade</th><th>Pontos</th><th>Saldo na apuração</th>
      ${showCash ? "<th>Caixa agora</th>" : ""}<th>Lotes colhidos</th><th>Sustentabilidade</th>
    </tr></thead><tbody>${body}</tbody></table></div>
    <p class="muted">As três primeiras posições ficam destacadas. Empate: sustentabilidade, saldo e lotes colhidos, nessa ordem.</p>`;
  }

  function results(model) {
    const board = boardOf(model);
    if (!board) return `<h1>Resultados</h1><p>Ainda não há uma partida para mostrar.</p>`;
    const season = board.reportSeason;
    const question = season ? theme(season).question : theme(board.season).question;
    const cards = board.teams.map((team) => {
      const list = team.seasons || [];
      const current = season ? list.find((item) => item.season === season) || list[list.length - 1] : list[list.length - 1];
      if (!current) return `<article class="report"><h2>${esc(team.name)}</h2><p>Esta equipe ainda não tem colheita.</p></article>`;
      const previous = list.filter((item) => item.season < current.season).pop();
      return reportCard(team, current, previous, model);
    }).join("");
    const timer = model.timerLabel ? `<p class="timer" id="timer-value">${esc(model.timerLabel)}</p>` : `<p class="timer" id="timer-value">03:00</p>`;
    const nextStep = reportNextStep(model);
    return `<h1>Relatório da temporada ${season || ""}</h1>
      <article class="callout"><strong>Pergunta para conversar</strong><p>${esc(question)}</p>
        ${timer}<button type="button" class="btn no-print" data-action="start-timer">Iniciar conversa de 3 minutos</button>
      </article>
      ${nextStep}
      <div class="harvest-pop">${cards}</div>
      ${nextStep}`;
  }

  function reportNextStep(model) {
    const state = model.state;
    if (!state || model.play === "station") return "";
    if (model.room && model.room.role === "team") return "";
    if (state.phase === "finished") {
      return `<div class="row-actions no-print"><button type="button" class="btn btn-primary" data-action="goto" data-screen="podium">${icon("trophy")} Ver pódio</button></div>`;
    }
    if (state.phase !== "results") return "";
    if (state.season < 4) {
      return `<div class="row-actions no-print">
        <button type="button" class="btn btn-primary" data-action="ask-next">Abrir a próxima temporada</button>
        <button type="button" class="btn btn-danger" data-action="ask-early">Encerrar a oficina antes do fim</button>
      </div>`;
    }
    return `<div class="row-actions no-print"><button type="button" class="btn btn-primary" data-action="ask-finish">${icon("trophy")} Encerrar partida e ver o pódio</button></div>`;
  }

  function reportCard(team, season, previous, model) {
    const score = season.score || engine().scoreTeam(team);
    const before = previous && previous.score ? previous.score.total : 200;
    const delta = engine().roundMoney(score.total - before);
    const produced = (season.produced || []).map((item) => {
      const factors = (item.factors || []).filter((factor) => factor.multiplier !== 1).map((factor) => factor.label).join(", ");
      return `<p><strong>${esc(crop(item.cropId).name)}</strong> — ${item.lots} ${item.lots === 1 ? "lote" : "lotes"} · base ${money(item.baseRevenue)} · final ${money(item.revenue)}${factors ? " · " + esc(factors) : ""} · água ${liters(item.waterUsed)}</p>`;
    }).join("") || "<p>Nenhum lote foi colhido.</p>";
    const failed = (season.failed || []).map((item) =>
      `<p class="warn">${item.lots} ${item.lots === 1 ? "lote" : "lotes"} de ${esc(crop(item.cropId).name)} não produziram por falta de água.</p>`
    ).join("");
    const spent = season.spentMoney || 0;
    const noteKey = String(season.season);
    const note = team.notes && team.notes[noteKey] ? team.notes[noteKey] : "";
    const canNote = model && (model.play !== "station" || (model.station && model.station.teamId === team.id));
    return `<article class="report" style="border-top: 8px solid ${team.color}">
      <h2>${esc(team.name)}</h2>
      <div class="resources">
        <div class="resource money"><span class="label">Receita</span><strong>${money(season.earnedMoney)}</strong></div>
        <div class="resource"><span class="label">Gasto</span><strong>${money(spent)}</strong></div>
        <div class="resource water"><span class="label">Água</span><strong>${liters(season.waterUsed)}</strong><span class="muted">de ${liters(season.waterAvailable)}</span></div>
        <div class="resource land"><span class="label">Pontos agora</span><strong>${points(score.total)}</strong><span class="muted">${delta >= 0 ? "+" : ""}${points(delta)} nesta apuração</span></div>
      </div>
      <p>Caixa no início ${money(season.openingMoney)}${season.grant ? ` · apoio ${money(season.grant)}` : ""} · caixa no fim ${money(season.closingMoney)}</p>
      ${produced}${failed}
      ${(season.notes || []).map((line) => `<p>${esc(line)}</p>`).join("")}
      ${scoreBars(score)}
      <details><summary>Conta de cada cultura</summary>
        ${(season.produced || []).map((item) => `<p>${esc(crop(item.cropId).name)}: ${item.lots} × ${money(crop(item.cropId).revenue)} = ${money(item.baseRevenue)}. Água ${item.lots} × ${item.waterPerLot} L. Receita depois do evento: ${money(item.revenue)}.</p>`).join("") || "<p>Sem colheita.</p>"}
        <p>Limite ${liters(season.waterLimit)} · disponível ${liters(season.waterAvailable)} · usada ${liters(season.waterUsed)} · sobrou ${liters(season.waterLeft)}.</p>
      </details>
      ${canNote ? `<label>Uma frase da equipe sobre esta temporada<textarea data-note="${esc(team.id)}" data-season="${season.season}">${esc(note)}</textarea></label>` : ""}
    </article>`;
  }

  function podium(model) {
    const board = boardOf(model);
    if (!board) return `<h1>Pódio</h1><p>O pódio abre no fim da partida.</p>`;
    if (!board.finished) {
      return `<h1>Pódio</h1><div class="callout"><strong>A cerimônia espera o professor</strong><p>Encerrem a partida no painel para fixar o resultado. Enquanto isso, o ranking abaixo é o da última apuração.</p></div>${rankingTable(board.ranking, false)}`;
    }
    const top = board.ranking.slice(0, 3);
    const order = [top[1], top[0], top[2]].filter(Boolean);
    return `<p class="eyebrow">Encerramento da oficina</p><h1>Pódio da Agricultura Digital</h1>
      <div class="podium">${order.map((entry) => `<article class="place place-${entry.position}">
        <div class="medal">${entry.position}º</div>
        <h2>${esc(entry.name)}</h2>
        <p class="timer">${points(entry.score.total)}</p>
        <p>${money(entry.money)} · ${entry.lots} lotes · sustentabilidade ${points(entry.score.sustainability)}</p>
      </article>`).join("")}</div>
      <article class="callout-good callout"><strong>Por que este resultado ficou na frente</strong><p>${esc(board.text)}</p></article>
      ${rankingTable(board.ranking, false)}
      <h2>O que levamos da oficina</h2>
      ${lessonGrid().replace("<h2>O que a simulação quer mostrar</h2>", "")}
      <div class="row-actions no-print">
        <button type="button" class="btn btn-primary" data-action="export-results">${icon("download")} Exportar resultados JSON</button>
        <button type="button" class="btn" data-action="export-csv">${icon("download")} Exportar ranking CSV</button>
      </div>`;
  }

  function station(model) {
    const stationState = model.station;
    const pkg = stationState && stationState.package;
    const imported = pkg ? `<div class="card"><h2>Pacote da temporada ${pkg.season}</h2>
      <p>Partida ${esc(pkg.gameId)}. ${pkg.event ? esc(eventTitle(pkg.event)) : "Sem evento no arquivo."}</p>
      <div class="team-grid">${pkg.teams.map((team) => `<button type="button" class="team-card ${stationState.teamId === team.id ? "is-on" : ""}" data-action="station-pick" data-team="${team.id}" style="border-top:8px solid ${team.color}">
        <h3>${esc(team.name)}</h3><p>${money(team.money)} · composto ${team.compost}</p>
      </button>`).join("")}</div>
      <button type="button" class="btn btn-primary" data-action="open-station-farm" ${stationState.teamId ? "" : "disabled"}>Abrir nossa propriedade</button>
    </div>` : `<div class="callout"><strong>Ainda não há pacote</strong><p>Peçam ao professor o arquivo da temporada, depois que o planejamento for aberto.</p></div>`;
    return `<h1>Computador da equipe</h1>
      <p>Importem o JSON do professor, escolham a fazenda e devolvam o arquivo de decisão. Este computador não vê o caixa das outras equipes mudar sozinho.</p>
      <div class="row-actions">
        <label class="btn btn-secondary file-btn">${icon("upload")} Importar arquivo do professor<input type="file" accept="application/json,.json" data-import="auto"></label>
        <button type="button" class="btn btn-danger" data-action="clear-station">Apagar dados deste computador</button>
      </div>
      ${imported}`;
  }

  function boardOf(model) {
    if (model.play === "station" && model.station && model.station.results) {
      const file = model.station.results;
      const reportSeason = file.teams.some((team) => (team.seasons || []).some((season) => season.season === file.season))
        ? file.season
        : null;
      return {
        ranking: file.ranking,
        text: file.winnerText,
        finished: file.status === "finished",
        teams: file.teams,
        season: file.season,
        reportSeason: reportSeason || (file.teams[0] && file.teams[0].seasons.length ? file.teams[0].seasons[file.teams[0].seasons.length - 1].season : null),
      };
    }
    if (!model.state) return null;
    const table = engine().ranking(model.state);
    const hasHarvest = model.state.teams.some((team) => team.seasons.length);
    const reportSeason = model.state.phase === "results" || model.state.phase === "finished"
      ? model.state.season
      : (hasHarvest ? model.state.season - 1 : null);
    return {
      ranking: table,
      text: engine().explainWinner(table),
      finished: model.state.status === "finished",
      teams: model.state.teams,
      season: model.state.season,
      reportSeason,
    };
  }

  function farmContext(model) {
    if (model.play === "station") {
      const stationState = model.station;
      if (!stationState || !stationState.package || !stationState.teamId) return null;
      const source = stationState.package.teams.find((team) => team.id === stationState.teamId);
      if (!source) return null;
      const official = stationState.results && stationState.results.teams.find((team) => team.id === source.id);
      const harvested = stationState.results && stationState.results.season === stationState.package.season && stationState.results.phase !== "planning";
      const team = Object.assign({}, harvested && official ? official : source, {
        pendingPlan: stationState.plan,
        confirmedPlan: stationState.confirmed ? stationState.plan : null,
        notes: Object.assign({}, (official && official.notes) || {}, stationState.notes || {}),
      });
      const remoteLocked = !!source.confirmed;
      const locked = stationState.confirmed || remoteLocked || harvested || stationState.package.phase !== "planning";
      return {
        mode: "station",
        team,
        plan: stationState.plan || { items: [], improvements: [] },
        season: stationState.package.season,
        phase: harvested ? stationState.results.phase : stationState.package.phase,
        event: stationState.package.event,
        locked,
      };
    }
    if (!model.state || !model.teamId) return null;
    const team = model.state.teams.find((item) => item.id === model.teamId);
    if (!team) return null;
    const visibleEvent = model.state.phase === "planning" || model.state.phase === "results" || model.state.phase === "finished"
      ? model.state.activeEvent
      : null;
    return {
      mode: "local",
      team,
      plan: team.pendingPlan,
      season: model.state.season,
      phase: model.state.phase,
      event: visibleEvent,
      locked: team.confirmed || model.state.phase !== "planning",
    };
  }

  function modal(dataModal) {
    const field = dataModal.ask ? `<label>Digite ${esc(dataModal.ask)} para confirmar<input id="modal-ask" type="text" autocomplete="off"></label>` : "";
    return `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true">
      <h2>${esc(dataModal.title)}</h2>
      <p>${esc(dataModal.text)}</p>
      <p class="warn" id="modal-warn"></p>
      ${field}
      <div class="row-actions">
        <button type="button" class="btn ${dataModal.danger ? "btn-danger" : "btn-primary"}" data-action="modal-yes">${esc(dataModal.confirmLabel || "Confirmar")}</button>
        <button type="button" class="btn" data-action="close-modal">Cancelar</button>
      </div>
    </div></div>`;
  }

  function render(model) {
    const pages = { home, how, join, teacher, pick, farm, ranking, results, podium, station };
    const page = pages[model.screen] || home;
    return shell(model, page(model));
  }

  root.AD.ui = { render, eventTitle, money, points };
})(typeof globalThis !== "undefined" ? globalThis : this);
