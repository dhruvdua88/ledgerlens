// Chrome built-in AI (Gemini Nano) via the Prompt API.
// Global is `LanguageModel` (not window.ai). Fully on-device — data never leaves.
// Desktop Chrome only (macOS 13+/Win/Linux); model downloads on first use.

function lm() {
  return typeof LanguageModel !== 'undefined' ? LanguageModel : null
}

// 'available' | 'downloadable' | 'downloading' | 'unavailable'
export async function chromeStatus() {
  const M = lm()
  if (!M) return 'unavailable'
  try { return await M.availability() } catch { return 'unavailable' }
}

export async function isChromeReady() {
  return (await chromeStatus()) === 'available'
}

// One-shot prompt. system+user. Triggers download if needed (status 'downloadable').
export async function chromePrompt(system, user, onProgress) {
  const M = lm()
  if (!M) throw new Error('Chrome built-in AI not available in this browser.')
  const session = await M.create({
    initialPrompts: system ? [{ role: 'system', content: system }] : undefined,
    monitor(m) { m.addEventListener('downloadprogress', (e) => onProgress?.(e.loaded)) },
  })
  try {
    const text = await session.prompt(user)
    return text
  } finally {
    session.destroy?.()
  }
}
