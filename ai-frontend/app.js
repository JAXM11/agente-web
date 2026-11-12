let conversationHistory = [];
let chatSession = null;
let sending = false;

try {
    const saved = JSON.parse(sessionStorage.getItem('chatSession'));
    if (saved && typeof saved.sessionId === 'string' && typeof saved.sessionToken === 'string') {
        chatSession = saved;
        conversationHistory = Array.isArray(saved.history) ? saved.history : [];
        conversationHistory.forEach(item => appendMessage(item.content, item.role));
    }
} catch {
    // El chat también funciona si el navegador bloquea el almacenamiento local.
}

async function sendMessage() {
    const inputField = document.getElementById('userInput');
    const chatBox = document.getElementById('chatBox');
    const text = inputField.value.trim();

    if (!text || sending) return;
    sending = true;
    const sendButton = document.getElementById('sendButton');
    sendButton.disabled = true;

    appendMessage(text, 'user');
    inputField.value = '';
    chatBox.scrollTop = chatBox.scrollHeight;
    conversationHistory.push({ role: 'user', content: text });

    try {
        const response = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(chatSession ? { Authorization: `Bearer ${chatSession.sessionToken}` } : {}),
            },
            body: JSON.stringify({
                message: text,
                ...(chatSession ? { sessionId: chatSession.sessionId } : {}),
            }),
        });

        const data = await response.json();

        if (response.ok && data.reply) {
            chatSession = {
                sessionId: data.sessionId,
                sessionToken: data.sessionToken || chatSession.sessionToken,
            };
            appendMessage(data.reply, 'assistant');
            conversationHistory.push({ role: 'assistant', content: data.reply });
            try {
                sessionStorage.setItem('chatSession', JSON.stringify({ ...chatSession, history: conversationHistory }));
            } catch { /* Almacenamiento opcional del navegador. */ }
        } else {
            appendMessage(data.error || 'Error: No se pudo obtener respuesta del servidor.', 'assistant');
        }
    } catch (error) {
        console.error('Error de red:', error);
        appendMessage('Error de conexión con el servidor.', 'assistant');
    } finally {
        sending = false;
        sendButton.disabled = false;
        chatBox.scrollTop = chatBox.scrollHeight;
        inputField.focus();
    }
}

function appendMessage(text, sender) {
    const chatBox = document.getElementById('chatBox');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    messageDiv.textContent = text;
    chatBox.appendChild(messageDiv);
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}
