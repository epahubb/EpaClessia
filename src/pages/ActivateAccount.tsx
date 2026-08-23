import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Box, Card, CardContent, Typography, Button, Alert, CircularProgress, Stack, Chip,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

/**
 * Public account activation.
 *
 * A newly registered member receives an email (and an SMS) containing a link to
 * this page. The token in the URL is the only credential, so there is no login
 * here -- the member has not been able to sign in yet, which is precisely what
 * this page fixes.
 *
 * The link is checked before anything is changed, so the page can say what it
 * is about to do and which account it belongs to. Activation itself is a
 * deliberate click rather than a side effect of opening the page: mail clients
 * and link scanners routinely fetch URLs on the recipient's behalf, and a GET
 * that activated an account would be spent before the member ever saw it.
 */

const apiBase = (import.meta as any).env?.VITE_API_URL || '/api/v1';

export const ActivateAccountPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ username?: string | null; email?: string | null } | null>(null);
  const [alreadyActive, setAlreadyActive] = useState(false);

  useEffect(() => {
    let active = true;
    axios
      .get(`${apiBase}/public/activate/${token}`)
      .then((r) => {
        if (!active) return;
        if (r.data?.valid) setInfo(r.data);
        else {
          // An account that is already open is good news, not an error.
          setAlreadyActive(Boolean(r.data?.alreadyActive));
          setError(r.data?.message || 'This activation link cannot be used.');
        }
      })
      .catch((e) => {
        if (!active) return;
        setAlreadyActive(Boolean(e?.response?.data?.alreadyActive));
        setError(
          e?.response?.data?.message
          || 'This activation link could not be opened. It may have expired.',
        );
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const activate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const r = await axios.post(`${apiBase}/public/activate/${token}`, {});
      if (r.data?.success) setDone({ username: r.data?.username, email: r.data?.email });
      else setError(r.data?.message || 'Your account could not be activated.');
    } catch (e: any) {
      setAlreadyActive(Boolean(e?.response?.data?.alreadyActive));
      setError(
        e?.response?.data?.message
        || 'Your account could not be activated. Please contact your church office.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, bgcolor: 'background.default' }}>
      <Card variant="outlined" sx={{ maxWidth: 520, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>{children}</CardContent>
      </Card>
    </Box>
  );

  if (loading) {
    return shell(
      <Stack alignItems="center" spacing={2}>
        <CircularProgress />
        <Typography color="text.secondary">Checking your activation link…</Typography>
      </Stack>,
    );
  }

  if (done || alreadyActive) {
    return shell(
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} alignItems="center">
          <CheckCircleIcon color="success" />
          <Typography variant="h5" fontWeight={800}>
            {done ? 'Your account is active' : 'This account is already active'}
          </Typography>
        </Stack>
        <Typography color="text.secondary">
          You can now sign in to the member portal to see your giving, attendance and groups.
        </Typography>
        {done?.username && (
          <Typography variant="body2">
            Sign in with your username <Chip size="small" label={done.username} /> or your email address
            {done.email ? ` (${done.email})` : ''}, and the password your church gave you.
          </Typography>
        )}
        <Button variant="contained" size="large" onClick={() => navigate('/login')}>
          Go to sign in
        </Button>
      </Stack>,
    );
  }

  if (error) {
    return shell(
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={800}>Activation link problem</Typography>
        <Alert severity="warning">{error}</Alert>
        <Typography variant="body2" color="text.secondary">
          Ask your church office to send a fresh invitation, or to activate your account for you.
          They can do this from your member record.
        </Typography>
        <Button variant="outlined" onClick={() => navigate('/login')}>Back to sign in</Button>
      </Stack>,
    );
  }

  return shell(
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        Activate your member account
      </Typography>
      <Typography color="text.secondary">
        {info?.churchName
          ? `${info.churchName} has created a member portal account for you.`
          : 'A member portal account has been created for you.'}
        {' '}Confirm it below and you can sign in straight away.
      </Typography>
      {(info?.name || info?.email) && (
        <Card variant="outlined"><CardContent>
          {info?.name && <Typography fontWeight={700}>{info.name}</Typography>}
          {info?.email && <Typography variant="body2" color="text.secondary">{info.email}</Typography>}
        </CardContent></Card>
      )}
      <Button variant="contained" size="large" onClick={activate} disabled={submitting}>
        {submitting ? 'Activating…' : 'Activate my account'}
      </Button>
      <Typography variant="caption" color="text.secondary">
        If this was not you, simply ignore this page and tell your church office.
      </Typography>
    </Stack>,
  );
};

export default ActivateAccountPage;
