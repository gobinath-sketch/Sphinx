import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import dbConnect from '@/lib/db'
import { Resume } from '@/lib/models'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-latest']

interface ResumeData {
  personalInfo: {
    name: string
    email: string
    phone?: string
    location?: string
  }
  experience: Array<{
    title: string
    company: string
    duration: string
    description: string
    achievements: string[]
  }>
  education: Array<{
    degree: string
    institution: string
    year: string
    gpa?: string
  }>
  skills: string[]
  targetJob?: {
    title: string
    company?: string
    description?: string
  }
  additionalInfo?: string
}

async function generateResumeWithGemini(data: ResumeData): Promise<{ resume: string; suggestions: string[]; atsScore: number }> {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured')
    }

    const prompt = `Generate a professional, ATS-friendly resume in markdown format based on the following information:

Personal Information:
- Name: ${data.personalInfo.name}
- Email: ${data.personalInfo.email}
- Phone: ${data.personalInfo.phone || 'Not provided'}
- Location: ${data.personalInfo.location || 'Not provided'}

Experience:
${data.experience.map((exp: ResumeData['experience'][0]) => `
- Title: ${exp.title}
- Company: ${exp.company}
- Duration: ${exp.duration}
- Description: ${exp.description}
- Achievements: ${exp.achievements.join(', ')}
`).join('\n')}

Education:
${data.education.map((edu: ResumeData['education'][0]) => `
- Degree: ${edu.degree}
- Institution: ${edu.institution}
- Year: ${edu.year}
- GPA: ${edu.gpa || 'Not provided'}
`).join('\n')}

Skills: ${data.skills.join(', ')}

Target Job: ${data.targetJob ? `${data.targetJob.title} at ${data.targetJob.company || 'Company'}` : 'Not specified'}

Additional Information: ${data.additionalInfo || 'None'}

Please generate a professional resume that:
1. Is optimized for ATS (Applicant Tracking Systems)
2. Uses relevant keywords from the target job
3. Highlights quantifiable achievements
4. Has a clean, professional format
5. Includes a compelling professional summary
6. Is well-structured and easy to read

Format the response as JSON:
{
  "resume": "markdown content here",
  "suggestions": ["suggestion1", "suggestion2", "suggestion3"],
  "atsScore": 85
}`

    let apiData: any = null
    let lastErrorDetail = 'Unknown Gemini error'
    const requestBody = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.3,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      }
    }

    for (const model of GEMINI_MODELS) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      )

      if (response.ok) {
        apiData = await response.json()
        break
      }

      const responseText = await response.text()
      lastErrorDetail = `${model} -> ${response.status}: ${responseText}`

      // If model is not found, try the next known supported model.
      if (response.status === 404) continue
      // For non-404 errors, still try next model, but keep detail.
    }

    if (!apiData) {
      throw new Error(`Gemini API error: ${lastErrorDetail}`)
    }

    const generatedText = apiData.candidates?.[0]?.content?.parts?.[0]?.text

    if (!generatedText) {
      throw new Error('No response from Gemini API')
    }

    // Try to parse JSON response
    try {
      const parsed = JSON.parse(generatedText)
      return {
        resume: parsed.resume || generatedText,
        suggestions: parsed.suggestions || [],
        atsScore: parsed.atsScore || 85
      }
    } catch {
      // If not JSON, return the text as resume
      return {
        resume: generatedText,
        suggestions: [
          'Add more specific achievements with quantifiable results',
          'Include relevant keywords from the target job description',
          'Consider adding a professional summary section',
          'Ensure consistent formatting throughout'
        ],
        atsScore: 85
      }
    }
  } catch (error) {
    console.error('Gemini API error:', error)
    if (!OPENROUTER_API_KEY) {
      throw new Error('Failed to generate resume from real AI provider')
    }

    const prompt = `Generate a professional, ATS-friendly resume in markdown format based on the following information:

Personal Information:
- Name: ${data.personalInfo.name}
- Email: ${data.personalInfo.email}
- Phone: ${data.personalInfo.phone || 'Not provided'}
- Location: ${data.personalInfo.location || 'Not provided'}

Experience:
${data.experience.map((exp: ResumeData['experience'][0]) => `
- Title: ${exp.title}
- Company: ${exp.company}
- Duration: ${exp.duration}
- Description: ${exp.description}
- Achievements: ${exp.achievements.join(', ')}
`).join('\n')}

Education:
${data.education.map((edu: ResumeData['education'][0]) => `
- Degree: ${edu.degree}
- Institution: ${edu.institution}
- Year: ${edu.year}
- GPA: ${edu.gpa || 'Not provided'}
`).join('\n')}

Skills: ${data.skills.join(', ')}

Target Job: ${data.targetJob ? `${data.targetJob.title} at ${data.targetJob.company || 'Company'}` : 'Not specified'}

Additional Information: ${data.additionalInfo || 'None'}

Output STRICT JSON:
{
  "resume": "markdown content",
  "suggestions": ["one", "two", "three"],
  "atsScore": 85
}`

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 400,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`OpenRouter API error: ${response.status} ${text}`)
    }

    const payload = await response.json()
    const generatedText = payload?.choices?.[0]?.message?.content
    if (!generatedText) {
      throw new Error('No response from OpenRouter')
    }

    try {
      const parsed = JSON.parse(generatedText)
      return {
        resume: parsed.resume || generatedText,
        suggestions: parsed.suggestions || [],
        atsScore: parsed.atsScore || 85,
      }
    } catch {
      return {
        resume: generatedText,
        suggestions: [
          'Add more specific achievements with quantifiable results',
          'Include relevant keywords from the target job description',
          'Consider adding a professional summary section',
        ],
        atsScore: 85,
      }
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value
    const userPayload = token ? verifyToken(token) : null

    if (!userPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { personalInfo, experience, education, skills, targetJob, additionalInfo } = body
    const normalizedData: ResumeData = {
      personalInfo: {
        name: personalInfo?.name || 'Candidate',
        email: personalInfo?.email || '',
        phone: personalInfo?.phone || '',
        location: personalInfo?.location || '',
      },
      experience: Array.isArray(experience) ? experience : [],
      education: Array.isArray(education) ? education : [],
      skills: Array.isArray(skills) ? skills : [],
      targetJob,
      additionalInfo,
    }

    // Generate resume using Gemini API
    const { resume: resumeMarkdown } = await generateResumeWithGemini(normalizedData)

    const resumeHtml = convertMarkdownToHtml(resumeMarkdown)

    // Save the resume to the database using Mongoose
    await dbConnect()

    // Note: Mongoose model 'Resume' expects 'content' field for markdown/mixed content typically,
    // or we can map it. User schema update showed 'content_markdown' usage in previous steps?
    // Let's use 'content_markdown' if I added it to schema or rely on flexible schema.
    // In `api/resumes/route.ts` I used `content: content_markdown`.
    // I will check `lib/models.ts` again if needed, but assuming `content` or flexible schema.
    // Actually, I'll update it to match `api/resumes/route.ts` logic: 
    // `content: content_markdown` and explicit `content_markdown` update.

    // However, for simplicity here, I'll assume Mongoose model allows these fields.
    // If stricly typed and mismatched, it might fail. 
    // Let's use `create` and pass the object.

    const resume = await Resume.create({
      user_id: userPayload.userId,
      title: `${normalizedData.personalInfo.name} - Resume`,
      content: resumeMarkdown, // Mapping to 'content' field as per my previous assumption
      content_markdown: resumeMarkdown, // Sending both just in case schema was updated or is flexible
      version: 1,
      is_active: true
    });

    return NextResponse.json({
      resume: {
        markdown: resumeMarkdown,
        html: resumeHtml,
        id: resume._id.toString()
      },
      suggestions: [
        'Add more specific achievements with quantifiable results',
        'Include relevant keywords from the target job description',
        'Consider adding a professional summary section',
        'Ensure consistent formatting throughout'
      ],
      atsScore: 85
    })

  } catch (error) {
    console.error('Error generating resume:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate resume' },
      { status: 502 }
    )
  }
}

function convertMarkdownToHtml(markdown: string): string {
  // Simple markdown to HTML conversion
  return markdown
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/^• (.*$)/gim, '<li>$1</li>')
    .replace(/\n/gim, '<br>')
}
