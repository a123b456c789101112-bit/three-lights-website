# 多人共享設計（尚未啟用）

目前只實作本機保存。不同訪客、瀏覽器與裝置不會同步；清除瀏覽器資料會失去作品。三盞燈是每個訪客自己的操作狀態，不廣播給其他人。

## 建議服務：Supabase

請建立 Supabase 帳號與一個專案，再於 Authentication 啟用匿名登入及 CAPTCHA。匿名登入讓每位訪客有可驗證的使用者 ID，不代表所有人可任意修改資料。準備：

- `VITE_SUPABASE_URL`：專案網址。
- `VITE_SUPABASE_PUBLISHABLE_KEY`：可公開的 publishable key（或舊版 anon key）。僅在 RLS 已驗證後使用。
- CAPTCHA 的公開 site key，以及後端驗證用的 secret。
- 僅供伺服器的 `SUPABASE_SERVICE_ROLE_KEY`（新版可用 secret key）：放在 Edge Function 的秘密設定，絕不能帶 `VITE_` 前綴、提交 Git 或傳給瀏覽器。

目前前端尚未讀取這些變數，也尚未連接 Supabase。不要在聊天提供密碼或秘密金鑰。`.env` 已被 Git 忽略；Vercel 的環境變數在專案設定輸入。

## 資料表與介面

| 資料 | 主要欄位 | 用途 |
| --- | --- | --- |
| boards | id, title, created_at | 固定公共畫布；一般訪客不能新增或刪除 |
| artworks | id (UUID), board_id, author_id, kind, payload (JSONB), revision, created_at, deleted_at | 筆畫／貼圖；軟刪除，依伺服器時間排序 |
| uploads | id, author_id, board_id, storage_path, mime, bytes, width, height, status | 圖片與審核狀態 |
| reports | id, artwork_id, reporter_id, reason, created_at | 不當內容檢舉，訪客不能讀取 |
| moderation_log | id, moderator_id, artwork_id, action, created_at | 管理員移除／封鎖的稽核紀錄 |

筆畫 payload：`{color, width, points:[{x,y}]}`，座標範圍 x=0…1000、y=0…700。預設貼圖 payload：`{x,y,sticker}`。圖片貼圖 payload：`{x,y,upload_id}`，不接受任意遠端 URL 或 data URL 入共享資料庫。固定畫布比例 10:7 讓手機與桌機看到相同座標。

`src/storage.ts` 已定義 `SharedBoardRepository` 的 load、subscribe、create、moveSticker、remove、report 介面；待實作 Supabase adapter 後替換本機讀寫。共享模式的圖片需先上傳，並將本機 data URL 轉換成核准的 upload_id。API 回傳的 Board 可由 adapter 以核准圖片內容轉換成前端型別。錯誤需顯示「未同步」並允許重試，不可顯示已儲存。

初次載入讀取快照；Realtime 通知後重新載入／對帳。新增使用客戶端 UUID 作為冪等鍵。修改帶 expected revision，由伺服器原子更新避免覆蓋他人移動；禁止信任客戶端 author_id 或時間。重新連線須重新拉取，不只接收後續通知。多人模式的撤回只作用於自己的最後一個物件，不是整個公共畫布的最後一筆。

## 權限與防濫用（上線前必須實作、驗證）

1. 所有表啟用 Row Level Security；撤銷匿名直接寫入 artworks/uploads 的權限。讀者只能看到指定公共 board 的未刪除、審核通過物件。
2. 寫入走 Edge Function，驗證 Supabase JWT，從 JWT 取得 author_id。使用者只能移動／移除自己的內容；管理員身分從受保護角色表或 server claim 取得，不能使用可自行修改的 user metadata。
3. 在可信任後端限制每位使用者／IP 的寫入頻率（例如 30 次／分鐘）、每日圖片配額與全畫布總量；計數需原子化。伺服器拒絕超過 3000 點的笔畫、未知色彩、錯誤座標、過長文字、超過 150 個物件。IP 雜湊與記錄保留期限需制定。
4. Storage 使用私有 bucket，1 MB 大小限制且只允許 PNG/JPEG/WebP。只給本人目錄的短期上傳授權。後端驗證實際檔案魔術位元與解碼尺寸 ≤4096×4096，重編碼移除 metadata；拒絕 SVG、HTML 與偽裝 MIME。核准後才加入畫布；讀取需簽名 URL，刪除內容時撤銷存取並清理檔案。
5. 提供每個物件的檢舉入口、管理員審核頁及軟刪除工具。管理員能立即隱藏內容、封鎖濫用者；Realtime 通知各訪客移除顯示。圖片初期建議人工核准後公開。
6. 啟用 CAPTCHA、伺服器請求上限與儲存費用告警。測試他人修改、偽造作者、越權上傳、超限與刪除後讀取都遭拒絕，再開放共享。

本機版已做檔案類型、1 MB、4096 像素、物件數量與儲存量限制，但客戶端檢查可被繞過，不能取代上述後端防護。此文件是待實作規格，不是已部署資料庫或安全保證。
