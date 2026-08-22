import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import {
  Box, Card, CardContent, Typography, TextField, MenuItem, Button,
  Alert, CircularProgress, FormControlLabel, Checkbox, Stack,
} from '@mui/material';

/**
 * Public absence questionnaire.
 *
 * A member who missed a service receives an SMS and an email with a link to
 * this page. The token in the link is the only credential, so there is no
 * login here: the page is deliberately reachable by anyone holding the link,
 * and it shows nothing beyond the member's own first name and the service they
 * missed.
 */

const apiBase = (import.meta as any).env?.VITE_API_URL || '/api/v1';

export const AbsenceSurveyPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [reasonCategory, setReasonCategory] = useState('');
  const [reason, setReason] = useState('');
  const [needsFollowUp, setNeedsFollowUp] = useState(false);

  useEffect(() => {
    let active = true;
    axios
      .get(`${apiBase}/public/absence-survey/${token}`)
      .then((r) => { if (active) setInfo(r.data); })
      .catch((e) => {
        if (active) setError(e?.response?.data?.error || 'This questionnaire could not be opened.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await axios.post(`${apiBase}/public/absence-survey/${token}`, {
        reasonCategory,
        reason,
        needsFollowUp,
      });
      setDone(true);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Your response could not be saved. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, bgcolor: 'grey.100' }}>
      <Card variant="outlined" sx={{ maxWidth: 560, width: '100%', borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>{children}</CardContent>
      </Card>
    </Box>
  );

  if (loading) {
    return shell(<Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>);
  }

  if (!info) {
    return shell(
      <Stack spacing={2}>
        <Typography variant="h6" fontWeight={800}>We could not open this link</Typography>
        <Alert severity="error">{error || 'This questionnaire link is not valid.'}</Alert>
        <Typography variant="body2" color="text.secondary">
          The link may have expired. Please contact your church directly and they will help.
        </Typography>
      </Stack>,
    );
  }

  if (done || info.alreadyResponded) {
    return shell(
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={800}>Thank you</Typography>
        <Typography color="text.secondary">
          {done
            ? 'Your response has been sent to the pastoral team. We appreciate you letting us know, and we hope to see you soon.'
            : 'A response has already been recorded for this link. Thank you for letting us know.'}
        </Typography>
      </Stack>,
    );
  }

  return shell(
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h5" fontWeight={800}>
          {info.memberFirstName ? `We missed you, ${info.memberFirstName}` : 'We missed you'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {info.churchName}{info.eventName ? ` \u2014 ${info.eventName}` : ''}
        </Typography>
      </Box>

      <Typography variant="body2">
        Would you tell us why you were not able to join us? It goes only to the pastoral team,
        and it helps us know how to support you.
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      <TextField
        select fullWidth label="Reason" value={reasonCategory}
        onChange={(e) => setReasonCategory(e.target.value)}
      >
        {(info.reasonOptions || []).map((o: string) => (
          <MenuItem key={o} value={o}>{o}</MenuItem>
        ))}
      </TextField>

      <TextField
        fullWidth multiline minRows={3} label="Anything else you would like us to know (optional)"
        value={reason} onChange={(e) => setReason(e.target.value)}
      />

      <FormControlLabel
        control={<Checkbox checked={needsFollowUp} onChange={(e) => setNeedsFollowUp(e.target.checked)} />}
        label="I would like someone to call or visit me"
      />

      <Button
        variant="contained" size="large" onClick={submit}
        disabled={submitting || (!reasonCategory && !reason.trim())}
        sx={{ fontWeight: 700, borderRadius: 2 }}
      >
        {submitting ? 'Sending\u2026' : 'Send my response'}
      </Button>
    </Stack>,
  );
};

export default AbsenceSurveyPage;
