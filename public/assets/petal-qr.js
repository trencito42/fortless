/* Supplied Petal QR encoder (public-domain Nayuki port). */
/* ---- QR encoder (byte mode, ported from the public-domain algorithm by Nayuki) ---- */
window.PetalQR=(function(){
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


