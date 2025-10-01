import React, { useState, useMemo } from 'react'
import axios from 'axios'

type Categories = { A:string[]; B:string[]; C:string[] }
type TwoCategoryStrategy = 'larger'|'alternate'|'random'
type GenerateOptions = {
  teamSize:number; allowIncompleteTeams:boolean; twoCategoryStrategy:TwoCategoryStrategy; allowReuse:boolean;
}

export default function App(){
  const [files, setFiles] = useState<{A?:File;B?:File;C?:File;single?:File}>({})
  const [categories, setCategories] = useState<Categories>({A:[],B:[],C:[]})
  const [parsing,setParsing]=useState(false)
  const [message,setMessage]=useState<string | null>(null)
  const [teams,setTeams]=useState<string[][]>([])
  const [options,setOptions]=useState<GenerateOptions>({teamSize:3,allowIncompleteTeams:true,twoCategoryStrategy:'larger',allowReuse:false})
  const [seed,setSeed]=useState<number|undefined>(undefined)

  const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

  const handleFileChange = (key:string, f?:File) => setFiles(prev=>({...prev,[key]:f}))

  const parseSeparate = async ()=>{
    setParsing(true); setMessage(null)
    try{
      const form = new FormData()
      if(files.A) form.append('files', files.A, 'A.pdf')
      if(files.B) form.append('files', files.B, 'B.pdf')
      if(files.C) form.append('files', files.C, 'C.pdf')
      const res = await axios.post(apiBase + '/api/parse-multiple', form, { headers: {'Content-Type':'multipart/form-data'} })
      setCategories(res.data.categories)
      setMessage('Parsing complete. Review lists.')
    }catch(err:any){ setMessage('Parse error: '+ (err?.message||err)) }
    finally{ setParsing(false) }
  }

  const parseSingle = async ()=>{
    if(!files.single){ setMessage('Please select a single PDF file'); return }
    setParsing(true); setMessage(null)
    try{
      const form = new FormData(); form.append('file', files.single)
      const res = await axios.post(apiBase + '/api/parse-single', form, { headers: {'Content-Type':'multipart/form-data'} })
      setCategories(res.data.categories)
      setMessage('Parsed single PDF into 3 categories.')
    }catch(err:any){ setMessage('Parse error: '+ (err?.message||err)) }
    finally{ setParsing(false) }
  }

  const updateCategoryFromTextarea = (k:keyof Categories, text:string)=>{
    const names = text.split(/\n|,|;/).map(s=>s.trim()).filter(s=>s.length>0)
    setCategories(prev=>({...prev,[k]:names} as Categories))
  }

  const handleGenerate = async ()=>{
    try{
      const payload = { categories, options, seed }
      const res = await axios.post(apiBase + '/api/generate-teams', payload)
      setTeams(res.data.teams)
      setMessage(res.data.meta.incompleteTeams > 0 ? `${res.data.meta.incompleteTeams} incomplete team(s)` : 'All teams complete')
    }catch(err:any){ setMessage('Generation error: '+ (err?.message||err)) }
  }

  const downloadCSV = ()=>{
    const rows = teams.map((t,i)=>['Team '+(i+1), ...t])
    const csv = rows.map(r=>r.map(c=>`"${(c||'').replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], {type:'text/csv'}); const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download='teams.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const totalParticipants = useMemo(()=>categories.A.length+categories.B.length+categories.C.length, [categories])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="mb-6"><h1 className="text-3xl font-extrabold">Inter‑Hostel Team Builder</h1>
        <p className="text-sm opacity-80 mt-1">Upload PDFs, preview participants, then generate teams.</p></header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-white rounded-2xl shadow-sm">
          <label className="block text-xs font-medium mb-2">Category A PDF</label>
          <input type="file" accept="application/pdf" onChange={(e)=>handleFileChange('A', e.target.files?.[0])} className="w-full"/>
        </div>
        <div className="p-4 bg-white rounded-2xl shadow-sm">
          <label className="block text-xs font-medium mb-2">Category B PDF</label>
          <input type="file" accept="application/pdf" onChange={(e)=>handleFileChange('B', e.target.files?.[0])} className="w-full"/>
        </div>
        <div className="p-4 bg-white rounded-2xl shadow-sm">
          <label className="block text-xs font-medium mb-2">Category C PDF</label>
          <input type="file" accept="application/pdf" onChange={(e)=>handleFileChange('C', e.target.files?.[0])} className="w-full"/>
        </div>
      </section>

      <section className="mb-6 p-4 bg-white rounded-2xl shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <button className="px-4 py-2 bg-slate-900 text-white rounded-lg" onClick={parseSeparate} disabled={parsing}>Parse Separate PDFs</button>
          <div className="text-sm opacity-80">or</div>
          <input type="file" accept="application/pdf" onChange={(e)=>handleFileChange('single', e.target.files?.[0])} />
          <button className="px-4 py-2 bg-slate-900 text-white rounded-lg" onClick={parseSingle} disabled={parsing}>Parse Single PDF (split into 3)</button>
          <div className="ml-auto text-sm opacity-70">Total parsed: <strong>{totalParticipants}</strong></div>
        </div>
        <div className="text-xs opacity-70">Tip: Use scanned PDFs? The backend runs OCR fallback automatically.</div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {(['A','B','C'] as (keyof Categories)[]).map(k=>(
          <div key={k} className="bg-white p-4 rounded-2xl shadow-sm">
            <h3 className="text-sm font-semibold mb-2">Category {k}</h3>
            <textarea value={(categories as any)[k].join('\n')} onChange={(e)=>updateCategoryFromTextarea(k, e.target.value)} rows={8} className="w-full border rounded-md p-2 text-sm" />
            <div className="text-xs opacity-70 mt-2">Count: {(categories as any)[k].length}</div>
          </div>
        ))}
      </section>

      <section className="mb-6 p-4 bg-white rounded-2xl shadow-sm">
        <h4 className="font-semibold mb-2">Generation options</h4>
        <div className="flex flex-wrap gap-4 items-center">
          <label className="flex items-center gap-2"><span className="text-sm">Team size</span>
            <input type="number" min={2} value={options.teamSize} onChange={(e)=>setOptions(o=>({...o,teamSize:Math.max(2, Number(e.target.value))}))} className="w-20 ml-2 p-1 border rounded-md"/></label>

          <label className="flex items-center gap-2"><input type="checkbox" checked={options.allowIncompleteTeams} onChange={(e)=>setOptions(o=>({...o,allowIncompleteTeams:e.target.checked}))}/> <span className="text-sm">Keep incomplete final teams</span></label>

          <label className="flex items-center gap-2"><span className="text-sm">Two-category strategy</span>
            <select value={options.twoCategoryStrategy} onChange={(e)=>setOptions(o=>({...o,twoCategoryStrategy:e.target.value as TwoCategoryStrategy}))} className="p-1 border rounded-md ml-2">
              <option value="larger">Larger category gives extra</option>
              <option value="alternate">Alternate extra pick</option>
              <option value="random">Random extra pick</option>
            </select></label>

          <label className="flex items-center gap-2"><span className="text-sm">Seed (optional)</span>
            <input type="number" value={seed ?? ''} onChange={(e)=>setSeed(e.target.value===''?undefined:Number(e.target.value))} className="w-28 p-1 border rounded-md ml-2"/></label>

          <div className="ml-auto"><button className="px-4 py-2 bg-emerald-600 text-white rounded-lg" onClick={handleGenerate}>Generate Teams</button></div>
        </div>
      </section>

      <section className="mb-6">
        {message && <div className="mb-3 p-3 bg-slate-50 rounded-md text-sm">{message}</div>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <h4 className="font-semibold mb-2">Generated teams</h4>
            {teams.length===0 ? <div className="text-sm opacity-70">No teams yet.</div> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {teams.map((t,i)=>(
                  <div key={i} className="p-3 bg-white rounded-xl shadow-sm">
                    <div className="text-sm font-semibold">Team {i+1}</div>
                    <ul className="mt-2 text-sm list-disc list-inside">{t.map((m,j)=><li key={j}>{m}</li>)}</ul>
                    {t.length < options.teamSize && <div className="text-xs text-red-600 mt-1">Incomplete team ({t.length}/{options.teamSize})</div>}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button className="px-3 py-2 bg-sky-600 text-white rounded-md" onClick={downloadCSV} disabled={teams.length===0}>Export CSV</button>
              <button className="px-3 py-2 bg-slate-700 text-white rounded-md" onClick={()=>navigator.clipboard?.writeText(teams.map((t,i)=>`Team ${i+1}: ${t.join(', ')}`).join('\n'))} disabled={teams.length===0}>Copy to clipboard</button>
              <button className="px-3 py-2 bg-amber-600 text-white rounded-md ml-auto" onClick={()=>{setTeams([]); setMessage(null)}}>Reset</button>
            </div>
          </div>
          <aside className="bg-white p-4 rounded-xl shadow-sm">
            <h5 className="font-semibold">Quick stats</h5>
            <div className="text-sm mt-2">Category A: {categories.A.length}</div>
            <div className="text-sm">Category B: {categories.B.length}</div>
            <div className="text-sm">Category C: {categories.C.length}</div>
            <div className="text-sm mt-2">Total participants: {totalParticipants}</div>
          </aside>
        </div>
      </section>
      <footer className="text-xs opacity-70 mt-6">For production-grade parsing, ensure the backend has required native libs (ghostscript) for table extraction.</footer>
    </div>
  )
}
