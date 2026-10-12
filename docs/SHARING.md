# 已實作的 Supabase 同步

- `family_artworks`：每筆 stroke/sticker 獨立 UUID、author_id、payload、revision、deleted_at、moderated_at。
- `family_lights`：固定三列 1/2/3，is_on 與 revision；單盞切換採伺服器原子反轉，沒有重設排程。
- `family_operations`：按作者記錄每次 create/move/remove/light 的原始內容及遞增 seq，撤回只尋找 auth.uid() 自己的最後一筆未撤回操作。
- `family-images`：私有 bucket，簽名網址只在前端呈現時產生，不存入 payload；資料存路徑。

API 是 `family_mutate` RPC，auth.uid() 決定作者，不接受前端傳作者 ID。短暫的 transaction advisory lock 保護這份小型家庭畫布的順序、容量與操作紀錄；它不以整份 snapshot 寫回資料。每次 create 只插入一個作品、move/remove 只更新指定作品、light 只更新一列。RPC 的 p_op_id 防止同一 mutation 重複建立紀錄。

移動／移除帶原始 revision，比對失敗即顯示內容已更新。只有作者能編輯自己的作品。刪除採 tombstone，Realtime 的 SELECT policy 允許已刪除列，以確保 UPDATE 通知可送達；前端快照只讀 deleted_at IS NULL 的作品。管理者標記 moderated_at 的作品不能透過撤回復原。

訂閱成功後才讀初始快照，避免初次讀取與訂閱之間漏更新。每次事件觸發重新讀取；讀取中的事件會安排再讀一次，避免舊快照覆蓋較新的通知。重連後讀完整快照，另外每 10 秒對帳，同時更新圖片簽名網址的到期快取。完整讀取只是用於顯示，沒有整份覆寫。

畫筆草稿與拖曳位置只在本機顯示，放開手指後送一筆 RPC；已提交內容才對其他訪客可見。連線中斷時停用操作並顯示重試。儲存中顯示短提示，不做假成功的 optimistic snapshot 寫入。網路逾時後結果可能未知，重連讀伺服器狀態；沒有離線佇列或自動合併本機舊作品。

圖片先完成 Storage 上傳再建立 sticker 記錄；若第二步失敗，可能留下未使用檔案，需管理者清理。任一被加入畫布的圖片須位於建立者自己的路徑且確實存在。signed URL TTL 為一小時，前端每 45 分鐘後更新簽名快取；其他使用者只能替目前畫布引用的圖片簽名，不能任意讀取別人的未引用上傳。

SQL 是可執行 migration，非示意稿；見 `supabase/migrations/202610120001_family_board.sql`。實際雲端部署仍需建立 Supabase 專案、啟用匿名登入、執行 SQL 並提供公開環境變數。沒有這些設定，前端不會 fallback 到 localStorage。
