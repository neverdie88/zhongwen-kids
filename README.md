# Little Lantern

A Chinese learning app for a child aged roughly 6–9. The guided course follows the supplied **《中文》第二册（修订版）** textbook. It includes 12 short lessons with speaking, translation choices in both directions, Chinese and English sentence building, listening word choices, character tracing, and two speaking review sets. The workbook PDFs are kept only in the local project folder and are not published with the app.

## Start

Requires Node.js 20.12 or later. The speech code and model files are included; `npm install` is needed only if rebuilding the browser Whisper worker. Python 3 with Poppler (`pdfinfo` and `pdftotext`) is needed only to recheck or redownload the PDFs.

```sh
cd /Users/ductnguy/Documents/Playground/zhongwen-kids
npm start
```

Open [http://127.0.0.1:4178](http://127.0.0.1:4178). Keep that terminal open while using the app. It listens only on this computer. Audio playback uses the browser's Chinese voices. The **⚙ Settings** button chooses one recognizer for both Learn and Review, plus a Chinese playback voice. Both choices and learning progress stay in browser local storage.

For Chinese playback, choose **Standard voice** or **Girl voice** and tap **Preview voice** to hear the selection. Girl voice prefers Tingting or another available Mandarin girl voice, with a brighter pitch fallback when the browser has only one Chinese voice. This setting applies to phrase playback, word pronunciation, Learn, and Review. The exact sound depends on the browser's installed voices.

In **Learn**, each phrase has **Hear it**, **Speak it**, and **Skip speaking**. Once speaking starts, **Done** appears in the same button. The next phrase unlocks after the recognizer hears the expected words or the child chooses Skip. A short final speaking card uses the same check. If recognition hears different words, the child can listen and try again. These checks do not measure tones or pronunciation quality.

After the speaking cards, each lesson has four **Translation choice** questions that alternate Chinese-to-English and English-to-Chinese, two **Sentence building** questions using word banks in both directions, and two **Listening choice** questions. Listening plays a word drawn from that lesson's textbook phrases in the Chinese voice chosen in Settings; the child selects the written Chinese word from three choices. Play again and slow playback are available. This audio is browser speech synthesis, not a recording of a native speaker. A skipped listening question reveals its answer and lets the child continue.

Wrong translation, sentence-building, and listening answers stay on the same question until the child gets it right. A wrong choice stays visible, and listening replays the word. Lesson speaking and Review speaking also allow repeated tries until the recognizer hears the expected words. The existing Skip buttons remain available when the microphone or audio is difficult to use. Lesson stars count first-try answers, while a later correct answer still unlocks the next exercise.

Speaking cards display pinyin directly above each Chinese word. Tapping a word immediately plays its pronunciation and opens its English meaning, pinyin, and stroke order; the card also has a replay button. The same word cards appear in Review when Chinese is visible. Recognition feedback shows large pinyin on one line above large Chinese text. Word meanings and stroke data for all Book 2 speaking phrases are bundled locally, so the word panel does not call a translation service.

The **Review** tab has two speaking sets for any Book 2 lesson: **Set 1** shows the Chinese sentence to read aloud; **Set 2** shows the English meaning and asks for the corresponding Chinese sentence. Each set checks all phrases in the chosen lesson. Settings offers three recognition choices for both Learn and Review:

- **Whisper Small · in this browser (default):** runs a quantized multilingual Whisper Small model with Transformers.js and ONNX Runtime Web/WASM. The model is served from this computer and loaded into the browser on first use. The recording stays in the browser. The model is large and CPU transcription can take time.
- **sherpa-onnx · in this browser:** runs the Chinese/English streaming Zipformer model from the sherpa-onnx WASM release. Its model is served from this computer and loaded into the browser on first use. The recording stays in the browser.
- **Browser speech service:** uses the browser's built-in speech recognition. Depending on the browser, audio may be processed outside this app. The app checks up to five alternatives and supplies lesson phrases as optional hints.

All choices accept a conservative close word match and normalize Traditional Chinese transcripts to the textbook's Simplified Chinese. A missed Review phrase stays on screen for another try; the child can repeat it as often as needed. The app saves the last and best accepted count locally. A recognizer can still mishear a child's voice; none measures tones or pronunciation quality. The child can skip a card and continue without a microphone. Try the same lesson with each recognizer to see which hears your child better.

The browser builds use approximately 250 MB of Whisper weights or 190 MB of sherpa weights. They load one model at a time and cache the static files in the browser. The app serves them over `127.0.0.1`; it does not contact Hugging Face or sherpa-onnx during inference. Rebuild the Whisper worker after changing its source with `npm install && npm run build:speech`.

## GitHub Pages deployment

The public site is built by [the Pages workflow](.github/workflows/pages.yml). It assembles `public/` and `data/book2.json` into `dist/` and restores the large speech files from verified chunks in `model-parts/`. The textbook and workbook PDFs are ignored by Git and excluded from the deployed site. The site is self-contained: the speech models are served from GitHub Pages and run in the child's browser after the first download. The site URL is `https://neverdie88.github.io/zhongwen-kids/`.

To reproduce the static site locally on Linux, run `bash scripts/restore-site-models.sh` before copying `public/` to `dist/`. The script checks SHA-256 hashes of the restored model files.

## Book sources and checks

- `source/zhongwen-02-textbook.pdf` is a copy of the PDF supplied for this project.
- `workbooks/zhongwen-01-A.pdf` through `workbooks/zhongwen-12-B.pdf` are the 24 revised workbook PDFs. A has odd numbered lessons; B has even numbered lessons.
- `workbooks/manifest.json` records source URLs, page counts, sizes, verified Chinese titles, and SHA-256 checksums.
- The download script discovers the PDFs from [Huaqiao University's A index](https://hwjyyjy.hqu.edu.cn/info/1015/1113.htm) and [B index](https://hwjyyjy.hqu.edu.cn/info/1015/1112.htm). Book 8B uses the [Chinese Overseas Education Network](https://www.hwjyw.com/hwjc.html) copy because the Huaqiao University download lacked a valid PDF trailer.

```sh
npm run check
npm run check:source
python3 scripts/download_workbooks.py
```

`npm run check` validates app syntax and tests the exercises, speech matching, pinyin, voices, and local stroke files. `npm run check:source` additionally checks the Book 2 phrases and sentence builders against the supplied textbook PDF; it requires the local PDF and Poppler. The download script rechecks cached workbook PDFs and fetches any missing file.

The browser model smoke test is at [http://127.0.0.1:4178/test/browser-asr-smoke.html](http://127.0.0.1:4178/test/browser-asr-smoke.html). It transcribes a short synthesized Mandarin clip without asking for microphone access. Real child speech still needs a separate check on the child's device.

This is an original learning interface. It does not use HelloChinese branding or art. The downloaded PDFs are kept for local study and excluded from GitHub and the public site.

The Chinese lettering uses the bundled Kai-style [LXGW ZhenKai GB](https://github.com/lxgw/LxgwZhenKai) font. Its [SIL Open Font License](public/fonts/OFL-ZhenKai.txt) is included with the app.

The writing animations use bundled [Hanzi Writer 3.7.3](https://github.com/chanind/hanzi-writer) under its included [MIT license](public/vendor/LICENSE-hanzi-writer.txt). The 135 bundled stroke files come from `hanzi-writer-data@2.0.1`; its [Arphic Public License](public/strokes/ARPHICPL.TXT) is included. `scripts/vendor_strokes.py` selects the Book 2 characters from the package tarball.

The Traditional-to-Simplified converter is a bundled copy of [opencc-js 1.4.2](https://github.com/nk2028/opencc-js); its [MIT](public/vendor/LICENSE-opencc-js.txt) and [third-party notices](public/vendor/THIRD_PARTY_LICENSES-opencc-js.md) are included.

Recognized Chinese is displayed with tonal pinyin generated by bundled [pinyin-pro](https://github.com/zh-lx/pinyin-pro), under its [MIT license](public/vendor/LICENSE-pinyin-pro.txt).

Browser Whisper uses [Transformers.js 3.8.1](https://github.com/huggingface/transformers.js), [Xenova/whisper-small](https://huggingface.co/Xenova/whisper-small), and [ONNX Runtime Web](https://onnxruntime.ai/). Browser sherpa uses the official [sherpa-onnx v1.13.7 WASM Zipformer release](https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.13.7). The Transformers.js, Whisper and sherpa packages use [Apache-2.0](public/vendor/LICENSE-Apache-2.0.txt); ONNX Runtime uses [MIT](public/vendor/LICENSE-ONNX-Runtime.txt).
