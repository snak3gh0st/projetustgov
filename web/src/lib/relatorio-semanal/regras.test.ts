import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diasDa, empresaDaConta, montarAlertas, negocioDoCentro, semanaDe, semanaSeguinte } from './regras'
import type { Relatorio } from './types'

test('semanaDe vai de sábado a sexta', () => {
  // 30/10/2026 é sexta
  assert.deepEqual(semanaDe('2026-10-30'), { de: '2026-10-24', ate: '2026-10-30' })
  assert.deepEqual(semanaDe('2026-10-24'), { de: '2026-10-24', ate: '2026-10-30' })
  assert.deepEqual(semanaDe('2026-10-29'), { de: '2026-10-24', ate: '2026-10-30' })
  assert.deepEqual(semanaDe('2026-10-31'), { de: '2026-10-31', ate: '2026-11-06' })
  assert.deepEqual(semanaSeguinte(semanaDe('2026-10-30')), { de: '2026-10-31', ate: '2026-11-06' })
  assert.equal(diasDa(semanaDe('2026-10-30')).length, 7)
})

test('empresaDaConta usa o nome da conta bancária', () => {
  assert.equal(empresaDaConta('APLICAÇÃO CAIXA - PROJETUS'), 'PROJETUS')
  assert.equal(empresaDaConta('CORA PROJETUS'), 'PROJETUS')
  assert.equal(empresaDaConta('ITAU - TSCO'), 'TS&CO')
  assert.equal(empresaDaConta('CAIXA - TS&CO'), 'TS&CO')
  assert.equal(empresaDaConta('TALENT- ITAU - APLICAÇÃO'), 'TALENT HUB')
  assert.equal(empresaDaConta('ITAU - ACADEMIA DO EMPREENDEDOR PUBLI'), 'ACADEMIA DO EMPREENDEDOR PÚBLICO')
  assert.equal(empresaDaConta('ITAU - ACADEMIA EMPREENDEDORA'), 'ACADEMIA EMPREENDEDORA')
  assert.equal(empresaDaConta('PAD-ARV'), 'PAD')
  assert.equal(empresaDaConta('Conta qualquer'), 'Outras')
})

test('negocioDoCentro junta grafias e tira o código', () => {
  assert.equal(negocioDoCentro('Projetus'), 'PROJETUS')
  assert.equal(negocioDoCentro('TALENTHUB'), 'TALENT HUB')
  assert.equal(negocioDoCentro('005 - BATE PAPO - MG'), 'BATE PAPO - MG')
  assert.equal(negocioDoCentro('TS&CO/Empreendedor Público'), 'TS&CO / EMPREENDEDOR PÚBLICO')
  assert.equal(negocioDoCentro('TSCO/EMPREENDEDOR PÚBLICO'), 'TS&CO / EMPREENDEDOR PÚBLICO')
  assert.equal(negocioDoCentro('ACADEMIA EMPREENDEDORA'), 'ACADEMIA EMPREENDEDORA')
  assert.equal(negocioDoCentro('ACADEMIA EMPREENDEDOR'), 'ACADEMIA DO EMPREENDEDOR PÚBLICO')
  assert.equal(negocioDoCentro(null), 'Sem centro de custo')
})

function base(): Omit<Relatorio, 'alertas'> {
  return {
    versao: 1,
    semana: { de: '2026-10-24', ate: '2026-10-30' },
    proxima: { de: '2026-10-31', ate: '2026-11-06' },
    geradoEm: '2026-10-30T21:00:00Z',
    financeiroAte: null,
    financeiro: {
      saldo: { total: 100, inicioSemana: 90, contasNegativas: 0 },
      porEmpresa: [],
      semana: { recebido: 0, pago: 0, recebimentos: [], pagamentos: [] },
      agenda: { dias: [], titulos: [] },
      atrasados: { receber: { total: 0, count: 0, top: [] }, pagar: { total: 0, count: 0, nomes: [] } },
      resultado: { mtd: { atual: 100, anterior: 100 }, mes: null, mesAnterior: null },
      porNegocio: [],
      posicao: { saldo: 0, receber: 0, pagar: 0, emprestimos: 0, liquida: 0, horizonte: '2027-10-30', longoPrazo: { receber: 0, pagar: 0 } },
      projecaoMin: null,
    },
    comercial: {
      vendas: { itens: [{ data: '2026-10-27', cliente: 'X', local: null, servico: 'Aprovação', valor: 10, vendedor: 'Ana' }], total: 10, mes: { count: 1, total: 10 }, serie: [] },
      time: [{ nome: 'Ana', trabalhados: 3, avancos: 1, perdas: 0, vendas: 1, valorVendido: 10 }],
      funil: [],
      movimento: [],
      distribuidos: 0,
      carteira: { clientes: 0, vendido: 0, faturado: 0, recebido: 0, aberto: 0, vencido: 0 },
    },
  }
}

const moeda = (v: number) => `R$${v}`

test('sem problema, sem alerta', () => {
  assert.deepEqual(montarAlertas(base(), moeda), [])
})

test('alertas aparecem com o crítico primeiro', () => {
  const r = base()
  r.comercial.vendas.itens = []
  r.comercial.time.push({ nome: 'Elisson', trabalhados: 0, avancos: 0, perdas: 0, vendas: 0, valorVendido: 0 })
  r.financeiro.atrasados.receber = { total: 500, count: 2, top: [{ nome: 'Cliente A', valor: 400, desde: '2026-09-01' }] }
  r.financeiro.resultado.mtd = { atual: 50, anterior: 100 }
  r.financeiro.projecaoMin = { data: '2026-11-10', saldo: -20 }
  const a = montarAlertas(r, moeda)
  assert.equal(a[0].nivel, 'critico')
  assert.match(a[0].detalhe, /10\/11/)
  assert.ok(a.some((x) => x.titulo === 'Nenhuma venda fechada na semana'))
  assert.ok(a.some((x) => x.detalhe.startsWith('Elisson')))
  assert.ok(a.some((x) => x.detalhe.includes('50% a menos')))
  assert.ok(a.some((x) => x.detalhe.includes('Cliente A')))
})

test('caixa já negativo e sem piora não vira alerta crítico', () => {
  const r = base()
  r.financeiro.saldo.total = -300
  r.financeiro.projecaoMin = { data: '2026-11-10', saldo: -300 }
  assert.deepEqual(montarAlertas(r, moeda), [])
})
