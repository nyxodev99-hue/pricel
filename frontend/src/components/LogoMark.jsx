export default function LogoMark({ size = 22 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="7" height="7" rx="1" fill="#1e78e0" />
      <rect x="9" y="0" width="7" height="7" rx="1" fill="#e01e1e" />
      <rect x="0" y="9" width="7" height="7" rx="1" fill="#f0a020" />
      <rect x="9" y="9" width="7" height="7" rx="1" fill="#f0d020" />
    </svg>
  );
}
