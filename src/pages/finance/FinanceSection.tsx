import React from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import Finance from '../church/Finance';
import { financeSections } from './financeNavigation';
export default function FinanceSection({ name }: {
    name: string;
}) {
    const section = financeSections.find(s => s.path === name)!;
    return <Stack spacing={3}><Box><Chip label={section.group} size="small" sx={{ mb: 1.5, fontSize: 11 }}/><Typography variant="h4" fontWeight={800} sx={{ letterSpacing: -1 }}>{section.title}</Typography><Typography color="text.secondary" sx={{ mt: 1, maxWidth: 750 }}>{section.description}</Typography></Box><Finance key={name} section={section.section}/></Stack>;
}
