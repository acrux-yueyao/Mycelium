#!/usr/bin/env python3
"""组装 孢子塑形台 HTML(内嵌形象数据,零依赖 canvas 渲染)"""
import json

DATA = open('bench_data.json').read()

HTML = r"""<title>孢子塑形台</title>
<style>
:root{
  --bg:#f6f5f0; --panel:#efede8; --ink:#1c1c1a; --soft:#8a8880;
  --line:#d9d6cc; --acc:#5b4fd0; --org:#b05a2a; --chip:#e7e4da;
}
:root:not([data-theme="light"]){}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#191816; --panel:#211f1c; --ink:#ece9e0; --soft:#8f8b80;
    --line:#39362f; --acc:#948be8; --chip:#2a2823;
  }
  :root:not([data-theme="light"]){ --acc:#9188e6; --org:#d0855a; }
}
:root[data-theme="dark"]{
  --bg:#191816; --panel:#211f1c; --ink:#ece9e0; --soft:#8f8b80;
  --line:#39362f; --acc:#9188e6; --org:#d0855a; --chip:#2a2823;
}
*{box-sizing:border-box; margin:0}
body{
  background:var(--bg); color:var(--ink);
  font-family:ui-monospace,'SF Mono',Menlo,Consolas,'Noto Sans Mono CJK SC',monospace;
  font-size:13px; height:100vh; display:flex; flex-direction:column; overflow:hidden;
}
header{
  display:flex; align-items:center; gap:14px; padding:10px 16px;
  border-bottom:1px solid var(--line); flex-wrap:wrap;
}
header h1{font-size:14px; letter-spacing:.14em; font-weight:700}
header .sub{color:var(--soft); font-size:11px}
main{flex:1; display:flex; min-height:0}
#rail{
  width:296px; min-width:296px; overflow-y:auto; padding:14px 16px 40px;
  border-right:1px solid var(--line); background:var(--panel);
}
#stage{flex:1; position:relative; min-width:0}
canvas{display:block; width:100%; height:100%; touch-action:none; cursor:grab}
fieldset{border:none; margin:0 0 18px}
legend{
  font-size:11px; letter-spacing:.18em; color:var(--acc);
  padding:0 0 8px; font-weight:700;
}
.row{display:flex; align-items:center; gap:8px; margin-bottom:9px}
.row label{flex:1; color:var(--ink)}
.row output{width:38px; text-align:right; color:var(--org); font-variant-numeric:tabular-nums}
input[type=range]{flex:1.6; accent-color:var(--acc); min-width:0}
select,button{
  font:inherit; color:var(--ink); background:var(--chip);
  border:1px solid var(--line); border-radius:4px; padding:4px 9px; cursor:pointer;
}
select:focus-visible,button:focus-visible,input:focus-visible{outline:2px solid var(--acc); outline-offset:1px}
button.primary{background:var(--acc); color:#fff; border-color:var(--acc)}
.toggle{display:flex; align-items:center; gap:7px; margin-bottom:9px; cursor:pointer}
.views{display:flex; gap:6px; flex-wrap:wrap}
.views button{padding:3px 8px; font-size:12px}
#stats{
  position:absolute; left:14px; bottom:12px; background:var(--panel);
  border:1px solid var(--line); border-radius:5px; padding:8px 12px;
  font-size:12px; line-height:1.7; color:var(--soft); pointer-events:none;
}
#stats b{color:var(--ink)}
#hint{position:absolute; right:14px; bottom:12px; color:var(--soft); font-size:11px}
dialog{
  border:1px solid var(--line); border-radius:6px; background:var(--panel);
  color:var(--ink); padding:18px; width:min(480px,90vw);
}
dialog::backdrop{background:rgba(20,18,14,.45)}
dialog textarea{
  width:100%; height:180px; font:inherit; font-size:11px; background:var(--bg);
  color:var(--ink); border:1px solid var(--line); border-radius:4px; padding:8px;
}
dialog .row{margin-top:10px; justify-content:flex-end}
.note{color:var(--soft); font-size:11px; line-height:1.6; margin-top:4px}
.modes{display:flex; gap:6px}
.modes button.on{background:var(--acc); color:#fff; border-color:var(--acc)}
#palette{display:flex; flex-wrap:wrap; gap:6px; margin-top:4px}
#palette button{width:24px; height:24px; padding:0; border-radius:4px; border:2px solid var(--line)}
#palette button.on{border-color:var(--org); outline:2px solid var(--org)}
</style>

<header>
  <h1>孢子塑形台</h1>
  <span class="sub">拖动旋转 · 滑杆即时重算 · 调好点「导出参数」发我</span>
  <span style="flex:1"></span>
  <select id="pick" aria-label="选择形象"></select>
  <span class="views" id="views"></span>
  <button class="primary" id="exportBtn">导出参数</button>
</header>
<main>
  <div id="rail">
    <fieldset>
      <legend>椭球包络 · 厚度分布</legend>
      <div class="row"><label>中心半厚(格)</label><input type=range id=halfMax min=1 max=5 step=1 value=3><output></output></div>
      <div class="row"><label>包络指数</label><input type=range id=power min=0.3 max=1.5 step=0.05 value=0.5><output></output></div>
      <div class="row"><label>横向饱满</label><input type=range id=ax min=0.7 max=1.5 step=0.05 value=1><output></output></div>
      <div class="row"><label>纵向饱满</label><input type=range id=ay min=0.7 max=1.5 step=0.05 value=1><output></output></div>
      <div class="row"><label>蛋心高度偏移</label><input type=range id=cy min=-3 max=3 step=0.5 value=0><output></output></div>
      <div class="row"><label>附肢厚度上限×</label><input type=range id=cap min=0.5 max=3 step=0.1 value=1><output></output></div>
      <label class="toggle"><input type=checkbox id=jitter>奇数余层随机分前后(关=严格对称)</label>
      <div class="note">指数 0.5=圆蛋肩线 · 1=直线锥 · 附肢上限压细腿薄檐</div>
    </fieldset>
    <fieldset>
      <legend>白云底座</legend>
      <div class="row"><label>云最高(行)</label><input type=range id=cloudK min=0 max=4 step=1 value=3><output></output></div>
      <div class="row"><label>云顶镂空率</label><input type=range id=erode min=0 max=0.8 step=0.05 value=0.45><output></output></div>
      <div class="row"><label>云厚(层)</label><input type=range id=cloudD min=1 max=3 step=1 value=2><output></output></div>
    </fieldset>
    <fieldset>
      <legend>核心舱 8列×7行</legend>
      <label class="toggle"><input type=checkbox id=core checked>启用(填实 · 锁深3 · 背面平)</label>
      <div class="row"><label>横向微调</label><input type=range id=coreDX min=-3 max=3 step=1 value=0><output></output></div>
      <div class="row"><label>纵向微调</label><input type=range id=coreDY min=-3 max=3 step=1 value=0><output></output></div>
      <label class="toggle"><input type=checkbox id=coreTint checked>橙色标出舱区</label>
    </fieldset>
    <fieldset>
      <legend>芽突(可选)</legend>
      <div class="row"><label>前后芽(颗)</label><input type=range id=budsFB min=0 max=12 step=1 value=0><output></output></div>
      <div class="row"><label>侧芽(颗)</label><input type=range id=budsS min=0 max=8 step=1 value=0><output></output></div>
    </fieldset>
    <fieldset>
      <legend>手工修改 · 逐格雕</legend>
      <div class="modes" id="modes">
        <button data-mode="view" class="on">观察</button><button data-mode="add">加块</button><button data-mode="del">删块</button><button data-mode="pick">取色</button>
      </div>
      <div class="note" style="margin:6px 0 8px">加块=点一个面,新块贴在那个面上 · 删块=点谁删谁 · 取色=吸走点中方块的颜色</div>
      <div id="palette"></div>
      <div class="row" style="margin-top:10px">
        <button id="undoBtn">撤销 (Z)</button>
        <button id="clearBtn">清空修改</button>
        <span id="editCount" style="color:var(--soft)"></span>
      </div>
    </fieldset>
  </div>
  <div id="stage">
    <canvas id="cv"></canvas>
    <div id="stats"></div>
    <div id="hint">拖动旋转 · 滚轮缩放</div>
  </div>
</main>
<dialog id="dlg">
  <b>参数 JSON</b>
  <p class="note">复制这段发给 Claude,规则会按同样的数值写进引擎。</p>
  <textarea id="dlgText" readonly></textarea>
  <div class="row">
    <button id="copyBtn">复制</button>
    <button id="closeBtn">关闭</button>
  </div>
</dialog>

<script>
'use strict';
const LIB = __DATA__;
const WHITE_HEX = '#f2efe6';

// ---------- 确定性随机 ----------
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

// ---------- 参数 ----------
const ids=['halfMax','power','ax','ay','cy','cap','cloudK','erode','cloudD','coreDX','coreDY','budsFB','budsS'];
const P={};
function readParams(){
  for(const id of ids) P[id]=parseFloat(document.getElementById(id).value);
  P.jitter=document.getElementById('jitter').checked;
  P.core=document.getElementById('core').checked;
  P.coreTint=document.getElementById('coreTint').checked;
  P.creature=document.getElementById('pick').value;
}

// ---------- 手工编辑状态 ----------
const EDITS=new Map();          // creature -> Map(key -> 'del' | hex)
const UNDO=[];                  // [creature, key, prevValue|undefined]
let mode='view', curColor=null;
function editsOf(id){ if(!EDITS.has(id))EDITS.set(id,new Map()); return EDITS.get(id); }

// ---------- 体素重建(与引擎同规则) ----------
let model=null;
function rebuild(){
  readParams();
  const d=LIB[P.creature], cols=d.cols, rows=d.rows;
  const body=Array.from({length:rows},()=>new Array(cols).fill(false));
  const colr={};
  for(const [c,r,hex] of d.cells){ const y=rows-1-r; body[y][c]=true; colr[c+','+y]=hex; }

  // EDT(暴力,网格很小)
  const edge=[];
  for(let y=-1;y<=rows;y++)for(let x=-1;x<=cols;x++)
    if(!(y>=0&&y<rows&&x>=0&&x<cols&&body[y][x])) edge.push([x,y]);
  const edt=Array.from({length:rows},()=>new Array(cols).fill(0));
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    if(!body[y][x])continue;
    let m=1e9;
    for(const [ex,ey] of edge){const dx=x-ex,dy=y-ey;const q=dx*dx+dy*dy;if(q<m)m=q;}
    edt[y][x]=Math.sqrt(m);
  }

  // 白云
  const K=P.cloudK|0, rngW=mulberry32(1100);
  const white=Array.from({length:rows},()=>new Array(cols).fill(false));
  if(K>0){
    for(let x=0;x<cols;x++){
      let first=-1;
      for(let y=0;y<rows;y++) if(body[y][x]){first=y;break}
      if(first>0&&first<=K) for(let y=0;y<first;y++) white[y][x]=true;
    }
    for(let y=0;y<Math.min(2,rows);y++){          // 腿间窄闭运算
      for(let x=0;x<cols;x++){
        if(body[y][x]||white[y][x])continue;
        let L=false,R=false;
        for(let k=1;k<=2;k++){
          if(x-k>=0&&(body[y][x-k]||white[y][x-k]))L=true;
          if(x+k<cols&&(body[y][x+k]||white[y][x+k]))R=true;
        }
        if(L&&R)white[y][x]=true;
      }
    }
    for(let x=0;x<cols;x++){                       // 云顶镂空
      let top=-1;
      for(let y=rows-1;y>=0;y--) if(white[y][x]){top=y;break}
      if(top>0&&rngW()<P.erode) white[top][x]=false;
    }
  }

  // 椭球包络
  let sx=0,sy=0,n=0,minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(body[y][x]){
    sx+=x;sy+=y;n++;
    minx=Math.min(minx,x);maxx=Math.max(maxx,x);
    miny=Math.min(miny,y);maxy=Math.max(maxy,y);
  }
  const ecx=sx/n, ecy=sy/n+P.cy;
  const a=Math.max((maxx-minx)/2,1)*P.ax, b=Math.max((maxy-miny)/2,1)*P.ay;
  const half=Array.from({length:rows},()=>new Array(cols).fill(0));
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    if(!body[y][x])continue;
    const r2=((x-ecx)/a)**2+((y-ecy)/b)**2;
    const env=P.halfMax*Math.pow(Math.max(0,1-r2),P.power);
    half[y][x]=Math.max(0,Math.min(Math.round(env),Math.ceil(edt[y][x]*P.cap)));
  }

  // 核心舱
  let coreW=null;
  if(P.core){
    let best=null;
    for(let ty=0;ty+7<=rows;ty++)for(let tx=0;tx+8<=cols;tx++){
      let miss=0;
      for(let yy=ty;yy<ty+7;yy++)for(let xx=tx;xx<tx+8;xx++) if(!body[yy][xx])miss++;
      const cyc=(ty+3.5)/rows, bias=(cyc>=0.4&&cyc<=0.8)?0:5;
      const s=miss+bias;
      if(best===null||s<best[0])best=[s,tx,ty];
    }
    if(best){
      let tx=Math.max(0,Math.min(cols-8,best[1]+P.coreDX));
      let ty=Math.max(0,Math.min(rows-7,best[2]+P.coreDY));
      coreW=[tx,ty];
      for(let yy=ty;yy<ty+7;yy++)for(let xx=tx;xx<tx+8;xx++){
        if(!body[yy][xx]){
          body[yy][xx]=true;
          out:for(let rr=1;rr<6;rr++)
            for(let dy=-rr;dy<=rr;dy++)for(let dx=-rr;dx<=rr;dx++){
              const k=(xx+dx)+','+(yy+dy);
              if(colr[k]){colr[xx+','+yy]=colr[k];break out}
            }
        }
        half[yy][xx]=Math.max(half[yy][xx],1);
      }
    }
  }

  // 铺体素
  const HMAX=6, Z=2*HMAX+3, MID=HMAX+1;
  const vox=new Map();     // "x,z,y" -> {hex, core}
  const rngJ=mulberry32(1111);
  const inCore=(x,y)=>coreW&&x>=coreW[0]&&x<coreW[0]+8&&y>=coreW[1]&&y<coreW[1]+7;
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    if(body[y][x]){
      const h=half[y][x], hex=colr[x+','+y]||'#b0aca0';
      let z0,z1;
      if(inCore(x,y)){
        const tot=Math.max(2*h+1,3);
        z1=MID+1; z0=z1-(tot-1);                 // 背面平齐
      }else if(P.jitter&&h>0&&rngJ()<0.5){
        z0=MID-h+1; z1=MID+h;                    // 余层偏后
      }else{
        z0=MID-h; z1=MID+h;
      }
      for(let z=z0;z<=z1;z++) vox.set(x+','+z+','+y,{hex,core:inCore(x,y)});
    }else if(white[y][x]){
      for(let z=MID;z<MID+P.cloudD;z++) vox.set(x+','+z+','+y,{hex:WHITE_HEX,cloud:true});
    }
  }

  // 芽突
  const rngB=mulberry32(11);
  const inner=[];
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++) if(body[y][x]&&edt[y][x]>=2&&!inCore(x,y)) inner.push([x,y]);
  for(let i=inner.length-1;i>0;i--){const j=(rngB()*(i+1))|0;[inner[i],inner[j]]=[inner[j],inner[i]]}
  let fb=0;
  for(const [x,y] of inner){
    if(fb>=P.budsFB)break;
    let zs=[];for(let z=0;z<Z;z++)if(vox.has(x+','+z+','+y))zs.push(z);
    if(!zs.length)continue;
    const z=(fb%2===0)?zs[0]-1:zs[zs.length-1]+1;
    const k=x+','+z+','+y;
    if(z>=0&&z<Z&&!vox.has(k)){vox.set(k,{hex:colr[x+','+y]});fb++}
  }
  const sidesList=[];
  for(let y=3;y<rows;y++)for(let x=0;x<cols;x++){
    if(!body[y][x])continue;
    for(const dx of[-1,1]){
      const nx=x+dx;
      if(nx>=0&&nx<cols&&!body[y][nx]&&!white[y][nx]) sidesList.push([x,y,dx]);
    }
  }
  for(let i=sidesList.length-1;i>0;i--){const j=(rngB()*(i+1))|0;[sidesList[i],sidesList[j]]=[sidesList[j],sidesList[i]]}
  let sb=0;
  for(const [x,y,dx] of sidesList){
    if(sb>=P.budsS)break;
    let zs=[];for(let z=0;z<Z;z++)if(vox.has(x+','+z+','+y))zs.push(z);
    if(!zs.length)continue;
    const z=zs[(zs.length/2)|0];
    const k=(x+dx)+','+z+','+y;
    let colEmpty=true;
    for(let zz=0;zz<Z;zz++)if(vox.has((x+dx)+','+zz+','+y)){colEmpty=false;break}
    if(colEmpty&&!vox.has(k)){vox.set(k,{hex:colr[x+','+y]});sb++}
  }

  // 手工编辑覆盖层
  const ed=editsOf(P.creature);
  for(const [k,v] of ed){
    if(v==='del') vox.delete(k);
    else vox.set(k,{hex:v,edited:true});
  }

  // 统计
  let pairs=0;
  for(const key of vox.keys()){
    const [x,z,y]=key.split(',').map(Number);
    if(vox.has((x+1)+','+z+','+y))pairs++;
    if(vox.has(x+','+(z+1)+','+y))pairs++;
    if(vox.has(x+','+z+','+(y+1)))pairs++;
  }
  model={vox,cols,rows,Z,count:vox.size,pairs,name:d.name};
  document.getElementById('editCount').textContent=ed.size?`已改 ${ed.size} 格`:'';
  document.getElementById('stats').innerHTML=
    `<b>${d.name}</b> · ${P.creature}<br>方块 <b>${vox.size}</b> · 缝 ${pairs} · 磁铁 ${pairs*2}<br>`+
    `实体约 ${cols*12}×${rows*12}×${Z*12}mm`;
}

// ---------- 渲染(canvas 等轴测画家算法) ----------
const cv=document.getElementById('cv'), ctx=cv.getContext('2d');
let az=-0.55, zoom=1, dragging=false, lastX=0;
let hitList=[], hover=null;
const DELTA={'+x':[1,0,0],'-x':[-1,0,0],'+z':[0,1,0],'-z':[0,-1,0],'+y':[0,0,1],'-y':[0,0,-1]};
function shade(hex,f){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),bl=parseInt(hex.slice(5,7),16);
  return `rgb(${(r*f)|0},${(g*f)|0},${(bl*f)|0})`;
}
function render(){
  const dpr=window.devicePixelRatio||1;
  const w=cv.clientWidth,h=cv.clientHeight;
  if(cv.width!==w*dpr||cv.height!==h*dpr){cv.width=w*dpr;cv.height=h*dpr}
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  if(!model)return;
  const {vox,cols,rows,Z}=model;
  const s=Math.min(w/(cols+Z+4),h/(rows+6))*0.92*zoom;
  const ca=Math.cos(az),sa=Math.sin(az);
  const cx0=cols/2,cz0=Z/2,cy0=rows/2;
  const proj=(x,y,z)=>{
    const xr=(x-cx0)*ca-(z-cz0)*sa;
    const zr=(x-cx0)*sa+(z-cz0)*ca;
    return [w/2+xr*s, h/2-((y-cy0)*0.95*s)+zr*0.5*s, zr];
  };
  hitList=[];
  const items=[];
  for(const [key,v] of vox){
    const [x,z,y]=key.split(',').map(Number);
    const zr=(x-cx0)*sa+(z-cz0)*ca;
    items.push([zr,y,x,z,v]);
  }
  items.sort((p,q)=>p[0]-q[0]||p[1]-q[1]);
  const edgeC=getComputedStyle(document.documentElement).getPropertyValue('--line').trim();
  for(const [,yy,x,z,v] of items){
    const y=yy;
    const p={};
    for(const [dx,dy,dz] of [[0,0,0],[1,0,0],[0,1,0],[0,0,1],[1,1,0],[1,0,1],[0,1,1],[1,1,1]]){
      p[dx+''+dy+''+dz]=proj(x+dx,y+dy,z+dz);
    }
    const key=x+','+z+','+y;
    const face=(a,b,c,d,f,fname)=>{
      const path=new Path2D();
      path.moveTo(p[a][0],p[a][1]);path.lineTo(p[b][0],p[b][1]);
      path.lineTo(p[c][0],p[c][1]);path.lineTo(p[d][0],p[d][1]);
      path.closePath();
      ctx.fillStyle=shade(v.hex,f);
      ctx.fill(path);
      const isHover=hover&&hover.key===key&&hover.face===fname&&mode!=='view';
      ctx.strokeStyle=isHover?'#ff5533':(v.edited?getComputedStyle(document.documentElement).getPropertyValue('--acc').trim():(v.core&&P.coreTint?'#c9793a':edgeC));
      ctx.lineWidth=isHover?2.2:(v.edited?1.2:(v.core&&P.coreTint?1.1:0.55));
      ctx.stroke(path);
      hitList.push({path,key,face:fname});
    };
    // 六面全画,面级画家排序(顺序只随视角变,逐帧算一次即可,这里直接内联)
    const FACES=[
      ['-y',['000','100','101','001'],0.5, 0],
      ['+y',['010','110','111','011'],1.0, 0],
      ['-x',['000','010','011','001'],0.8,-0.5*sa],
      ['+x',['100','110','111','101'],0.8, 0.5*sa],
      ['-z',['000','100','110','010'],0.65,-0.5*ca],
      ['+z',['001','101','111','011'],0.65, 0.5*ca],
    ];
    FACES.sort((A,B)=>(A[3]-B[3])||(A[0]==='-y'?-1:0)-(B[0]==='-y'?-1:0));
    for(const [fn,vs,f] of FACES) face(vs[0],vs[1],vs[2],vs[3],f,fn);
  }
}
function loop(){render();requestAnimationFrame(loop)}

// ---------- 交互 ----------
function hitTest(e){
  const r=cv.getBoundingClientRect();
  const dpr=window.devicePixelRatio||1;
  const px=(e.clientX-r.left)*dpr, py=(e.clientY-r.top)*dpr;
  for(let i=hitList.length-1;i>=0;i--){
    if(ctx.isPointInPath(hitList[i].path,px,py)) return hitList[i];
  }
  return null;
}
let downX=0,downY=0,movedFar=false;
cv.addEventListener('pointerdown',e=>{
  dragging=true;movedFar=false;lastX=e.clientX;downX=e.clientX;downY=e.clientY;
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove',e=>{
  if(dragging){
    if(Math.abs(e.clientX-downX)+Math.abs(e.clientY-downY)>5)movedFar=true;
    if(movedFar){az+=(e.clientX-lastX)*0.008}
    lastX=e.clientX;
  }
  if(mode!=='view'&&!movedFar) hover=hitTest(e);
  else if(movedFar) hover=null;
});
cv.addEventListener('pointerup',e=>{
  dragging=false;
  if(movedFar||mode==='view')return;
  const hit=hitTest(e);
  if(!hit)return;
  const ed=editsOf(P.creature);
  if(mode==='del'){
    UNDO.push([P.creature,hit.key,ed.get(hit.key)]);
    ed.set(hit.key,'del');
    rebuild();
  }else if(mode==='pick'){
    const v=model.vox.get(hit.key);
    if(v){curColor=v.hex;paintPalette()}
  }else if(mode==='add'){
    const [dx,dz,dy]=DELTA[hit.face];
    const [x,z,y]=hit.key.split(',').map(Number);
    const nk=(x+dx)+','+(z+dz)+','+(y+dy);
    const [nx,nz,ny]=[x+dx,z+dz,y+dy];
    if(nx<0||nz<0||ny<0||nx>=model.cols||nz>=model.Z||ny>=model.rows+3)return;
    if(model.vox.has(nk))return;
    UNDO.push([P.creature,nk,ed.get(nk)]);
    ed.set(nk,curColor||'#b0aca0');
    rebuild();
  }
});
cv.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(0.4,Math.min(2.5,zoom*(e.deltaY<0?1.08:0.92)))},{passive:false});

const pick=document.getElementById('pick');
for(const id in LIB){
  const o=document.createElement('option');
  o.value=id;o.textContent=LIB[id].name+' ('+id+')';
  pick.appendChild(o);
}
pick.value='demo-11';

const VIEWS=[['正面',-0.001],['45°',-0.55],['侧面',-1.57],['背面',3.14]];
const vbox=document.getElementById('views');
for(const [name,a] of VIEWS){
  const b=document.createElement('button');
  b.textContent=name;
  b.onclick=()=>{az=a};
  vbox.appendChild(b);
}

for(const id of ids){
  const el=document.getElementById(id);
  const out=el.parentElement.querySelector('output');
  const sync=()=>{if(out)out.textContent=el.value};
  sync();
  el.addEventListener('input',()=>{sync();rebuild()});
}
for(const id of ['jitter','core','coreTint'])
  document.getElementById(id).addEventListener('change',rebuild);
pick.addEventListener('change',()=>{curColor=null;readParams();paintPalette();rebuild()});

// 模式切换
const modesBox=document.getElementById('modes');
modesBox.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b)return;
  mode=b.dataset.mode;
  for(const bb of modesBox.querySelectorAll('button'))bb.classList.toggle('on',bb===b);
  cv.style.cursor=mode==='view'?'grab':'crosshair';
  hover=null;
});
document.addEventListener('keydown',e=>{
  if(e.key==='z'||e.key==='Z')doUndo();
});
// 调色板
function paintPalette(){
  const box=document.getElementById('palette');
  box.innerHTML='';
  const seen=new Set();
  const cells=LIB[P.creature].cells;
  const colors=[];
  for(const [,,hx] of cells) if(!seen.has(hx)){seen.add(hx);colors.push(hx)}
  colors.push(WHITE_HEX,'#22201e');
  if(curColor===null)curColor=colors[0];
  for(const hx of colors.slice(0,14)){
    const b=document.createElement('button');
    b.style.background=hx; b.title=hx;
    b.setAttribute('aria-label','颜色 '+hx);
    if(hx===curColor)b.classList.add('on');
    b.onclick=()=>{curColor=hx;paintPalette()};
    box.appendChild(b);
  }
}
function doUndo(){
  const last=UNDO.pop(); if(!last)return;
  const [cid,key,prev]=last;
  const ed=editsOf(cid);
  if(prev===undefined)ed.delete(key); else ed.set(key,prev);
  rebuild();
}
document.getElementById('undoBtn').onclick=doUndo;
document.getElementById('clearBtn').onclick=()=>{editsOf(P.creature).clear();UNDO.length=0;rebuild()};

const dlg=document.getElementById('dlg');
document.getElementById('exportBtn').onclick=()=>{
  readParams();
  const ed=editsOf(P.creature);
  const adds=[],dels=[];
  for(const [k,v] of ed){
    const c=k.split(',').map(Number);
    if(v==='del')dels.push(c); else adds.push([...c,v]);
  }
  const out={tool:'spore-shaping-bench',version:2,params:P,
             edits:{adds,dels},cubes:model.count,magnets:model.pairs*2};
  document.getElementById('dlgText').value=JSON.stringify(out,null,2);
  dlg.showModal();
};
document.getElementById('copyBtn').onclick=()=>{
  navigator.clipboard.writeText(document.getElementById('dlgText').value);
  document.getElementById('copyBtn').textContent='已复制 ✓';
  setTimeout(()=>document.getElementById('copyBtn').textContent='复制',1400);
};
document.getElementById('closeBtn').onclick=()=>dlg.close();

readParams();
paintPalette();
rebuild();
loop();
</script>
"""

html = HTML.replace('__DATA__', DATA)
open('spore_bench.html', 'w').write(html)
print('wrote spore_bench.html', len(html), 'bytes')
