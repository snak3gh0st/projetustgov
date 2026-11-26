'use client'

import { useEffect, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import { inputClass } from './list-ui'

/** Ask for an explicit loss reason before sending the status mutation. Cancel leaves the funnel unchanged. */
export function useMotivoPerda() {
  const dialog = useRef<HTMLDialogElement>(null)
  const resolve = useRef<((v: string | null) => void) | null>(null)
  const [motivo, setMotivo] = useState('')
  useEffect(() => () => { resolve.current?.(null) }, [])
  function terminar(value: string | null) {
    dialog.current?.close()
    resolve.current?.(value)
    resolve.current = null
  }
  function pedirMotivo() {
    resolve.current?.(null)
    setMotivo('')
    return new Promise<string | null>((done) => { resolve.current = done; dialog.current?.showModal() })
  }
  const dialogoPerda = <dialog ref={dialog} aria-labelledby="motivo-perda-titulo" onCancel={(e) => { e.preventDefault(); terminar(null) }}
    className="w-[min(92vw,28rem)] rounded-2xl border border-line bg-surface p-5 text-ink shadow-xl backdrop:bg-black/40">
    <form onSubmit={(e) => { e.preventDefault(); if (motivo.trim()) terminar(motivo.trim()) }} className="space-y-4">
      <h2 id="motivo-perda-titulo" className="text-lg font-semibold">Registrar perda ou cancelamento</h2>
      <label className="block space-y-2 text-sm">Motivo da perda<textarea autoFocus required maxLength={2000} rows={4}
        className={`${inputClass} block w-full`} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => terminar(null)}>Cancelar</Button><Button type="submit" disabled={!motivo.trim()}>Registrar perda</Button></div>
    </form>
  </dialog>
  return { pedirMotivo, dialogoPerda }
}
