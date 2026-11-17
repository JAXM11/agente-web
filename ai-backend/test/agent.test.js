const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runAgent } = require('../agent');

function toolCall(name, args = '{}') {
  return { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name, arguments: args } }] };
}

test('el agente ejecuta la herramienta y entrega sus resultados al modelo', async () => {
  const requests = [];
  const client = { chat: { completions: { create: async body => {
    requests.push(structuredClone(body));
    return { choices: [{ message: requests.length === 1
      ? toolCall('buscar_peliculas', '{"limite":3}')
      : { content: 'Resultado basado en la consulta.' } }] };
  } } } };
  const result = await runAgent([{ role: 'user', content: 'Recomiéndame películas.' }], {
    client,
    executeTool: async (name, args) => {
      assert.equal(name, 'buscar_peliculas');
      assert.equal(args.limite, 3);
      return { categoria: 'Action', duracion_minima: 120, tienda_id: null, peliculas: [{ titulo: 'STORY SIDE', total_alquileres: 28 }] };
    },
  });
  assert.equal(requests[0].messages[0].role, 'system');
  assert.equal(requests[0].tools.length, 3);
  assert.equal(requests[1].tools.length, 3);
  const toolResult = requests[1].messages.at(-1);
  assert.equal(toolResult.role, 'tool');
  assert.equal(toolResult.tool_call_id, 'call_1');
  assert.equal(JSON.parse(toolResult.content).peliculas[0].total_alquileres, 28);
  assert.deepEqual(result.toolsUsed, ['buscar_peliculas']);
  assert.ok(result.reply.includes('Ambas tiendas'));
  assert.ok(result.reply.includes('duración mayor a 120 minutos'));
});

test('una herramienta desconocida, JSON inválido o error SQL no expone detalles internos', async () => {
  for (const call of [toolCall('ejecutar_sql'), toolCall('buscar_peliculas', '{'), toolCall('buscar_peliculas')]) {
    let count = 0;
    const client = { chat: { completions: { create: async body => {
      if (count++ === 0) return { choices: [{ message: call }] };
      const result = JSON.parse(body.messages.at(-1).content);
      assert.match(result.error, /No se pudo ejecutar/);
      assert.ok(!result.error.includes('secreto'));
      return { choices: [{ message: { content: 'No pude obtener datos de Sakila.' } }] };
    } } } };
    const answer = await runAgent([], { client, executeTool: async () => { throw Error('secreto de conexión'); } });
    assert.deepEqual(answer.toolsUsed, []);
  }
});

test('limita los ciclos si el modelo solicita herramientas indefinidamente', async () => {
  let calls = 0;
  const client = { chat: { completions: { create: async () => {
    calls++;
    return { choices: [{ message: toolCall('buscar_peliculas') }] };
  } } } };
  await assert.rejects(runAgent([], { client, executeTool: async () => ({ peliculas: [] }) }), /límite de consultas/);
  assert.equal(calls, 5);
});

test('conserva la fecha histórica, umbral y tamaño de muestra aunque el modelo los omita', async () => {
  let count = 0;
  const client = { chat: { completions: { create: async () => ({ choices: [{ message: count++ === 0
    ? toolCall('analizar_clientes_inactivos')
    : { content: 'Estos clientes muestran inactividad.' } }] }) } } };
  const result = await runAgent([], { client, executeTool: async () => ({
    fecha_referencia: '2006-02-14', dias_inactividad: 60, total_candidatos: 430,
    clientes: [{ nombre: 'Ejemplo' }], tienda_id: null,
  }) });
  for (const text of ['2006-02-14', '60 días', '430', 'ejemplos devueltos: 1', 'no confirma abandono']) {
    assert.ok(result.reply.includes(text));
  }
});
