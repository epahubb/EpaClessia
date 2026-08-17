import string, random
from django.utils.text import slugify
from django.core.mail import send_mail
from django.conf import settings
import requests

def generate_subdomain_from_name(name):
    return slugify(name)

def generate_random_password(length=12):
    characters = string.ascii_letters + string.digits + string.punctuation
    return ''.join(random.choice(characters) for i in range(length))

def send_welcome_email(church, admin_user, plain_password):
    subject = f'Welcome to Ecclesia - {church.name}'
    message = f"""
    Hello {admin_user.full_name},
    
    Your church management account for {church.name} has been created.
    
    Log in at: https://{church.subdomain}.ecclesiagh.com
    Email: {admin_user.email}
    Password: {plain_password}
    
    Please change your password after logging in.
    """
    try:
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [admin_user.email],
            fail_silently=False,
        )
        return True
    except Exception as e:
        print(f"Email error: {e}")
        return False

def send_welcome_sms(church, admin_user, plain_password):
    if not admin_user.phone:
        return False
        
    api_key = getattr(settings, 'MNOTIFY_API_KEY', None)
    sender_id = getattr(settings, 'MNOTIFY_SENDER_ID', 'Ecclesia')
    
    if not api_key:
        return False

    url = f"https://api.mnotify.com/syapi/bulk_sms?key={api_key}"
    message = f"Welcome to Ecclesia! Your account for {church.name} is ready. Login at {church.subdomain}.ecclesiagh.com. Pwd: {plain_password}"
    
    payload = {
        'recipient': [admin_user.phone],
        'sender': sender_id,
        'message': message,
        'is_schedule': False
    }
    
    try:
        response = requests.post(url, json=payload)
        return response.status_code == 200
    except Exception:
        return False
