import { useRef, useState, type PointerEvent } from "react";
import {
  colors,
  STICKERS,
  type Artwork,
  type Point,
  type Stroke,
} from "./model";
import { createRepository, type SharedBoardRepository } from "./storage";
import { hitsEraser } from "./eraser";
import { useSharedBoard } from "./useSharedBoard";
const defaultRepository = createRepository();
export default function App({
  repository = defaultRepository,
}: {
  repository?: SharedBoardRepository | null;
}) {
  const { snapshot, ready, busy, error, run, reconnect } =
    useSharedBoard(repository);
  const [color, setColor] = useState(colors[0]);
  const [width, setWidth] = useState(5);
  const [eraser, setEraser] = useState(false);
  const [eraseSize, setEraseSize] = useState(32);
  const [eraseCursor, setEraseCursor] = useState<Point | null>(null);
  const [erasedIds, setErasedIds] = useState<Set<string>>(new Set());
  const erased = useRef(new Map<string, Artwork>());
  const lastErase = useRef<Point | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [position, setPosition] = useState<Point | null>(null);
  const activePointer = useRef<number | null>(null);
  const drag = useRef<{
    item: Artwork;
    start: Point;
    original: Point;
    current: Point;
  } | null>(null);
  const strokeRef = useRef<Stroke | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<SVGSVGElement>(null);
  // Lights represent bathing status. Turning them off never clears or disables the board.
  const enabled = ready && !busy;
  const owned = (item: Artwork) => item.authorId === snapshot.userId;
  function point(e: PointerEvent<SVGSVGElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(1000, ((e.clientX - rect.left) / rect.width) * 1000),
      ),
      y: Math.max(
        0,
        Math.min(700, ((e.clientY - rect.top) / rect.height) * 700),
      ),
    };
  }
  function sweep(e: PointerEvent<SVGSVGElement>) {
    const p = point(e);
    const rect = e.currentTarget.getBoundingClientRect();
    const previous = lastErase.current ?? p;
    for (const item of snapshot.items) {
      if (owned(item) && hitsEraser(item, previous, p, eraseSize / 2, rect.width / 1000, rect.height / 700))
        erased.current.set(item.id, item);
    }
    lastErase.current = p;
    setEraseCursor(p);
    setErasedIds(new Set(erased.current.keys()));
  }
  function down(e: PointerEvent<SVGSVGElement>) {
    if (!enabled || activePointer.current !== null || e.button !== 0) return;
    const p = point(e);
    const id = (e.target as Element)
      .closest("[data-id]")
      ?.getAttribute("data-id");
    const item = snapshot.items.find((value) => value.id === id);
    if (eraser) {
      activePointer.current = e.pointerId;
      erased.current.clear();
      lastErase.current = null;
      sweep(e);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (item?.kind === "sticker") {
      setSelected(item.id);
      if (!owned(item)) return;
      drag.current = {
        item,
        start: p,
        original: { x: item.x, y: item.y },
        current: { x: item.x, y: item.y },
      };
    } else {
      const stroke: Stroke = {
        id: crypto.randomUUID(),
        kind: "stroke",
        color,
        width,
        points: [p],
      };
      strokeRef.current = stroke;
      setDraft(stroke);
      setSelected(null);
    }
    activePointer.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    if (eraser) setEraseCursor(point(e));
    if (activePointer.current !== e.pointerId) return;
    if (eraser) { sweep(e); return; }
    const p = point(e);
    if (strokeRef.current && strokeRef.current.points.length < 3000) {
      const next = {
        ...strokeRef.current,
        points: [...strokeRef.current.points, p],
      };
      strokeRef.current = next;
      setDraft(next);
    }
    if (drag.current) {
      const d = drag.current;
      d.current = {
        x: Math.max(55, Math.min(945, d.original.x + p.x - d.start.x)),
        y: Math.max(55, Math.min(645, d.original.y + p.y - d.start.y)),
      };
      setPosition(d.current);
    }
  }
  function finish(e: PointerEvent<SVGSVGElement>, cancel = false) {
    if (activePointer.current !== e.pointerId) return;
    if (eraser) {
      if (!cancel) {
        sweep(e);
        const targets = [...erased.current.values()];
        if (targets.length) void run(async (repo) => {
          for (const item of targets) await repo.remove(item.id, item.revision);
        });
      }
      erased.current.clear();
      lastErase.current = null;
      setErasedIds(new Set());
    } else if (!cancel) {
      const stroke = strokeRef.current,
        d = drag.current;
      if (stroke) void run((repo) => repo.create(stroke));
      else if (d)
        void run((repo) =>
          repo.move(d.item.id, d.current.x, d.current.y, d.item.revision),
        );
    }
    activePointer.current = null;
    drag.current = null;
    strokeRef.current = null;
    setDraft(null);
    setPosition(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function addSticker(content: string) {
    const id = crypto.randomUUID();
    void run((repo) =>
      repo.create({
        id,
        kind: "sticker",
        x: 500,
        y: 350,
        content,
        image: false,
      }),
    ).then((ok) => {
      if (ok) setSelected(id);
    });
  }
  function renderItem(item: Artwork | Stroke) {
    if (item.kind === "stroke")
      return (
        <polyline
          key={item.id}
          data-id={item.id}
          points={(item.points.length === 1
            ? [
                item.points[0],
                { x: item.points[0].x + 0.01, y: item.points[0].y },
              ]
            : item.points
          )
            .map((p) => `${p.x},${p.y}`)
            .join(" ")}
          fill="none"
          stroke={item.color}
          strokeWidth={item.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    const p = selected === item.id && position ? position : item;
    return (
      <g
        key={item.id}
        data-id={item.id}
        role="button"
        tabIndex={enabled ? 0 : -1}
        aria-label={item.image ? "選取圖片貼圖" : `選取 ${item.content} 貼圖`}
        onFocus={() => setSelected(item.id)}
        onKeyDown={(e) => {
          if (!enabled || !owned(item)) return;
          if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            void run((repo) => repo.remove(item.id, item.revision));
          }
          const offsets: Record<string, Point> = {
            ArrowLeft: { x: -10, y: 0 },
            ArrowRight: { x: 10, y: 0 },
            ArrowUp: { x: 0, y: -10 },
            ArrowDown: { x: 0, y: 10 },
          };
          if (offsets[e.key]) {
            e.preventDefault();
            const d = offsets[e.key];
            void run((repo) =>
              repo.move(
                item.id,
                Math.max(55, Math.min(945, item.x + d.x)),
                Math.max(55, Math.min(645, item.y + d.y)),
                item.revision,
              ),
            );
          }
        }}
      >
        {selected === item.id && (
          <rect
            x={p.x - 58}
            y={p.y - 58}
            width="116"
            height="116"
            rx="16"
            fill="none"
            stroke="#b7a16d"
            strokeDasharray="5 5"
          />
        )}
        {item.image ? (
          <image
            href={item.url}
            x={p.x - 50}
            y={p.y - 50}
            width="100"
            height="100"
            preserveAspectRatio="xMidYMid meet"
          />
        ) : (
          <text
            x={p.x}
            y={p.y}
            fontSize="80"
            textAnchor="middle"
            dominantBaseline="central"
            fill="#858a78"
          >
            {item.content}
          </text>
        )}
      </g>
    );
  }
  const selectedItem = snapshot.items.find((item) => item.id === selected);
  return (
    <main className="app">
      <section className="lights" aria-label="洗澡狀態">
        {snapshot.lights.map((light) => (
          <button
            key={light.id}
            className={`light ${light.on ? "on" : ""}`}
            aria-label={`燈 ${light.id}`}
            aria-pressed={light.on}
            disabled={!enabled}
            onClick={() => {
              void run((repo) => repo.toggleLight(light.id));
            }}
          >
            <span className="orb" />
            <span className="light-number">{light.id}</span>
          </button>
        ))}
      </section>
      <section className="studio" aria-label="塗鴉">
        {error && (
          <div className="connection-error" role="alert">
            {error}
            {repository && <button onClick={reconnect}>重試</button>}
          </div>
        )}
        {!ready && !error && (
          <p role="status" className="status">
            連線中…
          </p>
        )}
        <div className={`canvas-wrap ${enabled ? "enabled" : ""}`}>
          <svg
            ref={canvasRef}
            aria-label="繪畫畫布"
            className={`canvas ${eraser ? "erasing" : ""}`}
            onPointerLeave={() => { if (activePointer.current === null) setEraseCursor(null); }}
            viewBox="0 0 1000 700"
            preserveAspectRatio="none"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={(e) => finish(e)}
            onPointerCancel={(e) => finish(e, true)}
          >
            {snapshot.items.filter(item => !erasedIds.has(item.id)).map(renderItem)}
            {eraser && eraseCursor && <ellipse cx={eraseCursor.x} cy={eraseCursor.y}
              rx={eraseSize / 2 * 1000 / (canvasRef.current?.getBoundingClientRect().width || 1000)}
              ry={eraseSize / 2 * 700 / (canvasRef.current?.getBoundingClientRect().height || 700)}
              fill="#ffffff66" stroke="#955f51" strokeWidth="2" pointerEvents="none" />}
            {draft && renderItem(draft)}
          </svg>
        </div>
        <fieldset className="tools" disabled={!enabled}>
          <legend className="sr-only">畫筆與貼圖工具</legend>
          <div className="tool-row">
            <div className="swatches" role="group" aria-label="畫筆顏色">
              {colors.map((c, i) => (
                <button
                  key={c}
                  className={`swatch ${color === c && !eraser ? "chosen" : ""}`}
                  style={{ backgroundColor: c }}
                  aria-label={["灰色", "粉色", "黃色", "綠色", "藍色"][i]}
                  aria-pressed={color === c && !eraser}
                  onClick={() => {
                    setColor(c);
                    setEraser(false);
                  }}
                />
              ))}
            </div>
            <label className="brush-label">
              畫筆{" "}
              <input
                aria-label="畫筆粗細"
                type="range"
                min="2"
                max="16"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
              />
              <span>{width}</span>
            </label>
            <button
              className={`tool-button ${eraser ? "active" : ""}`}
              aria-pressed={eraser}
              onClick={() => setEraser(!eraser)}
            >
              橡皮擦
            </button>
            {eraser && <label className="brush-label">擦除範圍 <input aria-label="橡皮擦大小" type="range" min="16" max="80" value={eraseSize} onChange={e => setEraseSize(Number(e.target.value))} /></label>}
          </div>
          <div className="tool-row stickers">
            <span className="tool-caption">貼圖</span>
            {STICKERS.map((s) => (
              <button
                key={s}
                aria-label={`加入 ${s} 貼圖`}
                onClick={() => addSticker(s)}
              >
                {s}
              </button>
            ))}
            <button
              className="tool-button upload"
              onClick={() => input.current?.click()}
            >
              上傳圖片
            </button>
            <input
              ref={input}
              className="sr-only"
              type="file"
              aria-label="上傳自己的圖片"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                void run(async (repo) => {
                  const path = await repo.upload(file);
                  await repo.create({
                    id: crypto.randomUUID(),
                    kind: "sticker",
                    x: 500,
                    y: 350,
                    content: path,
                    image: true,
                  });
                });
              }}
            />
          </div>
          <div className="tool-row actions">
            <button
              className="text-button"
              disabled={!selectedItem || !owned(selectedItem)}
              onClick={() => {
                if (selectedItem)
                  void run((repo) =>
                    repo.remove(selectedItem.id, selectedItem.revision),
                  );
              }}
            >
              移除
            </button>
            <button
              className="text-button"
              disabled={!snapshot.canUndo}
              onClick={() => {
                void run((repo) => repo.undo());
              }}
            >
              撤回
            </button>
            <button className="text-button" disabled={!snapshot.items.length} onClick={() => setConfirmClear(true)}>清空畫布</button>
          </div>
        </fieldset>
        {confirmClear && <div className="clear-backdrop"><section className="clear-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-title" aria-describedby="clear-description" onKeyDown={e => { if (e.key === "Escape") setConfirmClear(false); }}>
          <h2 id="clear-title">清空畫布？</h2><p id="clear-description">所有人的塗鴉和貼圖都會刪除，無法撤回。燈光狀態會保留。</p>
          <div className="tool-row"><button className="tool-button" autoFocus onClick={() => setConfirmClear(false)}>取消</button><button className="tool-button" disabled={!enabled} onClick={() => { setConfirmClear(false); void run(repo => repo.clear()); }}>確認清空</button></div>
        </section></div>}
        {busy && (
          <p role="status" className="status">
            儲存中…
          </p>
        )}
      </section>
    </main>
  );
}
