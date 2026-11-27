// QUẢN TRỊ – NGƯỜI DÙNG: tìm (không dấu: tên / email / @tên riêng), lọc, sắp xếp, phân trang.
// Bộ lọc nằm trên URL → mở chi tiết rồi bấm quay lại vẫn đúng trang, đúng bộ lọc.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Avatar } from '../../components/auth/UserMenu.jsx';
import { ErrorBox, Loading, PageHeader, Pagination, UserBadges } from '../../components/admin/AdminUi.jsx';
import { useAdminStore } from '../../store/adminStore.js';
import { get } from '../../services/api.js';
import { formatDate, formatDateTime, timeAgo } from '../../utils/time.js';

const FILTERS = [
  { code: '', label: 'Tất cả', count: (s) => s?.users },
  { code: 'admin', label: 'Quản trị viên', count: (s) => s?.admins },
  { code: 'locked', label: 'Bị khoá', count: (s) => s?.locked },
  { code: 'demo', label: 'Tài khoản mẫu', count: (s) => s?.demo },
  { code: 'unverified', label: 'Chưa xác minh email', count: (s) => s?.unverified },
];
const SORTS = [
  { code: 'new', label: 'Mới tham gia' },
  { code: 'active', label: 'Hoạt động gần đây' },
  { code: 'designs', label: 'Nhiều thiết kế nhất' },
  { code: 'name', label: 'Tên A–Z' },
  { code: 'old', label: 'Tham gia lâu nhất' },
];

export default function UsersPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const f = FILTERS.some((x) => x.code === params.get('f')) ? params.get('f') : '';
  const sort = SORTS.some((x) => x.code === params.get('sort')) ? params.get('sort') : 'new';
  const page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);
  const [text, setText] = useState(q);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const reqId = useRef(0);
  const summary = useAdminStore((s) => s.summary);
  const navigate = useNavigate();

  const setParam = (patch) => {
    // đọc URL HIỆN TẠI (không dùng bản `params` cũ mà hẹn giờ ô tìm kiếm còn giữ → không ghép nhầm bộ lọc vừa đổi)
    const next = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page'); // đổi bộ lọc → về trang 1
    setParams(next, { replace: true });
  };

  // gõ tìm: đợi ngừng gõ rồi mới tìm
  useEffect(() => {
    if (text.trim() === q) return undefined;
    const t = setTimeout(() => setParam({ q: text.trim() }), 300);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = ++reqId.current;
    const p = new URLSearchParams({ sort, page: String(page) });
    if (q) p.set('q', q);
    if (f) p.set('f', f);
    get(`/api/admin/users?${p}`)
      .then((r) => {
        if (id !== reqId.current) return;
        setData(r);
        setError(null);
      })
      .catch((e) => id === reqId.current && setError(e.message));
  }, [q, f, sort, page]);

  const open = (u) => navigate(`/quan-tri/nguoi-dung/${u.id}`);

  return (
    <div>
      <PageHeader title="Người dùng" subtitle={data ? `${data.total} tài khoản${q || f ? ' khớp bộ lọc' : ''}` : '…'} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="flex h-10 min-w-64 flex-1 items-center gap-2 rounded-full border border-ink-600 bg-ink-850 px-4 focus-within:border-gold-500/60">
          <Search size={16} className="text-cream-500" />
          <input
            aria-label="Tìm người dùng"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tìm theo tên, email hoặc @tên riêng (không dấu cũng được)"
            className="h-full w-full bg-transparent text-sm text-cream-50 placeholder:text-cream-600 focus:outline-none"
          />
        </label>
        <select
          aria-label="Sắp xếp"
          value={sort}
          onChange={(e) => setParam({ sort: e.target.value === 'new' ? '' : e.target.value })}
          className="h-10 rounded-full border border-ink-600 bg-ink-850 px-4 text-sm text-cream-100"
        >
          {SORTS.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Lọc người dùng">
        {FILTERS.map((x) => {
          const active = x.code === f;
          const n = x.count(summary);
          return (
            <button
              key={x.code || 'all'}
              type="button"
              aria-pressed={active}
              onClick={() => setParam({ f: x.code })}
              className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors ${active ? 'border-gold-500/60 bg-gold-400/10 text-gold-200' : 'border-ink-600 text-cream-300 hover:border-ink-500 hover:text-cream-50'}`}
            >
              {x.label}
              {n != null && <span className="ml-1.5 tabular-nums text-cream-500">{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {error && <ErrorBox>{error}</ErrorBox>}
        {!data && !error && <Loading />}
        {data && !data.items.length && <p className="py-16 text-center text-sm text-cream-500">Không có tài khoản nào khớp.</p>}
        {data && data.items.length > 0 && (
          <>
            {/* máy tính: bảng */}
            <div className="hidden overflow-hidden rounded-2xl border border-ink-700 md:block">
              <table className="w-full text-left text-sm" data-testid="users-table">
                <thead className="bg-ink-850 text-xs text-cream-500">
                  <tr>
                    <th className="py-3 pl-4 pr-3 font-medium">Người dùng</th>
                    <th className="px-3 py-3 font-medium">Trạng thái</th>
                    <th className="px-3 py-3 text-right font-medium">Thiết kế</th>
                    <th className="px-3 py-3 font-medium">Tham gia</th>
                    <th className="py-3 pl-3 pr-4 font-medium">Hoạt động</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => (
                    <tr key={u.id} onClick={() => open(u)} className="cursor-pointer border-t border-ink-700/70 transition-colors hover:bg-ink-800/60">
                      <td className="py-3 pl-4 pr-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar user={u} size={36} />
                          <div className="min-w-0">
                            <Link
                              to={`/quan-tri/nguoi-dung/${u.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="block truncate font-medium text-cream-50 hover:text-gold-200"
                            >
                              {u.displayName}
                            </Link>
                            <p className="truncate text-xs text-cream-500">
                              {u.email}
                              {u.handle && <span className="text-cream-600"> · @{u.handle}</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <UserBadges u={u} />
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-cream-100">
                        {u.designs}
                        <span className="block text-[11px] text-cream-600">{u.publicDesigns} công khai</span>
                      </td>
                      <td className="px-3 py-3 text-cream-300">{formatDate(u.createdAt)}</td>
                      <td className="py-3 pl-3 pr-4 text-cream-300" title={u.lastSeenAt ? formatDateTime(u.lastSeenAt) : undefined}>
                        {u.lastSeenAt ? timeAgo(u.lastSeenAt) : <span className="text-cream-600">chưa từng</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* điện thoại: thẻ */}
            <ul className="space-y-2 md:hidden">
              {data.items.map((u) => (
                <li key={u.id}>
                  <Link to={`/quan-tri/nguoi-dung/${u.id}`} className="flex items-center gap-3 rounded-2xl border border-ink-700 bg-ink-850 p-3.5">
                    <Avatar user={u} size={40} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate font-medium text-cream-50">{u.displayName}</p>
                      <p className="truncate text-xs text-cream-500">{u.email}</p>
                      <UserBadges u={u} />
                    </div>
                    <span className="shrink-0 text-right text-xs tabular-nums text-cream-400">
                      {u.designs}
                      <span className="block text-[10px] text-cream-600">thiết kế</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination page={data.page} pages={data.pages} onPage={(p) => setParam({ page: String(p) })} />
          </>
        )}
      </div>
    </div>
  );
}
