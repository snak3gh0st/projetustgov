// Trava por contato dentro do processo do app: mensagens do mesmo contato (pelo lid ou pelo telefone) são gravadas uma
// por vez, para a união de conversas não correr junto com a gravação. Quem espera não segura conexão do banco.

const travas = new Map<string, Promise<void>>()

/** Roda `fn` quando nenhuma outra tarefa com alguma das mesmas chaves estiver rodando; a ordem de chegada é mantida. */
export async function comTrava<T>(chaves: (string | null | undefined)[], fn: () => Promise<T>): Promise<T> {
  const unicas = Array.from(new Set(chaves.filter((c): c is string => Boolean(c))))
  const anteriores = unicas.map((c) => travas.get(c)).filter((p): p is Promise<void> => Boolean(p))
  let soltar!: () => void
  const minha = new Promise<void>((r) => { soltar = r })
  // Marca todas as chaves antes de esperar: quem chega depois espera esta tarefa inteira.
  for (const c of unicas) travas.set(c, minha)
  await Promise.all(anteriores)
  try {
    return await fn()
  } finally {
    soltar()
    for (const c of unicas) if (travas.get(c) === minha) travas.delete(c)
  }
}
