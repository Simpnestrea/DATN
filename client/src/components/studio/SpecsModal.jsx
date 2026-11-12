import { useMemo } from 'react';
import { describeConfig } from '@ngk/shared';
import { Modal } from '../ui/Modal.jsx';
import { useDesignStore } from '../../store/designStore.js';
import { useCatalogStore } from '../../store/catalogStore.js';

/** Bảng thông số kỹ thuật của thiết kế hiện tại (nhóm theo mục). */
export function SpecsModal({ open, onClose }) {
  const title = useDesignStore((s) => s.title);
  return (
    <Modal open={open} onClose={onClose} title="Bảng thông số" width="max-w-lg">
      <p className="mb-4 font-display text-lg text-gold-200">{title}</p>
      {/* chỉ theo dõi cấu hình + tính bảng khi hộp đang mở (trước đây tính lại mỗi lần kéo thanh trượt dù hộp đang đóng) */}
      {open && <SpecsBody />}
    </Modal>
  );
}

function SpecsBody() {
  const config = useDesignStore((s) => s.config);
  const lookup = useCatalogStore((s) => s.lookup);
  const groups = useMemo(() => {
    const map = new Map();
    for (const row of describeConfig(config, lookup)) {
      if (!map.has(row.group)) map.set(row.group, []);
      map.get(row.group).push(row);
    }
    return [...map.entries()];
  }, [config, lookup]);

  return (
    <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
      {groups.map(([group, rows]) => (
        <section key={group}>
          <h3 className="eyebrow mb-2">{group}</h3>
          <dl className="divide-y divide-ink-700 rounded-xl border border-ink-700 bg-ink-850">
            {rows.map((r) => (
              <div key={r.label} className="flex justify-between gap-4 px-3.5 py-2.5 text-sm">
                <dt className="text-cream-500">{r.label}</dt>
                <dd className="text-right text-cream-100">{r.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
