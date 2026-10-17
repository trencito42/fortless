
/* ================= batch 7: full pages assembled from the new components ================= */
function zCache(){if(zCache.t)return zCache.t;var g=GAL_COUNT,d=document.createElement('div');d.innerHTML=buildExtra4()+buildExtra5()+buildExtra6();GAL_COUNT=g;zCache.t=d;return d}
function zComp(key,pid){var el=zCache().querySelector('[data-zw="'+key+'"]');if(!el)return '<div class="muted">Missing '+key+'</div>';return el.closest('.stage').innerHTML.replace(/name="(z[^"]*)"/g,'name="$1-'+pid+'"')}
function zCard(title,sub,html,cls){return '<div class="card'+(cls?' '+cls:'')+'" style="min-width:0">'+(title?'<div class="ch"><h3>'+title+'</h3>'+(sub?'<small>'+sub+'</small>':'')+'</div>':'')+'<div class="col" style="gap:10px;min-width:0">'+html+'</div></div>'}
function zHead(t,d,acts){return '<div class="ph"><div><h1>'+t+'</h1><p>'+d+'</p></div>'+(acts?'<div class="acts">'+acts+'</div>':'')+'</div>'}
var ZP={
 dashboard:['Dashboard','dashboard-square-01','Drag, resize and arrange widgets the way you work.',[['',[['widgets','','']]],['grid g2',[['live','Live traffic','Requests per second'],['cmdbar','Recent files','Select items to reveal actions']]],['grid g2',[['checklist','Getting started'],['nps','Quick pulse']]]]],
 studio:['Studio','layout-01','A flexible workspace: resizable panes, a collapsible sidebar and rich editing.',[['',[['split','Workspace panes','Drag any handle · double-click to reset']]],['grid g2',[['sidebar','Collapsible sidebar'],['mention','Comment editor','Type @ to mention someone']]],['grid g2',[['sortable','Priorities','Drag the handle or use the arrow keys'],['comments','Review thread','Comments can become tasks']]]]],
 forms:['Forms','note-01','Everything you need to capture structured input.',[['grid g2',[['wizard','New customer','3 steps with validation'],['repeater','Line items']]],['grid g3',[['phone','Contact'],['money','Budget'],['drange','Price filter']]],['grid g2',[['sign','Customer signature'],['rating','Feedback']]]]],
 data:['Data','table-01','Explore, shape and import your data.',null],
 reports:['Reports','chart-bar-line','Charts for every kind of question.',null],
 activity:['Activity','activity-01','Feeds, sync state and the health of the interface.',[['grid g2',[['infinite','Notifications feed','Scroll to load more'],['pull','Mobile feed','Pull down to refresh']]],['grid g2',[['offline','Offline queue','Actions wait for the connection'],['boundary','Widget health','Failures stay contained']]],['grid g2',[['skeleton','Loading states'],['empty','Empty states']]],['grid g2',[['version','Release notices'],['rating','Rate this page']]]]],
 messages:['Messages','message-01','Conversations, calls and threaded comments.',[['',[['chat','Inbox']]],['',[['call','Weekly design sync','Video call']]],['grid g2',[['comments','Thread','Comments with tasks and mentions'],['share','Share this thread']]]]],
 subscription:['Subscription','receipt','Plans, invoices and payment status.',[['',[['plans','Plan']]],['',[['invoices','Invoices']]]]],
 profile:['Profile','user-circle','How others see you.',[['',[['profile','Public profile']]],['grid g2',[['share','Share your profile'],['rating','Rate the experience']]]]],
 security:['Security','shield-01','Sign-in protection, devices and access keys.',[['grid g2',[['twofa','Two-factor authentication','Authenticator app'],['sessions','Active sessions','Devices signed in']]],['',[['apikeys','Integrations','Scoped access for your integrations']]],['',[['audit','Audit log','Every sensitive action']]]]],
 onboarding:['Onboarding','rocket-01','Guide new people and listen to what they say.',[['grid g2',[['checklist','Getting started'],['nps','How are we doing?']]],['grid g2',[['rating','Rate your experience'],['version','What is new']]],['',[['empty','Empty states','One for every page']]]]]
};
function zPage(id){
  var P=ZP[id],h=zHead(P[0],P[2],id==='data'?'<button class="btn" data-ztoast2="Opened import">'+I('upload-01')+'Import data</button>':'');
  if(id==='data'){
    var T=[['pivot','Pivot','Summarize by any two dimensions'],['rtable','Columns','Resize and reorder'],['vscroll','Large set','5,000 rows, instant scroll'],['qb','Filters','Build advanced queries'],['csv','Import','CSV with preview']];
    return h+'<div class="card" style="min-width:0"><div class="tabs under" data-tabs="dt" role="tablist" style="margin-bottom:16px">'+T.map(function(t,i){return '<button class="tab" role="tab" data-tab="'+t[0]+'" aria-selected="'+(i===0)+'">'+t[1]+'</button>'}).join('')+'</div>'+T.map(function(t,i){return '<div class="tp'+(i===0?' on':'')+'" data-tp="dt-'+t[0]+'"><p class="muted" style="margin-bottom:12px">'+t[2]+'</p>'+zComp(t[0],'data')+'</div>'}).join('')+'</div>';
  }
  if(id==='reports'){
    var k=[['Revenue','money-01','$48.2k',12.4,series(14,40,18,3,1.2),'var(--accent)','accent'],['Sessions','user-group','84.2k',8.1,series(14,50,20,8,.9),'var(--good)','good'],['Conversion','target-01','3.42%',-1.3,series(14,60,16,21,-.4),'var(--violet)','violet'],['Avg. order','receipt','$64',2.2,series(14,55,12,12,.3),'var(--warn)','warn']];
    var R=[['',[['candle','Price','Candlestick with volume']]],['',[['sankey','Visitor flow','Where people come from and where they end up']]],['',[['scatter','Campaign performance','Sessions vs conversion']]],['grid g2',[['combo','Revenue and conversion'],['dual','Visits and revenue']]],['grid g3',[['mgauge','System load'],['zgauge','Capacity'],['live','Live requests']]]];
    return h+'<div class="grid g4 keep2">'+k.map(function(x){return statTile(x[0],x[1],x[2],x[3],x[4],x[5],x[6])}).join('')+'</div>'+R.map(function(r){return '<div class="'+r[0]+'" style="'+(r[0]?'':'display:block')+'">'+r[1].map(function(c){return zCard(c[1],c[2],zComp(c[0],id))}).join('')+'</div>'}).join('');
  }
  return h+P[3].map(function(r){return '<div class="'+r[0]+'">'+r[1].map(function(c){return zCard(c[1]||'',c[2],zComp(c[0],id))}).join('')+'</div>'}).join('');
}
function zPagesSetup(){
  NAV.length=0;
  [['Workspace',[['overview','Overview','home-01'],['analytics','Analytics','analytics-01'],['projects','Projects','folder-01'],['board','Board','task-01'],['dashboard','Dashboard','dashboard-square-01'],['studio','Studio','layout-01'],['forms','Forms','note-01']]],
   ['Insights',[['data','Data','table-01'],['reports','Reports','chart-bar-line'],['activity','Activity','activity-01']]],
   ['Manage',[['team','Team','user-group'],['inbox','Inbox','mail-01',3],['messages','Messages','message-01'],['calendar','Calendar','calendar-01'],['billing','Billing','credit-card'],['subscription','Subscription','receipt']]],
   ['Account',[['profile','Profile','user-circle'],['security','Security','shield-01'],['onboarding','Onboarding','rocket-01']]],
   ['System',[['settings','Settings','settings-01'],['components','Components','layout-grid']]]].forEach(function(g){NAV.push(g)});
  Object.keys(ZP).forEach(function(id){PAGE[id]=[function(){return zPage(id)},function(){var r=document.getElementById('page-'+id);initExtra4(r);initExtra5(r);initExtra6(r)}]});
}
