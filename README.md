# Agente web con IA

Práctica 6: integración de un agente de inteligencia artificial en un aplicativo web. Incluye un chat en JavaScript, un backend con Express y conexión a OpenRouter usando el modelo `openai/gpt-4o-mini`.

## Arquitectura

1. **Cliente:** el navegador muestra el chat en HTML/CSS y ejecuta la lógica de JavaScript.
2. **Comunicación:** Fetch envía los mensajes a `POST /api/chat`.
3. **Backend:** Express valida el mensaje y comprueba el acceso a la sesión mediante un token.
4. **Historial:** SQLite almacena las sesiones y los mensajes. El servidor recupera el historial para construir el contexto del modelo.
5. **Servicio externo:** el backend consulta OpenRouter mediante HTTPS y devuelve la respuesta al navegador como JSON.

Se utiliza la opción de respuesta normal del diagrama de arquitectura. La clave de OpenRouter permanece en el backend.

## Tecnologías

- Frontend: HTML, CSS, JavaScript y Fetch.
- Backend: Node.js, Express, CORS, dotenv y el cliente oficial de OpenAI configurado para OpenRouter.
- Base de datos: SQLite mediante el módulo integrado `node:sqlite`.

## Estructura

```text
agente-web/
├── ai-backend/
│   ├── .env.example       # Plantilla de configuración
│   ├── server.js          # Servidor y endpoint REST
│   ├── chat.js            # Validación, sesiones y consulta a la IA
│   ├── database.js        # Persistencia de sesiones y mensajes
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

3. Edita `ai-backend/.env` y sustituye el valor de ejemplo por tu clave:

   ```dotenv
   PORT=3000
   OPENROUTER_API_KEY=tu_api_key_de_openrouter_aqui
   ```

4. Desde `ai-backend`, inicia el servidor y deja la terminal abierta:

   ```powershell
   npm start
   ```

5. Abre `ai-frontend/index.html` directamente en tu navegador. Escribe un mensaje y pulsa **Enviar** o **Enter**.

El frontend utiliza `http://localhost:3000/api/chat`. Si cambias `PORT`, actualiza también esa dirección en `ai-frontend/app.js`.

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

La respuesta contiene `reply`, `sessionId` y `sessionToken`. Para continuar, envía `message` y `sessionId` en el cuerpo, junto con la cabecera `Authorization: Bearer <sessionToken>`. Las respuestas posteriores contienen `reply` y `sessionId`.

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
