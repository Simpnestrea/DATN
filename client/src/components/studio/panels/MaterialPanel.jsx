import { useMemo } from 'react';
import { FINISHES } from '@ngk/shared';
import { activeMaterials, useCatalogStore } from '../../../store/catalogStore.js';
import { Field, Notice, Segmented, SectionTitle, Swatch } from '../../ui/controls.jsx';
import { metalFill } from '../../../utils/color.js';
import { useDesign } from '../useDesign.js';

export function MaterialPanel() {
  const { config, setPath } = useDesign();
  const catalog = useCatalogStore((s) => s.catalog);
  const lookup = useCatalogStore((s) => s.lookup);
  const materials = useMemo(() => activeMaterials(catalog), [catalog]);
  const current = lookup.material(config.metal.code);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <SectionTitle>Kim loại</SectionTitle>
        <div className="grid grid-cols-4 gap-x-2 gap-y-4">
          {materials.map((m) => (
            <Swatch
              key={m.code}
              name={m.name}
              fill={metalFill(m.color)}
              selected={config.metal.code === m.code}
              onClick={() => setPath('metal.code', m.code)}
            />
          ))}
        </div>
        {current && current.isActive === false ? (
          <Notice tone="gold">“{current.name}” đã ngừng có trong danh mục – thiết kế vẫn hiển thị đúng; chọn kim loại khác nếu muốn thay.</Notice>
        ) : current ? (
          <Notice>{current.description}</Notice>
        ) : (
          <Notice tone="gold">Chất liệu của thiết kế này không còn trong danh mục – vẫn hiển thị theo dữ liệu đã lưu.</Notice>
        )}
      </div>

      <Field label="Hoàn thiện bề mặt" hint="Bóng gương phản chiếu rõ nét; xước mờ và matte cho cảm giác hiện đại, ít lộ vết trầy.">
        <Segmented options={FINISHES} value={config.metal.finish} onChange={(v) => setPath('metal.finish', v)} />
      </Field>
    </div>
  );
}
