import React, { useState, useEffect, useRef, memo } from 'react';
import { gsap } from 'gsap';
import PromoCard from '../../../components/common/PromoCard';
import { themeColors } from '../../../../../theme';

const PromoCarousel = memo(({ promos, onPromoClick }) => {
  // Only consider valid cards with an image
  const originals = (promos || []).filter(p => Boolean(p && p.image));
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
    const container = scrollContainerRef.current;
    const children = container.children;
    if (children && children[index]) {
      container.scrollTo({ left: children[index].offsetLeft, behavior });
    } else {
      const cardWidth = container.offsetWidth;
      container.scrollTo({ left: index * cardWidth, behavior });
    }
  };

  // ─── Auto-advance (stable interval) ────────────────────────────────────────
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
  }, [originals.length]);

  // ─── Manual swipe → sync dot + ref ───────────────────────────────────────
  const handleScroll = () => {
    if (!scrollContainerRef.current || isSilentReset.current) return;
    const container = scrollContainerRef.current;
    const children = container.children;
    if (!children || children.length === 0) return;

    const scrollLeft = container.scrollLeft;
    let closestIndex = 0;
    let minDiff = Infinity;
    for (let i = 0; i < children.length; i++) {
      const diff = Math.abs(children[i].offsetLeft - scrollLeft);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }

    if (closestIndex !== currentIndexRef.current && closestIndex >= 0 && closestIndex < looped.length) {
      currentIndexRef.current = closestIndex;
      setActiveDot(closestIndex % originals.length);
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
      className="relative px-4"
      style={{ opacity: 1 }}
      onMouseEnter={() => { isHoveredRef.current = true; }}
      onMouseLeave={() => { isHoveredRef.current = false; }}
    >
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory"
        style={{ scrollBehavior: 'smooth' }}
      >
        {looped.map((promo, idx) => (
          <div
            key={`${promo.id}-${idx}`}
            data-promo-card
            className="flex-shrink-0 snap-center w-full min-w-full"
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

      {/* Floating Indicator Capsule matching user reference — only shown when multiple cards present & fully clickable */}
      {originals.length > 1 && (
        <div 
          className="absolute bottom-3 right-6 z-20 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/15 shadow-md pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {originals.map((_, index) => {
            const isActive = index === activeDot;
            return (
              <button
                key={index}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  currentIndexRef.current = index;
                  setActiveDot(index);
                  scrollToIndex(index, 'smooth');
                }}
                aria-label={`Go to slide ${index + 1}`}
                className="group p-1 focus:outline-none cursor-pointer flex items-center justify-center transition-transform active:scale-90"
              >
                <span
                  className={`block rounded-full transition-all duration-300 ${
                    isActive
                      ? 'w-4 sm:w-5 h-1.5 bg-white shadow-xs'
                      : 'w-1.5 h-1.5 bg-white/45 group-hover:bg-white/80'
                  }`}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

PromoCarousel.displayName = 'PromoCarousel';

export default PromoCarousel;
