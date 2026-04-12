import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuth } from './_jwt.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  const user = getAuth(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })
  res.json({ id: user.sub, stravaId: user.stravaId, name: user.name, pic: user.pic, isAdmin: user.isAdmin })
}
