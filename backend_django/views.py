import csv
from io import StringIO
from rest_framework import viewsets, views, status, permissions, filters
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db import transaction
from django.db.models import Count, Q, Value, DecimalField
from django.contrib.auth.hashers import make_password
from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend

from .models import Church, User, AuditLog
from .serializers import (
    ChurchSerializer, 
    ChurchRegistrationSerializer, 
    BulkChurchActionSerializer
)
from .permissions import IsSuperAdmin
from .filters import ChurchFilter
from .utils_registration import generate_random_password, send_welcome_email, send_welcome_sms
from .tasks import (
    provision_tenant_database, 
    suspend_member_logins_task, 
    unsuspend_member_logins_task, 
    send_welcome_email_async
)

class ChurchViewSet(viewsets.ModelViewSet):
    """
    Superadmin ViewSet for managing church tenants in Ecclesia.
    Includes filtering, sorting, pagination, soft-delete, bulk operations, and CSV export.
    """
    permission_classes = [permissions.IsAuthenticated, IsSuperAdmin]
    serializer_class = ChurchSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = ChurchFilter
    ordering_fields = ['name', 'subdomain', 'plan', 'status', 'created_at', 'trial_end_date']
    ordering = ['-created_at']

    def get_queryset(self):
        # Annotate member_count and active_user_count
        return Church.objects.exclude(status='deleted').annotate(
            member_count=Count('users', filter=Q(users__role='member')),
            active_user_count=Count('users', filter=Q(users__is_active=True))
        )

    def create(self, request, *args, **kwargs):
        serializer = ChurchRegistrationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data

        try:
            with transaction.atomic():
                if data['auto_generate_password'] or not data.get('admin_password'):
                    plain_password = generate_random_password()
                else:
                    plain_password = data['admin_password']

                church = Church.objects.create(
                    name=data['name'],
                    subdomain=data['subdomain'],
                    contact_email=data['contact_email'],
                    phone=data.get('phone'),
                    address_line1=data.get('address_line1'),
                    city=data.get('city'),
                    state=data.get('state'),
                    postal_code=data.get('postal_code'),
                    country=data['country'],
                    timezone=data['timezone'],
                    plan=data['plan'],
                    status='trial' if data['plan'] == 'free_trial' else 'active',
                    trial_end_date=data.get('trial_end_date'),
                    feature_flags=data.get('feature_flags', {})
                )

                admin_user = User.objects.create(
                    email=data['admin_email'],
                    full_name=data['admin_name'],
                    phone=data.get('admin_phone'),
                    role='church_admin',
                    church=church,
                    password=make_password(plain_password)
                )

                AuditLog.objects.create(
                    admin=request.user,
                    action='create_church',
                    resource='Church',
                    resource_id=str(church.id),
                    details={"church_name": church.name, "subdomain": church.subdomain},
                    ip_address=self.get_client_ip(request)
                )

                # Queue async task for tenant provisioning
                provision_tenant_database.delay(str(church.id))

                # Notifications
                if data['send_welcome_email']:
                    send_welcome_email_async.delay(str(church.id), str(admin_user.id), plain_password)

                if church.feature_flags.get('sms') and admin_user.phone:
                    send_welcome_sms(church, admin_user, plain_password)

                return Response({
                    "id": str(church.id),
                    "subdomain": church.subdomain,
                    "message": "Church tenant creation initiated."
                }, status=status.HTTP_202_ACCEPTED)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        old_status = instance.status
        response = super().partial_update(request, *args, **kwargs)
        
        new_status = request.data.get('status')
        if new_status and new_status != old_status:
            if new_status == 'suspended':
                suspend_member_logins_task.delay(str(instance.id))
            elif new_status == 'active':
                unsuspend_member_logins_task.delay(str(instance.id))

            AuditLog.objects.create(
                admin=request.user,
                action='update_church_status',
                resource='Church',
                resource_id=str(instance.id),
                details={"old_status": old_status, "new_status": new_status},
                ip_address=self.get_client_ip(request)
            )

        return response

    def destroy(self, request, *args, **kwargs):
        """Soft delete the church tenant."""
        instance = self.get_object()
        instance.status = 'deleted'
        instance.save()
        
        suspend_member_logins_task.delay(str(instance.id))

        AuditLog.objects.create(
            admin=request.user,
            action='soft_delete_church',
            resource='Church',
            resource_id=str(instance.id),
            details={"name": instance.name},
            ip_address=self.get_client_ip(request)
        )

        return Response({"message": "Church soft-deleted successfully."}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='bulk')
    def bulk_action(self, request):
        serializer = BulkChurchActionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        action_type = serializer.validated_data['action']
        churches = Church.objects.filter(id__in=serializer.validated_data['ids'])

        updated_count = 0
        with transaction.atomic():
            for church in churches:
                if action_type == 'suspend':
                    church.status = 'suspended'
                    suspend_member_logins_task.delay(str(church.id))
                elif action_type == 'unsuspend':
                    church.status = 'active'
                    unsuspend_member_logins_task.delay(str(church.id))
                elif action_type == 'delete':
                    church.status = 'deleted'
                    suspend_member_logins_task.delay(str(church.id))
                
                church.save()
                updated_count += 1

                AuditLog.objects.create(
                    admin=request.user,
                    action=f'bulk_{action_type}_church',
                    resource='Church',
                    resource_id=str(church.id),
                    details={"reason": serializer.validated_data.get('reason', '')},
                    ip_address=self.get_client_ip(request)
                )

        return Response({"message": f"Successfully executed {action_type} on {updated_count} churches."})

    @action(detail=False, methods=['get'], url_path='export')
    def export_churches(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        
        buffer = StringIO()
        writer = csv.writer(buffer)
        writer.writerow([
            'ID', 'Name', 'Subdomain', 'Plan', 'Status', 
            'Contact Email', 'Phone', 'Created At', 'Trial End Date'
        ])

        for c in queryset:
            writer.writerow([
                str(c.id), c.name, c.subdomain, c.plan, c.status,
                c.contact_email, c.phone or '', c.created_at.strftime('%Y-%m-%d %H:%M'),
                c.trial_end_date.strftime('%Y-%m-%d') if c.trial_end_date else 'N/A'
            ])

        response = HttpResponse(buffer.getvalue(), content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="churches_export.csv"'
        return response

    def get_client_ip(self, request):
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        return x_forwarded_for.split(',')[0] if x_forwarded_for else request.META.get('REMOTE_ADDR')
