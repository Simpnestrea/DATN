// Hook tiện ích cho các panel: đọc cấu hình + quy tắc kiểu dáng, cung cấp hàm cập nhật.
import { useMemo } from 'react';
import { getStyleRules } from '@ngk/shared';
import { useDesignStore } from '../../store/designStore.js';

export function useDesign() {
  const config = useDesignStore((s) => s.config);
  const setPath = useDesignStore((s) => s.setPath);
  const commit = useDesignStore((s) => s.commit);
  const apply = useDesignStore((s) => s.apply);
  const setStyle = useDesignStore((s) => s.setStyle);
  const rules = useMemo(() => getStyleRules(config), [config]);
  return { config, rules, setPath, commit, apply, setStyle };
}

/** Props cho <Slider> gắn với một đường dẫn trong cấu hình (kéo = tạm, thả = ghi lịch sử). */
export function useSliderBinding(path) {
  const setPath = useDesignStore((s) => s.setPath);
  const commit = useDesignStore((s) => s.commit);
  const value = useDesignStore((s) => path.split('.').reduce((o, k) => o?.[k], s.config));
  return {
    value,
    onChange: (v) => setPath(path, v, { transient: true }),
    onCommit: commit,
  };
}
