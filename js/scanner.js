// Câmera + decodificação. Sem deduplicação por código: cada leitura aceita chama onCode (regra 3 do CLAUDE.md).
//
// A câmera é decodificada o tempo todo (rápido); o "intervalo de leitura" (regra 6) limita só quantas leituras
// são REGISTRADAS por segundo, de forma global — não olha o conteúdo do QR. Assim o QR é pego no instante em que
// aparece, em vez de esperar o próximo tick de 1,0/1,5 s.
const MAX_W = 960;          // largura máxima do frame no fallback jsQR
const GAP_NATIVE = 60;      // pausa entre tentativas com BarcodeDetector (ms)
const GAP_JSQR = 40;        // idem no fallback jsQR, para deixar a UI respirar
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

let stream = null, timer = null, wakeLock = null, video = null, onCode = null, gen = 0; // gen invalida loops antigos após stop()/start()
let intervalMs = 1500, lastEmit = -Infinity, detector = null, nativeFailures = 0;

export const isScanning = () => !!stream;

async function lockScreen(){
  try{ wakeLock = await navigator.wakeLock?.request('screen'); }catch(e){ wakeLock = null; }
}
// o navegador solta o wake lock ao ocultar a aba; pega de novo ao voltar
document.addEventListener('visibilitychange', () => { if(stream && document.visibilityState === 'visible') lockScreen(); });

async function makeDetector(){
  try{
    if(!('BarcodeDetector' in window)) return null;
    const formats = await BarcodeDetector.getSupportedFormats();
    return formats.includes('qr_code') ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
  }catch(e){ return null; }
}

function decodeJsQr(){
  const scale = Math.min(1, MAX_W / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const result = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  return result?.data || null;
}

async function decodeFrame(){
  if(detector){
    try{
      const found = await detector.detect(video);
      nativeFailures = 0;
      if(found.length) return found[0].rawValue;
      return null;
    }catch(e){
      if(++nativeFailures >= 5) detector = null; // detector instável neste aparelho: cai para o jsQR
    }
  }
  return typeof jsQR === 'undefined' ? null : decodeJsQr();
}

async function tick(g){
  if(!stream || g !== gen) return;
  const t0 = performance.now();
  try{
    if(video.readyState === video.HAVE_ENOUGH_DATA){
      const code = await decodeFrame();
      const now = performance.now();
      if(code && stream && g === gen && now - lastEmit >= intervalMs){
        lastEmit = now;
        onCode(code);
      }
    }
  }catch(err){
    console.error('Falha ao ler o frame da câmera:', err);
  }
  if(!stream || g !== gen) return;
  const gap = detector ? GAP_NATIVE : GAP_JSQR;
  timer = setTimeout(() => tick(g), Math.max(0, gap - (performance.now() - t0)));
}

export async function start(videoEl, ms, handler){
  detector = await makeDetector();
  if(!detector && typeof jsQR === 'undefined') throw new Error('lib');
  video = videoEl; onCode = handler; intervalMs = ms; lastEmit = -Infinity; nativeFailures = 0;
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  // foco contínuo, quando o aparelho deixa escolher: QR de perto e em movimento fica nítido mais rápido
  try{ await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); }catch(e){}
  video.srcObject = stream;
  await video.play();
  lockScreen();
  clearTimeout(timer);
  tick(++gen);
}

export function setIntervalMs(ms){ intervalMs = ms; }

export function stop(){
  gen++;
  clearTimeout(timer); timer = null;
  stream?.getTracks().forEach(t => t.stop());
  stream = null;
  if(video) video.srcObject = null;
  wakeLock?.release().catch(() => {}); wakeLock = null;
}
