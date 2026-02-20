# nvda-tensorcore-sim

Interactive browser-based study environment for NVIDIA GPU architecture and tensor core internals — built for understanding the hardware stack beneath LLM training and inference.

## Tools

### Tensor Core Simulator (`tensor-core-sim/`)
Simulates the MMA operation **D = A×B + C** at the 4×4×4 tile level (Volta architecture). Visualizes the FP16 → FP32 precision pipeline, matrix operands with live values, warp fragment layout across 32 threads, and throughput vs naive CUDA core path.

### GPU Architecture Learning Path (`gpu-deep-dive/`)
Five-panel interactive learning path through GPU hardware concepts:
1. **Reduction Tree** — log₂(N) adder depth; why 64 multipliers fit in one clock cycle
2. **Silicon Routing** — wire load, area breakdown, why routing > compute in area budget
3. **Dot → Matmul** — how 4×4 MMA is 16 parallel dot products; GEMM tiling animation
4. **SM Hierarchy** — SM die visualization, warp occupancy vs latency hiding
5. **Transformer** — FLOP breakdown by operation, roofline model, compute vs memory bound

## Running

```bash
npm install
npm start        # serves at http://localhost:3000
```

Or without installing:
```bash
npx serve . --listen 3000
```

Open `http://localhost:3000` for the landing page.

## Structure

```
nvda-tensorcore-sim/
├── index.html              # Landing page
├── tensor-core-sim/        # MMA simulator
│   ├── index.html
│   ├── style.css
│   └── main.js
├── gpu-deep-dive/          # Architecture learning path
│   ├── index.html
│   ├── style.css
│   └── main.js
└── notes/
    ├── running-notes.md    # Conceptual notes (study log)
    └── systems-design.md   # Project architecture and design decisions
```

## Notes

- `notes/running-notes.md` — progressive study notes on FP16/FP32 precision, MMA semantics, warp cooperation, GEMM tiling, roofline model, transformer FLOP proportions
- `notes/systems-design.md` — architectural decisions, simulation accuracy notes, extension ideas

## Stack

Pure HTML/CSS/JS. No build step. [Chart.js](https://www.chartjs.org/) via CDN for charts.
