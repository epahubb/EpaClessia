# Django Backend Implementation for Church Portals

This document outlines the Django REST Framework implementation for the multi-tenant Church ERP SaaS.

## 1. Core Security & Tenant Isolation

### Permission Classes (`core/permissions.py`)

```python
from rest_framework import permissions

class IsChurchAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and \
               request.user.tenant_roles.filter(tenant=request.tenant, role='CHURCH_ADMIN').exists()

class IsPastor(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and \
               request.user.tenant_roles.filter(tenant=request.tenant, role='PASTOR').exists()

class IsMinistryLeader(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.user.tenant_roles.filter(tenant=request.tenant, role='MINISTRY_LEADER').exists()

class IsMember(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and \
               request.user.tenant_roles.filter(tenant=request.tenant, role='MEMBER').exists()
```

### Base ViewSet for Tenant Isolation (`core/viewsets.py`)

```python
from rest_framework import viewsets

class TenantScopedViewSet(viewsets.ModelViewSet):
    """
    Base ViewSet that automatically filters querysets by the current tenant.
    Assumes `request.tenant` is set by a middleware.
    """
    def get_queryset(self):
        return super().get_queryset().filter(tenant=self.request.tenant)

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)
```

## 2. Church Administrator Portal Endpoints

### Member Management (`api/views/admin.py`)

```python
from core.viewsets import TenantScopedViewSet
from core.permissions import IsChurchAdmin
from ..models import Member
from ..serializers import MemberSerializer

class MemberViewSet(TenantScopedViewSet):
    queryset = Member.objects.all()
    serializer_class = MemberSerializer
    permission_classes = [IsChurchAdmin]
    filterset_fields = ['status', 'ministries', 'family']
    search_fields = ['firstName', 'lastName', 'email']
```

### Finance Management (`api/views/finance.py`)

```python
class TransactionViewSet(TenantScopedViewSet):
    queryset = Transaction.objects.all()
    serializer_class = TransactionSerializer
    permission_classes = [IsChurchAdmin]
    
    def get_queryset(self):
        qs = super().get_queryset()
        fund_id = self.request.query_params.get('fund')
        if fund_id:
            qs = qs.filter(fund_id=fund_id)
        return qs
```

## 3. Pastor/Leadership Portal Endpoints

### Pastoral Notes & Care (`api/views/pastor.py`)

```python
class PastoralNoteViewSet(TenantScopedViewSet):
    queryset = PastoralNote.objects.all()
    serializer_class = PastoralNoteSerializer
    permission_classes = [IsPastor]

    def get_queryset(self):
        # Only pastors can see pastoral notes
        return super().get_queryset()
```

### Prayer Requests

```python
class PrayerRequestViewSet(TenantScopedViewSet):
    queryset = PrayerRequest.objects.all()
    serializer_class = PrayerRequestSerializer
    permission_classes = [IsPastor | IsMember]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == 'MEMBER':
            # Members only see their own or public ones
            return qs.filter(member__user=self.request.user) | qs.filter(isPublic=True)
        return qs
```

## 4. Ministry Leader Portal Endpoints

### Ministry Tasks

```python
class TaskViewSet(TenantScopedViewSet):
    queryset = Task.objects.all()
    serializer_class = TaskSerializer
    permission_classes = [IsMinistryLeader]

    def get_queryset(self):
        # Filter by ministries the user leads
        managed_ministries = self.request.user.tenant_roles.filter(
            tenant=self.request.tenant, 
            role='MINISTRY_LEADER'
        ).values_list('ministry_id', flat=True)
        return super().get_queryset().filter(ministry_id__in=managed_ministries)
```

## 5. Member Portal Endpoints

### Self-Service Profile

```python
class MemberProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = MemberSerializer
    permission_classes = [IsMember]

    def get_object(self):
        return self.request.user.member
```

## 6. Dashboard Aggregations

```python
from django.db.models import Sum, Count
from rest_framework.decorators import api_view
from rest_framework.response import Response

@api_view(['GET'])
def admin_dashboard_stats(request):
    tenant = request.tenant
    stats = {
        'totalMembers': Member.objects.filter(tenant=tenant, status='active').count(),
        'attendanceToday': AttendanceRecord.objects.filter(tenant=tenant, date=today).count(),
        'recentGiving': Transaction.objects.filter(
            tenant=tenant, 
            type='income', 
            date__gte=seven_days_ago
        ).aggregate(Sum('amount'))['amount__sum'] or 0,
        # ... other stats
    }
    return Response(stats)
```

## 7. Explanation of Security & Isolation

1.  **Tenant Isolation**: Every model has a `ForeignKey` to `Tenant`. The `TenantScopedViewSet` ensures that no user can ever access data belonging to another church by overriding `get_queryset`.
2.  **Role-Based Access Control (RBAC)**: Custom permission classes (`IsChurchAdmin`, `IsPastor`, etc.) verify the user's role specifically for the *current* tenant. This prevents a "Church Admin" of Church A from acting as an admin for Church B.
3.  **Data Privacy**: Sensitive pastoral notes are restricted to the `IsPastor` permission class. Member contact info in the directory is filtered via serializers to only show "public" fields.
4.  **Audit Logging**: Django signals or middleware are used to log every `post_save` and `post_delete` action, capturing the `user_id`, `action`, `timestamp`, and `tenant_id`.
5.  **Secure Storage**: File uploads are stored on the **Local Server** (or a mounted volume). Access is controlled via the application layer, ensuring that private files (like pastoral records) aren't publicly accessible.
