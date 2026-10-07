import * as store from './store.js';
import * as scanner from './scanner.js';
import { downloadCsv, shareCsv } from './export.js';

const els = Object.fromEntries([
  'homeScreen','folderScreen','mealSelect','dateInput','folderNameInput','createFolderBtn','folderList','emptyFolders',
  'backBtn','folderTitle','folderSubtitle','video','reticle','camPlaceholder','intervalSelect','startBtn','stopBtn',
  'camDot','camStatus','manualCode','manualQty','manualBtn','totalCount','uniqueCount','logBody','emptyLog',
  'downloadBtn','shareBtn','shareStatus','deleteFolderBtn','storageWarning',
].map(id => [id, document.getElementById(id)]));

const mealLabels = { Desjejum:'Desjejum', Cafe:'Café', Almoco:'Almoço', Jantar:'Jantar', Ceia:'Ceia', LMadrugada:'L. Madrugada' };
let currentId = null;

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
  return `${meal}${d}.${m}.${y}`;
}

// ---------- aviso de armazenamento ----------
const WARN_OK = 'Os dados ficam salvos automaticamente neste navegador, mesmo se fechar a aba ou desligar a tela. Eles somem se limpar os dados do navegador ou trocar de aparelho — exporte o CSV quando quiser levar os registros pra outro lugar.';
const WARN_FAIL = 'Este navegador não está permitindo salvar os dados automaticamente. Exporte o CSV antes de fechar a aba.';
const updateWarning = () => { els.storageWarning.textContent = store.state.storageOk ? WARN_OK : WARN_FAIL; };

// ---------- telas ----------
function renderFolderList(){
  els.folderList.replaceChildren();
  const folders = store.state.folders;
  els.emptyFolders.classList.toggle('hidden', folders.length > 0);
  [...folders].reverse().forEach(f => {
    const btn = el('button', { type: 'button', className: 'folder-item' },
      el('div', {},
        el('div', { className: 'fname', textContent: f.name }),
        el('div', { className: 'fmeta', textContent: `${mealLabels[f.meal] || f.meal} · ${f.date}` })),
      el('div', { className: 'fcount', textContent: f.records.length }));
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

function openFolder(id){
  const f = store.findFolder(id);
  if(!f) return;
  currentId = id;
  els.folderTitle.textContent = f.name;
  els.folderSubtitle.textContent = `${mealLabels[f.meal] || f.meal} · ${f.date}`;
  els.shareStatus.textContent = '';
  renderLog(f);
  els.homeScreen.classList.add('hidden');
  els.folderScreen.classList.remove('hidden');
  window.scrollTo(0, 0);
}

function goHome(){
  stopCamera();
  currentId = null;
  els.folderScreen.classList.add('hidden');
  els.homeScreen.classList.remove('hidden');
  renderFolderList();
  window.scrollTo(0, 0);
}

// ---------- feedback ----------
let audioCtx = null; // um só: criar um por leitura estoura o limite do iOS
function beep(){
  try{
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.value = 880; gain.gain.value = 0.08;
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.09);
  }catch(e){}
}
function feedback(){
  beep();
  try{ navigator.vibrate?.(90); }catch(e){}
  els.reticle.classList.add('flash');
  setTimeout(() => els.reticle.classList.remove('flash'), 200);
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
    await scanner.start(els.video, parseInt(els.intervalSelect.value, 10), (code) => register(code, 1));
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
    meal: els.mealSelect.value,
    date: els.dateInput.value,
  });
  updateWarning();
  renderFolderList();
  els.folderNameInput.value = suggestName();
  openFolder(folder.id);
});

els.backBtn.addEventListener('click', goHome);
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
renderFolderList();
