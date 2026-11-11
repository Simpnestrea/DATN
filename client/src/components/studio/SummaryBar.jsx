import { useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { summarizeConfig } from '@ngk/shared';
import { useDesignStore } from '../../store/designStore.js';
import { useCatalogStore } from '../../store/catalogStore.js';
import { SpecsModal } from './SpecsModal.jsx';

export function SummaryBar() {
  const config = useDesignStore((s) => s.config);
  const lookup = useCatalogStore((s) => s.lookup);
  const summary = useMemo(() => summarizeConfig(config, lookup), [config, lookup]);
  const [open, setOpen] = useState(false);
  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-4 border-t border-ink-700 bg-ink-900 px-4 text-xs">
      <p className="truncate text-cream-300" title={summary}>
        <span className="mr-2 text-gold-400">◆</span>
        {summary}
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-cream-300 hover:bg-ink-750 hover:text-gold-200"
      >
        <ClipboardList size={14} /> Bảng thông số
      </button>
      <SpecsModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
