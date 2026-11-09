// Cung cấp bộ vật liệu dùng chung (kim loại, đá chủ, đá phụ) cho toàn bộ mô hình qua React context.
// Mỗi vật liệu chỉ được tạo lại khi thuộc tính liên quan thay đổi, và được giải phóng khi không dùng nữa.
import { createContext, useContext, useMemo } from 'react';
import { useCatalogStore } from '../../store/catalogStore.js';
import { useDisposable } from '../parts/useGeometry.js';
import {
  createEngraveMaterial,
  createMetalMaterial,
  createStoneMaterial,
  resolveMetal,
  resolveStone,
} from './createMaterials.js';

const MaterialsContext = createContext(null);
// vật liệu cũ giữ thêm 10 giây rồi mới giải phóng → đổi đá / kim loại qua lại không phải biên dịch lại shader (xem useDisposable)
const KEEP = { delayMs: 10000 };

/** @param lookupOverride bộ tra cứu thay thế (xem trước chất liệu đang sửa ở trang quản trị danh mục) */
export function MaterialsProvider({ config, quality, matte = false, lookupOverride = null, children }) {
  const storeLookup = useCatalogStore((s) => s.lookup);
  const lookup = lookupOverride ?? storeLookup;
  const metalProps = resolveMetal(config.metal, lookup);
  const gemProps = resolveStone(config.gem.stone, lookup, config.gem.color, config.gem.snapshot);
  const accentProps = resolveStone(config.deco.accentStone, lookup);
  const sideProps = resolveStone(config.deco.sideStone ?? config.deco.accentStone, lookup);

  const metalKey = JSON.stringify([metalProps, config.metal.finish]);
  const metal = useDisposable(() => createMetalMaterial(metalProps, config.metal.finish, matte), [metalKey, matte], KEEP);
  const engrave = useDisposable(() => createEngraveMaterial(metalProps), [metalProps.color], KEEP);
  const gem = useDisposable(() => createStoneMaterial(gemProps, quality, matte), [JSON.stringify(gemProps), quality, matte], KEEP);
  const accent = useDisposable(
    () => createStoneMaterial(accentProps, quality, matte),
    [JSON.stringify(accentProps), quality, matte],
    KEEP,
  );

  const side = useDisposable(() => createStoneMaterial(sideProps, quality, matte), [JSON.stringify(sideProps), quality, matte], KEEP);

  const value = useMemo(
    () => ({ metal, engrave, gem, accent, side, gemIsPearl: gemProps.kind === 'pearl', metalColor: metalProps.color, quality, matte }),
    [metal, engrave, gem, accent, side, gemProps.kind, metalProps.color, quality, matte],
  );
  return <MaterialsContext.Provider value={value}>{children}</MaterialsContext.Provider>;
}

export function useMaterials() {
  const ctx = useContext(MaterialsContext);
  if (!ctx) throw new Error('useMaterials phải nằm trong <MaterialsProvider>');
  return ctx;
}
