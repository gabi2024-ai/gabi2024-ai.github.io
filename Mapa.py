import requests
from pathlib import Path

import geopandas as gpd
import matplotlib.pyplot as plt
import pandas as pd


# ============================================================
# 1. DESCARGA DEL GEOJSON DE ZONAS
# ============================================================

URL_ZONAS = "https://raw.githubusercontent.com/pachadotdev/chilemapas/master/data_geojson/zonas/r13.geojson"
RUTA_ZONAS = Path("r13_zonas.geojson")

if not RUTA_ZONAS.exists():
    respuesta = requests.get(URL_ZONAS, timeout=60)
    respuesta.raise_for_status()
    RUTA_ZONAS.write_bytes(respuesta.content)


# ============================================================
# 2. CARGA DE DATOS
# ============================================================

zonas = gpd.read_file(RUTA_ZONAS)

# Asegurar que los códigos sean texto
zonas["codigo_comuna"] = zonas["codigo_comuna"].astype(str)
zonas["codigo_region"] = zonas["codigo_region"].astype(str)
zonas["geocodigo"] = zonas["geocodigo"].astype(str)

# Reparación geométrica simple
zonas["geometry"] = zonas.buffer(0)


# ============================================================
# 3. COMUNAS URBANAS SEGÚN EL TUTORIAL
# ============================================================

# Lista exacta del tutorial, pero aquí con códigos para no depender
# de nombres con o sin tildes.
COMUNAS_URBANAS = {
    "13124": "Pudahuel",
    "13103": "Cerro Navia",
    "13104": "Conchalí",
    "13112": "La Pintana",
    "13105": "El Bosque",
    "13106": "Estación Central",
    "13121": "Pedro Aguirre Cerda",
    "13127": "Recoleta",
    "13108": "Independencia",
    "13110": "La Florida",
    "13122": "Peñalolén",
    "13114": "Las Condes",
    "13115": "Lo Barnechea",
    "13126": "Quinta Normal",
    "13119": "Maipú",
    "13118": "Macul",
    "13120": "Ñuñoa",
    "13201": "Puente Alto",
    "13125": "Quilicura",
    "13128": "Renca",
    "13401": "San Bernardo",
    "13130": "San Miguel",
    "13111": "La Granja",
    "13123": "Providencia",
    "13101": "Santiago",
    "13129": "San Joaquín",
    "13116": "Lo Espejo",
    "13113": "La Reina",
    "13131": "San Ramón",
    "13109": "La Cisterna",
    "13117": "Lo Prado",
    "13102": "Cerrillos",
    "13132": "Vitacura",
    "13107": "Huechuraba",
    "13203": "San José de Maipo",
}

# Islas urbanas exactas que el tutorial elimina manualmente
ISLAS_URBANAS = {
    "13124071004", "13124071005", "13124081001",
    "13124071001", "13124071002", "13124071003",   # Pudahuel
    "13401121001",                                  # San Bernardo
    "13119131001",                                  # Maipú
    "13203031000", "13203031001", "13203031002",
    "13203011001", "13203011002"                   # San José de Maipo
}


# ============================================================
# 4. FILTRADO Y UNIÓN DE ZONAS POR COMUNA
# ============================================================

mapa = zonas.loc[
    (zonas["codigo_region"] == "13")
    & (zonas["codigo_comuna"].isin(COMUNAS_URBANAS.keys()))
    & (~zonas["geocodigo"].isin(ISLAS_URBANAS))
].copy()

# Disolver zonas por comuna
mapa = mapa.dissolve(by="codigo_comuna", as_index=False)

# Agregar nombres
mapa["nombre"] = mapa["codigo_comuna"].map(COMUNAS_URBANAS)

# Eliminar posibles geometrías vacías
mapa = mapa[mapa.geometry.notna() & (~mapa.geometry.is_empty)].copy()

# Simplificación suave para parecerse más al tutorial
# Puedes probar con 0 si no quieres simplificar nada
mapa = mapa.to_crs(32719)
mapa["geometry"] = mapa.geometry.simplify(120, preserve_topology=True)

# Tamaño para etiquetas
mapa["area_m2"] = mapa.geometry.area

# Puntos para etiquetas
puntos = mapa.representative_point()


# ============================================================
# 5. AJUSTES DE ETIQUETAS
# ============================================================

ETIQUETAS = {
    "Estación Central": "Estación\nCentral",
    "Pedro Aguirre Cerda": "Pedro\nAguirre\nCerda",
    "Quinta Normal": "Quinta\nNormal",
    "San Joaquín": "San\nJoaquín",
    "San Miguel": "San\nMiguel",
    "San Ramón": "San\nRamón",
    "Lo Espejo": "Lo\nEspejo",
    "San José de Maipo": "San José\nde Maipo",
}

AJUSTES = {
    "Conchalí": (0, 1100),
    "Huechuraba": (0, 1200),
    "Recoleta": (1000, -200),
    "Independencia": (0, 900),
    "Providencia": (1000, 250),
    "Vitacura": (0, 800),
    "Lo Prado": (0, 700),
    "Estación Central": (0, -1100),
    "Pedro Aguirre Cerda": (0, -1000),
    "San Miguel": (0, -700),
    "San Ramón": (0, -700),
    "La Granja": (1200, 0),
    "San José de Maipo": (2500, -1500),
}

def texto_etiqueta(nombre):
    return ETIQUETAS.get(nombre, nombre)

def tamano_fuente(area_m2):
    if area_m2 < 8_000_000:
        return 8
    if area_m2 < 18_000_000:
        return 9
    return 10


# ============================================================
# 6. GRÁFICO
# ============================================================

fig, ax = plt.subplots(figsize=(9, 9))
fig.patch.set_facecolor("#e9e9e9")
ax.set_facecolor("#e9e9e9")

mapa.plot(
    ax=ax,
    color="blueviolet",
    edgecolor="white",
    linewidth=1.0
)

for idx, fila in mapa.iterrows():
    nombre = fila["nombre"]
    punto = puntos.loc[idx]
    dx, dy = AJUSTES.get(nombre, (0, 0))

    ax.text(
        punto.x + dx,
        punto.y + dy,
        texto_etiqueta(nombre),
        ha="center",
        va="center",
        fontsize=tamano_fuente(fila["area_m2"]),
        color="white",
        fontweight="bold"
    )

ax.set_axis_off()
ax.set_aspect("equal")

xmin, ymin, xmax, ymax = mapa.total_bounds
mx = (xmax - xmin) * 0.04
my = (ymax - ymin) * 0.04

ax.set_xlim(xmin - mx, xmax + mx)
ax.set_ylim(ymin - my, ymax + my)

plt.tight_layout()
plt.show()

# Para guardar:
plt.savefig("mapa_urbano_santiago_tutorial.png", dpi=300, bbox_inches="tight", facecolor="#e9e9e9")
