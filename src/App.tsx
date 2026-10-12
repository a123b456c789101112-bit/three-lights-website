import { useRef, useState, type PointerEvent } from 'react';
import { colors, EMPTY_BOARD, MAX_ITEMS, readImage, STICKERS, type Artwork, type Board, type Point, type Stroke } from './model';
import { loadLocalBoard, saveLocalBoard } from './storage';
const names = ['暖光', '月光', '晨光'];
export default function App() {
  const [lights, setLights] = useState([false, false, false]);
  const [error, setError] = useState('');
  const [initial] = useState(() => { try { return { board: loadLocalBoard(), error: '' }; } catch (e) { return { board: EMPTY_BOARD, error: String(e instanceof Error ? e.message : e) }; } });
  const [board, setBoard] = useState<Board>(initial.board);
  const [color, setColor] = useState(colors[0]);
  const [width, setWidth] = useState(5);
  const [eraser, setEraser] = useState(false);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const activePointer = useRef<number | null>(null);
  const drag = useRef<{ id: string; start: Point; original: Point } | null>(null);
  const boardRef = useRef(board);
  const strokeRef = useRef<Stroke | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const enabled = lights.some(Boolean);
  function commit(items: Artwork[]) {
    if (items.length > MAX_ITEMS) { setError('畫布最多容納 150 個物件，請先移除一些作品。'); return; }
    try { const next: Board = { version: 1, items }; saveLocalBoard(next); boardRef.current = next; setBoard(next); setError(''); setNotice('已儲存在這台裝置'); } catch (e) { setBoard(boardRef.current); setError(e instanceof Error ? e.message : '儲存失敗'); }
  }
  function point(e: PointerEvent<SVGSVGElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1000, (e.clientX - rect.left) / rect.width * 1000)), y: Math.max(0, Math.min(700, (e.clientY - rect.top) / rect.height * 700)) };
  }
  function down(e: PointerEvent<SVGSVGElement>) {
    if (!enabled || activePointer.current !== null || e.button !== 0) return;
    activePointer.current = e.pointerId;
    const p = point(e);
    const id = (e.target as Element).closest('[data-id]')?.getAttribute('data-id');
    if (eraser) { if (id) commit(boardRef.current.items.filter(i => i.id !== id)); activePointer.current = null; return; }
    const item = boardRef.current.items.find(i => i.id === id);
    if (item?.kind === 'sticker') { drag.current = { id: item.id, start: p, original: { x: item.x, y: item.y } }; setSelected(item.id); }
    else { const stroke: Stroke = { id: crypto.randomUUID(), kind: 'stroke', color, width, points: [p] }; strokeRef.current = stroke; setDraft(stroke); setSelected(null); }
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    if (activePointer.current !== e.pointerId) return;
    const p = point(e);
    if (strokeRef.current && strokeRef.current.points.length < 3000) { const next = { ...strokeRef.current, points: [...strokeRef.current.points, p] }; strokeRef.current = next; setDraft(next); }
    if (drag.current) { const d = drag.current; setBoard({ version: 1, items: boardRef.current.items.map(i => i.id === d.id && i.kind === 'sticker' ? { ...i, x: Math.max(55, Math.min(945, d.original.x + p.x - d.start.x)), y: Math.max(55, Math.min(645, d.original.y + p.y - d.start.y)) } : i) }); }
  }
  function finish(e: PointerEvent<SVGSVGElement>, cancel = false) {
    if (activePointer.current !== e.pointerId) return;
    if (cancel) setBoard(boardRef.current);
    else if (strokeRef.current) commit([...boardRef.current.items, strokeRef.current]);
    else if (drag.current) commit(board.items);
    activePointer.current = null; drag.current = null; strokeRef.current = null; setDraft(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function addSticker(content: string, image = false) { const id = crypto.randomUUID(); commit([...boardRef.current.items, { id, kind: 'sticker', x: 500, y: 350, content, image }]); setSelected(id); }
  function renderItem(item: Artwork) {
    if (item.kind === 'stroke') return <polyline key={item.id} data-id={item.id} points={(item.points.length === 1 ? [item.points[0], { x: item.points[0].x + 0.01, y: item.points[0].y }] : item.points).map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={item.color} strokeWidth={item.width} strokeLinecap="round" strokeLinejoin="round" />;
    return <g key={item.id} data-id={item.id} role="button" tabIndex={enabled ? 0 : -1} aria-label={item.image ? '選取圖片貼圖' : `選取 ${item.content} 貼圖`} onFocus={() => setSelected(item.id)} onKeyDown={e => {
      if (!enabled) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); commit(boardRef.current.items.filter(i => i.id !== item.id)); }
      const offsets: Record<string, Point> = { ArrowLeft: { x: -10, y: 0 }, ArrowRight: { x: 10, y: 0 }, ArrowUp: { x: 0, y: -10 }, ArrowDown: { x: 0, y: 10 } };
      if (offsets[e.key]) { e.preventDefault(); const d = offsets[e.key]; commit(boardRef.current.items.map(i => i.id === item.id && i.kind === 'sticker' ? { ...i, x: Math.max(55, Math.min(945, i.x + d.x)), y: Math.max(55, Math.min(645, i.y + d.y)) } : i)); }
    }}>
      {selected === item.id && <rect x={item.x - 58} y={item.y - 58} width="116" height="116" rx="16" fill="none" stroke="#b7a16d" strokeDasharray="5 5" />}
      {item.image ? <image href={item.content} x={item.x - 50} y={item.y - 50} width="100" height="100" preserveAspectRatio="xMidYMid meet" /> : <text x={item.x} y={item.y} fontSize="80" textAnchor="middle" dominantBaseline="central" fill="#858a78">{item.content}</text>}
    </g>;
  }
  return <div className="app"><header><a className="brand" href="#">THREE LIGHTS<span>三盞燈</span></a><span className="edition">A LITTLE SPACE TO CREATE</span></header>
    <main><section className="intro"><p className="eyebrow">慢下來，留下一點光</p><h1>點一盞燈，<br className="mobile-break"/>畫一個此刻。</h1><p className="subtitle">讓指尖的線條與小小的想像，在這裡相遇。</p></section>
    <section className="lights" aria-label="三盞燈">{names.map((name, i) => <button key={name} className={`light light-${i} ${lights[i] ? 'on' : ''}`} aria-pressed={lights[i]} onClick={() => { setLights(lights.map((v, n) => n === i ? !v : v)); setNotice(lights[i] ? `${name}已關閉` : `${name}已點亮，可以開始畫畫`); }}><span className="orb"/><span className="light-name">{name}</span><span className="light-number">0{i + 1} — {lights[i] ? '已點亮' : '輕觸點亮'}</span></button>)}</section>
    <section className="studio" aria-label="繪畫工作區"><div className="studio-heading"><div><span className="eyebrow">YOUR LITTLE CANVAS</span><h2>留一筆，留一點想像</h2></div><span className="local-badge"><i/> 僅此裝置</span></div>
      <p className="storage-note">作品只保存在這個瀏覽器，尚未與其他訪客共享。</p>
      <div className={`canvas-wrap ${enabled ? 'enabled' : ''}`}><svg aria-label="繪畫畫布" className="canvas" viewBox="0 0 1000 700" preserveAspectRatio="none" onPointerDown={down} onPointerMove={move} onPointerUp={e => finish(e)} onPointerCancel={e => finish(e, true)}>{board.items.map(renderItem)}{draft && renderItem(draft)}</svg>
      {!enabled && <div className="canvas-hint"><span>✧</span><p>點亮上方任一盞燈<br/><small>就能用手指或滑鼠，留下你的筆觸</small></p></div>}{enabled && board.items.length === 0 && !draft && <div className="canvas-hint subtle"><p>從這裡開始，自由畫吧。<br/><small>貼圖可以拖曳移動</small></p></div>}</div>
      <fieldset className="tools" disabled={!enabled}><legend className="sr-only">畫筆與貼圖工具</legend><div className="tool-row"><div className="swatches" role="group" aria-label="畫筆顏色">{colors.map((c, i) => <button key={c} className={`swatch ${color === c && !eraser ? 'chosen' : ''}`} style={{ backgroundColor: c }} aria-label={['石灰色', '陶粉色', '暖沙色', '鼠尾草綠', '霧藍色'][i]} aria-pressed={color === c && !eraser} onClick={() => { setColor(c); setEraser(false); }}/>)}</div><span className="separator"/><label className="brush-label">筆觸 <input aria-label="畫筆粗細" type="range" min="2" max="16" value={width} onChange={e => setWidth(Number(e.target.value))}/><span>{width}</span></label><button className={`tool-button ${eraser ? 'active' : ''}`} aria-pressed={eraser} onClick={() => setEraser(!eraser)}>⌫ 橡皮擦</button></div>
      <div className="tool-row stickers"><span className="tool-caption">一點裝飾</span>{STICKERS.map(s => <button key={s} aria-label={`加入 ${s} 貼圖`} onClick={() => addSticker(s)}>{s}</button>)}<button className="tool-button upload" disabled={uploading} onClick={() => input.current?.click()}>{uploading ? '讀取中…' : '＋ 我的圖片'}</button><input ref={input} className="sr-only" type="file" aria-label="上傳自己的圖片" accept="image/png,image/jpeg,image/webp" disabled={uploading || !enabled} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; setUploading(true); try { addSticker(await readImage(file), true); } catch (err) { setError(err instanceof Error ? err.message : '圖片讀取失敗'); } finally { setUploading(false); } }}/></div>
      <div className="tool-row actions"><small>{eraser ? '點一下線條或貼圖，移除整個物件。' : '用手指畫畫 · 拖曳貼圖 · 圖片上限 1 MB'}</small><button className="text-button" disabled={!selected || !board.items.some(i => i.id === selected)} onClick={() => { commit(boardRef.current.items.filter(i => i.id !== selected)); setSelected(null); }}>移除選取貼圖</button><button className="text-button" disabled={!board.items.length} onClick={() => commit(boardRef.current.items.slice(0, -1))}>撤回最後一筆</button></div></fieldset>
      {(error || initial.error) && <p className="error" role="alert">{error || initial.error}</p>}<p className="save-status" role="status" aria-live="polite">{notice || '不必畫得完美，留下你喜歡的就好。'}</p>
    </section></main><footer><span>三盞燈 · 一處小小的自由</span><span>MADE FOR QUIET MOMENTS</span></footer></div>;
}
