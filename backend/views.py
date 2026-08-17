from rest_framework import serializers, viewsets
from .models import Member, Tenant, Fund, Transaction, Event, Ministry, AttendanceRecord
from .permissions import IsChurchAdmin

class MemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = Member
        fields = '__all__'

class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = '__all__'

class FundSerializer(serializers.ModelSerializer):
    class Meta:
        model = Fund
        fields = '__all__'

class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = '__all__'

class EventSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        fields = '__all__'

# Viewsets with Tenant Filtering
class TenantScopedViewSet(viewsets.ModelViewSet):
    permission_classes = [IsChurchAdmin]

    def get_queryset(self):
        return self.queryset.filter(tenant=self.request.tenant)

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)

class MemberViewSet(TenantScopedViewSet):
    queryset = Member.objects.all()
    serializer_class = MemberSerializer
    search_fields = ['first_name', 'last_name', 'email', 'phone']
    filterset_fields = ['status', 'family']

class FundViewSet(TenantScopedViewSet):
    queryset = Fund.objects.all()
    serializer_class = FundSerializer

class TransactionViewSet(TenantScopedViewSet):
    queryset = Transaction.objects.all()
    serializer_class = TransactionSerializer
    filterset_fields = ['fund', 'type', 'date']

class EventViewSet(TenantScopedViewSet):
    queryset = Event.objects.all()
    serializer_class = EventSerializer

class DashboardStatsView(viewsets.ViewSet):
    permission_classes = [IsChurchAdmin]

    def list(self, request):
        tenant = request.tenant
        return Response({
            "total_members": Member.objects.filter(tenant=tenant, status='ACTIVE').count(),
            "attendance_today": AttendanceRecord.objects.filter(tenant=tenant, timestamp__date=date.today()).count(),
            "recent_giving": Transaction.objects.filter(tenant=tenant, type='INCOME', date__gte=now()-timedelta(days=7)).aggregate(Sum('amount'))['amount__sum'] or 0,
            "upcoming_events": Event.objects.filter(tenant=tenant, start_date__gte=now(), start_date__lte=now()+timedelta(days=7)).count(),
            "pending_prayer_requests": 5, # Mocked
        })
