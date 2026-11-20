const cardsNode=document.getElementById('cards');
const notice=document.getElementById('gameNotice');
const reveal=document.getElementById('reveal');
const revealMedia=document.getElementById('revealMedia');
const caption=document.getElementById('revealCaption');
let cards=[],page=0,busy=false,remaining=0,visitorRemaining=0,isOpen=false;
const missedIds=new Set();
let transientNotice='';
function pageSize(){return matchMedia('(max-width:800px)').matches?6:12}
function notify(message){transientNotice=message;notice.textContent=message}
function sortedCards(){return [...cards].sort((a,b)=>
  (a.locked?2:missedIds.has(a.id)?1:0)-(b.locked?2:missedIds.has(b.id)?1:0))}
function render(){
  const list=sortedCards(),size=pageSize(),pages=Math.max(1,Math.ceil(list.length/size));
  page=Math.min(page,pages-1);cardsNode.replaceChildren();
  list.slice(page*size,(page+1)*size).forEach(item=>{
    const button=document.createElement('button');button.type='button';
    button.className='card'+(item.locked?' locked':'');
    button.disabled=item.locked||!isOpen||remaining<=0||visitorRemaining<=0||busy;
    const image=document.createElement('img');image.src=item.preview;image.alt='Ảnh xem trước được làm mờ';image.loading='lazy';
    const title=document.createElement('strong');title.textContent='Mảnh '+String(cards.indexOf(item)+1).padStart(3,'0');
    const rate=document.createElement('span');rate.textContent=item.locked?'Đã xem · chờ admin reset':'Cơ hội '+item.rate+'%';
    button.append(image,title,rate);button.onclick=()=>openCard(item);cardsNode.append(button);
  });
  document.getElementById('pageLabel').textContent=(page+1)+' / '+pages;
  document.getElementById('prevPage').disabled=page===0;
  document.getElementById('nextPage').disabled=page>=pages-1;
}
async function refresh(){
  try{
    const response=await fetch('/api/status',{cache:'no-store'});if(!response.ok)throw Error('Mất kết nối');
    const data=await response.json();cards=data.cards;remaining=data.remainingToday;
    visitorRemaining=data.remainingVisitor;isOpen=data.open;
    document.getElementById('spentCount').textContent=data.spentCount+' / '+data.total+' đã mở';
    document.getElementById('remainingToday').textContent=remaining+' lượt chung hôm nay';
    document.getElementById('visitorRemaining').textContent=visitorRemaining+' / 189 lượt còn lại';
    if(!isOpen)notice.textContent='Đang tạm nghỉ. Mở lại lúc 07:00 giờ Việt Nam.';
    else if(remaining<=0||visitorRemaining<=0)notice.textContent='Đã hết lượt hôm nay. Lượt mới bắt đầu lúc 07:00.';
    else if(!transientNotice)notice.textContent='Chọn một ảnh mờ để thử vận may.';
    render();
  }catch(error){notice.textContent='Không kết nối được với máy chủ.'}
}
async function openCard(item){
  if(busy||item.locked||!isOpen||remaining<=0||visitorRemaining<=0)return;
  busy=true;render();notify('Đang thử mở mảnh ký ức...');
  try{
    const response=await fetch('/api/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:item.id}),cache:'no-store'});
    if(!response.ok){const result=await response.json();
      if(result.error==='spent')notify('Ảnh này đã được xem và bị khóa.');
      else if(result.error==='limit')notify('Đã hết lượt mở khả dụng.');
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
document.getElementById('prevPage').onclick=()=>{page--;render()};
document.getElementById('nextPage').onclick=()=>{page++;render()};
addEventListener('resize',render);refresh();setInterval(()=>{if(!busy)refresh()},30000);
