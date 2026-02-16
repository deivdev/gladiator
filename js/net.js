// net.js — WebSocket client for online multiplayer

let ws = null;
let onMessage = null;

export function connect(messageHandler) {
  onMessage = messageHandler;

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws`);

  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (onMessage) onMessage(msg);
  });

  ws.addEventListener('close', () => {
    ws = null;
  });

  ws.addEventListener('error', () => {
    ws = null;
  });

  return new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
}

export function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function disconnect() {
  if (ws) {
    ws.close();
    ws = null;
  }
}
