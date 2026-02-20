// ══════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════
const $ = id => document.getElementById(id);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const fmt = (n,d=1) => n >= 1e15 ? (n/1e15).toFixed(d)+'P' : n >= 1e12 ? (n/1e12).toFixed(d)+'T' : n >= 1e9 ? (n/1e9).toFixed(d)+'G' : n >= 1e6 ? (n/1e6).toFixed(d)+'M' : n >= 1e3 ? (n/1e3).toFixed(d)+'K' : n.toFixed(d);

function show(idx) {
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',i===idx));
  document.querySelectorAll('.panel').forEach((p,i)=>p.classList.toggle('active',i===idx));
}

// Chart defaults
const chartDefaults = {
  color: '#5a6a80',
  borderColor: '#252b3a',
  backgroundColor: 'transparent'
};
Chart.defaults.color = '#5a6a80';
Chart.defaults.borderColor = '#252b3a';

function mkChart(id, type, data, options={}) {
  const ctx = $(id).getContext('2d');
  return new Chart(ctx, {type, data, options:{
    responsive:true, maintainAspectRatio:false,
    plugins:{legend:{labels:{color:'#8a9ab0',font:{family:'IBM Plex Mono',size:11}}}},
    scales:{
      x:{ticks:{color:'#5a6a80',font:{family:'IBM Plex Mono',size:10}},grid:{color:'#171a23'}},
      y:{ticks:{color:'#5a6a80',font:{family:'IBM Plex Mono',size:10}},grid:{color:'#171a23'}}
    },
    ...options
  }});
}

// ══════════════════════════════════════════
// PANEL 1 — REDUCTION TREE
// ══════════════════════════════════════════
let depthChart;

function buildTree() {
  const N     = +$('treeN').value;
  const bits  = +$('treeBits').value;
  const svg   = $('tree-svg');
  svg.innerHTML = '';

  const depth   = Math.ceil(Math.log2(N)); // tree depth
  const W       = Math.max(900, N * 60);
  const H       = (depth + 3) * 80 + 60;
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);

  // Build tree nodes bottom-up
  // Level 0 = leaves (multiplier outputs)
  let levels = [];
  let leafNodes = [];
  for (let i=0; i<N; i++) {
    // Generate random 8 or 16 bit product values
    const maxVal = Math.pow(2, bits) - 1;
    leafNodes.push({
      val: Math.floor(Math.random() * maxVal),
      bitw: bits,
      id: `l0_${i}`
    });
  }
  levels.push(leafNodes);

  let cur = [...leafNodes];
  while (cur.length > 1) {
    const next = [];
    for (let i=0; i<cur.length; i+=2) {
      if (i+1 < cur.length) {
        const sum = cur[i].val + cur[i+1].val;
        next.push({ val: sum, bitw: cur[i].bitw+1, id:`node_${levels.length}_${i/2}`, children:[cur[i].id, cur[i+1].id] });
      } else {
        next.push({...cur[i]}); // odd node pass-through
      }
    }
    levels.push(next);
    cur = next;
  }
  // Add accumulator
  const acc = { val: cur[0].val + Math.floor(Math.random()*100), bitw:32, id:'acc', children:[cur[0].id] };
  levels.push([acc]);

  // Layout: assign x,y to each node
  const nodeMap = {};
  const py = (lvl) => H - 60 - lvl * 75;

  levels.forEach((lvl, li) => {
    const n = lvl.length;
    lvl.forEach((node, ni) => {
      const x = W * (ni + 0.5) / n;
      const y = py(li);
      node.x = x; node.y = y;
      nodeMap[node.id] = node;
    });
  });

  // Draw edges first
  const edgeG = document.createElementNS('http://www.w3.org/2000/svg','g');
  edgeG.id = 'edge-group';
  svg.appendChild(edgeG);
  levels.forEach(lvl => {
    lvl.forEach(node => {
      if (node.children) {
        node.children.forEach(cid => {
          const c = nodeMap[cid];
          const line = document.createElementNS('http://www.w3.org/2000/svg','path');
          const mx = (node.x + c.x)/2;
          line.setAttribute('d',`M${c.x},${c.y} C${c.x},${c.y-20} ${node.x},${node.y+20} ${node.x},${node.y}`);
          line.setAttribute('class','edge');
          line.id = `edge_${cid}_${node.id}`;
          edgeG.appendChild(line);
        });
      }
    });
  });

  // Draw nodes
  const nodeG = document.createElementNS('http://www.w3.org/2000/svg','g');
  svg.appendChild(nodeG);
  levels.forEach((lvl, li) => {
    lvl.forEach(node => {
      const g = document.createElementNS('http://www.w3.org/2000/svg','g');
      g.id = `g_${node.id}`;

      const isLeaf   = li === 0;
      const isAcc    = node.id === 'acc';
      const isRoot   = li === levels.length-2 && levels[levels.length-1][0]?.children?.includes(node.id);
      const w=72, h=34;

      const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
      rect.setAttribute('x', node.x-w/2); rect.setAttribute('y', node.y-h/2);
      rect.setAttribute('width', w); rect.setAttribute('height', h);
      rect.setAttribute('class','node-rect');
      rect.setAttribute('fill', isLeaf?'#1a1e2e' : isAcc?'#142a1e' : '#161c2e');
      rect.setAttribute('stroke', isLeaf?'#2e3650' : isAcc?'#2ecc7a' : '#5b8fff');
      rect.setAttribute('rx','4');
      rect.id = `rect_${node.id}`;
      g.appendChild(rect);

      const txt = document.createElementNS('http://www.w3.org/2000/svg','text');
      txt.setAttribute('x', node.x); txt.setAttribute('y', node.y-5);
      txt.setAttribute('class','node-label');
      txt.setAttribute('fill', isAcc?'#2ecc7a' : isLeaf?'#f0853a' : '#5b8fff');
      txt.textContent = isLeaf ? `p${lvl.indexOf(node)}` : isAcc ? 'acc+c' : '+';
      g.appendChild(txt);

      const val = document.createElementNS('http://www.w3.org/2000/svg','text');
      val.setAttribute('x', node.x); val.setAttribute('y', node.y+8);
      val.setAttribute('class','node-label');
      val.setAttribute('font-size','9');
      val.setAttribute('fill','#5a6a80');
      val.textContent = `${node.bitw}b`;
      val.id = `val_${node.id}`;
      g.appendChild(val);

      nodeG.appendChild(g);
    });
  });

  // Info
  const seqAdds = N - 1;
  const parallelLevels = depth + 1; // +1 for acc
  $('tree-info').innerHTML =
    `<span style="color:var(--acc)">N=${N}</span> inputs → ` +
    `<span style="color:var(--grn)">depth=${depth}</span> adder levels → ` +
    `<span style="color:var(--org)">${seqAdds} adders total</span> but only ${depth} in the critical path. ` +
    `Sequential approach would need ${seqAdds} serial additions. ` +
    `Bit width grows: ${bits}b → ${bits+depth}b → 32b (accumulator).`;

  // Stats
  $('tree-stats').innerHTML = [
    ['Inputs', N],
    ['Tree Depth', depth],
    ['Critical Path', `${depth} adds`],
    ['Sequential Adds', seqAdds],
    ['Speedup vs Serial', `${seqAdds}/${depth} = ${(seqAdds/depth).toFixed(1)}×`],
    ['Final Bit Width', `${bits+depth}b`]
  ].map(([k,v])=>`<div class="stat"><span class="v">${v}</span><div class="k">${k}</div></div>`).join('');
}

function animateTree() {
  const edges = document.querySelectorAll('.edge');
  edges.forEach(e=>e.classList.remove('active'));
  let i=0;
  const tick = ()=>{
    if(i<edges.length){edges[i].classList.add('active');i++;setTimeout(tick,80);}
  };
  tick();
}

function buildDepthChart() {
  const ns = [2,4,8,16,32,64,128,256];
  depthChart = mkChart('depthChart','line',{
    labels: ns.map(n=>`N=${n}`),
    datasets:[
      {label:'Tree depth (log₂N)', data:ns.map(n=>Math.ceil(Math.log2(n))), borderColor:'#5b8fff', backgroundColor:'rgba(91,143,255,.1)', fill:true, tension:.3, pointRadius:4},
      {label:'Sequential depth (N-1)', data:ns.map(n=>n-1), borderColor:'#e05555', backgroundColor:'rgba(224,85,85,.05)', fill:true, tension:.2, pointRadius:4, borderDash:[4,3]},
    ]
  });
}

// ══════════════════════════════════════════
// PANEL 2 — ROUTING / AREA
// ══════════════════════════════════════════
let routingChart;

const areaData = {
  // [compute%, regfile%, routing%, L1%, other%]
  '4_12':  [45, 20, 12, 18, 5],
  '8_12':  [42, 22, 16, 15, 5],
  '16_12': [40, 24, 18, 13, 5],
  '4_7':   [48, 18, 14, 15, 5],
  '8_7':   [44, 20, 18, 13, 5],
  '16_7':  [40, 22, 22, 11, 5],
  '4_4':   [50, 17, 16, 12, 5],
  '8_4':   [46, 19, 20, 10, 5],
  '16_4':  [42, 21, 26, 8, 3],
};

function updateRouting() {
  const sz   = $('mmaSz').value;
  const node = $('procNode').value;
  const key  = `${sz}_${node}`;
  const data = areaData[key] || [40,22,18,15,5];
  const labels = ['Compute (multipliers+tree)', 'Register File', 'Routing / Interconnect', 'L1 / Shared Mem', 'Other'];
  const colors = ['#5b8fff','#a67cff','#f0853a','#2ecc7a','#5a6a80'];

  $('area-bars').innerHTML = labels.map((lbl,i)=>`
    <div class="area-bar-row">
      <div class="area-bar-label">${lbl}</div>
      <div class="area-bar-track">
        <div class="area-bar-fill" style="width:${data[i]}%;background:${colors[i]}">
          <span>${data[i]}%</span>
        </div>
      </div>
    </div>`).join('');

  // Wire vis
  const n = +sz;
  const totalWires = 2 * n * n * 16; // A+B, n×n elements, 16 bits each
  const cols = Math.min(totalWires, 160);
  $('wire-desc').textContent =
    `${n}×${n} MMA: ${n*n} A elements + ${n*n} B elements × 16 bits = ${totalWires} wires needed simultaneously`;
  const grid = $('routing-grid');
  grid.style.gridTemplateColumns = `repeat(${cols},3px)`;
  grid.innerHTML = '';
  const rows = Math.ceil(totalWires / cols);
  for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
    const w = document.createElement('div');
    w.className='wire';
    const hue = 220 + (c/cols)*60;
    w.style.background = `hsl(${hue},60%,40%)`;
    w.style.opacity = 0.4 + 0.6*(c/cols);
    grid.appendChild(w);
  }

  // Update routing chart
  if (routingChart) {
    const sizes = [4,8,16,32];
    routingChart.data.datasets[0].data = sizes.map(s=>2*s*s*16);
    routingChart.data.datasets[1].data = sizes.map(s=>s*s);
    routingChart.data.datasets[2].data = sizes.map(s=>s*s*s);
    routingChart.update();
  }
}

function buildRoutingChart() {
  const sizes = [4,8,16,32];
  routingChart = mkChart('routingChart','line',{
    labels: sizes.map(s=>`${s}×${s}`),
    datasets:[
      {label:'Wires (bits)', data:sizes.map(s=>2*s*s*16), borderColor:'#f0853a', backgroundColor:'rgba(240,133,58,.1)', fill:true, tension:.3},
      {label:'Multipliers', data:sizes.map(s=>s*s), borderColor:'#5b8fff', backgroundColor:'rgba(91,143,255,.08)', fill:true, tension:.3},
      {label:'FMAs (MMA ops)', data:sizes.map(s=>s*s*s), borderColor:'#2ecc7a', backgroundColor:'rgba(46,204,122,.06)', fill:true, tension:.3},
    ]
  });
}

// ══════════════════════════════════════════
// PANEL 3 — DOT PRODUCT → MATMUL
// ══════════════════════════════════════════
let mulChart;
let A4, B4, C4;

function randMat(n) {
  return Array.from({length:n},()=>Array.from({length:n},()=>+(Math.random()*4-2).toFixed(1)));
}

function buildMatmulVis() {
  A4 = randMat(4); B4 = randMat(4);
  C4 = A4.map((row,i)=>row.map((_,j)=>A4[i].reduce((s,_,k)=>s+A4[i][k]*B4[k][j],0)));

  const wrap = $('matmul-wrap');
  wrap.innerHTML='';

  const makeGrid=(mat,id,cls,onclick=null)=>{
    const div=document.createElement('div');
    div.className='matrix-block';
    const g=document.createElement('div');
    g.className='mat-grid';
    g.style.gridTemplateColumns=`repeat(${mat[0].length},1fr)`;
    mat.forEach((row,i)=>row.forEach((v,j)=>{
      const c=document.createElement('div');
      c.className=`mcell ${cls}`;
      c.id=`${id}_${i}_${j}`;
      c.textContent=v.toFixed(1);
      if(onclick) c.style.cursor='pointer';
      if(onclick) c.onclick=()=>onclick(i,j);
      g.appendChild(c);
    }));
    div.appendChild(g);
    return div;
  };

  const Adiv = makeGrid(A4,'A','');
  const lAB = document.createElement('div'); lAB.className='op-sym'; lAB.textContent='×';
  const Bdiv = makeGrid(B4,'B','');
  const lEq = document.createElement('div'); lEq.className='op-sym'; lEq.textContent='=';
  const Cdiv = makeGrid(C4,'C','', (i,j)=>highlightDot(i,j));

  // Labels
  const mkLabel=(t,c)=>{const d=document.createElement('div');d.className='mat-label';d.style.color=c;d.innerHTML=t;return d;};

  const wa=document.createElement('div');wa.style.display='flex';wa.style.flexDirection='column';wa.style.gap='4px';
  wa.appendChild(mkLabel('A <small style="font-size:.7rem;color:var(--dim)">[FP16]</small>','#5b8fff'));
  wa.appendChild(Adiv);

  const wb=document.createElement('div');wb.style.display='flex';wb.style.flexDirection='column';wb.style.gap='4px';
  wb.appendChild(mkLabel('B <small style="font-size:.7rem;color:var(--dim)">[FP16]</small>','#f0853a'));
  wb.appendChild(Bdiv);

  const wc=document.createElement('div');wc.style.display='flex';wc.style.flexDirection='column';wc.style.gap='4px';
  wc.appendChild(mkLabel('C = A×B <small style="font-size:.7rem;color:var(--dim)">[FP32] — click a cell</small>','#2ecc7a'));
  wc.appendChild(Cdiv);

  wrap.appendChild(wa); wrap.appendChild(lAB); wrap.appendChild(wb); wrap.appendChild(lEq); wrap.appendChild(wc);
}

function highlightDot(row, col) {
  // Reset
  for(let i=0;i<4;i++) for(let j=0;j<4;j++){
    $(`A_${i}_${j}`)?.classList.remove('hi-a','computing');
    $(`B_${i}_${j}`)?.classList.remove('hi-b','computing');
    $(`C_${i}_${j}`)?.classList.remove('hi-c','computing');
  }
  // Highlight row of A
  for(let k=0;k<4;k++) $(`A_${row}_${k}`)?.classList.add('hi-a');
  // Highlight col of B
  for(let k=0;k<4;k++) $(`B_${k}_${col}`)?.classList.add('hi-b');
  // Highlight output cell
  $(`C_${row}_${col}`)?.classList.add('hi-c');

  // Show computation
  const terms = Array.from({length:4},(_,k)=>
    `A[${row}][${k}](${A4[row][k].toFixed(1)}) × B[${k}][${col}](${B4[k][col].toFixed(1)}) = ${(A4[row][k]*B4[k][col]).toFixed(2)}`
  );
  const sum = A4[row].reduce((s,_,k)=>s+A4[row][k]*B4[k][col],0);
  $('dot-info').innerHTML =
    `<span style="color:var(--acc)">C[${row}][${col}]</span> = dot(A row ${row}, B col ${col})<br>` +
    terms.map((t,k)=>`<span style="color:var(--dim2)">${t}</span>`).join('<br>') +
    `<br><span style="color:var(--grn)">Sum = ${sum.toFixed(3)} → one dot product unit (4 multipliers + reduction tree)</span>`;
}

let gemmRunning = false;
async function runGEMM() {
  if (gemmRunning) return;
  gemmRunning = true;
  const sz = +$('gemmSz').value;
  const tileSize = 4;
  const tilesPerDim = sz / tileSize;
  const totalTiles = tilesPerDim * tilesPerDim * tilesPerDim; // M/t × N/t × K/t
  let done = 0;

  for (let tm=0; tm<tilesPerDim; tm++) {
    for (let tn=0; tn<tilesPerDim; tn++) {
      for (let tk=0; tk<tilesPerDim; tk++) {
        done++;
        const pct = done/totalTiles;
        $('gemm-bar').style.width = (pct*100)+'%';
        $('gemm-info').innerHTML =
          `Tile (m=${tm},n=${tn},k=${tk}) — MMA ${done}/${totalTiles} — ` +
          `<span style="color:var(--acc)">load A[${tm*4}:${tm*4+3}, ${tk*4}:${tk*4+3}], B[${tk*4}:${tk*4+3}, ${tn*4}:${tn*4+3}]</span> from L1 → tensor core → accumulate D`;
        await new Promise(r=>setTimeout(r,60));
      }
    }
  }
  $('gemm-info').innerHTML += `<br><span style="color:var(--grn)">✓ Complete — ${sz}×${sz}×${sz} GEMM = ${sz**3 * 2} FLOPs in ${totalTiles} MMA ops</span>`;
  gemmRunning = false;
}

function buildMulChart() {
  const dims = [4,8,16,32,64,128];
  mulChart = mkChart('mulChart','bar',{
    labels: dims.map(d=>`${d}×${d}×${d}`),
    datasets:[
      {label:'Multipliers needed', data:dims.map(d=>d*d), backgroundColor:'rgba(91,143,255,.5)', borderColor:'#5b8fff', borderWidth:1},
      {label:'FMAs (total ops)', data:dims.map(d=>d*d*d), backgroundColor:'rgba(46,204,122,.3)', borderColor:'#2ecc7a', borderWidth:1},
    ]
  });
}

// ══════════════════════════════════════════
// PANEL 4 — SM HIERARCHY
// ══════════════════════════════════════════
let gpuChart, occupancyChart;

const gpuSpecs = {
  v100: {name:'V100', sms:80, tcsPerSM:8,  fmaPerTC:64,  freq:1.53e9, process:'12nm'},
  a100: {name:'A100', sms:108,tcsPerSM:4,  fmaPerTC:256, freq:1.41e9, process:'7nm'},
  h100: {name:'H100', sms:132,tcsPerSM:4,  fmaPerTC:512, freq:1.83e9, process:'4nm'},
};

function calcTFLOPS(spec, util=1) {
  // FP16 TFLOPS: SMs × TC/SM × FMA/TC × 2 (multiply+add) × freq × util
  return spec.sms * spec.tcsPerSM * spec.fmaPerTC * 2 * spec.freq * util / 1e12;
}

function buildGPU() {
  const model = $('gpuModel').value;
  const spec  = gpuSpecs[model];
  const util  = +$('smUtil').value/100;
  const die   = $('gpu-die');
  die.innerHTML = '';

  const activeSMs = Math.round(spec.sms * util);
  for (let i=0; i<spec.sms; i++) {
    const sm = document.createElement('div');
    sm.className = 'sm-block' + (i < activeSMs ? ' firing' : '');
    sm.id = `sm_${i}`;
    sm.innerHTML = `<div class="sm-label">SM ${i}</div>`;
    // TC dots
    const tcr = document.createElement('div'); tcr.className='tc-row';
    for (let t=0;t<spec.tcsPerSM;t++){
      const tc=document.createElement('div');
      tc.className='tc'+(i<activeSMs?' active':'');
      tcr.appendChild(tc);
    }
    sm.appendChild(tcr);
    // warp dots
    const wr=document.createElement('div');wr.className='warp-row';
    for(let w=0;w<8;w++){
      const wt=document.createElement('div');wt.className='wt'+(i<activeSMs?' active':'');
      wr.appendChild(wt);
    }
    sm.appendChild(wr);
    const fl=document.createElement('div');fl.className='sm-flops';
    fl.textContent=i<activeSMs?`${(spec.tcsPerSM*spec.fmaPerTC*2*spec.freq/1e9).toFixed(0)} GFLOPS`:'idle';
    sm.appendChild(fl);
    die.appendChild(sm);
  }

  const tflops = calcTFLOPS(spec, util);
  $('gpu-stats').innerHTML = [
    ['GPU', spec.name],
    ['SMs', `${activeSMs}/${spec.sms}`],
    ['TC/SM', spec.tcsPerSM],
    ['FMA/TC', spec.fmaPerTC],
    ['Process', spec.process],
    ['Peak FP16', `${calcTFLOPS(spec).toFixed(0)} TF`],
    ['Eff. @ util', `${tflops.toFixed(0)} TF`],
  ].map(([k,v])=>`<div class="stat"><span class="v">${v}</span><div class="k">${k}</div></div>`).join('');
}

function updateSMUtil() {
  $('smUtilV').textContent = $('smUtil').value+'%';
  buildGPU();
}

function fireSMs() {
  document.querySelectorAll('.sm-block.firing').forEach(sm=>{
    sm.style.boxShadow='0 0 20px rgba(91,143,255,.6)';
    setTimeout(()=>sm.style.boxShadow='',600);
  });
}

function buildGPUCharts() {
  const models = ['V100','A100','H100'];
  const specs  = [gpuSpecs.v100, gpuSpecs.a100, gpuSpecs.h100];
  gpuChart = mkChart('gpuChart','bar',{
    labels: models,
    datasets:[
      {label:'Peak FP16 TFLOPS (tensor core)', data:specs.map(s=>+calcTFLOPS(s).toFixed(0)),
       backgroundColor:['rgba(91,143,255,.4)','rgba(91,143,255,.6)','rgba(91,143,255,.85)'],
       borderColor:'#5b8fff', borderWidth:1},
      {label:'FP32 CUDA core TFLOPS', data:[14,19.5,67],
       backgroundColor:'rgba(90,106,128,.3)', borderColor:'#5a6a80', borderWidth:1},
    ]
  });

  // Occupancy chart: warps vs latency hiding
  const warps = [1,2,4,8,16,32,48];
  occupancyChart = mkChart('occupancyChart','line',{
    labels: warps.map(w=>`${w} warps`),
    datasets:[
      {label:'Effective throughput %', data:warps.map(w=>Math.min(100,(w/6)*100)),
       borderColor:'#2ecc7a', backgroundColor:'rgba(46,204,122,.1)', fill:true, tension:.4},
      {label:'Idle cycles % (mem latency)', data:warps.map(w=>Math.max(0,100-(w/6)*100)),
       borderColor:'#e05555', backgroundColor:'rgba(224,85,85,.06)', fill:true, tension:.4},
    ]
  },{
    plugins:{
      legend:{labels:{color:'#8a9ab0',font:{family:'IBM Plex Mono',size:11}}},
      tooltip:{callbacks:{label:ctx=>`${ctx.raw.toFixed(0)}%`}}
    }
  });
}

// ══════════════════════════════════════════
// PANEL 5 — TRANSFORMER
// ══════════════════════════════════════════
let flopsChart, rooflineChart;

const models = {
  gpt2:     {name:'GPT-2 1.5B', d:1600, layers:48, heads:25, dff:6400},
  gpt3:     {name:'GPT-3 175B', d:12288,layers:96, heads:96, dff:49152},
  llama3:   {name:'LLaMA-3 70B',d:8192, layers:80, heads:64, dff:28672},
  gpt4class:{name:'GPT-4 class',d:18432,layers:120,heads:128,dff:73728},
};

const gpuTF = {v100:125, a100:312, h100:989};

function computeFlops(modelKey, seqLen) {
  const m = models[modelKey];
  const S = seqLen, d = m.d, L = m.layers, ff = m.dff;
  // Per layer per token (approximate):
  const attnQK  = 2 * S * d * d;       // Q·Kᵀ
  const attnV   = 2 * S * d * d;       // ·V
  const attnOut = 2 * S * d * d;       // output proj
  const mlpUp   = 2 * S * d * ff;      // MLP up
  const mlpDown = 2 * S * ff * d;      // MLP down
  const softmax = S * S;               // elementwise (not TC)
  const layernorm= 10 * S * d;         // elementwise (not TC)
  return {
    attnQK:  L * attnQK,
    attnV:   L * attnV,
    attnOut: L * attnOut,
    mlpUp:   L * mlpUp,
    mlpDown: L * mlpDown,
    softmax: L * softmax,
    layernorm:L * layernorm,
  };
}

function updateTransformer() {
  const modelKey = $('modelSz').value;
  const seqLen   = +$('seqLen').value;
  const gpu      = $('infGPU').value;
  const flops    = computeFlops(modelKey, seqLen);
  const totalF   = Object.values(flops).reduce((a,b)=>a+b,0);
  const tcFlops  = flops.attnQK + flops.attnV + flops.attnOut + flops.mlpUp + flops.mlpDown;
  const gpuPeak  = gpuTF[gpu] * 1e12;
  const timeMs   = (totalF / gpuPeak) * 1000;

  // Update chart
  const labels = ['QKᵀ (TC)','·V (TC)','Out Proj (TC)','MLP Up (TC)','MLP Down (TC)','Softmax','LayerNorm'];
  const data   = [flops.attnQK, flops.attnV, flops.attnOut, flops.mlpUp, flops.mlpDown, flops.softmax, flops.layernorm];
  const colors = ['#5b8fff','#4a7ce8','#3d6cd0','#2ecc7a','#26b86e','#f0853a','#5a6a80'];

  if (flopsChart) {
    flopsChart.data.datasets[0].data = data;
    flopsChart.update();
  }

  $('transformer-stats').innerHTML = [
    ['Model', models[modelKey].name],
    ['Seq Len', seqLen],
    ['Total FLOPs', fmt(totalF)],
    ['TC FLOPs', `${(tcFlops/totalF*100).toFixed(0)}%`],
    ['GPU', gpu.toUpperCase()],
    ['Est. Time', `${timeMs < 1000 ? timeMs.toFixed(1)+'ms' : (timeMs/1000).toFixed(2)+'s'}`],
  ].map(([k,v])=>`<div class="stat"><span class="v">${v}</span><div class="k">${k}</div></div>`).join('');
}

function buildTransformerCharts() {
  const labels = ['QKᵀ (TC)','·V (TC)','Out Proj (TC)','MLP Up (TC)','MLP Down (TC)','Softmax','LayerNorm'];
  const colors = ['#5b8fff','#4a7ce8','#3d6cd0','#2ecc7a','#26b86e','#f0853a','#5a6a80'];
  flopsChart = new Chart($('flopsChart').getContext('2d'),{
    type:'bar',
    data:{
      labels,
      datasets:[{label:'FLOPs', data:new Array(7).fill(0), backgroundColor:colors, borderWidth:0}]
    },
    options:{
      responsive:true, maintainAspectRatio:false, indexAxis:'y',
      plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{color:'#5a6a80',font:{family:'IBM Plex Mono',size:10},callback:v=>fmt(v)},grid:{color:'#171a23'}},
        y:{ticks:{color:'#8a9ab0',font:{family:'IBM Plex Mono',size:10}},grid:{display:false}}
      }
    }
  });

  // Roofline: compute intensity vs throughput
  const ci = [0.01,0.05,0.1,0.5,1,2,5,10,50,100]; // FLOPs/byte
  const bw_h100 = 3350; // GB/s HBM3
  const peak_h100 = 989000; // GFLOPS
  rooflineChart = mkChart('rooflineChart','line',{
    labels: ci.map(c=>c+''),
    datasets:[
      {label:'H100 roofline', data:ci.map(c=>Math.min(peak_h100, c*bw_h100)),
       borderColor:'#5b8fff', backgroundColor:'rgba(91,143,255,.08)', fill:true, tension:0, pointRadius:0},
      {label:'Memory bound region', data:ci.map(c=>c*bw_h100),
       borderColor:'#f0853a', borderDash:[4,3], tension:0, pointRadius:0, borderWidth:1.5},
      // LLM operating points
      {label:'LLM inference (batch=1)', data:ci.map(c=>c<1?1000:null),
       borderColor:'#e05555', pointRadius:6, pointBackgroundColor:'#e05555', showLine:false},
      {label:'LLM training (large batch)', data:ci.map(c=>c>=50?800000:null),
       borderColor:'#2ecc7a', pointRadius:6, pointBackgroundColor:'#2ecc7a', showLine:false},
    ]
  },{
    scales:{
      x:{type:'linear',ticks:{color:'#5a6a80',font:{family:'IBM Plex Mono',size:10}},grid:{color:'#171a23'},
         title:{display:true,text:'Arithmetic Intensity (FLOPs/byte)',color:'#5a6a80'}},
      y:{ticks:{color:'#5a6a80',font:{family:'IBM Plex Mono',size:10},callback:v=>fmt(v)},grid:{color:'#171a23'},
         title:{display:true,text:'GFLOPS/s',color:'#5a6a80'}}
    }
  });

  updateTransformer();
}

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
window.addEventListener('load', ()=>{
  buildTree();
  buildDepthChart();
  buildRoutingChart();
  updateRouting();
  buildMatmulVis();
  buildMulChart();
  buildGPU();
  buildGPUCharts();
  buildTransformerCharts();
});
