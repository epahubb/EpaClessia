import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';

interface ColorModeContextType {
  toggleColorMode: () => void;
  mode: 'light' | 'dark';
}

const ColorModeContext = createContext<ColorModeContextType>({ 
  toggleColorMode: () => {}, 
  mode: 'light' 
});

export const useColorMode = () => useContext(ColorModeContext);

export const CustomThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<'light' | 'dark'>(() => {
    const savedMode = localStorage.getItem('theme_mode');
    return (savedMode as 'light' | 'dark') || 'light';
  });

  const colorMode = useMemo(
    () => ({
      toggleColorMode: () => {
        setMode((prevMode) => {
          const newMode = prevMode === 'light' ? 'dark' : 'light';
          localStorage.setItem('theme_mode', newMode);
          return newMode;
        });
      },
      mode,
    }),
    [mode]
  );

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: {
            main: '#1b4332', // Dark Green from image
            light: '#40916c',
            dark: '#081c15',
          },
          secondary: {
            main: '#52b788', // Lighter Green
          },
          background: {
            default: mode === 'light' ? '#f8fafc' : '#020617',
            paper: mode === 'light' ? '#ffffff' : '#0f172a',
          },
          text: {
            primary: mode === 'light' ? '#0f172a' : '#f8fafc',
            secondary: mode === 'light' ? '#64748b' : '#94a3b8',
          },
          divider: mode === 'light' ? '#f1f5f9' : '#1e293b',
        },
        typography: {
          fontFamily: '"Candara", "Calibri", "Segoe UI", "Inter", sans-serif',
          h1: { fontFamily: '"Candara", "Space Grotesk", sans-serif', fontWeight: 800 },
          h2: { fontFamily: '"Candara", "Space Grotesk", sans-serif', fontWeight: 800 },
          h3: { fontFamily: '"Candara", "Space Grotesk", sans-serif', fontWeight: 800 },
          h4: { fontFamily: '"Candara", "Space Grotesk", sans-serif', fontWeight: 800 },
          h5: { fontFamily: '"Candara", "Space Grotesk", sans-serif', fontWeight: 700 },
          h6: { fontFamily: '"Candara", "Space Grotesk", sans-serif', fontWeight: 700 },
          button: { textTransform: 'none', fontWeight: 600 },
        },
        shape: {
          borderRadius: 4,
        },
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              body: {
                transition: 'background-color 0.3s ease, color 0.3s ease',
                scrollbarColor: mode === 'dark' ? '#1e293b #020617' : '#e2e8f0 #f8fafc',
                '& *': {
                  transition: 'background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease',
                },
              },
            },
          },
          MuiButton: {
            styleOverrides: {
              root: {
                borderRadius: 10,
                padding: '10px 20px',
                fontWeight: 700,
                boxShadow: 'none',
                textTransform: 'none',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.15)',
                },
              },
            },
          },
          MuiPaper: {
            styleOverrides: {
              root: {
                backgroundImage: 'none',
                borderRadius: 16,
                boxShadow: mode === 'light' 
                  ? '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)'
                  : '0 4px 6px -1px rgb(0 0 0 / 0.2), 0 2px 4px -2px rgb(0 0 0 / 0.2)',
                border: `1px solid ${mode === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)'}`,
              },
            },
          },
          MuiCard: {
            styleOverrides: {
              root: {
                borderRadius: 16,
                boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
                border: '1px solid rgba(0, 0, 0, 0.05)',
              },
            },
          },
          MuiOutlinedInput: {
            styleOverrides: {
              root: {
                borderRadius: 10,
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: mode === 'light' ? '#e2e8f0' : '#334155',
                },
              },
            },
          },
          MuiAlert: {
            styleOverrides: {
              root: {
                borderRadius: 12,
              },
            },
          },
          MuiDialog: {
            styleOverrides: {
              paper: {
                borderRadius: 20,
                boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
              },
            },
          },
          MuiChip: {
            styleOverrides: {
              root: {
                borderRadius: 8,
                fontWeight: 700,
                fontSize: '0.75rem',
              },
            },
          },
          MuiTableCell: {
            styleOverrides: {
              root: {
                padding: '16px',
                borderColor: mode === 'light' ? '#f1f5f9' : '#334155',
              },
              head: {
                fontWeight: 700,
                backgroundColor: mode === 'light' ? '#f8fafc' : '#1e293b',
                color: mode === 'light' ? '#64748b' : '#94a3b8',
                textTransform: 'uppercase',
                fontSize: '0.75rem',
                letterSpacing: '0.05em',
              },
            },
          },
        },
      }),
    [mode]
  );

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
};
