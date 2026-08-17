from rest_framework import serializers
from .models import Church, User, AuditLog

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'full_name', 'phone', 'role', 'church', 'is_active', 'date_joined']

class ChurchSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(read_only=True, default=0)
    active_user_count = serializers.IntegerField(read_only=True, default=0)
    total_giving_ytd = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True, default=0.0)
    admin_email = serializers.SerializerMethodGetter()

    class Meta:
        model = Church
        fields = [
            'id', 'name', 'subdomain', 'contact_email', 'phone',
            'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'country', 'timezone',
            'plan', 'status', 'trial_end_date', 'feature_flags', 'created_at', 'updated_at',
            'member_count', 'active_user_count', 'total_giving_ytd', 'admin_email'
        ]

    def get_admin_email(self, obj):
        admin = obj.users.filter(role='church_admin').first()
        return admin.email if admin else obj.contact_email

class ChurchRegistrationSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    subdomain = serializers.SlugField()
    contact_email = serializers.EmailField()
    phone = serializers.CharField(required=False, allow_blank=True)
    country = serializers.CharField()
    timezone = serializers.CharField()
    
    address_line1 = serializers.CharField(required=False, allow_blank=True)
    city = serializers.CharField(required=False, allow_blank=True)
    state = serializers.CharField(required=False, allow_blank=True)
    postal_code = serializers.CharField(required=False, allow_blank=True)

    admin_name = serializers.CharField(max_length=255)
    admin_email = serializers.EmailField()
    admin_phone = serializers.CharField(required=False, allow_blank=True)
    admin_password = serializers.CharField(required=False, allow_blank=True)
    auto_generate_password = serializers.BooleanField(default=True)
    send_welcome_email = serializers.BooleanField(default=True)

    plan = serializers.ChoiceField(choices=Church.PLAN_CHOICES)
    trial_end_date = serializers.DateTimeField(required=False, allow_null=True)
    feature_flags = serializers.JSONField(default=dict)

    def validate_subdomain(self, value):
        if Church.objects.filter(subdomain=value).exists():
            raise serializers.ValidationError("Subdomain already taken.")
        return value

    def validate_admin_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

class BulkChurchActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=['suspend', 'unsuspend', 'delete'])
    ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=False
    )
    reason = serializers.CharField(required=False, allow_blank=True)
