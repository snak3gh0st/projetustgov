#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(new URL('.', import.meta.url).pathname, '..')
const read = file => readFileSync(resolve(ROOT, file), 'utf8')

let passed = 0
let failed = 0
function check(condition, label) {
  if (condition) {
    console.log(`PASS ${label}`)
    passed++
  } else {
    console.error(`FAIL ${label}`)
    failed++
  }
}

const catalog = read('src/lib/crm-catalog.ts')
const home = read('src/app/HomeClient.tsx')
const leads = read('src/app/leads/LeadsClient.tsx')
const leadApi = read('src/app/api/leads/[cnpj]/route.ts')
const executionApi = read('src/app/api/execucao/route.ts')
const executionUi = read('src/app/execucao/ExecucaoClient.tsx')
const leadSlideOver = read('src/components/LeadSlideOver.tsx')
const sync = read('src/lib/execucao-sync.ts')
const digest = read('src/lib/digest-email.ts')
const emailService = read('src/lib/email-service.ts')
const setup = read('src/app/api/setup-crm/route.ts')
const whatsappAction = read('src/components/WhatsAppAction.tsx')
const s3Checklist = readFileSync(resolve(ROOT, '../docs/entregas/s3-whatsapp-meta-api-checklist.md'), 'utf8')
const systemdDir = resolve(ROOT, '../docs/infra/systemd')
const cronService = readFileSync(resolve(systemdDir, 'projetus-cron@.service'), 'utf8')
const timerSchedules = [
  ['projetus-cron@sync-leads.timer', '09:30:00'],
  ['projetus-cron@sync-execucao.timer', '10:00:00'],
  ['projetus-cron@sync-tgov-only.timer', '10:30:00'],
  ['projetus-cron@digest.timer', '11:20:00'],
  ['projetus-cron@digest-evening.timer', '19:00:00'],
].map(([file, schedule]) => ({ file, schedule, content: readFileSync(resolve(systemdDir, file), 'utf8') }))

check(catalog.includes("'Contatado'") && catalog.includes("'Reunião Agendada'"), 'Sprint 1 status Contatado/Reunião Agendada')
check(catalog.includes("'Impedimento Técnico'") && catalog.includes("'Cancelado'"), 'Sprint 1 status pós-venda')
check(
  home.includes("'Churn':") && home.includes("'Em Aprovação':") && home.includes("'Impedimento Técnico':") && home.includes("'Cancelado':") && home.includes('function getStatusConfig'),
  'Dashboard CRM protege todos os status do pipeline contra configuração ausente'
)
check(catalog.includes("'Aprovação'") && catalog.includes("'Execução'") && catalog.includes("'Prestação de Contas'"), 'Sprint 1 tipos de serviço')
check(leads.includes('CRM_STATUS_SELECT_OPTIONS') && leads.includes('tipo_servico'), 'Sprint 1 funil e tag na UI comercial')
check(leadApi.includes('normalizeTipoServico') && leadApi.includes('tipo_servico'), 'Sprint 1 API grava tipo de serviço')
check(executionApi.includes('valor_venda_fechado') && executionApi.includes('tipo_servico'), 'Sprint 1 API operacional expõe valor e tipo')
check(executionUi.includes('VENDA FECHADA') && executionUi.includes('TIPO SERVIÇO'), 'Sprint 1 UI operacional exibe valor e tipo')
check(setup.includes('ADD COLUMN tipo_servico') && setup.includes('situacao_changed_at'), 'Banco possui bootstrap defensivo')
check(sync.includes('sendCommercialSituacaoChangeNotification') && sync.includes('situacao_changed_at'), 'Sprint 2 alerta acompanha CNPJs do CRM')
check(emailService.includes('PRIMARY_LEAD_MANAGER_EMAIL') && emailService.includes('rooger@projetus.org'), 'Sprint 2 head comercial recebe avisos')
check(digest.includes("INTERVAL '48 hours'") && digest.includes('FROM propostas'), 'Sprint 2 digest consulta mudanças CRM em 48h')
check(leadSlideOver.indexOf('{/* Quick Actions */}') < leadSlideOver.indexOf('Agendar'), 'Sprint 2 agenda disponível nas ações do contato')
check(cronService.includes('run-cron.sh projetus') && cronService.includes('%i'), 'Sprint 2 cron usa executor systemd do btapps')
check(
  timerSchedules.every(({ schedule, content }) => content.includes(`OnCalendar=*-*-* ${schedule}`) && content.includes('Persistent=true')),
  'Crons Projetus têm horários e persistência versionados'
)
check(whatsappAction.includes('whatsappMeUrlFromTelefone') && whatsappAction.includes('WhatsApp indisponível'), 'Sprint 3 ação WhatsApp tem estado disponível/indisponível')
check(s3Checklist.includes('Validacao do numero unico comercial') && s3Checklist.includes('Checklist Meta/API'), 'Sprint 3 checklist operacional documentado')

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
