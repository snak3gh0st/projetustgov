import Link from 'next/link'
import WaitlistForm from '@/components/WaitlistForm'

const features = [
  {
    icon: '🎬',
    title: 'Aulas em vídeo',
    desc: 'Conteúdo gravado em alta qualidade, disponível 24h. Assista no seu ritmo, onde quiser.',
  },
  {
    icon: '📋',
    title: 'Módulos estruturados',
    desc: 'Aprendizado progressivo com módulos organizados do básico ao avançado.',
  },
  {
    icon: '💬',
    title: 'Mentoria ao vivo',
    desc: 'Sessões ao vivo com acesso direto aos especialistas Projetus para tirar dúvidas.',
  },
  {
    icon: '📊',
    title: 'Cases reais',
    desc: 'Estude com exemplos reais de contratos, licitações e execução de obras públicas.',
  },
]

const targetAudience = [
  'Engenheiros e arquitetos que querem entrar no mercado público',
  'Profissionais que já atuam e querem otimizar seus processos',
  'Gestores de construtoras buscando ampliar o volume de obras públicas',
  'Técnicos e consultores de infraestrutura pública',
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white font-sans text-academy-ink">
      {/* Nav */}
      <header className="border-b border-slate-100 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-academy-blue">PROJETUS</span>
            <span className="ml-2 text-sm font-semibold text-academy-ink">Academy</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-slate-500 hover:text-academy-ink">
              Entrar
            </Link>
            <Link
              href="#cursos"
              className="rounded-lg bg-academy-blue px-4 py-2 text-sm font-semibold text-white hover:bg-opacity-90"
            >
              Ver cursos
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-b from-slate-50 to-white px-6 py-20 text-center">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-academy-blue">
            PROJETUS Academy
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight text-academy-ink sm:text-5xl">
            Domine o mercado de<br />
            <span className="text-academy-blue">obras e serviços públicos</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            Formação prática para engenheiros, arquitetos e gestores que querem crescer
            no setor público — de licitações a execução e faturamento.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="#cursos"
              className="rounded-xl bg-academy-blue px-8 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-opacity-90"
            >
              Conhecer os cursos
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-slate-200 px-8 py-3.5 text-base font-semibold text-slate-600 hover:border-slate-300 hover:text-academy-ink"
            >
              Já tenho acesso →
            </Link>
          </div>
        </div>
      </section>

      {/* Social proof strip */}
      <section className="border-y border-slate-100 bg-slate-50 py-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-8 px-6 text-center">
          {[
            { value: '+15 anos', label: 'de experiência no setor público' },
            { value: '+500', label: 'contratos executados' },
            { value: 'R$ 400M+', label: 'em obras gerenciadas' },
            { value: '100%', label: 'conteúdo prático' },
          ].map(s => (
            <div key={s.label}>
              <p className="text-2xl font-bold text-academy-blue">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-center text-2xl font-bold text-academy-ink">
            Uma plataforma feita para quem trabalha no mercado público
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(f => (
              <div key={f.title} className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="mb-3 text-3xl">{f.icon}</div>
                <h3 className="mb-2 font-semibold text-academy-ink">{f.title}</h3>
                <p className="text-sm leading-relaxed text-slate-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Courses section */}
      <section id="cursos" className="bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-academy-ink">Formações disponíveis</h2>
            <p className="mt-2 text-slate-500">Conteúdo exclusivo desenvolvido pela equipe Projetus</p>
          </div>

          {/* Course cards */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex h-44 items-center justify-center bg-gradient-to-br from-academy-blue to-blue-800 text-5xl">
                🏗️
              </div>
              <div className="p-6">
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-academy-blue">
                  CURSO
                </span>
                <h3 className="mt-3 text-lg font-bold text-academy-ink">
                  Gestão de Contratos de Obras Públicas
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Do edital à medição: tudo sobre BDI, planilha orçamentária, aditivos e fiscalização de contratos.
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs text-slate-400">Em breve</p>
                  <span className="rounded-full bg-academy-gold/10 px-3 py-1 text-xs font-semibold text-academy-gold">
                    Lançamento julho/26
                  </span>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex h-44 items-center justify-center bg-gradient-to-br from-academy-gold to-yellow-700 text-5xl">
                📑
              </div>
              <div className="p-6">
                <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-semibold text-academy-gold">
                  MENTORIA
                </span>
                <h3 className="mt-3 text-lg font-bold text-academy-ink">
                  Licitações: Da Teoria à Prática
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Como participar, elaborar propostas vencedoras e lidar com impugnações e recursos administrativos.
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs text-slate-400">Em breve</p>
                  <span className="rounded-full bg-academy-gold/10 px-3 py-1 text-xs font-semibold text-academy-gold">
                    Lançamento julho/26
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 rounded-2xl bg-academy-blue px-8 py-8 text-center text-white">
            <h3 className="text-xl font-bold">Quer ser avisado no lançamento?</h3>
            <p className="mt-2 text-sm text-blue-200">
              Deixe seu e-mail e receba acesso antecipado com desconto exclusivo.
            </p>
            <WaitlistForm />
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-8 text-center text-2xl font-bold text-academy-ink">
            Para quem é a Projetus Academy?
          </h2>
          <ul className="space-y-3">
            {targetAudience.map(item => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-academy-blue text-xs text-white">✓</span>
                <span className="text-slate-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 px-6 py-8 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-academy-blue">PROJETUS Academy</p>
        <p className="mt-1 text-xs text-slate-400">© 2026 Projetus. Todos os direitos reservados.</p>
        <div className="mt-3 flex justify-center gap-4 text-xs text-slate-400">
          <Link href="/login" className="hover:text-academy-blue">Área do aluno</Link>
          <Link href="/admin/login" className="hover:text-academy-blue">Admin</Link>
        </div>
      </footer>
    </div>
  )
}
