#!/usr/bin/env bash
set -euo pipefail

parts=model-parts
mkdir -p public/models/whisper-small/onnx public/vendor/sherpa
cat "$parts"/decoder.part-* > public/models/whisper-small/onnx/decoder_model_merged_quantized.onnx
cat "$parts"/encoder.part-* > public/models/whisper-small/onnx/encoder_model_quantized.onnx
cat "$parts"/sherpa.part-* > public/vendor/sherpa/sherpa-onnx-wasm-main-asr.data
sha256sum --check "$parts/SHA256SUMS"
