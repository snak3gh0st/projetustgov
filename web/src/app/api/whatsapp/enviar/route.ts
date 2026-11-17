import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { canEditLeads, verifyLeadAccess } from '@/lib/dal'
import { query } from '@/lib/db'
import { SendLimiter, canManageConversations } from '@/lib/whatsapp/access'
import { conversaVisivel, whatsappGuard } from '@/lib/whatsapp/api'
import { sendMedia, sendText, sendVoice, sendTemplate } from '@/lib/whatsapp/evolution'
import { classificarArquivo } from '@/lib/whatsapp/midia'
import { configForInstance, freeformAllowed, officialTemplates } from '@/lib/whatsapp/channels'
import { canonicalPhone } from '@/lib/whatsapp/phone'
import { cnpjsDoTelefone, recordMessage } from '@/lib/whatsapp/store'
import type { MensagemTipo, MidiaInfo } from '@/lib/whatsapp/webhook'

export const dynamic = 'force-dynamic'

// Proteção do número: no máximo 20 envios por minuto por pessoa.
const limiter = new SendLimiter(20, 60_000)

type Envio =
  | { tipo: 'texto'; texto: string }
  | { tipo: Exclude<MensagemTipo, 'texto'>; mediatype: 'image' | 'video' | 'document' | 'audio'; legenda: string | null; midia: MidiaInfo; arquivo: File }

// POST /api/whatsapp/enviar
//   JSON { conversa_id?, telefone?, cnpj?, texto }
//   multipart { conversa_id? | telefone + cnpj, arquivo, voz?: '1', legenda? } - foto, vídeo, documento ou mensagem de voz
export async function POST(request: NextRequest) {
  const guard = await whatsappGuard(request)
  if (guard instanceof NextResponse) return guard
  const { session } = guard
  let cfg = guard.cfg
  let template: { name: string; language: string } | undefined
  let lastInbound: string | null = null
  if (!canEditLeads(session.role)) return NextResponse.json({ error: 'Forbidden: read-only role' }, { status: 403 })

  let body: { conversa_id?: number; telefone?: string; cnpj?: string }
  let envio: Envio
  if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
    const form = await request.formData().catch(() => null)
    const arquivo = form?.get('arquivo')
    if (!form || !(arquivo instanceof File)) return NextResponse.json({ error: 'Escolha um arquivo para enviar.' }, { status: 400 })
    const campo = (k: string) => { const v = form.get(k); return typeof v === 'string' && v.trim() ? v.trim() : undefined }
    body = { conversa_id: campo('conversa_id') ? Number(campo('conversa_id')) : undefined, telefone: campo('telefone'), cnpj: campo('cnpj') }
    const voz = campo('voz') === '1'
    const legenda = voz ? null : campo('legenda') ?? null
    if (legenda && legenda.length > 1024) return NextResponse.json({ error: 'Escreva uma legenda de até 1024 caracteres.' }, { status: 400 })
    const mimetype = arquivo.type || 'application/octet-stream'
    const c = classificarArquivo({ tamanho: arquivo.size, mimetype, voz })
    if (!c.ok) return NextResponse.json({ error: c.erro }, { status: 400 })
    const nome = (arquivo.name || 'arquivo').slice(0, 200)
    envio = {
      tipo: c.tipo as Exclude<MensagemTipo, 'texto'>, mediatype: c.mediatype, legenda, arquivo,
      midia: voz ? { mimetype: 'audio/ogg; codecs=opus', tamanho: arquivo.size } : { mimetype, fileName: nome, tamanho: arquivo.size },
    }
  } else {
    const json = await request.json().catch(() => ({})) as { conversa_id?: number; telefone?: string; cnpj?: string; texto?: string; template?: string }
    template = json.template ? officialTemplates().find((t) => t.name === json.template) : undefined
    if (json.template && !template) return NextResponse.json({ error: 'Modelo não configurado.' }, { status: 400 })
    const texto = template ? `Modelo aprovado: ${template.name}` : (json.texto ?? '').trim()
    if (!texto || texto.length > 4096) return NextResponse.json({ error: 'Escreva uma mensagem de até 4096 caracteres.' }, { status: 400 })
    body = json
    envio = { tipo: 'texto', texto }
  }

  let destino: string | null = null
  let jid: string | null = null
  let lid: string | null = null
  // CNPJ a ligar explicitamente: só a gestão, quando o telefone é de mais de um lead.
  let ligarA: string | null = null
  if (body.conversa_id) {
    const conversa = await conversaVisivel(Number(body.conversa_id), session, cfg)
    if (!conversa) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const channelConfig = configForInstance(conversa.instancia)
    if (!channelConfig) return NextResponse.json({ error: 'Canal indisponível.' }, { status: 409 })
    cfg = channelConfig
    lastInbound = conversa.ultima_recebida_em
    // Conversa sem telefone (só o lid do WhatsApp) guarda o JID no lugar do telefone.
    destino = conversa.telefone.includes('@') ? null : canonicalPhone(conversa.telefone)
    jid = conversa.jid
    lid = conversa.lid
  } else {
    destino = canonicalPhone(body.telefone)
    if (!destino) return NextResponse.json({ error: 'Telefone inválido.' }, { status: 400 })
    const cnpj = body.cnpj?.replace(/\D/g, '') || null
    // Começar conversa pelo card: só com lead que a pessoa enxerga.
    if (!cnpj) return NextResponse.json({ error: 'Informe o lead da conversa.' }, { status: 400 })
    const stored = await query<{ cnpj: string }>(`SELECT cnpj FROM vendedor_projetos WHERE REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') = $1 LIMIT 1`, [cnpj])
    if (!stored[0] || !(await verifyLeadAccess(stored[0].cnpj, session.userId, session.role))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    // Conversa que já existe segue o escopo de quem a vê (inclusive a ligada à mão pela gestão).
    const [existente] = await query<{ id: number; ultima_recebida_em: string | null }>(`SELECT id, ultima_recebida_em FROM whatsapp_conversas WHERE instancia = $1 AND telefone = $2`, [cfg.instance, destino])
    if (existente) {
      lastInbound = existente.ultima_recebida_em
      if (!(await conversaVisivel(existente.id, session, cfg))) {
        return NextResponse.json({ error: 'Essa conversa está com outra pessoa da equipe. Fale com a gestão.' }, { status: 403 })
      }
    } else {
      // Conversa nova: o telefone tem de ser deste lead; telefone de mais de um lead fica com a gestão.
      const cnpjs = await cnpjsDoTelefone(destino)
      if (!cnpjs.includes(cnpj)) return NextResponse.json({ error: 'Esse telefone não é deste lead.' }, { status: 403 })
      if (cnpjs.length > 1) {
        if (!canManageConversations(session.role)) {
          return NextResponse.json({ error: 'Esse telefone está em mais de um lead. Peça à gestão para ligar a conversa ao lead certo.' }, { status: 409 })
        }
        ligarA = cnpj
      }
    }
  }

  if (template && cfg.channel !== 'oficial') return NextResponse.json({ error: 'Modelos são exclusivos do canal oficial.' }, { status: 400 })
  if (cfg.channel === 'oficial' && !template && !freeformAllowed(lastInbound)) {
    return NextResponse.json({ error: 'Para iniciar ou retomar pelo número oficial após 24 horas, envie um modelo aprovado pela Meta.', code: 'TEMPLATE_REQUIRED' }, { status: 409 })
  }

  if (!limiter.allow(session.userId)) {
    return NextResponse.json({ error: 'Muitos envios em sequência. Espere um minuto.' }, { status: 429 })
  }

  const numero = destino ?? jid!
  const base = {
    kind: 'mensagem' as const, instancia: cfg.instance, telefone: destino, jid: destino ? `${destino}@s.whatsapp.net` : jid!, lid,
    nome: null, fromMe: true, enviadaEm: new Date().toISOString(),
    ...(envio.tipo === 'texto'
      ? { texto: envio.texto, tipo: 'texto' as const, midia: null }
      : { texto: envio.legenda, tipo: envio.tipo, midia: envio.midia }),
  }
  const ligar = (conversaId: number) => ligarA
    ? query(`UPDATE whatsapp_conversas SET lead_cnpj = $2 WHERE id = $1 AND lead_cnpj IS NULL`, [conversaId, ligarA])
    : Promise.resolve()

  let waId: string
  try {
    if (template) waId = (await sendTemplate(numero, template.name, template.language, cfg)).waId
    else if (envio.tipo === 'texto') waId = (await sendText(numero, envio.texto, cfg)).waId
    else {
      const base64 = Buffer.from(await envio.arquivo.arrayBuffer()).toString('base64')
      waId = envio.mediatype === 'audio'
        ? (await sendVoice(numero, base64, cfg)).waId
        : (await sendMedia(numero, { mediatype: envio.mediatype, mimetype: envio.midia.mimetype!, caption: envio.legenda, fileName: envio.midia.fileName!, base64 }, cfg)).waId
    }
  } catch (error) {
    console.error('[api/whatsapp/enviar] falhou', { instancia: cfg.instance, tipo: error instanceof Error ? error.name : 'unknown' })
    // Fica registrada como não enviada, para a pessoa ver e tentar de novo.
    const falha = await recordMessage({ ...base, waId: `FALHA-${randomUUID()}` }, { origem: 'projete', autorId: session.userId, status: 'falhou' })
    await ligar(falha.conversaId)
    return NextResponse.json({ error: 'Não foi possível enviar pelo WhatsApp.', conversa_id: falha.conversaId }, { status: 502 })
  }
  // Já saiu pelo WhatsApp: um erro daqui em diante não vira "Não enviada" (tentar de novo mandaria duas vezes).
  try {
    const gravada = await recordMessage({ ...base, waId }, { origem: 'projete', autorId: session.userId })
    await ligar(gravada.conversaId)
    return NextResponse.json({ ok: true, conversa_id: gravada.conversaId, mensagem_id: gravada.mensagemId })
  } catch (error) {
    console.error('[api/whatsapp/enviar] enviada, mas não gravada:', waId, error)
    return NextResponse.json({ ok: true, aviso: 'Mensagem enviada; ela aparece aqui quando o WhatsApp confirmar.' })
  }
}
