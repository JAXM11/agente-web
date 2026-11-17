# Agente web con IA

Práctica 6: integración de un agente de inteligencia artificial en un aplicativo web. Incluye un chat en JavaScript, un backend con Express y conexión a OpenRouter usando el modelo `openai/gpt-4o-mini`. El agente utiliza herramientas para consultar la base de datos Sakila y analizar películas, inactividad de clientes y movimiento semanal.

## Arquitectura

1. **Cliente:** el navegador muestra el chat en HTML/CSS y ejecuta la lógica de JavaScript.
2. **Comunicación:** Fetch envía los mensajes a `POST /api/chat`.
3. **Backend:** Express valida el mensaje y comprueba el acceso a la sesión mediante un token.
4. **Historial:** SQLite almacena las sesiones y los mensajes. El servidor recupera el historial para construir el contexto del modelo.
5. **Herramientas de Sakila:** el modelo solicita una función; el backend valida sus argumentos y ejecuta una consulta parametrizada en MySQL/MariaDB con un usuario de solo lectura.
6. **Servicio externo:** el backend entrega los resultados a OpenRouter mediante HTTPS para que el modelo redacte la respuesta. La respuesta se devuelve al navegador como JSON.

Se utiliza la opción de respuesta normal del diagrama de arquitectura. La clave de OpenRouter permanece en el backend.

### Cómo selecciona una herramienta el agente

El backend envía al LLM las instrucciones del agente, la pregunta, el historial de la sesión y las definiciones de las herramientas: nombre, descripción y parámetros admitidos. El modelo decide si necesita consultar Sakila y devuelve una solicitud de función, no ejecuta directamente la base de datos.

Por ejemplo, una pregunta sobre películas de acción largas puede producir una llamada a `buscar_peliculas` con estos argumentos:

```json
{
  "categoria": "Action",
  "duracion_minima": 120,
  "limite": 3
}
```

El backend valida la función y sus argumentos, ejecuta la consulta parametrizada y devuelve el resultado al modelo como un mensaje de herramienta. El modelo utiliza esos datos para redactar e interpretar la respuesta. Puede solicitar varias herramientas en un turno, con un máximo de 5 rondas de interacción y 6 llamadas a herramientas.

La selección se realiza mediante llamadas a funciones del modelo, no mediante una lista de palabras clave. Los saludos pueden responderse sin consultar Sakila. El modelo recibe las definiciones y los resultados de las herramientas; no recibe su código fuente ni las credenciales de MySQL.

## Tecnologías

- Frontend: HTML, CSS, JavaScript y Fetch.
- Backend: Node.js, Express, CORS, dotenv y el cliente oficial de OpenAI configurado para OpenRouter.
- Historial del chat: SQLite mediante el módulo integrado `node:sqlite`.
- Datos de negocio: Sakila en MySQL/MariaDB, mediante `mysql2`.

## Estructura

```text
agente-web/
├── ai-backend/
│   ├── .env.example       # Plantilla de configuración
│   ├── server.js          # Servidor y endpoint REST
│   ├── chat.js            # Validación, sesiones y consulta a la IA
│   ├── agent.js           # Instrucciones y ciclo de llamadas a herramientas
│   ├── sakila.js          # Conexión a MySQL/MariaDB
│   ├── sakila-tools.js    # Tres herramientas con consultas parametrizadas
│   ├── database.js        # Persistencia de sesiones y mensajes
│   ├── test/              # Pruebas del agente y consultas reales de Sakila
│   ├── package.json
│   └── package-lock.json
├── ai-frontend/
│   ├── index.html         # Interfaz del chat
│   └── app.js             # Fetch, mensajes e historial del navegador
└── .gitignore
```

La base de datos se crea automáticamente en `ai-backend/data/chat.sqlite` al iniciar el backend.

## Requisitos

- Node.js 22.13.0 o superior, según `package.json`, y npm.
- Una clave de OpenRouter con acceso al modelo `openai/gpt-4o-mini`.
- MySQL 8 o MariaDB 10.4 con la base `sakila` importada y un usuario con permiso `SELECT` sobre ella.
- Conexión a Internet para consultar el modelo.

## Instalación y ejecución

1. Clona el repositorio e instala las dependencias:

   ```powershell
   git clone https://github.com/JAXM11/agente-web.git
   cd agente-web/ai-backend
   npm ci
   ```

2. Crea el archivo de configuración desde la plantilla. En PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

   Este paso es para una instalación nueva. Si ya tienes un `.env` configurado, conserva sus valores y añade únicamente las variables que falten.

3. Edita `ai-backend/.env` y sustituye el valor de ejemplo por tu clave:

   ```dotenv
   PORT=3000
   OPENROUTER_API_KEY=tu_api_key_de_openrouter_aqui
   MYSQL_HOST=127.0.0.1
   MYSQL_PORT=3306
   MYSQL_USER=sakila_agent
   MYSQL_PASSWORD=tu_contrasena_local_de_sakila
   MYSQL_DATABASE=sakila
   ```

   En la laptop de desarrollo, Sakila está importada en MariaDB de XAMPP y las credenciales ya están en el archivo `.env` local. Mantén MySQL de XAMPP encendido. En otra instalación, importa `sakila-schema.sql` y después `sakila-data.sql` en un servidor donde no exista una base Sakila que necesites conservar. Crea la cuenta de consulta desde una sesión administradora, sustituyendo la contraseña de ejemplo:

   ```sql
   CREATE USER 'sakila_agent'@'localhost' IDENTIFIED BY 'tu_contrasena_local_de_sakila';
   GRANT SELECT ON sakila.* TO 'sakila_agent'@'localhost';
   ```

   Usa esa misma contraseña en `MYSQL_PASSWORD`. Las credenciales de MySQL tampoco se envían al navegador o al modelo.

   Los scripts de importación de Sakila se obtienen por separado y no forman parte de este repositorio. SQLite solo guarda las conversaciones; no sustituye a la base Sakila de MySQL/MariaDB.

4. Desde `ai-backend`, inicia el servidor y deja la terminal abierta:

   ```powershell
   npm start
   ```

5. Abre `ai-frontend/index.html` directamente en tu navegador. Escribe un mensaje y pulsa **Enviar** o **Enter**.

El frontend utiliza `http://localhost:3000/api/chat`. Si cambias `PORT`, actualiza también esa dirección en `ai-frontend/app.js`.

## Herramientas del agente

| Herramienta | Consulta y criterios |
| --- | --- |
| `buscar_peliculas` | Categoría, duración estrictamente mayor al mínimo y ranking por cantidad de alquileres históricos. Por defecto: Action, más de 120 minutos y 3 películas. |
| `analizar_clientes_inactivos` | Clientes activos con al menos 60 días sin alquilar, o sin alquileres. Devuelve el total de candidatos y hasta 10 ejemplos por defecto. |
| `analizar_movimiento_semanal` | Alquileres e ingresos por día de la semana; promedio diario de recaudación y período analizado. |

Las tres admiten un filtro opcional `tienda_id` (1 o 2). El modelo selecciona las herramientas y sus parámetros según la pregunta; el backend solo ejecuta esas funciones definidas, con límites validados. No se permite ejecutar SQL arbitrario generado por el modelo.

| Parámetro | Herramienta | Valor predeterminado y límites |
| --- | --- | --- |
| `categoria` | `buscar_peliculas` | `Action`; nombre de categoría de hasta 45 caracteres. |
| `duracion_minima` | `buscar_peliculas` | `120`; entero entre 0 y 300 minutos. El filtro es estrictamente mayor. |
| `limite` | `buscar_peliculas` | `3`; entre 1 y 10 películas. |
| `dias_inactividad` | `analizar_clientes_inactivos` | `60`; entre 1 y 3650 días. |
| `limite` | `analizar_clientes_inactivos` | `10`; entre 1 y 50 clientes, además del total de candidatos. |
| `tienda_id` | Las tres | Opcional: `1` o `2`; sin filtro se incluyen ambas tiendas. |

Las instrucciones indican que solo se filtre una tienda cuando el usuario identifique su número o solicite un desglose. Decir «en la tienda» sin identificarla se interpreta como una consulta a ambas. Para películas con igual cantidad de alquileres, el ranking desempata por alquileres por copia y después por identificador.

La inactividad se calcula respecto a la **última fecha de alquiler de Sakila**, no respecto a hoy. Es una señal de inactividad, no una predicción ni confirmación de abandono. El umbral puede cambiarse mediante la pregunta.

El movimiento se mide por fecha de alquiler y los ingresos por fecha de pago, agregados por separado para evitar duplicar importes. Se distingue entre el promedio por día calendario, que incluye días sin actividad dentro del período, y el promedio por día con pagos. Los importes se presentan en unidades monetarias de Sakila, sin asumir una moneda.

### Respuestas con explicación

El agente tiene instrucciones para presentar el criterio utilizado, los resultados relevantes y una interpretación que explique por qué respaldan la respuesta. Por ejemplo, una recomendación debe relacionar la categoría y la duración solicitadas con el ranking de alquileres, en lugar de mostrar únicamente títulos y cifras.

El backend añade notas basadas directamente en los resultados de las herramientas para conservar el alcance de tiendas, los filtros, la fecha de referencia o el período analizado, aunque el modelo los omita. La interfaz muestra texto plano y conserva los saltos de línea; el agente está instruido para evitar marcadores Markdown.

Las recomendaciones describen alquileres históricos, no reseñas ni satisfacción de clientes. La detección de inactividad es una regla de seguimiento, no un modelo predictivo de abandono. Las sugerencias de operación deben distinguirse de los hechos consultados. El alcance actual está limitado a las tres herramientas definidas.

### Preguntas de la práctica

- «Recomiéndame 3 películas de acción que sean largas (más de 2 horas) pero que la gente alquile muy seguido en la tienda.»
- «¿Qué clientes crees que están a punto de dejar el servicio porque llevan mucho tiempo sin alquilar ninguna película?»
- «Hazme un análisis rápido de qué día de la semana hay más movimiento en las tiendas y cuánto dinero promedio se recauda en esos días.»

## Verificación

Desde `ai-backend`:

```powershell
npm test
npm run test:sakila
```

La primera orden prueba el ciclo de herramientas con un modelo simulado. La segunda consulta Sakila con las credenciales locales, comprueba el usuario de solo lectura y contrasta rankings, inactividad y totales semanales. Requiere MySQL/MariaDB encendido; no necesita llamar a OpenRouter.

Para verificar la integración con el LLM real, inicia el backend y envía las tres preguntas de la práctica desde el chat. Esta verificación sí utiliza la clave y el saldo de OpenRouter. El campo `toolsUsed` de la respuesta HTTP permite comprobar qué herramientas se ejecutaron correctamente.

## Sesiones e historial

En la primera respuesta correcta, el servidor genera un identificador de sesión y un token. El cliente los utiliza en los siguientes mensajes para continuar la conversación. La base de datos guarda el hash del token y comprueba que cada solicitud tenga acceso a la sesión indicada.

El contexto enviado al modelo se obtiene de SQLite; el servidor no acepta un historial definido por el cliente. Cada intercambio correcto se guarda en una transacción y permanece disponible tras reiniciar el backend.

El navegador conserva la sesión y los mensajes visibles en `sessionStorage` para restaurarlos al recargar la pestaña, cuando el almacenamiento está permitido.

## API

**Endpoint:** `POST /api/chat` con `Content-Type: application/json`.

Primer mensaje:

```json
{
  "message": "Hola, ¿qué puedes hacer?"
}
```

La respuesta contiene `reply`, `toolsUsed`, `sessionId` y `sessionToken`. `toolsUsed` identifica las herramientas ejecutadas correctamente. Para continuar, envía `message` y `sessionId` en el cuerpo, junto con la cabecera `Authorization: Bearer <sessionToken>`. Las respuestas posteriores contienen `reply`, `toolsUsed` y `sessionId`.

## Errores frecuentes

| Código | Motivo |
| --- | --- |
| `400` | Mensaje vacío, de más de 10000 caracteres, sesión con formato inválido o JSON inválido. |
| `403` | Token ausente o incorrecto para la sesión solicitada. |
| `409` | Ya hay una respuesta en proceso para esa sesión. |
| `413` | El cuerpo de la solicitud supera 32 KB. |
| `500` | Error al procesar la solicitud, consultar la IA o guardar el intercambio. |
| `503` | La clave de OpenRouter sigue sin configurarse. |

Si aparece un error de conexión en el chat, comprueba que el backend esté ejecutándose y que el puerto coincida con la dirección del frontend.

## Archivos locales

El repositorio excluye `.env`, `node_modules/` y `ai-backend/data/`. La configuración se comparte únicamente mediante `.env.example`, sin credenciales reales.
