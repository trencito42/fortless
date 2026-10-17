
/* ================= batch 4: data pro + forms pro ================= */
function zSeg(name,opts,val,extra){var id='zs-'+name+'-'+(zSeg.n=(zSeg.n||0)+1);return '<div class="seg s '+(extra||'')+'" data-zseg="'+name+'">'+opts.map(function(o){return '<label><input type="radio" name="'+id+'" value="'+o[0]+'"'+(o[0]===val?' checked':'')+'><span>'+o[1]+'</span></label>'}).join('')+'</div>'}
function zInp(attrs,icon,cls,pre){return '<div class="inp '+(cls||'')+'">'+(icon?I(icon,'s'):'')+(pre?'<span class="pre">'+pre+'</span>':'')+'<input '+attrs+'></div>'}
function zSel(name,opts,val){return '<div class="inp sel"><select data-zs="'+name+'">'+opts.map(function(o){o=[].concat(o);return '<option value="'+o[0]+'"'+(o[0]===val?' selected':'')+'>'+(o[1]||o[0])+'</option>'}).join('')+'</select></div>'}
var Z_MONEY=function(n){return '$'+fmt(Math.round(n))};

function buildExtra4(){
  var out='';
  /* ---------- data pro ---------- */
  out+=S('datapro','Data tools','table-01',
    D('Pivot table',4,'<div class="z-box" data-zw="pivot"><div class="z-bar"><span class="z-lbl">Rows</span>'+zSeg('prow',[['region','Region'],['product','Product'],['quarter','Quarter']],'region')+'<span class="z-lbl">Columns</span>'+zSeg('pcol',[['quarter','Quarter'],['product','Product'],['region','Region']],'quarter')+'<span class="z-lbl">Value</span>'+zSeg('pval',[['rev','Revenue'],['ord','Orders']],'rev')+'</div><div class="z-scroll" data-zout></div></div>',{col:1,wide:1})
   +D('Resizable & reorderable columns',4,'<div class="z-box" data-zw="rtable"><div class="row wrap muted" style="font-size:12.5px;gap:14px"><span class="row" style="gap:6px">'+I('arrow-left-01','xs')+I('arrow-right-01','xs')+' Drag a header to reorder</span><span class="row" style="gap:6px">'+I('arrow-up-down','xs')+' Drag the edge to resize</span><button class="btn xs sec" style="margin-left:auto" data-zreset>Reset</button></div><div class="z-scroll" data-zout></div></div>',{col:1,wide:1})
   +D('Virtual scroll · 5,000 rows',3,'<div class="z-box" data-zw="vscroll"><div class="z-bar"><div class="inp s pill" style="flex:1;min-width:150px">'+I('search-01','s')+'<input data-zq placeholder="Jump to row (1–5000)" inputmode="numeric"></div><span class="badge" data-zinfo>—</span></div><div class="z-vs" data-zvs tabindex="0"><div class="z-vh"><span>#</span><span>Customer</span><span>Email</span><span style="text-align:right">Amount</span></div><div class="z-vp" data-zvp></div></div></div>',{col:1,wide:1})
   +D('Query builder',5,'<div class="z-box" data-zw="qb"><div class="z-qb" data-zout></div><div class="z-out" data-zsql></div><div class="row" style="justify-content:space-between"><span class="badge accent" data-zcnt>—</span><button class="btn xs sec" data-zqreset>Reset</button></div></div>',{col:1,wide:1})
   +D('CSV import with preview',5,'<div class="z-csv" data-zw="csv"><div data-zdrop class="drop" tabindex="0" role="button" aria-label="Choose a CSV file">'+I('upload-01','l')+'<b style="color:var(--ink)">Drop a CSV here</b><small>or click to browse</small><input type="file" accept=".csv,text/csv" hidden></div><div class="row wrap"><button class="btn s sec" data-zsample>'+I('file-01','s')+'Use sample file</button></div><div data-zprev></div></div>',{col:1,wide:1})
  );
  /* ---------- forms pro ---------- */
  var cc='<div class="ddwrap" data-zcc><button type="button" class="z-cc" data-dd aria-haspopup="listbox" aria-expanded="false"><span class="z-cd" data-zcode>RO</span><span data-zdial>+40</span>'+I('arrow-down-01','xs')+'</button><div class="dd" hidden><div class="z-q"><div class="inp s">'+I('search-01','s')+'<input placeholder="Search country" data-zcq></div></div><div class="menu" data-zcl></div></div></div>';
  out+=S('formspro','Forms pro','task-01',
    D('Multi-step wizard',5,'<div class="z-wz" data-zw="wizard"><div class="steps"><div class="step cur"><i>1</i>Account</div><div class="step"><i>2</i>Plan</div><div class="step"><i>3</i>Confirm</div></div>'
      +'<div class="z-pane on" data-p="0"><div class="field"><label>Full name</label>'+zInp('data-f="name" placeholder="Ana Vasile" autocomplete="off"','user','')+'<div class="err" hidden></div></div><div class="field"><label>Work email</label>'+zInp('data-f="email" type="email" placeholder="ana@company.com" autocomplete="off"','mail-01','')+'<div class="err" hidden></div></div></div>'
      +'<div class="z-pane" data-p="1">'+[['Starter','Free · 3 projects'],['Pro','$12 / month · unlimited projects'],['Team','$29 / month · 10 seats']].map(function(p,i){return '<label class="opt"><span class="ico">'+I(['rocket-01','flash','user-group'][i])+'</span><span><b>'+p[0]+'</b><small>'+p[1]+'</small></span><span class="rad"><input type="radio" name="zwp" value="'+p[0]+'"'+(i===1?' checked':'')+'></span></label>'}).join('')+'</div>'
      +'<div class="z-pane" data-p="2"><dl class="z-sum" data-zsum></dl><div class="field"><label class="chk"><input type="checkbox" data-f="terms"><span>I agree to the terms</span></label><div class="err" hidden></div></div></div>'
      +'<div class="z-pane" data-p="3"><div class="z-ok"><span class="ico-b good">'+I('tick-02','l')+'</span><h4 style="font:750 18px/1.2 var(--font)">You are all set</h4><p class="muted">Your workspace is ready.</p><button class="btn s sec" data-zwrestart>Start over</button></div></div>'
      +'<div class="z-foot" data-zfoot><button class="btn sec" data-zback disabled>Back</button><button class="btn" data-znext>Continue</button></div></div>',{col:1})
   +D('Repeater fields',4,'<div class="z-rp" data-zw="repeater"><div class="z-rh z-lbl"><span>Item</span><span>Qty</span><span>Price</span><span></span></div><div class="z-rp" data-zrows style="gap:8px"></div><div class="row"><button class="btn s sec" data-zradd>'+I('add-01','s')+'Add line</button></div><div class="z-rsum"><span>Total</span><b data-ztotal>$0</b></div></div>',{col:1})
   +D('Signature pad',4,'<div class="z-box" data-zw="sign"><div class="z-sig" data-zpad><canvas></canvas><span class="z-sx">'+'×'+'</span><span class="z-sl"></span><span class="z-sh">Sign here</span></div><div class="row"><button class="btn s sec" data-zundo>'+I('undo','s')+'Undo</button><button class="btn s ghost" data-zclear>Clear</button><span class="sp"></span><button class="btn s" data-zsave>Save</button></div><div hidden data-zres class="row" style="gap:10px"><img class="z-sigout" alt="Saved signature"><span class="badge good">'+I('tick-02','xs')+'Saved</span></div></div>',{col:1})
   +D('Phone & country',3,'<div class="z-box" data-zw="phone"><div class="field"><label>Phone number</label><div class="z-ph">'+cc+zInp('data-zph type="tel" inputmode="tel" placeholder="712 345 678" autocomplete="off"','','')+'</div><div class="hint" data-zhint>Enter your number</div></div></div>',{col:1})
   +D('Money input',3,'<div class="z-box" data-zw="money"><div class="field"><label>Amount</label><div class="z-mn"><div class="inp big"><span class="pre" data-zsym style="font-size:18px">$</span><input data-zamt inputmode="decimal" placeholder="0.00" autocomplete="off"></div><div class="z-cur">'+zSel('cur',[['USD'],['EUR'],['GBP'],['RON']],'USD')+'</div></div><div class="hint" data-zconv>≈ —</div></div></div>',{col:1})
   +D('Dual-handle range',3,'<div class="z-box" data-zw="drange"><div class="row" style="justify-content:space-between"><b>Price range</b><span class="badge" data-zout>$200 – $750</span></div><div class="z-dr"><div class="z-t" data-zt><div class="z-f"></div><div class="z-th" role="slider" tabindex="0" aria-label="Minimum price" data-z="0"></div><div class="z-th" role="slider" tabindex="0" aria-label="Maximum price" data-z="1"></div></div><div class="z-ends"><span>$0</span><span>$1,000</span></div></div></div>',{col:1})
   +D('Mentions editor',3,'<div class="z-ed" data-zw="mention"><div class="z-edi" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Comment" data-ph="Write a comment, type @ to mention…"></div><div class="z-mm" hidden><div class="menu" role="listbox"></div></div></div>',{col:1})
   +D('Drag & drop sortable list',4,'<div class="z-so" data-zw="sortable"></div>',{col:1})
  );
  return out;
}

function initExtra4(root){
  if(root.__e4)return;root.__e4=1;
  var R=root;
  /* ===== segmented helper ===== */
  function segVal(host,name){var c=$('[data-zseg="'+name+'"] input:checked',host);return c?c.value:''}

  /* ===== pivot ===== */
  (function(){
    var host=$('[data-zw="pivot"]',R);if(!host)return;
    var DIMS={region:['EMEA','AMER','APAC'],product:['Starter','Pro','Team','Enterprise'],quarter:['Q1','Q2','Q3','Q4']};
    var r=rng(11),rows=[];
    DIMS.region.forEach(function(rg){DIMS.product.forEach(function(p,pi){DIMS.quarter.forEach(function(q){var o=Math.round(20+r()*90*(pi+1)*.6);rows.push({region:rg,product:p,quarter:q,ord:o,rev:o*[9,29,79,249][pi]})})})});
    function draw(){
      var rd=segVal(host,'prow'),cd=segVal(host,'pcol'),vd=segVal(host,'pval');
      if(rd===cd){cd=Object.keys(DIMS).filter(function(k){return k!==rd})[0];$$('[data-zseg="pcol"] input',host).forEach(function(i){i.checked=i.value===cd})}
      var RS=DIMS[rd],CS=DIMS[cd],cell={},rt={},ct={},gt=0,mx=0;
      rows.forEach(function(x){var k=x[rd]+'|'+x[cd];cell[k]=(cell[k]||0)+x[vd];rt[x[rd]]=(rt[x[rd]]||0)+x[vd];ct[x[cd]]=(ct[x[cd]]||0)+x[vd];gt+=x[vd]});
      Object.keys(cell).forEach(function(k){mx=Math.max(mx,cell[k])});
      var f=function(v){return vd==='rev'?Z_MONEY(v):fmt(v)};
      var h='<table class="z-pv"><thead><tr><th>'+rd[0].toUpperCase()+rd.slice(1)+'</th>'+CS.map(function(c){return '<th>'+c+'</th>'}).join('')+'<th class="t">Total</th></tr></thead><tbody>';
      RS.forEach(function(a){h+='<tr><td>'+a+'</td>'+CS.map(function(b){var v=cell[a+'|'+b]||0,o=.12+.88*v/mx;return '<td style="background:color-mix(in srgb,var(--accent) '+Math.round(o*55)+'%,var(--s2));color:var(--ink)">'+f(v)+'</td>'}).join('')+'<td class="t">'+f(rt[a])+'</td></tr>'});
      h+='<tr class="t"><td>Total</td>'+CS.map(function(b){return '<td>'+f(ct[b])+'</td>'}).join('')+'<td style="background:var(--ink);color:var(--on-ink)">'+f(gt)+'</td></tr></tbody></table>';
      $('[data-zout]',host).innerHTML=h;
    }
    host.addEventListener('change',draw);draw();
  })();

  /* ===== resizable / reorderable table ===== */
  (function(){
    var host=$('[data-zw="rtable"]',R);if(!host)return;
    var DEF=[{k:'name',l:'Customer',w:200},{k:'plan',l:'Plan',w:120},{k:'country',l:'Country',w:140},{k:'mrr',l:'MRR',w:110},{k:'seen',l:'Last seen',w:150}];
    var cols=DEF.map(function(c){return {k:c.k,l:c.l,w:c.w}});
    var DATA=[['Ana Vasile','Pro','Romania','$29','2 min ago'],['Mihai Pop','Team','Germany','$79','1 hour ago'],['Sara Klein','Starter','Austria','$9','Yesterday'],['Tom Hughes','Enterprise','United Kingdom','$249','3 days ago'],['Ioana Matei','Pro','Romania','$29','5 days ago'],['Luca Bianchi','Team','Italy','$79','Last week'],['Eva Novak','Starter','Czechia','$9','Last month']];
    var idx={name:0,plan:1,country:2,mrr:3,seen:4};
    function draw(){
      var tw=cols.reduce(function(a,c){return a+c.w},0);
      var h='<table class="z-rt" style="width:'+tw+'px"><colgroup>'+cols.map(function(c){return '<col style="width:'+c.w+'px">'}).join('')+'</colgroup><thead><tr>'+cols.map(function(c,i){return '<th data-i="'+i+'"><div class="z-h" data-zgrip>'+I('move','xs')+'<span>'+c.l+'</span></div><span class="z-rs" data-zrs></span></th>'}).join('')+'</tr></thead><tbody>'+DATA.map(function(r){return '<tr>'+cols.map(function(c){return '<td>'+r[idx[c.k]]+'</td>'}).join('')+'</tr>'}).join('')+'</tbody></table>';
      $('[data-zout]',host).innerHTML=h;
    }
    draw();
    var out=$('[data-zout]',host);
    out.addEventListener('pointerdown',function(e){
      var rs=e.target.closest('[data-zrs]'),gr=e.target.closest('[data-zgrip]');
      if(rs){
        e.preventDefault();var th=rs.parentNode,i=+th.dataset.i,x0=e.clientX,w0=cols[i].w,tbl=$('.z-rt',out),col=$$('col',tbl)[i];
        rs.classList.add('on');rs.setPointerCapture(e.pointerId);
        var mv=function(ev){cols[i].w=Math.max(70,Math.round(w0+ev.clientX-x0));col.style.width=cols[i].w+'px';tbl.style.width=cols.reduce(function(a,c){return a+c.w},0)+'px'};
        var up=function(){rs.classList.remove('on');rs.removeEventListener('pointermove',mv);rs.removeEventListener('pointerup',up);rs.removeEventListener('pointercancel',up)};
        rs.addEventListener('pointermove',mv);rs.addEventListener('pointerup',up);rs.addEventListener('pointercancel',up);return;
      }
      if(gr){
        var th2=gr.parentNode,from=+th2.dataset.i,moved=false,to=from;e.preventDefault();
        var ths=$$('th',out);th2.classList.add('z-drag');
        var mv2=function(ev){moved=true;to=from;ths.forEach(function(t,k){var b=t.getBoundingClientRect();t.classList.remove('z-over');if(ev.clientX>=b.left&&ev.clientX<b.right){to=k}});ths.forEach(function(t,k){t.classList.toggle('z-over',k===to&&to!==from)})};
        var up2=function(){document.removeEventListener('pointermove',mv2);document.removeEventListener('pointerup',up2);document.removeEventListener('pointercancel',up2);if(moved&&to!==from){var c=cols.splice(from,1)[0];cols.splice(to,0,c)}draw()};
        document.addEventListener('pointermove',mv2);document.addEventListener('pointerup',up2);document.addEventListener('pointercancel',up2);
      }
    });
    $('[data-zreset]',host).addEventListener('click',function(){cols=DEF.map(function(c){return {k:c.k,l:c.l,w:c.w}});draw();toast('Columns reset','good')});
  })();

  /* ===== virtual scroll ===== */
  (function(){
    var host=$('[data-zw="vscroll"]',R);if(!host)return;
    var N=5000,RH=46,vs=$('[data-zvs]',host),vp=$('[data-zvp]',host),info=$('[data-zinfo]',host);
    var FN=['Ana','Mihai','Sara','Tom','Ioana','Luca','Eva','Radu','Maria','John','Elena','Paul'],LN=['Vasile','Pop','Klein','Hughes','Matei','Bianchi','Novak','Stan','Dumitru','Moore'];
    function row(i){var a=FN[i%FN.length],b=LN[(i*7)%LN.length];return [i+1,a+' '+b,(a+'.'+b).toLowerCase()+'@example.com','$'+fmt(((i*37)%900)+20)]}
    vp.style.height=(N*RH)+'px';
    function draw(){
      var top=vs.scrollTop,h=vs.clientHeight-38,s=Math.max(0,Math.floor(top/RH)-4),e=Math.min(N,Math.ceil((top+h)/RH)+4),html='';
      for(var i=s;i<e;i++){var r=row(i);html+='<div class="z-vr" style="top:'+(i*RH)+'px"><span class="mono">'+r[0]+'</span><span><b style="font-weight:700">'+r[1]+'</b></span><span class="muted">'+r[2]+'</span><span class="num" style="text-align:right;font-weight:700">'+r[3]+'</span></div>'}
      vp.innerHTML=html;info.textContent='Rendering '+(e-s)+' of '+fmt(N);
    }
    vs.addEventListener('scroll',function(){requestAnimationFrame(draw)},{passive:true});
    $('[data-zq]',host).addEventListener('input',function(e){var n=parseInt(e.target.value,10);if(n>=1&&n<=N){vs.scrollTop=(n-1)*RH;draw()}});
    draw();new ResizeObserver(draw).observe(vs);
  })();

  /* ===== query builder ===== */
  (function(){
    var host=$('[data-zw="qb"]',R);if(!host)return;
    var r=rng(5),PL=['Free','Pro','Team'],CT=['Romania','Germany','Italy','France','Spain'],ST=['Active','Trial','Churned'],DS=[];
    for(var i=0;i<120;i++)DS.push({plan:PL[Math.floor(r()*3)],country:CT[Math.floor(r()*5)],status:ST[Math.floor(r()*3)],mrr:Math.round(r()*300)});
    var F={plan:{l:'Plan',t:'e',o:PL},country:{l:'Country',t:'e',o:CT},status:{l:'Status',t:'e',o:ST},mrr:{l:'MRR',t:'n'}};
    var OPS={e:[['is','is'],['not','is not']],n:[['gt','greater than'],['lt','less than'],['eq','equals']]};
    function def(){return {g:1,op:'AND',items:[{f:'plan',o:'is',v:'Pro'},{f:'mrr',o:'gt',v:'100'}]}}
    var model=def();
    function at(p){var n=model;p.forEach(function(i){n=n.items[i]});return n}
    function condEval(c,d){var v=d[c.f];if(F[c.f].t==='e')return c.o==='is'?v===c.v:v!==c.v;var n=parseFloat(c.v);if(isNaN(n))return true;return c.o==='gt'?v>n:c.o==='lt'?v<n:v===n}
    function ev(g,d){var rs=g.items.map(function(x){return x.g?ev(x,d):condEval(x,d)});if(!rs.length)return true;return g.op==='AND'?rs.every(Boolean):rs.some(Boolean)}
    function sql(g,dep){var parts=g.items.map(function(x){if(x.g)return '('+sql(x,dep+1)+')';var o={is:'=',not:'!=',gt:'>',lt:'<',eq:'='}[x.o],val=F[x.f].t==='e'?"<i>'"+x.v+"'</i>":'<i>'+(x.v||0)+'</i>';return x.f+' '+o+' '+val});return parts.join(' <b>'+g.op+'</b> ')}
    function grp(g,path){
      var h='<div class="z-g"><div class="z-gh">'+zSeg('op',[['AND','Match all'],['OR','Match any']],g.op).replace('data-zseg="op"','data-zseg="op" data-path="'+path.join(',')+'"')+'<span class="sp"></span>'+(path.length?'<button class="btn xs sq ghost" data-zrmg="'+path.join(',')+'" aria-label="Remove group">'+I('delete-02','xs')+'</button>':'')+'</div>';
      g.items.forEach(function(x,i){var p=path.concat(i),ps=p.join(',');
        if(x.g){h+=grp(x,p);return}
        var ops=OPS[F[x.f].t];
        h+='<div class="z-c" data-path="'+ps+'">'+zSel('f',Object.keys(F).map(function(k){return [k,F[k].l]}),x.f)+zSel('o',ops,x.o)
          +(F[x.f].t==='e'?zSel('v',F[x.f].o.map(function(o){return [o]}),x.v):'<div class="inp"><input data-zs="v" inputmode="numeric" value="'+esc(x.v)+'" placeholder="Value"></div>')
          +'<button class="btn xs sq ghost" data-zrm="'+ps+'" aria-label="Remove condition">'+I('cancel-01','xs')+'</button></div>'});
      h+='<div class="row wrap" style="gap:6px"><button class="btn xs sec" data-zac="'+path.join(',')+'">'+I('add-01','xs')+'Condition</button>'+(path.length<2?'<button class="btn xs sec" data-zag="'+path.join(',')+'">'+I('add-01','xs')+'Group</button>':'')+'</div></div>';
      return h;
    }
    function summary(){var n=DS.filter(function(d){return ev(model,d)}).length;$('[data-zsql]',host).innerHTML='<b>WHERE</b> '+(model.items.length?sql(model,0):'<i>true</i>');$('[data-zcnt]',host).textContent=n+' of '+DS.length+' records match'}
    function draw(){$('[data-zout]',host).innerHTML=grp(model,[]);summary()}
    function P(s){return s?s.split(',').map(Number):[]}
    host.addEventListener('click',function(e){
      var b=e.target.closest('button');if(!b)return;
      if(b.dataset.zac!==undefined){at(P(b.dataset.zac)).items.push({f:'status',o:'is',v:'Active'});draw()}
      else if(b.dataset.zag!==undefined){at(P(b.dataset.zag)).items.push({g:1,op:'OR',items:[{f:'country',o:'is',v:'Romania'}]});draw()}
      else if(b.dataset.zrm!==undefined){var p=P(b.dataset.zrm),i=p.pop();at(p).items.splice(i,1);draw()}
      else if(b.dataset.zrmg!==undefined){var p2=P(b.dataset.zrmg),i2=p2.pop();at(p2).items.splice(i2,1);draw()}
      else if(b.hasAttribute('data-zqreset')){model=def();draw()}
    });
    host.addEventListener('change',function(e){
      var t=e.target;
      if(t.type==='radio'){var sg=t.closest('[data-zseg="op"]');if(sg){at(P(sg.dataset.path)).op=t.value;summary()}return}
      var c=t.closest('.z-c');if(!c||!t.dataset.zs)return;
      var n=at(P(c.dataset.path));
      if(t.dataset.zs==='f'){n.f=t.value;n.o=OPS[F[n.f].t][0][0];n.v=F[n.f].t==='e'?F[n.f].o[0]:'100';draw()}else{n[t.dataset.zs]=t.value;summary()}
    });
    host.addEventListener('input',function(e){var t=e.target;if(t.tagName==='INPUT'&&t.dataset.zs==='v'){var c=t.closest('.z-c');at(P(c.dataset.path)).v=t.value;summary()}});
    draw();
  })();

  /* ===== csv import ===== */
  (function(){
    var host=$('[data-zw="csv"]',R);if(!host)return;
    var SAMPLE='name,email,plan,country\nAna Vasile,ana@company.com,Pro,Romania\nMihai Pop,mihai@example.com,Team,Germany\nSara Klein,sara.klein@,Starter,Austria\n"Hughes, Tom",tom@hughes.co.uk,Enterprise,United Kingdom\nIoana Matei,ioana@example.ro,Pro,Romania';
    var FIELDS=[['name','Name'],['email','Email'],['plan','Plan'],['country','Country'],['skip','Skip column']];
    function parse(t){var rows=[],row=[],f='',q=false;for(var i=0;i<t.length;i++){var c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else if(c==='"')q=true;else if(c===','){row.push(f);f=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&t[i+1]==='\n')i++;row.push(f);f='';if(row.length>1||row[0]!=='')rows.push(row);row=[]}else f+=c}row.push(f);if(row.length>1||row[0]!=='')rows.push(row);return rows}
    var data=null,map=[];
    function valid(field,v){if(field==='email')return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);if(field==='name')return v.trim().length>0;return true}
    function draw(){
      var box=$('[data-zprev]',host);if(!data){box.innerHTML='';return}
      var head=data[0],rows=data.slice(1),bad=0,okRows=0;
      var chk=rows.map(function(r){var errs=0;r.forEach(function(v,i){if(map[i]!=='skip'&&!valid(map[i],v))errs++});if(errs)bad++;else okRows++;return errs});
      var h='<div class="z-chd">Map your columns</div><div class="z-scroll"><table><thead><tr>'+head.map(function(c,i){return '<th><div class="inp sel"><select data-zm="'+i+'">'+FIELDS.map(function(f){return '<option value="'+f[0]+'"'+(map[i]===f[0]?' selected':'')+'>'+f[1]+'</option>'}).join('')+'</select></div><div class="muted" style="font-size:11.5px;padding:5px 2px 0;font-weight:600">'+esc(c)+'</div></th>'}).join('')+'</tr></thead><tbody>'
        +rows.slice(0,6).map(function(r){return '<tr>'+head.map(function(_,i){var v=r[i]==null?'':r[i],isBad=map[i]!=='skip'&&!valid(map[i],v);return '<td'+(isBad?' class="bad" title="Invalid value"':'')+(map[i]==='skip'?' style="opacity:.4"':'')+'>'+esc(v)+'</td>'}).join('')+'</tr>'}).join('')+'</tbody></table></div>'
        +'<div class="row wrap" style="justify-content:space-between"><div class="row wrap" style="gap:6px"><span class="badge good">'+I('tick-02','xs')+okRows+' ready</span>'+(bad?'<span class="badge bad">'+I('alert-circle','xs')+bad+' with errors</span>':'')+'<span class="muted" style="font-size:12.5px">'+rows.length+' rows</span></div><div class="row"><button class="btn s ghost" data-zcancel>Cancel</button><button class="btn s" data-zimp'+(okRows?'':' disabled')+'>Import '+okRows+' rows</button></div></div>';
      box.innerHTML=h;
    }
    function load(text){var p=parse(text);if(p.length<2){toast('That file looks empty','bad');return}data=p;map=p[0].map(function(c){c=c.toLowerCase().trim();return ['name','email','plan','country'].indexOf(c)>-1?c:'skip'});draw()}
    $('[data-zsample]',host).addEventListener('click',function(){load(SAMPLE)});
    var dz=$('[data-zdrop]',host),fi=$('input',dz);
    dz.addEventListener('click',function(e){if(e.target!==fi)fi.click()});
    dz.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();fi.click()}});
    function readFile(f){if(!f)return;var rd=new FileReader();rd.onload=function(){load(String(rd.result))};rd.readAsText(f)}
    fi.addEventListener('change',function(e){e.stopPropagation();readFile(fi.files[0]);fi.value=''});
    dz.addEventListener('drop',function(e){e.preventDefault();e.stopPropagation();dz.classList.remove('over');readFile(e.dataTransfer.files[0])});
    host.addEventListener('change',function(e){var s=e.target.dataset&&e.target.dataset.zm;if(s!==undefined&&s!==''){map[+s]=e.target.value;draw()}});
    host.addEventListener('click',function(e){
      if(e.target.closest('[data-zcancel]')){data=null;draw()}
      var im=e.target.closest('[data-zimp]');if(im){var n=im.textContent.replace(/\D/g,'');data=null;draw();toast(n+' contacts imported','good')}
    });
  })();

  /* ===== wizard ===== */
  (function(){
    var host=$('[data-zw="wizard"]',R);if(!host)return;
    var step=0,panes=$$('.z-pane',host),steps=$$('.step',host),back=$('[data-zback]',host),next=$('[data-znext]',host),foot=$('[data-zfoot]',host);
    function setErr(inp,msg){var f=inp.closest('.field')||inp.parentNode,e=$('.err',f);var w=inp.closest('.inp');if(w)w.classList.toggle('bad',!!msg);if(e){e.hidden=!msg;e.innerHTML=msg?I('alert-circle','xs')+msg:''}}
    function validate(s){
      var ok=true;
      if(s===0){var n=$('[data-f="name"]',host),m=$('[data-f="email"]',host);
        if(n.value.trim().length<2){setErr(n,'Please enter your name');ok=false}else setErr(n,'');
        if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.value.trim())){setErr(m,'Enter a valid email address');ok=false}else setErr(m,'')}
      if(s===2){var t=$('[data-f="terms"]',host),e=$('.err',t.closest('.field'));if(!t.checked){e.hidden=false;e.innerHTML=I('alert-circle','xs')+'You need to accept the terms';ok=false}else e.hidden=true}
      return ok;
    }
    function show(n){
      step=n;panes.forEach(function(p,i){p.classList.toggle('on',i===n)});
      steps.forEach(function(s,i){s.className='step'+(i<n?' done':i===n?' cur':'');$('i',s).innerHTML=i<n?I('tick-02','xs'):(i+1)});
      back.disabled=n===0;next.textContent=n===2?'Create workspace':'Continue';
      foot.hidden=n===3;if(n===3)$('.steps',host).hidden=false;
      if(n===2){$('[data-zsum]',host).innerHTML='<dt>Name</dt><dd>'+esc($('[data-f="name"]',host).value||'—')+'</dd><dt>Email</dt><dd>'+esc($('[data-f="email"]',host).value||'—')+'</dd><dt>Plan</dt><dd>'+esc($('input[name="zwp"]:checked',host).value)+'</dd>'}
    }
    next.addEventListener('click',function(){if(!validate(step))return;if(step<3){show(step+1);if(step===3)toast('Workspace created','good')}});
    back.addEventListener('click',function(){if(step>0)show(step-1)});
    host.addEventListener('input',function(e){if(e.target.dataset.f)validate0live(e.target)});
    function validate0live(t){if(t.dataset.f==='name'&&t.value.trim().length>=2)setErr(t,'');if(t.dataset.f==='email'&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t.value.trim()))setErr(t,'')}
    $('[data-zwrestart]',host).addEventListener('click',function(){$$('[data-f]',host).forEach(function(i){if(i.type==='checkbox')i.checked=false;else i.value=''});show(0)});
    host.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target.tagName==='INPUT'&&e.target.type!=='radio'&&e.target.type!=='checkbox'){e.preventDefault();next.click()}});
    show(0);
  })();

  /* ===== repeater ===== */
  (function(){
    var host=$('[data-zw="repeater"]',R);if(!host)return;
    var rows=[{n:'Design system audit',q:1,p:1200},{n:'Icon set',q:2,p:350}],box=$('[data-zrows]',host);
    function total(){var t=rows.reduce(function(a,r){return a+(+r.q||0)*(+r.p||0)},0);$('[data-ztotal]',host).textContent='$'+fmt(t)}
    function draw(){
      box.innerHTML=rows.map(function(r,i){return '<div class="z-rr" data-i="'+i+'"><div class="inp"><input data-k="n" value="'+esc(r.n)+'" placeholder="Description" aria-label="Description"></div><div class="inp"><input data-k="q" type="number" min="0" value="'+r.q+'" aria-label="Quantity"></div><div class="inp"><input data-k="p" type="number" min="0" value="'+r.p+'" aria-label="Price"></div><button class="btn sq ghost" style="height:38px;width:38px" data-zdel aria-label="Remove line"'+(rows.length<2?' disabled':'')+'>'+I('delete-02','s')+'</button></div>'}).join('');total();
    }
    draw();
    host.addEventListener('input',function(e){var t=e.target,r=t.closest('.z-rr');if(!r)return;rows[+r.dataset.i][t.dataset.k]=t.dataset.k==='n'?t.value:Math.max(0,parseFloat(t.value)||0);total()});
    host.addEventListener('click',function(e){
      if(e.target.closest('[data-zradd]')){rows.push({n:'',q:1,p:0});draw();var l=$$('.z-rr input[data-k="n"]',box).pop();if(l)l.focus()}
      var d=e.target.closest('[data-zdel]');if(d&&rows.length>1){rows.splice(+d.closest('.z-rr').dataset.i,1);draw()}
    });
  })();

  /* ===== signature ===== */
  (function(){
    var host=$('[data-zw="sign"]',R);if(!host)return;
    var pad=$('[data-zpad]',host),cv=$('canvas',pad),cx=cv.getContext('2d'),strokes=[],cur=null,dpr=1;
    function ink(){return getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()||'#000'}
    function size(){dpr=window.devicePixelRatio||1;var w=pad.clientWidth,h=pad.clientHeight;cv.width=w*dpr;cv.height=h*dpr;cx.setTransform(dpr,0,0,dpr,0,0);redraw()}
    function line(s){cx.strokeStyle=s.c;cx.lineWidth=2.6;cx.lineCap='round';cx.lineJoin='round';cx.beginPath();s.p.forEach(function(p,i){if(i===0)cx.moveTo(p[0],p[1]);else{var q=s.p[i-1];cx.quadraticCurveTo(q[0],q[1],(q[0]+p[0])/2,(q[1]+p[1])/2)}});if(s.p.length===1){cx.lineTo(s.p[0][0]+.1,s.p[0][1])}cx.stroke()}
    function redraw(){cx.clearRect(0,0,cv.width,cv.height);strokes.forEach(function(s){s.c=ink();line(s)});pad.classList.toggle('has',strokes.length>0)}
    function pt(e){var b=cv.getBoundingClientRect();return [e.clientX-b.left,e.clientY-b.top]}
    cv.addEventListener('pointerdown',function(e){e.preventDefault();cv.setPointerCapture(e.pointerId);cur={c:ink(),p:[pt(e)]};strokes.push(cur);pad.classList.add('has');redraw()});
    cv.addEventListener('pointermove',function(e){if(!cur)return;cur.p.push(pt(e));redraw()});
    var end=function(){cur=null};cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',end);
    $('[data-zundo]',host).addEventListener('click',function(){strokes.pop();redraw();$('[data-zres]',host).hidden=true});
    $('[data-zclear]',host).addEventListener('click',function(){strokes=[];redraw();$('[data-zres]',host).hidden=true});
    $('[data-zsave]',host).addEventListener('click',function(){
      if(!strokes.length){toast('Draw your signature first','warn');return}
      var tmp=document.createElement('canvas'),w=pad.clientWidth,h=pad.clientHeight;tmp.width=w*2;tmp.height=h*2;var c2=tmp.getContext('2d');c2.scale(2,2);
      var keep=cx;cx=c2;strokes.forEach(line);cx=keep;
      var res=$('[data-zres]',host);$('img',res).src=tmp.toDataURL('image/png');res.hidden=false;toast('Signature saved','good');
    });
    new ResizeObserver(size).observe(pad);
    new MutationObserver(redraw).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    if(window.matchMedia)matchMedia('(prefers-color-scheme: dark)').addEventListener('change',function(){setTimeout(redraw,30)});
    size();
  })();

  /* ===== phone ===== */
  (function(){
    var host=$('[data-zw="phone"]',R);if(!host)return;
    var CT=[['RO','Romania','+40','### ### ###',9],['US','United States','+1','(###) ###-####',10],['GB','United Kingdom','+44','#### ######',10],['DE','Germany','+49','#### #######',11],['FR','France','+33','# ## ## ## ##',9],['IT','Italy','+39','### ### ####',10],['ES','Spain','+34','### ## ## ##',9],['NL','Netherlands','+31','# ########',9],['PL','Poland','+48','### ### ###',9],['MD','Moldova','+373','## ### ###',8],['AU','Australia','+61','### ### ###',9],['CA','Canada','+1','(###) ###-####',10]];
    var cur=CT[0],wrap=$('[data-zcc]',host),dd=$('.dd',wrap),list=$('[data-zcl]',wrap),inp=$('[data-zph]',host),hint=$('[data-zhint]',host);
    function fillList(q){q=(q||'').toLowerCase();list.innerHTML=CT.filter(function(c){return !q||c[1].toLowerCase().indexOf(q)>-1||c[2].indexOf(q)>-1}).map(function(c){return '<button type="button" data-zc="'+c[0]+'" class="'+(c===cur?'act':'')+'"><span class="z-cd">'+c[0]+'</span>'+c[1]+'<small>'+c[2]+'</small></button>'}).join('')||'<div class="muted" style="padding:12px;font-size:13px">No matches</div>'}
    function fmtNum(d){var p=cur[3],o='',k=0;for(var i=0;i<p.length&&k<d.length;i++){if(p[i]==='#')o+=d[k++];else o+=p[i]}return o}
    function upd(){var d=inp.value.replace(/\D/g,'').slice(0,cur[4]);inp.value=fmtNum(d);var ok=d.length===cur[4];wrap.closest('.field').querySelector('.z-ph>.inp').classList.toggle('ok',ok&&d.length>0);hint.style.color=ok?'var(--good)':'';hint.textContent=!d.length?'Enter your number':ok?'Looks good · '+cur[2]+' '+inp.value:(cur[4]-d.length)+' more digit'+(cur[4]-d.length===1?'':'s')}
    fillList();
    $('[data-dd]',wrap).addEventListener('click',function(e){e.stopPropagation();var o=dd.hidden;closeDD(dd);dd.hidden=!o;$('[data-dd]',wrap).setAttribute('aria-expanded',String(o));if(o){$('[data-zcq]',wrap).value='';fillList();setTimeout(function(){$('[data-zcq]',wrap).focus()},20)}});
    dd.addEventListener('click',function(e){e.stopPropagation();var b=e.target.closest('[data-zc]');if(!b)return;cur=CT.filter(function(c){return c[0]===b.dataset.zc})[0];$('[data-zcode]',wrap).textContent=cur[0];$('[data-zdial]',wrap).textContent=cur[2];closeDD();inp.value=inp.value.replace(/\D/g,'');upd();inp.focus()});
    $('[data-zcq]',wrap).addEventListener('input',function(e){fillList(e.target.value)});
    $('[data-zcq]',wrap).addEventListener('click',function(e){e.stopPropagation()});
    inp.addEventListener('input',upd);
  })();

  /* ===== money ===== */
  (function(){
    var host=$('[data-zw="money"]',R);if(!host)return;
    var RATE={USD:1,EUR:.92,GBP:.79,RON:4.58},SYM={USD:'$',EUR:'€',GBP:'£',RON:'lei'};
    var amt=$('[data-zamt]',host),sel=$('select[data-zs="cur"]',host),sym=$('[data-zsym]',host),conv=$('[data-zconv]',host);
    function clean(v){v=v.replace(/[^\d.]/g,'');var p=v.split('.');if(p.length>2)p=[p[0],p.slice(1).join('')];if(p[1]!=null)p[1]=p[1].slice(0,2);return p}
    function pretty(p){var i=p[0].replace(/^0+(?=\d)/,'');i=i.replace(/\B(?=(\d{3})+(?!\d))/g,',');return p[1]!=null?i+'.'+p[1]:i}
    function num(){var p=clean(amt.value);return parseFloat(p[0].replace(/,/g,'')+'.'+(p[1]||'0'))||0}
    function upd(){var c=sel.value;sym.textContent=SYM[c];var n=num();conv.textContent=n?('≈ '+['USD','EUR','GBP','RON'].filter(function(k){return k!==c}).map(function(k){return SYM[k]+(n/RATE[c]*RATE[k]).toLocaleString('en-US',{maximumFractionDigits:2,minimumFractionDigits:2})}).join(' · ')):'Enter an amount'}
    amt.addEventListener('input',function(){var s=amt.selectionStart,len=amt.value.length,p=clean(amt.value);amt.value=pretty(p);var d=amt.value.length-len;try{amt.setSelectionRange(s+d,s+d)}catch(e){}upd()});
    amt.addEventListener('blur',function(){if(!amt.value)return;var p=clean(amt.value);while((p[1]||'').length<2)p[1]=(p[1]||'')+'0';amt.value=pretty(p)});
    host.addEventListener('change',function(e){if(e.target===sel)upd()});
    upd();
  })();

  /* ===== dual range ===== */
  (function(){
    var host=$('[data-zw="drange"]',R);if(!host)return;
    var MIN=0,MAX=1000,STEP=10,v=[200,750],t=$('[data-zt]',host),th=$$('.z-th',t),fill=$('.z-f',t),out=$('[data-zout]',host);
    function pos(){var a=v[0]/MAX*100,b=v[1]/MAX*100;th[0].style.left=a+'%';th[1].style.left=b+'%';fill.style.left=a+'%';fill.style.width=(b-a)+'%';th.forEach(function(x,i){x.dataset.v='$'+fmt(v[i]);x.setAttribute('aria-valuenow',v[i]);x.setAttribute('aria-valuemin',i?v[0]:MIN);x.setAttribute('aria-valuemax',i?MAX:v[1])});out.textContent='$'+fmt(v[0])+' – $'+fmt(v[1])}
    function set(i,val){val=Math.round(val/STEP)*STEP;val=Math.min(MAX,Math.max(MIN,val));if(i===0)val=Math.min(val,v[1]-STEP);else val=Math.max(val,v[0]+STEP);v[i]=val;pos()}
    th.forEach(function(h,i){
      h.addEventListener('pointerdown',function(e){e.preventDefault();h.setPointerCapture(e.pointerId);h.focus();
        var mv=function(ev){var b=t.getBoundingClientRect();set(i,(ev.clientX-b.left)/b.width*MAX)};
        var up=function(){h.removeEventListener('pointermove',mv);h.removeEventListener('pointerup',up);h.removeEventListener('pointercancel',up)};
        h.addEventListener('pointermove',mv);h.addEventListener('pointerup',up);h.addEventListener('pointercancel',up)});
      h.addEventListener('keydown',function(e){var d={ArrowLeft:-STEP,ArrowDown:-STEP,ArrowRight:STEP,ArrowUp:STEP,PageUp:100,PageDown:-100}[e.key];if(e.key==='Home')set(i,i?v[0]+STEP:MIN);else if(e.key==='End')set(i,i?MAX:v[1]-STEP);else if(d){e.preventDefault();set(i,v[i]+d)}});
    });
    t.addEventListener('pointerdown',function(e){if(e.target.classList.contains('z-th'))return;var b=t.getBoundingClientRect(),val=(e.clientX-b.left)/b.width*MAX,i=Math.abs(val-v[0])<Math.abs(val-v[1])?0:1;set(i,val);th[i].focus()});
    pos();
  })();

  /* ===== mentions ===== */
  (function(){
    var host=$('[data-zw="mention"]',R);if(!host)return;
    var ed=$('.z-edi',host),mm=$('.z-mm',host),menu=$('.menu',mm),PPL=['Ana Vasile','Andrei Pop','Maria Ionescu','Sara Klein','Tom Hughes','Luca Bianchi'],items=[],idx=0,ctx=null;
    function find(){var s=getSelection();if(!s.rangeCount||!ed.contains(s.anchorNode))return null;var n=s.anchorNode;if(n.nodeType!==3)return null;var txt=n.textContent.slice(0,s.anchorOffset),m=/(^|\s)@([\w ]{0,20})$/.exec(txt);if(!m)return null;return {node:n,end:s.anchorOffset,start:s.anchorOffset-m[2].length-1,q:m[2]}}
    function render(){menu.innerHTML=items.map(function(p,i){return '<button type="button" role="option" data-n="'+i+'" class="'+(i===idx?'act':'')+'">'+av(p,{s:'xs'})+p+'</button>'}).join('')}
    function close(){mm.hidden=true;ctx=null}
    function upd(){ctx=find();if(!ctx){close();return}var q=ctx.q.toLowerCase();items=PPL.filter(function(p){return p.toLowerCase().indexOf(q)>-1});if(!items.length){close();return}idx=Math.min(idx,items.length-1);render();mm.hidden=false}
    function pick(i){
      var p=items[i];if(!p||!ctx)return;var n=ctx.node,rg=document.createRange();rg.setStart(n,ctx.start);rg.setEnd(n,ctx.end);rg.deleteContents();
      var chip=document.createElement('span');chip.className='z-m';chip.contentEditable='false';chip.textContent='@'+p;rg.insertNode(chip);
      var sp=document.createTextNode(' ');chip.after(sp);var s=getSelection(),r2=document.createRange();r2.setStart(sp,1);r2.collapse(true);s.removeAllRanges();s.addRange(r2);close();ed.focus();
    }
    ed.addEventListener('input',function(){idx=0;upd()});
    ed.addEventListener('keyup',function(e){if(['ArrowDown','ArrowUp','Enter','Escape'].indexOf(e.key)<0)upd()});
    ed.addEventListener('keydown',function(e){
      if(mm.hidden)return;
      if(e.key==='ArrowDown'){e.preventDefault();idx=(idx+1)%items.length;render()}
      else if(e.key==='ArrowUp'){e.preventDefault();idx=(idx-1+items.length)%items.length;render()}
      else if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();pick(idx)}
      else if(e.key==='Escape'){e.stopPropagation();close()}
    });
    ed.addEventListener('blur',function(){setTimeout(close,150)});
    menu.addEventListener('mousedown',function(e){e.preventDefault()});
    menu.addEventListener('click',function(e){var b=e.target.closest('[data-n]');if(b)pick(+b.dataset.n)});
    ed.addEventListener('paste',function(e){e.preventDefault();var t=(e.clipboardData||window.clipboardData).getData('text/plain');document.execCommand('insertText',false,t)});
  })();

  /* ===== sortable ===== */
  (function(){
    var host=$('[data-zw="sortable"]',R);if(!host)return;
    var data=[['Write the brief','Today · Ana'],['Design the hero','Tomorrow · Sara'],['Build the prototype','Friday · Tom'],['Usability test','Next week · Luca'],['Ship it','Next week · Ana']];
    function draw(){host.innerHTML=data.map(function(d,i){return '<div class="z-si" data-i="'+i+'"><button type="button" class="z-gr" aria-label="Reorder '+esc(d[0])+'. Use arrow keys." data-zgr>'+I('move','s')+'</button><span class="z-n">'+(i+1)+'</span><div class="tx"><b>'+d[0]+'</b><small>'+d[1]+'</small></div></div>'}).join('')}
    draw();
    var live=null;
    host.addEventListener('keydown',function(e){var g=e.target.closest('[data-zgr]');if(!g)return;var i=+g.closest('.z-si').dataset.i,j=e.key==='ArrowUp'?i-1:e.key==='ArrowDown'?i+1:-1;if(j<0||j>=data.length)return;e.preventDefault();var t=data.splice(i,1)[0];data.splice(j,0,t);draw();var nb=$$('[data-zgr]',host)[j];if(nb)nb.focus()});
    host.addEventListener('pointerdown',function(e){
      var g=e.target.closest('[data-zgr]');if(!g)return;e.preventDefault();
      var item=g.closest('.z-si'),items=$$('.z-si',host),from=+item.dataset.i,y0=e.clientY,h=item.offsetHeight+6,to=from;
      item.classList.add('z-lift');g.setPointerCapture(e.pointerId);
      var mv=function(ev){
        var dy=ev.clientY-y0;item.style.transform='translateY('+dy+'px) scale(1.02)';
        to=Math.max(0,Math.min(items.length-1,Math.round(from+dy/h)));
        items.forEach(function(it,k){if(it===item)return;var sh=0;if(from<to&&k>from&&k<=to)sh=-h;else if(from>to&&k<from&&k>=to)sh=h;it.style.transition='transform .2s var(--ease)';it.style.transform=sh?'translateY('+sh+'px)':''});
      };
      var up=function(){g.removeEventListener('pointermove',mv);g.removeEventListener('pointerup',up);g.removeEventListener('pointercancel',up);
        if(to!==from){var t=data.splice(from,1)[0];data.splice(to,0,t)}draw();var nb=$$('[data-zgr]',host)[to];if(nb&&e.pointerType!=='touch')nb.focus({preventScroll:true})};
      g.addEventListener('pointermove',mv);g.addEventListener('pointerup',up);g.addEventListener('pointercancel',up);
    });
  })();
}
