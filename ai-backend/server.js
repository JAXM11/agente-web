const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });
const chat = require('./chat');

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(cors());

app.post('/api/chat', chat);
app.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Solicitud demasiado grande.' });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
  console.error('Error del servidor:', error.message);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
}

module.exports = app;
