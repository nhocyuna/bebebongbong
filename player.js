const music=document.getElementById('music');
const playButton=document.getElementById('playMusic');
const volume=document.getElementById('volume');
const bars=document.getElementById('bars');
for(let i=0;i<16;i++)bars.appendChild(document.createElement('i'));
let audioContext,analyser,levels;
function connectAudio(){
  if(location.protocol==='file:'||audioContext)return;
  audioContext=new (window.AudioContext||window.webkitAudioContext)();
  const source=audioContext.createMediaElementSource(music);
  analyser=audioContext.createAnalyser();analyser.fftSize=256;
  levels=new Uint8Array(analyser.frequencyBinCount);
  source.connect(analyser);analyser.connect(audioContext.destination);
}
async function startMusic(){
  connectAudio();music.muted=false;music.volume=Number(volume.value);
  if(audioContext)await audioContext.resume();
  await music.play();playButton.textContent='❚❚';
}
playButton.onclick=async()=>{
  if(music.paused){try{await startMusic()}catch(e){console.warn(e)}}
  else{music.pause();playButton.textContent='▶'}
};
volume.oninput=()=>music.volume=Number(volume.value);
document.addEventListener('pointerdown',event=>{
  if(!event.target.closest('.player')&&music.paused)startMusic().catch(()=>{});
},{once:true});
function animateBars(){
  if(analyser&&!music.paused){
    analyser.getByteFrequencyData(levels);
    [...bars.children].forEach((bar,i)=>bar.style.height=(4+levels[Math.min(levels.length-1,i*3)]/255*22)+'px');
  }else if(!music.paused){
    [...bars.children].forEach((bar,i)=>bar.style.height=(5+Math.abs(Math.sin(music.currentTime*7+i*.8))*17)+'px');
  }else [...bars.children].forEach(bar=>bar.style.height='5px');
  requestAnimationFrame(animateBars);
}
music.volume=Number(volume.value);
music.play().then(()=>playButton.textContent='❚❚').catch(()=>playButton.textContent='▶');
animateBars();
