const keyNode=document.getElementById('adminKey'),message=document.getElementById('message');
async function loadLog(){
  const response=await fetch('/api/admin/log',{headers:{'X-Admin-Key':keyNode.value},cache:'no-store'});
  if(!response.ok)throw Error('Mật khẩu admin không đúng.');
  const data=await response.json();const rows=document.getElementById('logRows');rows.replaceChildren();
  for(const entry of data.entries){const tr=document.createElement('tr');for(const value of [entry.at,entry.ip,entry.method,entry.path,entry.outcome]){const td=document.createElement('td');td.textContent=value;tr.append(td)}rows.append(tr)}
  document.getElementById('controls').hidden=false;document.getElementById('logSection').hidden=false;
  message.textContent='Đã tải '+data.entries.length+' dòng nhật ký gần nhất.';
}
document.getElementById('connect').onclick=async()=>{try{await loadLog()}catch(error){message.textContent=error.message}};
document.getElementById('reset').onclick=async()=>{
  if(!confirm('Mở khóa lại toàn bộ ảnh và đặt lại lượt?'))return;
  const response=await fetch('/api/admin/reset',{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Key':keyNode.value},body:'{}'});
  message.textContent=response.ok?'Đã reset toàn bộ ảnh và lượt.':'Không thể reset.';
  if(response.ok)await loadLog();
};
