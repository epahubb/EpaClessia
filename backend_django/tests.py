import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from .models import Church, User

@pytest.mark.django_db
class TestChurchRegistrationAPI:
    def setup_method(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_superuser(
            email="super@ecclesia.com",
            password="Password123!",
            full_name="Super Admin"
        )
        self.client.force_authenticate(user=self.superadmin)
        self.url = reverse('church-list')

    def test_create_church_success(self):
        payload = {
            "name": "Grace Tabernacle",
            "subdomain": "gracetab",
            "contact_email": "info@gracetab.org",
            "country": "GH",
            "timezone": "Africa/Accra",
            "admin_name": "Pastor John",
            "admin_email": "john@gracetab.org",
            "plan": "pro",
            "auto_generate_password": True,
            "send_welcome_email": True,
            "feature_flags": {"sms": True, "giving": True}
        }
        response = self.client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_202_ACCEPTED
        assert Church.objects.filter(subdomain="gracetab").exists()

    def test_duplicate_subdomain_rejected(self):
        Church.objects.create(name="Existing", subdomain="existing", contact_email="a@a.com", country="GH", timezone="UTC")
        payload = {
            "name": "Another Church",
            "subdomain": "existing",
            "contact_email": "b@b.com",
            "country": "GH",
            "timezone": "UTC",
            "admin_name": "Admin B",
            "admin_email": "b@b.com",
            "plan": "basic"
        }
        response = self.client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_bulk_suspend_churches(self):
        c1 = Church.objects.create(name="Church 1", subdomain="c1", contact_email="c1@a.com", country="GH", timezone="UTC", status="active")
        c2 = Church.objects.create(name="Church 2", subdomain="c2", contact_email="c2@a.com", country="GH", timezone="UTC", status="active")
        
        bulk_url = reverse('church-bulk-action')
        response = self.client.post(bulk_url, {
            "action": "suspend",
            "ids": [str(c1.id), str(c2.id)],
            "reason": "Non-payment"
        }, format='json')

        assert response.status_code == status.HTTP_200_OK
        c1.refresh_from_db()
        c2.refresh_from_db()
        assert c1.status == "suspended"
        assert c2.status == "suspended"
