const GEOJSON_URL = 'zonas_densidad.geojson';

const COLORSCALE = [
  [0.00, '#0d0221'],
  [0.20, '#3b1f8c'],
  [0.45, '#9c2f8c'],
  [0.70, '#e05f2f'],
  [0.85, '#ff9a1f'],
  [1.00, '#ffd23f'],
];

let geojson = null;
let selected = null;

async function init() {
  const res = await fetch(GEOJSON_URL);
  geojson = await res.json();

  buildStats(geojson);
  buildMap(geojson);
  buildBarChart(geojson);

  document.getElementById('loading').classList.add('hidden');
}

function buildStats(gj) {
  const vals = gj.features.map(f => f.properties.densidad);
  const comunas = new Set(gj.features.map(f => f.properties.nombre_comuna));

  document.getElementById('stat-zones').textContent  = gj.features.length.toLocaleString('es-CL');
  document.getElementById('stat-comunas').textContent = comunas.size;
  document.getElementById('stat-max').textContent    = Math.max(...vals).toFixed(1);
  document.getElementById('stat-avg').textContent    = (vals.reduce((a,b) => a+b,0) / vals.length).toFixed(2);
}

// Choropleth map
function buildMap(gj) {
  const ids       = gj.features.map((_, i) => i);
  const comunas   = gj.features.map(f => f.properties.nombre_comuna);
  const geocod    = gj.features.map(f => f.properties.geocodigo);
  const densities = gj.features.map(f => f.properties.densidad);

  const featuresCopy = JSON.parse(JSON.stringify(gj));
  featuresCopy.features.forEach((f, i) => { f.id = i; });

  const trace = {
    type: 'choroplethmapbox',
    geojson: featuresCopy,
    locations: ids,
    z: densities,
    colorscale: COLORSCALE,
    zmin: 0,
    zmax: 30,
    marker: {
      opacity: 0.88,
      line: { width: 0.3, color: 'rgba(255,255,255,0.08)' }
    },
    colorbar: {
      title: { text: 'Densidad<br>(zonas/km²)', font: { family: 'JetBrains Mono', size: 10, color: '#6b6580' }, side: 'right' },
      thickness: 12,
      len: 0.65,
      x: 1.01,
      tickfont: { family: 'JetBrains Mono', size: 9, color: '#6b6580' },
      tickcolor: '#6b6580',
      outlinewidth: 0,
      bgcolor: 'rgba(0,0,0,0)',
    },
    customdata: comunas.map((c, i) => [c, geocod[i], densities[i]]),
    hovertemplate:
      '<b>%{customdata[0]}</b><br>' +
      'Densidad: <b>%{z:.2f}</b> zonas/km²<br>' +
      '<span style="font-size:9px;color:#888">%{customdata[1]}</span>' +
      '<extra></extra>',
    name: '',
  };

  const layout = {
    mapbox: {
      style: 'carto-darkmatter',
      center: { lon: -70.65, lat: -33.47 },
      zoom: 10.4,
    },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor:  'rgba(0,0,0,0)',
    margin: { t: 0, b: 0, l: 0, r: 50 },
    font: { family: 'Syne', color: '#e8e4f0' },
  };

  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d'],
    displaylogo: false,
    scrollZoom: true,
  };

  Plotly.newPlot('map', [trace], layout, config);

  // Click interaccion
  document.getElementById('map').on('plotly_click', (data) => {
    const pt = data.points[0];
    if (!pt) return;
    const [comuna, geocodigo, dens] = pt.customdata;
    showInfo(comuna, geocodigo, dens);
  });

  document.getElementById('map').on('plotly_hover', (data) => {
    document.getElementById('map').style.cursor = 'pointer';
  });
}

// top comunas por promedio densidad
function buildBarChart(gj) {
  const acc = {};
  gj.features.forEach(f => {
    const c = f.properties.nombre_comuna;
    const d = f.properties.densidad;
    if (!acc[c]) acc[c] = { sum: 0, count: 0 };
    acc[c].sum += d;
    acc[c].count++;
  });

  const entries = Object.entries(acc)
    .map(([c, v]) => ({ comuna: c, avg: v.sum / v.count }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 18);

  const comunas = entries.map(e => e.comuna);
  const avgs    = entries.map(e => e.avg);

  // Color bars por valor
  const maxVal = Math.max(...avgs);
  const colors = avgs.map(v => interpolateColor(v / maxVal));

  const trace = {
    type: 'bar',
    x: avgs,
    y: comunas,
    orientation: 'h',
    marker: { color: colors, line: { width: 0 } },
    hovertemplate: '<b>%{y}</b><br>Densidad media: %{x:.2f}<extra></extra>',
    name: '',
  };

  const layout = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor:  'rgba(0,0,0,0)',
    margin: { t: 4, b: 24, l: 110, r: 16 },
    xaxis: {
      showgrid: false,
      zeroline: false,
      tickfont: { family: 'JetBrains Mono', size: 8, color: '#6b6580' },
      tickcolor: '#6b6580',
      linecolor: 'rgba(130,100,255,0.15)',
    },
    yaxis: {
      showgrid: false,
      autorange: 'reversed',
      tickfont: { family: 'JetBrains Mono', size: 8.5, color: '#e8e4f0' },
      tickcolor: 'transparent',
      linewidth: 0,
    },
    font: { family: 'Syne', color: '#e8e4f0' },
    bargap: 0.35,
  };

  const config = {
    responsive: true,
    displayModeBar: false,
  };

  Plotly.newPlot('bar-chart', [trace], layout, config);
}

// Caja con info
function showInfo(comuna, geocodigo, dens) {
  const box = document.getElementById('info-box');
  box.innerHTML = `
    <div class="info-title">${comuna}</div>
    <div class="info-val">${dens.toFixed(3)} zonas/km²</div>
    <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:#6b6580;margin-top:4px;letter-spacing:.06em">${geocodigo}</div>
  `;
}

function interpolateColor(t) {
  const stops = [
    { t: 0.00, r: 13,  g: 2,   b: 33  },
    { t: 0.20, r: 59,  g: 31,  b: 140 },
    { t: 0.45, r: 156, g: 47,  b: 140 },
    { t: 0.70, r: 224, g: 95,  b: 47  },
    { t: 0.85, r: 255, g: 154, b: 31  },
    { t: 1.00, r: 255, g: 210, b: 63  },
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i+1].t) { lo = stops[i]; hi = stops[i+1]; break; }
  }
  const f = lo.t === hi.t ? 0 : (t - lo.t) / (hi.t - lo.t);
  const r = Math.round(lo.r + f * (hi.r - lo.r));
  const g = Math.round(lo.g + f * (hi.g - lo.g));
  const b = Math.round(lo.b + f * (hi.b - lo.b));
  return `rgb(${r},${g},${b})`;
}

// Inicio
window.addEventListener('DOMContentLoaded', init);