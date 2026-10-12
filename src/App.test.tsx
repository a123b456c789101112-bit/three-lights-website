import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { isBoard, MAX_IMAGE_BYTES, validateImage } from './model';
import { loadLocalBoard, saveLocalBoard } from './storage';
beforeEach(() => localStorage.clear());
afterEach(cleanup);
describe('燈光與畫布', () => {
  it('初始關燈，點亮解鎖工具，再點關閉', async () => {
    const user = userEvent.setup(); render(<App />);
    const light = screen.getByRole('button', { name: /暖光/ });
    expect(light.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('group', { name: '畫筆與貼圖工具' }).hasAttribute('disabled')).toBe(true);
    await user.click(light);
    expect(light.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('group', { name: '畫筆與貼圖工具' }).hasAttribute('disabled')).toBe(false);
    await user.click(light);
    expect(light.getAttribute('aria-pressed')).toBe('false');
  });
  it('貼圖持久保存、鍵盤移動、移除與撤回', async () => {
    const user = userEvent.setup(); const view = render(<App />);
    await user.click(screen.getByRole('button', { name: /暖光/ }));
    await user.click(screen.getByRole('button', { name: '加入 ✿ 貼圖' }));
    expect(loadLocalBoard().items).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole('button', { name: '選取 ✿ 貼圖' }), { key: 'ArrowRight' });
    expect(loadLocalBoard().items[0]).toMatchObject({ x: 510 });
    view.unmount(); render(<App />);
    expect(screen.getByRole('button', { name: '選取 ✿ 貼圖' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /月光/ }));
    await user.click(screen.getByRole('button', { name: '撤回最後一筆' }));
    expect(loadLocalBoard().items).toHaveLength(0);
  });
  it('觸控畫線儲存、取消不留下筆跡、橡皮擦移除', async () => {
    class TestPointerEvent extends MouseEvent { pointerId: number; constructor(type: string, props: PointerEventInit) { super(type, props); this.pointerId = props.pointerId ?? 1; } }
    vi.stubGlobal('PointerEvent', TestPointerEvent);
    const user = userEvent.setup(); render(<App />);
    await user.click(screen.getByRole('button', { name: /暖光/ }));
    const canvas = screen.getByLabelText('繪畫畫布');
    Object.assign(canvas, { setPointerCapture: vi.fn(), hasPointerCapture: () => false, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 700 }) });
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 20, button: 0 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 30, clientY: 40 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    expect(loadLocalBoard().items[0]).toMatchObject({ kind: 'stroke', points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] });
    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 50, clientY: 50, button: 0 });
    fireEvent.pointerCancel(canvas, { pointerId: 2 });
    expect(loadLocalBoard().items).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /橡皮擦/ }));
    fireEvent.pointerDown(canvas.querySelector('polyline')!, { pointerId: 3, button: 0 });
    expect(loadLocalBoard().items).toHaveLength(0);
    vi.unstubAllGlobals();
  });
  it('儲存失敗會顯示錯誤，避免宣稱已儲存', async () => {
    const user = userEvent.setup(); render(<App />);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('儲存空間不足'); });
    await user.click(screen.getByRole('button', { name: /暖光/ }));
    await user.click(screen.getByRole('button', { name: '加入 ✿ 貼圖' }));
    expect(screen.getByRole('alert').textContent).toContain('儲存空間不足');
    expect(screen.queryByRole('button', { name: '選取 ✿ 貼圖' })).toBeNull();
  });
});
describe('資料與圖片限制', () => {
  it('拒絕 SVG 與超大圖片，接受小 PNG', () => {
    expect(() => validateImage(new File(['x'], 'x.svg', { type: 'image/svg+xml' }))).toThrow(/PNG/);
    expect(() => validateImage(new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'x.png', { type: 'image/png' }))).toThrow(/1 MB/);
    expect(() => validateImage(new File(['x'], 'x.png', { type: 'image/png' }))).not.toThrow();
  });
  it('驗證持久化資料，拒絕外部圖片 URL 與不合法座標', () => {
    expect(isBoard({ version: 1, items: [{ id: 'a', kind: 'sticker', image: true, content: 'https://evil.example/image', x: 50, y: 50 }] })).toBe(false);
    expect(isBoard({ version: 1, items: [{ id: 'a', kind: 'stroke', color: '#62635e', width: 5, points: [{ x: NaN, y: 0 }] }] })).toBe(false);
    saveLocalBoard({ version: 1, items: [] }); expect(loadLocalBoard().items).toEqual([]);
    localStorage.setItem('three-lights:board:v1', '{broken'); expect(() => loadLocalBoard()).toThrow();
  });
});
