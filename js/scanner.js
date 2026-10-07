// Câmera + decodificação. Sem deduplicação: cada leitura bem-sucedida chama onCode (regra 3 do CLAUDE.md).
const MAX_W = 640; // reduz o frame antes de decodificar
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

let stream = null, timer = null, wakeLock = null, video = null, onCode = null;

export const isScanning = () => !!stream;

async function lockScreen(){
  try{ wakeLock = await navigator.wakeLock?.request('screen'); }catch(e){ wakeLock = null; }
}
// o navegador solta o wake lock ao ocultar a aba; pega de novo ao voltar
document.addEventListener('visibilitychange', () => { if(stream && document.visibilityState === 'visible') lockScreen(); });

function scanFrame(){
  if(!stream || video.readyState !== video.HAVE_ENOUGH_DATA) return;
  try{
    const scale = Math.min(1, MAX_W / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
    if(result && result.data) onCode(result.data);
  }catch(err){
    console.error('Falha ao ler o frame da câmera:', err);
  }
}

export async function start(videoEl, intervalMs, handler){
  if(typeof jsQR === 'undefined') throw new Error('lib');
  video = videoEl; onCode = handler;
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  video.srcObject = stream;
  await video.play();
  lockScreen();
  restartTimer(intervalMs);
}

function restartTimer(ms){ clearInterval(timer); timer = setInterval(scanFrame, ms); }
export function setIntervalMs(ms){ if(stream) restartTimer(ms); }

export function stop(){
  clearInterval(timer); timer = null;
  stream?.getTracks().forEach(t => t.stop());
  stream = null;
  if(video) video.srcObject = null;
  wakeLock?.release().catch(() => {}); wakeLock = null;
}
