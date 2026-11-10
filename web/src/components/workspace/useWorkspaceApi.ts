'use client'
import {useMemo} from 'react'
import {operationId,request,RequestError,type WorkspaceApi} from './shared'
export default function useWorkspaceApi(cnpj:string,selection:string,onChange:()=>void) {
  return useMemo<WorkspaceApi>(()=>{
    const [projectKind,projectKey='']=selection.split(':'),base=`/api/workspace/clients/${encodeURIComponent(cnpj)}`
    return {
      get:(view,params={})=>request(`${base}?${new URLSearchParams({projectKind,projectKey,view,...params})}`),
      async mutate(action,values){
        const operation=await operationId(`${cnpj}:${selection}:${action}`,values)
        try{const result=await request(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...values,action,projectKind,projectKey,requestId:operation.id})});operation.clear();onChange();return result}
        catch(e){if(e instanceof RequestError&&!e.uncertain&&e.status!==409)operation.clear();throw e}
      },
      async upload(file,typeLabel,parentId){
        const bytes=await file.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).join(',')
        const operation=await operationId(`${cnpj}:${selection}:upload`,{name:file.name,type:file.type,typeLabel,hash,...(parentId?{parentId}:{})})
        const form=new FormData();form.set('file',file);form.set('typeLabel',typeLabel);form.set('requestId',operation.id);form.set('projectKind',projectKind);form.set('projectKey',projectKey)
        if(parentId)form.set('parentId',parentId)
        try{const result=await request(base,{method:'PUT',body:form});operation.clear();onChange();return result}
        catch(e){if(e instanceof RequestError&&!e.uncertain&&e.status!==409)operation.clear();throw e}
      },
    }
  },[cnpj,selection,onChange])
}
