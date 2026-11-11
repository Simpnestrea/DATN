import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { JEWELRY_TYPES, buildConfigFromTemplate } from '@ngk/shared';
import { useThumbnail } from '../store/thumbnailStore.js';
import { useCatalogStore } from '../store/catalogStore.js';
import { TypeIcon } from './icons.jsx';
import { hashString } from '../utils/hash.js';

/** Thẻ mẫu gợi ý: ảnh 3D tự dựng + tên + mô tả, bấm để mở trong Studio. */
export function TemplateCard({ template }) {
  const config = useMemo(() => buildConfigFromTemplate(template), [template]);
  const catalogSig = useCatalogStore((s) => s.sig); // danh mục đổi (màu kim loại…) → khoá mới → chụp lại
  const thumb = useThumbnail(`tpl:${template.code}:${hashString(JSON.stringify(config))}:${catalogSig}`, config);
  const typeName = JEWELRY_TYPES.find((t) => t.code === template.type)?.name;

  return (
    <Link
      to={`/studio?template=${encodeURIComponent(template.code)}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-ink-700 bg-ink-850 transition-all duration-300 hover:-translate-y-1 hover:border-gold-500/50 hover:shadow-[0_20px_50px_-20px_rgba(217,183,102,0.35)]"
    >
      <div
        className="relative aspect-square"
        style={{ background: 'radial-gradient(circle at 50% 42%, #2a2a31 0%, #141417 62%, #0c0c0e 100%)' }}
      >
        {thumb ? (
          <img
            src={thumb}
            alt={template.title}
            className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-500">
            <div className="skeleton absolute inset-6 rounded-full opacity-40" />
            <TypeIcon type={template.type} size={44} />
          </div>
        )}
        <span className="absolute top-3 left-3 rounded-full border border-ink-600 bg-ink-900/80 px-2.5 py-1 text-[11px] text-cream-300 backdrop-blur">
          {typeName}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="font-display text-lg leading-tight font-semibold text-cream-50">{template.title}</h3>
        <p className="flex-1 text-xs leading-relaxed text-cream-500">{template.description}</p>
        <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-gold-300 group-hover:gap-2.5 transition-all">
          Dùng mẫu này <ArrowRight size={13} />
        </span>
      </div>
    </Link>
  );
}
