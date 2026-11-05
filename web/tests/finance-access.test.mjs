import test from 'node:test'
import assert from 'node:assert/strict'
import { validSecret,canOperateFinance,requireCron } from '../src/lib/finance/access.ts'
test('scheduler tokens fail closed when unset, empty or wrong',()=>{
  assert.equal(validSecret(null,undefined),false)
  assert.equal(validSecret('', ''),false)
  assert.equal(validSecret('abc','abcd'),false)
  assert.equal(validSecret('abc','xyz'),false)
  assert.equal(validSecret('Bearer secret','Bearer secret'),true)
  const original=process.env.CRON_SECRET
  delete process.env.CRON_SECRET
  try{assert.throws(()=>requireCron(new Request('http://localhost/api/cron/financeiro')))}
  finally{if(original)process.env.CRON_SECRET=original}
})
test('only financial operators can inspect and mutate consolidated finance',()=>{
  for(const role of ['admin','diretoria','gestor_financeiro'])assert.equal(canOperateFinance(role),true)
  for(const role of ['gestor','vendedor','coordenador','csm','adm_produto','visualizador',undefined])assert.equal(canOperateFinance(role),false)
})
