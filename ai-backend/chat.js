const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { OpenAI } = require('openai');
const store = require('./database');

const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: { 'X-Title': 'Mi Aplicativo Web' },
});
const activeSessions = new Set();
const hashToken = token => createHash('sha256').update(token).digest('hex');

async function chat(req, res) {
  const { message, sessionId } = req.body || {};
  if (typeof message !== 'string' || !message.trim() || message.length > 10000) {
    return res.status(400).json({ error: 'El mensaje debe contener entre 1 y 10000 caracteres.' });
  }
  if (sessionId !== undefined && (typeof sessionId !== 'string' || !/^[a-f0-9-]{36}$/.test(sessionId))) {
    return res.status(400).json({ error: 'Sesión inválida.' });
  }

  // Cada sesión exige su propio token; el cliente no decide el historial del modelo.
  let sessionToken;
  if (sessionId) {
    const authorization = req.get('Authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token || !store.authorize(sessionId, hashToken(token))) {
      return res.status(403).json({ error: 'No tienes acceso a esta sesión.' });
    }
  } else {
    sessionToken = randomBytes(32).toString('hex');
  }

  const id = sessionId || randomUUID();
  if (activeSessions.has(id)) {
    return res.status(409).json({ error: 'Espera a que termine la respuesta anterior.' });
  }
  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'tu_api_key_de_openrouter_aqui') {
    return res.status(503).json({ error: 'Configura OPENROUTER_API_KEY en el archivo .env del backend.' });
  }

  activeSessions.add(id);
  try {
    const messages = [...store.history(id), { role: 'user', content: message.trim() }];
    const completion = await openrouter.chat.completions.create({
      model: 'openai/gpt-4o-mini',
      messages,
    });
    const reply = completion.choices[0]?.message?.content;
    if (typeof reply !== 'string' || !reply.trim()) throw new Error('Respuesta vacía del proveedor');

    store.saveTurn(id, sessionToken ? hashToken(sessionToken) : null, message.trim(), reply);
    // Respuesta normal JSON, una de las alternativas del diagrama.
    res.json({ reply, sessionId: id, ...(sessionToken ? { sessionToken } : {}) });
  } catch (error) {
    console.error('Error al procesar el chat:', error.message);
    res.status(500).json({ error: 'Error interno al procesar la solicitud con la IA' });
  } finally {
    activeSessions.delete(id);
  }
}

module.exports = chat;
