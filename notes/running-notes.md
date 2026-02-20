# Running Notes — NVIDIA TensorCore Sim

Progressive notes written while building and studying these simulations.
Not a polished tutorial — honest working notes that grow incrementally.

---

## FP16 / FP32 Mixed Precision

### Why FP16 at all?
- Half the memory footprint: smaller activations/weights → more data fits in SRAM/HBM cache
- Higher throughput: hardware arithmetic units are smaller at lower bit widths → more fit on die
- FP16 range: ±65504, ~3 decimal digits of precision (10-bit mantissa, 5-bit exponent)
- FP32 range: ±3.4×10³⁸, ~7 decimal digits (23-bit mantissa, 8-bit exponent)

### Why accumulate in FP32?
Repeated addition of small FP16 values causes error accumulation — each add can lose a bit of precision.
A dot product of length N can accumulate up to N × (FP16 rounding error per step).

The fix: the **accumulator register** (C and D in MMA) is FP32. You compute the multiplications
in FP16, upcast the products to FP32, then sum into the FP32 accumulator. This is cheap because:
- The accumulator lives in the ALU, already wired to FP32 adders
- Only the multiplier inputs need to be FP16

This "mixed precision" pattern is what makes tensor core training numerically stable.

### FP16 simulation in JavaScript
JS has no native FP16. The sim approximates it by truncating the FP32 mantissa to 10 bits:
```js
function toFP16(v) {
  // Read as 32-bit int, zero out lower 13 mantissa bits, write back
  const mant16 = (mant >>> 13) << 13;
}
```
This correctly models precision loss but not the full FP16 exponent range behavior.

---

## The MMA Operation: D = A×B + C

The tensor core's one job. Every cycle it computes this for 4×4×4 matrices (Volta):

- **A**: FP16 matrix (left operand)
- **B**: FP16 matrix (right operand)
- **C**: FP32 accumulator (input partial sum)
- **D**: FP32 result (output)

Why the accumulator C? Because in tiled GEMM you loop over the K dimension:
```python
D_tile = zeros(4, 4)            # FP32, this is C
for k_tile in range(K // 4):
    A_tile = load(A, k_tile)    # FP16
    B_tile = load(B, k_tile)    # FP16
    D_tile += A_tile @ B_tile   # one tensor core MMA, C=D_tile accumulates
```
C is the mechanism for passing partial sums between iterations.

---

## Warp-Level Cooperative Execution

A "warp" is 32 threads that execute together (SIMT — Single Instruction, Multiple Threads).
Tensor core MMA is a **warp-level** operation — all 32 threads cooperate on one MMA.

Fragment assignment in Volta WMMA:
```
Threads  0–7:   hold fragments of matrix A (FP16 rows)
Threads  8–15:  hold fragments of matrix B (FP16 cols)
Threads 16–31:  hold C accumulator fragments (FP32) → receive D output
```

No single thread owns a full matrix. The tensor core reads all 32 fragments simultaneously
in one clock, computes MMA, and scatters results back to thread registers.

The PTX instruction is `wmma.mma.sync.aligned.m16n8k16.f32.f16.f16.f32` (varies by shape).
CUDA exposes this through `nvcuda::wmma::*` or the higher-level `cublasGemmEx`.

**Key implication**: warp divergence kills tensor core throughput. If some threads in a warp
take a branch and diverge, the warp becomes partially stalled — the MMA unit stalls with it.

---

## Binary Reduction Tree

Inside the tensor core, the 64 multiplier outputs must be summed. Naive approach: 63 sequential adds.
Hardware approach: a **binary tree** of adders.

```
N=4:  [p0]  [p1]  [p2]  [p3]    ← 16-bit FP16 products
           ↘ ↙        ↘ ↙
         [add0]      [add1]      ← 17-bit (1 extra bit to prevent overflow)
               ↘    ↙
               [add2]            ← 18-bit
                  ↓
               [+C acc]          ← 32-bit FP32 accumulator
```

For N=64 (full tensor core): depth = log₂(64) = **6 levels**.
Sequential depth would be 63. Critical path is only 6 adder delays — this is what sets max clock speed.

Each level adds 1 bit of width (to hold carry without overflow):
- FP16 products: 16 bits
- After 6 levels: 22 bits
- Into FP32 accumulator: widened to 32 bits

This is why the tensor core can run at GHz clock rates despite 64 parallel multiplications.

---

## Silicon Area & Wire Routing

Routing is the hidden cost of spatial parallelism — often bigger than the compute logic itself.

At 5nm:
- Each wire has capacitance → switching power P = CV²f
- Wire length → propagation delay (limits clock speed)
- All A and B matrix elements must arrive at all relevant multipliers in the **same cycle**

For a 4×4×4 MMA (64 multipliers):
- A: 16 FP16 values = 256 bits
- B: 16 FP16 values = 256 bits
- Total: **512 bits** that must be read from the register file simultaneously

Volta register file: 256KB per SM, 128-bit wide ports.
→ 4 × 128-bit reads per cycle just for operand delivery to tensor cores.
Each extra multiplier roughly doubles routing pressure (quadratic scaling with N).

Approximate area budget of a modern ML accelerator SM:
- ~40% compute (multiplier trees + adder trees)
- ~35% register file + routing/interconnect
- ~25% L1/shared memory

---

## GEMM Tiling

Large matrix multiplications (e.g., 1024×1024) don't fit in on-chip SRAM.
Solution: **tile** the matrices into blocks that fit, loop over tiles.

```python
for tile_m in range(M // 4):
    for tile_n in range(N // 4):
        D_tile = zeros(4, 4)              # FP32 accumulator in registers
        for tile_k in range(K // 4):
            A_tile = load(HBM → L1, ...)  # 4×4 FP16 from global mem
            B_tile = load(HBM → L1, ...)  # 4×4 FP16 from global mem
            D_tile += A_tile @ B_tile     # one tensor core MMA instruction
        store(D_tile → HBM)
```

Why this matters for memory bandwidth:
- **Arithmetic intensity** = FLOPs / bytes moved from HBM
- For small batches: low AI → each weight loaded once per token → **memory bound**
- For large batches: high AI → each weight reused across many tokens → **compute bound**

This is why batching is critical for GPU utilization during training.

---

## SM Hierarchy (V100)

```
GPU (V100)
└── 80 SMs (Streaming Multiprocessors)
    └── Each SM contains:
        ├── 8 Tensor Cores (Volta gen, 4×4×4 per cycle)
        ├── 64 FP32 CUDA Cores
        ├── 64 INT32 Cores
        ├── 256KB register file
        ├── 96KB L1 / shared memory
        └── Up to 32 warps schedulable (1024 threads)
```

Peak FP16 TFLOPS (V100):
```
80 SMs × 8 TC × 64 FMA/TC/cycle × 2 ops/FMA × 1.53 GHz ≈ 125 TFLOPS
```

**Warp occupancy and latency hiding**: memory latency is ~600 cycles. With 1 warp per SM,
every memory load stalls the SM. With 32 warps, the scheduler switches to another warp while
data loads → latency hidden. This is why high occupancy (many resident warps) matters.

---

## Transformer FLOP Breakdown

For a transformer layer with d_model and sequence length S (per layer, per token):

| Operation      | FLOPs         | Runs on TC? |
|----------------|---------------|-------------|
| QKᵀ            | 2·S·d²        | ✓ GEMM      |
| softmax(·/√d)  | O(S²)         | ✗ elementwise |
| ·V             | 2·S·d²        | ✓ GEMM      |
| Output proj    | 2·S·d²        | ✓ GEMM      |
| MLP up (×4)   | 2·S·d·4d      | ✓ GEMM      |
| MLP down       | 2·S·4d·d      | ✓ GEMM      |
| GELU           | ~10·S·4d      | ✗ elementwise |
| LayerNorm      | ~10·S·d       | ✗ elementwise |

Result: **~95% of FLOPs are GEMMs** → nearly total tensor core utilization.

The elementwise ops (softmax, GELU, LayerNorm) are memory-bound — they do few FLOPs
per byte loaded, so even though they're "free" in terms of compute, they can bottleneck
on HBM bandwidth. FlashAttention fuses QKᵀ + softmax + V to minimize HBM round-trips.

---

## Roofline Model

Two fundamental limits to GPU throughput:

1. **Peak compute**: e.g., H100 = 989 TFLOPS FP16
2. **Memory bandwidth**: H100 HBM3 = 3350 GB/s

The "roofline" is: `effective_GFLOPS = min(peak_compute, AI × bandwidth)`

- **Memory bound** (left of roof): arithmetic intensity < (peak_TFLOPS / bandwidth)
- **Compute bound** (right of roof): arithmetic intensity >= that ridge point

For LLM inference (batch=1): very low AI (~0.01 FLOPs/byte) → deeply memory bound.
For LLM training (large batch): high AI (~50+ FLOPs/byte) → compute bound.

This is the quantitative argument for why batching matters and why speculative decoding,
KV caching, and continuous batching are active research areas — they all aim to push
inference arithmetic intensity rightward toward the compute-bound regime.
