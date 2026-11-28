// QUẢN TRỊ – XEM THIẾT KẾ RIÊNG TƯ (/quan-tri/thiet-ke/:id): chỉ khi chủ thiết kế đã đồng ý (còn hạn 7 ngày).
// Chỉ đọc: khung 3D xoay được + bảng thông số; xem BẢN HIỆN TẠI (kể cả nháp). Mỗi lần mở trang đều được ghi nhật ký.
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, KeyRound } from 'lucide-react';
import { JEWELRY_TYPES } from '@ngk/shared';
import { ErrorBox, Loading } from '../../components/admin/AdminUi.jsx';
import { Avatar } from '../../components/auth/UserMenu.jsx';
import { ViewerControls } from '../../components/studio/ViewerControls.jsx';
import { SpecsTable } from '../../components/community/SpecsTable.jsx';
import { get } from '../../services/api.js';
import { formatDate, formatDateTime } from '../../utils/time.js';

const JewelryCanvas = lazy(() => import('../../three/JewelryCanvas.jsx'));
const typeName = (code) => JEWELRY_TYPES.find((t) => t.code === code)?.name ?? code;

export default function PrivateDesignPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    setData(null);
    setError(null);
    get(`/api/admin/designs/${id}/view`)
      .then(setData)
      .catch((e) => setError(e));
  }, [id]);

  const back = (
    <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-cream-400 hover:text-cream-50">
      <ArrowLeft size={15} /> Quay lại
    </button>
  );
  if (error) {
    return (
      <div className="space-y-6">
        {back}
        {error.code === 'NO_GRANT' ? (
          <div className="rounded-2xl border border-ink-700 bg-ink-850 p-8 text-center">
            <KeyRound size={28} className="mx-auto text-cream-500" />
            <p className="mt-3 font-display text-2xl text-cream-50">Chưa được xem thiết kế này</p>
            <p className="mt-2 text-sm text-cream-500">{error.message}</p>
            <p className="mt-1 text-xs text-cream-600">Xin quyền ở trang chi tiết của chủ thiết kế (mục Người dùng).</p>
          </div>
        ) : error.code === 'NOT_PRIVATE' ? (
          <div className="rounded-2xl border border-ink-700 bg-ink-850 p-8 text-center">
            <p className="text-sm text-cream-300">{error.message}</p>
            <Link to={`/thiet-ke/${id}`} className="mt-3 inline-block text-sm text-gold-300 hover:text-gold-200">
              Mở trang thiết kế
            </Link>
          </div>
        ) : (
          <ErrorBox>{error.message}</ErrorBox>
        )}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-6">
        {back}
        <Loading />
      </div>
    );
  }

  const { design: d, grant } = data;
  return (
    <div className="space-y-5">
      {back}
      <p role="status" className="flex items-start gap-2 rounded-xl border border-gold-500/40 bg-gold-400/[0.06] px-4 py-3 text-sm text-gold-100" data-testid="private-view-banner">
        <Eye size={16} className="mt-0.5 shrink-0 text-gold-300" />
        <span>
          Bạn đang xem thiết kế <b>riêng tư</b> với sự đồng ý của <b>{d.owner.displayName}</b> – chỉ đọc, đến {formatDateTime(grant.expiresAt)}. Lần xem này đã được ghi vào nhật ký quản trị.
        </span>
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="relative h-[56vh] min-h-[360px] overflow-hidden rounded-3xl border border-ink-700" data-testid="private-view-canvas">
          <Suspense fallback={<div className="skeleton absolute inset-0" />}>
            <JewelryCanvas config={d.config} mode="view" />
          </Suspense>
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
            <ViewerControls config={d.config} showMatte={false} />
          </div>
        </div>
        <aside className="space-y-4">
          <div>
            <p className="text-xs text-cream-500">Riêng tư · {typeName(d.type)}</p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-cream-50" data-testid="private-view-title">
              {d.name}
            </h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-cream-300">
              <Avatar user={d.owner} size={24} /> {d.owner.displayName}
            </p>
            <p className="mt-2 text-xs text-cream-500">
              Tạo {formatDate(d.createdAt)} · sửa gần nhất {formatDateTime(d.updatedAt)} · {d.versionCount} phiên bản đã lưu
            </p>
            <p className="mt-1 text-xs text-cream-600">Đang hiển thị bản hiện tại (gồm cả thay đổi chưa Lưu thành phiên bản).</p>
          </div>
          {d.description && <p className="whitespace-pre-line text-sm text-cream-300">{d.description}</p>}
          <p className="rounded-xl border border-ink-700 px-3 py-2 text-xs text-cream-400">Lý do bạn đã xin: {grant.reason}</p>
          <div className="max-h-[46vh] overflow-y-auto pr-1">
            <SpecsTable config={d.config} />
          </div>
        </aside>
      </div>
    </div>
  );
}
