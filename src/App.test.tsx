import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import {
  validateImage,
  MAX_IMAGE_BYTES,
  type Snapshot,
  type NewArtwork,
} from "./model";
import type { SharedBoardRepository } from "./storage";
// Unit-test double only. Real Supabase cross-browser coverage is in e2e/shared.spec.ts.
class Repository implements SharedBoardRepository {
  snapshot: Snapshot = {
    userId: "me",
    items: [],
    lights: [1, 2, 3].map((id) => ({ id, on: false, revision: 0 })),
    canUndo: false,
  };
  listener = (_: Snapshot) => {};
  emit() {
    this.listener({
      ...this.snapshot,
      items: [...this.snapshot.items],
      lights: [...this.snapshot.lights],
    });
  }
  connect(listener: (value: Snapshot) => void) {
    this.listener = listener;
    this.emit();
    return () => {};
  }
  async create(item: NewArtwork) {
    this.snapshot.items.push({ ...item, authorId: "me", revision: 1 });
    this.snapshot.canUndo = true;
    this.emit();
  }
  async move(id: string, x: number, y: number) {
    this.snapshot.items = this.snapshot.items.map((i) =>
      i.id === id && i.kind === "sticker" ? { ...i, x, y } : i,
    );
    this.emit();
  }
  async remove(id: string) {
    this.snapshot.items = this.snapshot.items.filter((i) => i.id !== id);
    this.emit();
  }
  async toggleLight(id: number) {
    this.snapshot.lights = this.snapshot.lights.map((l) =>
      l.id === id ? { ...l, on: !l.on } : l,
    );
    this.emit();
  }
  async undo() {
    this.snapshot.items = this.snapshot.items.filter(
      (i) => i.authorId !== "me",
    );
    this.emit();
  }
  async clear() {
    this.snapshot.items = [];
    this.snapshot.canUndo = false;
    this.emit();
  }
  async upload() {
    return "me/image.png";
  }
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("家庭介面", () => {
  it("無設定時只顯示短錯誤，不啟用本機假同步或文案", () => {
    render(<App repository={null} />);
    expect(screen.getByRole("alert").textContent).toBe("尚未設定共享服務。");
    expect(
      screen.getByRole("button", { name: "燈 1" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.queryByText(/暖光|THREE LIGHTS|僅此裝置/)).toBeNull();
  });
  it("三盞燈各自切換，關燈保留畫布且工具可使用", async () => {
    const user = userEvent.setup();
    const repo = new Repository();
    render(<App repository={repo} />);
    await user.click(screen.getByRole("button", { name: "燈 1" }));
    expect(
      screen.getByRole("button", { name: "燈 1" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "燈 2" }).getAttribute("aria-pressed"),
    ).toBe("false");
    await user.click(screen.getByRole("button", { name: "加入 ✿ 貼圖" }));
    await user.click(screen.getByRole("button", { name: "燈 1" }));
    expect(screen.getByRole("button", { name: "選取 ✿ 貼圖" })).toBeTruthy();
    expect(
      screen
        .getByRole("group", { name: "畫筆與貼圖工具" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });
  it("只能移除自己的貼圖", async () => {
    const repo = new Repository();
    repo.snapshot.items = [
      {
        id: "other",
        authorId: "other",
        revision: 1,
        kind: "sticker",
        x: 500,
        y: 350,
        content: "✿",
        image: false,
      },
    ];
    render(<App repository={repo} />);
    fireEvent.focus(screen.getByRole("button", { name: "選取 ✿ 貼圖" }));
    expect(
      screen.getByRole("button", { name: "移除" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.keyDown(screen.getByRole("button", { name: "選取 ✿ 貼圖" }), {
      key: "Delete",
    });
    expect(repo.snapshot.items).toHaveLength(1);
  });
  it("儲存失敗顯示錯誤，不更新燈或宣稱成功", async () => {
    const repo = new Repository();
    repo.toggleLight = async () => {
      throw new Error("連線或儲存失敗，請重試。");
    };
    const user = userEvent.setup();
    render(<App repository={repo} />);
    await user.click(screen.getByRole("button", { name: "燈 1" }));
    expect(screen.getByRole("alert").textContent).toContain("儲存失敗");
    expect(
      screen.getByRole("button", { name: "燈 1" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });
  it("觸控逐筆新增，取消手勢不寫入", async () => {
    class TestPointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, props: PointerEventInit) {
        super(type, props);
        this.pointerId = props.pointerId ?? 1;
      }
    }
    vi.stubGlobal("PointerEvent", TestPointerEvent);
    const repo = new Repository();
    render(<App repository={repo} />);
    const canvas = screen.getByLabelText("繪畫畫布");
    Object.assign(canvas, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => false,
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 1000,
        height: 700,
      }),
    });
    fireEvent.pointerDown(canvas, {
      pointerId: 1,
      clientX: 10,
      clientY: 20,
      button: 0,
    });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 30, clientY: 40 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    await waitFor(() => expect(repo.snapshot.items).toHaveLength(1));
    expect(repo.snapshot.items[0]).toMatchObject({
      kind: "stroke",
      points: [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ],
    });
    fireEvent.pointerDown(canvas, {
      pointerId: 2,
      clientX: 50,
      clientY: 50,
      button: 0,
    });
    fireEvent.pointerCancel(canvas, { pointerId: 2 });
    expect(repo.snapshot.items).toHaveLength(1);
  });
});
it("拒絕 SVG 與大於 1 MB 的圖片", () => {
  expect(() =>
    validateImage(new File(["x"], "x.svg", { type: "image/svg+xml" })),
  ).toThrow(/PNG/);
  expect(() =>
    validateImage(
      new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "x.png", {
        type: "image/png",
      }),
    ),
  ).toThrow(/1 MB/);
  expect(() =>
    validateImage(new File(["x"], "x.png", { type: "image/png" })),
  ).not.toThrow();
});

it("清空須確認，取消保留作品，確認清掉他人作品並保留燈光", async () => {
  const repo = new Repository();
  repo.snapshot.items = [{id:"other",authorId:"other",revision:1,kind:"sticker",x:50,y:50,content:"♡",image:false}];
  repo.snapshot.lights[0].on = true;
  const user = userEvent.setup(); render(<App repository={repo} />);
  await user.click(screen.getByRole("button", {name:"清空畫布"}));
  expect(repo.snapshot.items).toHaveLength(1);
  await user.click(screen.getByRole("button", {name:"取消"}));
  expect(repo.snapshot.items).toHaveLength(1);
  await user.click(screen.getByRole("button", {name:"清空畫布"}));
  await user.click(screen.getByRole("button", {name:"確認清空"}));
  expect(repo.snapshot.items).toHaveLength(0);
  expect(repo.snapshot.lights[0].on).toBe(true);
});
it("拖曳橡皮擦可掃過多筆細線，保留他人作品，取消不刪除", async () => {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type:string, props:PointerEventInit) { super(type,props); this.pointerId=props.pointerId ?? 1; }
  }
  vi.stubGlobal("PointerEvent",TestPointerEvent);
  const repo=new Repository();
  repo.snapshot.items=[100,200,300].map((y,i)=>({id:`s${i}`,authorId:i===2?"other":"me",revision:1,kind:"stroke" as const,color:"#62635e",width:2,points:[{x:100,y},{x:200,y}]}));
  render(<App repository={repo}/>);
  const canvas=screen.getByLabelText("繪畫畫布");
  Object.assign(canvas,{setPointerCapture:vi.fn(),hasPointerCapture:()=>false,getBoundingClientRect:()=>({left:0,top:0,width:1000,height:700})});
  fireEvent.click(screen.getByRole("button",{name:"橡皮擦"}));
  fireEvent.pointerDown(canvas,{pointerId:1,button:0,clientX:150,clientY:110});
  fireEvent.pointerCancel(canvas,{pointerId:1});
  expect(repo.snapshot.items).toHaveLength(3);
  fireEvent.pointerDown(canvas,{pointerId:2,button:0,clientX:150,clientY:110});
  fireEvent.pointerMove(canvas,{pointerId:2,clientX:150,clientY:310});
  fireEvent.pointerUp(canvas,{pointerId:2,clientX:150,clientY:310});
  await waitFor(()=>expect(repo.snapshot.items.map(i=>i.id)).toEqual(["s2"]));
});
