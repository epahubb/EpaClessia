import React, { useEffect, useRef, useState } from 'react';
import { Box, Alert } from '@mui/material';
import QRCode from 'qrcode';

interface QrCodeCanvasProps {
  /** Exact payload issued by the server. Never construct this locally. */
  value: string;
  size?: number;
}

/** Renders a QR payload to a canvas, isolating the encoder dependency. */
export const QrCodeCanvas: React.FC<QrCodeCanvasProps> = ({ value, size = 320 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    let cancelled = false;
    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then(() => { if (!cancelled) setError(null); })
      .catch((e: any) => { if (!cancelled) setError(e?.message || 'Could not render the QR code.'); });
    return () => { cancelled = true; };
  }, [value, size]);

  if (error) return <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>;

  return (
    <Box sx={{ display: 'inline-flex', p: 2, bgcolor: '#fff', borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
      <canvas ref={canvasRef} aria-label="Attendance QR code" />
    </Box>
  );
};

export default QrCodeCanvas;
