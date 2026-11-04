(function (root) {
  const PATHS = {
    sprout: '<path d="M12 22v-7"/><path d="M12 15c-4-2-6-6-6-9 5 0 7 3 8 5"/><path d="M12 13c3-2 7-3 9-3-1 5-4 8-9 9"/><path d="M8 22h8"/>',
    leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.8-5.4 5-6"/>',
    droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5S13 5 12 2c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    coins: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    trophy: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3"/><path d="M17 6h3v2a3 3 0 0 1-3 3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    rain: '<path d="M4 14a5 5 0 0 1 .5-9.5A7 7 0 0 1 17 8a4 4 0 0 1 1 8z"/><path d="M8 19v2M12 18v2M16 19v2"/>',
    bug: '<path d="M8 9a4 4 0 0 1 8 0v3a4 4 0 0 1-8 0z"/><path d="M12 12v3"/><path d="M5 10l3 1M19 10l-3 1M5 16l3-1M19 16l-3-1"/><path d="M9 19l1 2M15 19l-1 2"/>',
    store: '<path d="M3 9l2-5h14l2 5"/><path d="M4 9h16v11H4z"/><path d="M9 20v-6h6v6"/><path d="M4 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 4 0"/>',
    mountain: '<path d="M3 20l6-10 4 6 3-4 5 8z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    heart: '<path d="M19 14l-7 7-7-7a5 5 0 1 1 7-7l.1.1.1-.1a5 5 0 1 1 7 7z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    recycle: '<path d="M7 19l-2-4 4-1"/><path d="M5 15a7 7 0 0 1 12-5"/><path d="M17 5l2 4-4 1"/><path d="M19 9a7 7 0 0 1-2 8"/><path d="M8 8l2-4 3 3"/><path d="M10 4a7 7 0 0 0-5 11"/>',
    shovel: '<path d="M14 4l6 6"/><path d="M12 6l6 6-7 7H6v-5z"/><path d="M4 20l5-5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 8h.01"/>',
    download: '<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M5 21h14"/>',
    upload: '<path d="M12 16V4"/><path d="M7 8l5-5 5 5"/><path d="M5 21h14"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    up: '<path d="M6 14l6-6 6 6"/>',
    down: '<path d="M6 10l6 6 6-6"/>',
    home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.3L21 8"/><path d="M21 3v5h-5"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    book: '<path d="M4 5h7a3 3 0 0 1 3 3v13H7a3 3 0 0 0-3 3z"/><path d="M20 5h-7a3 3 0 0 0-3 3v13h7a3 3 0 0 1 3 3z"/>',
    star: '<path d="M12 3l2.5 5.5L20 9.2l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.7z"/>',
  };

  const CROPS = {
    alface:
      '<ellipse cx="32" cy="40" rx="18" ry="10" fill="#d9f99d"/><path d="M32 40c-8-16-2-28 0-30 2 2 8 14 0 30z" fill="#4d7c0f"/><path d="M32 40c-16-6-20-18-16-22 6 2 14 10 16 22z" fill="#65a30d"/><path d="M32 40c16-6 20-18 16-22-6 2-14 10-16 22z" fill="#3f6212"/>',
    tomate:
      '<circle cx="32" cy="36" r="16" fill="#ef4444"/><ellipse cx="26" cy="32" rx="4" ry="6" fill="#f87171" opacity=".7"/><path d="M32 20c2-6 8-8 12-6-4 2-6 6-6 8" fill="#15803d"/><path d="M30 22c-4-6-10-6-12-2 4 0 8 2 10 6" fill="#16a34a"/>',
    feijao:
      '<path d="M18 34c8-16 22-16 28 0 4 10-2 20-14 20S14 44 18 34z" fill="#84cc16"/><path d="M24 36c4 2 8 2 12 0" fill="none" stroke="#3f6212" stroke-width="2"/><circle cx="26" cy="40" r="2" fill="#365314"/><circle cx="32" cy="42" r="2" fill="#365314"/><circle cx="38" cy="40" r="2" fill="#365314"/>',
    milho:
      '<path d="M24 16c8 4 14 14 12 34-8-2-16-12-12-34z" fill="#facc15"/><path d="M22 18c-6 8-8 20-4 32 6-8 8-20 4-32z" fill="#65a30d"/><path d="M40 20c6 8 6 22 2 30-4-8-6-20-2-30z" fill="#4d7c0f"/><path d="M28 24h2M32 28h2M30 34h2M34 40h2" stroke="#ca8a04" stroke-width="2"/>',
  };

  function icon(name) {
    return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || PATHS.sprout}</svg>`;
  }

  function cropArt(id) {
    return `<svg class="crop-art" viewBox="0 0 64 64" aria-hidden="true">${CROPS[id] || CROPS.alface}</svg>`;
  }

  root.AD = root.AD || {};
  root.AD.icon = icon;
  root.AD.cropArt = cropArt;
})(typeof globalThis !== "undefined" ? globalThis : this);
