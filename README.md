# 三盞燈 · Three Lights

一個適合手機的小小創作空間。點亮暖光、月光或晨光，用手指／滑鼠畫畫，留下貼圖與自己的圖片。

## 已完成

- React + TypeScript + Vite，柔和灰／米白色、三盞可切換的燈與漸亮動畫。
- 任一燈亮起即可繪畫；全部關閉時工具暫停，作品保留。
- 五種筆色、粗細選擇、整個筆畫／貼圖橡皮擦、撤回最後一個物件。
- 六種預設貼圖，可拖曳；選取貼圖可移除。鍵盤 Tab 選取貼圖、方向鍵移動、Delete 移除。
- PNG、JPEG、WebP 上傳，上限 1 MB、長寬最多 4096 像素；圖片可拖曳。
- 最多 150 個物件，每條筆畫最多 3000 點，本機資料最多 4 MB。超限或儲存失敗會顯示錯誤。
- 畫布與主按鈕分開，作品不會遮住按鈕；支援 reduced motion。

**現在僅保存在這個瀏覽器，沒有多人同步。** 重新整理可保留，但換裝置、無痕瀏覽或清除網站資料無法還原。燈光每次開啟網站重新開始。不要用此版本保存唯一一份的重要作品。

## 在 Codex 開啟與預覽

在終端機輸入（Node.js 22 或 24）：

```sh
cd /workspace/three-lights-website
npm install
npm run dev -- --port 5173
```

開發伺服器會監聽 `0.0.0.0:5173`。如果 Codex 介面提供「預覽／Ports」，選擇 5173 開啟；若目前的雲端 onboarding 畫面沒有預覽入口，請在有預覽功能的 Codex 開發工作區執行，或在 Vercel 建立預覽部署。手機可透過 Vercel 的 HTTPS 預覽網址測試。不要把雲端機器的 localhost 網址當成可分享的網址。

## 建置與測試

```sh
npm ci
npm test
npm run build
npm run preview -- --port 4173
```

`npm ci` 依照已提交的 lockfile 安裝。`npm run build` 先做 TypeScript 檢查，再輸出 `dist/`。Vitest 測試涵蓋燈光、工具解鎖、筆畫、取消手勢、橡皮擦、貼圖持久化／移動、圖片限制與儲存失敗。

手機手動驗收：點亮／熄滅各燈、單指畫線、換色／粗細、移動貼圖、上傳合法及超大圖片、重新整理。畫布內單指操作用於畫畫，從画布外滑動可捲動頁面。橡皮擦是移除整個物件，尚未提供局部擦除、縮放、旋轉或作品匯出。

## 多人共享下一步

請先看 [共享服務與安全規格](docs/SHARING.md)。需要建立 Supabase 專案、設定匿名驗證／CAPTCHA、資料表、RLS、私有圖片 bucket、寫入 API、Realtime 與管理員移除工具，再實作 adapter。只有這些功能部署並通過權限測試後，才能標示為多人共享。現階段不需要任何帳號或金鑰即可運作。

## 部署到 Vercel（不需要寫程式）

1. 將此功能分支的變更審查後合併到 GitHub 的 `main`。
2. 登入 Vercel，選 **Add New → Project**，連接 GitHub 並匯入 `three-lights-website`。
3. Framework 選 **Vite**，Build Command 為 `npm run build`，Output Directory 為 `dist`，Install Command 為 `npm ci`，Node.js 選 24。
4. 點 **Deploy**，完成後使用 Vercel 提供的 HTTPS 網址。之後更新 main 會自動部署；分支 PR 可建立預覽部署。
5. 目前不用設定環境變數。將來串接資料庫時只把允許公開的 URL／publishable key 放到前端；服務端秘密金鑰只能放在後端秘密設定，不能寫進 GitHub。

## 檔案位置

- `src/App.tsx`：燈光、繪畫與操作介面。
- `src/style.css`：手機與桌機版樣式。
- `src/model.ts`：筆畫／貼圖資料與驗證。
- `src/storage.ts`：本機保存與未來共享介面。
- `src/App.test.tsx`：必要功能測試。

不使用外部圖片／字型服務，也不收集分析資料。尚未部署或推送時，本機分支只是供審查的變更。
