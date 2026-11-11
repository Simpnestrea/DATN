// Trang STUDIO – trình thiết kế trang sức.
// Bố cục: [Loại trang sức] | [Khung 3D + điều khiển] | [Panel tùy chỉnh 5 bước], dưới cùng là thanh tóm tắt.
import { shortcutsBlocked } from '../utils/keys.js';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TYPE_CODES, buildConfigFromTemplate, createDefaultConfig } from '@ngk/shared';
import { useDesignStore } from '../store/designStore.js';
import { useCatalogStore } from '../store/catalogStore.js';
import { toast } from '../store/toastStore.js';
import { useFreeStoneStore } from '../store/freeStoneStore.js';
import { loadDraft, saveDraft } from '../services/draftStorage.js';
import { openDesign, resetSync, startDraftSync } from '../services/designSync.js';
import { requireLogin, useAuthStore } from '../store/authStore.js';
import { CustomLock, SaveDialogs, useSaveShortcut } from '../components/studio/SaveDialogs.jsx';
import { StudioToolbar } from '../components/studio/StudioToolbar.jsx';
import { TypeRail } from '../components/studio/TypeRail.jsx';
import { CustomizePanel } from '../components/studio/CustomizePanel.jsx';
import { ViewerControls } from '../components/studio/ViewerControls.jsx';
import { SummaryBar } from '../components/studio/SummaryBar.jsx';
import { CustomToolbar, SketchEditor, WireBanner, preloadCustom } from '../components/studio/custom/lazy.js';

const JewelryCanvas = lazy(() => import('../three/JewelryCanvas.jsx'));
const NEW_DRAFT = 'new'; // khoá bản nháp của thiết kế chưa lưu lên máy chủ

/** Khởi tạo thiết kế theo URL: ?id=…(&v=n) thiết kế đã lưu | ?template=... | ?type=... | bản nháp lần trước. */
function useInitialDesign() {
  const [params, setParams] = useSearchParams();
  const catalog = useCatalogStore((s) => s.catalog);
  const lookup = useCatalogStore((s) => s.lookup);
  const load = useDesignStore((s) => s.load);
  const authStatus = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const initialized = useRef(false);
  const handledKey = useRef(null);

  useEffect(() => {
    if (!catalog) return;
    const id = params.get('id');
    if (id && authStatus !== 'ready') return; // chờ biết đã đăng nhập chưa
    const key = `${params.toString()}|${id ? (user?.id ?? '-') : ''}`;
    if (handledKey.current === key) return; // tránh xử lý trùng (React StrictMode chạy effect 2 lần)
    handledKey.current = key;
    const templateCode = params.get('template');
    const type = params.get('type');
    if (id) {
      initialized.current = true;
      if (!user) {
        requireLogin(() => {}, 'Đăng nhập để mở thiết kế đã lưu của bạn.');
        return;
      }
      openDesign(id, { version: Number(params.get('v')) || undefined, lookup }).catch((e) => {
        toast(e.status === 404 ? 'Không tìm thấy thiết kế (có thể đã bị xoá).' : e.message, { tone: 'warning' });
        setParams({}, { replace: true });
      });
      if (params.get('v')) {
        const next = new URLSearchParams(params);
        next.delete('v');
        // tải lại trang không mở lại bản cũ; đánh dấu trước là "đã xử lý" để đổi URL không mở lại bản hiện tại đè lên
        handledKey.current = `${next.toString()}|${user.id}`;
        setParams(next, { replace: true });
      }
      return;
    }
    resetSync();
    if (templateCode) {
      const tpl = catalog.templates.find((t) => t.code === templateCode);
      if (tpl) {
        load(buildConfigFromTemplate(tpl), { title: tpl.title });
        toast(`Đã mở mẫu “${tpl.title}”`, { tone: 'success' });
      } else {
        toast('Không tìm thấy mẫu thiết kế', { tone: 'warning' });
      }
      setParams({}, { replace: true });
    } else if (type && TYPE_CODES.includes(type)) {
      load(createDefaultConfig(type));
      setParams({}, { replace: true });
    } else if (!initialized.current) {
      const draft = loadDraft(NEW_DRAFT, lookup);
      if (draft) {
        load(draft.config, { title: draft.title });
        toast('Đã khôi phục bản nháp lần trước');
      }
    }
    initialized.current = true;
  }, [catalog, params, setParams, load, lookup, authStatus, user]);
}

/** Tự lưu nháp vào localStorage 0,6 giây sau mỗi thay đổi. */
function useAutosaveDraft() {
  const [savedAt, setSavedAt] = useState(null);
  useEffect(() => {
    let timer;
    const unsub = useDesignStore.subscribe((state, prev) => {
      if (state.config === prev.config && state.title === prev.title) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        // mỗi thiết kế một bản nháp riêng trên máy (thiết kế đã lưu: theo id) – mất mạng vẫn không mất bài
        if (saveDraft(state.designId || NEW_DRAFT, { config: state.config, title: state.title })) setSavedAt(Date.now());
      }, 600);
    });
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, []);
  return savedAt;
}

/** Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z – bỏ qua khi đang gõ trong ô nhập liệu. */
function useUndoShortcuts() {
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (shortcutsBlocked(e)) return;
      const key = e.key.toLowerCase();
      const { undo, redo } = useDesignStore.getState();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/**
 * Ctrl + lăn chuột là phím tắt PHÓNG TO TRANG của trình duyệt. Thư viện camera chỉ tự chặn khi nó đang rảnh –
 * nếu đang giữ Ctrl kéo màn hình, hoặc chuột nằm trên thanh công cụ nổi, trình duyệt sẽ phóng to cả trang
 * (bảng thiết kế bị đẩy mất). Chặn ở cấp khu vực 3D; lăn chuột vẫn zoom camera bình thường.
 */
function useBlockBrowserZoom() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false }); // passive: false mới cho phép preventDefault
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  return ref;
}

/** Khung 3D – component DUY NHẤT của trang cần cả cấu hình (đổi mỗi lần kéo thanh trượt). */
function StudioCanvas() {
  const config = useDesignStore((s) => s.config);
  return <JewelryCanvas config={config} mode="studio" />;
}

export default function StudioPage() {
  useInitialDesign();
  const savedAt = useAutosaveDraft();
  useUndoShortcuts();
  useSaveShortcut();
  useEffect(() => startDraftSync(), []);
  // phần "Tự tạo" tải riêng (custom/lazy.js) → tải trước lúc trình duyệt rảnh, sau khi khung 3D đầu tiên đã dựng xong
  useEffect(() => {
    if (!window.requestIdleCallback) {
      const t = setTimeout(preloadCustom, 3000);
      return () => clearTimeout(t);
    }
    const id = window.requestIdleCallback(preloadCustom, { timeout: 5000 });
    return () => window.cancelIdleCallback(id);
  }, []);
  // chỉ lấy LOẠI trang sức: trước đây lấy cả cấu hình → mỗi lần kéo thanh trượt cả trang (thanh công cụ, các hộp thoại,
  // thanh chọn loại…) render lại theo
  const isCustom = useDesignStore((s) => s.config.type === 'custom');
  const placing = useFreeStoneStore((s) => s.mode);
  const mainRef = useBlockBrowserZoom();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ink-900">
      <StudioToolbar savedAt={savedAt} />

      {/* Bố cục: ≥ 768px (md) = 3 cột; hẹp hơn (máy nhỏ hoặc trình duyệt đang phóng to) = xếp dọc,
          bảng tùy chỉnh có chiều cao cố định + cuộn riêng → không bao giờ bị đẩy ra ngoài màn hình */}
      <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
        {isCustom && <CustomLock />}
        <div className="shrink-0 overflow-x-auto border-b border-ink-700 p-2 md:w-24 md:overflow-y-auto md:border-r md:border-b-0 md:py-4">
          <TypeRail />
        </div>

        <main ref={mainRef} className="@container relative min-h-0 flex-1 select-none">
          <Suspense fallback={<div className="skeleton absolute inset-0" />}>
            <StudioCanvas />
          </Suspense>
          <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-4">
            <ViewerControls />
          </div>
          {isCustom && (
            <Suspense fallback={null}>
              <div className="pointer-events-none absolute top-4 left-4">
                <CustomToolbar />
              </div>
              <WireBanner />
            </Suspense>
          )}
          {isCustom ? (
            <p className="pointer-events-none absolute top-4 right-4 hidden text-[11px] text-cream-600 select-none @min-[1100px]:block">
              Ctrl: kéo màn hình / xoay khối · Alt: chọn vùng / kéo giãn
            </p>
          ) : placing ? (
            <p className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded-full border border-gold-500/40 bg-ink-900/80 px-4 py-1.5 text-xs text-gold-200 select-none">
              ◆ Chế độ gắn đá – bấm lên bề mặt để gắn, kéo viên đá để di chuyển
            </p>
          ) : (
            <p className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 text-[11px] text-cream-600 select-none">
              Kéo để xoay · cuộn để phóng to
            </p>
          )}
        </main>

        <div className="flex h-[44%] min-h-0 shrink-0 flex-col border-t border-ink-700 bg-ink-850 md:h-auto md:w-[340px] md:border-t-0 md:border-l lg:w-[400px]">
          <CustomizePanel />
        </div>
      </div>

      <SummaryBar />
      {isCustom && (
        <Suspense fallback={null}>
          <SketchEditor />
        </Suspense>
      )}
      <SaveDialogs />
    </div>
  );
}
