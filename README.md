# Leitor de QR Code — Couve Flor

Web app mobile-first que lê QR Codes pela câmera traseira e registra cada leitura (TIME, CODE, QTY) em pastas por refeição e data. Veja `CLAUDE.md` para decisões e backlog.

## Rodar localmente

```bash
npm start      # http://localhost:3000 (a câmera só funciona em HTTPS ou localhost)
npm test       # verificação do CSV (neutralização de fórmula)
```

## Estado

v1.1: o app é o da v1 (dados no `localStorage`), reorganizado em módulos, com correção de XSS e de injeção de fórmula no CSV, e com jsQR e fontes locais em `vendor/`. A v2 (Apps Script + Google Sheets + fila offline) ainda não existe.
