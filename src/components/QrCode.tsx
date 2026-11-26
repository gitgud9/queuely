"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** QR code for a path on this site (the origin is only known in the browser). */
export function QrCode({ path, size = 220 }: { path: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  useEffect(() => {
    const full = new URL(path, window.location.origin).toString();
    setUrl(full);
    QRCode.toDataURL(full, { width: size * 2, margin: 1 }).then(setSrc);
  }, [path, size]);
  return (
    <div className="stack" style={{ alignItems: "center", width: size }}>
      <div className="qr" style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src && <img src={src} alt={`QR code for ${url}`} />}
      </div>
      <span className="small muted mono" style={{ wordBreak: "break-all", textAlign: "center" }}>
        {url.replace(/^https?:\/\//, "")}
      </span>
    </div>
  );
}
