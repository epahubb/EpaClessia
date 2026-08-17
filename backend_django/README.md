# Django Backend Implementation: Church Registration

This directory contains a reference implementation for the Church Registration (Tenant Creation) feature using Python, Django, and Django REST Framework.

## Implementation Details

### 1. Database Transactions
We use `with transaction.atomic():` in `views.py` to ensure that both the `Church` and its primary `User` (Admin) are created successfully, or neither is. This prevents "orphan" churches or admins.

### 2. Password Hashing
We use `django.contrib.auth.hashers.make_password` for secure credential storage.

### 3. Rate Limiting
A custom throttle `ChurchRegistrationThrottle` is applied to the registration endpoint to prevent brute-force attacks or automated abuse (limit: 10/hour).

### 4. Integration with mNotify
The `utils_registration.py` file contains a logic to send welcome SMS via the mNotify API.

## Setup Instructions

1.  Add `MNOTIFY_API_KEY` and `MNOTIFY_SENDER_ID` to your `settings.py`.
2.  Install requirements: `pip install requests djangorestframework django-cors-headers`.
3.  Add the models to your `models.py` and run `python manage.py makemigrations` and `python manage.py migrate`.
4.  Include the URLs in your main `urls.py`.

## Next.js Integration
If using Next.js 14+ (App Router), you can either:
- Call these Django endpoints directly from the client (configured with CORS).
- Use a Server Action or Route Handler to proxy requests to the Django backend.
