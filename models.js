// Model catalog for Zira. All run fully on-device via WebLLM (WebGPU).
// No import of WebLLM here: it is ~6.6 MB and only loaded when the user taps "Load".
// needsF16: requires the WebGPU `shader-f16` feature. heavy: may exceed iPhone Safari's memory limit.
export const LIB_PREFIX =
  "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_86/base/";

// Self-hosted manifest (config + tokenizer + tensor-cache.json) for Sandoche's abliterated
// Llama-3.2-1B, whose HF repo uses the old `ndarray-cache.json` name WebLLM 0.2.86 no longer reads.
// Weight shards are still downloaded straight from Hugging Face (absolute URLs in tensor-cache.json).
const SELF = new URL("./models/llama-3.2-1b-abliterated/", import.meta.url).href;

export const MODELS = [
  {
    id: "Zira-Llama-3.2-1B-abliterated-q4f16_1-MLC",
    label: "Zira Uncensored Lite · Llama 3.2 1B (abliterated)",
    note: "Refusal-removed 1B model. Light enough for iPhone (~0.7 GB GPU memory, ~700 MB download).",
    uncensored: true, needsF16: true, heavy: false, mem: 700,
    custom: {
      model: SELF, model_id: "Zira-Llama-3.2-1B-abliterated-q4f16_1-MLC",
      model_lib: LIB_PREFIX + "Llama-3.2-1B-Instruct-q4f16_1_cs1k-webgpu.wasm",
      vram_required_MB: 879.04, low_resource_required: true,
    },
  },
  {
    id: "Llama-3.2-1B-Instruct-q4f32_1-MLC",
    label: "Llama 3.2 1B (f32)",
    note: "Mainstream 1B for devices without shader-f16 (~0.9 GB GPU memory). More filtered.",
    uncensored: false, needsF16: false, heavy: false, mem: 900,
  },
  {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    label: "Safe mode · Qwen 2.5 0.5B",
    note: "Smallest option (~0.6 GB GPU memory). Basic quality; use if everything else crashes.",
    uncensored: false, needsF16: true, heavy: false, mem: 600,
  },
  {
    id: "Qwen2.5-0.5B-Instruct-q4f32_1-MLC",
    label: "Safe mode · Qwen 2.5 0.5B (f32)",
    note: "Smallest option without shader-f16 (~0.7 GB GPU memory).",
    uncensored: false, needsF16: false, heavy: false, mem: 700,
  },
  {
    id: "Huihui-Qwen3.5-2B-abliterated-q4f16_1-MLC",
    label: "Zira Uncensored · Qwen3.5 2B (abliterated)",
    note: "Better writing, uncensored, but ~2 GB GPU memory. MAY CRASH ON IPHONE.",
    uncensored: true, needsF16: true, heavy: true, mem: 2000,
    custom: {
      model: "https://huggingface.co/RaiseRuntimeError/Huihui-Qwen3.5-2B-abliterated-q4f16_1-MLC",
      model_id: "Huihui-Qwen3.5-2B-abliterated-q4f16_1-MLC",
      model_lib: LIB_PREFIX + "Qwen3.5-2B-q4f16_1_cs1k-webgpu.wasm",
      vram_required_MB: 2245.44, low_resource_required: false,
      overrides: { max_history_size: 1 },
    },
  },
  {
    id: "Hermes-3-Llama-3.2-3B-q4f16_1-MLC",
    label: "Hermes 3 · Llama 3.2 3B",
    note: "Roleplay-friendly, few refusals, ~2.1 GB GPU memory. MAY CRASH ON IPHONE.",
    uncensored: false, needsF16: true, heavy: true, mem: 2100,
  },
  {
    id: "Hermes-3-Llama-3.2-3B-q4f32_1-MLC",
    label: "Hermes 3 · Llama 3.2 3B (f32)",
    note: "~2.8 GB GPU memory. WILL VERY LIKELY CRASH ON IPHONE.",
    uncensored: false, needsF16: false, heavy: true, mem: 2800,
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC",
    label: "Qwen 2.5 1.5B (f32)",
    note: "~1.7 GB GPU memory. May crash on iPhone. More filtered.",
    uncensored: false, needsF16: false, heavy: true, mem: 1700,
  },
];

export const isIOS = () =>
  /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function defaultModelId(hasF16, ios) {
  if (ios) return hasF16 ? "Zira-Llama-3.2-1B-abliterated-q4f16_1-MLC" : "Llama-3.2-1B-Instruct-q4f32_1-MLC";
  return hasF16 ? "Huihui-Qwen3.5-2B-abliterated-q4f16_1-MLC" : "Llama-3.2-1B-Instruct-q4f32_1-MLC";
}
export function safeModelId(hasF16) {
  return hasF16 ? "Qwen2.5-0.5B-Instruct-q4f16_1-MLC" : "Qwen2.5-0.5B-Instruct-q4f32_1-MLC";
}
