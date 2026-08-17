# Backend Integration Guide: Multi-Tenant Church ERP

This guide describes the backend changes required to support the unified multi-tenant architecture.

## 1. Models (`core/models.py`)

```python
from django.contrib.auth.models import AbstractUser
from django.db import models

class Tenant(models.Model):
    name = models.CharField(max_length=255)
    subdomain = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

class User(AbstractUser):
    # Standard Django user fields (email, password, etc.)
    pass

class UserTenantRole(models.Model):
    ROLE_CHOICES = [
        ('SUPER_ADMIN', 'Super Admin'),
        ('CHURCH_ADMIN', 'Church Admin'),
        ('PASTOR', 'Pastor'),
        ('MINISTRY_LEADER', 'Ministry Leader'),
        ('MEMBER', 'Member'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tenant_roles')
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='user_roles', null=True, blank=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    ministry = models.ForeignKey('Ministry', on_delete=models.SET_NULL, null=True, blank=True)
    
    class Meta:
        unique_together = ('user', 'tenant', 'role', 'ministry')
```

## 2. Authentication View (`api/views/auth.py`)

```python
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

class UnifiedTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        # Add custom claims
        token['email'] = user.email
        token['name'] = f"{user.first_name} {user.last_name}"
        
        # Fetch all roles across all tenants
        roles = []
        tenant_roles = user.tenant_roles.all()
        for tr in tenant_roles:
            roles.append({
                'tenantId': str(tr.tenant.id) if tr.tenant else 'global',
                'tenantName': tr.tenant.name if tr.tenant else 'Platform',
                'role': tr.role,
                'ministryId': str(tr.ministry.id) if tr.ministry else None
            })
        
        token['roles'] = roles
        return token

class UnifiedTokenObtainPairView(TokenObtainPairView):
    serializer_class = UnifiedTokenObtainPairSerializer
```

## 3. Permission Classes (`core/permissions.py`)

```python
from rest_framework import permissions

class DynamicTenantRolePermission(permissions.BasePermission):
    """
    Checks if the user has the required role for the tenant specified in the X-Tenant-ID header.
    """
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
            
        # Super Admins bypass tenant checks for global endpoints
        if request.user.tenant_roles.filter(role='SUPER_ADMIN').exists():
            return True
            
        tenant_id = request.headers.get('X-Tenant-ID')
        user_role = request.headers.get('X-User-Role')
        
        if not tenant_id or not user_role:
            return False
            
        # Verify the user actually has this role in this tenant
        return request.user.tenant_roles.filter(
            tenant_id=tenant_id,
            role=user_role
        ).exists()

class IsMinistryLeader(permissions.BasePermission):
    def has_permission(self, request, view):
        tenant_id = request.headers.get('X-Tenant-ID')
        ministry_id = request.headers.get('X-Ministry-ID')
        
        return request.user.tenant_roles.filter(
            tenant_id=tenant_id,
            role='MINISTRY_LEADER',
            ministry_id=ministry_id
        ).exists()
```

## 4. Tenant Filtering Middleware (`core/middleware.py`)

```python
class TenantMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Extract tenant from header
        tenant_id = request.headers.get('X-Tenant-ID')
        if tenant_id and tenant_id != 'global':
            request.tenant_id = tenant_id
        else:
            request.tenant_id = None
            
        response = self.get_response(request)
        return response
```

## 5. Base ViewSet (`core/viewsets.py`)

```python
from rest_framework import viewsets

class TenantScopedViewSet(viewsets.ModelViewSet):
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # If user is Super Admin and no tenant header, return all
        if self.request.user.tenant_roles.filter(role='SUPER_ADMIN').exists() and not self.request.tenant_id:
            return queryset
            
        # Otherwise, filter by the tenant ID in the request
        if self.request.tenant_id:
            return queryset.filter(tenant_id=self.request.tenant_id)
            
        return queryset.none()
```

## Summary of Integration

1.  **Context Flow**: The frontend decodes the JWT to find all available `(tenant, role)` pairs.
2.  **Request Scoping**: Every API call includes `X-Tenant-ID` and `X-User-Role`.
3.  **Backend Enforcement**: The `DynamicTenantRolePermission` ensures the user isn't spoofing their role for a tenant they don't belong to.
4.  **Data Isolation**: `TenantScopedViewSet` ensures that even if a user is authenticated, they only see data for the church they are currently "logged into" via the context switcher.
5.  **Consistency**: Since all portals share the same database, an update in the Admin portal (e.g., adding a member) is immediately reflected in the Member portal because they both query the same `Member` table, just with different filters and permissions.
