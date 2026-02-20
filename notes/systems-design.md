# Systems Design — NVIDIA TensorCore Sim

## Goal

A browser-based, zero-dependency interactive study environment for understanding NVIDIA GPU
architecture, specifically how tensor cores work and how they enable modern LLM training and inference.

**Target audience**: engineers with software/ML backgrounds who want to understand the hardware
stack beneath frameworks — from `model.forward()` down through PyTorch → ATen → cuBLAS →
cuDNN → CUDA PTX → tensor core instructions.

---

## Tool Overview

### 1. Tensor Core Simulator (`tensor-core-sim/`)

Simulates the fundamental MMA operation — **D = A×B + C** — at the 4×4×4 tile level
(Volta architecture, first-generation tensor cores).

Key visualizations:
- FP16 → FP32 precision pipeline (stepwise animation)
- Matrix operands (A, B, C, D) with live computed values
- Warp fragment layout (32-thread cooperative execution model)
- Performance metrics vs naive CUDA core equivalent path

**Purpose**: understand *why* tensor cores exist, what the FP16/FP32 precision tradeoff
achieves, and how warp-level cooperation enables massively parallel matrix ops.

### 2. GPU Architecture Learning Path (`gpu-deep-dive/`)

A structured personal learning path through the hardware concepts that underpin the simulator.
Five panels, each building on the last:

| Panel | Topic | Core insight |
|-------|-------|--------------|
| 01 | Reduction Tree | log₂(N) adder depth is what makes GHz clocks possible |
| 02 | Silicon Routing | Wire load scales quadratically; routing area > compute area |
| 03 | Dot → Matmul | 4×4 MMA = 16 parallel dot products; GEMM = tiled MMA loops |
| 04 | SM Hierarchy | 80 SMs × 8 TCs × 64 FMAs/cycle × 1.53GHz = 125 TFLOPS |
| 05 | Transformer | ~95% of LLM FLOPs are GEMMs; roofline model for bottleneck analysis |

**Purpose**: the conceptual scaffolding you need to reason about GPU performance — not just
*what* the numbers are, but *why* the hardware is shaped the way it is.

---

## Architecture Decisions

### Pure static HTML/CSS/JS, no build step

**Rationale**: these are educational visualizations, not a production app. A build pipeline
(Webpack, Vite, esbuild) would add complexity without value. Chart.js is loaded from CDN
because it's a well-known stable URL and avoids an npm install step.

**Trade-offs accepted**: no tree-shaking, no TypeScript, no hot module reload. For files
in the 500–1000 line range, this is not a meaningful cost.

### CSS and JS extracted from HTML

The original standalone files embedded all CSS and JS inline — convenient for sharing a
single file, but noisy when studying or iterating.

New structure per tool:
```
{tool-name}/
├── index.html   — markup only (structure, no style or logic)
├── style.css    — all visual design and layout
└── main.js      — all simulation logic
```

**Benefits**:
- Read simulation logic without scrolling past markup and styles
- Understand the visual design layer independently
- `git diff` shows CSS changes vs logic changes as separate hunks
- Easier to swap out the visual layer (e.g., replace the dark theme) without touching JS

### `serve` for local development

`npm start` (or `npx serve . --listen 3000`) from project root. This is a zero-config
static file server.

**Why a server at all?** Browsers block some resource loads when opening files directly
from disk (`file://` protocol). A local HTTP server avoids this. For this project there
are no ES module imports and no `fetch()` calls, so files actually work from disk — but
the serve setup is the correct convention for anything that might grow.

### Notes in `notes/`

Two documents, different purposes:

- `running-notes.md` — growing personal notes, written *during* study. Concepts as they're
  encountered, not after. Intentionally informal. These are the notes you'd take in the
  margin of a textbook.

- `systems-design.md` — this file. Architectural reasoning for the project structure.
  Updated when structural decisions are made.

---

## File Map

```
nvda-tensorcore-sim/
├── index.html                  # Landing page linking to both tools
├── package.json                # serve script
├── .gitignore
├── README.md
│
├── tensor-core-sim/            # Tool 1: MMA operation simulator
│   ├── index.html              # Structure only
│   ├── style.css               # Dark HUD aesthetic, pipeline layout
│   └── main.js                 # FP16 simulation, matrix math, Chart.js viz
│
├── gpu-deep-dive/              # Tool 2: Architecture learning path
│   ├── index.html              # Tabbed nav + panel structure
│   ├── style.css               # IBM Plex Mono aesthetic, panel layouts
│   └── main.js                 # Tree builder, routing vis, SM die, transformer calc
│
└── notes/
    ├── running-notes.md        # Growing conceptual notes (study log)
    └── systems-design.md       # This file
```

---

## Simulation Accuracy

Both tools are JavaScript simulations — not cycle-accurate hardware models.

**Intentional simplifications**:
- FP16 is approximated by truncating FP32 mantissa bits (real FP16 has different exponent bias and subnormal handling)
- Throughput numbers (TFLOPS) are from published specs, not measured benchmarks
- Warp fragment layout is simplified — actual Volta fragment assignment per the WMMA API is more complex
- GEMM tiling animation is sequential; real hardware runs hundreds of warps concurrently across SMs
- Area breakdown percentages are estimates from published literature, not die measurements

**What is accurate**:
- The MMA formula (D = A×B + C) and mixed-precision semantics
- FLOP counts: 2N³ FLOPs for an N×N×N MMA (each output element = N multiply-adds = 2N ops)
- Tree depth = ⌈log₂(N)⌉ for binary reduction
- Transformer FLOP proportions are within ~5% for the models shown
- Roofline model uses real H100 published specs (989 TFLOPS FP16, 3350 GB/s HBM3)
- GPU peak TFLOPS formula: SMs × TC/SM × FMA/TC/cycle × 2 × clock_freq

---

## Extension Ideas

- **INT8 quantization path**: show the INT8 tensor core path (used in LLM inference, 2× more throughput than FP16)
- **PTX/SASS instructions**: show the actual `mma.sync.aligned.m16n8k16.f32.f16.f16.f32` instruction for the MMA
- **Multi-SM animation**: show a full GEMM distributed across multiple SMs simultaneously
- **Call stack diagram**: PyTorch → ATen → cuBLAS → cuDNN → CUDA kernel → PTX → tensor core
- **Hopper TMA**: compare Tensor Memory Accelerator (H100) vs Volta manual tiling
- **FlashAttention walkthrough**: show how fused attention avoids the HBM round-trips that standard attention requires
