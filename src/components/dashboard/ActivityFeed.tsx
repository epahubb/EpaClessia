import React from 'react';
import { 
  Box, Typography, List, ListItem, 
  ListItemText, Skeleton, Divider, Button 
} from '@mui/material';
import { Activity as ActivityIcon, ArrowRight } from 'lucide-react';
import { Activity } from '../../types';

interface ActivityFeedProps {
  activities: Activity[] | undefined;
  loading: boolean;
}

const ActivityFeed: React.FC<ActivityFeedProps> = ({ activities, loading }) => {
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6" fontWeight={700}>Recent Activities</Typography>
      </Box>
      <List disablePadding sx={{ flexGrow: 1 }}>
        {loading ? (
          [1, 2, 3, 4, 5, 6].map(i => (
            <ListItem key={i} sx={{ px: 0, py: 1.5, alignItems: 'flex-start' }}>
              <Skeleton variant="rectangular" width={28} height={28} sx={{ borderRadius: 1.5, mr: 2 }} />
              <Box sx={{ flexGrow: 1 }}>
                <Skeleton variant="text" width="80%" />
                <Skeleton variant="text" width="40%" />
              </Box>
            </ListItem>
          ))
        ) : (
          activities?.map((activity, index) => (
            <React.Fragment key={activity.id}>
              <ListItem sx={{ px: 0, py: 1.5, alignItems: 'flex-start' }}>
                <Box sx={{ mr: 2, mt: 0.5, p: 0.75, borderRadius: 1.5, bgcolor: 'action.hover' }}>
                  <ActivityIcon size={14} color="#64748b" />
                </Box>
                <ListItemText 
                  primary={
                    <Typography variant="body2" fontWeight={500} sx={{ lineHeight: 1.4 }}>
                      <Box component="span" fontWeight={700}>{activity.userName}</Box> {activity.action}
                    </Typography>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      {new Date(activity.timestamp).toLocaleString([], { 
                        month: 'short', 
                        day: 'numeric', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </Typography>
                  }
                />
              </ListItem>
              {index < activities.length - 1 && <Divider component="li" sx={{ opacity: 0.5 }} />}
            </React.Fragment>
          ))
        )}
      </List>
      <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button 
          fullWidth 
          variant="text" 
          size="small" 
          endIcon={<ArrowRight size={16} />}
          sx={{ fontWeight: 700, color: 'text.secondary' }}
        >
          View All Activities
        </Button>
      </Box>
    </Box>
  );
};

export default ActivityFeed;
