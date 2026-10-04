import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { pathForRole } from './RoleLanding';
/** A live role change switches the portal, not just the sidebar badge. */
export default function RoleSyncRedirect() {
  const { user, currentContext } = useAuth();
  const navigate = useNavigate(), location = useLocation();
  const role = currentContext?.role || user?.role;
  const previous = useRef<{ id?: string; role?: string }>({});
  useEffect(() => {
    if (user?.id && previous.current.id === user.id && previous.current.role && previous.current.role !== role && !['/login', '/activate'].some(path => location.pathname.startsWith(path))) navigate(pathForRole(role), { replace: true });
    previous.current = { id: user?.id, role };
  }, [user?.id, role, navigate, location.pathname]);
  return null;
}
