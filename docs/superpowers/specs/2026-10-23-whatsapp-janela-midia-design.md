# Página WhatsApp: janela de conversa, mídia e áudio

Data: 2026-10-23. Aprovado pelo Paulo no chat ("Pode seguir, nada faltando").

## Por quê

O time comercial atende os clientes das consultorias pela página WhatsApp do PROJETE. Paulo achou a janela fraca:
- a página inteira rola, em vez da lista e das mensagens;
- o espaçamento está ruim;
- não dá para ouvir áudio nem ver foto recebida;
- não dá para mandar voz, imagem nem arquivo.

Com 1 ano de histórico chegando, a conversa também precisa carregar as mensagens antigas aos poucos.

Este é o primeiro de três projetos. Os outros dois, notas internas com aviso (PROJETE e Slack) e conversa direta entre o time, vêm depois, cada um com seu design.

## Metas

**Tela**
- A página ocupa a altura da janela do navegador e a página em si não rola. A lista de conversas e as mensagens rolam cada uma no seu painel.
- A conversa abre na mensagem mais recente. Rolando para o topo, carrega as 50 anteriores sem pular a posição.
- Separador por dia ("Hoje", "Ontem", "22/10/2026"). O balão mostra só a hora (HH:MM), sem quebrar linha, com espaço regular entre balões.
- As abas de filtro aparecem inteiras, sem cortar "Arquivadas".
- No celular (375 px), a lista e a conversa continuam alternando, como hoje.

**Receber**
- Foto: miniatura no balão; clicar abre a foto grande em outra aba.
- Áudio: player no balão.
- Vídeo: player no balão, que só baixa ao tocar.
- Documento: cartão com nome e tamanho, que baixa ao clicar.
- Figurinha: mostrada como imagem pequena.

**Enviar**
- Botão de clipe para foto, vídeo ou documento, com legenda opcional. Arrastar o arquivo para a conversa também funciona.
- Botão de microfone: grava com o tempo correndo, e a pessoa cancela ou envia. Chega ao cliente como mensagem de voz, igual à do celular.
- Tudo sai pelo número das consultorias, com as mesmas regras do texto: quem pode enviar, limite de 20 por minuto, e registro "Não enviada" quando falha.

## Fora do escopo

- Figurinha e emoji próprios.
- Responder citando uma mensagem.
- Encaminhar.
- Apagar mensagem.
- Notas internas e conversa do time (os próximos projetos).

## Não pode acontecer

- Um arquivo recebido ser aberto como página do PROJETE. Um HTML ou SVG mandado por alguém executaria código com a sessão de quem abriu. Só foto, áudio e vídeo são exibidos na tela; o resto só baixa.
- A atualização de 10 em 10 segundos apagar as mensagens antigas que a pessoa já carregou rolando para cima.
- A rolagem pular para o fim enquanto a pessoa lê mensagens antigas.

## Como (decidido)

**Mídia recebida.** A rota `/api/whatsapp/midia/[id]` ganha o modo `?ver=1`:
- Responde `inline` só para `image/jpeg|png|webp|gif`, `audio/*` e `video/mp4|3gpp|webm`.
- Envia `Content-Security-Policy: sandbox` e `nosniff`.
- Cache `private, max-age=86400`, porque a mídia de uma mensagem não muda.
- Qualquer outro tipo continua como download.

**Envio.** `/api/whatsapp/enviar` aceita também `multipart/form-data` com `arquivo`, `voz` (`1` para gravação) e `legenda`, além do destino de sempre (`conversa_id`, ou `telefone` + `cnpj`).
- Voz vai para o `sendWhatsAppAudio` do Evolution em base64. O Evolution converte qualquer formato para ogg/opus de mensagem de voz, então serve o que o Chrome (webm) e o Safari (mp4) gravam.
- Arquivo vai para o `sendMedia`, com `mediatype` `image`, `video` ou `document` conforme o tipo do arquivo. Imagem e vídeo fora dos formatos aceitos pelo WhatsApp vão como documento.
- Limite de 16 MB por arquivo.
- A mensagem gravada no PROJETE leva `tipo`, `midia {mimetype, fileName, tamanho}` e a legenda como texto.

**Tamanho e duração.** O parser do webhook passa a guardar `tamanho` (`fileLength`) e `segundos` (`seconds`) em `midia`, quando vierem.

**Paginação.** A rota de mensagens já devolve 50 por página com `antes=` e `mais`. A tela guarda as mensagens por id e junta cada atualização às que já estão carregadas.

## Calls do Claude (Paulo pode revisar)

- **Limite de 16 MB também para documento.** O WhatsApp aceita até 100 MB, mas o arquivo atravessa o PROJETE em base64. Se o time precisar de mais, sobe depois.
- **Foto grande:** abre em outra aba, não numa janela por cima.
- **Tempo de gravação:** limitado a 5 minutos.
