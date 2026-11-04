(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else {
    root.AD = root.AD || {};
    root.AD.data = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const CROPS = [
    {
      id: "alface",
      name: "Alface",
      cost: 200,
      water: 100,
      revenue: 360,
      blurb: "Ciclo curto e boa saída na feira. Pede água com regularidade.",
      tip: "A alface enche 10 lotes com os 1.000 litros iniciais, sem sobra.",
    },
    {
      id: "tomate",
      name: "Tomate",
      cost: 300,
      water: 180,
      revenue: 540,
      blurb: "Maior lucro por lote, e também o maior consumo de água.",
      tip: "Com 1.000 litros, a água só cobre 5 lotes de tomate.",
    },
    {
      id: "feijao",
      name: "Feijão",
      cost: 180,
      water: 80,
      revenue: 340,
      blurb: "Rústico, barato e econômico em água. Base da comida brasileira.",
      tip: "O feijão permite plantar os 10 lotes e ainda poupar água.",
    },
    {
      id: "milho",
      name: "Milho",
      cost: 220,
      water: 150,
      revenue: 390,
      blurb: "Versátil na alimentação e no manejo. Consome bastante água.",
      tip: "O milho rende um meio-termo: nem o mais lucrativo, nem o mais leve.",
    },
  ];

  const IMPROVEMENTS = [
    {
      id: "compostagem",
      name: "Compostagem",
      cost: 300,
      compost: 5,
      blurb: "Protege a colheita se o solo empobrecer nesta temporada.",
      education:
        "Compostagem devolve matéria orgânica ao solo. A horta deixa de depender só do que a terra ainda tem guardado e a propriedade fica mais autônoma.",
    },
    {
      id: "cobertura",
      name: "Cobertura do solo",
      cost: 300,
      compost: 0,
      blurb: "Reduz 20% o consumo de água dos cultivos desta temporada.",
      education:
        "Palha e plantas de cobertura seguram umidade, protegem a vida do solo e diminuem a água que evapora no sol. É uma das práticas mais diretas de conservação.",
    },
    {
      id: "captacao",
      name: "Captação de água da chuva",
      cost: 600,
      compost: 0,
      blurb: "Soma 150 litros ao limite de água das próximas temporadas.",
      education:
        "Guardar chuva é planejar o futuro da propriedade. O reservatório não ajuda no dia da compra: passa a valer nas temporadas seguintes.",
    },
    {
      id: "controle",
      name: "Controle biológico de pragas",
      cost: 250,
      compost: 0,
      blurb: "Anula a perda de receita se houver ataque de pragas nesta temporada.",
      education:
        "No controle biológico, a propriedade usa seres vivos e manejo — e não veneno — para equilibrar as pragas. A proteção vale para a temporada em que foi contratada.",
    },
  ];

  const EVENTS = [
    {
      id: "seca",
      name: "Seca severa",
      tone: "alerta",
      summary: "O limite de água de todas as equipes cai 30% nesta temporada.",
      consequence: "O novo limite é calculado sobre a reserva da temporada, já com o bônus da captação, e arredondado para baixo.",
      education:
        "A seca revela se o planejamento tratou a água como bem comum. Culturas menos exigentes, cobertura do solo e água guardada nas temporadas anteriores fazem diferença quando a chuva falta.",
      needsCrop: false,
    },
    {
      id: "chuvas",
      name: "Chuvas abundantes",
      tone: "bom",
      summary: "Todas as equipes recebem 200 litros extras de água nesta temporada.",
      consequence: "Os 200 litros entram no limite desta temporada e não passam para a seguinte.",
      education:
        "Chuva boa não é estoque infinito. A água que não for usada agora volta para o ciclo e não fica guardada no caixa da propriedade — a menos que exista captação.",
      needsCrop: false,
    },
    {
      id: "pragas",
      name: "Ataque de pragas",
      tone: "alerta",
      summary: "Uma cultura sorteada perde 20% da receita.",
      consequence: "O controle biológico comprado nesta temporada anula essa perda para a equipe que investir nele.",
      education:
        "Quando a propriedade planta só um alimento, uma praga pode levar o ano inteiro. Diversificar e cuidar do equilíbrio biológico reduz esse risco sem depender de agrotóxico.",
      needsCrop: true,
    },
    {
      id: "mercado",
      name: "Mercado aquecido",
      tone: "bom",
      summary: "Uma cultura sorteada ganha 20% de receita.",
      consequence: "O bônus vale só para os lotes dessa cultura que forem realmente colhidos.",
      education:
        "Preço bom ajuda, mas mercado muda. Uma propriedade familiar fica menos refém de um único preço quando tem mais de um produto para vender e para comer.",
      needsCrop: true,
    },
    {
      id: "solo",
      name: "Solo empobrecido",
      tone: "alerta",
      summary: "Quem não fizer compostagem nesta temporada perde 15% da receita.",
      consequence: "A compostagem desta temporada protege toda a colheita da equipe.",
      education:
        "Solo cansado produz menos. A agroecologia trata o solo como organismo vivo: composto, raiz e cobertura reconstroem fertilidade em vez de apenas extrair a colheita.",
      needsCrop: false,
    },
    {
      id: "feira",
      name: "Feira agroecológica",
      tone: "bom",
      summary: "Toda a colheita ganha 15% de receita.",
      consequence: "O bônus vale para todas as culturas colhidas nesta temporada.",
      education:
        "A feira aproxima quem produz de quem come. Vender sem atravessador valoriza o alimento agroecológico e devolve renda para a agricultura familiar.",
      needsCrop: false,
    },
    {
      id: "desperdicio",
      name: "Desperdício de água",
      tone: "alerta",
      summary: "Quem não cobrir o solo perde 100 litros antes da produção.",
      consequence: "A cobertura do solo desta temporada evita essa perda.",
      education:
        "Água se perde por evaporação, solo exposto e irrigação sem critério. Cobrir a terra é uma decisão técnica e também um cuidado com o território.",
      needsCrop: false,
    },
    {
      id: "apoio",
      name: "Apoio comunitário",
      tone: "bom",
      summary: "Cada equipe recebe R$ 400 para investir na propriedade.",
      consequence: "O valor entra no caixa no início do planejamento e pode ser usado nesta temporada.",
      education:
        "Mutirão, cooperativa e política pública fazem parte da agricultura familiar. Recurso coletivo puxa a propriedade para frente quando o caixa sozinho não alcança.",
      needsCrop: false,
    },
  ];

  const TEAMS = [
    { id: "equipe-1", name: "Fazenda Esperança", color: "#2e7d32", accent: "#c8e6c9", emblem: "sprout" },
    { id: "equipe-2", name: "Fazenda Verde Vida", color: "#0f766e", accent: "#ccfbf1", emblem: "leaf" },
    { id: "equipe-3", name: "Fazenda Raízes", color: "#92400e", accent: "#fde7c7", emblem: "shovel" },
    { id: "equipe-4", name: "Fazenda AgroSustentável", color: "#1d4e89", accent: "#dbeafe", emblem: "droplet" },
  ];

  const SEASON_THEMES = [
    { title: "Água e solo", question: "Por que diversificar as culturas pode ajudar uma propriedade rural a enfrentar dificuldades?" },
    { title: "Escolhas de manejo", question: "Como a cobertura do solo e a escolha das culturas mudam o uso da água na propriedade?" },
    { title: "Equilíbrio da horta", question: "De que forma o controle biológico e a compostagem fortalecem a propriedade para além do lucro imediato?" },
    { title: "Fechamento da safra", question: "Uma propriedade pode terminar com dinheiro e, ainda assim, ser pouco sustentável? O que a pontuação de vocês mostrou?" },
  ];

  const LESSONS = [
    { title: "Agricultura familiar", text: "A propriedade produz alimento e renda para quem vive nela. As decisões de hoje precisam deixar chão para a próxima temporada." },
    { title: "Diversificação", text: "Plantar alimentos diferentes reduz o risco de praga, de preço e de clima. Também amplia o que a comunidade come." },
    { title: "Compostagem", text: "Resto de colheita vira adubo. O solo se recupera e a equipe depende menos de comprar fertilidade de fora." },
    { title: "Conservação do solo", text: "Terra coberta perde menos água, segura mais vida e aguenta melhor sol e chuva forte." },
    { title: "Uso consciente da água", text: "A água da temporada não acumula. Gastar tudo em uma cultura sedenta pode impedir o restante da horta de nascer." },
    { title: "Controle biológico", text: "Equilibrar pragas com manejo evita o veneno e protege quem planta, quem come e o entorno da propriedade." },
    { title: "Sustentabilidade econômica", text: "Caixa positivo importa, e não é o único resultado. A pontuação também olha para comida colhida, água poupada e práticas agroecológicas." },
    { title: "Produção de alimentos", text: "Cada lote colhido é comida de verdade. Por isso a produção vale pontos próprios, separados do dinheiro." },
  ];

  const LIMITS = {
    money: 5000,
    lots: 10,
    water: 1000,
    compost: 20,
    seasons: 4,
    maxScore: 1000,
    financialMax: 400,
    financialFactor: 0.04,
    productionPerLot: 7.5,
    productionMax: 300,
    waterMax: 100,
    diversityPerCrop: 25,
    diversityMax: 100,
    practicePerImprovement: 25,
    practiceMax: 100,
    coverFactor: 0.8,
    waterScoreFullSavings: 0.2,
    droughtFactor: 0.7,
    pestFactor: 0.8,
    marketFactor: 1.2,
    soilFactor: 0.85,
    fairFactor: 1.15,
    wasteLiters: 100,
    rainLiters: 200,
    supportMoney: 400,
    captureLiters: 150,
  };

  function indexById(list) {
    return Object.fromEntries(list.map((item) => [item.id, item]));
  }

  return {
    CROPS,
    IMPROVEMENTS,
    EVENTS,
    TEAMS,
    SEASON_THEMES,
    LESSONS,
    LIMITS,
    cropsById: indexById(CROPS),
    improvementsById: indexById(IMPROVEMENTS),
    eventsById: indexById(EVENTS),
  };
});
