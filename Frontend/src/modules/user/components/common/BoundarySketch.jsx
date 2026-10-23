import React, { useMemo } from 'react';

/**
 * A small drawing of a field's border from its corner points (no map service needed, so it is free, works offline and
 * prints cleanly). North is up. Corners are numbered 1..n, the same numbers the agreement's corner table uses.
 */
const BoundarySketch = ({ points = [], size = 220, showNumbers = true, className = '' }) => {
  const shape = useMemo(() => {
    const pts = (points || []).filter(p => Number.isFinite(Number(p?.lat)) && Number.isFinite(Number(p?.lng)));
    if (pts.length < 3) return null;
    const lats = pts.map(p => Number(p.lat));
    const lngs = pts.map(p => Number(p.lng));
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const k = Math.cos((midLat * Math.PI) / 180);
    const xs = pts.map(p => Number(p.lng) * k);
    const ys = pts.map(p => -Number(p.lat));
    const minX = Math.min(...xs); const maxX = Math.max(...xs);
    const minY = Math.min(...ys); const maxY = Math.max(...ys);
    const pad = 22;
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    const scale = (size - pad * 2) / span;
    const offX = (size - (maxX - minX) * scale) / 2;
    const offY = (size - (maxY - minY) * scale) / 2;
    const xy = pts.map((_, i) => ({ x: offX + (xs[i] - minX) * scale, y: offY + (ys[i] - minY) * scale }));
    return { xy, lngsOk: lngs.length > 0 };
  }, [points, size]);

  if (!shape) return null;
  const d = shape.xy.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ maxWidth: size }}
      className={className}
      role="img"
      aria-label="Land border sketch"
    >
      <rect x="0.5" y="0.5" width={size - 1} height={size - 1} rx="10" fill="#f8fafc" stroke="#e2e8f0" />
      <path d={d} fill="#10b98133" stroke="#047857" strokeWidth="2" strokeLinejoin="round" />
      {shape.xy.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={showNumbers ? 8 : 3} fill="#059669" stroke="#fff" strokeWidth="1.5" />
          {showNumbers && (
            <text x={p.x} y={p.y + 3.2} textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">{i + 1}</text>
          )}
        </g>
      ))}
      {/* north arrow */}
      <g transform={`translate(${size - 18},18)`}>
        <path d="M0,-9 L5,5 L0,2 L-5,5 Z" fill="#334155" />
        <text x="0" y="17" textAnchor="middle" fontSize="8" fontWeight="700" fill="#334155">N</text>
      </g>
    </svg>
  );
};

export default BoundarySketch;
