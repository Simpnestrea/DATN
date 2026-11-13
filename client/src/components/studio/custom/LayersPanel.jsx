// Bảng "Lớp & nhóm": danh sách khối – tìm kiếm, chọn, đổi tên, ẩn/hiện, khóa, nhóm / bỏ nhóm.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Group, Lock, LockOpen, Pencil, Search, Trash2, Ungroup, X } from 'lucide-react';
import { useDesignStore } from '../../../store/designStore.js';
import { useCustomStore } from '../../../store/customStore.js';
import { Notice } from '../../ui/controls.jsx';
import { Button } from '../../ui/Button.jsx';
import { PartIcon } from '../../icons.jsx';
import { focusParts, groupParts, removeParts, renamePart, ungroupParts, updatePart, updateParts } from '../../../three/custom/customOps.js';

const GROUP_COLORS = ['#d9b766', '#7fb8e8', '#e88f9e', '#8fd1a8', '#c49ce8', '#e8b07f'];

/** Chuẩn hoá để tìm kiếm: bỏ dấu tiếng Việt, đ → d, chữ thường ("Viên đá" ~ "vien da"). */
const fold = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

/** Tô sáng phần khớp trong tên (so khớp trên chuỗi đã bỏ dấu, độ dài ký tự giữ nguyên sau NFC). */
function Highlight({ text, query }) {
  if (!query) return text;
  const i = fold(text).indexOf(fold(query));
  if (i < 0) return text;
  const chars = Array.from(text.normalize('NFC'));
  const n = Array.from(query).length;
  return (
    <>
      {chars.slice(0, i).join('')}
      <mark className="rounded bg-gold-400/30 px-0.5 text-gold-100">{chars.slice(i, i + n).join('')}</mark>
      {chars.slice(i + n).join('')}
    </>
  );
}

function RenameInput({ part, onDone }) {
  const [value, setValue] = useState(part.name);
  const ref = useRef(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (save) => {
    if (done.current) return;
    done.current = true;
    if (save) renamePart(part.id, value);
    onDone();
  };
  return (
    <input
      ref={ref}
      value={value}
      maxLength={40}
      aria-label="Tên khối mới"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation(); // không để Delete/W/E/R... kích hoạt phím tắt của trình dựng hình
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      }}
      className="h-7 min-w-0 flex-1 rounded-md border border-gold-500/60 bg-ink-850 px-2 text-xs text-cream-50 focus:outline-none"
    />
  );
}

export function LayersPanel() {
  const parts = useDesignStore((s) => s.config.parts);
  const { selected, select, toggle } = useCustomStore();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const groupIds = [...new Set(parts.map((p) => p.group).filter(Boolean))];
  const groupLabel = (g) => `Nhóm ${groupIds.indexOf(g) + 1}`;
  const groupColor = (g) => GROUP_COLORS[groupIds.indexOf(g) % GROUP_COLORS.length];
  const selParts = parts.filter((p) => selected.includes(p.id));

  const q = query.trim();
  const shown = useMemo(() => {
    const list = [...parts].reverse();
    if (!q) return list;
    const f = fold(q);
    return list.filter((p) => fold(p.name).includes(f) || (p.group && fold(groupLabel(p.group)).includes(f)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, q]);

  /** Chọn khối từ tìm kiếm: bỏ ẩn nếu cần rồi đưa camera tới. */
  const reveal = (ids) => {
    if (!ids.length) return;
    const hidden = parts.filter((p) => ids.includes(p.id) && p.hidden).map((p) => p.id);
    if (hidden.length) updateParts(hidden, (p) => void (p.hidden = false));
    select(ids);
    focusParts(ids);
  };

  if (!parts.length) return <Notice>Chưa có khối nào. Thêm khối ở tab “Thêm khối”.</Notice>;

  return (
    <div className="space-y-4">
      {/* Tìm kiếm */}
      <div className="space-y-1.5">
        <label className="flex h-9 items-center gap-2 rounded-xl border border-ink-600 bg-ink-850 px-3 focus-within:border-gold-500/60">
          <Search size={14} className="shrink-0 text-cream-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') reveal(shown.map((p) => p.id));
              if (e.key === 'Escape') setQuery('');
            }}
            placeholder="Tìm khối theo tên…  (Enter = chọn tất cả kết quả)"
            aria-label="Tìm khối theo tên"
            className="h-full min-w-0 flex-1 bg-transparent text-xs text-cream-50 placeholder:text-cream-600 focus:outline-none"
          />
          {q && (
            <>
              <span className="shrink-0 text-[10px] text-cream-500">{shown.length} kết quả</span>
              <button type="button" onClick={() => setQuery('')} aria-label="Xóa tìm kiếm" className="rounded p-0.5 text-cream-500 hover:text-cream-100">
                <X size={13} />
              </button>
            </>
          )}
        </label>
        {q && shown.length > 1 && (
          <button type="button" onClick={() => reveal(shown.map((p) => p.id))} className="text-xs text-gold-300 hover:underline">
            Chọn cả {shown.length} khối tìm được
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={selParts.length < 2} onClick={() => groupParts(selParts.map((p) => p.id))}>
          <Group size={14} /> Nhóm
        </Button>
        <Button size="sm" disabled={!selParts.some((p) => p.group)} onClick={() => ungroupParts(selParts.map((p) => p.id))}>
          <Ungroup size={14} /> Bỏ nhóm
        </Button>
        <Button size="sm" variant="danger" disabled={!selParts.length} onClick={() => removeParts(selParts.map((p) => p.id))}>
          <Trash2 size={14} /> Xóa
        </Button>
      </div>
      <p className="text-xs text-cream-600">
        Bấm tên để chọn (Ctrl/Shift = chọn nhiều) · nhấp đúp hoặc bấm ✎ để đổi tên · bấm khối thuộc nhóm trên mô hình sẽ chọn cả nhóm.
      </p>

      {q && !shown.length ? (
        <p className="py-4 text-center text-xs text-cream-500">Không có khối nào tên “{q}”.</p>
      ) : (
        <ul className="space-y-1">
          {shown.map((p) => {
            const active = selected.includes(p.id);
            const isEditing = editing === p.id;
            return (
              <li
                key={p.id}
                className={`flex items-center gap-1.5 rounded-xl border px-2 py-1.5 transition-colors ${
                  active ? 'border-gold-500/60 bg-gold-400/[0.07]' : 'border-transparent hover:bg-ink-800'
                }`}
              >
                {isEditing ? (
                  <>
                    <span className="text-gold-300">
                      <PartIcon kind={p.kind} size={18} />
                    </span>
                    <RenameInput part={p} onDone={() => setEditing(null)} />
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      if (e.ctrlKey || e.shiftKey || e.metaKey) toggle(p.id);
                      else if (q) reveal([p.id]); // từ kết quả tìm kiếm → chọn + đưa camera tới khối
                      else select([p.id]);
                    }}
                    onDoubleClick={() => setEditing(p.id)}
                    className={`flex min-w-0 flex-1 items-center gap-2 text-left text-xs ${p.hidden ? 'opacity-45' : ''}`}
                  >
                    <span className={active ? 'text-gold-300' : 'text-cream-500'}>
                      <PartIcon kind={p.kind} size={18} />
                    </span>
                    <span className={`truncate ${active ? 'text-gold-100' : 'text-cream-100'}`}>
                      <Highlight text={p.name} query={q} />
                    </span>
                    {p.group && (
                      <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-ink-950" style={{ background: groupColor(p.group) }}>
                        {groupLabel(p.group)}
                      </span>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  title="Đổi tên (hoặc nhấp đúp vào tên)"
                  aria-label={`Đổi tên ${p.name}`}
                  onMouseDown={(e) => isEditing && e.preventDefault()} // đang sửa: bấm bút không làm ô nhập mất focus
                  onClick={() => setEditing(isEditing ? null : p.id)}
                  className={`rounded p-1 hover:text-cream-100 ${isEditing ? 'text-gold-400' : 'text-cream-500'}`}
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  title={p.hidden ? 'Hiện khối' : 'Ẩn khối'}
                  aria-label={p.hidden ? 'Hiện khối' : 'Ẩn khối'}
                  onClick={() => updatePart(p.id, (x) => void (x.hidden = !x.hidden))}
                  className="rounded p-1 text-cream-500 hover:text-cream-100"
                >
                  {p.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  type="button"
                  title={p.locked ? 'Mở khóa' : 'Khóa (không chọn/kéo được trên mô hình)'}
                  aria-label={p.locked ? 'Mở khóa' : 'Khóa'}
                  onClick={() => updatePart(p.id, (x) => void (x.locked = !x.locked))}
                  className={`rounded p-1 hover:text-cream-100 ${p.locked ? 'text-gold-400' : 'text-cream-500'}`}
                >
                  {p.locked ? <Lock size={14} /> : <LockOpen size={14} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
