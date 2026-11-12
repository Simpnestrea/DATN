// BẢNG THÔNG SỐ IN / PDF (/in-thong-so): trang A4 nền trắng – ảnh 4 góc, bảng thông số, tác giả, mã QR dẫn về trang
// thiết kế. Lưu PDF bằng chức năng In của trình duyệt (chữ tiếng Việt chuẩn, không lỗi font).
//  ?id=…        thiết kế đã lưu (công khai / có liên kết, hoặc của chính mình) – lấy phiên bản đã Lưu gần nhất
//  ?src=studio  bản đang mở trong Studio (kể cả chưa lưu) – Studio gửi qua localStorage
//  &auto=1      ảnh chụp xong thì tự mở hộp In
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import qrcode from 'qrcode-generator';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import { summarizeConfig } from '@ngk/shared';
import { useCatalogStore } from '../store/catalogStore.js';
import { get } from '../services/api.js';
import { SpecsTable } from '../components/community/SpecsTable.jsx';
import { typeName } from '../components/community/DesignCard.jsx';
import { SHEET_VIEWS } from '../three/sheetViews.js';
import { formatDateTime } from '../utils/time.js';
import { PRINT_KEY } from '../services/printSheet.js';

const MultiAngleBaker = lazy(() => import('../three/MultiAngleBaker.jsx'));

function qrDataUrl(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createDataURL(4, 0);
}

export default function SpecSheetPage() {
  const [params] = useSearchParams();
  const lookup = useCatalogStore((s) => s.lookup);
  const [sheet, setSheet] = useState(null);
  const [error, setError] = useState(null);
  const [images, setImages] = useState(null);
  const auto = params.get('auto') === '1';

  useEffect(() => {
    const id = params.get('id');
    if (params.get('src') === 'studio') {
      try {
        const data = JSON.parse(localStorage.getItem(PRINT_KEY) ?? 'null');
        if (!data?.config) throw new Error();
        setSheet({ ...data, savedAt: data.at });
      } catch {
        setError('Không có dữ liệu thiết kế để in – hãy mở lại từ Studio (Xuất → Bảng thông số PDF).');
      }
    } else if (id) {
      get(`/api/public/designs/${encodeURIComponent(id)}`)
        .then(({ design: d }) =>
          setSheet({
            config: d.config,
            title: d.name,
            author: d.owner.displayName,
            description: d.description,
            savedAt: d.savedAt,
            versionN: d.versionN,
            shareUrl: d.visibility !== 'private' ? `${window.location.origin}/thiet-ke/${d.id}` : null,
          }),
        )
        .catch((e) => setError(e.status === 404 ? 'Không tìm thấy thiết kế (có thể đã bị xoá hoặc chuyển về riêng tư).' : e.message));
    } else setError('Thiếu thông tin thiết kế cần in.');
  }, [params]);

  useEffect(() => {
    if (sheet) document.title = `Bảng thông số – ${sheet.title} | NGK`;
    return () => void (document.title = 'NGK – Thiết kế trang sức 3D');
  }, [sheet]);
  // ảnh chụp xong + có &auto=1 → mở hộp In một lần
  useEffect(() => {
    if (images && auto) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [images, auto]);

  const qr = useMemo(() => (sheet?.shareUrl ? qrDataUrl(sheet.shareUrl) : null), [sheet?.shareUrl]);
  const summary = useMemo(() => (sheet ? summarizeConfig(sheet.config, lookup) : ''), [sheet, lookup]);

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-5 text-center">
        <p className="font-display text-2xl text-cream-50">Không tạo được bảng thông số</p>
        <p className="max-w-md text-sm text-cream-500">{error}</p>
        <Link to="/" className="text-sm text-gold-300 hover:underline">
          Về trang chủ
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#26262b] py-8 print:bg-white print:py-0">
      <style>{'@page { size: A4; margin: 11mm; }'}</style>
      <div className="mx-auto mb-5 flex w-[210mm] max-w-full items-center justify-between gap-3 px-2 print:hidden">
        <button type="button" onClick={() => (window.history.length > 1 ? window.history.back() : window.close())} className="flex items-center gap-1.5 text-sm text-cream-400 hover:text-cream-100">
          <ArrowLeft size={16} /> Quay lại
        </button>
        <span className="text-xs text-cream-500">{images ? 'Trong hộp In, chọn “Lưu dưới dạng PDF” (Save as PDF).' : 'Đang chụp ảnh các góc…'}</span>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!images}
          className="flex items-center gap-2 rounded-full bg-gradient-to-b from-gold-300 to-gold-500 px-4 py-2 text-sm font-semibold text-ink-950 disabled:opacity-40"
        >
          {images ? <Printer size={16} /> : <Loader2 size={16} className="animate-spin" />} In / Lưu PDF
        </button>
      </div>

      {sheet && (
        <article data-testid="spec-sheet" className="mx-auto min-h-[297mm] w-[210mm] max-w-full bg-white p-[12mm] text-[#1d1b18] shadow-2xl print:min-h-0 print:w-auto print:p-0 print:shadow-none" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
          <header className="flex items-end justify-between border-b-2 border-[#c9a75a] pb-3">
            <div>
              <p className="font-display text-2xl font-bold tracking-[0.3em] text-[#a8873c]">NGK</p>
              <p className="text-[9px] tracking-[0.3em] text-[#8b8478] uppercase">Jewelry Design Studio</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold tracking-[0.2em] text-[#5c564c] uppercase">Bảng thông số thiết kế</p>
              <p className="text-[10px] text-[#8b8478]">In lúc {formatDateTime(Date.now())}</p>
            </div>
          </header>

          <section className="mt-5">
            <h1 className="font-display text-3xl font-semibold leading-tight">{sheet.title}</h1>
            <p className="mt-1 text-xs text-[#5c564c]">
              {typeName(sheet.config.type)}
              {sheet.author ? ` · Tác giả: ${sheet.author}` : ''}
              {sheet.savedAt ? ` · ${sheet.versionN ? `Phiên bản ${sheet.versionN}, lưu` : 'Bản'} lúc ${formatDateTime(sheet.savedAt)}` : ''}
            </p>
            <p className="mt-1 text-xs text-[#8b8478]">{summary}</p>
          </section>

          <section className="mt-4 grid grid-cols-3 gap-2.5">
            {SHEET_VIEWS.map((v, i) => (
              <figure key={v.key} className={`overflow-hidden rounded-lg border border-[#e7e1d4] bg-[radial-gradient(circle_at_50%_40%,#ffffff,#ece7dc)] ${i === 0 ? 'col-span-3 h-[64mm]' : 'h-[40mm]'}`}>
                <div className="relative h-full w-full">
                  {images?.[v.key] ? (
                    <img src={images[v.key]} alt={v.label} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[#b9b2a4]">
                      <Loader2 className="animate-spin" />
                    </div>
                  )}
                  <figcaption className="absolute bottom-1.5 left-2 text-[9px] font-semibold tracking-[0.15em] text-[#8b8478] uppercase">{v.label}</figcaption>
                </div>
              </figure>
            ))}
          </section>

          {sheet.description && <p className="mt-5 whitespace-pre-line text-xs leading-relaxed text-[#3d3933]">{sheet.description}</p>}

          <section className="mt-4">
            <SpecsTable config={sheet.config} variant="print" />
          </section>

          <footer className="mt-5 flex items-end justify-between gap-4 border-t border-[#e7e1d4] pt-3 text-[10px] text-[#8b8478] break-inside-avoid">
            <div className="space-y-0.5">
              <p>Thiết kế tạo bằng NGK – xưởng thiết kế trang sức 3D trực tuyến.</p>
              <p>Kích thước tính theo mm. Màu sắc trên ảnh có thể khác thực tế tuỳ màn hình / máy in.</p>
              {sheet.shareUrl && <p className="text-[#5c564c]">{sheet.shareUrl}</p>}
            </div>
            {/* bản demo chạy trên máy (localhost): điện thoại quét ra đúng link nhưng không mở được → bấm vào mã để mở trên máy này */}
            {qr && (
              <a href={sheet.shareUrl} title="Mở trang thiết kế" className="flex shrink-0 flex-col items-center gap-1">
                <img src={qr} alt="Mã QR tới trang thiết kế" className="h-[24mm] w-[24mm]" style={{ imageRendering: 'pixelated' }} data-testid="sheet-qr" />
                <span>Quét để xem 3D</span>
                <span className="text-[8px]">Bản demo: mở trên máy chạy NGK</span>
              </a>
            )}
          </footer>
        </article>
      )}
      {sheet && !images && (
        <Suspense fallback={null}>
          <MultiAngleBaker config={sheet.config} onDone={setImages} />
        </Suspense>
      )}
    </div>
  );
}
