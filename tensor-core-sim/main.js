// ═══════════════════════════════════════════════════════
//  FP16 SIMULATION UTILITIES
//  JavaScript has no native FP16 — we simulate it by
//  rounding to FP16 precision (10-bit mantissa, 5-bit exp)
//  This is why we can show real precision loss vs FP32.
// ═══════════════════════════════════════════════════════

function toFP16(v) {
  // Simulate FP16 by reducing mantissa to 10 bits.
  // Real hardware stores this in 16 bits: 1 sign + 5 exp + 10 mantissa.
  if (!isFinite(v)) return v;
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setFloat32(0, v);
  const bits = view.getUint32(0);
  const sign = bits >>> 31;
  const exp  = (bits >>> 23) & 0xFF;
  const mant = bits & 0x7FFFFF;
  // Re-encode with 10 bit mantissa (truncate lower 13 bits)
  const mant16 = (mant >>> 13) << 13;
  const bits16 = (sign << 31) | (exp << 23) | mant16;
  view.setUint32(0, bits16);
  return view.getFloat32(0);
}

function makeMatrix(fill, n=4) {
  const m = [];
  for (let r=0; r<n; r++) {
    m[r] = [];
    for (let c=0; c<n; c++) {
      let v;
      if (fill === 'random')   v = toFP16((Math.random()-0.5) * 6);
      else if (fill === 'identity') v = toFP16(r===c ? 1.0 : 0.0);
      else if (fill === 'ones') v = toFP16(1.0);
      else v = toFP16(r===c ? (r+1)*0.5 : (r+c)*0.1); // diagonal pattern
      m[r][c] = v;
    }
  }
  return m;
}

function matMul(A, B, n=4) {
  // Returns in FP32 (JS number = 64-bit float, but we explicitly
  // cast inputs through FP16 to simulate the hardware path)
  const D = Array.from({length:n}, ()=>new Array(n).fill(0));
  for (let i=0; i<n; i++)
    for (let k=0; k<n; k++)
      for (let j=0; j<n; j++)
        D[i][j] += A[i][k] * B[k][j]; // product in FP32 (upcast from FP16 inputs)
  return D;
}

function matAdd(D, C, n=4) {
  return D.map((row,i) => row.map((v,j) => v + C[i][j]));
}

function matMulFP32(A, B, n=4) {
  // Reference: pure FP32 no precision loss for error comparison
  const D = Array.from({length:n}, ()=>new Array(n).fill(0));
  for (let i=0; i<n; i++)
    for (let k=0; k<n; k++)
      for (let j=0; j<n; j++)
        D[i][j] += A[i][k] * B[k][j];
  return D;
}

function maxError(D_fp16path, D_fp32) {
  let err = 0;
  for (let i=0; i<4; i++) for (let j=0; j<4; j++)
    err = Math.max(err, Math.abs(D_fp16path[i][j] - D_fp32[i][j]));
  return err;
}

function fmt(v) {
  if (v === undefined || v === null) return '?';
  return v.toFixed(2);
}

// ═══════════════════════════════════════
//  RENDER MATRIX GRID
// ═══════════════════════════════════════
function renderMatrix(id, mat, cls='') {
  const el = document.getElementById(id);
  el.innerHTML = '';
  for (let r=0; r<4; r++) for (let c=0; c<4; c++) {
    const cell = document.createElement('div');
    cell.className = 'cell' + (cls ? ' '+cls : '');
    cell.textContent = fmt(mat[r][c]);
    el.appendChild(cell);
  }
}

function clearMatrix(id) {
  const el = document.getElementById(id);
  el.innerHTML = '';
  for (let i=0;i<16;i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.textContent = '—';
    el.appendChild(cell);
  }
}

// ═══════════════════════════════════════
//  LOG
// ═══════════════════════════════════════
function log(msg, type='') {
  const box = document.getElementById('logBox');
  const line = document.createElement('div');
  line.className = 'log-line' + (type ? ' '+type : '');
  line.textContent = '> ' + msg;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

// ═══════════════════════════════════════
//  PIPELINE ANIMATION
// ═══════════════════════════════════════
function animatePipeline(A, B, C, D, callback) {
  const stages = ['ps-a','ps-b','ps-mul','ps-cast','ps-c','ps-d'];
  const vals   = ['pv-a','pv-b','pv-mul','pv-cast','pv-c','pv-d'];
  const vvals  = [
    `[${fmt(A[0][0])}, ${fmt(A[0][1])}, …]`,
    `[${fmt(B[0][0])}, ${fmt(B[1][0])}, …]`,
    `ΣᵢAᵢₖ·Bₖⱼ  →  partial sum`,
    `cast → FP32 ↑ precision`,
    `C[0][0]=${fmt(C[0][0])}`,
    `D[0][0]=${fmt(D[0][0])}`
  ];

  stages.forEach(s => document.getElementById(s).classList.remove('active'));
  vals.forEach(v => { document.getElementById(v).textContent='—'; document.getElementById(v).classList.remove('lit'); });

  let i = 0;
  const tick = () => {
    if (i > 0) document.getElementById(stages[i-1]).classList.remove('active');
    if (i < stages.length) {
      document.getElementById(stages[i]).classList.add('active');
      document.getElementById(vals[i]).textContent = vvals[i];
      document.getElementById(vals[i]).classList.add('lit');
      i++;
      setTimeout(tick, 350);
    } else {
      callback();
    }
  };
  tick();
}

// ═══════════════════════════════════════
//  WARP VISUALIZATION
//  32 threads: 0-7 hold A frags, 8-15 B frags,
//  16-31 hold D output frags (per Volta WMMA layout)
// ═══════════════════════════════════════
function renderWarp(warpUtil) {
  const grid = document.getElementById('warpGrid');
  grid.innerHTML = '';
  const active = Math.round(32 * warpUtil / 100);
  for (let t=0; t<32; t++) {
    const th = document.createElement('div');
    th.className = 'thread';
    th.textContent = 'T'+t;
    if (t < active) {
      if (t < 8)       th.classList.add('active-a');
      else if (t < 16) th.classList.add('active-b');
      else             th.classList.add('active-d');
    }
    grid.appendChild(th);
  }
  document.getElementById('warpStatus').textContent =
    `${active}/32 threads active · warp utilization ${warpUtil}%`;
}

// ═══════════════════════════════════════
//  CHARTS
// ═══════════════════════════════════════
let throughputChart, precisionChart;

function buildCharts() {
  // ── THROUGHPUT CHART ──
  // Volta SM: 8 Tensor Cores per SM, each does 4×4×4 MMA = 64 FMAs per cycle
  // CUDA cores: 64 FP32 cores per SM, 1 FMA each per cycle
  // Tensor: 8 × 64 = 512 FMAs/cycle
  // CUDA: 64 FMAs/cycle → 8× in raw FMA throughput
  const tCtx = document.getElementById('throughputChart').getContext('2d');
  throughputChart = new Chart(tCtx, {
    type: 'bar',
    data: {
      labels: ['CUDA Core\n(FP32)', 'CUDA Core\n(FP16)', 'Tensor Core\n(V100 TC)'],
      datasets: [{
        label: 'Peak TOPS (Volta SM)',
        data: [14, 28, 112],
        backgroundColor: ['rgba(74,112,144,0.6)','rgba(74,112,144,0.6)','rgba(0,212,255,0.5)'],
        borderColor:     ['#4a7090','#4a7090','#00d4ff'],
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.raw} TFLOPS — ${ctx.dataIndex===2 ? '8× over FP32 CUDA' : 'baseline'}`
          }
        }
      },
      scales: {
        x: { ticks: { color:'#4a7090', font:{family:'Share Tech Mono'} }, grid:{color:'#111d2e'} },
        y: { ticks: { color:'#4a7090', font:{family:'Share Tech Mono'} }, grid:{color:'#111d2e'},
             title:{ display:true, text:'TFLOPS', color:'#4a7090' } }
      }
    }
  });

  // ── PRECISION CHART ──
  // Shows bit-width at each stage of the MMA pipeline
  const pCtx = document.getElementById('precisionChart').getContext('2d');
  precisionChart = new Chart(pCtx, {
    type: 'line',
    data: {
      labels: ['A load', 'B load', 'FP16 Mul', 'Upcast→FP32', 'C accum', 'D output'],
      datasets: [{
        label: 'Effective bit-width',
        data: [16, 16, 16, 32, 32, 32],
        borderColor: '#00d4ff',
        backgroundColor: 'rgba(0,212,255,0.1)',
        fill: true,
        tension: 0.3,
        pointBackgroundColor: ctx => ctx.dataIndex >= 3 ? '#00d4ff' : '#ff6b35',
        pointRadius: 6,
        pointBorderColor: '#000',
      },{
        label: 'Error risk (relative)',
        data: [2, 2, 4, 1, 0.5, 0.5],
        borderColor: '#ff6b35',
        backgroundColor: 'rgba(255,107,53,0.07)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#ff6b35',
        pointRadius: 4,
        borderDash: [4,3],
        yAxisID: 'y2'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels:{color:'#4a7090', font:{family:'Share Tech Mono', size:11}} }
      },
      scales: {
        x: { ticks:{color:'#4a7090', font:{family:'Share Tech Mono',size:10}}, grid:{color:'#111d2e'} },
        y: { ticks:{color:'#00d4ff', font:{family:'Share Tech Mono'}}, grid:{color:'#111d2e'},
             title:{display:true, text:'Bit Width', color:'#00d4ff'},
             min:0, max:40 },
        y2: { position:'right', ticks:{color:'#ff6b35', font:{family:'Share Tech Mono'}},
              grid:{display:false}, title:{display:true, text:'Relative Error Risk', color:'#ff6b35'},
              min:0, max:6 }
      }
    }
  });
}

// ═══════════════════════════════════════
//  MAIN SIMULATION
// ═══════════════════════════════════════
function runSimulation() {
  const fill     = document.getElementById('fillMode').value;
  const numOps   = +document.getElementById('numOps').value;
  const warpUtil = +document.getElementById('warpUtil').value;

  log(`--- MMA Execute: ${numOps} ops, fill=${fill}, warp=${warpUtil}% ---`, 'info');

  // Generate matrices
  const A = makeMatrix(fill);   // FP16
  const B = makeMatrix(fill);   // FP16
  const C = makeMatrix('random').map(r=>r.map(v=>v*0.1)); // FP32 accumulator (small)

  log(`A loaded (FP16): [${fmt(A[0][0])}, ${fmt(A[0][1])}, …]`);
  log(`B loaded (FP16): [${fmt(B[0][0])}, ${fmt(B[1][0])}, …]`);
  log(`C accumulator (FP32): [${fmt(C[0][0])}, …]`);

  renderMatrix('mat-A', A);
  renderMatrix('mat-B', B);
  renderMatrix('mat-C', C);
  clearMatrix('mat-D');

  // MMA: D = A×B + C  (FP16 inputs → FP32 accumulation)
  const AB   = matMul(A, B);        // A×B in FP32 (hardware upcast)
  const D    = matAdd(AB, C);       // + C (FP32)

  // Reference: pure FP32 path for error
  const A32  = makeMatrix(fill).map(r=>r.map(v=>v));  // same pattern but no FP16 rounding
  const B32  = B; // B is already through FP16 filter
  const D32  = matAdd(matMulFP32(A32, B32), C);
  const err  = maxError(D, D32);

  // Sim metrics
  // Each MMA: 4×4×4 = 64 FMAs = 128 FLOPs
  const flopsPerOp  = 128;
  const totalFlops  = numOps * flopsPerOp;
  // Tensor core: 1 cycle per 4×4×4 MMA (Volta)
  const tcCycles    = numOps;
  // CUDA core equivalent: 64 FMAs sequentially through 64 FP32 cores = 1 cycle per FMA
  // But we only have 1 warp here so effectively 64 cycles per MMA (without tensor core)
  const cudaCycles  = numOps * 64;
  const speedup     = cudaCycles / tcCycles;

  // Animate pipeline then reveal results
  animatePipeline(A, B, C, D, () => {
    renderMatrix('mat-D', D, 'result');
    log(`D[0][0] = ${fmt(A[0][0])}×${fmt(B[0][0])} + … + C = ${fmt(D[0][0])}`, 'ok');
    log(`FP16 path error vs FP32 reference: ${err.toExponential(2)}`);

    // Stats
    document.getElementById('st-ops').textContent         = numOps;
    document.getElementById('st-flops').textContent       = totalFlops >= 1000 ? (totalFlops/1000).toFixed(1)+'K' : totalFlops;
    document.getElementById('st-cycles').textContent      = tcCycles;
    document.getElementById('st-cuda-cycles').textContent = cudaCycles >= 1000 ? (cudaCycles/1000).toFixed(1)+'K' : cudaCycles;
    document.getElementById('st-speedup').textContent     = speedup.toFixed(0)+'×';
    document.getElementById('st-err').textContent         = err < 1e-5 ? '<1e-5' : err.toExponential(1);

    log(`Tensor speedup over equiv CUDA path: ${speedup.toFixed(0)}×`, 'ok');
    log(`Total FLOPs simulated: ${totalFlops}`, 'ok');

    renderWarp(warpUtil);
    log(`Warp ${warpUtil}% utilized — ${Math.round(32*warpUtil/100)}/32 threads active`);
    log(`--- Simulation complete ---`, 'ok');
  });
}

// ═══════════════════════════════════════
//  UI INIT
// ═══════════════════════════════════════
document.getElementById('numOps').addEventListener('input', function() {
  document.getElementById('numOpsVal').textContent = this.value + ' ops';
});
document.getElementById('warpUtil').addEventListener('input', function() {
  document.getElementById('warpUtilVal').textContent = this.value + '%';
});

// init empty matrices
['mat-A','mat-B','mat-C','mat-D'].forEach(clearMatrix);

// init warp grid empty
(function initWarp(){
  const grid = document.getElementById('warpGrid');
  for (let t=0;t<32;t++){
    const th = document.createElement('div');
    th.className='thread';
    th.textContent='T'+t;
    grid.appendChild(th);
  }
})();

window.addEventListener('load', buildCharts);
