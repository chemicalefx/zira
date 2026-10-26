# Zira

Private, adults-only (18+) AI companion that runs **entirely on your device** in the browser using
[WebLLM](https://github.com/mlc-ai/web-llm) + WebGPU. No server, no account; chats are stored only in your browser.

- Static site — host on GitHub Pages (Settings → Pages → Deploy from branch → `main` / root).
- Install on iPhone: open the site in Safari → Share → **Add to Home Screen**.
- Requires WebGPU (iOS 26+ Safari by default; older iOS: Settings → Apps → Safari → Advanced → Feature Flags → WebGPU).

Models (picked in Settings): Huihui Qwen3.5-2B abliterated (default when `shader-f16` is available),
Hermes 3 Llama 3.2 3B (f16 / f32), Llama 3.2 1B, Qwen2.5 1.5B.
WebLLM 0.2.86 is vendored in `vendor/` (Apache-2.0).
