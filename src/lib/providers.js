// LLM provider registry. Both providers speak OpenAI-compatible /chat/completions,
// so switching is just a base URL + key change.
export const PROVIDERS = {
  deepseek: {
    label: 'DeepSeek (cloud)',
    baseUrl: 'https://api.deepseek.com',
    needsKey: true,
    free: false,
    privacy: 'Masked schema leaves the device; data never does.',
  },
  local: {
    label: 'Local model (air-gapped)',
    baseUrl: 'http://localhost:11434/v1', // Ollama default; LM Studio = :1234/v1, vLLM = :8000/v1
    needsKey: false,
    free: true,
    privacy: 'Nothing leaves the device. Fully offline.',
  },
}

export const DEFAULT_PROVIDER = 'deepseek'

// Suggested local model tags (editable in Settings). Arctic-Text2SQL-R1 = SQL specialist.
export const LOCAL_MODEL_SUGGESTIONS = [
  'a-kore/Arctic-Text2SQL-R1-7B',
  'qwen2.5:3b',
]
export const DEFAULT_LOCAL_MODEL = 'a-kore/Arctic-Text2SQL-R1-7B'
