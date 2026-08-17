import React from 'react';
import { Box, Paper, Typography, Chip, Stack } from '@mui/material';
import { Sparkles } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  description?: string;
  /** Optional bullet list of the planned capabilities for this screen. */
  features?: string[];
}

/**
 * A polished, on-brand placeholder used while a portal screen is being built
 * out. It keeps every navigation link functional (no dead 404s) and previews
 * the capabilities planned for the screen so the roadmap is visible in-product.
 */
const ComingSoon: React.FC<ComingSoonProps> = ({ title, description, features }) => {
  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 3, md: 5 },
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          background: (t) =>
            t.palette.mode === 'dark'
              ? 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(16,185,129,0.08))'
              : 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(16,185,129,0.05))',
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
            }}
          >
            <Sparkles size={22} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700}>
              {title}
            </Typography>
            <Chip label="In development" size="small" color="primary" variant="outlined" sx={{ mt: 0.5 }} />
          </Box>
        </Stack>

        <Typography color="text.secondary" sx={{ maxWidth: 640, mb: features?.length ? 3 : 0 }}>
          {description ||
            'This screen is part of the platform roadmap and is being built out. The navigation, layout, and access controls are already in place.'}
        </Typography>

        {features && features.length > 0 && (
          <Box>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              Planned capabilities
            </Typography>
            <Stack component="ul" sx={{ pl: 2.5, m: 0 }} spacing={0.5}>
              {features.map((f) => (
                <Typography key={f} component="li" color="text.secondary" variant="body2">
                  {f}
                </Typography>
              ))}
            </Stack>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default ComingSoon;
