'use client'

import { useState, useEffect, useCallback } from 'react'
import { useMemo } from 'react'
import { useAuth } from '@/features/auth/context/AuthContext'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/shared/hooks/use-toast'
import {
  FileText,
  Download,
  Plus,
  Trash2,
  Sparkles,
  Eye
} from 'lucide-react'
import { BackToDashboardButton } from '@/components/BackToDashboardButton'
import { aiService, ResumeGenerationRequest } from '@/lib/services/ai-service'
// import { createClient } from '@/shared/supabase/client' - REMOVED
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

interface Resume {
  id: string
  title: string
  content_markdown: string
  version: number
  is_active: boolean
  created_at: string
}

function formatResumeDate(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

export default function ResumePage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  const [resumes, setResumes] = useState<Resume[]>([])
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showBuilder, setShowBuilder] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [pdfTriggerId, setPdfTriggerId] = useState<string | null>(null)
  const [formData, setFormData] = useState<ResumeGenerationRequest>({
    personalInfo: {
      name: '',
      email: '',
      phone: '',
      location: ''
    },
    experience: [],
    education: [],
    skills: [],
    targetJob: {
      title: '',
      company: '',
      description: ''
    },
    additionalInfo: ''
  })

  const draftMarkdown = useMemo(() => {
    const name = formData.personalInfo.name.trim()
    const contactParts = [formData.personalInfo.email, formData.personalInfo.phone, formData.personalInfo.location]
      .map((v) => (v ?? '').trim())
      .filter(Boolean)

    const lines: string[] = []
    if (name) {
      lines.push(`# ${name}`)
      if (contactParts.length > 0) lines.push(contactParts.join(' | '))
      lines.push('')
    } else if (contactParts.length > 0) {
      // Only show what exists (no placeholder text).
      lines.push(contactParts.join(' | '))
      lines.push('')
    }

    // Resume headings are always present for a professional template,
    // but the body content only shows if the user entered it.
    lines.push('## Target Role')
    {
      const tj = formData.targetJob
      const title = tj?.title?.trim() ?? ''
      const company = tj?.company?.trim() ?? ''
      const titleLine = title ? `**${title}**` : ''
      const companyLine = company ? ` at ${company}` : ''
      if (titleLine || companyLine) lines.push(`${titleLine}${companyLine}`)
      if (tj?.description?.trim()) lines.push(tj.description.trim())
      lines.push('')
    }

    lines.push('## Skills')
    {
      const skills = formData.skills.map((s) => s.trim()).filter(Boolean)
      if (skills.length > 0) lines.push(skills.map((s) => `• ${s}`).join('\n'))
      lines.push('')
    }

    lines.push('## Experience')
    {
      for (const exp of formData.experience) {
        const expTitle = exp.title.trim()
        const expCompany = exp.company.trim()
        const duration = exp.duration?.trim() ?? ''
        const description = exp.description?.trim() ?? ''
        const achievements = (exp.achievements ?? []).map((a) => a.trim()).filter(Boolean)

        if (!expTitle && !expCompany && !duration && !description && achievements.length === 0) continue

        const header = expTitle
          ? expCompany ? `### ${expTitle} - ${expCompany}` : `### ${expTitle}`
          : expCompany ? `### ${expCompany}` : ''
        if (header) lines.push(header)
        if (duration) lines.push(duration)
        if (description) lines.push(description)
        if (achievements.length > 0) lines.push(achievements.map((a) => `• ${a}`).join('\n'))
        lines.push('')
      }
    }

    lines.push('## Education')
    {
      for (const edu of formData.education) {
        const degree = edu.degree.trim()
        const institution = edu.institution.trim()
        const year = edu.year?.trim() ?? ''
        const gpa = edu.gpa?.trim() ?? ''

        if (!degree && !institution && !year && !gpa) continue

        const headerParts = [
          degree,
          institution ? `- ${institution}` : '',
          year ? `(${year})` : '',
        ]
        const header = headerParts.join(' ').replace(/\s+/g, ' ').trim()
        if (header) lines.push(`### ${header}`)
        if (gpa) lines.push(`GPA: ${gpa}`)
        lines.push('')
      }
    }

    if (formData.additionalInfo?.trim()) {
      lines.push('## Additional Information')
      lines.push(formData.additionalInfo.trim())
      lines.push('')
    }

    return lines.join('\n')
  }, [formData])

  const previewMarkdown = showPreview && selectedResume ? selectedResume.content_markdown : draftMarkdown

  const computeAtsScore = (markdown: string): number => {
    const text = markdown ?? ''
    const firstLine = (text.split('\n')[0] ?? '').replace(/^#\s*/g, '').trim()
    const hasName = /#\s+.+/m.test(text) || firstLine.replace(/[^\w]/g, '').length >= 2
    const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)

    const extractSection = (heading: string) => {
      const lines = text.split('\n')
      const target = `## ${heading}`
      const start = lines.findIndex((l) => l.trim() === target)
      if (start < 0) return ''
      let end = lines.length
      for (let i = start + 1; i < lines.length; i++) {
        if (lines[i].trim().startsWith('## ')) {
          end = i
          break
        }
      }
      return lines.slice(start + 1, end).join('\n').trim()
    }

    const summary = extractSection('Target Role')
    const skills = extractSection('Skills')
    const experience = extractSection('Experience')
    const education = extractSection('Education')

    const hasSummary = summary.length > 0
    const skillsBullets = (skills.match(/^(•|-|\*)\s+/gm) ?? []).length
    const hasSkills = skillsBullets > 0
    const hasExperience = /###\s+/.test(experience) || experience.length > 0
    const hasEducation = /###\s+/.test(education) || education.length > 0

    let score = 0
    if (hasName) score += 30
    if (hasEmail) score += 10
    if (hasSummary) score += 15
    if (hasSkills) score += Math.min(25, skillsBullets * 5)
    if (hasExperience) score += 25
    if (hasEducation) score += 10

    return Math.max(0, Math.min(100, score))
  }

  const atsScore = useMemo(() => computeAtsScore(previewMarkdown), [previewMarkdown])

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')

  const normalizeMarkdownText = (line: string) =>
    line
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .trim()

  const markdownToATSHtml = (markdown: string) => {
    const lines = (markdown ?? '').split('\n')
    const out: string[] = []
    let inList = false
    let afterH1 = false
    let firstSectionSeen = false
    let ruleInserted = false

    const closeList = () => {
      if (inList) out.push('</ul>')
      inList = false
    }

    for (const rawLine of lines) {
      const line = rawLine ?? ''
      const trimmed = line.trim()

      if (!trimmed) {
        closeList()
        continue
      }

      const h1 = trimmed.match(/^#\s+(.+)$/)
      if (h1) {
        closeList()
        out.push(`<h1 class="ats-name">${escapeHtml(h1[1])}</h1>`)
        afterH1 = true
        continue
      }

      const h2 = trimmed.match(/^##\s+(.+)$/)
      if (h2) {
        closeList()
        const headingRaw = h2[1]?.trim() ?? ''
        const label =
          headingRaw === 'Target Role'
            ? 'SUMMARY'
            : headingRaw === 'Additional Information'
              ? 'ADDITIONAL'
              : headingRaw.toUpperCase()

        if (!firstSectionSeen && !ruleInserted) {
          out.push('<div class="ats-rule"></div>')
          ruleInserted = true
        }
        out.push(`<h2 class="ats-section">${escapeHtml(label)}</h2>`)
        firstSectionSeen = true
        afterH1 = false
        continue
      }

      const h3 = trimmed.match(/^###\s+(.+)$/)
      if (h3) {
        closeList()
        out.push(`<h3 class="ats-subsection">${escapeHtml(h3[1])}</h3>`)
        afterH1 = false
        continue
      }

      const bullet = trimmed.match(/^(•|-|\*)\s+(.+)$/)
      if (bullet) {
        if (!inList) {
          out.push('<ul class="ats-list">')
          inList = true
        }
        out.push(`<li>${escapeHtml(normalizeMarkdownText(bullet[2]))}</li>`)
        continue
      }

      closeList()
      // Contact line(s): show right after the resume name, before the first section.
      if (afterH1 && !firstSectionSeen && (trimmed.includes('@') || /\d/.test(trimmed) || trimmed.includes(','))) {
        out.push(`<div class="ats-contact">${escapeHtml(normalizeMarkdownText(trimmed))}</div>`)
      } else {
        out.push(`<div class="ats-paragraph">${escapeHtml(normalizeMarkdownText(trimmed))}</div>`)
      }
      afterH1 = false
    }

    closeList()
    return out.join('')
  }

  const fetchResumes = useCallback(async () => {
    if (!user) return

    try {
      const res = await fetch('/api/resumes')
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Failed to fetch')
      const list = Array.isArray(data) ? data : []
      setResumes(
        list.map((raw: Record<string, unknown>) => ({
          id: String(raw.id ?? ''),
          title: String(raw.title ?? 'Resume'),
          content_markdown: String(raw.content_markdown ?? ''),
          version: typeof raw.version === 'number' ? raw.version : 1,
          is_active: typeof raw.is_active === 'boolean' ? raw.is_active : true,
          created_at:
            typeof raw.created_at === 'string'
              ? raw.created_at
              : typeof raw.createdAt === 'string'
                ? raw.createdAt
                : new Date().toISOString(),
        })).filter((r) => r.id.length > 0)
      )
    } catch (error) {
      console.error('Error fetching resumes:', error)
      toast({
        title: "Error",
        description: "Failed to fetch resumes",
        variant: "destructive",
      })
    }
  }, [user, toast])

  const saveResume = useCallback(async (title: string, markdown: string, existingId?: string) => {
    if (!user) return
    try {
      let res;
      if (existingId) {
        res = await fetch('/api/resumes', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: existingId,
            title,
            content_markdown: markdown,
            version: 1,
            is_active: true
          })
        })
      } else {
        res = await fetch('/api/resumes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            content_markdown: markdown,
            version: 1,
            is_active: true
          })
        })
      }

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')

      toast({ title: 'Resume saved' })
      await fetchResumes()
      return data.id as string
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Try again'
      toast({ title: 'Save failed', description: message, variant: 'destructive' })
      return undefined
    }
  }, [user, toast, fetchResumes])

  const deleteResume = useCallback(
    async (id: string, title: string) => {
      if (!user) return
      try {
        const res = await fetch(`/api/resumes/${id}`, { method: 'DELETE' })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((body as { error?: string }).error || 'Delete failed')
        toast({ title: 'Resume deleted', description: title })
        if (selectedResume?.id === id) {
          setSelectedResume(null)
          setShowPreview(false)
          setShowBuilder(false)
        }
        await fetchResumes()
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Try again'
        toast({ title: 'Delete failed', description: message, variant: 'destructive' })
      }
    },
    [user, toast, selectedResume?.id, fetchResumes]
  )

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    } else if (user) {
      fetchResumes()
    }
  }, [user, loading, router, fetchResumes])

  const handleGenerateResume = async () => {
    if (!formData.personalInfo.name || !formData.personalInfo.email) {
      toast({
        title: "Missing Information",
        description: "Please fill in at least your name and email",
        variant: "destructive",
      })
      return
    }

    setIsGenerating(true)
    try {
      const result = await aiService.generateResume(formData)

      toast({
        title: "Resume Generated!",
        description: "Your AI-powered resume has been created successfully",
      })

      setShowBuilder(true)
      setShowPreview(true)
      const tempTitle = `${formData.personalInfo.name} - Resume`
      const newId = await saveResume(tempTitle, result.resume.markdown)
      setSelectedResume({
        id: newId || Date.now().toString(),
        title: tempTitle,
        content_markdown: result.resume.markdown,
        version: 1,
        is_active: true,
        created_at: new Date().toISOString()
      })

      fetchResumes()
    } catch {
      toast({
        title: "Generation Failed",
        description: "Failed to generate resume. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDownloadPDF = useCallback(async () => {
    try {
      const container = document.getElementById('resume-preview-container')
      if (!container) throw new Error('Preview not found')
      const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff' })
      const img = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const imgProps = { width: pageWidth, height: (canvas.height * pageWidth) / canvas.width }
      let y = 0
      pdf.addImage(img, 'PNG', 0, y, imgProps.width, imgProps.height)
      while (imgProps.height - y > pageHeight) {
        y += pageHeight
        pdf.addPage()
        pdf.addImage(img, 'PNG', 0, -y, imgProps.width, imgProps.height)
      }
      pdf.save(`${selectedResume?.title || 'resume'}.pdf`)
      toast({ title: 'PDF downloaded' })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Try again'
      toast({ title: 'Download failed', description: message, variant: 'destructive' })
    }
  }, [selectedResume?.title, toast])

  useEffect(() => {
    if (!pdfTriggerId || !showBuilder || !showPreview || selectedResume?.id !== pdfTriggerId) return
    const id = window.setTimeout(() => {
      setPdfTriggerId(null)
      void handleDownloadPDF()
    }, 450)
    return () => window.clearTimeout(id)
  }, [pdfTriggerId, showBuilder, showPreview, selectedResume?.id, handleDownloadPDF])

  const addExperience = () => {
    setFormData(prev => ({
      ...prev,
      experience: [...prev.experience, {
        title: '',
        company: '',
        duration: '',
        description: '',
        achievements: []
      }]
    }))
  }

  const updateExperience = (index: number, field: string, value: string | string[]) => {
    setFormData(prev => ({
      ...prev,
      experience: prev.experience.map((exp, i) =>
        i === index ? { ...exp, [field]: value } : exp
      )
    }))
  }

  const removeExperience = (index: number) => {
    setFormData(prev => ({
      ...prev,
      experience: prev.experience.filter((_, i) => i !== index)
    }))
  }

  const addEducation = () => {
    setFormData(prev => ({
      ...prev,
      education: [...prev.education, {
        degree: '',
        institution: '',
        year: '',
        gpa: ''
      }]
    }))
  }

  const updateEducation = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      education: prev.education.map((edu, i) =>
        i === index ? { ...edu, [field]: value } : edu
      )
    }))
  }

  const removeEducation = (index: number) => {
    setFormData(prev => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== index)
    }))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div
      className={
        showBuilder
          ? 'flex h-screen flex-col overflow-hidden bg-black'
          : 'min-h-screen bg-black'
      }
    >
      {/* Header */}
      <header className="shrink-0 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-[95%] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-auto flex-col items-start justify-between gap-3 py-3 sm:h-16 sm:flex-row sm:items-center sm:gap-0 sm:py-0">
            <div className="flex items-center min-w-0">
              <BackToDashboardButton className="mr-4" />
              <h1 className="text-xl sm:text-2xl font-bold text-white truncate">Resume Builder</h1>
            </div>
            <Button
              onClick={() => setShowBuilder(true)}
              className="w-full sm:w-auto bg-gradient-to-r from-sky-400 to-blue-600 hover:from-sky-500 hover:to-blue-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Resume
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main
        className={
          showBuilder
            ? 'mx-auto flex min-h-0 w-full max-w-[100%] flex-1 flex-col px-4 py-3 sm:px-6 lg:px-8'
            : 'mx-auto max-w-[95%] px-4 py-8 sm:px-6 lg:px-8'
        }
      >
        {!showBuilder && !showPreview && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <Sparkles className="h-16 w-16 text-sky-400 mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-white mb-2">AI-Powered Resume Builder</h2>
              <p className="text-gray-400 text-lg">
                Create ATS-friendly resumes with AI assistance
              </p>
            </div>

            {resumes.length > 0 ? (
              <div className="mx-auto grid max-w-3xl gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Your resumes
                </h3>
                {resumes.map((resume) => (
                  <div
                    key={resume.id}
                    className="flex flex-wrap items-center justify-between gap-2 border border-gray-700 bg-gray-900/60 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{resume.title}</p>
                      <p className="text-xs text-gray-500">
                        v{resume.version} · {formatResumeDate(resume.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedResume(resume)
                          setShowPreview(true)
                          setShowBuilder(true)
                        }}
                        className="h-8 border-gray-600 px-2 text-xs text-gray-300 hover:border-sky-400"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Preview
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedResume(resume)
                          setShowBuilder(true)
                          setShowPreview(true)
                          setPdfTriggerId(resume.id)
                        }}
                        className="h-8 border-gray-600 px-2 text-xs text-gray-300 hover:border-sky-400"
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        PDF
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void deleteResume(resume.id, resume.title)}
                        className="h-8 border-gray-600 px-2 text-xs text-red-400 hover:border-red-500 hover:text-red-300"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Card className="bg-gray-900/50 border-gray-700">
                <CardContent className="text-center py-12">
                  <FileText className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-400 mb-2">No resumes yet</h3>
                  <p className="text-gray-500 mb-6">
                    Create your first AI-powered resume to get started
                  </p>
                  <Button
                    onClick={() => {
                      setSelectedResume(null)
                      setShowPreview(false)
                      setShowBuilder(true)
                    }}
                    className="bg-gradient-to-r from-sky-400 to-blue-600 hover:from-sky-500 hover:to-blue-700 text-white"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Resume
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {showBuilder && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
              <Card className="flex min-h-0 flex-col overflow-hidden border-gray-700 bg-gray-900/50">
              <CardHeader className="shrink-0 py-3">
                <CardTitle className="text-white">Resume Builder</CardTitle>
                <CardDescription className="text-gray-400">
                  Fill in your information to generate an AI-powered resume
                </CardDescription>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
                {/* Personal Information */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Personal Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      placeholder="Full Name *"
                      value={formData.personalInfo.name}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        personalInfo: { ...prev.personalInfo, name: e.target.value }
                      }))}
                      className="bg-gray-800 border-gray-600"
                    />
                    <Input
                      placeholder="Email *"
                      type="email"
                      value={formData.personalInfo.email}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        personalInfo: { ...prev.personalInfo, email: e.target.value }
                      }))}
                      className="bg-gray-800 border-gray-600"
                    />
                    <Input
                      placeholder="Phone"
                      value={formData.personalInfo.phone}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        personalInfo: { ...prev.personalInfo, phone: e.target.value }
                      }))}
                      className="bg-gray-800 border-gray-600"
                    />
                    <Input
                      placeholder="Location"
                      value={formData.personalInfo.location}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        personalInfo: { ...prev.personalInfo, location: e.target.value }
                      }))}
                      className="bg-gray-800 border-gray-600"
                    />
                  </div>
                </div>

                {/* Skills */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Skills</h3>
                  <Input
                    placeholder="Enter skills separated by commas (e.g., React, Python, Marketing)"
                    value={formData.skills.join(', ')}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      skills: e.target.value.split(',').map(s => s.trim()).filter(s => s)
                    }))}
                    className="bg-gray-800 border-gray-600"
                  />
                </div>

                {/* Experience */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-white">Experience</h3>
                    <Button
                      onClick={addExperience}
                      variant="outline"
                      size="sm"
                      className="text-gray-300 border-gray-600 hover:border-sky-400"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Experience
                    </Button>
                  </div>
                  {formData.experience.map((exp, index) => (
                    <Card key={index} className="bg-gray-800/50 border-gray-600 mb-4">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-4">
                          <h4 className="text-white font-medium">Experience {index + 1}</h4>
                          <Button
                            onClick={() => removeExperience(index)}
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Input
                            placeholder="Job Title"
                            value={exp.title}
                            onChange={(e) => updateExperience(index, 'title', e.target.value)}
                            className="bg-gray-700 border-gray-500"
                          />
                          <Input
                            placeholder="Company"
                            value={exp.company}
                            onChange={(e) => updateExperience(index, 'company', e.target.value)}
                            className="bg-gray-700 border-gray-500"
                          />
                          <Input
                            placeholder="Duration (e.g., Jan 2020 - Present)"
                            value={exp.duration}
                            onChange={(e) => updateExperience(index, 'duration', e.target.value)}
                            className="bg-gray-700 border-gray-500"
                          />
                        </div>
                        <textarea
                          placeholder="Job Description"
                          value={exp.description}
                          onChange={(e) => updateExperience(index, 'description', e.target.value)}
                          className="w-full mt-4 p-3 bg-gray-700 border border-gray-500 rounded-md text-white placeholder-gray-400"
                          rows={3}
                        />
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Education */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-white">Education</h3>
                    <Button
                      onClick={addEducation}
                      variant="outline"
                      size="sm"
                      className="text-gray-300 border-gray-600 hover:border-sky-400"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Education
                    </Button>
                  </div>
                  {formData.education.map((edu, index) => (
                    <Card key={index} className="bg-gray-800/50 border-gray-600 mb-4">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-4">
                          <h4 className="text-white font-medium">Education {index + 1}</h4>
                          <Button
                            onClick={() => removeEducation(index)}
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Input
                            placeholder="Degree"
                            value={edu.degree}
                            onChange={(e) => updateEducation(index, 'degree', e.target.value)}
                            className="bg-gray-700 border-gray-500"
                          />
                          <Input
                            placeholder="Institution"
                            value={edu.institution}
                            onChange={(e) => updateEducation(index, 'institution', e.target.value)}
                            className="bg-gray-700 border-gray-500"
                          />
                          <Input
                            placeholder="Year"
                            value={edu.year}
                            onChange={(e) => updateEducation(index, 'year', e.target.value)}
                            className="bg-gray-700 border-gray-500"
                          />
                          <Input
                            placeholder="GPA (optional)"
                            value={edu.gpa}
                            onChange={(e) => updateEducation(index, 'gpa', e.target.value)}
                            className="bg-gray-700 border-gray-500"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Target Job */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Target Job (Optional)</h3>
                  <div className="space-y-4">
                    <Input
                      placeholder="Job Title"
                      value={formData.targetJob?.title || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        targetJob: { ...prev.targetJob!, title: e.target.value }
                      }))}
                      className="bg-gray-800 border-gray-600"
                    />
                    <Input
                      placeholder="Company"
                      value={formData.targetJob?.company || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        targetJob: { ...prev.targetJob!, company: e.target.value }
                      }))}
                      className="bg-gray-800 border-gray-600"
                    />
                    <textarea
                      placeholder="Job Description"
                      value={formData.targetJob?.description || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        targetJob: { ...prev.targetJob!, description: e.target.value }
                      }))}
                      className="w-full p-3 bg-gray-800 border border-gray-600 rounded-md text-white placeholder-gray-400"
                      rows={4}
                    />
                  </div>
                </div>

                {/* Additional Information */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Additional Information</h3>
                  <textarea
                    placeholder="Any additional information, certifications, or achievements"
                    value={formData.additionalInfo}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      additionalInfo: e.target.value
                    }))}
                    className="w-full p-3 bg-gray-800 border border-gray-600 rounded-md text-white placeholder-gray-400"
                    rows={4}
                  />
                </div>

                {/* Actions */}
                <div className="flex justify-between pt-6">
                  <Button
                    onClick={() => {
                      setShowBuilder(false)
                      setShowPreview(false)
                    }}
                    variant="outline"
                    className="text-gray-300 border-gray-600 hover:border-sky-400"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleGenerateResume}
                    disabled={isGenerating}
                    className="bg-gradient-to-r from-sky-400 to-blue-600 hover:from-sky-500 hover:to-blue-700 text-white"
                  >
                    {isGenerating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate Resume
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
              </Card>

              <Card className="flex min-h-0 w-full flex-col overflow-hidden border-gray-700 bg-gray-900/50">
                <CardHeader className="shrink-0 py-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <CardTitle className="text-white">
                        {showPreview && selectedResume ? 'Resume Preview (Generated)' : 'Live Resume Preview'}
                      </CardTitle>
                      <CardDescription className="text-gray-400">
                        {showPreview && selectedResume ? 'AI-generated content' : 'Preview updates from your inputs'}
                      </CardDescription>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <span className="inline-flex items-center border border-gray-300 bg-gray-100 px-2 py-1 text-xs text-gray-800">
                        ATS {atsScore}/100
                      </span>
                      <Button
                        onClick={() => void handleDownloadPDF()}
                        variant="outline"
                        size="sm"
                        className="h-8 border-gray-600 text-xs text-gray-300 hover:border-sky-400"
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        Download PDF
                      </Button>
                      <Button
                        onClick={() => {
                          setShowBuilder(false)
                          setShowPreview(false)
                        }}
                        variant="outline"
                        size="sm"
                        className="h-8 border-gray-600 text-xs text-gray-300 hover:border-sky-400"
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
                  <div className="flex justify-center bg-white p-0 text-black" id="resume-preview-container">
                    <div className="ats-page" dangerouslySetInnerHTML={{ __html: markdownToATSHtml(previewMarkdown) }} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {!showBuilder && showPreview && selectedResume && (
          <div className="max-w-4xl mx-auto">
            <Card className="bg-gray-900/50 border-gray-700">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-white">{selectedResume.title}</CardTitle>
                    <CardDescription className="text-gray-400">
                      AI-Generated Resume Preview
                    </CardDescription>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      onClick={() => handleDownloadPDF()}
                      variant="outline"
                      size="sm"
                      className="text-gray-300 border-gray-600 hover:border-sky-400"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download PDF
                    </Button>
                    <Button
                      onClick={() => setShowPreview(false)}
                      variant="outline"
                      size="sm"
                      className="text-gray-300 border-gray-600 hover:border-sky-400"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-white text-black p-0" id="resume-preview-container">
                  <div className="ats-page" dangerouslySetInnerHTML={{ __html: markdownToATSHtml(selectedResume.content_markdown) }} />
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
