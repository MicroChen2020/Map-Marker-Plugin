const status=document.getElementById('status');
document.getElementById('open').onclick=()=>chrome.tabs.create({url:'https://www.amap.com/'});
document.getElementById('toggle').onclick=async()=>{try{const[tab]=await chrome.tabs.query({active:true,currentWindow:true});await chrome.tabs.sendMessage(tab.id,{type:'notes-toggle'});window.close();}catch{status.textContent='请先打开或刷新高德地图网页。';}};
document.getElementById('capture').onclick=async e=>{e.target.disabled=true;status.textContent='正在生成图片…';try{const r=await chrome.runtime.sendMessage({type:'capture'});if(r.error)throw Error(r.error);const a=document.createElement('a');a.href=r.data;a.download=`区位图-${new Date().toISOString().slice(0,10)}.png`;a.click();status.textContent='图片已生成。';}catch(err){status.textContent=err.message;}finally{e.target.disabled=false;}};

document.getElementById('manager').onclick=async()=>{try{const r=await chrome.runtime.sendMessage({type:'open-manager'});if(r?.error)throw Error(r.error);window.close();}catch(e){status.textContent=e.message;}};
