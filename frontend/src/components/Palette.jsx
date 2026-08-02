import { PALETTE } from '../palette.js';

export default function Palette({ selected, onSelect }) {
  return (
    <div className="palette">
      {PALETTE.map((color) => (
        <button
          key={color}
          className={`swatch ${selected === color ? 'swatch--active' : ''}`}
          style={{ backgroundColor: color }}
          onClick={() => onSelect(color)}
          aria-label={color}
          title={color}
        />
      ))}
    </div>
  );
}
