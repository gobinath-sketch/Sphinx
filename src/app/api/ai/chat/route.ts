import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import { Conversation } from '@/lib/models'
import { verifyToken } from '@/lib/auth'

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY ||
  process.env.OPEN_ROUTER_API_KEY ||
  process.env.NEXT_PUBLIC_OPENROUTER_API_KEY

type GeminiAction = { type: string; label: string; data: Record<string, string> }

type AssistantOutput = { response: string; suggestions: string[]; actions: GeminiAction[] }
type LanguageCode = keyof typeof LANGUAGE_NAMES
type AssistantPromptPayload = { text: string; language: LanguageCode }
type ConversationSnapshot = { role?: string; content?: string }[]

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  hi: 'Hindi',
  pt: 'Portuguese',
  zh: 'Chinese (Simplified)',
  ja: 'Japanese',
  ko: 'Korean',
}

const FALLBACK_FAILURE_MESSAGES: Record<LanguageCode, string> = {
  en: 'I could not reach the live assistant. Please retry shortly.',
  es: 'No pude contactar al asistente en vivo. Inténtalo de nuevo en unos instantes.',
  fr: "Impossible de joindre l’assistant en direct. Merci de réessayer bientôt.",
  de: 'Der Live-Assistent ist momentan nicht erreichbar. Bitte versuche es gleich erneut.',
  hi: 'मैं अभी लाइव सहायक से नहीं जुड़ पाया। कृपया थोड़ी देर बाद दोबारा प्रयास करें।',
  pt: 'Não consegui acessar o assistente ao vivo. Tente novamente em instantes.',
  zh: '暂时无法连接实时助手，请稍后再试。',
  ja: 'ライブアシスタントに接続できませんでした。少し時間をおいて再度お試しください。',
  ko: '지금은 실시간 어시스턴트에 연결되지 않습니다. 잠시 후 다시 시도해 주세요.',
}

function detectLanguage(message: string, history?: ConversationSnapshot): LanguageCode {
  const text = message.trim()
  if (!text) return 'en'

  if (/[\u4e00-\u9fff]/.test(text)) return 'zh'
  if (/[\u3040-\u30ff]/.test(text)) return 'ja'
  if (/[\u1100-\u11ff\uac00-\ud7af]/.test(text)) return 'ko'

  const lower = text.toLowerCase()
  const keywordMatchers: Array<{ code: LanguageCode; keywords: string[] }> = [
    { code: 'es', keywords: ['hola', 'currículum', 'trabajo', 'empleo', 'buscar', 'gracias', 'salario'] },
    { code: 'fr', keywords: ['bonjour', 'curriculum', 'emploi', 'salaire', 'merci', 'offre'] },
    { code: 'de', keywords: ['hallo', 'lebenslauf', 'arbeit', 'bewerbung', 'danke'] },
    { code: 'hi', keywords: ['नमस्ते', 'रिज़्यूमे', 'नौकरी', 'वेतन', 'धन्यवाद'] },
    { code: 'pt', keywords: ['olá', 'currículo', 'emprego', 'salário', 'obrigado'] },
  ]

  for (const entry of keywordMatchers) {
    if (entry.keywords.some((keyword) => lower.includes(keyword))) {
      return entry.code
    }
  }

  const romanizedMatchers: Array<{ code: LanguageCode; keywords: string[] }> = [
    {
      code: 'ja',
      keywords: ['konnichiwa', 'konichiwa', 'arigato', 'arigatou', 'ohayo', 'sayonara', 'moshi moshi', 'sumimasen'],
    },
    {
      code: 'ko',
      keywords: ['annyeong', 'annyeonghaseyo', 'gamsahamnida', 'gomawo', 'kamsahamnida', 'jal jinae'],
    },
    {
      code: 'hi',
      keywords: ['namaste', 'dhanyavad', 'shukriya', 'sukh', 'dost'],
    },
    {
      code: 'zh',
      keywords: ['ni hao', 'nihao', 'xie xie', 'xiexie', 'zaijian', 'wo ai ni'],
    },
    {
      code: 'de',
      keywords: ['guten tag', 'danke schön', 'bitte schön'],
    },
    {
      code: 'fr',
      keywords: ['merci beaucoup', 's il vous plaît', 'bonjour à tous'],
    },
    {
      code: 'es',
      keywords: ['buenos dias', 'buenas tardes', 'muchas gracias'],
    },
    {
      code: 'pt',
      keywords: ['bom dia', 'boa tarde', 'muito obrigado', 'muito obrigada'],
    },
  ]

  for (const entry of romanizedMatchers) {
    if (
      entry.keywords.some((keyword) => {
        const normalizedKeyword = keyword.replace(/\s+/g, ' ')
        const normalizedMessage = lower.replace(/\s+/g, ' ')
        return normalizedMessage.includes(normalizedKeyword)
      })
    ) {
      return entry.code
    }
  }

  if (/^[\x00-\x7F]+$/.test(text) && /[a-z]/i.test(text)) {
    return 'en'
  }

  if (/[áéíóúñü¿¡]/.test(text)) return 'es'
  if (/[àâçéèêëîïôùûüœ]/.test(text)) return 'fr'
  if (/[äöüß]/.test(text)) return 'de'
  if (/[ãõéêç]/.test(text)) return 'pt'

  if (history && history.length > 0) {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const entry = history[i]
      if (entry?.role === 'user' && typeof entry.content === 'string') {
        const detected = detectLanguage(entry.content)
        if (detected !== 'en') {
          return detected
        }
      }
    }
  }

  return 'en'
}

function buildPrompt(message: string, language: LanguageCode, context?: Record<string, unknown>) {
  const languageName = LANGUAGE_NAMES[language] ?? LANGUAGE_NAMES.en

  return `You are an AI assistant for a career and finance management app called Sphinx.

User language ISO code: ${language}
User language name: ${languageName}

Detect the user's language from the provided ISO code and message. Respond ONLY in that language (no English unless the language code is en). All response fields, bullet points, suggestions, and action labels must be in ${languageName}. Keep technical identifiers like URLs or paths in English.

The user says: "${message}"

${context ? `Context: ${JSON.stringify(context)}` : ''}

Rules for your response:
- Tone: executive-level, confident, empathetic.
- Length: main response must be 3 sentences or fewer.
- Content: focus only on concrete, high-value guidance aligned with the user’s request. No generic greetings, filler text, tool disclaimers, or marketing fluff.
- Suggestions: provide exactly 2 concise, results-focused bullet suggestions in ${languageName}. Each suggestion ≤ 12 words.
- Actions: include at most 1 actionable item with a clear label in ${languageName}. Use existing dashboard routes when possible.
- If unsure, ask one clarifying question within the main response instead of listing unrelated ideas.

Return strictly valid JSON:
{
  "response": "Main response text in ${languageName}",
  "suggestions": ["Suggestion in ${languageName}", "Suggestion in ${languageName}"],
  "actions": [{"type": "navigate", "label": "Action label in ${languageName}", "data": {"path": "/dashboard/route"}}]
}`
}

function normalizeActions(actionsRaw: Array<Record<string, unknown>>): GeminiAction[] {
  return actionsRaw.map((action) => {
    const type = typeof action.type === 'string' ? action.type : 'navigate'
    const label = typeof action.label === 'string' ? action.label : 'Open'
    const value =
      typeof action.data === 'object' &&
        action.data !== null &&
        typeof (action.data as Record<string, unknown>).path === 'string'
        ? (action.data as Record<string, unknown>).path
        : '/dashboard'
    let path = String(value);
    
    // Normalize paths to ensure they match our actual file structure
    if (path.includes('resume')) path = '/dashboard/resume';
    else if (path.includes('job')) path = '/dashboard/jobs';
    else if (path.includes('market') || path.includes('stock')) path = '/dashboard/market';
    else if (path.includes('expense') || path.includes('finance')) path = '/dashboard/expenses';
    else if (path.includes('profile')) path = '/dashboard/profile';
    else if (path.includes('setting')) path = '/dashboard/settings';
    else if (path.includes('account')) path = '/dashboard/account';
    else if (!path.startsWith('/dashboard')) path = '/dashboard';

    return { type, label, data: { path } }
  })
}

function parseStructuredResponse(raw: string): AssistantOutput {
  const extractJson = (text: string): string | null => {
    const fenceMatch = text.match(/```json\n([\s\S]*?)```/i)
    if (fenceMatch?.[1]) return fenceMatch[1]
    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return text.slice(firstBrace, lastBrace + 1)
    }
    return null
  }

  const candidate = extractJson(raw) ?? raw
  try {
    const parsed = JSON.parse(candidate) as {
      response?: unknown
      suggestions?: unknown
      actions?: unknown
    }
    const actions = Array.isArray(parsed.actions) ? normalizeActions(parsed.actions as Array<Record<string, unknown>>) : []
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((item): item is string => typeof item === 'string').slice(0, 5)
      : []

    let responseText = raw
    if (typeof parsed.response === 'string' && parsed.response.trim().length > 0) {
      responseText = parsed.response
    } else {
      let textOnly = raw.replace(candidate, '').trim()
      if (textOnly.length === 0) {
        textOnly = "Here are the suggested next steps:"
      }
      responseText = textOnly
    }

    return {
      response: responseText,
      suggestions,
      actions,
    }
  } catch {
    const cleanRaw = raw
      .replace(/"suggestions"\s*:\s*\[[\s\S]*?\]/gi, '')
      .replace(/"actions"\s*:\s*\[[\s\S]*?\]/gi, '')
      .replace(/[{}"]/g, '')
      .trim()
    return { response: cleanRaw || raw, suggestions: [], actions: [] }
  }
}

function createFallbackResponse(language: LanguageCode): AssistantOutput {
  const response = FALLBACK_FAILURE_MESSAGES[language] ?? FALLBACK_FAILURE_MESSAGES.en

  return {
    response,
    suggestions: [],
    actions: [],
  }
}

async function callHuggingFaceAPI(message: AssistantPromptPayload, context?: Record<string, unknown>): Promise<AssistantOutput> {
  const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY
  if (!HUGGINGFACE_API_KEY) {
    throw new Error('Missing HUGGINGFACE_API_KEY')
  }

  const payload = {
    model: 'meta-llama/Meta-Llama-3-8B-Instruct',
    messages: [
      {
        role: 'system',
        content: buildPrompt(message.text, message.language, context),
      },
      {
        role: 'user',
        content: message.text,
      },
    ],
    temperature: 0.6,
    max_tokens: 800,
  }

  const response = await fetch(`https://router.huggingface.co/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${HUGGINGFACE_API_KEY}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`HuggingFace API error: ${response.status} - ${await response.text()}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content

  if (!content || typeof content !== 'string') {
    throw new Error('No valid response from HuggingFace API')
  }

  return parseStructuredResponse(content)
}

async function generateAssistantReply(message: string, language: LanguageCode, context?: Record<string, unknown>): Promise<AssistantOutput> {
  const payload = { text: message, language }

  try {
    return await callHuggingFaceAPI(payload, context)
  } catch (apiError) {
    console.error('HuggingFace API error:', apiError)
    return createFallbackResponse(language)
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect()

    // Check authentication
    const token = request.cookies.get('auth_token')?.value
    const userPayload = token ? verifyToken(token) : null

    if (!userPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId } = userPayload

    const body = await request.json()
    const { message, context } = body
    const history = Array.isArray(context?.conversationHistory) ? (context.conversationHistory as ConversationSnapshot) : undefined
    const language = detectLanguage(message, history)

    // Generate assistant reply (OpenRouter with graceful failure messaging)
    const { response, suggestions, actions } = await generateAssistantReply(message, language, context)

    // Save the conversation to the database
    let existingConversation = await Conversation.findOne({ user_id: userId })

    const newMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: message,
      timestamp: new Date().toISOString()
    }

    const assistantMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant' as const,
      content: response,
      timestamp: new Date().toISOString(),
      metadata: {
        suggestions,
        actions
      }
    }

    if (existingConversation) {
      existingConversation.messages.push(newMessage, assistantMessage);
      existingConversation.last_updated = new Date();
      await existingConversation.save();
    } else {
      await Conversation.create({
        user_id: userId,
        messages: [newMessage, assistantMessage]
      });
    }

    return NextResponse.json({
      message: response,
      suggestions,
      actions
    })

  } catch (error) {
    console.error('Error in chat:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
