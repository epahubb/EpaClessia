import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@mui/material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';

interface Props { open: boolean; onClose: () => void; onCapture: (file: File) => void }
/** Camera is requested only after the operator clicks Open camera. */
export default function CameraCaptureDialog({ open, onClose, onCapture }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const nativeInput = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [loading, setLoading] = useState(false), [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [shot, setShot] = useState<Blob | null>(null), [preview, setPreview] = useState('');
  useEffect(() => {
    if (!open || shot) return;
    let disposed = false;
    setError(''); setLoading(true); setReady(false);
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access requires HTTPS and a supported browser.');
        const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 1280 } } });
        if (disposed) { media.getTracks().forEach(t => t.stop()); return; }
        stream.current = media;
        if (video.current) { video.current.srcObject = media; await video.current.play(); if (!disposed) setReady(true); }
      } catch (err: any) {
        if (!disposed) setError(err?.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser, or choose an existing photo.' : err?.name === 'NotFoundError' ? 'No camera was found. Choose an existing photo instead.' : err?.message || 'Could not open the camera.');
      } finally { if (!disposed) setLoading(false); }
    };
    void start();
    return () => { disposed = true; stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; };
  }, [open, facing, shot]);
  useEffect(() => {
    if (!shot) { setPreview(''); return; }
    const url = URL.createObjectURL(shot); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [shot]);
  useEffect(() => { if (!open) { setShot(null); setReady(false); setError(''); } }, [open]);
  const capture = () => {
    const source = video.current;
    if (!source?.videoWidth) return;
    const canvas = document.createElement('canvas'); canvas.width = source.videoWidth; canvas.height = source.videoHeight;
    canvas.getContext('2d')?.drawImage(source, 0, 0);
    canvas.toBlob(blob => { if (blob) setShot(blob); else setError('Could not capture the image. Please retry.'); }, 'image/jpeg', 0.95);
  };
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
    <DialogTitle>Capture member photo</DialogTitle>
    <DialogContent><Stack spacing={2}>
      {error && <Alert severity="warning">{error}</Alert>}
      <Box sx={{ bgcolor: 'grey.900', borderRadius: 2, overflow: 'hidden', position: 'relative', minHeight: 220 }}>
        {preview ? <Box component="img" src={preview} alt="Captured portrait preview" sx={{ width: '100%', maxHeight: 430, objectFit: 'contain', display: 'block' }} />
          : <Box component="video" ref={video} autoPlay muted playsInline onLoadedData={() => setReady(true)} sx={{ width: '100%', maxHeight: 430, display: 'block', objectFit: 'contain' }} />}
        {loading && <CircularProgress aria-label="Opening camera" sx={{ position: 'absolute', top: '45%', left: '45%' }} />}
      </Box>
      <Alert severity="info">Frame one person clearly. The background will be changed to white and the photo compressed below 1 MB before upload.</Alert>
      {!preview && <Button onClick={() => nativeInput.current?.click()} variant="outlined">Use device camera / choose photo</Button>}
      <input ref={nativeInput} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e => { const file = e.target.files?.[0]; if (file) { onCapture(file); onClose(); } e.target.value = ''; }} />
    </Stack></DialogContent>
    <DialogActions sx={{ flexWrap: 'wrap', gap: 1, p: 2 }}>
      <Button onClick={onClose}>Cancel</Button>
      {preview ? <><Button onClick={() => setShot(null)}>Retake</Button><Button variant="contained" onClick={() => { if (shot) onCapture(new File([shot], 'camera-portrait.jpg', { type: 'image/jpeg' })); onClose(); }}>Use photo</Button></>
        : <><Button disabled={loading} onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')}>Switch camera</Button><Button variant="contained" startIcon={<CameraAltIcon />} disabled={!ready || loading} onClick={capture}>Capture</Button></>}
    </DialogActions>
  </Dialog>;
}
