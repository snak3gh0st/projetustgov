'use client'
import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import WorkspaceIcon from './WorkspaceIcon'
export default function WorkspaceDialog({open,onClose,title,children,compose=false}:{open:boolean;onClose:()=>void;title:string;children:React.ReactNode;compose?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null),[mounted,setMounted]=useState(false)
  useEffect(()=>setMounted(true),[])
  useEffect(()=>{if(!mounted)return;const dialog=ref.current;if(open&&!dialog?.open)dialog?.showModal();if(!open&&dialog?.open)dialog.close()},[open,mounted])
  if(!mounted)return null
  return createPortal(<dialog ref={ref} className={`ws-dialog ${compose?'ws-compose':''}`} aria-label={title} onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
    <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3"><h2 className="!font-body text-base font-semibold text-ink">{title}</h2><button type="button" className="ws-icon-button" aria-label={`Fechar ${title.toLowerCase()}`} onClick={onClose}><WorkspaceIcon name="close"/></button></header>
    <div className="p-5">{children}</div>
  </dialog>,document.body)
}
