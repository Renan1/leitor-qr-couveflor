import * as store from './store.js';
import * as scanner from './scanner.js';
import { downloadCsv, shareCsv, downloadResumoCsv, buildResumoTexto } from './export.js';
import { CLIENTES, QR_PREFIX, clienteDoQr, resumo } from './clientes.js';

const els = Object.fromEntries([
  'homeScreen','folderScreen','mealSelect','dateInput','folderNameInput','createFolderBtn','folderList','emptyFolders',
  'backBtn','folderTitle','folderSubtitle','video','reticle','camPlaceholder','intervalSelect','startBtn','stopBtn',
  'camDot','camStatus','manualCode','manualQty','manualBtn','totalCount','uniqueCount','logBody','emptyLog',
  'downloadBtn','shareBtn','shareStatus','deleteFolderBtn','storageWarning',
  'menuScreen','menuPresencaBtn','menuRampaBtn','menuPresencaInfo','menuRampaInfo','moduleBackBtn','moduleTitle','rampaCard','rampaGrid','rampaTotal','undoBtn','rampaMsg','manualCard','rampaExport','resumoBtn','printBtn','printSummary',
  'visor','visorFlash','hitBadge','rampaChip','rampaBar','rampaLast','logCard','whatsBtn','copyBtn',
].map(id => [id, document.getElementById(id)]));

const mealLabels = { Desjejum:'Desjejum', Cafe:'Café', Almoco:'Almoço', Jantar:'Jantar', Ceia:'Ceia', LMadrugada:'L. Madrugada' };
let currentId = null;
let currentModo = 'presenca'; // módulo aberto: 'presenca' | 'rampa'
const moduloNome = { presenca: 'Presença', rampa: 'Rampa' };

// Todo dado externo (QR, nome de pasta) entra na tela via textContent, nunca innerHTML.
function el(tag, props = {}, ...children){
  const n = document.createElement(tag);
  Object.assign(n, props);
  n.append(...children);
  return n;
}

const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
function suggestName(){
  const meal = mealLabels[els.mealSelect.value] || els.mealSelect.value;
  const [y, m, d] = els.dateInput.value.split('-');
  return `${currentModo === 'rampa' ? 'Rampa ' : ''}${meal}${d}.${m}.${y}`;
}

// ---------- aviso de armazenamento ----------
const WARN_OK = 'Os dados ficam salvos automaticamente neste navegador, mesmo se fechar a aba ou desligar a tela. Eles somem se limpar os dados do navegador ou trocar de aparelho — exporte o CSV quando quiser levar os registros pra outro lugar.';
const WARN_FAIL = 'Este navegador não está permitindo salvar os dados automaticamente. Exporte o CSV antes de fechar a aba.';
const updateWarning = () => { els.storageWarning.textContent = store.state.storageOk ? WARN_OK : WARN_FAIL; };

// ---------- telas ----------
function renderFolderList(){
  els.folderList.replaceChildren();
  const folders = store.state.folders.filter(f => f.modo === currentModo);
  els.emptyFolders.classList.toggle('hidden', folders.length > 0);
  [...folders].reverse().forEach(f => {
    const btn = el('button', { type: 'button', className: 'folder-item' },
      el('div', {},
        el('p', { className: 'folder-title', textContent: f.name }),
        el('p', { className: 'folder-sub', textContent: `${mealLabels[f.meal] || f.meal} · ${f.date}` })),
      el('span', { className: 'folder-count', textContent: f.modo === 'rampa' ? resumo(f).total : f.records.length }));
    btn.addEventListener('click', () => openFolder(f.id));
    els.folderList.append(btn);
  });
}

function renderLog(f){
  els.totalCount.textContent = f.records.length;
  els.uniqueCount.textContent = f.seen.size;
  els.emptyLog.classList.toggle('hidden', f.records.length > 0);
  els.logBody.replaceChildren(...[...f.records].reverse().map(r =>
    el('tr', {}, el('td', { textContent: r.time }), el('td', { textContent: r.code }), el('td', { textContent: r.qty }))));
}

const isRampa = (f) => f.modo === 'rampa';
const rampaBtns = new Map(); // id do cliente -> { btn, qtd, seg }
const clienteCodigo = (c) => c.qr ? c.qr.slice(0, 4) : QR_PREFIX + c.id; // "0102" ou "CF:BALC"

function buildRampaGrid(){
  rampaBtns.clear();
  els.rampaBar.replaceChildren();
  els.rampaGrid.replaceChildren(...CLIENTES.map(c => {
    const cls = `c-${c.id.toLowerCase()}`;
    const qtd = el('div', { className: 'client-count', textContent: '0' });
    const btn = el('button', { type: 'button', className: `client-card ${cls}` },
      el('div', { className: 'client-header' },
        el('span', { className: 'client-badge-circle', textContent: c.nome[0] }),
        el('div', {},
          el('div', { className: 'client-name', textContent: c.nome }),
          el('div', { className: 'client-code mono', textContent: clienteCodigo(c) }))),
      qtd);
    btn.addEventListener('click', () => registerRampa(c));
    const seg = el('div', { className: `bar-seg ${cls}`, title: c.nome });
    els.rampaBar.append(seg);
    rampaBtns.set(c.id, { btn, qtd, seg });
    return btn;
  }));
}

function renderRampa(f){
  const { linhas, total } = resumo(f);
  linhas.forEach(l => {
    const r = rampaBtns.get(l.id);
    r.qtd.textContent = l.qtd;
    r.seg.style.width = total ? `${(l.qtd / total) * 100}%` : '0';
  });
  els.rampaTotal.textContent = total;
  const last = f.records.at(-1);
  els.rampaLast.textContent = last ? (CLIENTES.find(c => c.id === last.code)?.nome || last.code) : '—';
}

function setIntervalOptions(rampa){
  // Rampa aceita 0,5 s (fila rápida); Presença mantém 1,0 / 1,5 s (regra 6 do CLAUDE.md).
  const opts = rampa ? [['500','0,5 segundo'], ['1000','1,0 segundo'], ['1500','1,5 segundo']] : [['1000','1,0 segundo'], ['1500','1,5 segundo']];
  els.intervalSelect.replaceChildren(...opts.map(([v, t]) => el('option', { value: v, textContent: t })));
  els.intervalSelect.value = rampa ? '1000' : '1500';
}

function openFolder(id){
  const f = store.findFolder(id);
  if(!f) return;
  currentId = id;
  currentModo = f.modo;
  els.folderTitle.textContent = f.name;
  els.folderSubtitle.textContent = `${mealLabels[f.meal] || f.meal} · ${f.date}`;
  els.shareStatus.textContent = '';
  els.rampaMsg.textContent = '';
  const rampa = isRampa(f);
  els.rampaCard.classList.toggle('hidden', !rampa);
  els.manualCard.classList.toggle('hidden', rampa);
  els.logCard.classList.toggle('hidden', rampa);
  els.rampaChip.classList.toggle('hidden', !rampa);
  els.visor.classList.toggle('compact', rampa);
  els.rampaExport.classList.toggle('hidden', !rampa);
  setIntervalOptions(rampa);
  if(rampa){ buildRampaGrid(); renderRampa(f); }
  renderLog(f);
  els.homeScreen.classList.add('hidden');
  els.menuScreen.classList.add('hidden');
  els.folderScreen.classList.remove('hidden');
  window.scrollTo(0, 0);
}

function showMenu(){
  stopCamera();
  currentId = null;
  els.folderScreen.classList.add('hidden');
  els.homeScreen.classList.add('hidden');
  els.menuScreen.classList.remove('hidden');
  const n = (m) => store.state.folders.filter(f => f.modo === m).length;
  els.menuPresencaInfo.textContent = `${n('presenca')} pasta(s)`;
  els.menuRampaInfo.textContent = `${n('rampa')} pasta(s)`;
  window.scrollTo(0, 0);
}

function openModule(modo){
  currentModo = modo;
  els.moduleTitle.textContent = moduloNome[modo];
  els.menuScreen.classList.add('hidden');
  els.folderScreen.classList.add('hidden');
  els.homeScreen.classList.remove('hidden');
  els.folderNameInput.value = suggestName();
  renderFolderList();
  window.scrollTo(0, 0);
}

function goHome(){
  stopCamera();
  currentId = null;
  els.folderScreen.classList.add('hidden');
  openModule(currentModo);
  window.scrollTo(0, 0);
}

// ---------- feedback ----------
let audioCtx = null; // um só: criar um por leitura estoura o limite do iOS
function beep(freq = 880){
  try{
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq; gain.gain.value = 0.08;
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.09);
  }catch(e){}
}
// Pisca o visor e mostra um selo curto sobre a câmera (rampa).
let badgeTimer = null;
function flashVisor(reticleCls, ms, badgeText, err){
  els.reticle.classList.add(reticleCls);
  els.visorFlash.classList.toggle('reject', !!err);
  els.visorFlash.classList.add('active');
  requestAnimationFrame(() => els.visorFlash.classList.remove('active'));
  setTimeout(() => els.reticle.classList.remove(reticleCls), ms);
  if(badgeText){
    els.hitBadge.textContent = badgeText;
    els.hitBadge.classList.toggle('err', !!err);
    els.hitBadge.classList.add('show');
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => els.hitBadge.classList.remove('show'), 1100);
  }
}

function feedback(badgeText){
  beep();
  try{ navigator.vibrate?.(90); }catch(e){}
  flashVisor('flash', 200, badgeText, false);
}

function rejectFeedback(){
  beep(220);
  try{ navigator.vibrate?.([60, 40, 60]); }catch(e){}
  flashVisor('reject', 350, 'QR NÃO RECONHECIDO', true);
}

// Rampa: cada leitura de um QR de cliente ("0102 - meli", ou "CF:<ID>") soma 1 pessoa ao cliente; qualquer outro QR é rejeitado e não conta.
function registerRampa(cliente){
  const f = store.findFolder(currentId);
  if(!f) return;
  store.addRecord(f, cliente.id, 1);
  renderRampa(f);
  renderLog(f);
  updateWarning();
  els.rampaMsg.className = 'live-status-row';
  els.rampaMsg.textContent = `+1 ${cliente.nome}`;
  const { btn } = rampaBtns.get(cliente.id);
  btn.classList.add('hit');
  setTimeout(() => btn.classList.remove('hit'), 200);
  feedback(`+1 ${cliente.nome.toUpperCase()}`);
}

function onScan(raw){
  const f = store.findFolder(currentId);
  if(!f) return;
  if(!isRampa(f)) return register(raw, 1);
  const cliente = clienteDoQr(raw);
  if(cliente) return registerRampa(cliente);
  els.rampaMsg.className = 'live-status-row err';
  els.rampaMsg.textContent = 'QR não reconhecido — não foi contado.';
  rejectFeedback();
}

function register(code, qty = 1){
  const f = store.findFolder(currentId);
  if(!f) return;
  store.addRecord(f, code, qty);
  renderLog(f);
  updateWarning();
  feedback();
}

// ---------- câmera ----------
function setCamUi(on, msg){
  els.camPlaceholder.classList.toggle('hidden', on);
  els.visor.classList.toggle('live', on);
  els.camDot.className = on ? 'dot live' : 'dot';
  els.camStatus.textContent = msg;
  els.startBtn.classList.toggle('hidden', on);
  els.stopBtn.classList.toggle('hidden', !on);
}
function stopCamera(){
  scanner.stop();
  setCamUi(false, 'Câmera parada.');
}
async function startCamera(){
  try{
    await scanner.start(els.video, parseInt(els.intervalSelect.value, 10), onScan);
    setCamUi(true, 'Câmera ativa — aponte para o QR Code.');
  }catch(err){
    console.error(err);
    els.camStatus.textContent = err.message === 'lib'
      ? 'A biblioteca de leitura não carregou. Recarregue a página.'
      : 'Não foi possível acessar a câmera. Libere a permissão no navegador e toque em "Iniciar câmera" de novo.';
  }
}

// ---------- eventos ----------
els.dateInput.value = todayISO();
els.folderNameInput.value = suggestName();
els.mealSelect.addEventListener('change', () => els.folderNameInput.value = suggestName());
els.dateInput.addEventListener('change', () => els.folderNameInput.value = suggestName());

els.createFolderBtn.addEventListener('click', () => {
  const folder = store.addFolder({
    name: els.folderNameInput.value.trim() || suggestName(),
    modo: currentModo,
    meal: els.mealSelect.value,
    date: els.dateInput.value,
  });
  updateWarning();
  els.folderNameInput.value = suggestName();
  openFolder(folder.id);
});

els.menuPresencaBtn.addEventListener('click', () => openModule('presenca'));
els.menuRampaBtn.addEventListener('click', () => openModule('rampa'));
els.moduleBackBtn.addEventListener('click', showMenu);
els.backBtn.addEventListener('click', goHome);
els.undoBtn.addEventListener('click', () => {
  const f = store.findFolder(currentId);
  const rec = f && store.removeLastRecord(f);
  if(!rec) return;
  renderRampa(f); renderLog(f); updateWarning();
  els.rampaMsg.className = 'live-status-row';
  els.rampaMsg.textContent = `Desfeito: -1 ${CLIENTES.find(c => c.id === rec.code)?.nome || rec.code}`;
});
els.resumoBtn.addEventListener('click', () => { const f = store.findFolder(currentId); if(f) downloadResumoCsv(f); });
els.printBtn.addEventListener('click', () => {
  const f = store.findFolder(currentId);
  if(!f) return;
  const { linhas, total } = resumo(f);
  els.printSummary.replaceChildren(
    el('h1', { textContent: f.name }),
    el('p', { textContent: `${mealLabels[f.meal] || f.meal} · ${f.date}` }),
    el('table', {},
      el('thead', {}, el('tr', {}, el('th', { textContent: 'Cliente' }), el('th', { textContent: 'Pessoas' }))),
      el('tbody', {}, ...linhas.map(l => el('tr', {}, el('td', { textContent: l.nome }), el('td', { textContent: l.qtd }))),
        el('tr', { className: 'total' }, el('td', { textContent: 'TOTAL' }), el('td', { textContent: total })))));
  window.print();
});
els.copyBtn.addEventListener('click', async () => {
  const f = store.findFolder(currentId);
  if(!f) return;
  try{
    await navigator.clipboard.writeText(buildResumoTexto(f, mealLabels[f.meal] || f.meal));
    els.shareStatus.textContent = 'Resumo copiado.';
  }catch(e){
    els.shareStatus.textContent = 'Não foi possível copiar neste navegador.';
  }
});
els.whatsBtn.addEventListener('click', () => {
  const f = store.findFolder(currentId);
  if(f) window.open(`https://wa.me/?text=${encodeURIComponent(buildResumoTexto(f, mealLabels[f.meal] || f.meal))}`, '_blank', 'noopener');
});
els.startBtn.addEventListener('click', startCamera);
els.stopBtn.addEventListener('click', stopCamera);
els.intervalSelect.addEventListener('change', () => scanner.setIntervalMs(parseInt(els.intervalSelect.value, 10)));

els.manualBtn.addEventListener('click', () => {
  const code = els.manualCode.value.trim();
  const qty = Math.max(1, parseInt(els.manualQty.value, 10) || 1);
  if(!code) return;
  register(code, qty);
  els.manualCode.value = '';
  els.manualQty.value = '1';
  els.manualCode.focus();
});
els.manualCode.addEventListener('keydown', (e) => { if(e.key === 'Enter') els.manualBtn.click(); });

els.downloadBtn.addEventListener('click', () => { const f = store.findFolder(currentId); if(f) downloadCsv(f); });
els.shareBtn.addEventListener('click', async () => {
  const f = store.findFolder(currentId);
  if(!f) return;
  els.shareStatus.textContent = '';
  if(await shareCsv(f)) els.shareStatus.textContent = 'CSV baixado — anexe o arquivo no e-mail que abriu.';
});

els.deleteFolderBtn.addEventListener('click', () => {
  const f = store.findFolder(currentId);
  if(!f) return;
  if(!window.confirm(`Excluir a pasta "${f.name}" com ${f.records.length} registro(s)? Essa ação não pode ser desfeita.`)) return;
  if(f.records.length > 0 && !window.confirm('Você já exportou o CSV ou enviou por e-mail antes de excluir? Confirme só se já salvou os dados em outro lugar.')) return;
  store.removeFolder(f.id);
  goHome();
});

window.addEventListener('beforeunload', (e) => {
  if(!store.state.storageOk && store.state.folders.some(f => f.records.length > 0)){ e.preventDefault(); e.returnValue = ''; }
});

store.load();
updateWarning();
showMenu();
