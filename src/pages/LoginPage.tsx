import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, TextField, Button,
  InputAdornment, IconButton, Alert, Container
} from '@mui/material';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, KeyRound } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useColorMode } from '../contexts/ThemeContext';
import { useBranding } from '../contexts/BrandingContext';
import { ThemeToggle } from '../components/ThemeToggle';

const FALLBACK_BG = 'https://images.unsplash.com/photo-1544427928-c49cdfebf49c?auto=format&fit=crop&q=80&w=1920';

const LoginPage: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading } = useAuth();
  const { mode } = useColorMode();
  const { branding } = useBranding();
  const from = (location.state as any)?.from?.pathname || "/super-admin";

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, twoFactorCode: twoFactorCode || undefined }),
      });

      const data = await response.json();

      // Server asks for a 2FA code before issuing a token.
      if (response.ok && data.requires2FA) {
        setRequires2FA(true);
        setLoading(false);
        setError('');
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Login failed');
      }

      await login(data.token, data.user, data.refreshToken);
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Super-admin-uploaded login background (falls back to a default image).
  const bgUrl = branding.loginBackground || FALLBACK_BG;
  const overlay = mode === 'light'
    ? 'linear-gradient(rgba(6, 78, 59, 0.7), rgba(2, 6, 23, 0.85))'
    : 'linear-gradient(rgba(2, 44, 34, 0.9), rgba(2, 6, 23, 0.95))';

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage: `${overlay}, url('${bgUrl}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}
    >
      <Container maxWidth="sm">
        <Box sx={{ position: 'absolute', top: 20, right: 20 }}>
          <ThemeToggle glass />
        </Box>
        <Paper
          sx={{
            p: 5,
            boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5)',
            borderRadius: 4,
            backgroundColor: mode === 'light' ? 'rgba(255, 255, 255, 0.92)' : 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(12px)',
            border: mode === 'light' ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)'
          }}
        >
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            {branding.logoUrl ? (
              <Box
                component="img"
                src={branding.logoUrl}
                alt={branding.platformName}
                sx={{ height: 56, mb: 2, objectFit: 'contain' }}
              />
            ) : (
              <Box sx={{ display: 'inline-flex', bgcolor: 'primary.main', p: 1.5, borderRadius: 2, mb: 2 }}>
                <ShieldCheck size={32} color="white" />
              </Box>
            )}
            <Typography variant="h4" fontWeight={800} gutterBottom>{branding.platformName || 'EpaChurch'}</Typography>
            <Typography variant="body1" color="text.secondary">
              {requires2FA ? 'Two-Factor Verification' : 'Portal Login'}
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

          <form onSubmit={handleSubmit}>
            {!requires2FA ? (
              <>
                <TextField
                  fullWidth
                  label="Email Address"
                  variant="outlined"
                  margin="normal"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start"><Mail size={20} color="#94a3b8" /></InputAdornment>
                    ),
                  }}
                />
                <TextField
                  fullWidth
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  variant="outlined"
                  margin="normal"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start"><Lock size={20} color="#94a3b8" /></InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                          {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </>
            ) : (
              <TextField
                fullWidth
                autoFocus
                label="6-digit authentication code"
                variant="outlined"
                margin="normal"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputProps={{ inputMode: 'numeric', maxLength: 6, style: { letterSpacing: '0.4em', fontWeight: 700 } }}
                helperText="Enter the code from your authenticator app"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start"><KeyRound size={20} color="#94a3b8" /></InputAdornment>
                  ),
                }}
              />
            )}
            <Button
              fullWidth
              type="submit"
              variant="contained"
              size="large"
              disabled={loading || (requires2FA && twoFactorCode.length < 6)}
              sx={{ mt: 4, py: 1.5, borderRadius: 2, fontWeight: 700 }}
            >
              {loading ? 'Signing In\u2026' : requires2FA ? 'Verify & Sign In' : 'Sign In to Platform'}
            </Button>
            {requires2FA && (
              <Button
                fullWidth
                variant="text"
                onClick={() => { setRequires2FA(false); setTwoFactorCode(''); setError(''); }}
                sx={{ mt: 1.5, textTransform: 'none' }}
              >
                Back to login
              </Button>
            )}
          </form>
        </Paper>
      </Container>
    </Box>
  );
};

export default LoginPage;
