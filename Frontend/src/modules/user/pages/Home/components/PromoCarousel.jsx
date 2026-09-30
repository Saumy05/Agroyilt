import React, { useState, useEffect, useRef, memo } from 'react';
import { gsap } from 'gsap';
import PromoCard from '../../../components/common/PromoCard';
import { themeColors } from '../../../../../theme';

const PromoCarousel = memo(({ promos, onPromoClick }) => {
  const originals = promos || [];
  // Double the array → [A, B, C, A*, B*, C*] for seamless loop
  const looped = originals.length > 1 ? [...originals, ...originals] : originals;

  const [activeDot, setActiveDot] = useState(0);
  const currentIndexRef = useRef(0);       // source of truth for scroll position
  const scrollContainerRef = useRef(null);
  const carouselRef = useRef(null);
  const isHoveredRef = useRef(false);
  const isSilentReset = useRef(false);

  // ─── Core scroll-to helper ─────────────────────────────────────────────────
  const scrollToIndex = (index, behavior = 'smooth') => {
    if (!scrollContainerRef.current) return;
    const cardWidth = scrollContainerRef.current.offsetWidth;
    scrollContainerRef.current.scrollTo({ left: index * cardWidth, behavior });
  };

  // ─── Auto-advance (stable interval — never depends on currentIndex) ────────
  useEffect(() => {
    if (originals.length <= 1) return;

    const interval = setInterval(() => {
      if (isHoveredRef.current || isSilentReset.current) return;

      const next = currentIndexRef.current + 1;

      if (next >= originals.length) {
        // Smoothly scroll to the first CLONE (A*) — looks like continuing forward
        scrollToIndex(next, 'smooth');
        currentIndexRef.current = next;

        // After smooth animation completes, silently snap back to real first card
        setTimeout(() => {
          isSilentReset.current = true;
          scrollToIndex(0, 'instant');
          currentIndexRef.current = 0;
          setActiveDot(0);
          requestAnimationFrame(() => { isSilentReset.current = false; });
        }, 450);
      } else {
        scrollToIndex(next, 'smooth');
        currentIndexRef.current = next;
        setActiveDot(next % originals.length);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [originals.length]); // ← stable: never re-creates on index change

  // ─── Manual swipe → sync dot + ref ───────────────────────────────────────
  const handleScroll = () => {
    if (!scrollContainerRef.current || isSilentReset.current) return;
    const container = scrollContainerRef.current;
    const index = Math.round(container.scrollLeft / container.offsetWidth);
    if (index !== currentIndexRef.current && index >= 0 && index < looped.length) {
      currentIndexRef.current = index;
      setActiveDot(index % originals.length);
    }
  };

  // ─── Entrance animation ───────────────────────────────────────────────────
  useEffect(() => {
    if (!carouselRef.current) return;
    let tween;
    try {
      tween = gsap.fromTo(
        carouselRef.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }
      );
    } catch (e) {
      if (carouselRef.current) carouselRef.current.style.opacity = '1';
    }
    return () => { try { tween?.kill(); } catch (_) {} };
  }, []);

  if (!originals || originals.length === 0) return null;

  return (
    <div
      ref={carouselRef}
      style={{ opacity: 1 }}
      onMouseEnter={() => { isHoveredRef.current = true; }}
      onMouseLeave={() => { isHoveredRef.current = false; }}
    >
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-hide snap-x snap-mandatory"
        style={{ scrollBehavior: 'smooth' }}
      >
        {looped.map((promo, idx) => (
          <div
            key={`${promo.id}-${idx}`}
            data-promo-card
            className="flex-shrink-0 snap-center"
          >
            <PromoCard
              title={promo.title}
              subtitle={promo.subtitle}
              buttonText={promo.buttonText}
              image={promo.image}
              className={promo.className}
              onClick={() => onPromoClick?.(promo)}
            />
          </div>
        ))}
      </div>

      {/* Dots — always originals.length, activeDot via modulo */}
      <div className="flex justify-center gap-1.5 mt-2 mb-2">
        {originals.map((_, index) => (
          <div
            key={index}
            className={`rounded-full transition-all duration-300 ${index === activeDot ? 'w-6 h-1.5' : 'w-1.5 h-1.5'}`}
            style={{
              backgroundColor: index === activeDot
                ? themeColors.brand.yellow
                : `${themeColors.brand.yellow}66`,
              boxShadow: index === activeDot
                ? `0 2px 6px ${themeColors.brand.yellow}80`
                : '0 1px 2px rgba(0, 0, 0, 0.2)'
            }}
          />
        ))}
      </div>
    </div>
  );
});

PromoCarousel.displayName = 'PromoCarousel';

export default PromoCarousel;
