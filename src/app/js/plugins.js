// 內建插件清單：每一項對應一種常見的影像插件功能，全部在本機運算，不需要金鑰
import { FILM_LOOKS, BW_LOOKS } from './imaging.js';

const slider = (k, label, min, max, def, unit = '') => ({ k, label, min, max, def, unit });
const choice = (k, label, options, def) => ({ k, label, options, def: def || options[0][0] });

export const LOCAL_GROUPS = [
  {
    id: 'portrait', title: '人像修圖',
    items: [
      {
        id: 'smooth', title: '自動磨皮', like: 'Portraiture 類', op: 'portraitSmooth',
        desc: '自動找出皮膚，撫平瑕疵與斑點，同時保留毛髮與膚質細節。',
        params: [slider('amount', '磨皮強度', 0, 100, 60), slider('detail', '保留膚質', 0, 100, 40)],
      },
      {
        id: 'pro', title: '人像精修', like: 'PortraitPro 類', op: 'portraitPro',
        desc: '分別調整膚色明暗、冷暖、油光與臉部補光。',
        params: [slider('brighten', '膚色提亮', 0, 100, 30), slider('warmth', '膚色冷暖', -100, 100, 0), slider('shine', '去除油光', 0, 100, 40), slider('light', '臉部補光', 0, 100, 30)],
      },
      {
        id: 'beauty', title: '一鍵美顏', like: 'Delicious Retouch 類', op: 'oneClickBeauty',
        desc: '商業修圖常用流程一次完成：磨皮、亮膚、微銳化。',
        params: [slider('strength', '美顏強度', 0, 100, 60)],
      },
    ],
  },
  {
    id: 'effects', title: '摳圖特效',
    items: [
      {
        id: 'cutout', title: '髮絲摳圖', like: 'Fluid Mask 類', op: 'cutout', needsMask: true,
        desc: '自動選取主體（或使用你圈好的選取範圍），再把邊緣細修到髮絲與毛皮，輸出透明背景圖層。',
        params: [slider('contrast', '邊緣銳利度', 0, 100, 30), slider('radius', '髮絲範圍', 2, 40, 12, ' px')],
      },
      {
        id: 'flood', title: '水波倒影', like: 'Flaming Pear Flood 類', op: 'flood',
        desc: '在畫面下方產生逼真的水面與波紋倒影。',
        params: [slider('horizon', '水平線位置', 10, 90, 62, '%'), slider('waves', '波紋高度', 0, 100, 45), slider('size', '波紋大小', 0, 100, 40), slider('darken', '水面暗度', 0, 100, 30)],
      },
      {
        id: 'flexify', title: '全景變形', like: 'Flaming Pear Flexify 類', op: 'flexify',
        desc: '把全景照片變成小行星、隧道或魚眼視角。',
        params: [choice('mode', '變形方式', [['littlePlanet', '小行星'], ['tunnel', '時光隧道'], ['fisheye', '魚眼'], ['unwrap', '環形展開']]), slider('rotate', '旋轉', 0, 360, 0, '°'), slider('zoom', '縮放', 50, 150, 100, '%')],
      },
      {
        id: 'film', title: '底片調色', like: 'Nik Color Efex 類', op: 'film',
        desc: '經典底片與電影色調，一鍵套用。',
        params: [choice('look', '色調', Object.keys(FILM_LOOKS).map((k) => [k, k])), slider('strength', '強度', 0, 100, 100)],
      },
      {
        id: 'darkroom', title: '黑白暗房', like: 'Nik Silver Efex 類', op: 'darkroom',
        desc: '模擬暗房沖洗的黑白、棕褐與硒色調。',
        params: [choice('look', '風格', Object.keys(BW_LOOKS).map((k) => [k, k])), slider('strength', '強度', 0, 100, 100)],
      },
      {
        id: 'relight', title: '本機打光', like: 'Magnific 重新打光類', op: 'relight',
        desc: '不用金鑰，直接改變光線方向與強弱。',
        params: [slider('angle', '光源方向', 0, 359, 315, '°'), slider('elevation', '光源高度', 10, 80, 45, '°'), slider('strength', '光線強度', 0, 100, 50), slider('warmth', '光線暖度', -100, 100, 10)],
      },
    ],
  },
  {
    id: 'clean', title: '降噪放大',
    items: [
      {
        id: 'denoise', title: '智慧降噪', like: 'Noiseware 類', op: 'denoise',
        desc: '去除高 ISO 或低光源拍攝的噪點與色斑，保留邊緣。',
        params: [slider('amount', '降噪強度', 0, 100, 50), slider('color', '色彩雜訊', 0, 100, 70), slider('detail', '保留細節', 0, 100, 50)],
      },
      {
        id: 'upscale', title: '無損放大', like: 'Topaz／PhotoZoom 類', op: 'upscale', output: 'document',
        desc: '用高品質重新取樣放大並恢復細節，結果開成新文件。需要更強的細節可用「AI 修補」的 AI 畫質提升。',
        params: [choice('scale', '放大倍數', [[2, '2 倍'], [3, '3 倍'], [4, '4 倍']]), slider('sharpness', '細節強度', 0, 100, 40), slider('denoiseFirst', '先降噪', 0, 100, 0)],
      },
    ],
  },
];

// 模型清單：預設用最新的 gpt-image-2；測試金鑰後會再加上帳號實際有的模型
export const AI_MODELS = ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini'];

export const STYLES = [
  ['寫實照片', 'photorealistic photograph, natural lighting, high detail'],
  ['插畫', 'clean digital illustration'],
  ['水彩', 'soft watercolor painting'],
  ['油畫', 'rich oil painting with visible brush strokes'],
  ['動漫', 'Japanese anime style'],
  ['3D 模型', 'high quality 3D render'],
  ['產品攝影', 'commercial product photography, studio lighting'],
  ['像素風', 'pixel art'],
];

export const RELIGHT_PRESETS = [
  ['黃金時刻', 'warm golden hour sunlight coming from the side'],
  ['攝影棚柔光', 'soft even studio lighting with a large softbox'],
  ['逆光', 'dramatic backlight with a glowing rim light'],
  ['霓虹夜色', 'colorful neon night lighting in magenta and cyan'],
  ['陰天柔和', 'soft overcast daylight'],
  ['燭光', 'warm candle light in a dark room'],
];

export const REMOVE_TARGETS = [
  ['物件', 'object'],
  ['人物', 'person'],
  ['浮水印', 'watermark or logo'],
  ['文字', 'text'],
];
