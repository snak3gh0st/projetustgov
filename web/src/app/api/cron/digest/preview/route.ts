import { NextRequest, NextResponse } from 'next/server'
import { digestEmail } from '@/lib/email-templates'

export const dynamic = 'force-dynamic'

const MOCK_DATA = {
  items: [
    {
      propostaKey: '006874/2026',
      titulo: 'Apoio à implementação de políticas públicas para mulheres em situação de vulnerabilidade',
      eventType: 'situacao',
      eventAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
      concedente: 'MINISTÉRIO DAS MULHERES',
      proponente: 'INSTITUTO SOCIAL DO DISTRITO FEDERAL',
      situacao: 'Complementação de Documentação',
      transferGovId: '123456',
    },
    {
      propostaKey: '004512/2025',
      titulo: 'Fortalecimento da rede de assistência social municipal',
      eventType: 'comment',
      eventAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
      concedente: 'MINISTÉRIO DO DESENVOLVIMENTO SOCIAL',
      proponente: 'PREFEITURA MUNICIPAL DE BRASÍLIA',
      situacao: 'Em Execução',
      transferGovId: '654321',
    },
  ],
  stale: [],
}

export async function GET(request: NextRequest) {
  try {
    const to = request.nextUrl.searchParams.get('to') || 'gustavo@projetus.org'

    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const fromEmail = process.env.DIGEST_FROM_EMAIL || 'Projetus <noreply@projetus.org>'
    const appUrl = process.env.NEXTAUTH_URL || 'https://projetus.vercel.app'

    const { subject, html } = digestEmail({
      nome: 'Gustavo',
      items: MOCK_DATA.items,
      stale: MOCK_DATA.stale,
      appUrl,
    })

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to,
      subject: `[TESTE] ${subject}`,
      html,
    })

    if (error) {
      return NextResponse.json({ error }, { status: 500 })
    }

    return NextResponse.json({ sent: true, id: data?.id, to, subject })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
