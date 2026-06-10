async function run() {
  const url = 'http://localhost:3000/api/agent/generate/stream?location=Vyskov&uid=1cOaNhnPQ4NSvXMGu5dyfkc33fx1';
  console.log('Připojuji se k SSE:', url);
  const response = await fetch(url);
  if (!response.ok) {
    console.error('Chyba odpovědi:', response.status, response.statusText);
    const text = await response.text();
    console.error(text);
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.substring(6));
          console.log('[SSE DATA]', data);
        } catch (e) {
          console.log('[SSE RAW DATA]', line.substring(6));
        }
      } else if (line.startsWith('event: ')) {
        console.log('[SSE EVENT]', line.substring(7));
      } else if (line.trim() !== '') {
        console.log('[SSE OTHER]', line);
      }
    }
  }
}
run().catch(console.error);
