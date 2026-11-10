import test from 'node:test'
import assert from 'node:assert/strict'
import {calendarDays,dayEventLayout,eventsOnDay,legacyWorkspaceArea,localDateKey,meetAddress,workspaceHref} from './presentation.ts'
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
