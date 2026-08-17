from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ChurchViewSet

router = DefaultRouter()
router.register(r'churches', ChurchViewSet, basename='church')

urlpatterns = [
    path('v1/', include(router.urls)),
]
