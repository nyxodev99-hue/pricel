export default function PixelInspector({ pixel, selectedColor, onPaint, busy, currentUserId }) {
  if (!pixel) {
    return (
      <div className="inspector inspector--empty">
        <p>Clique sur un pixel pour voir ses détails.</p>
      </div>
    );
  }

  const isOwn = pixel.owner_id && pixel.owner_id === currentUserId;
  const isEmpty = pixel.is_empty;
  const cost = isEmpty ? 1 : isOwn ? 0 : pixel.price + 1;

  return (
    <div className="inspector">
      <div className="inspector-title">Pixel ({pixel.x}, {pixel.y})</div>
      <div className="inspector-row">
        <span className="swatch-preview" style={{ backgroundColor: pixel.color || '#ffffff' }} />
        <span>{pixel.color || 'vide'}</span>
      </div>
      <div className="inspector-row"><span>Prix actuel</span><strong>{pixel.price} crédit{pixel.price > 1 ? 's' : ''}</strong></div>
      <div className="inspector-row"><span>Propriétaire</span><strong>{pixel.owner_id ? (isOwn ? 'Toi' : pixel.owner_id.slice(0, 8)) : 'Personne'}</strong></div>
      {pixel.updated_at && (
        <div className="inspector-row"><span>Dernière modif.</span><strong>{new Date(pixel.updated_at).toLocaleString('fr-FR')}</strong></div>
      )}

      <button className="btn-paint" disabled={busy} onClick={() => onPaint(pixel.x, pixel.y, selectedColor)}>
        {isOwn ? `Recolorer (gratuit)` : `${isEmpty ? 'Acheter' : 'Conquérir'} pour ${cost} crédit${cost > 1 ? 's' : ''}`}
      </button>
    </div>
  );
}
