import React from 'react';
import { IconButton, Tooltip, useTheme } from '@mui/material';
import { Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useColorMode } from '../contexts/ThemeContext';

interface ThemeToggleProps {
  glass?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ glass }) => {
  const { mode, toggleColorMode } = useColorMode();
  const theme = useTheme();

  return (
    <Tooltip title={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}>
      <IconButton
        onClick={toggleColorMode}
        sx={{
          bgcolor: glass 
            ? 'rgba(255, 255, 255, 0.1)' 
            : mode === 'light' ? '#ffffff' : '#1e293b',
          p: 1.2,
          borderRadius: 3,
          boxShadow: glass ? 'none' : '0 1px 2px 0 rgba(0,0,0,0.05)',
          border: glass ? '1px solid rgba(255, 255, 255, 0.2)' : 'none',
          color: glass ? 'white' : 'inherit',
          '&:hover': {
            bgcolor: glass 
              ? 'rgba(255, 255, 255, 0.2)' 
              : mode === 'light' ? '#f1f5f9' : '#334155',
            transform: 'translateY(-1px)',
          },
          transition: 'all 0.2s ease',
          overflow: 'hidden',
          width: 44,
          height: 44,
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={{ y: 20, opacity: 0, rotate: -45 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            exit={{ y: -20, opacity: 0, rotate: 45 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {mode === 'dark' ? (
              <Sun size={20} strokeWidth={2.5} />
            ) : (
              <Moon size={20} strokeWidth={2.5} color={theme.palette.text.secondary} />
            )}
          </motion.div>
        </AnimatePresence>
      </IconButton>
    </Tooltip>
  );
};
