// node js/selfcheck.mjs — falha se o CSV deixar de neutralizar fórmulas ou quebrar o layout.
import assert from 'node:assert';
import { buildCsv } from './export.js';

const csv = buildCsv({ records: [
  { time: '2026-09-15 12:00:00', code: '=1+1', qty: 1 },
  { time: '2026-09-15 12:00:01', code: 'a;b"c', qty: 2 },
  { time: '2026-09-15 12:00:02', code: '10119184', qty: 1 },
]});
assert.equal(csv, "TIME;CODE;QTY\r\n2026-09-15 12:00:00;'=1+1;1\r\n2026-09-15 12:00:01;\"a;b\"\"c\";2\r\n2026-09-15 12:00:02;10119184;1\r\n");
console.log('ok');

// ---- modo Rampa ----
import { clienteDoQr, resumo } from './clientes.js';
import { buildResumoCsv } from './export.js';
import { removeLastRecord } from './store.js';

assert.equal(clienteDoQr('CF:MELI').id, 'MELI');
assert.equal(clienteDoQr(' cf:meli '), null);            // prefixo exato, case do prefixo importa
assert.equal(clienteDoQr('CF:meli').id, 'MELI');         // id aceita minúsculas
assert.equal(clienteDoQr('10119184'), null);             // crachá não conta
assert.equal(clienteDoQr('CF:XXXX'), null);

const pasta = { records: [], seen: new Map() };
for(const code of ['TUPP', 'MELI', 'MELI', 'COM']) pasta.records.push({ time: 't', code, qty: 1 });
pasta.seen = new Map([['TUPP', 1], ['MELI', 2], ['COM', 1]]);
assert.equal(resumo(pasta).total, 4);
assert.equal(resumo(pasta).linhas.find(l => l.id === 'MELI').qtd, 2);
assert.equal(buildResumoCsv(pasta).split('\r\n').at(-2), 'TOTAL;;4');

globalThis.localStorage = { setItem(){} };
assert.equal(removeLastRecord(pasta).code, 'COM');       // desfazer tira a última leitura
assert.equal(resumo(pasta).total, 3);
assert.equal(pasta.seen.has('COM'), false);
console.log('ok rampa');
