'use client'

import { useCallback, useEffect, useState } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { safeGoogleUrl } from '@/lib/workspace/domain'

export type Data = Record<string, any>
export type WorkspaceApi = {
  get: (view: string, params?: Record<string,string>) => Promise<Data>
  mutate: (action: string, values: Data) => Promise<Data>
  upload: (file: File, typeLabel: string) => Promise<Data>
}
export const fieldClass = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60'
export class RequestError extends Error { constructor(message:string,public uncertain=false,public status=0){super(message)} }

export async function request(url:string,options:RequestInit={}) {
  let response:Response
  try{response=await fetch(url,{...options,cache:'no-store'})}
  catch{throw new RequestError('A conexão foi interrompida. Atualize para conferir o resultado.',!!options.method&&options.method!=='GET')}
  const result=await response.json().catch(()=>null)
  if(!response.ok)throw new RequestError(result?.error||'Não foi possível concluir a solicitação.',Boolean(result?.uncertain),response.status)
  if(!result)throw new RequestError('Não foi possível confirmar o resultado. Atualize para conferir.',!!options.method&&options.method!=='GET')
  return result as Data
}

export function useResource(load:()=>Promise<Data>,dependencies:unknown[]) {
  const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[version,setVersion]=useState(0)
  const reload=useCallback(()=>setVersion(v=>v+1),[])
  useEffect(()=>{
    let live=true;setBusy(true);setError('');setData(null)
    load().then(d=>{if(live)setData(d)}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setBusy(false)})
    return()=>{live=false}
    // Callers supply the identity of the resource rather than an inline loader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[...dependencies,version])
  return{data,error,busy,reload}
}

export function Notice({children,error=false}:{children:React.ReactNode;error?:boolean}) {
  return <p role={error?'alert':'status'} className={`rounded-lg border px-3 py-2 text-sm ${error?'border-red-300/50 bg-red-500/5 text-red-700 dark:text-red-300':'border-line bg-raised/60 text-ink-2'}`}>{children}</p>
}
export function Field({label,children}:{label:string;children:React.ReactNode}) {
  return <label className="block space-y-1.5 text-sm font-medium text-ink-2"><span>{label}</span>{children}</label>
}
export function GoogleLink({href,children}:{href?:string|null;children:React.ReactNode}) {
  const safe=safeGoogleUrl(href)
  return safe?<a href={safe} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary','sm')}>{children} ↗</a>:null
}
export function dateLabel(value:string) {
  const date=new Date(value)
  return Number.isNaN(date.getTime())?'Horário indisponível':date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})
}

// A retry after a lost response keeps the same operation ID, including across page reloads.
// Only a hash of the payload and the opaque request ID are stored in this tab.
export async function operationId(key:string,payload:unknown) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)))
  const hash=Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,'0')).join('')
  const storageKey=`projete-workspace:${key}:${hash}`
  const id=sessionStorage.getItem(storageKey)||crypto.randomUUID()
  sessionStorage.setItem(storageKey,id)
  return{id,clear:()=>sessionStorage.removeItem(storageKey)}
}
