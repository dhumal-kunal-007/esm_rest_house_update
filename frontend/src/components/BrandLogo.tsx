interface BrandLogoProps {
  className?: string;
  alt?: string;
}

export default function BrandLogo({
  className = "",
  alt = "",
}: BrandLogoProps) {
  return (
    <img
      className={`brand-logo ${className}`.trim()}
      src="/esm-rest-house-logo.png"
      alt={alt}
    />
  );
}
