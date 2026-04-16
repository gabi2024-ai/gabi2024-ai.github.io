const PALETTES = {
  default: {
    name: 'Magma',
    scale: [
      [0.00, '#0d0221'],
      [0.15, '#3b1f8c'],
      [0.35, '#9c2f8c'],
      [0.55, '#e05f2f'],
      [0.75, '#ff9a1f'],
      [1.00, '#ffd23f'],
    ],
    stops: [
      { t: 0.00, r: 13,  g: 2,   b: 33  },
      { t: 0.15, r: 59,  g: 31,  b: 140 },
      { t: 0.35, r: 156, g: 47,  b: 140 },
      { t: 0.55, r: 224, g: 95,  b: 47  },
      { t: 0.75, r: 255, g: 154, b: 31  },
      { t: 1.00, r: 255, g: 210, b: 63  },
    ],
    preview: ['#0d0221', '#3b1f8c', '#e05f2f', '#ffd23f'],
  },

  viridis: {
    name: 'Viridis (Daltonismo)',
    scale: [
      [0.00, '#440154'],
      [0.20, '#31688e'],
      [0.40, '#21918c'],
      [0.60, '#35b779'],
      [0.80, '#90d743'],
      [1.00, '#fde725'],
    ],
    stops: [
      { t: 0.00, r: 68,  g: 1,   b: 84  },
      { t: 0.20, r: 49,  g: 104, b: 142 },
      { t: 0.40, r: 33,  g: 145, b: 140 },
      { t: 0.60, r: 53,  g: 183, b: 121 },
      { t: 0.80, r: 144, g: 215, b: 67  },
      { t: 1.00, r: 253, g: 231, b: 37  },
    ],
    preview: ['#440154', '#31688e', '#35b779', '#fde725'],
  },
};

let currentPalette = 'default';
let geojson = null;


function interpolar_color(t, palette) {
  const stops = palette.stops;
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const f = lo.t === hi.t ? 0 : (t - lo.t) / (hi.t - lo.t);
  const r = Math.round(lo.r + f * (hi.r - lo.r));
  const g = Math.round(lo.g + f * (hi.g - lo.g));
  const b = Math.round(lo.b + f * (hi.b - lo.b));
  return `rgb(${r},${g},${b})`;
}

function build_gradiente(palette) {
  const s = palette.scale;
  const stops = s.map(([t, c]) => `${c} ${(t*100).toFixed(0)}%`).join(', ');
  return `linear-gradient(to right, ${stops})`;
}

// Stats superior
function build_stats(gj) {
  const vals = gj.features.map(f => f.properties.densidad);
  const comunas = new Set(gj.features.map(f => f.properties.nombre_comuna));
  document.getElementById('s-zonas').textContent   = gj.features.length.toLocaleString('es-CL');
  document.getElementById('s-comunas').textContent = comunas.size;
  document.getElementById('s-max').textContent     = Math.max(...vals).toFixed(1);
  document.getElementById('s-avg').textContent     = (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2);
}


function update_leyenda(palKey) {
  const pal = PALETTES[palKey];
  document.getElementById('leg-bar').style.background = build_gradiente(pal);

  const sw = document.getElementById('swatch-preview');
  sw.innerHTML = pal.preview.map(c =>
    `<div class="swatch-dot" style="background:${c}"></div>`
  ).join('');
}

function build_map(gj, palKey) {
  const pal = PALETTES[palKey];
  const ids       = gj.features.map((_, i) => i);
  const comunas   = gj.features.map(f => f.properties.nombre_comuna);
  const geocod    = gj.features.map(f => f.properties.geocodigo);
  const densidades = gj.features.map(f => f.properties.densidad);

  const featuresCopy = JSON.parse(JSON.stringify(gj));
  featuresCopy.features.forEach((f, i) => { f.id = i; });

  const ZMAX = 20;

  // Calcular centroide de cada feature para las etiquetas
  function centroid(feature) {
    const coords = feature.geometry.type === 'Polygon'
      ? feature.geometry.coordinates[0]
      : feature.geometry.coordinates[0][0];
    const lon = coords.reduce((s, c) => s + c[0], 0) / coords.length;
    const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
    return { lon, lat };
  }

  // calcular densidad (agrupado por comuna) promedio + centroide medio
  const comunaMap = {};
  gj.features.forEach(f => {
    const nombre = f.properties.nombre_comuna;
    const dens   = f.properties.densidad;
    const cen    = centroid(f);
    if (!comunaMap[nombre]) comunaMap[nombre] = { lons: [], lats: [], dens: [] };
    comunaMap[nombre].lons.push(cen.lon);
    comunaMap[nombre].lats.push(cen.lat);
    comunaMap[nombre].dens.push(dens);
  });

  const labelLons = [], labelLats = [], labelTexts = [];
  Object.entries(comunaMap).forEach(([nombre, d]) => {
    const lon  = d.lons.reduce((a,b)=>a+b,0) / d.lons.length;
    const lat  = d.lats.reduce((a,b)=>a+b,0) / d.lats.length;
    const avg  = (d.dens.reduce((a,b)=>a+b,0) / d.dens.length).toFixed(1);
    labelLons.push(lon);
    labelLats.push(lat);
    labelTexts.push(`<b>${nombre}</b><br>${avg} z/km²`);
  });

  const trazo = {
    type: 'choroplethmapbox',
    geojson: featuresCopy,
    locations: ids,
    z: densidades,
    colorscale: pal.scale,
    zmin: 0,
    zmax: ZMAX,
    marker: {
      opacity: 0.85,
      line: { width: 0.4, color: 'rgba(255,255,255,0.25)' }
    },
    colorbar: {
      title: { text: 'zonas/km²', font: { family: 'JetBrains Mono', size: 9, color: '#7c7a8e' }, side: 'right' },
      thickness: 10,
      len: 0.55,
      x: 1.01,
      tickfont: { family: 'JetBrains Mono', size: 8, color: '#7c7a8e' },
      tickcolor: '#7c7a8e',
      outlinewidth: 0,
      bgcolor: 'rgba(0,0,0,0)',
    },
    customdata: comunas.map((c, i) => [c, geocod[i], densidades[i]]),
    hovertemplate: '<extra></extra>',
    name: '',
  };

  // Capa de etiquetas de comunas (siempre visibles)
  const etiquetas = {
    type: 'scattermapbox',
    lon: labelLons,
    lat: labelLats,
    mode: 'text',
    text: labelTexts,
    textfont: {
      family: 'Syne, sans-serif',
      size: 10,
      color: '#080000',
    },
    hoverinfo: 'none',
    name: '',
  };

  const layout = {
    mapbox: {
      style: 'carto-positron',
      center: { lon: -70.638, lat: -33.490 },
      zoom: 10,
      fitbounds: 'locations',
    },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor:  'rgba(0,0,0,0)',
    margin: { t: 0, b: 0, l: 0, r: 40 },
    font: { family: 'Syne', color: '#1a1730' },
  };

  const config = {
    responsive: true,
    displayModeBar: false,
    scrollZoom: false,
    doubleClick: false,
    dragmode: false,
    displayLogo: false,
  };

  // Plotly.newPlot('map', [trazo, etiquetas], layout, config);
  Plotly.newPlot('map', [trazo], layout, config);

  // Bloquear drag completamente despues de renderizar
  const mapEl = document.getElementById('map');
  mapEl.addEventListener('mousedown', e => e.stopPropagation(), true);
  mapEl.addEventListener('touchstart', e => e.stopPropagation(), true);

  const panel  = document.getElementById('hover-panel');

  mapEl.on('plotly_hover', (data) => {
    const pt = data.points[0];
    if (!pt || pt.customdata === undefined) return;
    const [comuna, geocodigo, dens] = pt.customdata;
    
    document.getElementById('hp-name').textContent = comuna;
    document.getElementById('hp-dens').textContent = dens.toFixed(3) + ' zonas/km²';
    document.getElementById('hp-geo').textContent  = geocodigo;
    panel.classList.add('visible');
  });

  mapEl.on('plotly_unhover', () => {
    panel.classList.remove('visible');
  });
}

function setupToggle() {
  const btn = document.getElementById('toggle-palette');
  btn.addEventListener('click', () => {
    currentPalette = currentPalette === 'default' ? 'viridis' : 'default';
    btn.classList.toggle('active', currentPalette === 'viridis');
    update_leyenda(currentPalette);
    rebuildTrace(currentPalette);
  });
}

function rebuildTrace(palKey) {
  const pal = PALETTES[palKey];
  const ZMAX = 20;
  Plotly.restyle('map', {
    colorscale: [pal.scale],
    zmax: [ZMAX],
  }, [0]);
}

async function init() {
  const res = await fetch('zonas_densidad.geojson');
  geojson = await res.json();

  build_stats(geojson);
  update_leyenda(currentPalette);
  build_map(geojson, currentPalette);
  setupToggle();

  document.getElementById('loading').classList.add('hidden');
}

window.addEventListener('DOMContentLoaded', init);