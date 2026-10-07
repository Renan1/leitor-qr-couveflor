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
