import React, { useState } from 'react';
import { Card, CardContent, Typography, Stack, Button, Alert } from '@mui/material';
import AuthedImageField from '../common/AuthedImageField';
import churchApi from '../../services/churchApi';

/**
 * Church logo upload for the Settings page.
 *
 * The logo is stored in the church's own database row and served from an
 * authenticated endpoint, so it belongs to the church rather than depending on
 * an external image URL that can rot or be taken down.
 */
interface ChurchLogoCardProps {
  churchName?: string;
}

const ChurchLogoCard: React.FC<ChurchLogoCardProps> = ({ churchName }) => {
  const [pending, setPending] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  // Bumped after each save so the stored image is re-fetched instead of showing
  // a stale cached copy.
  const [version, setVersion] = useState(0);

  const save = async () => {
    if (pending === undefined) return;
    setSaving(true);
    setMessage(null);
    try {
      if (pending === null) {
        await churchApi.deleteChurchLogo();
        setMessage({ tone: 'success', text: 'Church logo removed.' });
      } else {
        await churchApi.uploadChurchLogo(pending);
        setMessage({ tone: 'success', text: 'Church logo updated.' });
      }
      setPending(undefined);
      setVersion((v) => v + 1);
    } catch (err: any) {
      setMessage({
        tone: 'error',
        text: err?.response?.data?.error || err?.message || 'The logo could not be saved.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography fontWeight={700} gutterBottom>
          {churchName || 'Your Church'} logo
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Upload your church logo. It is resized and compressed automatically, and appears on your
          portal and printed reports.
        </Typography>

        {message && (
          <Alert severity={message.tone} sx={{ mb: 2 }}>
            {message.text}
          </Alert>
        )}

        <AuthedImageField
          key={version}
          existingPath="/church/branding/logo"
          value={pending}
          onChange={setPending}
          variant="logo"
        />

        {pending !== undefined && (
          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
            <Button onClick={() => setPending(undefined)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="contained" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : pending === null ? 'Remove logo' : 'Save logo'}
            </Button>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};

export default ChurchLogoCard;
