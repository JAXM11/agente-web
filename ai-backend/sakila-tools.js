const db = require('./sakila');

const storeId = { type: 'integer', enum: [1, 2], description: 'Opcional: limita el análisis a la tienda 1 o 2. Sin este parámetro se incluyen ambas.' };
const definitions = [
  {
    type: 'function',
    function: {
      name: 'buscar_peliculas',
      description: 'Consulta Sakila y recomienda películas por categoría y duración, ordenadas por número real de alquileres históricos. Para acción de más de dos horas usa Action, 120 y límite 3.',
      parameters: {
        type: 'object', additionalProperties: false,
        properties: {
          categoria: { type: 'string', minLength: 1, maxLength: 45, description: 'Nombre de categoría en inglés. Por defecto Action.' },
          duracion_minima: { type: 'integer', minimum: 0, maximum: 300, description: 'Duración estrictamente mayor a estos minutos. Por defecto 120.' },
          limite: { type: 'integer', minimum: 1, maximum: 10, description: 'Número de películas. Por defecto 3.' },
          tienda_id: storeId,
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analizar_clientes_inactivos',
      description: 'Busca clientes activos con al menos N días sin alquilar (o sin alquileres), respecto al último alquiler de toda Sakila. Es una señal de riesgo por inactividad, no una predicción de abandono.',
      parameters: {
        type: 'object', additionalProperties: false,
        properties: {
          dias_inactividad: { type: 'integer', minimum: 1, maximum: 3650, description: 'Umbral de días sin alquilar. Por defecto 60.' },
          limite: { type: 'integer', minimum: 1, maximum: 50, description: 'Máximo de clientes mostrados. Por defecto 10; también se devuelve el total de candidatos.' },
          tienda_id: storeId,
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analizar_movimiento_semanal',
      description: 'Cuenta alquileres por día de la semana y calcula recaudación según fecha de pago. Devuelve promedios por día calendario (incluidos días sin actividad) y por día con pagos. Ordena por mayor movimiento. Puede filtrarse por tienda.',
      parameters: { type: 'object', additionalProperties: false, properties: { tienda_id: storeId } },
    },
  },
];

function validate(name, args) {
  const definition = definitions.find(item => item.function.name === name);
  if (!definition) throw new Error('Herramienta no disponible.');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Los argumentos deben ser un objeto JSON.');
  for (const [key, value] of Object.entries(args)) {
    const rule = definition.function.parameters.properties[key];
    if (!Object.hasOwn(definition.function.parameters.properties, key)) throw new Error(`Parámetro no permitido: ${key}`);
    if (rule.type === 'integer' && (!Number.isInteger(value) || value < (rule.minimum ?? 0) || value > (rule.maximum ?? Infinity))) throw new Error(`Valor inválido para ${key}.`);
    if (rule.enum && !rule.enum.includes(value)) throw new Error(`Valor inválido para ${key}.`);
    if (rule.type === 'string' && (typeof value !== 'string' || value.trim().length < rule.minLength || value.length > rule.maxLength)) throw new Error(`Valor inválido para ${key}.`);
  }
}

async function buscarPeliculas({ categoria = 'Action', duracion_minima = 120, limite = 3, tienda_id = null }) {
  const category = ['acción', 'accion'].includes(categoria.toLowerCase().trim()) ? 'Action' : categoria.trim();
  const peliculas = await db.query(`
    SELECT f.film_id, f.title AS titulo, f.length AS duracion_minutos,
           c.name AS categoria, COUNT(r.rental_id) AS total_alquileres,
           COUNT(DISTINCT i.inventory_id) AS copias,
           ROUND(COUNT(r.rental_id) / COUNT(DISTINCT i.inventory_id), 2) AS alquileres_por_copia
    FROM film f
    JOIN film_category fc ON fc.film_id = f.film_id
    JOIN category c ON c.category_id = fc.category_id
    JOIN inventory i ON i.film_id = f.film_id
    LEFT JOIN rental r ON r.inventory_id = i.inventory_id
    WHERE c.name = ? AND f.length > ? AND (? IS NULL OR i.store_id = ?)
    GROUP BY f.film_id, f.title, f.length, c.name
    HAVING COUNT(r.rental_id) > 0
    ORDER BY total_alquileres DESC, alquileres_por_copia DESC, f.film_id
    LIMIT ?`, [category, duracion_minima, tienda_id, tienda_id, limite]);
  return { fuente: 'sakila', criterio: 'Mayor número de alquileres históricos; duración estrictamente mayor al mínimo.', categoria: category, duracion_minima, tienda_id, peliculas };
}

async function analizarClientes({ dias_inactividad = 60, limite = 10, tienda_id = null }) {
  const [reference] = await db.query('SELECT DATE(MAX(rental_date)) AS fecha_referencia FROM rental');
  if (!reference.fecha_referencia) return { fuente: 'sakila', fecha_referencia: null, total_candidatos: 0, clientes: [] };
  const rows = await db.query(`
    WITH candidatos AS (
      SELECT c.customer_id, CONCAT(c.first_name, ' ', c.last_name) AS nombre,
             c.store_id AS tienda_id, DATE(MAX(r.rental_date)) AS ultimo_alquiler,
             DATEDIFF(?, MAX(r.rental_date)) AS dias_sin_alquilar,
             COUNT(r.rental_id) AS total_alquileres
      FROM customer c
      LEFT JOIN rental r ON r.customer_id = c.customer_id
      WHERE c.active = 1 AND (? IS NULL OR c.store_id = ?)
      GROUP BY c.customer_id, c.first_name, c.last_name, c.store_id
      HAVING MAX(r.rental_date) IS NULL OR dias_sin_alquilar >= ?
    )
    SELECT candidatos.*, COUNT(*) OVER() AS total_candidatos
    FROM candidatos
    ORDER BY ultimo_alquiler IS NULL DESC, dias_sin_alquilar DESC, customer_id
    LIMIT ?`, [reference.fecha_referencia, tienda_id, tienda_id, dias_inactividad, limite]);
  return {
    fuente: 'sakila', fecha_referencia: reference.fecha_referencia, dias_inactividad, tienda_id,
    criterio: 'Clientes activos con al menos el umbral de días sin alquilar, o sin alquileres. Indicador de inactividad, no probabilidad de abandono.',
    total_candidatos: rows[0]?.total_candidatos || 0,
    clientes: rows.map(({ total_candidatos, ...customer }) => customer),
  };
}

async function analizarSemana({ tienda_id = null }) {
  const rows = await db.query(`
    WITH RECURSIVE limites AS (
      SELECT LEAST((SELECT DATE(MIN(rental_date)) FROM rental), (SELECT DATE(MIN(payment_date)) FROM payment)) AS inicio,
             GREATEST((SELECT DATE(MAX(rental_date)) FROM rental), (SELECT DATE(MAX(payment_date)) FROM payment)) AS fin
    ), calendario AS (
      SELECT inicio AS fecha FROM limites WHERE inicio IS NOT NULL
      UNION ALL
      SELECT DATE_ADD(fecha, INTERVAL 1 DAY) FROM calendario, limites WHERE fecha < fin
    ), alquileres AS (
      SELECT DATE(r.rental_date) AS fecha, COUNT(*) AS cantidad
      FROM rental r JOIN inventory i ON i.inventory_id = r.inventory_id
      WHERE (? IS NULL OR i.store_id = ?)
      GROUP BY DATE(r.rental_date)
    ), pagos AS (
      SELECT DATE(p.payment_date) AS fecha, SUM(p.amount) AS importe
      FROM payment p
      LEFT JOIN rental r ON r.rental_id = p.rental_id
      LEFT JOIN inventory i ON i.inventory_id = r.inventory_id
      JOIN staff s ON s.staff_id = p.staff_id
      WHERE (? IS NULL OR COALESCE(i.store_id, s.store_id) = ?)
      GROUP BY DATE(p.payment_date)
    )
    SELECT WEEKDAY(c.fecha) AS dia_indice,
           (SELECT inicio FROM limites) AS periodo_inicio, (SELECT fin FROM limites) AS periodo_fin,
           COUNT(*) AS dias_calendario, SUM(COALESCE(a.cantidad, 0) > 0) AS dias_con_alquileres,
           SUM(COALESCE(p.importe, 0) > 0) AS dias_con_pagos,
           SUM(COALESCE(a.cantidad, 0)) AS total_alquileres,
           ROUND(AVG(COALESCE(a.cantidad, 0)), 2) AS promedio_alquileres_dia_calendario,
           ROUND(SUM(COALESCE(p.importe, 0)), 2) AS recaudacion_total,
           ROUND(AVG(COALESCE(p.importe, 0)), 2) AS recaudacion_promedio_dia_calendario,
           ROUND(SUM(COALESCE(p.importe, 0)) / NULLIF(SUM(COALESCE(p.importe, 0) > 0), 0), 2) AS recaudacion_promedio_dia_con_pagos
    FROM calendario c
    LEFT JOIN alquileres a ON a.fecha = c.fecha
    LEFT JOIN pagos p ON p.fecha = c.fecha
    GROUP BY WEEKDAY(c.fecha)
    ORDER BY total_alquileres DESC, dia_indice`, [tienda_id, tienda_id, tienda_id, tienda_id]);
  const days = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  return {
    fuente: 'sakila', tienda_id,
    periodo_inicio: rows[0]?.periodo_inicio || null, periodo_fin: rows[0]?.periodo_fin || null,
    criterio: 'Movimiento = alquileres por fecha de alquiler. Recaudación = pagos por fecha de pago. Promedio calendario incluye días sin actividad; promedio con pagos excluye esos días. Importes en unidades monetarias de Sakila, sin moneda especificada.',
    dias: rows.map(({ dia_indice, periodo_inicio, periodo_fin, ...row }) => ({ dia: days[dia_indice], ...row })),
  };
}

async function executeTool(name, args) {
  validate(name, args);
  if (name === 'buscar_peliculas') return buscarPeliculas(args);
  if (name === 'analizar_clientes_inactivos') return analizarClientes(args);
  return analizarSemana(args);
}

module.exports = { definitions, executeTool };
