import React, { useState } from 'react';
import {
  Alert, Avatar, Box, Chip, CircularProgress, Dialog, DialogContent, DialogTitle,
  Divider, IconButton, Paper, Stack, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';
import useAuthedImage from '../../hooks/useAuthedImage';
import churchApi from '../../services/churchApi';

type Props = { row: any };
const text = (value: unknown): string => value === null || value === undefined || value === '' ? '—' : String(value);
const money = (value: unknown): string => new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(Number(value) || 0);
const date = (value: unknown): string => {
  if (!value) return '—';
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString();
};
const nameOf = (person: any): string => person
  ? `${person.firstName || ''} ${person.lastName || ''}`.trim() || person.name || 'Unnamed member'
  : '—';

const Detail: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <Box>
    <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{value || '—'}</Typography>
  </Box>
);
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Paper variant="outlined" sx={{ p: 2 }}>
    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>{title}</Typography>
    {children}
  </Paper>
);
const PersonChip: React.FC<{ person: any; suffix?: string }> = ({ person, suffix }) => (
  <Chip
    variant="outlined"
    label={`${nameOf(person)}${suffix ? ` · ${suffix}` : ''}`}
    title={[person?.membershipId, person?.phone, person?.email].filter(Boolean).join(' · ')}
  />
);

const DetailsBody: React.FC<{ data: any }> = ({ data }) => {
  const member = data.member || {};
  const c = data.connections || {};
  const { url: photoUrl } = useAuthedImage(member.hasPhoto ? `/church/members/${member.id}/photo` : null);
  const declaredChildren = Array.isArray(member.children) ? member.children : [];
  const education = Array.isArray(member.education) ? member.education : [];
  const medical = member.medical || {};
  const hasMedical = Object.values(medical).some(Boolean);

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
        <Avatar src={photoUrl || undefined} sx={{ width: 76, height: 76, fontSize: 30 }}>
          {(member.firstName || '?').charAt(0).toUpperCase()}
        </Avatar>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={750}>{nameOf(member)}</Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
            <Chip size="small" color="primary" variant="outlined" label={member.membershipId || 'No member ID'} />
            <Chip size="small" label={member.membershipStatus || 'active'} sx={{ textTransform: 'capitalize' }} />
            {member.engagementStatus && <Chip size="small" variant="outlined" label={`Engagement: ${member.engagementStatus}`} />}
          </Stack>
        </Box>
      </Stack>

      <Section title="Personal and membership details">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
          <Detail label="Email" value={text(member.email)} />
          <Detail label="Phone" value={text(member.phone)} />
          <Detail label="Address" value={text(member.address)} />
          <Detail label="Gender" value={text(member.gender)} />
          <Detail label="Date of birth" value={date(member.dateOfBirth)} />
          <Detail label="Occupation" value={text(member.occupation)} />
          <Detail label="Join date" value={date(member.joinDate)} />
          <Detail label="Membership anniversary" value={date(member.anniversaryDate)} />
          <Detail label="Marital status" value={text(member.maritalStatus)} />
          <Detail label="Office held" value={text(member.office)} />
          <Detail label="Portal username" value={text(member.portalUsername)} />
          <Detail label="Portal status" value={text(member.portalStatus)} />
        </Box>
        {member.notes && <><Divider sx={{ my: 1.5 }} /><Detail label="Notes" value={member.notes} /></>}
      </Section>

      <Section title="Family connections">
        <Stack spacing={2}>
          <Box>
            <Typography variant="body2" fontWeight={700} sx={{ mb: 0.75 }}>Spouse</Typography>
            {c.spouse ? <PersonChip person={c.spouse} suffix="linked member" /> : member.spouseName ? (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
                <Detail label="Name" value={member.spouseName} />
                <Detail label="Phone" value={text(member.spousePhone)} />
                <Detail label="Email" value={text(member.spouseEmail)} />
                <Detail label="Occupation" value={text(member.spouseOccupation)} />
                <Detail label="Date of birth" value={date(member.spouseDateOfBirth)} />
                <Detail label="Wedding date" value={date(member.weddingDate)} />
              </Box>
            ) : <Typography variant="body2" color="text.secondary">No spouse recorded.</Typography>}
          </Box>
          <Divider />
          <Box>
            <Typography variant="body2" fontWeight={700}>Household / family</Typography>
            <Typography variant="caption" color="text.secondary">
              {c.family?.name || 'No household record'}{c.family?.address ? ` · ${c.family.address}` : ''}
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              {(c.familyMembers || []).filter((p: any) => p.id !== member.id).map((p: any) => <PersonChip key={p.id} person={p} />)}
              {(!c.familyMembers || c.familyMembers.filter((p: any) => p.id !== member.id).length === 0) && (
                <Typography variant="body2" color="text.secondary">No other household members linked.</Typography>
              )}
            </Stack>
          </Box>
          <Divider />
          <Box>
            <Typography variant="body2" fontWeight={700} sx={{ mb: 0.75 }}>Parent and children</Typography>
            {c.parent && <Box sx={{ mb: 1 }}><PersonChip person={c.parent} suffix="parent" /></Box>}
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {(c.children || []).map((p: any) => <PersonChip key={p.id} person={p} suffix="child" />)}
              {declaredChildren.map((child: any, index: number) => (
                <Chip key={`${child.memberId || child.name || 'child'}-${index}`} variant="outlined"
                  label={`${child.name || 'Unnamed child'}${child.memberId ? ' · linked member' : ''}${child.dedicated ? ' · dedicated' : ''}`} />
              ))}
              {!c.parent && !(c.children || []).length && !declaredChildren.length && (
                <Typography variant="body2" color="text.secondary">No parent or children linked.</Typography>
              )}
            </Stack>
          </Box>
        </Stack>
      </Section>

      <Section title="Church associations">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          <Detail label="Branch" value={c.branch ? `${c.branch.name}${c.branch.location ? ` · ${c.branch.location}` : ''}` : '—'} />
          <Detail label="Group" value={c.group ? `${c.group.name}${c.group.leaderName ? ` · led by ${c.group.leaderName}` : ''}` : member.groupName || '—'} />
        </Box>
        <Typography variant="body2" fontWeight={700} sx={{ mt: 2, mb: 0.75 }}>Ministries and departments</Typography>
        <Stack spacing={1}>
          {(c.ministries || []).map((ministry: any) => (
            <Paper key={ministry.assignmentId || ministry.ministryId} variant="outlined" sx={{ p: 1.25 }}>
              <Typography variant="body2" fontWeight={650}>{ministry.name || 'Unknown ministry'}</Typography>
              <Typography variant="caption" color="text.secondary">
                {[ministry.type, ministry.role, ministry.status, ministry.leaderName && `Leader: ${ministry.leaderName}`,
                  ministry.meetingDay && `Meets: ${ministry.meetingDay} ${ministry.meetingTime || ''}`.trim()]
                  .filter(Boolean).join(' · ') || 'No assignment details'}
              </Typography>
            </Paper>
          ))}
          {!(c.ministries || []).length && <Typography variant="body2" color="text.secondary">No ministry assignments.</Typography>}
        </Stack>
        <Typography variant="body2" fontWeight={700} sx={{ mt: 2, mb: 0.75 }}>Positions and roles</Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {(c.positions || []).map((position: any) => (
            <Chip key={position.assignmentId} color={position.active ? 'primary' : 'default'} variant="outlined"
              label={`${position.name || 'Unknown position'}${position.ministryName ? ` · ${position.ministryName}` : ''}${position.active ? '' : ' · ended'}`}
              title={[position.category, position.startDate && `From ${date(position.startDate)}`, position.endDate && `To ${date(position.endDate)}`].filter(Boolean).join(' · ')} />
          ))}
          {!(c.positions || []).length && <Typography variant="body2" color="text.secondary">No position assignments.</Typography>}
        </Stack>
      </Section>

      <Section title="Financial records">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, minmax(0, 1fr))' }, gap: 1.5, mb: 2 }}>
          <Detail label="Total giving" value={money(c.financial?.summary?.givingTotal)} />
          <Detail label="Total pledged" value={money(c.financial?.summary?.pledgedTotal)} />
          <Detail label="Pledges paid" value={money(c.financial?.summary?.pledgePaid)} />
          <Detail label="Pledges outstanding" value={money(c.financial?.summary?.pledgeOutstanding)} />
          <Detail label="Dues paid" value={money(c.financial?.summary?.duesPaid)} />
        </Box>
        <Divider sx={{ mb: 1.5 }} />
        <Typography variant="body2" fontWeight={700} sx={{ mb: 0.75 }}>Giving history</Typography>
        <Stack spacing={0.75}>
          {(c.financial?.donations || []).map((gift: any) => (
            <Box key={gift.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
              <Typography variant="body2">{date(gift.createdAt)} · {gift.purpose || 'General'} · {gift.status || 'completed'}</Typography>
              <Typography variant="body2" fontWeight={700}>{money(gift.amount)}</Typography>
            </Box>
          ))}
          {!(c.financial?.donations || []).length && <Typography variant="body2" color="text.secondary">No giving records.</Typography>}
        </Stack>
        <Typography variant="body2" fontWeight={700} sx={{ mt: 2, mb: 0.75 }}>Pledges</Typography>
        <Stack spacing={0.75}>
          {(c.financial?.pledges || []).map((pledge: any) => (
            <Box key={pledge.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
              <Typography variant="body2">{pledge.purpose || 'General'} · due {date(pledge.dueDate)} · {pledge.status || 'active'}</Typography>
              <Typography variant="body2" fontWeight={700}>{money(pledge.amountPaid)} / {money(pledge.amountPledged)}</Typography>
            </Box>
          ))}
          {!(c.financial?.pledges || []).length && <Typography variant="body2" color="text.secondary">No pledges.</Typography>}
        </Stack>
        <Typography variant="body2" fontWeight={700} sx={{ mt: 2, mb: 0.75 }}>Dues</Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {(c.financial?.duesSchedules || []).filter((due: any) => due.active).map((due: any) => (
            <Chip key={due.id} variant="outlined" label={`${due.name}: ${money(due.amount)} · ${String(due.frequency || 'monthly').replace('_', ' ')}`} />
          ))}
          {!(c.financial?.duesSchedules || []).some((due: any) => due.active) && <Typography variant="body2" color="text.secondary">No active dues schedules.</Typography>}
        </Stack>
        {(c.financial?.duesPayments || []).length > 0 && (
          <Stack spacing={0.75} sx={{ mt: 1.5 }}>
            {(c.financial.duesPayments || []).map((payment: any) => (
              <Box key={payment.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                <Typography variant="body2">Paid {date(payment.paidAt)} · {payment.paymentMethod || 'payment'} · {payment.status}</Typography>
                <Typography variant="body2" fontWeight={700}>{money(payment.amount)}</Typography>
              </Box>
            ))}
          </Stack>
        )}
      </Section>

      {(education.length > 0 || hasMedical) && (
        <Section title="Other recorded details">
          {education.length > 0 && (
            <Box sx={{ mb: hasMedical ? 2 : 0 }}>
              <Typography variant="body2" fontWeight={700} sx={{ mb: 0.75 }}>Education</Typography>
              {education.map((entry: any, index: number) => (
                <Typography key={index} variant="body2">{[entry.school, entry.certificate, entry.fieldOfStudy, entry.endYear].filter(Boolean).join(' · ') || 'Education entry'}</Typography>
              ))}
            </Box>
          )}
          {hasMedical && (
            <Box>
              <Typography variant="body2" fontWeight={700} sx={{ mb: 0.75 }}>Medical and emergency information</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
                <Detail label="Blood group / genotype" value={[medical.bloodGroup, medical.genotype].filter(Boolean).join(' · ') || '—'} />
                <Detail label="Allergies" value={text(medical.allergies)} />
                <Detail label="Chronic conditions" value={text(medical.chronicConditions)} />
                <Detail label="Regular medication" value={text(medical.medications)} />
                <Detail label="Emergency contact" value={[medical.emergencyContactName, medical.emergencyContactRelationship, medical.emergencyContactPhone].filter(Boolean).join(' · ') || '—'} />
              </Box>
            </Box>
          )}
        </Section>
      )}
    </Stack>
  );
};

const MemberDetailsDialog: React.FC<Props> = ({ row }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const show = async () => {
    setOpen(true); setLoading(true); setError(null);
    try { setData(await churchApi.getMemberDetails(row.id)); }
    catch (e: any) { setError(e?.friendlyMessage || e?.response?.data?.error || 'Could not load this member’s details.'); }
    finally { setLoading(false); }
  };
  return (
    <>
      <Tooltip title="View member details"><IconButton size="small" onClick={show}><VisibilityIcon fontSize="small" /></IconButton></Tooltip>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ pr: 6 }}>Member details
          <IconButton onClick={() => setOpen(false)} sx={{ position: 'absolute', right: 12, top: 12 }} aria-label="Close"><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: 'background.default' }}>
          {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>}
          {!loading && error && <Alert severity="error">{error}</Alert>}
          {!loading && !error && data && <DetailsBody data={data} />}
        </DialogContent>
      </Dialog>
    </>
  );
};
export default MemberDetailsDialog;
