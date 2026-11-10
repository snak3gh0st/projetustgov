export default function WorkspaceIcon({name,className='h-5 w-5'}:{name:string;className?:string}) {
  const paths:Record<string,React.ReactNode>={
    email:<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
    calendario:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4M8 14h2m4 0h2m-8 3h2"/></>,
    drive:<><path d="m9 3 6 0 7 12-3 5H5l-3-5Z"/><path d="m9 3 7 12H2m13-12L5 20m11-5 3 5"/></>,
    meet:<><rect x="3" y="5" width="12" height="14" rx="2"/><path d="m15 10 6-4v12l-6-4Z"/></>,
    historico:<><path d="M3 11a9 9 0 1 1 3 8M3 4v7h7"/><path d="M12 7v5l3 2"/></>,
    search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
    plus:<path d="M12 5v14M5 12h14"/>,
    close:<path d="m6 6 12 12M6 18 18 6"/>,
    chevron:<path d="m9 5 7 7-7 7"/>,
    down:<path d="m6 9 6 6 6-6"/>,
    refresh:<><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 13 2M5 16a8 8 0 0 0 13 2"/></>,
    folder:<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>,
    document:<><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8m-8 4h5"/></>,
    upload:<><path d="m7 9 5-5 5 5M12 4v12M4 16v4h16v-4"/></>,
    grid:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    list:<><path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/></>,
    link:<><path d="m10 13 4-4M8 16l-1 1a3 3 0 0 1-4-4l5-5a3 3 0 0 1 4 0m0 0 5-5a3 3 0 0 1 4 4l-5 5a3 3 0 0 1-4 0"/></>,
    paperclip:<path d="m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9m-5 9 6-6"/>,
    send:<><path d="m3 3 19 9-19 9 4-9Zm4 9h15"/></>,
    company:<><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1m-5 10v-5h4v5"/></>,
    check:<path d="m5 12 4 4L19 6"/>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    external:<><path d="M14 3h7v7m0-7L10 14M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>{paths[name]||paths.document}</svg>
}
