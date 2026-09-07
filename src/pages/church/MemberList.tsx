import React, { useCallback, useEffect, useState } from 'react';
import { Box, Typography, Chip, Button, Avatar, Alert, Stack, Tooltip, IconButton, Snackbar } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import KeyIcon from '@mui/icons-material/VpnKey';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CrudTable, { CrudField } from '../../components/church/CrudTable';
import MemberImportModal from '../../components/church/MemberImportModal';
import useAuthedImage from '../../hooks/useAuthedImage';
import churchApi from '../../services/churchApi';
import usePortalProfile from '../../hooks/usePortalProfile';
import {
  MARITAL_STATUSES,
  EDUCATION_LEVELS,
  BLOOD_GROUPS,
  isPartnered,
} from '../../lib/memberProfile';

const statusOpts = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'visitor', label: 'Visitor' },
];
const genderOpts = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

const statusColor = (s: string): any =>
  s === 'inactive' ? 'error' : s === 'visitor' ? 'info' : 'success';

/**
 * Member photos live behind an authenticated endpoint, so they are fetched with
 * the auth client rather than set directly as an <img> source. The list only
 * requests a photo for members who actually have one (`hasPhoto`), and the
 * endpoint sends caching headers so re-renders do not refetch.
 */
const MemberAvatar: React.FC<{ row: any }> = ({ row }) => {
  const { url } = useAuthedImage(row?.hasPhoto ? `/church/members/${row.id}/photo` : null);
  return (
    <Avatar src={url || undefined} sx={{ width: 32, height: 32, fontSize: 14 }}>
      {(row?.firstName || '?').charAt(0).toUpperCase()}
    </Avatar>
  );
};

/**
 * Engagement is calculated from attendance (see Engagement & Follow-up), so it
 * is shown here read-only alongside the membership status a church sets itself.
 */
const engagementColor = (status: string): any => ({
  active: 'success',
  inactive: 'warning',
  backslider: 'error',
  new: 'info',
}[String(status).toLowerCase()] || 'default');

/**
 * Sends a member their portal login.
 *
 * Every member gets an account the moment they are registered, so this is for
 * the exceptions: a member registered without an email address, an invitation
 * that never arrived, or a forgotten password. Each click issues a NEW
 * temporary password, because the stored one is a hash that cannot be read
 * back — there is nothing to re-send, only something to replace.
 */
const PortalInviteButton: React.FC<{ row: any; onDone: (message: string) => void }> = ({ row, onDone }) => {
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const res = await churchApi.sendPortalInvite(row.id);
      onDone(res?.message || 'Portal login sent.');
    } catch (e: any) {
      onDone(e?.friendlyMessage || 'Could not send the portal login.');
    } finally {
      setBusy(false);
    }
  };

  const hasEmail = Boolean(row?.email);
  const label = !hasEmail
    ? 'Add an email address to this member first'
    : row?.portalUserUid
      ? 'Send a new portal password'
      : 'Create a portal login and send it';

  return (
    <Tooltip title={label}>
      <span>
        <IconButton size="small" onClick={send} disabled={busy || !hasEmail}>
          <KeyIcon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );
};

/**
 * Activates a member's portal account without waiting for them to click the
 * link in their email.
 *
 * Members are often registered at the church office by someone else, from an
 * address the member cannot check on the spot -- or one that was mistyped. The
 * church vouching for them directly is the fallback, and the record keeps track
 * of which of the two ways was used.
 */
const PortalActivateButton: React.FC<{ row: any; onDone: (message: string) => void; reload: () => void }> = ({ row, onDone, reload }) => {
  const [busy, setBusy] = useState(false);

  // Nothing to activate until a login exists.
  if (!row?.portalUserUid) return null;

  const active = (row.portalStatus || 'active') === 'active';

  const toggle = async () => {
    setBusy(true);
    try {
      const res = await churchApi.setMemberPortalActive(row.id, !active);
      onDone(res?.message || (active ? 'Portal access withdrawn.' : 'Portal account activated.'));
      reload();
    } catch (e: any) {
      onDone(e?.friendlyMessage || 'Could not change the portal account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tooltip title={active
      ? 'Withdraw this member\u2019s portal access'
      : 'Activate this account now, without waiting for the email link'}>
      <span>
        <IconButton size="small" onClick={toggle} disabled={busy} color={active ? 'default' : 'success'}>
          <CheckCircleIcon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );
};

export const MemberList: React.FC = () => {
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Which extra sections this church's members are registered with is decided
  // by its denomination, chosen by the superadmin at registration.
  const { profile } = usePortalProfile();
  const sections = profile.memberSections;
  const wants = (section: string) => sections.includes(section as any);

  // Lists the extended sections choose from. Loaded once, and only what the
  // denomination actually asks for.
  const [ministries, setMinistries] = useState<{ value: string; label: string }[]>([]);
  const [offices, setOffices] = useState<{ value: string; label: string }[]>([]);
  const [people, setPeople] = useState<{ value: string; label: string }[]>([]);
  // Groups are not tied to a denomination: every church divides its members up
  // somehow, so this list is loaded regardless of the sections in play.
  const [groups, setGroups] = useState<{ value: string; label: string }[]>([]);
  // Why the group list is empty, when the reason is something other than "this
  // church has no groups yet". Swallowing this silently makes an empty dropdown
  // indistinguishable from a failed request, which is impossible to diagnose.
  const [groupsError, setGroupsError] = useState<string | null>(null);

  /**
   * Loads the group dropdown.
   *
   * Groups are maintained on a different screen (Settings \u203a Groups), so this
   * list cannot be fetched only once on mount -- a group added a minute ago
   * would then be missing from the member form until the whole app was
   * reloaded. It is refreshed whenever:
   *   - the page mounts,
   *   - a group is created/edited/deleted anywhere in the app (churchApi fires
   *     the `epaclessia:groups-changed` event),
   *   - the tab regains focus (the admin came back from another tab), and
   *   - the Add/Edit Member dialog is opened.
   */
  const loadGroups = useCallback(async () => {
    try {
      const rows = await churchApi.getGroupOptions();
      const list = Array.isArray(rows) ? rows : [];
      setGroups(list);
      setGroupsError(null);
      return list;
    } catch (e: any) {
      // A church with no groups yet still has to be able to register members,
      // so this never blocks the form -- but the reason is reported instead of
      // being hidden behind an empty dropdown.
      const reason =
        e?.friendlyMessage || e?.response?.data?.error || 'the group list could not be loaded';
      console.error('Failed to load group options:', e);
      setGroupsError(reason);
      return [];
    }
  }, []);

  useEffect(() => {
    void loadGroups();

    const refresh = () => { void loadGroups(); };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };

    window.addEventListener('epaclessia:groups-changed', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('epaclessia:groups-changed', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadGroups]);

  /**
   * Refreshes the dropdown as the dialog opens, and makes sure the group the
   * member is already in is always one of the choices.
   *
   * A retired (inactive) group is not offered for new members, but a member who
   * is still in one must not have it silently blanked when an admin edits an
   * unrelated field.
   */
  const prepareGroupOptions = useCallback(async (row: any | null) => {
    const rows = await loadGroups();
    const currentId = row?.groupId ? String(row.groupId) : '';
    if (currentId && !rows.some((o: any) => String(o.value) === currentId)) {
      setGroups([
        ...rows,
        { value: currentId, label: `${row.groupName || 'Current group'} (inactive)` },
      ]);
    }
  }, [loadGroups]);

  useEffect(() => {
    if (!sections.length) return;
    let cancelled = false;

    (async () => {
      // Each list fails independently: a church with no ministries yet should
      // still be able to register a member.
      if (wants('ministries')) {
        try {
          const rows = await churchApi.getMinistries();
          if (!cancelled) {
            setMinistries(
              (rows || []).map((m: any) => ({ value: m.id, label: m.name || 'Untitled ministry' })),
            );
          }
        } catch { /* leave empty; the hint below explains why */ }
      }
      if (wants('office')) {
        try {
          const names = await churchApi.getOfficeOptions();
          if (!cancelled) {
            setOffices((names || []).map((n: string) => ({ value: n, label: n })));
          }
        } catch { /* leave empty */ }
      }
      if (wants('family')) {
        try {
          // Used to link a spouse or a child to their own member record.
          const rows = await churchApi.getMembers({ limit: 500 });
          if (!cancelled) {
            setPeople(
              (rows || []).map((m: any) => ({
                value: m.id,
                label: `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.membershipId || m.id,
              })),
            );
          }
        } catch { /* leave empty */ }
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections.join(',')]);

  /** The core member fields, which every denomination records. */
  const coreFields: CrudField[] = [
    {
      name: 'photo',
      label: 'Profile picture',
      type: 'image',
      imageVariant: 'avatar',
      imagePath: (row: any) => (row?.hasPhoto ? `/church/members/${row.id}/photo` : null),
    },
    { name: 'firstName', label: 'First name', required: true },
    { name: 'lastName', label: 'Last name', required: true },
    { name: 'email', label: 'Email' },
    { name: 'phone', label: 'Phone' },
    { name: 'gender', label: 'Gender', type: 'select', options: genderOpts },
    { name: 'dateOfBirth', label: 'Date of birth', type: 'date' },
    { name: 'occupation', label: 'Occupation' },
    { name: 'membershipStatus', label: 'Status', type: 'select', options: statusOpts, defaultValue: 'active' },
    { name: 'address', label: 'Address', type: 'textarea' },

    // The member's group. A single select, not a multi-select: a member belongs
    // to exactly one group, unlike ministries, which they may join several of.
    { name: 'sec_group', label: 'Group', type: 'section' },
    {
      name: 'groupId',
      label: 'Group',
      type: 'select',
      options: groups,
      helperText: groupsError
        ? `Groups could not be loaded: ${groupsError}`
        : groups.length
          ? 'A member belongs to one group only. Manage the list under Settings \u203a Groups.'
          : 'No groups yet \u2014 add them under Settings \u203a Groups and they will appear here.',
    },
  ];

  const extendedFields: CrudField[] = [];

  // 1. Assigned ministries. The options are the ministries the church admin
  //    created under Ministries & Groups, and a member can serve in several.
  if (wants('ministries')) {
    extendedFields.push(
      { name: 'sec_ministry', label: 'Ministry', type: 'section' },
      {
        name: 'ministryIds',
        label: 'Assigned ministries',
        type: 'multiselect',
        options: ministries,
        helperText: ministries.length
          ? 'A member can serve in more than one ministry.'
          : 'No ministries yet — create them under Ministries & Groups first.',
      },
    );
  }

  // 2. Office held, from the list the church spelt out in Settings > Offices.
  if (wants('office')) {
    extendedFields.push({
      name: 'office',
      label: 'Office held',
      type: 'autocomplete',
      options: offices,
      // Free text is allowed so registration is never blocked by a missing
      // office; the admin can tidy the list in Settings afterwards.
      freeSolo: true,
      helperText: offices.length
        ? 'Choose an office, or type one that is not on the list yet.'
        : 'No offices set up yet — add them under Settings › Offices.',
    });
  }

  // 3. Education. The details only appear once the member is marked as educated.
  if (wants('education')) {
    extendedFields.push(
      { name: 'sec_education', label: 'Education', type: 'section' },
      { name: 'isEducated', label: 'Has formal education', type: 'checkbox' },
      {
        name: 'education',
        label: 'Education details',
        type: 'list',
        itemLabel: 'School',
        showIf: (form: any) => !!form.isEducated,
        helperText: 'Add each school attended and the certificate earned.',
        itemFields: [
          { name: 'school', label: 'School attended' },
          { name: 'certificate', label: 'Certificate / qualification' },
          { name: 'level', label: 'Level', type: 'select', options: EDUCATION_LEVELS },
          { name: 'fieldOfStudy', label: 'Course / field of study' },
          { name: 'startYear', label: 'Start year', type: 'number' },
          { name: 'endYear', label: 'Year completed', type: 'number' },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
    );
  }

  // 4. Family: marital status, spouse (linked when they are also a member) and
  //    children (with dedication).
  if (wants('family')) {
    extendedFields.push(
      { name: 'sec_family', label: 'Family', type: 'section' },
      { name: 'maritalStatus', label: 'Marital status', type: 'select', options: MARITAL_STATUSES },
      {
        name: 'spouseMemberId',
        label: 'Spouse is a member of this church',
        type: 'select',
        options: [{ value: '', label: 'Not a member here' }, ...people],
        showIf: (form: any) => isPartnered(form.maritalStatus),
        helperText: 'Linking joins the two records, so the spouse\u2019s profile shows the marriage too.',
      },
      { name: 'spouseName', label: 'Spouse full name', showIf: (form: any) => isPartnered(form.maritalStatus) },
      { name: 'spousePhone', label: 'Spouse phone', showIf: (form: any) => isPartnered(form.maritalStatus) },
      { name: 'spouseEmail', label: 'Spouse email', showIf: (form: any) => isPartnered(form.maritalStatus) },
      { name: 'spouseOccupation', label: 'Spouse occupation', showIf: (form: any) => isPartnered(form.maritalStatus) },
      { name: 'spouseDateOfBirth', label: 'Spouse date of birth', type: 'date', showIf: (form: any) => isPartnered(form.maritalStatus) },
      { name: 'weddingDate', label: 'Wedding date', type: 'date', showIf: (form: any) => isPartnered(form.maritalStatus) },
      { name: 'spouseAddress', label: 'Spouse address', type: 'textarea', showIf: (form: any) => isPartnered(form.maritalStatus) },
      { name: 'spouseDetails', label: 'Other spouse details', type: 'textarea', showIf: (form: any) => isPartnered(form.maritalStatus) },
      { name: 'hasChildren', label: 'Has children', type: 'checkbox' },
      {
        name: 'children',
        label: 'Children',
        type: 'list',
        itemLabel: 'Child',
        showIf: (form: any) => !!form.hasChildren,
        helperText: 'Record each child, whether they have been dedicated, and link them if they are members here.',
        itemFields: [
          { name: 'name', label: 'Child\u2019s name' },
          { name: 'dateOfBirth', label: 'Date of birth', type: 'date' },
          { name: 'gender', label: 'Gender', type: 'select', options: genderOpts },
          { name: 'dedicated', label: 'Dedicated', type: 'checkbox' },
          {
            name: 'dedicationDate',
            label: 'Date of dedication',
            type: 'date',
            // Only asked for once the child is marked as dedicated.
            showIf: (child: any) => !!child.dedicated,
          },
          {
            name: 'memberId',
            label: 'Child is a member of this church',
            type: 'select',
            options: [{ value: '', label: 'Not a member here' }, ...people],
          },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
    );
  }

  // 5. Medical details, for pastoral care and emergencies.
  if (wants('medical')) {
    extendedFields.push(
      {
        name: 'sec_medical',
        label: 'Medical details',
        type: 'section',
        helperText: 'Kept for pastoral care and emergencies. Only fill in what the member has agreed to share.',
      },
      { name: 'medical.bloodGroup', label: 'Blood group', type: 'select', options: BLOOD_GROUPS },
      { name: 'medical.genotype', label: 'Genotype' },
      { name: 'medical.allergies', label: 'Allergies', type: 'textarea' },
      { name: 'medical.chronicConditions', label: 'Chronic conditions', type: 'textarea' },
      { name: 'medical.medications', label: 'Regular medication', type: 'textarea' },
      { name: 'medical.disabilities', label: 'Disabilities / special needs', type: 'textarea' },
      { name: 'medical.healthInsuranceProvider', label: 'Health insurance provider' },
      { name: 'medical.healthInsuranceNumber', label: 'Health insurance number' },
      { name: 'medical.emergencyContactName', label: 'Emergency contact name' },
      { name: 'medical.emergencyContactPhone', label: 'Emergency contact phone' },
      { name: 'medical.emergencyContactRelationship', label: 'Relationship to member' },
      { name: 'medical.notes', label: 'Other medical notes', type: 'textarea' },
    );
  }

  // Membership admin fields sit after the tradition's sections so the form
  // reads in a sensible order rather than ending on an ID box.
  const trailingFields: CrudField[] = [
    { name: 'sec_membership', label: 'Membership', type: 'section' },
    { name: 'anniversaryDate', label: 'Membership anniversary', type: 'date' },
    ...(wants('family') ? [] : [{ name: 'maritalStatus', label: 'Marital status', type: 'select' as const, options: MARITAL_STATUSES }]),
    { name: 'notes', label: 'Notes', type: 'textarea' },

    // Portal sign-in details. Optional: left blank, the member still gets an
    // account -- a username is derived from their name and a password is
    // generated -- so nobody has to invent credentials for every registration.
    { name: 'sec_portal', label: 'Portal access', type: 'section' },
    {
      name: 'username',
      label: 'Username',
      helperText: 'Letters, numbers, dots, dashes and underscores; 3\u201332 characters. Leave blank to have one created from the member\u2019s name.',
    },
    {
      name: 'password',
      label: 'Password',
      helperText: 'At least 8 characters. Leave blank to have one generated and emailed to the member.',
    },
    {
      name: 'activateNow',
      label: 'Activate immediately (skip email verification)',
      type: 'checkbox',
      helperText: 'Tick this only when you have confirmed the member\u2019s identity yourself. Otherwise they activate by clicking the link in their welcome email.',
    },
  ];

  const columns = [
    { key: 'photo', label: '', render: (r: any) => <MemberAvatar row={r} /> },
    { key: 'name', label: 'Name', render: (r: any) => `${r.firstName || ''} ${r.lastName || ''}`.trim() || '—' },
    { key: 'membershipId', label: 'Member ID' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    ...(wants('office') ? [{ key: 'office', label: 'Office' }] : []),
    {
      key: 'groupName',
      label: 'Group',
      render: (r: any) => r.groupName
        ? <Chip size="small" variant="outlined" label={r.groupName} />
        : '\u2014',
    },
    ...(wants('ministries')
      ? [{
          key: 'ministryIds',
          label: 'Ministries',
          render: (r: any) => {
            const names = (r.ministryIds || [])
              .map((id: string) => ministries.find(m => m.value === id)?.label)
              .filter(Boolean);
            return names.length ? names.join(', ') : '—';
          },
        }]
      : []),
    {
      // Whether this member can actually sign in. An admin needs to see at a
      // glance who was registered without an email and so has no login.
      key: 'portalUserUid',
      label: 'Portal',
      render: (r: any) => {
        if (!r.portalUserUid) {
          return r.email
            ? <Chip size="small" variant="outlined" label="Not sent" />
            : <Chip size="small" variant="outlined" color="warning" label="No email" />;
        }
        // An account exists but is unusable until it is activated, which is a
        // different situation from having no account at all.
        const status = r.portalStatus || 'active';
        if (status === 'pending') {
          return (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Chip size="small" color="warning" variant="outlined" label="Awaiting activation" />
              {r.portalUsername && <Chip size="small" variant="outlined" label={r.portalUsername} />}
            </Stack>
          );
        }
        if (status === 'suspended') {
          return <Chip size="small" color="error" variant="outlined" label="Suspended" />;
        }
        return (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Chip size="small" color="success" variant="outlined" label="Active" />
            {r.portalUsername && <Chip size="small" variant="outlined" label={r.portalUsername} />}
          </Stack>
        );
      },
    },
    {
      key: 'membershipStatus',
      label: 'Status',
      render: (r: any) => <Chip size="small" label={r.membershipStatus || 'active'} color={statusColor(r.membershipStatus || 'active')} sx={{ textTransform: 'capitalize' }} />,
    },
    {
      // Worked out from attendance, not typed by hand. Blank until the church
      // runs a recalculation from Engagement & Follow-up.
      key: 'engagementStatus',
      label: 'Engagement',
      render: (r: any) => r.engagementStatus
        ? <Chip size="small" label={r.engagementStatus} color={engagementColor(r.engagementStatus)} sx={{ textTransform: 'capitalize' }} />
        : '—',
    },
  ];

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>Member Management</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Register members, manage profiles, family grouping and membership IDs — all stored in your church database.
        Each member with an email address is given a member portal login as soon as they are registered.
        You can set their username and password yourself, or leave those blank to have them created
        automatically. New accounts stay pending until the member clicks the link in their welcome
        email \u2014 or until you activate them here.
      </Typography>

      {wants('ministries') && ministries.length === 0 && (
        <Stack sx={{ mb: 2 }}>
          <Alert severity="info">
            You have no ministries yet. Create them under <strong>Ministries &amp; Groups</strong> and they will
            appear here for members to be assigned to.
          </Alert>
        </Stack>
      )}

      <CrudTable
        idKey="id"
        columns={columns}
        fields={[...coreFields, ...extendedFields, ...trailingFields]}
        fetchRows={() => churchApi.getMembers()}
        createRow={churchApi.createMember}
        updateRow={churchApi.updateMember}
        deleteRow={churchApi.deleteMember}
        addLabel="Add Member"
        emptyText="No members yet. Click Add Member to register your first member."
        onDialogOpen={(row) => { void prepareGroupOptions(row); }}
        rowActions={(row, reload) => (
          <>
            <PortalInviteButton row={row} onDone={setNotice} />
            <PortalActivateButton row={row} onDone={setNotice} reload={reload} />
          </>
        )}
        toolbarActions={(reload) => (
          <>
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setImportOpen(true)}>
              Import from Excel
            </Button>
            <MemberImportModal
              open={importOpen}
              onClose={() => setImportOpen(false)}
              onImported={() => { void reload(); }}
            />
          </>
        )}
      />

      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={6000}
        onClose={() => setNotice(null)}
        message={notice || ''}
      />
    </Box>
  );
};

export default MemberList;
