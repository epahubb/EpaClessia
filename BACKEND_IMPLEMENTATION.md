# Ecclesia SaaS: Backend Implementation Guide

This document contains the Django backend implementation for the multi-tenant Church Management ERP.

## 1. Django Models

### Core & Multi-Tenancy
```python
# core/models.py
from django.db import models

class Tenant(models.Model):
    name = models.CharField(max_length=255)
    subdomain = models.CharField(max_length=100, unique=True)
    logo = models.ImageField(upload_to='tenants/logos/', null=True, blank=True)
    address = models.TextField()
    phone = models.CharField(max_length=20)
    email = models.EmailField()
    is_active = models.BooleanField(default=True)
    plan = models.CharField(max_length=50, choices=[('BASIC', 'Basic'), ('PRO', 'Pro'), ('ENTERPRISE', 'Enterprise')])
    created_at = models.DateTimeField(auto_now_add=True)

class TenantAwareModel(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    
    class Meta:
        abstract = True
```

### Members & Families
```python
# members/models.py
class Member(TenantAwareModel):
    STATUS_CHOICES = [('ACTIVE', 'Active'), ('INACTIVE', 'Inactive'), ('VISITOR', 'Visitor')]
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField()
    phone = models.CharField(max_length=20)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='ACTIVE')
    membership_date = models.DateField(auto_now_add=True)
    qr_code = models.CharField(max_length=255, unique=True) # Generated on save

class Family(TenantAwareModel):
    name = models.CharField(max_length=100)

class FamilyMember(models.Model):
    family = models.ForeignKey(Family, on_delete=models.CASCADE)
    member = models.ForeignKey(Member, on_delete=models.CASCADE)
    relationship = models.CharField(max_length=50) # e.g., Father, Mother, Child
```

### Finance & Accounting
```python
# finance/models.py
class Fund(TenantAwareModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20)
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)

class Transaction(TenantAwareModel):
    TYPES = [('INCOME', 'Income'), ('EXPENSE', 'Expense')]
    date = models.DateField()
    type = models.CharField(max_length=10, choices=TYPES)
    fund = models.ForeignKey(Fund, on_delete=models.CASCADE)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    member = models.ForeignKey('members.Member', on_delete=models.SET_NULL, null=True)
    payment_method = models.CharField(max_length=20, choices=[('CASH', 'Cash'), ('BANK', 'Bank'), ('ONLINE', 'Online')])
    receipt_number = models.CharField(max_length=50, unique=True)
```

## 2. DRF Permission Class
```python
# core/permissions.py
from rest_framework import permissions

class TenantRolePermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
            
        # Check role in current tenant
        role_obj = request.user.tenant_roles.filter(tenant=request.tenant).first()
        if not role_obj:
            return False
            
        # Define role-based access logic
        if role_obj.role in ['SUPER_ADMIN', 'CHURCH_ADMIN']:
            return True
            
        if view.action in ['list', 'retrieve'] and role_obj.role == 'MEMBER':
            return True
            
        return False
```

## 3. Paystack Integration
```python
# finance/views.py
import requests
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response

PAYSTACK_SECRET_KEY = settings.PAYSTACK_SECRET_KEY

class InitializePaymentView(APIView):
    def post(self, request):
        amount = request.data.get('amount')
        email = request.user.email
        
        url = "https://api.paystack.co/transaction/initialize"
        headers = {
            "Authorization": f"Bearer {PAYSTACK_SECRET_KEY}",
            "Content-Type": "application/json"
        }
        data = {
            "email": email,
            "amount": int(amount * 100), # Paystack expects amount in kobo/pesewas
            "metadata": {"tenant_id": request.tenant.id}
        }
        
        response = requests.post(url, headers=headers, json=data)
        return Response(response.json())

@csrf_exempt
def paystack_webhook(request):
    # Verify Paystack signature and process event
    # Update Donation record on success
    return HttpResponse(status=200)
```

## 4. Docker Configuration

### Dockerfile (Django)
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["gunicorn", "ecclesia.wsgi:application", "--bind", "0.0.0.0:8000"]
```

### docker-compose.yml
```yaml
version: '3.8'
services:
  db:
    image: mysql:8.0
    volumes:
      - mysql_data:/var/lib/mysql
    environment:
      MYSQL_DATABASE: ecclesia
      MYSQL_ROOT_PASSWORD: password
  
  redis:
    image: redis:7-alpine

  backend:
    build: ./backend
    command: python manage.py runserver 0.0.0.0:8000
    volumes:
      - ./backend:/app
    environment:
      - DATABASE_URL=mysql://root:password@db:3306/ecclesia
    depends_on:
      - db

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  mysql_data:
```

## 5. MySQL Settings
```python
# settings.py
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': 'ecclesia',
        'USER': 'root',
        'PASSWORD': 'password',
        'HOST': 'db',
        'PORT': '3306',
    }
}
```
