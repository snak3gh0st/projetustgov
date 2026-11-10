'use client'
import { useEffect,useRef,useState } from 'react'
export type Field={name:string;label:string;type?:'text'|'date'|'month'|'number'|'checkbox'|'select'|'textarea'|'email'|'url';required?:boolean;options?:{value:string;label:string}[];hint?:string}
export type DialogSpec={title:string;description:string;fields:Field[];initial:Record<string,string|boolean>;submitLabel?:string;submit:(values:Record<string,string|boolean>)=>Promise<void>}
export default function FinanceDialog({spec,onClose}:{spec:DialogSpec;onClose:()=>void}){
  const [values,setValues]=useState(spec.initial),[error,setError]=useState(''),[saving,setSaving]=useState(false)
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{ref.current?.showModal()},[])
  const input='w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100'
  return <dialog ref={ref} onCancel={e=>{if(saving)e.preventDefault();else onClose()}} className="w-full max-w-xl rounded-2xl bg-white p-0 text-gray-900 shadow-xl backdrop:bg-black/40 dark:bg-gray-900 dark:text-gray-100">
    <form className="space-y-4 p-6" onSubmit={async e=>{e.preventDefault();if(saving)return;setSaving(true);setError('');try{await spec.submit(values);onClose()}catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.')}finally{setSaving(false)}}}>
      <div><h2 className="font-heading text-xl font-semibold">{spec.title}</h2><p className="mt-2 text-sm text-gray-500">{spec.description}</p></div>
      {spec.fields.map(f=><label key={f.name} className="block space-y-1 text-sm font-medium">
        <span>{f.label}</span>
        {f.type==='checkbox'?<input className="ml-3" type="checkbox" checked={!!values[f.name]} onChange={e=>setValues({...values,[f.name]:e.target.checked})}/>
          :f.type==='select'?<select className={input} value={String(values[f.name]??'')} required={f.required} onChange={e=>setValues({...values,[f.name]:e.target.value})}><option value="">Selecione</option>{f.options?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
          :f.type==='textarea'?<textarea className={input} rows={3} maxLength={2000} minLength={10} required={f.required} value={String(values[f.name]??'')} onChange={e=>setValues({...values,[f.name]:e.target.value})}/>
          :<input className={input} type={f.type??'text'} step={f.type==='number'?'any':undefined} required={f.required} value={String(values[f.name]??'')} onChange={e=>setValues({...values,[f.name]:e.target.value})}/>}
        {f.hint&&<span className="block text-xs font-normal text-gray-500">{f.hint}</span>}
      </label>)}
      {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
      <div className="flex justify-end gap-2 pt-2"><button type="button" disabled={saving} className="rounded-lg border px-4 py-2 text-sm" onClick={onClose}>Cancelar</button><button type="submit" disabled={saving} className="rounded-lg bg-[#0072F7] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving?'Salvando…':spec.submitLabel??'Salvar'}</button></div>
    </form>
  </dialog>
}
