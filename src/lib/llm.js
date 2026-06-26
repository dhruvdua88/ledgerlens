// Provider-agnostic LLM client. OpenAI-compatible chat completions.
// Works for any cloud LLM and any local OpenAI-compatible server
// (Ollama / LM Studio / vLLM) — only baseUrl/apiKey/model change.
export async function chat({ baseUrl, apiKey, model, messages, temperature = 0 }) {
  if (!model) throw new Error('No model selected.')
  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  let res
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST', headers,
      body: JSON.stringify({ model, messages, temperature, stream: false }),
    })
  } catch (e) {
    // network failure usually = local server down or CORS blocked
    throw new Error(`Could not reach ${baseUrl}. Is the model server running and is CORS allowed? (${e.message})`)
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`LLM ${res.status}: ${txt.slice(0, 200)}`)
  }
  const data = await res.json()
  return {
    content: data.choices?.[0]?.message?.content || '',
    usage: data.usage || {},
  }
}
