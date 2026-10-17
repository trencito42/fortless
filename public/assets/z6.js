
/* ================= batch 6: communication, workspace, utilities ================= */
var Z_PPL=['Ana Vasile','Andrei Pop','Maria Ionescu','Sara Klein','Tom Hughes','Luca Bianchi'];
function zOpts(list,val){return list.map(function(o){o=[].concat(o);return '<option value="'+o[0]+'"'+(o[0]===val?' selected':'')+'>'+(o[1]||o[0])+'</option>'}).join('')}

function buildExtra6(){
  var out='';
  out+=S('comms','Communication','message-01',
    D('Multi-conversation inbox',5,'<div class="z-ci" data-zw="chat"><div class="z-cl" data-zlist></div><div class="z-ct"><div class="z-cth"><button class="btn sq s ghost z-back" data-zback aria-label="Back to conversations">'+I('arrow-left-01','s')+'</button><span data-zhav></span><div class="tx"><b data-zhn></b><small data-zhs></small></div><button class="btn sq s ghost" aria-label="More">'+I('more-horizontal','s')+'</button></div><div class="z-cm" data-zmsgs></div><form class="z-cf" data-zform><div class="inp pill"><input placeholder="Write a message" aria-label="Message" autocomplete="off"></div><button class="btn sq accent" aria-label="Send">'+I('sent')+'</button></form></div></div>',{col:1,wide:1})
   +D('Video call',5,'<div class="z-vc2" data-zw="call"></div>',{col:1,wide:1})
   +D('Share dialog with permissions',4,'<div class="z-doc" data-zw="share"><span class="ico-b accent l">'+I('file-01')+'</span><div class="tx"><b>Q4 roadmap</b><small>Edited 2 hours ago</small></div><span class="avs" data-zavs></span><button class="btn s" data-zopen>'+I('share-01','s')+'Share</button></div>',{col:1})
   +D('Comments with tasks & mentions',5,'<div class="z-cmt" data-zw="comments"><div class="z-cmh"><b style="flex:1;font:750 15px/1 var(--font)">Comments</b><span class="badge accent" data-zopenc></span></div><div class="col" data-zlist style="gap:12px"></div><div class="z-cmc"><div class="inp ta"><textarea rows="2" placeholder="Add a comment. Mention with @Name" style="min-height:56px" data-zta></textarea></div><div class="z-opts"><label class="chk"><input type="checkbox" data-ztask><span>Assign as task</span></label><div class="inp sel" data-zasg hidden><select data-zas>'+zOpts(Z_PPL,'Sara Klein')+'</select></div><span class="sp"></span><button class="btn s" data-zpost>Comment</button></div></div></div>',{col:1})
  );
  out+=S('workspace','Workspace layout','layout-01',
    D('Draggable widget dashboard',5,'<div class="z-wd" data-zw="widgets"><div class="z-bar"><b style="flex:1;font:750 15px/1 var(--font)">My dashboard</b><div class="row wrap" data-zadd style="gap:6px"></div><button class="btn s sec" data-zreset hidden>Reset</button><button class="btn s" data-zedit>'+I('edit-02','s')+'Customize</button></div><div class="z-wg" data-zgrid></div></div>',{col:1,wide:1})
   +D('Collapsible sidebar',4,'<div class="z-sb" data-zw="sidebar"><nav class="z-sbn" aria-label="Demo sidebar"><div class="z-top">'+petalLogo()+'<span>paun</span></div>'+[['home-01','Home',1],['analytics-01','Analytics'],['folder-01','Projects'],['user-group','Team'],['settings-01','Settings']].map(function(n){return '<a href="#components" data-l="'+n[1]+'" class="'+(n[2]?'on':'')+'" data-zn>'+I(n[0])+'<span>'+n[1]+'</span></a>'}).join('')+'<a href="#components" class="z-tg" data-l="Collapse" data-ztog>'+I('layout-left')+'<span>Collapse</span></a></nav><div class="z-sbm"><div class="skel" style="height:26px;width:40%"></div><div class="skel" style="height:90px"></div><div class="skel" style="height:90px;width:80%"></div></div></div>',{col:1,wide:1})
   +D('Multi-level split panes',4,'<div class="z-sp" data-zw="split"><div class="z-pn" data-def="30" style="flex:0 0 30%"><b>Explorer</b><small>Drag any handle. Double-click resets.</small><small>• src</small><small>• components</small><small>• pages</small></div><div class="z-hd h" role="separator" aria-orientation="vertical" aria-label="Resize explorer" tabindex="0"></div><div class="z-in" style="flex:1 1 0"><div class="z-pn" data-def="55" style="flex:0 0 55%"><b>Editor</b><small>Top pane</small></div><div class="z-hd v" role="separator" aria-orientation="horizontal" aria-label="Resize editor" tabindex="0"></div><div class="z-in" style="flex:1 1 0;flex-direction:row"><div class="z-pn" data-def="50" style="flex:0 0 50%"><b>Terminal</b></div><div class="z-hd h" role="separator" aria-orientation="vertical" aria-label="Resize terminal" tabindex="0"></div><div class="z-pn" style="flex:1 1 0"><b>Output</b></div></div></div></div>',{col:1,wide:1})
   +D('Contextual command bar',3,'<div class="z-cb" data-zw="cmdbar"><div data-zrows></div><div data-zbar></div></div>',{col:1})
  );
  var sk=function(w,h,r){return '<div class="skel" style="width:'+(w||'100%')+';height:'+h+'px;'+(r?'border-radius:'+r+';':'')+'"></div>'};
  out+=S('utils2','Utilities pro','refresh',
    D('Infinite scroll',3,'<div class="z-is" data-zw="infinite" tabindex="0" aria-label="Scrollable list"></div>',{col:1})
   +D('Pull to refresh',3,'<div class="z-ph2" data-zw="pull"><div class="z-ttl">Feed</div><div class="z-hdr"><div class="z-pull" data-zpull>'+I('arrow-down-01','s')+'</div></div><div class="z-scr" data-zscr><div class="z-body" data-zbody></div></div></div><div class="muted" style="font-size:12.5px;text-align:center;width:100%">Drag the feed down, or use the button.</div><button class="btn s sec" data-zrf style="align-self:center">'+I('refresh','s')+'Refresh</button>',{col:1})
   +D('Offline action queue',4,'<div class="z-of" data-zw="offline"><div class="z-ofb">'+I('wifi-01')+'<span class="sp" data-zst>Online</span><label class="sw s"><input type="checkbox" data-zsw aria-label="Offline mode"><span>Offline</span></label></div><div class="row wrap"><button class="btn s sec" data-za="Liked a post">'+I('heart','s')+'Like</button><button class="btn s sec" data-za="Saved draft">'+I('note-01','s')+'Save draft</button><button class="btn s sec" data-za="Sent message">'+I('sent','s')+'Send</button></div><div class="z-ofq" data-zq></div></div>',{col:1})
   +D('Skeletons per page type',6,'<div class="z-box" data-zw="skeleton"><div class="seg s z-wrapseg" data-zseg="sk">'+['Dashboard','List','Profile','Table','Article','Feed'].map(function(n,i){return '<label><input type="radio" name="zsk" value="'+n+'"'+(i===0?' checked':'')+'><span>'+n+'</span></label>'}).join('')+'</div><div data-zout class="z-skb"></div></div>',{col:1})
   +D('Error boundary with reporting',4,'<div class="z-eb" data-zw="boundary"><div class="row wrap"><button class="btn s sec" data-zbreak>'+I('bug-01','s')+'Break the widget</button></div><div class="z-ebx" data-zout></div></div>',{col:1})
  );
  return out;
}

function initExtra6(root){
  if(root.__e6)return;root.__e6=1;var R=root;
  function segv(h,n){var c=$('[data-zseg="'+n+'"] input:checked',h);return c?c.value:''}
  /* ---- chat inbox ---- */
  (function(){
    var host=$('[data-zw="chat"]',R);if(!host)return;
    var C=[{n:'Ana Vasile',on:1,u:2,t:'10:24',m:[[0,'Hey! Did you see the new designs?','10:20'],[0,'I pushed the updated hero.','10:21'],[1,'Looks great, shipping it today.','10:22'],[0,'Can you review the footer?','10:24']]},{n:'Design team',on:0,u:0,t:'Yesterday',m:[[0,'Sprint review at 3pm.','Yesterday'],[1,'I will be there.','Yesterday']]},{n:'Andrei Pop',on:1,u:1,t:'Mon',m:[[0,'Invoice is paid ✔','Mon']]},{n:'Sara Klein',on:0,u:0,t:'Sun',m:[[1,'Thanks for the files!','Sun'],[0,'Anytime.','Sun']]}];
    var cur=0,REP=['Sounds good!','Let me check and get back to you.','Perfect, thanks.','On it.'],ri=0;
    function lastMsg(c){var m=c.m[c.m.length-1];return (m[0]?'You: ':'')+m[1]}
    function list(){$('[data-zlist]',host).innerHTML=C.map(function(c,i){return '<button class="z-cv'+(i===cur?' on':'')+'" data-i="'+i+'">'+av(c.n,{st:c.on?'on':'off'})+'<span class="tx"><b>'+esc(c.n)+'<small>'+c.t+'</small></b><span>'+esc(lastMsg(c))+'</span></span>'+(c.u?'<span class="u">'+c.u+'</span>':'')+'</button>'}).join('')}
    function thread(){var c=C[cur];$('[data-zhav]',host).innerHTML=av(c.n,{s:'s'});$('[data-zhn]',host).textContent=c.n;$('[data-zhs]',host).textContent=c.on?'Online':'Last seen recently';
      var box=$('[data-zmsgs]',host);box.innerHTML=c.m.map(function(m){return '<div class="msg'+(m[0]?' me':'')+'">'+esc(m[1])+'<small>'+m[2]+'</small></div>'}).join('');box.scrollTop=box.scrollHeight}
    function sel(i){cur=i;C[i].u=0;list();thread();$('.z-ci',host.parentNode)}
    list();thread();
    host.addEventListener('click',function(e){var b=e.target.closest('.z-cv');if(b){sel(+b.dataset.i);host.classList.add('open')}if(e.target.closest('[data-zback]'))host.classList.remove('open')});
    $('[data-zform]',host).addEventListener('submit',function(e){e.preventDefault();var inp=$('input',e.target),v=inp.value.trim();if(!v)return;var c=C[cur];c.m.push([1,v,'now']);c.t='now';inp.value='';list();thread();
      var box=$('[data-zmsgs]',host),ty=document.createElement('div');ty.className='z-typing';ty.innerHTML='<span class="dots3"><i></i><i></i><i></i></span>';
      var idx=cur;setTimeout(function(){if(idx===cur){box.appendChild(ty);box.scrollTop=box.scrollHeight}},500);
      setTimeout(function(){ty.remove();C[idx].m.push([0,REP[ri++%REP.length],'now']);if(idx!==cur)C[idx].u++;list();if(idx===cur)thread()},1700)});
  })();
  /* ---- video call ---- */
  (function(){
    var host=$('[data-zw="call"]',R);if(!host)return;
    var P=[['You','#2f6bff'],['Ana Vasile','#6b4fbb'],['Andrei Pop','#1f8f5f'],['Sara Klein','#b9692b']];
    var st={joined:false,mic:true,cam:true,share:false,speaker:false,sp:1,t:0},iv=null,iv2=null;
    function draw(){
      if(!st.joined){host.innerHTML='<div class="z-vjoin"><div class="av l" style="--h:210;background:#2f6bff;color:#fff">PS</div><b style="font:750 18px/1.2 var(--font)">Weekly design sync</b><small style="color:rgba(255,255,255,.65)">3 people are in the call</small><button class="btn lime l" data-zjoin>'+I('video-01')+'Join call</button></div>';return}
      var m=(function(){var s=Math.floor(st.t/60),x=st.t%60;return s+':'+('0'+x).slice(-2)})();
      var tiles=P.map(function(p,i){var cam=i===0?st.cam:true,spk=i===st.sp&&!(i===0);return '<div class="z-vt'+(spk?' spk':'')+(i===st.sp?' big':'')+'" style="background:color-mix(in srgb,'+p[1]+' 24%,#1b2029)">'+(cam?'<span class="av" style="--h:'+hue(p[0])+';background:'+p[1]+'">'+ini(p[0])+'</span>':I('video-01','l').replace('class="ic l"','class="ic l" style="opacity:.4"'))+'<span class="nm">'+(i===0&&!st.mic?I('mic-off-01','xs'):'')+p[0]+(i===0&&st.share?' · presenting':'')+'</span></div>'}).join('');
      host.innerHTML='<div class="z-vg'+(st.speaker?' sp':'')+'">'+tiles+'</div><div class="z-vbar"><span class="z-tm">'+m+'</span><button class="z-vb2" data-zm="mic" aria-pressed="'+!st.mic+'" aria-label="'+(st.mic?'Mute':'Unmute')+'">'+I(st.mic?'mic-01':'mic-off-01')+'</button><button class="z-vb2" data-zm="cam" aria-pressed="'+!st.cam+'" aria-label="'+(st.cam?'Turn camera off':'Turn camera on')+'">'+I('video-01')+'</button><button class="z-vb2" data-zm="share" aria-pressed="'+st.share+'" aria-label="Share screen">'+I('monitor')+'</button><button class="z-vb2" data-zm="speaker" aria-pressed="'+st.speaker+'" aria-label="Speaker view">'+I('layout-grid')+'</button><button class="z-vb2 end" data-zend aria-label="Leave call">'+I('logout-01')+'</button></div>';
    }
    function tick(){if(!host.isConnected||!st.joined)return;st.t++;var tm=$('.z-tm',host);if(tm){var s=Math.floor(st.t/60),x=st.t%60;tm.textContent=s+':'+('0'+x).slice(-2)}}
    function speak(){if(!st.joined)return;var n=1+Math.floor(Math.random()*3);if(n!==st.sp){st.sp=n;if(!st.speaker){$$('.z-vt',host).forEach(function(t,i){t.classList.toggle('spk',i===n);t.classList.toggle('big',i===n)})}else draw()}}
    host.addEventListener('click',function(e){
      if(e.target.closest('[data-zjoin]')){st.joined=true;st.t=0;draw();toast('You joined the call','good');clearInterval(iv);clearInterval(iv2);iv=setInterval(tick,1000);iv2=setInterval(speak,2400)}
      else if(e.target.closest('[data-zend]')){st.joined=false;clearInterval(iv);clearInterval(iv2);draw();toast('You left the call')}
      else{var b=e.target.closest('[data-zm]');if(b){var k=b.dataset.zm;st[k]=!st[k];draw()}}
    });
    draw();
  })();
  /* ---- share dialog ---- */
  (function(){
    var host=$('[data-zw="share"]',R);if(!host)return;
    var people=[['Ana Vasile','ana@paun.uk','Owner'],['Andrei Pop','andrei@paun.uk','Can edit'],['Sara Klein','sara@example.com','Can comment']],link={on:true,role:'Can view'};
    $('[data-zavs]',host).innerHTML=people.map(function(p){return av(p[0],{s:'s'})}).join('');
    var mid='z-sharem'+(window.__zsh=(window.__zsh||0)+1),m=document.getElementById(mid);
    if(!m){m=document.createElement('div');m.id=mid;m.className='scrim';m.hidden=true;m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.setAttribute('aria-label','Share');document.body.appendChild(m);m.addEventListener('click',function(e){if(e.target===m)closeM(m);if(e.target.closest('[data-zdone]'))closeM(m);if(e.target.closest('[data-zinv]'))inv();if(e.target.closest('[data-zcl]')){try{navigator.clipboard.writeText('https://paun.uk/s/q4-roadmap')}catch(er){}toast('Link copied','good')}var rm=e.target.closest('[data-zrm]');if(rm){people.splice(+rm.dataset.zrm,1);body()}});
      m.addEventListener('change',function(e){var t=e.target;if(t.dataset.zp!==undefined){people[+t.dataset.zp][2]=t.value;if(t.value==='Remove'){people.splice(+t.dataset.zp,1);body();toast('Access removed')}}if(t.dataset.zlr!==undefined)link.role=t.value;if(t.dataset.zlon!==undefined){link.on=t.checked;body()}});
      m.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target.hasAttribute('data-zem')){e.preventDefault();inv()}})}
    var ROLES=['Can edit','Can comment','Can view'];
    function inv(){var i=$('[data-zem]',m),v=i.value.trim();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)){i.parentNode.classList.add('bad');i.focus();return}people.push([v.split('@')[0].replace(/\./g,' ').replace(/\b\w/g,function(c){return c.toUpperCase()}),v,'Can view']);body();toast('Invite sent to '+v,'good');setTimeout(function(){var n=$('[data-zem]',m);if(n)n.focus()},0)}
    function body(){
      var emv=$('[data-zem]',m)?$('[data-zem]',m).value:'';
      m.innerHTML='<div class="modal" style="width:min(540px,100%)"><div class="row"><h3 style="flex:1">Share “Q4 roadmap”</h3><button class="btn sq s ghost" data-zdone aria-label="Close">'+I('cancel-01','s')+'</button></div><div class="z-shr"><div class="row"><div class="inp" style="flex:1"><input data-zem type="email" placeholder="Add people by email" value="'+esc(emv)+'" autocomplete="off"></div><button class="btn" data-zinv>Invite</button></div><div class="col" style="gap:10px">'+people.map(function(p,i){return '<div class="z-p">'+av(p[0],{s:'s'})+'<div class="tx"><b>'+esc(p[0])+'</b><small>'+esc(p[1])+'</small></div>'+(p[2]==='Owner'?'<span class="muted" style="font-weight:650;font-size:13px;padding-right:12px">Owner</span>':'<div class="inp sel"><select data-zp="'+i+'">'+zOpts(ROLES.concat(['Remove']),p[2])+'</select></div>')+'</div>'}).join('')+'</div><div class="z-lk"><span class="ico-b '+(link.on?'accent':'')+'">'+I(link.on?'link-01':'lock')+'</span><div class="tx"><b>'+(link.on?'Anyone with the link':'Restricted')+'</b><small>'+(link.on?'Anyone on the internet can open':'Only people added above')+'</small></div>'+(link.on?'<div class="inp sel" style="min-height:34px;border-radius:11px;width:130px;background:var(--s1)"><select data-zlr>'+zOpts(ROLES,link.role)+'</select></div>':'')+'<label class="sw s"><input type="checkbox" data-zlon'+(link.on?' checked':'')+' aria-label="Link sharing"></label></div><div class="row" style="justify-content:space-between"><button class="btn s sec" data-zcl>'+I('link-01','s')+'Copy link</button><button class="btn" data-zdone>Done</button></div></div></div>';
    }
    $('[data-zopen]',host).addEventListener('click',function(){body();openM(mid)});
  })();
  /* ---- comments ---- */
  (function(){
    var host=$('[data-zw="comments"]',R);if(!host)return;
    var items=[{a:'Ana Vasile',t:'2h ago',x:'Hero looks great. @Sara can you export the new icons?',task:{who:'Sara Klein',done:false,txt:'Export the new icons'}},{a:'Sara Klein',t:'1h ago',x:'On it, thanks @Ana!',task:null},{a:'Tom Hughes',t:'20m ago',x:'Footer copy needs a final pass.',task:{who:'Tom Hughes',done:true,txt:'Final pass on footer copy'}}];
    var firsts=Z_PPL.map(function(p){return p.split(' ')[0]});
    function fmtx(t){return esc(t).replace(/@([A-Z][a-z]+)(?: ([A-Z][a-z]+))?/g,function(m,a,b){var full=Z_PPL.filter(function(p){return p.split(' ')[0]===a})[0];return full?'<span class="z-m">@'+full+'</span>'+(b&&full.split(' ')[1]!==b?' '+b:''):m})}
    function draw(){
      $('[data-zlist]',host).innerHTML=items.map(function(c,i){return '<div class="z-cmi">'+av(c.a,{s:'s'})+'<div class="tx"><div class="hd"><b>'+esc(c.a)+'</b><small>'+c.t+'</small></div><div class="bd">'+fmtx(c.x)+'</div>'+(c.task?'<label class="z-tk'+(c.task.done?' done':'')+'"><span class="chk"><input type="checkbox" data-zt="'+i+'"'+(c.task.done?' checked':'')+' aria-label="Mark task done"></span><span class="t">'+esc(c.task.txt)+'</span>'+av(c.task.who,{s:'xs'})+'</label>':'')+'</div></div>'}).join('');
      var o=items.filter(function(c){return c.task&&!c.task.done}).length;$('[data-zopenc]',host).textContent=o+' open task'+(o===1?'':'s')}
    draw();
    host.addEventListener('change',function(e){var t=e.target;if(t.dataset.zt!==undefined){items[+t.dataset.zt].task.done=t.checked;draw()}if(t.hasAttribute('data-ztask'))$('[data-zasg]',host).hidden=!t.checked});
    $('[data-zpost]',host).addEventListener('click',function(){var ta=$('[data-zta]',host),v=ta.value.trim();if(!v){ta.parentNode.classList.add('bad');ta.focus();return}ta.parentNode.classList.remove('bad');var tk=$('[data-ztask]',host).checked;items.push({a:'Păun Ștefan',t:'now',x:v,task:tk?{who:$('[data-zas]',host).value,done:false,txt:v.replace(/@[A-Z][a-z]+( [A-Z][a-z]+)?/g,'').trim().slice(0,60)||'Follow up'}:null});ta.value='';$('[data-ztask]',host).checked=false;$('[data-zasg]',host).hidden=true;draw();toast(tk?'Task assigned':'Comment posted','good')});
    host.addEventListener('input',function(e){if(e.target.hasAttribute('data-zta'))e.target.parentNode.classList.remove('bad')});
  })();
  /* ---- widget dashboard ---- */
  (function(){
    var host=$('[data-zw="widgets"]',R);if(!host)return;var grid=$('[data-zgrid]',host);
    var CAT={rev:['Revenue','chart-line-data-01',function(){return '<div class="z-wv">$48.2k</div><span class="delta up">+12.4%</span>'+spark(series(12,40,14,4,2),'var(--accent)')}],users:['Active users','user-group',function(){return '<div class="z-wv">12,840</div><span class="delta up">+3.1%</span>'+spark(series(12,30,10,8,1),'var(--good)')}],goal:['Quarterly goal','target-01',function(){return '<div class="row" style="gap:14px">'+ringEl(72,null,{c:'var(--violet)',sz:70})+'<div><b style="font-size:15px">72% reached</b><small class="muted" style="display:block">$36k of $50k</small></div></div>'}],tasks:['Today','task-01',function(){return ['Review pull request','Send invoice','Call with Ana'].map(function(t,i){return '<label class="chk" style="font-size:13.5px"><input type="checkbox"'+(i===0?' checked':'')+'><span>'+t+'</span></label>'}).join('')}],traffic:['Traffic','analytics-01',function(){return '<div class="bars" style="gap:8px">'+[['Direct',62],['Search',48],['Social',27]].map(function(b){return '<div class="bar" style="grid-template-columns:54px 1fr 34px;font-size:12px"><span>'+b[0]+'</span><div class="prog s"><i style="--v:'+b[1]+'%"></i></div><b>'+b[1]+'</b></div>'}).join('')+'</div>'}],activity:['Activity','activity-01',function(){return [['Ana','published Blipmade'],['Tom','closed 4 tasks'],['Sara','commented']].map(function(a){return '<div class="row" style="gap:8px;font-size:13px">'+av(a[0],{s:'xs'})+'<span><b>'+a[0]+'</b> '+a[1]+'</span></div>'}).join('')}]};
    var DEF=[{id:'rev',x:0},{id:'users',x:0},{id:'goal',x:0},{id:'traffic',x:1},{id:'tasks',x:0}],L=DEF.map(function(d){return {id:d.id,x:d.x}}),edit=false;
    function wEl(w){var c=CAT[w.id],el=document.createElement('div');el.className='z-w'+(w.x?' x2':'');el.dataset.id=w.id;el.innerHTML='<div class="z-wh">'+I(c[1],'s')+c[0]+'<div class="z-wt"><button class="z-dg" aria-label="Drag '+c[0]+'">'+I('move','xs')+'</button><button data-zsz aria-label="Resize">'+I(w.x?'arrow-shrink':'arrow-expand','xs')+'</button><button data-zrm aria-label="Remove">'+I('cancel-01','xs')+'</button></div></div>'+c[2]();return el}
    function render(){grid.innerHTML='';L.forEach(function(w){grid.appendChild(wEl(w))});adds();$('[data-zreset]',host).hidden=!edit}
    function adds(){var have=L.map(function(w){return w.id}),rest=Object.keys(CAT).filter(function(k){return have.indexOf(k)<0});$('[data-zadd]',host).innerHTML=edit?rest.map(function(k){return '<button class="btn xs tint" data-zaddw="'+k+'">'+I('add-01','xs')+CAT[k][0]+'</button>'}).join(''):''}
    render();
    host.addEventListener('click',function(e){
      if(e.target.closest('[data-zedit]')){edit=!edit;host.classList.toggle('edit',edit);var b=$('[data-zedit]',host);b.innerHTML=edit?I('tick-02','s')+'Done':I('edit-02','s')+'Customize';b.classList.toggle('accent',edit);adds();$('[data-zreset]',host).hidden=!edit;return}
      if(e.target.closest('[data-zreset]')){L=DEF.map(function(d){return {id:d.id,x:d.x}});render();return}
      var a=e.target.closest('[data-zaddw]');if(a){L.push({id:a.dataset.zaddw,x:0});render();return}
      var sz=e.target.closest('[data-zsz]');if(sz){var id=sz.closest('.z-w').dataset.id,w=L.filter(function(x){return x.id===id})[0];w.x=w.x?0:1;render();return}
      var rm=e.target.closest('[data-zrm]');if(rm){var id2=rm.closest('.z-w').dataset.id;L=L.filter(function(x){return x.id!==id2});render()}
    });
    function flip(fn){var els=$$('.z-w',grid),first={};els.forEach(function(e){first[e.dataset.id]=e.getBoundingClientRect()});fn();$$('.z-w',grid).forEach(function(e){var f=first[e.dataset.id],l=e.getBoundingClientRect();if(!f)return;var dx=f.left-l.left,dy=f.top-l.top;if(!dx&&!dy)return;e.style.transition='none';e.style.transform='translate('+dx+'px,'+dy+'px)';requestAnimationFrame(function(){e.style.transition='transform .25s var(--ease)';e.style.transform=''})})}
    grid.addEventListener('pointerdown',function(e){
      var h=e.target.closest('.z-dg');if(!h||!edit)return;e.preventDefault();
      var el=h.closest('.z-w'),r=el.getBoundingClientRect(),ox=e.clientX-r.left,oy=e.clientY-r.top,fly=el.cloneNode(true);
      fly.classList.add('z-fly');fly.style.width=r.width+'px';fly.style.height=r.height+'px';fly.style.left=r.left+'px';fly.style.top=r.top+'px';document.body.appendChild(fly);el.classList.add('z-ph0');
      var mv=function(ev){fly.style.left=(ev.clientX-ox)+'px';fly.style.top=(ev.clientY-oy)+'px';
        var t=document.elementFromPoint(ev.clientX,ev.clientY),w=t&&t.closest('.z-w');if(!w||w===el||!grid.contains(w))return;
        var wr=w.getBoundingClientRect(),after=ev.clientX>wr.left+wr.width/2&&el.getBoundingClientRect().top===wr.top||ev.clientY>wr.top+wr.height/2&&el.getBoundingClientRect().top<wr.top;
        flip(function(){if(after)w.after(el);else w.before(el)})};
      var up=function(){document.removeEventListener('pointermove',mv);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',up);fly.remove();el.classList.remove('z-ph0');
        var order=$$('.z-w',grid).map(function(x){return x.dataset.id});L.sort(function(a,b){return order.indexOf(a.id)-order.indexOf(b.id)})};
      document.addEventListener('pointermove',mv);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',up);
    });
  })();
  /* ---- collapsible sidebar ---- */
  (function(){
    var host=$('[data-zw="sidebar"]',R);if(!host)return;
    host.addEventListener('click',function(e){var a=e.target.closest('a');if(!a)return;e.preventDefault();
      if(a.hasAttribute('data-ztog')){host.classList.toggle('c');var c=host.classList.contains('c');a.dataset.l=c?'Expand':'Collapse';$('span',a).textContent=c?'Expand':'Collapse';return}
      $$('[data-zn]',host).forEach(function(x){x.classList.toggle('on',x===a)})});
  })();
  /* ---- split panes ---- */
  (function(){
    var host=$('[data-zw="split"]',R);if(!host)return;
    $$('.z-hd',host).forEach(function(h){
      var A=h.previousElementSibling,hor=h.classList.contains('h');
      A.style[hor?'maxWidth':'maxHeight']='calc(100% - 92px)';A.style[hor?'minWidth':'minHeight']='80px';
      function size(){return A.getBoundingClientRect()[hor?'width':'height']}
      function set(px){A.style.flex='0 0 '+Math.max(80,px)+'px'}
      h.addEventListener('pointerdown',function(e){e.preventDefault();h.classList.add('on');h.setPointerCapture(e.pointerId);var s0=size(),p0=hor?e.clientX:e.clientY;
        var mv=function(ev){set(s0+(hor?ev.clientX:ev.clientY)-p0)};var up=function(){h.classList.remove('on');h.removeEventListener('pointermove',mv);h.removeEventListener('pointerup',up);h.removeEventListener('pointercancel',up)};
        h.addEventListener('pointermove',mv);h.addEventListener('pointerup',up);h.addEventListener('pointercancel',up)});
      h.addEventListener('dblclick',function(){A.style.flex='0 0 '+A.dataset.def+'%'});
      h.addEventListener('keydown',function(e){var k=hor?{ArrowLeft:-24,ArrowRight:24}:{ArrowUp:-24,ArrowDown:24};if(k[e.key]){e.preventDefault();set(size()+k[e.key])}});
    });
  })();
  /* ---- command bar ---- */
  (function(){
    var host=$('[data-zw="cmdbar"]',R);if(!host)return;
    var rows=[['Q4 roadmap','Doc · edited 2h ago','file-01'],['Brand guidelines','PDF · 4.2 MB','files-01'],['Hero v3','Design · edited yesterday','image-01'],['Invoice INV-1042','Billing · paid','receipt'],['Meeting notes','Doc · edited Monday','note-01']],selS={};
    function draw(){
      $('[data-zrows]',host).innerHTML=rows.map(function(r,i){return '<label class="z-row'+(selS[i]?' sel':'')+'"><span class="chk"><input type="checkbox" data-i="'+i+'"'+(selS[i]?' checked':'')+' aria-label="Select '+r[0]+'"></span><span class="ico-b">'+I(r[2])+'</span><span class="tx"><b>'+r[0]+'</b><small>'+r[1]+'</small></span></label>'}).join('');
      var n=Object.keys(selS).filter(function(k){return selS[k]}).length,bar=$('[data-zbar]',host);
      var key=n?'sel':'def';if(bar.dataset.k!==key||n){bar.dataset.k=key;bar.innerHTML=n?'<div class="z-bar2"><span class="cn">'+n+' selected</span><span class="sp"></span><button class="btn" data-zact="Archived">'+I('archive-01','s')+'Archive</button><button class="btn" data-zact="Moved">'+I('folder-01','s')+'Move</button><button class="btn bad" data-zdel>'+I('delete-02','s')+'Delete</button><button class="btn sq" style="width:34px;padding:0" data-zclr aria-label="Clear selection">'+I('cancel-01','xs')+'</button></div>':'<div class="z-bar2"><button class="btn" data-zact="New item">'+I('add-01','s')+'New</button><button class="btn" data-zact="Search">'+I('search-01','s')+'Search</button><button class="btn" data-zact="Filters">'+I('filter-horizontal','s')+'Filter</button></div>'}
      host.style.paddingBottom='70px';
    }
    host.addEventListener('change',function(e){var i=e.target.dataset.i;if(i!==undefined){selS[i]=e.target.checked;draw()}});
    host.addEventListener('click',function(e){var a=e.target.closest('[data-zact]');if(a){var n=Object.keys(selS).filter(function(k){return selS[k]}),t=a.dataset.zact;if(n.length){rows=rows.filter(function(_,i){return !selS[i]});selS={};toast(n.length+' item'+(n.length>1?'s':'')+' '+t.toLowerCase(),'good')}else toast(t)}
      if(e.target.closest('[data-zdel]')){var c=Object.keys(selS).filter(function(k){return selS[k]}).length;rows=rows.filter(function(_,i){return !selS[i]});selS={};toast(c+' deleted','bad')}
      if(e.target.closest('[data-zclr]'))selS={};
      if(a||e.target.closest('[data-zdel],[data-zclr]'))draw();
      if(!rows.length){$('[data-zrows]',host).innerHTML='<div class="empty"><span class="ico-b">'+I('folder-open')+'</span><h4>All clear</h4><p>Nothing left here.</p><button class="btn s tint" data-zrestore>Restore items</button></div>'}
      if(e.target.closest('[data-zrestore]')){rows=[['Q4 roadmap','Doc · edited 2h ago','file-01'],['Brand guidelines','PDF · 4.2 MB','files-01'],['Hero v3','Design · edited yesterday','image-01']];draw()}});
    draw();
  })();
  /* ---- infinite scroll ---- */
  (function(){
    var host=$('[data-zw="infinite"]',R);if(!host)return;var n=0,loading=false,MAX=60;
    var T=['Release notes','Weekly digest','New comment','Invoice paid','Mention in #design','Deploy finished'];
    function item(i){return '<div class="z-it">'+av(Z_PPL[i%6],{s:'s'})+'<div class="tx"><b>'+T[i%6]+' #'+(i+1)+'</b><small>'+Z_PPL[i%6]+' · '+((i%9)+1)+'h ago</small></div></div>'}
    function more(){if(loading||n>=MAX)return;loading=true;var ld=document.createElement('div');ld.className='z-ld';ld.innerHTML='<span class="spin"></span>Loading more…';host.appendChild(ld);
      setTimeout(function(){ld.remove();var h='';for(var i=0;i<15&&n<MAX;i++,n++)h+=item(n);host.insertAdjacentHTML('beforeend',h);loading=false;if(n>=MAX)host.insertAdjacentHTML('beforeend','<div class="z-ld">You are all caught up</div>');else if(host.scrollHeight<=host.clientHeight+10)more()},650)}
    host.addEventListener('scroll',function(){if(host.scrollTop+host.clientHeight>=host.scrollHeight-60)more()},{passive:true});
    var h0='';for(;n<15;n++)h0+=item(n);host.innerHTML=h0;
  })();
  /* ---- pull to refresh ---- */
  (function(){
    var host=$('[data-zw="pull"]',R);if(!host)return;
    var scr=$('[data-zscr]',host),body=$('[data-zbody]',host),pull=$('[data-zpull]',host),n=0,busy=false;
    var N=['New follower','Comment on your post','Deploy succeeded','Weekly report','Invoice paid','Mention in #general'];
    function item(i,cls){return '<div class="z-it'+(cls?' '+cls:'')+'">'+av(Z_PPL[i%6],{s:'s'})+'<div class="tx"><b>'+N[i%6]+'</b><small>'+Z_PPL[i%6]+' · just now</small></div></div>'}
    var h='';for(;n<9;n++)h+=item(n);body.innerHTML=h;
    function refresh(){if(busy)return;busy=true;body.style.transform='translateY(56px)';pull.style.opacity=1;pull.style.transform='translateY(18px)';pull.innerHTML='<span class="spin"></span>';
      setTimeout(function(){body.insertAdjacentHTML('afterbegin',item(Math.floor(Math.random()*6)+n++,'new'));body.style.transform='';pull.style.opacity=0;pull.style.transform='';pull.innerHTML=I('arrow-down-01','s');busy=false;toast('Feed updated','good')},1100)}
    $('[data-zrf]',host.parentNode).addEventListener('click',function(){scr.scrollTop=0;refresh()});
    var y0=null,dy=0;
    function start(y){if(busy||scr.scrollTop>0)return;y0=y;dy=0}
    function move(y,ev){if(y0==null)return;dy=y-y0;if(dy<=0){return}if(ev&&ev.cancelable)ev.preventDefault();body.classList.add('d');var t=Math.min(100,dy*.5);body.style.transform='translateY('+t+'px)';pull.style.opacity=Math.min(1,t/40);pull.style.transform='translateY('+(t*.6)+'px)';pull.firstChild.style&&(pull.firstChild.style.transform=t>=50?'rotate(180deg)':'')}
    function end(){if(y0==null)return;body.classList.remove('d');var go=dy*.5>=50;y0=null;if(go)refresh();else{body.style.transform='';pull.style.opacity=0;pull.style.transform=''}}
    scr.addEventListener('touchstart',function(e){start(e.touches[0].clientY)},{passive:true});
    scr.addEventListener('touchmove',function(e){move(e.touches[0].clientY,e)},{passive:false});
    scr.addEventListener('touchend',end);scr.addEventListener('touchcancel',end);
    scr.addEventListener('mousedown',function(e){start(e.clientY);var mm=function(ev){move(ev.clientY,ev)},mu=function(){document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);end()};document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu)});
  })();
  /* ---- offline queue ---- */
  (function(){
    var host=$('[data-zw="offline"]',R);if(!host)return;var q=[],off=false,syncing=false,id=0;
    function draw(){host.classList.toggle('off',off);$('[data-zst]',host).innerHTML=off?'Offline · changes are saved locally':(syncing?'Syncing…':'Online');
      $('[data-zq]',host).innerHTML=q.map(function(a){return '<div class="z-ofi"><span class="ico-b '+(a.s==='done'?'good':a.s==='sync'?'accent':'warn')+'" style="width:30px;height:30px;border-radius:10px">'+(a.s==='sync'?'<span class="spin" style="width:14px;height:14px"></span>':I(a.s==='done'?'tick-02':'clock-01','xs'))+'</span><span class="tx">'+a.t+'<small>'+(a.s==='done'?'Synced':a.s==='sync'?'Syncing…':'Waiting for connection')+'</small></span></div>'}).join('')||(off?'<div class="muted" style="text-align:center;padding:10px;font-size:13px">Try an action while offline</div>':'')}
    function flush(){if(syncing||off)return;var p=q.filter(function(a){return a.s==='wait'});if(!p.length)return;syncing=true;var i=0;(function next(){if(off){syncing=false;p.forEach(function(a){if(a.s==='sync')a.s='wait'});draw();return}if(i>=p.length){syncing=false;draw();toast('All changes synced','good');setTimeout(function(){q=q.filter(function(a){return a.s!=='done'});draw()},1400);return}var a=p[i++];a.s='sync';draw();setTimeout(function(){a.s='done';draw();next()},650)})()}
    host.addEventListener('change',function(e){if(e.target.hasAttribute('data-zsw')){off=e.target.checked;draw();if(!off)flush()}});
    host.addEventListener('click',function(e){var b=e.target.closest('[data-za]');if(!b)return;if(off){q.push({id:++id,t:b.dataset.za,s:'wait'});draw()}else toast(b.dataset.za,'good')});
    draw();
  })();
  /* ---- skeletons ---- */
  (function(){
    var host=$('[data-zw="skeleton"]',R);if(!host)return;
    var s=function(w,h,r){return '<div class="skel" style="width:'+(w||'100%')+';height:'+h+'px;'+(r?'border-radius:'+r+';':'')+'"></div>'};
    var V={Dashboard:function(){return '<div class="g" style="grid-template-columns:repeat(3,1fr)">'+[0,1,2].map(function(){return '<div class="c" style="background:var(--s2);padding:12px;border-radius:16px">'+s('50%',10)+s('70%',22)+'</div>'}).join('')+'</div>'+s('100%',120,'16px')},List:function(){return [0,1,2,3].map(function(){return '<div class="r">'+s('40px',40,'50%')+'<div class="c">'+s('60%',12)+s('85%',10)+'</div></div>'}).join('')},Profile:function(){return s('100%',60,'16px')+'<div class="r" style="margin-top:-30px;padding:0 14px">'+s('64px',64,'50%')+'<div class="c" style="padding-top:30px">'+s('45%',14)+s('30%',10)+'</div></div>'+s('90%',10)+s('70%',10)+'<div class="g" style="grid-template-columns:repeat(3,1fr)">'+s('100%',70,'14px')+s('100%',70,'14px')+s('100%',70,'14px')+'</div>'},Table:function(){return s('100%',30,'10px')+[0,1,2,3,4].map(function(){return '<div class="r">'+s('25%',12)+s('30%',12)+s('15%',12)+s('15%',12)+'</div>'}).join('')},Article:function(){return s('70%',22)+'<div class="r">'+s('28px',28,'50%')+s('30%',10)+'</div>'+s('100%',130,'16px')+s('100%',10)+s('96%',10)+s('88%',10)+s('60%',10)},Feed:function(){return [0,1].map(function(){return '<div class="c" style="background:var(--s2);padding:12px;border-radius:16px;gap:10px"><div class="r">'+s('34px',34,'50%')+'<div class="c">'+s('40%',11)+s('25%',9)+'</div></div>'+s('100%',70,'12px')+s('80%',10)+'</div>'}).join('')}};
    function draw(){$('[data-zout]',host).innerHTML=V[segv(host,'sk')]()}
    host.addEventListener('change',draw);draw();
  })();
  /* ---- error boundary ---- */
  (function(){
    var host=$('[data-zw="boundary"]',R);if(!host)return;var out=$('[data-zout]',host),broken=false,reporting=false;
    function Healthy(){return '<div class="row" style="gap:12px"><span class="ico-b good">'+I('chart-line-data-01')+'</span><div><b>Revenue widget</b><small class="muted" style="display:block">Rendering normally</small></div><span class="sp"></span><span class="badge good">Healthy</span></div>'+spark(series(14,40,16,5,2),'var(--good)')}
    function Broken(){var u;return u.items.map(function(x){return x})}
    function render(){
      try{out.innerHTML=broken?Broken():Healthy()}catch(err){
        var id='ERR-'+zB32(5);out.innerHTML='<div class="z-fb"><div class="row" style="gap:10px;align-items:flex-start"><span class="ico-b bad">'+I('alert-circle')+'</span><div><h4>Something went wrong in this widget</h4><p>The rest of the page still works. You can retry or send us a report.</p></div></div><details><summary class="link" style="cursor:pointer">Technical details</summary><code class="code" style="margin-top:8px">'+esc(err.name+': '+err.message)+'\n    at Broken (widget.js:12:20)\n    at render (boundary.js:34:9)</code></details>'+(reporting?'<div class="col" style="gap:8px"><div class="inp ta" style="background:var(--s1)"><textarea rows="2" placeholder="What were you doing? (optional)" style="min-height:56px" data-zdesc></textarea></div><div class="row" style="justify-content:flex-end"><button class="btn s ghost" data-zcx>Cancel</button><button class="btn s" data-zsend="'+id+'">Send report</button></div></div>':'<div class="row"><button class="btn s" data-ztry>'+I('refresh','s')+'Try again</button><button class="btn s sec" data-zrep>'+I('bug-01','s')+'Report problem</button></div>')+'</div>'}
    }
    render();
    host.addEventListener('click',function(e){
      if(e.target.closest('[data-zbreak]')){broken=true;reporting=false;render();return}
      if(e.target.closest('[data-ztry]')){broken=false;reporting=false;render();toast('Widget recovered','good');return}
      if(e.target.closest('[data-zrep]')){reporting=true;render();return}
      if(e.target.closest('[data-zcx]')){reporting=false;render();return}
      var s=e.target.closest('[data-zsend]');if(s){reporting=false;broken=true;render();toast('Report '+s.dataset.zsend+' sent. Thank you!','good')}
    });
  })();
}
