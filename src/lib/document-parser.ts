import type { ExtractedDocumentData } from '../types'

const PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

let pdfjsReady: Promise<typeof import('pdfjs-dist')> | null = null

function getPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsReady) {
    pdfjsReady = import('pdfjs-dist').then((pdfjs) => {
      const lib = pdfjs as typeof import('pdfjs-dist') & { default?: typeof import('pdfjs-dist') }
      const mod = lib.default ?? lib
      if (mod.GlobalWorkerOptions) {
        mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN
      }
      return mod
    })
  }
  return pdfjsReady
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await getPdfjs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
  let text = ''

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n'
  }

  return text
}

async function renderPdfPagesToImages(file: File): Promise<string[]> {
  const pdfjs = await getPdfjs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
  const images: string[] = []
  const maxPages = Math.min(pdf.numPages, 8)

  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2.5 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport }).promise
    images.push(canvas.toDataURL('image/png'))
    canvas.remove()
  }

  return images
}

async function ocrImage(imageSource: string | File): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('ara+eng')
  const { data: { text } } = await worker.recognize(imageSource)
  await worker.terminate()
  return text
}

async function ocrMultipleImages(images: string[]): Promise<string> {
  const { createWorker, createScheduler } = await import('tesseract.js')
  const scheduler = createScheduler()

  const workerCount = Math.min(images.length, 3)
  for (let i = 0; i < workerCount; i++) {
    const worker = await createWorker('ara+eng')
    scheduler.addWorker(worker)
  }

  const results = await Promise.all(
    images.map(img => scheduler.addJob('recognize', img))
  )

  await scheduler.terminate()
  return results.map(r => r.data.text).join('\n')
}

async function extractExcelData(file: File): Promise<{ text: string; rows: unknown[][] }> {
  const XLSX = await import('xlsx')
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
  const text = rows.map(r => (r as unknown[]).join('\t')).join('\n')
  return { text, rows }
}

export async function parseDocument(file: File): Promise<{ text: string; data: ExtractedDocumentData }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  let text = ''

  if (ext === 'pdf') {
    text = await extractPdfText(file)
    const stripped = text.replace(/\s+/g, '').trim()
    if (stripped.length < 30) {
      const images = await renderPdfPagesToImages(file)
      if (images.length === 1) {
        text = await ocrImage(images[0])
      } else if (images.length > 1) {
        text = await ocrMultipleImages(images)
      }
    }
  } else if (['xlsx', 'xls', 'csv'].includes(ext)) {
    const result = await extractExcelData(file)
    text = result.text
  } else if (ext === 'txt') {
    text = await file.text()
  } else if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff', 'tif'].includes(ext)) {
    text = await ocrImage(file)
  } else {
    throw new Error(`نوع الملف غير مدعوم: .${ext}`)
  }

  if (!text || text.trim().length < 5) {
    throw new Error('لم يتم استخراج أي نص من الملف. تأكد من جودة الصورة أو أن الملف يحتوي على نص قابل للقراءة.')
  }

  const data = extractFieldsFromText(text)
  return { text, data }
}

// ============================================================
// ALMAIMOUN CONTRACT-SPECIFIC EXTRACTION
// Tuned for the exact semantic layout of official contracts
// ============================================================

function normalizeArabicText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[ـ]/g, '')
    .replace(/\u200c/g, '')
    .trim()
}

function extractAlmaimounClientName(text: string): string | undefined {
  // Pattern: "الطرف الأول: محمد جواد الحلواجي ، بحريني الجنسية"
  const patterns = [
    /الطرف الأول\s*[:\s]\s*(.+?)\s*[،,]\s*بحريني/,
    /الطرف الأول\s*[:\s]\s*(.+?)\s*[،,]\s*بحرين/,
    /الطرف الأول\s*[:\s]\s*(.+?)\s*[،,]/,
    /الطرف الاول\s*[:\s]\s*(.+?)\s*[،,]\s*بحريني/,
    /الطرف الاول\s*[:\s]\s*(.+?)\s*[،,]/,
  ]
  for (const p of patterns) {
    const match = text.match(p)
    if (match) {
      const name = match[1].trim().replace(/^السيد\s+|^السيدة\s+/g, '').trim()
      if (name.length >= 3 && name.length <= 60) return name
    }
  }
  return undefined
}

function extractAlmaimounCPR(text: string): string | undefined {
  // Pattern: "الرقم الشخصي: 780803965"
  const patterns = [
    /الرقم الشخصي\s*[:\s]\s*(\d{9})/,
    /الرقم الشخصي\s*[:\s]\s*(\d{2}\s*\d{4}\s*\d{3})/,
    /رقم الهوية\s*[:\s]\s*(\d{9})/,
    /CPR\s*[:\s#]*\s*(\d{9})/i,
    /C\.P\.R\s*[:\s#]*\s*(\d{9})/i,
  ]
  for (const p of patterns) {
    const match = text.match(p)
    if (match) return match[1].replace(/\s/g, '')
  }
  return undefined
}

function extractAlmaimounPhone(text: string): string | undefined {
  // Pattern: "رقم الهاتف: 36696868"
  const patterns = [
    /رقم الهاتف\s*[:\s]\s*(\d{8})/,
    /رقم الجوال\s*[:\s]\s*(\d{8})/,
    /الهاتف\s*[:\s]\s*(\d{8})/,
    /الجوال\s*[:\s]\s*(\d{8})/,
    /هاتف\s*[:\s]\s*(\d{8})/,
    /جوال\s*[:\s]\s*(\d{8})/,
    /موبايل\s*[:\s]\s*(\d{8})/,
    /Mobile\s*[:\s]\s*(\d{8})/i,
    /Tel\s*[:\s]\s*(\d{8})/i,
  ]
  for (const p of patterns) {
    const match = text.match(p)
    if (match) return match[1]
  }
  // Fallback: look for any standalone 8-digit Bahrain number (3x, 6x, 7x, 9x)
  const fallback = text.match(/(?<!\d)[3679]\d{7}(?!\d)/)
  if (fallback) return fallback[0]
  return undefined
}

function extractAlmaimounLocation(text: string): string | undefined {
  // Pattern: "وتقع في شرق سترة، مملكة البحرين" or "وتقع في منطقة ... ، مملكة البحرين"
  const patterns = [
    /وتقع في\s+(.+?)\s*[،,]\s*مملكة البحرين/,
    /وتقع في\s+(.+?)\s*[،,]\s*البحرين/,
    /وتقع في\s+(.+?)(?:\s*[\.،,\n])/,
    /الكائن(?:ة)? في\s+(.+?)\s*[،,]\s*مملكة البحرين/,
    /الكائن(?:ة)? في\s+(.+?)\s*[،,]/,
    /موقع المشروع\s*[:\s]\s*(.+?)(?:\s*[،,\n])/,
    /موقع العمل\s*[:\s]\s*(.+?)(?:\s*[،,\n])/,
    /Location\s*[:\s]\s*(.+?)(?:\s*[،,\n])/i,
  ]
  for (const p of patterns) {
    const match = text.match(p)
    if (match) {
      const loc = match[1].trim()
      if (loc.length >= 3 && loc.length <= 80) return loc
    }
  }
  return undefined
}

function extractAlmaimounContractValue(text: string): number | undefined {
  // Pattern: "مبلغ إجمالي للمقاول قدره ... (46000 دينار)"
  // Look for number inside parentheses near "قدره" or "مبلغ"
  const patterns = [
    /قدره\s+.{0,80}?\(\s*([\d,]+(?:\.\d+)?)\s*(?:دينار|BHD|BD|د\.ب)/,
    /قدره\s+.{0,80}?\(\s*([\d,]+(?:\.\d+)?)\s*\)/,
    /مبلغ\s+.{0,60}?\(\s*([\d,]+(?:\.\d+)?)\s*(?:دينار|BHD|BD|د\.ب)/,
    /مبلغ\s+.{0,60}?\(\s*([\d,]+(?:\.\d+)?)\s*\)/,
    /إجمالي.*?قدره\s+.{0,80}?\(\s*([\d,]+(?:\.\d+)?)\s*\)/,
    // Direct value patterns
    /(?:قيمة العقد|إجمالي قيمة العقد|قيمة المقاولة|المبلغ الإجمالي)\s*[:\s]\s*([\d,]+(?:\.\d{1,3})?)\s*(?:دينار|BHD|BD|د\.ب)?/,
    /([\d,]+(?:\.\d{1,3})?)\s*(?:دينار بحريني|BHD|BD)\s*(?:فقط)?/,
    /(?:Contract Value|Total Contract)\s*[:\s]\s*([\d,]+(?:\.\d+)?)/i,
  ]
  for (const p of patterns) {
    const match = text.match(p)
    if (match) {
      const val = parseFloat(match[1].replace(/,/g, ''))
      if (val >= 100) return val
    }
  }
  return undefined
}

function extractAlmaimounMilestones(text: string, contractValue: number): Array<{ name: string; amount: number; percentage: number }> | undefined {
  const milestones: Array<{ name: string; amount: number; percentage: number }> = []

  // Look for the payment schedule section
  const scheduleSection = findPaymentScheduleSection(text)

  if (scheduleSection) {
    // Parse rows: "3500 | الدفعة المقدمة" or "3500 الدفعة المقدمة" or tabular layout
    const rows = parsePaymentRows(scheduleSection, contractValue)
    if (rows.length > 0) return rows
  }

  // Fallback: scan entire text for milestone patterns
  return extractMilestonesFallback(text, contractValue)
}

function findPaymentScheduleSection(text: string): string | undefined {
  // Find section start markers
  const sectionMarkers = [
    /(?:جدول المدفوعات|جدول الدفع|جدول الدفعات|مراحل الدفع|خطة الدفع|Payment Schedule)/i,
  ]

  for (const marker of sectionMarkers) {
    const match = text.match(marker)
    if (match && match.index !== undefined) {
      // Extract 2000 chars after the section header
      return text.slice(match.index, match.index + 2000)
    }
  }
  return undefined
}

function parsePaymentRows(section: string, contractValue: number): Array<{ name: string; amount: number; percentage: number }> {
  const milestones: Array<{ name: string; amount: number; percentage: number }> = []
  const lines = section.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length < 3) continue

    // Pattern A: "3500 | الدفعة المقدمة" (amount first, pipe separator)
    const pipePatternAmtFirst = trimmed.match(/^([\d,]+(?:\.\d+)?)\s*[|│]\s*(.+)/)
    if (pipePatternAmtFirst) {
      const amount = parseFloat(pipePatternAmtFirst[1].replace(/,/g, ''))
      const name = pipePatternAmtFirst[2].trim()
      if (amount > 0 && name.length > 2) {
        milestones.push({
          name,
          amount,
          percentage: contractValue > 0 ? Math.round((amount / contractValue) * 1000) / 10 : 0,
        })
        continue
      }
    }

    // Pattern B: "الدفعة المقدمة | 3500" (description first, pipe separator)
    const pipePatternDescFirst = trimmed.match(/^(.+?)\s*[|│]\s*([\d,]+(?:\.\d+)?)/)
    if (pipePatternDescFirst) {
      const name = pipePatternDescFirst[1].trim()
      const amount = parseFloat(pipePatternDescFirst[2].replace(/,/g, ''))
      if (amount > 0 && name.length > 2 && !/جدول|المبلغ|الوصف|المرحلة/.test(name)) {
        milestones.push({
          name,
          amount,
          percentage: contractValue > 0 ? Math.round((amount / contractValue) * 1000) / 10 : 0,
        })
        continue
      }
    }

    // Pattern C: amount followed by Arabic text (tab or multi-space separated)
    const tabPattern = trimmed.match(/^([\d,]+(?:\.\d+)?)\s{2,}(.+)/)
    if (tabPattern) {
      const amount = parseFloat(tabPattern[1].replace(/,/g, ''))
      const name = tabPattern[2].trim()
      if (amount > 0 && name.length > 2 && !/المبلغ|الوصف/.test(name)) {
        milestones.push({
          name,
          amount,
          percentage: contractValue > 0 ? Math.round((amount / contractValue) * 1000) / 10 : 0,
        })
        continue
      }
    }

    // Pattern D: Arabic text followed by amount (tab or multi-space separated)
    const tabPatternReverse = trimmed.match(/^(.+?)\s{2,}([\d,]+(?:\.\d+)?)$/)
    if (tabPatternReverse) {
      const name = tabPatternReverse[1].trim()
      const amount = parseFloat(tabPatternReverse[2].replace(/,/g, ''))
      if (amount > 0 && name.length > 2 && !/المبلغ|الوصف/.test(name)) {
        milestones.push({
          name,
          amount,
          percentage: contractValue > 0 ? Math.round((amount / contractValue) * 1000) / 10 : 0,
        })
        continue
      }
    }

    // Pattern E: "الدفعة المقدمة - 3500" or "الدفعة المقدمة : 3500"
    const dashPattern = trimmed.match(/^(.+?)\s*[-–:]\s*([\d,]+(?:\.\d+)?)\s*(?:دينار|BHD|BD|د\.ب)?$/)
    if (dashPattern) {
      const name = dashPattern[1].trim().replace(/^\d+[.\)]\s*/, '')
      const amount = parseFloat(dashPattern[2].replace(/,/g, ''))
      if (amount > 0 && name.length > 2 && !/المبلغ|الوصف|جدول/.test(name)) {
        milestones.push({
          name,
          amount,
          percentage: contractValue > 0 ? Math.round((amount / contractValue) * 1000) / 10 : 0,
        })
        continue
      }
    }

    // Pattern F: "3500 - الدفعة المقدمة" or "3500 دينار - الدفعة المقدمة"
    const amtDashPattern = trimmed.match(/^([\d,]+(?:\.\d+)?)\s*(?:دينار|BHD|BD|د\.ب)?\s*[-–:]\s*(.+)/)
    if (amtDashPattern) {
      const amount = parseFloat(amtDashPattern[1].replace(/,/g, ''))
      const name = amtDashPattern[2].trim()
      if (amount > 0 && name.length > 2 && !/المبلغ|الوصف/.test(name)) {
        milestones.push({
          name,
          amount,
          percentage: contractValue > 0 ? Math.round((amount / contractValue) * 1000) / 10 : 0,
        })
        continue
      }
    }
  }

  return milestones
}

function extractMilestonesFallback(text: string, contractValue: number): Array<{ name: string; amount: number; percentage: number }> | undefined {
  const milestones: Array<{ name: string; amount: number; percentage: number }> = []
  let match

  // Percentage-based: "دفعة مقدمة - 10%"
  const pctPattern = /([^\n\d]{3,60}?)[\s\-–:]+(\d+(?:\.\d+)?)\s*%/g
  while ((match = pctPattern.exec(text)) !== null) {
    const name = match[1].trim().replace(/^[-–•\d.\)\s]+/, '')
    const pct = parseFloat(match[2])
    if (pct > 0 && pct <= 100 && name.length > 2) {
      milestones.push({
        name,
        percentage: pct,
        amount: contractValue > 0 ? Math.round((contractValue * pct) / 100) : 0,
      })
    }
  }

  if (milestones.length > 0) return milestones

  // Amount-based with currency: "أعمال الأساسات: 5,000 BHD"
  const amtPattern = /([^\n\d]{3,60}?)[\s\-–:]+([\d,]+\.?\d*)\s*(?:BHD|BD|د\.ب|دينار)/gi
  while ((match = amtPattern.exec(text)) !== null) {
    const name = match[1].trim().replace(/^[-–•\d.\)\s]+/, '')
    const amount = parseFloat(match[2].replace(/,/g, ''))
    if (amount > 0 && name.length > 2) {
      milestones.push({
        name,
        amount,
        percentage: contractValue > 0 ? Math.round((amount / contractValue) * 1000) / 10 : 0,
      })
    }
  }

  if (milestones.length > 0) return milestones

  // Numbered list: "1. Foundation 5000"
  const numberedPattern = /(?:^|\n)\s*(\d+)[.\)]\s*(.{3,50}?)[\s\-–:]+(\d[\d,]*\.?\d*)/gm
  while ((match = numberedPattern.exec(text)) !== null) {
    const name = match[2].trim()
    const val = parseFloat(match[3].replace(/,/g, ''))
    if (val > 0 && name.length > 2) {
      milestones.push({
        name,
        percentage: contractValue > 0 ? Math.round((val / contractValue) * 1000) / 10 : 0,
        amount: val,
      })
    }
  }

  return milestones.length > 0 ? milestones : undefined
}

// ============================================================
// MAIN FIELD EXTRACTION — Almaimoun-first, then generic fallback
// ============================================================

export function extractFieldsFromText(text: string): ExtractedDocumentData {
  const data: ExtractedDocumentData = {}
  const normalized = normalizeArabicText(text)

  // --- ALMAIMOUN-SPECIFIC EXTRACTION (highest priority) ---
  data.client_name = extractAlmaimounClientName(normalized) ?? extractAlmaimounClientName(text)
  data.client_cpr = extractAlmaimounCPR(normalized) ?? extractAlmaimounCPR(text)
  data.client_phone = extractAlmaimounPhone(normalized) ?? extractAlmaimounPhone(text)
  data.location = extractAlmaimounLocation(normalized) ?? extractAlmaimounLocation(text)
  data.contract_value = extractAlmaimounContractValue(normalized) ?? extractAlmaimounContractValue(text)

  // --- GENERIC FALLBACK for fields not caught by Almaimoun patterns ---

  // Client name fallback
  if (!data.client_name) {
    const clientPatterns = [
      /(?:Client Name|اسم العميل|صاحب العمل|المالك|صاحب المشروع)[:\s]*([^\n]{3,60})/i,
      /(?:Owner|Employer|العميل)[:\s]*([^\n]{3,60})/i,
      /(?:Mr\.|Mrs\.|Ms\.|السيد|السيدة)\s+([^\n,]{3,40})/i,
    ]
    for (const p of clientPatterns) {
      const m = text.match(p)
      if (m) { data.client_name = m[1].trim(); break }
    }
  }

  // CPR fallback
  if (!data.client_cpr) {
    const m = text.match(/(?:CPR|C\.P\.R|رقم الهوية|السجل المدني|البطاقة الذكية|ID No)[:\s.#]*(\d{9})/i)
    if (m) data.client_cpr = m[1]
  }

  // Phone fallback
  if (!data.client_phone) {
    const m = text.match(/(?:Mobile|Tel|Phone|هاتف|جوال|موبايل|رقم الهاتف)[:\s]*((?:\+?973)?[\s-]?[3679]\d{3}[\s-]?\d{4})/i)
    if (m) data.client_phone = m[1].replace(/[\s-]/g, '')
  }
  if (!data.phone) data.phone = data.client_phone

  // Location fallback
  if (!data.location) {
    const locPatterns = [
      /(?:Location|Site Location|موقع المشروع|الموقع|موقع العمل)[:\s]*([^\n]{3,80})/i,
      /(?:Block|بلوك|مجمع)\s*\d+[,،\s]*(?:Road|طريق|شارع)\s*\d+[^\n]*/i,
    ]
    for (const p of locPatterns) {
      const m = text.match(p)
      if (m) { data.location = (m[1] ?? m[0]).trim(); break }
    }
  }

  // Contract value fallback
  if (!data.contract_value) {
    const valPatterns = [
      /(?:Contract Value|Total Contract)[:\s]*([\d,]+\.?\d*)/i,
      /(?:قيمة المقاولة|المبلغ الإجمالي)[:\s]*([\d,]+\.?\d*)/i,
    ]
    for (const p of valPatterns) {
      const m = text.match(p)
      if (m) {
        const v = parseFloat(m[1].replace(/,/g, ''))
        if (v >= 100) { data.contract_value = v; break }
      }
    }
  }

  // Email
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w{2,}/)
  if (emailMatch) data.email = emailMatch[0]

  // Tax number
  const trnMatch = text.match(/(?:TRN|VAT|ضريبة|رقم الضريبة|الرقم الضريبي)[:\s#]*([\d-]{8,20})/i)
  if (trnMatch) data.tax_number = trnMatch[1].trim()

  // Commercial registration
  const crMatch = text.match(/(?:CR|C\.R|سجل تجاري|الترخيص|رقم السجل التجاري)[:\s#]*([\d\/-]{4,15})/i)
  if (crMatch) data.commercial_reg = crMatch[1].trim()

  // Invoice number
  const invMatch = text.match(/(?:Invoice|فاتورة|INV)[:\s#-]*([\w-]+)/i)
  if (invMatch) data.invoice_number = invMatch[1].trim()

  // LPO number
  const lpoMatch = text.match(/(?:LPO|PO|أمر الشراء|أمر شراء)[:\s#-]*([\w-]+)/i)
  if (lpoMatch) data.lpo_number = lpoMatch[1].trim()

  // Date
  const dateMatch = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/)
  if (dateMatch) {
    const [, d, m, y] = dateMatch
    data.date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Amount (as standalone field)
  if (!data.amount && data.contract_value) data.amount = data.contract_value

  // IBAN
  const ibanMatch = text.match(/(?:IBAN)[:\s]*(BH\d{20,22}|AE\d{21,23})/i)
  if (ibanMatch) data.bank_iban = ibanMatch[1].trim()

  // Bank account
  const bankAccMatch = text.match(/(?:Account|حساب|رقم الحساب)[:\s#]*([\d-]{8,20})/i)
  if (bankAccMatch) data.bank_account = bankAccMatch[1].trim()

  // Address
  const addrMatch = text.match(/(?:Address|العنوان|عنوان)[:\s]*([^\n]{10,80})/i)
  if (addrMatch) data.address = addrMatch[1].trim()

  // Payment terms
  const termsMatch = text.match(/(?:Payment Terms|شروط الدفع|طريقة الدفع)[:\s]*([^\n]{5,60})/i)
  if (termsMatch) data.payment_terms = termsMatch[1].trim()

  // Notes
  const notesMatch = text.match(/(?:Notes|Remarks|ملاحظات)[:\s]*([^\n]{5,200})/i)
  if (notesMatch) data.notes = notesMatch[1].trim()

  // Project name
  const projPatterns = [
    /(?:اسم المشروع|عنوان المشروع|المشروع|مشروع|Project Name)[:\s]*([^\n]{3,80})/i,
    /(?:Subject|الموضوع)[:\s]*([^\n]{3,80})/i,
  ]
  for (const p of projPatterns) {
    const m = text.match(p)
    if (m) { data.project_name = m[1].trim(); break }
  }

  // Start date
  const startPatterns = [
    /(?:Start Date|Commencement|تاريخ البداية|تاريخ البدء|تاريخ المباشرة|بداية العقد)[:\s]*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/i,
    /(?:Start Date|Commencement|تاريخ البداية|تاريخ البدء)[:\s]*(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/i,
  ]
  for (const p of startPatterns) {
    const m = text.match(p)
    if (m) {
      if (m[1].length === 4) data.start_date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
      else data.start_date = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
      break
    }
  }

  // End date
  const endPatterns = [
    /(?:End Date|Completion|تاريخ الانتهاء|تاريخ الإنجاز|انتهاء العقد|تاريخ التسليم)[:\s]*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/i,
    /(?:End Date|Completion|تاريخ الانتهاء|تاريخ الإنجاز)[:\s]*(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/i,
  ]
  for (const p of endPatterns) {
    const m = text.match(p)
    if (m) {
      if (m[1].length === 4) data.end_date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
      else data.end_date = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
      break
    }
  }

  // Duration to end_date
  if (!data.end_date && data.start_date) {
    const durMatch = text.match(/(?:Duration|المدة|مدة التنفيذ|مدة العقد|مدة المشروع)[:\s]*(\d+)\s*(?:months?|أشهر|شهر|شهور)/i)
    if (durMatch) {
      const months = parseInt(durMatch[1])
      const start = new Date(data.start_date)
      start.setMonth(start.getMonth() + months)
      data.end_date = start.toISOString().slice(0, 10)
    }
  }

  // Milestones — Almaimoun table format first, then fallback
  data.milestones = extractAlmaimounMilestones(text, data.contract_value ?? 0)

  return data
}
