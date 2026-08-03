import logo from '../assets/logo.png';

export default function LogoMark({ size = 22 }) {
  return (
    <img
      src={logo}
      width={size}
      height={size}
      alt="Pricel"
      style={{ borderRadius: 4, objectFit: 'cover' }}
    />
  );
}
