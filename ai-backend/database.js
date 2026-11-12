const { DatabaseSync } = require('node:sqlite');
const { mkdirSync } = require('node:fs');
const path = require('node:path');

const databasePath = process.env.CHAT_DB_PATH || path.join(__dirname, 'data', 'chat.sqlite');
if (databasePath !== ':memory:') mkdirSync(path.dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_session ON messages(session_id, id);
`);

const findSession = database.prepare('SELECT id FROM sessions WHERE id = ? AND token_hash = ?');
const readHistory = database.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY id');
const insertSession = database.prepare('INSERT INTO sessions (id, token_hash) VALUES (?, ?)');
const insertMessage = database.prepare('INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)');

module.exports = {
  authorize: (id, hash) => Boolean(findSession.get(id, hash)),
  history: id => readHistory.all(id),
  saveTurn(id, newTokenHash, message, reply) {
    database.exec('BEGIN');
    try {
      if (newTokenHash) insertSession.run(id, newTokenHash);
      insertMessage.run(id, 'user', message);
      insertMessage.run(id, 'assistant', reply);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  },
  close: () => database.close(),
};
