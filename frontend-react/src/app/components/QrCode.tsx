import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export interface QrCodeProps {
  value: string;
  size?: number;
  className?: string;
}

/**
 * Local SVG QR code renderer for sensitive TOTP enrollment URIs.
 * Never leaks secrets to external image APIs or cloud chart generators.
 */
export function QrCode({ value, size = 160, className }: QrCodeProps) {
  const [svg, setSvg] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCode.toString(value, { type: 'svg', margin: 1, width: size })
      .then((res) => {
        if (active) setSvg(res);
      })
      .catch((err) => {
        console.error('Failed to render local QR code', err);
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!svg) {
    return (
      <div
        className="grid place-items-center rounded bg-s3"
        style={{ width: size, height: size }}
        aria-busy="true"
        aria-label="Generating QR code"
      >
        <span className="text-[12px] text-ink3">Loading QR…</span>
      </div>
    );
  }

  return (
    <div
      className={className}
      role="img"
      aria-label="Authenticator setup QR code"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
