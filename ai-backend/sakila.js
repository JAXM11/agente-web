const mysql = require('mysql2/promise');

let pool;
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'sakila_agent',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'sakila',
      connectionLimit: 4,
      connectTimeout: 5000,
      dateStrings: true,
      decimalNumbers: true,
      multipleStatements: false,
      charset: 'utf8mb4',
    });
  }
  return pool;
}

async function query(sql, parameters = []) {
  const [rows] = await getPool().execute(sql, parameters);
  return rows;
}

async function close() {
  if (pool) {
    const current = pool;
    pool = undefined;
    await current.end();
  }
}

module.exports = { query, close };
