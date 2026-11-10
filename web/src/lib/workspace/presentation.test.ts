import test from 'node:test'
import assert from 'node:assert/strict'
import {calendarDays,dayEventLayout,eventsOnDay,legacyWorkspaceArea,localDateKey,meetAddress,workspaceHref,workspaceRecipient,workspaceRecipientLabel} from './presentation.ts'
test('tool routes preserve the client and distinguish projects without depending on UI state',()=>{
  const href=workspaceHref('calendario','12.345.678/0001-90','comercial:10002'),url=new URL(href,'https://projete.projetus.org')
  assert.equal(url.pathname,'/workspace/calendario');assert.equal(url.searchParams.get('cliente'),'12345678000190');assert.equal(url.searchParams.get('projectKey'),'10002')
  assert.equal(legacyWorkspaceArea('meetings'),'calendario');assert.equal(legacyWorkspaceArea('drive'),'drive')
  assert.equal(workspaceHref('meet'),'/workspace/meet')
})
test('calendar starts on Sunday, covers a full month and crosses the year boundary',()=>{
  const month=calendarDays(new Date(2026,10,15),'month')
  assert.equal(month.length,42);assert.equal(month[0].getDay(),0);assert.equal(localDateKey(month[0]),'2026-11-01');assert.equal(localDateKey(month[41]),'2026-12-12')
  const week=calendarDays(new Date(2027,0,1),'week');assert.equal(localDateKey(week[0]),'2026-12-27');assert.equal(localDateKey(week[6]),'2027-01-02')
})
test('multi-day and all-day events obey an exclusive end date and omit cancelled entries',()=>{
  const day=new Date(2026,10,10),events=[{id:'all-day',start:'2026-11-09',end:'2026-11-11'},{id:'ended',start:'2026-11-09',end:'2026-11-10'},{id:'cancelled',start:'2026-11-10',end:'2026-11-11',status:'cancelled'},
    {id:'overnight',start:new Date(2026,10,9,23).toISOString(),end:new Date(2026,10,10,1).toISOString()}]
  assert.deepEqual(eventsOnDay(events,day).map(e=>e.id),['all-day','overnight'])
  assert.deepEqual(eventsOnDay(events,new Date(2026,10,11)),[])
})
test('overlapping meetings occupy separate columns while adjacent meetings use the full day width',()=>{
  const day=new Date(2026,10,10),event=(id:string,start:number,end:number)=>({id,start:new Date(2026,10,10,start).toISOString(),end:new Date(2026,10,10,end).toISOString()})
  const layout=dayEventLayout([event('a',9,11),event('b',10,12),event('c',12,13)],day)
  assert.equal(layout[0].width,50);assert.equal(layout[1].left,50);assert.equal(layout[2].width,100);assert.equal(layout[0].top,9*48)
  const overnight=dayEventLayout([{id:'night',start:new Date(2026,10,9,23).toISOString(),end:new Date(2026,10,10,1).toISOString()}],day)
  assert.equal(overnight[0].top,0);assert.equal(overnight[0].height,48)
})
test('Meet entry accepts actual meeting codes and rejects untrusted links',()=>{
  assert.equal(meetAddress(' ABC-DEFG-HIJ '),'https://meet.google.com/abc-defg-hij')
  assert.equal(meetAddress('https://meet.google.com/abc-defg-hij?authuser=1'),'https://meet.google.com/abc-defg-hij')
  for(const value of ['https://meet.google.com.evil.test/abc-defg-hij','javascript:alert(1)','https://user:pass@meet.google.com/abc-defg-hij','https://meet.google.com/not-a-meeting'])assert.equal(meetAddress(value),null)
})

test('contact entries open a draft in the exact project with a normalized saved recipient',()=>{
  const url=new URL(workspaceHref('email','12.345.678/0001-90','comercial:42',{action:'compose',recipient:' FINANCEIRO@example.test '}),'https://projete.projetus.org')
  assert.equal(url.searchParams.get('action'),'compose');assert.equal(url.searchParams.get('to'),'financeiro@example.test');assert.equal(url.searchParams.get('projectKey'),'42')
  assert.equal(workspaceRecipient(url.searchParams.get('to')!,['Financeiro@example.test','outro@example.test']),'Financeiro@example.test')
  assert.equal(workspaceRecipient('externo@example.test',['cliente@example.test']),undefined)
  assert.equal(workspaceRecipientLabel('client@example.test',[{nome_pessoa:'Ana',email:'CLIENT@example.test'}]),'Ana · client@example.test')
  assert.equal(workspaceRecipientLabel('novo@example.test',[{nome_pessoa:'Ana',email:'client@example.test'}]),'novo@example.test')
  assert.equal(workspaceRecipient('cliente@example.test\r\nBcc: externo@example.test',['cliente@example.test']),undefined)
})
test('meeting entries preserve an agreement and actions cannot spill into other tools',()=>{
  const url=new URL(workspaceHref('calendario','12345678000190','convenio:987654',{action:'meeting',recipient:'cliente@example.test'}),'https://projete.projetus.org')
  assert.equal(url.searchParams.get('projectKind'),'convenio');assert.equal(url.searchParams.get('projectKey'),'987654');assert.equal(url.searchParams.get('action'),'meeting')
  assert.equal(workspaceHref('drive','12345678000190','cliente:',{action:'compose',recipient:'cliente@example.test'}),'/workspace/drive?cliente=12345678000190')
  assert.equal(workspaceHref('email','','cliente:',{action:'compose'}),'/workspace/email')
  const invalid=new URL(workspaceHref('email','12345678000190','cliente:',{action:'compose',recipient:'a@example.test\r\nBcc: b@example.test'}),'https://projete.projetus.org')
  assert.equal(invalid.searchParams.has('to'),false)
})
