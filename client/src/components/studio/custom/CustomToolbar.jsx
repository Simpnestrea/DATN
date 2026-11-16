// Thanh công cụ nổi trên khung 3D khi dựng hình tự tạo + phím tắt.
import { shortcutsBlocked } from '../../../utils/keys.js';
import { useEffect, useState } from 'react';
import { Grid3x3, Hand, Magnet, MousePointer2, Move3d, MoveDiagonal2, RefreshCcw, Rotate3d, Scale3d, ScanSearch, SquareDashedMousePointer } from 'lucide-react';
import { useCustomStore } from '../../../store/customStore.js';
import { IconButton } from '../../ui/Button.jsx';
import { duplicate, groupParts, removeParts, sceneBox, ungroupParts } from '../../../three/custom/customOps.js';
import { useViewerStore } from '../../../store/viewerStore.js';

const MODES = [
  { code: 'translate', label: 'Di chuyển – nhấn nhả Shift (hoặc W)', key: '⇧', Icon: Move3d },
  { code: 'rotate', label: 'Xoay – giữ Ctrl (hoặc E)', key: 'Ctrl', Icon: Rotate3d },
  { code: 'scale', label: 'Co giãn (R)', key: 'R', Icon: Scale3d },
];

/**
 * Chuyển chế độ tay cầm bằng phím, khi đang chọn khối:
 *  - Giữ Ctrl  → tay cầm XOAY và GIỮ NGUYÊN sau khi nhả (đến khi có thao tác đổi chế độ khác).
 *    Nếu Ctrl chỉ là một phần của tổ hợp phím (Ctrl+Z, Ctrl+D...) → trả lại chế độ trước đó.
 *  - Nhấn nhả Shift (một mình) → tay cầm DI CHUYỂN.
 *    Shift dùng kèm chuột (chọn thêm, bước 15°) hoặc kèm phím khác → không đổi chế độ.
 */
function useModifierGizmoSwitch() {
  useEffect(() => {
    let ctrl = null; // { prev, combo }
    let shiftTap = false;
    const typing = shortcutsBlocked;
    const onDown = (e) => {
      if (typing(e)) return;
      const st = useCustomStore.getState();
      if (e.key === 'Control' || e.key === 'Meta') {
        if (!e.repeat && st.selected.length) {
          ctrl = { prev: st.gizmo, combo: false };
          st.setGizmo('rotate');
        }
        return;
      }
      if (e.key === 'Shift') {
        if (!e.repeat) shiftTap = true;
        return;
      }
      shiftTap = false; // Shift + phím khác
      if (ctrl && !ctrl.combo) {
        ctrl.combo = true; // Ctrl + phím khác = phím tắt, không phải ý muốn xoay
        useCustomStore.getState().setGizmo(ctrl.prev);
      }
    };
    const onUp = (e) => {
      if (e.key === 'Control' || e.key === 'Meta') ctrl = null;
      if (e.key === 'Shift') {
        const st = useCustomStore.getState();
        if (shiftTap && st.selected.length && !typing(e)) st.setGizmo('translate');
        shiftTap = false;
      }
    };
    const onPointer = () => {
      shiftTap = false; // Shift + bấm chuột = chọn thêm / bước 15°
    };
    const onBlur = () => {
      ctrl = null;
      shiftTap = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
}

// Chế độ chuột – cũng gọi được nhanh bằng phím giữ (xem `hint`)
const TOOLS = [
  { code: 'select', name: 'Chọn', Icon: MousePointer2, hint: 'Bấm để chọn · Shift + kéo khối = di chuyển tự do · Shift + bấm = chọn thêm · tay cầm: giữ Ctrl = Xoay, nhấn nhả Shift = Di chuyển' },
  { code: 'pan', name: 'Kéo màn hình', Icon: Hand, hint: 'Kéo để dịch khung nhìn sang chỗ khác · nhanh: giữ Ctrl + kéo nền' },
  { code: 'rotate', name: 'Xoay khối', Icon: RefreshCcw, hint: 'Kéo khối: trong vòng tròn = xoay tự do, ngoài vòng = xoay quanh hướng nhìn · khi kéo bấm X/Y/Z khóa trục, Shift bước 15° · nhanh: Ctrl + kéo khối' },
  { code: 'stretch', name: 'Kéo giãn', Icon: MoveDiagonal2, hint: 'Kéo một mặt của khối để giãn theo chiều đó (Shift = giãn đều) · nhanh: giữ Alt + kéo khối' },
  { code: 'marquee', name: 'Chọn vùng', Icon: SquareDashedMousePointer, hint: 'Kéo khung để chọn nhiều khối (Shift = chọn thêm) · nhanh: giữ Alt + kéo nền' },
];

/** Theo dõi phím Ctrl / Alt đang giữ để hiển thị chế độ tạm thời. */
function useModifierKeys() {
  const [mods, setMods] = useState({ ctrl: false, alt: false, shift: false });
  useEffect(() => {
    const update = (e) => setMods({ ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey });
    const reset = () => setMods({ ctrl: false, alt: false, shift: false });
    // Alt nhả ra có thể làm trình duyệt focus thanh menu → chặn khi đang ở Studio
    const onUp = (e) => {
      if (e.key === 'Alt') e.preventDefault();
      update(e);
    };
    window.addEventListener('keydown', update);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', update);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', reset);
    };
  }, []);
  return mods;
}

export function CustomToolbar() {
  const { gizmo, snap, grid, placeMode, selected, setGizmo, setSnap, setGrid, setPlaceMode, tool, setTool, activeTool } = useCustomStore();
  const mods = useModifierKeys();
  useModifierGizmoSwitch();
  const current = TOOLS.find((t) => t.code === tool);
  const live = activeTool && activeTool !== tool ? TOOLS.find((t) => t.code === activeTool) : null;
  const modHint = mods.ctrl
    ? 'Đang giữ Ctrl: tay cầm → Xoay (giữ nguyên sau khi nhả) · kéo nền = kéo màn hình · kéo khối = xoay tự do'
    : mods.alt
      ? 'Đang giữ Alt: kéo nền = chọn vùng · kéo khối = kéo giãn'
      : mods.shift
        ? 'Đang giữ Shift: kéo khối = di chuyển tự do · bấm khối = chọn thêm · kéo nền = xoay khung nhìn như thường · nhả Shift (không bấm) = tay cầm Di chuyển'
        : null;

  useEffect(() => {
    const onKey = (e) => {
      if (shortcutsBlocked(e)) return;
      const st = useCustomStore.getState();
      const k = e.key.toLowerCase();
      if (!e.ctrlKey && !e.metaKey) {
        if (k === 'w') st.setGizmo('translate');
        else if (k === 'e') st.setGizmo('rotate');
        else if (k === 'r') st.setGizmo('scale');
        else if (k === 'escape') {
          if (st.carve.on) st.setCarve({ on: false }); // Esc thoát cọ khoét trước
          else st.select([]);
        }
        else if (k === 'f') focusSelection();
        else if ((k === 'delete' || k === 'backspace') && st.selected.length) {
          e.preventDefault();
          removeParts(st.selected);
        }
        return;
      }
      if (k === 'd' && st.selected.length) {
        e.preventDefault();
        duplicate(st.selected);
      } else if (k === 'g' && st.selected.length) {
        e.preventDefault();
        if (e.shiftKey) ungroupParts(st.selected);
        else groupParts(st.selected);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex flex-col items-start gap-2">
      <ToolbarRow>
        {TOOLS.map(({ code, name, Icon }) => (
          <button
            key={code}
            type="button"
            onClick={() => setTool(code)}
            aria-pressed={tool === code}
            title={TOOLS.find((t) => t.code === code).hint}
            aria-label={name}
            className={`flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap transition-colors ${
              tool === code
                ? 'bg-gold-400/15 text-gold-200'
                : (live?.code ?? null) === code
                  ? 'bg-ink-600 text-cream-50'
                  : 'text-cream-300 hover:bg-ink-700 hover:text-cream-50'
            }`}
          >
            <Icon size={16} />
            {/* khung 3D hẹp (màn nhỏ / trình duyệt phóng to) → chỉ hiện icon */}
            <span className="hidden @min-[820px]:inline">{name}</span>
          </button>
        ))}
      </ToolbarRow>
      <GizmoRow {...{ gizmo, snap, grid, placeMode, selected, setGizmo, setSnap, setGrid, setPlaceMode }} />
      <p className="max-w-[560px] rounded-lg bg-ink-900/75 px-3 py-1.5 text-[11px] leading-snug text-cream-300 backdrop-blur">
        {live ? <b className="text-gold-200">Đang dùng: {live.name}. </b> : null}
        {modHint ?? current?.hint}
      </p>
    </div>
  );
}

function ToolbarRow({ children }) {
  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-ink-600/80 bg-ink-850/85 px-2 py-1.5 shadow-xl backdrop-blur">
      {children}
    </div>
  );
}

/** Căn camera vào khối đang chọn (không chọn gì → toàn bộ thiết kế). Camera không bao giờ tự đuổi theo khối. */
function focusSelection() {
  const { selected } = useCustomStore.getState();
  const box = sceneBox(selected.length ? selected : null);
  // chưa có khối nào → đưa camera về khung mặc định (dùng khi lỡ zoom/kéo lạc)
  if (box.isEmpty()) useViewerStore.getState().refit();
  else useViewerStore.getState().focus(box);
}

/** Hàng 2: chế độ tay cầm (gizmo), bắt bước, lưới, đặt lên bề mặt. */
function GizmoRow({ gizmo, snap, grid, placeMode, selected, setGizmo, setSnap, setGrid, setPlaceMode }) {
  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-ink-600/80 bg-ink-850/85 px-2 py-1.5 shadow-xl backdrop-blur">
      <span className="px-1.5 text-[10px] font-semibold tracking-wider text-cream-600 uppercase">Tay cầm</span>
      {MODES.map(({ code, label, key, Icon }) => (
        <IconButton key={code} label={label} active={gizmo === code} onClick={() => setGizmo(code)} className="relative">
          <Icon size={18} />
          {/* nhãn phím tắt ngay trên nút */}
          <span className="pointer-events-none absolute -right-1 -bottom-1 rounded bg-ink-950/90 px-1 text-[8.5px] leading-[13px] font-semibold text-cream-300">
            {key}
          </span>
        </IconButton>
      ))}
      <span className="mx-1 h-5 w-px bg-ink-600" />
      <IconButton label={snap ? 'Bắt bước: bật (0.5 mm · 15°)' : 'Bắt bước: tắt'} active={snap} onClick={() => setSnap(!snap)}>
        <span className="text-[10px] font-bold">0.5</span>
      </IconButton>
      <IconButton label={grid ? 'Ẩn lưới mm' : 'Hiện lưới mm'} active={grid} onClick={() => setGrid(!grid)}>
        <Grid3x3 size={18} />
      </IconButton>
      <IconButton
        label="Đặt khối đang chọn lên bề mặt (bấm vào khối khác hoặc mặt lưới)"
        active={placeMode}
        disabled={!selected.length}
        onClick={() => setPlaceMode(!placeMode)}
      >
        <Magnet size={18} />
      </IconButton>
      <IconButton label="Căn camera vào khối đang chọn (F)" onClick={focusSelection}>
        <ScanSearch size={18} />
      </IconButton>
    </div>
  );
}
