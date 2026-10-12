# PR：改為家人洗澡狀態與 Supabase 共享塗鴉

將三盞燈改成一致灰色／淡黃色，僅用 1、2、3 辨識，刪除詩意文案、英文裝飾、頁尾和本機保存提示。燈光不再是畫布編輯開關，沒有每日重設或關燈清除作品。

實作 Supabase 匿名登入、逐作品／逐燈 RPC、Realtime 更新與重連快照、私人圖片 Storage、只有自己的物件編輯權限及伺服器個人撤回。新增可執行 SQL、RLS、資料格式／容量限制和版本衝突檢查。前端沒有 localStorage 畫布 fallback；未配置或連線失敗會顯示短錯誤。

撤回包括自己的燈光切換、作品新增、移動或刪除；其他人已更改同一盞燈時會拒絕撤回。管理者可透過 SQL 軟刪除並禁止原作者恢復。沒有前端管理金鑰。

實際驗證通過：npm install、npm ci、npm test（6 項）、npm run build；本機 Supabase 的兩項 e2e（API 權限測試與雙瀏覽器共享測試）通過。e2e 是兩個獨立瀏覽器 context 連實際 Supabase API，缺少設定會 skipped，不以 mock 宣稱已同步。本機服務使用官方 slim images；容器健康檢查受到環境代理影響，另以不經外部代理的 loopback health requests 及實際 API／瀏覽器操作驗證。雲端 Supabase／Vercel 尚未配置，不能以本機通過宣稱正式網站已啟用共享。

部署前必做：建立 Supabase 專案，開啟匿名登入，執行 migration，在 Vercel 設定 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY，重新部署；README 提供逐步操作。未設定時網站操作會停用。匿名存取允許所有訪客，尚未加家人邀請／名單、CAPTCHA 或後端圖片內容掃描。
