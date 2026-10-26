// Model catalog for Zira. All run fully on-device via WebLLM (WebGPU).
// "f16" models need the WebGPU `shader-f16` feature; "f32" models work without it.
import { modelLibURLPrefix, modelVersion } from "./vendor/web-llm.js";

const LIB = (name) => modelLibURLPrefix + modelVersion + "/" + name;

export const MODELS = [
  {
    id: "Huihui-Qwen3.5-2B-abliterated-q4f16_1-MLC",
    label: "Zira Uncensored · Qwen3.5 2B (abliterated)",
    note: "Refusal-removed (abliterated) model. Best for open adult roleplay. ~1.4 GB download.",
    uncensored: true,
    needsF16: true,
    custom: {
      model: "https://huggingface.co/RaiseRuntimeError/Huihui-Qwen3.5-2B-abliterated-q4f16_1-MLC",
      model_id: "Huihui-Qwen3.5-2B-abliterated-q4f16_1-MLC",
      model_lib: LIB("Qwen3.5-2B-q4f16_1_cs1k-webgpu.wasm"),
      vram_required_MB: 2245.44,
      low_resource_required: false,
      overrides: { context_window_size: 4096, max_history_size: 1 },
    },
  },
  {
    id: "Hermes-3-Llama-3.2-3B-q4f16_1-MLC",
    label: "Hermes 3 · Llama 3.2 3B",
    note: "Nous Hermes 3: steerable, roleplay-friendly, few refusals. ~1.8 GB download.",
    uncensored: false,
    needsF16: true,
  },
  {
    id: "Hermes-3-Llama-3.2-3B-q4f32_1-MLC",
    label: "Hermes 3 · Llama 3.2 3B (f32)",
    note: "Same model for devices without shader-f16. Heavier (~3 GB of GPU memory); may crash on 6 GB phones.",
    uncensored: false,
    needsF16: false,
  },
  {
    id: "Llama-3.2-1B-Instruct-q4f32_1-MLC",
    label: "Lite · Llama 3.2 1B",
    note: "Smallest and fastest (~0.9 GB). Mainstream model, more filtered. Use if others crash.",
    uncensored: false,
    needsF16: false,
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC",
    label: "Qwen 2.5 1.5B",
    note: "Mainstream small model (~1.2 GB). More filtered.",
    uncensored: false,
    needsF16: false,
  },
];

export function defaultModelId(hasF16) {
  return hasF16
    ? "Huihui-Qwen3.5-2B-abliterated-q4f16_1-MLC"
    : "Llama-3.2-1B-Instruct-q4f32_1-MLC";
}
