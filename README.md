# RutasMap

Aplicación web para visualizar, analizar y gestionar rutas de entrenamiento en montaña. Diseñada para atletas de trail running, senderismo y ciclismo que quieren explorar sus actividades en un mapa interactivo con métricas detalladas.

![Stack](https://img.shields.io/badge/Stack-React%20%2B%20MapLibre%20%2B%20PostgreSQL-orange)
![Deploy](https://img.shields.io/badge/Deploy-Vercel-black)

---

## Características

### Mapa interactivo
- Visualización de rutas sobre 4 capas: **Liberty** (calle), **Bright**, **Topográfico** y **Satélite**
- Clic sobre cualquier ruta en el mapa para abrir sus detalles directamente
- Cursor indicativo al pasar sobre rutas

### Gestión de rutas
- **Dibujar rutas** a mano sobre el mapa con snapping opcional a carreteras/senderos
- **Importar desde GPX** — arrastrar y soltar o seleccionar archivo
- **Importar desde Strava** — sincronización con actividades almacenadas en base de datos compartida
- **Editar rutas** — arrastrar vértices para ajustar el trazado
- **Borrador (eraser)** — eliminar puntos con radio configurable
- **Exportar a GPX** — compatible con cualquier dispositivo GPS

### Métricas y análisis
- Distancia, desnivel positivo/negativo, altitud máxima y mínima
- Tiempo real (actividades Strava) o estimado (Regla de Naismith)
- Ritmo (min/km) para running/senderismo o velocidad (km/h) para ciclismo
- Nivel de dificultad: Fácil · Moderada · Exigente · Dura · Experta
- Fecha de realización

### Perfil de elevación
- Gráfico interactivo de altimetría con hover sincronizado en el mapa
- Panel redimensionable arrastrando el borde superior
- Carga automática de datos de elevación para rutas sin altimetría

### Filtros del listado
- Por tipo de actividad: Senderismo, Trail Running, Ciclismo
- Por nivel de dificultad (selección múltiple)
- Por rango de distancia

### Clima
- Condiciones meteorológicas actuales en el punto de inicio de cada ruta

### Cuentas, notas y búsqueda
- **Login con Strava** (OAuth) para guardar rutas propias e importar tus actividades
- **Notas georreferenciadas** con foto sobre cualquier punto de una ruta
- **Buscador** de lugares y coordenadas (Nominatim) con historial de las últimas 5 búsquedas
- Compartir ruta por enlace (`?route=<id>`)

### Privacidad
- Los primeros 200 m de cada ruta se ocultan automáticamente para proteger la ubicación de salida

---

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Mapa | MapLibre GL JS |
| Estilos | Tailwind CSS v4 |
| Estado | Zustand |
| Gráficos | Recharts |
| Backend | Vercel Serverless Functions (`api/`); en local se montan sobre Express (`scripts/dev-server.ts`) |
| Base de datos | PostgreSQL 16 (Docker en local) |
| Auth | Strava OAuth + JWT HS256 |
| Elevación | Tiles Terrarium (AWS Open Data) |
| Clima | Open-Meteo |
| Routing snap | OSRM |
| Geocoding | Nominatim (OpenStreetMap) |
| Tiles de mapa | OpenFreeMap / OpenTopoMap / ESRI |
| Tests | Vitest |

Ninguna API de mapas, clima o elevación requiere key de pago.

---

## Estructura del proyecto

```
RutasMap/
├── api/                        # Funciones serverless (una por archivo)
│   ├── _db.ts                  # Pool PostgreSQL + esquema idempotente
│   ├── _http.ts                # Helpers: cookies, validación, admins
│   ├── auth/                   # strava (inicio OAuth), callback, me, _jwt
│   ├── routes.ts, routes/[id].ts
│   ├── notes.ts, notes/[id].ts
│   ├── search-history.ts
│   └── strava/                 # routes (BD compartida), user-activities, status
├── scripts/dev-server.ts       # Express local que monta los mismos handlers
├── src/
│   ├── components/             # Map, RouteEditor, ElevationProfile, Strava, Weather, Auth, Toasts
│   ├── hooks/                  # useRouteEditor, useElevationFetch, useIsMobile
│   ├── services/               # api (cliente), elevation, routing, strava, weather, mapInstance
│   ├── store/                  # route, map, auth, authModal, note, toast (Zustand)
│   ├── types/
│   └── utils/                  # gpxParser, routeMetrics, geometry, imageCompress, nanoid
└── vercel.json
```

---

## Instalación y uso local

Requisitos: Node.js 20+ y Docker Desktop.

```bash
npm install
cp .env.example .env        # completar STRAVA_* y JWT_SECRET
docker compose up -d db     # Postgres 16 en localhost:5434 (con datos de ejemplo)
npm run dev                 # API (tsx watch, :3002) + Vite (:5180)
```

O todo en contenedores: `docker compose --profile app up`.

- La app abre en `http://localhost:5180` y Vite proxya `/api` a `http://localhost:3002`.
- Al primer arranque, `docker/postgres/init/` crea `strava_activities` con 6 actividades de ejemplo; las tablas `rutasmap_*` las crea la API sola.
- Reiniciar la base desde cero: `docker compose down -v && docker compose up -d db`.
- Para el login, registra `localhost` como *Authorization Callback Domain* en tu app de Strava.

| Script | Uso |
|--------|-----|
| `npm run dev` | API + frontend con recarga |
| `npm test` | Tests unitarios (Vitest) |
| `npm run typecheck` | Tipos de frontend y API |
| `npm run build` | Build de producción |

Las variables de entorno están documentadas en [`.env.example`](.env.example).

---

## Despliegue en Vercel

Configura en *Settings → Environment Variables*: `DB_*`, `JWT_SECRET` (**obligatorio**, la API falla sin él en producción), `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `APP_URL`, `FRONTEND_URL`, `ADMIN_STRAVA_ID` / `ADMIN_EMAILS`.
**No incluyas `DB_SSL_REJECT_UNAUTHORIZED`** en producción.

---

## Base de datos

En local corre en Docker (`docker-compose.yml`). `strava_activities` replica la tabla que antes sincronizaba **AnalisisStrava**. El esquema de `rutasmap_*` se crea/migra automáticamente en el primer request.

| Tabla | Descripción |
|-------|-------------|
| `rutasmap_routes` | Rutas (dueño en `user_id`) |
| `rutasmap_users` | Usuarios Strava y tokens OAuth |
| `rutasmap_waypoint_notes` | Notas con foto por punto (autor en `user_id`) |
| `rutasmap_search_history` | Últimas 5 búsquedas por usuario |
| `strava_activities` | Actividades sincronizadas por AnalisisStrava (solo lectura) |

---

## Seguridad

- Escritura protegida por JWT; editar/borrar rutas solo dueño o admin; notas: autor, dueño de la ruta o admin
- Firma JWT verificada en tiempo constante; `JWT_SECRET` obligatorio en producción
- OAuth con `state` verificado vía cookie HttpOnly; el token vuelve en el fragmento `#` (no llega a logs ni `Referer`)
- Validación de payloads (ids, coordenadas, colores, tamaño de fotos y rutas)
- SSL hacia la BD, CORS restringido y headers de seguridad vía `vercel.json`
