from rest_framework import permissions

class IsChurchAdmin(permissions.BasePermission):
    """
    Custom permission to only allow church administrators of the current tenant.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Assume request.tenant is set by a middleware
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return False
            
        return request.user.usertenantrole_set.filter(
            tenant=tenant, 
            role='CHURCH_ADMIN'
        ).exists()
