from django.db import models
from django.contrib.auth.models import AbstractUser
from django.conf import settings

class Tenant(models.Model):
    name = models.CharField(max_length=255)
    subdomain = models.CharField(max_length=100, unique=True)
    logo = models.ImageField(upload_to='church_logos/', null=True, blank=True)
    address = models.TextField()
    phone = models.CharField(max_length=20)
    email = models.EmailField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

class User(AbstractUser):
    # Custom user model if needed
    pass

class UserTenantRole(models.Model):
    CHURCH_ADMIN = 'CHURCH_ADMIN'
    PASTOR = 'PASTOR'
    MINISTRY_LEADER = 'MINISTRY_LEADER'
    MEMBER = 'MEMBER'
    
    ROLE_CHOICES = [
        (CHURCH_ADMIN, 'Church Administrator'),
        (PASTOR, 'Pastor'),
        (MINISTRY_LEADER, 'Ministry Leader'),
        (MEMBER, 'Member'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_shared_app_url=models.CASCADE)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    role = models.CharField(max_length=50, choices=ROLE_CHOICES)

    class Meta:
        unique_together = ('user', 'tenant', 'role')

class Family(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    address = models.TextField()
    head = models.ForeignKey('Member', on_delete=models.SET_NULL, null=True, related_name='headed_family')

class Member(models.Model):
    STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('VISITOR', 'Visitor'),
        ('INACTIVE', 'Inactive'),
    ]
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField()
    phone = models.CharField(max_length=20)
    address = models.TextField()
    birth_date = models.DateField()
    membership_date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIVE')
    photo = models.ImageField(upload_to='member_photos/', null=True, blank=True)
    family = models.ForeignKey(Family, on_delete=models.SET_NULL, null=True, blank=True, related_name='members')
    emergency_contact_name = models.CharField(max_length=255)
    emergency_contact_phone = models.CharField(max_length=20)
    spiritual_gifts = models.JSONField(default=list)
    skills = models.JSONField(default=list)
    occupation = models.CharField(max_length=255)

class Fund(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    description = models.TextField()
    is_active = models.BooleanField(default=True)

class Transaction(models.Model):
    TYPE_CHOICES = [('INCOME', 'Income'), ('EXPENSE', 'Expense')]
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    fund = models.ForeignKey(Fund, on_delete=models.CASCADE)
    member = models.ForeignKey(Member, on_delete=models.SET_NULL, null=True, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    description = models.TextField()
    date = models.DateTimeField(auto_now_add=True)

class Event(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    description = models.TextField()
    start_date = models.DateTimeField()
    end_date = models.DateTimeField()
    location = models.CharField(max_length=255)
    max_attendees = models.PositiveIntegerField(null=True, blank=True)
    registration_deadline = models.DateTimeField(null=True, blank=True)
    ticket_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    ministry = models.ForeignKey('Ministry', on_delete=models.SET_NULL, null=True, blank=True)

class Ministry(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    description = models.TextField()
    leader = models.ForeignKey(Member, on_delete=models.SET_NULL, null=True, related_name='led_ministries')

class AttendanceRecord(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    member = models.ForeignKey(Member, on_delete=models.CASCADE)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, null=True, blank=True)
    service_type = models.CharField(max_length=100)
    timestamp = models.DateTimeField(auto_now_add=True)

class AuditLog(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=255)
    details = models.JSONField()
    timestamp = models.DateTimeField(auto_now_add=True)
