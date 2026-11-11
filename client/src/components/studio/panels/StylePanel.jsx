import { useMemo } from 'react';
import { activeStyles, useCatalogStore } from '../../../store/catalogStore.js';
import { OptionCard, SectionTitle } from '../../ui/controls.jsx';
import { StyleIcon } from '../../icons.jsx';
import { useDesign } from '../useDesign.js';

const HEADINGS = {
  ring: 'Kiểu nhẫn',
  bracelet: 'Kiểu vòng tay',
  necklace: 'Kiểu dây chuyền',
  earrings: 'Kiểu khuyên tai',
  pendant: 'Hình dáng mặt dây',
};

export function StylePanel() {
  const { config, setStyle } = useDesign();
  const catalog = useCatalogStore((s) => s.catalog);
  const styles = useMemo(() => activeStyles(catalog, config.type), [catalog, config.type]);

  return (
    <div className="space-y-4">
      <SectionTitle>{HEADINGS[config.type]}</SectionTitle>
      <div className="grid gap-2">
        {styles.map((s) => (
          <OptionCard
            key={s.code}
            title={s.name}
            description={s.description}
            icon={<StyleIcon type={config.type} code={s.code} />}
            selected={config.style === s.code}
            onClick={() => setStyle(s.code)}
          />
        ))}
      </div>
      {config.type === 'necklace' && (
        <p className="text-xs text-cream-600">Hình dáng mặt dây được chọn ở tab “Trang trí”.</p>
      )}
    </div>
  );
}
