import React, { useRef, useState } from 'react';
import { Alert, Avatar, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import UploadIcon from '@mui/icons-material/Upload';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import { compressImage, CHURCH_LOGO_OPTIONS, type CompressOptions } from '../../lib/imageCompress';
import { preparePortrait } from '../../lib/portraitPhoto';
import CameraCaptureDialog from './CameraCaptureDialog';
export type ImageUploadVariant = 'avatar' | 'logo';
interface Props {
  value?: string | null; onChange: (dataUrl: string | null) => void;
  variant?: ImageUploadVariant; label?: string; disabled?: boolean; options?: CompressOptions;
  onProcessingChange?: (busy: boolean) => void;
}
export default function ImageUploadField({ value, onChange, variant = 'avatar', label, disabled = false, options, onProcessingChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [camera, setCamera] = useState(false);
  const [error, setError] = useState(''), [info, setInfo] = useState(''), [progress, setProgress] = useState('');
  const portrait = variant === 'avatar';
  const handleFile = async (file?: File) => {
    if (!file) return;
    setError(''); setInfo(''); setBusy(true); onProcessingChange?.(true);
    try {
      const result = portrait ? await preparePortrait(file, setProgress) : await compressImage(file, { ...CHURCH_LOGO_OPTIONS, ...options });
      onChange(result.dataUrl); setInfo(`Ready to save: ${result.width} × ${result.height}, ${Math.ceil(result.bytes / 1024)} KB${portrait ? ', white background' : ''}.`);
    } catch (err: any) { setError(err?.message || 'That image could not be processed.'); }
    finally { setBusy(false); setProgress(''); onProcessingChange?.(false); if (input.current) input.current.value = ''; }
  };
  return <Stack spacing={1.5}>
    {label && <Typography variant="body2" fontWeight={600}>{label}</Typography>}
    <Stack direction="row" spacing={2} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
      {portrait ? <Avatar src={value || undefined} alt={label || 'Profile picture'} sx={{ width: 80, height: 80, border: '1px solid', borderColor: 'divider', bgcolor: 'background.default', color: 'text.secondary' }}><CameraAltIcon /></Avatar>
        : value ? <Box component="img" src={value} alt={label || 'Church logo'} sx={{ height: 80, maxWidth: 200, objectFit: 'contain', border: '1px solid', borderColor: 'divider', p: 1, bgcolor: 'white' }} />
          : <Box sx={{ width: 140, height: 80, border: '1px dashed', borderColor: 'divider', display: 'grid', placeItems: 'center' }}><UploadIcon /></Box>}
      <Stack spacing={1} sx={{ flex: '1 1 180px', minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button variant="outlined" startIcon={busy ? <CircularProgress size={18} /> : <UploadIcon />} disabled={disabled || busy} onClick={() => input.current?.click()} sx={{ minHeight: 44 }}>{busy ? 'Processing…' : value ? 'Change photo' : 'Upload'}</Button>
          {portrait && <Button variant="outlined" startIcon={<CameraAltIcon />} disabled={disabled || busy} onClick={() => setCamera(true)} sx={{ minHeight: 44 }}>Open camera</Button>}
          {value && <Button color="error" disabled={disabled || busy} onClick={() => { onChange(null); setInfo(''); setError(''); }} sx={{ minHeight: 44 }}>Remove</Button>}
        </Stack>
        <Typography variant="body2" color="text.secondary">{portrait ? 'JPG, PNG or WebP. White background; automatically compressed below 1 MB.' : 'JPG, PNG or WebP. Logo transparency is preserved.'}</Typography>
      </Stack>
    </Stack>
    {busy && <Typography role="status" variant="body2" color="text.secondary">{progress || 'Processing image…'}</Typography>}
    {info && <Typography role="status" variant="body2" color="success.main">{info}</Typography>}
    {error && <Alert severity="error">{error}<Button onClick={() => input.current?.click()} sx={{ ml: 1 }}>Try another photo</Button></Alert>}
    <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={e => void handleFile(e.target.files?.[0])} />
    <CameraCaptureDialog open={camera} onClose={() => setCamera(false)} onCapture={file => void handleFile(file)} />
  </Stack>;
}
