// Clientes do modo Rampa. O QR carrega só o id estável ("CF:MELI"); o nome pode mudar sem reimprimir QR.
export const CLIENTES = [
  { id: 'TUPP', nome: 'Tupperware',      tipo: 'contrato' },
  { id: 'GRAN', nome: 'Granvita',        tipo: 'contrato' },
  { id: 'MELI', nome: 'Mercado Livre',   tipo: 'contrato' },
  { id: 'COM',  nome: 'Cliente Comum',   tipo: 'avulso' },
  { id: 'BALC', nome: 'Cliente Balcão',  tipo: 'balcao' },
];

export const QR_PREFIX = 'CF:';
export const qrDoCliente = (id) => QR_PREFIX + id;

// Texto lido do QR -> cliente, ou null se não for um QR de cliente.
export function clienteDoQr(texto){
  const t = String(texto).trim();
  if(!t.startsWith(QR_PREFIX)) return null;
  const id = t.slice(QR_PREFIX.length).toUpperCase();
  return CLIENTES.find(c => c.id === id) || null;
}

// Totais por cliente (soma de qty) e total geral de uma pasta do modo Rampa.
export function resumo(folder){
  const porId = new Map(CLIENTES.map(c => [c.id, 0]));
  for(const r of folder.records) if(porId.has(r.code)) porId.set(r.code, porId.get(r.code) + r.qty);
  const linhas = CLIENTES.map(c => ({ ...c, qtd: porId.get(c.id) }));
  return { linhas, total: linhas.reduce((s, l) => s + l.qtd, 0) };
}
