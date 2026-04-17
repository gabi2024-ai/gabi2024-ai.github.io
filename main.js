const MAX_DENSITY = 20;
const MAP_CENTER = { lon: -70.638, lat: -33.490 };

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


let currentPaletteKey = 'default';
let geoJsonData = null;

// utils
function interpolateColor(targetValue, palette) {
  const stops = palette.stops;
  let lowerStop = stops[0];
  let upperStop = stops[stops.length - 1];

  // Encontrar entre qué par de colores se encuentra el valor
  for (let i = 0; i < stops.length - 1; i++) {
    if (targetValue >= stops[i].t && targetValue <= stops[i + 1].t) { 
      lowerStop = stops[i]; 
      upperStop = stops[i + 1]; 
      break; 
    }
  }

  // Calcular ratio y evitar divisiones por cero
  const ratio = lowerStop.t === upperStop.t 
    ? 0 
    : (targetValue - lowerStop.t) / (upperStop.t - lowerStop.t);
  
  const r = Math.round(lowerStop.r + ratio * (upperStop.r - lowerStop.r));
  const g = Math.round(lowerStop.g + ratio * (upperStop.g - lowerStop.g));
  const b = Math.round(lowerStop.b + ratio * (upperStop.b - lowerStop.b));
  
  return `rgb(${r},${g},${b})`;
}

function generateGradientString(palette) {
  const colorStopsString = palette.scale
    .map(([percentage, color]) => `${color} ${(percentage * 100).toFixed(0)}%`)
    .join(', ');
    
  return `linear-gradient(to right, ${colorStopsString})`;
}

function calculateCentroid(feature) {
  const coordinates = feature.geometry.type === 'Polygon'
    ? feature.geometry.coordinates[0]
    : feature.geometry.coordinates[0][0];
    
  const totalLon = coordinates.reduce((sum, coord) => sum + coord[0], 0);
  const totalLat = coordinates.reduce((sum, coord) => sum + coord[1], 0);
  
  return { 
    lon: totalLon / coordinates.length, 
    lat: totalLat / coordinates.length 
  };
}

// update de la interfaz
function renderStatistics(geoJson) {
  const densities = geoJson.features.map(feature => feature.properties.densidad);
  const uniqueCommunes = new Set(geoJson.features.map(feature => feature.properties.nombre_comuna));
  
  const maxDensity = Math.max(...densities);
  const averageDensity = densities.reduce((sum, val) => sum + val, 0) / densities.length;

  document.getElementById('s-zonas').textContent = geoJson.features.length.toLocaleString('es-CL');
  document.getElementById('s-comunas').textContent = uniqueCommunes.size;
  document.getElementById('s-max').textContent = maxDensity.toFixed(1);
  document.getElementById('s-avg').textContent = averageDensity.toFixed(2);
}

function updateLegend(paletteKey) {
  const palette = PALETTES[paletteKey];
  
  document.getElementById('leg-bar').style.background = generateGradientString(palette);

  const swatchContainer = document.getElementById('swatch-preview');
  swatchContainer.innerHTML = palette.preview
    .map(color => `<div class="swatch-dot" style="background:${color}"></div>`)
    .join('');
}

function buildMap(geoJson, paletteKey) {
  const palette = PALETTES[paletteKey];
  const features = geoJson.features;
  
  // Extraccion
  const ids = features.map((_, index) => index);
  const communeNames = features.map(feature => feature.properties.nombre_comuna);
  const geocodes = features.map(feature => feature.properties.geocodigo);
  const densities = features.map(feature => feature.properties.densidad);

  // ID para cda feature
  const clonedGeoJson = JSON.parse(JSON.stringify(geoJson));
  clonedGeoJson.features.forEach((feature, index) => { 
    feature.id = index; 
  });

  // etiquetas por comuna
  const communeDataMap = {};
  
  features.forEach(feature => {
    const name = feature.properties.nombre_comuna;
    const density = feature.properties.densidad;
    const centroid = calculateCentroid(feature);
    
    if (!communeDataMap[name]) {
      communeDataMap[name] = { lons: [], lats: [], densities: [] };
    }
    
    communeDataMap[name].lons.push(centroid.lon);
    communeDataMap[name].lats.push(centroid.lat);
    communeDataMap[name].densities.push(density);
  });

  const labelLons = [];
  const labelLats = [];
  const labelTexts = [];

  Object.entries(communeDataMap).forEach(([name, data]) => {
    const avgLon = data.lons.reduce((a, b) => a + b, 0) / data.lons.length;
    const avgLat = data.lats.reduce((a, b) => a + b, 0) / data.lats.length;
    const avgDensity = (data.densities.reduce((a, b) => a + b, 0) / data.densities.length).toFixed(1);
    
    labelLons.push(avgLon);
    labelLats.push(avgLat);
    labelTexts.push(`<b>${name}</b><br>${avgDensity} z/km²`);
  });

  // --- Configuración de Trazos de Plotly ---
  const mapTrace = {
    type: 'choroplethmapbox',
    geojson: clonedGeoJson,
    locations: ids,
    z: densities,
    colorscale: palette.scale,
    zmin: 0,
    zmax: MAX_DENSITY,
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
    customdata: communeNames.map((name, index) => [name, geocodes[index], densities[index]]),
    hovertemplate: '<extra></extra>',
    name: '',
  };

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

  const mapLayout = {
    mapbox: {
      style: 'carto-positron', // Fondo claro
      center: MAP_CENTER,
      zoom: 10,
      fitbounds: 'locations',
    },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor:  'rgba(0,0,0,0)',
    margin: { t: 0, b: 0, l: 0, r: 40 },
    font: { family: 'Syne', color: '#1a1730' },
  };

  const mapConfig = {
    responsive: true,
    displayModeBar: false,
    scrollZoom: false,
    doubleClick: false,
    dragmode: false,
    displayLogo: false,
  };

  // Renderizar
  Plotly.newPlot('map', [mapTrace], mapLayout, mapConfig);
  // Plotly.newPlot('map', [mapTrace, etiquetas], mapLayout, mapConfig);

  setupMapInteractions();
}

// Interacción mapa
function setupMapInteractions() {
  const mapElement = document.getElementById('map');
  const hoverPanel = document.getElementById('hover-panel');

  // Bloquear drag completamente después de renderizar
  mapElement.addEventListener('mousedown', event => event.stopPropagation(), true);
  mapElement.addEventListener('touchstart', event => event.stopPropagation(), true);

  mapElement.on('plotly_hover', (data) => {
    const point = data.points[0];
    if (!point || point.customdata === undefined) return;
    
    const [commune, geocode, density] = point.customdata;
    
    document.getElementById('hp-name').textContent = commune;
    document.getElementById('hp-dens').textContent = `${density.toFixed(3)} zonas/km²`;
    document.getElementById('hp-geo').textContent = geocode;
    
    hoverPanel.classList.add('visible');
  });

  mapElement.on('plotly_unhover', () => {
    hoverPanel.classList.remove('visible');
  });
}

function setupPaletteToggle() {
  const toggleButton = document.getElementById('toggle-palette');
  
  toggleButton.addEventListener('click', () => {
    currentPaletteKey = currentPaletteKey === 'default' ? 'viridis' : 'default';
    
    toggleButton.classList.toggle('active', currentPaletteKey === 'viridis');
    updateLegend(currentPaletteKey);
    updateMapTracePalette(currentPaletteKey);
  });
}

function updateMapTracePalette(paletteKey) {
  const palette = PALETTES[paletteKey];
  
  Plotly.restyle('map', {
    colorscale: [palette.scale],
    zmax: [MAX_DENSITY],
  }, [0]);
}

async function initializeApp() {
  try {
    const response = await fetch('zonas_densidad.geojson');
    
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }
    
    geoJsonData = await response.json();

    renderStatistics(geoJsonData);
    updateLegend(currentPaletteKey);
    buildMap(geoJsonData, currentPaletteKey);
    setupPaletteToggle();

    // document.getElementById('loading').classList.add('hidden');
    
  } catch (error) {
    console.error("Error al cargar los datos del mapa:", error);
  }
}

window.addEventListener('DOMContentLoaded', initializeApp);