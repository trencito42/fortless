
/* ================= batch 5: charts pro, onboarding, account ================= */
/* ---- QR encoder (byte mode, ported from the public-domain algorithm by Nayuki) ---- */
var ZQR=(function(){
  var ECC=[[-1,7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],[-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],[-1,13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],[-1,17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30]];
  var BLK=[[-1,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],[-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],[-1,1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],[-1,1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81]];
  var FMT=[1,0,3,2];
  function raw(v){var r=(16*v+128)*v+64;if(v>=2){var n=Math.floor(v/7)+2;r-=(25*n-10)*n-55;if(v>=7)r-=36}return r}
  function cap(v,e){return Math.floor(raw(v)/8)-ECC[e][v]*BLK[e][v]}
  function mul(x,y){var z=0;for(var i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x}return z}
  function div(d){var r=[];for(var i=0;i<d-1;i++)r.push(0);r.push(1);var root=1;for(var i2=0;i2<d;i2++){for(var j=0;j<r.length;j++){r[j]=mul(r[j],root);if(j+1<r.length)r[j]^=r[j+1]}root=mul(root,2)}return r}
  function rem(data,dv){var r=dv.map(function(){return 0});data.forEach(function(b){var f=b^r.shift();r.push(0);dv.forEach(function(c,i){r[i]^=mul(c,f)})});return r}
  function bit(x,i){return ((x>>>i)&1)!==0}
  function make(text,eccl){
    var bytes=unescape(encodeURIComponent(text)).split('').map(function(c){return c.charCodeAt(0)});
    var e=eccl==null?1:eccl,v,bits;
    for(v=1;v<=40;v++){var cc=v<10?8:16;if(4+cc+bytes.length*8<=cap(v,e)*8)break}
    if(v>40)throw new Error('too long');
    bits=[];function put(val,len){for(var i=len-1;i>=0;i--)bits.push((val>>>i)&1)}
    put(4,4);put(bytes.length,v<10?8:16);bytes.forEach(function(b){put(b,8)});
    var capb=cap(v,e)*8;put(0,Math.min(4,capb-bits.length));put(0,(8-bits.length%8)%8);
    for(var pad=0xEC;bits.length<capb;pad^=0xEC^0x11)put(pad,8);
    var data=[];for(var i=0;i<bits.length;i+=8){var b=0;for(var k=0;k<8;k++)b=(b<<1)|bits[i+k];data.push(b)}
    /* ecc + interleave */
    var nb=BLK[e][v],bl=ECC[e][v],rw=Math.floor(raw(v)/8),ns=nb-rw%nb,sl=Math.floor(rw/nb),blocks=[],dv=div(bl),kk=0;
    for(var q=0;q<nb;q++){var dl=sl-bl+(q<ns?0:1),dat=data.slice(kk,kk+dl);kk+=dl;var ec=rem(dat,dv);if(q<ns)dat.push(0);blocks.push(dat.concat(ec))}
    var all=[];for(var x=0;x<blocks[0].length;x++)blocks.forEach(function(b,j){if(x!==sl-bl||j>=ns)all.push(b[x])});
    /* matrix */
    var size=v*4+17,M=[],F=[];for(var y=0;y<size;y++){M.push(new Array(size).fill(false));F.push(new Array(size).fill(false))}
    function sf(x,y,d){M[y][x]=d;F[y][x]=true}
    for(var t=0;t<size;t++){sf(6,t,t%2===0);sf(t,6,t%2===0)}
    function finder(cx,cy){for(var dy=-4;dy<=4;dy++)for(var dx=-4;dx<=4;dx++){var dist=Math.max(Math.abs(dx),Math.abs(dy)),xx=cx+dx,yy=cy+dy;if(xx>=0&&xx<size&&yy>=0&&yy<size)sf(xx,yy,dist!==2&&dist!==4)}}
    finder(3,3);finder(size-4,3);finder(3,size-4);
    var pos=[];if(v>1){var na=Math.floor(v/7)+2,step=v===32?26:Math.ceil((v*4+4)/(na*2-2))*2;pos=[6];for(var p=size-7;pos.length<na;p-=step)pos.splice(1,0,p)}
    pos.forEach(function(a,i){pos.forEach(function(b,j){if((i===0&&j===0)||(i===0&&j===pos.length-1)||(i===pos.length-1&&j===0))return;for(var dy=-2;dy<=2;dy++)for(var dx=-2;dx<=2;dx++)sf(a+dx,b+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1)})});
    function fmtBits(mask){var d=(FMT[e]<<3)|mask,r=d;for(var i=0;i<10;i++)r=(r<<1)^((r>>>9)*0x537);var b=((d<<10)|r)^0x5412;
      for(var i2=0;i2<=5;i2++)sf(8,i2,bit(b,i2));sf(8,7,bit(b,6));sf(8,8,bit(b,7));sf(7,8,bit(b,8));for(var i3=9;i3<15;i3++)sf(14-i3,8,bit(b,i3));
      for(var i4=0;i4<8;i4++)sf(size-1-i4,8,bit(b,i4));for(var i5=8;i5<15;i5++)sf(8,size-15+i5,bit(b,i5));sf(8,size-8,true)}
    fmtBits(0);
    if(v>=7){var r2=v;for(var i6=0;i6<12;i6++)r2=(r2<<1)^((r2>>>11)*0x1F25);var vb=(v<<12)|r2;for(var i7=0;i7<18;i7++){var c=bit(vb,i7),a=size-11+i7%3,b2=Math.floor(i7/3);sf(a,b2,c);sf(b2,a,c)}}
    var bi=0;for(var right=size-1;right>=1;right-=2){if(right===6)right=5;for(var vert=0;vert<size;vert++)for(var j2=0;j2<2;j2++){var x2=right-j2,up=((right+1)&2)===0,y2=up?size-1-vert:vert;if(!F[y2][x2]&&bi<all.length*8){M[y2][x2]=bit(all[bi>>>3],7-(bi&7));bi++}}}
    function mask(m){for(var y=0;y<size;y++)for(var x=0;x<size;x++){var inv;switch(m){case 0:inv=(x+y)%2===0;break;case 1:inv=y%2===0;break;case 2:inv=x%3===0;break;case 3:inv=(x+y)%3===0;break;case 4:inv=(Math.floor(x/3)+Math.floor(y/2))%2===0;break;case 5:inv=x*y%2+x*y%3===0;break;case 6:inv=(x*y%2+x*y%3)%2===0;break;default:inv=((x+y)%2+x*y%3)%2===0}if(!F[y][x]&&inv)M[y][x]=!M[y][x]}}
    function pen(){var s=0,y,x;for(y=0;y<size;y++){var run=1;for(x=1;x<size;x++){if(M[y][x]===M[y][x-1]){run++;if(run===5)s+=3;else if(run>5)s++}else run=1}}
      for(x=0;x<size;x++){var r3=1;for(y=1;y<size;y++){if(M[y][x]===M[y-1][x]){r3++;if(r3===5)s+=3;else if(r3>5)s++}else r3=1}}
      for(y=0;y<size-1;y++)for(x=0;x<size-1;x++){var cl=M[y][x];if(cl===M[y][x+1]&&cl===M[y+1][x]&&cl===M[y+1][x+1])s+=3}
      var dark=0;M.forEach(function(r){r.forEach(function(c){if(c)dark++})});s+=Math.floor(Math.abs(dark*20-size*size*10)/(size*size))*10;return s}
    var best=0,bp=1e9;for(var m=0;m<8;m++){mask(m);fmtBits(m);var pp=pen();if(pp<bp){bp=pp;best=m}mask(m)}
    mask(best);fmtBits(best);return {size:size,m:M,v:v};
  }
  function svg(text,opt){opt=opt||{};var q=make(text,1),b=4,s=q.size+b*2,d='';for(var y=0;y<q.size;y++){var x=0;while(x<q.size){if(q.m[y][x]){var x0=x;while(x<q.size&&q.m[y][x])x++;d+='M'+(x0+b)+' '+(y+b)+'h'+(x-x0)+'v1h-'+(x-x0)+'z'}else x++}}
    return '<svg viewBox="0 0 '+s+' '+s+'" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="'+s+'" height="'+s+'" fill="#fff"/><path d="'+d+'" fill="#0b1a2b"/></svg>'}
  return {make:make,svg:svg};
})();

/* ---- TOTP ---- */
function zB32(n){var A='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',a=new Uint8Array(n),s='';(window.crypto||{getRandomValues:function(x){for(var i=0;i<x.length;i++)x[i]=Math.random()*256}}).getRandomValues(a);for(var i=0;i<n;i++)s+=A[a[i]%32];return s}
function zB32d(s){var A='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits='',out=[];s.replace(/=+$/,'').toUpperCase().split('').forEach(function(c){var i=A.indexOf(c);if(i>-1)bits+=('00000'+i.toString(2)).slice(-5)});for(var i=0;i+8<=bits.length;i+=8)out.push(parseInt(bits.slice(i,i+8),2));return new Uint8Array(out)}
function zTotp(secret,counter){
  var c=new Uint8Array(8),n=counter;for(var i=7;i>=0;i--){c[i]=n&255;n=Math.floor(n/256)}
  return crypto.subtle.importKey('raw',zB32d(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']).then(function(k){return crypto.subtle.sign('HMAC',k,c)}).then(function(sig){
    var h=new Uint8Array(sig),o=h[h.length-1]&15,code=((h[o]&127)<<24|h[o+1]<<16|h[o+2]<<8|h[o+3])%1000000;return ('000000'+code).slice(-6)});
}

function zRO(box,fn){var w=0;if(!window.ResizeObserver)return;new ResizeObserver(function(){var n=Math.round(box.clientWidth);if(n&&n!==w){w=n;fn()}}).observe(box)}
function zLegend(items){return '<div class="z-lg">'+items.map(function(i){return '<span><i style="background:'+i[1]+'"></i>'+i[0]+'</span>'}).join('')+'</div>'}
function zWrap(){return '<div class="z-cw"><svg></svg><div class="ctip"></div></div>'}
function zTipAt(wrap,tip,html,x,y){tip.innerHTML=html;tip.style.left=x+'px';tip.style.top=y+'px';tip.style.opacity='1'}

function buildExtra5(){
  var out='';
  /* ---------- charts pro ---------- */
  out+=S('chartspro','Charts pro','chart-bar-line',
    D('Candlestick chart',3,'<div class="z-box" data-zw="candle"><div class="z-bar"><span class="z-big" data-zlast></span><span class="delta" data-zdelta></span><span class="sp"></span>'+zSeg('range',[['24','24 d'],['36','36 d'],['60','60 d']],'36')+'</div><div data-zc></div></div>',{col:1,wide:1})
   +D('Sankey flow',3,'<div class="z-box" data-zw="sankey"><div data-zc></div><div class="muted" style="font-size:12.5px">Hover a link to trace the flow of 100 visitors.</div></div>',{col:1,wide:1})
   +D('Scatter & bubble',4,'<div class="z-box" data-zw="scatter"><div class="z-bar">'+zSeg('mode',[['bubble','Bubble'],['scatter','Scatter']],'bubble')+'<span class="sp"></span>'+zLegend([['Organic','var(--accent)'],['Paid','var(--violet)'],['Referral','var(--good)']])+'</div><div data-zc></div></div>',{col:1,wide:1})
   +D('Combo bar + line · dual axis',3,'<div class="z-box" data-zw="combo"><div data-zc></div>'+zLegend([['Revenue (left)','var(--accent)'],['Conversion (right)','var(--warn)']])+'</div>',{col:1})
   +D('Dual-axis lines',3,'<div class="z-box" data-zw="dual"><div data-zc></div>'+zLegend([['Visits (left)','var(--accent)'],['Revenue (right)','var(--violet)']])+'</div>',{col:1})
   +D('Multi-level gauge',3,'<div class="z-gz" data-zw="mgauge"><div data-zc style="width:100%;max-width:280px"></div>'+zLegend([['CPU 78%','var(--accent)'],['Memory 54%','var(--good)'],['Disk 32%','var(--violet)']])+'</div>',{col:1})
   +D('Zone gauge with needle',3,'<div class="z-gz" data-zw="zgauge"><div data-zc style="width:100%;max-width:280px"></div><div class="row" style="width:100%;gap:12px"><span class="muted" style="font-size:12.5px;font-weight:600">Load</span><input class="range" type="range" min="0" max="100" value="62" aria-label="Load" data-zr></div></div>',{col:1})
   +D('Live mini chart',3,'<div class="z-box" data-zw="live"><div class="z-bar"><span class="badge bad s"><i class="dotc pulse" style="width:6px;height:6px"></i>Live</span><span class="z-big" data-zv>—</span><span class="muted" style="font-size:12.5px">requests / s</span><span class="sp"></span><button class="btn xs sec" data-zpause>'+I('pause','xs')+'Pause</button></div><div data-zc></div></div>',{col:1})
  );
  /* ---------- onboarding ---------- */
  var steps=[['Create your workspace','Name it and pick a theme.','home-01'],['Invite a teammate','Collaboration works best together.','user-add-01'],['Connect an integration','Slack, GitHub or your calendar.','plug-01'],['Publish your first project','Share it with the world.','rocket-01'],['Set up two-factor sign-in','Keep your account safe.','shield-01']];
  var mood=[['Terrible'],['Bad'],['Okay'],['Good'],['Great']];
  var es=[['Inbox','mail-open','Inbox zero','Nothing new right now. Enjoy the quiet.','Compose message'],['Projects','folder-01','No projects yet','Create your first project to get things moving.','New project'],['Search','search-01','No results','Try a different keyword or remove some filters.','Clear filters'],['Notifications','notification-01','You are all caught up','We will let you know when something happens.',''],['Team','user-group','Just you here','Invite people to collaborate in this workspace.','Invite teammate'],['Files','files-01','No files uploaded','Drag files here or browse your computer.','Upload file'],['Error','alert-circle','Something went wrong','We could not load this page. Please try again.','Try again']];
  out+=S('onboard','Onboarding & feedback','sparkles',
    D('Getting started checklist',4,'<div class="z-ck" data-zw="checklist"><div class="z-ckh"><div data-zring></div><div class="tx"><b data-ztitle></b><small data-zsub></small></div></div><div class="prog good"><i style="--v:0%"></i></div><div class="col" style="gap:6px">'+steps.map(function(s,i){return '<button type="button" class="z-cki'+(i<1?' on':'')+'" data-i="'+i+'" aria-pressed="'+(i<1)+'"><span class="z-ring">'+I('tick-02','xs')+'</span><span class="tx"><b>'+s[0]+'</b><small>'+s[1]+'</small></span><span class="z-go">'+I(s[2],'s')+'</span></button>'}).join('')+'</div></div>',{col:1})
   +D('NPS survey',4,'<div class="z-nps" data-zw="nps"><div><b style="font:750 16px/1.3 var(--font)">How likely are you to recommend Păun Panel to a friend?</b></div><div class="z-sc10">'+[0,1,2,3,4,5,6,7,8,9,10].map(function(n){return '<button type="button" data-n="'+n+'" class="'+(n<=6?'bad':n<=8?'warn':'good')+'" aria-pressed="false">'+n+'</button>'}).join('')+'</div><div class="z-ends"><span>Not likely</span><span>Very likely</span></div><div class="z-more" data-zmore><div class="field"><label data-zq>What is the main reason for your score?</label><div class="inp ta"><textarea placeholder="Tell us more (optional)" rows="3" style="min-height:70px"></textarea></div></div><div class="row" style="justify-content:flex-end"><button class="btn s" data-zsend>Send feedback</button></div></div><div class="z-ok" data-zthanks hidden><span class="ico-b good">'+I('tick-02','l')+'</span><b>Thank you</b><small class="muted">Your feedback helps us improve.</small></div></div>',{col:1})
   +D('Rating with comment',4,'<div class="z-nps" data-zw="rating"><b style="font:750 16px/1.3 var(--font)">How was your experience?</b><div class="z-rt5" role="radiogroup" aria-label="Rating">'+[1,2,3,4,5].map(function(n){return '<button type="button" role="radio" aria-checked="false" aria-label="'+n+' star'+(n>1?'s':'')+'" data-n="'+n+'">'+I('star')+'</button>'}).join('')+'</div><div class="muted" style="font-size:13px;font-weight:600;min-height:18px" data-zmood></div><div class="z-more" data-zmore><div class="row wrap" style="gap:6px">'+['Easy to use','Fast','Looks great','Missing features','Confusing'].map(function(t){return '<button type="button" class="chip sm" data-chipz aria-pressed="false">'+t+'</button>'}).join('')+'</div><div class="inp ta"><textarea placeholder="Add a comment" rows="3" style="min-height:70px"></textarea></div><div class="row" style="justify-content:flex-end"><button class="btn s" data-zsend>Submit</button></div></div><div class="z-ok" data-zthanks hidden><span class="ico-b good">'+I('tick-02','l')+'</span><b>Thanks for rating</b></div></div>',{col:1})
   +D('Empty states per page',7,'<div class="z-box" data-zw="empty"><div class="seg s z-wrapseg" data-zseg="es">'+es.map(function(e,i){return '<label><input type="radio" name="zes" value="'+i+'"'+(i===0?' checked':'')+'><span>'+e[0]+'</span></label>'}).join('')+'</div><div data-zout></div></div>',{col:1})
   +D('New version available',3,'<div class="z-ver" data-zw="version"><div class="z-vb" data-zbar>'+I('sparkles','s')+'<span class="sp">A new version is available</span><button class="btn" data-zupd>Refresh</button><button class="btn sq xs ghost" style="color:inherit" data-zx aria-label="Dismiss">'+I('cancel-01','xs')+'</button></div><div class="z-vc" data-zcard><div class="row" style="gap:10px"><span class="ico-b accent">'+I('rocket-01')+'</span><div style="flex:1"><b>Version 2.4 is ready</b><small class="muted" style="display:block">Released today · 3 improvements</small></div></div><ul><li>'+I('tick-02','xs')+'Faster dashboard loading</li><li>'+I('tick-02','xs')+'New dark mode accents</li><li>'+I('tick-02','xs')+'Fixes for the calendar view</li></ul><div data-zprog hidden><div class="prog"><i style="--v:0%"></i></div></div><div class="row"><button class="btn s" data-zupd2>Update now</button><button class="btn s ghost" data-zlater>Later</button></div></div></div>',{col:1})
  );
  /* ---------- account ---------- */
  var perms=[['Projects'],['Billing'],['Members']];
  out+=S('account','Account & business','shield-user',
    D('Public profile page',4,'<div class="z-pf" data-zw="profile"><div class="z-pfc" style="background:var(--accent)"></div><div class="z-pfb"><div class="z-pfr">'+av('Păun Ștefan',{s:'xl'})+'<div class="row"><button class="btn s sec" data-zshare>'+I('share-01','s')+'Share</button><button class="btn s" data-zfollow>Follow</button></div></div><div><h3 style="font:800 22px/1.1 var(--font);letter-spacing:-.03em;display:flex;align-items:center;gap:8px">Păun Ștefan<span class="badge accent s">'+I('tick-02','xs')+'Verified</span></h3><div class="muted">@paun · Bucharest, Romania</div></div><p style="max-width:52ch">Designer and developer building clean, calm software and the tools behind it.</p><div class="z-pfs"><div><b data-zfc>1,284</b><small>Followers</small></div><div><b>312</b><small>Following</small></div><div><b>48</b><small>Projects</small></div></div><div class="z-pfl">'+[['globe','paun.uk'],['github','trencito42'],['instagram','stefann.allexandru']].map(function(l){return '<span class="chip sm">'+I(l[0],'xs')+l[1]+'</span>'}).join('')+'</div><div class="z-pfg">'+[['Blipmade','Brand studio','var(--good)'],['Witch','Developer tools','var(--violet)'],['Racket','Game mode','var(--info)'],['Lootz','Marketplace','var(--warn)']].map(function(p){return '<div style="background:'+p[2]+'">'+p[0]+'<small>'+p[1]+'</small></div>'}).join('')+'</div></div></div>',{col:1,wide:1})
   +D('API keys with permissions',5,'<div class="z-ak" data-zw="apikeys"><div class="row"><b style="flex:1;font:750 15px/1 var(--font)">API keys</b><button class="btn s" data-znew>'+I('add-01','s')+'Create key</button></div><div class="z-akn" data-zform hidden><div class="field"><label>Key name</label><div class="inp s"><input data-zname placeholder="e.g. Production server" autocomplete="off"></div></div><div class="z-pm"><span class="h">Resource</span><span class="h">Read</span><span class="h">Write</span><span class="h">Admin</span>'+perms.map(function(p,pi){return '<span>'+p[0]+'</span>'+['r','w','a'].map(function(k,ki){return '<label class="chk"><input type="checkbox" data-pm="'+pi+k+'"'+(ki===0?' checked':'')+' aria-label="'+p[0]+' '+k+'"></label>'}).join('')}).join('')+'</div><div class="row" style="justify-content:flex-end"><button class="btn s ghost" data-zcan>Cancel</button><button class="btn s" data-zgen>Generate</button></div></div><div data-znk></div><div class="z-ak" data-zlist style="gap:8px"></div></div>',{col:1,wide:1})
   +D('Invoices',4,'<div class="z-iv" data-zw="invoices"><div class="z-ivs" data-zsum></div><div class="row wrap">'+zSeg('st',[['all','All'],['paid','Paid'],['pending','Pending'],['overdue','Overdue']],'all')+'</div><div class="z-scroll"><table class="tbl" data-ztbl></table></div></div>',{col:1,wide:1})
   +D('Plan upgrade / downgrade',4,'<div class="z-pl" data-zw="plans"><div class="row" style="justify-content:space-between"><b style="font:750 15px/1 var(--font)">Choose your plan</b>'+zSeg('bill',[['m','Monthly'],['y','Yearly · −20%']],'m')+'</div><div class="z-pls" data-zcards></div><div class="z-plsum" data-zsumm></div></div>',{col:1,wide:1})
   +D('Two-factor setup · QR',5,'<div class="z-2f" data-zw="twofa"><div class="steps"><div class="step cur"><i>1</i>Scan</div><div class="step"><i>2</i>Verify</div><div class="step"><i>3</i>Backup</div></div><div class="z-pane on" data-p="0"><div class="z-qr"><div class="z-qrb" data-zqr></div><div class="tx"><b>Scan with your authenticator app</b><small class="muted">Works with Google Authenticator, 1Password, Authy and others.</small><div class="z-sec"><span data-zsecret></span><button class="btn xs sq sec" data-zcopy aria-label="Copy secret">'+I('copy-01','xs')+'</button></div></div></div><div class="row" style="justify-content:flex-end"><button class="btn" data-znext>Continue</button></div></div><div class="z-pane" data-p="1"><b>Enter the 6-digit code from your app</b><div class="otp" data-zotp>'+[0,1,2,3,4,5].map(function(i){return '<input inputmode="numeric" maxlength="1" aria-label="Digit '+(i+1)+'" autocomplete="one-time-code">'}).join('')+'</div><div class="err" data-zerr hidden></div><div class="row" style="justify-content:space-between"><button class="btn sec" data-zback>Back</button><button class="btn" data-zverify>Verify</button></div></div><div class="z-pane" data-p="2"><div class="alert good"><span>'+I('checkmark-circle-02')+'</span><div><b>Two-factor is on</b><p>Save these backup codes somewhere safe. Each works once.</p></div></div><div class="z-bc" data-zcodes></div><div class="row"><button class="btn s sec" data-zcpc>'+I('copy-01','s')+'Copy codes</button><span class="sp"></span><button class="btn s" data-zreset>Done</button></div></div></div>',{col:1})
   +D('Active sessions',4,'<div class="z-ss" data-zw="sessions"></div>',{col:1})
   +D('Filterable audit log',5,'<div class="z-au" data-zw="audit"><div class="z-bar"><div class="inp s pill" style="flex:1;min-width:150px">'+I('search-01','s')+'<input data-zq placeholder="Search events"></div>'+zSeg('act',[['all','All'],['auth','Sign-in'],['data','Data'],['bill','Billing']],'all')+zSeg('rng',[['1','24h'],['7','7d'],['30','30d']],'30')+'</div><div data-zlist></div><div class="row" style="justify-content:space-between"><span class="muted" style="font-size:12.5px" data-zinfo></span><div class="pager" data-zpg></div></div></div>',{col:1,wide:1})
  );
  return out;
}

function initExtra5(root){
  if(root.__e5)return;root.__e5=1;var R=root;
  function segv(h,n){var c=$('[data-zseg="'+n+'"] input:checked',h);return c?c.value:''}
  function mkTip(host){return {w:$('.z-cw',host),t:$('.ctip',host)}}
  /* ---- candlestick ---- */
  (function(){
    var host=$('[data-zw="candle"]',R);if(!host)return;var box=$('[data-zc]',host);
    var r=rng(21),all=[],p=142;for(var i=0;i<60;i++){var o=p,c=o+(r()-.47)*7,h=Math.max(o,c)+r()*3,l=Math.min(o,c)-r()*3;all.push({o:o,h:h,l:l,c:c,v:Math.round(400+r()*900)});p=c}
    function draw(){
      var n=+segv(host,'range'),d=all.slice(60-n),W=Math.max(300,box.clientWidth||700),H=290,L=8,Rr=48,T=10,PH=205,VT=PH+16,VH=H-VT-22;
      var mx=Math.max.apply(null,d.map(function(x){return x.h})),mn=Math.min.apply(null,d.map(function(x){return x.l})),pad=(mx-mn)*.08;mx+=pad;mn-=pad;
      var sy=function(v){return T+(PH-T)*(1-(v-mn)/(mx-mn))},bw=(W-L-Rr)/n,vm=Math.max.apply(null,d.map(function(x){return x.v}));
      var g='';for(var k=0;k<=4;k++){var v=mn+(mx-mn)*k/4,y=sy(v);g+='<line class="gl" x1="'+L+'" x2="'+(W-Rr)+'" y1="'+y+'" y2="'+y+'"/><text x="'+(W-Rr+8)+'" y="'+(y+4)+'">'+v.toFixed(1)+'</text>'}
      var cs='';d.forEach(function(x,i){var up=x.c>=x.o,col=up?'var(--good)':'var(--bad)',cx=L+bw*i+bw/2,w=Math.max(3,bw*.62),y1=sy(Math.max(x.o,x.c)),y2=sy(Math.min(x.o,x.c));
        cs+='<g data-i="'+i+'"><line x1="'+cx+'" x2="'+cx+'" y1="'+sy(x.h)+'" y2="'+sy(x.l)+'" stroke="'+col+'" stroke-width="2" stroke-linecap="round"/><rect x="'+(cx-w/2)+'" y="'+y1+'" width="'+w+'" height="'+Math.max(2,y2-y1)+'" rx="'+Math.min(4,w/2)+'" fill="'+col+'"/><rect x="'+(cx-w/2)+'" y="'+(VT+VH*(1-x.v/vm))+'" width="'+w+'" height="'+(VH*x.v/vm)+'" rx="'+Math.min(3,w/2)+'" fill="'+col+'" opacity=".3"/></g>'});
      var xl='';var every=Math.ceil(n/6);d.forEach(function(x,i){if(i%every===0)xl+='<text x="'+(L+bw*i+bw/2)+'" y="'+(H-4)+'" text-anchor="middle">D'+(60-n+i+1)+'</text>'});
      box.innerHTML='<div class="z-cw"><svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Candlestick chart">'+g+cs+xl+'<line class="z-cross" y1="'+T+'" y2="'+PH+'" x1="-9" x2="-9" style="opacity:0"/></svg><div class="ctip"></div></div>';
      var last=d[n-1],first=d[0],ch=(last.c-first.o)/first.o*100;$('[data-zlast]',host).textContent=last.c.toFixed(2);var dl=$('[data-zdelta]',host);dl.className='delta '+(ch>=0?'up':'down');dl.textContent=(ch>=0?'+':'')+ch.toFixed(1)+'%';
      var svg=$('svg',box),tip=$('.ctip',box),cross=$('.z-cross',box),wrap=$('.z-cw',box);
      svg.addEventListener('pointermove',function(e){var b=svg.getBoundingClientRect(),x=(e.clientX-b.left)*W/b.width,i=Math.max(0,Math.min(n-1,Math.floor((x-L)/bw))),cx=L+bw*i+bw/2,x0=d[i];
        cross.style.opacity=1;cross.setAttribute('x1',cx);cross.setAttribute('x2',cx);var wb=wrap.getBoundingClientRect();
        tip.innerHTML='<small>Day '+(60-n+i+1)+'</small>O '+x0.o.toFixed(1)+' · H '+x0.h.toFixed(1)+'<br>L '+x0.l.toFixed(1)+' · C '+x0.c.toFixed(1);tip.style.left=Math.min(wb.width-70,Math.max(70,cx*b.width/W))+'px';tip.style.top=(sy(x0.h)*b.height/H)+'px';tip.style.opacity='1'});
      svg.addEventListener('pointerleave',function(){tip.style.opacity='0';cross.style.opacity=0});
    }
    host.addEventListener('change',draw);draw();zRO(box,draw);
  })();
  /* ---- sankey ---- */
  (function(){
    var host=$('[data-zw="sankey"]',R);if(!host)return;var box=$('[data-zc]',host);
    var cols=[[['Direct','var(--accent)'],['Search','var(--good)'],['Social','var(--violet)'],['Email','var(--warn)']],[['Free','var(--s4)'],['Pro','var(--accent)'],['Team','var(--info)']],[['Active','var(--good)'],['Churned','var(--bad)']]];
    var links=[[0,0,1,0,20],[0,0,1,1,15],[0,0,1,2,5],[0,1,1,0,15],[0,1,1,1,10],[0,1,1,2,5],[0,2,1,0,8],[0,2,1,1,7],[0,2,1,2,5],[0,3,1,0,2],[0,3,1,1,3],[0,3,1,2,5],[1,0,2,0,25],[1,0,2,1,20],[1,1,2,0,28],[1,1,2,1,7],[1,2,2,0,17],[1,2,2,1,3]];
    function draw(){
      var W=Math.max(300,box.clientWidth||700),H=280,nw=14,gap=12,padT=6,sc=(H-padT-3*gap)/100,colX=[0,(W-nw)/2,W-nw];
      var nodes={};cols.forEach(function(c,ci){var tot=c.length,total=0;c.forEach(function(n,ni){var val=links.filter(function(l){return ci===0?(l[0]===0&&l[1]===ni):ci===1?(l[2]===1&&l[3]===ni):(l[2]===2&&l[3]===ni)}).reduce(function(a,l){return a+l[4]},0);nodes[ci+'-'+ni]={v:val,col:n[1],name:n[0],ci:ci,ni:ni,in:0,out:0}});
        var hs=c.reduce(function(a,n,ni){return a+nodes[ci+'-'+ni].v*sc},0)+(tot-1)*gap,y=padT+(H-padT-hs)/2;c.forEach(function(n,ni){var nd=nodes[ci+'-'+ni];nd.y=y;nd.h=nd.v*sc;y+=nd.h+gap})});
      var svgl='',svgn='';
      links.forEach(function(l,i){var a=nodes[l[0]+'-'+l[1]],b=nodes[l[2]+'-'+l[3]],h=l[4]*sc,x0=colX[l[0]]+nw,x1=colX[l[2]],y0=a.y+a.out+h/2,y1=b.y+b.in+h/2;a.out+=h;b.in+=h;var mx=(x0+x1)/2;
        svgl+='<path class="l" data-s="'+l[0]+'-'+l[1]+'" data-t="'+l[2]+'-'+l[3]+'" d="M'+x0+' '+y0+'C'+mx+' '+y0+' '+mx+' '+y1+' '+x1+' '+y1+'" fill="none" stroke="'+a.col+'" stroke-opacity=".38" stroke-width="'+h+'" data-v="'+l[4]+'" data-n="'+a.name+' → '+b.name+'"/>'});
      Object.keys(nodes).forEach(function(k){var n=nodes[k],right=n.ci===0;svgn+='<rect x="'+colX[n.ci]+'" y="'+n.y+'" width="'+nw+'" height="'+n.h+'" rx="5" fill="'+n.col+'"/><text x="'+(n.ci===2?colX[n.ci]-8:colX[n.ci]+nw+8)+'" y="'+(n.y+n.h/2-1)+'" text-anchor="'+(n.ci===2?'end':'start')+'">'+n.name+'</text><text class="s" x="'+(n.ci===2?colX[n.ci]-8:colX[n.ci]+nw+8)+'" y="'+(n.y+n.h/2+12)+'" text-anchor="'+(n.ci===2?'end':'start')+'">'+n.v+'</text>'});
      box.innerHTML='<div class="z-cw"><svg class="z-sk" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Sankey diagram">'+svgl+svgn+'</svg><div class="ctip"></div></div>';
      var svg=$('svg',box),tip=$('.ctip',box),wrap=$('.z-cw',box);
      $$('path.l',svg).forEach(function(p){
        function on(e){svg.classList.add('f');p.classList.add('on');var b=wrap.getBoundingClientRect();tip.innerHTML=p.dataset.n+'<small>'+p.dataset.v+' visitors</small>';tip.style.left=Math.min(b.width-80,Math.max(80,e.clientX-b.left))+'px';tip.style.top=(e.clientY-b.top-6)+'px';tip.style.opacity='1'}
        function off(){svg.classList.remove('f');p.classList.remove('on');tip.style.opacity='0'}
        p.addEventListener('pointermove',on);p.addEventListener('pointerenter',on);p.addEventListener('pointerleave',off);
      });
    }
    draw();zRO(box,draw);
  })();
  /* ---- scatter / bubble ---- */
  (function(){
    var host=$('[data-zw="scatter"]',R);if(!host)return;var box=$('[data-zc]',host);
    var r=rng(9),cats=[['Organic','var(--accent)'],['Paid','var(--violet)'],['Referral','var(--good)']],pts=[];
    for(var i=0;i<36;i++){var c=i%3,x=10+r()*80,y=Math.max(2,Math.min(98,20+x*.55+(r()-.5)*40+(c===1?-12:c===2?10:0)));pts.push({x:x,y:y,s:4+r()*26,c:c,n:cats[c][0]+' #'+(i+1)})}
    function draw(){
      var bub=segv(host,'mode')==='bubble',W=Math.max(300,box.clientWidth||700),H=290,L=44,Rr=14,T=12,B=34;
      var sx=function(v){return L+(W-L-Rr)*v/100},sy=function(v){return T+(H-T-B)*(1-v/100)},g='';
      for(var k=0;k<=4;k++){var v=25*k,y=sy(v),x=sx(v);g+='<line class="gl" x1="'+L+'" x2="'+(W-Rr)+'" y1="'+y+'" y2="'+y+'"/><text x="'+(L-10)+'" y="'+(y+4)+'" text-anchor="end">'+v+'%</text><text x="'+x+'" y="'+(H-14)+'" text-anchor="middle">'+(v*30)+'</text>'}
      g+='<text x="'+(W/2)+'" y="'+(H+4)+'" text-anchor="middle" style="font-weight:700">Sessions</text>';
      var c='';pts.forEach(function(p,i){var rr=bub?p.s/2+4:6;c+='<circle data-i="'+i+'" cx="'+sx(p.x)+'" cy="'+sy(p.y)+'" r="'+rr+'" fill="'+cats[p.c][1]+'" fill-opacity="'+(bub?.55:.9)+'" stroke="'+cats[p.c][1]+'" stroke-width="'+(bub?2:0)+'"/>'});
      box.innerHTML='<div class="z-cw z-sc"><svg viewBox="0 0 '+W+' '+(H+8)+'" role="img" aria-label="'+(bub?'Bubble':'Scatter')+' chart">'+g+c+'</svg><div class="ctip"></div></div>';
      var svg=$('svg',box),tip=$('.ctip',box),wrap=$('.z-cw',box);
      $$('circle',svg).forEach(function(el){function on(){var p=pts[+el.dataset.i],b=el.getBoundingClientRect(),w=wrap.getBoundingClientRect();$$('circle',svg).forEach(function(o){o.style.opacity=o===el?1:.35});tip.innerHTML='<small>'+p.n+'</small>'+Math.round(p.x*30)+' sessions · '+Math.round(p.y)+'% conv'+(bub?'<br>$'+Math.round(p.s*40)+' revenue':'');tip.style.left=(b.left-w.left+b.width/2)+'px';tip.style.top=(b.top-w.top)+'px';tip.style.opacity='1'}
        el.addEventListener('pointerenter',on);el.addEventListener('pointerdown',on)});
      svg.addEventListener('pointerleave',function(){tip.style.opacity='0';$$('circle',svg).forEach(function(o){o.style.opacity=''})});
    }
    host.addEventListener('change',draw);draw();zRO(box,draw);
  })();
  /* ---- combo ---- */
  (function(){
    var host=$('[data-zw="combo"]',R);if(!host)return;var box=$('[data-zc]',host);
    var M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],rev=[42,48,45,58,64,61,72,80,76,88,95,104],cv=[2.1,2.3,2.2,2.8,3.1,2.9,3.4,3.7,3.5,4.0,4.3,4.6];
    function draw(){
      var W=Math.max(280,box.clientWidth||460),H=250,L=36,Rr=40,T=12,B=26,n=12,bw=(W-L-Rr)/n,my=120,mc=6;
      var sy=function(v){return T+(H-T-B)*(1-v/my)},sc=function(v){return T+(H-T-B)*(1-v/mc)},g='',b='',pts=[];
      for(var k=0;k<=4;k++){var y=T+(H-T-B)*k/4;g+='<line class="gl" x1="'+L+'" x2="'+(W-Rr)+'" y1="'+y+'" y2="'+y+'"/><text x="'+(L-8)+'" y="'+(y+4)+'" text-anchor="end" style="fill:var(--accent)">$'+Math.round(my*(1-k/4))+'k</text><text x="'+(W-Rr+8)+'" y="'+(y+4)+'" style="fill:var(--warn)">'+(mc*(1-k/4)).toFixed(1)+'%</text>'}
      rev.forEach(function(v,i){var x=L+bw*i+bw*.2,w=bw*.6;b+='<rect data-i="'+i+'" x="'+x+'" y="'+sy(v)+'" width="'+w+'" height="'+(H-B-sy(v))+'" rx="'+Math.min(8,w/2)+'" fill="var(--accent)" opacity=".85"/><text x="'+(x+w/2)+'" y="'+(H-8)+'" text-anchor="middle">'+M[i][0]+'</text>';pts.push([L+bw*i+bw/2,sc(cv[i])])});
      var line='M'+pts.map(function(p){return p[0]+' '+p[1]}).join('L'),dots=pts.map(function(p,i){return '<circle cx="'+p[0]+'" cy="'+p[1]+'" r="4.5" fill="var(--s1)" stroke="var(--warn)" stroke-width="2.5" data-i="'+i+'"/>'}).join('');
      box.innerHTML='<div class="z-cw"><svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Revenue and conversion">'+g+b+'<path d="'+line+'" fill="none" stroke="var(--warn)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>'+dots+'<rect class="hit" x="'+L+'" y="0" width="'+(W-L-Rr)+'" height="'+H+'" fill="transparent"/></svg><div class="ctip"></div></div>';
      var svg=$('svg',box),tip=$('.ctip',box),wrap=$('.z-cw',box);
      svg.addEventListener('pointermove',function(e){var bb=svg.getBoundingClientRect(),x=(e.clientX-bb.left)*W/bb.width,i=Math.max(0,Math.min(n-1,Math.floor((x-L)/bw)));$$('rect[data-i]',svg).forEach(function(r){r.setAttribute('opacity',+r.dataset.i===i?1:.45)});tip.innerHTML='<small>'+M[i]+'</small>$'+rev[i]+'k · '+cv[i]+'%';tip.style.left=(pts[i][0]*bb.width/W)+'px';tip.style.top=(Math.min(sy(rev[i]),pts[i][1])*bb.height/H)+'px';tip.style.opacity='1'});
      svg.addEventListener('pointerleave',function(){tip.style.opacity='0';$$('rect[data-i]',svg).forEach(function(r){r.setAttribute('opacity',.85)})});
    }
    draw();zRO(box,draw);
  })();
  /* ---- dual axis ---- */
  (function(){
    var host=$('[data-zw="dual"]',R);if(!host)return;var box=$('[data-zc]',host);
    var a=series(14,3200,1100,31,60),b=series(14,820,260,7,14),lab=dayLabels(14,1);
    function draw(){
      var W=Math.max(280,box.clientWidth||460),H=250,L=44,Rr=48,T=12,B=26,n=14,ma=niceMax(Math.max.apply(null,a)*1.05),mb=niceMax(Math.max.apply(null,b)*1.05);
      var sx=function(i){return L+(W-L-Rr)*i/(n-1)},ya=function(v){return T+(H-T-B)*(1-v/ma)},yb=function(v){return T+(H-T-B)*(1-v/mb)},g='';
      for(var k=0;k<=4;k++){var y=T+(H-T-B)*k/4;g+='<line class="gl" x1="'+L+'" x2="'+(W-Rr)+'" y1="'+y+'" y2="'+y+'"/><text x="'+(L-8)+'" y="'+(y+4)+'" text-anchor="end" style="fill:var(--accent)">'+(fmt(Math.round(ma*(1-k/4))))+'</text><text x="'+(W-Rr+8)+'" y="'+(y+4)+'" style="fill:var(--violet)">$'+(fmt(Math.round(mb*(1-k/4))))+'</text>'}
      var pa=a.map(function(v,i){return [sx(i),ya(v)]}),pb=b.map(function(v,i){return [sx(i),yb(v)]});
      var x='';[0,4,8,13].forEach(function(i){x+='<text x="'+sx(i)+'" y="'+(H-6)+'" text-anchor="middle">'+lab[i]+'</text>'});
      box.innerHTML='<div class="z-cw"><svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Visits and revenue">'+g+x+'<path d="'+smooth(pa)+'" fill="none" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round"/><path d="'+smooth(pb)+'" fill="none" stroke="var(--violet)" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="0"/><g class="hv" style="opacity:0"><line class="z-cross" y1="'+T+'" y2="'+(H-B)+'" x1="0" x2="0"/><circle r="5" fill="var(--accent)" cx="0" cy="0" class="da"/><circle r="5" fill="var(--violet)" cx="0" cy="0" class="db"/></g></svg><div class="ctip"></div></div>';
      var svg=$('svg',box),tip=$('.ctip',box),cross=$('.z-cross',box),da=$('.da',box),db=$('.db',box),hv=$('.hv',box);
      svg.addEventListener('pointermove',function(e){var bb=svg.getBoundingClientRect(),x0=(e.clientX-bb.left)*W/bb.width,i=Math.max(0,Math.min(n-1,Math.round((x0-L)/((W-L-Rr)/(n-1)))));hv.style.opacity=1;cross.setAttribute('x1',sx(i));cross.setAttribute('x2',sx(i));da.setAttribute('cx',sx(i));da.setAttribute('cy',ya(a[i]));db.setAttribute('cx',sx(i));db.setAttribute('cy',yb(b[i]));tip.innerHTML='<small>'+lab[i]+'</small>'+fmt(a[i])+' visits · $'+fmt(b[i]);tip.style.left=Math.min(bb.width-70,Math.max(70,sx(i)*bb.width/W))+'px';tip.style.top=(Math.min(ya(a[i]),yb(b[i]))*bb.height/H)+'px';tip.style.opacity='1'});
      svg.addEventListener('pointerleave',function(){tip.style.opacity='0';hv.style.opacity=0});
    }
    draw();zRO(box,draw);
  })();
  /* ---- multi-level gauge ---- */
  (function(){
    var host=$('[data-zw="mgauge"]',R);if(!host)return;var box=$('[data-zc]',host);
    var lv=[[78,'var(--accent)',86],[54,'var(--good)',66],[32,'var(--violet)',46]],h='<svg viewBox="0 0 200 112" class="chart" role="img" aria-label="CPU 78%, memory 54%, disk 32%">';
    lv.forEach(function(l){var R0=l[2],a=Math.PI*l[0]/100,x=100-R0*Math.cos(a),y=100-R0*Math.sin(a);h+='<path d="M'+(100-R0)+' 100A'+R0+' '+R0+' 0 0 1 '+(100+R0)+' 100" fill="none" stroke="var(--s3)" stroke-width="12" stroke-linecap="round"/><path class="zg" d="M'+(100-R0)+' 100A'+R0+' '+R0+' 0 0 1 '+x+' '+y+'" fill="none" stroke="'+l[1]+'" stroke-width="12" stroke-linecap="round" style="stroke-dasharray:400;stroke-dashoffset:400;transition:stroke-dashoffset 1.1s var(--ease)"/>'});
    h+='<text x="100" y="98" text-anchor="middle" style="font:800 22px var(--font);fill:var(--ink);letter-spacing:-.04em">55%</text><text x="100" y="111" text-anchor="middle" style="font:600 9.5px var(--font)">average load</text></svg>';
    box.innerHTML=h;requestAnimationFrame(function(){requestAnimationFrame(function(){$$('.zg',box).forEach(function(p){p.style.strokeDashoffset=0})})});
  })();
  /* ---- zone gauge ---- */
  (function(){
    var host=$('[data-zw="zgauge"]',R);if(!host)return;var box=$('[data-zc]',host),rg=$('[data-zr]',host);
    function pt(v,rad){var a=Math.PI*v/100;return [100-rad*Math.cos(a),100-rad*Math.sin(a)]}
    function arc(a,b,col){var p=pt(a,78),q=pt(b,78);return '<path d="M'+p[0]+' '+p[1]+'A78 78 0 0 1 '+q[0]+' '+q[1]+'" fill="none" stroke="'+col+'" stroke-width="14" stroke-linecap="butt"/>'}
    function draw(){
      var v=+rg.value,n=pt(v,64),zone=v<60?'var(--good)':v<85?'var(--warn)':'var(--bad)',lab=v<60?'Healthy':v<85?'Elevated':'Critical';
      rg.style.setProperty('--p',v+'%');
      box.innerHTML='<svg viewBox="0 0 200 128" class="chart" role="img" aria-label="Load '+v+'%, '+lab+'">'+arc(0.6,59.4,'var(--good)')+arc(60.6,84.4,'var(--warn)')+arc(85.6,99.4,'var(--bad)')+'<line x1="100" y1="100" x2="'+n[0]+'" y2="'+n[1]+'" stroke="var(--ink)" stroke-width="4" stroke-linecap="round" style="transition:all .3s var(--ease)"/><circle cx="100" cy="100" r="8" fill="var(--ink)"/><text x="100" y="86" text-anchor="middle" style="font:800 24px var(--font);fill:var(--ink);letter-spacing:-.04em;display:none">'+v+'%</text><text x="100" y="124" text-anchor="middle" style="font:700 12px var(--font);fill:'+zone+'">'+v+'% · '+lab+'</text></svg>';
    }
    rg.addEventListener('input',draw);draw();
  })();
  /* ---- live mini chart ---- */
  (function(){
    var host=$('[data-zw="live"]',R);if(!host)return;var box=$('[data-zc]',host),vals=[],r=rng(3),paused=false,v=420,vis=true,btn=$('[data-zpause]',host),val=$('[data-zv]',host);
    for(var i=0;i<40;i++){v=Math.max(200,Math.min(700,v+(r()-.5)*70));vals.push(v)}
    function draw(){
      var W=Math.max(260,box.clientWidth||400),H=140,T=8,B=8,mx=Math.max.apply(null,vals)+20,mn=Math.min.apply(null,vals)-20,n=vals.length;
      var p=vals.map(function(x,i){return [W*i/(n-1),T+(H-T-B)*(1-(x-mn)/(mx-mn))]}),d=smooth(p);
      box.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" class="chart" role="img" aria-label="Live requests per second"><path d="'+d+'L'+W+' '+H+'L0 '+H+'Z" fill="var(--accent)" opacity=".12"/><path d="'+d+'" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/><circle cx="'+p[n-1][0]+'" cy="'+p[n-1][1]+'" r="5" fill="var(--accent)"/></svg>';
      val.textContent=fmt(Math.round(vals[n-1]));
    }
    function tick(){if(paused||!vis||!host.isConnected)return;v=Math.max(200,Math.min(700,v+(r()-.5)*80));vals.push(v);vals.shift();draw()}
    draw();zRO(box,draw);setInterval(tick,900);
    if(window.IntersectionObserver)new IntersectionObserver(function(en){vis=en[0].isIntersecting}).observe(host);
    btn.addEventListener('click',function(){paused=!paused;btn.innerHTML=(paused?I('play','xs')+'Resume':I('pause','xs')+'Pause')});
  })();
  /* ---- checklist ---- */
  (function(){
    var host=$('[data-zw="checklist"]',R);if(!host)return;
    function upd(){var items=$$('.z-cki',host),done=items.filter(function(i){return i.classList.contains('on')}).length,pct=Math.round(done/items.length*100);
      $('[data-zring]',host).innerHTML=ringEl(pct,pct+'%',{c:'var(--good)',sz:56});$('[data-ztitle]',host).textContent=done===items.length?'All done!':'Get started';$('[data-zsub]',host).textContent=done+' of '+items.length+' steps complete';$('.prog i',host).style.setProperty('--v',pct+'%');
      if(done===items.length&&!host.__ce){host.__ce=1;toast('Setup complete','good')}if(done<items.length)host.__ce=0}
    host.addEventListener('click',function(e){var b=e.target.closest('.z-cki');if(!b)return;var on=!b.classList.contains('on');b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);upd()});
    upd();
  })();
  /* ---- nps ---- */
  (function(){
    var host=$('[data-zw="nps"]',R);if(!host)return;
    host.addEventListener('click',function(e){
      var b=e.target.closest('[data-n]');
      if(b){$$('[data-n]',host).forEach(function(x){x.setAttribute('aria-pressed',x===b)});var n=+b.dataset.n;$('[data-zq]',host).textContent=n>=9?'What do you like most?':n>=7?'What could we do better?':'What went wrong? We want to fix it.';$('[data-zmore]',host).classList.add('on')}
      if(e.target.closest('[data-zsend]')){$$('.z-sc10,.z-ends,[data-zmore]',host).forEach(function(x){x.hidden=true});$$('b',host)[0].parentNode.hidden=true;$('[data-zthanks]',host).hidden=false;toast('Feedback sent','good')}
    });
  })();
  /* ---- rating ---- */
  (function(){
    var host=$('[data-zw="rating"]',R);if(!host)return;var M=['Terrible','Bad','Okay','Good','Great'];
    function setv(v){$$('.z-rt5 button',host).forEach(function(b,i){b.classList.toggle('on',i<v);b.setAttribute('aria-checked',i===v-1)});$('[data-zmood]',host).textContent=v?M[v-1]:'';$('[data-zmore]',host).classList.toggle('on',v>0)}
    host.addEventListener('click',function(e){var b=e.target.closest('.z-rt5 button');if(b)setv(+b.dataset.n);var c=e.target.closest('[data-chipz]');if(c)c.setAttribute('aria-pressed',c.getAttribute('aria-pressed')!=='true');
      if(e.target.closest('[data-zsend]')){$$('.z-rt5,[data-zmood],[data-zmore]',host).forEach(function(x){x.hidden=true});$$('b',host)[0].hidden=true;$('[data-zthanks]',host).hidden=false;toast('Thanks for rating','good')}});
    host.addEventListener('keydown',function(e){var b=e.target.closest('.z-rt5 button');if(!b)return;var i=+b.dataset.n;if(e.key==='ArrowRight'||e.key==='ArrowUp'){e.preventDefault();setv(Math.min(5,i+1));$$('.z-rt5 button',host)[Math.min(4,i)].focus()}else if(e.key==='ArrowLeft'||e.key==='ArrowDown'){e.preventDefault();setv(Math.max(1,i-1));$$('.z-rt5 button',host)[Math.max(0,i-2)].focus()}});
  })();
  /* ---- empty states ---- */
  (function(){
    var host=$('[data-zw="empty"]',R);if(!host)return;
    var es=[['Inbox','mail-open','Inbox zero','Nothing new right now. Enjoy the quiet.','Compose message'],['Projects','folder-01','No projects yet','Create your first project to get things moving.','New project'],['Search','search-01','No results','Try a different keyword or remove some filters.','Clear filters'],['Notifications','notification-01','You are all caught up','We will let you know when something happens.',''],['Team','user-group','Just you here','Invite people to collaborate in this workspace.','Invite teammate'],['Files','files-01','No files uploaded','Drag files here or browse your computer.','Upload file'],['Error','alert-circle','Something went wrong','We could not load this page. Please try again.','Try again']];
    function draw(){var e=es[+segv(host,'es')];$('[data-zout]',host).innerHTML='<div class="z-es"><div class="z-art"><i class="a"></i><i class="b"></i><i class="c"></i>'+I(e[1])+'</div><h4>'+e[2]+'</h4><p>'+e[3]+'</p>'+(e[4]?'<button class="btn s'+(e[0]==='Error'?'':' tint')+'" data-ztoast="'+e[4]+'">'+e[4]+'</button>':'')+'</div>'}
    host.addEventListener('change',draw);host.addEventListener('click',function(e){var b=e.target.closest('[data-ztoast]');if(b)toast(b.dataset.ztoast,'good')});draw();
  })();
  /* ---- version ---- */
  (function(){
    var host=$('[data-zw="version"]',R);if(!host)return;
    $('[data-zx]',host).addEventListener('click',function(){$('[data-zbar]',host).hidden=true;toast('Banner dismissed')});
    $('[data-zupd]',host).addEventListener('click',function(){toast('Reloading to update…')});
    $('[data-zlater]',host).addEventListener('click',function(){$('[data-zcard]',host).hidden=true;toast('We will remind you tomorrow')});
    var up=$('[data-zupd2]',host);
    up.addEventListener('click',function(){var pg=$('[data-zprog]',host),bar=$('.prog i',pg);pg.hidden=false;up.classList.add('load');var v=0;var iv=setInterval(function(){v+=Math.random()*24+8;if(v>=100){v=100;clearInterval(iv);setTimeout(function(){up.classList.remove('load');up.innerHTML=I('tick-02','s')+'Up to date';up.classList.add('good');pg.hidden=true;toast('Updated to 2.4','good')},300)}bar.style.setProperty('--v',v+'%')},260)});
  })();
  /* ---- profile ---- */
  (function(){
    var host=$('[data-zw="profile"]',R);if(!host)return;var f=$('[data-zfollow]',host),c=$('[data-zfc]',host),on=false;
    f.addEventListener('click',function(){on=!on;f.textContent=on?'Following':'Follow';f.classList.toggle('sec',on);c.textContent=on?'1,285':'1,284'});
    $('[data-zshare]',host).addEventListener('click',function(){toast('Profile link copied','good')});
  })();
  /* ---- api keys ---- */
  (function(){
    var host=$('[data-zw="apikeys"]',R);if(!host)return;
    var keys=[{n:'Production server',k:'pk_live_8f3a1c7d92b04e5a',sc:['Projects: read, write','Billing: read'],u:'2 min ago'},{n:'CI pipeline',k:'pk_live_c41d09e7a63b2f18',sc:['Projects: read'],u:'Yesterday'},{n:'Analytics export',k:'pk_live_29be7740d1fa5c36',sc:['Members: read'],u:'Never used'}];
    var list=$('[data-zlist]',host),form=$('[data-zform]',host),shown={};
    function draw(){list.innerHTML=keys.map(function(k,i){return '<div class="z-akr" data-i="'+i+'"><span class="ico-b accent">'+I('key-01')+'</span><div class="tx"><b>'+esc(k.n)+'</b><code>'+(shown[i]?k.k:k.k.slice(0,8)+'••••••••••••••••')+'</code><div class="z-sc" style="margin-top:6px">'+k.sc.map(function(s){return '<span class="badge s">'+s+'</span>'}).join('')+'</div></div><span class="muted" style="font-size:12.5px;white-space:nowrap">'+k.u+'</span><div class="row" style="gap:4px"><button class="btn xs sq ghost" data-zeye="'+i+'" aria-label="'+(shown[i]?'Hide':'Reveal')+' key">'+I(shown[i]?'view-off':'view','xs')+'</button><button class="btn xs sq ghost" data-zcp="'+i+'" aria-label="Copy key">'+I('copy-01','xs')+'</button><button class="btn xs badt" data-zrev="'+i+'">Revoke</button></div></div>'}).join('')||'<div class="muted" style="padding:14px;text-align:center">No API keys</div>'}
    draw();
    host.addEventListener('click',function(e){
      var t=e.target;
      if(t.closest('[data-znew]')){form.hidden=!form.hidden;if(!form.hidden)$('[data-zname]',host).focus()}
      else if(t.closest('[data-zcan]'))form.hidden=true;
      else if(t.closest('[data-zgen]')){var nm=$('[data-zname]',host),name=nm.value.trim();if(!name){nm.parentNode.classList.add('bad');nm.focus();return}nm.parentNode.classList.remove('bad');
        var sc=[];['Projects','Billing','Members'].forEach(function(r,ri){var p=[];['r','w','a'].forEach(function(k,ki){if($('[data-pm="'+ri+k+'"]',host).checked)p.push(['read','write','admin'][ki])});if(p.length)sc.push(r+': '+p.join(', '))});
        if(!sc.length){toast('Pick at least one permission','warn');return}
        var key='pk_live_'+zB32(16).toLowerCase();keys.unshift({n:name,k:key,sc:sc,u:'Never used'});shown={};draw();form.hidden=true;nm.value='';
        $('[data-znk]',host).innerHTML='<div class="z-newkey">'+I('checkmark-circle-02')+'<code>'+key+'</code><button class="btn xs sec" data-zcpn="'+key+'">Copy</button></div><small class="muted" style="display:block;margin:6px 4px 0">Copy it now. For your security it will be masked next time.</small>'}
      else if(t.closest('[data-zcpn]')){try{navigator.clipboard.writeText(t.closest('[data-zcpn]').dataset.zcpn)}catch(er){}toast('Key copied','good')}
      else if(t.closest('[data-zeye]')){var i=+t.closest('[data-zeye]').dataset.zeye;shown[i]=!shown[i];draw()}
      else if(t.closest('[data-zcp]')){try{navigator.clipboard.writeText(keys[+t.closest('[data-zcp]').dataset.zcp].k)}catch(er){}toast('Key copied','good')}
      else if(t.closest('[data-zrev]')){var j=+t.closest('[data-zrev]').dataset.zrev,nm2=keys[j].n;keys.splice(j,1);shown={};draw();toast('Revoked '+nm2,'bad')}
    });
  })();
  /* ---- invoices ---- */
  (function(){
    var host=$('[data-zw="invoices"]',R);if(!host)return;
    var INV=[['INV-1042','Oct 01, 2026',29,'paid'],['INV-1041','Sep 01, 2026',29,'paid'],['INV-1040','Aug 01, 2026',29,'paid'],['INV-1039','Jul 01, 2026',79,'overdue'],['INV-1038','Jun 01, 2026',79,'refunded'],['INV-1037','May 01, 2026',29,'paid'],['INV-1036','Apr 01, 2026',29,'pending'],['INV-1035','Mar 01, 2026',29,'paid']];
    var BC={paid:'good',pending:'warn',overdue:'bad',refunded:''};
    function draw(){var f=segv(host,'st'),rows=INV.filter(function(r){return f==='all'||r[3]===f});
      var sum=function(s){return INV.filter(function(r){return r[3]===s}).reduce(function(a,r){return a+r[2]},0)};
      $('[data-zsum]',host).innerHTML='<div><small>Paid</small><b>$'+sum('paid')+'</b></div><div><small>Pending</small><b>$'+sum('pending')+'</b></div><div><small>Overdue</small><b style="color:var(--bad)">$'+sum('overdue')+'</b></div>';
      $('[data-ztbl]',host).innerHTML='<thead><tr><th>Invoice</th><th>Date</th><th class="r">Amount</th><th>Status</th><th></th></tr></thead><tbody>'+(rows.map(function(r){return '<tr><td><b>'+r[0]+'</b></td><td class="muted">'+r[1]+'</td><td class="r num" style="font-weight:700">$'+r[2]+'.00</td><td><span class="badge '+BC[r[3]]+'">'+r[3][0].toUpperCase()+r[3].slice(1)+'</span></td><td class="r"><button class="btn xs sq ghost" data-zdl="'+r[0]+'" aria-label="Download '+r[0]+'">'+I('download-01','xs')+'</button>'+(r[3]==='overdue'||r[3]==='pending'?'<button class="btn xs tint" data-zpay="'+r[0]+'">Pay now</button>':'')+'</td></tr>'}).join('')||'<tr><td colspan="5" style="text-align:center;color:var(--ink2);padding:24px">No invoices</td></tr>')+'</tbody>'}
    host.addEventListener('change',draw);
    host.addEventListener('click',function(e){var d=e.target.closest('[data-zdl]');if(d)toast(d.dataset.zdl+' downloaded','good');var p=e.target.closest('[data-zpay]');if(p){var id=p.dataset.zpay;INV.forEach(function(r){if(r[0]===id)r[3]='paid'});draw();toast(id+' paid','good')}});
    draw();
  })();
  /* ---- plans ---- */
  (function(){
    var host=$('[data-zw="plans"]',R);if(!host)return;
    var P=[['Starter',0,['3 projects','1 seat']],['Pro',12,['Unlimited projects','3 seats']],['Team',29,['Unlimited projects','10 seats']]],cur=1,sel=1;
    function draw(){var y=segv(host,'bill')==='y',pr=function(p){return y?Math.round(p*.8):p};
      $('[data-zcards]',host).innerHTML=P.map(function(p,i){return '<button type="button" class="z-plc" data-i="'+i+'" aria-pressed="'+(i===sel)+'">'+(i===cur?'<span class="badge accent s">Current</span>':'')+'<b>'+p[0]+'</b><span class="p">$'+pr(p[1])+'<small> /mo</small></span><small class="f">'+p[2].join(' · ')+'</small></button>'}).join('');
      var s=P[sel],c=P[cur],up=sel>cur,same=sel===cur;
      $('[data-zsumm]',host).innerHTML='<div class="tx"><b>'+(same?'You are on '+c[0]:(up?'Upgrade to ':'Downgrade to ')+s[0])+'</b><small>'+(same?'Choose another plan to change.':up?'Prorated today · you pay $'+Math.round((pr(s[1])-pr(c[1]))*.6)+' now.':'Takes effect at the end of this billing period.')+'</small></div><button class="btn '+(up?'accent':'')+'" data-zgo '+(same?'disabled':'')+'>'+(same?'Current plan':up?'Upgrade':'Downgrade')+'</button>'}
    host.addEventListener('change',draw);
    host.addEventListener('click',function(e){var c=e.target.closest('.z-plc');if(c){sel=+c.dataset.i;draw()}if(e.target.closest('[data-zgo]')){cur=sel;draw();toast('Plan changed to '+P[cur][0],'good')}});
    draw();
  })();
  /* ---- 2FA ---- */
  (function(){
    var host=$('[data-zw="twofa"]',R);if(!host)return;
    var secret=zB32(16),panes=$$('.z-pane',host),steps=$$('.step',host),ins=$$('[data-zotp] input',host),err=$('[data-zerr]',host);
    function show(n){panes.forEach(function(p,i){p.classList.toggle('on',i===n)});steps.forEach(function(s,i){s.className='step'+(i<n?' done':i===n?' cur':'');$('i',s).innerHTML=i<n?I('tick-02','xs'):(i+1)})}
    function init(){secret=zB32(16);var uri='otpauth://totp/Paun%20Panel:paun%40paun.uk?secret='+secret+'&issuer=Paun%20Panel&algorithm=SHA1&digits=6&period=30';$('[data-zqr]',host).innerHTML=ZQR.svg(uri);$('[data-zsecret]',host).textContent=secret.replace(/(.{4})/g,'$1 ').trim();ins.forEach(function(i){i.value=''});err.hidden=true;show(0)}
    function code(){return ins.map(function(i){return i.value}).join('')}
    ins.forEach(function(i,k){
      i.addEventListener('focus',function(){i.select()});
      i.addEventListener('input',function(){i.value=i.value.replace(/\D/g,'').slice(-1);if(i.value&&ins[k+1])ins[k+1].focus();err.hidden=true;i.parentNode.classList.remove('bad')});
      i.addEventListener('keydown',function(e){if(e.key==='Backspace'&&!i.value&&ins[k-1])ins[k-1].focus();if(e.key==='Enter')$('[data-zverify]',host).click()});
      i.addEventListener('paste',function(e){var t=(e.clipboardData||window.clipboardData).getData('text').replace(/\D/g,'').slice(0,6);if(!t)return;e.preventDefault();t.split('').forEach(function(c,j){if(ins[j])ins[j].value=c});(ins[Math.min(5,t.length)]||ins[5]).focus()});
    });
    host.addEventListener('click',function(e){
      var t=e.target;
      if(t.closest('[data-znext]')){show(1);ins[0].focus()}
      else if(t.closest('[data-zback]'))show(0);
      else if(t.closest('[data-zcopy]')){try{navigator.clipboard.writeText(secret)}catch(er){}toast('Secret copied','good')}
      else if(t.closest('[data-zverify]')){
        var c=code();if(c.length<6){err.hidden=false;err.innerHTML=I('alert-circle','xs')+'Enter all 6 digits';return}
        var now=Math.floor(Date.now()/30000);Promise.all([-1,0,1].map(function(d){return zTotp(secret,now+d)})).then(function(cs){
          if(cs.indexOf(c)>-1){var bc=[];for(var i=0;i<8;i++)bc.push(zB32(8).toLowerCase().replace(/(.{4})/,'$1-'));$('[data-zcodes]',host).innerHTML=bc.map(function(x){return '<code>'+x+'</code>'}).join('');host.__bc=bc;show(2);toast('Two-factor enabled','good')}
          else{err.hidden=false;err.innerHTML=I('alert-circle','xs')+'That code is not right. Try again.';err.style.color='var(--bad)';ins.forEach(function(i){i.parentNode.classList.add('bad')});ins[0].focus()}
        });
      }
      else if(t.closest('[data-zcpc]')){try{navigator.clipboard.writeText((host.__bc||[]).join('\n'))}catch(er){}toast('Backup codes copied','good')}
      else if(t.closest('[data-zreset]'))init();
    });
    init();
    host.__secret=function(){return secret};window.__zsecret=function(){return secret};
  })();
  /* ---- sessions ---- */
  (function(){
    var host=$('[data-zw="sessions"]',R);if(!host)return;
    var S0=[['MacBook Pro','laptop','Chrome 126 · Bucharest, RO','Active now',1],['iPhone 15','mail-01','Păun app · Bucharest, RO','12 min ago',0],['Windows PC','computer','Firefox 127 · Cluj, RO','3 days ago',0],['iPad','monitor','Safari · Brașov, RO','2 weeks ago',0]];
    S0[1][1]='laptop';
    function draw(){host.innerHTML=S0.map(function(s,i){return '<div class="z-ssr" data-i="'+i+'"><span class="ico-b '+(s[4]?'good':'')+'">'+I(['laptop','computer','monitor','laptop'][i%4])+'</span><div class="tx"><b>'+s[0]+(s[4]?'<span class="badge good s">This device</span>':'')+'</b><small>'+s[2]+' · '+s[3]+'</small></div>'+(s[4]?'':'<button class="btn xs badt" data-zout="'+s[0]+'">Sign out</button>')+'</div>'}).join('')+(S0.length>1?'<div class="row" style="justify-content:flex-end;margin-top:6px"><button class="btn s sec" data-zall>Sign out all other sessions</button></div>':'')}
    draw();
    function rm(names,toastMsg){var els=$$('.z-ssr',host).filter(function(e){return names.indexOf(S0[+e.dataset.i][0])>-1});els.forEach(function(e){e.classList.add('out')});setTimeout(function(){S0=S0.filter(function(s){return names.indexOf(s[0])<0});draw();toast(toastMsg,'good')},300)}
    host.addEventListener('click',function(e){var o=e.target.closest('[data-zout]');if(o)rm([o.dataset.zout],'Signed out of '+o.dataset.zout);if(e.target.closest('[data-zall]'))rm(S0.filter(function(s){return !s[4]}).map(function(s){return s[0]}),'Signed out of all other sessions')});
  })();
  /* ---- audit log ---- */
  (function(){
    var host=$('[data-zw="audit"]',R);if(!host)return;
    var A=[['Ana Vasile','signed in','auth','laptop',0.2,'203.0.113.24','Chrome on macOS'],['Andrei Pop','deleted project “Moodboard”','data','delete-02',1.1,'198.51.100.7','Web app'],['Ana Vasile','updated billing address','bill','credit-card',3,'203.0.113.24','Web app'],['System','failed sign-in attempt','auth','alert-circle',5,'192.0.2.88','Unknown device'],['Sara Klein','exported 1,240 records','data','download-01',8,'198.51.100.31','Web app'],['Tom Hughes','changed plan to Team','bill','credit-card',12,'203.0.113.99','Web app'],['Ana Vasile','created API key “CI pipeline”','data','key-01',19,'203.0.113.24','Web app'],['Maria Ionescu','signed in','auth','laptop',22,'198.51.100.54','Safari on iOS'],['Andrei Pop','invited luca@example.com','data','user-add-01',26,'198.51.100.7','Web app'],['System','invoice INV-1042 paid','bill','receipt',29,'—','Stripe webhook']];
    var page=0,PER=5;
    function when(d){return d<1?Math.round(d*24)+'h ago':Math.round(d)+'d ago'}
    function draw(){
      var q=$('[data-zq]',host).value.toLowerCase().trim(),act=segv(host,'act'),rg=+segv(host,'rng');
      var rows=A.filter(function(r){return (act==='all'||r[2]===act)&&r[4]<=rg&&(!q||(r[0]+' '+r[1]).toLowerCase().indexOf(q)>-1)});
      var pages=Math.max(1,Math.ceil(rows.length/PER));page=Math.min(page,pages-1);var v=rows.slice(page*PER,page*PER+PER);
      $('[data-zlist]',host).innerHTML=v.map(function(r,i){return '<div class="z-aur"><button class="z-aut" aria-expanded="false">'+av(r[0],{s:'s'})+'<span class="tx"><b>'+esc(r[0])+' '+esc(r[1])+'</b><small>'+(r[2]==='auth'?'Sign-in':r[2]==='data'?'Data':'Billing')+'</small></span><span class="t">'+when(r[4])+'</span>'+I('arrow-right-01','s').replace('class="ic s"','class="ic s chv"')+'</button><div class="z-aud"><code class="code">{\n  "actor": "'+esc(r[0])+'",\n  "ip": "'+r[5]+'",\n  "agent": "'+r[6]+'",\n  "event": "'+esc(r[1])+'"\n}</code></div></div>'}).join('')||'<div class="empty"><span class="ico-b">'+I('search-01')+'</span><h4>No events found</h4><p>Try changing the filters.</p></div>';
      $('[data-zinfo]',host).textContent=rows.length?('Showing '+(page*PER+1)+'–'+(page*PER+v.length)+' of '+rows.length):'0 events';
      $('[data-zpg]',host).innerHTML=pages>1?'<button '+(page===0?'disabled':'')+' data-pg="'+(page-1)+'" aria-label="Previous page">'+I('arrow-left-01','s')+'</button>'+Array.apply(null,Array(pages)).map(function(_,i){return '<button data-pg="'+i+'"'+(i===page?' aria-current="true"':'')+'>'+(i+1)+'</button>'}).join('')+'<button '+(page===pages-1?'disabled':'')+' data-pg="'+(page+1)+'" aria-label="Next page">'+I('arrow-right-01','s')+'</button>':'';
    }
    host.addEventListener('change',function(){page=0;draw()});
    host.addEventListener('input',function(e){if(e.target.hasAttribute('data-zq')){page=0;draw()}});
    host.addEventListener('click',function(e){var t=e.target.closest('.z-aut');if(t){var r=t.parentNode;r.classList.toggle('open');t.setAttribute('aria-expanded',r.classList.contains('open'))}var p=e.target.closest('[data-pg]');if(p&&!p.disabled){page=+p.dataset.pg;draw()}});
    draw();
  })();
}
