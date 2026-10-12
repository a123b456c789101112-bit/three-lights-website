import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";
const env = { ...loadEnv("test", process.cwd(), "VITE_"), ...process.env };
test.skip(
  !env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY,
  "需要 Supabase 測試後端。",
);
test("真實 API 權限、資料驗證、版本衝突與未引用圖片存取", async () => {
  const client = () =>
    createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  const a = client(),
    b = client(),
    unauthenticated = client();
  const [sa, sb] = await Promise.all([
    a.auth.signInAnonymously(),
    b.auth.signInAnonymously(),
  ]);
  expect(sa.error).toBeNull();
  expect(sb.error).toBeNull();
  expect(sa.data.user?.id).not.toBe(sb.data.user?.id);
  const id = crypto.randomUUID();
  const payload = { color: "#62635e", width: 5, points: [{ x: 10, y: 10 }] };
  const mutate = (
    who: typeof a,
    action: string,
    args: Record<string, unknown> = {},
  ) =>
    who.rpc("family_mutate", {
      p_action: action,
      p_op_id: crypto.randomUUID(),
      ...args,
    });
  expect(
    (
      await a
        .from("family_artworks")
        .insert({ id, kind: "stroke", author_id: sa.data.user!.id, payload })
    ).error,
  ).not.toBeNull();
  expect(
    (await unauthenticated.from("family_artworks").select("id")).error,
  ).not.toBeNull();
  const op = crypto.randomUUID();
  const create = {
    p_action: "create",
    p_op_id: op,
    p_id: id,
    p_kind: "stroke",
    p_payload: payload,
  };
  expect((await a.rpc("family_mutate", create)).error).toBeNull();
  expect((await a.rpc("family_mutate", create)).error).toBeNull(); // idempotent request ID
  expect(
    (await b.from("family_artworks").select("id").eq("id", id)).data,
  ).toHaveLength(1);
  expect(
    (await mutate(b, "remove", { p_id: id, p_revision: 1 })).error?.message,
  ).toContain("not_owner");
  expect(
    (
      await mutate(a, "create", {
        p_id: crypto.randomUUID(),
        p_kind: "stroke",
        p_payload: { ...payload, width: 0 },
      })
    ).error?.message,
  ).toContain("invalid_payload");
  expect(
    (
      await mutate(a, "create", {
        p_id: crypto.randomUUID(),
        p_kind: "stroke",
        p_payload: null,
      })
    ).error?.message,
  ).toContain("invalid_payload");
  expect((await mutate(a, "undo")).error).toBeNull();
  expect(
    (
      await b
        .from("family_artworks")
        .select("id")
        .eq("id", id)
        .is("deleted_at", null)
    ).data,
  ).toHaveLength(0);
  const sticker = crypto.randomUUID();
  expect(
    (
      await mutate(a, "create", {
        p_id: sticker,
        p_kind: "sticker",
        p_payload: { x: 500, y: 350, content: "✿", image: false },
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await mutate(a, "move", {
        p_id: sticker,
        p_revision: 1,
        p_payload: { x: 510, y: 350 },
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await mutate(a, "move", {
        p_id: sticker,
        p_revision: 1,
        p_payload: { x: 520, y: 350 },
      })
    ).error?.message,
  ).toContain("conflict");
  // Undo move then create still works despite incremented revisions.
  expect((await mutate(a, "undo")).error).toBeNull();
  expect((await mutate(a, "undo")).error).toBeNull();
  const path = `${sa.data.user!.id}/${crypto.randomUUID()}.png`;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=",
    "base64",
  );
  expect(
    (
      await a.storage
        .from("family-images")
        .upload(path, png, { contentType: "image/png" })
    ).error,
  ).toBeNull();
  expect(
    (await b.storage.from("family-images").createSignedUrl(path, 60)).error,
  ).not.toBeNull();
  expect(
    (
      await b.storage
        .from("family-images")
        .upload(`${sa.data.user!.id}/${crypto.randomUUID()}.png`, png, {
          contentType: "image/png",
        })
    ).error,
  ).not.toBeNull();
  expect(
    (
      await mutate(b, "create", {
        p_id: crypto.randomUUID(),
        p_kind: "sticker",
        p_payload: { x: 500, y: 350, image: true, content: path },
      })
    ).error?.message,
  ).toContain("invalid_image");
  expect(
    (
      await a.storage
        .from("family-images")
        .upload(
          `${sa.data.user!.id}/${crypto.randomUUID()}.png`,
          Buffer.alloc(1048577),
          { contentType: "image/png" },
        )
    ).error,
  ).not.toBeNull();
});
