import { resumo } from './clientes.js';

// Valores iniciados por = + - @ tab ou CR viram fórmula no Excel/Sheets: prefixo ' neutraliza.
// Só na exportação; a tela continua mostrando o dado original.
const neutralize = (v) => /^[=+\-@\t\r]/.test(v) ? "'" + v : v;

function csvEscape(v){
  v = neutralize(String(v));
  return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

export function buildCsv(f){
  const rows = f.records.map(r => [r.time, r.code, r.qty].map(csvEscape).join(';'));
  return ['TIME;CODE;QTY', ...rows].join('\r\n') + '\r\n';
}

export const csvFileName = (f) =>
  String(f.name).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9.\-]/g, '_') + '.csv';

function download(csv, fileName){
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}

export const downloadCsv = (f) => download(buildCsv(f), csvFileName(f));

// Resumo da Rampa: CLIENTE;CODIGO;QTD + linha de total.
export function buildResumoCsv(f){
  const { linhas, total } = resumo(f);
  const rows = [...linhas.map(l => [l.nome, l.id, l.qtd]), ['TOTAL', '', total]];
  return ['CLIENTE;CODIGO;QTD', ...rows.map(r => r.map(csvEscape).join(';'))].join('\r\n') + '\r\n';
}
export const downloadResumoCsv = (f) => download(buildResumoCsv(f), 'Resumo_' + csvFileName(f));

// Retorna true se caiu no fallback (baixou o CSV e abriu o e-mail).
export async function shareCsv(f){
  const csv = buildCsv(f), fileName = csvFileName(f);
  const file = new File([csv], fileName, { type: 'text/csv' });
  if(navigator.canShare && navigator.canShare({ files: [file] })){
    try{
      await navigator.share({ files: [file], title: f.name, text: `Registros da pasta ${f.name} (${f.records.length} leituras).` });
      return false;
    }catch(err){
      if(err.name === 'AbortError') return false;
      console.error(err);
    }
  }
  download(csv, fileName);
  const subject = encodeURIComponent(`Registros — ${f.name}`);
  const body = encodeURIComponent(`Segue o CSV da pasta ${f.name} (${f.records.length} leituras). O arquivo foi baixado — é só anexar aqui antes de enviar.`);
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
  return true;
}
