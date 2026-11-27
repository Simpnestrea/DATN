// Thành phần dùng chung của khu quản trị: tiêu đề trang, nhãn trạng thái, phân trang, ô lý do (có gợi ý), thông báo lỗi.
import { Link } from 'react-router-dom';
import { Award, ChevronLeft, ChevronRight, CircleAlert, EyeOff, Flag, Loader2, Lock } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { Avatar } from '../auth/UserMenu.jsx';
import { actionInfo } from './adminLabels.js';

/** Tên + ảnh một tài khoản, bấm mở trang quản trị của người đó. */
export function AdminUserLink({ user, size = 22, className = '' }) {
  if (!user?.id) return <span className={`text-cream-500 ${className}`}>{user?.displayName ?? 'Tài khoản đã xoá'}</span>;
  return (
    <Link to={`/quan-tri/nguoi-dung/${user.id}`} className={`inline-flex min-w-0 items-center gap-1.5 text-cream-200 hover:text-gold-200 ${className}`} onClick={(e) => e.stopPropagation()}>
      <Avatar user={user} size={size} />
      <span className="truncate">{user.displayName}</span>
      {user.locked && <Lock size={11} className="shrink-0 text-danger" aria-label="đang bị khoá" />}
    </Link>
  );
}

const VIS_LABEL = { public: 'Công khai', unlisted: 'Có liên kết', private: 'Riêng tư' };
/** Nhãn trạng thái một thiết kế trong khu quản trị. */
export function DesignStatusPills({ d, showVisibility = true }) {
  return (
    <span className="flex flex-wrap gap-1">
      {showVisibility && <Pill tone={d.visibility === 'public' ? 'gold' : 'muted'}>{VIS_LABEL[d.visibility]}</Pill>}
      {d.hidden && (
        <Pill tone="danger" Icon={EyeOff} title={d.hidden.reason}>
          Đã ẩn
        </Pill>
      )}
      {d.ownerLocked && (
        <Pill tone="danger" Icon={Lock}>
          Chủ bị khoá
        </Pill>
      )}
      {d.featured && (
        <Pill tone="gold" Icon={Award}>
          NGK chọn
        </Pill>
      )}
      {d.openReports > 0 && (
        <Pill tone="danger" Icon={Flag}>
          {d.openReports} báo cáo
        </Pill>
      )}
    </span>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-4xl font-semibold text-cream-50">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-cream-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

const PILL_TONES = {
  gold: 'border-gold-500/40 bg-gold-400/10 text-gold-200',
  danger: 'border-danger/40 bg-danger/10 text-danger',
  success: 'border-success/40 bg-success/10 text-success',
  muted: 'border-ink-600 bg-ink-800 text-cream-400',
};
export function Pill({ tone = 'muted', Icon, title, children }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${PILL_TONES[tone]}`}>
      {Icon && <Icon size={11} />}
      {children}
    </span>
  );
}

/** Nhãn một hành động trong nhật ký quản trị. */
export function ActionPill({ action }) {
  const { label, tone, Icon } = actionInfo(action);
  return (
    <Pill tone={tone} Icon={Icon}>
      {label}
    </Pill>
  );
}

/** Nhãn trạng thái của một tài khoản. */
export function UserBadges({ u }) {
  return (
    <span className="flex flex-wrap gap-1">
      {u.role === 'admin' && <Pill tone="gold">Quản trị viên</Pill>}
      {u.locked && (
        <Pill tone="danger" title={u.locked.reason}>
          Bị khoá
        </Pill>
      )}
      {u.demo && <Pill>Tài khoản mẫu</Pill>}
      {!u.emailVerified && !u.demo && <Pill>Chưa xác minh</Pill>}
      {u.googleLinked && <Pill>Google</Pill>}
    </span>
  );
}

export function Pagination({ page, pages, onPage }) {
  if (!pages || pages <= 1) return null;
  return (
    <nav aria-label="Phân trang" className="mt-6 flex items-center justify-center gap-2">
      <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft size={14} /> Trang trước
      </Button>
      <span className="text-xs tabular-nums text-cream-500">
        Trang {page} / {pages}
      </span>
      <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Trang sau <ChevronRight size={14} />
      </Button>
    </nav>
  );
}

export function ErrorBox({ children }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
      <CircleAlert size={16} className="mt-0.5 shrink-0" /> {children}
    </p>
  );
}

export function Loading({ label = 'Đang tải…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-cream-500">
      <Loader2 size={18} className="animate-spin" /> {label}
    </div>
  );
}

/** Ô nhập lý do: gợi ý nhanh (bấm để điền, vẫn sửa được) + đếm ký tự + báo thiếu. */
export function ReasonField({ label = 'Lý do', value, onChange, presets = [], min = 0, max = 300, placeholder, autoFocus, id = 'ly-do' }) {
  const len = [...value.trim()].length;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-cream-100">
        {label}
        {min > 0 ? <span className="text-danger"> *</span> : <span className="font-normal text-cream-500"> (không bắt buộc)</span>}
      </label>
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${value === p ? 'border-gold-500/60 bg-gold-400/10 text-gold-200' : 'border-ink-600 text-cream-400 hover:border-ink-500 hover:text-cream-100'}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
      <textarea
        id={id}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.slice(0, max))}
        rows={3}
        placeholder={placeholder}
        className="w-full resize-none rounded-xl border border-ink-600 bg-ink-850 px-3.5 py-2.5 text-sm text-cream-50 placeholder:text-cream-600 focus:border-gold-500/60 focus:outline-none"
      />
      <p className="flex justify-between text-[11px] text-cream-600">
        <span>{min > 0 && len < min ? `Cần ít nhất ${min} ký tự` : ''}</span>
        <span className="tabular-nums">
          {len}/{max}
        </span>
      </p>
    </div>
  );
}
