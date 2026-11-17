require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env'), quiet: true });
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../sakila');
const { executeTool } = require('../sakila-tools');
after(() => db.close());

test('la conexión utiliza una cuenta dedicada con permisos de solo lectura', async () => {
  const [account] = await db.query('SELECT CURRENT_USER() AS cuenta');
  assert.ok(account.cuenta.startsWith('sakila_agent@'));
  const grants = (await db.query('SHOW GRANTS')).flatMap(Object.values);
  assert.ok(grants.some(grant => /GRANT SELECT ON `sakila`\.\*/.test(grant)));
  assert.ok(grants.every(grant => !/GRANT (ALL|INSERT|UPDATE|DELETE|CREATE|DROP|EXECUTE)/.test(grant)));
});

test('recomendaciones reales de Action, duración >120 y alquileres descendentes', async () => {
  const result = await executeTool('buscar_peliculas', {});
  assert.equal(result.peliculas.length, 3);
  for (const [index, film] of result.peliculas.entries()) {
    assert.equal(film.categoria, 'Action');
    assert.ok(film.duracion_minutos > 120);
    const [count] = await db.query('SELECT COUNT(*) AS cantidad FROM rental r JOIN inventory i ON i.inventory_id = r.inventory_id WHERE i.film_id = ?', [film.film_id]);
    assert.equal(film.total_alquileres, count.cantidad);
    if (index) assert.ok(result.peliculas[index - 1].total_alquileres >= film.total_alquileres);
  }
});

test('la inactividad usa la fecha histórica y los candidatos se particionan por tienda', async () => {
  const result = await executeTool('analizar_clientes_inactivos', {});
  const [reference] = await db.query('SELECT DATE(MAX(rental_date)) AS fecha FROM rental');
  assert.equal(result.fecha_referencia, reference.fecha);
  assert.ok(result.clientes.every(client => client.ultimo_alquiler === null || client.dias_sin_alquilar >= 60));
  assert.ok(result.total_candidatos >= result.clientes.length);
  const first = await executeTool('analizar_clientes_inactivos', { tienda_id: 1 });
  const second = await executeTool('analizar_clientes_inactivos', { tienda_id: 2 });
  assert.equal(first.total_candidatos + second.total_candidatos, result.total_candidatos);
  assert.ok(first.clientes.every(client => client.tienda_id === 1));
  assert.ok(second.clientes.every(client => client.tienda_id === 2));
});

test('los totales semanales coinciden con toda la base sin duplicar pagos', async () => {
  const result = await executeTool('analizar_movimiento_semanal', {});
  const [totals] = await db.query('SELECT (SELECT COUNT(*) FROM rental) AS alquileres, (SELECT SUM(amount) FROM payment) AS ingresos');
  assert.equal(result.dias.length, 7);
  assert.equal(result.dias.reduce((sum, day) => sum + Number(day.total_alquileres), 0), totals.alquileres);
  const income = result.dias.reduce((sum, day) => sum + day.recaudacion_total, 0);
  assert.ok(Math.abs(income - totals.ingresos) < 0.01);
  for (const day of result.dias) {
    assert.ok(Math.abs(day.recaudacion_promedio_dia_calendario - day.recaudacion_total / day.dias_calendario) <= 0.0051);
    assert.ok(day.dias_calendario >= day.dias_con_pagos);
  }
  const first = await executeTool('analizar_movimiento_semanal', { tienda_id: 1 });
  const second = await executeTool('analizar_movimiento_semanal', { tienda_id: 2 });
  for (const day of result.dias) {
    const a = first.dias.find(item => item.dia === day.dia);
    const b = second.dias.find(item => item.dia === day.dia);
    assert.equal(Number(a.total_alquileres) + Number(b.total_alquileres), Number(day.total_alquileres));
    assert.ok(Math.abs(a.recaudacion_total + b.recaudacion_total - day.recaudacion_total) < 0.01);
  }
});

test('rechaza herramientas arbitrarias, parámetros SQL y límites inválidos', async () => {
  for (const [name, args] of [
    ['ejecutar_sql', { sql: 'DROP TABLE film' }],
    ['buscar_peliculas', { sql: 'SELECT 1' }],
    ['buscar_peliculas', { limite: 100000 }],
    ['analizar_clientes_inactivos', { dias_inactividad: -1 }],
    ['analizar_movimiento_semanal', { tienda_id: 3 }],
  ]) await assert.rejects(executeTool(name, args));
});
