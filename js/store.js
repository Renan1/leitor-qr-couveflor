// Estado local, salvo no localStorage. A fila offline/API entra aqui na v2.
const STORAGE_KEY = 'couveflor_qr_folders_v1';

export const state = { folders: [], storageOk: true };

export const findFolder = (id) => state.folders.find(f => f.id === id);

export function save(){
  try{
    const data = state.folders.map(f => ({
      id: f.id, name: f.name, meal: f.meal, date: f.date,
      records: f.records, seen: [...f.seen.entries()],
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    state.storageOk = true;
  }catch(err){
    state.storageOk = false;
    console.error('Não foi possível salvar os dados:', err);
  }
}

export function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) state.folders = JSON.parse(raw).map(f => ({ ...f, seen: new Map(f.seen || []) }));
    state.storageOk = true;
  }catch(err){
    state.storageOk = false;
    console.error('Não foi possível carregar os dados salvos:', err);
  }
}

export function addFolder({ name, meal, date }){
  const folder = {
    id: 'f' + Date.now() + Math.random().toString(36).slice(2,6),
    name, meal, date, records: [], seen: new Map(),
  };
  state.folders.push(folder);
  save();
  return folder;
}

export function removeFolder(id){
  state.folders = state.folders.filter(f => f.id !== id);
  save();
}

export function addRecord(folder, code, qty){
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  const time = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  folder.records.push({ time, code, qty });
  folder.seen.set(code, (folder.seen.get(code) || 0) + qty);
  save();
}
