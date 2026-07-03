import { Mail, MessageCircle } from 'lucide-react'
import { openWhatsApp, openEmail } from '../../lib/utils'
import Button from './Button'

interface SendButtonsProps {
  email?: string
  phone?: string
  subject: string
  emailBody: string
  whatsappMessage: string
  onEmailSent?: () => void
}

export default function SendButtons({
  email,
  phone,
  subject,
  emailBody,
  whatsappMessage,
  onEmailSent,
}: SendButtonsProps) {
  // لا نعرض شيئاً إن لم يتوفّر بريد ولا هاتف (بدل عنصر فارغ في الصفحة)
  if (!email && !phone) return null

  const handleEmail = () => {
    if (!email) return
    openEmail(email, subject, emailBody)
    onEmailSent?.()
  }

  const handleWhatsApp = () => {
    if (!phone) return
    openWhatsApp(phone, whatsappMessage)
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {email && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon={<Mail size={15} />}
          onClick={handleEmail}
          title={`إرسال إلى ${email}`}
          aria-label={`إرسال بريد إلى ${email}`}
        >
          إرسال بريد
        </Button>
      )}
      {phone && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon={<MessageCircle size={15} className="text-green-600" />}
          onClick={handleWhatsApp}
          title={`واتساب ${phone}`}
          aria-label={`إرسال عبر واتساب إلى ${phone}`}
          className="border-green-300 text-green-700 hover:bg-green-50"
        >
          واتساب
        </Button>
      )}
    </div>
  )
}
