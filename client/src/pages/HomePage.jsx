import { lazy, Suspense, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Gem, History, Layers, MousePointer2, Palette, Rotate3d, ShieldCheck, Sparkles } from 'lucide-react';
import { CUTS, JEWELRY_TYPES, buildConfigFromTemplate } from '@ngk/shared';
import { activeGemstones, activeMaterials, allTemplates, useCatalogStore } from '../store/catalogStore.js';
import { SiteHeader } from '../components/layout/SiteHeader.jsx';
import { SiteFooter } from '../components/layout/SiteFooter.jsx';
import { Button } from '../components/ui/Button.jsx';
import { TemplateCard } from '../components/TemplateCard.jsx';
import { TypeIcon } from '../components/icons.jsx';
import { CommunityHome } from '../components/community/CommunityHome.jsx';

const JewelryCanvas = lazy(() => import('../three/JewelryCanvas.jsx'));

const TYPE_BLURBS = {
  ring: 'Solitaire, halo, eternity, ba viên…',
  bracelet: 'Vòng kiềng, cuff, lắc charm, tennis',
  necklace: 'Bốn kiểu dây và nhiều dáng mặt dây',
  earrings: 'Khuyên nụ, khuyên tròn, dáng dài',
  pendant: 'Tim, sao, giọt nước, khắc chữ',
  custom: 'Ghép khối tự do, không giới hạn kiểu dáng',
};

const STEPS = [
  { icon: Layers, title: 'Chọn loại & kiểu dáng', text: 'Bắt đầu từ con số 0 hoặc từ một mẫu gợi ý có sẵn.' },
  { icon: Palette, title: 'Tùy chỉnh từng chi tiết', text: 'Kim loại, đá quý, giác cắt, kích thước, đá tấm, khắc chữ – mô hình 3D đổi ngay lập tức.' },
  { icon: Sparkles, title: 'Lưu & xuất thiết kế', text: 'Bản nháp tự lưu. Xuất ảnh chất lượng cao và bảng thông số để trao đổi với xưởng.' },
];

const FEATURES = [
  { icon: Rotate3d, title: 'Xem trước 3D thời gian thực', text: 'Xoay 360°, phóng to, đổi nền và ánh sáng như trong phòng chụp.' },
  { icon: Gem, title: 'Vật liệu chân thực', text: 'Kim loại phản chiếu, đá giác lấp lánh, ngọc trai ánh xà cừ.' },
  { icon: ShieldCheck, title: 'Quy tắc thiết kế thông minh', text: 'Tự ngăn các lựa chọn không hợp lý, ví dụ ngọc trai luôn dáng tròn.' },
  { icon: History, title: 'Hoàn tác & tự lưu nháp', text: 'Undo/Redo từng bước, đặt lại bất kỳ lúc nào, bản nháp được lưu tự động.' },
];

export default function HomePage() {
  const catalog = useCatalogStore((s) => s.catalog);
  const templates = useMemo(() => allTemplates(catalog), [catalog]);
  const featured = useMemo(() => templates.filter((t) => t.featured).slice(0, 6), [templates]);
  const heroConfig = useMemo(() => {
    const t = templates.find((x) => x.code === 'halo-rose') ?? templates[0];
    return t ? buildConfigFromTemplate(t) : null;
  }, [templates]);
  const stats = [
    { n: JEWELRY_TYPES.length, label: 'loại trang sức' },
    { n: activeMaterials(catalog).length, label: 'chất liệu' },
    { n: activeGemstones(catalog).length, label: 'loại đá quý' },
    { n: CUTS.length, label: 'giác cắt' },
  ];

  return (
    <div className="min-h-dvh">
      <SiteHeader />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(60% 70% at 72% 45%, rgba(217,183,102,0.13) 0%, rgba(14,14,16,0) 60%)' }}
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 py-14 lg:grid-cols-[1.05fr_1fr] lg:py-20">
          <div className="animate-fade-up">
            <p className="eyebrow">Xưởng thiết kế trang sức 3D</p>
            <h1 className="mt-5 font-display text-5xl leading-[1.05] font-semibold text-cream-50 md:text-6xl xl:text-7xl">
              Tự tay thiết kế <span className="text-gold-gradient italic">món trang sức</span> của riêng bạn
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-cream-300">
              Chọn kiểu dáng, kim loại, đá quý và từng chi tiết nhỏ nhất – mô hình 3D thay đổi ngay khi bạn chỉnh. Không cần
              biết phần mềm 3D, chỉ cần ý tưởng.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button as={Link} to="/studio" variant="primary" size="lg">
                Bắt đầu thiết kế <ArrowRight size={18} />
              </Button>
              <Button as={Link} to="/templates" variant="secondary" size="lg">
                Xem mẫu gợi ý
              </Button>
            </div>
            <dl className="mt-12 grid max-w-lg grid-cols-4 gap-4 border-t border-ink-700 pt-6">
              {stats.map((s) => (
                <div key={s.label}>
                  <dt className="sr-only">{s.label}</dt>
                  <dd className="font-display text-3xl font-semibold text-gold-200">{s.n}</dd>
                  <dd className="text-xs text-cream-500">{s.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative mx-auto aspect-square w-full max-w-[560px]">
            <div className="absolute inset-[8%] rounded-full border border-gold-500/15" />
            <div className="absolute inset-[18%] rounded-full border border-gold-500/10" />
            {heroConfig && (
              <Suspense fallback={null}>
                <JewelryCanvas config={heroConfig} mode="hero" />
              </Suspense>
            )}
            <div className="absolute bottom-[6%] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-ink-600 bg-ink-850/80 px-4 py-2 text-xs text-cream-300 backdrop-blur">
              <MousePointer2 size={13} className="text-gold-400" /> Kéo để xoay mô hình
            </div>
          </div>
        </div>
      </section>

      {/* LOẠI TRANG SỨC */}
      <section className="mx-auto max-w-7xl px-5 py-16">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="eyebrow">Bắt đầu nhanh</p>
            <h2 className="mt-3 font-display text-4xl font-semibold text-cream-50">Bạn muốn thiết kế gì hôm nay?</h2>
          </div>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {JEWELRY_TYPES.map((t) => (
            <Link
              key={t.code}
              to={`/studio?type=${t.code}`}
              className="group rounded-2xl border border-ink-700 bg-ink-850 p-5 transition-all hover:-translate-y-0.5 hover:border-gold-500/50"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-ink-600 text-cream-300 transition-colors group-hover:border-gold-500/60 group-hover:text-gold-300">
                <TypeIcon type={t.code} size={24} />
              </span>
              <h3 className="mt-4 font-display text-xl font-semibold text-cream-50">{t.name}</h3>
              <p className="mt-1 text-xs leading-relaxed text-cream-500">{TYPE_BLURBS[t.code]}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* QUY TRÌNH */}
      <section className="border-y border-ink-700/70 bg-ink-950/60">
        <div className="mx-auto max-w-7xl px-5 py-16">
          <p className="eyebrow">Quy trình</p>
          <h2 className="mt-3 font-display text-4xl font-semibold text-cream-50">Ba bước tới thiết kế hoàn chỉnh</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative rounded-2xl border border-ink-700 bg-ink-850 p-6">
                <span className="absolute top-5 right-6 font-display text-5xl font-semibold text-ink-600">0{i + 1}</span>
                <s.icon size={26} className="text-gold-400" />
                <h3 className="mt-5 text-lg font-semibold text-cream-50">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-cream-500">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* MẪU NỔI BẬT */}
      <section className="mx-auto max-w-7xl px-5 py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Cảm hứng</p>
            <h2 className="mt-3 font-display text-4xl font-semibold text-cream-50">Mẫu gợi ý nổi bật</h2>
            <p className="mt-2 text-sm text-cream-500">Mở một mẫu rồi tùy biến theo ý bạn.</p>
          </div>
          <Button as={Link} to="/templates" variant="ghost">
            Xem tất cả mẫu <ArrowRight size={16} />
          </Button>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3">
          {featured.map((t) => (
            <TemplateCard key={t.code} template={t} />
          ))}
        </div>
      </section>

      {/* CỘNG ĐỒNG: nổi bật tuần, số liệu, nhà thiết kế nổi bật */}
      <CommunityHome />

      {/* TÍNH NĂNG */}
      <section className="mx-auto max-w-7xl px-5 pt-16 pb-20">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-ink-700 bg-gradient-to-b from-ink-800 to-ink-850 p-6">
              <f.icon size={22} className="text-gold-400" />
              <h3 className="mt-4 font-semibold text-cream-50">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-cream-500">{f.text}</p>
            </div>
          ))}
        </div>

        <div className="relative mt-16 overflow-hidden rounded-3xl border border-gold-500/25 bg-ink-850 px-8 py-14 text-center">
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(50% 80% at 50% 0%, rgba(217,183,102,0.16) 0%, rgba(0,0,0,0) 70%)' }}
          />
          <h2 className="relative font-display text-4xl font-semibold text-cream-50">Ý tưởng của bạn, thành hình trong vài phút</h2>
          <p className="relative mt-3 text-cream-300">Miễn phí, không cần cài đặt – mở Studio và bắt đầu ngay.</p>
          <Button as={Link} to="/studio" variant="primary" size="lg" className="relative mt-8">
            Mở Studio thiết kế <ArrowRight size={18} />
          </Button>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
