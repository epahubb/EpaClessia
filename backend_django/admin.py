from django.contrib import admin
from .models import Church, User, AuditLog

@admin.register(Church)
class ChurchAdmin(admin.ModelAdmin):
    list_display = ('name', 'subdomain', 'plan', 'status', 'created_at')
    search_fields = ('name', 'subdomain', 'contact_email')
    list_filter = ('plan', 'status')

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('email', 'full_name', 'role', 'church', 'is_active')
    search_fields = ('email', 'full_name')
    list_filter = ('role', 'is_active')

@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('action', 'admin', 'resource', 'created_at')
    list_filter = ('action', 'resource')
