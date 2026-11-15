// Local dev server: mounts the same Vercel handlers used in production.
import 'dotenv/config'
import express, { type Request, type Response } from 'express'
import cors from 'cors'
import type { VercelRequest, VercelResponse } from '@vercel/node'

import routes from '../api/routes.js'
import routeById from '../api/routes/[id].js'
import notes from '../api/notes.js'
import noteById from '../api/notes/[id].js'
import searchHistory from '../api/search-history.js'
import authStrava from '../api/auth/strava.js'
import authCallback from '../api/auth/callback.js'
import authMe from '../api/auth/me.js'
import stravaRoutes from '../api/strava/routes.js'
import stravaStatus from '../api/strava/status.js'
import stravaUserActivities from '../api/strava/user-activities.js'
import { getPool, setupDB } from '../api/_db.js'

type Handler = (req: VercelRequest, res: VercelResponse) => unknown

const app = express()

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5180', 'http://localhost:4173']

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }))
app.use(express.json({ limit: '1mb' }))

// Vercel merges path params into req.query; Express 5 exposes query as a getter, so shadow it per request
function mount(handler: Handler) {
  return async (req: Request, res: Response) => {
    Object.defineProperty(req, 'query', { value: { ...req.query, ...req.params }, writable: true })
    await handler(req as unknown as VercelRequest, res as unknown as VercelResponse)
  }
}

app.all('/api/routes', mount(routes))
app.all('/api/routes/:id', mount(routeById))
app.all('/api/notes', mount(notes))
app.all('/api/notes/:id', mount(noteById))
app.all('/api/search-history', mount(searchHistory))
app.all('/api/search-history/:id', mount(searchHistory))
app.all('/api/auth/strava', mount(authStrava))
app.all('/api/auth/callback', mount(authCallback))
app.all('/api/auth/me', mount(authMe))
app.all('/api/strava/routes', mount(stravaRoutes))
app.all('/api/strava/status', mount(stravaStatus))
app.all('/api/strava/user-activities', mount(stravaUserActivities))

const port = Number(process.env.API_PORT) || 3002
app.listen(port, () => {
  console.log(`RutasMap API running on http://localhost:${port}`)
  setupDB().catch(err => console.error('[setupDB]', err))
  setInterval(() => getPool().query('SELECT 1').catch(() => {}), 4 * 60 * 1000)
})
