# CLAUDE.md — Leitor de QR Code Couve Flor

Ferramenta web mobile-first que abre a câmera traseira do celular, lê QR Codes em intervalo fixo e registra cada leitura (TIME, CODE, QTY) dentro de "pastas" (refeição + data). Uso: contagem de refeições servidas no restaurante Couve Flor Refeições (necessidade de contar o "Realizado" por cliente, em especial MELI).

Idioma da interface, commits e documentação: **português do Brasil**.

---

## 1. Estado atual vs. estado alvo (leia primeiro)

**Estado atual (v1, arquivo único `leitor-qrcode-couve-flor.html`)**
- HTML/CSS/JS em um único arquivo, sem build.
- Dados salvos só no `localStorage` do navegador de cada celular. Sem compartilhamento entre aparelhos, sem painel, sem backup.
- Leitura de QR via jsQR carregado de CDN (`cdn.jsdelivr.net/npm/jsqr@1.4.0`).
- Hospedagem hoje no Netlify (sendo abandonada por limite de créditos).

**Estado alvo (v2, objetivo desta migração)**
- Front estático em GitHub Pages, domínio em subdomínio do domínio próprio (DNS no Cloudflare).
- Backend em Google Apps Script + Google Sheets (mesmo padrão já usado no sistema de viagens da empresa).
- Vários celulares gravando na mesma pasta ao mesmo tempo; painel de acompanhamento em outro dispositivo.
- Nenhuma leitura pode ser perdida por falha de rede.

> A v2 **ainda não existe**. Tudo que está na seção 4 em diante é desenho, não código pronto. Não assumir que o Apps Script já foi criado.

---

## 2. Decisões já tomadas (não reabrir sem motivo novo)

1. **Hospedagem**: GitHub Pages + subdomínio via CNAME no Cloudflare. Sem Netlify.
2. **Backend/banco**: Google Apps Script (Web App) + Google Sheets. Supabase foi avaliado e descartado para este projeto (escala pequena, equipe já domina o padrão Apps Script).
3. **Duplicatas são desejadas**: o mesmo QR pode e deve ser registrado inúmeras vezes. Cada leitura bem-sucedida = uma linha. **Nunca** adicionar deduplicação, debounce por código ou "rearme" ao ler.
4. **Qualquer conteúdo de QR é aceito**: texto, número, URL, o que vier. Registrar o valor bruto, sem filtrar formato.
5. **TIME = horário real da leitura**, sempre. Pasta retroativa NÃO herda a data da pasta. Correção de data retroativa é feita manualmente na planilha.
6. **Intervalo de leitura**: 1,0 s ou 1,5 s, selecionável na tela (padrão 1,5 s).
7. **Feedback por leitura**: vibração curta (90 ms) + beep + flash no retículo. Vibração não funciona em iOS/Safari (limitação da plataforma); manter o beep como reforço.
8. **Exclusão de pasta**: permitida depois de exportar, com dupla confirmação (confirmação geral + "já exportou?" quando houver registros).
9. **Exportação**: CSV por pasta, separador `;`, quebra `\r\n`, cabeçalho `TIME;CODE;QTY`, arquivo nomeado a partir do nome da pasta sem acentos. Envio por e-mail via Web Share API com arquivo; fallback = baixar CSV + abrir `mailto:`.
10. **Formato de origem** (planilha original da operação): aba `Barcode`, colunas `TIME`, `CODE`, `QTY`, `TIME` no formato `AAAA-MM-DD HH:MM:SS`, arquivo `Almoco10_08_2026.xls`. O CSV exportado deve continuar compatível com esse layout.

11. **Modo Rampa** (contagem de pessoas por cliente, pasta com `modo: 'rampa'`): cada leitura de `CF:<ID>` (TUPP, GRAN, MELI, COM, BALC) grava uma linha `{time, code: <ID>, qty: 1}`. QR fora dessa lista é **rejeitado e não conta** (exceção à regra 4, só na Rampa). Sem debounce por código (regra 3 vale): só o intervalo fixo, que na Rampa também aceita 0,5 s (padrão 1,0 s). Correção = botão "Desfazer última". Presença segue com 1,0/1,5 s e aceitando qualquer QR. Lista de clientes em `js/clientes.js`; QRs para imprimir em `qrs.html`.

---

## 3. Invariantes de comportamento (testes de regressão mentais)

- A câmera usa `facingMode: { ideal: 'environment' }` (traseira).
- Ao voltar para a tela inicial, a câmera é parada.
- Voltar a uma pasta existente continua registrando normalmente.
- Refeições disponíveis: Desjejum, Café, Almoço, Jantar, Ceia, L. Madrugada.
- Nome sugerido da pasta: `{Refeição}{DD}.{MM}.{AAAA}` (ex.: `Almoço15.09.2026`), editável.
- Registro manual (código + quantidade) continua existindo.
- Favicon e ícone do atalho = logo da Couve Flor (teal + couve-flor creme).

---

## 4. Arquitetura alvo

```
leitor-qr-couveflor/
├── CLAUDE.md
├── README.md
├── CNAME                      # subdomínio do GitHub Pages (uma linha)
├── index.html
├── manifest.webmanifest       # PWA: atalho na tela inicial
├── sw.js                      # service worker (cache do app shell)
├── assets/
│   ├── logo.png               # logo original 500x500
│   └── icons/                 # 192, 512 e favicon 128
├── css/
│   └── style.css
├── js/
│   ├── app.js                 # inicialização e navegação entre telas
│   ├── scanner.js             # câmera + decodificação
│   ├── store.js               # estado local + fila offline
│   ├── api.js                 # chamadas ao Apps Script
│   ├── export.js              # CSV, share, download
│   ├── ui.js                  # renderização (sem innerHTML com dado externo)
│   └── config.js              # URL do Web App (ver seção 6)
├── vendor/
│   └── jsQR.min.js            # biblioteca versionada no repo, sem CDN
├── apps-script/
│   ├── Code.gs                # backend
│   └── appsscript.json
└── docs/
    └── operacao.md            # passo a passo para o operador
```

Sem framework e sem bundler no início. JavaScript puro com módulos ES. Só introduzir build (Vite) se o número de módulos justificar.

### 4.1 Modelo de dados na planilha

Aba `Registros`:

| Coluna | Conteúdo |
|---|---|
| ID | UUID gerado no celular (garante idempotência no reenvio) |
| TIME | `AAAA-MM-DD HH:MM:SS`, horário local do celular na leitura |
| CODE | conteúdo bruto do QR |
| QTY | inteiro, padrão 1 |
| PASTA_ID | referência à aba `Pastas` |
| DEVICE | identificador anônimo do aparelho (gerado e guardado localmente) |

Aba `Pastas`:

| Coluna | Conteúdo |
|---|---|
| PASTA_ID | UUID |
| NOME | ex.: `Almoço15.09.2026` |
| REFEICAO | uma das seis opções |
| DATA | data escolhida na criação |
| CRIADA_EM | timestamp |
| STATUS | `ativa` ou `excluida` |

Exclusão de pasta = **soft delete** (`STATUS = excluida`), preservando auditoria na planilha. Os registros não são apagados fisicamente. *(Confirmar com o dono antes de implementar; alternativa é apagar as linhas.)*

### 4.2 Contrato da API (Apps Script Web App)

Todas as chamadas são `POST` com `Content-Type: text/plain;charset=utf-8` e corpo JSON. Usar `text/plain` evita preflight CORS, que o Apps Script não responde. Seguir o redirect do `script.google.com` normalmente.

| action | Entrada | Saída |
|---|---|---|
| `criarPasta` | nome, refeicao, data | pasta criada (ou existente com mesmo nome) |
| `registrar` | pastaId, lote de `{id,time,code,qty}` | quantos gravados, ids ignorados por duplicidade |
| `listarPastas` | — | pastas ativas com contagem |
| `listarRegistros` | pastaId, cursor opcional | registros paginados |
| `excluirPasta` | pastaId, pin | ok |

Regras do backend:
- `LockService.getScriptLock().waitLock(...)` em toda escrita, para vários celulares simultâneos.
- Gravação em lote com `setValues` (uma chamada por lote, não uma por linha).
- Idempotência por `ID`: reenviar o mesmo lote não duplica linhas. Atenção: isso protege contra reenvio de rede, **não** contra a regra 3 (duplicatas de QR são IDs diferentes e devem ser gravadas).
- Validar e limitar tamanho de `CODE` (ex.: 2.000 caracteres) antes de gravar.

### 4.3 Fila offline (requisito crítico)

Wi-Fi de restaurante falha. Cada leitura deve:
1. Ser gravada primeiro localmente (com UUID) e aparecer na tela imediatamente.
2. Ir para uma fila de envio e ser enviada em lote a cada poucos segundos.
3. Permanecer na fila até a API confirmar; retry com backoff.
4. Mostrar na tela o contador "pendentes de envio" e o estado online/offline.

Perder uma leitura silenciosamente é o pior defeito possível deste sistema.

---

## 5. Painel de acompanhamento

Segunda tela (rota `?painel` ou `painel.html`) para computador: lista de pastas, total por pasta, total por refeição/dia, últimos registros, atualização por polling a cada 5–10 s (`listarRegistros` com cursor, sem reler a planilha inteira). Acesso protegido por PIN de gestão.

---

## 6. Segurança (não negociável)

O sistema de viagens da empresa já passou por auditoria que encontrou XSS, injeção de fórmula em CSV e PIN sem limite de tentativas. **Não repetir esses erros aqui.**

1. **XSS**: o conteúdo de um QR é entrada não confiável. Hoje a v1 monta linhas com `innerHTML` usando `rec.code` e `f.name`. Trocar por `textContent` / `createElement` em toda renderização de dado vindo de QR, nome de pasta ou API. Prioridade 1.
2. **Injeção de fórmula em CSV/Sheets**: valores iniciados por `=`, `+`, `-`, `@`, tab ou CR devem ser neutralizados (prefixo `'`) **na exportação e na gravação na planilha**, sem alterar o dado exibido na tela.
3. **URL do Apps Script é pública** (está no JS servido pelo Pages). Portanto:
   - Exigir token compartilhado do app (guardado em *Script Properties*, não no código do Apps Script) em toda chamada de escrita.
   - Ações de gestão (excluir, listar tudo) exigem PIN, com bloqueio após tentativas erradas (reaproveitar a lógica já usada no sistema de viagens).
   - O token no front não é segredo forte; ele só reduz abuso casual. Tratar a planilha como exposta a quem tiver o link do app.
4. **Repositório público (GitHub Pages gratuito exige)**: nunca commitar chaves, e-mails de gestão, IDs de planilha com dados reais ou PINs. Configuração sensível fica em *Script Properties*. `config.js` contém apenas a URL do Web App.
5. **Biblioteca de terceiros**: jsQR versionada em `vendor/`, sem CDN em produção (a v1 já quebrou uma vez por URL de CDN errada e depende de disponibilidade externa).
6. **Sem dados pessoais além do código lido**: o CODE pode identificar uma pessoa (crachá). Tratar a planilha como dado pessoal sob LGPD: acesso restrito, sem compartilhar link aberto.

---

## 7. Leitura de QR: melhorias previstas

- Usar `BarcodeDetector` quando o navegador suportar `qr_code` (verificar em runtime), com jsQR como fallback.
- Reduzir a resolução do frame antes de decodificar (ex.: largura máxima ~640 px) para ganhar velocidade sem perder leitura em distância normal.
- Manter `inversionAttempts: 'attemptBoth'` no fallback jsQR.
- `Screen Wake Lock` ativo enquanto a câmera estiver ligada, para a tela não apagar durante o serviço.
- Tratar erros de permissão da câmera com mensagem clara e botão de nova tentativa.

---

## 8. Design e UI

- Mobile-first, fluido (`clamp()`, `dvh`), alvos de toque ≥ 44 px, `viewport-fit=cover`.
- Fundo branco. Paleta derivada da logo: teal `#1f9e82` (ação), teal escuro `#157a64`, tinta `#e3f5ef`, superfície `#f3faf7`, linhas `#dbe9e3`, texto `#16201c`, alerta `#b5762a`, perigo `#bd4438`.
- Tipografia: IBM Plex Sans (UI) e IBM Plex Mono (dados: TIME, CODE, QTY).
- Este padrão visual foi aprovado pelo dono; **preservar** ao refatorar.
- Cuidado com `window.confirm`/`alert`: funcionam, mas trocar por diálogo próprio acessível é melhoria desejável.

---

## 9. Backlog priorizado

1. Corrigir XSS por `innerHTML` e neutralizar fórmula no CSV (seção 6, itens 1–2).
2. Extrair o HTML único para a estrutura da seção 4, sem mudar comportamento. Rodar a lista de invariantes (seção 3) manualmente depois.
3. Vendorizar jsQR.
4. Implementar `Code.gs` + planilha (modelo 4.1, contrato 4.2) e `api.js`.
5. Fila offline + indicador de pendentes (4.3).
6. Token + PIN de gestão (seção 6).
7. Painel de acompanhamento (seção 5).
8. PWA (manifest + service worker) para instalar como app.
9. BarcodeDetector, redução de frame e wake lock (seção 7).
10. Decisão pendente: soft delete vs. exclusão física (4.1).

---

## 10. Deploy

Ambiente de desenvolvimento do dono: **Windows** (PowerShell), com Git e Node instalados.

1. Criar repositório `leitor-qr-couveflor` (público) e fazer push da `main`.
2. GitHub → Settings → Pages → *Deploy from a branch* → `main` / root.
3. Arquivo `CNAME` na raiz com o subdomínio escolhido (ex.: `qrcode.couveflorrefeicoes.com.br`).
4. Cloudflare → DNS → registro `CNAME` do subdomínio apontando para `<usuario>.github.io`. Se o HTTPS do Pages não emitir certificado, deixar o proxy (nuvem laranja) desligado até o certificado ser emitido.
5. Marcar *Enforce HTTPS* nas configurações do Pages. **A câmera só funciona em HTTPS** (ou `localhost`).
6. Apps Script: *Implantar → Nova implantação → App da Web*, executar como o dono, acesso conforme a seção 6. Cada alteração do `Code.gs` exige **nova versão de implantação**; a URL `/exec` permanece a mesma se a implantação for atualizada, não recriada.

Teste local: `npx serve` (ou `python -m http.server`) e abrir em `http://localhost`, ou expor o celular na mesma rede com HTTPS (a câmera exige contexto seguro; `http://IP-da-rede` não serve).

---

## 11. Como trabalhar neste repositório

- Antes de implementar algo que afete segurança, dados ou as regras da seção 2, apontar o risco e a alternativa antes de escrever código.
- Não remover nem "otimizar" comportamento listado nas seções 2 e 3 sem pedir confirmação.
- Mudanças em `Code.gs` devem informar que é necessária nova implantação.
- Commits pequenos e em português, no imperativo (ex.: `Corrige XSS na lista de registros`).
- Testar em celular real com câmera: o navegador de desktop não substitui o teste de leitura, vibração e Web Share.
- Quando houver dúvida sobre regra de negócio (contagem, retroativo, exclusão), perguntar em vez de presumir.
