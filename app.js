const cardsNode=document.getElementById('cards');
const nameNode=document.getElementById('viewName');
const passNode=document.getElementById('viewPass');
const loginButton=document.getElementById('loginButton');
const registerButton=document.getElementById('registerButton');
const logoutButton=document.getElementById('logoutButton');
const loginState=document.getElementById('loginState');
const notice=document.getElementById('gameNotice');
const reveal=document.getElementById('reveal');
const revealMedia=document.getElementById('revealMedia');
const caption=document.getElementById('revealCaption');
let cards=[],page=0,busy=false,remaining=0,isOpen=false;
let viewerToken=localStorage.getItem('memoryViewerToken')||sessionStorage.getItem('memoryViewerToken')||'';
const missedIds=new Set();
let transientNotice='';
function pageSize(){return matchMedia('(max-width:800px)').matches?6:12}
function notify(message){transientNotice=message;notice.textContent=message}
function setAuthUI(){
  const logged=Boolean(viewerToken);
  nameNode.hidden=logged;passNode.hidden=logged;
  loginButton.textContent=logged?'Đã đăng nhập ✓':'Đăng nhập';loginButton.disabled=logged;
  registerButton.hidden=logged;logoutButton.hidden=!logged;
  loginState.textContent=logged?'Bạn đã đăng nhập. Chọn ảnh để thử mở.':'Tự tạo tên và mật khẩu từ 8 ký tự; phiên được ghi nhớ trên thiết bị này.';
}
function sortedCards(){return [...cards].sort((a,b)=>
  (a.locked?2:missedIds.has(a.id)?1:0)-(b.locked?2:missedIds.has(b.id)?1:0))}
function render(){
  const list=sortedCards(),size=pageSize(),pages=Math.max(1,Math.ceil(list.length/size));
  page=Math.min(page,pages-1);cardsNode.replaceChildren();
  list.slice(page*size,(page+1)*size).forEach((item,index)=>{
    const button=document.createElement('button');button.type='button';
    button.className='card'+(item.locked?' locked':'');
    button.disabled=item.locked||!isOpen||remaining<=0||busy||!viewerToken;
    const image=document.createElement('img');image.src=item.preview;image.alt='Ảnh xem trước được làm mờ';image.loading='lazy';
    const title=document.createElement('strong');title.textContent='Mảnh '+String(cards.indexOf(item)+1).padStart(3,'0');
    const rate=document.createElement('span');rate.textContent=item.locked?'Đã xem · chờ admin reset':'Cơ hội '+item.rate+'%';
    button.append(image,title,rate);button.onclick=()=>openCard(item);cardsNode.append(button);
  });
  document.getElementById('pageLabel').textContent=(page+1)+' / '+pages;
  document.getElementById('prevPage').disabled=page===0;
  document.getElementById('nextPage').disabled=page>=pages-1;
  setAuthUI();
}
async function refresh(){
  try{
    const response=await fetch('/api/status',{headers:viewerToken?{'X-Viewer-Token':viewerToken}:{},cache:'no-store'});
    if(!response.ok)throw Error('Mất kết nối');
    const data=await response.json();cards=data.cards;remaining=data.remainingToday;isOpen=data.open;
    if(viewerToken&&!data.authenticated){viewerToken='';localStorage.removeItem('memoryViewerToken');sessionStorage.removeItem('memoryViewerToken');notify('Phiên đã hết hạn. Hãy đăng nhập lại.');}
    else if(viewerToken&&data.authenticated)localStorage.setItem('memoryViewerToken',viewerToken);
    document.getElementById('spentCount').textContent=data.spentCount+' / '+data.total+' đã mở';
    document.getElementById('remainingToday').textContent=remaining+' lượt hôm nay';
    if(!isOpen)notice.textContent='Đang tạm nghỉ. Mở lại lúc 07:00 giờ Việt Nam.';
    else if(remaining<=0)notice.textContent='Đã hết 300 lượt hôm nay. Lượt mới bắt đầu lúc 07:00.';
    else if(!transientNotice)notice.textContent=viewerToken?'Đã đăng nhập. Chọn ảnh để thử mở.':'Tạo tài khoản hoặc đăng nhập để chọn ảnh.';
    render();
  }catch(error){notice.textContent='Không kết nối được với máy chủ.'}
}
async function openCard(item){
  if(busy||item.locked||!isOpen||remaining<=0||!viewerToken)return;
  busy=true;render();notify('Đang thử mở mảnh ký ức...');
  try{
    const response=await fetch('/api/open',{method:'POST',headers:{'Content-Type':'application/json','X-Viewer-Token':viewerToken},body:JSON.stringify({id:item.id}),cache:'no-store'});
    if(!response.ok){const result=await response.json();
      if(result.error==='login_required'){viewerToken='';localStorage.removeItem('memoryViewerToken');notify('Phiên đã hết hạn. Hãy đăng nhập lại.');}
      else if(result.error==='spent')notify('Ảnh này đã được xem và bị khóa.');
      else notify('Hiện không thể mở ảnh này.');return;}
    if(response.headers.get('X-Memory-Opened')!=='yes'){
      await response.json();missedIds.add(item.id);notify('May mắn của bạn không đủ.');return;}
    const blob=await response.blob(),url=URL.createObjectURL(blob);
    const media=document.createElement(blob.type.startsWith('video/')?'video':'img');media.src=url;
    if(media.tagName==='VIDEO'){media.autoplay=true;media.muted=true;media.playsInline=true;media.loop=true}
    revealMedia.replaceChildren(media);caption.textContent='MẢNH KÝ ỨC · '+item.rate+'% · CHỈ MỘT LẦN';reveal.hidden=false;
    item.locked=true;render();
    await new Promise(resolve=>setTimeout(resolve,4000));
    reveal.hidden=true;media.pause?.();revealMedia.replaceChildren();URL.revokeObjectURL(url);
    transientNotice='';
  }catch(error){notify('Có lỗi kết nối. Hãy kiểm tra lại trạng thái.');}
  finally{busy=false;await refresh()}
}
async function login(register=false){
  const password=passNode.value,name=nameNode.value.trim();
  if(!password){notify('Hãy nhập mật khẩu của bạn.');passNode.focus();return}
  if(register&&(!name||password.length<8)){notify('Để tạo tài khoản, nhập tên và mật khẩu ít nhất 8 ký tự.');return}
  try{
    const response=await fetch(register?'/api/register':'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,password})});
    const result=await response.json();
    if(!response.ok){notify(result.error==='too_many_password_attempts'?'Nhập sai quá nhiều lần. Hãy đợi một giờ.':result.error==='name_taken'?'Tên này đã được dùng. Hãy đăng nhập hoặc chọn tên khác.':result.error==='invalid_credentials'?'Tên phải có 3–32 ký tự; mật khẩu ít nhất 8 ký tự.':'Tên hoặc mật khẩu không đúng.');return}
    viewerToken=result.token;localStorage.setItem('memoryViewerToken',viewerToken);sessionStorage.removeItem('memoryViewerToken');passNode.value='';
    notify(register?'Đã tạo tài khoản và đăng nhập.':'Đăng nhập thành công.');render();
  }catch(error){notify('Không kết nối được với máy chủ.')}
}
loginButton.onclick=()=>login(false);registerButton.onclick=()=>login(true);
logoutButton.onclick=async()=>{
  const token=viewerToken;viewerToken='';localStorage.removeItem('memoryViewerToken');sessionStorage.removeItem('memoryViewerToken');
  render();notify('Đã đăng xuất.');
  if(token)fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json','X-Viewer-Token':token},body:'{}'}).catch(()=>{});
};
passNode.addEventListener('keydown',event=>{if(event.key==='Enter')login(false)});
document.getElementById('prevPage').onclick=()=>{page--;render()};
document.getElementById('nextPage').onclick=()=>{page++;render()};
addEventListener('resize',render);refresh();setInterval(()=>{if(!busy)refresh()},30000);
