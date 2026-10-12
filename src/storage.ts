import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  prepareImage,
  type NewArtwork,
  type Artwork,
  type Snapshot,
} from "./model";
export interface SharedBoardRepository {
  connect(
    onSnapshot: (snapshot: Snapshot) => void,
    onError: (message: string) => void,
  ): () => void;
  create(item: NewArtwork): Promise<void>;
  move(id: string, x: number, y: number, revision: number): Promise<void>;
  remove(id: string, revision: number): Promise<void>;
  toggleLight(id: number): Promise<void>;
  undo(): Promise<void>;
  clear(): Promise<void>;
  upload(file: File): Promise<string>;
}
export const NOT_CONFIGURED = "尚未設定共享服務。";
function fail(error: { message?: string } | null) {
  if (!error) return;
  const text = error.message ?? "";
  if (text.includes("undo_conflict"))
    throw new Error("已有其他操作，無法撤回。");
  if (text.includes("conflict")) throw new Error("內容已更新，請再試一次。");
  if (text.includes("limit")) throw new Error("操作或容量超限，請稍後再試。");
  if (text.includes("not_owner")) throw new Error("只能修改自己的作品。");
  throw new Error("連線或儲存失敗，請重試。");
}
export class SupabaseBoardRepository implements SharedBoardRepository {
  private userId = "";
  private authenticating: Promise<void> | null = null;
  private urls = new Map<string, { url: string; expires: number }>();
  constructor(private client: SupabaseClient) {}
  private authenticate() {
    if (!this.authenticating)
      this.authenticating = this.initializeSession().finally(() => {
        this.authenticating = null;
      });
    return this.authenticating;
  }
  private async initializeSession() {
    const { data, error } = await this.client.auth.getSession();
    fail(error);
    if (data.session) {
      this.userId = data.session.user.id;
      return;
    }
    const result = await this.client.auth.signInAnonymously();
    fail(result.error);
    if (!result.data.user) throw new Error("無法登入共享服務。");
    this.userId = result.data.user.id;
  }
  private async snapshot(): Promise<Snapshot> {
    const [art, lights, events] = await Promise.all([
      this.client
        .from("family_artworks")
        .select("*")
        .is("deleted_at", null)
        .order("created_at")
        .order("id"),
      this.client.from("family_lights").select("*").order("id"),
      this.client
        .from("family_operations")
        .select("id")
        .eq("actor_id", this.userId)
        .is("undone_at", null)
        .limit(1),
    ]);
    fail(art.error);
    fail(lights.error);
    fail(events.error);
    const items: Artwork[] = await Promise.all(
      (art.data ?? []).map(async (row) => {
        const item = {
          ...row.payload,
          id: row.id,
          kind: row.kind,
          authorId: row.author_id,
          revision: row.revision,
        } as Artwork;
        if (item.kind === "sticker" && item.image) {
          const cached = this.urls.get(item.content);
          if (cached && cached.expires > Date.now()) item.url = cached.url;
          else {
            const result = await this.client.storage
              .from("family-images")
              .createSignedUrl(item.content, 3600);
            fail(result.error);
            if (!result.data) throw new Error("圖片載入失敗。");
            item.url = result.data.signedUrl;
            this.urls.set(item.content, {
              url: item.url,
              expires: Date.now() + 45 * 60 * 1000,
            });
          }
        }
        return item;
      }),
    );
    if (lights.data?.length !== 3) throw new Error("共享服務尚未初始化。");
    return {
      items,
      lights: lights.data.map((row) => ({
        id: row.id,
        on: row.is_on,
        revision: row.revision,
      })),
      userId: this.userId,
      canUndo: Boolean(events.data?.length),
    };
  }
  connect(
    onSnapshot: (snapshot: Snapshot) => void,
    onError: (message: string) => void,
  ) {
    let closed = false,
      subscribed = false,
      reading = false,
      dirty = false;
    let channel: ReturnType<SupabaseClient["channel"]> | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    // Subscribe before initial read. Coalesce events but repeat reads that raced with a change.
    const refresh = async () => {
      if (closed || !subscribed) return;
      if (reading) {
        dirty = true;
        return;
      }
      reading = true;
      do {
        dirty = false;
        try {
          const snapshot = await this.snapshot();
          if (!closed && subscribed) onSnapshot(snapshot);
        } catch (error) {
          if (!closed)
            onError(error instanceof Error ? error.message : "連線失敗。");
        }
      } while (dirty && !closed && subscribed);
      reading = false;
    };
    void this.authenticate()
      .then(() => {
        if (closed) return;
        channel = this.client
          .channel(`family-board-${crypto.randomUUID()}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "family_artworks" },
            () => {
              void refresh();
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "family_lights" },
            () => {
              void refresh();
            },
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "family_operations",
              filter: `actor_id=eq.${this.userId}`,
            },
            () => {
              void refresh();
            },
          )
          .subscribe((status) => {
            if (closed) return;
            subscribed = status === "SUBSCRIBED";
            if (subscribed) void refresh();
            else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status))
              onError("連線中斷，請重試。");
          });
        interval = setInterval(() => {
          void refresh();
        }, 10000);
      })
      .catch((error) => {
        if (!closed)
          onError(error instanceof Error ? error.message : "連線失敗。");
      });
    const online = () => {
      void refresh();
    };
    const offline = () => {
      subscribed = false;
      onError("連線中斷，請重試。");
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      closed = true;
      clearInterval(interval);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      if (channel) void this.client.removeChannel(channel);
    };
  }
  private async mutate(action: string, args: Record<string, unknown> = {}) {
    const result = await this.client.rpc("family_mutate", {
      p_action: action,
      p_op_id: crypto.randomUUID(),
      ...args,
    });
    fail(result.error);
  }
  async create(item: NewArtwork) {
    const { id, kind, ...payload } = item;
    if ("url" in payload) delete payload.url;
    await this.mutate("create", { p_id: id, p_kind: kind, p_payload: payload });
  }
  async move(id: string, x: number, y: number, revision: number) {
    await this.mutate("move", {
      p_id: id,
      p_payload: { x, y },
      p_revision: revision,
    });
  }
  async remove(id: string, revision: number) {
    await this.mutate("remove", { p_id: id, p_revision: revision });
  }
  async toggleLight(id: number) {
    await this.mutate("light", { p_light: id });
  }
  async undo() {
    await this.mutate("undo");
  }
  async clear() {
    const result = await this.client.rpc("family_clear");
    fail(result.error);
  }
  async upload(file: File) {
    const blob = await prepareImage(file);
    const path = `${this.userId}/${crypto.randomUUID()}.png`;
    const result = await this.client.storage
      .from("family-images")
      .upload(path, blob, { contentType: "image/png", upsert: false });
    fail(result.error);
    return path;
  }
}
export function createRepository(): SharedBoardRepository | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  try {
    if (key.startsWith("sb_secret_")) return null;
    if (!key.startsWith("sb_publishable_")) {
      const payload = JSON.parse(
        atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload.role !== "anon") return null;
    }
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(parsed.hostname)
    )
      return null;
    return new SupabaseBoardRepository(createClient(url, key));
  } catch {
    return null;
  }
}
