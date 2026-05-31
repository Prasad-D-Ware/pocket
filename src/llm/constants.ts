// On-device LLM config.
//
// Model: SmolLM2-360M-Instruct, 4-bit K_M quantized GGUF from bartowski.
// ~271 MB on disk, ~400 MB RAM when loaded. Chosen over Llama 3.2 1B
// (~700 MB) because Pocket's only LLM job is structured intent
// parsing — a 360M model with grammar-constrained output is more
// than enough, and a third the storage cost on user devices.
//
// If bartowski's repo ever goes down, the same artifact exists at
// QuantFactory, prithivMLmods, mradermacher under the same filename.
// All are HuggingFace community quants of the canonical
// HuggingFaceTB/SmolLM2-360M-Instruct base.

export const MODEL_FILENAME = 'SmolLM2-360M-Instruct-Q4_K_M.gguf'

export const MODEL_URL =
  'https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_M.gguf'

// Approximate — the real download size will be reported by the
// Content-Length header. Used to render an honest pre-download
// estimate to the user.
export const MODEL_SIZE_MB = 271

// Sanity floor for "the download finished": if the file is smaller
// than this on disk, treat it as a corrupted partial download and
// re-fetch. SmolLM2-360M Q4_K_M can't be smaller than ~250 MB.
export const MODEL_MIN_VALID_BYTES = 250_000_000

// Context window for the loaded model. SmolLM2-360M's training
// context is 8k; 1k is plenty for short intent prompts and keeps RAM
// usage in check on the emulator.
export const N_CTX = 1024

// GPU layers — 0 means CPU-only. Android Vulkan support in llama.rn
// exists but is finicky across devices; CPU is the safe default.
// Day 15+ can bump this to 99 on real hardware for ~3x speedup.
export const N_GPU_LAYERS = 0
