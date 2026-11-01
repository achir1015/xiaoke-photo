# 影像引擎補丁

引擎是 PhotoCraft v0.18.0 網頁版加上 `xiaoke.patch` 編譯而成。補丁內容：

- `apps/photocraft-web/src/xiaoke.rs`：`window.xiaokeEngine`（下命令、取合成圖與選取範圍、置入圖層）
- `crates/ui-egui/src/file_open.rs`：外層置入的圖層不進任意變形
- `crates/ui-egui/src/i18n/zh-hant.tsv`：補齊繁體中文、換掉產品名稱
- `crates/ui-egui/src/i18n.rs`：測試用的未翻譯字串收集器
- `crates/doc`、`crates/engine`：圖層、文件預設名稱改繁中
- 連結與程式圖示換成本專案（ArtCraft 商標不得沿用）

## 建置（Windows）

路徑不能有中文（mingw 連結器會失敗），工具鏈放在 `E:\xkp-tools`，原始碼用 `E:\xkp` 目錄連結存取：

```bash
git clone --depth 1 --branch v0.18.0 https://github.com/storytold/photocraft.git photocraft-src
cd photocraft-src && git apply ../xiaoke-photo/engine-patch/xiaoke.patch
```

```bash
export RUSTUP_HOME=E:/xkp-tools/rustup CARGO_HOME=E:/xkp-tools/cargo CARGO_TARGET_DIR=E:/xkp-tools/target
cd apps/photocraft-web && trunk build --release
```

工具：rustup（`x86_64-pc-windows-gnu`＋`wasm32-unknown-unknown`）、trunk 0.21.14。
產出在 `dist/web`，`scripts/fetch-engine.mjs` 會複製到 `engine/` 並加上字型；CI 則從 `engine.json` 指定的 Release 下載打包好的引擎。
