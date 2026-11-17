'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {useResource,type WorkspaceApi,type Data} from './shared'
import type {CalendarEvent} from '@/lib/workspace/presentation'
export default function useCalendarEvents(api:WorkspaceApi,ready:boolean,start:string,end:string){
  const [calendarId,setCalendarId]=useState('primary'),[events,setEvents]=useState<CalendarEvent[]>([]),[nextPageToken,setNext]=useState<string|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[refreshedAt,setRefreshedAt]=useState('')
  const generation=useRef(0),inFlight=useRef(false)
  const calendars=useResource(()=>ready?api.get('read_calendars'):Promise.resolve({items:[]}),[api,ready])
  const load=useCallback(async(pageToken='')=>{
    const version=++generation.current
    if(!ready){setEvents([]);setNext(null);setRefreshedAt('');setError('');return}
    inFlight.current=true;setBusy(true);setError('')
    if(!pageToken){setEvents([]);setNext(null);setRefreshedAt('')}
    try{
      const data=await api.get('events',{calendarId,start,end,...(pageToken?{pageToken}:{})})
      if(version!==generation.current)return
      setEvents(old=>Array.from(new Map<string,CalendarEvent>([...(pageToken?old:[]),...(data.items??[])].map((e:CalendarEvent)=>[`${e.calendarId??calendarId}:${e.id}`,e])).values()))
      setNext(data.nextPageToken??null);setRefreshedAt(data.refreshedAt??'')
    }catch(e){if(version===generation.current){setError((e as Error).message);setEvents([]);setNext(null);setRefreshedAt('')}}
    finally{if(version===generation.current){inFlight.current=false;setBusy(false)}}
  },[api,ready,calendarId,start,end])
  const cancel=useCallback(()=>{generation.current++;inFlight.current=false},[])
  useEffect(()=>{void load();return cancel},[load,cancel])
  useEffect(()=>{
    if(!ready)return
    const refresh=()=>{if(document.visibilityState==='visible'&&!inFlight.current)void load()}
    const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh)
    return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}
  },[load,ready])
  return{events,nextPageToken,busy,error:error||calendars.error,refreshedAt,calendarId,setCalendarId,calendars:(calendars.data?.items??[]) as Data[],reload:()=>{calendars.reload();void load()},loadMore:()=>{if(nextPageToken&&!inFlight.current)void load(nextPageToken)}}
}
