import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
/** React escapes all record text. No innerHTML, remote code or document.write. */
export default function PrintDocument({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const application = document.getElementById('root');
    const wasInert = application?.inert || false;
    if (application) application.inert = true;
    root.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { document.body.style.overflow = overflow; if (application) application.inert = wasInert; previous?.focus(); };
  }, []);
  const keydown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key !== 'Tab') return;
    const buttons = root.current?.querySelectorAll<HTMLButtonElement>('button');
    if (!buttons?.length) return;
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  return createPortal(<Box ref={root} onKeyDown={keydown} id="finance-print-document" role="dialog" aria-modal="true" aria-label={title} sx={{ position: 'fixed', inset: 0, zIndex: 1600, bgcolor: '#fff', color: '#222', overflow: 'auto', p: { xs: 2, md: 5 } }}>
    <style>{`@media print { html, body { width: 100% !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; } @page { size: A4; margin: 16mm; } body > *:not(#finance-print-document) { display: none !important; } #finance-print-document { position: static !important; inset: auto !important; width: 100% !important; max-width: none !important; overflow: visible !important; padding: 0 !important; } #finance-print-document > div:last-child { width: 100% !important; max-width: none !important; margin: 0 !important; } #finance-print-document * { transition: none !important; } .print-controls { display: none !important; } #finance-print-document table { width: 100%; border-collapse: collapse; font-size: 10pt; } #finance-print-document th, #finance-print-document td { padding: 7px; border-bottom: 1px solid #ddd; text-align: left; overflow-wrap: anywhere; } #finance-print-document tr { break-inside: avoid; } #finance-print-document thead { display: table-header-group; } }`}</style>
    <Stack className="print-controls" direction="row" spacing={2} sx={{ mb: 3, '& .MuiButton-outlined': { color: '#1b4332', borderColor: '#1b4332' } }}><Button variant="contained" onClick={() => window.print()}>Print / Save PDF</Button><Button variant="outlined" onClick={onClose}>Close preview</Button></Stack>
    <Box sx={{ maxWidth: 1000, mx: 'auto', '& .MuiTableCell-root': { color: '#222' }, '& .MuiTableCell-head': { bgcolor: '#f5f5f5' }, '& .MuiTypography-root': { color: '#333' }, '& .MuiAlert-root': { bgcolor: '#eef6ff', color: '#174d75' }, '& table': { width: '100%', borderCollapse: 'collapse', fontSize: 14 }, '& th, & td': { textAlign: 'left', borderBottom: '1px solid #ddd', p: 1, overflowWrap: 'anywhere' }, '& table thead': { bgcolor: '#f5f5f5' }, '& .document-table': { overflowX: 'auto' } }}>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 2 }}>{title}</Typography>{children}
    </Box>
  </Box>, document.body);
}
