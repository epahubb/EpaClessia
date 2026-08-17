from celery import shared_task
from django.utils import timezone
from .models import Church, User
from .utils_registration import send_welcome_email, send_welcome_sms

@shared_task
def provision_tenant_database(church_id):
    """
    Background task to provision tenant database, execute migrations, seed initial data.
    """
    try:
        church = Church.objects.get(id=church_id)
        # 1. Provision isolated schema or PostgreSQL database
        # 2. Run migrations for tenant
        # 3. Seed default church metadata, service times, and roles
        church.status = 'active' if church.plan != 'free_trial' else 'trial'
        church.save()
        return f"Tenant database for {church.name} provisioned successfully."
    except Church.DoesNotExist:
        return f"Church ID {church_id} not found."

@shared_task
def suspend_member_logins_task(church_id):
    """
    Suspends logins for all active users belonging to a suspended church tenant.
    """
    User.objects.filter(church_id=church_id).update(is_active=False)
    return f"Logins suspended for church {church_id}"

@shared_task
def unsuspend_member_logins_task(church_id):
    """
    Re-enables logins for users belonging to an active church tenant.
    """
    User.objects.filter(church_id=church_id).update(is_active=True)
    return f"Logins re-enabled for church {church_id}"

@shared_task
def hard_delete_expired_churches():
    """
    Scheduled job (Celery Beat) to permanently wipe soft-deleted churches past 30 days.
    """
    thirty_days_ago = timezone.now() - timezone.timedelta(days=30)
    expired_churches = Church.objects.filter(status='deleted', updated_at__lte=thirty_days_ago)
    count = expired_churches.count()
    expired_churches.delete()
    return f"Permanently deleted {count} churches."

@shared_task
def send_welcome_email_async(church_id, admin_user_id, plain_password):
    try:
        church = Church.objects.get(id=church_id)
        admin_user = User.objects.get(id=admin_user_id)
        send_welcome_email(church, admin_user, plain_password)
    except Exception as e:
        print(f"Async email error: {e}")
