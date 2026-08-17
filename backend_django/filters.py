import django_filters
from django.db.models import Q
from .models import Church

class ChurchFilter(django_filters.FilterSet):
    search = django_filters.CharFilter(method='filter_search')
    plan = django_filters.ChoiceFilter(choices=Church.PLAN_CHOICES)
    status = django_filters.ChoiceFilter(choices=Church.STATUS_CHOICES)
    
    created_after = django_filters.IsoDateTimeFilter(field_name='created_at', lookup_expr='gte')
    created_before = django_filters.IsoDateTimeFilter(field_name='created_at', lookup_expr='lte')
    
    trial_expires_after = django_filters.IsoDateTimeFilter(field_name='trial_end_date', lookup_expr='gte')
    trial_expires_before = django_filters.IsoDateTimeFilter(field_name='trial_end_date', lookup_expr='lte')
    
    members_min = django_filters.NumberFilter(field_name='member_count', lookup_expr='gte')
    members_max = django_filters.NumberFilter(field_name='member_count', lookup_expr='lte')

    class Meta:
        model = Church
        fields = [
            'plan', 'status', 'search',
            'created_after', 'created_before',
            'trial_expires_after', 'trial_expires_before',
            'members_min', 'members_max'
        ]

    def filter_search(self, queryset, name, value):
        if not value:
            return queryset
        return queryset.filter(
            Q(name__icontains=value) |
            Q(subdomain__icontains=value) |
            Q(contact_email__icontains=value) |
            Q(users__email__icontains=value)
        ).distinct()
