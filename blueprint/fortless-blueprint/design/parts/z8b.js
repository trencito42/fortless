
/* ---- batch 8b: focus management and keyboard models ---- */
(function(){
  function $(s,r){return (r||document).querySelector(s)}function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
  function vis(e){return e.offsetParent!==null||e.getClientRects().length>0}
  /* modal focus trap */
  document.addEventListener('keydown',function(e){
    if(e.key!=='Tab')return;
    var open=$$('.scrim').filter(function(x){return !x.hidden}).pop();if(!open)return;
    var box=$('.modal,.cmd,.sheet,.drawer',open)||open;
    var f=$$('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',box).filter(vis);
    if(!f.length){e.preventDefault();box.setAttribute('tabindex','-1');box.focus();return}
    var a=f[0],z=f[f.length-1],cur=document.activeElement;
    if(!box.contains(cur)){e.preventDefault();a.focus();return}
    if(e.shiftKey&&cur===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&cur===z){e.preventDefault();a.focus()}
  },true);
  /* split panes: expose value */
  function sepSync(h){var A=h.previousElementSibling,P=h.parentNode;if(!A||!P)return;var hor=h.getAttribute('aria-orientation')==='vertical',tot=P.getBoundingClientRect()[hor?'width':'height']||1,sz=A.getBoundingClientRect()[hor?'width':'height'];
    h.setAttribute('aria-valuemin','0');h.setAttribute('aria-valuemax','100');h.setAttribute('aria-valuenow',String(Math.round(sz/tot*100)))}
  function seps(){$$('[role=separator][aria-orientation]').forEach(sepSync)}
  /* tabs: roving tabindex + arrow keys */
  function tabsSync(){$$('[role=tablist]').forEach(function(l){var t=$$('[role=tab]',l),s=t.filter(function(x){return x.getAttribute('aria-selected')==='true'})[0]||t[0];t.forEach(function(x){x.tabIndex=x===s?0:-1})})}
  document.addEventListener('keydown',function(e){var t=e.target.closest&&e.target.closest('[role=tab]');if(!t)return;var l=t.closest('[role=tablist]'),a=$$('[role=tab]',l).filter(function(x){return !x.disabled}),i=a.indexOf(t),n=-1;
    if(e.key==='ArrowRight'||e.key==='ArrowDown')n=(i+1)%a.length;else if(e.key==='ArrowLeft'||e.key==='ArrowUp')n=(i-1+a.length)%a.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=a.length-1;
    if(n<0)return;e.preventDefault();e.stopPropagation();a[n].click();a[n].focus();tabsSync()},true);
  /* menus (buttons with aria-haspopup=menu) */
  function items(m){return $$('a[href],button:not([disabled]),[role=menuitem]',m).filter(vis)}
  document.addEventListener('keydown',function(e){
    var tr=e.target.closest&&e.target.closest('[data-dd][aria-haspopup="menu"]');
    if(tr&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();var d=tr.parentNode.querySelector('.dd');if(!d)return;if(d.hidden)tr.click();setTimeout(function(){var it=items(d);if(it.length)(e.key==='ArrowUp'?it[it.length-1]:it[0]).focus()},30);return}
    var m=e.target.closest&&e.target.closest('.dd');if(!m)return;var wrap=m.parentNode,trg=wrap&&wrap.querySelector('[data-dd][aria-haspopup="menu"]');if(!trg)return;
    var it=items(m),i=it.indexOf(document.activeElement);if(!it.length)return;
    if(e.key==='ArrowDown'){e.preventDefault();it[(i+1)%it.length].focus()}else if(e.key==='ArrowUp'){e.preventDefault();it[(i-1+it.length)%it.length].focus()}
    else if(e.key==='Home'){e.preventDefault();it[0].focus()}else if(e.key==='End'){e.preventDefault();it[it.length-1].focus()}
    else if(e.key==='Escape'){e.stopPropagation();e.preventDefault();if(!m.hidden)trg.click();trg.focus()}else if(e.key==='Tab'){if(!m.hidden)trg.click()}
  },true);
  /* tree: roving tabindex, arrows, expand/collapse (markup carries the roles) */
  function titems(t){return $$('[role=treeitem]',t).filter(vis)}
  function treeRove(t,cur){var it=titems(t);cur=cur||it.filter(function(x){return x.tabIndex===0})[0]||it[0];$$('[role=treeitem]',t).forEach(function(x){x.tabIndex=x===cur?0:-1})}
  function toggle(n,open){var o=open===undefined?!n.classList.contains('open'):open;n.classList.toggle('open',o);n.setAttribute('aria-expanded',String(o))}
  document.addEventListener('click',function(e){var r=e.target.closest&&e.target.closest('.tree .tn>.tr0');if(r){var n=r.parentNode;toggle(n);treeRove(n.closest('.tree'),n);n.focus()}var l=e.target.closest&&e.target.closest('.tree .leaf');if(l)treeRove(l.closest('.tree'),l)});
  document.addEventListener('keydown',function(e){var el=e.target.closest&&e.target.closest('[role=treeitem]');if(!el||e.target!==el)return;var t=el.closest('.tree');if(!t)return;var it=titems(t),i=it.indexOf(el),n=null,node=el.classList.contains('tn');
    if(e.key==='ArrowDown')n=it[Math.min(it.length-1,i+1)];else if(e.key==='ArrowUp')n=it[Math.max(0,i-1)];else if(e.key==='Home')n=it[0];else if(e.key==='End')n=it[it.length-1];
    else if(e.key==='ArrowRight'&&node){e.preventDefault();if(!el.classList.contains('open'))toggle(el,true);else n=it[i+1]}
    else if(e.key==='ArrowLeft'){if(node&&el.classList.contains('open')){e.preventDefault();toggle(el,false)}else{var p=el.parentNode.closest('.tn');if(p){e.preventDefault();n=p}}}
    else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(node)toggle(el);else el.click()}
    if(n){e.preventDefault();treeRove(t,n);n.focus()}},true);
  document.addEventListener('focusin',function(e){var el=e.target.closest&&e.target.closest('[role=treeitem]');if(el&&e.target===el){var t=el.closest('.tree');if(t)treeRove(t,el)}});
  function treeSetup(){}
  /* command palette combobox */
  function cmdSync(){var inp=$('#cmd-in'),res=$('#cmd-res');if(!inp||!res)return;inp.setAttribute('role','combobox');inp.setAttribute('aria-controls','cmd-res');inp.setAttribute('aria-autocomplete','list');inp.setAttribute('aria-expanded',String(!$('#cmd').hidden));res.setAttribute('role','listbox');res.setAttribute('aria-label','Results');
    var act=null;$$('.it',res).forEach(function(b,i){b.setAttribute('role','option');b.id='cmd-o'+i;var on=b.classList.contains('act');b.setAttribute('aria-selected',String(on));if(on)act=b.id});$$('.hd',res).forEach(function(h){h.setAttribute('role','presentation')});
    if(act)inp.setAttribute('aria-activedescendant',act);else inp.removeAttribute('aria-activedescendant')}
  /* headings: no skipped levels */
  function headings(){var last=1;$$('h1,h2,h3,h4,h5,h6,[role=heading]').forEach(function(h){if(!vis(h))return;var n=h.hasAttribute('data-hl0')?+h.getAttribute('data-hl0'):(h.tagName[0]==='H'?+h.tagName[1]:+(h.getAttribute('aria-level')||2));if(!h.hasAttribute('data-hl0'))h.setAttribute('data-hl0',n);
    var eff=n>last+1?last+1:n;if(eff!==n)h.setAttribute('aria-level',String(eff));else if(h.hasAttribute('aria-level')&&h.tagName[0]==='H')h.removeAttribute('aria-level');last=eff})}
  var tm;function all(){treeSetup();tabsSync();seps();cmdSync();headings()}
  function later(){clearTimeout(tm);tm=setTimeout(all,100)}
  new MutationObserver(later).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-selected','class','hidden','open']});
  window.addEventListener('hashchange',later);window.addEventListener('resize',later);
  document.addEventListener('pointerup',function(){setTimeout(seps,30)},true);document.addEventListener('keyup',function(){setTimeout(seps,30)},true);
  window.addEventListener('load',all);all();
})();
