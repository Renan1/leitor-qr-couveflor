// Clientes do modo Rampa. `id` é o código estável gravado no CSV; `cod`/`qr` vêm dos QRs oficiais da operação ("0102 - meli").
export const CLIENTES = [
  { id: 'TUPP', nome: 'Tupperware',      tipo: 'contrato', cod: 100, qr: '0100 - tupperware' },
  { id: 'GRAN', nome: 'Granvita',        tipo: 'contrato', cod: 101, qr: '0101 - granvita' },
  { id: 'MELI', nome: 'Mercado Livre',   tipo: 'contrato', cod: 102, qr: '0102 - meli' },
  { id: 'COM',  nome: 'Cliente Comum',   tipo: 'avulso',   cod: 103, qr: '0103 - comum' },
  { id: 'LOG',  nome: 'Log',             tipo: 'contrato', cod: 104, qr: '0104 - log' },
  { id: 'BALC', nome: 'Cliente Balcão',  tipo: 'balcao' }, // sem QR oficial: só o cartão antigo "CF:BALC"
];

export const QR_PREFIX = 'CF:';
// Texto que o cartão impresso carrega: o QR oficial, ou "CF:<ID>" para quem não tem.
export const qrDoCliente = (id) => CLIENTES.find(c => c.id === id)?.qr || QR_PREFIX + id;

// "0102 - meli": número (zeros à esquerda não importam) + hífen + nome. Crachá (só dígitos) não casa.
const QR_OFICIAL = /^0*(\d+)\s*[-–]\s*\S.*$/;

// Texto lido do QR -> cliente, ou null se não for um QR de cliente.
export function clienteDoQr(texto){
  const t = String(texto).trim();
  if(t.startsWith(QR_PREFIX)){
    const id = t.slice(QR_PREFIX.length).toUpperCase();
    return CLIENTES.find(c => c.id === id) || null;
  }
  const m = QR_OFICIAL.exec(t);
  return m ? CLIENTES.find(c => c.cod === Number(m[1])) || null : null;
}

// Totais por cliente (soma de qty) e total geral de uma pasta do modo Rampa.
export function resumo(folder){
  const porId = new Map(CLIENTES.map(c => [c.id, 0]));
  for(const r of folder.records) if(porId.has(r.code)) porId.set(r.code, porId.get(r.code) + r.qty);
  const linhas = CLIENTES.map(c => ({ ...c, qtd: porId.get(c.id) }));
  return { linhas, total: linhas.reduce((s, l) => s + l.qtd, 0) };
}
