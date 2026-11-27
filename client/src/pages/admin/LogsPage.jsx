// QUẢN TRỊ – NHẬT KÝ: mọi thao tác của quản trị viên (kể cả lệnh cấp / thu quyền trên máy chủ). Chỉ đọc.
// Lọc theo hành động, người thực hiện, chữ (không dấu), khoảng ngày, một đối tượng cụ thể. Bộ lọc nằm trên URL.
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, ShieldCheck, Terminal, X } from 'lucide-react';
import { ActionPill, ErrorBox, Loading, PageHeader, Pagination } from '../../components/admin/AdminUi.jsx';
import { ACTION_GROUPS, actionInfo } from '../../components/admin/adminLabels.js';
import { Button } from '../../components/ui/Button.jsx';
import { get } from '../../services/api.js';
import { formatDateTime } from '../../utils/time.js';

const KEYS = ['what', 'actor', 'q', 'from', 'to', 'target'];

export default function LogsPage() {
  const [params, setParams] = useSearchParams();
  const v = Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? '']));
  const page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);
  const [text, setText] = useState(v.q);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [actors, setActors] = useState({ items: [], cli: false });
  const reqId = useRef(0);

  const setParam = (patch) => {
    // đọc URL HIỆN TẠI (không dùng bản `params` cũ mà hẹn giờ ô tìm kiếm còn giữ → không ghép nhầm bộ lọc vừa đổi)
    const next = new URLSearchParams(window.location.search);
    for (const [k, val] of Object.entries(patch)) {
      if (val) next.set(k, val);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    get('/api/admin/logs/actors')
      .then(setActors)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (text.trim() === v.q) return undefined;
    const t = setTimeout(() => setParam({ q: text.trim() }), 300);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = params.toString();
  useEffect(() => {
    const id = ++reqId.current;
    const p = new URLSearchParams({ page: String(page) });
    // "what": một hành động (user.lock) hoặc cả nhóm (group:user)
    if (v.what.startsWith('group:')) p.set('group', v.what.slice(6));
    else if (v.what) p.set('action', v.what);
    for (const k of ['actor', 'q', 'from', 'to', 'target']) if (v[k]) p.set(k, v[k]);
    get(`/api/admin/logs?${p}`)
      .then((r) => {
        if (id !== reqId.current) return;
        setData(r);
        setError(null);
      })
      .catch((e) => id === reqId.current && setError(e.message));
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = KEYS.some((k) => v[k]);
  const input = 'h-10 rounded-full border border-ink-600 bg-ink-850 px-4 text-sm text-cream-100 [color-scheme:dark]';

  return (
    <div>
      <PageHeader title="Nhật ký quản trị" subtitle={data ? `${data.total} thao tác${filtered ? ' khớp bộ lọc' : ''}` : '…'} />
      <p className="mt-3 flex items-center gap-2 text-xs text-cream-500">
        <ShieldCheck size={14} className="text-gold-400" /> Nhật ký chỉ ghi thêm – không ai sửa hay xoá được, kể cả quản trị viên.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="flex h-10 min-w-56 flex-1 items-center gap-2 rounded-full border border-ink-600 bg-ink-850 px-4 focus-within:border-gold-500/60">
          <Search size={16} className="text-cream-500" />
          <input
            aria-label="Tìm trong nhật ký"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tìm theo người, đối tượng, lý do…"
            className="h-full w-full bg-transparent text-sm text-cream-50 placeholder:text-cream-600 focus:outline-none"
          />
        </label>
        <select aria-label="Hành động" value={v.what} onChange={(e) => setParam({ what: e.target.value })} className={input}>
          <option value="">Mọi hành động</option>
          {ACTION_GROUPS.map((g) => (
            <optgroup key={g.code} label={g.label}>
              <option value={`group:${g.code}`}>Tất cả – {g.label.toLowerCase()}</option>
              {g.actions.map((a) => (
                <option key={a} value={a}>
                  {actionInfo(a).label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select aria-label="Người thực hiện" value={v.actor} onChange={(e) => setParam({ actor: e.target.value })} className={input}>
          <option value="">Mọi người thực hiện</option>
          {actors.cli && <option value="cli">Lệnh trên máy chủ</option>}
          {actors.items.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-cream-500">
        <label className="flex items-center gap-2">
          Từ ngày
          <input type="date" aria-label="Từ ngày" value={v.from} max={v.to || undefined} onChange={(e) => setParam({ from: e.target.value })} className={input} />
        </label>
        <label className="flex items-center gap-2">
          đến ngày
          <input type="date" aria-label="Đến ngày" value={v.to} min={v.from || undefined} onChange={(e) => setParam({ to: e.target.value })} className={input} />
        </label>
        {v.target && (
          <span className="flex items-center gap-1.5 rounded-full border border-gold-500/40 bg-gold-400/10 px-3 py-1.5 text-gold-200">
            Chỉ một đối tượng
            <button type="button" aria-label="Bỏ lọc đối tượng" onClick={() => setParam({ target: '' })} className="hover:text-cream-50">
              <X size={13} />
            </button>
          </span>
        )}
        {filtered && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setText('');
              setParams(new URLSearchParams(), { replace: true });
            }}
          >
            Xoá bộ lọc
          </Button>
        )}
      </div>

      <div className="mt-6">
        {error && <ErrorBox>{error}</ErrorBox>}
        {!data && !error && <Loading />}
        {data && !data.items.length && <p className="py-16 text-center text-sm text-cream-500">{filtered ? 'Không có thao tác nào khớp bộ lọc.' : 'Chưa có thao tác quản trị nào.'}</p>}
        {data && data.items.length > 0 && (
          <>
            <ol className="space-y-2" data-testid="admin-logs">
              {data.items.map((l) => (
                <li key={l.id} className="grid gap-x-4 gap-y-1.5 rounded-xl border border-ink-700 bg-ink-850 px-4 py-3 text-sm md:grid-cols-[150px_minmax(0,1fr)]">
                  <span className="text-xs tabular-nums text-cream-500 md:pt-0.5">{formatDateTime(l.at)}</span>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="flex items-center gap-1.5 text-cream-200">
                        {!l.actor && <Terminal size={13} className="text-cream-500" />}
                        {l.actorName}
                      </span>
                      <ActionPill action={l.action} />
                      {l.targetLabel &&
                        (l.targetType === 'user' && l.target ? (
                          <Link to={`/quan-tri/nguoi-dung/${l.target}`} className="min-w-0 truncate text-gold-300 hover:text-gold-200">
                            {l.targetLabel}
                          </Link>
                        ) : (
                          <span className="min-w-0 truncate text-cream-300">{l.targetLabel}</span>
                        ))}
                    </div>
                    {l.reason && <p className="break-words text-cream-400">Lý do: {l.reason}</p>}
                    {l.meta?.designs > 0 && <p className="text-xs text-cream-600">Kèm {l.meta.designs} thiết kế</p>}
                  </div>
                </li>
              ))}
            </ol>
            <Pagination page={data.page} pages={data.pages} onPage={(p) => setParam({ page: String(p) })} />
          </>
        )}
      </div>
    </div>
  );
}
