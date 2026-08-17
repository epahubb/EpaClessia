import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Button, Card, CardContent, Grid, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, Select, FormControl, InputLabel, Snackbar, Alert,
  CircularProgress, Stack, LinearProgress,
} from '@mui/material';
import { Plus, CheckSquare, Clock, Flag } from 'lucide-react';
import { ministryLeaderService } from '../../services/ministryLeaderService';

interface MinistryOption {
  id: string;
  name: string;
}

interface MinistryTask {
  id: string;
  title: string;
  description?: string;
  assigneeName?: string;
  status: string; // todo | in_progress | done
  priority: string; // low | medium | high
  dueDate?: string;
}

const STATUS_META: Record<string, { label: string; color: any }> = {
  todo: { label: 'To do', color: 'default' },
  in_progress: { label: 'In progress', color: 'warning' },
  done: { label: 'Done', color: 'success' },
};

const PRIORITY_META: Record<string, { label: string; color: any }> = {
  low: { label: 'Low', color: 'info' },
  medium: { label: 'Medium', color: 'warning' },
  high: { label: 'High', color: 'error' },
};

const MinistryTasks: React.FC = () => {
  const [ministries, setMinistries] = useState<MinistryOption[]>([]);
  const [ministryId, setMinistryId] = useState<string>('');
  const [tasks, setTasks] = useState<MinistryTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    assigneeName: '',
    priority: 'medium',
    dueDate: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const list = await ministryLeaderService.getManagedMinistries();
        setMinistries(list || []);
        if (list && list.length > 0) setMinistryId(list[0].id);
        else setLoading(false);
      } catch {
        setToast({ msg: 'Failed to load ministries', sev: 'error' });
        setLoading(false);
      }
    })();
  }, []);

  const loadTasks = async (mid: string) => {
    if (!mid) return;
    setLoading(true);
    try {
      const data = await ministryLeaderService.getTasks(mid);
      setTasks(data || []);
    } catch {
      setToast({ msg: 'Failed to load tasks', sev: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ministryId) loadTasks(ministryId);
  }, [ministryId]);

  const handleCreate = async () => {
    if (!form.title.trim()) {
      setToast({ msg: 'Task title is required', sev: 'error' });
      return;
    }
    setSaving(true);
    try {
      await ministryLeaderService.createTask(ministryId, {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        assigneeName: form.assigneeName.trim() || undefined,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
      } as any);
      setToast({ msg: 'Task created', sev: 'success' });
      setDialogOpen(false);
      setForm({ title: '', description: '', assigneeName: '', priority: 'medium', dueDate: '' });
      loadTasks(ministryId);
    } catch {
      setToast({ msg: 'Failed to create task', sev: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (task: MinistryTask, status: string) => {
    try {
      await ministryLeaderService.updateTask(task.id, { status } as any);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)));
    } catch {
      setToast({ msg: 'Failed to update task', sev: 'error' });
    }
  };

  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const completionRate = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-1px' }}>Tasks</Typography>
          <Typography variant="body1" color="text.secondary">Plan and track ministry work</Typography>
        </Box>
        <Stack direction="row" spacing={2} alignItems="center">
          {ministries.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Ministry</InputLabel>
              <Select value={ministryId} label="Ministry" onChange={(e) => setMinistryId(e.target.value)}>
                {ministries.map((m) => (
                  <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <Button variant="contained" startIcon={<Plus size={18} />} sx={{ borderRadius: 2 }}
            disabled={!ministryId} onClick={() => setDialogOpen(true)}>New task</Button>
        </Stack>
      </Box>

      {ministries.length === 0 && !loading && (
        <Paper sx={{ p: 4, borderRadius: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">You are not leading any ministries yet. Ask a church admin to assign you as a ministry leader.</Typography>
        </Paper>
      )}

      {ministryId && (
        <>
          <Paper sx={{ p: 3, borderRadius: 4, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" fontWeight={700}>Completion</Typography>
              <Typography variant="body2" fontWeight={700}>{completionRate}% ({doneCount}/{tasks.length})</Typography>
            </Box>
            <LinearProgress variant="determinate" value={completionRate} sx={{ height: 8, borderRadius: 4 }} />
          </Paper>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>
          ) : tasks.length === 0 ? (
            <Paper sx={{ p: 4, borderRadius: 4, textAlign: 'center' }}>
              <CheckSquare size={32} style={{ opacity: 0.3 }} />
              <Typography color="text.secondary" sx={{ mt: 1 }}>No tasks yet. Create the first one.</Typography>
            </Paper>
          ) : (
            <Grid container spacing={2}>
              {tasks.map((task) => {
                const sMeta = STATUS_META[task.status] || STATUS_META.todo;
                const pMeta = PRIORITY_META[task.priority] || PRIORITY_META.medium;
                return (
                  <Grid size={{ xs: 12, md: 6 }} key={task.id}>
                    <Card sx={{ borderRadius: 3, height: '100%' }}>
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                          <Typography fontWeight={700}>{task.title}</Typography>
                          <Chip size="small" icon={<Flag size={12} />} label={pMeta.label} color={pMeta.color} variant="outlined" />
                        </Box>
                        {task.description && (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{task.description}</Typography>
                        )}
                        <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Chip size="small" label={sMeta.label} color={sMeta.color} />
                          {task.assigneeName && <Chip size="small" variant="outlined" label={task.assigneeName} />}
                          {task.dueDate && (
                            <Chip size="small" variant="outlined" icon={<Clock size={12} />}
                              label={new Date(task.dueDate).toLocaleDateString()} />
                          )}
                        </Stack>
                        <FormControl size="small" fullWidth sx={{ mt: 2 }}>
                          <Select value={task.status} onChange={(e) => changeStatus(task, e.target.value)}>
                            <MenuItem value="todo">To do</MenuItem>
                            <MenuItem value="in_progress">In progress</MenuItem>
                            <MenuItem value="done">Done</MenuItem>
                          </Select>
                        </FormControl>
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>New task</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Title" fullWidth required value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <TextField label="Description" fullWidth multiline rows={3} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <TextField label="Assignee" fullWidth value={form.assigneeName}
              onChange={(e) => setForm({ ...form, assigneeName: e.target.value })} />
            <FormControl fullWidth>
              <InputLabel>Priority</InputLabel>
              <Select value={form.priority} label="Priority"
                onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <MenuItem value="low">Low</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="high">High</MenuItem>
              </Select>
            </FormControl>
            <TextField label="Due date" type="date" fullWidth InputLabelProps={{ shrink: true }}
              value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving}>
            {saving ? 'Saving...' : 'Create task'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? <Alert severity={toast.sev} onClose={() => setToast(null)}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
};

export default MinistryTasks;
