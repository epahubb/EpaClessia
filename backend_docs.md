# Backend API Documentation (Django + DRF)

## Authentication
- **Endpoint**: `/api/v1/auth/login/`
- **Method**: `POST`
- **Payload**: `{ "email": "...", "password": "..." }`
- **Response**: `{ "access": "...", "refresh": "..." }`

## Super Admin Dashboard
- **Endpoint**: `/api/v1/superadmin/dashboard-summary/`
- **Method**: `GET`
- **Permission**: `IsSuperAdmin`
- **Response**:
```json
{
  "totalChurches": 48,
  "totalMembers": 12500,
  "activeUsers30d": 3400,
  "platformRevenue": 125430.50,
  "activeSubscriptions": 42,
  "expiringSubscriptions": 5,
  "recentRegistrations": [...],
  "systemHealth": { "db": "green", "storage": "green", "api": "green" },
  "recentActivities": [...]
}
```

## Church Management
- **List**: `GET /api/v1/superadmin/churches/`
- **Create**: `POST /api/v1/superadmin/churches/`
- **Detail**: `GET /api/v1/superadmin/churches/{id}/`
- **Update**: `PATCH /api/v1/superadmin/churches/{id}/`
- **Delete**: `DELETE /api/v1/superadmin/churches/{id}/` (Soft delete recommended)

## Sample Django Viewset (Tenant)

```python
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from .models import Tenant
from .serializers import TenantSerializer

class IsSuperAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'SUPER_ADMIN'

class TenantViewSet(viewsets.ModelViewSet):
    queryset = Tenant.objects.all()
    serializer_class = TenantSerializer
    permission_classes = [IsSuperAdmin]

    def create(self, request, *args, **kwargs):
        # Custom logic to initialize church admin and subdomain
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tenant = serializer.save()
        
        # Trigger background task to provision resources
        # provision_tenant_resources.delay(tenant.id)
        
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        # Soft delete implementation
        instance = self.get_object()
        instance.status = 'deleted'
        instance.save()
        return Response(status=status.HTTP_204_NO_CONTENT)
```

## Sample Django Viewset (Subscription)

```python
class SubscriptionViewSet(viewsets.ModelViewSet):
    queryset = Subscription.objects.all()
    serializer_class = SubscriptionSerializer
    permission_classes = [IsSuperAdmin]

    def get_queryset(self):
        # Aggregated view for Super Admin
        return super().get_queryset().select_related('tenant', 'plan')
```

## Security Implementation Notes
1. **JWT Storage**: In this demo, tokens are stored in `localStorage`. For production, use **httpOnly Cookies** to prevent XSS.
2. **Encryption**: Sensitive settings (SMTP passwords, API keys) should be encrypted at rest using `django-cryptography` or similar.
3. **Audit Logs**: Use a middleware or signals to log every `POST/PATCH/DELETE` request made by Super Admins.
