
/* ================= batch 8: accessibility layer (names, labels, scrollers) =================
   Idempotent. Runs on every DOM change (debounced) so pages and gallery sections built lazily are covered. */
(function(){
  document.documentElement.lang=document.documentElement.lang||'en';
  var ICN={'add-01':'Add','add-02':'Add','more-horizontal':'More actions','more-vertical':'More actions','menu-01':'Menu','menu-02':'Menu','cancel-01':'Close','search-01':'Search','delete-01':'Delete','delete-02':'Delete','edit-01':'Edit','edit-02':'Edit','copy-01':'Copy','share-01':'Share','download-01':'Download','upload-01':'Upload','arrow-left-01':'Previous','arrow-right-01':'Next','arrow-up-01':'Up','arrow-down-01':'Down','settings-01':'Settings','notification-01':'Notifications','home-01':'Home','bookmark-01':'Bookmarks','user':'Profile','filter':'Filter','play':'Play','pause':'Pause','refresh':'Refresh','layout-grid':'Grid view','list-view':'List view','grid-view':'Grid view','table-01':'Table view','align-left':'Align left','align-right':'Align right','bold':'Bold','italic':'Italic','underline':'Underline','link-01':'Link','mail-01':'Mail','tick-01':'Confirm','tick-02':'Confirm','sun-01':'Light theme','moon-01':'Dark theme','star':'Favorite','heart':'Like','volume-high':'Volume','full-screen':'Full screen','expand':'Expand','minimize':'Minimize','chart':'Chart','folder-01':'Projects'};
  function human(n){n=n.replace(/-\d+$/,'').replace(/-/g,' ');return n.charAt(0).toUpperCase()+n.slice(1)}
  function iconName(el){var u=el.querySelector('use');if(!u)return '';var h=(u.getAttribute('href')||'').replace('#i-','');return ICN[h]||human(h)}
  function txt(el){var c=el.cloneNode(true);var s=c.querySelectorAll('svg,.sr');for(var i=0;i<s.length;i++)s[i].remove();return (c.textContent||'').replace(/\s+/g,' ').trim()}
  function named(el){return el.getAttribute('aria-label')||el.getAttribute('aria-labelledby')||el.getAttribute('title')||txt(el)||(el.labels&&el.labels.length&&txt(el.labels[0]))}
  function fieldName(el){
    var f=el.closest('.field,.fld,.fg,.frow'),l=f&&f.querySelector(':scope > label,:scope > .lbl,:scope > .lab,:scope > span.l'),t=l&&txt(l);if(t)return t;
    var p=el.parentNode,k=0;while(p&&k<3){var pl=p.previousElementSibling;if(pl&&(pl.tagName==='LABEL'||/lbl|label/.test(pl.className))&&txt(pl))return txt(pl);p=p.parentNode;k++}
    var lab=el.closest('label');if(lab){var n=iconName(lab)||txt(lab);if(n)return n}
    if(el.placeholder)return el.placeholder;
    var v=el.getAttribute('name')||el.id;if(v)return human(v.replace(/^[a-z]{1,3}-/,''));
    if(el.type==='radio'||el.type==='checkbox'){var nx=el.nextElementSibling;if(nx&&txt(nx))return txt(nx)}
    return el.type?human(el.type):'Field';
  }
  function run(root){
    root=root||document;
    var i,els;
    els=root.querySelectorAll('input:not([type=hidden]):not([aria-label]):not([aria-labelledby]),textarea:not([aria-label]):not([aria-labelledby]),select:not([aria-label]):not([aria-labelledby])');
    for(i=0;i<els.length;i++){var e=els[i];if(!(e.labels&&e.labels.length&&txt(e.labels[0]))&&!e.title)e.setAttribute('aria-label',fieldName(e))}
    els=root.querySelectorAll('button:not([aria-label]):not([aria-labelledby]):not([title]),[role=button]:not([aria-label]):not([aria-labelledby]):not([title])');
    for(i=0;i<els.length;i++){if(!txt(els[i])){var n=iconName(els[i]);if(n)els[i].setAttribute('aria-label',n)}}
    els=root.querySelectorAll('a[href]:not([aria-label]):not([aria-labelledby]):not([title])');
    for(i=0;i<els.length;i++){if(!txt(els[i])){var n2=iconName(els[i]);els[i].setAttribute('aria-label',n2||(els[i].classList.contains('mbrand')?'Home':'Link'))}}
    els=root.querySelectorAll('nav:not([aria-label]):not([aria-labelledby])');
    for(i=0;i<els.length;i++){var pv=els[i].previousElementSibling;els[i].setAttribute('aria-label',pv&&/navlabel/.test(pv.className)?txt(pv):'Section')}
    els=root.querySelectorAll('th');
    for(i=0;i<els.length;i++){if(!els[i].textContent.trim()&&!els[i].querySelector('.sr,[aria-label]')){els[i].style.position='relative';els[i].innerHTML='<span class="sr">Actions</span>'}}
    scrollers(root);
  }
  function scrollers(root){
    var els=root.querySelectorAll('main *, #pages *'),i,e,cs;
    for(i=0;i<els.length;i++){e=els[i];if(e.tabIndex>=0||e.hasAttribute('tabindex')||!e.offsetParent)continue;
      if(e.scrollWidth<=e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1)continue;
      cs=getComputedStyle(e);if(!/(auto|scroll)/.test(cs.overflowX+cs.overflowY))continue;
      if(e.querySelector('a[href],button,input,select,textarea,[tabindex="0"]'))continue;
      e.setAttribute('tabindex','0');if(!e.getAttribute('role'))e.setAttribute('role','region');
      if(!e.getAttribute('aria-label')){var h=e.closest('.card,.stage');var hd=h&&h.querySelector('h3,h4,b');var base=(hd&&txt(hd)||'Scrollable content')+' (scrollable)',nn=document.querySelectorAll('[role=region][aria-label^="'+base.replace(/"/g,'')+'"]').length;e.setAttribute('aria-label',nn?base+' '+(nn+1):base)}
    }
  }
  var tm;function later(){clearTimeout(tm);tm=setTimeout(function(){run(document)},120)}
  new MutationObserver(later).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('resize',later);window.addEventListener('load',later);
  window.a11yEnhance=run;run(document);
})();
