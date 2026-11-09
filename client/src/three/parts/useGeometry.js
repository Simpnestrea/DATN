import { useEffect, useMemo } from 'react';

/**
 * useMemo cho geometry/texture/vật liệu tự tạo – tự giải phóng bộ nhớ GPU khi đổi hoặc gỡ bỏ.
 * @param delayMs hoãn giải phóng (vật liệu): three.js xoá shader khi vật liệu cuối cùng dùng nó bị giải phóng → đổi đá A → B
 *                → A sẽ phải BIÊN DỊCH LẠI shader dù giống hệt. Hoãn vài giây để vật liệu mới kịp nhận lại shader đang có.
 */
export function useDisposable(factory, deps, { delayMs = 0 } = {}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(factory, deps);
  useEffect(
    () => () => {
      const dispose = () => {
        if (Array.isArray(value)) value.forEach((v) => v?.dispose?.());
        else value?.dispose?.();
      };
      if (delayMs > 0) setTimeout(dispose, delayMs);
      else dispose();
    },
    [value, delayMs],
  );
  return value;
}
