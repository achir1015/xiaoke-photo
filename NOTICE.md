# 第三方授權聲明

小柯機器人圖像編輯助手
系統開發：吳玉柱 先生 與 Claude AI Opus 5.5

## 影像引擎

影像引擎修改自 PhotoCraft v0.18.0（https://github.com/storytold/photocraft）。

    Copyright (c) 2026 ArtCraft Team and the PhotoCraft contributors.
    Licensed under the MIT License or the Apache License, Version 2.0, at your option.

本專案依 MIT 授權使用，修改內容放在 `engine-patch/`：加上與外層介面溝通的橋接層、補齊繁體中文語系、
把介面中的產品名稱換成本程式名稱。

ArtCraft 名稱、文字標誌與標誌圖案是 ArtCraft Team 的商標，不屬於上述授權範圍，本程式沒有使用。
本程式與 Adobe、ArtCraft Team 均無隸屬關係。
引擎內含的其他第三方素材（Inter、JetBrains Mono 字型、Lucide 圖示、libfacedetection 權重等）依各自授權使用，
清單見 PhotoCraft 的 NOTICE 與 ATTRIBUTION.md。

## 字型

Noto Sans TC、Noto Serif TC：SIL Open Font License 1.1，授權全文見 `engine/fonts/OFL.txt`。

## 插件功能

「人像修圖」「摳圖特效」「降噪放大」是本程式自行實作的演算法，面板上標示的同類產品名稱只用來說明功能類型，
本程式不是這些產品，也不能載入它們的插件檔案。

## AI 功能

文生圖、AI 移除、局部重繪等功能呼叫 OpenAI API，由使用者自備金鑰，費用依 OpenAI 帳號計算。
