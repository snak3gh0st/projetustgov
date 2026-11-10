import {redirect} from 'next/navigation'
export default function WorkspacePage({searchParams}:{searchParams:Record<string,string|undefined>}) {
  const query=new URLSearchParams(Object.entries(searchParams).filter((entry):entry is [string,string]=>typeof entry[1]==='string'))
  redirect(`/workspace/email${query.size?`?${query}`:''}`)
}
